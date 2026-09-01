import { describe, expect, it } from "vitest";
import { applyGrowthHypothesisActions, compileSocialStrategyContext, ensureGrowthEvidenceRecords, legacyChannelStrategyGuidance, strategyUseFromDecision } from "../lib/social-strategy";
import { parseAgentSocialDecision } from "../lib/ai";
import { createAgent } from "../lib/runtime";
import type { GrowthEvidenceRecord } from "../lib/types";

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
});
