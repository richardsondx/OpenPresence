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

  it("keeps People relationship evidence scoped to the active Presence", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.people = [{ id: "person-1", memoryState: "active" }] as never;
    state.personIdentities = [{ id: "identity-1", personId: "person-1", sourcePresenceId: presenceId }] as never;
    state.mirrorObjects = [{ id: "current", presenceId }, { id: "other", presenceId: "other-presence" }] as never;
    const projection = agentLibraryBrowserProjection(state, "people");
    expect(projection.people).toHaveLength(1);
    expect(projection.personIdentities).toHaveLength(1);
    expect(projection.mirrorObjects.map((object) => object.id)).toEqual(["current"]);
    expect(projection.assets).toEqual([]);
  });

  it("keeps verified Feed joins while trimming unrelated collections", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.mirrorObjects = [
      { id: "mirror-1", presenceId, assetRefs: [{ assetId: "asset-1" }] },
      { id: "mirror-2", presenceId: "other-presence" },
    ] as never;
    state.assets = [{ id: "asset-1" }, { id: "asset-2" }] as never;
    state.assignments = [{ id: "assignment-1" }] as never;
    state.people = [{ id: "unrelated-person" }] as never;
    const projection = agentLibraryBrowserProjection(state, "feed");
    expect(projection.responseProjection).toBe("feed");
    expect(projection.mirrorObjects).toHaveLength(1);
    expect(projection.assets).toEqual([{ id: "asset-1" }]);
    expect(projection.assignments).toHaveLength(1);
    expect(projection.people).toEqual([]);
  });

  it("keeps Schedule assignments and plan evidence without the full ledger", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.publishingPlans = [{ id: "plan-1", presenceId, status: "active", revision: 1, updatedAt: "2026-08-30T00:00:00.000Z" }] as never;
    state.assignments = [{ id: "assignment-1", presenceId, status: "active" }] as never;
    state.assignmentRuns = [{ id: "run-1", assignmentId: "assignment-1" }] as never;
    state.assetCollections = [{ id: "collection-1", agentId: state.agent!.id, status: "active" }, { id: "archived", agentId: state.agent!.id, status: "archived" }] as never;
    state.mirrorObjects = [{ id: "plan-mirror", presenceId, originExecutionId: "plan-execution" }, { id: "unrelated", presenceId, originExecutionId: "other-execution" }] as never;
    state.executions = [{ id: "plan-execution", presenceId, status: "succeeded", publication: { origin: { kind: "publishing_initiative", planId: "plan-1", planRevision: 1 } } }, { id: "other-execution", presenceId, status: "succeeded" }] as never;
    const projection = agentLibraryBrowserProjection(state, "schedule");
    expect(projection.responseProjection).toBe("schedule");
    expect(projection.publishingPlans).toHaveLength(1);
    expect(projection.assignments).toHaveLength(1);
    expect(projection.assignmentRuns).toHaveLength(1);
    expect(projection.assetCollections).toEqual([{ id: "collection-1", agentId: state.agent!.id, status: "active" }]);
    expect(projection.mirrorObjects.map((object) => object.id)).toEqual(["plan-mirror"]);
    expect(projection.executions.map((execution) => execution.id)).toEqual(["plan-execution"]);
    expect(projection.people).toEqual([]);
  });
});
