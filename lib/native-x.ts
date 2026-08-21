import { randomUUID } from "node:crypto";
import { readNativeXCredentials, readRecentXMentions, readRecentXPosts, readXAudienceSnapshot, readXPublicationMetrics, readXPostsByIds, type XRecentPost } from "./x";
import { applyOperation, intervalForPresence, markNativeConnectionNeedsAttention, recordNativeMirror, recordNativeMirrorDeletion, recordNativeObservation, recordPublicFooting, recordResourceUsageEvent, recordRuntimeEvent } from "./runtime";
import { normalizeHandle } from "./x";
import { languagesMatch } from "./language-policy";
import type { EntityRef, MirrorObject, OpenPresenceState, Presence, PresenceQuietHours } from "./types";
import { hydrateThreadContext } from "./thread-context";

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
  },
): Promise<OpenPresenceState> {
  if (!observedObject.parentExternalRef) return source;
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
      });
      const posts = await readXPostsByIds(credentials, targetRefs.map((ref) => ref.id));
      for (const post of posts) fetchedPosts.set(post.id, post);
      return posts.map((post) => xPostMirrorObject(post, presenceId, connection.id));
    },
  });
  for (const object of hydrated.objects) {
    const sourcePost = fetchedPosts.get(object.externalRef.id);
    if (!sourcePost) continue;
    next = recordNativeMirror(next, { connectionId: connection.id, presenceId, post: sourcePost });
  }
  return next;
}

export const nextObservationAt = (presence: Presence | undefined, from = Date.now()) => {
  const base = new Date(from);
  const candidate = new Date(from + intervalFor(presence));
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

export async function reconcileNativeX(source: OpenPresenceState, presenceId: string): Promise<OpenPresenceState> {
  let next = recordNativeObservation(source, presenceId, {
    ...(source.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x")?.observation ?? {}),
    status: "syncing",
    error: undefined,
  });
  next = recordRuntimeEvent(next, presenceId, "Social Mirror syncing", "Reconciling the connected X account into the Social Mirror.", "positive");

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
      readRecentXPosts(credentials, accountId),
      readRecentXMentions(credentials, accountId),
    ]);
    next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, originKind: "inbound_social", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 2 } });
    if (postsResult.status === "rejected") throw postsResult.reason;

    const posts = postsResult.value;
    const mentions = mentionsResult.status === "fulfilled" ? mentionsResult.value : [];
    const observedAt = new Date().toISOString();
    const hasGrowthAssignment = next.assignments.some((assignment) => assignment.presenceId === presenceId && assignment.successEvidence?.metric === "followers" && assignment.status !== "cancelled");
    if (hasGrowthAssignment) {
      try {
        next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 } });
        const audience = await readXAudienceSnapshot(credentials, accountId);
        if (audience) next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: audience.followers, following: audience.following, source: "native", observedAt: audience.observedAt });
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Audience measurement unavailable", error instanceof Error ? error.message : "X did not return follower metrics.", "warning");
      }
    }
    for (const post of posts) next = recordNativeMirror(next, { connectionId: connection.id, presenceId, own: true, post });
    for (const post of mentions) next = recordNativeMirror(next, { connectionId: connection.id, presenceId, post });
    if (hasGrowthAssignment) try {
      const ownMirrorObjects = next.mirrorObjects.filter((item) => item.presenceId === presenceId && item.actorPresenceId === presenceId && item.environment === "live" && !item.archived && item.externalRef.type === "x.post").slice(0, 100);
      next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 } });
      const metrics = await readXPublicationMetrics(credentials, ownMirrorObjects.map((item) => item.externalRef.id));
      for (const metric of metrics) {
        const mirror = ownMirrorObjects.find((item) => item.externalRef.id === metric.id);
        if (!mirror) continue;
        const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(mirror.occurredAt ?? mirror.observedAt).getTime()) / 1000));
        const ageBucket = Math.round(ageSeconds / 3600);
        const duplicate = next.publicationMetricSnapshots.some((item) => item.mirrorObjectId === mirror.id && Math.round(item.publicationAgeSeconds / 3600) === ageBucket);
        if (duplicate) continue;
        next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: ageSeconds, metrics: { impressions: metric.impressions, likes: metric.likes, replies: metric.replies, reposts: metric.reposts, quotes: metric.quotes }, source: "native" });
      }
    } catch (error) {
      next = recordRuntimeEvent(next, presenceId, "Publication measurement unavailable", error instanceof Error ? error.message : "X did not return publication metrics.", "warning");
    }
    const currentPostIds = new Set(posts.map((post) => post.id));
    const missingOwnPostIds = [...previousOwnPostIds].filter((postId) => !currentPostIds.has(postId));
    let deletedOwnPostIds: string[] = [];
    if (missingOwnPostIds.length) {
      try {
        const stillVisible: XRecentPost[] = [];
        for (let offset = 0; offset < missingOwnPostIds.length; offset += 100) {
          next = recordResourceUsageEvent(next, { presenceId, invocationId: `x-reconcile:${randomUUID()}`, originKind: "other", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 } });
          stillVisible.push(...await readXPostsByIds(credentials, missingOwnPostIds.slice(offset, offset + 100)));
        }
        const stillVisibleIds = new Set(stillVisible.map((post) => post.id));
        deletedOwnPostIds = missingOwnPostIds.filter((postId) => !stillVisibleIds.has(postId));
        for (const postId of deletedOwnPostIds) next = recordNativeMirrorDeletion(next, { connectionId: connection.id, presenceId, postId });
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Deleted-post check unavailable", error instanceof Error ? error.message : "X did not confirm whether missing posts were deleted.", "warning");
      }
    }
    // Eagerly make the public ancestry available before Pulse runs during replies.
    // The hydrator is bounded and idempotent, so a later lazy check is cheap.
    for (const mention of mentions) {
      const observed = next.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === mention.id);
      if (!observed?.parentExternalRef) continue;
      try {
        next = await hydrateNativeXThreadContext(next, presenceId, observed, { originKind: "inbound_social", attentionSource: "inbound_social" });
      } catch (error) {
        next = recordRuntimeEvent(next, presenceId, "Thread context partially available", error instanceof Error ? error.message : "X did not return all referenced public context.", "warning", { sourceObjectId: observed.id });
      }
    }
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
    const error = partial
      ? mentionsResult.reason instanceof Error ? mentionsResult.reason.message : "X did not return inbound mentions."
      : undefined;
    next = recordNativeObservation(next, presenceId, {
      status: partial ? "degraded" : "up-to-date",
      lastObservedAt: observedAt,
      nextObservationAt: nextObservationAt(next.presences.find((item) => item.id === presenceId)),
      ownPostCount: posts.length,
      mentionCount: mentions.length,
      conversationCount: conversations.size,
      error,
    });
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
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : "X did not return a readable observation.";
    next = recordNativeObservation(next, presenceId, {
      ...(connection.observation ?? {}),
      status: "error",
      error: message,
      nextObservationAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return recordRuntimeEvent(next, presenceId, "X observation failed", message, "warning");
  }
}
