import { describe, expect, it, vi } from "vitest";
import { inspectSandboxObject } from "../lib/perception-runtime";
import { saveProviderSecret } from "../lib/db";
import { addSandboxEvent, applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";

describe("sandbox link perception", () => {
  it("retrieves shallow public provenance instead of treating a URL as evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html><head><title>Keystone proof</title><meta name=\"description\" content=\"Deterministic replay and tamper rejection.\"></head><body>Proof details</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }));
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Digitalfrontierlab", content: "A proof link.", assets: [{ name: "proof", kind: "link", sourceUrl: "https://example.com/keystone" }] });
      const object = state.mirrorObjects[0]!;
      const inspected = await inspectSandboxObject(state, object, "inspect");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(inspected.perceptions[0]?.providerId).toBe("sandbox-link");
      expect(inspected.perceptions[0]?.result.observation).toContain("Keystone proof");
      expect(inspected.perceptions[0]?.result.interpretation).toContain("tamper rejection");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not fetch private or local link destinations", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }));
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya", content: "A local link.", assets: [{ name: "local", kind: "link", sourceUrl: "http://127.0.0.1:3000/private" }] });
      const inspected = await inspectSandboxObject(state, state.mirrorObjects[0]!, "inspect");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(inspected.perceptions[0]?.result.uncertainty).toBe("insufficient");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a GPT-5.6-compatible normalized media request with provenance", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ observation: "A simple image is visible.", interpretation: "No social meaning can be established from this image alone.", uncertainty: "medium", missingContext: ["The surrounding thread remains the stronger context."] }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      let state = createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
      state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
      const connection = state.providerConnections.find((item) => item.provider === "openai");
      saveProviderSecret(connection!.id, "test-openai-key");
      state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low", vision: true });
      state = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "openai", model: "gpt-5.6-luna", connectionId: connection!.id });
      state = startPlaygroundSession(state);
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya", content: "An image needs a careful read.", assets: [{ name: "image", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] });
      const inspected = await inspectSandboxObject(state, state.mirrorObjects[0]!, "inspect");
      const body = calls[0]?.body;
      expect(calls[0]?.url).toContain("/chat/completions");
      expect(body?.model).toBe("gpt-5.6-luna");
      expect(body?.reasoning_effort).toBe("low");
      expect(body?.temperature).toBeUndefined();
      expect(body?.response_format).toBeUndefined();
      const messages = body?.messages as Array<{ role: string; content: Array<{ type: string; image_url?: { url: string } }> }>;
      expect(messages[1]?.content[1]?.image_url?.url).toMatch(/^data:image\/png;base64,/);
      expect(inspected.perceptions[0]).toMatchObject({ providerId: "openai", modelId: "gpt-5.6-luna", level: "inspect" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
