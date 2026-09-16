import { describe, expect, it } from "vitest";
import { compileAssignmentInstruction, createAgent, normalizeState } from "../lib/runtime";
import { deferRecoverableAssignmentFailure, recoverStaleAssignmentRuns, resumeRecoverableAssignmentFailures } from "../lib/assignment-recovery";
import { assignmentInspectionEvidence, persistAssignmentReport } from "../lib/assignment-private-report";
import type { AssignmentRun } from "../lib/types";

function fixture() {
  const state = createAgent({ name: "Recovery", description: "Useful ideas", mode: "agent", handle: "@recovery", accent: "#D68754" });
  const assignment = compileAssignmentInstruction(state, "Publish a useful post", state.presence!.id, "live");
  assignment.status = "blocked";
  const run = { id: "run-recovery", assignmentId: assignment.id, presenceId: assignment.presenceId, agentId: assignment.agentId, sessionId: `live:${assignment.presenceId}`, status: "failed", attempts: 1, maxAttempts: 4, rejectedCandidates: 0, lastError: "Openai returned an empty response.", createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z" } as AssignmentRun;
  state.assignments = [assignment]; state.assignmentRuns = [run];
  return { state, assignment, run };
}

describe("Assignment failure recovery boundaries", () => {
  it("compiles prohibited public actions as constraints on a private report", () => {
    const { state } = fixture();
    const assignment = compileAssignmentInstruction(state, "Run a private baseline check on account state and queue health. Do not publish, reply, quote, repost, like, follow, message, or change any public setting. Keep the result private and report only confirmed state.");
    expect(assignment.deliverable.type).toBe("decision_report");
    expect(assignment.preflight?.contract?.successEvidence).toContain("report");
  });
  it("retains a private draft as an original publication when publication is requested", () => {
    const { state } = fixture();
    expect(compileAssignmentInstruction(state, "Publish one original post using the private draft. Do not reply or quote.").deliverable.type).toBe("original_publication");
  });
  it("retries pre-write model failure with backoff, preserving failure truth through normalization", () => {
    const { state, assignment, run } = fixture();
    expect(deferRecoverableAssignmentFailure(state, run.id, Date.parse(run.createdAt))).toBe(true);
    expect(assignment.nextDueAt).toBe("2026-09-13T10:01:00.000Z");
    expect(assignment.lastOutcome?.class).toBe("evaluation_failed");
    expect(normalizeState(state).assignments[0].status).toBe("active");
    expect(run.lastError).toContain("empty response");
  });
  it("retries an incomplete worker result without claiming completion", () => {
    const { state, assignment, run } = fixture();
    run.lastError = "The live Assignment ended without a delivery, deferral, or explicit completion result.";
    expect(deferRecoverableAssignmentFailure(state, run.id)).toBe(true);
    expect(assignment.progress.verified).toBe(0);
  });
  it("retries an unknown pre-write worker failure when no execution exists", () => {
    const { state, assignment, run } = fixture();
    run.lastError = "The provider returned an unusable result before an execution was formed.";
    expect(deferRecoverableAssignmentFailure(state, run.id, Date.parse(run.createdAt))).toBe(true);
    expect(assignment.status).toBe("active");
    expect(assignment.progress.verified).toBe(0);
  });
  it("allows retry after an explicitly safe pre-write delivery close", () => {
    const { state, assignment, run } = fixture();
    state.executions.push({ id: "safe-pre-write", assignmentId: assignment.id, runId: run.id, status: "failed", externalRef: undefined, createdAt: run.createdAt, failure: { code: "BRIDGE_NOT_CHECKED_IN", message: "The Bridge did not check in.", retryable: true } } as never);
    expect(deferRecoverableAssignmentFailure(state, run.id, Date.parse(run.createdAt))).toBe(true);
  });
  it("does not retry billing errors or exhausted recovery budgets", () => {
    const { state, run } = fixture();
    run.lastError = "Your monthly spend cap has been reached.";
    expect(deferRecoverableAssignmentFailure(state, run.id)).toBe(false);
    run.lastError = "Openai returned an empty response."; run.attempts = 4;
    expect(deferRecoverableAssignmentFailure(state, run.id)).toBe(false);
  });
  it("blocks the Assignment instead of leaving it runnable after recovery exhaustion", () => {
    const { state, assignment, run } = fixture();
    assignment.systemFailures = 3;
    run.lastError = "The live Assignment ended without a delivery, deferral, or explicit completion result.";
    expect(deferRecoverableAssignmentFailure(state, run.id, Date.parse(run.createdAt))).toBe(false);
    expect(assignment.status).toBe("blocked");
    expect(assignment.lastOutcome?.class).toBe("evaluation_failed");
    expect(assignment.nextDueAt).toBeUndefined();
  });
  it("does not replay even a failed execution from the worker", () => {
    const { state, assignment, run } = fixture();
    state.executions.push({ id: "ambiguous-write", assignmentId: assignment.id, runId: run.id, status: "failed", createdAt: run.createdAt } as never);
    expect(deferRecoverableAssignmentFailure(state, run.id)).toBe(false);
  });
  it("does not burn retry budget on queued work which was never claimed", () => {
    const { state, run } = fixture();
    run.status = "queued"; run.currentStage = "candidate_review"; run.leaseExpiresAt = run.createdAt;
    const recovery = recoverStaleAssignmentRuns(state, Date.parse(run.createdAt) + 3600000);
    expect(recovery.spawnedRunIds).toHaveLength(0);
    expect(recovery.state.assignmentRuns![0]).toMatchObject({ status: "queued", attempts: 1 });
    expect(recovery.state.assignmentRuns![0].leaseExpiresAt).toBeUndefined();
  });
  it("holds stale delivery for reconciliation", () => {
    const { state, assignment, run } = fixture();
    run.status = "delivering"; run.leaseExpiresAt = run.createdAt;
    state.executions.push({ id: "pending-write", assignmentId: assignment.id, status: "verification-pending" } as never);
    const recovery = recoverStaleAssignmentRuns(state, Date.parse(run.createdAt) + 3600000);
    expect(recovery.spawnedRunIds).toHaveLength(0);
    expect(recovery.state.assignmentRuns![0].status).toBe("delivery_pending");
  });
  it("expires historical today requests without replaying their public work", () => {
    const { state, assignment } = fixture();
    assignment.status = "active";
    assignment.instruction = "Publish six posts today";
    assignment.createdAt = "2026-09-11T19:00:00Z";
    expect(resumeRecoverableAssignmentFailures(state, Date.parse("2026-09-13T14:00:00Z"))).toEqual([assignment.id]);
    expect(assignment.status).toBe("expired_incomplete");
    expect(assignment.progress.verified).toBe(0);
    expect(assignment.nextDueAt).toBeUndefined();
  });
  it("does not rewrite an operator-blocked historical request as a timing expiry", () => {
    const { state, assignment } = fixture();
    assignment.instruction = "Publish six posts today";
    assignment.createdAt = "2026-09-11T19:00:00Z";
    expect(resumeRecoverableAssignmentFailures(state, Date.parse("2026-09-13T14:00:00Z"))).toEqual([]);
    expect(assignment.status).toBe("blocked");
  });
  it("returns eligible historical model failures to the scheduler once", () => {
    const { state, assignment } = fixture();
    expect(resumeRecoverableAssignmentFailures(state)).toEqual([assignment.id]);
    expect(resumeRecoverableAssignmentFailures(state)).toEqual([]);
    expect(assignment.status).toBe("active");
  });
  it("persists private evidence without inventing fresh external verification", () => {
    const { state, assignment } = fixture();
    const before = state.executions.length;
    const evidence = assignmentInspectionEvidence(state, assignment);
    persistAssignmentReport(state, assignment, JSON.stringify(evidence));
    expect(assignment.completionReport).toContain("not a fresh X or billing probe");
    expect(state.executions.length).toBe(before);
    expect(assignment.status).toBe("completed");
  });
});
