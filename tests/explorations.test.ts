import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, compileExploration, createAgent, finishExplorationSession, startExplorationSession } from "../lib/runtime";
import { readState, writeState } from "../lib/db";
import { POST } from "../app/api/state/route";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Presence-scoped Explorations", () => {
  it("keeps the operator brief durable and separate from Watchlist entries", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const exploration = compileExploration(state, "Keep an eye on builders struggling with agent infrastructure.", presenceId);
    expect(exploration).toMatchObject({ presenceId, status: "active", revision: 1 });
    expect(exploration?.interpretation).toContain("agent infrastructure");

    const created = applyOperation(state, { type: "createExploration", brief: "Keep an eye on builders struggling with agent infrastructure.", presenceId });
    expect(created.explorations).toHaveLength(1);
    expect(created.watches).toHaveLength(0);
    expect(created.socialIntents).toHaveLength(0);
    expect(created.executions).toHaveLength(0);

    const refined = applyOperation(created, { type: "updateExploration", id: created.explorations[0]!.id, brief: "Focus more on people actually deploying persistent agents." });
    expect(refined.explorations[0]).toMatchObject({ revision: 2, brief: "Focus more on people actually deploying persistent agents." });
    expect(refined.discoveryPlans).toHaveLength(0);
  });

  it("preserves Presence isolation and pause/archive lifecycle", () => {
    let state = createAgent(input);
    const firstPresence = state.presence!;
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny-work", mode: "agent", accent: "#D68754" } });
    const secondPresence = state.presences.find((item) => item.id !== firstPresence.id)!;
    state = applyOperation(state, { type: "createExploration", presenceId: firstPresence.id, brief: "Keep an eye on persistent agent builders." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationStatus", id: exploration.id, status: "paused" });
    expect(state.explorations[0]?.status).toBe("paused");
    state = applyOperation(state, { type: "setExplorationStatus", id: exploration.id, status: "archived" });
    expect(state.explorations[0]?.status).toBe("archived");
    expect(state.explorations.every((item) => item.presenceId === firstPresence.id)).toBe(true);
    expect(state.explorations.some((item) => item.presenceId === secondPresence.id)).toBe(false);
  });

  it("turns selected Mirror evidence into findings without creating an action", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Keep an eye on concrete agent infrastructure problems." });
    const exploration = state.explorations[0]!;
    const mirrorId = "mirror-exploration-1";
    state.mirrorObjects.unshift({ id: mirrorId, bridgeId: "sandbox", presenceId, channelId: "x", externalRef: { type: "x.post", id: "post-1" }, objectType: "post", author: { displayName: "Alex Builder", handle: "alexbuilder" }, content: { text: "We are struggling to deploy persistent agent infrastructure." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", source: "operator", trust: "untrusted_world_content" });
    const started = startExplorationSession(state, exploration.id, "mirror");
    const completed = finishExplorationSession(started.state, started.session.id, { status: "completed", candidatesSeen: 1, candidatesHydrated: 1, findings: [{ mirrorObjectId: mirrorId, safeSummary: "Alex Builder describes a deployment problem.", whyItMayMatter: "The post is directly related to the Exploration brief." }] });
    expect(completed.explorationFindings[0]).toMatchObject({ explorationId: exploration.id, mirrorObjectId: mirrorId, status: "surfaced" });
    expect(completed.socialIntents).toHaveLength(0);
    expect(completed.executions).toHaveLength(0);
  });

  it("runs an autonomous Exploration Assignment without the Look now button", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "sandbox", execution: { ...state.presence!.execution, reply: "auto", post: "auto" } } });
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find founders struggling with persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    state = (await import("../lib/runtime")).startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = (await import("../lib/runtime")).addSandboxEvent(state, { sessionId, actorName: "Founder", actorHandle: "founder", content: "Our persistent agent memory becomes incoherent after a few days." });
    state.explorations[0]!.nextEligibleAt = new Date(Date.now() - 1_000).toISOString();
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "runAttentionWorker" }) }));
    expect(response.status).toBe(200);
    const completed = await response.json();
    const finding = completed.explorationFindings.find((item: { explorationId: string }) => item.explorationId === exploration.id);
    const assignmentId = completed.explorations.find((item: { id: string }) => item.id === exploration.id).engagement.assignmentId;
    expect(finding).toMatchObject({ status: "acted", socialIntentId: expect.any(String) });
    expect(completed.socialIntents.some((item: { assignmentId?: string; affordance: string }) => item.assignmentId === assignmentId && item.affordance === "reply")).toBe(true);
    expect(completed.executions.some((item: { assignmentId?: string; status: string }) => item.assignmentId === assignmentId && item.status === "succeeded")).toBe(true);
    expect(completed.events.some((item: { title: string; detail: string }) => item.title === "Exploration engagement verified" && item.detail.includes("Assignment"))).toBe(true);
    expect(readState().assignments.find((item) => item.id === assignmentId)?.progress.verified).toBe(1);
  });
});
