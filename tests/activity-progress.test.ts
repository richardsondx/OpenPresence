import { describe, expect, it } from "vitest";
import { estimateActivityProgress } from "../lib/activity-progress";

describe("Activity progress estimate", () => {
  const start = "2026-08-25T12:00:00.000Z";

  it("moves visibly within a real stage without completing it", () => {
    const estimate = estimateActivityProgress({ stageIndex: 0, startedAt: start, stageStartedAt: start, now: Date.parse(start) + 60_000 });
    expect(estimate.percent).toBe(11);
    expect(estimate.timingLabel).toBe("Estimated 4–5 min remaining");
    expect(estimate.elapsedLabel).toBe("1m 00s elapsed");
  });

  it("uses durable stage changes as progress milestones", () => {
    const estimate = estimateActivityProgress({ stageIndex: 2, startedAt: start, stageStartedAt: "2026-08-25T12:02:00.000Z", now: Date.parse(start) + 150_000 });
    expect(estimate.percent).toBeGreaterThanOrEqual(50);
    expect(estimate.percent).toBeLessThan(75);
  });

  it("never implies completion when a stage runs long", () => {
    const estimate = estimateActivityProgress({ stageIndex: 3, startedAt: start, stageStartedAt: start, now: Date.parse(start) + 180_000 });
    expect(estimate.percent).toBeLessThan(100);
    expect(estimate.timingLabel).toBe("Taking longer than usual");
    expect(estimate.overdue).toBe(true);
  });

  it("shows 100 percent only for a completed outcome", () => {
    const estimate = estimateActivityProgress({ stageIndex: 3, startedAt: start, now: Date.parse(start) + 180_000, completed: true });
    expect(estimate.percent).toBe(100);
    expect(estimate.timingLabel).toBe("Complete");
  });
});
