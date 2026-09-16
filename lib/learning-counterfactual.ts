/**
 * Pure, deterministic counterfactuals for empirical learning.
 *
 * This module deliberately does not import the runtime state. A counterfactual
 * is useful only when its inputs are explicit, serializable, and replayable:
 * the same situation and checkpoint must produce the same projections.
 */

export type LearningHypothesisStatus = "testing" | "supported" | "disfavored" | "retired";
export type LearningEvidencePolarity = "supporting" | "contradicting";
export type LearningCounterfactualVariant = "present" | "removed" | "altered";

export interface LearningDecisionTarget {
  action?: string;
  strategyId?: string;
  format?: string;
  targetId?: string;
  /** The score effect when this target matches a candidate. */
  effect: number;
}

export interface LearningHypothesis {
  id: string;
  statement: string;
  /** Exact situation scope. An omitted scope applies to every situation. */
  scope?: string;
  confidence: number;
  status?: LearningHypothesisStatus;
  targets: readonly LearningDecisionTarget[];
  /** Optional explicit evidence links; evidence.hypothesisId is also accepted. */
  evidenceIds?: readonly string[];
}

export interface LearningEvidence {
  id: string;
  hypothesisId: string;
  polarity: LearningEvidencePolarity;
  /** A bounded strength keeps evidence weighting comparable across checkpoints. */
  strength: number;
  observedAt?: string;
  source?: string;
}

export interface LearningCheckpoint {
  id: string;
  capturedAt: string;
  hypotheses: readonly LearningHypothesis[];
  evidence: readonly LearningEvidence[];
  parentCheckpointId?: string;
  parentCheckpointHash?: string;
}

export interface LearningDecisionCandidate {
  id: string;
  action: string;
  baseScore: number;
  strategyId?: string;
  format?: string;
  targetId?: string;
}

export interface LearningDecisionSituation {
  id: string;
  scope?: string;
  candidates: readonly LearningDecisionCandidate[];
}

export interface AlteredLearningState {
  /** A label is provenance only; it is not used to select a decision. */
  label?: string;
  hypotheses: readonly LearningHypothesis[];
  evidence: readonly LearningEvidence[];
}

export interface LearningCounterfactualRequest {
  checkpoint: LearningCheckpoint;
  situation: LearningDecisionSituation;
  altered: AlteredLearningState;
  /** Required when present and removed learning select the same decision. */
  unchangedDecisionExplanation?: string;
}

export interface ProjectedDecision {
  variant: LearningCounterfactualVariant;
  checkpointId: string;
  parentCheckpointId?: string;
  parentCheckpointHash?: string;
  learningHash: string;
  decisionHash: string;
  decisionKey: string;
  decision: {
    candidateId: string;
    action: string;
    strategyId?: string;
    format?: string;
    targetId?: string;
  };
  score: number;
  rankedCandidates: readonly {
    candidateId: string;
    action: string;
    score: number;
    appliedHypothesisIds: readonly string[];
  }[];
}

export interface LearningProjectionComparison {
  left: LearningCounterfactualVariant;
  right: LearningCounterfactualVariant;
  decisionsDiffer: boolean;
  scoresDiffer: boolean;
  scoreDelta: number;
  reason: "selected_decision_changed" | "selected_decision_unchanged";
}

export type LearningClaim =
  | {
      status: "demonstrated";
      basis: "present_vs_removed";
      explanation?: never;
    }
  | {
      status: "not_demonstrated";
      basis: "present_vs_removed";
      explanation: string;
    };

export interface LearningCounterfactualResult {
  id: string;
  situationId: string;
  checkpoint: {
    id: string;
    hash: string;
    parentCheckpointId?: string;
    parentCheckpointHash?: string;
  };
  /** All derived variants retain an auditable link back to the present checkpoint. */
  lineage: {
    presentCheckpointId: string;
    presentCheckpointHash: string;
    removedParentCheckpointId: string;
    alteredParentCheckpointId: string;
  };
  projections: {
    present: ProjectedDecision;
    removed: ProjectedDecision;
    altered: ProjectedDecision;
  };
  comparisons: {
    presentVsRemoved: LearningProjectionComparison;
    presentVsAltered: LearningProjectionComparison;
    removedVsAltered: LearningProjectionComparison;
  };
  learningClaim: LearningClaim;
}

export class LearningCounterfactualError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningCounterfactualError";
  }
}

const HASH_OFFSET_A = 0x811c9dc5;
const HASH_OFFSET_B = 0x9e3779b9;
const HASH_PRIME = 0x01000193;

function hashText(value: string): string {
  let a = HASH_OFFSET_A;
  let b = HASH_OFFSET_B;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, HASH_PRIME);
    b = Math.imul(b ^ (code + index), HASH_PRIME);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LearningCounterfactualError("Counterfactual values must be finite numbers.");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  throw new LearningCounterfactualError("Counterfactual values must be JSON-compatible.");
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function learningStateForHash(hypotheses: readonly LearningHypothesis[], evidence: readonly LearningEvidence[]) {
  return {
    hypotheses: byId(hypotheses).map((hypothesis) => ({
      ...hypothesis,
      targets: [...hypothesis.targets].sort((left, right) => canonical(left).localeCompare(canonical(right))),
      evidenceIds: hypothesis.evidenceIds ? [...hypothesis.evidenceIds].sort() : undefined,
    })),
    evidence: byId(evidence),
  };
}

export function hashLearningState(hypotheses: readonly LearningHypothesis[], evidence: readonly LearningEvidence[]): string {
  return hashText(canonical(learningStateForHash(hypotheses, evidence)));
}

export function hashLearningCheckpoint(checkpoint: LearningCheckpoint): string {
  return hashText(canonical({
    id: checkpoint.id,
    capturedAt: checkpoint.capturedAt,
    parentCheckpointId: checkpoint.parentCheckpointId,
    parentCheckpointHash: checkpoint.parentCheckpointHash,
    ...learningStateForHash(checkpoint.hypotheses, checkpoint.evidence),
  }));
}

function requireText(value: string, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LearningCounterfactualError(`${field} must be a non-empty string.`);
  }
}

function requireFinite(value: number, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LearningCounterfactualError(`${field} must be a finite number.`);
  }
}

function validateLearningState(hypotheses: readonly LearningHypothesis[], evidence: readonly LearningEvidence[], label: string) {
  const hypothesisIds = new Set<string>();
  for (const hypothesis of hypotheses) {
    requireText(hypothesis.id, `${label} hypothesis id`);
    requireText(hypothesis.statement, `${label} hypothesis statement`);
    requireFinite(hypothesis.confidence, `${label} hypothesis confidence`);
    if (hypothesis.confidence < 0 || hypothesis.confidence > 1) throw new LearningCounterfactualError(`${label} hypothesis confidence must be between 0 and 1.`);
    if (hypothesisIds.has(hypothesis.id)) throw new LearningCounterfactualError(`Duplicate ${label} hypothesis id: ${hypothesis.id}.`);
    hypothesisIds.add(hypothesis.id);
    for (const target of hypothesis.targets) {
      requireFinite(target.effect, `${label} target effect`);
      if (!target.action && !target.strategyId && !target.format && !target.targetId) throw new LearningCounterfactualError(`${label} targets must identify at least one decision field.`);
    }
  }

  const evidenceIds = new Set<string>();
  for (const item of evidence) {
    requireText(item.id, `${label} evidence id`);
    requireText(item.hypothesisId, `${label} evidence hypothesis id`);
    requireFinite(item.strength, `${label} evidence strength`);
    if (item.strength < 0 || item.strength > 1) throw new LearningCounterfactualError(`${label} evidence strength must be between 0 and 1.`);
    if (!hypothesisIds.has(item.hypothesisId)) throw new LearningCounterfactualError(`${label} evidence ${item.id} references missing hypothesis ${item.hypothesisId}.`);
    if (evidenceIds.has(item.id)) throw new LearningCounterfactualError(`Duplicate ${label} evidence id: ${item.id}.`);
    evidenceIds.add(item.id);
  }

  for (const hypothesis of hypotheses) {
    for (const evidenceId of hypothesis.evidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) throw new LearningCounterfactualError(`${label} hypothesis ${hypothesis.id} references missing evidence ${evidenceId}.`);
    }
  }
}

function validateRequest(input: LearningCounterfactualRequest) {
  requireText(input.checkpoint.id, "Checkpoint id");
  requireText(input.checkpoint.capturedAt, "Checkpoint capturedAt");
  requireText(input.situation.id, "Situation id");
  if (input.situation.candidates.length === 0) throw new LearningCounterfactualError("Situation must contain at least one decision candidate.");
  const candidateIds = new Set<string>();
  for (const candidate of input.situation.candidates) {
    requireText(candidate.id, "Candidate id");
    requireText(candidate.action, `Candidate ${candidate.id} action`);
    requireFinite(candidate.baseScore, `Candidate ${candidate.id} baseScore`);
    if (candidateIds.has(candidate.id)) throw new LearningCounterfactualError(`Duplicate candidate id: ${candidate.id}.`);
    candidateIds.add(candidate.id);
  }
  validateLearningState(input.checkpoint.hypotheses, input.checkpoint.evidence, "Present");
  validateLearningState(input.altered.hypotheses, input.altered.evidence, "Altered");
}

function matches(candidate: LearningDecisionCandidate, target: LearningDecisionTarget) {
  return (!target.action || target.action === candidate.action)
    && (!target.strategyId || target.strategyId === candidate.strategyId)
    && (!target.format || target.format === candidate.format)
    && (!target.targetId || target.targetId === candidate.targetId);
}

function project(
  variant: LearningCounterfactualVariant,
  checkpointId: string,
  parentCheckpointId: string | undefined,
  parentCheckpointHash: string | undefined,
  hypotheses: readonly LearningHypothesis[],
  evidence: readonly LearningEvidence[],
  situation: LearningDecisionSituation,
): ProjectedDecision {
  const evidenceByHypothesis = new Map<string, LearningEvidence[]>();
  for (const item of evidence) {
    const bucket = evidenceByHypothesis.get(item.hypothesisId) ?? [];
    bucket.push(item);
    evidenceByHypothesis.set(item.hypothesisId, bucket);
  }

  const scored = situation.candidates.map((candidate) => {
    const appliedHypothesisIds: string[] = [];
    let score = candidate.baseScore;
    for (const hypothesis of hypotheses) {
      if (hypothesis.status === "disfavored" || hypothesis.status === "retired") continue;
      if (hypothesis.scope && hypothesis.scope !== situation.scope) continue;
      const relatedEvidence = (evidenceByHypothesis.get(hypothesis.id) ?? []).filter((item) => hypothesis.evidenceIds?.length ? hypothesis.evidenceIds.includes(item.id) : true);
      const evidenceSignal = relatedEvidence.reduce((total, item) => total + (item.polarity === "supporting" ? item.strength : -item.strength), 0);
      if (evidenceSignal === 0) continue;
      for (const target of hypothesis.targets) {
        if (!matches(candidate, target)) continue;
        score += target.effect * hypothesis.confidence * evidenceSignal;
        if (!appliedHypothesisIds.includes(hypothesis.id)) appliedHypothesisIds.push(hypothesis.id);
      }
    }
    return { candidate, score: Math.round(score * 1_000_000) / 1_000_000, appliedHypothesisIds: appliedHypothesisIds.sort() };
  });

  scored.sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
  const selected = scored[0]!;
  const decision = {
    candidateId: selected.candidate.id,
    action: selected.candidate.action,
    strategyId: selected.candidate.strategyId,
    format: selected.candidate.format,
    targetId: selected.candidate.targetId,
  };
  const decisionKey = canonical(decision);
  const learningHash = hashLearningState(hypotheses, evidence);
  return {
    variant,
    checkpointId,
    parentCheckpointId,
    parentCheckpointHash,
    learningHash,
    decisionHash: hashText(decisionKey),
    decisionKey,
    decision,
    score: selected.score,
    rankedCandidates: scored.map((item) => ({ candidateId: item.candidate.id, action: item.candidate.action, score: item.score, appliedHypothesisIds: item.appliedHypothesisIds })),
  };
}

function compare(left: ProjectedDecision, right: ProjectedDecision): LearningProjectionComparison {
  const decisionsDiffer = left.decisionHash !== right.decisionHash;
  const scoreDelta = Math.round((left.score - right.score) * 1_000_000) / 1_000_000;
  return {
    left: left.variant,
    right: right.variant,
    decisionsDiffer,
    scoresDiffer: scoreDelta !== 0,
    scoreDelta,
    reason: decisionsDiffer ? "selected_decision_changed" : "selected_decision_unchanged",
  };
}

export function projectLearningCounterfactual(input: LearningCounterfactualRequest): LearningCounterfactualResult {
  validateRequest(input);
  const presentHash = hashLearningCheckpoint(input.checkpoint);
  const removedHash = hashLearningState([], []);
  const alteredHash = hashLearningState(input.altered.hypotheses, input.altered.evidence);
  const alteredId = `${input.checkpoint.id}:altered:${alteredHash}`;
  const removedId = `${input.checkpoint.id}:removed:${removedHash}`;

  const present = project("present", input.checkpoint.id, input.checkpoint.parentCheckpointId, input.checkpoint.parentCheckpointHash, input.checkpoint.hypotheses, input.checkpoint.evidence, input.situation);
  const removed = project("removed", removedId, input.checkpoint.id, presentHash, [], [], input.situation);
  const altered = project("altered", alteredId, input.checkpoint.id, presentHash, input.altered.hypotheses, input.altered.evidence, input.situation);
  const presentVsRemoved = compare(present, removed);
  const explanation = input.unchangedDecisionExplanation?.trim();
  if (!presentVsRemoved.decisionsDiffer && !explanation) {
    throw new LearningCounterfactualError("Learning cannot be claimed when present and removed learning select the same decision; provide an explicit unchangedDecisionExplanation.");
  }

  return {
    id: `learning-counterfactual:${input.checkpoint.id}:${input.situation.id}`,
    situationId: input.situation.id,
    checkpoint: {
      id: input.checkpoint.id,
      hash: presentHash,
      parentCheckpointId: input.checkpoint.parentCheckpointId,
      parentCheckpointHash: input.checkpoint.parentCheckpointHash,
    },
    lineage: {
      presentCheckpointId: input.checkpoint.id,
      presentCheckpointHash: presentHash,
      removedParentCheckpointId: input.checkpoint.id,
      alteredParentCheckpointId: input.checkpoint.id,
    },
    projections: { present, removed, altered },
    comparisons: {
      presentVsRemoved,
      presentVsAltered: compare(present, altered),
      removedVsAltered: compare(removed, altered),
    },
    learningClaim: presentVsRemoved.decisionsDiffer
      ? { status: "demonstrated", basis: "present_vs_removed" }
      : { status: "not_demonstrated", basis: "present_vs_removed", explanation: explanation! },
  };
}
