import { readNativeXCredentials, readRecentXMentions, readRecentXPosts } from "./x";
import { recordNativeMirror, recordNativeObservation, recordPublicFooting, recordRuntimeEvent } from "./runtime";
import type { OpenPresenceState } from "./types";

const intervalFor = (pacing: OpenPresenceState["presences"][number]["pacing"] | undefined) =>
  pacing === "gentle" ? 15 * 60_000 : 5 * 60_000;

const nextObservationAt = (presence: OpenPresenceState["presences"][number] | undefined, from = Date.now()) =>
  new Date(from + intervalFor(presence?.pacing)).toISOString();

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
    for (const post of [...posts, ...mentions]) {
      next = recordNativeMirror(next, { connectionId: connection.id, presenceId, post });
    }
    next = recordPublicFooting(next, presenceId, {
      postsPublished: posts.length,
      recentPostIds: posts.map((post) => post.id),
      recentInboundIds: mentions.map((mention) => mention.id),
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
