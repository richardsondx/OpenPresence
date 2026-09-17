import type { OpenPresenceState } from "./types";
import { browserWorkspaceProjection } from "./state-browser-projection";
import { collapseAudienceSnapshots, derivePublicHistory } from "./runtime";
import { growthEvidenceIsInPresenceScope, growthPublicationIsInPresenceScope } from "./growth-scope";
import { deriveGrowthProfile } from "./growth-profile";

const compactText = (value: string | undefined, limit = 280) => {
  if (!value || value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

const GROWTH_CHART_WINDOW_DAYS = 28;
const GROWTH_CHART_POINT_LIMIT = 32;

function boundedHistory<T>(items: T[], limit: number) {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, index) => items[Math.round((index * (items.length - 1)) / (limit - 1))]);
}

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
  const audienceSnapshots = collapseAudienceSnapshots(scoped(state.audienceSnapshots)
    .filter((snapshot) => growthEvidenceIsInPresenceScope(state, selectedPresenceId ?? "", snapshot.observedAt)));
  const publicationSnapshots = scoped(state.publicationMetricSnapshots)
    .filter((snapshot) => growthPublicationIsInPresenceScope(state, selectedPresenceId ?? "", snapshot))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  // The Growth chart has a 28-day control. Keep a bounded, representative
  // history for that window instead of the eight-row evidence preview; the
  // latter made the 7-day and 28-day controls render the same data once a
  // Presence had more than eight observations.
  const chartWindowStart = Date.now() - GROWTH_CHART_WINDOW_DAYS * 86_400_000;
  const chartAudienceSnapshots = audienceSnapshots.filter((snapshot) => new Date(snapshot.observedAt).getTime() >= chartWindowStart);
  const recentAudienceSnapshots = boundedHistory(chartAudienceSnapshots, GROWTH_CHART_POINT_LIMIT);
  const recentPublicationSnapshots = publicationSnapshots.slice(0, 8).map((snapshot) => ({
    id: snapshot.id,
    presenceId: snapshot.presenceId,
    mirrorObjectId: snapshot.mirrorObjectId,
    observedAt: snapshot.observedAt,
    publicationAgeSeconds: snapshot.publicationAgeSeconds,
    impressions: snapshot.impressions,
    likes: snapshot.likes,
    replies: snapshot.replies,
    reposts: snapshot.reposts,
    quotes: snapshot.quotes,
    source: snapshot.source,
    observationStatus: snapshot.observationStatus,
  }));
  const latestReview = scoped(state.growthReviews)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const reviewedEvidenceIds = new Set(latestReview?.evidenceIds ?? []);
  const publicHistory = derivePublicHistory(state, selectedPresenceId ?? undefined, { normalized: true });
  const oneWeekAgo = Date.now() - 7 * 86_400_000;
  const weeklyHistory = publicHistory.filter((item) => new Date(item.occurredAt).getTime() >= oneWeekAgo);
  const scopedOutcomes = (state.outcomes ?? []).filter((outcome) => outcome.presenceId === selectedPresenceId && outcome.status === "succeeded" && outcome.environment !== "sandbox");
  const scopedExecutions = (state.executions ?? []).filter((execution) => execution.presenceId === selectedPresenceId);
  const followExecutionIds = new Set(scopedExecutions.filter((execution) => execution.affordance === "x.follow").map((execution) => execution.id));
  const weeklyFollows = scopedOutcomes.filter((outcome) => Boolean(outcome.executionId && followExecutionIds.has(outcome.executionId)) && new Date(outcome.observedAt).getTime() >= oneWeekAgo).length;
  const scopedPersonIds = new Set((state.personIdentities ?? [])
    .filter((identity) => identity.sourcePresenceId === selectedPresenceId && growthEvidenceIsInPresenceScope(state, selectedPresenceId ?? "", identity.createdAt))
    .map((identity) => identity.personId));
  const scopedRecoveryIncidents = (state.recoveryIncidents ?? []).filter((incident) => !incident.presenceId || incident.presenceId === selectedPresenceId);
  const latestAudience = audienceSnapshots[0];
  const audienceDeltaSince = (days: number) => {
    if (!latestAudience) return undefined;
    const cutoff = new Date(new Date(latestAudience.observedAt).getTime() - days * 86_400_000).getTime();
    const prior = audienceSnapshots.find((snapshot) => new Date(snapshot.observedAt).getTime() <= cutoff);
    return prior ? latestAudience.followers - prior.followers : undefined;
  };
  projection.growthBrowserSummary = {
    presenceId: selectedPresenceId ?? "",
    profile: deriveGrowthProfile(state, selectedPresenceId ?? undefined),
    audience: {
      count: audienceSnapshots.length,
      latest: recentAudienceSnapshots[0],
      recent: recentAudienceSnapshots,
      unchanged: audienceSnapshots.length > 1 && new Set(audienceSnapshots.map((snapshot) => snapshot.followers)).size === 1,
      daily: audienceDeltaSince(1),
      sevenDay: audienceDeltaSince(7),
      twentyEightDay: audienceDeltaSince(28),
    },
    publication: {
      count: publicationSnapshots.length,
      totalReach: publicationSnapshots.reduce((sum, snapshot) => sum + (snapshot.impressions ?? 0), 0),
      totalLikes: publicationSnapshots.reduce((sum, snapshot) => sum + (snapshot.likes ?? 0), 0),
      totalReplies: publicationSnapshots.reduce((sum, snapshot) => sum + (snapshot.replies ?? 0), 0),
      totalReposts: publicationSnapshots.reduce((sum, snapshot) => sum + (snapshot.reposts ?? 0), 0),
      totalQuotes: publicationSnapshots.reduce((sum, snapshot) => sum + (snapshot.quotes ?? 0), 0),
      maxImpressions: publicationSnapshots.reduce<number | undefined>((max, snapshot) => snapshot.impressions === undefined ? max : Math.max(max ?? snapshot.impressions, snapshot.impressions), undefined),
      latest: recentPublicationSnapshots[0],
      recent: recentPublicationSnapshots,
    },
    actions: {
      total: publicHistory.filter((item) => item.environment !== "sandbox").length,
      weekly: {
        posts: weeklyHistory.filter((item) => item.kind === "post").length,
        replies: weeklyHistory.filter((item) => item.kind === "reply" || item.kind === "comment").length,
        quotes: weeklyHistory.filter((item) => item.kind === "quote").length,
        likes: weeklyHistory.filter((item) => item.kind === "like").length,
        follows: weeklyFollows,
      },
    },
    decisionsCount: (state.socialDecisions ?? []).filter((decision) => decision.presenceId === selectedPresenceId).length,
    verifiedOutcomesCount: scopedOutcomes.length,
    activeRelationshipsCount: (state.relationships ?? []).filter((relationship) => relationship.state === "active" && scopedPersonIds.has(relationship.personId)).length,
    engagedPeopleCount: (state.people ?? []).filter((person) => person.memoryState === "active" && scopedPersonIds.has(person.id)).length,
    openIncidentCount: scopedRecoveryIncidents.filter((incident) => incident.operatorActionRequired && incident.state !== "resolved").length,
    recoveriesHandledCount: scopedRecoveryIncidents.filter((incident) => incident.state === "resolved" && growthEvidenceIsInPresenceScope(state, selectedPresenceId ?? "", incident.resolvedAt ?? incident.lastObservedAt)).length,
    review: latestReview ? {
      unreviewedAudienceCount: audienceSnapshots.filter((snapshot) => !reviewedEvidenceIds.has(snapshot.id)).length,
      unreviewedPublicationCount: publicationSnapshots.filter((snapshot) => !reviewedEvidenceIds.has(snapshot.id)).length,
    } : undefined,
  };
  // Keep a recent compatibility window for older browser consumers; the
  // summary above is authoritative for totals and evidence counts.
  projection.audienceSnapshots = recentAudienceSnapshots as never;
  const templateAssignmentIds = new Set(state.assignments.filter(item => item.presenceId === selectedPresenceId && item.strategyTemplateId).map(item => item.id));
  const templateDeliveryRefs = new Set(scoped(state.executions).filter(item => item.status === "succeeded" && item.environment === "live" && item.assignmentId && templateAssignmentIds.has(item.assignmentId) && item.externalRef).map(item => `${item.externalRef!.type}:${item.externalRef!.id}`));
  const templateMirrorIds = new Set(scoped(state.mirrorObjects).filter(item => templateDeliveryRefs.has(`${item.externalRef.type}:${item.externalRef.id}`)).map(item => item.id));
  const templateMetrics = publicationSnapshots.filter((item, index, all) => templateMirrorIds.has(item.mirrorObjectId) && all.findIndex(other => other.mirrorObjectId === item.mirrorObjectId) === index);
  projection.publicationMetricSnapshots = [...recentPublicationSnapshots, ...templateMetrics.filter(item => !recentPublicationSnapshots.some(other => other.id === item.id))] as never;

  // Keep the small, truth-critical Mirror shape used by publication evidence
  // and derivePublicHistory. In particular, visibility and action lineage must
  // survive projection or Growth can undercount verified public activity.
  const recentPublicationMirrorIds = new Set(recentPublicationSnapshots.map((snapshot) => snapshot.mirrorObjectId));
  projection.mirrorObjects = scoped(state.mirrorObjects)
    .filter((object) => recentPublicationMirrorIds.has(object.id))
    .map((object) => ({
    id: object.id,
    presenceId: object.presenceId,
    channelId: object.channelId,
    externalRef: object.externalRef,
    objectType: object.objectType,
    author: object.author
      ? { displayName: object.author.displayName, handle: object.author.handle }
      : undefined,
    content: recentPublicationMirrorIds.has(object.id) && object.content?.text ? { text: compactText(object.content.text) } : undefined,
    occurredAt: object.occurredAt,
    observedAt: object.observedAt,
    visibility: object.visibility,
    originExecutionId: object.originExecutionId,
    actorPresenceId: object.actorPresenceId,
    environment: object.environment,
    })) as never;

  projection.assignments = scoped(state.assignments).map((assignment) => ({
    id: assignment.id,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    presenceId: assignment.presenceId,
    // The shared Agent shell is rendered around Analytics too. Keep the
    // compact identity/status fields it needs for the growth surface and inspector,
    // and the sidebar instead of returning an opaque assignment shell that
    // crashes when it tries to render a fallback title.
    title: assignment.title,
    strategyTemplateId: assignment.strategyTemplateId,
    instruction: compactText(assignment.instruction, 420),
    environment: assignment.environment,
    status: assignment.status,
    progress: assignment.progress,
    activation: assignment.activation,
    recurrence: assignment.recurrence,
    schedule: assignment.schedule,
    work: assignment.work,
    deliverable: assignment.deliverable,
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
      assignmentId: execution.assignmentId,
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
    "socialDecisions", "outcomes", "people", "personIdentities", "relationships", "recoveryIncidents",
    "growthEvidenceSnapshots", "growthEvidenceRecords", "growthHypotheses", "assignmentPursuitWindows", "standingIntents", "discoveryPlans",
    "assignmentRuns", "publishingPlans", "playgroundSessions", "perceptions", "capabilityChangeEvents",
    "socialStrategyRetrievalRuns", "knowledgeSegments", "knowledgeDocuments", "knowledgeVersions",
    "scenarioVersions", "conversations", "messages", "operatorNudges", "presenceChatSessions", "agentRequests",
    "calendar", "watches", "relationshipPolicies", "presenceRequestPolicies", "delegationGrants",
  ] as const) {
    (projection as unknown as Record<string, unknown>)[key] = [];
  }

  return projection;
}
