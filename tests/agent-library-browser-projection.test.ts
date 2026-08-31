import { describe, expect, it } from "vitest";
import { agentLibraryBrowserProjection } from "../lib/agent-library-browser-projection";
import { createAgent } from "../lib/runtime";

describe("Agent library browser projections", () => {
  it("keeps Knowledge records and removes unrelated operational history", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.knowledgeDocuments = [{ id: "doc-1", agentId: state.agent!.id, status: "active" }] as never;
    state.knowledgeVersions = [{ id: "version-1", itemId: "doc-1" }] as never;
    state.assets = [{ id: "asset-1" }] as never;
    state.mirrorObjects = [{ id: "mirror-1" }] as never;
    const projection = agentLibraryBrowserProjection(state, "knowledge");
    expect(projection.responseProjection).toBe("knowledge");
    expect(projection.knowledgeDocuments).toHaveLength(1);
    expect(projection.knowledgeVersions).toHaveLength(1);
    expect(projection.assets).toEqual([]);
    expect(projection.mirrorObjects).toEqual([]);
  });

  it("keeps Asset records and returns a compact response", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.assets = Array.from({ length: 50 }, (_, index) => ({ id: `asset-${index}` })) as never;
    state.mirrorObjects = Array.from({ length: 50 }, (_, index) => ({ id: `mirror-${index}` })) as never;
    const projection = agentLibraryBrowserProjection(state, "assets");
    expect(projection.responseProjection).toBe("assets");
    expect(projection.assets).toHaveLength(50);
    expect(projection.mirrorObjects).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(Buffer.byteLength(JSON.stringify(state)));
  });
});
