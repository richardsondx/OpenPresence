import { afterEach, describe, expect, it } from "vitest";
import { readStateSnapshot, writeState } from "../lib/db";
import {
  LearningCounterfactualError,
  hashLearningCheckpoint,
  projectLearningCounterfactual,
  type LearningCheckpoint,
  type LearningDecisionSituation,
} from "../lib/learning-counterfactual";
import { createAgent, createSandboxCheckpoint, forkSandboxCheckpoint, initialState, recordSocialDecision, restoreSandboxCheckpoint, startPlaygroundSession } from "../lib/runtime";
import { compileSocialStrategyContext, materializeSandboxOutcomeLearning, reconcileSandboxPerformanceLearning } from "../lib/social-strategy";
import { learningAdjustmentForPattern } from "../lib/learning-runtime";
import { captureLearningCheckpoint, learningStateForPresence } from "../lib/learning-runtime";
import { captureSandboxWorld, restoreSandboxWorld, sandboxWorldDigest } from "../lib/sandbox-replay";
import { generateAgentSocialDecision } from "../lib/ai";

afterEach(() => {
  writeState(initialState());
});

const situation: LearningDecisionSituation = {
  id: "situation-1",
  scope: "x:builders",
  candidates: [
    { id: "reply", action: "reply", baseScore: 1, strategyId: "useful-disagreement" },
    { id: "repost", action: "repost", baseScore: 2, strategyId: "selective-amplification" },
  ],
};

const checkpoint: LearningCheckpoint = {
  id: "checkpoint-2",
  capturedAt: "2026-09-16T12:00:00.000Z",
  parentCheckpointId: "checkpoint-1",
  parentCheckpointHash: "parent-hash",
  hypotheses: [{
    id: "reply-hypothesis",
    statement: "Specific builder replies create more useful conversations than broad amplification.",
    scope: "x:builders",
    confidence: 0.8,
    status: "supported",
    targets: [{ action: "reply", effect: 5 }],
  }],
  evidence: [{
    id: "reply-outcome",
    hypothesisId: "reply-hypothesis",
    polarity: "supporting",
    strength: 0.9,
    source: "verified-outcome",
  }],
};

const altered = {
  label: "contradicting replay",
  hypotheses: checkpoint.hypotheses,
  evidence: [{ ...checkpoint.evidence[0]!, polarity: "contradicting" as const }],
};

describe("pure learning counterfactual", () => {
  it("preserves mock public strategy attribution when a supplied pattern fits", async () => {
    const previousMock = process.env.OPENPRESENCE_AI_MOCK;
    process.env.OPENPRESENCE_AI_MOCK = "1";
    try {
    const state = startPlaygroundSession(createAgent({ name: "Mock attribution", description: "Preserve public learning attribution.", audience: "AI builders", mode: "agent", handle: "@mock_attribution", accent: "#7c3aed" }));
    const presence = state.presence!;
    const decision = await generateAgentSocialDecision(state, "Evaluate the current simulated X world and choose the smallest useful action for the unjudged post about a benchmark release.", ["reply", "repost", "quote", "like", "follow", "no_op"], { presence, operational: true, presenceId: presence.id, strategyContext: compileSocialStrategyContext(state, presence, { invocation: "public Sandbox verifier", objective: "benchmark release", availableActions: ["reply", "repost", "quote", "like", "follow"] }) });
    expect(decision.acts?.[0]).toEqual(expect.objectContaining({ strategyId: expect.any(String), mechanismId: expect.any(String) }));
    } finally {
      if (previousMock === undefined) delete process.env.OPENPRESENCE_AI_MOCK;
      else process.env.OPENPRESENCE_AI_MOCK = previousMock;
    }
  });

  it("materializes cautious session-scoped learning from two attributed Sandbox outcomes", () => {
    const state = startPlaygroundSession(createAgent({ name: "Runtime learning", description: "Learn from verified Sandbox outcomes.", audience: "AI builders", mode: "agent", handle: "@runtime_learning", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const strategyId = "social.x.v1.useful-disagreement";
    const decisions = ["intent-a", "intent-b"].map((socialIntentId, index) => ({
      id: `decision-${index + 1}`,
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "sandbox" as const,
      sessionId: session.id,
      focalMirrorObjectIds: [],
      decision: "reply" as const,
      summary: "A useful reply grounded in the observed conversation.",
      influences: [],
      socialIntentId,
      sandboxSessionId: session.id,
      socialStrategy: { retrievalRunId: `run-${index + 1}`, consideredPatternIds: [strategyId], selectedByAct: [{ act: "reply", patternId: strategyId, mechanismId: "useful disagreement" }] },
      createdAt: `2026-09-1${index + 1}T12:00:00.000Z`,
    }));
    state.socialDecisions = decisions;
    state.outcomes = decisions.map((decision, index) => ({ id: `outcome-${index + 1}`, socialIntentId: decision.socialIntentId!, executionId: `execution-${index + 1}`, presenceId: presence.id, status: "succeeded" as const, observedAt: decision.createdAt, metrics: {}, evidence: [], environment: "sandbox" as const, sessionId: session.id }));
    state.publicationMetricSnapshots = decisions.map((decision, index) => ({ id: `metric-${index + 1}`, presenceId: presence.id, mirrorObjectId: `mirror-${index + 1}`, observedAt: decision.createdAt, publicationAgeSeconds: 3600, impressions: 100 + index, likes: 10, source: "sandbox" as const, observationStatus: "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    state.growthEvidenceRecords = state.outcomes.map((outcome, index) => ({ id: `growth-evidence-${index + 1}`, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Verified simulated performance outcome.", sourceRefs: [{ kind: "publication_metric" as const, id: `metric-${index + 1}`, sourcePresenceId: presence.id, observedAt: outcome.observedAt }], verified: true, causalDecisionIds: [decisions[index]!.id], causalMirrorObjectIds: [], sandboxSessionId: session.id, mediaProfile: { mode: "media" as const, semanticKind: "chart" as const, visualRole: "evidence" as const, decorative: false, fit: "relevant" as const, relationship: "proof" as const }, createdAt: outcome.observedAt }));

    materializeSandboxOutcomeLearning(state, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    const hypothesis = state.growthHypotheses?.find((item) => item.id === `sandbox-learning:${session.id}:${strategyId}`);
    expect(hypothesis).toMatchObject({ status: "supported", confidence: "low", sandboxSessionId: session.id, decisionTargets: [{ strategyId, effect: 0.75 }] });
    expect(hypothesis?.mediaProfiles).toEqual([expect.objectContaining({ mode: "media", fit: "relevant", relationship: "proof", semanticKind: "chart" })]);
    expect(hypothesis?.supportingEvidenceIds).toHaveLength(2);

    const later = compileSocialStrategyContext(state, presence, { invocation: "later Sandbox decision", objective: "AI builder conversation", availableActions: ["reply", "repost"], sandboxSessionId: session.id });
    expect(later.retrievalRun.relevantGrowthHypothesisIds).toContain(hypothesis?.id);
    expect(later.prompt).toContain("media evidence: media/relevant/proof/chart");
    expect(learningAdjustmentForPattern(state, presence, strategyId, session.id)).toBeGreaterThan(0);
  });

  it("changes the later candidate allocation only when synthetic measured learning is retained", () => {
    const state = startPlaygroundSession(createAgent({ name: "Allocation ablation", description: "Compare later strategy allocation with measured learning present and removed.", audience: "AI builders", mode: "agent", handle: "@allocation_ablation", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const learnedPattern = "social.x.v1.selective-amplification";
    const baselinePattern = "social.x.v1.useful-disagreement";
    const evidence = ["allocation-evidence-a", "allocation-evidence-b"].map((id, index) => ({
      id,
      agentId: state.agent!.id,
      presenceId: presence.id,
      kind: "WORLD_OUTCOME" as const,
      claimScope: "presence" as const,
      statement: "Synthetic verified outcome fixture for the selected action family.",
      sourceRefs: [{ kind: "publication_metric" as const, id: `allocation-metric-${index}` }],
      verified: true,
      causalDecisionIds: [`allocation-decision-${index}`],
      sandboxSessionId: session.id,
      createdAt: `2026-09-1${index + 1}T12:00:00.000Z`,
    }));
    state.growthEvidenceRecords = evidence;
    state.socialDecisions = evidence.map((record, index) => ({
      id: record.causalDecisionIds![0]!,
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "sandbox" as const,
      sessionId: session.id,
      sandboxSessionId: session.id,
      focalMirrorObjectIds: [],
      decision: "repost" as const,
      summary: "Synthetic measured action allocation fixture.",
      influences: [],
      socialIntentId: `allocation-intent-${index}`,
      socialStrategy: {
        retrievalRunId: `allocation-run-${index}`,
        consideredPatternIds: [learnedPattern, baselinePattern],
        selectedByAct: [{ act: "repost", patternId: learnedPattern }],
      },
      createdAt: record.createdAt,
    }));
    state.outcomes = evidence.map((record, index) => ({
      id: `allocation-outcome-${index}`,
      socialIntentId: `allocation-intent-${index}`,
      executionId: `allocation-execution-${index}`,
      presenceId: presence.id,
      status: "succeeded" as const,
      observedAt: record.createdAt,
      metrics: {},
      evidence: [],
      environment: "sandbox" as const,
      sessionId: session.id,
    }));
    state.publicationMetricSnapshots = evidence.map((record, index) => ({ id: `allocation-metric-${index}`, presenceId: presence.id, mirrorObjectId: `allocation-mirror-${index}`, observedAt: record.createdAt, publicationAgeSeconds: 3600, impressions: 100 + index, likes: 10, source: "sandbox" as const, observationStatus: "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    materializeSandboxOutcomeLearning(state, presence.id, session.id, "2026-09-17T12:00:00.000Z");

    const retained = compileSocialStrategyContext(state, presence, { invocation: "allocation ablation", objective: "choose a useful amplification", availableActions: ["repost"], sandboxSessionId: session.id });
    const removed = structuredClone(state);
    removed.growthHypotheses = removed.growthHypotheses?.filter((hypothesis) => hypothesis.sandboxSessionId !== session.id);
    const removedContext = compileSocialStrategyContext(removed, removed.presence!, { invocation: "allocation ablation", objective: "choose a useful amplification", availableActions: ["repost"], sandboxSessionId: session.id });

    expect(retained.retrievalRun.relevantGrowthHypothesisIds).toContain(`sandbox-learning:${session.id}:${learnedPattern}`);
    expect(retained.retrievalRun.consideredPatterns[0]?.id).toBe(learnedPattern);
    expect(removedContext.retrievalRun.relevantGrowthHypothesisIds).not.toContain(`sandbox-learning:${session.id}:${learnedPattern}`);
    expect(learningAdjustmentForPattern(state, presence, learnedPattern, session.id)).toBeGreaterThan(0);
    expect(learningAdjustmentForPattern(removed, removed.presence!, learnedPattern, session.id)).toBe(0);
  });

  it.each(["missing", "unavailable", "zero", "one-measured-decision", "wrong-mirror-session", "wrong-presence-snapshot"])("rejects %s metric support despite two successful decisions", (mode) => {
    const state = startPlaygroundSession(createAgent({ name: "Evidence boundary", description: "Reject unsupported metric lineage.", audience: "AI builders", mode: "agent", handle: "@evidence_boundary", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const timestamp = "2026-09-11T12:00:00.000Z";
    state.socialDecisions = [0, 1].map((index) => ({ id: `decision-${index}`, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, sessionId: session.id, sandboxSessionId: session.id, focalMirrorObjectIds: [], decision: "reply" as const, summary: "A distinct decision", influences: [], socialIntentId: `intent-${index}`, socialStrategy: { retrievalRunId: `run-${index}`, consideredPatternIds: ["social.x.v1.useful-disagreement"], selectedByAct: [{ act: "reply", patternId: "social.x.v1.useful-disagreement" }] }, createdAt: timestamp }));
    state.outcomes = [0, 1].map((index) => ({ id: `outcome-${index}`, socialIntentId: `intent-${index}`, executionId: `execution-${index}`, presenceId: presence.id, status: "succeeded" as const, observedAt: timestamp, metrics: {}, evidence: [], environment: "sandbox" as const, sessionId: session.id }));
    state.growthEvidenceRecords = [0, 1].map((index) => ({ id: `evidence-${index}`, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Synthetic evidence boundary fixture.", sourceRefs: [{ kind: "publication_metric" as const, id: `metric-${index}`, sourcePresenceId: presence.id }], verified: true, causalDecisionIds: [`decision-${mode === "one-measured-decision" ? 0 : index}`], sandboxSessionId: session.id, createdAt: timestamp }));
    state.publicationMetricSnapshots = mode === "missing" ? [] : [0, 1].map((index) => ({ id: `metric-${index}`, presenceId: mode === "wrong-presence-snapshot" && index === 1 ? "other-presence" : presence.id, mirrorObjectId: `mirror-${index}`, observedAt: timestamp, publicationAgeSeconds: 3600, impressions: mode === "zero" ? 0 : 100, source: "sandbox" as const, observationStatus: mode === "unavailable" ? "unavailable" as const : "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot, index) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: mode === "wrong-mirror-session" && index === 1 ? "other-session" : session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    materializeSandboxOutcomeLearning(state, presence.id, session.id, timestamp);
    expect(state.growthHypotheses?.filter((item) => item.sandboxSessionId === session.id)).toHaveLength(0);
  });

  it("preserves the selected non-post action family in Sandbox learning targets", () => {
    const state = startPlaygroundSession(createAgent({ name: "Action-family learning", description: "Keep learning attached to the act that was measured.", audience: "AI builders", mode: "agent", handle: "@action_family_learning", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const cases = [
      { patternId: "social.x.v1.proof-led-original", actions: ["quote", "quote"] },
      { patternId: "social.x.v1.selective-amplification", actions: ["repost", "follow"] },
      { patternId: "social.x.v1.quiet-appreciation", actions: ["like", "follow"] },
    ];
    const decisions = cases.flatMap(({ patternId, actions }) => actions.map((action, index) => ({
      id: `action-family-decision-${patternId}-${index}`,
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "sandbox" as const,
      sessionId: session.id,
      focalMirrorObjectIds: [],
      decision: action as "quote",
      summary: "Measured action-family decision.",
      influences: [],
      socialIntentId: `action-family-intent-${patternId}-${index}`,
      socialStrategy: { retrievalRunId: `action-family-run-${patternId}-${index}`, consideredPatternIds: [patternId], selectedByAct: [{ act: action, patternId }] },
      createdAt: `2026-09-${10 + index}T12:00:00.000Z`,
    })));
    state.socialDecisions = decisions;
    state.outcomes = decisions.map((decision, index) => ({ id: `action-family-outcome-${index}`, socialIntentId: decision.socialIntentId!, executionId: `action-family-execution-${index}`, presenceId: presence.id, status: "succeeded" as const, observedAt: decision.createdAt, metrics: {}, evidence: [], environment: "sandbox" as const, sessionId: session.id }));
    state.publicationMetricSnapshots = decisions.map((decision, index) => ({ id: `action-family-metric-${index}`, presenceId: presence.id, mirrorObjectId: `action-family-mirror-${index}`, observedAt: decision.createdAt, publicationAgeSeconds: 3600, impressions: 100 + index, likes: 10, source: "sandbox" as const, observationStatus: "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    state.growthEvidenceRecords = decisions.map((decision, index) => ({ id: `action-family-evidence-${index}`, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Measured Sandbox action-family outcome.", sourceRefs: [{ kind: "publication_metric" as const, id: `action-family-metric-${index}`, sourcePresenceId: presence.id, observedAt: decision.createdAt }], verified: true, causalDecisionIds: [decision.id], causalMirrorObjectIds: [], sandboxSessionId: session.id, createdAt: decision.createdAt }));

    materializeSandboxOutcomeLearning(state, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    const targetActions = (patternId: string) => state.growthHypotheses?.find((hypothesis) => hypothesis.patternIds.includes(patternId))?.decisionTargets?.map((target) => target.action).sort();
    expect(targetActions("social.x.v1.proof-led-original")).toEqual(["quote"]);
    expect(targetActions("social.x.v1.selective-amplification")).toEqual(["follow", "repost"]);
    expect(targetActions("social.x.v1.quiet-appreciation")).toEqual(["follow", "like"]);
  });

  it("weakens a Sandbox hypothesis when a measured alternative materially wins", () => {
    const state = startPlaygroundSession(createAgent({ name: "Contradictory learning", description: "Retire stale strategy confidence.", audience: "AI builders", mode: "agent", handle: "@contradictory_learning", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const patterns = ["social.x.v1.proof-led-original", "social.x.v1.selective-amplification"];
    const decisions = patterns.flatMap((patternId, patternIndex) => [0, 1].map((sampleIndex) => ({
      id: `decision-${patternIndex}-${sampleIndex}`,
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "sandbox" as const,
      sessionId: session.id,
      focalMirrorObjectIds: [],
      decision: "original_post" as const,
      summary: "Measured strategy decision.",
      influences: [],
      socialIntentId: `intent-${patternIndex}-${sampleIndex}`,
      socialStrategy: { retrievalRunId: `run-${patternIndex}-${sampleIndex}`, consideredPatternIds: [patternId], selectedByAct: [{ act: "original_post", patternId }] },
      createdAt: `2026-09-1${sampleIndex + 1}T12:00:00.000Z`,
    })));
    state.socialDecisions = decisions;
    state.socialDecisions.forEach((decision, index) => { decision.socialIntentId = `intent-${index}`; });
    state.outcomes = decisions.map((decision, index) => ({ id: `outcome-${index}`, socialIntentId: decision.socialIntentId!, executionId: `execution-${index}`, presenceId: presence.id, status: "succeeded" as const, observedAt: decision.createdAt, metrics: {}, evidence: [], environment: "sandbox" as const, sessionId: session.id }));
    state.publicationMetricSnapshots = decisions.map((decision, index) => ({ id: `metric-${index}`, presenceId: presence.id, mirrorObjectId: `mirror-${index}`, observedAt: decision.createdAt, publicationAgeSeconds: 3600, impressions: index < 2 ? 100 : 800, likes: index < 2 ? 2 : 20, source: "sandbox" as const, observationStatus: "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    state.growthEvidenceRecords = state.publicationMetricSnapshots.map((snapshot, index) => ({ id: `evidence-${index}`, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Measured Sandbox performance.", sourceRefs: [{ kind: "publication_metric" as const, id: snapshot.id, sourcePresenceId: presence.id, observedAt: snapshot.observedAt }], verified: true, causalDecisionIds: [decisions[index]!.id], causalMirrorObjectIds: [], sandboxSessionId: session.id, createdAt: snapshot.observedAt }));
    const hypothesisId = `sandbox-learning:${session.id}:${patterns[0]}`;
    state.growthHypotheses = [{ id: hypothesisId, agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "Proof-led originals may work for this audience.", status: "supported", confidence: "high", patternIds: [patterns[0]!], supportingEvidenceIds: ["evidence-0", "evidence-1"], contradictingEvidenceIds: [], derivedFrom: [], decisionTargets: [{ strategyId: patterns[0], effect: 1.5 }], reviewHistory: [], createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z", sandboxSessionId: session.id }];

    const mixedAge = structuredClone(state);
    mixedAge.publicationMetricSnapshots.forEach((snapshot, index) => { if (index >= 2) snapshot.publicationAgeSeconds = 7200; });
    reconcileSandboxPerformanceLearning(mixedAge, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    expect(mixedAge.growthHypotheses![0]?.status).toBe("supported");
    reconcileSandboxPerformanceLearning(state, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    const hypothesis = state.growthHypotheses[0]!;
    expect(hypothesis.status).toBe("weakened");
    expect(hypothesis.confidence).toBe("low");
    expect(hypothesis.contradictingEvidenceIds).toEqual(["evidence-0", "evidence-1"]);
    expect(learningAdjustmentForPattern(state, presence, patterns[0]!, session.id)).toBe(0);
    expect(learningStateForPresence(state, presence, session.id).hypotheses).toHaveLength(0);

    const zeroTie = structuredClone(state);
    zeroTie.growthHypotheses![0]!.status = "supported";
    zeroTie.growthHypotheses![0]!.confidence = "high";
    zeroTie.growthHypotheses![0]!.contradictingEvidenceIds = [];
    zeroTie.publicationMetricSnapshots.forEach((snapshot) => { snapshot.impressions = 0; snapshot.likes = 0; });
    reconcileSandboxPerformanceLearning(zeroTie, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    expect(zeroTie.growthHypotheses![0]?.status).toBe("supported");
  });

  it("retires a Sandbox hypothesis after repeated measured contradictions", () => {
    const state = startPlaygroundSession(createAgent({ name: "Retirement learning", description: "Retire stale strategy confidence.", audience: "AI builders", mode: "agent", handle: "@retirement_learning", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    const decisions = [0, 1, 2, 3].map((sampleIndex) => ({
      id: `retire-own-${sampleIndex}`, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, sessionId: session.id,
      socialIntentId: `retire-intent-own-${sampleIndex}`,
      focalMirrorObjectIds: [], decision: "original_post" as const, summary: "Measured strategy decision.", influences: [],
      socialStrategy: { retrievalRunId: `retire-own-run-${sampleIndex}`, consideredPatternIds: ["social.x.v1.proof-led-original"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original" }] },
      createdAt: `2026-09-${10 + sampleIndex}T12:00:00.000Z`,
    })).concat([0, 1].map((sampleIndex) => ({
      id: `retire-alt-${sampleIndex}`, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, sessionId: session.id,
      socialIntentId: `retire-intent-alt-${sampleIndex}`,
      focalMirrorObjectIds: [], decision: "original_post" as const, summary: "Measured alternative decision.", influences: [],
      socialStrategy: { retrievalRunId: `retire-alt-run-${sampleIndex}`, consideredPatternIds: ["social.x.v1.selective-amplification"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.selective-amplification" }] },
      createdAt: `2026-09-${14 + sampleIndex}T12:00:00.000Z`,
    })));
    state.socialDecisions = decisions;
    state.outcomes = decisions.map((decision, index) => ({ id: `retire-outcome-${index}`, socialIntentId: decision.socialIntentId!, executionId: `retire-execution-${index}`, presenceId: presence.id, status: "succeeded" as const, observedAt: decision.createdAt, metrics: {}, evidence: [], environment: "sandbox" as const, sessionId: session.id }));
    state.publicationMetricSnapshots = decisions.map((decision, index) => ({ id: `retire-metric-${index}`, presenceId: presence.id, mirrorObjectId: `retire-mirror-${index}`, observedAt: decision.createdAt, publicationAgeSeconds: 3600, impressions: index < 4 ? 100 : 800, likes: index < 4 ? 2 : 20, source: "sandbox" as const, observationStatus: "observed" as const }));
    state.mirrorObjects.push(...state.publicationMetricSnapshots.map((snapshot) => ({ id: snapshot.mirrorObjectId, presenceId: presence.id, sessionId: session.id, environment: "sandbox", visibility: "public", objectType: "post", observedAt: snapshot.observedAt, occurredAt: snapshot.observedAt, content: { text: "Measured fixture" } } as never)));
    state.growthEvidenceRecords = state.publicationMetricSnapshots.map((snapshot, index) => ({ id: `retire-evidence-${index}`, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Measured Sandbox performance.", sourceRefs: [{ kind: "publication_metric" as const, id: snapshot.id, sourcePresenceId: presence.id, observedAt: snapshot.observedAt }], verified: true, causalDecisionIds: [decisions[index]!.id], causalMirrorObjectIds: [], sandboxSessionId: session.id, createdAt: snapshot.observedAt }));
    state.growthHypotheses = [{ id: `sandbox-learning:${session.id}:social.x.v1.proof-led-original`, agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "Proof-led originals may work.", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], supportingEvidenceIds: [], contradictingEvidenceIds: [], derivedFrom: [], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 1.5 }], reviewHistory: [], createdAt: decisions[0]!.createdAt, updatedAt: decisions[0]!.createdAt, sandboxSessionId: session.id }];

    reconcileSandboxPerformanceLearning(state, presence.id, session.id, "2026-09-17T12:00:00.000Z");
    expect(state.growthHypotheses[0]?.status).toBe("retired");
    expect(state.growthHypotheses[0]?.confidence).toBe("low");
    expect(learningAdjustmentForPattern(state, presence, "social.x.v1.proof-led-original", session.id)).toBe(0);
  });

  it("projects present, removed, and altered learning deterministically", () => {
    const result = projectLearningCounterfactual({ checkpoint, situation, altered });

    expect(result.learningClaim).toEqual({ status: "demonstrated", basis: "present_vs_removed" });
    expect(result.projections.present.decision.action).toBe("reply");
    expect(result.projections.removed.decision.action).toBe("repost");
    expect(result.projections.altered.decision.action).toBe("repost");
    expect(result.comparisons.presentVsRemoved.decisionsDiffer).toBe(true);
    expect(result.comparisons.presentVsAltered.decisionsDiffer).toBe(true);
    expect(result.projections.present.learningHash).not.toBe(result.projections.removed.learningHash);
    expect(result.projections.present.learningHash).not.toBe(result.projections.altered.learningHash);
  });

  it("persists checkpoint hashes and derived-variant parent linkage", () => {
    const result = projectLearningCounterfactual({ checkpoint, situation, altered });

    expect(result.checkpoint).toEqual({
      id: checkpoint.id,
      hash: hashLearningCheckpoint(checkpoint),
      parentCheckpointId: "checkpoint-1",
      parentCheckpointHash: "parent-hash",
    });
    expect(result.projections.removed).toMatchObject({
      parentCheckpointId: checkpoint.id,
      parentCheckpointHash: result.checkpoint.hash,
    });
    expect(result.projections.altered).toMatchObject({
      parentCheckpointId: checkpoint.id,
      parentCheckpointHash: result.checkpoint.hash,
    });
    expect(result.lineage).toEqual({
      presentCheckpointId: checkpoint.id,
      presentCheckpointHash: result.checkpoint.hash,
      removedParentCheckpointId: checkpoint.id,
      alteredParentCheckpointId: checkpoint.id,
    });
  });

  it("is stable across equivalent input ordering and does not mutate inputs", () => {
    const before = JSON.stringify({ checkpoint, situation, altered });
    const result = projectLearningCounterfactual({ checkpoint, situation, altered });
    const reordered = projectLearningCounterfactual({
      checkpoint: { ...checkpoint, hypotheses: [...checkpoint.hypotheses].reverse(), evidence: [...checkpoint.evidence].reverse() },
      situation: { ...situation, candidates: [...situation.candidates].reverse() },
      altered: { ...altered, hypotheses: [...altered.hypotheses].reverse(), evidence: [...altered.evidence].reverse() },
    });

    expect(reordered.projections.present.decisionHash).toBe(result.projections.present.decisionHash);
    expect(reordered.checkpoint.hash).toBe(result.checkpoint.hash);
    expect(JSON.stringify({ checkpoint, situation, altered })).toBe(before);
  });

  it("refuses an unsupported learning claim when the selected decision is unchanged", () => {
    const noDecisionChange = {
      ...checkpoint,
      hypotheses: [{ ...checkpoint.hypotheses[0]!, targets: [{ action: "reply", effect: 0.1 }] }],
    };

    expect(() => projectLearningCounterfactual({ checkpoint: noDecisionChange, situation, altered: { hypotheses: [], evidence: [] } })).toThrow(LearningCounterfactualError);
    const result = projectLearningCounterfactual({
      checkpoint: noDecisionChange,
      situation,
      altered: { hypotheses: [], evidence: [] },
      unchangedDecisionExplanation: "The evidence only changes confidence; the same action remains best.",
    });

    expect(result.projections.present.decision.action).toBe("repost");
    expect(result.projections.removed.decision.action).toBe("repost");
    expect(result.comparisons.presentVsRemoved.scoresDiffer).toBe(false);
    expect(result.learningClaim).toEqual({
      status: "not_demonstrated",
      basis: "present_vs_removed",
      explanation: "The evidence only changes confidence; the same action remains best.",
    });
  });

  it("rejects malformed evidence instead of silently projecting decorative learning", () => {
    expect(() => projectLearningCounterfactual({
      checkpoint: { ...checkpoint, evidence: [{ ...checkpoint.evidence[0]!, hypothesisId: "missing" }] },
      situation,
      altered,
    })).toThrow(/references missing hypothesis/);
  });
});

describe("runtime learning boundary", () => {
  it("retains fork-local strategy attribution on Sandbox decisions", () => {
    let state = startPlaygroundSession(createAgent({ name: "Sandbox strategy lineage", description: "Keep learning tied to the strategy that was actually selected.", audience: "AI builders", mode: "agent", handle: "@sandbox_strategy_lineage", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    state = recordSocialDecision(state, {
      presenceId: presence.id,
      sessionId: session.id,
      decision: "reply",
      acts: [{ decision: "reply", strategyId: "social.x.v1.useful-disagreement", mechanismId: "useful disagreement" }],
      summary: "A useful disagreement about an observed research claim.",
      origin: { kind: "self_directed_discovery", refId: session.id },
    });
    expect(state.socialDecisions[0]?.socialStrategy?.selectedByAct).toEqual(expect.arrayContaining([expect.objectContaining({ act: "reply", patternId: "social.x.v1.useful-disagreement" })]));
  });

  it("keeps the real multi-action decision surface in the persisted counterfactual", () => {
    let state = startPlaygroundSession(createAgent({ name: "Action-faithful learning", description: "Preserve action choices in learning evidence.", audience: "AI builders", mode: "agent", handle: "@action_faithful", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    state = recordSocialDecision(state, {
      presenceId: presence.id,
      sessionId: session.id,
      decision: "quote",
      acts: [{ decision: "repost" }, { decision: "follow" }],
      summary: "Choose among several justified actions for this research post.",
      origin: { kind: "publishing_initiative" },
    });
    const candidates = state.learningCounterfactuals?.[0]?.result.projections.present.rankedCandidates ?? [];
    expect(candidates.map((candidate) => candidate.action)).toEqual(expect.arrayContaining(["quote", "repost", "follow"]));
    expect(candidates.every((candidate) => candidate.action !== "original_post")).toBe(true);
  });

  it("uses the actual allowed action surface when the selected act is singular", () => {
    let state = startPlaygroundSession(createAgent({ name: "Allowed action surface", description: "Keep public learning ablations honest.", audience: "AI builders", mode: "agent", handle: "@allowed_action_surface", accent: "#7c3aed" }));
    const presence = state.presence!;
    const session = state.playgroundSessions[0]!;
    state = recordSocialDecision(state, {
      presenceId: presence.id,
      sessionId: session.id,
      decision: "repost",
      summary: "Evaluate this high-signal architecture post.",
      counterfactualActions: ["repost", "quote", "follow"],
      origin: { kind: "self_directed_discovery", refId: session.id },
    });
    const candidates = state.learningCounterfactuals?.[0]?.result.projections.present.rankedCandidates ?? [];
    expect(candidates.map((candidate) => candidate.action)).toEqual(expect.arrayContaining(["repost", "quote", "follow"]));
  });

  it("replays a persisted Sandbox checkpoint with learning retained versus removed", () => {
    let state = startPlaygroundSession(createAgent({ name: "Sandbox learning replay", description: "A paired-world learning fixture.", audience: "AI builders", mode: "agent", handle: "@sandbox_learning_replay", accent: "#7c3aed" }));
    const source = state.playgroundSessions[0]!;
    const presence = state.presence!;
    const strategyId = "social.x.v1.useful-disagreement";
    const hypothesisId = "sandbox-learning-hypothesis";
    const evidence = ["sandbox-outcome-a", "sandbox-outcome-b"].map((id, index) => ({ id, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Verified proof-led outcome", sourceRefs: [], verified: true, causalDecisionIds: [`sandbox-decision-${index + 1}`], createdAt: `2026-09-1${index + 1}T12:00:00.000Z` }));
    state.growthEvidenceRecords = evidence;
    state.socialDecisions = evidence.map((item, index) => ({ id: `sandbox-decision-${index + 1}`, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, sessionId: source.id, focalMirrorObjectIds: [], decision: "original_post" as const, summary: "Proof-led decision", influences: [], socialStrategy: { retrievalRunId: `sandbox-run-${index + 1}`, consideredPatternIds: [strategyId], selectedByAct: [{ act: "original_post", patternId: strategyId }] }, createdAt: item.createdAt }));
    state.growthHypotheses = [{ id: hypothesisId, agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", channelId: presence.channel, statement: "Useful disagreement helps this audience.", status: "supported", confidence: "high", patternIds: [strategyId], decisionTargets: [{ strategyId, action: "reply", effect: 10 }], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }];

    state = createSandboxCheckpoint(state, source.id, "after learning event");
    const checkpoint = state.sandboxCheckpoints?.[0];
    expect(checkpoint).toBeDefined();
    if (!checkpoint) throw new Error("Expected a learning checkpoint.");
    state = forkSandboxCheckpoint(state, source.id, checkpoint.id);
    const fork = state.playgroundSessions.find((item) => item.id !== source.id && item.source === "replay")!;
    const forkLearning = learningStateForPresence(state, presence, fork.id);
    expect(forkLearning.hypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience.", targets: expect.arrayContaining([expect.objectContaining({ strategyId })]) })]));
    const removedLearningState = forkSandboxCheckpoint(state, source.id, checkpoint.id, { learning: "removed" });
    const removedFork = removedLearningState.playgroundSessions.find((item) => item.id !== source.id && item.id !== fork.id && item.source === "replay")!;
    expect(removedFork).toBeDefined();
    expect(learningStateForPresence(removedLearningState, presence, removedFork.id).hypotheses).toEqual([]);
    expect((state.growthHypotheses ?? []).filter((item) => (item as typeof item & { sandboxSessionId?: string }).sandboxSessionId === fork.id)).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience." })]));
    const freshSourceSnapshot = captureSandboxWorld(state, source.id);
    expect(freshSourceSnapshot.learning?.growthHypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ id: hypothesisId })]));
    expect(freshSourceSnapshot.learning?.growthHypotheses?.some((item) => (item as { sandboxSessionId?: string }).sandboxSessionId)).toBe(false);
    const restoredSource = restoreSandboxCheckpoint(state, source.id, checkpoint.id);
    expect(learningStateForPresence(restoredSource, presence, fork.id).hypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience." })]));
    const forkCheckpointState = createSandboxCheckpoint(state, fork.id, "fork replay checkpoint");
    const forkCheckpoint = forkCheckpointState.sandboxCheckpoints?.find((item) => item.sessionId === fork.id && item.label === "fork replay checkpoint");
    expect(forkCheckpoint).toBeDefined();
    if (!forkCheckpoint) throw new Error("Expected a fork learning checkpoint.");
    const restoredFork = restoreSandboxCheckpoint(forkCheckpointState, fork.id, forkCheckpoint.id);
    const forkHypothesisIds = restoredFork.growthHypotheses?.filter((item) => (item as typeof item & { sandboxSessionId?: string }).sandboxSessionId === fork.id).map((item) => item.id) ?? [];
    expect(new Set(forkHypothesisIds).size).toBe(forkHypothesisIds.length);
    const worldA = structuredClone(state);
    const worldB = structuredClone(state);
    worldA.playgroundSessions = worldA.playgroundSessions.filter((item) => item.id === fork.id);
    worldB.playgroundSessions = worldB.playgroundSessions.filter((item) => item.id === fork.id);
    const branchSnapshotA = captureSandboxWorld(worldA, fork.id);
    const branchSnapshotB = captureSandboxWorld(worldB, fork.id);
    const branchLearning = learningStateForPresence(worldA, presence);
    const learningSnapshotB = { ...structuredClone(branchSnapshotA), learning: { ...structuredClone(branchSnapshotA.learning!), growthHypotheses: [], growthEvidenceRecords: [], learningCheckpoints: [], learningCounterfactuals: [] } };
    learningSnapshotB.digest = sandboxWorldDigest(learningSnapshotB);
    const emptyLearningState = structuredClone(worldB);
    emptyLearningState.growthHypotheses = [];
    emptyLearningState.growthEvidenceRecords = [];
    emptyLearningState.learningCheckpoints = [];
    emptyLearningState.learningCounterfactuals = [];
    const restoredA = restoreSandboxWorld(emptyLearningState, JSON.parse(JSON.stringify(branchSnapshotA)), { restoreLearning: true });
    const restoredB = restoreSandboxWorld(emptyLearningState, JSON.parse(JSON.stringify(learningSnapshotB)), { restoreLearning: true });
    const removedLearning = learningStateForPresence(restoredB, presence);
    const learningCheckpoint = captureLearningCheckpoint(restoredA, presence, "2026-09-16T12:30:00.000Z").checkpoint;
    const situation: LearningDecisionSituation = { id: `paired:${fork.id}`, scope: presence.id, candidates: [{ id: "reply", action: "reply", baseScore: 1, strategyId }, { id: "repost", action: "repost", baseScore: 2, strategyId: "social.x.v1.selective-amplification" }] };
    const replay = projectLearningCounterfactual({ checkpoint: learningCheckpoint, situation, altered: { label: "World B without retained learning", hypotheses: removedLearning.hypotheses, evidence: removedLearning.evidence } });
    const runtimeA = compileSocialStrategyContext(restoredA, presence, { invocation: "paired-world later decision", objective: "neutral situation", availableActions: ["reply"] });
    const runtimeB = compileSocialStrategyContext(restoredB, presence, { invocation: "paired-world later decision", objective: "neutral situation", availableActions: ["reply"] });

    expect(fork).toBeDefined();
    expect(branchSnapshotB).toEqual(branchSnapshotA);
    expect(branchLearning.hypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ id: hypothesisId })]));
    expect(removedLearning).toEqual({ hypotheses: [], evidence: [] });
    expect(replay.learningClaim.status).toBe("demonstrated");
    expect(replay.projections.present.decision.action).toBe("reply");
    expect(replay.projections.removed.decision.action).toBe("repost");
    expect(replay.comparisons.presentVsRemoved.decisionsDiffer).toBe(true);
    expect(replay.lineage.presentCheckpointId).toBe(learningCheckpoint.id);
    expect(runtimeA.retrievalRun.consideredPatterns[0]?.id).toBe(strategyId);
    expect(runtimeB.retrievalRun.consideredPatterns[0]?.id).not.toBe(strategyId);
  });

  it("persists a checkpoint comparison from a real strategy decision and requires repeated world outcomes", () => {
    const state = createAgent({ name: "Learning fixture", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@learning_fixture", accent: "#7c3aed" });
    const presence = state.presence!;
    const hypothesisId = "growth-hypothesis:runtime-learning";
    const evidence = ["world-outcome-1", "world-outcome-2"].map((id, index) => ({ id, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: `Verified outcome ${index + 1}`, sourceRefs: [], verified: true, causalDecisionIds: [`decision-${index + 1}`], createdAt: `2026-09-1${index + 1}T12:00:00.000Z` }));
    state.socialDecisions = evidence.map((item, index) => ({ id: `decision-${index + 1}`, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, focalMirrorObjectIds: [], decision: "original_post" as const, summary: "A proof-led original", influences: [], socialStrategy: { retrievalRunId: `run-${index + 1}`, consideredPatternIds: ["social.x.v1.proof-led-original"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original", mechanismId: "proof-led original" }] }, createdAt: item.createdAt }));
    state.growthEvidenceRecords = evidence;
    state.growthHypotheses = [{ id: hypothesisId, agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", channelId: presence.channel, statement: "Proof-led original ideas are more useful for this audience.", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", action: "original_post", effect: 1 }], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }];

    const next = recordSocialDecision(state, { presenceId: presence.id, decision: "original_post", summary: "Teach AI builders from concrete evidence." });
    const comparison = next.learningCounterfactuals?.[0];

    expect(next.learningCheckpoints).toHaveLength(1);
    expect(comparison?.checkpointId).toBe(next.learningCheckpoints?.[0]?.id);
    expect(comparison?.result.checkpoint.hash).toBe(next.learningCheckpoints?.[0]?.hash);
    expect(comparison?.result.projections.present.decision.strategyId).toBe("social.x.v1.proof-led-original");
    expect(comparison?.result.learningClaim.status).toBe("demonstrated");
  });

  it("does not let one outcome become a decision-changing rule", () => {
    const state = createAgent({ name: "Small sample fixture", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@small_sample", accent: "#7c3aed" });
    const presence = state.presence!;
    state.growthEvidenceRecords = [{ id: "one-outcome", agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME", claimScope: "presence", statement: "One verified outcome", sourceRefs: [], verified: true, createdAt: "2026-09-16T12:00:00.000Z" }];
    state.growthHypotheses = [{ id: "one-outcome-hypothesis", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", channelId: presence.channel, statement: "A proof-led post may help.", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", action: "original_post", effect: 1 }], supportingEvidenceIds: ["one-outcome"], contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: "2026-09-16T12:00:00.000Z", updatedAt: "2026-09-16T12:00:00.000Z" }];

    const next = recordSocialDecision(state, { presenceId: presence.id, decision: "original_post", summary: "Consider a useful idea." });
    expect(next.learningCheckpoints?.[0]?.hypothesisIds).toEqual([]);
    expect(next.learningCounterfactuals?.[0]?.result.learningClaim.status).toBe("not_demonstrated");
  });

  it("requires independent causal decisions and retires stale evidence", () => {
    const state = createAgent({ name: "Learning hygiene", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@learning_hygiene", accent: "#7c3aed" });
    const presence = state.presence!;
    const stale = { id: "stale", agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Old outcome", sourceRefs: [], verified: true, causalDecisionIds: ["same-decision"], createdAt: "2024-01-01T00:00:00.000Z" };
    const duplicateA = { ...stale, id: "duplicate-a", createdAt: new Date().toISOString() };
    const duplicateB = { ...duplicateA, id: "duplicate-b" };
    state.growthEvidenceRecords = [duplicateA, duplicateB, stale];
    state.socialDecisions = [{ id: "same-decision", agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox", focalMirrorObjectIds: [], decision: "original_post", summary: "One trial", influences: [], createdAt: new Date().toISOString() } as never];
    state.growthHypotheses = [{ id: "hygiene", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "Proof-led posts help", status: "supported", confidence: "high", patternIds: [], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 2 }], supportingEvidenceIds: [duplicateA.id, duplicateB.id, stale.id], contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: duplicateA.createdAt, updatedAt: duplicateA.createdAt }];
    expect(learningAdjustmentForPattern(state, presence, "social.x.v1.proof-led-original")).toBe(0);
  });

  it("does not retrieve a supported hypothesis after all of its evidence ages out", () => {
    const state = createAgent({ name: "Stale retrieval", description: "Keep old strategy evidence out of current decisions.", audience: "AI builders", mode: "agent", handle: "@stale_retrieval", accent: "#7c3aed" });
    const presence = state.presence!;
    state.growthEvidenceRecords = [{ id: "old-evidence", agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME", claimScope: "presence", statement: "Old verified outcome", sourceRefs: [], verified: true, causalDecisionIds: ["old-decision"], createdAt: "2024-01-01T00:00:00.000Z" }];
    state.growthHypotheses = [{ id: "stale-hypothesis", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "Proof-led originals help AI builders", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], supportingEvidenceIds: ["old-evidence"], contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }];
    const context = compileSocialStrategyContext(state, presence, { invocation: "stale strategy check", objective: "proof-led originals for AI builders", availableActions: ["post"] });
    expect(context.retrievalRun.relevantGrowthHypothesisIds).not.toContain("stale-hypothesis");
    expect(state.growthHypotheses[0]?.status).toBe("supported");
  });

  it("applies Agent-scoped learning across Presences owned by that Agent", () => {
    const state = createAgent({ name: "Shared learning", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@shared_learning", accent: "#7c3aed" });
    const first = state.presence!;
    const second = { ...first, id: "presence-second", handle: "@shared_learning_two" };
    state.presences = [first, second];
    const evidence = ["a", "b"].map((id, index) => ({ id, agentId: state.agent!.id, presenceId: second.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Verified outcome", sourceRefs: [], verified: true, causalDecisionIds: [`decision-${index}`], createdAt: new Date().toISOString() }));
    state.growthEvidenceRecords = evidence;
    state.socialDecisions = evidence.map((item, index) => ({ id: `decision-${index}`, agentId: state.agent!.id, presenceId: second.id, environment: "sandbox" as const, focalMirrorObjectIds: [], decision: "original_post" as const, summary: "Proof", influences: [], socialStrategy: { retrievalRunId: `run-${index}`, consideredPatternIds: [], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original" }] }, createdAt: item.createdAt }));
    state.growthHypotheses = [{ id: "agent-wide", agentId: state.agent!.id, originatingPresenceId: first.id, scope: "agent", statement: "Proof-led posts help", status: "supported", confidence: "high", patternIds: [], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", effect: 1 }], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }];
    expect(learningAdjustmentForPattern(state, first, "social.x.v1.proof-led-original")).toBe(1.6);
  });

  it("feeds durable negative preference evidence into later strategy context", () => {
    const state = createAgent({ name: "Preference memory", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@preference_memory", accent: "#7c3aed" });
    state.preferenceEvidence = [{ id: "preference-1", agentId: state.agent!.id, presenceId: state.presence!.id, sessionId: "session-1", source: "operator_explicit", subjectRef: { type: "decision", id: "decision-1" }, reaction: "does_not_fit", reasons: ["too_generic"], note: "Never use generic stock visuals.", scopeHint: "agent", environment: "sandbox", createdAt: new Date().toISOString() }];
    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "later decision", objective: "write an original post", availableActions: ["original_post"] });
    expect(context.prompt).toContain("Never use generic stock visuals.");
  });

  it("does not treat descriptive pattern links or non-supported hypotheses as causal retrieval input", () => {
    const state = createAgent({ name: "Adversarial learning fixture", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@adversarial_learning", accent: "#7c3aed" });
    const presence = state.presence!;
    const evidence = ["outcome-a", "outcome-b"].map((id) => ({ id, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: "Verified outcome", sourceRefs: [], verified: true, createdAt: "2026-09-16T12:00:00.000Z" }));
    state.growthEvidenceRecords = evidence;
    state.growthHypotheses = [{ id: "descriptive-only", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "A pattern was observed.", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }, { id: "still-testing", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", statement: "A second pattern may help.", status: "testing", confidence: "high", patternIds: ["social.x.v1.community-showcase"], decisionTargets: [{ strategyId: "social.x.v1.community-showcase", effect: 3 }], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }];

    const next = recordSocialDecision(state, { presenceId: presence.id, decision: "original_post", summary: "Keep the decision honest." });
    expect(next.learningCheckpoints?.[0]?.hypothesisIds).toEqual([]);
    expect(next.learningCounterfactuals?.[0]?.result.projections.present.rankedCandidates.every((candidate) => candidate.appliedHypothesisIds.length === 0)).toBe(true);
  });

  it("survives the durable state boundary and changes later strategy retrieval", () => {
    const state = createAgent({ name: "Durable learning fixture", description: "Teach builders useful agent ideas.", audience: "AI builders", mode: "agent", handle: "@durable_learning", accent: "#7c3aed" });
    const presence = state.presence!;
    const decisionIds = [1, 2].map((index) => `decision:${state.agent!.id}:${index}`);
    const evidence = ["durable-world-outcome-1", "durable-world-outcome-2"].map((id, index) => ({ id, agentId: state.agent!.id, presenceId: presence.id, kind: "WORLD_OUTCOME" as const, claimScope: "presence" as const, statement: `Verified outcome ${index + 1}`, sourceRefs: [], verified: true, causalDecisionIds: [decisionIds[index]!], createdAt: `2026-09-1${index + 1}T12:00:00.000Z` }));
    state.socialDecisions = evidence.map((item, index) => ({ id: decisionIds[index]!, agentId: state.agent!.id, presenceId: presence.id, environment: "sandbox" as const, focalMirrorObjectIds: [], decision: "original_post" as const, summary: "A proof-led original", influences: [], socialStrategy: { retrievalRunId: `run:${state.agent!.id}:${index + 1}`, consideredPatternIds: ["social.x.v1.proof-led-original"], selectedByAct: [{ act: "original_post", patternId: "social.x.v1.proof-led-original", mechanismId: "proof-led original" }] }, createdAt: item.createdAt }));
    state.growthEvidenceRecords = evidence;
    state.growthHypotheses = [{ id: "durable-learning-hypothesis", agentId: state.agent!.id, originatingPresenceId: presence.id, scope: "presence", channelId: presence.channel, statement: "Proof-led originals should be preferred when concrete evidence is available.", status: "supported", confidence: "high", patternIds: ["social.x.v1.proof-led-original"], decisionTargets: [{ strategyId: "social.x.v1.proof-led-original", action: "original_post", effect: 1.5 }], supportingEvidenceIds: evidence.map((item) => item.id), contradictingEvidenceIds: [], derivedFrom: [], reviewHistory: [], createdAt: evidence[0]!.createdAt, updatedAt: evidence[1]!.createdAt }];
    writeState(state);

    const reopened = readStateSnapshot();
    const reopenedPresence = reopened.presence!;
    const context = compileSocialStrategyContext(reopened, reopenedPresence, { invocation: "later autonomous decision", objective: "share proof-led originals with builders", availableActions: ["original_post", "reply"] });

    expect(reopened.growthHypotheses?.[0]?.id).toBe("durable-learning-hypothesis");
    expect(reopened.growthEvidenceRecords?.filter((item) => item.verified)).toHaveLength(2);
    expect(context.retrievalRun.relevantGrowthHypothesisIds).toContain("durable-learning-hypothesis");
    expect(context.prompt).toContain("Proof-led originals should be preferred");
    expect(learningAdjustmentForPattern(reopened, reopenedPresence, "social.x.v1.proof-led-original")).toBe(2.4);

    // Persist two equivalent forward worlds through the real SQLite boundary.
    // WORLD A retains the learned state; WORLD B removes it. This is stronger
    // than deleting a field from one in-memory object because both branches
    // must survive serialization, normalization, and a later retrieval.
    const worldA = readStateSnapshot();
    const worldAHash = JSON.stringify({ hypotheses: worldA.growthHypotheses ?? [], evidence: worldA.growthEvidenceRecords ?? [] });
    writeState(worldA);
    const reopenedWorldA = readStateSnapshot();
    const presenceA = reopenedWorldA.presence!;
    const contextA = compileSocialStrategyContext(reopenedWorldA, presenceA, { invocation: "WORLD A later autonomous decision", objective: "share proof-led originals with builders", availableActions: ["original_post", "reply"] });

    const worldB = structuredClone(reopenedWorldA);
    worldB.growthHypotheses = [];
    const worldBHash = JSON.stringify({ hypotheses: worldB.growthHypotheses ?? [], evidence: worldB.growthEvidenceRecords ?? [] });
    expect(worldBHash).not.toBe(worldAHash);
    writeState(worldB);
    const reopenedWorldB = readStateSnapshot();
    const presenceB = reopenedWorldB.presence!;
    const contextB = compileSocialStrategyContext(reopenedWorldB, presenceB, { invocation: "WORLD B later autonomous decision", objective: "share proof-led originals with builders", availableActions: ["original_post", "reply"] });

    expect(reopenedWorldA.growthHypotheses?.[0]?.id).toBe("durable-learning-hypothesis");
    expect(reopenedWorldB.growthHypotheses?.some((hypothesis) => hypothesis.id === "durable-learning-hypothesis")).toBe(false);
    expect(contextA.retrievalRun.relevantGrowthHypothesisIds).toContain("durable-learning-hypothesis");
    expect(contextB.retrievalRun.relevantGrowthHypothesisIds).not.toContain("durable-learning-hypothesis");
    expect(learningAdjustmentForPattern(reopenedWorldA, presenceA, "social.x.v1.proof-led-original")).toBe(2.4);
    expect(learningAdjustmentForPattern(reopenedWorldB, presenceB, "social.x.v1.proof-led-original")).toBe(0);
    expect(contextA.prompt).not.toBe(contextB.prompt);
  });
});
