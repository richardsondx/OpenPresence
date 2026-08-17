import { describe, expect, it } from "vitest";
import { applyOperation, audienceDeltas, compileAssignmentInstruction, completeNativeExecution, derivePresenceCapabilityManifest, formXActionIntent, publicationMetricBaseline } from "@/lib/runtime";
import { createAgent } from "@/lib/runtime";
import type { MirrorObject, OpenPresenceState } from "@/lib/types";

function fixture(): OpenPresenceState {
  return createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
}

describe("continuous growth responsibility", () => {
  it("compiles a 100K request into one continuous Assignment with an evidence contract", () => {
    const state = fixture();
    const assignment = compileAssignmentInstruction(state, "Grow this Presence toward 100,000 followers while building an audience of AI founders.", state.presence!.id, "live");
    expect(assignment.activation).toEqual({ type: "continuous" });
    expect(assignment.successEvidence).toMatchObject({ metric: "followers", comparator: ">=", value: 100000 });
    expect(assignment.plan?.revision).toBe(1);
    expect(assignment.planHistory).toHaveLength(1);
    expect(assignment.deliverable.type).toBe("audience_growth");
  });

  it("does not complete from work, but completes from a verified audience snapshot", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    expect(next.assignments[0].status).toBe("active");
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 12_000, source: "native", observedAt: "2026-08-01T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("active");
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 100_000, source: "native", observedAt: "2026-08-16T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("completed");
    expect(next.assignments[0].progress.verified).toBe(1);
  });

  it("does not let a manual count complete a live follower goal", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    next = applyOperation(next, { type: "activateAssignment", id: next.assignments[0].id });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 100_000, source: "manual", observedAt: "2026-08-16T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("active");
  });

  it("keeps plan history and identity files separate during review", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    const before = Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]));
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 20_000, source: "native", observedAt: "2026-08-01T00:00:00.000Z" });
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
    expect(next.assignments[0].planHistory).toHaveLength(1);
    expect(Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(before);
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("Latest review");
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
  });

  it("uses a median comparable baseline and exposes low confidence with sparse evidence", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const makeMirror = (id: string): MirrorObject => ({ id, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: id }, observedAt: "2026-08-16T00:00:00.000Z", occurredAt: "2026-08-15T23:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    let next = { ...state, mirrorObjects: [makeMirror("a"), makeMirror("b"), makeMirror("c")] };
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "a", publicationAgeSeconds: 3600, metrics: { impressions: 100 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "b", publicationAgeSeconds: 3600, metrics: { impressions: 300 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "c", publicationAgeSeconds: 3600, metrics: { impressions: 200 }, source: "native" });
    const latest = next.publicationMetricSnapshots[0];
    expect(publicationMetricBaseline(next, latest).comparableCount).toBe(2);
    expect(audienceDeltas(next, presenceId).current).toBeUndefined();
  });

  it("reports an honest unavailable capability without a connected body", () => {
    const state = fixture();
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    expect(manifest.items.find((item) => item.capability === "follower_measurement")?.availability).toBe("unavailable");
    expect(manifest.items.find((item) => item.capability === "follower_measurement")?.canExecute).toBe(false);
  });

  it("forms and verifies native X reactions instead of treating them as unavailable", () => {
    const state = fixture();
    state.presence!.execution.like = "auto";
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    expect(manifest.items.find((item) => item.capability === "like")).toMatchObject({ availability: "available", provider: "Native X", canExecute: true, canVerify: true });
    const next = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "post-1" } });
    expect(next.executions[0]).toMatchObject({ affordance: "x.like", connector: "native", status: "queued", target: { type: "x.post", id: "post-1" } });
    const completed = completeNativeExecution(next, next.executions[0]!.id, { type: "x.like", id: "post-1" });
    expect(completed.executions[0]?.status).toBe("succeeded");
    expect(completed.outcomes[0]?.evidence).toEqual([{ type: "x.like", id: "post-1" }]);
  });
});
