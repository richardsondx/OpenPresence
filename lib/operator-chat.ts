import { randomUUID } from "node:crypto";
import type { AssignmentRunStatus, AttentionEpisode, OpenPresenceState, OperatorConversation, OperatorNudge, PerceptionUncertainty, PresenceChatAttachment, SandboxAssetInput } from "./types";
import { assignmentPursuitVerifiedCounts } from "./runtime";
import { assetIsEligibleForPresence, effectiveAssetObservation, ingestLibraryImages } from "./asset-library";
import { detectLibraryMedia } from "./asset-media";
import { putAssetBytes } from "./asset-store";
import { createUninterpretedPerception } from "./perception";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const urlsIn = (content: string) => [...new Set(content.match(/https?:\/\/[^\s<>()]+/gi) ?? [])].map((url) => url.replace(/[.,!?;:]+$/, ""));

const burstStatusWords = /\b(?:burst|campaign|increased? effort|distribution push|volume|actions?)\b/i;
const burstStatusQuestionWords = /\b(?:did|has|have|is|are|when|what time|how many|how much|status|started|starting|running|active)\b/i;

type MaterializedOperatorAttachments = {
  state: OpenPresenceState;
  attachments: SandboxAssetInput[];
  newAssetIds: string[];
};

function decodeOperatorDataUrl(dataUrl: string, name: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) throw new Error(`${name} is not a valid base64 media attachment.`);
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length) throw new Error(`${name} is an empty media attachment.`);
  return { bytes, mimeType: match[1]! };
}

/**
 * Conversation attachment IDs are private UI wrappers. Any attachment that
 * can reach a public action must first receive the same durable Asset Library
 * identity and immutable bytes as every other publication asset.
 */
export async function materializeOperatorChatAttachments(source: OpenPresenceState, presenceId: string, input: SandboxAssetInput[]): Promise<MaterializedOperatorAttachments> {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const agentId = state.agent?.id;
  if (!presence || !agentId) throw new Error("The attached media has no valid Agent and Presence context.");
  const attachments: SandboxAssetInput[] = [];
  const newAssetIds: string[] = [];
  for (const item of input) {
    if (item.existingAssetId) {
      const existing = state.assets.find((asset) => asset.id === item.existingAssetId);
      if (!existing || existing.archivedAt || existing.status === "failed" || !assetIsEligibleForPresence(state, existing, presence.id)) {
        throw new Error(`${item.name} is no longer available to ${presence.name}.`);
      }
      attachments.push({ ...item, existingAssetId: existing.id, dataUrl: undefined, mimeType: existing.storage?.mimeType ?? existing.mimeType ?? item.mimeType });
      continue;
    }
    if (!item.dataUrl) {
      attachments.push({ ...item });
      continue;
    }
    const decoded = decodeOperatorDataUrl(item.dataUrl, item.name);
    const detected = detectLibraryMedia(item.name, decoded.mimeType, decoded.bytes);
    if (!detected) throw new Error(`${item.name} is not a supported visual attachment.`);
    const imported = await ingestLibraryImages(state, {
      agentId,
      files: [{ bytes: decoded.bytes, mimeType: detected.mimeType, assetType: detected.assetType, fileName: item.name, path: item.name }],
      accessScope: { mode: "selected_presences", presenceIds: [presence.id] },
      storeBytes: putAssetBytes,
    });
    const asset = imported.assets[0];
    if (!asset || !assetIsEligibleForPresence(state, asset, presence.id)) throw new Error(`${item.name} could not be made available to ${presence.name}.`);
    asset.presenceId = presence.id;
    asset.environment = presence.environment ?? "live";
    asset.visibility = "private-community";
    asset.shareability = "presence-only";
    newAssetIds.push(...imported.newAssetIds);
    attachments.push({ ...item, existingAssetId: asset.id, dataUrl: undefined, mimeType: asset.storage?.mimeType ?? detected.mimeType });
  }
  return { state, attachments, newAssetIds: [...new Set(newAssetIds)] };
}

/** A status question must not be mistaken for a command to start a burst. */
export function isBurstStatusQuestion(content: string) {
  const normalized = content.trim().replace(/[’]/g, "'");
  return Boolean(normalized && burstStatusWords.test(normalized) && /\?/.test(normalized) && burstStatusQuestionWords.test(normalized));
}

function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function assignmentLabel(assignment: OpenPresenceState["assignments"][number]) {
  return assignment.title?.trim() || assignment.instruction.replace(/\s+/g, " ").trim().slice(0, 110);
}

/**
 * Answer factual workspace questions from the durable ledger first. The
 * operator should never have to trust a generic language-model answer for
 * things the product already knows, such as an active watch or a blocked run.
 * Returning undefined keeps ordinary conversation on the Agent's natural
 * language path.
 */
export function operatorWorkspaceStatusReply(source: OpenPresenceState, presenceId: string, content: string) {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  const asksWatch = /\b(?:watchlist|watching|watches|watch|people)\b/.test(normalized)
    && /\b(?:who|what|which|where|show|tell|know|currently|right now|active|status|have)\b/.test(normalized);
  const asksWork = /\b(?:working|work|stuck|blocked|busy|progress|doing|next|schedule|calendar|today|later|after)\b/.test(normalized)
    && /\b(?:what|who|where|when|which|is|are|can|show|tell|next|right now|currently|today|later)\b/.test(normalized);
  if (!asksWatch && !asksWork) return undefined;

  if (asksWatch) {
    const watches = (source.watches ?? []).filter((watch) => watch.presenceId === presenceId && (watch.state ?? "active") === "active");
    if (!watches.length) return "I’m not watching anyone or anything right now. You can ask me to watch a person, topic, or opportunity and I’ll keep it in this Agent’s attention queue.";
    const details = watches.slice(0, 5).map((watch) => {
      const target = watch.target?.handle ? `@${watch.target.handle.replace(/^@/, "")}` : watch.title || watch.query;
      const identity = watch.target?.identityStatus === "verified" ? "identity verified" : "identity not linked yet";
      const observed = watch.observation.observedCount > 0
        ? `${watch.observation.observedCount} observation${watch.observation.observedCount === 1 ? "" : "s"}`
        : "awaiting the first observation";
      return `${target} (${watch.observation.status}, ${identity}, ${observed})`;
    });
    return `Right now I’m watching ${details.join("; ")}. Watching is private attention, not a public action; I’ll bring a worthwhile signal back here before anything else happens.`;
  }

  const assignments = (source.assignments ?? []).filter((assignment) => assignment.presenceId === presenceId && !["completed", "cancelled", "failed", "expired_incomplete"].includes(assignment.status));
  const runs = (source.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId);
  const activeRuns = runs.filter((run) => ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status));
  const blocked = assignments.filter((assignment) => ["blocked", "needs_operator"].includes(assignment.status))
    .map((assignment) => `${assignmentLabel(assignment)}${assignment.work?.blockedReason ? ` (${assignment.work.blockedReason})` : ""}`);
  const asksNow = /\b(?:now|currently|working|doing|busy|progress)\b/.test(normalized);
  const asksNext = /\b(?:next|after|later|schedule|calendar|today)\b/.test(normalized);
  if (activeRuns.length) {
    const current = activeRuns.slice(0, 3).map((run) => {
      const assignment = assignments.find((item) => item.id === run.assignmentId);
      return `${assignment ? assignmentLabel(assignment) : "a responsibility"} (${run.currentStage ?? run.status})`;
    });
    if (asksNow && !asksNext && !/\b(?:stuck|blocked)\b/.test(normalized)) return `I’m working on ${current.join("; ")} right now. ${blocked.length ? `One other responsibility needs attention: ${blocked.join("; ")}.` : "I don’t see a blocked responsibility."}`;
  }
  const upcoming = assignments
    .filter((assignment) => assignment.schedule || assignment.nextDueAt)
    .sort((left, right) => Date.parse(left.nextDueAt ?? "") - Date.parse(right.nextDueAt ?? "") || (left.schedule?.time ?? "99:99").localeCompare(right.schedule?.time ?? "99:99"))
    .slice(0, 4);
  const next = upcoming.map((assignment) => {
    const when = assignment.nextDueAt ? `next at ${localTime(assignment.nextDueAt)}` : assignment.schedule ? `${assignment.schedule.day} at ${assignment.schedule.time}` : "flexible timing";
    const cadence = assignment.recurrence?.kind === "once" ? "one-time" : assignment.recurrence?.label?.toLowerCase() || "recurring";
    return `${assignmentLabel(assignment)} (${cadence}, ${when})`;
  });
  const nowSummary = activeRuns.length
    ? `I’m working on ${activeRuns.slice(0, 3).map((run) => {
      const assignment = assignments.find((item) => item.id === run.assignmentId);
      return `${assignment ? assignmentLabel(assignment) : "a responsibility"} (${run.currentStage ?? run.status})`;
    }).join("; ")} right now.`
    : "Nothing is running right now.";
  const nextSummary = upcoming.length
    ? `Next up: ${next.join("; ")}. One-time responsibilities happen once; recurring responsibilities stay available for their next window.`
    : "There is no timed responsibility next; the remaining work is flexible and waits for its conditions.";
  const blockedSummary = blocked.length
    ? `Stuck check: ${blocked.join("; ")} ${blocked.length === 1 ? "is" : "are"} blocked and needs attention before continuing.`
    : "Stuck check: nothing is marked stuck or blocked right now.";
  if (/\b(?:stuck|blocked)\b/.test(normalized) || (asksNow && asksNext)) return `${nowSummary} ${nextSummary} ${blockedSummary}`;
  if (asksNext) return `${nowSummary} ${nextSummary}`;
  return `${nowSummary} ${blockedSummary}`;
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
    ?? (!threadId ? state.operatorConversations?.find((item) => item.presenceId === presenceId && item.status !== "archived" && (item.title === "Main" || item.title === "Main thread" || !item.threadId)) : undefined);
  if (existing) return existing;
  const timestamp = now();
  // The implicit Chat route uses the Presence-scoped fallback thread when an
  // older workspace has not yet materialized its Main conversation. Keep that
  // boundary stable: the first message must never become the conversation
  // title (or accidentally turn Chat into a named work surface).
  const isImplicitMainThread = !threadId || threadId === `thread:${presenceId}`;
  const created: OperatorConversation = { id: `operator_conversation_${randomUUID()}`, agentId: state.agent?.id ?? "", presenceId, threadId: threadId ?? `thread:${presenceId}`, scope: { kind: "presence", presenceId }, status: "active", title: isImplicitMainThread ? "Main" : "New conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] };
  state.operatorConversations = [created, ...(state.operatorConversations ?? [])];
  return created;
}

/** Record a normal private turn without creating an attention request. */
export function recordOperatorConversationMessage(source: OpenPresenceState, input: { presenceId: string; threadId?: string; content: string; choices?: Array<{ label: string; content: string }>; reaction?: import("./types").OperatorChatReaction; attachments?: PresenceChatAttachment[]; role?: "operator" | "presence" | "system"; replyToMessageId?: string; clientRequestId?: string; assignmentId?: string }) {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  if (!presence) throw new Error("That Presence is not available.");
  const conversation = conversationFor(state, input.presenceId, input.threadId);
  if (input.role !== "presence" && input.clientRequestId) {
    const existing = conversation.messages.find((message) => message.role === "operator" && message.clientRequestId === input.clientRequestId);
    if (existing) return state;
  }
  const timestamp = now();
  const sandboxSession = state.playgroundSessions
    .filter((session) => session.presenceId === presence.id && session.status === "active")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  conversation.messages.push({
    id: `${input.role === "presence" ? "presence" : "operator"}_message_${randomUUID()}`,
    role: input.role ?? "operator",
    replyToMessageId: input.replyToMessageId,
    content: input.content.trim(),
    choices: input.role === "presence" ? input.choices : undefined,
    reaction: input.role === "presence" ? input.reaction : undefined,
    attachments: input.role === "presence" ? input.attachments : undefined,
    timestamp,
    causalTime: sandboxSession ? { clock: "sandbox", at: sandboxSession.virtualNow, sessionId: sandboxSession.id } : { clock: "wall", at: timestamp },
    clientRequestId: input.role === "presence" ? undefined : input.clientRequestId,
    assignmentId: input.assignmentId,
  });
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

export function createOperatorNudge(source: OpenPresenceState, input: { presenceId: string; threadId?: string; content: string; attachments?: SandboxAssetInput[]; clientRequestId?: string; privateConversation?: boolean; assignmentId?: string }) {
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
  const attachments: PresenceChatAttachment[] = (input.attachments ?? []).map((item) => {
    const existingAsset = item.existingAssetId ? state.assets.find((asset) => asset.id === item.existingAssetId) : undefined;
    if (item.existingAssetId && (!existingAsset || existingAsset.archivedAt || !["ready", "queued", "processing"].includes(existingAsset.status) || existingAsset.environment && existingAsset.environment !== (presence.environment ?? "live") || !assetIsEligibleForPresence(state, existingAsset, presence.id))) {
      throw new Error("That media is no longer available to this Presence.");
    }
    const effective = existingAsset ? effectiveAssetObservation(state, existingAsset) : undefined;
    const latestPerception = existingAsset
      ? [...(state.perceptions ?? [])]
        .filter((perception) => perception.assetId === existingAsset.id
          && perception.agentId === existingAsset.agentId
          && !perception.socialObjectId
          && (!perception.scope || perception.scope === "library")
          && perception.sourceAssetVersion === (existingAsset.checksum ?? existingAsset.storage?.exactHash ?? existingAsset.updatedAt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
      : undefined;
    const perceptionResult = existingAsset
      ? latestPerception?.result ?? (effective?.observation
        ? {
            observation: effective.observation,
            interpretation: effective.likelyMeaning,
            uncertainty: (effective.uncertainty as PerceptionUncertainty | undefined) ?? "insufficient",
          }
        : createUninterpretedPerception(existingAsset))
      : undefined;
    const perception = perceptionResult ? {
      observation: perceptionResult.observation,
      interpretation: perceptionResult.interpretation,
      uncertainty: perceptionResult.uncertainty,
      missingContext: perceptionResult.missingContext,
      providerId: latestPerception?.providerId,
    } : undefined;
    return {
      id: `operator_attachment_${randomUUID()}`,
      existingAssetId: item.existingAssetId,
      name: item.name,
      kind: item.kind,
      mimeType: item.mimeType ?? existingAsset?.storage?.mimeType ?? existingAsset?.mimeType,
      // Keep inline previews usable while avoiding a second copy of assets
      // backed by the durable library store.
      dataUrl: existingAsset?.dataUrl ?? item.dataUrl,
      sourceUrl: existingAsset?.provenance.sourceUrl ?? item.sourceUrl,
      perception,
    };
  });
  conversation.messages.push({ id: messageId, role: "operator", content: input.content.trim(), timestamp, nudgeId, attachments, clientRequestId: input.clientRequestId, assignmentId: input.assignmentId });
  if (presence.status === "paused" && !input.privateConversation) {
    conversation.messages.push({ id: `operator_system_${randomUUID()}`, role: "system", content: `${presence.name} is paused. Your note is saved and will be considered after you wake this Presence.`, timestamp, nudgeId });
  }
  if (conversation.title === "New conversation") conversation.title = input.content.replace(/\s+/g, " ").slice(0, 52) + (input.content.length > 52 ? "…" : "");
  conversation.updatedAt = timestamp;
  const nudge: OperatorNudge = {
    id: nudgeId,
    privateConversation: input.privateConversation,
    agentId: state.agent?.id ?? "",
    presenceId: input.presenceId,
    conversationId: conversation.id,
    messageId,
    content: input.content.trim(),
    status: presence.status === "paused" && !input.privateConversation ? "held_paused" : "acknowledged",
    sourceUrls: [...new Set([...urlsIn(input.content), ...attachments.flatMap((item) => item.sourceUrl ? [item.sourceUrl] : [])])],
    attachmentIds: attachments.map((item) => item.id),
    createdAt: timestamp,
    updatedAt: timestamp,
    attentionEpisodeIds: [],
    acknowledgedAt: presence.status === "paused" && !input.privateConversation ? undefined : timestamp,
    clientRequestId: input.clientRequestId,
    assignmentId: input.assignmentId,
  };
  state.operatorNudges = [nudge, ...(state.operatorNudges ?? [])];
  return { state, nudge, duplicate: false as const };
}

export function startQueuedNudge(source: OpenPresenceState, presenceId: string, episode: AttentionEpisode) {
  const state = clone(source);
  const nudge = [...(state.operatorNudges ?? [])].reverse().find((item) => !item.privateConversation && item.presenceId === presenceId && ["queued", "acknowledged"].includes(item.status));
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


/** Link an existing private turn to responsibility without duplicating input. */
export function linkOperatorChatAssignment(state: OpenPresenceState, conversationId: string, messageId: string, assignmentId: string) {
  const conversation = state.operatorConversations?.find((item) => item.id === conversationId);
  const message = conversation?.messages.find((item) => item.id === messageId && item.role === "operator");
  const assignment = state.assignments.find((item) => item.id === assignmentId && item.presenceId === conversation?.presenceId);
  if (!conversation || !message || !assignment) throw new Error("The Chat responsibility could not be linked to its operator turn.");
  // The operator authored the request, but the Agent authored and persisted
  // the resulting responsibility. Keep that distinction durable so Tasks can
  // show who planned the work without inferring from its prose.
  assignment.createdBy = "agent";
  let nudge = message.nudgeId ? state.operatorNudges?.find((item) => item.id === message.nudgeId) : undefined;
  if (!nudge) {
    nudge = { id: `operator_nudge_${randomUUID()}`, privateConversation: true, agentId: conversation.agentId, presenceId: conversation.presenceId, conversationId: conversation.id, messageId: message.id, content: message.content, status: "assignment_created", sourceUrls: urlsIn(message.content), attachmentIds: message.attachments?.map((item) => item.id) ?? [], createdAt: message.timestamp, updatedAt: now(), attentionEpisodeIds: [], clientRequestId: message.clientRequestId };
    state.operatorNudges = [nudge, ...(state.operatorNudges ?? [])];
    message.nudgeId = nudge.id;
  }
  nudge.assignmentId = assignment.id;
  nudge.status = "assignment_created";
  nudge.updatedAt = now();
  const thread = state.operatorThreads?.find((item) => item.communicationThreadId === conversation.id);
  if (thread) thread.assignmentIds = [...new Set([...thread.assignmentIds, assignment.id])];
  return state;
}
