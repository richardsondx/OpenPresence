import type { OpenPresenceState } from "./types";

/**
 * Usage renders its data from `/api/usage`; the workspace payload is only
 * needed for the shell identity, connector status, and Agent selector.
 * Keeping the ledger and social history out of this response avoids making a
 * page-local report parse the complete operational workspace in the browser.
 */
export function usageBrowserProjection(state: OpenPresenceState): OpenPresenceState {
  const projection = { ...state, responseProjection: "usage" as const, agentWorkspaces: [], mirrorEvents: [] };
  for (const key of [
    "files", "messages", "conversations", "presenceChatSessions", "operatorConversations", "operatorNudges", "agentRequests",
    "events", "socialDecisions", "autobiographicalEvents", "autobiographicalReflections", "resourceUsageEvents", "attentionEpisodes",
    "calendar", "assignments", "growthReviews", "growthRevisions", "growthEvidenceSnapshots", "growthFileVersions", "audienceSnapshots",
    "publicationMetricSnapshots", "watches", "watchSignals", "relationshipPolicies", "relationshipStudies", "relationshipInsightSets",
    "presenceRequestPolicies", "delegationGrants", "publicRequests", "explorations", "discoveryPlans", "explorationSessions",
    "explorationFindings", "actions", "publishingPlans", "modelProfiles", "providerConnections", "assetProviderConnections", "toolBindings",
    "changeSets", "standingIntents", "operatorDirectives", "socialIntents", "executions", "outcomes", "attentionTests", "capabilityTrials",
    "publications", "assetUsages", "sourceEvidence", "claimGrounding", "preferenceEvidence", "originalPostRehearsals", "librarySources",
    "assets", "perceptions", "assetResearchSessions", "assetCollections", "assetCollectionMemberships", "assetMetadataEdits",
    "assetProcessingJobs", "skills", "agentSkills", "contentDrops", "mirrorObjects", "bridgeSync",
    "conversationEpisodes", "assignmentContributions", "people", "peopleNotes", "personIdentities", "relationships", "relationshipFacts",
    "relationshipOpenLoops", "recommendationRecords", "introductionRecords", "sandboxEnvironments", "playgroundSessions", "sandboxActors",
    "networkSearches", "networkIntroductions", "scenarios", "scenarioVersions", "scenarioRuns", "scenarioRunProvenance", "scenarioEvaluations",
    "knowledgeDocuments", "knowledgeVersions", "knowledgeSegments", "mindFileKnowledgeBindings", "knowledgeRetrievalRuns", "knowledgeCitations",
    "knowledgeCollections", "knowledgeItems", "presenceKnowledgeBindings", "conversationStyles", "operationalRuns", "scheduledWakes",
    "dependencyHealth", "recoveryIncidents", "recoveryAttempts", "browserBodies", "editorialOpportunities", "editorialFeedbackEvents",
    "editorialReferences", "sourceAssets", "mediaPerceptions", "verificationRecords", "rightsAssessments", "editorialDecisions", "publicationPackages",
  ] as const) {
    projection[key] = [] as never;
  }
  // The shell still renders the Agent's compact assignment index on Usage. Keep
  // identity and routing fields only; the usage report owns the heavy ledger.
  projection.assignments = state.assignments.map((assignment) => ({
    id: assignment.id,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    presenceId: assignment.presenceId,
    title: assignment.title,
    instruction: assignment.instruction?.slice(0, 420),
    environment: assignment.environment,
    status: assignment.status,
    progress: assignment.progress,
    activation: assignment.activation,
    recurrence: assignment.recurrence,
    schedule: assignment.schedule,
    work: assignment.work,
    deliverable: assignment.deliverable,
  })) as never;
  projection.proposals = state.proposals.filter((proposal) => proposal.status === "pending") as never;
  return projection;
}
