import { describe, expect, it } from "vitest";
import { agentLibraryBrowserProjection } from "../lib/agent-library-browser-projection";
import { createAgent } from "../lib/runtime";
import type { OpenPresenceState } from "../lib/types";

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

  it("keeps the canonical People response under the browser payload budget", async () => {
    const response = await (await import("../app/api/state/route")).GET(
      new Request("http://localhost/api/state?projection=people&agentId=agent_example_2&presenceId=presence_example_19"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("people");
    expect(body.people).toBeDefined();
    expect(body.personIdentities).toBeDefined();
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(800_000);
  });

  it("keeps the canonical Feed response compact while preserving derived history", async () => {
    const response = await (await import("../app/api/state/route")).GET(
      new Request("http://localhost/api/state?projection=feed&agentId=agent_example_2&presenceId=presence_example_19"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("feed");
    expect(body.feedBrowserHistory).toBeDefined();
    expect(body.socialIntents).toEqual([]);
    expect(body.outcomes).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(2_000_000);
  });

  it("keeps verified Feed joins while trimming unrelated collections", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    const observedAt = new Date().toISOString();
    state.mirrorObjects = [
      { id: "mirror-1", bridgeId: "test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "post-1" }, objectType: "post", actorPresenceId: presenceId, assignmentId: "assignment-1", author: { displayName: "Genny" }, content: { text: "Verified feed item" }, visibility: "public", shareability: "presence-only", observedAt, occurredAt: observedAt, environment: state.presence!.environment, assetRefs: [{ assetId: "asset-1" }] },
      { id: "mirror-2", bridgeId: "test", presenceId: "other-presence", channelId: "x", externalRef: { type: "x.post", id: "post-2" }, objectType: "post", visibility: "public", shareability: "presence-only", observedAt },
    ] as never;
    state.assets = [{ id: "asset-1" }, { id: "asset-2" }] as never;
    state.assignments = [{ id: "assignment-1" }] as never;
    state.people = [{ id: "unrelated-person" }] as never;
    const projection = agentLibraryBrowserProjection(state, "feed");
    expect(projection.responseProjection).toBe("feed");
    expect(projection.mirrorObjects).toHaveLength(1);
    expect(projection.assets).toHaveLength(1);
    expect(projection.assets[0]).toMatchObject({ id: "asset-1" });
    expect((projection as OpenPresenceState & { feedBrowserHistory?: unknown[] }).feedBrowserHistory).toHaveLength(1);
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

  it("keeps Watching evidence and connector state scoped to the Presence", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.watches = [{ id: "watch-1", presenceId }] as never;
    state.watchSignals = [{ id: "signal-1", watchId: "watch-1", mirrorObjectId: "signal-mirror" }, { id: "other-signal", watchId: "other-watch", mirrorObjectId: "other-mirror" }] as never;
    state.explorations = [{ id: "exploration-1", presenceId, engagement: { assignmentId: "exploration-assignment" } }] as never;
    state.explorationFindings = [{ id: "finding-1", explorationId: "exploration-1", mirrorObjectId: "finding-mirror" }] as never;
    state.explorationSessions = [{ id: "session-1", explorationId: "exploration-1", artifactIds: ["artifact-mirror"] }] as never;
    state.assignments = [{ id: "exploration-assignment", presenceId }, { id: "other-assignment", presenceId: "other-presence" }] as never;
    state.bridges = [{ id: "bridge-1", presenceId, name: "OpenPresence Chrome" }, { id: "bridge-2", presenceId: "other-presence" }] as never;
    state.mirrorObjects = [
      { id: "signal-mirror", presenceId },
      { id: "finding-mirror", presenceId },
      { id: "artifact-mirror", presenceId },
      { id: "recent-post", presenceId, visibility: "public", objectType: "post" },
      { id: "unrelated", presenceId, visibility: "public", objectType: "post" },
    ] as never;
    const projection = agentLibraryBrowserProjection(state, "watching");
    expect(projection.responseProjection).toBe("watching");
    expect(projection.watches).toHaveLength(1);
    expect(projection.watchSignals).toHaveLength(1);
    expect(projection.explorations).toHaveLength(1);
    expect(projection.explorationFindings).toHaveLength(1);
    expect(projection.explorationSessions).toHaveLength(1);
    expect(projection.assignments.map((assignment) => assignment.id)).toEqual(["exploration-assignment"]);
    expect(projection.bridges.map((bridge) => bridge.id)).toEqual(["bridge-1"]);
    expect(projection.mirrorObjects.map((object) => object.id)).toEqual(["signal-mirror", "finding-mirror", "artifact-mirror", "recent-post", "unrelated"]);
    expect(projection.relationships).toEqual([]);
  });

  it("keeps only the active Presence rehearsal transcript and file context", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.presenceChatSessions = [{ id: "session-1", presenceId, messages: [] }, { id: "session-2", presenceId: "other-presence", messages: [] }] as never;
    state.files = [{ kind: "TASTE", revision: 4 }, { kind: "BRAIN", revision: 1 }] as never;
    state.mirrorObjects = [{ id: "unrelated" }] as never;
    const projection = agentLibraryBrowserProjection(state, "rehearsal");
    expect(projection.responseProjection).toBe("rehearsal");
    expect(projection.presenceChatSessions).toHaveLength(1);
    expect(projection.files).toHaveLength(2);
    expect(projection.mirrorObjects).toEqual([]);
  });

  it("keeps Brain configuration and mind-file context without operational history", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.files = [{ kind: "BRAIN", revision: 4 }] as never;
    state.modelProfiles = [{ id: "model-1", agentId: state.agent!.id }] as never;
    state.providerConnections = [{ id: "provider-1", provider: "openai" }] as never;
    state.skills = [{ id: "skill-1", name: "Research" }] as never;
    state.knowledgeDocuments = [{ id: "doc-1", agentId: state.agent!.id, status: "active" }] as never;
    state.mirrorObjects = [{ id: "unrelated" }] as never;
    const projection = agentLibraryBrowserProjection(state, "brain");
    expect(projection.responseProjection).toBe("brain");
    expect(projection.files).toHaveLength(1);
    expect(projection.modelProfiles).toHaveLength(1);
    expect(projection.providerConnections).toHaveLength(1);
    expect(projection.skills).toHaveLength(1);
    expect(projection.knowledgeDocuments).toHaveLength(1);
    expect(projection.mirrorObjects).toEqual([]);
    expect(projection.events).toEqual([]);
  });

  it("keeps Teach conversation context while bounding transcript history", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    state.conversations = [{ id: "conversation-1", messages: Array.from({ length: 150 }, (_, index) => ({ id: `message-${index}`, content: `message ${index}` })) }] as never;
    state.modelProfiles = [{ id: "model-1", agentId: state.agent!.id }] as never;
    state.changeSets = Array.from({ length: 30 }, (_, index) => ({ id: `change-${index}` })) as never;
    state.librarySources = Array.from({ length: 30 }, (_, index) => ({ id: `source-${index}` })) as never;
    state.mirrorObjects = [{ id: "unrelated" }] as never;
    const projection = agentLibraryBrowserProjection(state, "teach");
    expect(projection.responseProjection).toBe("teach");
    expect(projection.conversations[0].messages).toHaveLength(100);
    expect(projection.changeSets).toHaveLength(20);
    expect(projection.librarySources).toHaveLength(20);
    expect(projection.mirrorObjects).toEqual([]);
  });

  it("keeps Presence connection settings scoped to the active Presence", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.nativeConnections = [{ id: "native-1", presenceId }, { id: "native-2", presenceId: "other-presence" }] as never;
    state.bridges = [{ id: "bridge-1", presenceId }, { id: "bridge-2", presenceId: "other-presence" }] as never;
    state.browserBodies = [{ id: "body-1", presenceId }, { id: "body-2", presenceId: "other-presence" }] as never;
    state.mirrorObjects = [{ id: "current", presenceId }, { id: "other", presenceId: "other-presence" }] as never;
    const projection = agentLibraryBrowserProjection(state, "presence");
    expect(projection.responseProjection).toBe("presence");
    expect(projection.nativeConnections).toHaveLength(1);
    expect(projection.bridges).toHaveLength(1);
    expect(projection.browserBodies).toHaveLength(1);
    expect(projection.mirrorObjects.map((object) => object.id)).toEqual(["current"]);
    expect(projection.relationships).toEqual([]);
  });

  it("keeps Playground data scoped to Sandbox sessions and active editorial work", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.playgroundSessions = [
      { id: "sandbox-current", presenceId, status: "active" },
      { id: "sandbox-other", presenceId: "other-presence", status: "active" },
    ] as never;
    state.sandboxActors = [{ id: "actor-current", sessionId: "sandbox-current" }, { id: "actor-other", sessionId: "sandbox-other" }] as never;
    state.mirrorObjects = [{ id: "mirror-current", sessionId: "sandbox-current", assetRefs: [{ assetId: "asset-current" }] }, { id: "mirror-other", sessionId: "sandbox-other" }] as never;
    state.events = [{ id: "event-current", sessionId: "sandbox-current" }, { id: "event-other", sessionId: "sandbox-other" }] as never;
    state.assignments = [{ id: "assignment-current", presenceId, sessionId: "sandbox-current", environment: "sandbox", status: "active" }, { id: "assignment-other", presenceId: "other-presence", sessionId: "sandbox-other", environment: "sandbox", status: "active" }] as never;
    state.assignmentRuns = [{ id: "run-current", assignmentId: "assignment-current" }, { id: "run-other", assignmentId: "assignment-other" }] as never;
    state.assets = [{ id: "asset-current" }, { id: "asset-other" }] as never;
    state.perceptions = [{ id: "perception-current", assetId: "asset-current" }, { id: "perception-other", assetId: "asset-other" }] as never;
    state.editorialOpportunities = [{ id: "opportunity-current", presenceId }] as never;
    state.editorialReferences = [{ id: "reference-current", presenceId }, { id: "reference-other", presenceId: "other-presence" }] as never;
    state.editorialFeedbackEvents = [{ id: "feedback-current", presenceId }, { id: "feedback-other", presenceId: "other-presence" }] as never;
    state.socialDecisions = [{ id: "unrelated-decision" }] as never;
    state.files = [{ kind: "TASTE" }, { kind: "BRAIN" }] as never;

    const projection = agentLibraryBrowserProjection(state, "playground");

    expect(projection.responseProjection).toBe("playground");
    expect(projection.playgroundSessions.map((item) => item.id)).toEqual(["sandbox-current"]);
    expect(projection.sandboxActors.map((item) => item.id)).toEqual(["actor-current"]);
    expect(projection.mirrorObjects.map((item) => item.id)).toEqual(["mirror-current"]);
    expect(projection.events.map((item) => item.id)).toEqual(["event-current"]);
    expect(projection.assignments.map((item) => item.id)).toEqual(["assignment-current"]);
    expect((projection.assignmentRuns ?? []).map((item) => item.id)).toEqual(["run-current"]);
    expect(projection.assets).toEqual([{ id: "asset-current" }]);
    expect(projection.perceptions).toEqual([{ id: "perception-current", assetId: "asset-current" }]);
    expect(projection.editorialReferences).toHaveLength(1);
    expect(projection.editorialFeedbackEvents).toHaveLength(1);
    expect(projection.files).toEqual([{ kind: "TASTE" }]);
    expect(projection.socialDecisions).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(Buffer.byteLength(JSON.stringify(state)));
  });
});
