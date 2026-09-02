import { describe, expect, it, vi } from "vitest";
import { applyGrowthHypothesisActions, compileSocialStrategyContext, ensureGrowthEvidenceRecords, legacyChannelStrategyGuidance, strategyUseFromDecision, summarizeStrategyPerformance } from "../lib/social-strategy";
import { generateAgentSocialDecision, parseAgentSocialDecision } from "../lib/ai";
import { applyOperation, createAgent } from "../lib/runtime";
import type { GrowthEvidenceRecord, OpenPresenceState } from "../lib/types";

const input = { name: "Strategy Test", description: "A careful social Presence.", mode: "agent" as const, handle: "@strategy_test", accent: "#D68754" };

describe("Social Strategy Intelligence", () => {
  it("retrieves bounded X possibilities and allows a valid zero result", () => {
    const state = createAgent(input);
    const presence = state.presence!;
    const context = compileSocialStrategyContext(state, presence, { invocation: "test", objective: "A concrete evidence-based post for builders", availableActions: ["original_post", "reply", "like"] });
    expect(context.retrievalRun.consideredPatterns.length).toBeGreaterThan(0);
    expect(context.retrievalRun.consideredPatterns.length).toBeLessThanOrEqual(5);

    const otherPresence = { ...presence, id: "linkedin-presence", channel: "linkedin" as const };
    const empty = compileSocialStrategyContext(state, otherPresence, { invocation: "test", objective: "unrelated", availableActions: ["reply"] });
    expect(empty.retrievalRun.consideredPatterns).toHaveLength(0);
    expect(empty.retrievalRun.noPatternReason).toContain("No Playbook pattern");
  });

  it("keeps legacy playbook prose advisory and filters invented strategy IDs", () => {
    const state = createAgent(input);
    state.channelDefinitions[0]!.playbook = "Legacy channel guidance stays prose.";
    state.legacyChannelStrategyGuidance = legacyChannelStrategyGuidance(state.channelDefinitions);
    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "test", objective: "share a useful mechanism", availableActions: ["original_post"] });
    expect(state.legacyChannelStrategyGuidance?.find((item) => item.channelId === "x")?.kind).toBe("legacy_advisory");
    const use = strategyUseFromDecision(context.retrievalRun, [{ action: "original_post", strategyId: "invented", mechanismId: "invented" }]);
    expect(use?.consideredPatternIds).toEqual(context.retrievalRun.consideredPatterns.map((pattern) => pattern.id));
    expect(use?.selectedByAct[0]).toMatchObject({ act: "original_post", patternId: undefined, mechanismId: undefined });
  });

  it("preserves planner strategy IDs for considered-vs-selected provenance", () => {
    const decision = parseAgentSocialDecision(JSON.stringify({ acts: [{ action: "like", strategyId: "social.x.v1.quiet-appreciation", mechanismId: "quiet appreciation", rationale: "A quiet signal fits." }] }), ["like"]);
    expect(decision.acts?.[0]).toMatchObject({ action: "like", strategyId: "social.x.v1.quiet-appreciation", mechanismId: "quiet appreciation" });
  });

  it("softly records recent strategy shape without imposing a cooldown", () => {
    const state = createAgent(input);
    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "test", objective: "show appreciation", availableActions: ["like"] });
    state.socialDecisions.unshift({
      id: "decision-fatigue",
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      environment: "sandbox",
      focalMirrorObjectIds: [],
      decision: "like",
      summary: "A recent quiet signal",
      influences: [],
      socialStrategy: { retrievalRunId: context.retrievalRun.id, consideredPatternIds: [], selectedByAct: [{ act: "like", patternId: "social.x.v1.quiet-appreciation", mechanismId: "quiet appreciation" }] },
      createdAt: new Date().toISOString(),
    });
    const next = compileSocialStrategyContext(state, state.presence!, { invocation: "test", objective: "show appreciation", availableActions: ["like"] });
    expect(next.retrievalRun.recentStrategyShape["quiet appreciation"]).toBe(1);
    expect(next.retrievalRun.consideredPatterns.some((pattern) => pattern.id === "social.x.v1.quiet-appreciation")).toBe(true);
  });

  it("does not support an effectiveness hypothesis without a verified world outcome", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    state.growthEvidenceRecords = [{ id: "operator-choice", agentId: state.agent!.id, presenceId, kind: "OPERATOR_REVIEW", claimScope: "presence", statement: "The operator liked this pattern.", sourceRefs: [{ kind: "operator_input", id: "operator-choice" }], verified: true, createdAt: new Date().toISOString() } satisfies GrowthEvidenceRecord];
    applyGrowthHypothesisActions(state, presenceId, "review-1", [{ action: "create", statement: "Proof-led originals may improve qualified conversations.", scope: "presence", patternIds: ["social.x.v1.proof-led-original"], evidenceIds: ["operator-choice"], confidence: "medium" }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("testing");
    const hypothesisId = state.growthHypotheses![0]!.id;
    applyGrowthHypothesisActions(state, presenceId, "review-2", [{ action: "support", hypothesisId, evidenceIds: ["operator-choice"] }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("weakened");

    ensureGrowthEvidenceRecords(state, presenceId);
    state.growthEvidenceRecords!.push({ id: "world-outcome", agentId: state.agent!.id, presenceId, kind: "WORLD_OUTCOME", claimScope: "presence", statement: "A verified outcome was observed.", sourceRefs: [{ kind: "publication_metric", id: "metric-1" }], verified: true, createdAt: new Date().toISOString() });
    applyGrowthHypothesisActions(state, presenceId, "review-3", [{ action: "support", hypothesisId, evidenceIds: ["world-outcome"], confidence: "high" }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("supported");
    expect(state.growthHypotheses?.[0]?.reviewHistory.map((item) => item.status)).toEqual(["testing", "weakened", "supported"]);
  });

  it("gives Genny verified act-level performance evidence so quote versus repost is strategic", async () => {
    let state = createAgent({ name: "Genny", description: "Help AI builders understand durable agent systems.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const presenceId = state.presence!.id;
    const observedAt = new Date().toISOString();
    const mirror = (id: string, objectType: "quote" | "repost") => ({
      id,
      bridgeId: "native:genny",
      presenceId,
      channelId: "x" as const,
      externalRef: { type: "x.post" as const, id: `${id}-external` },
      objectType,
      author: { displayName: "Genny", handle: "genny" },
      content: { text: `${objectType} contribution ${id}` },
      observedAt,
      occurredAt: observedAt,
      visibility: "public" as const,
      shareability: "presence-only" as const,
      environment: "live" as const,
      actorPresenceId: presenceId,
      source: "native" as const,
      trust: "untrusted_world_content" as const,
    } satisfies OpenPresenceState["mirrorObjects"][number]);
    state.mirrorObjects = [mirror("quote-1", "quote"), mirror("quote-2", "quote"), mirror("repost-1", "repost"), mirror("repost-2", "repost")];

    for (const [mirrorObjectId, metrics] of [
      ["quote-1", { impressions: 1_000, likes: 120, replies: 12, reposts: 18, quotes: 5 }],
      ["quote-2", { impressions: 900, likes: 108, replies: 10, reposts: 16, quotes: 4 }],
      ["repost-1", { impressions: 1_000, likes: 25, replies: 2, reposts: 4, quotes: 1 }],
      ["repost-2", { impressions: 900, likes: 22, replies: 1, reposts: 3, quotes: 1 }],
    ] as const) {
      state = applyOperation(state, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId, publicationAgeSeconds: 3_600, metrics, source: "native" });
    }

    state.growthHypotheses = [{
      id: "hypothesis-quote-over-repost",
      agentId: state.agent!.id,
      originatingPresenceId: presenceId,
      scope: "presence",
      channelId: "x",
      statement: "Quote-led contributions may create stronger qualified engagement than repost-only amplification for AI builders.",
      status: "supported",
      confidence: "medium",
      patternIds: ["social.x.v1.selective-amplification"],
      supportingEvidenceIds: state.publicationMetricSnapshots.map((snapshot) => snapshot.id),
      contradictingEvidenceIds: [],
      derivedFrom: [],
      reviewHistory: [],
      createdAt: observedAt,
      updatedAt: observedAt,
    }];

    const performance = summarizeStrategyPerformance(state, presenceId);
    const quote = performance.find((item) => item.action === "quote")!;
    const repost = performance.find((item) => item.action === "repost")!;
    expect(quote.samples).toBe(2);
    expect(repost.samples).toBe(2);
    expect(quote.averageEngagementRate!).toBeGreaterThan(repost.averageEngagementRate!);

    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "growth-mission-eval", objective: "Choose whether to quote or repost a high-signal AI builder post using measured audience engagement evidence.", availableActions: ["quote", "repost"] });
    expect(context.retrievalRun.relevantGrowthHypothesisIds).toContain("hypothesis-quote-over-repost");
    expect(context.prompt).toContain("Verified live publication performance by act");
    expect(context.prompt).toContain("quote: 2 verified publications");
    expect(context.prompt).toContain("repost: 2 verified publications");

    const recordedChoice = strategyUseFromDecision(context.retrievalRun, [{ action: "quote", strategyId: "social.x.v1.selective-amplification", mechanismId: "selective amplification" }]);
    expect(recordedChoice?.selectedByAct[0]).toMatchObject({ act: "quote", patternId: "social.x.v1.selective-amplification", mechanismId: "selective amplification" });

    vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    const decision = await generateAgentSocialDecision(state, "Evaluate the newest high-signal post and choose whether to quote or repost it. Newest unjudged relevant object is from @builder: \"A concrete architecture decision changed the reliability of our agent.\"", ["quote", "repost"], { presence: state.presence!, strategyContext: context, assignmentMode: true, usageOrigin: "assignment" });
    expect(decision.action).toBe("quote");
    expect(decision.rationale).toContain("verified act-level evidence");
    expect(decision.socialStrategy?.use?.selectedByAct[0]).toMatchObject({ act: "quote", patternId: "social.x.v1.selective-amplification" });
  });
});
