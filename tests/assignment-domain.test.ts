import { describe, expect, it } from "vitest";
import { applyOperation, assertAssignmentPersistenceInvariant, assignmentIsCurrentlyProcessing, assignmentProgressLabel, compileAssignmentInstruction, createAgent, normalizeState, preflightAssignment } from "../lib/runtime";
import { evaluateExecutionReadiness } from "../lib/execution-readiness";
import { assignmentRunBlocksNewWork, classifyLiveAssignmentRun, isAutonomousPreWriteDeliveryFailure, liveAssignmentRunStage, maxConcurrentPursuitDeliveries, reconcileLiveAssignmentRuns } from "../lib/live-assignment-run";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("canonical Assignment domain", () => {
  it("repairs legacy slot-shaped records without losing their calendar-linked identity", () => {
    const state = createAgent(input);
    const presence = state.presence!;
    const legacy = {
      id: "slot_legacy_assignment",
      label: "Notice one useful pattern in founder conversations",
      instruction: "Notice one useful pattern in founder conversations",
      day: "Tuesday",
      time: "08:00",
      objective: "audience_growth",
      presence: presence.id,
      mode: "auto" as const,
      enabled: true,
      executionWindow: "08:00–11:00",
    };
    const normalized = normalizeState({
      ...state,
      assignments: [legacy] as never,
      calendar: [{ ...legacy, assignmentId: "assignment_historical_link" }],
    });
    const assignment = normalized.assignments[0]!;
    expect(assignment.id).toBe("assignment_historical_link");
    expect(assignment.presenceId).toBe(presence.id);
    expect(assignment.environment).toBe(presence.environment ?? "sandbox");
    expect(assignment.schedule).toMatchObject({ day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" });
    expect(assignment.activation?.type).toBe("scheduled");
    expect(normalized.calendar[0]?.assignmentId).toBe(assignment.id);
  });

  it("fails closed when a workspace still contains an unowned Assignment", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish one useful lesson about persistent agents.", state.presence!.id, "sandbox");
    expect(() => assertAssignmentPersistenceInvariant({ ...state, assignments: [{ ...assignment, presenceId: "presence_missing" }] })).toThrow(/refusing to save/);
  });

  it("compiles one clear completion contract without exposing Consider vs Assign", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish one useful lesson about persistent agents Tuesday morning.", state.presence!.id, "sandbox", undefined, { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" });
    expect(assignment.deliverable.type).toBe("original_publication");
    expect(assignment.preflight).toMatchObject({ status: "ready", contract: { successEvidence: expect.stringContaining("confirmed") } });
  });

  it("treats a dated schedule as weekly unless the instruction explicitly says once", () => {
    const state = createAgent(input);
    const schedule = { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" };
    const recurring = compileAssignmentInstruction(state, "Quote one useful AI agent post.", state.presence!.id, "live", undefined, schedule);
    const oneTime = compileAssignmentInstruction(state, "Quote one useful AI agent post once.", state.presence!.id, "live", undefined, schedule);

    expect(recurring.recurrence).toMatchObject({ kind: "weekly", label: "Every week" });
    expect(oneTime.recurrence).toMatchObject({ kind: "once", label: "Once" });
  });

  it("persists the Schedule objective for List and Week projections", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox", objective: "education", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    expect(next.assignments[0]?.objective).toBe("education");
  });

  it("edits an Assignment in place and refreshes its completion contract", () => {
    const state = createAgent(input);
    const createdState = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox", objective: "education", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const created = createdState.assignments[0]!;
    const next = applyOperation(createdState, { type: "updateAssignment", id: created.id, instruction: "Publish exactly 2 original lessons about trustworthy software.", objective: "audience_growth", schedule: null });
    const edited = next.assignments[0]!;

    expect(edited.id).toBe(created.id);
    expect(edited.instruction).toContain("exactly 2");
    expect(edited.progress.required).toBe(2);
    expect(edited.objective).toBe("audience_growth");
    expect(edited.schedule).toBeUndefined();
    expect(edited.revision).toBe((created.revision ?? 0) + 1);
    expect(next.events[0]?.title).toBe("Assignment updated");
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

  it("does not let non-retryable verification freeze an active distribution push", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Find one useful builder conversation.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Daily", time: "08:00", executionWindow: "08:00–18:00" } });
    const assignment = state.assignments[0]!;
    const run = {
      id: "assignment-run:uncertain",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: `live:${assignment.presenceId}`,
      pursuitWindowId: "pursuit:active",
      status: "delivery_pending" as const,
      currentStage: "publishing" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: "2026-08-29T03:10:00.000Z",
      createdAt: "2026-08-29T03:10:00.000Z",
      updatedAt: "2026-08-29T03:12:00.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = [{
      id: "execution:uncertain",
      socialIntentId: "intent:uncertain",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.reply",
      mode: "auto",
      status: "verification-pending",
      attempts: 1,
      connector: "bridge",
      idempotencyKey: "uncertain",
      failure: { code: "X_API_CREDITS_EXHAUSTED", message: "The X API has no credits remaining.", retryable: false },
      createdAt: "2026-08-29T03:11:00.000Z",
      updatedAt: "2026-08-29T03:12:00.000Z",
      environment: "live",
    } as never];

    expect(assignmentRunBlocksNewWork(state, run)).toBe(false);
    state.executions[0]!.failure!.retryable = true;
    expect(assignmentRunBlocksNewWork(state, run)).toBe(true);
  });

  it("pipelines a bounded number of distinct pursuit deliveries while verification catches up", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Help this post reach relevant builders.", presenceId: state.presence!.id, environment: "live" });
    const assignment = state.assignments[0]!;
    assignment.status = "working";
    const pursuitId = "pursuit:pipeline";
    state.assignmentPursuitWindows = [{
      id: pursuitId,
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      startsAt: "2026-08-29T03:00:00.000Z",
      deadlineAt: "2026-08-29T07:00:00.000Z",
      maxVerifiedActions: 40,
      status: "active",
    }];
    const run = {
      id: "assignment-run:pipeline",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: `live:${assignment.presenceId}`,
      pursuitWindowId: pursuitId,
      status: "delivery_pending" as const,
      currentStage: "publishing" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: "2026-08-29T03:10:00.000Z",
      createdAt: "2026-08-29T03:10:00.000Z",
      updatedAt: "2026-08-29T03:12:00.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = Array.from({ length: maxConcurrentPursuitDeliveries - 1 }, (_, index) => ({
      id: `execution:pipeline:${index}`,
      socialIntentId: `intent:pipeline:${index}`,
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.reply",
      mode: "auto",
      status: "verification-pending",
      attempts: 1,
      connector: "bridge",
      idempotencyKey: `pipeline:${index}`,
      failure: { code: "X_API_VERIFICATION_PENDING", retryable: true },
      createdAt: "2026-08-29T03:11:00.000Z",
      updatedAt: "2026-08-29T03:12:00.000Z",
      environment: "live",
    } as never));

    expect(assignmentRunBlocksNewWork(state, run)).toBe(false);
    state.executions.push({ ...state.executions[0], id: "execution:pipeline:final" } as never);
    expect(assignmentRunBlocksNewWork(state, run)).toBe(true);
  });

  it("does not let an old stale candidate re-block an active distribution push", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Help this post reach relevant builders.", presenceId: state.presence!.id, environment: "live" });
    const assignment = state.assignments[0]!;
    assignment.status = "active";
    state.assignmentPursuitWindows = [{
      id: "pursuit:active",
      assignmentId: assignment.id,
      presenceId: assignment.presenceId,
      startsAt: "2026-08-29T03:00:00.000Z",
      deadlineAt: "2026-08-29T07:00:00.000Z",
      maxVerifiedActions: 10,
      status: "active",
    }];
    const run = {
      id: "assignment-run:stale-candidate",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: `live:${assignment.presenceId}`,
      pursuitWindowId: "pursuit:active",
      status: "failed" as const,
      currentStage: "blocked" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: "2026-08-29T03:10:00.000Z",
      updatedAt: "2026-08-29T03:11:00.000Z",
      completedAt: "2026-08-29T03:11:00.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = [{
      id: "execution:stale-candidate",
      socialIntentId: "intent:stale-candidate",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.reply",
      mode: "auto",
      status: "blocked",
      attempts: 1,
      connector: "native",
      idempotencyKey: "stale-candidate",
      failure: { code: "TARGET_LANGUAGE_MISMATCH", message: "The target x.post is not available in the Social Mirror, so its language cannot be confirmed.", retryable: false },
      createdAt: "2026-08-29T03:10:30.000Z",
      updatedAt: "2026-08-29T03:11:00.000Z",
      environment: "live",
    } as never];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-29T03:12:00.000Z"));
    expect(reconciled.assignments[0]?.status).not.toBe("needs_operator");
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

  it("autonomously closes a stale pre-write Bridge miss instead of asking the operator", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Share one specific lesson about trustworthy software once.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Thursday", time: "15:00", executionWindow: "15:00–18:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "needs_operator";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 2, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", attempts: 2, blockedReason: "The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted." };
    assignment.lastOutcome = { class: "delivery_failed", message: "The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted.", at: "2026-08-27T23:35:38.872Z" };
    const runId = "assignment-run:stale-bridge";
    state.assignmentRuns = [{ id: runId, assignmentId: assignment.id, agentId: assignment.agentId, presenceId: assignment.presenceId, sessionId: "live:test", status: "failed", currentStage: "blocked", attempts: 2, maxAttempts: 4, rejectedCandidates: 0, createdAt: "2026-08-27T23:35:38.085Z", updatedAt: "2026-08-27T23:35:39.266Z", completedAt: "2026-08-27T23:35:39.266Z", lastError: assignment.lastOutcome.message }];
    state.executions = [{ id: "execution:stale-bridge", socialIntentId: "intent:stale-bridge", presenceId: assignment.presenceId, assignmentId: assignment.id, runId, affordance: "x.post", mode: "auto", status: "failed", attempts: 1, connector: "bridge", bridgeId: "bridge:stale", idempotencyKey: "stale-bridge", failure: { code: "BRIDGE_NOT_CHECKED_IN", message: assignment.lastOutcome.message, retryable: true, reviewedAt: "2026-08-27T23:35:39.200Z", reviewDisposition: "stale" }, createdAt: "2026-08-27T23:35:38.100Z", updatedAt: "2026-08-27T23:35:39.266Z", environment: "live" } as never];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-29T04:00:00.000Z"));
    expect(reconciled.assignments[0]).toMatchObject({
      status: "expired_incomplete",
      progress: { verified: 0 },
      work: { phase: "completed", blockedReason: undefined },
      lastOutcome: { class: "incomplete", message: expect.stringContaining("no public action was sent") },
      nextDueAt: undefined,
    });
    expect(reconciled.executions[0]).toMatchObject({ status: "failed", failure: { code: "BRIDGE_NOT_CHECKED_IN", retryable: false, reviewDisposition: "closed_non_retryable", reviewedAt: expect.any(String) } });
    expect(reconciled.executions[0]?.externalRef).toBeUndefined();
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "failed", lastError: expect.stringContaining("no public action was sent") });
  });

  it("does not treat a terminally closed pre-write miss as fresh work", () => {
    expect(isAutonomousPreWriteDeliveryFailure({
      status: "failed",
      failure: { code: "BRIDGE_NOT_CHECKED_IN", retryable: false },
    })).toBe(false);
  });

  it("releases a recurring pre-write miss to its next scheduled occurrence", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Share a useful lesson daily.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Daily", time: "08:00", executionWindow: "08:00–18:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "needs_operator";
    assignment.recurrence = { kind: "daily", label: "Every day" };
    assignment.activation = { type: "scheduled", recurrence: assignment.recurrence };
    const failureMessage = "The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted.";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: failureMessage };
    assignment.lastOutcome = { class: "delivery_failed", message: failureMessage, at: "2026-08-28T18:00:00.000Z" };
    const runId = "assignment-run:recurring-stale-bridge";
    state.assignmentRuns = [{ id: runId, assignmentId: assignment.id, agentId: assignment.agentId, presenceId: assignment.presenceId, sessionId: "live:test", status: "failed", currentStage: "blocked", attempts: 1, maxAttempts: 4, rejectedCandidates: 0, createdAt: "2026-08-28T18:00:00.000Z", updatedAt: "2026-08-28T18:00:02.000Z", completedAt: "2026-08-28T18:00:02.000Z" }];
    state.executions = [{ id: "execution:recurring-stale-bridge", socialIntentId: "intent:recurring-stale-bridge", presenceId: assignment.presenceId, assignmentId: assignment.id, runId, affordance: "x.post", mode: "auto", status: "failed", attempts: 1, connector: "bridge", bridgeId: "bridge:stale", idempotencyKey: "recurring-stale-bridge", failure: { code: "BRIDGE_NOT_CHECKED_IN", message: failureMessage, retryable: true, reviewedAt: "2026-08-28T18:00:02.000Z", reviewDisposition: "stale" }, createdAt: "2026-08-28T18:00:00.100Z", updatedAt: "2026-08-28T18:00:02.000Z", environment: "live" } as never];

    const now = Date.parse("2026-08-29T20:00:00.000Z");
    const reconciled = reconcileLiveAssignmentRuns(state, now);
    expect(reconciled.assignments[0]).toMatchObject({ status: "active", progress: { verified: 0 }, work: { phase: "candidate_review", attempts: 0, blockedReason: undefined }, lastOutcome: { class: "delivery_failed" } });
    expect(Date.parse(reconciled.assignments[0]!.nextDueAt!)).toBeGreaterThan(now);
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "deferred", currentStage: "candidate_review" });
  });

  it("does not attach an old unbound execution to a new Assignment run", () => {
    const state = createAgent(input);
    const assignment = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live" }).assignments[0]!;
    const runCreatedAt = "2026-08-26T00:00:00.000Z";
    state.assignmentRuns = [{
      id: "assignment-run:retry",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "queued",
      currentStage: "researching",
      attempts: 2,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt,
    }];
    state.executions = [{
      id: "execution:old",
      socialIntentId: "intent:old",
      presenceId: assignment.presenceId,
      assignmentId: assignment.id,
      affordance: "x.reply",
      mode: "auto",
      status: "blocked",
      attempts: 0,
      connector: "native",
      idempotencyKey: "old",
      failure: { code: "TARGET_LANGUAGE_MISMATCH", message: "old failure", retryable: false },
      createdAt: "2026-08-25T23:18:09.930Z",
      updatedAt: "2026-08-25T23:18:10.053Z",
      environment: "live",
    }];

    const normalized = normalizeState(state);
    expect(normalized.assignmentRuns?.[0]?.status).toBe("queued");
    expect(normalized.assignmentRuns?.[0]?.lastError).toBeUndefined();
    expect(normalized.assignmentRuns?.[0]?.completedAt).toBeUndefined();
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

  it("does not let a cross-Presence execution block the current Assignment run", () => {
    const state = createAgent(input);
    const assignment = applyOperation(state, { type: "createAssignment", instruction: "Help this post reach relevant builders.", presenceId: state.presence!.id, environment: "live" }).assignments[0]!;
    const otherPresence = { ...state.presence!, id: "presence:other", handle: "other" };
    state.presences = [state.presence!, otherPresence];
    const run = {
      id: "assignment-run:presence-isolation",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "live:test",
      status: "failed" as const,
      currentStage: "blocked" as const,
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:01:00.000Z",
      completedAt: "2026-08-27T00:01:00.000Z",
    };
    state.assignmentRuns = [run];
    state.executions = [{
      id: "execution:other-presence",
      socialIntentId: "intent:other-presence",
      presenceId: otherPresence.id,
      assignmentId: assignment.id,
      runId: run.id,
      affordance: "x.reply",
      mode: "auto",
      status: "blocked",
      attempts: 0,
      connector: "native",
      idempotencyKey: "other-presence",
      failure: { code: "TARGET_LANGUAGE_MISMATCH", message: "The target belongs to another Presence.", retryable: false },
      createdAt: "2026-08-27T00:00:10.000Z",
      updatedAt: "2026-08-27T00:01:00.000Z",
      environment: "live",
    }];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-27T00:02:00.000Z"));
    expect(reconciled.assignmentRuns?.[0]?.status).toBe("failed");
    expect(reconciled.assignments.find((item) => item.id === assignment.id)?.status).not.toBe("needs_operator");
  });

  it("repairs an unreviewed browser account mismatch into a resumable delivery hold", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Make one useful builder introduction.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Wednesday", time: "13:00", executionWindow: "13:00–16:00" } });
    const assignment = state.assignments[0]!;
    assignment.status = "needs_operator";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "Account check failed." };
    assignment.lastOutcome = { class: "delivery_failed", message: "Account check failed.", at: "2026-08-27T03:53:40.766Z" };
    state.assignmentRuns = [{ id: "assignment-run:identity-hold", assignmentId: assignment.id, agentId: assignment.agentId, presenceId: assignment.presenceId, sessionId: "live:test", status: "failed", currentStage: "blocked", attempts: 1, maxAttempts: 4, rejectedCandidates: 0, createdAt: "2026-08-27T03:53:08.659Z", updatedAt: "2026-08-27T03:53:40.766Z", completedAt: "2026-08-27T03:53:40.766Z", lastError: "Account check failed." }];
    state.executions = [{ id: "execution:identity-hold", socialIntentId: "intent:identity-hold", presenceId: assignment.presenceId, assignmentId: assignment.id, runId: "assignment-run:identity-hold", affordance: "x.reply", mode: "auto", status: "failed", attempts: 1, connector: "bridge", bridgeId: "bridge:test", idempotencyKey: "identity-hold", failure: { code: "ACCOUNT_MISMATCH", message: "Account check failed.", retryable: false }, publication: { id: "publication:identity-hold", format: "x.reply", payload: { text: "A useful introduction." }, assetIds: [], links: [], publicExpression: { id: "expression:identity-hold", presenceId: assignment.presenceId, socialIntentId: "intent:identity-hold", format: "x.reply", text: "A useful introduction.", assetIds: [], links: [], safetyStatus: "sealed", provenance: { modelProfileId: "model:test", generatedAt: "2026-08-27T03:53:08.659Z", promptHash: "prompt", sourceObjectIds: [] }, createdAt: "2026-08-27T03:53:08.659Z" }, createdAt: "2026-08-27T03:53:08.659Z", environment: "live" }, createdAt: "2026-08-27T03:53:08.659Z", updatedAt: "2026-08-27T03:53:40.766Z", environment: "live" } as never];

    const reconciled = reconcileLiveAssignmentRuns(state, Date.parse("2026-08-27T04:00:00.000Z"));
    expect(reconciled.executions[0]).toMatchObject({ status: "queued", deliveryHold: { reason: "bridge_identity" }, failure: { code: "ACCOUNT_MISMATCH", retryable: true } });
    expect(reconciled.executions[0]?.permit).toBeUndefined();
    expect(reconciled.executions[0]?.publication?.publicExpression?.safetyStatus).toBe("candidate");
    expect(reconciled.assignmentRuns?.[0]).toMatchObject({ status: "delivery_pending", currentStage: "publishing", completedAt: undefined });
    expect(reconciled.assignments[0]).toMatchObject({ status: "awaiting_execution", work: { phase: "publishing" } });
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
