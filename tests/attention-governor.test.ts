import { describe, expect, it } from "vitest";
import { attentionGovernorSnapshot, requestAttentionCapacity } from "../lib/attention-governor";
import { applyOperation, createAgent, recordResourceUsageEvent } from "../lib/runtime";

const input = { name: "Governor Test", description: "A bounded test Presence", audience: "builders", mode: "agent" as const, handle: "@governor_test", accent: "#777777" };

describe("Attention Governor", () => {
  it("separates background monitoring from self-directed usage and preserves an observation runway", () => {
    let state = createAgent(input);
    const presence = {
      ...state.presence!,
      selfDirectedAttention: {
        ...state.presence!.selfDirectedAttention!,
        budget: { maxChannelReadsPerDay: 10, maxModelCallsPerDay: 4, maxVisionCallsPerDay: 2, maxHydrationsPerDay: 4 },
        allocation: { observationPercent: 20, evaluationPercent: 50, actionReservePercent: 30 },
      },
    };
    state.presence = presence;
    state.presences = [presence];
    state = recordResourceUsageEvent(state, { presenceId: presence.id, invocationId: "inbound", originKind: "inbound_social", attentionSource: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 20 } });
    state = recordResourceUsageEvent(state, { presenceId: presence.id, invocationId: "self", originKind: "self_directed_discovery", attentionSource: "self_directed_discovery", category: "channel_read", provider: "x", usage: { requests: 2 } });
    state = recordResourceUsageEvent(state, { presenceId: presence.id, invocationId: "self-model", originKind: "self_directed_discovery", attentionSource: "self_directed_discovery", category: "model", provider: "test", usage: { requests: 2 } });

    const snapshot = attentionGovernorSnapshot(state, presence.id);
    expect(snapshot.selfDirected.channelReads).toBe(2);
    expect(snapshot.background.channelReads).toBe(20);
    expect(snapshot.left.channelReads).toBe(8);
    expect(requestAttentionCapacity(state, presence.id, "self_directed_discovery", "channel_read")).toMatchObject({ allowed: false, reason: "deferred_observation" });
    expect(requestAttentionCapacity(state, presence.id, "candidate_evaluation", "model")).toMatchObject({ allowed: false, reason: "deferred_observation" });
    expect(requestAttentionCapacity(state, presence.id, "social_action", "model")).toMatchObject({ allowed: true });
  });

  it("resets the active epoch without deleting the audit trail and resumes deferred attention", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const deferred = { ...state.presence!, selfDirectedAttention: { ...state.presence!.selfDirectedAttention!, nextEligibleAt: new Date(Date.now() + 60_000).toISOString() } };
    state.presence = deferred;
    state.presences = [deferred];
    state = recordResourceUsageEvent(state, { presenceId, invocationId: "self", originKind: "self_directed_discovery", attentionSource: "self_directed_discovery", category: "channel_read", provider: "x", usage: { requests: 1 } });
    state = applyOperation(state, { type: "resetAttentionBudget", presenceId });
    expect(state.resourceUsageEvents).toHaveLength(1);
    expect(attentionGovernorSnapshot(state, presenceId).selfDirected.channelReads).toBe(0);
    expect(state.presence?.selfDirectedAttention?.nextEligibleAt).toBeUndefined();
    expect(state.presence?.selfDirectedAttention?.usageResetAt).toBeDefined();

    const resumed = applyOperation(state, { type: "resumeAttention", presenceId });
    expect(resumed.presence?.selfDirectedAttention?.nextEligibleAt).toBeUndefined();
    expect(resumed.presence?.selfDirectedAttention?.usageResetAt).toBeDefined();
  });

  it("counts exploration model calls inside the self-directed budget", () => {
    let state = createAgent(input);
    const presence = {
      ...state.presence!,
      selfDirectedAttention: {
        ...state.presence!.selfDirectedAttention!,
        budget: { maxChannelReadsPerDay: 10, maxModelCallsPerDay: 2, maxVisionCallsPerDay: 2, maxHydrationsPerDay: 4 },
      },
    };
    state.presence = presence;
    state.presences = [presence];
    state = recordResourceUsageEvent(state, { presenceId: presence.id, invocationId: "exploration", originKind: "exploration", attentionSource: "exploration", category: "model", provider: "openai", usage: { requests: 2 } });

    expect(attentionGovernorSnapshot(state, presence.id).selfDirected.modelCalls).toBe(2);
    expect(requestAttentionCapacity(state, presence.id, "candidate_evaluation", "model")).toMatchObject({ allowed: false, reason: "deferred_budget" });
  });
});
