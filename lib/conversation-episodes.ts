import type { ConversationDisposition, ConversationEpisode, ConversationEpisodeStatus, MirrorObject, OpenPresenceState, PresenceEnvironment } from "./types";

const episodeId = () => `conversation-episode:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const nowIso = () => new Date().toISOString();
const refKey = (ref?: { type: string; id: string }) => ref ? `${ref.type}:${ref.id}` : undefined;

function scoped(object: MirrorObject, presenceId: string, environment: PresenceEnvironment, sessionId?: string) {
  return object.presenceId === presenceId
    && object.environment === environment
    && (environment !== "sandbox" || object.sessionId === sessionId);
}

function objectForEpisode(state: OpenPresenceState, episode: ConversationEpisode, mirrorObjectId?: string) {
  return mirrorObjectId ? state.mirrorObjects.find((item) => item.id === mirrorObjectId) : undefined;
}

function episodeContainsObject(state: OpenPresenceState, episode: ConversationEpisode, object: MirrorObject) {
  if (!scoped(object, episode.presenceId, episode.environment, object.sessionId)) return false;
  const lastExternal = objectForEpisode(state, episode, episode.lastExternalObjectId);
  const lastAgent = objectForEpisode(state, episode, episode.lastAgentObjectId);
  const rootObject = objectForEpisode(state, episode, episode.rootMirrorObjectId);
  const anchorObject = objectForEpisode(state, episode, episode.branchAnchorMirrorObjectId);
  const parent = refKey(object.parentExternalRef);
  return parent === refKey(lastExternal?.externalRef)
    || parent === refKey(lastAgent?.externalRef)
    || parent === refKey(rootObject?.externalRef)
    || parent === refKey(anchorObject?.externalRef)
    || refKey(object.externalRef) === refKey(lastExternal?.externalRef)
    || refKey(object.externalRef) === refKey(lastAgent?.externalRef)
    || refKey(object.externalRef) === refKey(rootObject?.externalRef)
    || (object.conversationExternalRef && object.conversationExternalRef === lastExternal?.conversationExternalRef && Boolean(object.rootExternalRef?.id === lastExternal?.rootExternalRef?.id));
}

function likelyGenericAcknowledgement(object: MirrorObject) {
  const text = object.content?.text?.trim().toLowerCase().replace(/[.!?,]+$/g, "") ?? "";
  return ["thanks", "thank you", "exactly", "agreed", "good point", "interesting", "absolutely", "for sure", "yep", "yes", "likewise", "appreciate it"].includes(text);
}

export function conversationDispositionForAction(action: string, requested?: ConversationDisposition): ConversationDisposition {
  if (requested) return requested;
  if (action === "no_op") return "close_silently";
  if (["like", "reaction", "react"].includes(action)) return "react_only";
  return "continue";
}

export function findConversationEpisode(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  return state.conversationEpisodes
    .filter((episode) => episode.presenceId === presenceId && episode.environment === (object.environment ?? "live"))
    .find((episode) => episodeContainsObject(state, episode, object));
}

export function createConversationEpisode(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId): ConversationEpisode {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const timestamp = nowIso();
  const isAgent = object.actorPresenceId === presenceId;
  const parentObject = object.parentExternalRef
    ? state.mirrorObjects.find((item) => item.externalRef.type === object.parentExternalRef?.type && item.externalRef.id === object.parentExternalRef?.id)
    : undefined;
  const rootObject = parentObject ?? object;
  const participantActorIds = [object.author?.externalRef?.id, parentObject?.author?.externalRef?.id].filter((id): id is string => Boolean(id));
  return {
    id: episodeId(),
    agentId: state.agent?.id ?? "unknown-agent",
    presenceId,
    environment: object.environment ?? presence?.environment ?? "live",
    channelId: object.channelId,
    surface: object.objectType,
    privacyScope: object.visibility,
    rootMirrorObjectId: rootObject.id,
    branchAnchorMirrorObjectId: object.id,
    participantActorIds: [...new Set(participantActorIds)],
    linkedEpisodeIds: [],
    status: "active",
    lastExternalObjectId: isAgent ? parentObject?.id : object.id,
    lastAgentObjectId: isAgent ? object.id : undefined,
    agentTurnCount: isAgent ? 1 : 0,
    externalTurnCount: isAgent ? (parentObject ? 1 : 0) : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Lazily derives one Presence-centric interaction trajectory from Mirror evidence when conversational lineage exists. */
export function ensureConversationEpisode(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  const existing = findConversationEpisode(state, object, presenceId);
  if (existing) return existing;
  const isConversational = (
    object.objectType === "reply" ||
    (Boolean(object.parentExternalRef) && !["quote", "repost", "like", "follow", "x.quote", "x.repost", "x.like", "x.follow"].includes(object.objectType)) ||
    Boolean(object.conversationExternalRef && object.conversationExternalRef !== object.externalRef.id && object.conversationExternalRef !== object.id)
  );
  if (!isConversational) return undefined;
  const episode = createConversationEpisode(state, object, presenceId);
  state.conversationEpisodes.unshift(episode);
  return episode;
}

export function conversationEpisodeForObject(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  return findConversationEpisode(state, object, presenceId) ?? ensureConversationEpisode(state, object, presenceId);
}

export function updateConversationEpisodeFromMirror(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  if (["quote", "repost", "like", "follow", "x.quote", "x.repost", "x.like", "x.follow"].includes(object.objectType)) {
    return undefined;
  }
  const isExisting = Boolean(findConversationEpisode(state, object, presenceId));
  const episode = conversationEpisodeForObject(state, object, presenceId);
  if (!episode) return undefined;
  const isAgent = object.actorPresenceId === presenceId;
  const actorId = object.author?.externalRef?.id;
  episode.status = episode.status === "closed" && !isAgent ? episode.status : episode.status;
  episode.lastExternalObjectId = isAgent ? episode.lastExternalObjectId : object.id;
  episode.lastAgentObjectId = isAgent ? object.id : episode.lastAgentObjectId;
  if (isExisting) {
    episode.agentTurnCount += isAgent ? 1 : 0;
    episode.externalTurnCount += isAgent ? 0 : 1;
  }
  if (actorId && !episode.participantActorIds.includes(actorId)) episode.participantActorIds.push(actorId);
  episode.updatedAt = nowIso();
  return episode;
}

export function loopRiskForEpisode(state: OpenPresenceState, episode: ConversationEpisode, object: MirrorObject, now = Date.now()) {
  const recent = [episode.lastExternalObjectId, episode.lastAgentObjectId]
    .map((id) => state.mirrorObjects.find((item) => item.id === id))
    .filter((item): item is MirrorObject => Boolean(item));
  const latest = recent.sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt))[0];
  const latestAt = latest ? new Date(latest.occurredAt ?? latest.observedAt).getTime() : NaN;
  const objectAt = new Date(object.occurredAt ?? object.observedAt).getTime();
  const rapid = Number.isFinite(latestAt) && Number.isFinite(objectAt) && Math.abs(objectAt - latestAt) <= 45 * 60_000 && now - objectAt <= 45 * 60_000;
  // Include the candidate object in the volume gate. The fifth rapid turn is
  // the point at which the planner must reconsider, not the sixth.
  return rapid && episode.agentTurnCount >= 2 && episode.externalTurnCount >= 2 && episode.agentTurnCount + episode.externalTurnCount + 1 >= 5;
}

export function shouldEvaluateConversationObject(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId, now = Date.now()) {
  const episode = findConversationEpisode(state, object, presenceId);
  if (!episode) return { eligible: true, episode: undefined, reason: undefined };
  const nextEligibleAt = episode.nextEligibleAt ? new Date(episode.nextEligibleAt).getTime() : 0;
  const cooling = episode.status === "cooling" && nextEligibleAt > now;
  if ((episode.status === "closed" || cooling) && likelyGenericAcknowledgement(object)) {
    return { eligible: false, episode, reason: episode.status === "closed" ? "The closed episode received only a generic acknowledgment." : "The episode is cooling and the new object did not add substantive context." };
  }
  if (cooling) return { eligible: false, episode, reason: episode.eligibilityReason ?? "The episode is cooling after a low-value reciprocal sequence." };
  return { eligible: true, episode, reason: undefined };
}

export function applyConversationDisposition(state: OpenPresenceState, episodeId: string, disposition: ConversationDisposition, reason?: string, intentId?: string, now = nowIso()) {
  const episode = state.conversationEpisodes.find((item) => item.id === episodeId);
  if (!episode) return;
  episode.lastDisposition = disposition;
  episode.lastDispositionReason = reason?.trim().slice(0, 500);
  episode.updatedAt = now;
  if (disposition === "continue") {
    episode.status = "active";
    episode.nextEligibleAt = undefined;
    episode.eligibilityReason = undefined;
  } else if (disposition === "defer") {
    episode.status = "cooling";
    episode.nextEligibleAt = new Date(new Date(now).getTime() + 45 * 60_000).toISOString();
    episode.eligibilityReason = reason?.trim() || "The Agent deferred another turn because it was not useful right now.";
  } else if (disposition === "close_with_reply" || (disposition === "react_only" && intentId)) {
    episode.status = "closing";
    episode.closingSocialIntentId = intentId;
  } else {
    episode.status = "closed";
    episode.closedAt = now;
    episode.closureReason = reason?.trim() || "No meaningful unresolved work remained in the conversation.";
  }
}

export function settleConversationClosure(state: OpenPresenceState, episodeId: string, outcome: "verified" | "failed", reason?: string) {
  const episode = state.conversationEpisodes.find((item) => item.id === episodeId);
  if (!episode) return;
  episode.updatedAt = nowIso();
  if (outcome === "verified") {
    // A verified reply is not automatically the end of an episode. The
    // planner's explicit disposition distinguishes “continue” from a final
    // close, so preserve an active episode when another turn may still add
    // value. Legacy replies without a disposition retain the old close-on-
    // verification behavior.
    if (episode.lastDisposition === "continue") {
      episode.status = "active";
      episode.closedAt = undefined;
      episode.closureReason = undefined;
      episode.nextEligibleAt = undefined;
      episode.eligibilityReason = undefined;
      return;
    }
    episode.status = "closed";
    episode.closedAt = episode.updatedAt;
    episode.closureReason = reason?.trim() || "The closing social act was verified in the Social Mirror.";
    return;
  }
  episode.status = "cooling";
  episode.nextEligibleAt = new Date(Date.now() + 15 * 60_000).toISOString();
  episode.eligibilityReason = reason?.trim() || "The closing social act failed; no external closure was claimed.";
}

export function markLoopRisk(state: OpenPresenceState, episodeId: string, reason = "Several rapid reciprocal turns require episode-level reconsideration.") {
  const episode = state.conversationEpisodes.find((item) => item.id === episodeId);
  if (!episode) return;
  episode.loopRisk = { detectedAt: nowIso(), reason };
  episode.updatedAt = episode.loopRisk.detectedAt;
}

export function conversationStatusLabel(status: ConversationEpisodeStatus) {
  return status === "closed" ? "Closed" : status === "closing" ? "Closing" : status === "cooling" ? "Giving it space" : "Active";
}

export function isLikelyGenericAcknowledgement(object: MirrorObject) {
  return likelyGenericAcknowledgement(object);
}
