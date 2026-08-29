import type { Assignment, AssignmentOutcomeClass, AssignmentRun, AssignmentRunStatus, AssignmentStatus, Execution, OpenPresenceState } from "./types";

const pendingDeliveryStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
const retryableDeliveryStatuses = new Set(["failed", "blocked", "expired"]);
const activePursuitSkippableFailureCodes = new Set(["TARGET_LANGUAGE_MISMATCH", "TARGET_DISAPPEARED", "X_API_CREDITS_EXHAUSTED"]);
const autonomousPreWriteClosureCodes = new Set(["BRIDGE_NOT_CHECKED_IN"]);

/**
 * These failures are safe for the Agent to close autonomously: the durable
 * execution proves that no connector claimed the action and no external
 * object exists. They must never be confused with an acknowledgement lost
 * after handoff, where the external outcome could be real but unverified.
 */
export function isAutonomousPreWriteDeliveryFailure(execution: Pick<Execution, "status" | "externalRef" | "failure">) {
  return retryableDeliveryStatuses.has(execution.status)
    && !execution.externalRef
    // Once reconciliation has closed the safe pre-write miss, the durable
    // failure is deliberately non-retryable. Treating it as fresh work on
    // every temporal sweep would rewrite the entire compatibility snapshot
    // indefinitely and keep the UI's read token moving forever.
    && execution.failure?.retryable !== false
    && autonomousPreWriteClosureCodes.has(execution.failure?.code?.toUpperCase() ?? "");
}

function nextRecurringAssignmentWake(assignment: Assignment, nowMs: number) {
  const schedule = assignment.schedule;
  if (!schedule) return new Date(nowMs + 15 * 60_000).toISOString();
  const [hours, minutes] = schedule.time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return new Date(nowMs + 15 * 60_000).toISOString();
  const next = new Date(nowMs);
  next.setHours(hours, minutes, 0, 0);
  const day = schedule.day.trim().toLowerCase();
  const recurrence = assignment.recurrence?.kind;
  if (recurrence === "daily" || day === "daily") {
    next.setDate(next.getDate() + (next.getTime() <= nowMs ? 1 : 0));
    return next.toISOString();
  }
  const dayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day);
  if (dayIndex < 0) return new Date(nowMs + 15 * 60_000).toISOString();
  let delta = (dayIndex - next.getDay() + 7) % 7;
  if (delta === 0 && next.getTime() <= nowMs) delta = 7;
  next.setDate(next.getDate() + delta);
  if (recurrence === "weekdays") {
    while ([0, 6].includes(next.getDay())) next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function closeAutonomousPreWriteAssignment(assignment: Assignment, execution: Execution, timestamp: string, nowMs: number) {
  const deliveryMessage = execution.failure?.message ?? "The authorized connector did not claim the action before the delivery window closed; no external write was attempted.";
  const message = `${deliveryMessage} The Agent closed this bounded attempt without retrying it; no public action was sent or counted as verified.`;
  const recurring = assignment.activation?.type === "continuous" || assignment.recurrence?.kind !== "once";
  execution.status = "failed";
  execution.failure = {
    ...execution.failure,
    message: deliveryMessage,
    retryable: false,
    reviewedAt: execution.failure?.reviewedAt ?? timestamp,
    reviewDisposition: "closed_non_retryable",
    reviewNote: "Closed automatically because the connector never claimed the action and no external write was attempted.",
  };
  execution.reviewReason = "The bounded delivery attempt ended before connector claim; no external write was attempted.";
  execution.lease = undefined;
  execution.permit = undefined;
  execution.updatedAt = timestamp;
  if (recurring) {
    assignment.status = "active";
    assignment.work = {
      ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
      phase: "candidate_review",
      attempts: 0,
      lastAttemptAt: undefined,
      blockedReason: undefined,
    };
    assignment.lastOutcome = { class: "delivery_failed", message, at: timestamp };
    assignment.lastEvaluatedAt = timestamp;
    assignment.nextDueAt = nextRecurringAssignmentWake(assignment, nowMs);
  } else {
    assignment.status = "expired_incomplete";
    assignment.work = {
      ...(assignment.work ?? { phase: "completed", attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
      phase: "completed",
      blockedReason: undefined,
    };
    assignment.lastOutcome = { class: "incomplete", message, at: timestamp };
    assignment.nextDueAt = undefined;
  }
  assignment.updatedAt = timestamp;
  return message;
}

/**
 * An unresolved delivery normally owns the Assignment until it settles. A
 * verification-pending action that is explicitly non-retryable is different:
 * the external write may have happened, but this runtime cannot verify it
 * with the current provider. Keep that ambiguity visible without freezing an
 * otherwise active distribution push.
 */
export function assignmentRunBlocksNewWork(source: OpenPresenceState, run: AssignmentRun) {
  if (run.status !== "delivery_pending") return true;
  const linked = source.executions.filter((execution) => execution.assignmentId === run.assignmentId
    && execution.presenceId === run.presenceId
    && (execution.runId === run.id || (!execution.runId && execution.createdAt >= (run.startedAt ?? run.createdAt)))
    && pendingDeliveryStatuses.has(execution.status));
  if (!linked.length) return false;
  return linked.some((execution) => !(execution.status === "verification-pending" && execution.failure?.retryable === false));
}

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
      // A stale worker can leave an execution carrying the same Assignment
      // id but belonging to another Presence (for example after an operator
      // switches the active dashboard). It must never be allowed to rewrite
      // this run's status or block the current Presence's responsibility.
      if (execution.presenceId !== run.presenceId) return false;
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
 * unreviewed. Safe pre-write misses are an explicit autonomous-close
 * exception; outcomes that may have crossed the external boundary still need
 * operator-visible handling.
 */
export function reconcileLiveAssignmentRuns(source: OpenPresenceState, nowMs = Date.now()): OpenPresenceState {
  const timestamp = new Date(nowMs).toISOString();
  for (const run of source.assignmentRuns ?? []) {
    const execution = executionForRun(source, run);
    if (!execution) continue;
    const assignment = source.assignments.find((item) => item.id === run.assignmentId && item.presenceId === run.presenceId);

    // A browser identity failure happens before the public write. Older
    // runtimes treated that safe hold as a terminal delivery failure and
    // transferred routine continuity work to the operator. Repair those
    // records in place: the Bridge identity report remains the source of
    // truth, and verification of the expected account releases the hold.
    const recoverableIdentityHold = execution.connector === "bridge"
      && !execution.externalRef
      && !execution.failure?.reviewedAt
      && ["ACCOUNT_MISMATCH", "ACCOUNT_NOT_READY"].includes(execution.failure?.code ?? "")
      && ["failed", "blocked"].includes(execution.status);
    if (recoverableIdentityHold) {
      execution.status = "queued";
      execution.failure = execution.failure ? { ...execution.failure, retryable: true } : execution.failure;
      execution.deliveryHold = execution.deliveryHold ?? { reason: "bridge_identity", at: execution.updatedAt ?? timestamp };
      execution.lease = undefined;
      execution.permit = undefined;
      if (execution.publication?.publicExpression) {
        execution.publication.publicExpression.safetyStatus = "candidate";
        execution.publication.publicExpression.payloadHash = undefined;
      }
      execution.updatedAt = timestamp;
      if (assignment && !["completed", "cancelled", "expired_incomplete"].includes(assignment.status)) {
        assignment.status = "awaiting_execution";
        assignment.work = {
          ...(assignment.work ?? { phase: "publishing", attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }),
          phase: "publishing",
          blockedReason: undefined,
        };
        assignment.lastOutcome = undefined;
        assignment.nextDueAt = undefined;
        assignment.updatedAt = timestamp;
      }
    }

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

    const activePursuit = run.pursuitWindowId
      && (source.assignmentPursuitWindows ?? []).some((window) => window.id === run.pursuitWindowId && window.status === "active");
    if (assignment && isAutonomousPreWriteDeliveryFailure(execution)) {
      const message = closeAutonomousPreWriteAssignment(assignment, execution, timestamp, nowMs);
      run.status = assignment.status === "expired_incomplete" ? "failed" : "deferred";
      run.currentStage = assignment.status === "expired_incomplete" ? "blocked" : "candidate_review";
      run.lastError = assignment.status === "expired_incomplete" ? message : undefined;
      run.completedAt = run.completedAt ?? execution.updatedAt ?? timestamp;
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = timestamp;
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
      if (assignment && activePursuit && ["blocked", "needs_operator"].includes(assignment.status)) {
        // An active operator-requested pursuit supersedes a stale blocking
        // projection while its current public action is awaiting verification.
        // Keep required-target deletion and connector failures outside this
        // repair path; those windows are paused or have no pending execution.
        assignment.status = "awaiting_execution";
        assignment.work = { ...(assignment.work ?? { phase: "publishing", attempts: run.attempts, maxAttempts: run.maxAttempts, storiesResearched: 0 }), phase: "publishing", blockedReason: undefined };
        assignment.lastOutcome = undefined;
        assignment.updatedAt = timestamp;
      } else if (assignment && !["completed", "cancelled", "blocked", "needs_operator"].includes(assignment.status) && (assignment.status !== "awaiting_execution" || assignment.work?.phase !== "publishing")) {
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
    const deliveryNeedsOperator = (execution.failure?.retryable === false || Boolean(execution.failure?.reviewedAt))
      && !(activePursuit && activePursuitSkippableFailureCodes.has(execution.failure?.code ?? ""));
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
  safePreWriteClosed = false,
}: {
  outcomeClass?: AssignmentOutcomeClass;
  assignmentStatus?: AssignmentStatus;
  newlySucceededExecution: boolean;
  deliveryPending?: boolean;
  safePreWriteClosed?: boolean;
}): AssignmentRunStatus {
  if (outcomeClass === "assignment_completed" || assignmentStatus === "completed" || assignmentStatus === "completed_with_adaptation" || newlySucceededExecution) return "published";
  if (deliveryPending) return "delivery_pending";
  if (safePreWriteClosed) return assignmentStatus === "expired_incomplete" ? "failed" : "deferred";
  if (assignmentStatus === "blocked" || assignmentStatus === "needs_operator" || ["evaluation_failed", "delivery_failed", "language_policy_failed", "incomplete"].includes(outcomeClass ?? "")) return "blocked";
  if (outcomeClass === "action_no_op" || outcomeClass === "candidate_rejected") return "deferred";
  return "failed";
}

export function liveAssignmentRunStage(status: AssignmentRunStatus): "completed" | "candidate_review" | "publishing" | "blocked" {
  return status === "published" ? "completed" : status === "deferred" ? "candidate_review" : status === "delivery_pending" ? "publishing" : "blocked";
}
