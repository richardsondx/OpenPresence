import { describe, expect, it, vi } from "vitest";
import { compareDiscoveredAssets, inspectSandboxObject } from "../lib/perception-runtime";
import type { Asset } from "../lib/types";
import { saveProviderSecret } from "../lib/db";
import { addSandboxEvent, applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";
import { cognitionSafeThreadAssetSummary, createAssetPerception } from "../lib/perception";

describe("sandbox link perception", () => {
  it("releases declared Sandbox visual truth only through explicit inspection", async () => {
    let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_media_fixture", accent: "#D68754" }));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, {
      sessionId: session.id,
      actionId: "post",
      actorName: "Relevant Research",
      content: "A chart grounds this claim.",
      assets: [{
        name: "relevant-chart",
        kind: "chart",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        sandboxPerception: { observation: "A legible evidence chart is visible.", interpretation: "The visual directly supports the post's claim.", uncertainty: "low", visualForm: "chart", visualRole: "evidence", legibility: "clear", decorative: false },
      }],
    });
    const object = state.mirrorObjects[0]!;
    const asset = state.assets.find((item) => item.id === object.assetRefs?.[0]?.assetId)!;
    expect(state.perceptions.find((item) => item.assetId === asset.id)?.result.uncertainty).toBe("insufficient");
    expect(state.perceptions.find((item) => item.assetId === asset.id)?.result.visualRole).toBeUndefined();

    const inspected = await inspectSandboxObject(state, object, "inspect");
    const perception = inspected.perceptions.find((item) => item.assetId === asset.id && item.level === "inspect");
    expect(perception).toMatchObject({ providerId: "sandbox-fixture", modelId: "declared-observation", result: { visualForm: "chart", visualRole: "evidence", decorative: false, uncertainty: "low" } });
    expect(perception?.result.interpretation).toContain("supports");
  });

  it("labels quoted media with its owning author and social object", () => {
    const now = new Date().toISOString();
    const asset: Asset = { id: "quoted-asset", agentId: "agent", presenceId: "presence", type: "image", status: "ready", provenance: { origin: "native-x", sourceUrl: "https://pbs.twimg.com/media/demo.jpg", author: "edward40e", importedAt: now }, createdAt: now, updatedAt: now };
    const quoted = { id: "quoted-object", bridgeId: "native:x", presenceId: "presence", channelId: "x" as const, externalRef: { type: "x.post", id: "quoted-post" }, objectType: "post", author: { displayName: "Edward", handle: "@edward40e" }, assetRefs: [{ assetId: asset.id, kind: "image" as const }], observedAt: now, visibility: "public" as const, shareability: "presence-only" as const };
    const perception = createAssetPerception({ asset, presenceId: "presence", socialObjectId: quoted.id, level: "inspect", result: { observation: "A Pokémon game demo is visible.", uncertainty: "low" } });
    expect(cognitionSafeThreadAssetSummary([asset], [perception], [quoted], [quoted.id])).toContain("Media owned by Edward (@edward40e) on quoted/referenced post x.post:quoted-post");
  });

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

  it("does not inspect new media when Asset intelligence is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      let state = applyOperation(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }), { type: "setCapability", capabilityId: "asset-intelligence", enabled: false });
      state = startPlaygroundSession(state);
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya", content: "A media-bearing post.", assets: [{ name: "image", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] });
      const perceptionCountBeforeInspection = state.perceptions.length;
      const inspected = await inspectSandboxObject(state, state.mirrorObjects[0]!, "inspect");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(inspected.perceptions).toHaveLength(perceptionCountBeforeInspection);
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

  it("inspects live Mirror media through the same visual path as Sandbox media", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("gpt-5.6-luna");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ observation: "A chart is visible.", interpretation: "The image presents a visual claim that can be considered with the post text.", uncertainty: "medium" }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      let state = createAgent({ name: "Live Vision Agent", description: "Inspect live social evidence.", mode: "agent", handle: "@live_vision", accent: "#D68754" });
      state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
      const connection = state.providerConnections.find((item) => item.provider === "openai");
      saveProviderSecret(connection!.id, "test-openai-key");
      state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low", vision: true });
      state = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "openai", model: "gpt-5.6-luna", connectionId: connection!.id });
      state = startPlaygroundSession(state);
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Public author", content: "A live visual post.", assets: [{ name: "chart", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] });
      const sourceObject = state.mirrorObjects[0]!;
      const assetId = sourceObject.assetRefs?.[0]?.assetId;
      state = {
        ...state,
        mirrorObjects: state.mirrorObjects.map((item) => item.id === sourceObject.id ? { ...item, environment: "live", sessionId: undefined } : item),
        assets: state.assets.map((asset) => asset.id === assetId ? { ...asset, environment: "live", sessionId: undefined } : asset),
      };
      const inspected = await inspectSandboxObject(state, { ...sourceObject, environment: "live", sessionId: undefined }, "inspect");
      expect(inspected.perceptions[0]).toMatchObject({ environment: "live", socialObjectId: sourceObject.id, providerId: "openai" });
      expect(inspected.perceptions[0]?.result.observation).toContain("chart");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("compares a bounded preview batch in one multi-image request", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ judgments: [
        { id: "one", observation: "A line chart is visible.", interpretation: "It supports a trend claim.", uncertainty: "low", visualForm: "chart", visualRole: "evidence", legibility: "clear", decorative: false },
        { id: "two", observation: "A generic office photo is visible.", interpretation: "It does not support a data claim.", uncertainty: "low", visualForm: "photo", visualRole: "context", legibility: "clear", decorative: true },
      ], rankedAcceptableIds: ["one"], selectedCandidateId: "one", evidenceSummary: "The chart supports the trend claim." }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      let state = createAgent({ name: "Vision Agent", description: "Make evidence-led observations.", mode: "agent", handle: "@vision_agent", accent: "#D68754" });
      state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
      const connection = state.providerConnections.find((item) => item.provider === "openai");
      saveProviderSecret(connection!.id, "test-openai-key");
      state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low", vision: true });
      state = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "openai", model: "gpt-5.6-luna", connectionId: connection!.id });
      const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const makeAsset = (id: string): Asset => ({ id, agentId: state.agent!.id, type: "image", mediaKind: "image", status: "ready", dataUrl: pixel, provenance: { origin: "discovered", importedAt: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      const result = await compareDiscoveredAssets(state, [{ id: "one", asset: makeAsset("asset-one"), sourcePageUrl: "https://example.com/one", publisher: "Example" }, { id: "two", asset: makeAsset("asset-two"), sourcePageUrl: "https://example.com/two", publisher: "Example" }], { evidenceNeed: "Show a trend", visualBrief: "evidence chart" });
      expect(calls).toHaveLength(1);
      const messages = calls[0]?.messages as Array<{ role: string; content: Array<{ type: string }> }>;
      expect(messages[1]?.content.filter((part) => part.type === "image_url")).toHaveLength(2);
      expect(result).toMatchObject({ selectedCandidateId: "one", rankedAcceptableIds: ["one"], evidenceSummary: "The chart supports the trend claim." });
      expect(result.judgments.two.visualForm).toBe("photo");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
