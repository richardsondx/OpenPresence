import type { AssignmentRun, OpenPresenceState } from "./types";
import { defaultOperationalStagePolicies } from "./responsibility-continuity";

export const assignmentWorkerStaleAfterMs = 15 * 60 * 1000;
const openAssignmentRunStatuses = new Set(["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"]);

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

export function stageTimeoutForRun(run: AssignmentRun): number {
  const stage = run.currentStage ?? "candidate_review";
  return defaultOperationalStagePolicies[stage]?.expectedProgressWithinMs ?? 120_000;
}

export function isAssignmentRunStale(run: AssignmentRun, nowMs = Date.now()): boolean {
  if (["published", "deferred", "blocked", "failed", "cancelled", "superseded_stale"].includes(run.status)) {
    return false;
  }
  const leaseTime = Date.parse(run.leaseExpiresAt ?? "");
  const heartbeatTime = Date.parse(run.heartbeatAt ?? run.lastProgressAt ?? run.updatedAt ?? run.createdAt);
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
    const canRetry = activePursuit || (run.maxAttempts === 0 || run.attempts + 1 < run.maxAttempts);

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
        detail: `The previous work cycle for “${assignment.title ?? assignment.instruction}” stalled. OpenPresence safely started a fresh work cycle (Attempt ${run.attempts + 2} of ${run.maxAttempts}).`,
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
