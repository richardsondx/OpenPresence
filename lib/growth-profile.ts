import type { GrowthProfile, GrowthHypothesis, OpenPresenceState, Presence } from "./types";

function latestPlan(state: OpenPresenceState, presenceId: string) {
  return state.assignments
    .filter((assignment) => assignment.presenceId === presenceId && assignment.plan)
    .sort((left, right) => (right.plan?.updatedAt ?? right.updatedAt).localeCompare(left.plan?.updatedAt ?? left.updatedAt))[0]
    ?.plan;
}

function currentHypotheses(state: OpenPresenceState, presence: Presence): GrowthHypothesis[] {
  return (state.growthHypotheses ?? [])
    .filter((hypothesis) => hypothesis.agentId === state.agent?.id)
    .filter((hypothesis) => hypothesis.status !== "retired" && hypothesis.status !== "disfavored")
    .filter((hypothesis) => hypothesis.scope === "agent"
      || hypothesis.scope === "presence" && hypothesis.originatingPresenceId === presence.id
      || hypothesis.scope === "channel" && hypothesis.channelId === presence.channel)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * Compile the single audience/Growth model shared by the Growth UI and the
 * social planner. It intentionally describes the current operating context,
 * not an invented demographic profile or a causal claim about performance.
 */
export function deriveGrowthProfile(state: OpenPresenceState, presenceId?: string): GrowthProfile | undefined {
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) return undefined;
  const plan = latestPlan(state, presence.id);
  const hypotheses = currentHypotheses(state, presence);
  const templates = hypotheses.filter((hypothesis) => hypothesis.template);
  const growthReview = (state.growthReviews ?? [])
    .filter((review) => review.presenceId === presence.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const snapshot = (state.growthEvidenceSnapshots ?? [])
    .filter((item) => item.presenceId === presence.id)
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
  const growthAssignment = state.assignments
    .filter((assignment) => assignment.presenceId === presence.id && assignment.successEvidence?.metric === "followers")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const evidenceRefs = [...new Set([
    ...(snapshot?.sourceRefs ?? []),
    ...(growthReview?.evidenceIds ?? []),
    ...(state.audienceSnapshots ?? []).filter((item) => item.presenceId === presence.id).slice(0, 3).map((item) => item.id),
  ])].slice(0, 24);
  const daysObserved = snapshot?.baselineMaturity.daysObserved ?? 0;
  const confidence: GrowthProfile["confidence"] = snapshot?.baselineMaturity.confidence
    ?? (daysObserved >= 7 ? "high" : daysObserved >= 3 ? "medium" : "low");
  const qualifiedOutcome = growthAssignment?.audienceObjective?.trim()
    || plan?.summary?.trim()
    || `Build a meaningful audience of ${presence.brief.audience} through useful, recognizable participation.`;
  const activeApproach = [...new Set([
    ...(plan?.publishingApproach ?? []),
    ...hypotheses.filter((hypothesis) => hypothesis.status === "supported").slice(0, 3).map((hypothesis) => hypothesis.statement),
  ])].slice(0, 6);
  const reusableFormats = templates.slice(0, 8).map((hypothesis) => hypothesis.template?.title ?? hypothesis.statement);
  return {
    presenceId: presence.id,
    audience: presence.brief.audience.trim(),
    primaryTerritory: [...presence.brief.primaryTerritory].slice(0, 8),
    adjacentTerritory: [...presence.brief.adjacentTerritory].slice(0, 8),
    qualifiedOutcome,
    relationshipFocus: [...new Set([...(plan?.relationshipFocus ?? []), presence.brief.audience])].filter(Boolean).slice(0, 6),
    activeApproach: activeApproach.length ? activeApproach : ["Choose useful, concrete contributions over activity for its own sake."],
    reusableFormats,
    mediaApproach: "Compare media with text-only. Reuse only an authorized, durable, inspected asset when it materially improves proof or comprehension.",
    exclusions: [...new Set([...presence.brief.boundaries, "generic promotion", "unsupported virality claims", "public activity without a useful contribution"])].filter(Boolean).slice(0, 10),
    evidenceRefs,
    confidence,
    updatedAt: snapshot?.observedAt ?? growthReview?.createdAt ?? presence.updatedAt ?? new Date().toISOString(),
  };
}

