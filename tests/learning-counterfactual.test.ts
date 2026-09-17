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
import { compileSocialStrategyContext } from "../lib/social-strategy";
import { learningAdjustmentForPattern } from "../lib/learning-runtime";
import { captureLearningCheckpoint, learningStateForPresence } from "../lib/learning-runtime";
import { captureSandboxWorld, restoreSandboxWorld, sandboxWorldDigest } from "../lib/sandbox-replay";

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
    const checkpoint = state.sandboxCheckpoints?.[0]!;
    state = forkSandboxCheckpoint(state, source.id, checkpoint.id);
    const fork = state.playgroundSessions.find((item) => item.id !== source.id && item.source === "replay")!;
    const forkLearning = learningStateForPresence(state, presence, fork.id);
    expect(forkLearning.hypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience.", targets: expect.arrayContaining([expect.objectContaining({ strategyId })]) })]));
    expect((state.growthHypotheses ?? []).filter((item) => (item as typeof item & { sandboxSessionId?: string }).sandboxSessionId === fork.id)).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience." })]));
    const restoredSource = restoreSandboxCheckpoint(state, source.id, checkpoint.id);
    expect(learningStateForPresence(restoredSource, presence, fork.id).hypotheses).toEqual(expect.arrayContaining([expect.objectContaining({ statement: "Useful disagreement helps this audience." })]));
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
