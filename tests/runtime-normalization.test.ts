import { describe, expect, it, vi } from "vitest";
import { deleteBridgeIdentity, readRuntimeHealthProjection, readStateSnapshot, writeState } from "../lib/db";
import { applyOperation, createAgent, initialState, isStateNormalized } from "../lib/runtime";

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

  it("reuses the normalized object after a successful durable write", () => {
    const created = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_test", accent: "#D68754" });
    try {
      writeState(created);
      readStateSnapshot();
      const next = applyOperation(readStateSnapshot(), { type: "setPresence", patch: {} });
      writeState(next);
      expect(readStateSnapshot()).toBe(next);
    } finally {
      writeState(initialState());
    }
  });

  it("serves health from the revision-matched compact projection after cache invalidation", () => {
    const created = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_test", accent: "#D68754" });
    try {
      writeState(created);
      // Bridge identity updates invalidate the full in-memory state cache but
      // do not change the canonical workspace revision. Health should keep
      // using its durable compact projection in that interval.
      deleteBridgeIdentity("bridge-not-present");
      const projection = readRuntimeHealthProjection(created.presence?.id);
      expect(projection.presences.map((presence) => presence.id)).toEqual([created.presence?.id]);
      expect(projection.nativeConnections).toEqual([]);
      expect(projection.executions).toEqual([]);
      expect(projection.assignments).toEqual([]);
    } finally {
      writeState(initialState());
    }
  });
});
