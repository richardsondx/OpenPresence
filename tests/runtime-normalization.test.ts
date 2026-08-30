import { describe, expect, it, vi } from "vitest";
import { applyOperation, initialState, isStateNormalized } from "../lib/runtime";

describe("runtime normalization boundary", () => {
  it("marks operation results as reusable only for the short transition window", () => {
    vi.useFakeTimers();
    try {
      const state = initialState();
      const next = applyOperation(state, { type: "setPresence", patch: {} });

      expect(isStateNormalized(next)).toBe(true);
      vi.advanceTimersByTime(1_001);
      expect(isStateNormalized(next)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
