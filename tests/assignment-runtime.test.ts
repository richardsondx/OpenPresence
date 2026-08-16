import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/lib/ai";
import * as perceptionRuntime from "@/lib/perception-runtime";
import { applyOperation, createAgent, startPlaygroundSession } from "@/lib/runtime";
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
