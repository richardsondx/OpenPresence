import { randomUUID } from "node:crypto";
import { readNativeXCredentials, readRecentXMentions, readRecentXPosts, readXAudienceSnapshot, readXPublicationMetrics, readXPostsByIds, searchRecentXPosts, type XRecentPost } from "./x";
import { detectDuplicatePublicOutcomes } from "./public-action-safety";
import { applyOperation, intervalForPresence, markNativeConnectionNeedsAttention, recordNativeMirrors, recordNativeMirrorDeletion, recordNativeObservation, recordPublicFooting, recordResourceUsageEvent, recordRuntimeEvent, recordPublicRequestsFromMirrors, recordWatchSignals, recordPublicationMetricSnapshots } from "./runtime";
import { normalizeHandle } from "./x";
import { languagesMatch } from "./language-policy";
import type { EntityRef, MirrorObject, OpenPresenceState, Presence, PresenceQuietHours } from "./types";
import { hydrateThreadContext } from "./thread-context";
import { xCreditsExhausted } from "./x-credits";

export const intervalFor = intervalForPresence;

const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
};

const quietHoursEnd = (quietHours: PresenceQuietHours, from: Date) => {
  const start = timeToMinutes(quietHours.start);
  const end = timeToMinutes(quietHours.end);
  if (start === undefined || end === undefined || start === end) return undefined;
  const current = minuteOfDay(from);
  const crossesMidnight = start > end;
  const endDate = new Date(from);
  if (crossesMidnight && current >= start) endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(Math.floor(end / 60), end % 60, 0, 0);
  return endDate;
};

const isQuiet = (quietHours: PresenceQuietHours | undefined, date: Date) => {
  if (!quietHours?.enabled) return false;
  const start = timeToMinutes(quietHours.start);
  const end = timeToMinutes(quietHours.end);
  if (start === undefined || end === undefined || start === end) return false;
  const current = minuteOfDay(date);
  return start < end ? current >= start && current < end : current >= start || current < end;
};

function xPostMirrorObject(post: XRecentPost, presenceId: string, connectionId: string, observedAt = new Date().toISOString()): MirrorObject {
  return {
    id: `hydrated:${connectionId}:${post.id}`,
    bridgeId: `native:${connectionId}`,
    presenceId,
    channelId: "x",
    externalRef: { type: "x.post", id: post.id },
    parentExternalRef: post.parentId ? { type: "x.post", id: post.parentId } : undefined,
    conversationExternalRef: post.conversationId,
    referencedExternalRefs: post.referencedPosts?.map((reference) => ({ type: "x.post", id: reference.id })),
    objectType: "post",
    language: post.language,
    author: { externalRef: post.authorId ? { type: "x.user", id: post.authorId } : undefined, displayName: post.authorName ?? (post.authorUsername ? `@${post.authorUsername}` : "X user"), handle: post.authorUsername, avatarUrl: post.authorAvatarUrl },
    content: { text: post.text },
    occurredAt: post.createdAt,
    observedAt,
    visibility: "public",
    shareability: "presence-only",
    environment: "live",
    source: "native",
    trust: "untrusted_world_content",
  };
}

/**
 * Hydrate only missing X ancestry/references. This is a connector adapter for
 * the provider-neutral traversal in thread-context.ts; fetched posts are
 * returned to the caller as ordinary Mirror evidence.
 */
export async function hydrateNativeXThreadContext(
  source: OpenPresenceState,
  presenceId: string,
  observedObject: MirrorObject,
  options?: {
    originKind?: import("./types").ResourceUsageEvent["originKind"];
    attentionSource?: import("./types").ResourceUsageEvent["attentionSource"];
    invocationId?: string;
    runId?: string;
    attentionEpisodeId?: string;
  },
): Promise<OpenPresenceState> {
  if (!observedObject.parentExternalRef && !observedObject.referencedExternalRefs?.length) return source;
  const connection = source.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x");
  const credentials = connection ? readNativeXCredentials(connection.id) : undefined;
  if (!connection || !credentials) return source;
  const presence = source.presences.find((item) => item.id === presenceId) ?? source.presence;
  const mirror = source.mirrorObjects.filter((item) => item.presenceId === presenceId && item.channelId === "x" && (item.environment === "live" || item.environment === undefined) && Boolean(presence && languagesMatch(presence.language, item.language ?? item.content?.language)));
  const fetchedPosts = new Map<string, XRecentPost>();
  let next = source;
  const hydrated = await hydrateThreadContext({
    mirror,
    observedObject,
    maxDepth: 8,
    maxObjects: 8,
    includeReferences: true,
    fetchObjects: async (refs: EntityRef[]) => {
      const targetRefs = refs.filter((ref) => ref.type === "x.post");
      if (!targetRefs.length) return [];
    next = recordResourceUsageEvent(next, {
        presenceId,
        invocationId: options?.invocationId ?? `hydrate:${randomUUID()}`,
        runId: options?.runId,
        originKind: options?.originKind ?? "inbound_social",
        attentionSource: options?.attentionSource ?? "inbound_social",
        category: "hydration",
        provider: "x",
        usage: { requests: 1 },
        attentionEpisodeId: options?.attentionEpisodeId,
      });
      const posts = await readXPostsByIds(credentials, targetRefs.map((ref) => ref.id));
      for (const post of posts) fetchedPosts.set(post.id, post);
      return posts.map((post) => xPostMirrorObject(post, presenceId, connection.id));
    },
  });
  next = recordNativeMirrors(next, hydrated.objects.flatMap((object) => {
    const sourcePost = fetchedPosts.get(object.externalRef.id);
    return sourcePost ? [{ connectionId: connection.id, presenceId, post: sourcePost }] : [];
  }), { attentionEpisodeId: options?.attentionEpisodeId, attentionRunId: options?.runId, attentionInvocationId: options?.invocationId });
  return next;
}

export const nextObservationAt = (presence: Presence | undefined, from = Date.now(), zeroDeltaStreak = 0) => {
  const base = new Date(from);
  const baseInterval = intervalFor(presence);
  // Repeated empty reads are evidence that the channel is quiet, not a reason
  // to keep paying the full observation cost. Cap the multiplier so a later
  // explicit wake or inbound signal can still make the Presence responsive.
  const multiplier = 2 ** Math.min(3, Math.max(0, Math.floor(zeroDeltaStreak)));
  const candidate = new Date(from + Math.min(baseInterval * multiplier, 2 * 60 * 60_000));
  if (isQuiet(presence?.quietHours, base)) {
    const end = presence?.quietHours ? quietHoursEnd(presence.quietHours, base) : undefined;
    if (end) return end.toISOString();
  }
  if (isQuiet(presence?.quietHours, candidate)) {
    const end = presence?.quietHours ? quietHoursEnd(presence.quietHours, candidate) : undefined;
    if (end) return end.toISOString();
  }
  return candidate.toISOString();
};

function watchHandleForX(watch: OpenPresenceState["watches"][number]) {
  const direct = watch.target?.handle?.replace(/^@/, "").trim();
  if (direct) return direct.toLowerCase();
  if (watch.kind !== "creator") return undefined;
  const raw = watch.query.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, "").replace(/^@/, "").replace(/\/$/, "").trim();
  return /^[A-Za-z0-9_]{2,30}$/.test(raw) ? raw.toLowerCase() : undefined;
}

function sharedWatchQueries(watches: OpenPresenceState["watches"]) {
  const handles = [...new Set(watches.map(watchHandleForX).filter((handle): handle is string => Boolean(handle)))];
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const handle of handles) {
    const candidate = [...batch, handle];
    if (batch.length && `(from:${candidate.join(" OR from:")})`.length > 420) {
      batches.push(batch);
      batch = [handle];
    } else {
      batch = candidate;
    }
  }
  if (batch.length) batches.push(batch);
  return batches.map((handlesInBatch) => `(${handlesInBatch.map((handle) => `from:${handle}`).join(" OR ")}) -is:retweet`);
}

export async function reconcileNativeX(source: OpenPresenceState, presenceId: string, options?: { runId?: string; invocationId?: string; attentionEpisodeId?: string; inboundOnly?: boolean }): Promise<OpenPresenceState> {
  const previousObservation = source.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x")?.observation;
  let next = recordNativeObservation(source, presenceId, {
    ...(previousObservation ?? {}),
    status: "syncing",
    error: undefined,
  });

  const connection = next.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x");
  const credentials = connection ? readNativeXCredentials(connection.id) : undefined;
  const targetPresence = next.presences.find((item) => item.id === presenceId) ?? next.presence;
  const configuredHandle = targetPresence?.handle ? normalizeHandle(targetPresence.handle) : undefined;
  const connectedHandle = connection?.account?.username ? normalizeHandle(connection.account.username) : undefined;
  if (connection && credentials && configuredHandle && connectedHandle !== configuredHandle) {
    const message = connectedHandle
      ? `ACCOUNT_MISMATCH: X authenticated @${connectedHandle}, but this Presence expects @${configuredHandle}. Native observation and actions are paused until the correct credentials are connected.`
      : `ACCOUNT_UNVERIFIED: X did not expose the authenticated account for this connection. Native observation and actions are paused until @${configuredHandle} is verified.`;
    next = markNativeConnectionNeedsAttention(next, presenceId, message);
    next = recordNativeObservation(next, presenceId, { status: "error", error: message, nextObservationAt: new Date(Date.now() + 60_000).toISOString() });
    return recordRuntimeEvent(next, presenceId, "X identity mismatch", message, "warning");
  }
  const accountId = connection?.account?.id;
  if (!connection || !credentials || !accountId) {
    const message = "The native X connection could not provide a readable account context.";
    next = recordNativeObservation(next, presenceId, { status: "error", error: message, nextObservationAt: new Date(Date.now() + 60_000).toISOString() });
    return recordRuntimeEvent(next, presenceId, "X observation failed", message, "warning");
  }

  try {
    const knownOwnMirrorPostIds = next.mirrorObjects
      .filter((item) => item.presenceId === presenceId && item.channelId === "x" && item.environment !== "sandbox" && item.externalRef.type === "x.post" && item.actorPresenceId === presenceId && !item.archived)
      .slice(0, 100)
      .map((item) => item.externalRef.id);
    const previousOwnPostIds = new Set([
      ...(targetPresence?.context.publicFooting?.recentPostIds ?? []),
      ...knownOwnMirrorPostIds,
    ]);
    const [postsResult, mentionsResult] = await Promise.allSettled([
      options?.inboundOnly ? Promise.resolve([] as XRecentPost[]) : readRecentXPosts(credentials, accountId),
      readRecentXMentions(credentials, accountId, connectedHandle ?? configuredHandle, options?.inboundOnly ? 25 : 100),
    ]);
    next = recordResourceUsageEvent(next, { presenceId, invocationId: options?.invocationId ?? `x-reconcile:${randomUUID()}`, runId: options?.runId, originKind: "inbound_social", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: options?.inboundOnly ? 1 : 2 }, attentionEpisodeId: options?.attentionEpisodeId });
    if (postsResult.status === "rejected") throw postsResult.reason;

    const posts = postsResult.value;
    const mentions = mentionsResult.status === "fulfilled" ? mentionsResult.value : [];
    const activeWatches = options?.inboundOnly ? [] : next.watches.filter((watch) => watch.presenceId === presenceId && (watch.state ?? "active") === "active" && watch.observation.status === "watching" && watch.channel === "x");
    const watchPosts: XRecentPost[] = [];
    for (const query of sharedWatchQueries(activeWatches)) {
      try {
        next = recordResourceUsageEvent(next, { presenceId, invocationId: options?.invocationId ?? `watchlist:${randomUUID()}`, runId: options?.runId, originKind: "watchlist", originId: activeWatches.map((watch) => watch.id).join(","), attentionSource: "watchlist", category: "channel_read", provider: "x", action: "watchlist_search", usage: { requests: 1 }, attentionEpisodeId: options?.attentionEpisodeId });
        watchPosts.push(...await searchRecentXPosts(credentials, query, 25));
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Watchlist observation limited", error instanceof Error ? error.message : "X did not return the watched account's recent posts.", "warning");
      }
    }
    const existingMirrors = new Map(next.mirrorObjects
      .filter((item) => item.presenceId === presenceId && item.channelId === "x" && item.externalRef.type === "x.post")
      .map((item) => [item.externalRef.id, item]));
    const mirrorChanged = (post: XRecentPost) => {
      const existing = existingMirrors.get(post.id);
      if (!existing) return true;
      if (existing.content?.text !== post.text || existing.occurredAt !== post.createdAt || existing.parentExternalRef?.id !== post.parentId || existing.conversationExternalRef !== post.conversationId) return true;
      const existingReferences = (existing.referencedExternalRefs ?? []).map((reference) => `${reference.type}:${reference.id}`).join(",");
      const nextReferences = (post.referencedPosts ?? []).map((reference) => `x.post:${reference.id}`).join(",");
      return existingReferences !== nextReferences || (existing.assetRefs?.length ?? 0) !== (post.media?.length ?? 0);
    };
    const hasMirrorDelta = [...posts, ...mentions, ...watchPosts].some(mirrorChanged)
      // A re-observed own reply can reconcile a lost delivery acknowledgement
      // even when its Mirror content is unchanged.
      || posts.some((post) => Boolean(post.parentId && next.executions.some((execution) => execution.presenceId === presenceId && execution.target?.id === post.parentId && execution.affordance === "x.reply" && !execution.externalRef && ["blocked", "failed", "cancelled", "verification-closed"].includes(execution.status))));
    const observedAt = new Date().toISOString();
    const hasGrowthAssignment = next.assignments.some((assignment) => assignment.presenceId === presenceId && assignment.successEvidence?.metric === "followers" && assignment.status !== "cancelled");
    if (hasGrowthAssignment && !options?.inboundOnly) {
      try {
        next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, runId: options?.runId, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 }, attentionEpisodeId: options?.attentionEpisodeId });
        const audience = await readXAudienceSnapshot(credentials, accountId);
        if (audience) next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: audience.followers, following: audience.following, source: "native", observedAt: audience.observedAt });
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Audience measurement unavailable", error instanceof Error ? error.message : "X did not return follower metrics.", "warning");
      }
    }
    if (hasMirrorDelta) {
      next = recordNativeMirrors(next, [
        ...posts.map((post) => ({ connectionId: connection.id, presenceId, own: true, post })),
        ...mentions.map((post) => ({ connectionId: connection.id, presenceId, post })),
        ...watchPosts.map((post) => ({ connectionId: connection.id, presenceId, post })),
      ], { attentionEpisodeId: options?.attentionEpisodeId, attentionRunId: options?.runId, attentionInvocationId: options?.invocationId });
      next = detectDuplicatePublicOutcomes(next, presenceId);
      const watchedMirrorObjects = next.mirrorObjects.filter((object) => object.presenceId === presenceId && watchPosts.some((post) => post.id === object.externalRef.id));
      next = recordWatchSignals(next, watchedMirrorObjects, nextObservationAt(targetPresence ?? undefined));
      const inboundMirrorObjects = next.mirrorObjects.filter((object) => object.presenceId === presenceId && mentions.some((post) => post.id === object.externalRef.id));
      next = recordPublicRequestsFromMirrors(next, inboundMirrorObjects);
    }
    const latestMetricAt = next.publicationMetricSnapshots.reduce((latest, item) => {
      if (item.presenceId !== presenceId) return latest;
      const observedAt = Date.parse(item.observedAt);
      return Number.isFinite(observedAt) ? Math.max(latest, observedAt) : latest;
    }, 0);
    const publicationMetricsDue = !latestMetricAt || Date.now() - latestMetricAt >= 60 * 60_000;
    if (hasGrowthAssignment && !options?.inboundOnly && (hasMirrorDelta || publicationMetricsDue)) try {
      const ownMirrorObjects = next.mirrorObjects.filter((item) => item.presenceId === presenceId && item.actorPresenceId === presenceId && item.environment === "live" && !item.archived && item.externalRef.type === "x.post").slice(0, 100);
      next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, runId: options?.runId, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 }, attentionEpisodeId: options?.attentionEpisodeId });
      const metrics = await readXPublicationMetrics(credentials, ownMirrorObjects.map((item) => item.externalRef.id));
      const metricOperations: Array<Parameters<typeof recordPublicationMetricSnapshots>[1][number]> = [];
      const seenMetricBuckets = new Set(next.publicationMetricSnapshots.map((item) => `${item.mirrorObjectId}:${Math.round(item.publicationAgeSeconds / 3600)}`));
      for (const metric of metrics) {
        const mirror = ownMirrorObjects.find((item) => item.externalRef.id === metric.id);
        if (!mirror) continue;
        const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(mirror.occurredAt ?? mirror.observedAt).getTime()) / 1000));
        const ageBucket = Math.round(ageSeconds / 3600);
        const metricKey = `${mirror.id}:${ageBucket}`;
        if (seenMetricBuckets.has(metricKey)) continue;
        seenMetricBuckets.add(metricKey);
        metricOperations.push({ type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: ageSeconds, metrics: { impressions: metric.impressions, likes: metric.likes, replies: metric.replies, reposts: metric.reposts, quotes: metric.quotes }, source: "native" });
      }
      if (metricOperations.length) next = recordPublicationMetricSnapshots(next, metricOperations);
    } catch (error) {
      next = recordRuntimeEvent(next, presenceId, "Publication measurement unavailable", error instanceof Error ? error.message : "X did not return publication metrics.", "warning");
    }
    const currentPostIds = new Set(posts.map((post) => post.id));
    const missingOwnPostIds = [...previousOwnPostIds].filter((postId) => !currentPostIds.has(postId));
    let deletedOwnPostIds: string[] = [];
    if (missingOwnPostIds.length && !options?.inboundOnly && (hasMirrorDelta || publicationMetricsDue)) {
      try {
        const stillVisible: XRecentPost[] = [];
        for (let offset = 0; offset < missingOwnPostIds.length; offset += 100) {
          next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, runId: options?.runId, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 }, attentionEpisodeId: options?.attentionEpisodeId });
          stillVisible.push(...await readXPostsByIds(credentials, missingOwnPostIds.slice(offset, offset + 100)));
        }
        const stillVisibleIds = new Set(stillVisible.map((post) => post.id));
        deletedOwnPostIds = missingOwnPostIds.filter((postId) => !stillVisibleIds.has(postId));
        for (const postId of deletedOwnPostIds) next = recordNativeMirrorDeletion(next, { connectionId: connection.id, presenceId, postId });
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Deleted-post check unavailable", error instanceof Error ? error.message : "X did not confirm whether missing posts were deleted.", "warning");
      }
    }
    // Do not hydrate every mention during the observation critical path.
    // X can return up to 100 mentions, and each ancestry request has its own
    // bounded connector timeout. Hydrating them serially turned one healthy
    // read into an unbounded multi-minute stage and made the watchdog report
    // a false runtime stall. Attention Pulse hydrates only the first eligible
    // inbound mention when cognition actually needs thread context.
    next = recordPublicFooting(next, presenceId, {
      postsPublished: posts.length,
      recentPostIds: posts.map((post) => post.id),
      recentInboundIds: mentions.map((mention) => mention.id),
      judgedInboundIds: next.presences.find((item) => item.id === presenceId)?.context.publicFooting?.judgedInboundIds,
      observedAt,
    });

    const conversations = new Set(
      [...posts, ...mentions]
        .map((post) => post.conversationId ?? post.parentId)
        .filter((value): value is string => Boolean(value)),
    );
    const partial = mentionsResult.status === "rejected";
    const zeroDeltaStreak = hasMirrorDelta || partial ? 0 : Math.min(8, (previousObservation?.zeroDeltaStreak ?? 0) + 1);
    const error = partial
      ? mentionsResult.reason instanceof Error ? mentionsResult.reason.message : "X did not return inbound mentions."
      : undefined;
    next = recordNativeObservation(next, presenceId, {
      status: partial ? "degraded" : "up-to-date",
      lastObservedAt: observedAt,
      nextObservationAt: nextObservationAt(next.presences.find((item) => item.id === presenceId), Date.parse(observedAt), zeroDeltaStreak),
      ownPostCount: posts.length,
      mentionCount: mentions.length,
      conversationCount: conversations.size,
      zeroDeltaStreak,
      error,
    });
    if (partial || hasMirrorDelta || deletedOwnPostIds.length) {
      next = recordRuntimeEvent(
        next,
        presenceId,
        partial ? "Social Mirror partially updated" : "Social Mirror updated",
        partial
          ? `Observed ${posts.length} public post${posts.length === 1 ? "" : "s"}${deletedOwnPostIds.length ? ` and reconciled ${deletedOwnPostIds.length} deleted post${deletedOwnPostIds.length === 1 ? "" : "s"}` : ""}; inbound mentions were unavailable. The last known Mirror remains available.`
          : posts.length || mentions.length
            ? `Observed ${posts.length} public post${posts.length === 1 ? "" : "s"} and ${mentions.length} inbound mention${mentions.length === 1 ? "" : "s"}${deletedOwnPostIds.length ? `; reconciled ${deletedOwnPostIds.length} deleted post${deletedOwnPostIds.length === 1 ? "" : "s"}` : ""}.`
            : "X is up to date. No recent posts, mentions, or conversations were found.",
        partial ? "warning" : "positive",
      );
    }
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : "X did not return a readable observation.";
    next = recordNativeObservation(next, presenceId, {
      ...(connection.observation ?? {}),
      status: "error",
      error: message,
      nextObservationAt: new Date(Date.now() + 60_000).toISOString(),
    });
    if (xCreditsExhausted({ healthMessage: message, deliveryError: message, observation: { error: message } })) {
      next = markNativeConnectionNeedsAttention(next, presenceId, message);
    }
    return recordRuntimeEvent(next, presenceId, "X observation failed", message, "warning");
  }
}
