import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "../lib/ai";
import { runModelGrowthReview } from "../lib/growth-review-worker";
import { audienceDeltas, compileAssignmentInstruction, createAgent, deriveGrowthEvidenceSnapshot } from "../lib/runtime";
import { autonomousGrowthReviewNeed } from "../lib/growth-review-scheduling";
import { applyGrowthHypothesisActions } from "../lib/social-strategy";

afterEach(() => vi.restoreAllMocks());

describe("model Growth review evidence boundaries", () => {
  it("derives follower evidence from live or exactly one selected rehearsal", () => {
    const state = createAgent({ name: "Audience scope", description: "Useful evidence", mode: "agent", handle: "audience", accent: "#777777" });
    const presenceId = state.presence!.id;
    state.presence!.createdAt = "2026-09-01T00:00:00Z";
    state.audienceSnapshots = [
      { id: "live-before", presenceId, environment: "live", followers: 10, observedAt: "2026-09-22T12:00:00Z", source: "native" },
      { id: "live-after", presenceId, environment: "live", followers: 12, observedAt: "2026-09-29T12:00:00Z", source: "native" },
      { id: "selected-before", presenceId, environment: "sandbox", sessionId: "selected", followers: 100, observedAt: "2026-09-22T12:00:00Z", source: "sandbox" },
      { id: "selected-after", presenceId, environment: "sandbox", sessionId: "selected", followers: 105, observedAt: "2026-09-29T12:00:00Z", source: "sandbox" },
      { id: "sibling-after", presenceId, environment: "sandbox", sessionId: "sibling", followers: 9999, observedAt: "2026-09-30T12:00:00Z", source: "sandbox" },
    ] as never;
    expect(audienceDeltas(state, presenceId)).toMatchObject({ current: 12, sevenDay: 2 });
    expect(audienceDeltas(state, presenceId, { sandboxSessionId: "selected" })).toMatchObject({ current: 105, sevenDay: 5 });
    const live = deriveGrowthEvidenceSnapshot(state, presenceId);
    expect(live.observedOutcomes).toMatchObject({ currentFollowers: 12, followerDelta: 2 });
    expect(live.sourceRefs).toEqual(["live-after", "live-before"]);
    const rehearsal = deriveGrowthEvidenceSnapshot(state, presenceId, { sandboxSessionId: "selected" });
    expect(rehearsal.observedOutcomes).toMatchObject({ currentFollowers: 105, followerDelta: 5 });
    expect(rehearsal.sourceRefs).toEqual(["selected-after", "selected-before"]);
  });
  it("confines generated learning and hallucinated mutation targets to the review session", () => {
    const state = createAgent({ name: "Output scope", description: "Useful evidence", mode: "agent", handle: "output", accent: "#777777" });
    const presenceId = state.presence!.id;
    const hypothesis = (id: string, sandboxSessionId?: string) => ({ id, agentId: state.agent!.id, originatingPresenceId: presenceId, scope: "presence" as const, statement: id, status: "supported" as const, confidence: "medium" as const, patternIds: [], supportingEvidenceIds: [], contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", sandboxSessionId });
    state.growthHypotheses = [hypothesis("live"), hypothesis("selected", "selected-session"), hypothesis("sibling", "sibling-session")];
    applyGrowthHypothesisActions(state, presenceId, "sandbox-review", [
      { action: "retire", hypothesisId: "live" },
      { action: "retire", hypothesisId: "sibling" },
      { action: "retire", hypothesisId: "selected" },
      { action: "create", statement: "New rehearsal test", scope: "agent" },
      { action: "generalize", statement: "Borrow live learning", derivedFrom: ["live"] },
    ], "2026-10-01T10:00:00Z", "selected-session");
    expect(state.growthHypotheses.find(item => item.id === "live")?.status).toBe("supported");
    expect(state.growthHypotheses.find(item => item.id === "sibling")?.status).toBe("supported");
    expect(state.growthHypotheses.find(item => item.id === "selected")?.status).toBe("retired");
    expect(state.growthHypotheses.find(item => item.statement === "New rehearsal test")).toMatchObject({ sandboxSessionId: "selected-session", status: "testing" });
    expect(state.growthHypotheses.some(item => item.statement === "Borrow live learning")).toBe(false);
  });
  it("keeps a model-produced rehearsal strategy change out of the live Chat", async () => {
    const state = createAgent({ name: "Rehearsal review", description: "Useful evidence", mode: "agent", handle: "rehearsal", accent: "#777777" });
    const assignment = compileAssignmentInstruction(state, "Grow this account toward 1000 followers", state.presence!.id, "sandbox");
    assignment.status = "active";
    state.assignments = [assignment];
    state.playgroundSessions = [{ id: "only-session", presenceId: assignment.presenceId, status: "active", virtualNow: "2026-10-01T12:00:00Z" }] as never;
    state.presence!.lastTriagedEvidenceWatermark = 41;
    const before = structuredClone(state.operatorConversations);
    const growthFileBefore = state.files.find(file => file.kind === "GROWTH")?.content;
    vi.spyOn(ai, "generateGrowthReview").mockResolvedValue({ summary: "Try a new rehearsal approach.", working: [], uncertain: [], weak: [], strategyChanged: true, plan: { summary: "Compare scoped rehearsal outcomes" }, hypothesisActions: [{ action: "create", statement: "Rehearsal-only learning", scope: "presence" }] });
    const reviewed = await runModelGrowthReview(state, assignment, "weekly", { sandboxSessionId: "only-session" });
    expect(reviewed.growthReviews[0]?.changedPlan).toBe(true);
    expect(reviewed.growthHypotheses?.find(item => item.statement === "Rehearsal-only learning")?.sandboxSessionId).toBe("only-session");
    expect(reviewed.operatorConversations).toEqual(before);
    expect(reviewed.files.find(file => file.kind === "GROWTH")?.content).toBe(growthFileBefore);
    expect(reviewed.presence?.lastTriagedEvidenceWatermark).toBe(41);
    expect(reviewed.assignments.find(item => item.id === assignment.id)?.sessionId).toBe("only-session");
  });
  it("persists a model review for an ongoing original-presence responsibility", async () => {
    const state = createAgent({ name: "Original presence", description: "Useful evidence", mode: "agent", handle: "originals", accent: "#777777" });
    const assignment = compileAssignmentInstruction(state, "Grow this account toward 1000 followers", state.presence!.id, "live");
    assignment.origin = "publishing_initiative";
    assignment.successEvidence = undefined;
    assignment.status = "active";
    state.assignments = [assignment];
    vi.spyOn(ai, "generateGrowthReview").mockResolvedValue({ summary: "The evidence is not sufficient to claim improved results.", working: [], uncertain: ["No comparable measurements"], weak: [], strategyChanged: false });
    const reviewed = await runModelGrowthReview(state, assignment, "weekly");
    expect(reviewed.growthReviews).toHaveLength(1);
    expect(reviewed.growthReviews[0]).toMatchObject({ assignmentId: assignment.id, reviewSource: "model", strategyChanged: false });
  });
  it("selects the exact rehearsal responsibility and excludes rehearsals from headless live reviews", () => {
    const state = createAgent({ name: "Schedule scope", description: "Useful evidence", mode: "agent", handle: "schedule", accent: "#777777" });
    const live = compileAssignmentInstruction(state, "Grow this account toward 1000 followers", state.presence!.id, "live");
    live.status = "active";
    live.plan!.nextWeeklyReviewAt = "2026-09-30T00:00:00Z";
    const selected = { ...structuredClone(live), id: "selected", environment: "sandbox" as const, sessionId: "selected-session" };
    const sibling = { ...structuredClone(live), id: "sibling", environment: "sandbox" as const, sessionId: "sibling-session" };
    state.assignments = [sibling, selected, live];
    state.playgroundSessions = [{ id: "selected-session", presenceId: live.presenceId, status: "active" }, { id: "sibling-session", presenceId: live.presenceId, status: "active" }] as never;
    expect(autonomousGrowthReviewNeed(state, live.presenceId, new Date("2026-10-01T12:00:00Z"))?.assignment.id).toBe(live.id);
    expect(autonomousGrowthReviewNeed(state, live.presenceId, new Date("2026-10-01T12:00:00Z"), { sandboxSessionId: "selected-session" })?.assignment.id).toBe("selected");
  });
  it("keeps live and sibling rehearsal learning out of the model review", async () => {
    const state = createAgent({ name: "Review scope", description: "Useful evidence", mode: "agent", handle: "scope", accent: "#777777" });
    const presenceId = state.presence!.id;
    const agentId = state.agent!.id;
    state.growthHypotheses = [
      { id: "live", agentId, originatingPresenceId: presenceId },
      { id: "selected", agentId, originatingPresenceId: presenceId, sandboxSessionId: "selected-session" },
      { id: "sibling", agentId, originatingPresenceId: presenceId, sandboxSessionId: "sibling-session" },
      { id: "other-agent", agentId: "other-agent", originatingPresenceId: presenceId },
    ] as never;
    state.growthEvidenceRecords = [
      { id: "live-evidence", agentId, presenceId, sourceRefs: [], causalDecisionIds: [], createdAt: "2026-10-01T09:00:00Z" },
      { id: "selected-evidence", agentId, presenceId, sourceRefs: [], causalDecisionIds: [], sandboxSessionId: "selected-session", createdAt: "2026-10-01T09:00:00Z" },
      { id: "sibling-evidence", agentId, presenceId, sourceRefs: [], causalDecisionIds: [], sandboxSessionId: "sibling-session", createdAt: "2026-10-01T09:00:00Z" },
    ] as never;
    state.playgroundSessions = [{ id: "selected-session", presenceId, status: "active", virtualNow: "2026-10-01T12:00:00Z" }] as never;
    const provider = vi.spyOn(ai, "generateGrowthReview").mockRejectedValue(new Error("Stop after evidence capture"));
    const live = compileAssignmentInstruction(state, "Grow this account toward 1000 followers", presenceId, "live");
    await runModelGrowthReview(state, live, "weekly");
    expect(provider.mock.calls[0][3]).toMatchObject({ hypotheses: [{ id: "live" }], strategyEvidence: [{ id: "live-evidence" }] });
    const sandbox = { ...live, environment: "sandbox" as const, sessionId: "selected-session" };
    await runModelGrowthReview(state, sandbox, "weekly", { sandboxSessionId: "selected-session" });
    expect(provider.mock.calls[1][3]).toMatchObject({ hypotheses: [{ id: "selected" }], strategyEvidence: [{ id: "selected-evidence" }] });
    await expect(runModelGrowthReview(state, sandbox, "weekly")).rejects.toThrow("exact Sandbox session");
    await expect(runModelGrowthReview(state, sandbox, "weekly", { sandboxSessionId: "sibling-session" })).rejects.toThrow("does not belong");
    await expect(runModelGrowthReview(state, live, "weekly", { sandboxSessionId: "selected-session" })).rejects.toThrow("does not belong");
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("does not schedule a live review from new rehearsal measurements", () => {
    const state = createAgent({ name: "Quiet live", description: "Useful evidence", mode: "agent", handle: "quiet", accent: "#777777" });
    const live = compileAssignmentInstruction(state, "Grow this account toward 1000 followers", state.presence!.id, "live");
    live.status = "active";
    live.createdAt = "2026-10-01T09:00:00Z";
    live.plan!.nextWeeklyReviewAt = "2026-10-10T00:00:00Z";
    live.plan!.nextStrategicReviewAt = "2026-10-10T00:00:00Z";
    state.assignments = [live];
    state.presence!.lastTriagedEvidenceWatermark = Number.MAX_SAFE_INTEGER;
    state.audienceSnapshots = [{ id: "rehearsal-audience", presenceId: live.presenceId, environment: "sandbox", sessionId: "rehearsal", followers: 1000, observedAt: "2026-10-01T10:00:00Z", source: "sandbox" }] as never;
    expect(autonomousGrowthReviewNeed(state, live.presenceId, new Date("2026-10-01T12:00:00Z"))).toBeUndefined();
  });
});
