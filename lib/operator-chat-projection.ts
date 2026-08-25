import type { OpenPresenceState } from "./types";

export interface OperatorConversationActionEvent {
  id: string;
  nudgeId: string;
  executionId: string;
  title: string;
  status: "queued" | "working" | "verifying" | "verified" | "failed";
  statusLabel: string;
  occurredAt: string;
  sourceUrl?: string;
  sourceLabel?: string;
  resultUrl?: string;
}

const pendingExecutionStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed"]);
const failedExecutionStatuses = new Set(["failed", "blocked", "cancelled", "expired", "verification-closed"]);

/** Project truthful execution state into a human chronological Chat event. */
export function operatorConversationActionEvents(state: OpenPresenceState, presenceId: string): OperatorConversationActionEvent[] {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence) return [];
  const nudges = (state.operatorNudges ?? []).filter((item) => item.presenceId === presenceId);
  return state.executions.flatMap((execution) => {
    if (execution.presenceId !== presenceId) return [];
    const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
    const decision = state.socialDecisions.find((item) => item.socialIntentId === execution.socialIntentId);
    const origin = intent?.origin?.kind === "operator" ? intent.origin : decision?.origin?.kind === "operator" ? decision.origin : undefined;
    const nudge = origin ? nudges.find((item) => item.id === origin.refId) : undefined;
    if (!nudge) return [];
    const action = execution.affordance.replace(/^x\./, "");
    const targetMirror = state.mirrorObjects.find((item) => {
      if (item.presenceId !== presenceId) return false;
      const authorRef = item.author?.externalRef;
      return item.externalRef.type === execution.target?.type && item.externalRef.id === execution.target?.id
        || authorRef?.type === execution.target?.type && authorRef?.id === execution.target?.id;
    });
    const targetHandle = targetMirror?.author?.handle?.replace(/^@/, "");
    const ownHandle = presence.handle.replace(/^@/, "");
    const sourceUrl = execution.target?.type === "x.post"
      ? `https://x.com/${targetHandle || "i"}/status/${execution.target.id}`
      : execution.target?.type === "x.user"
        ? targetHandle ? `https://x.com/${targetHandle}` : `https://x.com/i/user/${execution.target.id}`
        : undefined;
    const resultUrl = execution.status === "succeeded" && execution.externalRef && ["x.post", "x.reply"].includes(execution.externalRef.type)
      ? `https://x.com/${ownHandle}/status/${execution.externalRef.id}`
      : undefined;
    const status: OperatorConversationActionEvent["status"] = execution.status === "succeeded"
      ? "verified"
      : failedExecutionStatuses.has(execution.status)
        ? "failed"
        : execution.status === "verification-pending"
          ? "verifying"
          : pendingExecutionStatuses.has(execution.status)
            ? "queued"
            : "working";
    const subject = action === "follow" ? (targetHandle ? `@${targetHandle}` : "this account") : action === "reply" || action === "like" || action === "repost" || action === "quote" ? "this post" : "on X";
    const completedVerb = action === "reply" ? "replied to" : action === "like" ? "liked" : action === "repost" ? "reposted" : action === "quote" ? "quoted" : action === "follow" ? "followed" : action;
    const activeVerb = action === "reply" ? "Replying to" : action === "like" ? "Liking" : action === "repost" ? "Reposting" : action === "quote" ? "Quoting" : action === "follow" ? "Following" : `Doing ${action}`;
    const title = status === "verified"
      ? `${presence.name} ${completedVerb} ${subject} on X`
      : status === "failed"
        ? `${presence.name} couldn't complete the ${action} on X`
        : `${activeVerb} ${subject} on X`;
    const statusLabel = status === "verified" ? "Verified" : status === "failed" ? "Not completed" : status === "verifying" ? "Verifying" : status === "working" ? "In progress" : execution.status === "awaiting-review" ? "Needs review" : "Queued";
    return [{
      id: `operator_action_${execution.id}`,
      nudgeId: nudge.id,
      executionId: execution.id,
      title,
      status,
      statusLabel,
      occurredAt: execution.executedAt ?? execution.updatedAt ?? execution.createdAt,
      sourceUrl,
      sourceLabel: action === "follow" ? (targetHandle ? `View @${targetHandle}` : "View profile") : "View original post",
      resultUrl,
    }];
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
