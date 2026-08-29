import { describe, expect, it, vi } from "vitest";
import { requestAttention } from "../lib/attention-coordinator";
import { settleAttentionResponsibility } from "../lib/attention-responsibility";
import { claimDueScheduledWakes, listOperationalRuns, listScheduledWakes, upsertOperationalRun } from "../lib/db";
import { initialState } from "../lib/runtime";
import { runOperationalSweep, scheduleOperationalSweep, stopTemporalEngine } from "../lib/temporal";
import type { AttentionEpisode, Execution, OperationalRun } from "../lib/types";

const now = () => new Date().toISOString();

function attentionRun(presenceId: string, patch: Partial<OperationalRun> = {}): OperationalRun {
  const at = now();
  return { id: `run_${presenceId}`, runId: `run_${presenceId}`, presenceId, kind: "attention", state: "queued", stage: "queued", createdAt: at, eligibleAt: at, lastProgressAt: at, attemptCount: 0, recoveryCount: 0, ...patch };
}

describe("durable Attention coordinator", () => {
  it("coalesces request-driven sweep hints into one scheduled pass", () => {
    vi.useFakeTimers();
    try {
      expect(scheduleOperationalSweep()).toBe(true);
      expect(scheduleOperationalSweep()).toBe(false);
    } finally {
      stopTemporalEngine();
      vi.useRealTimers();
    }
  });

  it("merges simultaneous scheduler, inbound, assignment, and operator signals into one wake", () => {
    const presenceId = `presence_signal_${Date.now()}_${Math.random()}`;
    requestAttention(presenceId, "scheduled_observation");
    requestAttention(presenceId, "inbound_event");
    requestAttention(presenceId, "assignment_due");
    requestAttention(presenceId, "operator_check");

    const pending = listScheduledWakes(presenceId).filter((wake) => wake.state === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload).toMatchObject({
      triggers: expect.arrayContaining(["scheduled_observation", "inbound_event", "assignment_due", "operator_check"]),
      scope: "broad",
    });
  });

  it("queues operator Look now behind active work and retains only one follow-up", () => {
    const presenceId = `presence_active_${Date.now()}_${Math.random()}`;
    const run = attentionRun(presenceId, { state: "running", stage: "observing", attention: { triggers: ["scheduled_observation"], scope: "observe_inbound", requestedAt: now(), signalIds: ["seed"] } });
    upsertOperationalRun(run);

    const early = requestAttention(presenceId, "operator_check");
    expect(early).toMatchObject({ coalesced: true });
    expect(early.runId).toBeUndefined();
    expect(listScheduledWakes(presenceId).filter((wake) => wake.state === "pending")).toHaveLength(1);

    upsertOperationalRun({ ...run, stage: "delivering" });
    requestAttention(presenceId, "inbound_event");
    requestAttention(presenceId, "assignment_due");
    expect(listScheduledWakes(presenceId).filter((wake) => wake.state === "pending")).toHaveLength(1);
  });

  it("does not leak dispatched triggers into the next recurring wake", () => {
    const presenceId = `presence_generation_${Date.now()}_${Math.random()}`;
    requestAttention(presenceId, "operator_check", "2020-01-01T00:00:00.000Z", "broad");
    expect(claimDueScheduledWakes(now()).some((wake) => wake.presenceId === presenceId)).toBe(true);
    requestAttention(presenceId, "self_directed", "2030-01-01T00:00:00.000Z", "broad");
    const followUp = listScheduledWakes(presenceId).find((wake) => wake.state === "pending");
    expect(followUp?.payload).toMatchObject({ triggers: ["self_directed"] });
  });

  it("does not treat a historical blocked run as active work", () => {
    const presenceId = `presence_blocked_${Date.now()}_${Math.random()}`;
    upsertOperationalRun(attentionRun(presenceId, { state: "blocked", stage: "blocked_capability" }));
    const receipt = requestAttention(presenceId, "scheduled_observation", "2030-01-01T00:00:00.000Z");
    expect(receipt.coalesced).toBe(false);
    expect(receipt.wake?.state).toBe("pending");
  });

  it("does not block new cognition behind delivery verification", () => {
    const presenceId = `presence_waiting_delivery_${Date.now()}_${Math.random()}`;
    upsertOperationalRun(attentionRun(presenceId, { state: "waiting", stage: "delivering" }));
    const receipt = requestAttention(presenceId, "operator_nudge");
    expect(receipt.coalesced).toBe(false);
    expect(receipt.wake?.state).toBe("pending");
  });

  it("dispatches a due attention wake while an older delivery remains verification-pending", () => {
    const presenceId = `presence_waiting_verification_${Date.now()}_${Math.random()}`;
    upsertOperationalRun(attentionRun(presenceId, { state: "waiting", stage: "verifying" }));
    requestAttention(presenceId, "inbound_event", "2020-01-01T00:00:00.000Z", "observe_inbound");

    runOperationalSweep(new Date());

    const runs = listOperationalRuns(presenceId).filter((run) => run.kind === "attention");
    expect(runs.some((run) => run.state === "waiting" && run.stage === "verifying")).toBe(true);
    expect(runs.some((run) => run.id !== `run_${presenceId}` && run.state === "queued" && run.attention?.triggers.includes("inbound_event"))).toBe(true);
  });
});

describe("Attention responsibility closure", () => {
  function fixture(status?: Execution["status"], withOutcome = false) {
    const at = now();
    const run = attentionRun("presence_responsibility", { state: "running", stage: "delivering", attentionEpisodeId: "episode_1" });
    const episode: AttentionEpisode = { id: "episode_1", agentId: "agent", presenceId: run.presenceId, channel: "x", environment: "live", source: "scheduled", status: "running", stage: "acting", startedAt: at, updatedAt: at, runIds: [run.id], mirrorObjectIds: [], newMirrorObjectIds: [], changedMirrorObjectIds: [], socialDecisionIds: [], socialIntentIds: status ? ["intent_1"] : [], executionIds: status ? ["execution_1"] : [], outcomeIds: [], fetchedCount: 1, newCount: 1, changedCount: 0, knownCount: 0, consideredCount: 1, closeAttentionCount: 1, noOpCount: status ? 0 : 1, actionCounts: status ? { reply: 1 } : {}, verifiedOutcomeCount: 0, pendingExecutionCount: 0, failedExecutionCount: 0, resourceUsage: { channelReads: 1, channelWrites: 0, modelCalls: 1, visionCalls: 0, hydrations: 0, mediaFetches: 0 } };
    const execution: Execution | undefined = status ? { id: "execution_1", socialIntentId: "intent_1", presenceId: run.presenceId, affordance: "x.reply", mode: "auto", status, attempts: 0, connector: "bridge", idempotencyKey: "key", createdAt: at, updatedAt: at, runId: run.id, attentionEpisodeId: episode.id } : undefined;
    const state = { ...initialState(), attentionEpisodes: [episode], executions: execution ? [execution] : [], outcomes: withOutcome ? [{ id: "outcome_1", socialIntentId: "intent_1", executionId: "execution_1", presenceId: run.presenceId, status: "succeeded" as const, observedAt: at, metrics: {}, attentionEpisodeId: episode.id }] : [] };
    return { state, run };
  }

  it("does not turn pending delivery into success", () => {
    const { state, run } = fixture("queued");
    const settled = settleAttentionResponsibility(state, run, "episode_1");
    expect(settled.run).toMatchObject({ state: "waiting", stage: "delivering", result: { disposition: "waiting_delivery" } });
    expect(settled.state.attentionEpisodes?.[0]).toMatchObject({ status: "waiting", stage: "confirming" });
  });

  it("reports expiry as unfulfilled responsibility, never silence", () => {
    const { state, run } = fixture("expired");
    const settled = settleAttentionResponsibility(state, run, "episode_1");
    expect(settled.run).toMatchObject({ state: "failed", result: { disposition: "expired_unfulfilled", failedExecutionCount: 1 } });
  });

  it("distinguishes observation without judgment from a verified outcome", () => {
    const observed = fixture();
    expect(settleAttentionResponsibility(observed.state, observed.run, "episode_1").run.result?.disposition).toBe("observed_no_change");
    const verified = fixture("succeeded", true);
    expect(settleAttentionResponsibility(verified.state, verified.run, "episode_1").run.result?.disposition).toBe("verified");
  });
});
