import type { OpenPresenceState } from "./types";

type Timestamped = object;

const latestTimestamp = (item: Timestamped) =>
  ["updatedAt", "time", "occurredAt", "observedAt", "createdAt", "publishedAt", "capturedAt"]
    .map((key) => {
      const value = (item as Record<string, unknown>)[key];
      return typeof value === "string" ? value : "";
    })
    .find(Boolean) ?? "";

function boundedRecent<T extends Timestamped>(items: T[] | undefined, limit: number, keep?: (item: T) => boolean) {
  const source = items ?? [];
  const pinned = keep
    ? source.filter(keep).sort((left, right) => latestTimestamp(right).localeCompare(latestTimestamp(left))).slice(0, limit)
    : [];
  const recent = source
    .filter((item) => !keep?.(item))
    .sort((left, right) => latestTimestamp(right).localeCompare(latestTimestamp(left)))
    .slice(0, Math.max(0, limit - pinned.length));
  return [...pinned, ...recent];
}

/**
 * Bound the browser's full-workspace read without changing durable state.
 *
 * Activity and Chat already have smaller projections. Other views still need
 * configuration and cross-collection context, but they do not need thousands
 * of historical mirror, metric, usage, episode, or event records on every
 * navigation. Keep active records and objects referenced by current work so
 * the read model remains truthful while old history stays server-side.
 */
export function browserWorkspaceProjection(state: OpenPresenceState): OpenPresenceState {
  const projection = {
    ...state,
    responseProjection: "full" as const,
    agentWorkspaces: [],
    mirrorEvents: [],
  } as OpenPresenceState;

  const activeRun = (run: NonNullable<OpenPresenceState["operationalRuns"]>[number]) =>
    ["queued", "running", "recovering", "delivery_uncertain", "reconciling", "blocked", "needs_operator"].includes(run.state);
  const activeEpisode = (episode: NonNullable<OpenPresenceState["attentionEpisodes"]>[number]) =>
    ["running", "waiting"].includes(episode.status);
  const inFlightExecution = (execution: OpenPresenceState["executions"][number]) =>
    ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"].includes(execution.status);

  projection.events = boundedRecent(state.events, 500) as never;
  projection.attentionEpisodes = boundedRecent(state.attentionEpisodes, 100, activeEpisode) as never;
  projection.operationalRuns = boundedRecent(state.operationalRuns, 100, activeRun) as never;
  projection.executions = boundedRecent(state.executions, 120, inFlightExecution) as never;
  projection.publicationMetricSnapshots = boundedRecent(state.publicationMetricSnapshots, 500) as never;
  projection.resourceUsageEvents = boundedRecent(state.resourceUsageEvents, 500) as never;
  projection.audienceSnapshots = boundedRecent(state.audienceSnapshots, 300) as never;
  projection.conversationEpisodes = boundedRecent(state.conversationEpisodes, 150) as never;
  projection.recoveryAttempts = boundedRecent(state.recoveryAttempts, 150) as never;
  projection.recoveryIncidents = boundedRecent(state.recoveryIncidents, 150) as never;

  // These collections are durable history, not configuration. A full browser
  // navigation used to carry every old decision, intent, action, publication,
  // and outcome even though the Live and Chat views have their own projections.
  // Keep active work and records linked to the retained execution window, then
  // bound the rest. This reduces browser parse/GC pressure without deleting
  // history or weakening server-side cognition and reconciliation.
  const retainedExecutionIds = new Set(projection.executions.map((execution) => execution.id));
  const retainedIntentIds = new Set(
    projection.executions.map((execution) => execution.socialIntentId),
  );
  const currentIntent = (intent: OpenPresenceState["socialIntents"][number]) =>
    intent.state === "active" || retainedIntentIds.has(intent.id);
  projection.socialIntents = boundedRecent(state.socialIntents, 240, currentIntent) as never;
  const retainedProjectionIntentIds = new Set(projection.socialIntents.map((intent) => intent.id));
  projection.socialDecisions = boundedRecent(
    state.socialDecisions,
    240,
    (decision) => Boolean(decision.socialIntentId && retainedProjectionIntentIds.has(decision.socialIntentId)),
  ) as never;
  projection.actions = boundedRecent(
    state.actions,
    240,
    (action) => Boolean(
      (action.executionId && retainedExecutionIds.has(action.executionId))
      || (action.socialIntentId && retainedProjectionIntentIds.has(action.socialIntentId))
      || ["queued", "review"].includes(action.status),
    ),
  ) as never;
  projection.outcomes = boundedRecent(
    state.outcomes,
    180,
    (outcome) => Boolean(outcome.executionId && retainedExecutionIds.has(outcome.executionId)),
  ) as never;
  const retainedPublicationIds = new Set(
    projection.socialIntents.map((intent) => intent.publicationId).filter((id): id is string => Boolean(id)),
  );
  projection.publications = boundedRecent(
    state.publications,
    180,
    (publication) => retainedPublicationIds.has(publication.id),
  ) as never;

  // Preserve objects that current assignments, executions, publications, or
  // operator directives point at even when those objects are older than the
  // recent browser window.
  const targetIds = new Set<string>();
  for (const assignment of state.assignments) {
    if (assignment.target?.mirrorObjectId) targetIds.add(assignment.target.mirrorObjectId);
  }
  for (const execution of state.executions) {
    if (execution.target?.id) targetIds.add(execution.target.id);
  }
  for (const intent of state.socialIntents) {
    if (intent.target?.id) targetIds.add(intent.target.id);
  }
  for (const directive of state.operatorDirectives) {
    if (directive.target?.id) targetIds.add(directive.target.id);
  }
  const targetMirrors = boundedRecent(
    state.mirrorObjects.filter((object) => targetIds.has(object.id) || targetIds.has(object.externalRef.id)),
    600,
  );
  const recentMirrors = boundedRecent(
    state.mirrorObjects.filter((object) => !targetIds.has(object.id) && !targetIds.has(object.externalRef.id)),
    Math.max(0, 600 - targetMirrors.length),
  );
  projection.mirrorObjects = [...targetMirrors, ...recentMirrors] as never;

  return projection;
}
