import { describe, expect, it } from "vitest";
import { shouldStartTemporalEngine } from "../instrumentation";

describe("temporal scheduler ownership", () => {
  it("does not start a second in-process owner under the server launcher", () => {
    expect(shouldStartTemporalEngine({ NODE_ENV: "production", OPENPRESENCE_EXTERNAL_SCHEDULER_OWNER: "1" })).toBe(false);
    expect(shouldStartTemporalEngine({ NODE_ENV: "development", OPENPRESENCE_EXTERNAL_SCHEDULER_OWNER: "1", OPENPRESENCE_ENABLE_TEMPORAL_ENGINE: "1" })).toBe(false);
  });

  it("keeps the standalone production fallback available", () => {
    expect(shouldStartTemporalEngine({ NODE_ENV: "production" })).toBe(true);
    expect(shouldStartTemporalEngine({ NODE_ENV: "development" })).toBe(false);
    expect(shouldStartTemporalEngine({ NODE_ENV: "development", OPENPRESENCE_ENABLE_TEMPORAL_ENGINE: "1" })).toBe(true);
  });
});
