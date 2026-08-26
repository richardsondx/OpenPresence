import type { Assignment, AssignmentOutcomeClass, AssignmentRun, AssignmentRunStatus, AssignmentStatus, Execution, OpenPresenceState } from "./types";

const pendingDeliveryStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
const retryableDeliveryStatuses = new Set(["failed", "blocked", "expired"]);

export function isTerminalDuplicateExecution(execution: Pick<Execution, "failure">) {
  const code = execution.failure?.code?.toUpperCase() ?? "";
  const message = execution.failure?.message ?? "";
  return code === "DUPLICATE_CONTENT"
    || code === "DUPLICATE_PUBLICATION"
    || /duplicate content|duplicate.*tweet|not allowed to create a Tweet with duplicate|already said that/i.test(message);
}

function closeDuplicateAssignment(assignment: Assignment, execution: Execution, timestamp: string) {
  const affordance = execution.affordance.replace(/^x\./, "");
  const message = `X reported that this exact ${affordance} expression was already published. OpenPresence closed the attempt and will not send it again. No new public action was counted.`;
  assignment.status = "failed";
  assignment.work = {
    ...(assignment.work ?? { phase: "completed", attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
    phase: "completed",
    blockedReason: undefined,
  };
  assignment.lastOutcome = { class: "delivery_failed", message, at: timestamp };
  assignment.nextDueAt = undefined;
  assignment.updatedAt = timestamp;
  execution.failure = {
    ...execution.failure,
    message: execution.failure?.message ?? message,
    retryable: false,
    reviewedAt: execution.failure?.reviewedAt ?? timestamp,
    reviewDisposition: "closed_non_retryable",
    reviewNote: execution.failure?.reviewNote ?? "Closed automatically because X reported that the exact expression had already been published. Retrying would only repeat the same public act.",
  };
  execution.reviewReason = execution.reviewReason ?? "Already published on X; closed automatically without retrying or counting a new action.";
  execution.updatedAt = timestamp;
  return message;
}

export function settleTerminalDuplicateAssignment(source: OpenPresenceState, assignment: Assignment, execution: Execution, timestamp: string) {
  if (!isTerminalDuplicateExecution(execution)) return false;
  const settledAt = execution.failure?.reviewedAt ?? execution.updatedAt ?? timestamp;
  const message = closeDuplicateAssignment(assignment, execution, settledAt);
  const run = (source.assignmentRuns ?? []).find((candidate) => candidate.assignmentId === assignment.id && (candidate.id === execution.runId || !execution.runId));
  if (run) {
    run.status = "failed";
    run.currentStage = "completed";
    run.lastError = message;
    run.completedAt = run.completedAt ?? settledAt;
    run.leaseOwner = undefined;
    run.leaseExpiresAt = undefined;
    run.updatedAt = settledAt;
  }
  return true;
}

function executionForRun(state: OpenPresenceState, run: AssignmentRun) {
  // Unbound legacy executions may only be associated with a run created at
  // or after the run's own durable start. Treating a missing start as
  // -Infinity made every retry inherit the first historical execution for
  // the Assignment and immediately re-fail with its stale error.
  const startedAt = Date.parse(run.startedAt ?? run.createdAt);
  return state.executions
    .filter((execution) => {
      if (execution.assignmentId !== run.assignmentId) return false;
      if (execution.runId === run.id) return true;
      if (execution.runId) return false;
      const createdAt = Date.parse(execution.createdAt);
      return Number.isFinite(createdAt) && createdAt >= startedAt;
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

/**
 * Reconcile the AssignmentRun projection from durable delivery facts.
 *
 * A live run can finish cognition before a Native/Bridge connector claims its
 * execution. That is a legitimate delivery boundary, not a failed cognition
 * run. A retry is only safe while the delivery failure is still retryable and
 * unreviewed. Once expiry has been closed as stale/non-retryable, the
 * Assignment needs an explicit operator decision instead of being silently
 * reactivated by a read or health pass.
 */
export function reconcileLiveAssignmentRuns(source: OpenPresenceState, nowMs = Date.now()): OpenPresenceState {
  const timestamp = new Date(nowMs).toISOString();
  for (const run of source.assignmentRuns ?? []) {
    const execution = executionForRun(source, run);
    if (!execution) continue;
    const assignment = source.assignments.find((item) => item.id === run.assignmentId);

    if (execution.status === "succeeded") {
      if (run.status !== "published" || run.currentStage !== "completed" || run.lastError || run.leaseOwner || run.leaseExpiresAt) {
        run.status = "published";
        run.currentStage = "completed";
        run.completedAt = run.completedAt ?? execution.updatedAt ?? timestamp;
        run.lastError = undefined;
        run.leaseOwner = undefined;
        run.leaseExpiresAt = undefined;
        run.updatedAt = timestamp;
      }
      continue;
    }

    if (pendingDeliveryStatuses.has(execution.status)) {
      if (run.status !== "delivery_pending" || run.currentStage !== "publishing" || run.completedAt || run.lastError || run.leaseOwner || run.leaseExpiresAt) {
        run.status = "delivery_pending";
        run.currentStage = "publishing";
        run.completedAt = undefined;
        run.lastError = undefined;
        run.leaseOwner = undefined;
        run.leaseExpiresAt = undefined;
        run.updatedAt = timestamp;
      }
      if (assignment && !["completed", "cancelled", "blocked", "needs_operator"].includes(assignment.status) && (assignment.status !== "awaiting_execution" || assignment.work?.phase !== "publishing")) {
        assignment.status = "awaiting_execution";
        assignment.work = { ...(assignment.work ?? { phase: "publishing", attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }), phase: "publishing" };
        assignment.updatedAt = timestamp;
      }
      continue;
    }

    if (assignment && isTerminalDuplicateExecution(execution)) {
      settleTerminalDuplicateAssignment(source, assignment, execution, timestamp);
      continue;
    }

    if (!retryableDeliveryStatuses.has(execution.status)) continue;
    const deliveryMessage = execution.failure?.message ?? "The connector did not claim the action before its delivery window closed.";
    if (run.status !== "failed" || run.currentStage !== "blocked" || run.lastError !== deliveryMessage || !run.completedAt || run.leaseOwner || run.leaseExpiresAt) {
      run.status = "failed";
      run.currentStage = "blocked";
      run.lastError = deliveryMessage;
      run.completedAt = run.completedAt ?? execution.updatedAt ?? timestamp;
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
    }
    const deliveryNeedsOperator = execution.failure?.retryable === false || Boolean(execution.failure?.reviewedAt);
    if (assignment && deliveryNeedsOperator && !["completed", "cancelled", "blocked", "expired_incomplete"].includes(assignment.status)) {
      const needsAssignmentRepair = assignment.status !== "needs_operator"
        || assignment.work?.phase !== "blocked"
        || assignment.work?.blockedReason !== deliveryMessage
        || assignment.lastOutcome?.class !== "delivery_failed"
        || assignment.lastOutcome?.message !== deliveryMessage
        || assignment.nextDueAt !== undefined;
      if (!needsAssignmentRepair) continue;
      assignment.status = "needs_operator";
      assignment.work = {
        ...(assignment.work ?? { phase: "blocked", attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }),
        phase: "blocked",
        blockedReason: deliveryMessage,
      };
      assignment.lastOutcome = { class: "delivery_failed", message: deliveryMessage, at: timestamp };
      assignment.nextDueAt = undefined;
      assignment.updatedAt = timestamp;
      continue;
    }
    if (assignment && !["completed", "cancelled", "blocked", "expired_incomplete"].includes(assignment.status)) {
      const nextDueAt = new Date(nowMs + 15 * 60_000).toISOString();
      const sameOutcome = assignment.lastOutcome?.class === "delivery_failed" && assignment.lastOutcome.message === deliveryMessage;
      // `nextDueAt` is the durable retry wake. Once it has elapsed, keep that
      // overdue wake in place until the scheduler claims it. Recomputing it
      // from `now` on every health/read pass creates a livelock where the
      // retry is perpetually pushed another 15 minutes into the future.
      const hasRetryWake = Boolean(assignment.nextDueAt && Number.isFinite(Date.parse(assignment.nextDueAt)));
      const needsAssignmentRepair = assignment.status !== "active" || assignment.work?.phase !== "candidate_review" || assignment.work?.blockedReason !== undefined || !sameOutcome || !hasRetryWake;
      if (!needsAssignmentRepair) continue;
      assignment.status = "active";
      assignment.work = {
        ...(assignment.work ?? { phase: "candidate_review", attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }),
        phase: "candidate_review",
        blockedReason: undefined,
      };
      assignment.lastOutcome = sameOutcome ? assignment.lastOutcome : { class: "delivery_failed", message: deliveryMessage, at: timestamp };
      assignment.nextDueAt = hasRetryWake ? assignment.nextDueAt : nextDueAt;
      assignment.updatedAt = timestamp;
    }
  }
  return source;
}

/**
 * A live AssignmentRun owns delivery, while its parent Assignment can remain
 * active until the Social Mirror verifies the external result.
 */
export function classifyLiveAssignmentRun({
  outcomeClass,
  assignmentStatus,
  newlySucceededExecution,
  deliveryPending = false,
}: {
  outcomeClass?: AssignmentOutcomeClass;
  assignmentStatus?: AssignmentStatus;
  newlySucceededExecution: boolean;
  deliveryPending?: boolean;
}): AssignmentRunStatus {
  if (outcomeClass === "assignment_completed" || assignmentStatus === "completed" || assignmentStatus === "completed_with_adaptation" || newlySucceededExecution) return "published";
  if (deliveryPending) return "delivery_pending";
  if (assignmentStatus === "blocked" || assignmentStatus === "needs_operator" || ["evaluation_failed", "delivery_failed", "language_policy_failed", "incomplete"].includes(outcomeClass ?? "")) return "blocked";
  if (outcomeClass === "action_no_op" || outcomeClass === "candidate_rejected") return "deferred";
  return "failed";
}

export function liveAssignmentRunStage(status: AssignmentRunStatus): "completed" | "candidate_review" | "publishing" | "blocked" {
  return status === "published" ? "completed" : status === "deferred" ? "candidate_review" : status === "delivery_pending" ? "publishing" : "blocked";
}
