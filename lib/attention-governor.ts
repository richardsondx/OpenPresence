import type {
  AttentionAllocation,
  OpenPresenceState,
  Presence,
  ResourceUsageCategory,
  ResourceUsageEvent,
} from "./types";

export type AttentionWorkClass =
  | "inbound"
  | "assignment"
  | "reconciliation"
  | "self_directed_discovery"
  | "candidate_evaluation"
  | "social_action";

export interface AttentionUsageTotals {
  channelReads: number;
  modelCalls: number;
  visionCalls: number;
  hydrations: number;
}

export interface AttentionGovernorSnapshot {
  selfDirected: AttentionUsageTotals;
  background: AttentionUsageTotals;
  limits: AttentionUsageTotals;
  left: AttentionUsageTotals;
  allocation: Required<AttentionAllocation>;
  observationCaps: AttentionUsageTotals;
  actionReservePercent: number;
  resetAt?: string;
}

export interface AttentionPermission {
  allowed: boolean;
  reason: "allowed" | "protected_work" | "disabled" | "deferred_budget" | "deferred_observation" | "deferred_pacing";
  detail: string;
  snapshot: AttentionGovernorSnapshot;
}

const DEFAULT_ALLOCATION: Required<AttentionAllocation> = {
  observationPercent: 20,
  evaluationPercent: 50,
  actionReservePercent: 30,
};

const categoryKey = (category: ResourceUsageCategory): keyof AttentionUsageTotals | undefined => {
  if (category === "channel_read") return "channelReads";
  if (category === "model") return "modelCalls";
  if (category === "vision") return "visionCalls";
  if (category === "hydration") return "hydrations";
  return undefined;
};

function dayStart(now: Date) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

function totalsFor(events: ResourceUsageEvent[]): AttentionUsageTotals {
  const totals: AttentionUsageTotals = { channelReads: 0, modelCalls: 0, visionCalls: 0, hydrations: 0 };
  for (const event of events) {
    const key = categoryKey(event.category);
    if (key) totals[key] += event.usage.requests ?? 1;
  }
  return totals;
}

function allocationFor(presence: Presence | null | undefined): Required<AttentionAllocation> {
  const raw = presence?.selfDirectedAttention?.allocation ?? {};
  const observationPercent = Math.max(0, Math.min(100, raw.observationPercent ?? DEFAULT_ALLOCATION.observationPercent));
  const evaluationPercent = Math.max(0, Math.min(100, raw.evaluationPercent ?? DEFAULT_ALLOCATION.evaluationPercent));
  const actionReservePercent = Math.max(0, Math.min(100, raw.actionReservePercent ?? DEFAULT_ALLOCATION.actionReservePercent));
  return { observationPercent, evaluationPercent, actionReservePercent };
}

function limitFor(presence: Presence | null | undefined, key: keyof AttentionUsageTotals): number {
  const budget = presence?.selfDirectedAttention?.budget;
  if (key === "channelReads") return budget?.maxChannelReadsPerDay ?? 0;
  if (key === "modelCalls") return budget?.maxModelCallsPerDay ?? 0;
  if (key === "visionCalls") return budget?.maxVisionCallsPerDay ?? 0;
  return budget?.maxHydrationsPerDay ?? 0;
}

function cappedShare(limit: number, percent: number) {
  return limit === 0 ? 0 : Math.max(1, Math.floor(limit * percent / 100));
}

function eventCountsFor(state: OpenPresenceState, presenceId: string, now: Date) {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence ?? undefined;
  const resetAt = presence?.selfDirectedAttention?.usageResetAt;
  const start = Math.max(dayStart(now), resetAt ? new Date(resetAt).getTime() : Number.NEGATIVE_INFINITY);
  // A reset establishes a new epoch. An event recorded at the exact reset
  // boundary belongs to the preserved prior epoch, not the freshly reset one.
  const events = state.resourceUsageEvents.filter((event) => event.presenceId === presenceId && new Date(event.createdAt).getTime() > start);
  return {
    // Exploration is self-initiated attention too. Keeping it in the
    // background bucket let a Presence spend its entire daily model envelope
    // on exploration while the governor still reported capacity remaining.
    selfDirected: totalsFor(events.filter((event) => event.attentionSource === "self_directed_discovery" || event.attentionSource === "exploration")),
    background: totalsFor(events.filter((event) => event.attentionSource !== "self_directed_discovery" && event.attentionSource !== "exploration")),
  };
}

export function attentionGovernorSnapshot(state: OpenPresenceState, presenceId: string, now = new Date()): AttentionGovernorSnapshot {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence ?? undefined;
  const allocation = allocationFor(presence);
  const { selfDirected, background } = eventCountsFor(state, presenceId, now);
  const limits: AttentionUsageTotals = {
    channelReads: limitFor(presence, "channelReads"),
    modelCalls: limitFor(presence, "modelCalls"),
    visionCalls: limitFor(presence, "visionCalls"),
    hydrations: limitFor(presence, "hydrations"),
  };
  const left = {
    channelReads: Math.max(0, limits.channelReads - selfDirected.channelReads),
    modelCalls: Math.max(0, limits.modelCalls - selfDirected.modelCalls),
    visionCalls: Math.max(0, limits.visionCalls - selfDirected.visionCalls),
    hydrations: Math.max(0, limits.hydrations - selfDirected.hydrations),
  };
  const observationCaps = {
    channelReads: cappedShare(limits.channelReads, allocation.observationPercent),
    modelCalls: cappedShare(limits.modelCalls, allocation.observationPercent),
    visionCalls: cappedShare(limits.visionCalls, allocation.observationPercent),
    hydrations: cappedShare(limits.hydrations, allocation.observationPercent + allocation.evaluationPercent),
  };
  return {
    selfDirected,
    background,
    limits,
    left,
    allocation,
    observationCaps,
    actionReservePercent: allocation.actionReservePercent,
    resetAt: presence?.selfDirectedAttention?.usageResetAt,
  };
}

export function requestAttentionCapacity(
  state: OpenPresenceState,
  presenceId: string,
  workClass: AttentionWorkClass,
  category: ResourceUsageCategory,
  units = 1,
  now = new Date(),
): AttentionPermission {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const snapshot = attentionGovernorSnapshot(state, presenceId, now);
  if (["inbound", "assignment", "reconciliation"].includes(workClass)) {
    return { allowed: true, reason: "protected_work", detail: "Protected inbound or assigned work does not consume self-directed attention capacity.", snapshot };
  }
  if (presence?.selfDirectedAttention?.enabled === false || presence?.status !== "live") {
    return { allowed: false, reason: "disabled", detail: "Self-directed attention is not active for this Presence.", snapshot };
  }
  const key = categoryKey(category);
  if (!key) return { allowed: true, reason: "allowed", detail: "This operation is not counted against the self-directed resource envelope.", snapshot };
  const used = snapshot.selfDirected[key];
  const limit = snapshot.limits[key];
  if (limit <= 0 || used + units > limit) {
    return { allowed: false, reason: "deferred_budget", detail: "The self-directed attention envelope is reached; protected work remains active.", snapshot };
  }
  if (workClass === "self_directed_discovery" && used + units > snapshot.observationCaps[key]) {
    return { allowed: false, reason: "deferred_observation", detail: "Observation is pausing to preserve capacity for candidate evaluation and qualified social action.", snapshot };
  }
  if (workClass === "candidate_evaluation" && used + units > cappedShare(limit, snapshot.allocation.evaluationPercent)) {
    return { allowed: false, reason: "deferred_observation", detail: "Candidate evaluation is pausing before it consumes the capacity reserved for qualified social action.", snapshot };
  }
  return { allowed: true, reason: "allowed", detail: "The operation fits the current self-directed attention allocation.", snapshot };
}

export function attentionBudgetStatus(snapshot: AttentionGovernorSnapshot) {
  const readsExhausted = snapshot.left.channelReads <= 0;
  const modelsExhausted = snapshot.left.modelCalls <= 0;
  return readsExhausted || modelsExhausted ? "deferred" : "active";
}
