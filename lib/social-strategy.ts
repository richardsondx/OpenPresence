import type {
  ChannelDefinition,
  GrowthEvidenceRecord,
  GrowthHypothesis,
  LegacyChannelStrategyGuidance,
  OpenPresenceState,
  Presence,
  Skill,
  SocialStrategyPattern,
  SocialStrategyPlaybook,
  SocialStrategyRetrievalRun,
  SocialStrategyUse,
  SocialDecisionConfidence,
} from "./types";

const PLAYBOOK_ID = "openpresence.social.x";
const PLAYBOOK_VERSION = "1.0.0";

const patterns: SocialStrategyPattern[] = [
  {
    id: "social.x.v1.proof-led-original",
    playbookId: PLAYBOOK_ID,
    playbookVersion: PLAYBOOK_VERSION,
    channelId: "x",
    mechanism: "proof-led original",
    audienceRole: "teach a concrete mechanism",
    supportedActs: ["original_post", "quote", "reply"],
    supportedFormats: ["x.post", "x.long-post", "x.media-post"],
    usefulConditions: ["a concrete observation or evidence exists", "the audience can learn one useful thing"],
    weakConditions: ["the claim is generic", "the source is unverified"],
    risks: ["turning a lived observation into a lecture", "overstating causal evidence"],
    retrievalTags: ["evidence", "teaching", "original", "mechanism", "proof"],
    referenceExamples: [{ label: "Research corpus", note: "Structure is reference-only; wording must be original." }],
  },
  {
    id: "social.x.v1.useful-disagreement",
    playbookId: PLAYBOOK_ID,
    playbookVersion: PLAYBOOK_VERSION,
    channelId: "x",
    mechanism: "useful disagreement",
    audienceRole: "sharpen a live idea without manufacturing conflict",
    supportedActs: ["reply", "quote"],
    supportedFormats: ["x.reply", "x.quote"],
    usefulConditions: ["a specific claim or tension is visible", "a bounded counterexample improves the idea"],
    weakConditions: ["the post is a joke or closed acknowledgment", "the disagreement is only performative"],
    risks: ["manufactured disagreement", "competing for the last word"],
    retrievalTags: ["disagreement", "counterexample", "reply", "quote", "tension"],
  },
  {
    id: "social.x.v1.invite-expertise",
    playbookId: PLAYBOOK_ID,
    playbookVersion: PLAYBOOK_VERSION,
    channelId: "x",
    mechanism: "invite expertise",
    audienceRole: "make a technically grounded exchange more useful",
    supportedActs: ["reply", "quote"],
    supportedFormats: ["x.reply", "x.quote"],
    usefulConditions: ["a real unresolved question is present", "the author or audience can add missing context"],
    weakConditions: ["the question is rhetorical", "there is no concrete object to discuss"],
    risks: ["asking a question only to keep engagement alive", "outsourcing the Agent's own answer"],
    retrievalTags: ["question", "expertise", "conversation", "reply", "context"],
  },
  {
    id: "social.x.v1.selective-amplification",
    playbookId: PLAYBOOK_ID,
    playbookVersion: PLAYBOOK_VERSION,
    channelId: "x",
    mechanism: "selective amplification",
    audienceRole: "help the audience notice something valuable as-is",
    supportedActs: ["repost", "quote", "follow"],
    supportedFormats: ["x.repost", "x.quote"],
    usefulConditions: ["the source stands on its own", "sharing it serves the audience rather than activity"],
    weakConditions: ["the source is repetitive or unverified", "the Agent would add no distinct value"],
    risks: ["broadcasting low-signal material", "using amplification as a substitute for editorial judgment"],
    retrievalTags: ["amplify", "repost", "share", "source", "follow"],
  },
  {
    id: "social.x.v1.quiet-appreciation",
    playbookId: PLAYBOOK_ID,
    playbookVersion: PLAYBOOK_VERSION,
    channelId: "x",
    mechanism: "quiet appreciation",
    audienceRole: "signal warmth without taking over the conversation",
    supportedActs: ["like", "follow"],
    supportedFormats: ["x.like", "x.follow"],
    usefulConditions: ["the social moment is complete", "a quiet signal carries the meaning"],
    weakConditions: ["the post needs a factual answer", "the signal would be generic approval"],
    risks: ["liking as a substitute for thought", "following without a reason for continued awareness"],
    retrievalTags: ["appreciation", "like", "follow", "thanks", "warmth"],
  },
];

const playbook: SocialStrategyPlaybook = {
  id: PLAYBOOK_ID,
  version: PLAYBOOK_VERSION,
  channelId: "x",
  patterns,
  updatedAt: "2026-08-31T00:00:00.000Z",
};

export function bundledSocialStrategyPlaybooks(): SocialStrategyPlaybook[] {
  return [{ ...playbook, patterns: playbook.patterns.map((pattern) => ({ ...pattern, supportedActs: [...pattern.supportedActs], supportedFormats: [...pattern.supportedFormats] })) }];
}

export function legacyChannelStrategyGuidance(definitions: ChannelDefinition[]): LegacyChannelStrategyGuidance[] {
  return definitions.flatMap((definition) => definition.playbook?.trim()
    ? [{ id: `legacy-channel-guidance:${definition.id}`, channelId: definition.id, text: definition.playbook.trim(), kind: "legacy_advisory" as const, source: "migrated" as const, createdAt: definition.createdAt }]
    : []);
}

export interface SocialStrategySituation {
  invocation: string;
  objective: string;
  availableActions: string[];
  format?: string;
  relationshipContext?: string;
  assignmentContext?: string;
}

export interface CompiledSocialStrategyContext {
  retrievalRun: SocialStrategyRetrievalRun;
  prompt: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string) => new Set(normalize(value).split(" ").filter((token) => token.length > 2));

function scorePattern(pattern: SocialStrategyPattern, situation: SocialStrategySituation, recent: Record<string, number>) {
  const text = `${situation.objective} ${situation.relationshipContext ?? ""} ${situation.assignmentContext ?? ""}`;
  const query = tokens(text);
  const tagMatches = pattern.retrievalTags.filter((tag) => query.has(tag) || normalize(text).includes(normalize(tag))).length;
  const actionMatch = pattern.supportedActs.some((act) => situation.availableActions.includes(act) || situation.availableActions.includes(act.replace("original_post", "post")));
  const formatMatch = Boolean(situation.format && pattern.supportedFormats.includes(situation.format));
  const fatigue = recent[pattern.mechanism] ?? 0;
  return (actionMatch ? 3 : 0) + (formatMatch ? 2 : 0) + tagMatches * 2 - Math.min(3, fatigue * 0.45);
}

function recentStrategyShape(state: OpenPresenceState, presenceId: string, limit = 12) {
  const shape: Record<string, number> = {};
  const decisions = state.socialDecisions
    .filter((item) => item.presenceId === presenceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  for (const decision of decisions) {
    for (const selected of decision.socialStrategy?.selectedByAct ?? []) {
      const pattern = patterns.find((candidate) => candidate.id === selected.patternId);
      if (pattern) shape[pattern.mechanism] = (shape[pattern.mechanism] ?? 0) + 1;
    }
  }
  return shape;
}

export interface StrategyPerformanceSummary {
  action: string;
  samples: number;
  averageImpressions?: number;
  averageEngagementRate?: number;
  averageEngagementSignal: number;
  mirrorObjectIds: string[];
}

function performanceActionForMirror(state: OpenPresenceState, mirror: OpenPresenceState["mirrorObjects"][number]) {
  const execution = mirror.originExecutionId
    ? state.executions.find((item) => item.id === mirror.originExecutionId)
    : undefined;
  const affordance = execution?.affordance?.replace(/^x\./, "");
  if (affordance && ["post", "reply", "quote", "repost", "like", "follow"].includes(affordance)) return affordance;
  return ["post", "reply", "quote", "repost", "like", "follow"].includes(mirror.objectType) ? mirror.objectType : undefined;
}

function engagementSignal(snapshot: OpenPresenceState["publicationMetricSnapshots"][number]) {
  return (snapshot.likes ?? 0)
    + (snapshot.replies ?? 0) * 3
    + (snapshot.reposts ?? 0) * 4
    + (snapshot.quotes ?? 0) * 5;
}

/**
 * Summarize only verified live publication metrics by the social act that
 * produced each Mirror object. This is descriptive evidence for the planner,
 * not a deterministic action selector or a causal growth claim.
 */
export function summarizeStrategyPerformance(state: OpenPresenceState, presenceId: string): StrategyPerformanceSummary[] {
  const latestByMirror = new Map<string, OpenPresenceState["publicationMetricSnapshots"][number]>();
  for (const snapshot of state.publicationMetricSnapshots ?? []) {
    const mirror = state.mirrorObjects.find((item) => item.id === snapshot.mirrorObjectId);
    if (!mirror || mirror.presenceId !== presenceId || mirror.environment === "sandbox" || snapshot.observationStatus === "unavailable") continue;
    const prior = latestByMirror.get(snapshot.mirrorObjectId);
    if (!prior || snapshot.observedAt > prior.observedAt) latestByMirror.set(snapshot.mirrorObjectId, snapshot);
  }
  const byAction = new Map<string, StrategyPerformanceSummary & { impressions: number[]; rates: number[] }>();
  for (const snapshot of latestByMirror.values()) {
    const mirror = state.mirrorObjects.find((item) => item.id === snapshot.mirrorObjectId);
    const action = mirror ? performanceActionForMirror(state, mirror) : undefined;
    if (!action) continue;
    const summary = byAction.get(action) ?? { action, samples: 0, impressions: [], rates: [], averageEngagementSignal: 0, mirrorObjectIds: [] };
    summary.samples += 1;
    summary.averageEngagementSignal += engagementSignal(snapshot);
    summary.mirrorObjectIds.push(snapshot.mirrorObjectId);
    if (typeof snapshot.impressions === "number" && snapshot.impressions > 0) {
      summary.impressions.push(snapshot.impressions);
      summary.rates.push(engagementSignal(snapshot) / snapshot.impressions * 100);
    }
    byAction.set(action, summary);
  }
  return [...byAction.values()]
    .map(({ impressions, rates, ...summary }) => ({
      ...summary,
      ...(impressions.length ? { averageImpressions: Math.round(impressions.reduce((sum, value) => sum + value, 0) / impressions.length) } : {}),
      ...(rates.length ? { averageEngagementRate: Number((rates.reduce((sum, value) => sum + value, 0) / rates.length).toFixed(2)) } : {}),
      averageEngagementSignal: Number((summary.averageEngagementSignal / Math.max(1, summary.samples)).toFixed(2)),
    }))
    .sort((left, right) => right.averageEngagementSignal - left.averageEngagementSignal || right.samples - left.samples);
}

function strategyPerformanceContext(state: OpenPresenceState, presenceId: string) {
  const summaries = summarizeStrategyPerformance(state, presenceId);
  if (!summaries.length) return "No verified live publication-performance comparison is available yet. Do not infer that one act grows the audience better than another.";
  const lines = summaries.map((summary) => `- ${summary.action}: ${summary.samples} verified publication${summary.samples === 1 ? "" : "s"}${summary.averageEngagementRate !== undefined ? `, ${summary.averageEngagementRate}% average weighted engagement signal per impression` : ""}${summary.averageImpressions !== undefined ? `, ${summary.averageImpressions.toLocaleString()} average impressions` : ""}.`);
  return `Verified live publication performance by act (descriptive evidence, not causal proof):\n${lines.join("\n")}\nUse this evidence to test the active Growth mission. Prefer a stronger observed act only when the current source also earns it; do not force quote, repost, or any other action from a small sample, and do not claim causality.`;
}

const knownPatternIds = new Set(patterns.map((pattern) => pattern.id));
const confidenceRank: Record<SocialDecisionConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Materialize typed evidence from observations already present in the runtime.
 * This deliberately does not infer causality: world outcomes are observations,
 * while strategy selections are only observations of what was tried.
 */
export function ensureGrowthEvidenceRecords(state: OpenPresenceState, presenceId: string, createdAt = new Date().toISOString()) {
  const agentId = state.agent?.id ?? "unknown";
  const existing = state.growthEvidenceRecords ?? [];
  const byId = new Map(existing.map((record) => [record.id, record]));
  const upsert = (record: GrowthEvidenceRecord) => {
    if (!byId.has(record.id)) byId.set(record.id, record);
  };

  for (const snapshot of (state.audienceSnapshots ?? []).filter((item) => item.presenceId === presenceId).slice(0, 24)) {
    upsert({
      id: `growth-evidence:audience:${snapshot.id}`,
      agentId,
      presenceId,
      kind: "WORLD_OUTCOME",
      claimScope: "presence",
      statement: `Observed audience snapshot: ${snapshot.followers.toLocaleString()} followers on ${snapshot.observedAt}.`,
      sourceRefs: [{ kind: "audience_snapshot", id: snapshot.id, sourcePresenceId: presenceId, observedAt: snapshot.observedAt }],
      verified: snapshot.observationStatus !== "unavailable",
      createdAt: snapshot.observedAt || createdAt,
    });
  }
  for (const metric of (state.publicationMetricSnapshots ?? []).filter((item) => item.presenceId === presenceId).slice(0, 24)) {
    upsert({
      id: `growth-evidence:publication:${metric.id}`,
      agentId,
      presenceId,
      kind: "WORLD_OUTCOME",
      claimScope: "presence",
      statement: `Observed publication outcome for ${metric.mirrorObjectId}: ${metric.impressions ?? 0} impressions, ${metric.likes ?? 0} likes, ${metric.replies ?? 0} replies.`,
      sourceRefs: [{ kind: "publication_metric", id: metric.id, sourcePresenceId: presenceId, observedAt: metric.observedAt }],
      verified: true,
      createdAt: metric.observedAt || createdAt,
    });
  }
  for (const decision of state.socialDecisions.filter((item) => item.presenceId === presenceId).slice(0, 24)) {
    if (!decision.socialStrategy?.selectedByAct.some((selection) => selection.patternId)) continue;
    upsert({
      id: `growth-evidence:strategy:${decision.id}`,
      agentId,
      presenceId,
      kind: "STRATEGY_OBSERVATION",
      claimScope: "presence",
      statement: `Observed strategy use: ${decision.socialStrategy.selectedByAct.map((selection) => selection.patternId ?? selection.act).join(", ")}.`,
      sourceRefs: [{ kind: "social_decision", id: decision.id, sourcePresenceId: presenceId, observedAt: decision.createdAt }],
      verified: true,
      createdAt: decision.createdAt || createdAt,
    });
  }
  state.growthEvidenceRecords = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
  return state.growthEvidenceRecords;
}

/** Apply model/operator review actions without deleting or silently promoting interpretations. */
export function applyGrowthHypothesisActions(
  state: OpenPresenceState,
  presenceId: string,
  reviewId: string,
  actions: NonNullable<import("./types").GrowthReviewDecision["hypothesisActions"]> | undefined,
  createdAt = new Date().toISOString(),
) {
  if (!actions?.length) return state;
  const hypotheses = [...(state.growthHypotheses ?? [])];
  const byId = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const evidence = state.growthEvidenceRecords ?? [];
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  const knownIds = new Set(byId.keys());
  const addHistory = (hypothesis: GrowthHypothesis, status: GrowthHypothesis["status"]) => {
    hypothesis.status = status;
    hypothesis.reviewHistory = [...hypothesis.reviewHistory, { reviewId, status, at: createdAt }];
    hypothesis.updatedAt = createdAt;
  };

  actions.slice(0, 12).forEach((action, index) => {
    const evidenceIds = (action.evidenceIds ?? []).filter((evidenceId) => evidenceById.has(evidenceId));
    const supporting = evidenceIds.filter((evidenceId) => evidenceById.get(evidenceId)?.kind === "WORLD_OUTCOME");
    const hasVerifiedWorldOutcome = supporting.some((evidenceId) => evidenceById.get(evidenceId)?.verified);
    const patternIds = (action.patternIds ?? []).filter((patternId) => knownPatternIds.has(patternId));
    if (action.action === "create" || action.action === "generalize") {
      const derivedFrom = (action.derivedFrom ?? []).filter((hypothesisId) => knownIds.has(hypothesisId));
      if (!action.statement?.trim() || (action.action === "generalize" && !derivedFrom.length)) return;
      const id = `growth-hypothesis:${reviewId}:${index}`;
      const scope = action.scope ?? "presence";
      byId.set(id, {
        id,
        agentId: state.agent?.id ?? "unknown",
        originatingPresenceId: presenceId,
        scope,
        ...(scope === "channel" && action.channelId ? { channelId: action.channelId } : {}),
        statement: action.statement.trim().slice(0, 1000),
        status: "testing",
        confidence: action.confidence ?? "low",
        patternIds,
        supportingEvidenceIds: evidenceIds,
        contradictingEvidenceIds: [],
        derivedFrom,
        reviewHistory: [{ reviewId, status: "testing", at: createdAt }],
        createdAt,
        updatedAt: createdAt,
      });
      return;
    }
    const hypothesis = action.hypothesisId ? byId.get(action.hypothesisId) : undefined;
    if (!hypothesis) return;
    if (action.action === "support") {
      // Effectiveness is never promoted from activity or operator preference.
      addHistory(hypothesis, hasVerifiedWorldOutcome ? "supported" : "weakened");
      hypothesis.supportingEvidenceIds = [...new Set([...hypothesis.supportingEvidenceIds, ...supporting])];
      if (!hasVerifiedWorldOutcome) hypothesis.confidence = "low";
    } else if (action.action === "weaken") {
      addHistory(hypothesis, "weakened");
      hypothesis.contradictingEvidenceIds = [...new Set([...hypothesis.contradictingEvidenceIds, ...evidenceIds])];
      hypothesis.confidence = confidenceRank[hypothesis.confidence] > 0 ? "medium" : "low";
    } else if (action.action === "disfavor") addHistory(hypothesis, "disfavored");
    else if (action.action === "retire") addHistory(hypothesis, "retired");
  });
  state.growthHypotheses = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 500);
  return state;
}

function relevantHypotheses(state: OpenPresenceState, presence: Presence, objective: string): GrowthHypothesis[] {
  const query = tokens(objective);
  return (state.growthHypotheses ?? [])
    .filter((hypothesis) => hypothesis.status !== "retired" && hypothesis.status !== "disfavored")
    .filter((hypothesis) => hypothesis.scope === "agent"
      || (hypothesis.scope === "channel" && hypothesis.channelId === presence.channel)
      || (hypothesis.scope === "presence" && hypothesis.originatingPresenceId === presence.id))
    .map((hypothesis) => ({ hypothesis, score: [...tokens(hypothesis.statement)].filter((token) => query.has(token)).length }))
    .sort((a, b) => b.score - a.score || b.hypothesis.updatedAt.localeCompare(a.hypothesis.updatedAt))
    .slice(0, 5)
    .map(({ hypothesis }) => hypothesis);
}

function compatibleSkills(state: OpenPresenceState, presence: Presence, situation: SocialStrategySituation): Skill[] {
  const enabled = new Set((state.agentSkills ?? []).filter((binding) => binding.agentId === state.agent?.id && binding.enabled).map((binding) => binding.skillId));
  return (state.skills ?? [])
    .filter((skill) => enabled.has(skill.id) && skill.channels.includes(presence.channel))
    .filter((skill) => (skill.strategyContributions ?? []).some((contribution) => (!contribution.channelId || contribution.channelId === presence.channel) && (!situation.format || skill.compatibleFormats.includes(situation.format))))
    .slice(0, 3);
}

export function compileSocialStrategyContext(state: OpenPresenceState, presence: Presence, situation: SocialStrategySituation): CompiledSocialStrategyContext {
  const selectedPlaybook = bundledSocialStrategyPlaybooks().find((candidate) => candidate.channelId === presence.channel);
  const recent = recentStrategyShape(state, presence.id);
  const candidates = (selectedPlaybook?.patterns ?? [])
    .map((pattern) => ({ pattern, score: scorePattern(pattern, situation, recent) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id))
    .reduce<SocialStrategyPattern[]>((result, item) => {
      if (!result.some((pattern) => pattern.mechanism === item.pattern.mechanism)) result.push(item.pattern);
      return result;
    }, [])
    .slice(0, 5);
  const hypotheses = relevantHypotheses(state, presence, situation.objective);
  const skills = compatibleSkills(state, presence, situation);
  const legacy = (state.legacyChannelStrategyGuidance ?? []).find((item) => item.channelId === presence.channel);
  const noPatternReason = candidates.length ? undefined : "No Playbook pattern has strong applicability here. Judge the situation normally; silence remains valid.";
  const retrievalRun: SocialStrategyRetrievalRun = {
    id: `strategy-run:${presence.id}:${Date.now().toString(36)}`,
    agentId: state.agent?.id ?? "unknown",
    presenceId: presence.id,
    channelId: presence.channel,
    invocation: situation.invocation,
    objective: situation.objective.slice(0, 1000),
    playbookId: selectedPlaybook?.id,
    playbookVersion: selectedPlaybook?.version,
    consideredPatterns: candidates.map((pattern) => JSON.parse(JSON.stringify(pattern)) as SocialStrategyPattern),
    relevantGrowthHypothesisIds: hypotheses.map((hypothesis) => hypothesis.id),
    compatibleSkillIds: skills.map((skill) => skill.id),
    recentStrategyShape: recent,
    noPatternReason,
    createdAt: new Date().toISOString(),
  };
  const patternText = candidates.length
    ? candidates.map((pattern) => `- ${pattern.id} · ${pattern.mechanism} · audience role: ${pattern.audienceRole}\n  useful when: ${pattern.usefulConditions.join("; ")}\n  weak when: ${pattern.weakConditions.join("; ")}\n  risks: ${pattern.risks.join("; ")}`).join("\n")
    : `- ${noPatternReason}`;
  const growthText = hypotheses.length ? hypotheses.map((hypothesis) => `- ${hypothesis.id} · ${hypothesis.scope} · ${hypothesis.status} · ${hypothesis.statement}`).join("\n") : "- No applicable structured Growth hypothesis.";
  const performanceText = strategyPerformanceContext(state, presence.id);
  const skillText = skills.length ? skills.flatMap((skill) => (skill.strategyContributions ?? []).map((contribution) => `- ${skill.id}/${contribution.id}: ${contribution.guidance}`)).join("\n") : "- No specialized strategy Skill applies.";
  const recentText = Object.entries(recent).filter(([, count]) => count > 0).map(([mechanism, count]) => `${mechanism} ${count} of last ${Math.max(1, Object.values(recent).reduce((sum, value) => sum + value, 0))}`).join(", ") || "no selected strategy shape recorded";
  return {
    retrievalRun,
    prompt: `SOCIAL STRATEGY INTELLIGENCE (possibilities, never instructions)\nChannel: ${presence.channel}\nPlaybook: ${selectedPlaybook ? `${selectedPlaybook.id} v${selectedPlaybook.version}` : "no built-in Playbook"}\nRecent strategy shape: ${recentText}\n${legacy ? `Legacy Channel guidance: ${legacy.text}\n` : ""}\nConsider up to five candidates, select none when appropriate, and never copy example wording.\n${patternText}\n\nRelevant Growth hypotheses (evidence, not policy):\n${growthText}\n\n${performanceText}\n\nCompatible strategy Skills (extensions, not replacements):\n${skillText}\n\nIf you select an act, declare strategyId from the supplied pattern IDs and mechanismId from the selected pattern's mechanism. Invalid or invented IDs will be discarded.`,
  };
}

export function strategyUseFromDecision(run: SocialStrategyRetrievalRun | undefined, acts: Array<{ action: string; strategyId?: string; mechanismId?: string }> | undefined): SocialStrategyUse | undefined {
  if (!run) return undefined;
  const allowed = new Set(run.consideredPatterns.map((pattern) => pattern.id));
  const selectedByAct = (acts ?? []).map((act) => ({
    act: act.action,
    patternId: act.strategyId && allowed.has(act.strategyId) ? act.strategyId : undefined,
    mechanismId: act.mechanismId && [...run.consideredPatterns].some((pattern) => pattern.mechanism === act.mechanismId) ? act.mechanismId : undefined,
  }));
  return { retrievalRunId: run.id, playbookId: run.playbookId, playbookVersion: run.playbookVersion, consideredPatternIds: run.consideredPatterns.map((pattern) => pattern.id), selectedByAct };
}
