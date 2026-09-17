import { describe, expect, it, vi } from "vitest";
import { captureSandboxWorld, restoreSandboxWorld, sandboxWorldDigest } from "../lib/sandbox-replay";
import { SandboxTemporalKernel } from "../lib/sandbox-temporal";
import { addSandboxEvent, applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";

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

  it("restores a checkpoint with its executable handler registry", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 0 });
    kernel.scheduleEvent({ id: "restore-parent", type: "parent", offsetMs: 10, handlerId: "restore-handler", handler: () => [{ type: "record", kind: "restored_effect" }] });
    const checkpoint = kernel.checkpoint("restore point");
    expect(() => kernel.restoreCheckpoint(checkpoint.id).advanceBy(10)).not.toThrow();
    expect(kernel.trajectory.some((item) => item.kind === "restored_effect")).toBe(true);
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

  it("captures Agent-owned executable work as part of the replayable world", () => {
    let state = createAgent({ name: "Replay Agent", description: "Replay proofs", audience: "builders", mode: "agent", handle: "@replay_agent", accent: "#aa7744" });
    state = startPlaygroundSession(state, state.presence!.id, "fresh", "assignment-replay");
    const session = state.playgroundSessions[0]!;
    state = applyOperation(state, { type: "createAssignment", presenceId: session.presenceId, sessionId: session.id, environment: "sandbox", createdBy: "agent", instruction: "Keep testing the durable replay path." });
    const assignment = state.assignments.find((item) => item.sessionId === session.id);
    expect(assignment).toBeDefined();
    const checkpoint = captureSandboxWorld(state, session.id);
    expect(checkpoint.collections.assignments).toHaveLength(2);
    expect(checkpoint.collections.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ instruction: "Keep testing the durable replay path." })]));

    const other = startPlaygroundSession(state, state.presence!.id, "fresh", "other-world");
    const restored = restoreSandboxWorld(other, checkpoint);
    expect(restored.assignments.filter((item) => item.sessionId === session.id)).toHaveLength(2);
    expect(restored.assignments.filter((item) => item.sessionId === other.playgroundSessions[0]!.id)).toHaveLength(1);
  });

  it("uses a seed for reproducible Sandbox clock and actor identities", () => {
    try {
      vi.setSystemTime(new Date("2031-04-01T12:00:00.000Z"));
      const firstState = startPlaygroundSession(createAgent({ name: "Replay Agent", description: "Replay proofs", audience: "builders", mode: "agent", handle: "@replay_agent", accent: "#aa7744" }), undefined, "fresh", "same-seed");
      vi.setSystemTime(new Date("2031-04-01T12:00:17.000Z"));
      const secondState = startPlaygroundSession(createAgent({ name: "Replay Agent", description: "Replay proofs", audience: "builders", mode: "agent", handle: "@replay_agent", accent: "#aa7744" }), undefined, "fresh", "same-seed");
      const first = addSandboxEvent(firstState, { sessionId: firstState.playgroundSessions[0]!.id, actorName: "Maya", content: "same input" });
      const second = addSandboxEvent(secondState, { sessionId: secondState.playgroundSessions[0]!.id, actorName: "Maya", content: "same input" });
      expect(first.playgroundSessions[0]!.virtualNow).toBe(second.playgroundSessions[0]!.virtualNow);
      expect(first.assignments.find((item) => item.origin === "publishing_initiative")?.id).toBe(second.assignments.find((item) => item.origin === "publishing_initiative")?.id);
      expect(first.assignments.find((item) => item.origin === "publishing_initiative")?.createdAt).toBe(second.assignments.find((item) => item.origin === "publishing_initiative")?.createdAt);
      expect(first.sandboxActors[0]!.id).toBe(second.sandboxActors[0]!.id);
      expect(first.mirrorObjects[0]!.externalRef.id).toBe(second.mirrorObjects[0]!.externalRef.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps concurrent sessions with the same seed identity-isolated", () => {
    let state = startPlaygroundSession(createAgent({ name: "Replay Agent", description: "Replay proofs", audience: "builders", mode: "agent", handle: "@replay_agent", accent: "#aa7744" }), undefined, "fresh", "same-seed-concurrent");
    const firstSession = state.playgroundSessions[0]!;
    state = startPlaygroundSession(state, state.presence!.id, "fresh", "same-seed-concurrent");
    const secondSession = state.playgroundSessions.find((item) => item.id !== firstSession.id)!;

    state = addSandboxEvent(state, { sessionId: firstSession.id, actorName: "Maya A", content: "first session marker" });
    state = addSandboxEvent(state, { sessionId: secondSession.id, actorName: "Maya B", content: "second session marker" });

    const firstObject = state.mirrorObjects.find((item) => item.sessionId === firstSession.id)!;
    const secondObject = state.mirrorObjects.find((item) => item.sessionId === secondSession.id)!;
    expect(firstObject.content!.text).toBe("first session marker");
    expect(secondObject.content!.text).toBe("second session marker");
    expect(firstObject.id).not.toBe(secondObject.id);
    expect(firstObject.externalRef.id).not.toBe(secondObject.externalRef.id);
    expect(firstObject.author!.externalRef!.id).not.toBe(secondObject.author!.externalRef!.id);
    expect(state.assignments.filter((item) => item.sessionId === firstSession.id)).toHaveLength(1);
    expect(state.assignments.filter((item) => item.sessionId === secondSession.id)).toHaveLength(1);
  });
});
