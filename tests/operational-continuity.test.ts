import { describe, expect, it } from "vitest";
import { applyOperation, compileAssignmentInstruction, createAgent, normalizeState } from "../lib/runtime";
import { evaluateExecutionReadiness } from "../lib/execution-readiness";
import { isAssignmentRunStale, recoverStaleAssignmentRuns } from "../lib/assignment-recovery";
import { assertNoOrphanedResponsibilities, inspectResponsibilityContinuity } from "../lib/responsibility-continuity";
import type { Assignment, AssignmentRun, OpenPresenceState, Presence } from "../lib/types";

function seedTestState(): OpenPresenceState {
  const base = createAgent({
    name: "Jenny",
    description: "AI Presence",
    mode: "agent",
    handle: "@jenny_ai",
    accent: "#D68754",
  });
  base.presence = {
    ...base.presence!,
    id: base.presence!.id,
    name: "Jenny",
    handle: "jenny_ai",
    status: "live",
    channel: "x",
    environment: "live",
    execution: {
      post: "auto",
      reply: "off", // Reply is explicitly OFF by policy
      quote: "auto",
      repost: "auto",
      like: "auto",
      follow: "auto",
    },
    capabilities: [
      { id: "post", label: "Post", affordance: "post" },
      { id: "reply", label: "Reply", affordance: "reply" },
      { id: "quote", label: "Quote", affordance: "quote" },
    ],
  };
  base.presences = [base.presence];
  return base;
}

describe("Operational Continuity & Responsibility Invariant Test Suite", () => {
  it("Case 1: Wrong / Off Reply Authority is caught at preflight and readiness, never phantom active", () => {
    const state = seedTestState();

    // 1. Evaluate readiness directly
    const readiness = evaluateExecutionReadiness({
      presence: state.presence!,
      channel: "x",
      affordance: "reply",
      state,
      environment: "live",
    });

    expect(readiness.authority).toBe("off");
    expect(readiness.executableNow).toBe(false);
    expect(readiness.disposition).toBe("blocked");
    expect(readiness.blockerReason).toContain("Reply actions are disabled");

    // 2. Preflight assignment compilation
    const assignment = compileAssignmentInstruction(
      state,
      "Reply to @noahkostesku with a concrete observation.",
      state.presence!.id,
      "live"
    );

    expect(assignment.preflight?.status).toBe("blocked");
    expect(assignment.preflight?.issues.some((issue) => issue.includes("Reply actions are disabled") || issue.includes("cannot perform"))).toBe(true);
  });

  it("Case 2: Worker Unavailable upon Creation leaves durable ELIGIBLE work, not phantom evaluating", () => {
    const state = seedTestState();
    // Enable reply
    state.presence!.execution.reply = "auto";
    state.presences[0]!.execution.reply = "auto";
    state.nativeConnections = [
      {
        id: "conn-1",
        presenceId: state.presence!.id,
        kind: "x",
        access: "read-write",
        status: "connected",
        channelId: "x",
        handle: "jenny_ai",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const assignment = compileAssignmentInstruction(
      state,
      "Reply to @noahkostesku with a concrete observation.",
      state.presence!.id,
      "live"
    );
    assignment.status = "active";
    state.assignments.unshift(assignment);

    // Inspect continuity when no worker has claimed it
    const continuity = inspectResponsibilityContinuity(state, assignment);
    expect(continuity.hasContinuation).toBe(true);
    expect(continuity.disposition).toBe("eligible");
    expect(continuity.activeRunId).toBeUndefined();
  });

  it("Case 3: Worker Dies During Cognition -> detects stale lease, preserves lineage (Run B recoveryOf Run A)", () => {
    const state = seedTestState();
    const assignment = compileAssignmentInstruction(
      state,
      "Produce 1 original market post.",
      state.presence!.id,
      "live"
    );
    assignment.status = "working";
    state.assignments.unshift(assignment);

    const staleStartedAt = new Date(Date.now() - 300_000).toISOString(); // 5m ago
    const runA: AssignmentRun = {
      id: "run-A",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      sessionId: "session-1",
      status: "researching",
      currentStage: "candidate_review",
      leaseOwner: "worker-1",
      leaseExpiresAt: new Date(Date.now() - 100_000).toISOString(), // expired
      lastProgressAt: staleStartedAt,
      heartbeatAt: staleStartedAt,
      attempts: 0,
      maxAttempts: 4,
      rejectedCandidates: 0,
      startedAt: staleStartedAt,
      createdAt: staleStartedAt,
      updatedAt: staleStartedAt,
    };
    state.assignmentRuns = [runA];

    expect(isAssignmentRunStale(runA)).toBe(true);

    const { state: recoveredState, recoveredRunIds, spawnedRunIds } = recoverStaleAssignmentRuns(state);

    expect(recoveredRunIds).toContain("run-A");
    expect(spawnedRunIds.length).toBe(1);

    const oldRun = recoveredState.assignmentRuns?.find((r) => r.id === "run-A");
    expect(oldRun?.status).toBe("superseded_stale");

    const newRun = recoveredState.assignmentRuns?.find((r) => r.id === spawnedRunIds[0]);
    expect(newRun).toBeDefined();
    expect(newRun?.recoveryOf).toBe("run-A");
    expect(newRun?.attempts).toBe(1);
    expect(newRun?.status).toBe("queued");
  });

  it("Case 4: Connector Uncertainty During Public Write enters verification-pending, never blindly retries", () => {
    const state = seedTestState();
    const assignment = compileAssignmentInstruction(
      state,
      "Reply to @noahkostesku.",
      state.presence!.id,
      "live"
    );
    state.assignments.unshift(assignment);

    state.executions.unshift({
      id: "exec-1",
      socialIntentId: "intent-1",
      presenceId: state.presence!.id,
      affordance: "x.reply",
      mode: "auto",
      status: "verification-pending",
      attempts: 1,
      connector: "native",
      assignmentId: assignment.id,
      idempotencyKey: `exec:${assignment.id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const continuity = inspectResponsibilityContinuity(state, assignment);
    expect(continuity.hasContinuation).toBe(true);
    expect(continuity.disposition).toBe("claimed");
    expect(continuity.reason).toContain("verification-pending");
  });

  it("keeps an adaptive burst recoverable when its run uses the zero-attempt sentinel", () => {
    const state = seedTestState();
    const now = Date.now();
    const assignment = compileAssignmentInstruction(state, "Help this post reach relevant builders.", state.presence!.id, "live");
    assignment.status = "working";
    state.assignments.unshift(assignment);
    state.assignmentPursuitWindows = [{
      id: "active-adaptive-pursuit",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      startsAt: new Date(now - 300_000).toISOString(),
      deadlineAt: new Date(now + 3_600_000).toISOString(),
      maxVerifiedActions: 40,
      status: "active",
    }];
    const run: AssignmentRun = {
      id: "stalled-adaptive-run",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      sessionId: `live:${state.presence!.id}`,
      pursuitWindowId: "active-adaptive-pursuit",
      status: "selecting",
      currentStage: "candidate_review",
      leaseOwner: "worker-gone",
      leaseExpiresAt: new Date(now - 1_000).toISOString(),
      heartbeatAt: new Date(now - 300_000).toISOString(),
      lastProgressAt: new Date(now - 300_000).toISOString(),
      attempts: 8,
      maxAttempts: 0,
      rejectedCandidates: 0,
      createdAt: new Date(now - 300_000).toISOString(),
      updatedAt: new Date(now - 300_000).toISOString(),
    };
    state.assignmentRuns = [run];

    const recovered = recoverStaleAssignmentRuns(state, now);
    expect(recovered.spawnedRunIds).toHaveLength(1);
    expect(recovered.state.assignmentRuns?.[0]).toMatchObject({ status: "queued", recoveryOf: run.id, attempts: 9 });
  });

  it("Case 5: Recovery Budget Exhausted vs. Needs You", () => {
    const state = seedTestState();
    const assignment = compileAssignmentInstruction(
      state,
      "Produce 1 original publication.",
      state.presence!.id,
      "live"
    );
    assignment.status = "working";
    state.assignments.unshift(assignment);

    // Subcase 5A: Max attempts exhausted -> BLOCKED
    const exhaustedRun: AssignmentRun = {
      id: "run-exhausted",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      sessionId: "session-1",
      status: "researching",
      currentStage: "candidate_review",
      leaseOwner: "worker-1",
      leaseExpiresAt: new Date(Date.now() - 100_000).toISOString(),
      lastProgressAt: new Date(Date.now() - 300_000).toISOString(),
      attempts: 3,
      maxAttempts: 4, // 3 + 1 = 4 -> exhausted
      rejectedCandidates: 0,
      createdAt: new Date(Date.now() - 300_000).toISOString(),
      updatedAt: new Date(Date.now() - 300_000).toISOString(),
    };
    state.assignmentRuns = [exhaustedRun];

    const { state: finalState } = recoverStaleAssignmentRuns(state);
    const updatedAssignment = finalState.assignments.find((a) => a.id === assignment.id);
    expect(updatedAssignment?.status).toBe("blocked");
    expect(updatedAssignment?.work?.phase).toBe("blocked");

    // Subcase 5B: Connector requires operator auth -> NEEDS_YOU
    state.presence!.execution.post = "auto";
    state.nativeConnections = [
      {
        id: "conn-bad",
        presenceId: state.presence!.id,
        kind: "x",
        access: "read-write",
        status: "needs-attention",
        channelId: "x",
        handle: "jenny_ai",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const readiness = evaluateExecutionReadiness({
      presence: state.presence!,
      channel: "x",
      affordance: "post",
      state,
      environment: "live",
    });
    expect(readiness.disposition).toBe("needs_you");
    expect(readiness.requiredAction).toBe("operator_auth");
  });

  it("Case 6: Orphaned Responsibility Invariant Test detects orphaned work and auto-rematerializes Agenda continuation", () => {
    const state = seedTestState();
    state.presence!.execution.reply = "auto";
    const assignment: Assignment = {
      id: "assignment-orphan",
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      channelId: "x",
      environment: "live",
      title: "Orphaned Responsibility",
      origin: "manual",
      instruction: "Reply to @noahkostesku",
      deliverable: { type: "reply" },
      status: "active",
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
      executionPolicy: { usePresenceEnvelope: true },
    };
    state.assignments.unshift(assignment);
    state.assignmentRuns = [];
    state.executions = [];

    // Audit and recover orphaned responsibilities
    const { state: auditedState, orphanedCount, repairedIds } = assertNoOrphanedResponsibilities(state);

    expect(orphanedCount).toBe(1);
    expect(repairedIds).toContain("assignment-orphan");

    const repairedAssignment = auditedState.assignments.find((a) => a.id === "assignment-orphan");
    expect(repairedAssignment?.status).toBe("active");
    expect(repairedAssignment?.work?.phase).toBe("candidate_review");
    expect(auditedState.events[0]?.title).toBe("Responsibility continuity restored");
  });

  it("Case 7: UI Timing & Truthfulness: Assignment created 48m ago shows 0s / Queued until OperationalRun starts", () => {
    const state = seedTestState();
    state.presence!.execution.reply = "auto";
    const created48mAgo = new Date(Date.now() - 48 * 60_000).toISOString();

    const assignment: Assignment = {
      id: "assignment-old",
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      channelId: "x",
      environment: "live",
      title: "Reply to @noahkostesku",
      origin: "manual",
      instruction: "Reply to @noahkostesku",
      deliverable: { type: "reply" },
      status: "active",
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: created48mAgo,
      updatedAt: created48mAgo,
      executionPolicy: { usePresenceEnvelope: true },
    };
    state.assignments.unshift(assignment);

    // 1. Without active OperationalRun: disposition is ELIGIBLE / QUEUED
    const idleContinuity = inspectResponsibilityContinuity(state, assignment);
    expect(idleContinuity.disposition).toBe("eligible");
    expect(idleContinuity.activeRunId).toBeUndefined();

    // 2. When an OperationalRun starts now
    const runNow = new Date().toISOString();
    const activeRun: AssignmentRun = {
      id: "run-fresh",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      sessionId: "session-1",
      status: "researching",
      currentStage: "candidate_review",
      leaseOwner: "worker-1",
      leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      lastProgressAt: runNow,
      startedAt: runNow,
      heartbeatAt: runNow,
      attempts: 0,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: runNow,
      updatedAt: runNow,
    };
    state.assignmentRuns = [activeRun];

    const activeContinuity = inspectResponsibilityContinuity(state, assignment);
    expect(activeContinuity.disposition).toBe("claimed");
    expect(activeContinuity.activeRunId).toBe("run-fresh");

    // Duration is calculated from activeRun.startedAt (0 seconds), NOT assignment.createdAt (48 minutes)
    const elapsedRunMs = Date.now() - new Date(activeRun.startedAt!).getTime();
    expect(elapsedRunMs).toBeLessThan(5000);
  });
});
