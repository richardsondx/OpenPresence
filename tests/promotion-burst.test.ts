import { describe, expect, it } from "vitest";
import { assignmentPursuitVerifiedCounts, compileAssignmentInstruction, createAgent, promotionBurstProgress, promotionExpressionIssue, settlePromotionBurstProgress, applyOperation } from "../lib/runtime";
import { expireElapsedPursuitWindows } from "../lib/state-projection";

const input = { name: "Genny", description: "A thoughtful AI presence.", mode: "agent" as const, handle: "@example_agent", accent: "#D68754" };
const sourceId = "2093472969037099455";
const sourceUrl = `https://x.com/example_builder/status/${sourceId}`;

function fixture() {
  const state = createAgent(input);
  const presence = state.presence!;
  const assignment = compileAssignmentInstruction(state, `Promote OwnTheHype and its source post ${sourceUrl}`, presence.id, "live");
  assignment.seed = { externalRef: { type: "x.post", id: sourceId }, role: "distributable_target", availability: "unknown" };
  state.assignments = [assignment];
  state.assignmentPursuitWindows = [{
    id: "promotion-window",
    assignmentId: assignment.id,
    agentId: state.agent!.id,
    presenceId: presence.id,
    startsAt: "2026-08-30T00:00:00.000Z",
    deadlineAt: "2026-09-01T00:00:00.000Z",
    maxVerifiedActions: 40,
    purpose: "promotion_burst",
    sourcePostId: sourceId,
    sourcePostUrl: sourceUrl,
    requiredVerifiedPromotionalActions: 40,
    status: "active",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  }];
  return { state, assignment, presence, window: state.assignmentPursuitWindows![0]! };
}

function addVerified(state: ReturnType<typeof createAgent>, assignmentId: string, presenceId: string, id: string, affordance: string, promotion: { role: "direct_source" | "contextual"; sourcePostId: string }, target?: { type: string; id: string }, text?: string) {
  const execution = { id, socialIntentId: `${id}:intent`, assignmentId, presenceId, affordance, mode: "auto", status: "succeeded", attempts: 1, idempotencyKey: id, target, promotion, publication: text ? { id: `${id}:publication`, format: "x.post", payload: { text }, assetIds: [], links: [], createdAt: "2026-08-30T00:00:00.000Z" } : undefined, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" } as unknown as ReturnType<typeof createAgent>["executions"][number];
  state.executions.unshift(execution);
  state.outcomes.unshift({ id: `${id}:outcome`, socialIntentId: execution.socialIntentId, executionId: id, presenceId, status: "succeeded", observedAt: "2026-08-30T00:00:00.000Z", metrics: {} });
}

describe("OwnTheHype promotion burst contract", () => {
  it("counts only verified source-carrying public actions and keeps likes/follows auxiliary", () => {
    const { state, assignment, presence } = fixture();
    addVerified(state, assignment.id, presence.id, "direct-repost", "x.repost", { role: "direct_source", sourcePostId: sourceId }, { type: "x.post", id: sourceId });
    addVerified(state, assignment.id, presence.id, "contextual-reply", "x.reply", { role: "contextual", sourcePostId: sourceId }, { type: "x.post", id: "conversation-1" }, "This OwnTheHype angle is a useful way to see the market.");
    addVerified(state, assignment.id, presence.id, "like", "x.like", { role: "contextual", sourcePostId: sourceId }, { type: "x.post", id: sourceId });
    addVerified(state, assignment.id, presence.id, "follow", "x.follow", { role: "contextual", sourcePostId: sourceId }, { type: "x.user", id: "author-1" });
    addVerified(state, assignment.id, presence.id, "generic-reply", "x.reply", { role: "contextual", sourcePostId: sourceId }, { type: "x.post", id: "conversation-2" }, "Interesting perspective.");

    const counts = assignmentPursuitVerifiedCounts(state, state.assignmentPursuitWindows![0]!);
    expect(counts.verified).toBe(2);
    expect(counts.counts.repost).toBe(1);
    expect(counts.counts.reply).toBe(1);
    expect(counts.auxiliaryCounts).toEqual({ like: 1, follow: 1 });
    expect(counts.hasDirectSource).toBe(true);
  });

  it("does not count contextual promotion before the source post is verified", () => {
    const { state, assignment, presence } = fixture();
    addVerified(state, assignment.id, presence.id, "contextual-first", "x.reply", { role: "contextual", sourcePostId: sourceId }, { type: "x.post", id: "conversation-1" }, "OwnTheHype is an interesting market idea.");
    const progress = promotionBurstProgress(state, assignment.id, presence.id);
    expect(progress.verified).toBe(0);
    expect(progress.hasDirectSource).toBe(false);
  });

  it("settles the assignment only at 40 verified promotional actions", () => {
    const { state, assignment, presence, window } = fixture();
    for (let index = 0; index < 39; index += 1) addVerified(state, assignment.id, presence.id, `promo-${index}`, "x.repost", { role: "direct_source", sourcePostId: sourceId }, { type: "x.post", id: sourceId });
    settlePromotionBurstProgress(state, assignment.id, presence.id);
    expect(window.status).toBe("active");
    expect(assignment.status).not.toBe("completed");
    addVerified(state, assignment.id, presence.id, "promo-39", "x.repost", { role: "direct_source", sourcePostId: sourceId }, { type: "x.post", id: sourceId });
    settlePromotionBurstProgress(state, assignment.id, presence.id);
    expect(window.status).toBe("completed");
    expect(assignment.status).toBe("completed");
    expect(assignment.lastOutcome?.message).toContain("40 public OwnTheHype promotional actions");
  });

  it("rejects tracking parameters from qualifying promotional text", () => {
    expect(promotionExpressionIssue("OwnTheHype is worth a look: https://ownthehype.today/?utm_source=x")).toContain("Tracking parameters");
    expect(promotionExpressionIssue("OwnTheHype is worth a look: https://ownthehype.today")).toBeUndefined();
    expect(promotionExpressionIssue("This other post is worth a look: https://x.com/another_author/status/987654321", sourceUrl)).toContain("naturally mention");
    expect(promotionExpressionIssue(`The source is here: ${sourceUrl}`, sourceUrl)).toBeUndefined();
  });

  it("starts an explicit 40-action promotion burst from the assignment source", () => {
    const { state, assignment, presence } = fixture();
    state.assignmentPursuitWindows = [];
    assignment.deliverable = { type: "meaningful_engagement", quantity: 40, quantityMode: "exact" };
    const started = applyOperation(state, { type: "startAssignmentPursuit", assignmentId: assignment.id, presenceId: presence.id, deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), maxVerifiedActions: 40, purpose: "promotion_burst", sourcePostId: sourceId, sourcePostUrl: sourceUrl, requiredVerifiedPromotionalActions: 40 });
    const window = started.assignmentPursuitWindows!.find((item) => item.assignmentId === assignment.id && item.status === "active")!;
    expect(window).toMatchObject({ purpose: "promotion_burst", sourcePostId: sourceId, requiredVerifiedPromotionalActions: 40 });
  });

  it("rolls an unfinished promotion burst into a new retry window after expiry", () => {
    const { state, window } = fixture();
    window.deadlineAt = "2026-08-30T00:00:00.000Z";
    const result = expireElapsedPursuitWindows(state);
    expect(result.changed).toBe(true);
    expect(result.state.assignmentPursuitWindows).toHaveLength(2);
    expect(result.state.assignmentPursuitWindows?.[0]).toMatchObject({ status: "active", continuationOf: window.id, purpose: "promotion_burst", sourcePostId: sourceId });
    expect(result.state.assignmentPursuitWindows?.[1]?.status).toBe("expired");
  });
});
