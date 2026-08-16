import { readNativeXCredentials, readRecentXMentions, readRecentXPosts, readXPostsByIds, type XRecentPost } from "./x";
import { recordNativeMirror, recordNativeObservation, recordPublicFooting, recordRuntimeEvent } from "./runtime";
import type { EntityRef, MirrorObject, OpenPresenceState, Presence, PresenceQuietHours } from "./types";
import { hydrateThreadContext } from "./thread-context";

const intervalFor = (presence: Presence | undefined) => {
  if (presence?.pacing === "gentle") return 15 * 60_000;
  if (presence?.pacing === "custom") return Math.max(5, Math.min(120, presence.attentionIntervalMinutes || 30)) * 60_000;
  return 5 * 60_000;
};

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
    author: { externalRef: post.authorId ? { type: "x.user", id: post.authorId } : undefined, displayName: post.authorName ?? (post.authorUsername ? `@${post.authorUsername}` : "X user"), handle: post.authorUsername },
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
export async function hydrateNativeXThreadContext(source: OpenPresenceState, presenceId: string, observedObject: MirrorObject): Promise<OpenPresenceState> {
  const connection = source.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x");
  const credentials = connection ? readNativeXCredentials(connection.id) : undefined;
  if (!connection || !credentials) return source;
  const mirror = source.mirrorObjects.filter((item) => item.presenceId === presenceId && item.channelId === "x" && (item.environment === "live" || item.environment === undefined));
  const fetchedPosts = new Map<string, XRecentPost>();
  const hydrated = await hydrateThreadContext({
    mirror,
    observedObject,
    maxDepth: 8,
    maxObjects: 8,
    fetchObjects: async (refs: EntityRef[]) => {
      const posts = await readXPostsByIds(credentials, refs.filter((ref) => ref.type === "x.post").map((ref) => ref.id));
      for (const post of posts) fetchedPosts.set(post.id, post);
      return posts.map((post) => xPostMirrorObject(post, presenceId, connection.id));
    },
  });
  let next = source;
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
  const accountId = connection?.account?.id;
  if (!connection || !credentials || !accountId) {
    const message = "The native X connection could not provide a readable account context.";
    next = recordNativeObservation(next, presenceId, { status: "error", error: message, nextObservationAt: new Date(Date.now() + 60_000).toISOString() });
    return recordRuntimeEvent(next, presenceId, "X observation failed", message, "warning");
  }

  try {
    const [postsResult, mentionsResult] = await Promise.allSettled([
      readRecentXPosts(credentials, accountId),
      readRecentXMentions(credentials, accountId),
    ]);
    if (postsResult.status === "rejected") throw postsResult.reason;

    const posts = postsResult.value;
    const mentions = mentionsResult.status === "fulfilled" ? mentionsResult.value : [];
    const observedAt = new Date().toISOString();
    for (const post of posts) next = recordNativeMirror(next, { connectionId: connection.id, presenceId, own: true, post });
    for (const post of mentions) next = recordNativeMirror(next, { connectionId: connection.id, presenceId, post });
    // Eagerly make the public ancestry available before Pulse runs. The
    // hydrator is bounded and idempotent, so a later lazy check is cheap.
    for (const mention of mentions) {
      const observed = next.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === mention.id);
      if (!observed?.parentExternalRef && !(observed?.referencedExternalRefs?.length)) continue;
      try {
        next = await hydrateNativeXThreadContext(next, presenceId, observed);
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
        ? `Observed ${posts.length} public post${posts.length === 1 ? "" : "s"}; inbound mentions were unavailable. The last known Mirror remains available.`
        : posts.length || mentions.length
          ? `Observed ${posts.length} public post${posts.length === 1 ? "" : "s"} and ${mentions.length} inbound mention${mentions.length === 1 ? "" : "s"}.`
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
