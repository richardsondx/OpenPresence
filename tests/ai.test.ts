import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAgentReply, generateAgentSocialDecision, generatePresenceChatReply, parseAgentSocialDecision, parseAgentSocialEdit, parseAgentSocialJudgment } from "../lib/ai";
import { saveProviderSecret } from "../lib/db";
import { applyOperation, createAgent } from "../lib/runtime";

describe("Agent social decision parsing", () => {
  it("accepts structured affordance decisions", () => {
    expect(parseAgentSocialDecision('{"action":"quote","text":"The denominator is the story.","rationale":"Adds a distinct point."}', ["post", "quote", "no_op"])).toEqual({ action: "quote", text: "The denominator is the story.", rationale: "Adds a distinct point." });
  });

  it("normalizes silence and rejects unsupported actions", () => {
    expect(parseAgentSocialDecision("NO_OP", ["post", "no_op"])).toMatchObject({ action: "no_op", text: "" });
    expect(parseAgentSocialDecision('{"action":"message","text":"secret"}', ["post", "reply", "no_op"])).toMatchObject({ action: "no_op", text: "" });
    expect(parseAgentSocialDecision('{"action":"clarify","text":"What evidence is missing?"}', ["reply", "clarify", "no_op"])).toEqual({ action: "clarify", text: "What evidence is missing?" });
  });

  it("does not turn an unstructured provider response into a public action", () => {
    expect(parseAgentSocialDecision("Ada (reply): That is worth exploring.", ["reply", "post", "no_op"])).toMatchObject({ action: "no_op", text: "" });
  });

  it("uses structured deterministic social fixtures in local mock mode", async () => {
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    const state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    await expect(generateAgentSocialDecision(state, "Consider an original publication for the current simulated X world.", ["post", "no_op"])).resolves.toMatchObject({
      action: "post",
      text: expect.stringContaining("decision"),
    });
  });

  it("recovers a decision when a local model emits literal newlines inside JSON text", () => {
    const raw = '{"action":"post","text":"A calendar grants permission, not obligation.\nSilence can be the useful choice.","rationale":"Uses a concrete source detail."}';
    expect(parseAgentSocialDecision(raw, ["post", "no_op"])).toEqual({ action: "post", text: "A calendar grants permission, not obligation.\nSilence can be the useful choice.", rationale: "Uses a concrete source detail." });
  });

  it("parses an observable social perception without treating it as hidden reasoning", () => {
    expect(parseAgentSocialJudgment(JSON.stringify({
      speechAct: "direct assessment request",
      responseNeed: "ask for the missing product evidence",
      newInformation: "no product details supplied",
      relationshipStage: "fresh request",
      evidence: ["The post asks for a rating.", "No product or customer evidence is present."],
      recommendedAction: "reply",
      confidence: "high",
    }), ["reply", "no_op"])).toEqual({
      speechAct: "direct assessment request",
      responseNeed: "ask for the missing product evidence",
      newInformation: "no product details supplied",
      relationshipStage: "fresh request",
      evidence: ["The post asks for a rating.", "No product or customer evidence is present."],
      recommendedAction: "reply",
      confidence: "high",
    });
  });

  it("allows an editor to refine wording only for the planner's selected act", () => {
    expect(parseAgentSocialEdit('{"status":"ok","action":"reply","text":"A grounded reply.","rationale":"Tightened the wording."}', "reply")).toEqual({
      status: "ok",
      action: "reply",
      text: "A grounded reply.",
      rationale: "Tightened the wording.",
    });
  });

  it("requires a concrete contradiction before an editor can request replanning", () => {
    expect(parseAgentSocialEdit('{"status":"needs_replan","action":"reply","text":"","rationale":"I changed my mind."}', "reply")).toBeUndefined();
    expect(parseAgentSocialEdit('{"status":"needs_replan","action":"reply","text":"","contradiction":"The supplied Social Mirror shows the requested person is not the author being addressed."}', "reply")).toEqual({
      status: "needs_replan",
      action: "reply",
      text: "",
      contradiction: "The supplied Social Mirror shows the requested person is not the author being addressed.",
    });
  });

  it("does not carry the operator Chat transcript into social cognition", async () => {
    let state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    state.providerConnections.push({ id: "ollama-test", provider: "ollama", label: "Ollama", status: "local", endpoint: "http://ollama.test", createdAt: new Date().toISOString() });
    state = applyOperation(state, { type: "setModel", provider: "ollama", model: "glm-5.2:cloud", vision: false });
    state.conversations[0]!.messages.push({ id: "operator-private", role: "operator", content: "Private operator transcript that must not enter a public social decision.", timestamp: new Date().toISOString() });
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url, body });
      if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "glm-5.2:cloud", capabilities: ["completion"] }] }), { status: 200 });
      return new Response(JSON.stringify({ message: { content: '{"action":"no_op","text":"","rationale":"No public action."}' } }), { status: 200 });
    }));
    await generateAgentSocialDecision(state, "Evaluate this simulated post and choose an action.", ["reply", "no_op"]);
    const chatCall = calls.find((call) => call.url.endsWith("/api/chat"));
    expect(JSON.stringify(chatCall?.body)).not.toContain("Private operator transcript");
    expect((chatCall?.body?.messages as unknown[])).toHaveLength(2);
    const system = String((chatCall?.body?.messages as Array<{ role: string; content: string }>)[0]?.content ?? "");
    expect(system).toContain("A draft that could be pasted into any AI account is a failed draft.");
    expect(system).not.toContain("Live Presence snapshot");
    expect(system).toContain('"BRAIN"');
    expect(system).toContain("Low-information social cues are context-dependent.");
    expect(state.files.find((file) => file.kind === "BRAIN")?.content).toContain("Never expand a one-character cue into an assistant-style onboarding prompt");
  });

  it("uses the selected Presence public self with session history only", async () => {
    let state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    state.providerConnections.push({ id: "ollama-presence-chat", provider: "ollama", label: "Ollama", status: "local", endpoint: "http://ollama.test", createdAt: new Date().toISOString() });
    state = applyOperation(state, { type: "setModel", provider: "ollama", model: "glm-5.2:cloud", vision: false });
    const presence = state.presences[0]!;
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url, body });
      if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "glm-5.2:cloud", capabilities: ["completion"] }] }), { status: 200 });
      return new Response(JSON.stringify({ message: { content: "Ada answered from the public self." } }), { status: 200 });
    }));
    await expect(generatePresenceChatReply(state, presence.id, "What should I notice next?", [
      { role: "presence", content: "Start with the evidence." },
      { role: "user", content: "I am listening." },
    ], "The attached chart was not inspected.")).resolves.toBe("Ada answered from the public self.");
    const chatCall = calls.find((call) => call.url.endsWith("/api/chat"));
    const messages = chatCall?.body?.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(4);
    expect(messages[1]).toEqual({ role: "assistant", content: "Start with the evidence." });
    expect(messages[2]).toEqual({ role: "user", content: "I am listening." });
    expect(messages[3]).toEqual({ role: "user", content: "What should I notice next?" });
    expect(messages[0]?.content).toContain("This is a private test conversation with the Presence's public self");
    expect(messages[0]?.content).toContain("The attached chart was not inspected.");
    expect(messages[0]?.content).not.toContain("Private operator transcript");
  });

  it("keeps Teach person-shaped and does not invite generic onboarding for a short cue", async () => {
    let state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
    const connection = state.providerConnections.find((item) => item.provider === "openai");
    saveProviderSecret(connection!.id, "test-openai-key");
    state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low" });
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "A provider answer." } }] }), { status: 200 });
    }));
    await expect(generateAgentReply(state, "What should I change?")).resolves.toBe("A provider answer.");
    const system = String((body?.messages as Array<{ role: string; content: string }>)[0]?.content ?? "");
    expect(system).toContain("This is Teach: a conversation with the Agent's private mind");
    expect(system).toContain("Do not introduce yourself as an AI assistant");
    expect(system).toContain("never invent a topic or expand it into a help menu");
  });

  it("sends GPT-5.6 Luna directly with the selected reasoning effort", async () => {
    let state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
    const connection = state.providerConnections.find((item) => item.provider === "openai");
    saveProviderSecret(connection!.id, "test-openai-key");
    state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "medium" });
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "Luna answered through the shared runtime." } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    await expect(generateAgentReply(state, "Say hello.")).resolves.toBe("Luna answered through the shared runtime.");
    expect(body?.model).toBe("gpt-5.6-luna");
    expect(body?.reasoning_effort).toBe("medium");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
