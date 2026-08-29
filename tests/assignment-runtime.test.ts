import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/lib/ai";
import * as perceptionRuntime from "@/lib/perception-runtime";
import { saveChannelSecret } from "../lib/db";
import { applyOperation, assignmentIsSatisfied, createAgent, startPlaygroundSession } from "@/lib/runtime";
import { readState, saveProviderSecret, writeState } from "@/lib/db";
import { POST } from "@/app/api/state/route";

vi.mock("@/lib/perception-runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/perception-runtime")>("@/lib/perception-runtime");
  return {
    ...actual,
    inspectDiscoveredAsset: vi.fn(async () => ({ attempted: true, providerId: "test-vision", modelId: "fixture", result: { observation: "A legible source chart shows weekly crude inventory levels.", interpretation: "This can support the requested inventory claim.", visualForm: "chart", visualRole: "evidence", legibility: "clear", decorative: false, sourceCitationVisible: true, uncertainty: "low" as const } })),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.OPENPRESENCE_AI_MOCK;
});

async function waitForAssignment(assignmentId: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const assignment = readState().assignments.find((item) => item.id === assignmentId);
    if (assignment && ["completed", "blocked", "cancelled"].includes(assignment.status)) return readState();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Assignment ${assignmentId} did not reach a terminal state in time.`);
}

describe("Sandbox assignment runtime", () => {
  it("treats increased effort as a ceiling over the existing adaptive responsibility", () => {
    let state = createAgent({ name: "Push Agent", description: "A thoughtful collaborator", mode: "agent", handle: "@push_agent", accent: "#D68754" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, reply: "auto" as const, like: "auto" as const } };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Help https://x.com/source_author/status/2093472969037099455 reach people who genuinely care." });
    const assignment = state.assignments[0]!;
    expect(assignment).toMatchObject({ activation: { type: "continuous" }, quantityPolicy: { quantity: "agent_planned" }, progress: { required: 0 }, seed: { role: "distributable_target", externalRef: { id: "2093472969037099455" } } });
    expect(assignmentIsSatisfied(assignment, state)).toBe(false);
    state = applyOperation(state, { type: "startAssignmentPursuit", assignmentId: assignment.id, presenceId: presence.id, deadlineAt: new Date(Date.now() + 3_600_000).toISOString(), maxVerifiedActions: 100, actionCaps: { reply: 20, like: 60 }, resourceBudget: { maxChannelReads: 500, maxModelCalls: 100 } });
    const window = state.assignmentPursuitWindows?.[0];
    expect(window).toMatchObject({ assignmentId: assignment.id, maxVerifiedActions: 100, status: "active", actionCaps: { reply: 20, like: 60 } });
    state = applyOperation(state, { type: "pauseAssignmentPursuit", id: window!.id });
    expect(state.assignmentPursuitWindows?.[0]).toMatchObject({ status: "paused", pauseReason: "Paused by the operator." });
    state = applyOperation(state, { type: "resumeAssignmentPursuit", id: window!.id });
    expect(state.assignmentPursuitWindows?.[0]?.status).toBe("active");
    expect(state.assignments.find((item) => item.id === assignment.id)?.status).toBe("active");
  });

  it("scales a distribution push using the same capacity levels as Autonomy Today", () => {
    let state = createAgent({ name: "Scale Agent", description: "A careful operator", mode: "agent", handle: "@scale_agent", accent: "#D68754" });
    const presence = { ...state.presence!, environment: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Help https://x.com/source_author/status/2093472969037099455 reach people who genuinely care." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "startAssignmentPursuit", assignmentId: assignment.id, presenceId: presence.id, deadlineAt: new Date(Date.now() + 3_600_000).toISOString(), maxVerifiedActions: 40, resourceBudget: { maxChannelReads: 60, maxHydrations: 36, maxModelCalls: 40, maxVisionCalls: 15 } });
    const window = state.assignmentPursuitWindows?.[0];
    expect(window).toBeDefined();
    if (!window) return;
    state = applyOperation(state, { type: "scaleAssignmentPursuit", id: window.id, maxVerifiedActions: 90, maxActionsPerHour: 90, resourceBudget: { maxChannelReads: 150, maxHydrations: 90, maxModelCalls: 90, maxVisionCalls: 30 } });
    expect(state.assignmentPursuitWindows?.[0]).toMatchObject({ maxVerifiedActions: 90, maxActionsPerHour: 90, resourceBudget: { maxChannelReads: 150, maxHydrations: 90, maxModelCalls: 90, maxVisionCalls: 30 } });
    expect(state.events[0]?.title).toBe("Distribution push scaled");
    expect(state.assignmentPursuitWindows?.[0]?.nextRunAt).toBeTruthy();

    window!.status = "paused";
    window!.pauseReason = "maxModelCalls budget reached (40 / 40).";
    window!.nextRunAt = undefined;
    state = applyOperation(state, { type: "scaleAssignmentPursuit", id: window.id, maxVerifiedActions: 90, maxActionsPerHour: 90, resourceBudget: { maxChannelReads: 150, maxHydrations: 90, maxModelCalls: 90, maxVisionCalls: 30 } });
    expect(state.assignmentPursuitWindows?.[0]?.status).toBe("active");
    expect(state.assignmentPursuitWindows?.[0]?.pauseReason).toBeUndefined();
    expect(state.assignmentPursuitWindows?.[0]?.nextRunAt).toBeTruthy();
  });

  it("moves on when a distribution source post has been deleted", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.spyOn(ai, "generateAgentSocialDecision").mockResolvedValue({ action: "no_op", text: "", rationale: "No remaining conversation earned a useful action." });
    let state = createAgent({ name: "Distribution Agent", description: "A thoughtful collaborator", mode: "agent", handle: "@distribution_agent", accent: "#D68754" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, reply: "auto" as const, like: "auto" as const } };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state.nativeConnections = [{ id: "distribution-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "distribution-account", username: "distribution_agent", name: "Distribution Agent" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    saveChannelSecret("distribution-connection", { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" });
    state.mirrorObjects = [{ id: "live-candidate", bridgeId: "native:distribution-connection", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "live-candidate" }, objectType: "post", language: "en", content: { text: "A relevant public conversation remains available.", language: "en" }, author: { externalRef: { type: "x.user", id: "candidate-author" }, displayName: "Candidate Author", handle: "candidate_author" }, observedAt: new Date().toISOString(), occurredAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" }];
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Each day, help https://x.com/source_author/status/2093472969037099455 reach people who genuinely care. Inspect relevant conversations and choose useful authorized actions." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    writeState(state);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/2/tweets/search/recent")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/2/tweets?")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("publish.x.com/oembed")) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "runLiveAssignment", assignmentId: assignment.id, presenceId: presence.id }) }));
    expect(response.ok).toBe(true);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !readState().events.some((event) => event.title === "Promotion opportunity held")) await new Promise((resolve) => setTimeout(resolve, 20));
    const result = readState();
    const updated = result.assignments.find((item) => item.id === assignment.id);
    expect(updated?.status).toBe("active");
    expect(updated?.lastOutcome?.message ?? "").not.toContain("blocked");
    expect(result.events.some((event) => event.title === "Distribution source moved on")).toBe(true);
    expect(result.events.some((event) => event.title === "Promotion Assignment blocked")).toBe(false);
  });

  it("does not spend another model call re-judging the same burst candidates", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const decision = vi.spyOn(ai, "generateAgentSocialDecision").mockResolvedValue({ action: "no_op", text: "", rationale: "Neither fresh candidate earned a useful action." });
    let state = createAgent({ name: "Efficient Distribution Agent", description: "A thoughtful collaborator", mode: "agent", handle: "@efficient_distribution", accent: "#D68754" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, reply: "auto" as const, like: "auto" as const, repost: "auto" as const } };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state.nativeConnections = [{ id: "efficient-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "efficient-account", username: "efficient_distribution", name: "Efficient Distribution Agent" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    saveChannelSecret("efficient-connection", { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" });
    const now = new Date().toISOString();
    state.mirrorObjects = [
      { id: "source-post", bridgeId: "native:efficient-connection", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "2093472969037099455" }, objectType: "post", language: "en", content: { text: "OwnTheHype turns attention into a market for ideas worth seeing.", language: "en" }, author: { externalRef: { type: "x.user", id: "source-author" }, displayName: "Source Author", handle: "source_author" }, observedAt: now, occurredAt: now, visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" },
      { id: "candidate-post", bridgeId: "native:efficient-connection", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "candidate-post" }, objectType: "post", language: "en", content: { text: "A relevant builder conversation about attention markets.", language: "en" }, author: { externalRef: { type: "x.user", id: "candidate-author" }, displayName: "Candidate Author", handle: "candidate_author" }, observedAt: now, occurredAt: now, visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" },
    ];
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Help https://x.com/source_author/status/2093472969037099455 reach people who genuinely care. Inspect relevant conversations and choose useful authorized actions." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "startAssignmentPursuit", assignmentId: assignment.id, presenceId: presence.id, deadlineAt: new Date(Date.now() + 3_600_000).toISOString(), maxVerifiedActions: 10, resourceBudget: { maxChannelReads: 10, maxModelCalls: 10 } });
    writeState(state);
    let observedQuery = "";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/2/tweets/search/recent")) observedQuery = url;
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const run = async () => {
      await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "runLiveAssignment", assignmentId: assignment.id, presenceId: presence.id }) }));
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && !readState().events.some((event) => event.title === "Promotion opportunity held")) await new Promise((resolve) => setTimeout(resolve, 20));
    };

    await run();
    const afterFirst = readState();
    const firstCalls = decision.mock.calls.length;
    const firstWindow = afterFirst.assignmentPursuitWindows?.find((item) => item.assignmentId === assignment.id);
    expect(firstCalls).toBe(1);
    expect(decodeURIComponent(observedQuery).toLowerCase()).toContain("ownthehype");
    expect(firstWindow?.consideredCandidateKeys).toEqual(expect.arrayContaining(["x.post:2093472969037099455", "x.post:candidate-post"]));

    await run();
    expect(decision.mock.calls.length).toBe(firstCalls);
  });

  it("keeps Sandbox checks available while the Presence is paused", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent({ name: "Paused Sandbox Agent", description: "A careful operator", mode: "agent", handle: "@paused_sandbox", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "runSandboxPulse", sessionId }),
    }));

    expect(response.ok).toBe(true);
    expect((await response.json()).presence?.status).toBe("paused");
    expect(readState().presence?.status).toBe("paused");
  });

  it("completes an evaluation Assignment with a decision report rather than NO_OP", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent({ name: "Report Agent", description: "A careful evaluator", mode: "agent", handle: "@report_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Evaluate whether we should respond to this controversy." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);
    expect((await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }))).ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    const assignment = result.assignments.find((item) => item.id === assignmentId);
    expect(assignment).toMatchObject({ status: "completed", deliverable: { type: "decision_report" }, completionReport: expect.any(String), lastOutcome: { class: "assignment_completed" } });
    expect(result.publications.some((item) => item.assignmentId === assignmentId)).toBe(false);
  });

  it("blocks an assignment on a missing model provider instead of looping active forever", async () => {
    let state = createAgent({ name: "KobeissiKlone", description: "Market commentary", mode: "agent", handle: "@kobeissi_klone", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 source-backed original market post with a chart." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });

    writeState(state);
    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }));
    expect(response.ok).toBe(true);
    const queued = await response.json();
    expect(queued.assignmentRuns?.[0]).toMatchObject({ assignmentId, status: "queued" });
    const result = await waitForAssignment(assignmentId);
    expect(result.assignments[0]).toMatchObject({ status: "blocked", systemFailures: 1, progress: { verified: 0 } });
    expect(result.assignments[0]?.lastOutcome?.class).toBe("evaluation_failed");
  });

  it("discovers and materializes a Tavily asset before Sandbox publication", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("api.tavily.com")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ include_images: true });
        return new Response(JSON.stringify({ results: [{ title: "Official market chart", url: "https://publisher.example/chart", image_url: "https://cdn.example/chart.png", publisher: "Publisher" }], images: [] }), { status: 200 });
      }
      return new Response(Buffer.from("real-chart-bytes"), { status: 200, headers: { "content-type": "image/png" } });
    }));
    let state = createAgent({ name: "KobeissiKlone", description: "Market commentary", mode: "agent", handle: "@kobeissi_klone", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "configureAssetProvider", provider: "tavily", label: "Tavily", hasSecret: true });
    saveProviderSecret(state.assetProviderConnections[0]!.id, "test-tavily-key");
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original source-backed market post with asset discovery and a chart." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }));
    expect(response.ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    const publication = result.publications.find((item) => item.assignmentId === assignmentId);
    const asset = publication?.assetIds[0] ? result.assets.find((item) => item.id === publication.assetIds[0]) : undefined;
    expect(result.assignments[0]).toMatchObject({ status: "completed", progress: { verified: 1 } });
    expect(asset).toMatchObject({ nature: "observed", provenance: { acquisitionProvider: "tavily", publisher: "Publisher", sourcePageUrl: "https://publisher.example/chart" }, storage: { mimeType: "image/png" } });
    expect(result.sourceEvidence.some((item) => item.assetIds.includes(asset!.id))).toBe(true);
    expect(result.assetUsages.some((item) => item.assetId === asset!.id && item.assignmentId === assignmentId)).toBe(true);
    expect(result.assetResearchSessions).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId, status: "selected", selectedCandidateId: expect.any(String), candidates: expect.arrayContaining([expect.objectContaining({ perception: expect.objectContaining({ visualForm: "chart" }) })]) })]));
  });

  it("reformulates one empty visual search and publishes text-only when the visual is helpful", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    const queries: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("api.tavily.com")) {
        queries.push(String(JSON.parse(String(init?.body)).query));
        return new Response(JSON.stringify({ results: [], images: [] }), { status: 200 });
      }
      return new Response(Buffer.from("unused"), { status: 200, headers: { "content-type": "image/png" } });
    }));
    let state = createAgent({ name: "Optional Visual Agent", description: "A careful market observer", mode: "agent", handle: "@optional_visual", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "configureAssetProvider", provider: "tavily", label: "Tavily", hasSecret: true });
    saveProviderSecret(state.assetProviderConnections[0]!.id, "test-tavily-key");
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 source-backed market post and attach a chart only if the visual materially strengthens the story." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);
    expect((await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }))).ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    expect(queries).toHaveLength(2);
    expect(queries[1]).not.toBe(queries[0]);
    expect(result.assignments[0]).toMatchObject({ status: "completed", progress: { verified: 1 } });
    expect(result.publications.find((item) => item.assignmentId === assignmentId)?.assetIds).toEqual([]);
    expect(result.assetResearchSessions).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId, status: "text_only", outcome: "discovery_empty", candidates: [] })]));
  });

  it("keeps a required visual Assignment blocked after the bounded search is exhausted", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).includes("api.tavily.com")
      ? new Response(JSON.stringify({ results: [], images: [] }), { status: 200 })
      : new Response(Buffer.from("unused"), { status: 200, headers: { "content-type": "image/png" } })));
    let state = createAgent({ name: "Required Visual Agent", description: "A careful market observer", mode: "agent", handle: "@required_visual", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "configureAssetProvider", provider: "tavily", label: "Tavily", hasSecret: true });
    saveProviderSecret(state.assetProviderConnections[0]!.id, "test-tavily-key");
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 market post and do not publish without a verified chart." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);
    expect((await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }))).ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    const assignment = result.assignments.find((item) => item.id === assignmentId);
    expect(assignment?.status).toBe("blocked");
    expect(assignment?.lastOutcome?.message).toContain("No usable visual leads");
    expect(assignment?.lastOutcome?.message).not.toContain("No inspected candidate");
    expect(result.assetResearchSessions).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId, outcome: "discovery_empty", decisionHistory: expect.arrayContaining([expect.objectContaining({ decision: "search_again" })]) })]));
  });

  it("records inspected rejection separately from discovery failure", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    vi.mocked(perceptionRuntime.inspectDiscoveredAsset).mockResolvedValue({ attempted: true, providerId: "test-vision", modelId: "fixture", result: { observation: "A decorative photo.", interpretation: "It does not carry evidence.", visualForm: "photo", visualRole: "atmosphere", legibility: "poor", decorative: true, uncertainty: "low" } });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).includes("api.tavily.com")
      ? new Response(JSON.stringify({ results: [{ title: "Photo lead", url: "https://publisher.example/story", image_url: "https://cdn.example/photo.png", publisher: "Publisher" }], images: [] }), { status: 200 })
      : new Response(Buffer.from("photo"), { status: 200, headers: { "content-type": "image/png" } })));
    let state = createAgent({ name: "Rejection Agent", description: "A careful market observer", mode: "agent", handle: "@rejection_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "configureAssetProvider", provider: "tavily", label: "Tavily", hasSecret: true });
    saveProviderSecret(state.assetProviderConnections[0]!.id, "test-tavily-key");
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 market post and do not publish without a verified chart." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);
    expect((await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }))).ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    expect(result.assetResearchSessions).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId, outcome: "inspection_rejected", candidates: expect.arrayContaining([expect.objectContaining({ perception: expect.any(Object) })]) })]));
  });

  it("keeps an Assignment working through rejected candidates until a later candidate succeeds", async () => {
    const decision = (action: "post" | "no_op", text = "") => ({ action, text, rationale: action === "no_op" ? "This candidate is generic and not worth publishing." : "This later candidate is specific enough to publish." });
    vi.spyOn(ai, "generateAgentSocialDecision")
      .mockResolvedValueOnce(decision("no_op"))
      .mockResolvedValueOnce(decision("no_op"))
      .mockResolvedValueOnce(decision("no_op"))
      .mockResolvedValueOnce(decision("no_op"))
      .mockResolvedValueOnce(decision("post", "A concrete point of view is worth publishing when it changes the reader's next decision."));
    let state = createAgent({ name: "Loop Agent", description: "A thoughtful operator", mode: "agent", handle: "@loop_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original publication." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }));
    expect(response.ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    const assignment = result.assignments.find((item) => item.id === assignmentId);
    expect(assignment).toMatchObject({ status: "completed", progress: { verified: 1 }, rejectedCandidates: 2 });
    expect(assignment?.attemptHistory?.map((item) => item.outcome)).toEqual(["candidate_rejected", "candidate_rejected", "assignment_completed"]);
    expect(result.publications.some((item) => item.assignmentId === assignmentId)).toBe(true);
  });

  it("blocks transparently when the bounded effort budget is exhausted", async () => {
    vi.spyOn(ai, "generateAgentSocialDecision").mockResolvedValue({ action: "no_op", text: "", rationale: "No candidate meets the Presence's standard." });
    let state = createAgent({ name: "Bounded Agent", description: "A careful operator", mode: "agent", handle: "@bounded_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original publication." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);

    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }));
    expect(response.ok).toBe(true);
    const result = await waitForAssignment(assignmentId);
    const assignment = result.assignments.find((item) => item.id === assignmentId);
    expect(assignment).toMatchObject({ status: "blocked", progress: { verified: 0 }, rejectedCandidates: 4, work: { phase: "blocked", attempts: 4 } });
    expect(assignment?.lastOutcome?.class).toBe("assignment_blocked");
    expect(assignment?.lastOutcome?.message).toContain("bounded effort budget");
    expect(result.publications.some((item) => item.assignmentId === assignmentId)).toBe(false);
  });

  it("resets the bounded retry budget when an operator retries a blocked Assignment", () => {
    let state = createAgent({ name: "Retry Agent", description: "A careful operator", mode: "agent", handle: "@retry_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original publication." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    const blocked = state.assignments[0]!;
    blocked.status = "blocked";
    blocked.work = { ...(blocked.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", attempts: 4, storiesResearched: 4, blockedReason: "bounded effort exhausted" };
    const retried = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    expect(retried.assignments[0]).toMatchObject({ status: "active", work: { phase: "candidate_review", attempts: 0, storiesResearched: 0 } });
  });

  it("queues a fresh durable run after a bounded Assignment is blocked", async () => {
    vi.spyOn(ai, "generateAgentSocialDecision").mockResolvedValue({ action: "no_op", text: "", rationale: "No candidate meets the Presence's standard." });
    let state = createAgent({ name: "Fresh Run Agent", description: "A careful operator", mode: "agent", handle: "@fresh_run_agent", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original publication." });
    const assignmentId = state.assignments[0]!.id;
    state = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    writeState(state);

    const work = () => POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "workAssignment", id: assignmentId, sessionId }) }));
    expect((await work()).ok).toBe(true);
    const firstResult = await waitForAssignment(assignmentId);
    const firstRun = firstResult.assignmentRuns?.find((run) => run.assignmentId === assignmentId);
    expect(firstRun).toMatchObject({ status: "blocked", attempts: 4 });

    expect((await work()).ok).toBe(true);
    const secondQueued = readState();
    const runs = secondQueued.assignmentRuns?.filter((run) => run.assignmentId === assignmentId) ?? [];
    expect(runs).toHaveLength(2);
    expect(runs[0]?.id).not.toBe(firstRun?.id);
    expect(runs[0]).toMatchObject({ status: "queued", attempts: 0 });
    const secondResult = await waitForAssignment(assignmentId);
    expect(secondResult.assignmentRuns?.filter((run) => run.assignmentId === assignmentId).some((run) => run.status === "blocked")).toBe(true);
  });

  it("does not let background Playground clock sync strand a researching Assignment", async () => {
    let state = createAgent({ name: "Clock Guard Agent", description: "A careful operator", mode: "agent", handle: "@clock_guard", accent: "#D68754" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;
    state = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, sessionId, environment: "sandbox", instruction: "Produce exactly 1 original publication." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "startAssignment", id: assignment.id, sessionId });
    const stored = state.assignments.find((item) => item.id === assignment.id)!;
    stored.status = "active";
    stored.work = { ...(stored.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "researching" };
    writeState(state);
    const before = readState();
    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "syncPlaygroundTime", sessionId }) }));
    const payload = await response.json();
    expect(response.ok).toBe(true);
    expect(payload.workspaceRevision).toBe(before.workspaceRevision);
    expect(payload.assignments.find((item: { id: string }) => item.id === assignment.id)).toMatchObject({ status: "active", work: { phase: "researching" } });
    expect(readState().workspaceRevision).toBe(before.workspaceRevision);
  });
});
