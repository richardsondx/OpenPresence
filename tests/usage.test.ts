import { describe, expect, it } from "vitest";
import { canonicalUsageEvents, operatorUsageReply, summarizeRecordedUsage } from "../lib/usage";
import { createAgent } from "../lib/runtime";
import type { ResourceUsageEvent } from "../lib/types";

type UsageWorkspace = Parameters<typeof canonicalUsageEvents>[0][number];

function modelEvent(id: string, agentId: string, presenceId: string, totalTokens: number): ResourceUsageEvent {
  return {
    id,
    agentId,
    presenceId,
    invocationId: `model:${id}`,
    originKind: "inbound_social",
    category: "model",
    provider: "openai",
    usage: { totalTokens, requests: 1 },
    createdAt: "2026-08-18T19:22:37.728Z",
  };
}

function workspace(agentId: string, presenceId: string, resourceUsageEvents: ResourceUsageEvent[]): UsageWorkspace {
  return {
    agent: { id: agentId } as UsageWorkspace["agent"],
    presences: [{ id: presenceId } as UsageWorkspace["presences"][number]],
    resourceUsageEvents,
  };
}

describe("usage attribution", () => {
  it("keeps a Presence's usage with its owning Agent when a stale workspace duplicates it", () => {
    const jenny = workspace("agent-jenny", "presence-genny", [modelEvent("usage-1", "agent-jenny", "presence-genny", 4_000), modelEvent("usage-2", "agent-jenny", "presence-genny", 7_000)]);
    const staleGenny = workspace("agent-genny", "presence-genny", [modelEvent("usage-1", "agent-jenny", "presence-genny", 4_000), modelEvent("usage-2", "agent-jenny", "presence-genny", 7_000)]);

    const attributed = canonicalUsageEvents([jenny, staleGenny], new Set(["agent-jenny", "agent-genny"]));

    expect(attributed.get("agent-jenny")?.map((event) => event.id)).toEqual(["usage-1", "usage-2"]);
    expect(attributed.get("agent-genny") ?? []).toHaveLength(0);
  });

  it("retains genuine usage for a different Agent while deduplicating shared snapshots", () => {
    const jenny = workspace("agent-jenny", "presence-genny", [modelEvent("usage-jenny", "agent-jenny", "presence-genny", 4_000)]);
    const genny = workspace("agent-genny", "presence-genny-agent", [modelEvent("usage-genny", "agent-genny", "presence-genny-agent", 11_000)]);

    const attributed = canonicalUsageEvents([jenny, genny], new Set(["agent-jenny", "agent-genny"]));

    expect(attributed.get("agent-jenny")?.[0]?.usage.totalTokens).toBe(4_000);
    expect(attributed.get("agent-genny")?.[0]?.usage.totalTokens).toBe(11_000);
  });

  it("summarizes model tokens and connector requests by origin and action", () => {
    const events: ResourceUsageEvent[] = [
      { ...modelEvent("model-1", "agent-jenny", "presence-genny", 11_000), originKind: "assignment", usage: { inputTokens: 7_000, outputTokens: 2_000, reasoningTokens: 2_000, totalTokens: 11_000, requests: 1 } },
      { id: "read-1", agentId: "agent-jenny", presenceId: "presence-genny", invocationId: "read-1", originKind: "operator", category: "channel_read", action: "x.search", provider: "x", usage: { requests: 3 }, createdAt: "2026-08-18T19:22:37.728Z" },
      { id: "write-1", agentId: "agent-jenny", presenceId: "presence-genny", invocationId: "write-1", originKind: "assignment", category: "channel_write", action: "x.post", provider: "x", usage: { requests: 1 }, createdAt: "2026-08-18T19:22:37.728Z" },
    ];
    const summary = summarizeRecordedUsage(events, { range: "all", now: new Date("2026-08-19T00:00:00.000Z") });
    expect(summary).toMatchObject({ eventCount: 3, apiRequests: 4, xReads: 3, xWrites: 1, modelCalls: 1, inputTokens: 7_000, outputTokens: 2_000, reasoningTokens: 2_000, totalTokens: 11_000 });
    expect(summary.byOrigin[0]).toMatchObject({ origin: "assignment", totalTokens: 11_000 });
    expect(summary.byAction).toEqual(expect.arrayContaining([expect.objectContaining({ action: "x.search", requests: 3 }), expect.objectContaining({ action: "x.post", requests: 1 })]));
  });

  it("answers usage questions from the recorded ledger and leaves fresh probes to the connection tool", () => {
    const state = createAgent({ name: "Ledger Agent", description: "A test agent", mode: "agent", handle: "@ledger_agent", accent: "#777777" });
    state.resourceUsageEvents = [modelEvent("model-1", state.agent!.id, state.presence!.id, 11_000)];
    const answer = operatorUsageReply(state, "What did you spend my tokens on?", state.resourceUsageEvents, new Date("2026-08-19T00:00:00.000Z"));
    expect(answer).toContain("11,000 model tokens");
    expect(answer).toContain("inbound social");
    expect(operatorUsageReply(state, "Check the credit now", state.resourceUsageEvents)).toBeUndefined();
    expect(operatorUsageReply(state, "How much credit is left?", state.resourceUsageEvents)).toBeUndefined();
    expect(operatorUsageReply(state, "ok can you plan the posting now that we have credit?", state.resourceUsageEvents)).toBeUndefined();
  });
});
