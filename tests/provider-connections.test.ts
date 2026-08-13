import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAgentReply } from "../lib/ai";
import { saveProviderSecret } from "../lib/db";
import { applyOperation, createAgent } from "../lib/runtime";

afterEach(() => vi.unstubAllGlobals());

describe("provider connections", () => {
  it("routes OpenRouter through its OpenAI-compatible endpoint", async () => {
    let state = createAgent({ name: "Ada", description: "Explain reliable AI agents.", mode: "agent", handle: "@ada", accent: "#D68754" });
    state = applyOperation(state, { type: "configureProvider", provider: "openrouter", label: "Renamed router", hasSecret: true });
    const connection = state.providerConnections.find((item) => item.provider === "openrouter");
    expect(connection).toMatchObject({ label: "OpenRouter", endpoint: undefined });
    saveProviderSecret(connection!.id, "test-openrouter-key");
    state = applyOperation(state, { type: "setModel", provider: "openrouter", model: "openrouter/auto", quality: "medium" });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ choices: [{ message: { content: "OpenRouter answered through the shared runtime." } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    await expect(generateAgentReply(state, "Say hello.")).resolves.toBe("OpenRouter answered through the shared runtime.");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body)).model).toBe("openrouter/auto");
  });
});
