import type {
  AttentionEpisode,
  AttentionStep,
  AttentionStepKind,
  AttentionEpisodeAction,
  AttentionEpisodeSource,
  AttentionEpisodeStage,
  AttentionEpisodeStatus,
  Execution,
  JsonValue,
  OpenPresenceState,
  PresenceEnvironment,
} from "./types";

const pendingExecutionStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
const terminalFailureStatuses = new Set(["failed", "blocked", "expired", "cancelled", "verification-closed"]);
const liveAttentionRunStates = new Set(["queued", "running", "waiting", "recovering", "delivery_uncertain", "reconciling"]);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const episodeId = () => `attention_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const isoNow = () => new Date().toISOString();

function actionName(value?: string): AttentionEpisodeAction | undefined {
  const action = value?.replace(/^x\./, "");
  return action && ["like", "follow", "reply", "quote", "repost"].includes(action) ? action as AttentionEpisodeAction : undefined;
}

function linkedByEpisode<T extends { attentionEpisodeId?: string; runId?: string; invocationId?: string }>(items: T[], episode: AttentionEpisode, runIds: Set<string>, invocationIds: Set<string>) {
  return items.filter((item) => item.attentionEpisodeId === episode.id || (item.runId ? runIds.has(item.runId) : false) || (item.invocationId ? invocationIds.has(item.invocationId) : false));
}

export function createAttentionEpisode(
  source: OpenPresenceState,
  input: {
    presenceId: string;
    environment?: PresenceEnvironment;
    source?: AttentionEpisodeSource;
    runId?: string;
    invocationId?: string;
    stage?: AttentionEpisodeStage;
  },
): { state: OpenPresenceState; episode: AttentionEpisode } {
  const state = clone(source);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  const existing = input.runId ? state.attentionEpisodes?.find((item) => item.runIds.includes(input.runId!)) : undefined;
  if (existing) return { state, episode: existing };
  const now = isoNow();
  const episode: AttentionEpisode = {
    id: episodeId(),
    agentId: state.agent?.id ?? "",
    presenceId: input.presenceId,
    channel: presence?.channel ?? "x",
    environment: input.environment ?? presence?.environment ?? "live",
    source: input.source ?? "scheduled",
    status: "running",
    stage: input.stage ?? "looking",
    startedAt: now,
    updatedAt: now,
    runIds: input.runId ? [input.runId] : [],
    mirrorObjectIds: [],
    newMirrorObjectIds: [],
    changedMirrorObjectIds: [],
    socialDecisionIds: [],
    socialIntentIds: [],
    executionIds: [],
    outcomeIds: [],
    fetchedCount: 0,
    newCount: 0,
    changedCount: 0,
    knownCount: 0,
    consideredCount: 0,
    closeAttentionCount: 0,
    noOpCount: 0,
    actionCounts: {},
    verifiedOutcomeCount: 0,
    pendingExecutionCount: 0,
    failedExecutionCount: 0,
    resourceUsage: { channelReads: 0, channelWrites: 0, modelCalls: 0, visionCalls: 0, hydrations: 0, mediaFetches: 0 },
    steps: [{ id: `${now}:queued`, kind: "queued", status: "completed", label: "Attention pass queued", startedAt: now, completedAt: now }, { id: `${now}:observing`, kind: "observing", status: "active", label: "Checking what changed", startedAt: now }],
  };
  state.attentionEpisodes = [episode, ...(state.attentionEpisodes ?? [])].slice(0, 300);
  return { state, episode };
}

export function updateAttentionEpisode(source: OpenPresenceState, id: string, patch: Partial<AttentionEpisode> & { metadata?: Record<string, JsonValue> }) {
  const state = clone(source);
  const current = state.attentionEpisodes?.find((item) => item.id === id);
  if (!current) return state;
  Object.assign(current, patch, { updatedAt: isoNow() });
  if (patch.runIds) current.runIds = [...new Set(patch.runIds)];
  return state;
}

export function recordAttentionStepInPlace(
  state: OpenPresenceState,
  id: string,
  kind: AttentionStepKind,
  input: Pick<AttentionStep, "label"> & Partial<Pick<AttentionStep, "detail" | "current" | "total" | "evidenceRefs" | "status">>,
) {
  const episode = state.attentionEpisodes?.find((item) => item.id === id);
  if (!episode) return state;
  const now = isoNow();
  const steps = episode.steps ?? [];
  for (const step of steps) {
    if (step.status === "active" && step.kind !== kind) {
      step.status = "completed";
      step.completedAt = now;
    }
  }
  const existing = [...steps].reverse().find((step) => step.kind === kind && step.status !== "failed");
  if (existing) {
    Object.assign(existing, input);
    existing.startedAt = existing.startedAt ?? now;
    if (input.status === "completed") existing.completedAt = now;
  } else {
    steps.push({ id: `${id}:${kind}:${steps.length}`, kind, status: input.status ?? "active", label: input.label, detail: input.detail, current: input.current, total: input.total, evidenceRefs: input.evidenceRefs, startedAt: now, completedAt: input.status === "completed" ? now : undefined });
  }
  episode.steps = steps;
  episode.updatedAt = now;
  return state;
}

export function recordAttentionStep(
  source: OpenPresenceState,
  id: string,
  kind: AttentionStepKind,
  input: Pick<AttentionStep, "label"> & Partial<Pick<AttentionStep, "detail" | "current" | "total" | "evidenceRefs" | "status">>,
) {
  return recordAttentionStepInPlace(clone(source), id, kind, input);
}

/** Attach the episode to records created by a stage, preserving forward lineage. */
export function linkAttentionEpisodeRecords(
  source: OpenPresenceState,
  id: string,
  input: { mirrorObjectIds?: string[]; decisionIds?: string[]; intentIds?: string[]; executionIds?: string[]; outcomeIds?: string[]; runIds?: string[] },
) {
  const state = clone(source);
  const episode = state.attentionEpisodes?.find((item) => item.id === id);
  if (!episode) return state;
  const mirrorIds = new Set(input.mirrorObjectIds ?? []);
  const decisionIds = new Set(input.decisionIds ?? []);
  const intentIds = new Set(input.intentIds ?? []);
  const executionIds = new Set(input.executionIds ?? []);
  const outcomeIds = new Set(input.outcomeIds ?? []);
  for (const item of state.mirrorObjects) if (mirrorIds.has(item.id)) item.attentionEpisodeId = id;
  for (const item of state.socialDecisions) if (decisionIds.has(item.id)) item.attentionEpisodeId = id;
  for (const item of state.socialIntents) if (intentIds.has(item.id)) item.attentionEpisodeId = id;
  for (const item of state.executions) if (executionIds.has(item.id)) item.attentionEpisodeId = id;
  for (const item of state.outcomes) if (outcomeIds.has(item.id)) item.attentionEpisodeId = id;
  episode.runIds = [...new Set([...(episode.runIds ?? []), ...(input.runIds ?? [])])];
  episode.mirrorObjectIds = [...new Set([...(episode.mirrorObjectIds ?? []), ...mirrorIds])];
  episode.socialDecisionIds = [...new Set([...(episode.socialDecisionIds ?? []), ...decisionIds])];
  episode.socialIntentIds = [...new Set([...(episode.socialIntentIds ?? []), ...intentIds])];
  episode.executionIds = [...new Set([...(episode.executionIds ?? []), ...executionIds])];
  episode.outcomeIds = [...new Set([...(episode.outcomeIds ?? []), ...outcomeIds])];
  episode.updatedAt = isoNow();
  return state;
}

export function summarizeAttentionEpisode(
  source: OpenPresenceState,
  id: string,
  patch: Partial<AttentionEpisode> = {},
) {
  const state = clone(source);
  const episode = state.attentionEpisodes?.find((item) => item.id === id);
  if (!episode) return state;
  const runs = (state.operationalRuns ?? []).filter((run) => run.attentionEpisodeId === id || episode.runIds.includes(run.id));
  episode.runIds = [...new Set([...episode.runIds, ...runs.map((run) => run.id)])];
  const runIds = new Set(episode.runIds);
  const invocationIds = new Set(runs.flatMap((run) => run.invocationId ? [run.invocationId] : []));
  const decisions = linkedByEpisode(state.socialDecisions, episode, runIds, invocationIds);
  const intents = linkedByEpisode(state.socialIntents, episode, runIds, invocationIds);
  const executions = linkedByEpisode(state.executions, episode, runIds, invocationIds);
  const outcomes = state.outcomes.filter((item) => item.attentionEpisodeId === id || episode.executionIds.includes(item.executionId ?? "") || episode.socialIntentIds.includes(item.socialIntentId));
  const mirrors = state.mirrorObjects.filter((item) => item.attentionEpisodeId === id || episode.mirrorObjectIds.includes(item.id));
  const usage = state.resourceUsageEvents.filter((item) => item.attentionEpisodeId === id || (item.runId ? runIds.has(item.runId) : false) || invocationIds.has(item.invocationId));

  episode.socialDecisionIds = [...new Set([...episode.socialDecisionIds, ...decisions.map((item) => item.id)])];
  episode.socialIntentIds = [...new Set([...episode.socialIntentIds, ...intents.map((item) => item.id)])];
  episode.executionIds = [...new Set([...episode.executionIds, ...executions.map((item) => item.id)])];
  episode.outcomeIds = [...new Set([...episode.outcomeIds, ...outcomes.map((item) => item.id)])];
  episode.mirrorObjectIds = [...new Set([...episode.mirrorObjectIds, ...mirrors.map((item) => item.id)])];
  episode.consideredCount = patch.consideredCount ?? Math.max(episode.consideredCount, new Set(decisions.flatMap((item) => item.focalMirrorObjectIds)).size);
  episode.closeAttentionCount = patch.closeAttentionCount ?? Math.max(episode.closeAttentionCount, mirrors.length);
  episode.noOpCount = decisions.filter((item) => item.decision === "no_op").length;
  episode.actionCounts = {};
  for (const decision of decisions) {
    for (const act of decision.acts?.map((item) => item.decision) ?? [decision.decision]) {
      const action = actionName(act);
      if (action) episode.actionCounts[action] = (episode.actionCounts[action] ?? 0) + 1;
    }
  }
  episode.verifiedOutcomeCount = outcomes.filter((item) => item.status === "succeeded").length;
  episode.pendingExecutionCount = executions.filter((item) => pendingExecutionStatuses.has(item.status)).length;
  episode.failedExecutionCount = executions.filter((item) => terminalFailureStatuses.has(item.status)).length;
  episode.resourceUsage = {
    channelReads: usage.filter((item) => item.category === "channel_read").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    channelWrites: usage.filter((item) => item.category === "channel_write").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    modelCalls: usage.filter((item) => item.category === "model").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    visionCalls: usage.filter((item) => item.category === "vision").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    hydrations: usage.filter((item) => item.category === "hydration").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    mediaFetches: usage.filter((item) => item.category === "media_fetch").reduce((sum, item) => sum + (item.usage.requests ?? 1), 0),
    totalTokens: usage.reduce((sum, item) => sum + (item.usage.totalTokens ?? 0), 0) || undefined,
    estimatedCost: usage.reduce((sum, item) => sum + (item.cost?.amount ?? 0), 0) || undefined,
    currency: usage.find((item) => item.cost?.currency)?.cost?.currency,
  };
  const nextPatch = { ...patch };
  Object.assign(episode, nextPatch);
  episode.updatedAt = isoNow();
  if (episode.status === "succeeded" || episode.status === "failed" || episode.status === "needs_operator") episode.completedAt = episode.completedAt ?? episode.updatedAt;
  // The episode is incrementally updated as decisions become executions and
  // executions become verified outcomes. Recompute the derived summary on
  // every refresh unless a caller supplied an explicit narrative summary;
  // otherwise Activity can permanently display "0 actions selected" after a
  // real action was chosen later in the same episode.
  if (patch.summary === undefined) {
    const actionTotal = Object.values(episode.actionCounts).reduce((sum, value) => sum + (value ?? 0), 0);
    episode.summary = `${episode.fetchedCount} fetched · ${episode.newCount} new · ${episode.consideredCount} considered · ${actionTotal} action${actionTotal === 1 ? "" : "s"} selected · ${episode.verifiedOutcomeCount} verified`;
  }
  return state;
}

export function attentionEpisodeForRun(state: OpenPresenceState, runId: string) {
  return state.attentionEpisodes?.find((episode) => episode.runIds.includes(runId) || (state.operationalRuns ?? []).some((run) => run.id === runId && run.attentionEpisodeId === episode.id));
}

/**
 * Settle an attention episode that outlived every durable worker run.
 *
 * A running episode without a queued/running/waiting run is not recoverable
 * work; leaving it active makes Activity look permanently busy and causes
 * every read model to carry an orphaned transcript. Delivery/verification
 * episodes are deliberately excluded here because their waiting run is the
 * conservative owner of uncertain external state.
 */
export function reconcileOrphanedAttentionEpisodes(source: OpenPresenceState, now = new Date(), staleAfterMs = 120_000) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const liveRuns = (source.operationalRuns ?? []).filter((run) => run.kind === "attention" && liveAttentionRunStates.has(run.state));
  const liveRunIds = new Set(liveRuns.map((run) => run.id));
  const episodeIdsWithLiveRuns = new Set(liveRuns.map((run) => run.attentionEpisodeId).filter((id): id is string => Boolean(id)));
  let repaired = 0;
  source.attentionEpisodes = (source.attentionEpisodes ?? []).map((episode) => {
    if (episode.status !== "running") return episode;
    const hasLiveOwner = episodeIdsWithLiveRuns.has(episode.id) || episode.runIds.some((runId) => liveRunIds.has(runId));
    const updatedMs = new Date(episode.updatedAt).getTime();
    if (hasLiveOwner || !Number.isFinite(updatedMs) || nowMs - updatedMs < staleAfterMs) return episode;
    repaired += 1;
    return {
      ...episode,
      status: "failed" as const,
      stage: "completed" as const,
      completedAt: nowIso,
      updatedAt: nowIso,
      lastError: "The attention worker no longer owns this episode after a process restart or lease expiry.",
      summary: "The attention pass stopped before it could settle; no new public action is inferred from the incomplete record.",
    };
  });
  return repaired;
}

export function executionIsPending(execution: Execution) {
  return pendingExecutionStatuses.has(execution.status);
}
