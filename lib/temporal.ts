import {
  claimOperationalRunLease,
  claimDueScheduledWakes,
  getOperationalRun,
  getRecoveryIncident,
  listOperationalRuns,
  listScheduledWakes,
  listRecoveryIncidents,
  mergeAttentionWake,
  readState,
  readStateViewForContext,
  reclaimExpiredLeases,
  recordProcessHeartbeat,
  releaseOperationalRunLease,
  upsertOperationalRun,
  upsertScheduledWake,
  writeState,
} from "./db";
import { attentionRequestFromWake, attentionRunAcceptsSignal, mergeAttentionRequests, requestAttention } from "./attention-coordinator";
import { settleAttentionResponsibility } from "./attention-responsibility";
import { bridgeExecutionStatus } from "./bridge-contract";
import { assignmentPursuitHasHardResourceCapacity, assignmentPursuitUsage, recordRuntimeEvent, scheduledAssignmentIsDue } from "./runtime";
import { assignmentRunBlocksNewWork, isAutonomousPreWriteDeliveryFailure, reconcileLiveAssignmentRuns } from "./live-assignment-run";
import { reconcileOrphanedAttentionEpisodes } from "./attention-episodes";
import type {
  JsonValue,
  Execution,
  OpenPresenceState,
  OperationalRun,
  Presence,
  ScheduledWake,
  ScheduledWakeKind,
} from "./types";

/** Close stale pre-dispatch work even when no Bridge can perform claim-time expiry. */
export function expireQueuedDeliveryWindows(source: OpenPresenceState, now = new Date()): number {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const preDispatchStatuses = new Set<Execution["status"]>(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"]);
  let expired = 0;
  const affectedAttentionRunIds = new Set<string>();
  for (const execution of source.executions ?? []) {
    if (!preDispatchStatuses.has(execution.status)) continue;
    const intent = source.socialIntents?.find((item) => item.id === execution.socialIntentId);
    const expiresAt = intent?.validity?.expiresAt;
    if (!expiresAt || new Date(expiresAt).getTime() > nowMs) continue;
    execution.status = "expired";
    delete execution.lease;
    delete execution.permit;
    execution.failure = {
      ...execution.failure,
      code: "INTENT_EXPIRED_BEFORE_CLAIM",
      message: "The delivery window expired before an authorized connector claimed this action.",
      retryable: false,
      reviewedAt: execution.failure?.reviewedAt ?? nowIso,
      reviewDisposition: "stale",
      reviewNote: "Closed automatically before any external write was attempted.",
    };
    execution.reviewReason = "The Social Intent expired while waiting for a connector; no external delivery was attempted.";
    execution.updatedAt = nowIso;
    if (intent) {
      intent.state = "expired";
      intent.updatedAt = nowIso;
    }
    const action = source.actions?.find((item) => item.executionId === execution.id);
    if (action) {
      action.status = "skipped";
      action.reason = "The delivery window expired before a connector claimed this action; no external write was attempted.";
    }
    if (execution.runId) affectedAttentionRunIds.add(execution.runId);
    else if (execution.attentionEpisodeId) {
      const linkedRun = listOperationalRuns(execution.presenceId).find((run) => run.kind === "attention" && run.attentionEpisodeId === execution.attentionEpisodeId);
      if (linkedRun) affectedAttentionRunIds.add(linkedRun.id);
    }
    if (execution.connector === "bridge") {
      recordOperationalFailure({
        dependency: "user_attached_bridge",
        presenceId: execution.presenceId,
        runId: execution.runId,
        error: "Browser delivery claim expired before the authorized route completed the action.",
      });
    }
    expired += 1;
  }
  for (const runId of affectedAttentionRunIds) {
    const run = getOperationalRun(runId);
    if (!run?.attentionEpisodeId || run.kind !== "attention") continue;
    const settled = settleAttentionResponsibility(source, run, run.attentionEpisodeId);
    source.attentionEpisodes = settled.state.attentionEpisodes;
    upsertOperationalRun(settled.run);
  }
  return expired;
}

/** Assignment work is owned by AssignmentRun, never generic Attention. */
export function repairMissingAssignmentWakes(state: OpenPresenceState, now = new Date()): number {
  return dueLiveAssignmentsWithoutWorkers(state, now).length;
}

const assignmentDispatchesInFlight = new Set<string>();
const assignmentPursuitResourceCategories = [
  "maxChannelReads",
  "maxHydrations",
  "maxModelCalls",
  "maxVisionCalls",
  "maxEstimatedCostCents",
] as const;

/** Convert an exhausted live burst into an explicit durable pause. */
export function pauseExhaustedAssignmentPursuits(state: OpenPresenceState, now = new Date()): number {
  let paused = 0;
  for (const pursuit of state.assignmentPursuitWindows ?? []) {
    if (pursuit.status !== "active" || new Date(pursuit.startsAt).getTime() > now.getTime() || new Date(pursuit.deadlineAt).getTime() <= now.getTime()) continue;
    const usage = assignmentPursuitUsage(state, pursuit, now.getTime());
    const limits: Array<[keyof NonNullable<typeof pursuit.resourceBudget>, number | undefined, number]> = [
      ["maxChannelReads", pursuit.resourceBudget?.maxChannelReads, usage.channelReads],
      ["maxHydrations", pursuit.resourceBudget?.maxHydrations, usage.hydrations],
      ["maxModelCalls", pursuit.resourceBudget?.maxModelCalls, usage.modelCalls],
      ["maxVisionCalls", pursuit.resourceBudget?.maxVisionCalls, usage.visionCalls],
      ["maxEstimatedCostCents", pursuit.resourceBudget?.maxEstimatedCostCents, usage.estimatedCostCents],
    ];
    const reached = limits.find(([, limit, current]) => limit !== undefined && current >= limit);
    if (!reached) continue;
    const [category, limit, current] = reached;
    pursuit.status = "paused";
    pursuit.pauseReason = `${category} budget reached (${current} / ${limit}).`;
    pursuit.nextRunAt = undefined;
    pursuit.updatedAt = now.toISOString();
    paused += 1;
    const assignment = state.assignments.find((item) => item.id === pursuit.assignmentId && item.presenceId === pursuit.presenceId);
    if (assignment) recordRuntimeEvent(state, pursuit.presenceId, "Distribution push paused", `The burst paused automatically because its bounded resource envelope was reached: ${pursuit.pauseReason}`, "warning", { sourceObjectId: assignment.id });
  }
  return paused;
}

export function dueLiveAssignmentsWithoutWorkers(state: OpenPresenceState, now = new Date()) {
  return state.assignments.filter((assignment) => {
    const presence = state.presences.find((item) => item.id === assignment.presenceId);
    if (!presence || presence.status !== "live" || assignment.environment === "sandbox") return false;
    const pursuit = (state.assignmentPursuitWindows ?? []).find((window) => window.assignmentId === assignment.id && window.presenceId === assignment.presenceId && window.status === "active");
    const pursuitDue = Boolean(pursuit
      && new Date(pursuit.startsAt).getTime() <= now.getTime()
      && new Date(pursuit.deadlineAt).getTime() > now.getTime()
      && (!pursuit.nextRunAt || new Date(pursuit.nextRunAt).getTime() <= now.getTime()));
    // While an increased-effort window is open, the ordinary daily scheduler
    // must not run the same Assignment outside that window. Otherwise a
    // paused/spacing burst keeps consuming research and model capacity while
    // its Activity card truthfully says that no further burst pass is queued.
    const pursuitOwnsScheduling = (state.assignmentPursuitWindows ?? []).some((window) =>
      window.assignmentId === assignment.id
      && window.presenceId === assignment.presenceId
      && new Date(window.deadlineAt).getTime() > now.getTime()
      && ((window.status === "active" && new Date(window.startsAt).getTime() <= now.getTime())
        || window.status === "paused" && window.pauseReason?.includes("budget reached")));
    if (pursuitOwnsScheduling && !pursuitDue) return false;
    // Capacity is a scheduler gate, not merely a worker-time validation. If
    // a concurrent worker writes an older snapshot after the sweep's pause,
    // an exhausted pursuit must still be unable to generate another dispatch
    // attempt or an HTTP 400 retry storm.
    if (pursuitDue && pursuit && !assignmentPursuitHasHardResourceCapacity(state, pursuit, now.getTime())) return false;
    // A temporary distribution push is its own execution window. The parent
    // Assignment may already have satisfied its ordinary daily deliverable,
    // and its bounded retry budget must not silence the explicitly requested
    // push. Keep operator-blocked/cancelled work excluded; only the normal
    // completed projection is reopened by a live pursuit.
    const pursuitMayContinue = pursuitDue && ["accepted", "planning", "active", "working", "awaiting_execution", "completed", "completed_with_adaptation"].includes(assignment.status);
    if (!pursuitMayContinue && !["accepted", "planning", "active", "working", "awaiting_execution"].includes(assignment.status)) return false;
    const work = assignment.work;
    const quietBudgetExhausted = Boolean(work?.maxAttempts && work.attempts >= work.maxAttempts && ["action_no_op", "candidate_rejected"].includes(assignment.lastOutcome?.class ?? ""));
    if (!pursuitDue && (quietBudgetExhausted || work?.maxAttempts && work.attempts >= work.maxAttempts)) return false;
    const isDue = pursuitDue || Boolean(assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() <= now.getTime()) || scheduledAssignmentIsDue(assignment, now);
    if (!isDue) return false;
    return !(state.assignmentRuns ?? []).some((run) => run.assignmentId === assignment.id
      && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status)
      && assignmentRunBlocksNewWork(state, run));
  });
}

/**
 * Bridge the durable scheduler to the server-owned Assignment worker entry
 * point. The POST immediately persists AssignmentRun before returning, so a
 * process loss is recoverable and repeated sweeps are deduplicated by both
 * this in-process fence and the durable active-run check above.
 */
export function dispatchDueAssignmentWorkers(state: OpenPresenceState, now = new Date()): number {
  let dispatched = 0;
  const port = process.env.OPENPRESENCE_PORT || "3015";
  const origin = process.env.OPENPRESENCE_INTERNAL_ORIGIN || `http://127.0.0.1:${port}`;
  for (const assignment of dueLiveAssignmentsWithoutWorkers(state, now)) {
    if (!assignment.presenceId || assignmentDispatchesInFlight.has(assignment.id)) continue;
    assignmentDispatchesInFlight.add(assignment.id);
    dispatched += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setImmediate(() => {
      void fetch(`${origin}/api/state`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-openpresence-internal-dispatch": "assignment" },
        body: JSON.stringify({ type: "runLiveAssignment", assignmentId: assignment.id, presenceId: assignment.presenceId }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Assignment worker dispatch returned HTTP ${response.status}.`);
        await response.body?.cancel();
      }).catch(() => {
        // nextDueAt remains durable; the next bounded sweep retries safely.
      }).finally(() => {
        clearTimeout(timeout);
        assignmentDispatchesInFlight.delete(assignment.id);
      });
    });
  }
  return dispatched;
}

/** Restore a lost live Chat wake without ever waking a paused Presence. */
export function repairMissingOperatorNudgeWakes(state: OpenPresenceState, now = new Date()): number {
  let repaired = 0;
  for (const presence of state.presences.filter((item) => item.status === "live")) {
    const hasQueuedNudge = (state.operatorNudges ?? []).some((nudge) => nudge.presenceId === presence.id && ["queued", "acknowledged"].includes(nudge.status));
    if (!hasQueuedNudge) continue;
    const hasNudgeWake = listScheduledWakes(presence.id).some((wake) => wake.state === "pending" && ((wake.payload as { triggers?: string[] } | undefined)?.triggers ?? []).includes("operator_nudge"));
    // A waiting Attention run owns delivery/verification continuity, but it
    // has no cognition worker. It must not block the next queued Chat note.
    const hasNudgeRun = listOperationalRuns(presence.id, ["queued", "running", "recovering", "delivery_uncertain", "reconciling"])
      .some((run) => run.kind === "attention" && run.attention?.triggers.includes("operator_nudge"));
    if (hasNudgeWake || hasNudgeRun) continue;
    requestAttention(presence.id, "operator_nudge", now.toISOString(), "broad");
    repaired += 1;
  }
  return repaired;
}

/**
 * Close a Bridge action that cannot make progress because its adapter stopped
 * checking in. An unclaimed action must never hold an Attention run forever;
 * this records a truthful terminal failure. Assignment reconciliation then
 * decides whether the bounded attempt can be closed autonomously or must
 * remain operator-visible because delivery may have crossed the write boundary.
 */
export function closeStaleBridgeExecutions(source: OpenPresenceState, now = new Date(), claimWindowMs = 120_000): number {
  const nowMs = now.getTime();
  const pendingStatuses = new Set<Execution["status"]>(["awaiting-connector", "queued"]);
  const bridges = new Map((source.bridges ?? []).map((bridge) => [bridge.id, bridge]));
  const affectedAttentionRunIds = new Set<string>();
  let closed = 0;
  for (const execution of source.executions ?? []) {
    if (!execution.bridgeId || !pendingStatuses.has(execution.status)) continue;
    const bridge = bridges.get(execution.bridgeId);
    if (!bridge || bridgeExecutionStatus(bridge, nowMs) === "connected") continue;
    const formedAt = new Date(execution.updatedAt ?? execution.createdAt).getTime();
    if (!Number.isFinite(formedAt) || nowMs - formedAt < claimWindowMs) continue;
    execution.status = "failed";
    delete execution.lease;
    delete execution.permit;
    execution.failure = {
      code: "BRIDGE_NOT_CHECKED_IN",
      message: "The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted.",
      retryable: true,
      reviewedAt: now.toISOString(),
      reviewDisposition: "stale",
      reviewNote: "Reconnect the Bridge and retry this action after confirming the expected account.",
    };
    execution.reviewReason = "The Bridge was stale before it claimed this action; no public delivery is counted.";
    execution.updatedAt = now.toISOString();
    const intent = source.socialIntents?.find((item) => item.id === execution.socialIntentId);
    if (intent) {
      intent.state = "expired";
      intent.updatedAt = now.toISOString();
    }
    const action = source.actions?.find((item) => item.executionId === execution.id);
    if (action) {
      action.status = "failed";
      action.reason = "The browser connector did not check in before the bounded delivery window closed; no external write was attempted.";
    }
    if (execution.runId) affectedAttentionRunIds.add(execution.runId);
    closed += 1;
  }
  for (const runId of affectedAttentionRunIds) {
    const run = getOperationalRun(runId);
    if (!run?.attentionEpisodeId || run.kind !== "attention") continue;
    const settled = settleAttentionResponsibility(source, run, run.attentionEpisodeId);
    source.attentionEpisodes = settled.state.attentionEpisodes;
    upsertOperationalRun(settled.run);
  }
  return closed;
}

// ============================================================================
// Stage-Specific Expected Durations (Seconds)
// ============================================================================

export const STAGE_EXPECTED_DURATIONS_SECONDS: Record<string, number> = {
  // Browser interaction stages
  "browser.acquire_tab": 30,
  "browser.navigate": 45,
  "browser.inspect_dom": 45,
  "browser.composer_input": 60,
  "browser.submit": 45,
  "browser.verify_sent": 60,

  // Native API stages
  "native.observe": 180,
  "native.post": 30,
  "native.verify": 45,
  "native.hydrate": 60,

  // Autonomous orchestration stages. These are bounded, but deliberately
  // longer than a single provider request because an observation can include
  // several reads, hydration, and a pulse in one leased run.
  "runtime.pulse": 180,
  "discovery.search": 180,
  "discovery.triage": 120,
  "discovery.decide": 120,
  "operator_chat.generating": 90,
  "woken_from_observation": 240,
  "woken_from_attention": 240,
  "woken_from_self_directed_discovery": 240,

  // State machine & recovery stages
  "recovering.probe": 20,
  "recovering.tab_recreate": 45,
  "recovering.browser_restart": 90,
  "recovering.controller_restart": 60,
  "recovering.reconcile_world": 120,

  // Waiting stages have dynamic or generous boundaries
  "waiting.provider_quota": 86400, // Tied to nextWakeAt
  "waiting.cooldown": 3600, // Tied to nextWakeAt
  "waiting.operator_action": 604800, // 7 days

  // Default fallback
  "default": 120,
};

/**
 * Determine the expected duration in seconds for a given operational stage.
 */
export function getExpectedStageDurationSeconds(stage: string): number {
  if (STAGE_EXPECTED_DURATIONS_SECONDS[stage]) {
    return STAGE_EXPECTED_DURATIONS_SECONDS[stage];
  }
  // Check prefix match e.g. "browser." or "recovering."
  for (const [prefix, duration] of Object.entries(STAGE_EXPECTED_DURATIONS_SECONDS)) {
    if (stage.startsWith(prefix)) {
      return duration;
    }
  }
  return STAGE_EXPECTED_DURATIONS_SECONDS["default"];
}

/**
 * Calculate the exact ISO UTC timestamp when a run becomes stale if progress is not made.
 */
export function calculateStaleAt(run: OperationalRun): string {
  // If the run is explicitly waiting with a next wake timer, it is not stale until past nextWakeAt
  if (run.state === "waiting" && run.nextWakeAt) {
    return run.nextWakeAt;
  }

  const baseTimeStr = run.lastProgressAt ?? run.startedAt ?? run.createdAt;
  const baseTime = new Date(baseTimeStr).getTime();
  const durationMs = getExpectedStageDurationSeconds(run.stage) * 1000;
  return new Date(baseTime + durationMs).toISOString();
}

/**
 * Evaluate if an OperationalRun has stopped making progress according to stage expectations.
 */
export function evaluateOperationalRunProgress(
  run: OperationalRun,
  now = new Date(),
): {
  isStale: boolean;
  reason?: string;
  elapsedSeconds: number;
  expectedDurationSeconds: number;
} {
  // Terminal states and operator-waiting states are never stale
  if (["succeeded", "failed", "cancelled", "needs_operator"].includes(run.state)) {
    return {
      isStale: false,
      elapsedSeconds: 0,
      expectedDurationSeconds: 0,
    };
  }

  const nowMs = now.getTime();

  // If waiting for a provider reset or cooldown wake
  if (run.state === "waiting" && run.nextWakeAt) {
    const wakeMs = new Date(run.nextWakeAt).getTime();
    if (nowMs > wakeMs + 60000) {
      // Overdue wake by more than 60 seconds
      return {
        isStale: true,
        reason: `Wake timer passed without trigger (${Math.round((nowMs - wakeMs) / 1000)}s overdue)`,
        elapsedSeconds: Math.round((nowMs - wakeMs) / 1000),
        expectedDurationSeconds: 0,
      };
    }
    return {
      isStale: false,
      elapsedSeconds: 0,
      expectedDurationSeconds: Math.round((wakeMs - nowMs) / 1000),
    };
  }

  const baseTimeStr = run.lastProgressAt ?? run.startedAt ?? run.createdAt;
  const baseTimeMs = new Date(baseTimeStr).getTime();
  const elapsedSeconds = Math.max(0, Math.round((nowMs - baseTimeMs) / 1000));
  const expectedDurationSeconds = getExpectedStageDurationSeconds(run.stage);

  const isStale = elapsedSeconds > expectedDurationSeconds;
  return {
    isStale,
    reason: isStale
      ? `Stage "${run.stage}" exceeded expected duration (${elapsedSeconds}s elapsed vs ${expectedDurationSeconds}s allowed)`
      : undefined,
    elapsedSeconds,
    expectedDurationSeconds,
  };
}

// ============================================================================
// Durable Scheduled Wakes
// ============================================================================

export function scheduleWake(
  kind: ScheduledWakeKind,
  wakeAtIso: string,
  presenceId?: string,
  targetId?: string,
  payload?: Record<string, JsonValue>,
): ScheduledWake {
  const wake: ScheduledWake = {
    id: `wake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    presenceId,
    wakeAt: wakeAtIso,
    kind,
    targetId,
    payload,
    state: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  upsertScheduledWake(wake);
  return wake;
}

export function scheduleRetryWake(
  targetId: string,
  delaySeconds: number,
  presenceId?: string,
  payload?: Record<string, JsonValue>,
): ScheduledWake {
  const wakeAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  return scheduleWake("retry", wakeAt, presenceId, targetId, payload);
}

export function scheduleProviderResetWake(
  targetId: string,
  resetAtIso: string,
  presenceId?: string,
  payload?: Record<string, JsonValue>,
): ScheduledWake {
  return scheduleWake("provider_reset", resetAtIso, presenceId, targetId, payload);
}

export function scheduleRecoveryCooldownWake(
  targetId: string,
  cooldownSeconds: number,
  presenceId?: string,
  payload?: Record<string, JsonValue>,
): ScheduledWake {
  const wakeAt = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
  return scheduleWake("recovery_cooldown", wakeAt, presenceId, targetId, payload);
}

const verificationRunStates = new Set<OperationalRun["state"]>(["queued", "running", "waiting", "recovering", "reconciling"]);

const pendingExecutionStates = new Set<Execution["status"]>([
  "awaiting-review",
  "approved",
  "awaiting-manual",
  "awaiting-connector",
  "queued",
  "claimed",
  "executing",
  "verification-pending",
]);

/**
 * Close old waiting records that no longer have a durable execution to own.
 *
 * Waiting delivery/verification is legitimate only while a matching pending
 * execution remains. After a restart or recovery, an index row can outlive
 * its episode/execution. Leaving that row active makes Activity and health
 * report work that cannot possibly make progress, so close it explicitly
 * without claiming that an external action succeeded.
 */
export function reconcileOrphanedWaitingRuns(source: OpenPresenceState, now = new Date(), presenceId?: string): number {
  const staleBefore = now.getTime() - 120_000;
  let closed = 0;
  for (const run of listOperationalRuns(undefined, ["waiting"])) {
    if (presenceId && run.presenceId !== presenceId) continue;
    if (!["attention", "verification"].includes(run.kind)) continue;
    const progressAt = new Date(run.lastProgressAt ?? run.startedAt ?? run.createdAt).getTime();
    if (!Number.isFinite(progressAt) || progressAt > staleBefore) continue;
    if (run.nextWakeAt && new Date(run.nextWakeAt).getTime() > now.getTime() - 60_000) continue;
    const linkedExecutions = (source.executions ?? []).filter((execution) =>
      execution.id === run.executionId
      || execution.runId === run.id
      || (run.attentionEpisodeId && execution.attentionEpisodeId === run.attentionEpisodeId)
    );
    if (linkedExecutions.some((execution) => pendingExecutionStates.has(execution.status))) continue;

    run.state = "failed";
    run.stage = "recovered_orphaned_wait";
    run.lastErrorCode = "STALE_WAITING_RUN";
    run.blockedReason = "This waiting responsibility had no matching pending execution after restart/recovery; no external action was claimed as successful.";
    run.lastProgressAt = now.toISOString();
    delete run.nextWakeAt;
    delete run.leaseOwner;
    delete run.leaseExpiresAt;
    if (run.result) {
      run.result = {
        ...run.result,
        disposition: "failed",
        reasonCode: "STALE_WAITING_RUN",
        summary: "The waiting record was closed because its pending execution evidence was not recoverable; no external success was claimed.",
        pendingExecutionCount: 0,
        failedExecutionCount: Math.max(1, run.result.failedExecutionCount),
        completedAt: now.toISOString(),
      };
    }
    upsertOperationalRun(run);
    closed += 1;
  }
  return closed;
}

/**
 * Repair verification responsibility after a server or browser restart. The
 * browser's bounded retry loop is only a delivery hint; the server must retain
 * a durable read-only path for executions that are still ambiguous.
 */
export function repairPendingBridgeVerificationWakes(state: OpenPresenceState, now = new Date()): number {
  let repaired = 0;
  for (const execution of state.executions ?? []) {
    if (execution.connector !== "bridge" || execution.status !== "verification-pending") continue;
    const attentionRunId = execution.runId ?? (execution.attentionEpisodeId
      ? listOperationalRuns(execution.presenceId).find((run) => run.kind === "attention" && run.attentionEpisodeId === execution.attentionEpisodeId)?.id
      : undefined);
    const attentionRun = attentionRunId ? getOperationalRun(attentionRunId) : undefined;
    if (attentionRun?.kind === "attention" && attentionRun.attentionEpisodeId && attentionRun.state === "waiting" && attentionRun.stage !== "verifying") {
      attentionRun.stage = "verifying";
      attentionRun.lastProgressAt = now.toISOString();
      upsertOperationalRun(attentionRun);
    }
    if (execution.failure?.retryable === false) continue;
    const wakeId = `wake_verification_${execution.id}`;
    const existingWake = listScheduledWakes(execution.presenceId).find((wake) => wake.id === wakeId && wake.state === "pending");
    if (existingWake) continue;
    const verifierRun = listOperationalRuns(execution.presenceId).find((run) => run.kind === "verification" && run.executionId === execution.id && verificationRunStates.has(run.state));
    // An active verifier owns its next wake. A waiting verifier without one is
    // exactly the restart gap this repair is meant to close.
    if (verifierRun && ["queued", "running", "recovering", "reconciling"].includes(verifierRun.state)) continue;
    const wakeAt = verifierRun?.nextWakeAt ?? new Date(now.getTime() + 30_000).toISOString();
    upsertScheduledWake({
      id: wakeId,
      presenceId: execution.presenceId,
      wakeAt,
      kind: "verification",
      targetId: execution.id,
      payload: { executionId: execution.id },
      state: "pending",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    repaired += 1;
  }
  return repaired;
}

// ============================================================================
// Temporal Sweep & Recovery Loop
// ============================================================================

import {
  logRecoveryAttempt,
  recordOperationalFailure,
} from "./incident-engine";
import {
  dispatchAutonomyWorker,
  queueAutonomyRun,
} from "./autonomy-worker";

export interface SweepResult {
  reclaimedLeases: number;
  staleRunsDetected: OperationalRun[];
  dispatchedWakes: ScheduledWake[];
  closedNonRetryableVerifications: number;
  closedOrphanedWaitingRuns: number;
  timestamp: string;
}

export function isLiveTemporalPresence(presence: Pick<Presence, "status" | "environment">) {
  return presence.status === "live" && presence.environment !== "sandbox";
}

export function runOperationalSweep(now = new Date()): SweepResult {
  const nowIso = now.toISOString();
  // A Presence with an unresolved operator gate must not keep generating
  // autonomous attention work. Without this check, every scheduler sweep
  // can create another self-directed run while the same provider/runtime
  // incident is waiting for repair, amplifying memory and provider usage.
  const operatorGatedIncidents = listRecoveryIncidents(undefined, "needs_operator")
    .filter((incident) => incident.operatorActionRequired);
  const presenceRequiresOperator = (presenceId: string) => operatorGatedIncidents.some((incident) => !incident.presenceId || incident.presenceId === presenceId);

  // Repair the migration gap where self-directed attention had a persisted
  // nextEligibleAt but no durable wake. Without this repair, Auto can be
  // enabled forever while the temporal engine has nothing to dispatch.
  // The normal sweep is read-only. Avoid deep-cloning the entire compatibility
  // snapshot every five seconds; only materialize mutable state when there is
  // an expired queued execution that actually requires a write.
  // The scheduler only needs durable operational state. Assignment capability
  // preflights are a browser-facing projection and recomputing them here on
  // every five-second sweep creates avoidable allocation and GC pressure.
  const stateView = readStateViewForContext({}, { skipAssignmentPreflights: true });
  const preDispatchStatuses = new Set<Execution["status"]>(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"]);
  const hasExpiredQueuedExecution = (stateView.executions ?? []).some((execution) => {
    if (!preDispatchStatuses.has(execution.status)) return false;
    const intent = stateView.socialIntents?.find((item) => item.id === execution.socialIntentId);
    const expiresAt = intent?.validity?.expiresAt;
    return Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());
  });
  const hasStaleBridgeExecution = (stateView.executions ?? []).some((execution) => {
    if (!execution.bridgeId || !["awaiting-connector", "queued"].includes(execution.status)) return false;
    const bridge = stateView.bridges.find((item) => item.id === execution.bridgeId);
    if (!bridge || bridgeExecutionStatus(bridge, now.getTime()) === "connected") return false;
    const formedAt = new Date(execution.updatedAt ?? execution.createdAt).getTime();
    return Number.isFinite(formedAt) && now.getTime() - formedAt >= 120_000;
  });
  const hasAutonomousPreWriteFailure = (stateView.assignmentRuns ?? []).some((run) => {
    const execution = (stateView.executions ?? []).find((item) => item.assignmentId === run.assignmentId && item.presenceId === run.presenceId && (item.runId === run.id || (!item.runId && item.createdAt >= (run.startedAt ?? run.createdAt))));
    return Boolean(execution && isAutonomousPreWriteDeliveryFailure(execution));
  });
  const hasOrphanedAttentionEpisode = (stateView.attentionEpisodes ?? []).some((episode) => {
    if (episode.status !== "running") return false;
    const updatedAt = new Date(episode.updatedAt).getTime();
    if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt < 120_000) return false;
    return !(stateView.operationalRuns ?? []).some((run) => run.kind === "attention"
      && ["queued", "running", "waiting", "recovering", "delivery_uncertain", "reconciling"].includes(run.state)
      && (run.attentionEpisodeId === episode.id || episode.runIds.includes(run.id)));
  });
  const state = hasExpiredQueuedExecution || hasStaleBridgeExecution || hasAutonomousPreWriteFailure || hasOrphanedAttentionEpisode ? readState() : stateView;
  // A disconnected Bridge cannot perform claim-time expiry. Close stale
  // pre-dispatch intents here so the queue has a bounded lifetime and never
  // presents an undeliverable action as permanently in flight.
  const expiredQueuedExecutions = hasExpiredQueuedExecution ? expireQueuedDeliveryWindows(state, now) : 0;
  const staleBridgeExecutions = hasStaleBridgeExecution ? closeStaleBridgeExecutions(state, now) : 0;
  const repairedAttentionEpisodes = hasOrphanedAttentionEpisode ? reconcileOrphanedAttentionEpisodes(state, now) : 0;
  const pausedExhaustedPursuits = pauseExhaustedAssignmentPursuits(state, now);
  if (hasAutonomousPreWriteFailure || expiredQueuedExecutions > 0 || staleBridgeExecutions > 0 || repairedAttentionEpisodes > 0 || pausedExhaustedPursuits > 0) {
    reconcileLiveAssignmentRuns(state, now.getTime());
    writeState(state, { advanceWorkspaceRevision: false });
  }
  repairPendingBridgeVerificationWakes(state, now);
  const closedOrphanedWaitingRuns = reconcileOrphanedWaitingRuns(state, now);
  dispatchDueAssignmentWorkers(state, now);
  repairMissingOperatorNudgeWakes(state, now);
  // Sandbox Presences are advanced by Playground's deterministic clock. They
  // must never enter the live temporal loop: a sandbox has no live channel
  // reader, so treating it as due here creates a no-op attention run on every
  // sweep and can starve the local runtime with repeated snapshot writes.
  for (const presence of state.presences.filter(isLiveTemporalPresence)) {
    if (presenceRequiresOperator(presence.id)) continue;
    const nextEligibleAt = presence.selfDirectedAttention?.nextEligibleAt;
    const hasPendingAttentionWake = listScheduledWakes(presence.id).some((wake) => wake.state === "pending" && (wake.kind === "attention" || wake.kind === "self_directed_discovery"));
    const hasAttentionRun = listOperationalRuns(presence.id, ["queued", "running", "recovering", "delivery_uncertain", "reconciling"])
      .some((run) => run.kind === "attention");
    const planCandidates = state.publishingPlans.filter((plan) => plan.presenceId === presence.id && plan.environment === (presence.environment === "sandbox" ? "sandbox" : "live") && plan.status !== "superseded");
    const activePlan = planCandidates.filter((plan) => plan.status === "active").sort((left, right) => right.revision - left.revision)[0];
    const planDue = Boolean(activePlan && ((activePlan.nextReassessmentAt && new Date(activePlan.nextReassessmentAt).getTime() <= now.getTime()) || (activePlan.horizonEnd && new Date(activePlan.horizonEnd).getTime() <= now.getTime())));
    const planMissing = planCandidates.length === 0 && presence.publishingInitiative.mode !== "off";
    if (planDue || planMissing) {
      // Plan maintenance is due independently of the self-directed cadence.
      // Move the shared attention wake to now even when discovery is cooling
      // down, so a visible "Due now" state cannot wait behind that cooldown.
      if (!hasAttentionRun) requestAttention(presence.id, "self_directed", nowIso, "broad");
      continue;
    }
    const explorationDue = state.explorations.some((exploration) => exploration.presenceId === presence.id
      && exploration.status === "active"
      && (!exploration.nextEligibleAt || new Date(exploration.nextEligibleAt).getTime() <= now.getTime()));
    const hasBroadAttentionRun = listOperationalRuns(presence.id, ["queued", "running", "recovering", "delivery_uncertain", "reconciling"])
      .some((run) => run.kind === "attention" && run.attention?.scope === "broad");
    if (explorationDue) {
      // Explorations are a first-class durable source of attention. They must
      // not wait behind the Presence-wide self-directed cooldown, and an
      // observe_inbound run must not suppress this broad work.
      if (!hasBroadAttentionRun) requestAttention(presence.id, "self_directed", nowIso, "broad");
      continue;
    }
    if (nextEligibleAt && new Date(nextEligibleAt).getTime() > now.getTime()) {
      if (!hasPendingAttentionWake && !hasAttentionRun) requestAttention(presence.id, "self_directed", nextEligibleAt, "broad");
      continue;
    }
    if (!hasPendingAttentionWake && !hasAttentionRun) requestAttention(presence.id, "self_directed", nowIso, "broad");
  }

  // 1. Reclaim expired leases
  const reclaimedLeases = reclaimExpiredLeases(nowIso);

  // 2. Dispatch due wakes
  const dueWakes = claimDueScheduledWakes(nowIso);
  const dispatchedWakes: ScheduledWake[] = [];

  for (const wake of dueWakes) {
    dispatchedWakes.push(wake);

    if (wake.kind === "verification" && wake.targetId) {
      const execution = state.executions.find((item) => item.id === wake.targetId && item.status === "verification-pending");
      if (!execution || execution.failure?.retryable === false) continue;
      const existingVerifier = listOperationalRuns(execution.presenceId).find((run) => run.kind === "verification" && run.executionId === execution.id && verificationRunStates.has(run.state));
      if (existingVerifier) {
        if (existingVerifier.state === "waiting") {
          existingVerifier.state = "queued";
          existingVerifier.stage = "woken_from_verification";
          existingVerifier.lastProgressAt = nowIso;
          delete existingVerifier.nextWakeAt;
          upsertOperationalRun(existingVerifier);
        }
        dispatchAutonomyWorker(existingVerifier.id);
      } else {
        const { run } = queueAutonomyRun(execution.presenceId, "verification", {
          runId: `op_run_verification_${execution.id}`,
          executionId: execution.id,
          stage: "verifying",
          sourceRef: wake.id,
          metadata: { source: "verification_wake" },
        });
        dispatchAutonomyWorker(run.id);
      }
      continue;
    }

    // If wake is an autonomous observation or attention wake
    if (wake.kind === "observation" || wake.kind === "attention" || wake.kind === "self_directed_discovery") {
      const presenceId = wake.presenceId ?? "global";
      const presence = state.presences.find((item) => item.id === presenceId);
      // A historical timer may become due after the operator pauses. Claim it
      // without invoking cognition; an explicit Wake creates a fresh signal.
      if (presence?.status === "paused") continue;
      if (presence && presenceRequiresOperator(presence.id)) continue;
      const request = attentionRequestFromWake(wake);
      // Blocked and needs-operator runs are terminal records, not live work.
      // Let a later independent pulse get its own run instead of endlessly
      // recycling the due wake behind historical blocked work.
      // Delivery/verification can outlive the bounded cognition pass. Keep
      // that responsibility durable on its original run, but do not present
      // it as a worker that can consume a new attention signal.
      const existingRun = listOperationalRuns(presenceId).find((run) => run.kind === "attention" && (
        ["queued", "running", "recovering", "delivery_uncertain", "reconciling"].includes(run.state)
      ));
      if (existingRun) {
        const watchJudgmentMustRemainIndependent = request.scope === "judge_watches";
        if (!watchJudgmentMustRemainIndependent && attentionRunAcceptsSignal(existingRun)) {
          existingRun.attention = mergeAttentionRequests(existingRun.attention, request);
          upsertOperationalRun(existingRun);
        } else {
          for (const [index, trigger] of request.triggers.entries()) {
            mergeAttentionWake({ presenceId, trigger, scope: request.scope, requestedAt: request.requestedAt, signalId: request.signalIds[index] ?? request.signalIds[0] ?? wake.id, source: request.source });
          }
        }
      } else {
        const runId = `op_run_attention_${presenceId}_${Date.parse(wake.updatedAt) || Date.now()}`;
        const { run } = queueAutonomyRun(presenceId, "attention", {
          runId,
          attention: request,
          stage: "queued",
          sourceRef: wake.id,
          metadata: { source: request.triggers.includes("operator_check") ? "operator" : "scheduler" },
        });
        dispatchAutonomyWorker(run.id);
      }
    } else if (wake.targetId) {
      // If wake is linked to an operational run, advance or unblock the run
      const run = getOperationalRun(wake.targetId);
      if (run && run.state === "waiting") {
        run.state = "queued";
        run.stage = `woken_from_${wake.kind}`;
        run.lastProgressAt = nowIso;
        delete run.nextWakeAt;
        upsertOperationalRun(run);
        dispatchAutonomyWorker(run.id);
      }
    }
  }

  // A recovery attempt can be left queued after a process restart between the
  // incident transition and its dispatch. Without this sweep, the run is
  // neither active nor attached to a pending wake and the health panel stays
  // in RECOVERING forever. Dispatch only eligible queued work; the durable
  // lease remains the final duplicate-work guard.
  for (const run of listOperationalRuns(undefined, ["queued"])) {
    if (run.kind === "attention" && presenceRequiresOperator(run.presenceId)) continue;
    if (run.eligibleAt && new Date(run.eligibleAt).getTime() > now.getTime()) continue;
    dispatchAutonomyWorker(run.id);
  }

  // A process can stop after persisting `running` but before its lease owner
  // is written/renewed. Such an orphan is not a provider incident and must
  // not age into a user-visible RECOVERY cycle. Requeue only autonomous
  // cognition runs with no lease and an old heartbeat; delivery-uncertain
  // work remains conservative because replaying a write could duplicate it.
  for (const run of listOperationalRuns(undefined, ["running", "reconciling"])) {
    if (!["observation", "discovery", "attention", "operator_chat"].includes(run.kind) || run.leaseOwner) continue;
    const lastHeartbeatMs = new Date(run.lastHeartbeatAt ?? run.lastProgressAt ?? run.startedAt ?? run.createdAt).getTime();
    if (Number.isFinite(lastHeartbeatMs) && now.getTime() - lastHeartbeatMs < 120_000) continue;
    run.state = "queued";
    run.stage = "requeued_after_process_restart";
    run.retryReason = "The previous worker stopped before completing the autonomous run.";
    run.lastProgressAt = nowIso;
    run.lastHeartbeatAt = nowIso;
    run.eligibleAt = nowIso;
    delete run.incidentId;
    delete run.leaseExpiresAt;
    upsertOperationalRun(run);
    dispatchAutonomyWorker(run.id);
  }

  // 3. Scan active runs for staleness
  // Recovery states are controlled by their incident cooldown below. They
  // are not fresh work stages and must never be treated as a second stale
  // run; doing so recursively inflated one incident until operator action.
  const activeRuns = listOperationalRuns(undefined, ["running", "reconciling", "delivery_uncertain"]);
  const staleRunsDetected: OperationalRun[] = [];

  for (const run of activeRuns) {
    const evaluation = evaluateOperationalRunProgress(run, now);
    if (evaluation.isStale) {
      staleRunsDetected.push(run);

      // Trigger recovery for stale operational runs
      const dependency = run.kind === "observation" ? "native_x" : "runtime";
      const { incident } = recordOperationalFailure({
        dependency,
        presenceId: run.presenceId,
        runId: run.id,
        error: evaluation.reason ?? `Run exceeded expected stage duration in stage ${run.stage}`,
      });

      logRecoveryAttempt({
        incidentId: incident.id,
        step: `recover_stale_run_${run.stage}`,
        outcome: "failed",
        error: evaluation.reason,
      });
      const updatedIncident = getRecoveryIncident(incident.id);
      if (updatedIncident?.state === "needs_operator") {
        run.state = "needs_operator";
        run.stage = `stale_recovery_${run.stage}`;
      } else {
        run.state = "recovering";
        run.stage = `stale_recovery_${run.stage}`;
      }
      run.retryReason = evaluation.reason ?? "The autonomous run exceeded its expected stage duration.";
      run.lastProgressAt = nowIso;
      // Fence the worker that stopped making logical progress. The lease is
      // no longer allowed to keep a stale run looking active while recovery
      // schedules the next bounded attempt.
      delete run.leaseOwner;
      delete run.leaseExpiresAt;
      upsertOperationalRun(run);
    }
  }

  // Resume ordinary recoverable work after its bounded cooldown. A recovery
  // record is a pause between attempts, not a terminal state and not a stage
  // that should itself age into another incident.
  for (const run of listOperationalRuns(undefined, ["recovering"])) {
    const incident = run.incidentId ? getRecoveryIncident(run.incidentId) : undefined;
    if (incident?.state === "needs_operator") {
      run.state = "needs_operator";
      upsertOperationalRun(run);
      continue;
    }
    if (incident?.nextAttemptAt && new Date(incident.nextAttemptAt).getTime() > now.getTime()) continue;
    run.state = "queued";
    run.stage = `recovery_retry_${run.kind}`;
    run.retryReason = incident?.safeSummary ?? "Retrying after bounded runtime recovery.";
    run.lastProgressAt = nowIso;
    delete run.incidentId;
    delete run.leaseOwner;
    delete run.leaseExpiresAt;
    upsertOperationalRun(run);
    dispatchAutonomyWorker(run.id);
  }

  return {
    reclaimedLeases,
    staleRunsDetected,
    dispatchedWakes,
    closedOrphanedWaitingRuns,
    timestamp: nowIso,
  };
}

// Next.js development can load this module into more than one server bundle.
// A module-local timer then creates one temporal sweep per bundle, all reading
// and mutating the same SQLite workspace. Keep the ownership marker on the
// process global so the scheduler remains single-flight across hot reloads.
type TemporalEngineRuntime = {
  timer?: ReturnType<typeof setInterval>;
  sweepTimer?: ReturnType<typeof setTimeout>;
};

const temporalRuntimeOwner = globalThis as typeof globalThis & {
  __openPresenceTemporalRuntime?: TemporalEngineRuntime;
};

/**
 * Coalesce request-driven sweep hints. A state mutation can be followed by
 * several equivalent hints (operator receipt, worker completion, and the
 * five-second scheduler). Running the synchronous sweep once per hint makes
 * every caller compete with the UI for the event loop and repeatedly parses
 * the large compatibility snapshot. Durable wakes remain the source of
 * truth; this is only a process-local execution hint.
 */
export function scheduleOperationalSweep(delayMs = 0): boolean {
  const runtime = temporalRuntimeOwner.__openPresenceTemporalRuntime ?? {};
  if (runtime.sweepTimer) return false;
  const timer = setTimeout(() => {
    const current = temporalRuntimeOwner.__openPresenceTemporalRuntime;
    if (current) current.sweepTimer = undefined;
    try {
      runOperationalSweep();
    } catch {
      // The next durable scheduler tick remains responsible for retrying the
      // sweep after a transient runtime or database failure.
    }
  }, Math.max(0, delayMs));
  if (typeof timer.unref === "function") timer.unref();
  runtime.sweepTimer = timer;
  temporalRuntimeOwner.__openPresenceTemporalRuntime = runtime;
  return true;
}

/** Start the process-local loop; all durable scheduling remains in SQLite. */
export function startTemporalEngine(intervalMs = 5_000): () => void {
  if (temporalRuntimeOwner.__openPresenceTemporalRuntime?.timer) return () => stopTemporalEngine();
  runOperationalSweep();
  recordProcessHeartbeat("scheduler", "scheduler");
  recordProcessHeartbeat("runtime", "runtime");
  const timer = setInterval(() => {
    const sweepStartedAt = Date.now();
    try {
      const sweep = runOperationalSweep();
      const memory = process.memoryUsage();
      const telemetry = {
        staleRuns: sweep.staleRunsDetected.length,
        dispatchedWakes: sweep.dispatchedWakes.length,
        sweepDurationMs: Date.now() - sweepStartedAt,
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        rssMb: Math.round(memory.rss / 1024 / 1024),
      };
      recordProcessHeartbeat("scheduler", "scheduler", telemetry);
      recordProcessHeartbeat("runtime", "runtime", telemetry);
    } catch { /* The supervisor owns process-level failure. */ }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  temporalRuntimeOwner.__openPresenceTemporalRuntime = { timer };
  return () => stopTemporalEngine();
}

export function stopTemporalEngine(): void {
  const runtime = temporalRuntimeOwner.__openPresenceTemporalRuntime;
  if (!runtime) return;
  if (runtime.timer) clearInterval(runtime.timer);
  if (runtime.sweepTimer) clearTimeout(runtime.sweepTimer);
  temporalRuntimeOwner.__openPresenceTemporalRuntime = undefined;
}

export { claimOperationalRunLease, releaseOperationalRunLease };
