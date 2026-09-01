import type { OpenPresenceState } from "./types";
import { derivePublicHistory } from "./runtime";

export type AgentLibraryProjection = "knowledge" | "assets" | "people" | "feed" | "schedule" | "watching" | "rehearsal" | "brain" | "teach" | "presence" | "playground";

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
      const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
      const history = derivePublicHistory(state, presenceId, { normalized: true })
        .filter((item) => !presence || item.channel === presence.channel)
        .filter((item) => !presence || (presence.environment === "sandbox" ? item.environment === "sandbox" : item.environment !== "sandbox"))
        .map((item) => ({
          ...item,
          // Feed cards and the inspector do not need unbounded provider text;
          // keep a generous display window while preventing one malformed
          // observation from dominating the whole browser response.
          text: item.text?.slice(0, 4_000),
          authorAvatarUrl: undefined,
        }));
      const historyExternalRefs = new Set(history.flatMap((item) => [item.externalRef, item.parentExternalRef].filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)).map((ref) => `${ref.type}:${ref.id}`)));
      const historyObjectIds = new Set(history.map((item) => item.id));
      const mirrors = (presenceId ? state.mirrorObjects.filter((object) => object.presenceId === presenceId) : state.mirrorObjects)
        .filter((object) => historyObjectIds.has(object.id) || (object.externalRef && historyExternalRefs.has(`${object.externalRef.type}:${object.externalRef.id}`)))
        .map((object) => ({
          id: object.id,
          bridgeId: object.bridgeId,
          presenceId: object.presenceId,
          channelId: object.channelId,
          externalRef: object.externalRef,
          parentExternalRef: object.parentExternalRef,
          objectType: object.objectType,
          author: object.author ? { displayName: object.author.displayName, handle: object.author.handle } : undefined,
          content: object.content?.text ? { text: object.content.text.slice(0, 4_000) } : undefined,
          assetRefs: object.assetRefs,
          assignmentId: object.assignmentId,
          occurredAt: object.occurredAt,
          observedAt: object.observedAt,
          visibility: object.visibility,
          shareability: object.shareability,
          originExecutionId: object.originExecutionId,
          actorPresenceId: object.actorPresenceId,
          archived: object.archived,
          environment: object.environment,
        }));
      const assetIds = new Set(mirrors.flatMap((object) => (object.assetRefs ?? []).map((ref) => ref.assetId)));
      const compactAssets = state.assets.filter((asset) => assetIds.has(asset.id)).map((asset) => asset.provenance ? ({
          id: asset.id,
          agentId: asset.agentId,
          presenceId: asset.presenceId,
          type: asset.type,
          storage: asset.storage,
          dataUrl: asset.dataUrl,
          status: asset.status,
          provenance: {
            origin: asset.provenance.origin,
            sourceUrl: asset.provenance.sourceUrl,
            sourcePageUrl: asset.provenance.sourcePageUrl,
            publisher: asset.provenance.publisher,
            importedAt: asset.provenance.importedAt,
            sourceIdentityStatus: asset.provenance.sourceIdentityStatus,
          },
          rights: asset.rights ? { status: asset.rights.status } : undefined,
          description: asset.description,
          mimeType: asset.mimeType,
        }) : asset);
      const assignmentIds = new Set(mirrors.map((object) => object.assignmentId).filter((id): id is string => Boolean(id)));
      (next as OpenPresenceState & { feedBrowserHistory?: typeof history }).feedBrowserHistory = history;
      next.mirrorObjects = mirrors as never;
      next.assets = compactAssets as never;
      next.assignments = state.assignments.filter((assignment) => assignmentIds.has(assignment.id)).map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        progress: assignment.progress,
        activation: assignment.activation,
        successEvidence: assignment.successEvidence,
      })) as never;
      next.assignmentRuns = (state.assignmentRuns ?? []).filter((run) => assignmentIds.has(run.assignmentId));
      next.events = [];
      next.executions = [];
      next.outcomes = [];
      next.socialIntents = [];
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
      // Watching owns the People entry point. Keep relationship context in
      // this projection so switching to People does not create a second
      // top-level navigation request or render an empty compatibility shell.
      next.people = state.people;
      next.personIdentities = state.personIdentities.filter((identity) => !presenceId || identity.sourcePresenceId === presenceId);
      next.peopleNotes = (state.peopleNotes ?? []).filter((note) => !presenceId || note.presenceId === presenceId);
      next.relationships = state.relationships;
      next.relationshipFacts = state.relationshipFacts;
      next.relationshipOpenLoops = state.relationshipOpenLoops;
      next.relationshipStudies = (state.relationshipStudies ?? []).filter((study) => !presenceId || study.presenceId === presenceId);
      next.relationshipInsightSets = state.relationshipInsightSets;
      next.delegationGrants = state.delegationGrants.filter((grant) => !presenceId || grant.presenceId === presenceId);
      next.socialDecisions = state.socialDecisions.filter((decision) => !presenceId || decision.presenceId === presenceId);
      next.socialIntents = state.socialIntents.filter((intent) => !presenceId || intent.presenceId === presenceId);
      next.outcomes = state.outcomes.filter((outcome) => !presenceId || outcome.presenceId === presenceId);
      next.executions = state.executions.filter((execution) => execution.status === "awaiting-review" || !presenceId || execution.presenceId === presenceId);
      return next;
    }
    if (projection === "rehearsal") {
      const presenceId = state.presence?.id;
      next.files = state.files;
      next.presenceChatSessions = (state.presenceChatSessions ?? []).filter((session) => !presenceId || session.presenceId === presenceId);
      return next;
    }
    if (projection === "brain") {
      next.files = state.files;
      next.modelProfiles = state.modelProfiles;
      next.providerConnections = state.providerConnections;
      next.assetProviderConnections = state.assetProviderConnections;
      next.toolBindings = state.toolBindings;
      next.skills = state.skills;
      next.agentSkills = state.agentSkills;
      next.presenceKnowledgeAccess = state.presenceKnowledgeAccess;
      next.knowledgeDocuments = state.knowledgeDocuments;
      next.mindFileKnowledgeBindings = state.mindFileKnowledgeBindings;
      return next;
    }
    if (projection === "teach") {
      next.conversations = state.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.slice(-100),
      }));
      next.modelProfiles = state.modelProfiles;
      next.changeSets = state.changeSets.slice(-20);
      next.librarySources = state.librarySources.slice(-20);
      next.skills = state.skills;
      next.toolBindings = state.toolBindings;
      return next;
    }
    if (projection === "presence") {
      const presenceId = state.presence?.id;
      next.nativeConnections = state.nativeConnections.filter((connection) => !presenceId || connection.presenceId === presenceId);
      next.bridges = state.bridges.filter((bridge) => !presenceId || bridge.presenceId === presenceId);
      next.browserBodies = (state.browserBodies ?? []).filter((body) => !presenceId || body.presenceId === presenceId);
      next.executions = state.executions.filter((execution) => execution.presenceId === presenceId && (execution.status === "awaiting-review" || execution.status === "succeeded" || execution.status === "failed"));
      next.mirrorObjects = state.mirrorObjects.filter((object) => !presenceId || object.presenceId === presenceId).slice(0, 120);
      next.presenceKnowledgeAccess = state.presenceKnowledgeAccess;
      next.knowledgeDocuments = state.knowledgeDocuments;
      return next;
    }
    if (projection === "playground") {
      const presenceId = state.presence?.id;
      const sessions = state.playgroundSessions.filter((session) => !presenceId || session.presenceId === presenceId);
      const sessionIds = new Set(sessions.map((session) => session.id));
      const activeSession = sessions.find((session) => session.status === "active");
      const relevantAssignments = state.assignments.filter((assignment) =>
        (assignment.environment === "sandbox" && assignment.sessionId !== undefined && sessionIds.has(assignment.sessionId) && !["completed", "completed_with_adaptation", "cancelled"].includes(assignment.status))
        || (assignment.environment === "sandbox" && assignment.status === "draft" && assignment.presenceId === presenceId)
        || (assignment.environment === "live" && assignment.status === "draft" && assignment.presenceId === presenceId),
      );
      const assignmentIds = new Set(relevantAssignments.map((assignment) => assignment.id));
      const assignmentRuns = (state.assignmentRuns ?? []).filter((run) => assignmentIds.has(run.assignmentId));
      const research = (state.assetResearchSessions ?? []).filter((item) => item.assignmentId !== undefined && assignmentIds.has(item.assignmentId));
      const rehearsalAttempts = activeSession
        ? state.originalPostRehearsals.filter((attempt) => attempt.sessionId === activeSession.id).slice(0, 5)
        : [];
      const publicationIds = new Set(rehearsalAttempts.map((attempt) => attempt.publicationId).filter((id): id is string => Boolean(id)));
      const scenarioIds = new Set(state.scenarios
        .filter((scenario) => scenario.ownerScope !== "presence" || scenario.presenceId === presenceId)
        .map((scenario) => scenario.id));
      const scenarioRuns = state.scenarioRuns.filter((run) => !presenceId || run.presenceId === presenceId);
      const scenarioRunIds = new Set(scenarioRuns.map((run) => run.id));
      const scenarioSessionIds = new Set(scenarioRuns.map((run) => run.playgroundSessionId).filter((id): id is string => Boolean(id)));
      for (const id of scenarioSessionIds) sessionIds.add(id);
      const mirrorObjects = state.mirrorObjects.filter((object) => sessionIds.has(object.sessionId ?? ""));
      const mirrorAssetIds = new Set(mirrorObjects.flatMap((object) => (object.assetRefs ?? []).map((ref) => ref.assetId)));
      const researchAssetIds = new Set(research.flatMap((item) => item.candidates.map((candidate) => candidate.assetId).filter((id): id is string => Boolean(id))));
      const assetIds = new Set([...mirrorAssetIds, ...researchAssetIds]);
      const curationOpportunities = (state.editorialOpportunities ?? []).filter((item) => item.presenceId === presenceId);
      const curationReferences = (state.editorialReferences ?? []).filter((item) => item.presenceId === presenceId);
      const sourceAssetIds = new Set(curationOpportunities.map((item) => item.sourceAssetId).filter((id): id is string => Boolean(id)));
      const perceptionIds = new Set(curationOpportunities.map((item) => item.perceptionId).filter((id): id is string => Boolean(id)));
      const verificationIds = new Set(curationOpportunities.map((item) => item.verificationId).filter((id): id is string => Boolean(id)));
      const rightsIds = new Set(curationOpportunities.map((item) => item.rightsAssessmentId).filter((id): id is string => Boolean(id)));
      const decisionIds = new Set(curationOpportunities.map((item) => item.decisionId).filter((id): id is string => Boolean(id)));
      const packageIds = new Set(curationOpportunities.map((item) => item.publicationPackageId).filter((id): id is string => Boolean(id)));
      next.playgroundSessions = sessions;
      next.presenceChatSessions = (state.presenceChatSessions ?? []).filter((session) => !presenceId || session.presenceId === presenceId);
      next.sandboxActors = state.sandboxActors.filter((actor) => sessionIds.has(actor.sessionId));
      next.mirrorObjects = mirrorObjects;
      next.events = state.events.filter((event) => event.sessionId !== undefined && sessionIds.has(event.sessionId));
      next.executions = state.executions.filter((execution) => (activeSession && execution.sessionId === activeSession.id && execution.status === "awaiting-review") || execution.status === "awaiting-review" && execution.presenceId === presenceId);
      next.assignments = relevantAssignments;
      next.assignmentRuns = assignmentRuns;
      next.assetResearchSessions = research;
      next.originalPostRehearsals = rehearsalAttempts;
      next.publications = state.publications.filter((publication) => publicationIds.has(publication.id));
      next.assets = state.assets.filter((asset) => assetIds.has(asset.id));
      next.perceptions = state.perceptions.filter((perception) => assetIds.has(perception.assetId));
      next.capabilityTrials = state.capabilityTrials.filter((trial) => trial.presenceId === presenceId);
      next.scenarios = state.scenarios.filter((scenario) => scenarioIds.has(scenario.id));
      next.scenarioVersions = state.scenarioVersions.filter((version) => scenarioIds.has(version.scenarioId));
      next.scenarioRuns = scenarioRuns;
      next.scenarioEvaluations = state.scenarioEvaluations.filter((evaluation) => scenarioRunIds.has(evaluation.runId));
      next.scenarioRunProvenance = state.scenarioRunProvenance.filter((provenance) => scenarioRuns.some((run) => run.provenanceId === provenance.id));
      next.files = state.files.filter((file) => file.kind === "TASTE");
      next.editorialOpportunities = curationOpportunities;
      next.editorialReferences = curationReferences;
      next.editorialFeedbackEvents = (state.editorialFeedbackEvents ?? []).filter((item) => item.presenceId === presenceId);
      next.sourceAssets = (state.sourceAssets ?? []).filter((item) => sourceAssetIds.has(item.id));
      next.mediaPerceptions = (state.mediaPerceptions ?? []).filter((item) => perceptionIds.has(item.id));
      next.verificationRecords = (state.verificationRecords ?? []).filter((item) => verificationIds.has(item.id));
      next.rightsAssessments = (state.rightsAssessments ?? []).filter((item) => rightsIds.has(item.id));
      next.editorialDecisions = (state.editorialDecisions ?? []).filter((item) => decisionIds.has(item.id));
      next.publicationPackages = (state.publicationPackages ?? []).filter((item) => packageIds.has(item.id));
      return next;
    }
    for (const key of [
      "presences", "capabilityChangeEvents", "socialStrategyRetrievalRuns", "assignmentPursuitWindows",
      "nativeConnections", "bridges",
    ] as const) next[key] = [] as never;
    next.proposals = [];
    next.executions = [];
    const presenceId = state.presence?.id;
    const identities = state.personIdentities.filter((identity) =>
      !presenceId || identity.sourcePresenceId === presenceId,
    );
    const personIds = new Set(identities.map((identity) => identity.personId));
    const relationshipIds = new Set(state.relationships.filter((relationship) => personIds.has(relationship.personId)).map((relationship) => relationship.id));
    const watchIds = new Set(state.watches.filter((watch) => !presenceId || watch.presenceId === presenceId).map((watch) => watch.id));

    // People needs the complete relationship card set, but only a narrow
    // identity/relationship shape. Keeping provider evidence and old
    // provenance envelopes out of this read avoids megabytes of parse and GC
    // work before the operator can search or open one person.
    next.people = state.people.filter((person) => personIds.has(person.id));
    next.personIdentities = identities.map((identity) => ({
      id: identity.id,
      personId: identity.personId,
      channel: identity.channel,
      externalActorId: identity.externalActorId,
      handle: identity.handle,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      sourcePresenceId: identity.sourcePresenceId,
      sourceEnvironment: identity.sourceEnvironment,
      verificationMethod: identity.verificationMethod,
      hydrationState: identity.hydrationState,
      lastHydratedAt: identity.lastHydratedAt,
      contactability: identity.contactability,
      createdAt: identity.createdAt,
    })) as never;
    next.relationships = state.relationships.filter((relationship) => relationshipIds.has(relationship.id)).map((relationship) => ({
      id: relationship.id,
      personId: relationship.personId,
      following: relationship.following,
      lastMeaningfulInteractionAt: relationship.lastMeaningfulInteractionAt,
      state: relationship.state,
      createdAt: relationship.createdAt,
      updatedAt: relationship.updatedAt,
    })) as never;
    next.relationshipFacts = state.relationshipFacts.filter((fact) => relationshipIds.has(fact.relationshipId)).map((fact) => ({
      id: fact.id,
      relationshipId: fact.relationshipId,
      statement: fact.statement,
      epistemicKind: fact.epistemicKind,
      confidence: fact.confidence,
      provenanceRefs: fact.provenanceRefs.map((ref) => ({ kind: ref.kind })),
      validTo: fact.validTo,
      supersedesFactId: fact.supersedesFactId,
      createdAt: fact.createdAt,
    })) as never;
    next.relationshipOpenLoops = state.relationshipOpenLoops.filter((loop) => relationshipIds.has(loop.relationshipId)).map((loop) => ({
      id: loop.id,
      relationshipId: loop.relationshipId,
      description: loop.description,
      status: loop.status,
      createdAt: loop.createdAt,
      resolvedAt: loop.resolvedAt,
    })) as never;
    next.peopleNotes = (state.peopleNotes ?? []).filter((note) => !presenceId || note.presenceId === presenceId);
    next.watches = state.watches.filter((watch) => watchIds.has(watch.id));
    next.watchSignals = state.watchSignals.filter((signal) => watchIds.has(signal.watchId));
    next.delegationGrants = state.delegationGrants.filter((grant) => !presenceId || grant.presenceId === presenceId);
    const studies = (state.relationshipStudies ?? []).filter((study) => !presenceId || study.presenceId === presenceId);
    next.relationshipStudies = studies;
    const studyIds = new Set(studies.map((study) => study.id));
    next.relationshipInsightSets = (state.relationshipInsightSets ?? []).filter((set) => studyIds.has(set.studyId) || studies.some((study) => study.insightSetId === set.id));
    next.autobiographicalEvents = state.autobiographicalEvents.filter((event) =>
      (!presenceId || event.presenceId === presenceId) && (!event.counterpartyPersonId || personIds.has(event.counterpartyPersonId)),
    );
    const mirrors = presenceId ? state.mirrorObjects.filter((object) => object.presenceId === presenceId) : state.mirrorObjects;
    const identityActorIds = new Set(identities.map((identity) => identity.externalActorId).filter(Boolean));
    const studyEvidenceMirrorIds = new Set(studies.flatMap((study) => study.evidenceRefs.filter((ref) => ref.kind === "mirror_object").map((ref) => ref.id)));
    const followDecisionMirrorIds = new Set((presenceId ? state.socialDecisions.filter((decision) => decision.presenceId === presenceId) : state.socialDecisions).flatMap((decision) => decision.focalMirrorObjectIds ?? []));
    const relevantMirrors = mirrors
      .filter((object) => studyEvidenceMirrorIds.has(object.id)
        || followDecisionMirrorIds.has(object.id)
        || identityActorIds.has(object.author?.externalRef?.id ?? "")
        // Preserve sparse/legacy evidence records so a partially hydrated
        // identity does not make an otherwise valid relationship disappear.
        || !object.author?.externalRef?.id)
      .sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt));
    const retainedByActor = new Map<string, number>();
    const personMirrors = relevantMirrors.filter((object) => {
      if (studyEvidenceMirrorIds.has(object.id) || followDecisionMirrorIds.has(object.id)) return true;
      const actorId = object.author?.externalRef?.id;
      const bucket = actorId ?? "__unattributed__";
      const retained = retainedByActor.get(bucket) ?? 0;
      if (retained >= 8) return false;
      retainedByActor.set(bucket, retained + 1);
      return true;
    });
    next.mirrorObjects = personMirrors.map((object) => ({
      id: object.id,
      presenceId: object.presenceId,
      channelId: object.channelId,
      externalRef: object.externalRef,
      parentExternalRef: object.parentExternalRef,
      objectType: object.objectType,
      language: object.language,
      author: object.author
        ? { externalRef: object.author.externalRef, displayName: object.author.displayName, handle: object.author.handle, avatarUrl: object.author.avatarUrl }
        : undefined,
      content: object.content?.text ? { text: object.content.text, language: object.content.language } : undefined,
      assetRefs: object.assetRefs?.map((ref) => ({ assetId: ref.assetId, kind: ref.kind })),
      occurredAt: object.occurredAt,
      observedAt: object.observedAt,
      visibility: object.visibility,
      archived: object.archived,
      environment: object.environment,
    })) as never;
    next.socialDecisions = (presenceId ? state.socialDecisions.filter((decision) => decision.presenceId === presenceId) : state.socialDecisions).map((decision) => ({
      id: decision.id,
      presenceId: decision.presenceId,
      focalMirrorObjectIds: decision.focalMirrorObjectIds,
      acts: (decision.acts ?? []).filter((act) => act.decision === "follow").map((act) => ({ decision: act.decision, rationale: act.rationale })),
      summary: decision.summary,
    })) as never;
    next.socialIntents = (presenceId ? state.socialIntents.filter((intent) => intent.presenceId === presenceId && intent.affordance === "x.follow") : state.socialIntents).map((intent) => ({
      id: intent.id,
      affordance: intent.affordance,
      target: intent.target,
    })) as never;
    next.outcomes = (presenceId ? state.outcomes.filter((outcome) => outcome.presenceId === presenceId) : state.outcomes).map((outcome) => ({
      id: outcome.id,
      socialIntentId: outcome.socialIntentId,
      executionId: outcome.executionId,
      presenceId: outcome.presenceId,
      status: outcome.status,
    })) as never;
    next.executions = state.executions
      .filter((execution) => execution.status === "awaiting-review" || (execution.presenceId === presenceId && execution.affordance === "x.follow"))
      .map((execution) => ({
        id: execution.id,
        presenceId: execution.presenceId,
        affordance: execution.affordance,
        status: execution.status,
        target: execution.target,
      })) as never;
  }

  return next;
}
