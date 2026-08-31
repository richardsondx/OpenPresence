import type { OpenPresenceState } from "./types";
import { browserWorkspaceProjection } from "./state-browser-projection";

const compactText = (value: string | undefined, limit = 280) => {
  if (!value || value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

/**
 * Build the Growth read model without sending unrelated workspace history to
 * the browser. Growth needs complete selected-Presence evidence, but it does
 * not need the asset, exploration, recovery-attempt, or provider histories
 * that make a generic workspace projection expensive to parse.
 *
 * This is a read-model boundary only: durable records remain in SQLite and
 * server-side cognition continues to use the complete state.
 */
export function growthBrowserProjection(state: OpenPresenceState, presenceId?: string): OpenPresenceState {
  const projection = browserWorkspaceProjection(state);
  const selectedPresenceId = presenceId ?? state.presence?.id ?? state.activePresenceId;
  const scoped = <T extends { presenceId?: string }>(items: T[] | undefined) =>
    (items ?? []).filter((item) => !selectedPresenceId || item.presenceId === selectedPresenceId);

  projection.responseProjection = "growth";

  // Growth totals must remain complete for the selected Presence. Baseline
  // comparisons are Activity detail, not part of this screen, and can be
  // recomputed from the durable metric history when that detail is opened.
  projection.audienceSnapshots = scoped(state.audienceSnapshots) as never;
  projection.publicationMetricSnapshots = scoped(state.publicationMetricSnapshots).map((snapshot) => {
    const compact = { ...snapshot };
    delete compact.baseline;
    return compact;
  }) as never;

  // Keep the small, truth-critical Mirror shape used by publication evidence
  // and derivePublicHistory. In particular, visibility and action lineage must
  // survive projection or Growth can undercount verified public activity.
  projection.mirrorObjects = scoped(state.mirrorObjects).map((object) => ({
    id: object.id,
    presenceId: object.presenceId,
    channelId: object.channelId,
    externalRef: object.externalRef,
    parentExternalRef: object.parentExternalRef,
    referencedExternalRefs: object.referencedExternalRefs,
    objectType: object.objectType,
    author: object.author
      ? { displayName: object.author.displayName, handle: object.author.handle, avatarUrl: object.author.avatarUrl }
      : undefined,
    content: object.content?.text ? { text: compactText(object.content.text) } : undefined,
    occurredAt: object.occurredAt,
    observedAt: object.observedAt,
    visibility: object.visibility,
    shareability: object.shareability,
    originExecutionId: object.originExecutionId,
    actorPresenceId: object.actorPresenceId,
    archived: object.archived,
    environment: object.environment,
  })) as never;

  projection.assignments = scoped(state.assignments).map((assignment) => ({
    id: assignment.id,
    presenceId: assignment.presenceId,
    status: assignment.status,
    audienceObjective: assignment.audienceObjective,
    successEvidence: assignment.successEvidence,
    plan: assignment.plan
      ? {
        publishingApproach: assignment.plan.publishingApproach?.slice(0, 3),
        discoveryDirections: assignment.plan.discoveryDirections?.slice(0, 3),
        relationshipFocus: assignment.plan.relationshipFocus?.slice(0, 3),
        nextWeeklyReviewAt: assignment.plan.nextWeeklyReviewAt,
        nextStrategicReviewAt: assignment.plan.nextStrategicReviewAt,
      }
      : undefined,
  })) as never;
  projection.growthReviews = scoped(state.growthReviews).map((review) => ({
    id: review.id,
    assignmentId: review.assignmentId,
    presenceId: review.presenceId,
    kind: review.kind,
    summary: review.summary,
    working: review.working.slice(0, 8),
    uncertain: review.uncertain.slice(0, 8),
    weak: review.weak.slice(0, 8),
    changedPlan: review.changedPlan,
    strategyChanged: review.strategyChanged,
    evidenceIds: review.evidenceIds,
    createdAt: review.createdAt,
    reviewSource: review.reviewSource,
  })) as never;
  projection.growthEvidenceSnapshots = scoped(state.growthEvidenceSnapshots) as never;

  // Growth derives a small set of verified counts in the browser. Preserve
  // only the fields those derivations can actually read instead of shipping
  // complete execution, decision, outcome, and compatibility-history records
  // inherited from the generic browser projection.
  projection.executions = scoped(state.executions)
    .map((execution) => ({
      id: execution.id,
      socialIntentId: execution.socialIntentId,
      presenceId: execution.presenceId,
      affordance: execution.affordance,
      status: execution.status,
      target: execution.target,
      externalRef: execution.externalRef,
      publication: execution.publication
        ? { id: execution.publication.id, origin: execution.publication.origin }
        : undefined,
      environment: execution.environment,
      createdAt: execution.createdAt,
    })) as never;
  projection.socialDecisions = scoped(state.socialDecisions)
    .map((decision) => ({ id: decision.id, presenceId: decision.presenceId, createdAt: decision.createdAt })) as never;
  projection.outcomes = scoped(state.outcomes)
    .map((outcome) => ({
      id: outcome.id,
      executionId: outcome.executionId,
      presenceId: outcome.presenceId,
      status: outcome.status,
      metrics: outcome.metrics,
      environment: outcome.environment,
      observedAt: outcome.observedAt,
    })) as never;
  projection.changeSets = scoped(state.changeSets)
    .map((changeSet) => ({
      id: changeSet.id,
      presenceId: changeSet.presenceId,
      createdAt: changeSet.createdAt,
      operations: changeSet.operations
        .filter((operation) => operation.path === "agentFiles.GROWTH" && typeof operation.after === "string")
        .map((operation) => ({ path: operation.path, after: operation.after })),
    })) as never;
  projection.events = (state.events ?? [])
    .filter((event) => !selectedPresenceId || event.presenceId === selectedPresenceId)
    .map((event) => ({ id: event.id, presenceId: event.presenceId, title: event.title, time: event.time })) as never;
  projection.presences = state.presences.filter((item) => !selectedPresenceId || item.id === selectedPresenceId) as never;

  const selectedPersonIds = new Set(
    (state.personIdentities ?? [])
      .filter((identity) => identity.sourcePresenceId === selectedPresenceId)
      .map((identity) => identity.personId),
  );
  projection.personIdentities = (state.personIdentities ?? [])
    .filter((identity) => identity.sourcePresenceId === selectedPresenceId)
    .map((identity) => ({ id: identity.id, personId: identity.personId, sourcePresenceId: identity.sourcePresenceId, createdAt: identity.createdAt })) as never;
  projection.relationships = (state.relationships ?? [])
    .filter((relationship) => selectedPersonIds.has(relationship.personId))
    .map((relationship) => ({ id: relationship.id, personId: relationship.personId, state: relationship.state })) as never;
  projection.people = (state.people ?? [])
    .filter((person) => selectedPersonIds.has(person.id))
    .map((person) => ({ id: person.id, memoryState: person.memoryState })) as never;

  projection.nativeConnections = (state.nativeConnections ?? []).filter((connection) => !selectedPresenceId || connection.presenceId === selectedPresenceId) as never;
  projection.bridges = (state.bridges ?? []).filter((bridge) => !selectedPresenceId || bridge.presenceId === selectedPresenceId) as never;
  projection.recoveryIncidents = (state.recoveryIncidents ?? []).filter((incident) => !incident.presenceId || !selectedPresenceId || incident.presenceId === selectedPresenceId).map((incident) => ({
    id: incident.id,
    presenceId: incident.presenceId,
    state: incident.state,
    operatorActionRequired: incident.operatorActionRequired,
    resolvedAt: incident.resolvedAt,
    lastObservedAt: incident.lastObservedAt,
  })) as never;

  // These collections are not read by Growth, and retaining them here only
  // increases browser parse, allocation, and garbage-collection pressure.
  for (const key of [
    "assets", "assetUsages", "assetResearchSessions", "assetCollections", "assetCollectionMemberships",
    "assetMetadataEdits", "assetProcessingJobs", "resourceUsageEvents", "sandboxActors", "relationshipFacts",
    "relationshipOpenLoops", "conversationEpisodes", "explorationSessions", "explorationFindings", "networkSearches",
    "networkIntroductions", "recoveryAttempts", "publications", "actions", "operationalRuns", "scheduledWakes",
    "watchSignals", "operatorConversations", "agentWorkspaces", "attentionEpisodes", "socialIntents", "files",
  ] as const) {
    (projection as unknown as Record<string, unknown>)[key] = [];
  }

  return projection;
}
