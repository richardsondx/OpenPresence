import { describe, expect, it } from "vitest";
import { boundedInterval, browserBridgeIntervals } from "../scripts/x-browser-bridge-config.mjs";

describe("X Browser Bridge polling budget", () => {
  it("checks mentions more often than discovery and metrics by default", () => {
    const intervals = browserBridgeIntervals({});
    expect(intervals.mentionObserveMs).toBe(5_000);
    expect(intervals.discoveryObserveMs).toBe(30_000);
    expect(intervals.mentionObserveMs).toBeLessThan(intervals.discoveryObserveMs);
  });

  it("bounds overrides so the bridge cannot busy-loop or stop polling", () => {
    const intervals = browserBridgeIntervals({
      BRIDGE_POLL_MS: "1",
      X_BROWSER_MENTION_OBSERVE_MS: "1",
      X_BROWSER_DISCOVERY_OBSERVE_MS: "999999999",
    });
    expect(intervals.pollMs).toBe(250);
    expect(intervals.mentionObserveMs).toBe(5_000);
    expect(intervals.discoveryObserveMs).toBe(300_000);
    expect(boundedInterval("not-a-number", 42, 1, 100)).toBe(42);
  });
});
