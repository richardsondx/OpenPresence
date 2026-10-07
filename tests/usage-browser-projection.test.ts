import { describe, expect, it } from "vitest";
import { GET as stateGet } from "../app/api/state/route";
import { usageBrowserProjection } from "../lib/usage-browser-projection";
import { createAgent } from "../lib/runtime";
import Database from "better-sqlite3";
import { readRuntimeAuditProjection, resolvedDbPath, writeState } from "../lib/db";

describe("Usage browser projection", () => {
  it("joins normalized provider telemetry to its turn without exposing another Presence", () => {
    const state = createAgent({ name: "Audit telemetry", description: "Private research", mode: "agent", handle: "audit", accent: "#777777" });
    writeState(state, { force: true });
    const sql = new Database(resolvedDbPath);
    try {
      // Persisted compact snapshots omit normalized telemetry, just like the
      // real Chrome research state which exposed the missing audit edge.
      sql.prepare("UPDATE app_state SET payload=json_remove(payload, '$.resourceUsageEvents') WHERE id=1").run();
      const usage = { id: "audit-provider-request", agentId: state.agent!.id, presenceId: state.presence!.id, category: "model", provider: "openrouter", model: "openai/gpt-4o-mini", runId: "audit-chat-turn", invocationId: "audit-chat-invocation", usage: { requests: 1, inputTokens: 12, outputTokens: 7 }, createdAt: "2026-10-01T05:00:00Z" };
      const insert = sql.prepare("INSERT OR REPLACE INTO resource_usage_events (id,agent_id,parent_id,payload,updated_at) VALUES (?,?,?,?,?)");
      for (const item of [usage, { ...usage, id: "another-presence-request", presenceId: "another-presence" }]) insert.run(item.id, item.agentId, item.presenceId, JSON.stringify(item), item.createdAt);
      const audited = readRuntimeAuditProjection(state.presence!.id).resourceUsageEvents;
      expect(audited).toEqual([usage]);
      expect(audited[0]).toMatchObject({ runId: "audit-chat-turn", invocationId: "audit-chat-invocation", usage: { requests: 1, inputTokens: 12, outputTokens: 7 } });
      expect(readRuntimeAuditProjection("another-presence").resourceUsageEvents.map(item => item.id)).toEqual(["another-presence-request"]);
    } finally { sql.close(); }
  });

  it("keeps newer compatibility telemetry authoritative while normalized projection catches up", () => {
    const state = createAgent({ name: "Audit freshness", description: "Private research", mode: "agent", handle: "fresh", accent: "#777777" });
    writeState(state, { force: true });
    const sql = new Database(resolvedDbPath);
    try {
      const fresh = { id: "fresh-usage", presenceId: state.presence!.id, runId: "fresh-turn", usage: { requests: 1 } };
      sql.prepare("UPDATE app_state SET payload=json_set(payload, '$.resourceUsageEvents', json(?)) WHERE id=1").run(JSON.stringify([fresh]));
      expect(readRuntimeAuditProjection(state.presence!.id).resourceUsageEvents).toEqual([fresh]);
    } finally { sql.close(); }
  });
  it("keeps shell identity and connector status without sending workspace history", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.assets = Array.from({ length: 50 }, (_, index) => ({ id: `asset-${index}` })) as never;
    state.events = Array.from({ length: 50 }, (_, index) => ({ id: `event-${index}` })) as never;
    state.nativeConnections = [{ id: "native-1", presenceId: state.presence!.id, kind: "x", status: "connected" }] as never;
    state.proposals = [{ id: "proposal-pending", status: "pending" }, { id: "proposal-applied", status: "applied" }] as never;

    state.assignments = [{ id: "assignment", createdAt: "2026-09-12T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z" }] as never;
    const projection = usageBrowserProjection(state);

    expect(projection.assignments[0]).toMatchObject({ createdAt: "2026-09-12T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z" });
    expect(projection.responseProjection).toBe("usage");
    expect(projection.agent?.id).toBe(state.agent?.id);
    expect(projection.presences).toHaveLength(1);
    expect(projection.nativeConnections).toHaveLength(1);
    expect(projection.assets).toEqual([]);
    expect(projection.events).toEqual([]);
    expect(projection.proposals).toEqual([{ id: "proposal-pending", status: "pending" }]);
  });

  it("keeps the synthetic Usage response compact", async () => {
    const state = createAgent({ name: "Projection fixture", description: "Synthetic browser projection", mode: "agent", handle: "@projection_fixture", accent: "#777777" });
    writeState(state, { force: true });
    const response = await stateGet(new Request(`http://localhost/api/state?projection=usage&agentId=${state.agent!.id}&presenceId=${state.presence!.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("usage");
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(500_000);
  });
});
