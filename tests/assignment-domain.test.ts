import { describe, expect, it } from "vitest";
import { applyOperation, assignmentIsCurrentlyProcessing, assignmentProgressLabel, compileAssignmentInstruction, createAgent, normalizeState, preflightAssignment } from "../lib/runtime";
import { evaluateExecutionReadiness } from "../lib/execution-readiness";
import { classifyLiveAssignmentRun, liveAssignmentRunStage, reconcileLiveAssignmentRuns } from "../lib/live-assignment-run";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("canonical Assignment domain", () => {
  it("compiles one clear completion contract without exposing Consider vs Assign", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish one useful lesson about persistent agents Tuesday morning.", state.presence!.id, "sandbox", undefined, { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" });
    expect(assignment.deliverable.type).toBe("original_publication");
    expect(assignment.preflight).toMatchObject({ status: "ready", contract: { successEvidence: expect.stringContaining("confirmed") } });
  });

  it("persists the Schedule objective for List and Week projections", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox", objective: "education", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    expect(next.assignments[0]?.objective).toBe("education");
  });

  it("does not treat a draft's initial work phase as active processing", () => {
    const state = createAgent(input);
    const assignment = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } }).assignments[0]!;

    expect(assignment.status).toBe("draft");
    expect(assignment.work?.phase).toBe("candidate_review");
    expect(assignmentIsCurrentlyProcessing(assignment)).toBe(false);
  });

  it("shows only a durable active run or execution status as processing", () => {
    const state = createAgent(input);
    const assignment = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox" }).assignments[0]!;
    const queuedRun = {
      id: "assignment-run:test",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "session:test",
      status: "queued" as const,
      currentStage: "researching" as const,
      attempts: 0,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    };

    expect(assignmentIsCurrentlyProcessing(assignment, [queuedRun])).toBe(true);
    expect(assignmentIsCurrentlyProcessing(assignment, [{ ...queuedRun, status: "delivery_pending" }])).toBe(true);
    expect(assignmentIsCurrentlyProcessing({ ...assignment, status: "working" }, [])).toBe(true);
    expect(assignmentIsCurrentlyProcessing({ ...assignment, status: "active" }, [])).toBe(false);
  });

  it("describes continuous Assignment progress without a zero denominator", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Maintain a useful original presence when there is something worth publishing.", state.presence!.id, "live");
    assignment.activation = { type: "continuous" };
    assignment.progress = { required: 0, verified: 10 };

    expect(assignmentProgressLabel(assignment)).toBe("10 verified outcomes · ongoing");
  });

  it("repairs a legacy active Assignment whose durable run already failed", () => {
    const state = createAgent(input);
    const assignment = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox" }).assignments[0]!;
    const legacy = {
      ...assignment,
      status: "active" as const,
      lastOutcome: {
        class: "evaluation_failed" as const,
        message: "The configured model is missing its provider credential.",
        at: "2026-08-23T17:45:19.966Z",
      },
    };

    const repaired = normalizeState({ ...state, assignments: [legacy], assignmentRuns: [{
      id: "assignment-run:published",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "session:test",
      status: "published" as const,
      currentStage: "publishing" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: assignment.createdAt,
      updatedAt: "2026-08-23T17:45:21.038Z",
    }] }).assignments[0]!;

    expect(repaired.status).toBe("needs_operator");
    expect(repaired.work).toMatchObject({ phase: "blocked", blockedReason: legacy.lastOutcome.message });
  });

  it("turns evaluation-only language into a report deliverable", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Evaluate whether we should respond to this controversy Friday morning.", state.presence!.id, "sandbox", undefined, { day: "Friday", time: "09:00", executionWindow: "09:00–12:00" });
    expect(assignment.deliverable.type).toBe("decision_report");
    expect(assignment.preflight?.semanticSummary).toContain("does not require a public response");
  });

  it("keeps materially unclear work in preflight instead of activating it", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Think about our pricing announcement Friday.", presenceId: state.presence!.id, environment: "sandbox" });
    const assignment = state.assignments[0]!;
    expect(assignment.preflight?.status).toBe("needs_input");
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    expect(state.assignments[0]?.status).toBe("draft");
  });

  it("rechecks live authority before activation", () => {
    let state = createAgent(input);
    state.presence!.execution.post = "off";
    state.presences[0]!.execution.post = "off";
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const assignment = state.assignments[0]!;
    expect(assignment.preflight?.status).toBe("blocked");
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    expect(state.assignments[0]?.status).toBe("draft");
  });

  it("recomputes stale live preflight after the native X connection is repaired", () => {
    let state = createAgent(input);
    const presence = state.presence!;
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: presence.id, environment: "live", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const assignment = state.assignments[0]!;
    state.nativeConnections.push({
      id: "native-test",
      presenceId: presence.id,
      channelId: "x",
      kind: "x",
      status: "connected",
      access: "read-write",
      account: { id: "acct", username: presence.handle!.replace(/^@/, ""), name: presence.name },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const readiness = evaluateExecutionReadiness({ presence, channel: "x", affordance: "post", state, environment: "live" });
    expect(readiness.disposition).toBe("ready");
    const stale = { ...assignment, preflight: { ...assignment.preflight!, status: "needs_input" as const, issues: ["stale connector warning"] } };
    expect(preflightAssignment(state, stale, stale.executionPolicy.delegationPolicy).status).toBe("ready");
  });

  it("keeps delivered runs separate from parent Assignment verification", () => {
    const published = classifyLiveAssignmentRun({ assignmentStatus: "active", newlySucceededExecution: true });
    expect(published).toBe("published");
    expect(liveAssignmentRunStage(published)).toBe("completed");
    expect(classifyLiveAssignmentRun({ outcomeClass: "action_no_op", assignmentStatus: "active", newlySucceededExecution: false })).toBe("deferred");
    expect(classifyLiveAssignmentRun({ outcomeClass: "delivery_failed", assignmentStatus: "active", newlySucceededExecution: false })).toBe("blocked");
    expect(classifyLiveAssignmentRun({ assignmentStatus: "awaiting_execution", newlySucceededExecution: false, deliveryPending: true })).toBe("delivery_pending");
    expect(liveAssignmentRunStage("delivery_pending")).toBe("publishing");
  });

  it("keeps an unclaimed connector delivery pending instead of leaving a researching orphan", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "working";
    const run = {
      id: "assignment-run:pending",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "failed" as const,
      currentStage: "blocked" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: "2026-08-24T07:04:00.000Z",
      createdAt: "2026-08-24T07:04:00.000Z",
      updatedAt: "2026-08-24T07:04:10.000Z",
      completedAt: "2026-08-24T07:04:10.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = [{
      id: "execution:pending",
      socialIntentId: "intent:pending",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.post",
      mode: "auto",
      status: "queued",
      attempts: 0,
      connector: "bridge",
      bridgeId: "bridge:test",
      idempotencyKey: "pending",
      createdAt: "2026-08-24T07:04:08.000Z",
      updatedAt: "2026-08-24T07:04:08.000Z",
      environment: "live",
    }];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-24T07:04:20.000Z"));
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "delivery_pending", currentStage: "publishing", leaseOwner: undefined });
    expect(reconciled.assignments.find((item) => item.id === assignment.id)).toMatchObject({ status: "awaiting_execution", work: { phase: "publishing" } });
  });

  it("reopens an Assignment with a bounded retry after a retryable delivery window expires", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "needs_operator";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "The delivery window expired before an authorized connector claimed this action." };
    const run = {
      id: "assignment-run:expired",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "failed" as const,
      currentStage: "blocked" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: "2026-08-24T07:04:00.000Z",
      createdAt: "2026-08-24T07:04:00.000Z",
      updatedAt: "2026-08-24T07:49:11.000Z",
      completedAt: "2026-08-24T07:49:11.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = [{
      id: "execution:expired",
      socialIntentId: "intent:expired",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.post",
      mode: "auto",
      status: "expired",
      attempts: 0,
      connector: "bridge",
      bridgeId: "bridge:test",
      idempotencyKey: "expired",
      failure: { code: "INTENT_EXPIRED_BEFORE_CLAIM", message: "The delivery window expired before an authorized connector claimed this action.", retryable: true },
      createdAt: "2026-08-24T07:04:08.000Z",
      updatedAt: "2026-08-24T07:49:11.000Z",
      environment: "live",
    }];

    const now = Date.parse("2026-08-24T08:00:00.000Z");
    const reconciled = reconcileLiveAssignmentRuns(state, now);
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "failed", currentStage: "blocked" });
    const recoveredAssignment = reconciled.assignments.find((item) => item.id === assignment.id)!;
    expect(recoveredAssignment).toMatchObject({ status: "active", lastOutcome: { class: "delivery_failed" }, work: { phase: "candidate_review" } });
    expect(Date.parse(recoveredAssignment.nextDueAt!)).toBe(now + 15 * 60_000);

    // A later health/read pass must not push the same retry wake forward
    // again; the scheduler needs to see the overdue wake and claim it.
    const later = reconcileLiveAssignmentRuns(reconciled, now + 20 * 60_000);
    expect(later.assignments.find((item) => item.id === assignment.id)?.nextDueAt).toBe(recoveredAssignment.nextDueAt);
  });

  it("does not reactivate a reviewed non-retryable delivery failure", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Saturday", time: "07:00", executionWindow: "07:00–10:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "active";
    const run = {
      id: "assignment-run:reviewed-expired",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "failed" as const,
      currentStage: "blocked" as const,
      attempts: 4,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: "2026-08-24T07:04:00.000Z",
      createdAt: "2026-08-24T07:04:00.000Z",
      updatedAt: "2026-08-24T07:49:11.000Z",
      completedAt: "2026-08-24T07:49:11.000Z",
    };
    state.assignmentRuns = [run];
    const message = "The delivery window expired before an authorized connector claimed this action.";
    state.executions = [{
      id: "execution:reviewed-expired",
      socialIntentId: "intent:reviewed-expired",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.post",
      mode: "auto",
      status: "expired",
      attempts: 0,
      connector: "bridge",
      bridgeId: "bridge:test",
      idempotencyKey: "reviewed-expired",
      failure: { code: "INTENT_EXPIRED_BEFORE_CLAIM", message, retryable: false, reviewedAt: "2026-08-24T07:49:11.000Z", reviewDisposition: "stale" },
      createdAt: "2026-08-24T07:04:08.000Z",
      updatedAt: "2026-08-24T07:49:11.000Z",
      environment: "live",
    }];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-24T08:00:00.000Z"));
    expect(reconciled.assignments.find((item) => item.id === assignment.id)).toMatchObject({
      status: "needs_operator",
      lastOutcome: { class: "delivery_failed", message },
      work: { phase: "blocked", blockedReason: message },
    });
    expect(reconciled.assignments.find((item) => item.id === assignment.id)?.nextDueAt).toBeUndefined();
  });

  it("closes an X already-published rejection without retrying or asking the operator", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Quote one useful AI agent post.", presenceId: state.presence!.id, environment: "live" });
    const assignment = state.assignments[0]!;
    assignment.status = "needs_operator";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "X rejected the quote: Whoops! You already said that." };
    assignment.lastOutcome = { class: "delivery_failed", message: "X rejected the quote: Whoops! You already said that.", at: "2026-08-25T19:44:26.758Z" };
    state.assignmentRuns = [{
      id: "assignment-run:duplicate",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "failed",
      currentStage: "blocked",
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: "2026-08-25T19:34:54.646Z",
      updatedAt: "2026-08-25T19:44:26.758Z",
      completedAt: "2026-08-25T19:44:26.758Z",
    }];
    state.executions = [{
      id: "execution:duplicate",
      socialIntentId: "intent:duplicate",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: "assignment-run:duplicate",
      affordance: "x.quote",
      mode: "auto",
      status: "failed",
      attempts: 1,
      connector: "bridge",
      idempotencyKey: "duplicate",
      failure: { code: "DUPLICATE_PUBLICATION", message: "X rejected the quote: Whoops! You already said that.", retryable: false },
      createdAt: "2026-08-25T19:34:54.646Z",
      updatedAt: "2026-08-25T19:44:26.758Z",
      environment: "live",
    }];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-25T19:45:00.000Z"));
    expect(reconciled.assignments[0]).toMatchObject({
      status: "failed",
      progress: { verified: 0 },
      work: { phase: "completed", blockedReason: undefined },
      lastOutcome: { class: "delivery_failed", message: expect.stringContaining("will not send it again") },
      nextDueAt: undefined,
    });
    expect(reconciled.executions[0]?.failure).toMatchObject({ retryable: false, reviewDisposition: "closed_non_retryable", reviewedAt: expect.any(String) });
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "failed", currentStage: "completed" });

    const migrated = normalizeState({ ...state, assignments: [{ ...assignment, status: "needs_operator" }] });
    expect(migrated.assignments[0]?.status).toBe("failed");
  });

  it("keeps quantity language distinct and accepts legacy aliases", () => {
    const state = createAgent(input);
    expect(compileAssignmentInstruction(state, "up to 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "at_most", period: "day" });
    expect(compileAssignmentInstruction(state, "aim for 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "target", period: "day" });
    expect(compileAssignmentInstruction(state, "at least 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "at_least", period: "day" });
    expect(compileAssignmentInstruction(state, "exactly 5 original posts").quantityPolicy).toMatchObject({ quantity: 5, mode: "exact" });

    const { quantityPolicy: _legacyPolicy, ...legacyBase } = compileAssignmentInstruction(state, "Produce one post");
    const legacy = { ...legacyBase, deliverable: { type: "original_publication", quantity: 5, quantityMode: "maximum" as const } };
    expect(normalizeState({ ...state, assignments: [legacy] }).assignments[0]?.quantityPolicy).toMatchObject({ quantity: 5, mode: "at_most" });
  });

  it("materializes one linked Publishing Initiative Assignment and updates it in place", () => {
    let state = createAgent(input);
    const presence = state.presence!;
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...presence.publishingInitiative, mode: "pace", target: { count: 5, period: "day" } } } });
    const first = state.assignments.find((item) => item.origin === "publishing_initiative");
    expect(first).toMatchObject({ origin: "publishing_initiative", activation: { type: "continuous" }, deliverable: { type: "original_publication", quantity: 5, quantityMode: "target" }, quantityPolicy: { quantity: 5, mode: "target", period: "day" } });
    expect(state.presence?.publishingInitiative.assignmentId).toBe(first?.id);

    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const updated = state.assignments.find((item) => item.id === first?.id);
    expect(state.assignments.filter((item) => item.origin === "publishing_initiative")).toHaveLength(1);
    expect(updated).toMatchObject({ deliverable: { type: "maintain_original_presence" }, quantityPolicy: { quantity: "agent_planned" } });

    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "off" } } });
    expect(state.presence?.publishingInitiative.assignmentId).toBeUndefined();
    expect(state.assignments.find((item) => item.id === first?.id)?.status).toBe("paused");
  });

  it("compiles autonomous Exploration engagement into the same Assignment primitive", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find founders struggling with persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    const assignment = state.assignments.find((item) => item.id === state.explorations[0]?.engagement?.assignmentId);
    expect(assignment).toMatchObject({ origin: "exploration", activation: { type: "attention_source", sourceIds: [exploration.id] }, deliverable: { type: "meaningful_engagement" }, quantityPolicy: { quantity: "agent_planned" } });
    expect(state.explorations[0]?.engagement?.mode).toBe("opportunistic");
  });
});
