import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, deliverSandboxExecution, formSandboxIntent, startPlaygroundSession } from "../lib/runtime";

describe("measured Sandbox learning trace", () => {
  it("links an actual hypothesis update to observed metrics, without claiming learning from delivery alone", () => {
    let state = createAgent({ name: "Trace", description: "Evidence-led communication", mode: "agent", handle: "@trace", accent: "#777777" });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = startPlaygroundSession(state);
    const sessionId = state.playgroundSessions[0]!.id;
    const mirrorIds: string[] = [];
    for (const [index, text] of ["Measure the eligible cohort before comparing activation.", "Keep the denominator visible when reporting retention."].entries()) {
      state = formSandboxIntent(state, { sessionId, affordance: "post", text });
      const execution = state.executions[0]!;
      state.socialDecisions.unshift({
        id: `trace-decision-${index}`, agentId: state.agent!.id, presenceId: state.presence!.id,
        environment: "sandbox", sessionId, sandboxSessionId: sessionId,
        focalMirrorObjectIds: [], decision: "original_post", summary: "Fixture selects a known strategy.", influences: [],
        socialIntentId: execution.socialIntentId, createdAt: new Date().toISOString(),
        socialStrategy: { retrievalRunId: `trace-run-${index}`, consideredPatternIds: ["social.x.v1.proof-led-original"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original" }] },
      });
      state = deliverSandboxExecution(state, execution.id);
      expect(state.executions.find((item) => item.id === execution.id)?.status).toBe("succeeded");
      mirrorIds.push(state.mirrorObjects.find((item) => item.originExecutionId === execution.id)!.id);
    }
    expect(state.playgroundSessions[0]!.temporalSnapshot!.trajectory.filter((item) => item.kind === "learning")).toHaveLength(0);
    for (const mirrorObjectId of mirrorIds) {
      state = applyOperation(state, { type: "recordPublicationMetricSnapshot", presenceId: state.presence!.id, mirrorObjectId, publicationAgeSeconds: 3600, source: "sandbox", metrics: { impressions: 1000, likes: 100, replies: 20 } });
    }
    const trace = state.playgroundSessions[0]!.temporalSnapshot!.trajectory;
    const measurements = trace.filter((item) => item.kind === "measurement");
    expect(measurements).toHaveLength(2);
    const updates = trace.filter((item) => item.kind === "learning");
    expect(updates).toHaveLength(1);
    const update = updates[0]!.data as { learningUpdateId: string; publicationMetricId: string; causal: { parentIds: string[]; parentTypes: Record<string, string> } };
    expect((state.growthHypotheses ?? []).some((item) => item.id === update.learningUpdateId)).toBe(true);
    expect(update.causal.parentIds).toEqual([update.publicationMetricId]);
    expect(update.causal.parentTypes[update.publicationMetricId]).toBe("publication_metric");
    const metricTrace = measurements.find((item) => (item.data as { publicationMetricId: string }).publicationMetricId === update.publicationMetricId)!;
    expect(metricTrace.sequence).toBeLessThan(updates[0]!.sequence);
    const measured = metricTrace.data as { mirrorObjectId: string; causal: { parentIds: string[]; parentTypes: Record<string, string> } };
    expect(measured.causal.parentIds).toEqual([measured.mirrorObjectId]);
    expect(measured.causal.parentTypes[measured.mirrorObjectId]).toBe("mirror_object");
    state = applyOperation(state, { type: "recordPublicationMetricSnapshot", presenceId: state.presence!.id, mirrorObjectId: mirrorIds[0]!, publicationAgeSeconds: 3600, source: "sandbox", observationStatus: "unavailable", metrics: {} });
    expect(state.events[0]?.title).toBe("Publication performance unavailable");
    expect(state.playgroundSessions[0]!.temporalSnapshot!.trajectory.filter((item) => item.kind === "learning")).toHaveLength(1);
    const count = state.publicationMetricSnapshots.length;
    state = applyOperation(state, { type: "recordPublicationMetricSnapshot", presenceId: "deleted-presence", mirrorObjectId: mirrorIds[0]!, publicationAgeSeconds: 3600, source: "sandbox", metrics: { impressions: 9000 } });
    expect(state.publicationMetricSnapshots).toHaveLength(count);
  });
});
