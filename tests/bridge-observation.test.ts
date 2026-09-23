import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeWithKey, ingestEvents, reportBridgeIdentity } from "../lib/bridge";
import { applyOperation, createAgent } from "../lib/runtime";
import { runAutonomousObservation } from "../lib/autonomy-worker";
import { listScheduledWakes, readState, writeState } from "../lib/db";
import * as browserChannelRead from "../lib/browser-channel-read";

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

  it("keeps ambient X timeline evidence from waking the inbound attention loop", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    writeState(bridgeResult.state);
    const bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    ingestEvents(bridge, { events: [{
      sourceEventId: "ambient-timeline-post-1",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "ambient-timeline-post-1" },
        objectType: "post",
        language: "en",
        author: { displayName: "Other Author", handle: "other_author" },
        content: { text: "A useful post from the timeline." },
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    expect(listScheduledWakes(state.presence!.id).filter((wake) => wake.kind === "attention" && wake.state === "pending")).toHaveLength(0);
    expect(readState().presence?.context.publicFooting?.recentInboundIds ?? []).not.toContain("ambient-timeline-post-1");
  });

  it("indexes a Bridge mention so the next attention pass can judge it without a native read", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    writeState(bridgeResult.state);
    const bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    ingestEvents(bridge, { events: [{
      sourceEventId: "mention-1",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "mention-1" },
        objectType: "post",
        language: "en",
        author: { displayName: "Maya", handle: "@maya", externalRef: { type: "x.user", id: "maya" } },
        content: { text: "Hey @example_agent, what are you building?" },
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    expect(readState().presence?.context.publicFooting?.recentInboundIds).toContain("mention-1");
    expect(listScheduledWakes(state.presence!.id).some((wake) => wake.kind === "attention" && wake.state === "pending")).toBe(true);
  });

  it("continues a Bridge mention into cognition when native X is unavailable", async () => {
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    const initial = createAgent({ name: "Genny", description: "Explain AI agents", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    initial.presence!.environment = "live";
    initial.presence!.connectionMode = "bridge";
    const state = applyOperation(initial, { type: "setPresence", patch: { execution: { ...initial.presence!.execution, reply: "auto" } } });
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    writeState(bridgeResult.state);
    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    ingestEvents(bridge, { events: [{
      sourceEventId: "cognition-mention-1",
      event: "created",
      object: {
        externalRef: { type: "x.post", id: "cognition-mention-1" },
        objectType: "post",
        language: "en",
        author: { displayName: "Maya", handle: "@maya", externalRef: { type: "x.user", id: "maya" } },
        content: { text: "Hey @example_agent, what makes an agent loop reliable?" },
        visibility: "public",
        shareability: "presence-only",
      },
    }] });

    const result = await runAutonomousObservation(state.presence!.id, { runId: "bridge-mention-run", invocationId: "bridge-mention-invocation" });
    expect(result.socialDecisions.some((decision) => decision.focalMirrorObjectIds.some((id) => result.mirrorObjects.find((mirror) => mirror.id === id)?.externalRef.id === "cognition-mention-1"))).toBe(true);
  });

  it("uses the authorized browser to observe when Native X billing is exhausted", async () => {
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    const initial = createAgent({ name: "Genny", description: "Notice useful founder patterns", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    initial.presence!.environment = "live";
    initial.presence!.browserAccess = { enabled: true };
    initial.presences = initial.presences.map((presence) => presence.id === initial.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge", browserAccess: { enabled: true } } : presence);
    const bridgeResult = createBridgeWithKey(initial, { type: "createBridge", input: { presenceId: initial.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: [], formats: [], metrics: [] } } });
    const state = bridgeResult.state;
    state.nativeConnections = [{ id: "billing-blocked-native", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "needs-attention", access: "read-write", account: { id: "genny-account", username: "example_agent", name: "Genny" }, deliveryError: "X has no API credits remaining for this app.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const browser = state.bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    browser.lastHeartbeatAt = new Date().toISOString();
    browser.lastSeenAt = browser.lastHeartbeatAt;
    browser.accountIdentity = { username: "example_agent", status: "verified", observedAt: browser.lastHeartbeatAt };
    writeState(state);
    vi.spyOn(browserChannelRead, "readChannelThroughBrowser").mockResolvedValue([{ id: "founder-pattern-1", text: "Founders keep returning to the cost of coordination.", authorUsername: "founder_one", authorName: "Founder One", language: "en", createdAt: new Date().toISOString() }]);

    const result = await runAutonomousObservation(state.presence!.id, { runId: "browser-observation-run", invocationId: "browser-observation-invocation" });

    expect(result.mirrorObjects.some((mirror) => mirror.externalRef.id === "founder-pattern-1")).toBe(true);
    expect(browserChannelRead.readChannelThroughBrowser).toHaveBeenCalledWith(expect.anything(), state.presence!.id);
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
