import { describe, expect, it } from "vitest";
import { captureSandboxWorld, restoreSandboxWorld, sandboxWorldDigest } from "../lib/sandbox-replay";
import { SandboxTemporalKernel } from "../lib/sandbox-temporal";
import { addSandboxEvent, createAgent, startPlaygroundSession } from "../lib/runtime";

describe("Workstream A deterministic replay contract", () => {
  it("does not expose delayed truth before its causal event", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 1_000 });
    const cause = kernel.scheduleEvent({ id: "cause", type: "delivery", offsetMs: 10 });
    kernel.scheduleDelayedOutcome({ id: "hidden-consequence", causeEventId: cause.id, offsetMs: 20, value: { qualifiedFollowers: 9 } });

    kernel.advanceBy(15);
    expect(kernel.outcomes[0]).toMatchObject({ id: "hidden-consequence", status: "scheduled" });
    expect(kernel.outcomes[0]).not.toHaveProperty("value");

    kernel.advanceBy(5);
    expect(kernel.outcomes[0]).toMatchObject({ status: "recorded", value: { qualifiedFollowers: 9 }, recordedAt: 1_020 });
  });

  it("keeps pause and acceleration metadata truthful", () => {
    const kernel = new SandboxTemporalKernel({ accelerationFactor: 2 });
    kernel.pause();
    expect(kernel.tick(100)).toMatchObject({ from: 0, to: 0 });
    expect(kernel.acceleration).toMatchObject({ factor: 2, virtualElapsedMs: 0 });
    kernel.setAcceleration(2, "manual");
    expect(kernel.acceleration.mode).toBe("accelerated");
  });

  it("preserves checkpoint numbering and registered handler effects after rehydration", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 0 });
    kernel.scheduleEvent({ id: "parent", type: "parent", offsetMs: 10, handlerId: "append-child", handler: () => [{ type: "schedule", event: { id: "child", type: "child", offsetMs: 1 } }] });
    const first = kernel.checkpoint("before replay");
    const restored = SandboxTemporalKernel.fromSnapshot(kernel.snapshot(), { "append-child": () => [{ type: "schedule", event: { id: "child", type: "child", offsetMs: 1 } }] });
    expect(restored.checkpoint("after rehydrate").id).toBe("checkpoint-2");
    restored.advanceBy(11);
    expect(restored.events.find((event) => event.id === "child")?.status).toBe("fired");
    expect(first.id).toBe("checkpoint-1");
    expect(() => SandboxTemporalKernel.fromSnapshot(kernel.snapshot())).toThrow(/requires replay handler/);
  });

  it("captures and restores the complete session-scoped world without touching another session", () => {
    let state = createAgent({ name: "Replay Agent", description: "Replay proofs", audience: "builders", mode: "agent", handle: "@replay_agent", accent: "#aa7744" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh", "sbx-a-003");
    const first = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: first.id, actionId: "post", actorName: "Maya", content: "A causal world observation with a known replay seed." });
    const checkpoint = captureSandboxWorld(state, first.id);
    const mutated = addSandboxEvent(state, { sessionId: first.id, actionId: "post", actorName: "Maya", content: "A later branch that should disappear on restore." });
    const restored = restoreSandboxWorld(mutated, checkpoint);
    const replay = captureSandboxWorld(restored, first.id);
    expect(sandboxWorldDigest(replay)).toBe(checkpoint.digest);
    expect(replay.collections.mirrorObjects).toHaveLength(1);
    expect(replay.session.seed).toBe("sbx-a-003");
  });
});
