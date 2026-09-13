import { describe, expect, it, vi } from "vitest";
import { hydrateOperatorNudgeSources, judgeOperatorNudgeTargets } from "../lib/autonomy-worker";
import { createOperatorNudge } from "../lib/operator-chat";
import { applyOperation, createAgent, recordNativeMirror } from "../lib/runtime";
import { saveProviderSecret } from "../lib/db";

const fixture = () => {
  const state = createAgent({ name: "Link Observer", description: "A careful social observer.", audience: "Builders", mode: "agent", handle: "@link_observer", accent: "#777777" });
  const presence = state.presence!;
  const created = createOperatorNudge(state, { presenceId: presence.id, content: "Interesting https://x.com/example/status/2092321194037195022" });
  return { state: created.state, presence, nudge: created.nudge };
};

describe("operator-shared X link observation", () => {
  it("uses public evidence when the authenticated single-post reader fails", async () => {
    const { state, presence, nudge } = fixture();
    state.nativeConnections.push({ id: "native-link", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const publicReader = vi.fn(async () => ({ id: "2092321194037195022", text: "A concrete public claim.", language: "en", authorUsername: "example", authorName: "Example", conversationId: "2092321194037195022" }));

    const result = await hydrateOperatorNudgeSources(state, presence.id, nudge, undefined, {
      credentials: { apiKey: "key", apiSecret: "secret" },
      native: vi.fn(async () => { throw new Error("X API credits are temporarily unavailable."); }),
      public: publicReader,
    });

    expect(publicReader).toHaveBeenCalledOnce();
    expect(result.availableTargetCount).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.state.mirrorObjects.find((item) => item.externalRef.id === "2092321194037195022")).toMatchObject({
      externalRef: { type: "x.post", id: "2092321194037195022" },
      content: { text: "A concrete public claim." },
      trust: "untrusted_world_content",
    });
  });

  it("does not let an unrelated reference with the same provider ID suppress post hydration", async () => {
    const { state, presence, nudge } = fixture();
    state.mirrorObjects.unshift({
      id: "unrelated-reference",
      bridgeId: "test",
      presenceId: presence.id,
      channelId: "x",
      externalRef: { type: "x.reply", id: "2092321194037195022" },
      objectType: "reply",
      content: { text: "Not the source post." },
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });
    const publicReader = vi.fn(async () => ({ id: "2092321194037195022", text: "The actual source post.", language: "en", authorUsername: "example", authorName: "Example" }));

    const result = await hydrateOperatorNudgeSources(state, presence.id, nudge, undefined, { public: publicReader });

    expect(publicReader).toHaveBeenCalledOnce();
    expect(result.availableTargetCount).toBe(1);
    expect(result.state.mirrorObjects.some((item) => item.externalRef.type === "x.post" && item.externalRef.id === "2092321194037195022")).toBe(true);
  });

  it("admits explicit operator evidence while preserving its provider language", async () => {
    const { state, presence, nudge } = fixture();
    const result = await hydrateOperatorNudgeSources(state, presence.id, nudge, undefined, {
      public: vi.fn(async () => ({ id: "2092321194037195022", text: "lmao", language: "ht", authorUsername: "example", authorName: "Example" })),
    });

    expect(result.availableTargetCount).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.state.mirrorObjects.find((item) => item.externalRef.id === "2092321194037195022")).toMatchObject({ language: "ht" });
  });

  it("inspects an attached X asset before targeted social judgment", async () => {
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const calls: Array<{ url: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("pbs.twimg.com")) return new Response(pixel, { status: 200, headers: { "content-type": "image/png" } });
      const isPerception = calls.at(-1)?.body?.includes("Inspect the attached social-media asset");
      const content = isPerception
        ? { observation: "A visual joke is visible.", interpretation: "The image carries the punchline.", uncertainty: "low" }
        : { acts: [], operatorReaction: "The joke is in the image, and it lands once you can actually see it.", rationale: "The inspected image carries the punchline; the text alone is insufficient." };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      let state = createAgent({ name: "Visual Observer", description: "A careful social observer.", audience: "Builders", mode: "agent", handle: "@visual_observer", accent: "#777777" });
      state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
      const connection = state.providerConnections.find((item) => item.provider === "openai");
      saveProviderSecret(connection!.id, "test-openai-key");
      state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low", vision: true });
      state = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "openai", model: "gpt-5.6-luna", connectionId: connection!.id });
      const presence = state.presence!;
      const postId = "2092321194037195022";
      state = recordNativeMirror(state, { connectionId: "operator-nudge:test", presenceId: presence.id, post: { id: postId, text: "I can't stop laughing.", authorUsername: "example", authorName: "Example", media: [{ mediaKey: "media-1", type: "photo", url: "https://pbs.twimg.com/media/joke.png" }] } }, { explicitOperatorEvidence: true });
      const created = createOperatorNudge(state, { presenceId: presence.id, content: `Please look at https://x.com/example/status/${postId}` });

      const judged = await judgeOperatorNudgeTargets(created.state, presence.id, created.nudge);
      expect(judged.perceptions[0]).toMatchObject({ providerId: "openai", level: "inspect", result: { observation: expect.any(String) } });
      expect(calls.some((call) => call.url.includes("pbs.twimg.com"))).toBe(true);
      const modelCall = calls.find((call) => call.url.includes("api.openai.com") && call.body?.includes("Judge the exact post"));
      expect(modelCall?.body).toContain("A visual joke is visible");
      expect(modelCall?.body).toContain("The image carries the punchline");
      expect(judged.socialDecisions[0]?.operatorReaction).toContain("image");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
