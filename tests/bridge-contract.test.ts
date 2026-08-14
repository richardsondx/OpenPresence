import { describe, expect, it } from "vitest";
import { bridgeAdapterPrompt, bridgeAdapterStatus, bridgeAdapterStatusLabel } from "../lib/bridge-contract";

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
