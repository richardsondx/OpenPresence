import type { OpenPresenceState } from "./types";

export type AgentLibraryProjection = "knowledge" | "assets" | "people";

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
