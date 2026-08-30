import { randomUUID } from "node:crypto";
import { listOperationalRuns, mergeAttentionWake, upsertOperationalRun } from "./db";
import type { AttentionRunRequest, AttentionScope, AttentionTrigger, OperationalRun, ScheduledWake } from "./types";

const activeAttentionStates = new Set<OperationalRun["state"]>([
  "queued",
  "running",
  "recovering",
  "delivery_uncertain",
  "reconciling",
]);

const scopeRank: Record<AttentionScope, number> = {
  observe_inbound: 0,
  judge_watches: 1,
  recovery: 2,
  assignment: 3,
  broad: 4,
};

const defaultScope: Record<AttentionTrigger, AttentionScope> = {
  scheduled_observation: "observe_inbound",
  self_directed: "broad",
  operator_check: "broad",
  operator_nudge: "broad",
  inbound_event: "observe_inbound",
  watch_judgment: "judge_watches",
  assignment_due: "assignment",
  recovery: "recovery",
};

export interface AttentionRequestReceipt {
  signalId: string;
  runId?: string;
  wake?: ScheduledWake;
  coalesced: boolean;
}

export function mergeAttentionRequests(left: AttentionRunRequest | undefined, right: AttentionRunRequest): AttentionRunRequest {
  if (!left) return right;
  const source = left.source === "bridge" || right.source === "bridge" ? "bridge" : undefined;
  return {
    triggers: [...new Set([...left.triggers, ...right.triggers])],
    scope: scopeRank[right.scope] > scopeRank[left.scope] ? right.scope : left.scope,
    requestedAt: left.requestedAt < right.requestedAt ? left.requestedAt : right.requestedAt,
    signalIds: [...new Set([...left.signalIds, ...right.signalIds])].slice(-100),
    ...(source ? { source } : {}),
  };
}

export function attentionRunAcceptsSignal(run: OperationalRun) {
  if (run.kind !== "attention" || !activeAttentionStates.has(run.state)) return false;
  if (run.state === "queued") return true;
  return ["queued", "observing", "native.observe", "runtime.pulse", "choosing"].includes(run.stage);
}

export function requestAttention(
  presenceId: string,
  trigger: AttentionTrigger,
  requestedAt = new Date().toISOString(),
  scope: AttentionScope = defaultScope[trigger],
  source?: AttentionRunRequest["source"],
): AttentionRequestReceipt {
  const signalId = `attention_signal_${randomUUID()}`;
  const request: AttentionRunRequest = { triggers: [trigger], scope, requestedAt, signalIds: [signalId], ...(source ? { source } : {}) };
  const active = listOperationalRuns(presenceId).find((run) => run.kind === "attention" && activeAttentionStates.has(run.state));
  const dueNow = !Number.isFinite(Date.parse(requestedAt)) || Date.parse(requestedAt) <= Date.now() + 1_000;
  const requiresFollowUp = trigger === "operator_check" || trigger === "operator_nudge" || trigger === "watch_judgment";
  if (active && dueNow && attentionRunAcceptsSignal(active) && !requiresFollowUp) {
    active.attention = mergeAttentionRequests(active.attention, request);
    active.lastProgressAt = active.lastProgressAt ?? requestedAt;
    upsertOperationalRun(active);
    return { signalId, runId: active.id, coalesced: true };
  }
  const wake = mergeAttentionWake({ presenceId, trigger, scope, requestedAt, signalId, source });
  return { signalId, wake, coalesced: Boolean(active) };
}

export function attentionRequestFromWake(wake: ScheduledWake): AttentionRunRequest {
  const payload = wake.payload as { triggers?: AttentionTrigger[]; scope?: AttentionScope; signalIds?: string[]; source?: AttentionRunRequest["source"] } | undefined;
  const legacyTrigger: AttentionTrigger = wake.kind === "observation" ? "scheduled_observation" : "self_directed";
  return {
    triggers: payload?.triggers?.length ? payload.triggers : [legacyTrigger],
    scope: payload?.scope ?? defaultScope[legacyTrigger],
    requestedAt: wake.wakeAt,
    signalIds: payload?.signalIds?.length ? payload.signalIds : [wake.id],
    ...(payload?.source ? { source: payload.source } : {}),
  };
}
