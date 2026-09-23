import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, deliverSandboxExecution, formSandboxIntent, normalizeState, recordPublicationMetricSnapshots, recordSocialDecision, startPlaygroundSession } from "../lib/runtime";
import { rebuildOperationRecordsFromTrajectory } from "../lib/trajectory";

const input = {
  name: "Trajectory Agent",
  description: "Prove restart-safe agent execution.",
  audience: "builders",
  mode: "agent" as const,
  handle: "@trajectory_agent",
  accent: "#777777",
};

describe("durable trajectory contract", () => {
  it("records a no-op without manufacturing an execution", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "off" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;

    state = formSandboxIntent(state, {
      sessionId: session.id,
      affordance: "post",
      text: "This action should remain intentionally quiet.",
    });

    expect(state.executions).toHaveLength(0);
    expect(state.trajectoryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        streamId: `sandbox:${session.id}`,
        eventType: "no_op.recorded",
        payload: expect.objectContaining({ status: "NO_OP" }),
      }),
    ]));
  });

  it("persists one operation identity across intent, dispatch, provider, remote, and restart", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, {
      sessionId: session.id,
      affordance: "post",
      text: "A durable operation should be safe to inspect after a restart.",
    });

    const beforeDelivery = state.executions[0]!;
    const operationId = beforeDelivery.operationId;
    expect(operationId).toBe(beforeDelivery.id);
    expect(beforeDelivery.idempotencyKey).toBeTruthy();
    expect(state.operationRecords?.find((record) => record.operationId === operationId)?.status).toBe("QUEUED");

    state = deliverSandboxExecution(state, beforeDelivery.id);
    const delivered = state.executions.find((execution) => execution.id === beforeDelivery.id)!;
    const operation = (state.operationRecords ?? []).find((record) => record.operationId === operationId)!;
    const eventTypes = state.trajectoryEvents?.filter((event) => event.operationId === operationId).map((event) => event.eventType);

    expect(delivered.status).toBe("succeeded");
    expect(operation.status).toBe("MEASUREMENT_PENDING");
    expect(operation.idempotencyKey).toBe(beforeDelivery.idempotencyKey);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "social_intent.proposed",
      "policy.checked",
      "permission.decided",
      "execution.attempted",
      "provider.result_received",
      "remote.verification_recorded",
      "mirror.observed",
    ]));
    expect(operation.verification).toEqual(expect.arrayContaining([
      expect.objectContaining({ rung: "remote_object", status: "passed" }),
    ]));

    const reloaded = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(reloaded.operationRecords?.find((record) => record.operationId === operationId)).toMatchObject({
      operationId,
      idempotencyKey: beforeDelivery.idempotencyKey,
      status: "MEASUREMENT_PENDING",
    });
    const reloadedEvents = reloaded.trajectoryEvents?.filter((event) => event.streamId === `sandbox:${session.id}`) ?? [];
    const sequenceNos = reloadedEvents.map((event) => Number(event.sequenceNo));
    expect(sequenceNos).toEqual([...sequenceNos].sort((left, right) => left - right));
    expect(rebuildOperationRecordsFromTrajectory(reloadedEvents).find((record) => record.operationId === operationId)).toMatchObject({
      operationId,
      idempotencyKey: beforeDelivery.idempotencyKey,
      status: "MEASUREMENT_PENDING",
    });

    const mirror = state.mirrorObjects.find((item) => item.originExecutionId === delivered.id)!;
    state = recordPublicationMetricSnapshots(state, [{ type: "recordPublicationMetricSnapshot", presenceId: session.presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: 3600, metrics: { impressions: 120, likes: 12 }, source: "sandbox" }]);
    expect(state.operationRecords?.find((record) => record.operationId === operationId)?.status).toBe("OUTCOME_MEASURED");
    expect(state.operationRecords?.find((record) => record.operationId === operationId)?.verification).toEqual(expect.arrayContaining([
      expect.objectContaining({ rung: "outcome", status: "passed" }),
    ]));
  });

  it("records the retained-versus-removed learning proof as a Sandbox trajectory event", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = recordSocialDecision(state, {
      sessionId: session.id,
      presenceId: session.presenceId,
      decision: "no_op",
      summary: "There is no useful outward act in this fixture.",
      origin: { kind: "self_directed_discovery", refId: session.id },
      counterfactualActions: ["no_op", "original_post"],
    });

    const proof = state.trajectoryEvents?.find((event) => event.eventType === "learning.causal_experiment" && event.sandboxSessionId === session.id);
    expect(proof).toMatchObject({
      payload: expect.objectContaining({
        soleIntervention: "retained_learning_artifact",
        externalExecutionDisabled: true,
      }),
    });
    expect(proof?.inputHashes?.checkpoint ?? "").toBeTruthy();
  });
});
