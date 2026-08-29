import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, compileExploration, createAgent, finishExplorationSession, formXActionIntent, startExplorationSession } from "../lib/runtime";
import { listOperationalRuns, readState, writeState, writeState as writeDbState } from "../lib/db";
import { POST } from "../app/api/state/route";
import { POST as xManagePost } from "../app/api/x/manage/route";
import { runLiveExplorationWorker } from "../lib/exploration-worker";
import { runOperationalSweep } from "../lib/temporal";

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
    state.mirrorObjects.unshift({ id: mirrorId, bridgeId: "sandbox", presenceId, channelId: "x", externalRef: { type: "x.post", id: "post-1" }, objectType: "post", language: "en", author: { displayName: "Alex Builder", handle: "alexbuilder" }, content: { text: "We are struggling to deploy persistent agent infrastructure." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", source: "operator", trust: "untrusted_world_content" });
    const started = startExplorationSession(state, exploration.id, "mirror");
    const completed = finishExplorationSession(started.state, started.session.id, { status: "completed", candidatesSeen: 1, candidatesHydrated: 1, findings: [{ mirrorObjectId: mirrorId, safeSummary: "Alex Builder describes a deployment problem.", whyItMayMatter: "The post is directly related to the Exploration brief." }] });
    expect(completed.explorationFindings[0]).toMatchObject({ explorationId: exploration.id, mirrorObjectId: mirrorId, status: "surfaced" });
    expect(completed.events[0]).toMatchObject({ title: "Exploration found something worth noticing", sourceObjectId: mirrorId });
    expect(completed.events[0]?.detail).toContain("Alex Builder describes a deployment problem.");
    expect(completed.socialIntents).toHaveLength(0);
    expect(completed.executions).toHaveLength(0);
  });

  it("does not send sandbox Explorations through the live temporal worker", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "sandbox", execution: { ...state.presence!.execution, reply: "auto", post: "auto" } } });
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find founders struggling with persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    state = (await import("../lib/runtime")).startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = (await import("../lib/runtime")).addSandboxEvent(state, { sessionId, actorName: "Founder", actorHandle: "founder", content: "Our persistent agent memory becomes incoherent after a few days.", language: "en" });
    state.explorations[0]!.nextEligibleAt = new Date(Date.now() - 1_000).toISOString();
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "runAttentionWorker" }) }));
    expect(response.status).toBe(200);
    const completed = await response.json();
    expect(completed.runId).toEqual(expect.any(String));
    expect(readState().explorationSessions).toHaveLength(0);
  });

  it("creates a broad durable attention run when a live Exploration is due", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state.presence!.environment = "live";
    state.presence!.connectionMode = "native";
    state.presences = state.presences.map((item) => item.id === presenceId ? { ...item, environment: "live" as const, connectionMode: "native" } : item);
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find builders discussing persistent agent memory." });
    state.explorations[0]!.nextEligibleAt = new Date(Date.now() - 1_000).toISOString();
    writeDbState(state);
    runOperationalSweep();
    expect(listOperationalRuns(presenceId).some((run) => run.kind === "attention" && run.attention?.scope === "broad")).toBe(true);
  });

  it("routes a live Exploration finding through reply intent and native delivery", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", publishingInitiative: { ...state.presence!.publishingInitiative, mode: "off" }, execution: { ...state.presence!.execution, reply: "auto", post: "auto" } } });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "native";
    state.presences = state.presences.map((item) => item.id === presenceId ? { ...item, environment: "live", connectionMode: "native" } : item);
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find builders discussing persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    writeState(state);

    process.env.OPENPRESENCE_X_API_MOCK = "1";
    const saved = await xManagePost(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    state = (await saved.json()).state;
    const currentExploration = state.explorations.find((item: { id: string }) => item.id === exploration.id)!;
    currentExploration.nextEligibleAt = new Date(Date.now() - 1_000).toISOString();
    writeState(state);
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "lead-1", text: "@jenny_ai We are building persistent agent memory and the hard part is keeping decisions coherent over time.", lang: "en", created_at: "2026-08-16T06:00:00.000Z", author_id: "builder-1", conversation_id: "lead-1" }], includes: { users: [{ id: "builder-1", username: "builder", name: "Builder" }] } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const completed = await runLiveExplorationWorker(readState(), exploration.id, { runId: "exploration-test-run", invocationId: "exploration-test-invocation" });
    writeState(completed);
    const assignmentId = completed.explorations.find((item: { id: string }) => item.id === exploration.id)!.engagement!.assignmentId;
    expect(completed.explorationFindings.some((item: { status: string }) => item.status === "blocked")).toBe(true);
    expect(completed.socialIntents.some((item: { assignmentId?: string; affordance: string }) => item.assignmentId === assignmentId && item.affordance === "x.reply")).toBe(true);
    expect(completed.executions.some((item: { assignmentId?: string; affordance: string; status: string }) => item.assignmentId === assignmentId && item.affordance === "x.reply" && item.status === "blocked")).toBe(true);
    expect(completed.events.some((event: { title: string }) => event.title === "Exploration engagement delivered" || event.title === "Exploration engagement queued" || event.title === "Exploration engagement failed")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("routes an unrelated live Exploration finding to the browser capability fallback", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", publishingInitiative: { ...state.presence!.publishingInitiative, mode: "off" }, execution: { ...state.presence!.execution, reply: "auto", post: "auto" } } });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "native";
    state.presence!.browserAccess = { enabled: true, learnedFallbacks: [{ action: "x.reply", reason: "The native X API rejected this reply because the post did not mention the Presence.", learnedAt: new Date().toISOString() }] };
    state.presences = state.presences.map((item) => item.id === presenceId ? { ...item, environment: "live", connectionMode: "native", browserAccess: state.presence!.browserAccess } : item);
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find builders discussing persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    state = applyOperation(state, { type: "createBridge", input: { presenceId, name: "OpenPresence Chrome · Jenny", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply", "comment", "post"], formats: ["text"], metrics: ["replies"], assetKinds: [] } } });
    const bridge = state.bridges[0]!;
    bridge.state = "online";
    bridge.lastSeenAt = new Date().toISOString();
    bridge.lastHeartbeatAt = bridge.lastSeenAt;
    bridge.accountIdentity = { username: "jenny_ai", status: "verified", observedAt: bridge.lastSeenAt };
    state.nativeConnections = [{ id: "native-x-exploration", presenceId, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "builder-presence", username: "jenny_ai", name: "Jenny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const mirrorId = "mirror-browser-reply-1";
    state.mirrorObjects.unshift({ id: mirrorId, bridgeId: bridge.id, presenceId, channelId: "x", externalRef: { type: "x.post", id: "unrelated-post-1" }, objectType: "post", language: "en", author: { externalRef: { type: "x.user", id: "builder-1" }, displayName: "Builder", handle: "builder" }, content: { text: "We are struggling to deploy persistent agent memory and keep decisions coherent." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "operator", trust: "untrusted_world_content" });
    state.explorations[0]!.nextEligibleAt = new Date(Date.now() - 1_000).toISOString();
    writeState(state);

    const completed = await runLiveExplorationWorker(readState(), exploration.id, { runId: "exploration-browser-test-run", invocationId: "exploration-browser-test-invocation" });
    writeState(completed);
    const assignmentId = completed.explorations.find((item: { id: string }) => item.id === exploration.id)!.engagement!.assignmentId;
    const execution = completed.executions.find((item: { assignmentId?: string }) => item.assignmentId === assignmentId);
    expect(completed.explorationFindings.some((item: { status: string }) => item.status === "considering")).toBe(true);
    expect(execution).toMatchObject({ assignmentId, affordance: "x.reply", connector: "bridge", bridgeId: bridge.id, status: "queued", target: { type: "x.post", id: "unrelated-post-1" } });
    expect(completed.events.some((event: { title: string; detail: string }) => event.title === "Exploration engagement queued" && event.detail.includes("verified Chrome"))).toBe(true);
  });

  it("makes a public quote available through verified Chrome when native X target rules reject it", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", execution: { ...state.presence!.execution, quote: "auto" } } });
    state.presence!.environment = "live";
    state.presences = state.presences.map((item) => item.id === presenceId ? { ...item, environment: "live" as const, connectionMode: "native" } : item);
    state = applyOperation(state, { type: "createBridge", input: { presenceId, name: "OpenPresence Chrome · Jenny", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] } } });
    const bridge = state.bridges[0]!;
    bridge.state = "online";
    bridge.lastHeartbeatAt = new Date().toISOString();
    bridge.lastSeenAt = bridge.lastHeartbeatAt;
    bridge.accountIdentity = { username: "jenny_ai", status: "verified", observedAt: bridge.lastHeartbeatAt };
    state.nativeConnections = [{ id: "native-x-quote", presenceId, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "jenny", username: "jenny_ai", name: "Jenny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.mirrorObjects.unshift({ id: "mirror-public-quote", bridgeId: bridge.id, presenceId, channelId: "x", externalRef: { type: "x.post", id: "public-quote-target" }, objectType: "post", language: "en", author: { externalRef: { type: "x.user", id: "builder" }, displayName: "Builder", handle: "builder" }, content: { text: "A concrete public post about persistent agent memory." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "operator", trust: "untrusted_world_content" });
    const quoted = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "public-quote-target" }, text: "The concrete challenge here is keeping memory coherent as decisions accumulate." , origin: { kind: "exploration", refId: "exploration-test" } });
    expect(quoted.executions[0]).toMatchObject({ affordance: "x.quote", connector: "bridge", bridgeId: bridge.id, status: "queued" });
    const withoutVerifiedBridge = formXActionIntent({ ...state, bridges: [] }, { affordance: "x.quote", target: { type: "x.post", id: "public-quote-target" }, text: "The concrete challenge here is keeping memory coherent as decisions accumulate.", origin: { kind: "exploration", refId: "exploration-test" } });
    expect(withoutVerifiedBridge.executions).toHaveLength(0);
  });
});
