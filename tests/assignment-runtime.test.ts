import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/lib/ai";
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

describe("Sandbox assignment runtime", () => {
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
    const result = readState();
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
    const result = readState();
    const publication = result.publications.find((item) => item.assignmentId === assignmentId);
    const asset = publication?.assetIds[0] ? result.assets.find((item) => item.id === publication.assetIds[0]) : undefined;
    expect(result.assignments[0]).toMatchObject({ status: "completed", progress: { verified: 1 } });
    expect(asset).toMatchObject({ nature: "observed", provenance: { acquisitionProvider: "tavily", publisher: "Publisher", sourcePageUrl: "https://publisher.example/chart" }, storage: { mimeType: "image/png" } });
    expect(result.sourceEvidence.some((item) => item.assetIds.includes(asset!.id))).toBe(true);
    expect(result.assetUsages.some((item) => item.assetId === asset!.id && item.assignmentId === assignmentId)).toBe(true);
    expect(result.assetResearchSessions).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId, status: "selected", selectedCandidateId: expect.any(String), candidates: expect.arrayContaining([expect.objectContaining({ perception: expect.objectContaining({ visualForm: "chart" }) })]) })]));
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
    const result = readState();
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
    const result = readState();
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
