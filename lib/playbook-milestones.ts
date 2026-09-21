import type { GrowthHypothesis, OpenPresenceState, OperatorConversation } from "./types";

/** One durable, quiet chat update for a material review change, never every poll. */
export function recordPlaybookMilestones(state: OpenPresenceState, presenceId: string, before: GrowthHypothesis[], reviewId: string, timestamp: string) {
  const prior = new Map(before.map(item => [item.id, item.status]));
  const changed = (state.growthHypotheses ?? []).filter(item => item.originatingPresenceId === presenceId && item.agentId === state.agent?.id && (
    !prior.has(item.id) || item.status === "supported" && prior.get(item.id) !== "supported" || prior.get(item.id) === "supported" && ["weakened", "disfavored"].includes(item.status)
  ));
  if (!changed.length) return state;
  const messageId = `playbook-review:${reviewId}`;
  if (state.operatorConversations?.some(conversation => conversation.messages.some(message => message.id === messageId))) return state;
  const main = state.operatorThreads?.find(thread => thread.agentId === state.agent?.id && thread.title === "Main" && thread.status !== "archived" && thread.scope.kind === "presence" && thread.scope.presenceId === presenceId);
  let conversation = state.operatorConversations?.find(item => item.presenceId === presenceId && item.status !== "archived" && (item.id === main?.communicationThreadId || item.title === "Main" || item.threadId === `thread:${presenceId}`));
  if (!conversation) {
    conversation = { id: `operator:${presenceId}`, agentId: state.agent?.id ?? "", presenceId, threadId: main?.id ?? `thread:${presenceId}`, title: "Main", status: "active", scope: { kind: "presence", presenceId }, createdAt: timestamp, updatedAt: timestamp, messages: [] } satisfies OperatorConversation;
    state.operatorConversations = [...(state.operatorConversations ?? []), conversation];
  }
  const lines = changed.slice(0, 3).map(item => `- ${item.template?.title ?? item.statement}: ${item.status === "supported" ? "new observed evidence supports this approach" : item.status === "weakened" || item.status === "disfavored" ? "recent evidence is less encouraging; reconsider its use" : "a new approach to test, not yet proven"}.`);
  conversation.messages.push({
    id: messageId,
    role: "presence",
    content: `## Playbook update\n\n${lines.join("\n")}\n\nThe sources and results are saved in Artifacts → Templates.`,
    timestamp,
    // A newly saved low-confidence approach is a strategy change to test,
    // not a verified breakthrough. Only evidence-backed support earns the
    // stronger milestone and proactive classification.
    milestone: changed.some(item => item.status === "supported") ? "verified" : "decision",
    agentInitiated: { kind: changed.some(item => item.status === "supported") ? "breakthrough" : "strategy_change", dedupeKey: messageId },
  });
  conversation.updatedAt = timestamp;
  return state;
}
