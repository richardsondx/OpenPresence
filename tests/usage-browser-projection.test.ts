import { describe, expect, it } from "vitest";
import { GET as stateGet } from "../app/api/state/route";
import { usageBrowserProjection } from "../lib/usage-browser-projection";
import { createAgent } from "../lib/runtime";

describe("Usage browser projection", () => {
  it("keeps shell identity and connector status without sending workspace history", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.assets = Array.from({ length: 50 }, (_, index) => ({ id: `asset-${index}` })) as never;
    state.events = Array.from({ length: 50 }, (_, index) => ({ id: `event-${index}` })) as never;
    state.nativeConnections = [{ id: "native-1", presenceId: state.presence!.id, kind: "x", status: "connected" }] as never;
    state.proposals = [{ id: "proposal-pending", status: "pending" }, { id: "proposal-applied", status: "applied" }] as never;

    const projection = usageBrowserProjection(state);

    expect(projection.responseProjection).toBe("usage");
    expect(projection.agent?.id).toBe(state.agent?.id);
    expect(projection.presences).toHaveLength(1);
    expect(projection.nativeConnections).toHaveLength(1);
    expect(projection.assets).toEqual([]);
    expect(projection.events).toEqual([]);
    expect(projection.proposals).toEqual([{ id: "proposal-pending", status: "pending" }]);
  });

  it("keeps the canonical Usage response compact", async () => {
    const response = await stateGet(new Request("http://localhost/api/state?projection=usage&agentId=agent_example_2&presenceId=presence_example_19"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("usage");
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(500_000);
  });
});
