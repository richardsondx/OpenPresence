import { randomUUID } from "node:crypto";
import type { AssignmentRunStatus, AttentionEpisode, OpenPresenceState, OperatorConversation, OperatorNudge, PresenceChatAttachment, SandboxAssetInput } from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const urlsIn = (content: string) => [...new Set(content.match(/https?:\/\/[^\s<>()]+/gi) ?? [])].map((url) => url.replace(/[.,!?;:]+$/, ""));

function conversationFor(state: OpenPresenceState, presenceId: string): OperatorConversation {
  const existing = state.operatorConversations?.find((item) => item.presenceId === presenceId);
  if (existing) return existing;
  const timestamp = now();
  const created: OperatorConversation = { id: `operator_conversation_${randomUUID()}`, agentId: state.agent?.id ?? "", presenceId, title: "Private conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] };
  state.operatorConversations = [created, ...(state.operatorConversations ?? [])];
  return created;
}

export function createOperatorNudge(source: OpenPresenceState, input: { presenceId: string; content: string; attachments?: SandboxAssetInput[] }) {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  if (!presence) throw new Error("That Presence is not available.");
  const timestamp = now();
  const conversation = conversationFor(state, input.presenceId);
  const messageId = `operator_message_${randomUUID()}`;
  const nudgeId = `operator_nudge_${randomUUID()}`;
  const attachments: PresenceChatAttachment[] = (input.attachments ?? []).map((item) => ({ id: `operator_attachment_${randomUUID()}`, name: item.name, kind: item.kind, mimeType: item.mimeType, dataUrl: item.dataUrl, sourceUrl: item.sourceUrl }));
  conversation.messages.push({ id: messageId, role: "operator", content: input.content.trim(), timestamp, nudgeId, attachments });
  if (presence.status === "paused") {
    conversation.messages.push({ id: `operator_system_${randomUUID()}`, role: "system", content: `${presence.name} is paused. Your note is saved and will be considered after you wake this Presence.`, timestamp, nudgeId });
  }
  conversation.updatedAt = timestamp;
  const nudge: OperatorNudge = {
    id: nudgeId,
    agentId: state.agent?.id ?? "",
    presenceId: input.presenceId,
    conversationId: conversation.id,
    messageId,
    content: input.content.trim(),
    status: presence.status === "paused" ? "held_paused" : "acknowledged",
    sourceUrls: [...new Set([...urlsIn(input.content), ...attachments.flatMap((item) => item.sourceUrl ? [item.sourceUrl] : [])])],
    attachmentIds: attachments.map((item) => item.id),
    createdAt: timestamp,
    updatedAt: timestamp,
    attentionEpisodeIds: [],
    acknowledgedAt: presence.status === "paused" ? undefined : timestamp,
  };
  state.operatorNudges = [nudge, ...(state.operatorNudges ?? [])];
  return { state, nudge };
}

export function startQueuedNudge(source: OpenPresenceState, presenceId: string, episode: AttentionEpisode) {
  const state = clone(source);
  const nudge = [...(state.operatorNudges ?? [])].reverse().find((item) => item.presenceId === presenceId && ["queued", "acknowledged"].includes(item.status));
  if (!nudge) return { state, nudge: undefined };
  const timestamp = now();
  nudge.status = "working";
  nudge.acknowledgedAt = nudge.acknowledgedAt ?? timestamp;
  nudge.updatedAt = timestamp;
  nudge.attentionEpisodeIds = [...new Set([...nudge.attentionEpisodeIds, episode.id])];
  return { state, nudge };
}

export function settleNudgeForEpisode(source: OpenPresenceState, episodeId: string, summary: string, failed = false) {
  const state = clone(source);
  const nudge = state.operatorNudges?.find((item) => item.attentionEpisodeIds.includes(episodeId) && item.status === "working");
  if (!nudge) return state;
  const timestamp = now();
  nudge.status = failed ? "failed" : "resolved";
  nudge.resultSummary = summary;
  nudge.lastError = failed ? summary : undefined;
  nudge.resolvedAt = timestamp;
  nudge.updatedAt = timestamp;
  const conversation = state.operatorConversations?.find((item) => item.id === nudge.conversationId);
  if (conversation) {
    conversation.messages.push({ id: `presence_result_${randomUUID()}`, role: "presence", content: summary, timestamp, nudgeId: nudge.id, milestone: failed ? "failure" : "decision" });
    conversation.updatedAt = timestamp;
  }
  return state;
}

/**
 * Record the explicit handoff from optional Chat context to a required
 * Assignment. This is an OpenPresence receipt, not synthetic Presence speech.
 */
export function recordNudgeAssignmentHandoff(source: OpenPresenceState, nudgeId: string, message: string) {
  const state = clone(source);
  const nudge = state.operatorNudges?.find((item) => item.id === nudgeId);
  if (!nudge) return state;
  const conversation = state.operatorConversations?.find((item) => item.id === nudge.conversationId);
  if (!conversation || conversation.messages.some((item) => item.nudgeId === nudge.id && item.milestone === "assignment")) return state;
  const timestamp = now();
  conversation.messages.push({ id: `operator_system_${randomUUID()}`, role: "system", content: message, timestamp, nudgeId: nudge.id, milestone: "assignment" });
  conversation.updatedAt = timestamp;
  return state;
}

/** Keep the private conversation continuous when the linked Assignment ends. */
export function settleNudgeFromAssignment(source: OpenPresenceState, assignmentId: string, runStatus: AssignmentRunStatus, summary?: string) {
  const state = clone(source);
  const nudge = state.operatorNudges?.find((item) => item.assignmentId === assignmentId);
  if (!nudge || !["published", "deferred", "blocked", "failed"].includes(runStatus)) return state;
  const failed = runStatus === "blocked" || runStatus === "failed";
  const milestone = failed ? "failure" : runStatus === "published" ? "action" : "decision";
  const content = summary?.trim() || (failed
    ? "I couldn't complete that Assignment."
    : runStatus === "published"
      ? "The requested action was sent."
      : "I considered the Assignment and did not take a public action.");
  const conversation = state.operatorConversations?.find((item) => item.id === nudge.conversationId);
  if (conversation && !conversation.messages.some((item) => item.nudgeId === nudge.id && item.milestone === milestone && item.content === content)) {
    const timestamp = now();
    conversation.messages.push({ id: `presence_result_${randomUUID()}`, role: "presence", content, timestamp, nudgeId: nudge.id, milestone });
    conversation.updatedAt = timestamp;
    nudge.status = failed ? "failed" : "resolved";
    nudge.resultSummary = content;
    nudge.lastError = failed ? content : undefined;
    nudge.resolvedAt = timestamp;
    nudge.updatedAt = timestamp;
  }
  return state;
}

export function releasePausedNudges(source: OpenPresenceState, presenceId: string) {
  const state = clone(source);
  const timestamp = now();
  for (const nudge of state.operatorNudges ?? []) {
    if (nudge.presenceId === presenceId && nudge.status === "held_paused") {
      nudge.status = "queued";
      nudge.updatedAt = timestamp;
    }
  }
  return state;
}
