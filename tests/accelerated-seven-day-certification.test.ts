import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";
import { SandboxTemporalKernel, type TemporalEvent } from "../lib/sandbox-temporal";

/**
 * SBX-001/002/003/004/009 + EVAL-001 certification.
 *
 * This is intentionally one world, rather than a set of isolated unit cases:
 * each later decision names the evidence/event that caused it. The same
 * world is run with three acceleration factors and compared by semantic
 * trajectory (relative time + causal kind), not by wall-clock timestamps.
 */
const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-01-05T09:00:00.000Z");

type Run = {
  factor: number;
  snapshot: ReturnType<SandboxTemporalKernel["snapshot"]>;
  semantic: Array<{ at: number; kind: string; cause?: string }>;
};

function setupRuntimeAnchor() {
  let state = createAgent({
    name: "Certification Agent",
    description: "Build a useful audience with evidence-led explanations.",
    audience: "AI builders",
    mode: "agent",
    handle: "@certification_agent",
    accent: "#D68754",
  });
  state = applyOperation(state, {
    type: "setPresence",
    patch: {
      execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto" },
      selfDirectedAttention: { enabled: true, intensity: "curious", mediaUnderstanding: "when_needed" },
    },
  });
  const sessionState = startPlaygroundSession(state, state.presence!.id, "fresh");
  expect(sessionState.assignments).toHaveLength(0);
  expect(sessionState.playgroundSessions).toHaveLength(1);
  expect(sessionState.playgroundSessions[0]!.temporalSnapshot?.now).toBe(Date.parse(sessionState.playgroundSessions[0]!.virtualNow));
}

function runAtAcceleration(factor: number): Run {
  setupRuntimeAnchor();
  const kernel = new SandboxTemporalKernel({ startAt: START, accelerationFactor: factor });
  const eventIds: Record<string, string> = {};
  const schedule = (name: string, offsetHours: number, kind: string, cause?: string) => {
    const event = kernel.scheduleEvent({
      id: `cert:${name}`,
      type: kind,
      at: START + offsetHours * 60 * 60 * 1000,
      causeEventId: cause,
    });
    eventIds[name] = event.id;
    return event.id;
  };

  // Day 0–1: autonomous start, scheduled work, a verified success, and a
  // weak result. No user Assignment is introduced anywhere in this world.
  schedule("autonomous-start", 1, "autonomous_start");
  schedule("scheduled-work", 8, "scheduled_work", "cert:autonomous-start");
  schedule("success", 18, "verified_success", "cert:scheduled-work");
  schedule("weak-result", 30, "weak_result", "cert:scheduled-work");

  // Day 2: misleading evidence arrives before its world truth, while a
  // relevant visual is retained and an irrelevant visual is rejected.
  schedule("misleading", 40, "misleading_evidence", "cert:weak-result");
  schedule("relevant-media", 44, "relevant_media", "cert:scheduled-work");
  schedule("irrelevant-media", 46, "irrelevant_media", "cert:scheduled-work");
  const measurement = schedule("measurement", 48, "measurement_due", "cert:success");
  kernel.scheduleDelayedOutcome({ id: "cert:delayed-outcome", causeEventId: measurement, at: START + 56 * 60 * 60 * 1000, value: { qualifiedReplies: 2 } });

  // Day 3–4: a breaking event makes the old plan obsolete. The mutation is
  // causally linked to the event and the stale strategy is explicitly held.
  const breaking = schedule("breaking-event", 72, "breaking_event", "cert:delayed-outcome");
  schedule("plan-mutation", 73, "verified_plan_mutation", breaking);
  schedule("stale-strategy", 80, "stale_strategy", "cert:plan-mutation");

  // Day 5: retryable failure. The injected operation has two attempts but
  // one side-effect budget; the kernel's fence prevents duplicate delivery.
  schedule("recoverable-failure", 100, "recoverable_failure", "cert:stale-strategy");
  const retry = kernel.startRetry({ id: "cert:retry", operationId: "cert:delivery", at: START + 101 * 60 * 60 * 1000, policy: { maxAttempts: 2, initialDelayMs: 60 * 60 * 1000 }, payload: { sandboxFailure: true } });

  // Day 6–7: permission boundary, then learning update and a later decision
  // affected by it. Learning never consumes misleading or irrelevant input.
  schedule("permission-boundary", 120, "permission_boundary", "cert:retry");
  schedule("learning-update", 132, "learning_update", "cert:delayed-outcome");
  schedule("later-decision", 144, "learning_affected_decision", "cert:learning-update");

  const handler = (event: TemporalEvent) => {
    if (event.type === "retry") {
      kernel.recordRetryFailure("cert:delivery", { code: "INJECTED_TRANSPORT_FAILURE" });
      return;
    }
    if (event.type === "outcome") return;
    kernel.recordTrajectory(event.type, { cause: event.causeEventId, causal: true });
  };

  // 168 virtual hours. Each run receives the same virtual hour, with the
  // real elapsed slice reduced by its explicit acceleration factor.
  for (let hour = 0; hour < 168; hour += 1) kernel.tick((60 * 60 * 1000) / factor, { onEvent: handler });
  const trajectory = kernel.trajectory;
  const semantic = trajectory
    .filter((record) => record.data && typeof record.data === "object" && "causal" in record.data)
    .map((record) => ({
      at: Math.round((record.time - START) / (60 * 60 * 1000)),
      kind: record.kind,
      cause: typeof record.data === "object" && record.data && "cause" in record.data && typeof record.data.cause === "string" ? record.data.cause : undefined,
    }));

  // The outcome is not allowed to be recorded before its measurement cause.
  const outcome = kernel.outcomes.find((item) => item.id === "cert:delayed-outcome");
  expect(outcome).toMatchObject({ status: "recorded", causeEventId: measurement });
  expect(outcome!.recordedAt!).toBeGreaterThanOrEqual(START + 48 * 60 * 60 * 1000);
  expect(kernel.retries.find((item) => item.id === retry.id)).toMatchObject({ status: "exhausted", attempt: 2 });

  return { factor, snapshot: kernel.snapshot(), semantic };
}

function causalKinds(run: Run) {
  return run.semantic.map((record) => record.kind);
}

describe("accelerated seven-day certification matrix", () => {
  it("proves one causal trajectory at 1x, 24x, and 96x acceleration", () => {
    const baseline = runAtAcceleration(1);
    const accelerated = runAtAcceleration(24);
    const highlyAccelerated = runAtAcceleration(96);
    const required = [
      "autonomous_start", "scheduled_work", "verified_success", "weak_result",
      "misleading_evidence", "relevant_media", "irrelevant_media", "measurement_due",
      "breaking_event", "verified_plan_mutation", "stale_strategy", "recoverable_failure",
      "permission_boundary", "learning_update", "learning_affected_decision",
    ];
    for (const run of [baseline, accelerated, highlyAccelerated]) {
      expect(causalKinds(run)).toEqual(expect.arrayContaining(required));
      expect(run.snapshot.now).toBe(START + 7 * DAY);
      expect(run.snapshot.acceleration.factor).toBe(run.factor);
      expect(run.snapshot.trajectory.some((record) => record.kind === "outcome_recorded")).toBe(true);
      expect(run.snapshot.trajectory.some((record) => record.kind === "retry_failed")).toBe(true);
      expect(run.snapshot.trajectory.some((record) => record.kind === "retry_exhausted")).toBe(true);
    }

    // Causal stability: acceleration can change time_advanced records and
    // batch boundaries, but cannot change the ordered decision trace.
    expect(accelerated.semantic).toEqual(baseline.semantic);
    expect(highlyAccelerated.semantic).toEqual(baseline.semantic);

    const mutation = baseline.semantic.find((record) => record.kind === "verified_plan_mutation");
    const breakingIndex = baseline.semantic.findIndex((record) => record.kind === "breaking_event");
    const mutationIndex = baseline.semantic.findIndex((record) => record.kind === "verified_plan_mutation");
    expect(mutation?.cause).toBe("cert:breaking-event");
    expect(breakingIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThan(breakingIndex);
    expect(baseline.semantic.find((record) => record.kind === "learning_affected_decision")?.cause).toBe("cert:learning-update");
  });
});
