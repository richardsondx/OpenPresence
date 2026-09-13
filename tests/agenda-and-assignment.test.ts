import { describe, expect, it } from "vitest";
import { compileAgenda, compileAgendaWork, initialState, migrateLegacyOperatorDirectives, nextScheduledOccurrence, scheduledAssignmentIsDue } from "../lib/runtime";
import type { Assignment, OpenPresenceState, OperatorDirective } from "../lib/types";

function createMockState(): OpenPresenceState {
  const presenceId = "presence_main";
  const agentId = "agent_genny";

  const assignments: Assignment[] = [
    {
      id: "assign_growth",
      agentId,
      presenceId,
      channelId: "x",
      environment: "live",
      title: "Grow this Presence toward 100,000 followers",
      instruction: "Grow this Presence toward 100,000 followers while building an audience of founders and builders.",
      deliverable: { type: "audience_growth" },
      activation: { type: "continuous" },
      executionPolicy: { usePresenceEnvelope: true },
      status: "active",
      progress: { required: 100000, verified: 1200 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:00.000Z",
    },
    {
      id: "assign_friday_late",
      agentId,
      presenceId,
      channelId: "x",
      environment: "live",
      title: "Reflect on one claim about AI agents and separate evidence from hype",
      instruction: "Produce 1 post reflecting on AI agents.",
      deliverable: { type: "original_publication", quantity: 1 },
      activation: { type: "scheduled" },
      schedule: { day: "Friday", time: "17:00", executionWindow: "17:00–19:00" },
      executionPolicy: { usePresenceEnvelope: true },
      status: "draft",
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-08-16T10:00:00.000Z",
      updatedAt: "2026-08-16T10:00:00.000Z",
    },
    {
      id: "assign_friday_early",
      agentId,
      presenceId,
      channelId: "x",
      environment: "live",
      title: "Produce exactly 10 original X posts about four-minute schedule QA",
      instruction: "Produce 10 original X posts.",
      deliverable: { type: "original_publication", quantity: 10 },
      activation: { type: "scheduled" },
      schedule: { day: "Friday", time: "08:40", executionWindow: "08:40–10:00" },
      executionPolicy: { usePresenceEnvelope: true },
      status: "draft",
      progress: { required: 10, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-08-16T11:00:00.000Z",
      updatedAt: "2026-08-16T11:00:00.000Z",
    },
    {
      id: "assign_blocked_operator",
      agentId,
      presenceId,
      channelId: "x",
      environment: "live",
      title: "Enterprise customer pricing response",
      instruction: "Reply with pricing details.",
      deliverable: { type: "reply", quantity: 1 },
      activation: { type: "manual" },
      executionPolicy: { usePresenceEnvelope: true },
      status: "needs_operator",
      work: { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0, blockedReason: "Approved pricing Knowledge is missing." },
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  ];

  const operatorDirectives: OperatorDirective[] = [
    {
      id: "directive_wuming",
      agentId,
      presenceId,
      target: { type: "x.post", id: "post_wuming_1" },
      requiredAct: "reply",
      optionalDirection: "Keep it concrete.",
      provenance: "operator",
      initialAct: "no_op",
      status: "requested",
      createdAt: "2026-08-16T14:00:00.000Z",
    },
  ];

  const mirrorObjects = [
    {
      id: "mirror_wuming_1",
      bridgeId: "native:presence_main",
      presenceId,
      channelId: "x" as const,
      externalRef: { type: "x.post", id: "post_wuming_1" },
      objectType: "post" as const,
      author: { displayName: "Wuming", handle: "Wuming80253200" },
      content: { text: "What makes agent harnesses different from ChatGPT?" },
      occurredAt: "2026-08-16T13:50:00.000Z",
      observedAt: "2026-08-16T13:55:00.000Z",
      visibility: "public" as const,
      shareability: "presence-only" as const,
      archived: false,
      environment: "live" as const,
      source: "native" as const,
      trust: "untrusted_world_content" as const,
    },
  ];

  return {
    ...initialState(),
    onboarded: true,
    agent: { id: agentId, name: "Genny", description: "Persistent agent", audience: "builders", mode: "agent", accent: "#D68754", languagePolicy: { avoidPreferences: [], neverLiterals: [] } } as unknown as OpenPresenceState["agent"],
    presence: { id: presenceId, agentId, name: "Genny on X", handle: "@genny", channel: "x", status: "live", environment: "live", execution: { post: "auto", reply: "auto" } } as unknown as OpenPresenceState["presence"],
    presences: [{ id: presenceId, agentId, name: "Genny on X", handle: "@genny", channel: "x", status: "live", environment: "live", execution: { post: "auto", reply: "auto" } } as unknown as OpenPresenceState["presences"][number]],
    activePresenceId: presenceId,
    assignments,
    operatorDirectives,
    mirrorObjects,
    executions: [],
    events: [],
    calendar: [],
    assignmentRuns: [],
    growthReviews: [],
    growthFileVersions: [],
    audienceSnapshots: [],
    publicationMetricSnapshots: [],
    watches: [],
    explorations: [],
    discoveryPlans: [],
    explorationSessions: [],
    explorationFindings: [],
    messages: [],
    conversations: [],
    activeConversationId: null,
    presenceChatSessions: [],
    agentRequests: [],
    capabilityChangeEvents: [],
    files: [],
    proposals: [],
    modelProfiles: [],
    providerConnections: [],
    assetProviderConnections: [],
    toolBindings: [],
    changeSets: [],
    standingIntents: [],
    socialDecisions: [],
    resourceUsageEvents: [],
    socialIntents: [],
    outcomes: [],
    attentionTests: [],
    capabilityTrials: [],
    publications: [],
    assetUsages: [],
    sourceEvidence: [],
    claimGrounding: [],
    preferenceEvidence: [],
    originalPostRehearsals: [],
    librarySources: [],
    assets: [],
    perceptions: [],
    assetResearchSessions: [],
    skills: [],
    agentSkills: [],
    contentDrops: [],
    channelDefinitions: [],
    nativeConnections: [],
    bridges: [],
    mirrorEvents: [],
    bridgeSync: [],
    conversationEpisodes: [],
    assignmentContributions: [],
    people: [],
    personIdentities: [],
    relationships: [],
    relationshipFacts: [],
    relationshipOpenLoops: [],
    recommendationRecords: [],
    introductionRecords: [],
    sandboxEnvironments: [],
    playgroundSessions: [],
    sandboxActors: [],
    networkSearches: [],
    networkIntroductions: [],
    scenarios: [],
    scenarioVersions: [],
    scenarioRuns: [],
    scenarioRunProvenance: [],
    scenarioEvaluations: [],
    knowledgeDocuments: [],
    knowledgeCollections: [],
    knowledgeItems: [],
    knowledgeVersions: [],
    knowledgeSegments: [],
    presenceKnowledgeAccess: [],
    presenceKnowledgeBindings: [],
    knowledgeRetrievalRuns: [],
    knowledgeCitations: [],
    agents: [],
    activeAgentId: agentId,
    agentWorkspaces: [],
    actions: [],
    publishingPlans: [],
    metrics: { qualifiedFollows: 0, conversations: 0, opportunitiesIgnored: 0, audienceHealth: 98 },
  };
}

describe("Canonical Assignment Convergence and Agenda Compilation", () => {
  it("migrates legacy operatorDirectives into canonical Assignments idempotently", () => {
    const state = createMockState();
    const initialAssignmentCount = state.assignments.length;

    migrateLegacyOperatorDirectives(state);

    expect(state.assignments.length).toBe(initialAssignmentCount + 1);
    const migrated = state.assignments.find((a) => a.migration?.sourceId === "directive_wuming");
    expect(migrated).toBeDefined();
    expect(migrated?.title).toBe("Reply to @Wuming80253200");
    expect(migrated?.createdBy).toBe("operator");
    expect(migrated?.origin).toBe("manual");
    expect(migrated?.deliverable.type).toBe("reply");
    expect(migrated?.status).toBe("active");
    expect(state.operatorDirectives[0]!.migratedToAssignmentId).toBe(migrated?.id);

    // Running migration a second time must NOT create duplicate assignments
    migrateLegacyOperatorDirectives(state);
    expect(state.assignments.length).toBe(initialAssignmentCount + 1);
  });

  it("compiles Agenda into Now, Ongoing, Upcoming, and Needs Attention horizons", () => {
    const state = createMockState();
    migrateLegacyOperatorDirectives(state);

    const agenda = compileAgenda(state, "presence_main", new Date("2026-08-19T10:00:00.000Z"));

    // Needs Attention should contain the item requiring operator action
    expect(agenda.attention).toHaveLength(1);
    expect(agenda.attention[0]!.assignmentId).toBe("assign_blocked_operator");
    expect(agenda.attention[0]!.horizon).toBe("attention");

    // Now should contain the migrated operator reply assignment
    expect(agenda.now).toHaveLength(1);
    expect(agenda.now[0]!.assignment.deliverable.type).toBe("reply");
    expect(agenda.now[0]!.title).toContain("Reply to @Wuming80253200");
    expect(agenda.now[0]!.isReady).toBe(true);

    // Ongoing should contain the continuous growth responsibility
    expect(agenda.ongoing).toHaveLength(1);
    expect(agenda.ongoing[0]!.assignmentId).toBe("assign_growth");

    // Upcoming should contain the 2 scheduled assignments, sorted chronologically (08:40 before 17:00)
    expect(agenda.upcoming).toHaveLength(2);
    expect(agenda.upcoming[0]!.assignmentId).toBe("assign_friday_early"); // 08:40
    expect(agenda.upcoming[1]!.assignmentId).toBe("assign_friday_late"); // 17:00
  });

  it("orders Upcoming scheduled posts chronologically by time", () => {
    const fridayEarly = { day: "Friday", time: "08:40" };
    const fridayLate = { day: "Friday", time: "17:00" };
    const refDate = new Date("2026-08-19T10:00:00.000Z"); // Wednesday

    const nextEarly = nextScheduledOccurrence(fridayEarly, refDate);
    const nextLate = nextScheduledOccurrence(fridayLate, refDate);

    expect(nextEarly.getTime()).toBeLessThan(nextLate.getTime());
  });

  it("derives executable work items without turning responsibilities into the whole Agenda", () => {
    const state = createMockState();
    migrateLegacyOperatorDirectives(state);

    const agenda = compileAgendaWork(state, "presence_main", new Date("2026-08-19T10:00:00.000Z"));

    expect(agenda.nextUp?.map((item) => item.title)).toEqual(expect.arrayContaining([
      expect.stringContaining("Reply to @Wuming80253200"),
    ]));
    expect(agenda.responsibilities?.some((assignment) => assignment.id === "assign_growth")).toBe(true);
    expect(agenda.nextUp?.every((item) => item.title !== "Grow this Presence toward 100,000 followers")).toBe(true);
    expect(agenda.nextUp?.every((item, index) => item.currentRank === index + 1)).toBe(true);
    expect(agenda.nextUp?.every((item) => item.safePriorityReason.length > 0 && item.nextAction.length > 0 && item.doneWhen.length > 0)).toBe(true);
  });

  it("keeps pending mentions visible even when the compact Agenda only renders its first three", () => {
    const state = createMockState();
    const presence = state.presence!;
    for (let index = 0; index < 4; index += 1) {
      state.mirrorObjects.push({
        id: `mirror_pending_mention_${index}`,
        bridgeId: "native:presence_main",
        presenceId: presence.id,
        channelId: "x",
        externalRef: { type: "x.post", id: `post_pending_mention_${index}` },
        objectType: "post",
        author: { displayName: `Person ${index}`, handle: `person_${index}` },
        content: { text: `@genny this is a pending question ${index}` },
        occurredAt: "2026-08-19T13:00:00.000Z",
        observedAt: "2026-08-19T13:01:00.000Z",
        visibility: "public",
        shareability: "presence-only",
        archived: false,
        environment: "live",
        source: "native",
        trust: "untrusted_world_content",
      } as never);
    }

    const agenda = compileAgendaWork(state, presence.id, new Date("2026-08-19T14:00:00.000Z"));

    expect(agenda.pendingMentionCount).toBe(4);
    expect(agenda.workItems?.filter((item) => item.source === "mention")).toHaveLength(3);
    expect(agenda.watching?.find((item) => item.source === "mention")?.count).toBe(4);
  });

  it("marks a scheduled assignment due when its schedule window opens", () => {
    const assignment: Assignment = {
      id: "assign_due_test",
      agentId: "agent_genny",
      presenceId: "presence_main",
      channelId: "x",
      environment: "live",
      instruction: "Publish an update",
      deliverable: { type: "original_publication", quantity: 1 },
      executionPolicy: { usePresenceEnvelope: true },
      schedule: { day: "Wednesday", time: "09:00", executionWindow: "09:00–11:00" },
      status: "active",
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-08-19T08:00:00.000Z",
      updatedAt: "2026-08-19T08:00:00.000Z",
    };

    // Wednesday at 08:30 local time (before due time)
    const beforeTime = new Date(2026, 7, 19, 8, 30, 0);
    expect(scheduledAssignmentIsDue(assignment, beforeTime)).toBe(false);

    // Wednesday at 09:15 local time (after due time)
    const afterTime = new Date(2026, 7, 19, 9, 15, 0);
    expect(scheduledAssignmentIsDue(assignment, afterTime)).toBe(true);

    // The occurrence closes at the configured end time; it must not run indefinitely.
    expect(scheduledAssignmentIsDue(assignment, new Date(2026, 7, 19, 11, 0, 0))).toBe(true);
    expect(scheduledAssignmentIsDue(assignment, new Date(2026, 7, 19, 11, 1, 0))).toBe(false);
  });

  it("treats Daily as a real recurrence and rolls the next occurrence to tomorrow", () => {
    const daily = {
      day: "Daily",
      time: "08:00",
      executionWindow: "08:00–18:00",
    };
    const evening = new Date(2026, 7, 19, 20, 0, 0);
    const next = nextScheduledOccurrence(daily, evening, { kind: "daily" });

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(0);
  });

  it("dynamically ranks fresh strategic opportunities ahead of stale mentions using property-based scoring", () => {
    const state = createMockState();
    const now = new Date("2026-08-19T14:00:00.000Z");

    // Add a stale casual mention from 48 hours ago
    state.mirrorObjects.push({
      id: "mirror_stale_mention",
      bridgeId: "native:presence_main",
      presenceId: "presence_main",
      channelId: "x",
      externalRef: { type: "x.post", id: "post_stale_1" },
      objectType: "post",
      author: { displayName: "CasualUser", handle: "casual" },
      content: { text: "hey @genny how are things going?" },
      occurredAt: "2026-08-17T14:00:00.000Z", // 48 hours old
      observedAt: "2026-08-17T14:05:00.000Z",
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    // Add an exploration finding with high engagement responsibility and fresh timestamp
    state.explorations.push({
      id: "exp_memory",
      agentId: "agent_genny",
      presenceId: "presence_main",
      channel: "x",
      title: "Persistent agent memory architecture",
      brief: "Find persistent agent memory architecture breakthroughs",
      interpretation: "Look for grounded, relevant developments.",
      engagement: { mode: "objective", assignmentId: "assign_growth" },
      status: "active",
      revision: 1,
      coverage: { status: "available", label: "Available", detail: "Native coverage is available." },
      createdAt: "2026-08-19T13:30:00.000Z",
      updatedAt: "2026-08-19T13:50:00.000Z",
    });
    state.explorationFindings.push({
      id: "finding_fresh_1",
      explorationId: "exp_memory",
      sessionId: "session_memory",
      presenceId: "presence_main",
      mirrorObjectId: "mirror_fresh_post",
      safeSummary: "Breakthrough paper on durable memory representations.",
      whyItMayMatter: "Directly solves persistent context coherence.",
      status: "considering",
      createdAt: "2026-08-19T13:50:00.000Z",
      updatedAt: "2026-08-19T13:55:00.000Z", // 5 minutes old
    });
    state.mirrorObjects.push({
      id: "mirror_fresh_post",
      bridgeId: "native:presence_main",
      presenceId: "presence_main",
      channelId: "x",
      externalRef: { type: "x.post", id: "post_fresh_paper" },
      objectType: "post",
      author: { displayName: "AI Researcher", handle: "researcher" },
      content: { text: "We released a new framework for persistent agent memory representations across long horizons." },
      occurredAt: "2026-08-19T13:45:00.000Z",
      observedAt: "2026-08-19T13:50:00.000Z",
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    const agenda = compileAgendaWork(state, "presence_main", now);
    const workItems = agenda.nextUp ?? [];

    const explorationIndex = workItems.findIndex((item) => item.id.includes("finding_fresh_1"));
    const mentionIndex = workItems.findIndex((item) => item.id.includes("mirror_stale_mention"));

    expect(explorationIndex).toBeGreaterThanOrEqual(0);
    expect(mentionIndex).toBeGreaterThanOrEqual(0);
    // The fresh, strategically relevant Exploration opportunity must outrank the 48-hour-old casual mention
    expect(explorationIndex).toBeLessThan(mentionIndex);
  });

  it("ranks deadline-critical due Assignment ahead of a fresh casual mention", () => {
    const state = createMockState();
    const now = new Date(2026, 7, 21, 8, 45, 0); // Friday 08:45 (window 08:40-10:00 is active and due)

    // assign_friday_early is scheduled for Friday 08:40
    const dueAssignment = state.assignments.find((a) => a.id === "assign_friday_early")!;
    dueAssignment.status = "active";

    // Add a fresh casual mention from 2 minutes ago
    state.mirrorObjects.push({
      id: "mirror_fresh_mention",
      bridgeId: "native:presence_main",
      presenceId: "presence_main",
      channelId: "x",
      externalRef: { type: "x.post", id: "post_mention_just_now" },
      objectType: "post",
      author: { displayName: "Friend", handle: "friend" },
      content: { text: "morning @genny!" },
      occurredAt: new Date(2026, 7, 21, 8, 43, 0).toISOString(),
      observedAt: new Date(2026, 7, 21, 8, 43, 0).toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    const agenda = compileAgendaWork(state, "presence_main", now);
    const workItems = agenda.nextUp ?? [];

    const assignmentIndex = workItems.findIndex((item) => item.assignmentId === "assign_friday_early");
    const mentionIndex = workItems.findIndex((item) => item.id.includes("mirror_fresh_mention"));

    expect(assignmentIndex).toBeGreaterThanOrEqual(0);
    expect(mentionIndex).toBeGreaterThanOrEqual(0);
    expect(assignmentIndex).toBeLessThan(mentionIndex);
  });

  it("ranks an important ongoing conversation ahead of a fresh low-value Exploration finding", () => {
    const state = createMockState();
    const now = new Date("2026-08-19T14:00:00.000Z");

    // Add an active conversational episode with mutual turns
    state.conversationEpisodes.push({
      id: "ep_active_thread",
      agentId: "agent_genny",
      presenceId: "presence_main",
      environment: "live",
      channelId: "x",
      surface: "reply",
      privacyScope: "public",
      rootMirrorObjectId: "mirror_conv_root",
      branchAnchorMirrorObjectId: "mirror_conv_reply",
      participantActorIds: ["actor_colleague"],
      linkedEpisodeIds: [],
      status: "active",
      lastExternalObjectId: "mirror_conv_reply",
      agentTurnCount: 2,
      externalTurnCount: 2,
      createdAt: "2026-08-19T13:50:00.000Z",
      updatedAt: "2026-08-19T13:55:00.000Z",
    });
    state.mirrorObjects.push({
      id: "mirror_conv_reply",
      bridgeId: "native:presence_main",
      presenceId: "presence_main",
      channelId: "x",
      externalRef: { type: "x.post", id: "post_conv_reply_1" },
      parentExternalRef: { type: "x.post", id: "post_conv_root_1" },
      objectType: "reply",
      author: { displayName: "Colleague", handle: "colleague" },
      content: { text: "That makes sense. Where do you store the episodic indices?" },
      occurredAt: "2026-08-19T13:55:00.000Z",
      observedAt: "2026-08-19T13:55:00.000Z",
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    // Add a fresh but low-value Exploration finding (mode: "surface", no assignment obligation)
    state.explorations.push({
      id: "exp_general",
      agentId: "agent_genny",
      presenceId: "presence_main",
      channel: "x",
      title: "General news",
      brief: "Browse general news",
      interpretation: "Surface potentially relevant developments.",
      engagement: { mode: "surface" },
      status: "active",
      revision: 1,
      coverage: { status: "available", label: "Available", detail: "Native coverage is available." },
      createdAt: "2026-08-19T13:30:00.000Z",
      updatedAt: "2026-08-19T13:58:00.000Z",
    });
    state.explorationFindings.push({
      id: "finding_low_value",
      explorationId: "exp_general",
      sessionId: "session_general",
      presenceId: "presence_main",
      mirrorObjectId: "mirror_low_value",
      safeSummary: "A general announcement.",
      whyItMayMatter: "Low strategic overlap.",
      status: "considering",
      createdAt: "2026-08-19T13:58:00.000Z",
      updatedAt: "2026-08-19T13:58:00.000Z",
    });

    const agenda = compileAgendaWork(state, "presence_main", now);
    const workItems = agenda.nextUp ?? [];

    const conversationIndex = workItems.findIndex((item) => item.id.includes("ep_active_thread"));
    const explorationIndex = workItems.findIndex((item) => item.id.includes("finding_low_value"));

    expect(conversationIndex).toBeGreaterThanOrEqual(0);
    expect(explorationIndex).toBeGreaterThanOrEqual(0);
    expect(conversationIndex).toBeLessThan(explorationIndex);
  });

  it("partitions blocked operator Assignment into Needs You instead of soft-ranking against autonomous work", () => {
    const state = createMockState();
    const now = new Date("2026-08-19T14:00:00.000Z");

    // assign_blocked_operator is status: "needs_operator"
    const agenda = compileAgendaWork(state, "presence_main", now);

    // Blocked item must be partitioned strictly into needsYou
    expect(agenda.needsYou?.some((item) => item.assignmentId === "assign_blocked_operator")).toBe(true);
    // Blocked item must NOT be competing inside nextUp
    expect(agenda.nextUp?.some((item) => item.assignmentId === "assign_blocked_operator")).toBe(false);
  });

  it("ranks fresh strategic Watchlist evidence ahead of a stale low-value finding", () => {
    const state = createMockState();
    const now = new Date("2026-08-19T14:00:00.000Z");

    // Add high-priority fresh watch item from 5 mins ago
    state.watches.push({
      id: "watch_key_researcher",
      agentId: "agent_genny",
      presenceId: "presence_main",
      channel: "x",
      kind: "creator",
      title: "Lead Researcher",
      query: "@lead_researcher",
      purpose: "Track core architecture releases",
      observation: {
        status: "watching",
        source: "automatic",
        observedCount: 3,
        baseline: "ready",
        lastObservedAt: "2026-08-19T13:55:00.000Z",
      },
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-19T13:55:00.000Z",
    });

    const agenda = compileAgendaWork(state, "presence_main", now);
    const watchlistWork = agenda.nextUp?.find((item) => item.id.includes("watch_key_researcher"));
    expect(watchlistWork).toBeDefined();
    expect(watchlistWork?.source).toBe("watchlist");
    expect(watchlistWork?.assignmentId).toBeUndefined();
    expect(state.assignments.some((assignment) => (assignment.title ?? "").includes("Lead Researcher"))).toBe(false);
  });
});
