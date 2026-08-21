import type { AssignmentRun, OpenPresenceState } from "./types";

export const assignmentWorkerStaleAfterMs = 15 * 60 * 1000;

export function recoverStaleAssignmentRuns(
  source: OpenPresenceState,
  nowMs = Date.now(),
  activeRunIds: ReadonlySet<string> = new Set(),
) {
  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const recoveredRunIds: string[] = [];
  const runs = next.assignmentRuns ?? [];

  for (const run of runs) {
    if (activeRunIds.has(run.id) || ["published", "blocked", "failed", "cancelled"].includes(run.status)) continue;
    const leaseTime = Date.parse(run.leaseExpiresAt ?? "");
    const heartbeatTime = Date.parse(run.heartbeatAt ?? run.updatedAt ?? run.createdAt);
    if (!Number.isFinite(leaseTime) || !Number.isFinite(heartbeatTime)) continue;
    if (leaseTime > nowMs || nowMs - heartbeatTime < assignmentWorkerStaleAfterMs) continue;

    const timestamp = new Date(nowMs).toISOString();
    const message = "The Assignment worker stopped reporting progress. OpenPresence safely halted the stale run; retrying will start a fresh bounded run.";
    run.status = "failed";
    run.currentStage = "blocked";
    run.lastError = message;
    run.completedAt = timestamp;
    run.heartbeatAt = timestamp;
    run.leaseOwner = undefined;
    run.leaseExpiresAt = undefined;
    run.updatedAt = timestamp;
    recoveredRunIds.push(run.id);

    const assignment = next.assignments.find((item) => item.id === run.assignmentId);
    if (assignment && ["working", "awaiting_execution"].includes(assignment.status)) {
      assignment.status = "blocked";
      assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: run.maxAttempts, storiesResearched: 0 }), phase: "candidate_review", blockedReason: message };
      assignment.lastOutcome = { class: "incomplete", message, at: timestamp };
      assignment.updatedAt = timestamp;
    }
  }

  return { state: next, recoveredRunIds };
}

export function isAssignmentRunStale(run: AssignmentRun, nowMs = Date.now()) {
  const leaseTime = Date.parse(run.leaseExpiresAt ?? "");
  const heartbeatTime = Date.parse(run.heartbeatAt ?? run.updatedAt ?? run.createdAt);
  return Number.isFinite(leaseTime) && Number.isFinite(heartbeatTime)
    && leaseTime <= nowMs
    && nowMs - heartbeatTime >= assignmentWorkerStaleAfterMs;
}
