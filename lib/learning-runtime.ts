import {
  hashLearningCheckpoint,
  projectLearningCounterfactual,
  type LearningCheckpoint,
  type LearningDecisionSituation,
  type LearningHypothesis,
} from "./learning-counterfactual";
import type {
  GrowthEvidenceRecord,
  GrowthHypothesis,
  LearningCheckpointRecord,
  LearningCounterfactualRecord,
  OpenPresenceState,
  Presence,
  SocialStrategyRetrievalRun,
} from "./types";

const confidenceValue: Record<GrowthHypothesis["confidence"], number> = { low: 0.25, medium: 0.5, high: 0.8 };

function evidenceForHypothesis(state: OpenPresenceState, hypothesis: GrowthHypothesis) {
  const records = new Map((state.growthEvidenceRecords ?? []).map((record) => [record.id, record]));
  const supporting = hypothesis.supportingEvidenceIds.map((id) => records.get(id)).filter((record): record is GrowthEvidenceRecord => Boolean(record));
  const contradicting = hypothesis.contradictingEvidenceIds.map((id) => records.get(id)).filter((record): record is GrowthEvidenceRecord => Boolean(record));
  return { supporting, contradicting };
}

function outcomeSupportsTarget(state: OpenPresenceState, record: GrowthEvidenceRecord, hypothesis: GrowthHypothesis) {
  if (record.kind !== "WORLD_OUTCOME" || !record.verified || !record.causalDecisionIds?.length) return false;
  const targets = hypothesis.decisionTargets ?? [];
  return record.causalDecisionIds.some((decisionId) => {
    const decision = state.socialDecisions.find((item) => item.id === decisionId && item.presenceId === hypothesis.originatingPresenceId);
    return Boolean(decision?.socialStrategy?.selectedByAct.some((selection) => targets.some((target) =>
      (target.strategyId && selection.patternId === target.strategyId)
      || (target.action && selection.act === target.action)
    )));
  });
}

function hypothesisScope(hypothesis: GrowthHypothesis, presence: Presence) {
  if (hypothesis.scope === "presence") return presence.id;
  if (hypothesis.scope === "channel") return presence.channel;
  return undefined;
}

/** Convert only repeated, verified world outcomes into decision-relevant learning. */
export function learningStateForPresence(state: OpenPresenceState, presence: Presence): { hypotheses: LearningHypothesis[]; evidence: Array<{ id: string; hypothesisId: string; polarity: "supporting" | "contradicting"; strength: number; observedAt?: string; source?: string }> } {
  const hypotheses: LearningHypothesis[] = [];
  const evidence: Array<{ id: string; hypothesisId: string; polarity: "supporting" | "contradicting"; strength: number; observedAt?: string; source?: string }> = [];
  for (const hypothesis of state.growthHypotheses ?? []) {
    if (hypothesis.originatingPresenceId !== presence.id || hypothesis.status !== "supported" || !hypothesis.decisionTargets?.length) continue;
    if (hypothesis.scope === "channel" && hypothesis.channelId !== presence.channel) continue;
    const { supporting, contradicting } = evidenceForHypothesis(state, hypothesis);
    const worldSupporting = supporting.filter((record) => outcomeSupportsTarget(state, record, hypothesis));
    const worldContradicting = contradicting.filter((record) => outcomeSupportsTarget(state, record, hypothesis));
    if (worldSupporting.length + worldContradicting.length < 2) continue;
    const learningHypothesis: LearningHypothesis = {
      id: hypothesis.id,
      statement: hypothesis.statement,
      scope: hypothesisScope(hypothesis, presence),
      confidence: confidenceValue[hypothesis.confidence],
      status: "supported",
      targets: hypothesis.decisionTargets.filter((target) => Number.isFinite(target.effect) && (target.strategyId || target.action || target.format)).map((target) => ({ ...target })),
      evidenceIds: [...worldSupporting, ...worldContradicting].map((record) => record.id),
    };
    if (!learningHypothesis.targets.length) continue;
    hypotheses.push(learningHypothesis);
    for (const record of worldSupporting) evidence.push({ id: record.id, hypothesisId: hypothesis.id, polarity: "supporting", strength: 0.5, observedAt: record.createdAt, source: record.kind });
    for (const record of worldContradicting) evidence.push({ id: record.id, hypothesisId: hypothesis.id, polarity: "contradicting", strength: 0.5, observedAt: record.createdAt, source: record.kind });
  }
  return { hypotheses, evidence };
}

export function captureLearningCheckpoint(state: OpenPresenceState, presence: Presence, capturedAt: string, sourceReviewId?: string) {
  const learning = learningStateForPresence(state, presence);
  const previous = (state.learningCheckpoints ?? []).find((item) => item.presenceId === presence.id);
  const checkpoint: LearningCheckpoint = {
    id: `learning-checkpoint:${presence.id}:${(state.learningCheckpoints ?? []).length + 1}`,
    capturedAt,
    hypotheses: learning.hypotheses,
    evidence: learning.evidence,
    parentCheckpointId: previous?.id,
    parentCheckpointHash: previous?.hash,
  };
  const record: LearningCheckpointRecord = {
    id: checkpoint.id,
    agentId: state.agent?.id ?? "unknown",
    presenceId: presence.id,
    capturedAt,
    hash: hashLearningCheckpoint(checkpoint),
    parentCheckpointId: previous?.id,
    parentCheckpointHash: previous?.hash,
    hypothesisIds: learning.hypotheses.map((hypothesis) => hypothesis.id),
    evidenceIds: learning.evidence.map((item) => item.id),
    sourceReviewId,
  };
  return { checkpoint, record };
}

function situationForStrategyRun(run: SocialStrategyRetrievalRun, presence: Presence, situationId: string): LearningDecisionSituation {
  const candidates = run.consideredPatterns.length
    ? run.consideredPatterns.map((pattern) => ({ id: pattern.id, action: "original_post", baseScore: 0, strategyId: pattern.id, format: pattern.supportedFormats[0] }))
    : [{ id: "no-strategy", action: "no_op", baseScore: 0 }];
  return { id: situationId, scope: presence.id, candidates };
}

/** Persist a checkpoint/fork comparison alongside the real Social Decision that created it. */
export function recordLearningCounterfactualInPlace(state: OpenPresenceState, presence: Presence, run: SocialStrategyRetrievalRun, capturedAt: string, sourceReviewId?: string) {
  if (!state.agent) return undefined;
  const { checkpoint, record: checkpointRecord } = captureLearningCheckpoint(state, presence, capturedAt, sourceReviewId);
  const situation = situationForStrategyRun(run, presence, `strategy-situation:${run.id}`);
  const unchangedDecisionExplanation = "The present and removed projections selected the same next act, so this checkpoint does not claim that learning changed the decision.";
  const result = projectLearningCounterfactual({ checkpoint, situation, altered: { label: "all-learning-disfavored", hypotheses: checkpoint.hypotheses.map((hypothesis) => ({ ...hypothesis, status: "disfavored" as const })), evidence: checkpoint.evidence }, unchangedDecisionExplanation });
  const counterfactual: LearningCounterfactualRecord = { id: `learning-counterfactual:${run.id}`, agentId: state.agent.id, presenceId: presence.id, checkpointId: checkpoint.id, situationId: situation.id, result, createdAt: capturedAt };
  state.learningCheckpoints = [checkpointRecord, ...(state.learningCheckpoints ?? [])].slice(0, 100);
  state.learningCounterfactuals = [counterfactual, ...(state.learningCounterfactuals ?? [])].slice(0, 250);
  return result;
}

/** Softly influence retrieval only after at least two verified world outcomes exist. */
export function learningAdjustmentForPattern(state: OpenPresenceState, presence: Presence, patternId: string) {
  let adjustment = 0;
  for (const hypothesis of state.growthHypotheses ?? []) {
    if (hypothesis.originatingPresenceId !== presence.id || hypothesis.status !== "supported" || !hypothesis.decisionTargets?.length) continue;
    if (hypothesis.scope === "channel" && hypothesis.channelId !== presence.channel) continue;
    const { supporting, contradicting } = evidenceForHypothesis(state, hypothesis);
    const supportCount = supporting.filter((record) => outcomeSupportsTarget(state, record, hypothesis)).length;
    const contradictCount = contradicting.filter((record) => outcomeSupportsTarget(state, record, hypothesis)).length;
    if (supportCount + contradictCount < 2) continue;
    adjustment += hypothesis.decisionTargets.filter((target) => target.strategyId === patternId).reduce((sum, target) => sum + target.effect, 0) * (supportCount - contradictCount) * confidenceValue[hypothesis.confidence];
  }
  return Math.max(-3, Math.min(3, Math.round(adjustment * 100) / 100));
}
