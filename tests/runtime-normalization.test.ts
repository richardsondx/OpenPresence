import { describe, expect, it, vi } from "vitest";
import { deleteBridgeIdentity, readRuntimeHealthProjection, readStateSnapshot, writeState } from "../lib/db";
import { applyOperation, createAgent, initialState, isStateNormalized, recordResourceUsageEvent, recordResourceUsageEventInPlace } from "../lib/runtime";

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

  it("keeps the public usage helper immutable while allowing private connector batches to append in place", () => {
    const state = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_usage", accent: "#D68754" });
    const input = { presenceId: state.presence!.id, invocationId: "usage:test", originKind: "inbound_social" as const, attentionSource: "inbound_social" as const, category: "channel_read" as const, provider: "x" as const, usage: { requests: 1 } };

    const copied = recordResourceUsageEvent(state, input);
    expect(state.resourceUsageEvents).toHaveLength(0);
    expect(copied.resourceUsageEvents).toHaveLength(1);

    const working = structuredClone(state);
    const returned = recordResourceUsageEventInPlace(working, input);
    expect(returned).toBe(working);
    expect(working.resourceUsageEvents).toHaveLength(1);
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

  it("rehydrates social intents from the indexed projection after cache invalidation", () => {
    const created = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_social_intent", accent: "#D68754" });
    const formedAt = new Date().toISOString();
    created.socialIntents = [{
      id: "social-intent-normalization-test",
      agentId: created.agent!.id,
      presenceId: created.presence!.id,
      affordance: "x.reply",
      target: { type: "x.post", id: "social-intent-target" },
      priority: 1,
      validity: {},
      state: "active",
      formedAt,
      updatedAt: formedAt,
    }];
    try {
      writeState(created);
      deleteBridgeIdentity("bridge-not-present");
      const rehydrated = readStateSnapshot();
      expect(rehydrated.socialIntents).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "social-intent-normalization-test", affordance: "x.reply" }),
      ]));
    } finally {
      writeState(initialState());
    }
  });

  it("rehydrates operator events from the indexed projection after cache invalidation", () => {
    const created = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_event", accent: "#D68754" });
    created.events = [{
      id: "event-normalization-test",
      type: "system",
      title: "Indexed event",
      detail: "This event remains available after the compatibility field is projected out.",
      time: new Date().toISOString(),
      tone: "positive",
      presenceId: created.presence!.id,
    }];
    try {
      writeState(created);
      deleteBridgeIdentity("bridge-not-present");
      const rehydrated = readStateSnapshot();
      expect(rehydrated.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "event-normalization-test", title: "Indexed event" }),
      ]));
    } finally {
      writeState(initialState());
    }
  });
});
