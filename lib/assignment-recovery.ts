import { assertAssignmentWindowOpen, assignmentWindowState } from "./assignment-timeframe";
import { randomUUID } from "node:crypto";
import { isAutonomousPreWriteDeliveryFailure } from "./live-assignment-run";
import type { AssignmentRun, OpenPresenceState } from "./types";
import { defaultOperationalStagePolicies } from "./responsibility-continuity";
import { isXCreditsError } from "./x-credits";

export const assignmentWorkerStaleAfterMs = 15 * 60 * 1000;
const openAssignmentRunStatuses = new Set(["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"]);

/**
 * Reopen one operator-blocked live Assignment after a fresh external check.
 * This is deliberately state-only: the normal live Assignment worker still
 * owns cognition, policy, delivery, and verification. Keeping the queue
 * mutation here queues the same worker used by HTTP recovery without
 * creating a new Assignment or bypassing the envelope.
 */
export function queueOperatorAssignmentRetry(
  source: OpenPresenceState,
  assignmentId: string,
  presenceId: string,
  nowMs = Date.now(),
): { state: OpenPresenceState; run: AssignmentRun; incidentAssignmentId: string } {
  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const assignment = next.assignments.find((item) => item.id === assignmentId && item.presenceId === presenceId);
  const presence = next.presences.find((item) => item.id === presenceId)
    ?? (next.presence?.id === presenceId ? next.presence : undefined);
  if (!assignment || !presence) throw new Error("That blocked Assignment is no longer available in this Presence.");
  assertAssignmentWindowOpen(assignment, nowMs);
  if (presence.status !== "live") throw new Error("Public activity is paused. The task was not resumed.");
  if (assignment.environment !== "live" || presence.environment === "sandbox") throw new Error("Only a live Assignment can be retried from private Chat.");
  const billingBlockedActive = assignment.status === "active"
    && assignment.lastOutcome?.class === "delivery_failed"
    && isXCreditsError(assignment.lastOutcome.message);
  if (!["blocked", "needs_operator"].includes(assignment.status) && !billingBlockedActive) {
    throw new Error("That Assignment is not waiting for an operator recovery check.");
  }

  const active = (next.assignmentRuns ?? []).find((candidate) => candidate.assignmentId === assignment.id
    && candidate.presenceId === presenceId
    && openAssignmentRunStatuses.has(candidate.status));
  if (active) return { state: next, run: active, incidentAssignmentId: assignment.id };

  const pendingDeliveryStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
  const unresolvedDelivery = next.executions.find((execution) => execution.assignmentId === assignment.id
    && execution.presenceId === presenceId
    && pendingDeliveryStatuses.has(execution.status));
  if (unresolvedDelivery) throw new Error("That Assignment still has an unresolved delivery. It was not retried.");

  const timestamp = new Date(nowMs).toISOString();
  const work = assignment.work ?? { phase: "candidate_review" as const, attempts: 0, maxAttempts: 4, storiesResearched: 0 };
  const run: AssignmentRun = {
    id: `assignment-run:operator:${randomUUID()}`,
    assignmentId: assignment.id,
    agentId: assignment.agentId,
    presenceId,
    sessionId: `live:${presenceId}`,
    status: "queued",
    currentStage: "candidate_review",
    attempts: work.attempts + 1,
    maxAttempts: work.maxAttempts,
    rejectedCandidates: assignment.rejectedCandidates,
    startedAt: timestamp,
    heartbeatAt: timestamp,
    lastProgressAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  next.assignmentRuns = [run, ...(next.assignmentRuns ?? [])];
  assignment.status = "working";
  assignment.work = { ...work, phase: "candidate_review", attempts: run.attempts, blockedReason: undefined, lastAttemptAt: timestamp };
  assignment.lastOutcome = undefined;
  assignment.nextDueAt = undefined;
  assignment.revision = (assignment.revision ?? 0) + 1;
  assignment.updatedAt = timestamp;
  return { state: next, run, incidentAssignmentId: assignment.id };
}

/**
 * Repair legacy parent statuses that outlived their durable worker. A parent
 * Assignment status is a lifecycle projection; it cannot claim current work
 * when no open AssignmentRun exists. Delivery-pending runs are preserved as a
 * waiting state, while orphaned working/awaiting-execution parents return to
 * the normal active queue.
 */
export function reconcileOrphanedAssignmentStatuses(source: OpenPresenceState): { state: OpenPresenceState; repairedAssignmentIds: string[] } {
  const openRuns = source.assignmentRuns ?? [];
  const candidates = source.assignments.filter((assignment) =>
    ["working", "awaiting_execution"].includes(assignment.status)
    && !openRuns.some((run) => run.assignmentId === assignment.id && openAssignmentRunStatuses.has(run.status)),
  );
  if (!candidates.length) return { state: source, repairedAssignmentIds: [] };

  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const timestamp = new Date().toISOString();
  const repairedAssignmentIds: string[] = [];
  for (const assignment of next.assignments) {
    if (!candidates.some((candidate) => candidate.id === assignment.id)) continue;
    assignment.status = "active";
    assignment.work = {
      ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
      phase: "candidate_review",
      blockedReason: undefined,
    };
    assignment.updatedAt = timestamp;
    repairedAssignmentIds.push(assignment.id);
  }
  return { state: next, repairedAssignmentIds };
}

/**
 * A scheduler dispatch can arrive after a scheduled Assignment's execution
 * window has closed. Settle the durable queue row so the scheduler does not
 * redispatch it forever, while leaving the parent Assignment eligible for its
 * next declared window.
 */
export function deferQueuedAssignmentRunsOutsideWindow(
  source: OpenPresenceState,
  assignmentId: string,
  presenceId: string,
  nowMs = Date.now(),
): { state: OpenPresenceState; deferredRunIds: string[] } {
  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const timestamp = new Date(nowMs).toISOString();
  const deferredRunIds: string[] = [];
  for (const run of next.assignmentRuns ?? []) {
    if (run.assignmentId !== assignmentId || run.presenceId !== presenceId || run.sessionId !== `live:${presenceId}` || run.status !== "queued") continue;
    run.status = "deferred";
    run.currentStage = "candidate_review";
    run.completedAt = timestamp;
    run.heartbeatAt = timestamp;
    run.lastProgressAt = timestamp;
    run.leaseOwner = undefined;
    run.leaseExpiresAt = undefined;
    run.lastError = undefined;
    run.updatedAt = timestamp;
    deferredRunIds.push(run.id);
  }
  if (deferredRunIds.length) {
    const assignment = next.assignments.find((item) => item.id === assignmentId && item.presenceId === presenceId);
    if (assignment?.status === "working") {
      assignment.status = "active";
      assignment.work = {
        ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
        phase: "candidate_review",
        blockedReason: undefined,
      };
      assignment.updatedAt = timestamp;
    }
  }
  return { state: next, deferredRunIds };
}

export function stageTimeoutForRun(run: AssignmentRun): number {
  const stage = run.currentStage ?? "candidate_review";
  return defaultOperationalStagePolicies[stage]?.expectedProgressWithinMs ?? 120_000;
}

export function isAssignmentRunStale(run: AssignmentRun, nowMs = Date.now()): boolean {
  if (["published", "deferred", "blocked", "failed", "cancelled", "superseded_stale"].includes(run.status)) {
    return false;
  }
  const leaseTime = Date.parse(run.leaseExpiresAt ?? "");
  const heartbeatTime = Date.parse(run.lastProgressAt ?? run.heartbeatAt ?? run.updatedAt ?? run.createdAt);
  if (!Number.isFinite(leaseTime) || !Number.isFinite(heartbeatTime)) return false;

  const stageTimeout = stageTimeoutForRun(run);
  const leaseExpired = leaseTime <= nowMs;
  const progressStalled = nowMs - heartbeatTime >= stageTimeout;

  return leaseExpired && progressStalled;
}

export function recoverStaleAssignmentRuns(
  source: OpenPresenceState,
  nowMs = Date.now(),
  activeRunIds: ReadonlySet<string> = new Set()
): { state: OpenPresenceState; recoveredRunIds: string[]; spawnedRunIds: string[] } {
  // Most reads are ordinary health/activity polls. Avoid cloning the full
  // workspace unless a run is actually eligible for recovery; cloning the
  // multi-megabyte snapshot on every poll was a major source of event-loop
  // pressure while the UI was waiting for a worker.
  const hasStaleRun = (source.assignmentRuns ?? []).some((run) =>
    !activeRunIds.has(run.id) && isAssignmentRunStale(run, nowMs),
  );
  if (!hasStaleRun) return { state: source, recoveredRunIds: [], spawnedRunIds: [] };

  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  next.assignmentRuns ??= [];
  const recoveredRunIds: string[] = [];
  const spawnedRunIds: string[] = [];
  const runs = next.assignmentRuns ?? [];

  for (const run of runs) {
    if (activeRunIds.has(run.id) || ["published", "deferred", "blocked", "failed", "cancelled", "superseded_stale"].includes(run.status)) {
      continue;
    }
    if (!isAssignmentRunStale(run, nowMs)) {
      continue;
    }

    const timestamp = new Date(nowMs).toISOString();
    const assignment = next.assignments.find((item) => item.id === run.assignmentId);
    // Queue residence is not an execution attempt. Let the durable dispatcher
    // claim the same row instead of consuming recovery attempts on idle work.
    if (run.status === "queued") {
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
      recoveredRunIds.push(run.id);
      continue;
    }
    const pendingDelivery = next.executions.some((execution) => execution.assignmentId === run.assignmentId
      && !["failed", "blocked", "cancelled", "expired", "verification-closed"].includes(execution.status));
    if (pendingDelivery) {
      run.status = "delivery_pending";
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
      if (assignment) assignment.status = "awaiting_execution";
      recoveredRunIds.push(run.id);
      continue;
    }
    const pursuit = (source.assignmentPursuitWindows ?? []).find((window) =>
      window.id === run.pursuitWindowId
      && window.assignmentId === run.assignmentId
      && window.presenceId === run.presenceId,
    );
    const activePursuit = Boolean(pursuit
      && pursuit.status === "active"
      && new Date(pursuit.deadlineAt).getTime() > nowMs);
    // Adaptive live work uses maxAttempts=0 because its real bound is the
    // active pursuit window and resource envelope. Treat zero as unbounded
    // only for that explicit window; ordinary assignments still retain their
    // finite recovery budget.
    const canRetry = activePursuit || (run.maxAttempts > 0 && run.attempts < run.maxAttempts);

    if (canRetry && assignment && !["completed", "cancelled"].includes(assignment.status)) {
      // 1. Mark current run as superseded_stale (preserving attempt lineage)
      run.status = "superseded_stale";
      run.lastError = `Work cycle stalled during stage ${run.currentStage ?? "cognition"}. Superseded by autonomous recovery.`;
      run.completedAt = timestamp;
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
      recoveredRunIds.push(run.id);

      // 2. Spawn next OperationalRun linked to previous attempt
      const newRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newRun: AssignmentRun = {
        id: newRunId,
        assignmentId: run.assignmentId,
        agentId: run.agentId,
        presenceId: run.presenceId,
        sessionId: run.sessionId,
        pursuitWindowId: run.pursuitWindowId,
        status: "queued",
        currentStage: "candidate_review",
        attempts: run.attempts + 1,
        maxAttempts: run.maxAttempts,
        rejectedCandidates: run.rejectedCandidates,
        recoveryOf: run.id,
        startedAt: timestamp,
        heartbeatAt: timestamp,
        lastProgressAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      next.assignmentRuns.unshift(newRun);
      spawnedRunIds.push(newRunId);

      assignment.status = "active";
      assignment.work = {
        ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: run.maxAttempts, storiesResearched: 0 }),
        phase: "candidate_review",
        attempts: run.attempts + 1,
      };
      assignment.updatedAt = timestamp;

      next.events.unshift({
        id: `run-recovery:${run.id}:${nowMs}`,
        type: "system",
        title: "Autonomous work recovery started",
        detail: `The previous work cycle for “${assignment.title ?? assignment.instruction}” stalled. OpenPresence safely started a fresh work cycle (Attempt ${run.attempts + 1}${run.maxAttempts ? ` of ${run.maxAttempts}` : " within the active pursuit"}).`,
        time: timestamp,
        tone: "positive",
        presenceId: run.presenceId,
        sessionId: run.sessionId,
      });
    } else {
      // Recovery budget exhausted or cannot retry -> fail run and block assignment with clear reason
      const message = "The Assignment worker stopped reporting progress and exhausted its recovery attempts.";
      run.status = "failed";
      run.currentStage = "blocked";
      run.lastError = message;
      run.completedAt = timestamp;
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
      recoveredRunIds.push(run.id);

      if (assignment && ["working", "awaiting_execution", "active"].includes(assignment.status)) {
        assignment.status = "blocked";
        assignment.work = {
          ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: run.maxAttempts, storiesResearched: 0 }),
          phase: "blocked",
          blockedReason: message,
        };
        assignment.lastOutcome = { class: "incomplete", message, at: timestamp };
        assignment.updatedAt = timestamp;
      }
    }
  }

  return { state: next, recoveredRunIds, spawnedRunIds };
}

/** Retry only proven pre-delivery failures. An uncertain write stays isolated. */
export function deferRecoverableAssignmentFailure(state: OpenPresenceState, runId: string, nowMs = Date.now()): boolean {
  const run = state.assignmentRuns?.find((item) => item.id === runId);
  const assignment = run && state.assignments.find((item) => item.id === run.assignmentId && item.presenceId === run.presenceId);
  if (!run || !assignment || !["failed", "blocked"].includes(run.status)) return false;
  if (["completed", "completed_with_adaptation", "cancelled", "paused", "expired_incomplete"].includes(assignment.status)) return false;
  const error = run.lastError ?? assignment.lastOutcome?.message ?? "";
  // Before an Execution Envelope exists, the failure is intrinsically safe to
  // retry. Keep explicit operator/dependency failures out of this path; those
  // belong in Needs You rather than consuming a silent retry budget.
  if (/api credits|billing|spend(?:ing)? cap|credential|authentication|token refresh|not permitted|execution settings|policy change/i.test(error)) return false;
  if (state.executions.some((execution) => execution.assignmentId === assignment.id
    && !["failed", "blocked", "cancelled", "expired", "verification-closed"].includes(execution.status))) return false;
  // A failed execution row is not, by itself, evidence of a public write. Only
  // an unresolved/ambiguous execution blocks retry; explicitly closed
  // pre-write misses are safe to retry as well. This keeps model/provider
  // failures separate from the connector side-effect boundary.
  const startedAt = run.startedAt ?? run.createdAt;
  if (state.executions.some((execution) => execution.assignmentId === assignment.id
    && (execution.runId === runId || execution.createdAt >= startedAt)
    && !isAutonomousPreWriteDeliveryFailure(execution))) return false;
  const failures = (assignment.systemFailures ?? 0) + 1;
  assignment.systemFailures = failures;
  const budget = Math.min(4, assignment.work?.maxAttempts || 4);
  if (failures >= budget || (run.maxAttempts > 0 && run.attempts >= run.maxAttempts)) {
    const at = new Date(nowMs).toISOString();
    const message = `The Assignment worker could not complete this attempt after ${failures} bounded recovery failure${failures === 1 ? "" : "s"}. No verified public outcome was recorded. Last error: ${error || "unknown worker failure"}`;
    assignment.status = "blocked";
    assignment.nextDueAt = undefined;
    assignment.work = {
      ...(assignment.work ?? { phase: "candidate_review", attempts: run.attempts, maxAttempts: budget, storiesResearched: 0 }),
      phase: "blocked",
      blockedReason: message,
    };
    assignment.lastOutcome = { class: "evaluation_failed", message, at };
    assignment.updatedAt = at;
    return false;
  }
  const at = new Date(nowMs).toISOString();
  run.status = "deferred";
  run.currentStage = "candidate_review";
  run.completedAt = at;
  run.leaseOwner = undefined;
  run.leaseExpiresAt = undefined;
  run.updatedAt = at;
  assignment.status = "active";
  assignment.nextDueAt = new Date(nowMs + Math.min(15 * 60_000, 60_000 * 2 ** (failures - 1))).toISOString();
  assignment.work = { ...(assignment.work ?? { attempts: run.attempts, maxAttempts: budget, storiesResearched: 0 }), phase: "candidate_review", blockedReason: undefined };
  assignment.lastOutcome = { class: "evaluation_failed", message: `Work will retry automatically after a temporary failure: ${error}`, at };
  assignment.updatedAt = at;
  return true;
}

/** One-time repair of historical pre-write failures left outside the scheduler. */
export function resumeRecoverableAssignmentFailures(state: OpenPresenceState, nowMs = Date.now()): string[] {
  const resumed: string[] = [];
  for (const assignment of state.assignments) {
    if (assignment.environment !== "live" || !["blocked", "needs_operator", "active"].includes(assignment.status)) continue;
    const run = (state.assignmentRuns ?? []).filter((item) => item.assignmentId === assignment.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!run || !["failed", "blocked", "deferred"].includes(run.status) || !/^(?:Openai returned an empty response\.|The live Assignment ended without a delivery, deferral, or explicit completion result\.|The Assignment worker stopped reporting progress and exhausted its recovery attempts\.)$/.test(run.lastError ?? "")) continue;
    // These old relative-day requests are already outside their durable local
    // calendar window. Preserve their failed history without replaying stale posts.
    const ended = assignmentWindowState(assignment, nowMs) === "ended";
    if (ended && ["blocked", "needs_operator"].includes(assignment.status)) continue;
    if (ended) {
      const at = new Date(nowMs).toISOString();
      assignment.status = "expired_incomplete";
      assignment.lastOutcome = { class: "incomplete", message: `The requested day elapsed before completion. The previous failure is retained in work history: ${run.lastError}`, at };
      assignment.work = { ...(assignment.work ?? { attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }), phase: "blocked", blockedReason: assignment.lastOutcome.message };
      assignment.nextDueAt = undefined;
      assignment.updatedAt = at;
      resumed.push(assignment.id);
      continue;
    }
    if (deferRecoverableAssignmentFailure(state, run.id, nowMs)) resumed.push(assignment.id);
  }
  return resumed;
}
