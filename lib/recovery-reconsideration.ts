import { listOperationalRuns, upsertOperationalRun } from "./db";

export interface ReconsiderationResult {
  totalAffected: number;
  stillRelevant: number;
  expired: number;
  superseded: number;
  reconsideredRunIds: string[];
}

/**
 * Reconsider held/affected actions when an embodied capability recovers.
 * 
 * Invariant: Recover the capability, then reconsider affected responsibilities.
 * We do not blindly flush all stale work into the world.
 */
export function reconsiderAffectedRuns(input: {
  presenceId?: string;
  incidentId?: string;
  now?: Date;
}): ReconsiderationResult {
  const { presenceId, incidentId } = input;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  // Find all runs that were waiting or recovering under this incident / presence
  const runs = listOperationalRuns(presenceId, ["waiting", "recovering", "blocked"]);
  const targetRuns = incidentId ? runs.filter((r) => r.incidentId === incidentId) : runs;

  let stillRelevant = 0;
  let expired = 0;
  let supersededCount = 0;
  const reconsideredRunIds: string[] = [];

  for (const run of targetRuns) {
    reconsideredRunIds.push(run.id);

    // 1. Check expiration
    if (run.expiresAt && new Date(run.expiresAt).getTime() < nowMs) {
      run.state = "cancelled";
      run.stage = "expired_during_recovery";
      expired += 1;
      upsertOperationalRun(run);
      continue;
    }

    // 2. A missed deadline or an explicit supersession makes the work no
    // longer relevant. Age alone is not a reason to discard responsibility.
    const deadlineMs = run.deadlineAt ? new Date(run.deadlineAt).getTime() : undefined;
    const isSuperseded = run.metadata?.superseded === true;
    if (isSuperseded || (deadlineMs !== undefined && deadlineMs < nowMs)) {
      run.state = "cancelled";
      run.stage = "superseded_by_time";
      supersededCount += 1;
      upsertOperationalRun(run);
      continue;
    }

    // 3. Still relevant: return to queued for execution
    run.state = "queued";
    run.stage = "reconsidered_after_recovery";
    run.retryReason = "The run remained relevant after recovery reconsideration.";
    run.lastProgressAt = now.toISOString();
    delete run.incidentId;
    delete run.blockedReason;
    stillRelevant += 1;
    upsertOperationalRun(run);
  }

  return {
    totalAffected: targetRuns.length,
    stillRelevant,
    expired,
    superseded: supersededCount,
    reconsideredRunIds,
  };
}
