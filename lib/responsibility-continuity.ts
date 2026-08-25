import type { Assignment, AssignmentRun, OpenPresenceState, OperationalStagePolicy } from "./types";
import { evaluateExecutionReadiness } from "./execution-readiness";

export const defaultOperationalStagePolicies: Record<string, OperationalStagePolicy> = {
  candidate_review: { stage: "candidate_review", expectedProgressWithinMs: 120_000 },
  researching: { stage: "researching", expectedProgressWithinMs: 120_000 },
  visual_research: { stage: "visual_research", expectedProgressWithinMs: 90_000 },
  publishing: { stage: "publishing", expectedProgressWithinMs: 120_000 },
  browser_navigation: { stage: "browser_navigation", expectedProgressWithinMs: 45_000 },
  delivering: { stage: "delivering", expectedProgressWithinMs: 60_000 },
};

export type OperationalWorkDisposition =
  | "eligible"
  | "claimed"
  | "waiting"
  | "recovering"
  | "awaiting_review"
  | "blocked"
  | "needs_you"
  | "resolved";

export interface ResponsibilityContinuityStatus {
  responsibilityId: string;
  hasContinuation: boolean;
  disposition: OperationalWorkDisposition;
  activeRunId?: string;
  reason?: string;
  suggestedAction?: string;
}

/**
 * Evaluates whether an accepted responsibility has a legible path to continuation
 * or an explicit terminal/blocked disposition.
 */
export function inspectResponsibilityContinuity(
  state: OpenPresenceState,
  assignment: Assignment,
  nowMs = Date.now()
): ResponsibilityContinuityStatus {
  const terminalStatuses = new Set(["completed", "completed_with_adaptation", "cancelled", "failed", "expired_incomplete"]);
  if (terminalStatuses.has(assignment.status)) {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "resolved",
      reason: assignment.lastOutcome?.message ?? "Responsibility has resolved.",
    };
  }

  const presence = state.presences.find((p) => p.id === assignment.presenceId) ?? state.presence;
  if (!presence) {
    return {
      responsibilityId: assignment.id,
      hasContinuation: false,
      disposition: "blocked",
      reason: "No Presence found for this assignment.",
    };
  }

  // 1. Check for in-flight executions first (e.g. delivery or verification pending)
  const inFlightExecution = state.executions?.find(
    (item) =>
      item.assignmentId === assignment.id &&
      ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"].includes(item.status)
  );

  if (inFlightExecution) {
    if (inFlightExecution.status === "awaiting-review") {
      return {
        responsibilityId: assignment.id,
        hasContinuation: true,
        disposition: "awaiting_review",
        reason: "Draft authored and ready for operator review.",
      };
    }
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "claimed",
      reason: `Execution in progress: ${inFlightExecution.status}.`,
    };
  }

  // 2. Check for active OperationalRuns / AssignmentRuns
  const activeRun = (state.assignmentRuns ?? []).find(
    (run) =>
      run.assignmentId === assignment.id &&
      ["queued", "researching", "selecting", "writing", "delivering"].includes(run.status)
  );

  if (activeRun) {
    const leaseTime = Date.parse(activeRun.leaseExpiresAt ?? "");
    const leaseExpired = Number.isFinite(leaseTime) && leaseTime < nowMs;

    if (leaseExpired) {
      return {
        responsibilityId: assignment.id,
        hasContinuation: true,
        disposition: "recovering",
        activeRunId: activeRun.id,
        reason: "Active worker lease has expired; automatic recovery will claim a fresh run.",
      };
    }

    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "claimed",
      activeRunId: activeRun.id,
      reason: `Worker claimed and currently executing stage: ${activeRun.currentStage ?? "working"}.`,
    };
  }

  // 3. Check Authority & Execution Readiness for new actions
  const deliverableAffordance = assignment.deliverable?.type ?? (assignment.instruction.toLowerCase().includes("reply") ? "reply" : "post");
  const readiness = evaluateExecutionReadiness({
    presence,
    channel: presence.channel,
    affordance: deliverableAffordance,
    state,
    environment: assignment.environment,
  });

  if (readiness.disposition === "blocked" || readiness.disposition === "needs_you") {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: readiness.disposition,
      reason: readiness.blockerReason,
      suggestedAction: readiness.requiredAction,
    };
  }

  // 4. Check for Future Schedules or Wakes
  if (assignment.schedule && assignment.status !== "working") {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "waiting",
      reason: `Scheduled for ${assignment.schedule.day} at ${assignment.schedule.time}.`,
    };
  }
  if (assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() > nowMs) {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "waiting",
      reason: `Next due at ${assignment.nextDueAt}.`,
    };
  }

  // 5. Check if blocked with explicit reason
  if (assignment.status === "blocked") {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "blocked",
      reason: assignment.work?.blockedReason ?? "Assignment is blocked.",
    };
  }

  // 6. Check if orphaned: an open assignment that has no work metadata or preflight and no active run
  if (!assignment.work || !assignment.preflight) {
    return {
      responsibilityId: assignment.id,
      hasContinuation: false,
      disposition: "eligible",
      reason: "No active worker, wake condition, work metadata, or blocker exists for this open responsibility.",
    };
  }

  // 7. Open and runnable now -> ELIGIBLE
  if (["active", "working", "awaiting_execution", "draft"].includes(assignment.status)) {
    return {
      responsibilityId: assignment.id,
      hasContinuation: true,
      disposition: "eligible",
      reason: "Work is runnable and ready for worker pickup.",
    };
  }

  return {
    responsibilityId: assignment.id,
    hasContinuation: false,
    disposition: "eligible",
    reason: "No active worker, wake condition, blocker, or resolution exists for this open responsibility.",
  };
}

/**
 * Invariant Auditor: Asserts that no accepted responsibility is silently stranded without continuation.
 * If orphaned responsibilities are detected, it rematerializes eligible work or records a recovery incident.
 */
export function assertNoOrphanedResponsibilities(
  source: OpenPresenceState,
  nowMs = Date.now()
): {
  state: OpenPresenceState;
  orphanedCount: number;
  repairedIds: string[];
} {
  const next = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const repairedIds: string[] = [];
  let orphanedCount = 0;

  for (const assignment of next.assignments) {
    const status = inspectResponsibilityContinuity(next, assignment, nowMs);
    if (!status.hasContinuation) {
      orphanedCount += 1;
      // Rematerialize Agenda continuation
      assignment.status = "active";
      assignment.work = {
        ...(assignment.work ?? { attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
        phase: "candidate_review",
      };
      assignment.updatedAt = new Date(nowMs).toISOString();
      repairedIds.push(assignment.id);

      next.events.unshift({
        id: `continuity-violation:${assignment.id}:${nowMs}`,
        type: "system",
        title: "Responsibility continuity restored",
        detail: `OpenPresence detected an open responsibility (${assignment.title ?? assignment.instruction}) without active continuation and rematerialized its eligible Agenda work.`,
        time: new Date(nowMs).toISOString(),
        tone: "warning",
        presenceId: assignment.presenceId,
        sessionId: assignment.sessionId,
      });
    }
  }

  return { state: next, orphanedCount, repairedIds };
}
