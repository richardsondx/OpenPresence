import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeWithKey, ingestEvents, reportBridgeIdentity } from "../lib/bridge";
import { createAgent } from "../lib/runtime";
import { readState, writeState } from "../lib/db";

afterEach(() => vi.unstubAllEnvs());

describe("Bridge world-observation authorship", () => {
  it("keeps Chrome-observed quote media attached to the quoted author", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    writeState(bridgeResult.state);
    const bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    ingestEvents(bridge, { events: [{
      sourceEventId: "quoted-post-with-image",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "quoted-post" },
        objectType: "post",
        language: "en",
        author: { displayName: "Edward", handle: "@edward40e" },
        content: { text: "The project and its attached demo." },
        media: [{ sourceUrl: "https://pbs.twimg.com/media/demo.jpg", kind: "image", altText: "Project demo" }],
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    const persisted = readState();
    const quoted = persisted.mirrorObjects.find((item) => item.externalRef.id === "quoted-post")!;
    const asset = persisted.assets.find((item) => item.id === quoted.assetRefs?.[0]?.assetId);
    expect(asset).toMatchObject({ provenance: { author: "@edward40e", sourcePageUrl: "https://x.com/edward40e/status/quoted-post" } });
  });

  it("keeps an observed external X post eligible for the Agent's attention", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["repost"], formats: ["x.repost"], metrics: [] } } });
    writeState(bridgeResult.state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    ingestEvents(bridge, { events: [{
      sourceEventId: "external-post-1",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "external-post-1" },
        objectType: "post",
        language: "en",
        author: { displayName: "Interesting author", handle: "interesting_author" },
        content: { text: "A standalone idea worth passing along." },
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    const observed = readState().mirrorObjects.find((item) => item.externalRef.id === "external-post-1");
    expect(observed).toMatchObject({ objectType: "post", author: { handle: "interesting_author" } });
    expect(observed?.actorPresenceId).toBeUndefined();
  });

  it("attributes an observed post to the Presence only when its author matches", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["repost"], formats: ["x.repost"], metrics: [] } } });
    writeState(bridgeResult.state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    ingestEvents(bridge, { events: [{
      sourceEventId: "own-post-1",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "own-post-1" },
        objectType: "post",
        language: "en",
        author: { displayName: "Genny", handle: "@example_agent" },
        content: { text: "A post from Genny." },
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    const observed = readState().mirrorObjects.find((item) => item.externalRef.id === "own-post-1");
    expect(observed?.actorPresenceId).toBe(state.presence!.id);
  });
});
