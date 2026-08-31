import type { OpenPresenceState } from "./types";

export type AgentLibraryProjection = "knowledge" | "assets" | "people" | "feed" | "schedule" | "watching";

const historyCollections = [
  "files", "messages", "conversations", "presenceChatSessions", "operatorConversations", "operatorNudges", "agentRequests",
  "events", "socialDecisions", "autobiographicalEvents", "autobiographicalReflections", "resourceUsageEvents", "attentionEpisodes",
  "calendar", "assignments", "assignmentRuns", "growthReviews", "growthRevisions", "growthEvidenceSnapshots", "growthFileVersions",
  "audienceSnapshots", "publicationMetricSnapshots", "watches", "watchSignals", "relationshipPolicies", "relationshipStudies",
  "relationshipInsightSets", "presenceRequestPolicies", "delegationGrants", "publicRequests", "explorations", "discoveryPlans",
  "explorationSessions", "explorationFindings", "actions", "publishingPlans", "modelProfiles", "providerConnections",
  "assetProviderConnections", "toolBindings", "changeSets", "standingIntents", "operatorDirectives", "socialIntents", "outcomes",
  "attentionTests", "capabilityTrials", "publications", "assetUsages", "sourceEvidence", "claimGrounding", "preferenceEvidence",
  "originalPostRehearsals", "librarySources", "perceptions", "assetResearchSessions", "assetMetadataEdits", "skills", "agentSkills",
  "contentDrops", "mirrorObjects", "mirrorEvents", "bridgeSync", "conversationEpisodes", "assignmentContributions", "people",
  "peopleNotes", "personIdentities", "relationships", "relationshipFacts", "relationshipOpenLoops", "recommendationRecords",
  "introductionRecords", "sandboxEnvironments", "playgroundSessions", "sandboxActors", "networkSearches", "networkIntroductions",
  "scenarios", "scenarioVersions", "scenarioRuns", "scenarioRunProvenance", "scenarioEvaluations", "knowledgeSegments",
  "mindFileKnowledgeBindings", "knowledgeRetrievalRuns", "knowledgeCitations", "knowledgeCollections", "knowledgeItems",
  "presenceKnowledgeBindings", "conversationStyles", "operationalRuns", "scheduledWakes", "dependencyHealth", "recoveryIncidents",
  "recoveryAttempts", "browserBodies", "editorialOpportunities", "editorialFeedbackEvents", "editorialReferences", "sourceAssets",
  "mediaPerceptions", "verificationRecords", "rightsAssessments", "editorialDecisions", "publicationPackages",
] as const;

/**
 * Keep the Agent shell and one library's records in browser reads. Usage and
 * Knowledge/Assets are page-local reports; sending the complete operational
 * history makes navigation pay for data that the page cannot display.
 */
export function agentLibraryBrowserProjection(state: OpenPresenceState, projection: AgentLibraryProjection): OpenPresenceState {
  const next = {
    ...state,
    responseProjection: projection,
    agentWorkspaces: [],
    mirrorEvents: [],
    proposals: state.proposals.filter((proposal) => proposal.status === "pending"),
    executions: state.executions.filter((execution) => execution.status === "awaiting-review"),
  };

  for (const key of historyCollections) next[key] = [] as never;

  if (projection === "knowledge") {
    for (const key of ["assets", "assetCollections", "assetCollectionMemberships", "assetProcessingJobs"] as const) next[key] = [] as never;
    next.knowledgeDocuments = state.knowledgeDocuments;
    next.knowledgeVersions = state.knowledgeVersions;
    next.knowledgeRetrievalRuns = state.knowledgeRetrievalRuns;
  } else if (projection === "assets") {
    for (const key of ["knowledgeDocuments", "knowledgeVersions", "knowledgeRetrievalRuns"] as const) next[key] = [] as never;
    next.assets = state.assets;
    next.assetCollections = state.assetCollections;
    next.assetCollectionMemberships = state.assetCollectionMemberships;
    next.assetProcessingJobs = state.assetProcessingJobs;
    next.perceptions = state.perceptions;
  } else {
    for (const key of ["assets", "assetCollections", "assetCollectionMemberships", "assetProcessingJobs", "knowledgeDocuments", "knowledgeVersions", "knowledgeRetrievalRuns"] as const) next[key] = [] as never;
    if (projection === "feed") {
      const presenceId = state.presence?.id;
      const mirrors = presenceId ? state.mirrorObjects.filter((object) => object.presenceId === presenceId) : state.mirrorObjects;
      const assetIds = new Set(mirrors.flatMap((object) => (object.assetRefs ?? []).map((ref) => ref.assetId)));
      const executionIds = new Set(mirrors.map((object) => object.originExecutionId).filter((id): id is string => Boolean(id)));
      next.mirrorObjects = mirrors;
      next.assets = state.assets.filter((asset) => assetIds.has(asset.id));
      next.assignments = state.assignments;
      next.assignmentRuns = state.assignmentRuns;
      next.events = presenceId ? state.events.filter((event) => event.presenceId === presenceId) : state.events;
      next.executions = state.executions.filter((execution) => execution.status === "awaiting-review" || executionIds.has(execution.id) || (execution.presenceId === presenceId && execution.status === "succeeded"));
      next.outcomes = presenceId ? state.outcomes.filter((outcome) => outcome.presenceId === presenceId) : state.outcomes;
      next.socialIntents = presenceId ? state.socialIntents.filter((intent) => intent.presenceId === presenceId) : state.socialIntents;
      return next;
    }
    if (projection === "schedule") {
      const presenceId = state.presence?.id;
      const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
      const plans = state.publishingPlans.filter((plan) => (!presenceId || plan.presenceId === presenceId) && plan.status !== "superseded");
      const plan = plans.sort((left, right) => (right.status === "active" ? 1 : 0) - (left.status === "active" ? 1 : 0) || right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt))[0];
      const planExecutionIds = new Set(state.executions
        .filter((execution) => execution.presenceId === presence?.id && execution.status === "succeeded" && execution.publication?.origin?.kind === "publishing_initiative" && execution.publication.origin.planId === plan?.id && execution.publication.origin.planRevision === plan?.revision)
        .map((execution) => execution.id));
      next.publishingPlans = plan ? [plan] : [];
      next.mirrorObjects = state.mirrorObjects.filter((object) => object.presenceId === presence?.id && object.originExecutionId !== undefined && planExecutionIds.has(object.originExecutionId));
      next.assignments = state.assignments;
      next.assignmentRuns = state.assignmentRuns;
      next.assetCollections = (state.assetCollections ?? []).filter((collection) => collection.agentId === state.agent?.id && collection.status === "active");
      next.executions = state.executions.filter((execution) => execution.status === "awaiting-review" || planExecutionIds.has(execution.id));
      return next;
    }
    if (projection === "watching") {
      const presenceId = state.presence?.id;
      const watches = state.watches.filter((watch) => !presenceId || watch.presenceId === presenceId);
      const watchIds = new Set(watches.map((watch) => watch.id));
      const explorations = state.explorations.filter((exploration) => !presenceId || exploration.presenceId === presenceId);
      const explorationIds = new Set(explorations.map((exploration) => exploration.id));
      const findings = state.explorationFindings.filter((finding) => explorationIds.has(finding.explorationId));
      const findingMirrorIds = new Set(findings.map((finding) => finding.mirrorObjectId));
      const sessions = state.explorationSessions.filter((session) => explorationIds.has(session.explorationId));
      const artifactMirrorIds = new Set(sessions.flatMap((session) => session.artifactIds ?? []));
      const signalMirrorIds = new Set(state.watchSignals.filter((signal) => watchIds.has(signal.watchId)).map((signal) => signal.mirrorObjectId));
      const recentObjects = state.mirrorObjects.filter((object) => object.presenceId === presenceId && object.visibility === "public" && object.objectType === "post").slice(0, 40);
      const referencedMirrorIds = new Set([...findingMirrorIds, ...artifactMirrorIds, ...signalMirrorIds, ...recentObjects.map((object) => object.id)]);
      next.watches = watches;
      next.watchSignals = state.watchSignals.filter((signal) => watchIds.has(signal.watchId));
      next.explorations = explorations;
      next.explorationFindings = findings;
      next.explorationSessions = sessions;
      next.assignments = state.assignments.filter((assignment) => assignment.presenceId === presenceId || explorations.some((exploration) => exploration.engagement?.assignmentId === assignment.id));
      next.bridges = state.bridges.filter((bridge) => bridge.presenceId === presenceId);
      next.mirrorObjects = state.mirrorObjects.filter((object) => referencedMirrorIds.has(object.id));
      return next;
    }
    const presenceId = state.presence?.id;
    next.people = state.people;
    next.personIdentities = state.personIdentities;
    next.relationships = state.relationships;
    next.relationshipFacts = state.relationshipFacts;
    next.relationshipOpenLoops = state.relationshipOpenLoops;
    next.peopleNotes = state.peopleNotes;
    next.watches = state.watches;
    next.watchSignals = state.watchSignals;
    next.delegationGrants = state.delegationGrants;
    next.relationshipStudies = state.relationshipStudies;
    next.relationshipInsightSets = state.relationshipInsightSets;
    next.autobiographicalEvents = state.autobiographicalEvents;
    next.mirrorObjects = presenceId ? state.mirrorObjects.filter((object) => object.presenceId === presenceId) : state.mirrorObjects;
    next.socialDecisions = presenceId ? state.socialDecisions.filter((decision) => decision.presenceId === presenceId) : state.socialDecisions;
    next.socialIntents = presenceId ? state.socialIntents.filter((intent) => intent.presenceId === presenceId && intent.affordance === "x.follow") : state.socialIntents;
    next.outcomes = presenceId ? state.outcomes.filter((outcome) => outcome.presenceId === presenceId) : state.outcomes;
    next.executions = state.executions.filter((execution) => execution.status === "awaiting-review" || (execution.presenceId === presenceId && execution.affordance === "x.follow"));
  }

  return next;
}
