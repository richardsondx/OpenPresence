import { describe, expect, it } from "vitest";
import { applyOperation, compileAgendaWork, createAgent, createGrowthReview, deriveGrowthEvidenceSnapshot, deriveSelfDirectedDiscoveryPlan } from "@/lib/runtime";
import { ensureGrowthEvidenceRecords } from "@/lib/social-strategy";
import { parseGrowthReviewDecision } from "@/lib/ai";
import { autonomousGrowthReviewNeed, runAutonomousAttention } from "@/lib/autonomy-worker";
import { listOperationalRuns, upsertRecoveryIncident, writeState } from "@/lib/db";
import { runOperationalSweep } from "@/lib/temporal";
import type { OpenPresenceState } from "@/lib/types";

function fixture(): OpenPresenceState {
  return createAgent({
    name: "Genny",
    description: "An agent for useful software conversations.",
    audience: "AI builders",
    mode: "agent",
    handle: "@genny",
    accent: "#d88b57",
  });
}

describe("Continuous Growth Awareness & Strategy Adaptation", () => {
  it("derives an auditable GrowthEvidenceSnapshot separating activity from outcomes", () => {
    let state = fixture();
    const presenceId = state.presence!.id;
    const presence = { ...state.presence!, environment: "live" as const, createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString() };
    state = { ...state, presence, presences: [presence] };

    // Record observed actions
    state = applyOperation(state, {
      type: "recordAudienceSnapshot",
      presenceId,
      followers: 4,
      following: 10,
      source: "native",
      observedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });

    state = applyOperation(state, {
      type: "recordAudienceSnapshot",
      presenceId,
      followers: 3,
      following: 12,
      source: "native",
      observedAt: new Date().toISOString(),
    });

    const snapshot = deriveGrowthEvidenceSnapshot(state, presenceId);

    expect(snapshot.presenceId).toBe(presenceId);
    expect(snapshot.assignmentId).toBeUndefined();
    expect(snapshot.observedOutcomes.currentFollowers).toBe(3);
    expect(snapshot.observedOutcomes.followerDelta).toBe(-1);
    expect(snapshot.baselineMaturity.periodTargetDays).toBe(7);
    expect(snapshot.metricAvailability.followers).toBe(true);
    expect(snapshot.sourceRefs.length).toBeGreaterThan(0);
  });

  it("attaches Growth evidence to the active Agent-owned responsibility", () => {
    let state = fixture();
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId, environment: "sandbox", instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state = applyOperation(state, { type: "recordAudienceSnapshot", presenceId, followers: 12, source: "sandbox", observedAt: new Date().toISOString() });
    const snapshot = deriveGrowthEvidenceSnapshot(state, presenceId);
    expect(snapshot).toMatchObject({ assignmentId: assignment.id, assignmentPlanRevision: assignment.plan?.revision });
    const records = ensureGrowthEvidenceRecords(state, presenceId);
    expect(records.find((record) => record.kind === "WORLD_OUTCOME")).toMatchObject({ assignmentId: assignment.id, assignmentPlanRevision: assignment.plan?.revision });
  });

  it("compiles Agenda growth-review work item when unreviewed evidence is present", () => {
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders.",
    });
    const assignment = state.assignments[0];
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });

    // Initial state: fresh evidence added
    state = applyOperation(state, {
      type: "recordAudienceSnapshot",
      presenceId,
      followers: 5,
      source: "native",
      observedAt: new Date().toISOString(),
    });

    const agenda = compileAgendaWork(state, presenceId);
    const growthItem = agenda.workItems?.find((item) => item.source === "growth_review");

    expect(growthItem).toBeDefined();
    expect(growthItem?.id).toContain(`growth-review-work:${assignment.id}`);
    expect(growthItem?.state).toBe("ready");
  });

  it("consumes a due Growth review from the headless attention worker", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders.",
    });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    const dueAt = new Date(Date.now() - 60_000).toISOString();
    const persistedAssignment = state.assignments.find((item) => item.id === assignment.id)!;
    persistedAssignment.plan = { ...persistedAssignment.plan!, nextWeeklyReviewAt: dueAt, nextStrategicReviewAt: new Date(Date.now() + 86_400_000).toISOString() };
    writeState(state);

    const need = autonomousGrowthReviewNeed(state, presenceId);
    expect(need).toMatchObject({ assignment: { id: assignment.id }, kind: "weekly" });

    const next = await runAutonomousAttention(presenceId);
    expect(next.growthReviews?.[0]).toMatchObject({ assignmentId: assignment.id, kind: "weekly" });
    expect(next.events.some((event) => event.title === "Growth review started")).toBe(true);
    expect(next.events.some((event) => event.title === "Growth review persisted")).toBe(true);
    expect(next.assignments.find((item) => item.id === assignment.id)?.plan?.nextWeeklyReviewAt).not.toBe(dueAt);
  });

  it("keeps model-only Growth reconsideration runnable when channel attention is operator-gated", () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = fixture();
    const presenceId = state.presence!.id;
    const livePresence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state = { ...state, presence: livePresence, presences: [livePresence] };
    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders.",
    });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    const persistedAssignment = state.assignments.find((item) => item.id === assignment.id)!;
    persistedAssignment.plan = { ...persistedAssignment.plan!, nextWeeklyReviewAt: new Date(Date.now() - 60_000).toISOString() };
    writeState(state);
    const incidentAt = new Date().toISOString();
    upsertRecoveryIncident({
      id: "incident_growth_review_channel_gate",
      rootCauseKey: "native_x.credits_exhausted",
      dependencyId: `native_x:${presenceId}`,
      presenceId,
      state: "needs_operator",
      openedAt: incidentAt,
      lastObservedAt: incidentAt,
      affectedRunIds: [],
      recoveryAttempts: 0,
      safeSummary: "Channel credits are exhausted.",
      operatorActionRequired: true,
      updatedAt: incidentAt,
    });

    runOperationalSweep();
    const reconsideration = listOperationalRuns(presenceId).find((run) => run.kind === "reconsideration" && run.sourceRef === assignment.id);
    expect(reconsideration).toBeDefined();
    expect(reconsideration?.metadata).toMatchObject({ work: "growth_review", kind: "weekly" });
  });

  it("creates a GrowthRevision and updates GROWTH.md when strategyChanged is true", () => {
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders.",
    });
    const assignment = state.assignments[0];
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });

    state = applyOperation(state, {
      type: "recordAudienceSnapshot",
      presenceId,
      followers: 10,
      source: "native",
      observedAt: new Date().toISOString(),
    });

    const decision = {
      summary: "Observed flat reach on broad commentary. Shifting strategy to technical tear-downs and direct builder replies.",
      working: ["Direct replies to engineers have 3x response rate."],
      uncertain: ["Baseline follower velocity is still young."],
      weak: ["Broad commentary posts have sub-100 impressions."],
      strategyChanged: true,
      rationale: "Align tactical publishing and discovery with high-engagement builder discussions.",
      plan: {
        summary: "Focus on practical open-source tool tear-downs and direct builder engagement.",
        publishingApproach: ["Detailed code walkthroughs", "Technical tradeoffs"],
        discoveryDirections: ["Open source AI projects", "Model evaluations"],
      },
    };

    const nextState = createGrowthReview(state, assignment, "event_driven", decision);

    expect(nextState.growthReviews).toHaveLength(1);
    const review = nextState.growthReviews[0];
    expect(review.strategyChanged).toBe(true);
    expect(review.resultingGrowthRevisionRef).toBeDefined();

    expect(nextState.growthRevisions).toHaveLength(1);
    const revision = nextState.growthRevisions![0];
    expect(revision.id).toBe(review.resultingGrowthRevisionRef);
    expect(revision.plan.summary).toContain("open-source tool tear-downs");

    const growthFile = nextState.files.find((f) => f.kind === "GROWTH");
    expect(growthFile?.content).toContain("open-source tool tear-downs");
    expect(growthFile?.content).toContain("Direct replies to engineers have 3x response rate.");

    const presence = nextState.presences.find((p) => p.id === presenceId);
    expect(presence?.activeGrowthRevisionRef).toBe(revision.id);
  });

  it("does not inherit a previous Presence responsibility's Growth revision", () => {
    let state = fixture();
    const presenceId = state.presence!.id;
    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers.",
    });
    const previousAssignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: previousAssignment.id });
    const firstDecision = {
      summary: "First responsibility strategy.", working: [], uncertain: [], weak: [], strategyChanged: true,
      plan: { summary: "First responsibility plan." },
    };
    state = createGrowthReview(state, previousAssignment, "weekly", firstDecision);
    const previousRevision = state.presences.find((item) => item.id === presenceId)?.activeGrowthRevisionRef;

    state = applyOperation(state, { type: "createAssignment", presenceId, environment: "live", instruction: "Grow this Presence toward 20,000 followers." });
    const currentAssignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: currentAssignment.id });
    const next = createGrowthReview(state, currentAssignment, "weekly", {
      summary: "Second responsibility strategy.", working: [], uncertain: [], weak: [], strategyChanged: true,
      plan: { summary: "Second responsibility plan." },
    });

    expect(previousRevision).toBeDefined();
    expect(next.growthRevisions?.[0]?.previousRevisionRef).toBeUndefined();
  });

  it("records GrowthReview without creating GrowthRevision when strategyChanged is false", () => {
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers while building an audience of AI founders.",
    });
    const assignment = state.assignments[0];
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });

    const decision = {
      summary: "Sample is still too early to conclude the strategy needs a pivot. Holding current approach.",
      working: [],
      uncertain: ["Only 2 days of baseline observed."],
      weak: [],
      strategyChanged: false,
      rationale: "Do not overreact to minor noise during baseline initialization.",
    };

    const nextState = createGrowthReview(state, assignment, "event_driven", decision);

    expect(nextState.growthReviews).toHaveLength(1);
    const review = nextState.growthReviews[0];
    expect(review.strategyChanged).toBe(false);
    expect(review.resultingGrowthRevisionRef).toBeUndefined();
    expect(nextState.growthRevisions).toHaveLength(0);
  });

  it("strictly preserves identity invariants during growth revisions", () => {
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers.",
    });
    const assignment = state.assignments[0];
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });

    const identityFilesBefore = Object.fromEntries(
      state.files.filter((f) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(f.kind)).map((f) => [f.kind, f.content])
    );

    const decision = {
      summary: "Growth strategy revision test.",
      working: ["Working item"],
      uncertain: [],
      weak: [],
      strategyChanged: true,
      plan: {
        summary: "Revised publishing strategy.",
      },
    };

    const nextState = createGrowthReview(state, assignment, "weekly", decision);

    const identityFilesAfter = Object.fromEntries(
      nextState.files.filter((f) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(f.kind)).map((f) => [f.kind, f.content])
    );

    expect(identityFilesAfter).toEqual(identityFilesBefore);
  });

  it("stamps growthRevisionRef onto derived self-directed discovery plan", () => {
    let state = fixture();
    const presenceId = state.presence!.id;

    state = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Grow this Presence toward 10,000 followers.",
    });
    const assignment = state.assignments[0];
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });

    const decision = {
      summary: "Shift discovery to AI engineer communities.",
      working: [],
      uncertain: [],
      weak: [],
      strategyChanged: true,
      plan: {
        summary: "Shift to AI engineer communities.",
        discoveryDirections: ["AI engineer discussions"],
      },
    };

    const nextState = createGrowthReview(state, assignment, "weekly", decision);
    const presence = nextState.presences.find((p) => p.id === presenceId);
    expect(presence?.activeGrowthRevisionRef).toBeDefined();

    const discoveryPlan = deriveSelfDirectedDiscoveryPlan(nextState, presenceId);
    expect(discoveryPlan?.growthRevisionRef).toBe(presence?.activeGrowthRevisionRef);
  });

  it("parses growth review decisions correctly with strategyChanged flag", () => {
    const rawChanged = JSON.stringify({
      summary: "Adapted approach based on weak reach.",
      working: ["Technical threads"],
      uncertain: ["Timing"],
      weak: ["Generic takes"],
      strategyChanged: true,
      rationale: "Evidence indicates generic takes fail to generate discussion.",
      plan: {
        summary: "Technical threads only",
      },
    });

    const parsed1 = parseGrowthReviewDecision(rawChanged);
    expect(parsed1?.strategyChanged).toBe(true);
    expect(parsed1?.plan?.summary).toBe("Technical threads only");

    const rawUnchanged = JSON.stringify({
      summary: "Maintaining strategy; evidence within expected parameters.",
      working: [],
      uncertain: ["Sample size"],
      weak: [],
      strategyChanged: false,
      rationale: "No change warranted.",
    });

    const parsed2 = parseGrowthReviewDecision(rawUnchanged);
    expect(parsed2?.strategyChanged).toBe(false);
    expect(parsed2?.plan).toBeUndefined();
  });
});
