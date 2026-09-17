import { describe, expect, it } from "vitest";
import {
  advanceSandboxTimeWithTemporalEvents,
  cloneState,
  createAgent,
  resetPlaygroundSession,
  setSandboxAcceleration,
  setSandboxPaused,
  startPlaygroundSession,
} from "../lib/runtime";
import { SandboxTemporalKernel } from "../lib/sandbox-temporal";

function fixtureState() {
  return createAgent({
    name: "Temporal integration fixture",
    description: "A deterministic Playground integration fixture.",
    audience: "test operators",
    mode: "agent",
    handle: "@temporal_fixture",
    accent: "#7c3aed",
  });
}

describe("Playground temporal integration boundary", () => {
  it("exposes acceleration and pause controls through the persisted session boundary", () => {
    let state = startPlaygroundSession(fixtureState());
    const session = state.playgroundSessions[0]!;
    state = setSandboxAcceleration(state, session.id, 24);
    expect(state.playgroundSessions[0]!.temporalSnapshot?.acceleration.factor).toBe(24);
    state = setSandboxPaused(state, session.id, true);
    expect(state.playgroundSessions[0]!.status).toBe("paused");
    expect(state.playgroundSessions[0]!.temporalSnapshot?.paused).toBe(true);
    state = setSandboxPaused(state, session.id, false);
    expect(state.playgroundSessions[0]!.status).toBe("active");
    expect(state.playgroundSessions[0]!.temporalSnapshot?.paused).toBe(false);
  });

  it("round-trips a queued event and trajectory through the persisted session shape", () => {
    let state = startPlaygroundSession(fixtureState());
    const session = state.playgroundSessions[0]!;
    const initialNow = Date.parse(session.virtualNow);
    const kernel = SandboxTemporalKernel.fromSnapshot(session.temporalSnapshot!);
    const queued = kernel.scheduleEvent({
      id: "integration:marker",
      type: "integration_marker",
      at: initialNow + 60_000,
      payload: { source: "isolated-contract-test" },
    });

    state = {
      ...state,
      playgroundSessions: state.playgroundSessions.map((item) =>
        item.id === session.id ? { ...item, temporalSnapshot: kernel.snapshot() } : item,
      ),
    };

    const advanced = advanceSandboxTimeWithTemporalEvents(state, session.id, 2);
    const advancedSession = advanced.state.playgroundSessions.find((item) => item.id === session.id)!;
    const snapshot = advancedSession.temporalSnapshot!;

    expect(advanced.processed).toEqual([expect.objectContaining({ id: queued.id, status: "fired" })]);
    expect(advancedSession.virtualTimeMode).toBe("manual");
    expect(snapshot.now).toBe(Date.parse(advancedSession.virtualNow));
    expect(snapshot.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: queued.id, status: "fired" })]));
    expect(snapshot.trajectory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "event_fired", eventId: queued.id }),
    ]));

    const persistedState = cloneState(JSON.parse(JSON.stringify(advanced.state)));
    const persistedSession = persistedState.playgroundSessions.find((item) => item.id === session.id)!;
    expect(persistedSession.temporalSnapshot).toEqual(snapshot);
    expect(SandboxTemporalKernel.fromSnapshot(persistedSession.temporalSnapshot!).now).toBe(snapshot.now);
  });

  it("persists checkpoint branch points and can fork after process rehydration", () => {
    const kernel = new SandboxTemporalKernel({ startAt: Date.parse("2026-01-01T00:00:00.000Z") });
    kernel.scheduleEvent({ id: "integration:branch-marker", type: "integration_marker", offsetMs: 60_000 });
    const checkpoint = kernel.checkpoint("before branch");
    const persisted = JSON.parse(JSON.stringify(kernel.snapshot())) as ReturnType<SandboxTemporalKernel["snapshot"]>;
    const rehydrated = SandboxTemporalKernel.fromSnapshot(persisted);
    const child = rehydrated.fork(checkpoint.id);

    expect(persisted.checkpoints).toEqual([expect.objectContaining({ id: checkpoint.id, label: "before branch" })]);
    expect(child.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: "integration:branch-marker", status: "pending" })]));
    child.advanceBy(60_000);
    expect(child.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: "integration:branch-marker", status: "fired" })]));
    expect(rehydrated.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: "integration:branch-marker", status: "pending" })]));
  });

  it("continues checkpoint numbering after rehydration", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 0 });
    const first = kernel.checkpoint("first");
    const rehydrated = SandboxTemporalKernel.fromSnapshot(JSON.parse(JSON.stringify(kernel.snapshot())));
    const second = rehydrated.checkpoint("second");
    expect(second.id).not.toBe(first.id);
    expect(second.id).toBe("checkpoint-2");
  });

  it("resets temporal state without changing the legacy fresh-world contract", () => {
    let state = startPlaygroundSession(fixtureState());
    const session = state.playgroundSessions[0]!;
    const kernel = SandboxTemporalKernel.fromSnapshot(session.temporalSnapshot!);
    kernel.scheduleEvent({ id: "integration:discarded", type: "integration_marker", offsetMs: 60_000 });
    state = {
      ...state,
      playgroundSessions: state.playgroundSessions.map((item) =>
        item.id === session.id ? { ...item, temporalSnapshot: kernel.snapshot() } : item,
      ),
    };

    const reset = resetPlaygroundSession(state, session.id);
    const resetSession = reset.playgroundSessions.find((item) => item.id === session.id)!;
    const resetSnapshot = resetSession.temporalSnapshot!;

    expect(resetSession.status).toBe("active");
    expect(resetSession.virtualTimeMode).toBe("realtime");
    expect(resetSession.worldRevision).toBe((session.worldRevision ?? 1) + 1);
    expect(resetSnapshot.now).toBe(Date.parse(resetSession.virtualNow));
    expect(resetSnapshot.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "integration:discarded" }),
    ]));
    expect(resetSnapshot.trajectory).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "integration:discarded" }),
    ]));
  });
});
