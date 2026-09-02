import { randomUUID } from "node:crypto";
import type { AssignmentRunStatus, AttentionEpisode, OpenPresenceState, OperatorConversation, OperatorNudge, PresenceChatAttachment, SandboxAssetInput } from "./types";
import { assignmentPursuitVerifiedCounts } from "./runtime";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const urlsIn = (content: string) => [...new Set(content.match(/https?:\/\/[^\s<>()]+/gi) ?? [])].map((url) => url.replace(/[.,!?;:]+$/, ""));

const burstStatusWords = /\b(?:burst|campaign|increased? effort|distribution push|volume|actions?)\b/i;
const burstStatusQuestionWords = /\b(?:did|has|have|is|are|when|what time|how many|how much|status|started|starting|running|active)\b/i;

/** A status question must not be mistaken for a command to start a burst. */
export function isBurstStatusQuestion(content: string) {
  const normalized = content.trim().replace(/[’]/g, "'");
  return Boolean(normalized && burstStatusWords.test(normalized) && /\?/.test(normalized) && burstStatusQuestionWords.test(normalized));
}

function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Answer burst status from durable state, without asking the model to infer it. */
export function operatorBurstStatusReply(source: OpenPresenceState, presenceId: string, at = new Date()) {
  const nowMs = at.getTime();
  const windows = (source.assignmentPursuitWindows ?? [])
    .filter((window) => window.presenceId === presenceId && ["active", "paused"].includes(window.status) && new Date(window.deadlineAt).getTime() > nowMs)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const window = windows[0];
  if (!window) return "Not yet—there isn’t an active burst running right now.";

  const counts = assignmentPursuitVerifiedCounts(source, window, nowMs);
  const pending = source.executions.filter((execution) => execution.assignmentId === window.assignmentId
    && execution.presenceId === presenceId
    && ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"].includes(execution.status)).length;
  const activeRun = (source.assignmentRuns ?? [])
    .filter((run) => run.assignmentId === window.assignmentId && run.presenceId === presenceId && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const start = localTime(window.startsAt);
  const deadline = localTime(window.deadlineAt);
  const verifiedLabel = `${counts.verified} verified action${counts.verified === 1 ? "" : "s"}`;
  const capacity = `capacity for up to ${window.maxVerifiedActions}`;
  if (window.status === "paused") return `It started at ${start} and is currently paused. I have ${verifiedLabel}; ${capacity} until ${deadline}.`;
  if (pending > 0) return `It’s active now—it started at ${start} and runs until ${deadline}. I have ${verifiedLabel}, with ${pending} action${pending === 1 ? "" : "s"} awaiting authorized delivery or X verification.`;
  if (activeRun) return `It’s active now—it started at ${start} and runs until ${deadline}. I have ${verifiedLabel}; the next pass is in progress.`;
  return `It’s active now—it started at ${start} and runs until ${deadline}. I have ${verifiedLabel}; the next pass is queued.`;
}

function conversationFor(state: OpenPresenceState, presenceId: string, threadId?: string): OperatorConversation {
  const existing = state.operatorConversations?.find((item) => item.presenceId === presenceId && (!threadId || item.threadId === threadId || item.id === threadId || (!item.threadId && `thread:${item.id}` === threadId)))
    ?? (!threadId ? state.operatorConversations?.find((item) => item.presenceId === presenceId && item.status !== "archived") : undefined);
  if (existing) return existing;
  const timestamp = now();
  const created: OperatorConversation = { id: `operator_conversation_${randomUUID()}`, agentId: state.agent?.id ?? "", presenceId, threadId: threadId ?? `thread:${presenceId}`, scope: { kind: "presence", presenceId }, status: "active", title: threadId ? "New conversation" : "Main", createdAt: timestamp, updatedAt: timestamp, messages: [] };
  state.operatorConversations = [created, ...(state.operatorConversations ?? [])];
  return created;
}

/** Record a normal private turn without creating an attention request. */
export function recordOperatorConversationMessage(source: OpenPresenceState, input: { presenceId: string; threadId?: string; content: string; role?: "operator" | "presence"; clientRequestId?: string }) {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  if (!presence) throw new Error("That Presence is not available.");
  const conversation = conversationFor(state, input.presenceId, input.threadId);
  if (input.role !== "presence" && input.clientRequestId) {
    const existing = conversation.messages.find((message) => message.role === "operator" && message.clientRequestId === input.clientRequestId);
    if (existing) return state;
  }
  const timestamp = now();
  conversation.messages.push({ id: `${input.role === "presence" ? "presence" : "operator"}_message_${randomUUID()}`, role: input.role ?? "operator", content: input.content.trim(), timestamp, clientRequestId: input.role === "presence" ? undefined : input.clientRequestId });
  if (conversation.title === "New conversation" && input.role !== "presence") conversation.title = input.content.replace(/\s+/g, " ").slice(0, 52) + (input.content.length > 52 ? "…" : "");
  conversation.updatedAt = timestamp;
  return state;
}

/** Give shared context an immediate conversational state while evidence work runs. */
export function operatorNudgeReceipt(content: string) {
  const hasLink = /https?:\/\//i.test(content);
  return hasLink
    ? "I’m checking the post you shared now. I’ll come back with a grounded read on whether it’s worth engaging, and I won’t take a public action unless the opportunity and authorization are clear."
    : "I’m looking at what you shared now. I’ll come back with a grounded read, and I won’t take a public action unless the opportunity and authorization are clear.";
}

export function operatorRequestsWatch(content: string) {
  return /\b(?:start|keep|put|add|begin)\s+(?:watching|an eye on|this person|him|her|them)\b|\bwatch\s+(?:him|her|them|this person)\b/i.test(content);
}

export function directWatchQuery(content: string) {
  const match = content.match(/\b(?:start|keep|put|add|begin)\s+(?:watching|an eye on)\s+(@?[A-Za-z0-9_]{2,30})\b/i);
  const mentionedHandle = content.match(/@[A-Za-z0-9_]{2,30}/)?.[0];
  return match?.[1]?.replace(/^@/, "") || (operatorRequestsWatch(content) ? mentionedHandle?.replace(/^@/, "") : undefined);
}

export function createOperatorNudge(source: OpenPresenceState, input: { presenceId: string; threadId?: string; content: string; attachments?: SandboxAssetInput[]; clientRequestId?: string }) {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  if (!presence) throw new Error("That Presence is not available.");
  const timestamp = now();
  const conversation = conversationFor(state, input.presenceId, input.threadId);
  if (input.clientRequestId) {
    const existingMessage = conversation.messages.find((message) => message.role === "operator" && message.clientRequestId === input.clientRequestId);
    const existingNudge = existingMessage?.nudgeId ? state.operatorNudges?.find((nudge) => nudge.id === existingMessage.nudgeId) : undefined;
    if (existingMessage && existingNudge) return { state, nudge: existingNudge, duplicate: true as const };
  }
  const messageId = `operator_message_${randomUUID()}`;
  const nudgeId = `operator_nudge_${randomUUID()}`;
  const attachments: PresenceChatAttachment[] = (input.attachments ?? []).map((item) => ({ id: `operator_attachment_${randomUUID()}`, name: item.name, kind: item.kind, mimeType: item.mimeType, dataUrl: item.dataUrl, sourceUrl: item.sourceUrl }));
  conversation.messages.push({ id: messageId, role: "operator", content: input.content.trim(), timestamp, nudgeId, attachments, clientRequestId: input.clientRequestId });
  if (presence.status === "paused") {
    conversation.messages.push({ id: `operator_system_${randomUUID()}`, role: "system", content: `${presence.name} is paused. Your note is saved and will be considered after you wake this Presence.`, timestamp, nudgeId });
  }
  if (conversation.title === "New conversation") conversation.title = input.content.replace(/\s+/g, " ").slice(0, 52) + (input.content.length > 52 ? "…" : "");
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
    clientRequestId: input.clientRequestId,
  };
  state.operatorNudges = [nudge, ...(state.operatorNudges ?? [])];
  return { state, nudge, duplicate: false as const };
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
