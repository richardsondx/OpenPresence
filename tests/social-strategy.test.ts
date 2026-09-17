import { describe, expect, it, vi } from "vitest";
import { applyGrowthHypothesisActions, compileSocialStrategyContext, ensureGrowthEvidenceRecords, legacyChannelStrategyGuidance, strategyUseFromDecision, summarizeStrategyPerformance, summarizeStrategyPatternPerformance } from "../lib/social-strategy";
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
    applyGrowthHypothesisActions(state, presenceId, "review-1", [{ action: "create", statement: "Proof-led originals may improve qualified conversations.", scope: "presence", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 1 }], evidenceIds: ["operator-choice"], confidence: "medium" }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("testing");
    const hypothesisId = state.growthHypotheses![0]!.id;
    applyGrowthHypothesisActions(state, presenceId, "review-2", [{ action: "support", hypothesisId, evidenceIds: ["operator-choice"] }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("weakened");

    ensureGrowthEvidenceRecords(state, presenceId);
    state.socialDecisions = ["decision-1", "decision-2"].map((id) => ({ id, agentId: state.agent!.id, presenceId, environment: "sandbox" as const, focalMirrorObjectIds: [], decision: "original_post" as const, summary: "Proof-led original", influences: [], socialStrategy: { retrievalRunId: `${id}-run`, consideredPatternIds: ["social.x.v1.proof-led-original"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original", mechanismId: "proof-led original" }] }, createdAt: new Date().toISOString() }));
    state.growthEvidenceRecords!.push(...["world-outcome-1", "world-outcome-2"].map((id, index) => ({ id, agentId: state.agent!.id, presenceId, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "A verified outcome was observed.", sourceRefs: [{ kind: "publication_metric" as const, id: `metric-${index + 1}` }], verified: true, causalDecisionIds: [`decision-${index + 1}`], createdAt: new Date().toISOString() })));
    applyGrowthHypothesisActions(state, presenceId, "review-3", [{ action: "support", hypothesisId, evidenceIds: ["world-outcome-1", "world-outcome-2"], confidence: "high" }]);
    expect(state.growthHypotheses?.[0]?.status).toBe("supported");
    expect(state.growthHypotheses?.[0]?.reviewHistory.map((item) => item.status)).toEqual(["testing", "weakened", "supported"]);
  });

  it("does not promote a hypothesis from an unrelated or single outcome", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    state.growthEvidenceRecords = ["unrelated-1", "unrelated-2"].map((id) => ({ id, agentId: state.agent!.id, presenceId, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Verified outcome with no causal decision lineage.", sourceRefs: [{ kind: "publication_metric" as const, id }], verified: true, createdAt: new Date().toISOString() }));
    applyGrowthHypothesisActions(state, presenceId, "unrelated-review", [{ action: "create", statement: "Images improve qualified growth.", scope: "presence", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 2 }], evidenceIds: ["unrelated-1"], confidence: "high" }]);
    const hypothesisId = state.growthHypotheses![0]!.id;
    applyGrowthHypothesisActions(state, presenceId, "unrelated-support", [{ action: "support", hypothesisId, evidenceIds: ["unrelated-1", "unrelated-2"], confidence: "high" }]);
    expect(state.growthHypotheses![0]!.status).toBe("weakened");
    expect(state.growthHypotheses![0]!.supportingEvidenceIds).toEqual(["unrelated-1"]);
  });

  it("attributes measured outcomes directly to a source-backed template without invented decision targets", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const hypothesisId = "sandbox-template:session-1";
    state.growthHypotheses = [{
      id: hypothesisId,
      agentId: state.agent!.id,
      originatingPresenceId: presenceId,
      scope: "presence",
      statement: "A source-backed template is worth testing.",
      status: "testing",
      confidence: "low",
      patternIds: [],
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      derivedFrom: [],
      reviewHistory: [{ reviewId: "create", status: "testing", at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sandboxSessionId: "session-1",
      template: { title: "Test", body: "A reusable structure.", source: "observed_post", sourceMirrorObjectIds: ["source-1"], sourceCount: 1 },
    }];
    state.growthEvidenceRecords = ["outcome-1", "outcome-2"].map((id) => ({
      id,
      agentId: state.agent!.id,
      presenceId,
      kind: "WORLD_OUTCOME",
      claimScope: "presence",
      statement: "Measured outcome for the selected template.",
      sourceRefs: [{ kind: "publication_metric", id: `metric-${id}` }],
      verified: true,
      causalDecisionIds: [`decision-${id}`],
      learningHypothesisIds: [hypothesisId],
      sandboxSessionId: "session-1",
      createdAt: new Date().toISOString(),
    } satisfies GrowthEvidenceRecord));
    applyGrowthHypothesisActions(state, presenceId, "review-1", [{ action: "support", hypothesisId, evidenceIds: ["outcome-1"] }]);
    expect(state.growthHypotheses[0]?.status).toBe("weakened");
    applyGrowthHypothesisActions(state, presenceId, "review-2", [{ action: "support", hypothesisId, evidenceIds: ["outcome-1", "outcome-2"] }]);
    expect(state.growthHypotheses[0]?.status).toBe("supported");
  });

  it("decreases confidence on contradictory evidence and retires the pattern from retrieval", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    state.growthEvidenceRecords = [{ id: "contradiction", agentId: state.agent!.id, presenceId, kind: "WORLD_OUTCOME", claimScope: "presence", statement: "Verified counter-result", sourceRefs: [], verified: true, createdAt: new Date().toISOString() }];
    applyGrowthHypothesisActions(state, presenceId, "create-hypothesis", [{ action: "create", statement: "Proof-led originals help this audience.", scope: "presence", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 2 }], confidence: "high" }]);
    const hypothesisId = state.growthHypotheses![0]!.id;
    applyGrowthHypothesisActions(state, presenceId, "weaken-high", [{ action: "weaken", hypothesisId, evidenceIds: ["contradiction"] }]);
    expect(state.growthHypotheses![0]).toMatchObject({ status: "weakened", confidence: "medium", contradictingEvidenceIds: ["contradiction"] });
    applyGrowthHypothesisActions(state, presenceId, "weaken-medium", [{ action: "weaken", hypothesisId, evidenceIds: ["contradiction"] }]);
    expect(state.growthHypotheses![0]?.confidence).toBe("low");
    applyGrowthHypothesisActions(state, presenceId, "retire", [{ action: "retire", hypothesisId }]);
    expect(state.growthHypotheses![0]?.status).toBe("retired");
    expect(compileSocialStrategyContext(state, state.presence!, { invocation: "after retirement", objective: "share proof-led originals", availableActions: ["original_post"] }).retrievalRun.relevantGrowthHypothesisIds).not.toContain(hypothesisId);
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
      originExecutionId: `${id}-execution`,
    } satisfies OpenPresenceState["mirrorObjects"][number]);
    state.mirrorObjects = [mirror("quote-1", "quote"), mirror("quote-2", "quote"), mirror("repost-1", "repost"), mirror("repost-2", "repost")];
    const strategySelections = [
      ["quote-1", "quote", "social.x.v1.selective-amplification"],
      ["quote-2", "quote", "social.x.v1.selective-amplification"],
      ["repost-1", "repost", "social.x.v1.selective-amplification"],
      ["repost-2", "repost", "social.x.v1.selective-amplification"],
    ] as const;
    state.executions = strategySelections.map(([mirrorId, action]) => ({ id: `${mirrorId}-execution`, socialIntentId: `${mirrorId}-intent`, presenceId, affordance: `x.${action}`, mode: "auto", status: "succeeded", attempts: 1, idempotencyKey: `${mirrorId}-key`, createdAt: observedAt, updatedAt: observedAt, environment: "live" })) as never;
    state.socialDecisions = strategySelections.map(([mirrorId, action, patternId]) => ({ id: `${mirrorId}-decision`, agentId: state.agent!.id, presenceId, environment: "live", focalMirrorObjectIds: [mirrorId], decision: action, summary: `Selected ${action}.`, influences: [], socialIntentId: `${mirrorId}-intent`, socialStrategy: { retrievalRunId: `${mirrorId}-strategy-run`, consideredPatternIds: [patternId], selectedByAct: [{ act: action, patternId, mechanismId: "selective amplification" }] }, createdAt: observedAt })) as never;

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

    const patternPerformance = summarizeStrategyPatternPerformance(state, presenceId);
    expect(patternPerformance).toHaveLength(2);
    expect(patternPerformance.find((item) => item.action === "quote")).toMatchObject({ patternId: "social.x.v1.selective-amplification", mechanism: "selective amplification", samples: 2 });
    expect(patternPerformance.find((item) => item.action === "repost")).toMatchObject({ patternId: "social.x.v1.selective-amplification", mechanism: "selective amplification", samples: 2 });

    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "growth-mission-eval", objective: "Choose whether to quote or repost a high-signal AI builder post using measured audience engagement evidence.", availableActions: ["quote", "repost"] });
    expect(context.retrievalRun.relevantGrowthHypothesisIds).toContain("hypothesis-quote-over-repost");
    expect(context.prompt).toContain("Verified live publication performance by act");
    expect(context.prompt).toContain("quote: 2 verified publications");
    expect(context.prompt).toContain("repost: 2 verified publications");
    expect(context.prompt).toContain("Verified performance by explicitly selected strategy pattern");
    expect(context.prompt).toContain("quote · social.x.v1.selective-amplification");

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

describe("observed strategy learning", () => {
  it("persists a scoped, unproven lesson and retrieves it in a later decision", async () => {
    const { learnObservedSocialPattern } = await import("../lib/social-strategy");
    const state = createAgent(input);
    const presence = state.presence!;
    state.mirrorObjects.push({ id: "observed-showcase", presenceId: presence.id, bridgeId: "source", channelId: "x", externalRef: { type: "x.post", id: "123" }, objectType: "post", content: { text: "Share your developer tool and one problem it solves; I will try three." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "public", environment: presence.environment });
    // The selected source can be older than the automatic review window.
    state.mirrorObjects.unshift(...Array.from({ length: 45 }, (_, index) => ({ ...state.mirrorObjects.at(-1)!, id: `newer-${index}`, observedAt: new Date(Date.now() + 1000).toISOString() })));
    const learned = learnObservedSocialPattern(state, presence.id, { statement: "A developer tool showcase with specific feedback may encourage relevant participation; test reply quality.", mirrorObjectIds: ["observed-showcase"] });
    expect(learned.hypothesis).toMatchObject({ status: "testing", confidence: "low" });
    expect(learned.state.growthEvidenceRecords?.find(item => item.id.endsWith("observed-showcase"))).toMatchObject({ kind: "STRATEGY_OBSERVATION", verified: false });
    const later = compileSocialStrategyContext(JSON.parse(JSON.stringify(learned.state)), presence, { invocation: "later", objective: "developer tool showcase participation", availableActions: ["original_post"] });
    expect(later.retrievalRun.relevantGrowthHypothesisIds).toContain(learned.hypothesis.id);
    expect(later.prompt).toContain(learned.hypothesis.statement);
    expect(later.retrievalRun.consideredPatterns.map(item => item.id)).toContain("social.x.v1.community-showcase");
    expect(() => learnObservedSocialPattern(state, "another-presence", { statement: "Invented lesson", mirrorObjectIds: ["observed-showcase"] })).toThrow("observed public posts");
    expect(() => learnObservedSocialPattern(state, presence.id, { statement: "Invented lesson", mirrorObjectIds: ["missing"] })).toThrow("observed public posts");
    expect(learned.state.executions).toEqual(state.executions);
  });
});
