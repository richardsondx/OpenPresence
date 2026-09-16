import { describe, expect, it } from "vitest";
import { SandboxTemporalKernel, TemporalBoundsError, createSandboxTemporalKernel, nextRetryDelayMs } from "../lib/sandbox-temporal";

describe("sandbox temporal kernel", () => {
  it("keeps virtual time monotonic and pause/resume explicit", () => {
    const kernel = createSandboxTemporalKernel({ startAt: 1_000 });
    expect(kernel.advanceBy(500).to).toBe(1_500);
    kernel.pause();
    expect(kernel.advanceBy(500)).toMatchObject({ from: 1_500, to: 1_500, processed: [] });
    kernel.resume();
    expect(kernel.advanceTo(2_000).to).toBe(2_000);
    expect(() => kernel.advanceTo(1_999)).toThrow(/monotonic/i);
    expect(kernel.trajectory.map((record) => record.kind)).toEqual(expect.arrayContaining(["paused", "resumed", "time_advanced"]));
  });

  it("keeps acceleration as metadata while tick applies it deterministically", () => {
    const kernel = new SandboxTemporalKernel({ accelerationFactor: 4 });
    kernel.scheduleEvent({ type: "wake", offsetMs: 400 });
    const result = kernel.tick(100);
    expect(result.to).toBe(400);
    expect(result.processed.map((event) => event.type)).toEqual(["wake"]);
    expect(kernel.acceleration).toMatchObject({ factor: 4, realElapsedMs: 100, virtualElapsedMs: 400, mode: "accelerated" });
  });

  it("orders equal-time events by priority and then insertion sequence", () => {
    const kernel = new SandboxTemporalKernel();
    kernel.scheduleEvent({ type: "late", offsetMs: 10, priority: 10 });
    kernel.scheduleEvent({ type: "first", offsetMs: 10, priority: 0 });
    kernel.scheduleEvent({ type: "second", offsetMs: 10, priority: 0 });
    expect(kernel.advanceBy(10).processed.map((event) => event.type)).toEqual(["first", "second", "late"]);
  });

  it("supports offsets, finite recurrence, and bounded recurrence", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 100 });
    kernel.scheduleEvent({ type: "pulse", offsetMs: 5, recurrence: { intervalMs: 10, count: 3 } });
    expect(kernel.advanceBy(25).processed.map((event) => [event.type, event.occurrence, event.at])).toEqual([
      ["pulse", 1, 105], ["pulse", 2, 115], ["pulse", 3, 125],
    ]);
    expect(kernel.events.filter((event) => event.type === "pulse")).toHaveLength(3);
    expect(() => new SandboxTemporalKernel({ bounds: { maxEvents: 2 } }).scheduleEvent({ type: "unbounded", recurrence: { intervalMs: 1, count: 3 } })).toThrow(TemporalBoundsError);
  });

  it("records delayed outcomes only after their cause has fired", () => {
    const kernel = new SandboxTemporalKernel();
    const cause = kernel.scheduleEvent({ type: "deliver", offsetMs: 10 });
    const outcome = kernel.scheduleOutcome({ causeEventId: cause.id, offsetMs: 20, value: { verified: true } });
    expect(kernel.advanceBy(15).processed.map((event) => event.type)).toEqual(["deliver"]);
    expect(kernel.outcomes.find((item) => item.id === outcome.id)?.status).toBe("scheduled");
    kernel.advanceBy(5);
    expect(kernel.outcomes.find((item) => item.id === outcome.id)).toMatchObject({ status: "recorded", recordedAt: 20, value: { verified: true } });
    expect(kernel.trajectory.some((record) => record.kind === "outcome_recorded")).toBe(true);
    const beforeCause = new SandboxTemporalKernel();
    const futureCause = beforeCause.scheduleEvent({ type: "deliver", offsetMs: 10 });
    expect(() => beforeCause.scheduleOutcome({ causeEventId: futureCause.id, at: 5 })).toThrow(/precede its cause/i);
  });

  it("gives handlers the event-local clock during a bulk advance", () => {
    const kernel = new SandboxTemporalKernel({ startAt: 0 });
    const observedAt: number[] = [];
    kernel.scheduleEvent({ type: "parent", offsetMs: 10, handler: (_event, context) => {
      observedAt.push(context.now);
      expect(kernel.now).toBe(context.now);
      return [{ type: "schedule", event: { type: "child", offsetMs: 5, handler: (_child, childContext) => {
        observedAt.push(childContext.now);
        expect(kernel.now).toBe(childContext.now);
      } } }];
    } });
    kernel.scheduleEvent({ type: "later", offsetMs: 20, handler: (_event, context) => {
      observedAt.push(context.now);
      expect(kernel.now).toBe(context.now);
    } });
    kernel.advanceBy(100);
    expect(observedAt).toEqual([10, 15, 20]);
    expect(kernel.events.find((event) => event.type === "child")?.at).toBe(15);
  });

  it("uses deterministic exponential retry/backoff and stops at the attempt bound", () => {
    const policy = { maxAttempts: 3, initialDelayMs: 10, multiplier: 2, maxDelayMs: 15 };
    expect(nextRetryDelayMs(policy, 1)).toBe(10);
    expect(nextRetryDelayMs(policy, 2)).toBe(15);
    const kernel = new SandboxTemporalKernel();
    const retry = kernel.startRetry({ operationId: "publish", policy });
    expect(kernel.advanceBy(10).processed[0]?.type).toBe("retry");
    const second = kernel.failRetry("publish", "temporary");
    expect(second?.attempt).toBe(2);
    expect(kernel.advanceBy(15).processed[0]?.payload).toEqual({ operationId: "publish", attempt: 2 });
    kernel.failRetry("publish", "temporary-again");
    kernel.advanceBy(15);
    const exhausted = kernel.failRetry("publish", "final");
    expect(exhausted).toMatchObject({ id: retry.id, status: "exhausted", attempt: 3 });
  });

  it("fences terminal retry transitions from old pending events", () => {
    const kernel = new SandboxTemporalKernel();
    const retry = kernel.startRetry({ operationId: "publish", policy: { maxAttempts: 2, initialDelayMs: 10 } });
    kernel.succeedRetry("publish");
    kernel.advanceBy(10);
    expect(kernel.retries.find((item) => item.id === retry.id)).toMatchObject({ status: "succeeded" });
    expect(kernel.events.find((event) => event.id === retry.eventId)?.status).toBe("cancelled");
  });

  it("does not run an older retry event after a newer attempt takes ownership", () => {
    const kernel = new SandboxTemporalKernel();
    const first = kernel.startRetry({ operationId: "publish", at: 100, policy: { maxAttempts: 3, initialDelayMs: 10 } });
    kernel.scheduleRetry({ id: first.id, operationId: "publish", attempt: 2, at: 10, policy: first.policy });
    const handled: number[] = [];

    const result = kernel.advanceBy(100, {
      onEvent: (event) => {
        if (event.type === "retry") handled.push((event.payload as { attempt: number }).attempt);
      },
    });

    expect(result.processed.filter((event) => event.type === "retry").map((event) => event.status)).toEqual(["fired", "stale"]);
    expect(handled).toEqual([2]);
    expect(kernel.trajectory.some((record) => record.kind === "retry_event_stale")).toBe(true);
  });

  it("cancels duplicate pending retry events on both terminal success and exhaustion", () => {
    const success = new SandboxTemporalKernel();
    success.startRetry({ operationId: "success", offsetMs: 10, policy: { maxAttempts: 2, initialDelayMs: 10 } });
    success.scheduleEvent({ type: "retry", offsetMs: 20, payload: { operationId: "success", attempt: 1 } });
    success.succeedRetry("success");
    expect(success.advanceBy(20).processed).toEqual([]);
    expect(success.events.filter((event) => event.type === "retry")).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "cancelled" }),
    ]));

    const failure = new SandboxTemporalKernel();
    failure.startRetry({ operationId: "failure", offsetMs: 10, policy: { maxAttempts: 1, initialDelayMs: 10 } });
    failure.scheduleEvent({ type: "retry", offsetMs: 20, payload: { operationId: "failure", attempt: 1 } });
    expect(failure.failRetry("failure", "permanent")).toMatchObject({ status: "exhausted" });
    expect(failure.advanceBy(20).processed).toEqual([]);
    expect(failure.events.filter((event) => event.type === "retry")).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "cancelled" }),
    ]));
  });

  it("fences stale work and cancels an event lineage, including recurrence", () => {
    const kernel = new SandboxTemporalKernel();
    const oldFence = kernel.issueFence("assignment");
    kernel.scheduleEvent({ type: "stale-work", offsetMs: 10, fence: oldFence });
    kernel.issueFence("assignment");
    expect(kernel.advanceBy(10).processed[0]?.status).toBe("stale");

    const recurring = kernel.scheduleEvent({ type: "cancel-me", offsetMs: 5, recurrence: { intervalMs: 5, count: 5 } });
    kernel.cancelEvent(recurring.id, "operator stopped it");
    kernel.advanceBy(50);
    expect(kernel.events.filter((event) => event.type === "cancel-me" && event.status === "fired")).toHaveLength(0);
    expect(kernel.trajectory.some((record) => record.kind === "event_stale")).toBe(true);
  });

  it("checkpoints and forks without mutating the parent trajectory or future", () => {
    const parent = new SandboxTemporalKernel();
    parent.scheduleEvent({ type: "branch", offsetMs: 10 });
    parent.advanceBy(5);
    const checkpoint = parent.checkpoint("before branch");
    const child = parent.fork(checkpoint.id);
    child.scheduleEvent({ type: "child-only", offsetMs: 1 });
    child.advanceBy(1);
    expect(child.events.some((event) => event.type === "child-only" && event.status === "fired")).toBe(true);
    expect(parent.events.some((event) => event.type === "child-only")).toBe(false);
    expect(parent.now).toBe(5);
    expect(parent.trajectory.some((record) => record.kind === "fork_created")).toBe(false);
    expect(child.trajectory.some((record) => record.kind === "fork_created")).toBe(true);
  });

  it("captures cognition and runtime evidence as ordered trajectory records", () => {
    const kernel = new SandboxTemporalKernel();
    kernel.recordObservation({ source: "world" });
    kernel.recordDecision({ kind: "reply" });
    kernel.recordIntent({ target: "post-1" });
    kernel.recordExecution({ simulated: true });
    kernel.recordPermissionDecision({ allowed: true });
    kernel.recordPlanMutation({ reason: "follow-up" });
    expect(kernel.trajectory.map((record) => record.kind).slice(-6)).toEqual([
      "observation", "decision", "intent", "execution", "permission_decision", "plan_mutation",
    ]);
  });
});
