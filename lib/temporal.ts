import {
  claimOperationalRunLease,
  claimDueScheduledWakes,
  getOperationalRun,
  listOperationalRuns,
  reclaimExpiredLeases,
  recordProcessHeartbeat,
  releaseOperationalRunLease,
  upsertOperationalRun,
  upsertScheduledWake,
} from "./db";
import type {
  JsonValue,
  OperationalRun,
  ScheduledWake,
  ScheduledWakeKind,
} from "./types";

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
  "native.post": 30,
  "native.verify": 45,
  "native.hydrate": 60,

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

// ============================================================================
// Temporal Sweep & Recovery Loop
// ============================================================================

export interface SweepResult {
  reclaimedLeases: number;
  staleRunsDetected: OperationalRun[];
  dispatchedWakes: ScheduledWake[];
  timestamp: string;
}

export function runOperationalSweep(now = new Date()): SweepResult {
  const nowIso = now.toISOString();

  // 1. Reclaim expired leases
  const reclaimedLeases = reclaimExpiredLeases(nowIso);

  // 2. Dispatch due wakes
  const dueWakes = claimDueScheduledWakes(nowIso);
  const dispatchedWakes: ScheduledWake[] = [];

  for (const wake of dueWakes) {
    dispatchedWakes.push(wake);

    // If wake is linked to an operational run, advance or unblock the run
    if (wake.targetId) {
      const run = getOperationalRun(wake.targetId);
      if (run && run.state === "waiting") {
        run.state = "queued";
        run.stage = `woken_from_${wake.kind}`;
        run.lastProgressAt = nowIso;
        delete run.nextWakeAt;
        upsertOperationalRun(run);
      }
    }
  }

  // 3. Scan active runs for staleness
  const activeRuns = listOperationalRuns(undefined, ["running", "recovering", "reconciling", "delivery_uncertain"]);
  const staleRunsDetected: OperationalRun[] = [];

  for (const run of activeRuns) {
    const evaluation = evaluateOperationalRunProgress(run, now);
    if (evaluation.isStale) {
      staleRunsDetected.push(run);
    }
  }

  return {
    reclaimedLeases,
    staleRunsDetected,
    dispatchedWakes,
    timestamp: nowIso,
  };
}

let temporalTimer: ReturnType<typeof setInterval> | undefined;

/** Start the process-local loop; all durable scheduling remains in SQLite. */
export function startTemporalEngine(intervalMs = 5_000): () => void {
  if (temporalTimer) return () => stopTemporalEngine();
  runOperationalSweep();
  recordProcessHeartbeat("scheduler", "scheduler");
  temporalTimer = setInterval(() => {
    try {
      const sweep = runOperationalSweep();
      recordProcessHeartbeat("scheduler", "scheduler", { staleRuns: sweep.staleRunsDetected.length, dispatchedWakes: sweep.dispatchedWakes.length });
    } catch { /* The supervisor owns process-level failure. */ }
  }, intervalMs);
  if (typeof temporalTimer.unref === "function") temporalTimer.unref();
  return () => stopTemporalEngine();
}

export function stopTemporalEngine(): void {
  if (!temporalTimer) return;
  clearInterval(temporalTimer);
  temporalTimer = undefined;
}

export { claimOperationalRunLease, releaseOperationalRunLease };
