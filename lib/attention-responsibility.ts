import { getOperationalRun, upsertOperationalRun } from "./db";
import { recordAttentionStep, summarizeAttentionEpisode } from "./attention-episodes";
import type { Execution, OpenPresenceState, OperationalRun } from "./types";

const pendingStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
const failedStatuses = new Set(["failed", "blocked", "cancelled", "expired", "verification-closed"]);

export function settleAttentionResponsibility(source: OpenPresenceState, run: OperationalRun, attentionEpisodeId: string) {
  let state = summarizeAttentionEpisode(source, attentionEpisodeId);
  const episode = state.attentionEpisodes?.find((item) => item.id === attentionEpisodeId);
  const executions = state.executions.filter((item) => item.attentionEpisodeId === attentionEpisodeId || item.runId === run.id);
  const executionIds = new Set(executions.map((item) => item.id));
  const outcomes = state.outcomes.filter((item) => item.attentionEpisodeId === attentionEpisodeId || (item.executionId ? executionIds.has(item.executionId) : false));
  const selectedActionCount = Math.max(executions.length, Object.values(episode?.actionCounts ?? {}).reduce((sum, value) => sum + (value ?? 0), 0));
  const pendingExecutionCount = executions.filter((item) => pendingStatuses.has(item.status)).length;
  const failedExecutions = executions.filter((item) => failedStatuses.has(item.status));
  const failedExecutionCount = failedExecutions.length;
  const verifiedOutcomeCount = outcomes.filter((item) => item.status === "succeeded").length;
  const decisions = state.socialDecisions.filter((item) => item.attentionEpisodeId === attentionEpisodeId || item.runId === run.id || item.invocationId === run.invocationId);
  const noOpDecisions = decisions.filter((item) => item.decision === "no_op");
  const nowIso = new Date().toISOString();

  run.lastProgressAt = nowIso;
  delete run.leaseOwner;
  delete run.leaseExpiresAt;

  if (pendingExecutionCount > 0 || (selectedActionCount > 0 && verifiedOutcomeCount < selectedActionCount && failedExecutionCount === 0)) {
    run.state = "waiting";
    const hasVerificationPending = executions.some((item) => item.status === "verification-pending");
    run.stage = hasVerificationPending ? "verifying" : pendingExecutionCount > 0 ? "delivering" : "verifying";
    run.result = { disposition: "waiting_delivery", summary: pendingExecutionCount > 0 ? `${selectedActionCount} action${selectedActionCount === 1 ? "" : "s"} selected; ${pendingExecutionCount} still await authorized delivery or X verification.` : `${selectedActionCount} action${selectedActionCount === 1 ? "" : "s"} delivered; channel verification is still pending.`, selectedActionCount, pendingExecutionCount, failedExecutionCount, verifiedOutcomeCount };
    state = summarizeAttentionEpisode(state, attentionEpisodeId, { status: "waiting", stage: "confirming" });
    return { state, run };
  }

  if (failedExecutionCount > 0) {
    const expired = failedExecutions.every((item) => item.status === "expired" || item.status === "verification-closed");
    const blocked = failedExecutions.some((item) => item.status === "blocked");
    run.state = blocked ? "blocked" : "failed";
    run.stage = expired ? "expired_unfulfilled" : blocked ? "blocked_capability" : "delivery_failed";
    run.result = { disposition: expired ? "expired_unfulfilled" : blocked ? "blocked_capability" : "failed", reasonCode: failedExecutions[0]?.failure?.code, summary: expired ? `${failedExecutionCount} selected action${failedExecutionCount === 1 ? "" : "s"} expired without verified delivery.` : `${failedExecutionCount} selected action${failedExecutionCount === 1 ? "" : "s"} failed or was blocked; none was reclassified as silence.`, selectedActionCount, pendingExecutionCount, failedExecutionCount, verifiedOutcomeCount, completedAt: nowIso };
    state = summarizeAttentionEpisode(state, attentionEpisodeId, { status: blocked ? "needs_operator" : "failed", stage: "completed", lastError: run.result.summary });
    return { state, run };
  }

  run.state = "succeeded";
  run.stage = "completed";
  const noActionSummary = noOpDecisions.length
    ? noOpDecisions[0]?.summary?.trim() || `The Agent judged ${noOpDecisions.length} candidate${noOpDecisions.length === 1 ? "" : "s"} and chose not to act.`
    : episode?.newCount
      ? `${episode.newCount} new item${episode.newCount === 1 ? " was" : "s were"} observed, but none reached a completed social judgment in this pass.`
      : `The social world was refreshed${episode?.fetchedCount ? ` across ${episode.fetchedCount} observed records` : ""}; nothing new required judgment.`;
  run.result = {
    disposition: selectedActionCount > 0 ? "verified" : noOpDecisions.length ? "judged_no_action" : "observed_no_change",
    summary: selectedActionCount > 0 ? `${verifiedOutcomeCount} selected action${verifiedOutcomeCount === 1 ? "" : "s"} verified.` : noActionSummary,
    selectedActionCount,
    pendingExecutionCount,
    failedExecutionCount,
    verifiedOutcomeCount,
    completedAt: nowIso,
  };
  state = recordAttentionStep(state, attentionEpisodeId, "completed", { label: selectedActionCount > 0 ? "Action verified" : noOpDecisions.length ? "Judgment completed" : "World is up to date", detail: run.result.summary, status: "completed" });
  state = summarizeAttentionEpisode(state, attentionEpisodeId, { status: "succeeded", stage: "completed", summary: run.result.summary });
  return { state, run };
}

export function settleAttentionForExecution(source: OpenPresenceState, execution: Execution) {
  const runId = execution.runId ?? source.operationalRuns?.find((item) => item.attentionEpisodeId === execution.attentionEpisodeId)?.id;
  const run = runId ? getOperationalRun(runId) : undefined;
  if (!run || run.kind !== "attention" || !execution.attentionEpisodeId) return source;
  const settled = settleAttentionResponsibility(source, run, execution.attentionEpisodeId);
  upsertOperationalRun(settled.run);
  return settled.state;
}
