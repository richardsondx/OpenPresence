import { describe, expect, it } from "vitest";
import { bridgeAdapterPrompt, bridgeAdapterStatus, bridgeAdapterStatusLabel, chromeBrowserBridgeCapabilities } from "../lib/bridge-contract";

describe("Bridge adapter contract", () => {
  const connectedAt = new Date("2026-08-14T12:00:00.000Z");

  it("distinguishes waiting, connected, stale, and disconnected adapters", () => {
    const now = connectedAt.getTime();
    expect(bridgeAdapterStatus({ state: "online" }, now)).toBe("waiting");
    expect(bridgeAdapterStatus({ state: "online", lastHeartbeatAt: connectedAt.toISOString() }, now + 30_000)).toBe("connected");
    expect(bridgeAdapterStatus({ state: "online", lastHeartbeatAt: connectedAt.toISOString() }, now + 5 * 60_000)).toBe("stale");
    expect(bridgeAdapterStatus({ state: "offline", lastHeartbeatAt: connectedAt.toISOString() }, now)).toBe("disconnected");
    expect(bridgeAdapterStatusLabel("waiting")).toContain("waiting for adapter");
  });

  it("does not treat recent channel activity as a live adapter heartbeat", () => {
    const now = Date.now();
    expect(bridgeAdapterStatus({ state: "online", lastSeenAt: new Date(now).toISOString() }, now)).toBe("waiting");
    expect(bridgeAdapterStatus({ state: "online", lastHeartbeatAt: new Date(now - 5 * 60_000).toISOString(), lastSeenAt: new Date(now).toISOString() }, now)).toBe("stale");
  });

  it("keeps the shipped Chrome adapter capability-scoped", () => {
    expect(chromeBrowserBridgeCapabilities()).toMatchObject({
      affordances: ["reply", "quote", "repost", "like"],
      formats: ["x.reply", "x.quote", "x.repost", "x.like"],
      metrics: ["followers", "public_metrics"],
    });
  });

  it("generates a channel-aware prompt without a credential", () => {
    const prompt = bridgeAdapterPrompt({
      baseUrl: "http://localhost:3242",
      presence: { name: "Skool Agent", handle: "@skool_agent", channel: "skool" },
      channelName: "Skool",
      channelDomain: "https://www.skool.com/",
      capabilities: { inbound: true, reconcile: true, affordances: ["post", "comment", "like"], formats: ["skool.text-post"], metrics: [], assetKinds: [] },
    });
    expect(prompt).toContain("Skool Agent");
    expect(prompt).toContain("UNSUPPORTED_ASSET");
    expect(prompt).toContain("OPENPRESENCE_BRIDGE_KEY=<provide securely");
    expect(prompt).not.toContain("opb_");
    expect(prompt).toContain("claim approved work");
  });
});
