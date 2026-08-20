import { describe, expect, it } from "vitest";
import { canonicalUsageEvents } from "../lib/usage";
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
});
