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
  SocialTemplate,
} from "./types";
import { assetIsEligibleForPresence } from "./asset-library";
import { deriveGrowthProfile } from "./growth-profile";
import { learningAdjustmentForPattern } from "./learning-runtime";

const PLAYBOOK_ID = "openpresence.social.x";
const PLAYBOOK_VERSION = "1.1.0";

const patterns: SocialStrategyPattern[] = [
  {
    id: "social.x.v1.community-showcase", playbookId: PLAYBOOK_ID, playbookVersion: PLAYBOOK_VERSION, channelId: "x",
    mechanism: "community showcase", audienceRole: "help participants discover and learn from each other's work",
    supportedActs: ["original_post", "reply", "quote"], supportedFormats: ["x.post", "x.reply", "x.quote"],
    usefulConditions: ["the audience has relevant projects or experiences to share", "the host can offer a useful response or curate contributions"],
    weakConditions: ["no relevant audience or follow-through", "a promise of exposure cannot be substantiated"],
    risks: ["empty engagement harvesting", "overpromising reach", "repeating the format without learning from responses"],
    retrievalTags: ["startup", "project", "showcase", "community", "participation", "engagement", "promote", "builders"],
  },
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

const BUNDLED_TEMPLATE_SOURCE_URL = "https://x.com/thejustinwelsh";
const BUNDLED_TEMPLATE_VERSION = "bundled-social-templates-v1";

type BundledSocialTemplate = Pick<SocialTemplate, "title" | "body" | "whenToUse" | "variables" | "sourceUrls"> & {
  statement: string;
  visualGuidance?: string;
};

// These are format hypotheses, not promises about reach. They make the first
// Artifacts view useful while preserving the evidence boundary used by the
// rest of the Growth model. The source is a public format study, not a source
// of copy: the Agent must supply the operator's own facts and voice.
const bundledTemplates: BundledSocialTemplate[] = [
  {
    title: "Proof-led case study",
    body: "I achieved [RESULT] by changing [MECHANISM], without [COMMON_ASSUMPTION].\n\nHere is the [NUMBER]-step breakdown:\n1. [STEP_ONE]\n2. [STEP_TWO]\n3. [STEP_THREE]\n\nThe part most people miss: [NON_OBVIOUS_DETAIL].",
    whenToUse: "Use when the Agent has a concrete first-party result and can explain the mechanism without exaggeration. Starter format only; performance is unproven.",
    visualGuidance: "Prefer a real screenshot, chart, or artifact that makes the result easier to verify. Skip decorative stock imagery and do not add a visual when the post has no authorized, relevant asset.",
    variables: ["RESULT", "MECHANISM", "COMMON_ASSUMPTION", "NUMBER", "STEP_ONE", "STEP_TWO", "STEP_THREE", "NON_OBVIOUS_DETAIL"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "A concrete result plus a transparent mechanism may make a useful lesson easier to evaluate; test with first-party evidence.",
  },
  {
    title: "Milestone lessons list",
    body: "After [MILESTONE], I changed my mind about [TOPIC].\n\nThe [NUMBER] lessons I would keep:\n1. [LESSON_ONE]\n2. [LESSON_TWO]\n3. [LESSON_THREE]\n\nIf you are at [AUDIENCE_STAGE], start with [FIRST_STEP].",
    whenToUse: "Use when the Agent has several distinct lessons from one real milestone. Keep each lesson specific enough to act on; do not invent personal experience.",
    visualGuidance: "A single artifact or before/after visual can anchor the milestone. Use an existing high-performing asset only when it still matches the lesson and reuse is authorized.",
    variables: ["MILESTONE", "TOPIC", "NUMBER", "LESSON_ONE", "LESSON_TWO", "LESSON_THREE", "AUDIENCE_STAGE", "FIRST_STEP"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "A milestone-led list may turn lived experience into a scannable teaching artifact when each lesson has a concrete implication.",
  },
  {
    title: "Constraint-first playbook",
    body: "How to [OUTCOME] when [CONSTRAINT].\n\nStart with [PRINCIPLE]. Then:\n1. [ACTION_ONE]\n2. [ACTION_TWO]\n3. [ACTION_THREE]\n\nAvoid [COMMON_FAILURE] because [REASON].",
    whenToUse: "Use for practical instruction where the constraint is part of the problem, not a detail to hide. Prefer a small sequence over a broad checklist.",
    visualGuidance: "Use a visual when it demonstrates one step or makes the constraint concrete. Prefer a legible screenshot or diagram over an attention-only image.",
    variables: ["OUTCOME", "CONSTRAINT", "PRINCIPLE", "ACTION_ONE", "ACTION_TWO", "ACTION_THREE", "COMMON_FAILURE", "REASON"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "A clear constraint and short action sequence may improve the usefulness of instructional posts; validate with audience response and outcomes.",
  },
  {
    title: "Contrarian reframe",
    body: "Most advice about [TOPIC] optimizes for [COMMON_METRIC].\n\nA better question is: [BETTER_QUESTION].\n\nI would test that by [SMALL_EXPERIMENT].\n\nThe tradeoff is [TRADEOFF].",
    whenToUse: "Use only when the Agent can name the common assumption fairly and offer a constructive test. Disagreement should sharpen the idea, not manufacture conflict.",
    visualGuidance: "A visual is optional. Add one only if it shows the specific contrast or evidence; never use an unrelated meme, ad, or generic illustration as bait.",
    variables: ["TOPIC", "COMMON_METRIC", "BETTER_QUESTION", "SMALL_EXPERIMENT", "TRADEOFF"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "A fair reframe paired with a testable alternative may create useful discussion without relying on manufactured controversy.",
  },
  {
    title: "Value-first resource drop",
    body: "If you are working on [PROBLEM], start with [USEFUL_PRINCIPLE].\n\nHere are [NUMBER] practical resources:\n- [RESOURCE_ONE]\n- [RESOURCE_TWO]\n- [RESOURCE_THREE]\n\nUse [RESOURCE_ONE] when [CONDITION].",
    whenToUse: "Use when the Agent can provide genuinely useful resources and explain the fit before any optional call to action. The resource must be inspectable and relevant.",
    visualGuidance: "Attach a visual only when it is one of the resources or clearly previews the decision it helps the reader make. Keep promotional or low-signal media out.",
    variables: ["PROBLEM", "USEFUL_PRINCIPLE", "NUMBER", "RESOURCE_ONE", "RESOURCE_TWO", "RESOURCE_THREE", "CONDITION"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "A concise resource list with selection criteria may earn attention by reducing the audience's next-step effort; test usefulness, not clicks alone.",
  },
  {
    title: "Trend hypothesis: one idea, many hooks",
    body: "Core idea: [CORE_IDEA]\n\nHook A — [PROOF_HOOK]\nHook B — [LESSON_HOOK]\nHook C — [QUESTION_HOOK]\n\nKeep the body grounded in [EVIDENCE] and choose the hook that matches [AUDIENCE_CONTEXT].",
    whenToUse: "Use as a current-format experiment: vary the opening while keeping the underlying lesson stable. Record the resulting post and evidence before deciding whether one hook is better.",
    visualGuidance: "Test image versus text-only as a deliberate variable when a relevant authorized asset exists; record the result instead of assuming images always win.",
    variables: ["CORE_IDEA", "PROOF_HOOK", "LESSON_HOOK", "QUESTION_HOOK", "EVIDENCE", "AUDIENCE_CONTEXT"],
    sourceUrls: [BUNDLED_TEMPLATE_SOURCE_URL],
    statement: "Testing multiple openings around one stable idea may separate hook effects from substance; this is a trend hypothesis, not a virality claim.",
  },
];

/** Add stable, private starter formats at the read boundary for old workspaces. */
export function ensureDefaultSocialTemplates(state: OpenPresenceState, presenceId?: string) {
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.presence?.id ?? state.presences[0]?.id));
  const agentId = state.agent?.id;
  if (!presence || !agentId) return state;
  const existing = state.growthHypotheses ?? [];
  const knownIds = new Set(existing
    .filter((item) => item.originatingPresenceId === presence.id && item.id.startsWith(`growth-hypothesis:${BUNDLED_TEMPLATE_VERSION}:${presence.id}:`))
    .map((item) => item.id));
  const createdAt = "2026-09-16T00:00:00.000Z";
  const additions: GrowthHypothesis[] = [];
  for (const [index, definition] of bundledTemplates.entries()) {
    const hypothesisId = `growth-hypothesis:${BUNDLED_TEMPLATE_VERSION}:${presence.id}:${index}`;
    if (knownIds.has(hypothesisId)) continue;
    additions.push({
      id: hypothesisId,
      agentId,
      originatingPresenceId: presence.id,
      scope: "presence",
      channelId: presence.channel,
      statement: definition.statement,
      status: "testing",
      confidence: "low",
      patternIds: ["social.x.v1.proof-led-original"],
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      derivedFrom: [],
      reviewHistory: [{ reviewId: BUNDLED_TEMPLATE_VERSION, status: "testing", at: createdAt }],
      createdAt,
      updatedAt: createdAt,
      template: { ...definition, source: "bundled" },
    });
  }
  if (additions.length) state.growthHypotheses = [...existing, ...additions].slice(-500);
  return state;
}

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
  /** Exact reusable template requested by an Assignment, when applicable. */
  strategyTemplateId?: string;
}

export interface CompiledSocialStrategyContext {
  retrievalRun: SocialStrategyRetrievalRun;
  prompt: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string) => new Set(normalize(value).split(" ").filter((token) => token.length > 2));

function scorePattern(pattern: SocialStrategyPattern, situation: SocialStrategySituation, recent: Record<string, number>, learningAdjustment = 0) {
  const text = `${situation.objective} ${situation.relationshipContext ?? ""} ${situation.assignmentContext ?? ""}`;
  const query = tokens(text);
  const tagMatches = pattern.retrievalTags.filter((tag) => query.has(tag) || normalize(text).includes(normalize(tag))).length;
  const actionMatch = pattern.supportedActs.some((act) => situation.availableActions.includes(act) || situation.availableActions.includes(act.replace("original_post", "post")));
  const formatMatch = Boolean(situation.format && pattern.supportedFormats.includes(situation.format));
  const fatigue = recent[pattern.mechanism] ?? 0;
  return (actionMatch ? 3 : 0) + (formatMatch ? 2 : 0) + tagMatches * 2 - Math.min(3, fatigue * 0.45) + learningAdjustment;
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

export interface StrategyPatternPerformanceSummary extends StrategyPerformanceSummary {
  patternId: string;
  mechanism: string;
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

function latestPublicationMetricSnapshots(state: OpenPresenceState, presenceId: string) {
  const latestByMirror = new Map<string, OpenPresenceState["publicationMetricSnapshots"][number]>();
  for (const snapshot of state.publicationMetricSnapshots ?? []) {
    const mirror = state.mirrorObjects.find((item) => item.id === snapshot.mirrorObjectId);
    if (!mirror || mirror.presenceId !== presenceId || mirror.environment === "sandbox" || snapshot.observationStatus === "unavailable") continue;
    const prior = latestByMirror.get(snapshot.mirrorObjectId);
    if (!prior || snapshot.observedAt > prior.observedAt) latestByMirror.set(snapshot.mirrorObjectId, snapshot);
  }
  return latestByMirror;
}

function selectedStrategyPatternForMirror(state: OpenPresenceState, mirror: OpenPresenceState["mirrorObjects"][number], action: string) {
  const execution = mirror.originExecutionId ? state.executions.find((item) => item.id === mirror.originExecutionId) : undefined;
  const decision = execution?.socialIntentId ? state.socialDecisions.find((item) => item.socialIntentId === execution.socialIntentId) : undefined;
  const selected = decision?.socialStrategy?.selectedByAct.find((item) => (item.act === "original_post" ? "post" : item.act) === action);
  const pattern = selected?.patternId ? patterns.find((item) => item.id === selected.patternId) : undefined;
  if (!pattern) return undefined;
  return { patternId: pattern.id, mechanism: selected?.mechanismId ?? pattern.mechanism };
}

/**
 * Summarize only verified live publication metrics by the social act that
 * produced each Mirror object. This is descriptive evidence for the planner,
 * not a deterministic action selector or a causal growth claim.
 */
export function summarizeStrategyPerformance(state: OpenPresenceState, presenceId: string): StrategyPerformanceSummary[] {
  const latestByMirror = latestPublicationMetricSnapshots(state, presenceId);
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

/**
 * Join verified live publication metrics to the selected strategy pattern that
 * produced each act. Missing lineage stays unattributed; it is never guessed
 * from text or timing.
 */
export function summarizeStrategyPatternPerformance(state: OpenPresenceState, presenceId: string): StrategyPatternPerformanceSummary[] {
  const byPattern = new Map<string, StrategyPatternPerformanceSummary & { impressions: number[]; rates: number[] }>();
  for (const snapshot of latestPublicationMetricSnapshots(state, presenceId).values()) {
    const mirror = state.mirrorObjects.find((item) => item.id === snapshot.mirrorObjectId);
    const action = mirror ? performanceActionForMirror(state, mirror) : undefined;
    const selected = mirror && action ? selectedStrategyPatternForMirror(state, mirror, action) : undefined;
    if (!mirror || !action || !selected) continue;
    const key = `${action}:${selected.patternId}`;
    const summary = byPattern.get(key) ?? { action, patternId: selected.patternId, mechanism: selected.mechanism, samples: 0, impressions: [], rates: [], averageEngagementSignal: 0, mirrorObjectIds: [] };
    summary.samples += 1;
    summary.averageEngagementSignal += engagementSignal(snapshot);
    summary.mirrorObjectIds.push(snapshot.mirrorObjectId);
    if (typeof snapshot.impressions === "number" && snapshot.impressions > 0) {
      summary.impressions.push(snapshot.impressions);
      summary.rates.push(engagementSignal(snapshot) / snapshot.impressions * 100);
    }
    byPattern.set(key, summary);
  }
  return [...byPattern.values()]
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
  const patternSummaries = summarizeStrategyPatternPerformance(state, presenceId);
  const patternLines = patternSummaries.map((summary) => `- ${summary.action} · ${summary.patternId} · ${summary.mechanism}: ${summary.samples} verified publication${summary.samples === 1 ? "" : "s"}${summary.averageEngagementRate !== undefined ? `, ${summary.averageEngagementRate}% average weighted engagement signal per impression` : ""}${summary.averageImpressions !== undefined ? `, ${summary.averageImpressions.toLocaleString()} average impressions` : ""}.`);
  return `Verified live publication performance by act (descriptive evidence, not causal proof):\n${lines.join("\n")}${patternLines.length ? `\n\nVerified performance by explicitly selected strategy pattern (descriptive evidence, not causal proof):\n${patternLines.join("\n")}` : ""}\nUse this evidence to test the active Growth mission. Prefer a stronger observed act or pattern only when the current source also earns it; do not force quote, repost, or any other action from a small sample, and do not claim causality.`;
}

const knownPatternIds = new Set(patterns.map((pattern) => pattern.id));
const confidenceRank: Record<SocialDecisionConfidence, number> = { low: 0, medium: 1, high: 2 };

function attributedWorldOutcome(state: OpenPresenceState, record: GrowthEvidenceRecord, hypothesis: GrowthHypothesis) {
  if (record.kind !== "WORLD_OUTCOME" || !record.verified || !record.causalDecisionIds?.length || !hypothesis.decisionTargets?.length) return false;
  return record.causalDecisionIds.some((decisionId) => {
    const decision = state.socialDecisions.find((item) => item.id === decisionId && item.presenceId === hypothesis.originatingPresenceId);
    return Boolean(decision?.socialStrategy?.selectedByAct.some((selection) => hypothesis.decisionTargets!.some((target) =>
      (target.strategyId && selection.patternId === target.strategyId) || (target.action && selection.act === target.action)
    )));
  });
}

/**
 * Materialize typed evidence from observations already present in the runtime.
 * This deliberately does not infer causality: world outcomes are observations,
 * while strategy selections are only observations of what was tried.
 */
export function ensureGrowthEvidenceRecords(state: OpenPresenceState, presenceId: string, createdAt = new Date().toISOString(), requestedMirrorObjectIds: string[] = []) {
  const agentId = state.agent?.id ?? "unknown";
  const existing = state.growthEvidenceRecords ?? [];
  const byId = new Map(existing.map((record) => [record.id, record]));
  const upsert = (record: GrowthEvidenceRecord) => {
    if (!byId.has(record.id)) byId.set(record.id, record);
  };

  // Observed formats are candidates for learning, never proof they caused growth.
  const environment = state.presences.find((presence) => presence.id === presenceId)?.environment ?? "live";
  const observedPosts = state.mirrorObjects.filter((item) => item.presenceId === presenceId && item.visibility === "public" && !item.archived && item.content?.text && (!item.environment || item.environment === environment)).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const selectedPostIds = new Set([...observedPosts.slice(0, 40).map(item => item.id), ...requestedMirrorObjectIds]);
  for (const post of observedPosts.filter(item => selectedPostIds.has(item.id))) {
    upsert({ id: `growth-evidence:observed:${post.id}`, agentId, presenceId, kind: "STRATEGY_OBSERVATION", claimScope: "presence", statement: `Observed social format (untrusted source content): ${post.content!.text!.slice(0, 1000)}`, sourceRefs: [{ kind: "mirror_object", id: post.id, sourcePresenceId: presenceId, observedAt: post.observedAt }], verified: false, createdAt });
  }

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
    const metricMirror = state.mirrorObjects.find((item) => item.id === metric.mirrorObjectId && item.presenceId === presenceId);
    const metricExecution = metricMirror?.originExecutionId ? state.executions.find((item) => item.id === metricMirror.originExecutionId) : undefined;
    const metricDecision = metricExecution?.socialIntentId ? state.socialDecisions.find((item) => item.socialIntentId === metricExecution.socialIntentId && item.presenceId === presenceId) : undefined;
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
      ...(metricDecision ? { causalDecisionIds: [metricDecision.id], causalMirrorObjectIds: [metric.mirrorObjectId] } : {}),
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
        ...(action.decisionTargets?.length ? { decisionTargets: action.decisionTargets } : {}),
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
      const attributable = supporting.filter((evidenceId) => attributedWorldOutcome(state, evidenceById.get(evidenceId)!, hypothesis));
      const hasSufficientOutcome = attributable.length >= 2;
      addHistory(hypothesis, hasSufficientOutcome ? "supported" : "weakened");
      hypothesis.supportingEvidenceIds = [...new Set([...hypothesis.supportingEvidenceIds, ...attributable])];
      if (!hasSufficientOutcome) hypothesis.confidence = "low";
      if (action.decisionTargets?.length) hypothesis.decisionTargets = action.decisionTargets;
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

export function saveSocialTemplate(source: OpenPresenceState, presenceId: string, input: { title: string; body: string; whenToUse?: string; visualGuidance?: string; variables?: string[]; mirrorObjectIds?: string[]; source?: "operator" | "observed_post" }) {
  const state = structuredClone(source);
  if (!state.presences.some((p) => p.id === presenceId)) throw new Error("This Presence is unavailable.");
  const ids = [...new Set(input.mirrorObjectIds ?? [])];
  if (ids.length > 30) throw new Error("A template can abstract at most 30 observed source posts.");
  if (input.source === "observed_post" && ids.length < 3) throw new Error("Abstract a reusable template from at least 3 observed public posts so the structure is not inferred from one example.");
  if ((input.source === "observed_post" && !ids.length) || ids.some((id) => !state.mirrorObjects.some((m) => m.id === id && m.presenceId === presenceId && m.visibility === "public" && m.environment !== "sandbox" && !m.archived))) throw new Error("Template sources must be public live posts from this Presence.");
  const inferred = [...input.body.matchAll(/\[([A-Za-z][A-Za-z0-9_]{0,31})\]/g)].map((m) => m[1]);
  const variables = [...new Set([...(input.variables ?? []), ...inferred])].filter((v) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(v)).slice(0, 12);
  const template: SocialTemplate = { title: input.title.trim().slice(0, 160), body: input.body.trim().slice(0, 4000), ...(input.whenToUse?.trim() ? { whenToUse: input.whenToUse.trim().slice(0, 500) } : {}), ...(input.visualGuidance?.trim() ? { visualGuidance: input.visualGuidance.trim().slice(0, 800) } : {}), ...(variables.length ? { variables } : {}), ...(input.source ? { source: input.source } : {}), ...(ids.length ? { sourceMirrorObjectIds: ids, sourceCount: ids.length } : {}) };
  if (!template.title || !template.body) throw new Error("Template title and body are required.");
  const duplicate = (state.growthHypotheses ?? []).find((h) => h.originatingPresenceId === presenceId && h.template?.body === template.body && h.template?.title === template.title);
  if (duplicate) return { state, hypothesis: duplicate };
  const reviewId = `chat-template:${crypto.randomUUID()}`;
  const evidenceIds = ids.map((id) => `growth-evidence:observed:${id}`);
  if (ids.length) ensureGrowthEvidenceRecords(state, presenceId, new Date().toISOString(), ids);
  applyGrowthHypothesisActions(state, presenceId, reviewId, [{ action: "create", statement: `Reusable structure: ${template.title}`, evidenceIds, confidence: "low", scope: "presence" }]);
  const hypothesis = state.growthHypotheses!.find((h) => h.id === `growth-hypothesis:${reviewId}:0`)!;
  hypothesis.template = template;
  return { state, hypothesis };
}

export function updateSocialTemplate(source: OpenPresenceState, presenceId: string, hypothesisId: string, input: { body: string; whenToUse?: string; visualGuidance?: string }) {
  const state = structuredClone(source);
  const hypothesis = (state.growthHypotheses ?? []).find((item) => item.id === hypothesisId && item.originatingPresenceId === presenceId);
  if (!hypothesis?.template) throw new Error("This template is unavailable.");
  const body = input.body.trim().slice(0, 4000);
  if (!body) throw new Error("Template layout cannot be empty.");
  const inferred = [...body.matchAll(/\[([A-Za-z][A-Za-z0-9_]{0,31})\]/g)].map((match) => match[1]);
  const variables = [...new Set(inferred)].slice(0, 12);
  hypothesis.template = {
    ...hypothesis.template,
    body,
    ...(input.whenToUse?.trim() ? { whenToUse: input.whenToUse.trim().slice(0, 500) } : {}),
    ...(input.visualGuidance?.trim() ? { visualGuidance: input.visualGuidance.trim().slice(0, 800) } : input.visualGuidance === "" ? { visualGuidance: undefined } : {}),
    ...(variables.length ? { variables } : { variables: undefined }),
  };
  hypothesis.updatedAt = new Date().toISOString();
  return { state, hypothesis };
}

export function socialPlaybookForPresence(state: OpenPresenceState, presenceId: string) {
  const agentId = state.agent?.id;
  const presence = state.presences.find(item => item.id === presenceId);
  if (!presence) return [];
  return (state.growthHypotheses ?? []).filter(h => h.agentId === agentId && (h.scope === "agent" || h.scope === "presence" && h.originatingPresenceId === presenceId || h.scope === "channel" && presence.channel === h.channelId)).map(h => {
    const assignments = (state.assignments ?? []).filter(item => item.presenceId === presenceId && item.strategyTemplateId === h.id);
    const assignmentIds = new Set(assignments.map(item => item.id));
    const deliveries = state.executions.filter(item => item.presenceId === presenceId && item.environment === "live" && item.status === "succeeded" && item.externalRef && item.assignmentId && assignmentIds.has(item.assignmentId));
    const deliveredIds = new Set(deliveries.map(item => `${item.externalRef!.type}:${item.externalRef!.id}`));
    const mirrorIds = new Set(state.mirrorObjects.filter(item => item.presenceId === presenceId && deliveredIds.has(`${item.externalRef.type}:${item.externalRef.id}`)).map(item => item.id));
    const latestMetrics = new Map<string, NonNullable<OpenPresenceState["publicationMetricSnapshots"]>[number]>();
    for (const metric of state.publicationMetricSnapshots ?? []) {
      if (metric.presenceId !== presenceId || !mirrorIds.has(metric.mirrorObjectId)) continue;
      const prior = latestMetrics.get(metric.mirrorObjectId);
      if (!prior || metric.observedAt > prior.observedAt) latestMetrics.set(metric.mirrorObjectId, metric);
    }
    const metricTotal = (key: "impressions" | "likes" | "replies" | "reposts" | "quotes") => {
      const values = [...latestMetrics.values()].map(item => item[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
    };
    return { ...h, supportingEvidence: (state.growthEvidenceRecords ?? []).filter(e => e.agentId === agentId && h.supportingEvidenceIds.includes(e.id)), contradictingEvidence: (state.growthEvidenceRecords ?? []).filter(e => e.agentId === agentId && h.contradictingEvidenceIds.includes(e.id)), usageCount: assignments.length, verifiedUses: deliveredIds.size, measuredPosts: latestMetrics.size, performance: { impressions: metricTotal("impressions"), likes: metricTotal("likes"), replies: metricTotal("replies"), reposts: metricTotal("reposts"), quotes: metricTotal("quotes") } };
  });
}

function compatibleSkills(state: OpenPresenceState, presence: Presence, situation: SocialStrategySituation): Skill[] {
  const enabled = new Set((state.agentSkills ?? []).filter((binding) => binding.agentId === state.agent?.id && binding.enabled).map((binding) => binding.skillId));
  return (state.skills ?? [])
    .filter((skill) => enabled.has(skill.id) && skill.channels.includes(presence.channel))
    .filter((skill) => (skill.strategyContributions ?? []).some((contribution) => (!contribution.channelId || contribution.channelId === presence.channel) && (!situation.format || skill.compatibleFormats.includes(situation.format))))
    .slice(0, 3);
}

function visualAssetContext(state: OpenPresenceState, presenceId: string) {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence) return "No active Presence is available for visual asset selection.";
  const eligible = state.assets.filter((asset) => asset.retention === "preserved"
    && !asset.archivedAt
    && asset.agentId === state.agent?.id
    && assetIsEligibleForPresence(state, asset, presenceId)
    && asset.rights?.status !== "restricted"
    && asset.reusePermission !== "blocked"
    && ["image", "gif", "video", "chart"].includes(asset.type));
  if (!eligible.length) return "No durable authorized visual asset is currently available. Do not invent or attach media.";
  const usageByAsset = new Map<string, number>();
  const publicationIdsByAsset = new Map<string, Set<string>>();
  for (const usage of state.assetUsages ?? []) {
    if (usage.presenceId !== presenceId || usage.environment !== "live") continue;
    usageByAsset.set(usage.assetId, (usageByAsset.get(usage.assetId) ?? 0) + 1);
    const ids = publicationIdsByAsset.get(usage.assetId) ?? new Set<string>();
    ids.add(usage.publicationId);
    publicationIdsByAsset.set(usage.assetId, ids);
  }
  const executionsByPublication = new Map<string, string>();
  for (const execution of state.executions ?? []) if (execution.presenceId === presenceId && execution.publication?.id && execution.externalRef) executionsByPublication.set(execution.publication.id, execution.externalRef.id);
  const metricByMirror = new Map<string, number>();
  for (const snapshot of state.publicationMetricSnapshots ?? []) {
    if (snapshot.presenceId !== presenceId || snapshot.observationStatus === "unavailable") continue;
    const signal = (snapshot.impressions ?? 0) + (snapshot.likes ?? 0) * 4 + (snapshot.replies ?? 0) * 6 + (snapshot.reposts ?? 0) * 8 + (snapshot.quotes ?? 0) * 8;
    metricByMirror.set(snapshot.mirrorObjectId, Math.max(metricByMirror.get(snapshot.mirrorObjectId) ?? 0, signal));
  }
  const lines = eligible.map((asset) => {
    const usageCount = usageByAsset.get(asset.id) ?? 0;
    const mirrorIds = [...(publicationIdsByAsset.get(asset.id) ?? [])].map((id) => executionsByPublication.get(id)).filter((id): id is string => Boolean(id));
    const bestSignal = mirrorIds.reduce((max, id) => Math.max(max, metricByMirror.get(id) ?? 0), 0);
    const label = asset.description ?? asset.perception?.observation ?? `${asset.type} asset`;
    return { asset, usageCount, bestSignal, label };
  }).sort((left, right) => right.bestSignal - left.bestSignal || right.usageCount - left.usageCount || right.asset.updatedAt.localeCompare(left.asset.updatedAt)).slice(0, 6);
  return `Authorized reusable visuals (ranked by observed reuse and verified performance; evidence is descriptive, not causal):\n${lines.map(({ asset, usageCount, bestSignal, label }) => `- ${asset.id} · ${label.slice(0, 220)} · used ${usageCount} live time${usageCount === 1 ? "" : "s"}${bestSignal ? ` · best observed engagement signal ${bestSignal}` : ""}`).join("\n")}\nChoose media only when it materially improves this post and matches the template's visual guidance. Prefer a relevant previously useful asset over a new discovery; do not attach ads, generic decoration, or uninspected temporary discoveries.`;
}

function durablePreferenceContext(state: OpenPresenceState, presence: Presence) {
  const preferences = (state.preferenceEvidence ?? []).filter((item) => item.agentId === state.agent?.id
    && (item.scopeHint === "agent" || item.presenceId === presence.id)
    && item.reaction === "does_not_fit"
    && Date.now() - Date.parse(item.createdAt) <= 365 * 24 * 60 * 60 * 1000)
    .slice(0, 8);
  if (!preferences.length) return "No durable negative preference has been recorded for this Presence.";
  return `Durable operator constraints from prior feedback (honor these when relevant):\n${preferences.map((item) => `- ${[...(item.reasons ?? []), item.note].filter(Boolean).join(", ") || "This style or decision did not fit"}`).join("\n")}`;
}

export function compileSocialStrategyContext(state: OpenPresenceState, presence: Presence, situation: SocialStrategySituation): CompiledSocialStrategyContext {
  const selectedPlaybook = bundledSocialStrategyPlaybooks().find((candidate) => candidate.channelId === presence.channel);
  const recent = recentStrategyShape(state, presence.id);
  const candidates = (selectedPlaybook?.patterns ?? [])
    .map((pattern) => ({ pattern, score: scorePattern(pattern, situation, recent, learningAdjustmentForPattern(state, presence, pattern.id)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id))
    .reduce<SocialStrategyPattern[]>((result, item) => {
      if (!result.some((pattern) => pattern.mechanism === item.pattern.mechanism)) result.push(item.pattern);
      return result;
    }, [])
    .slice(0, 5);
  const requestedTemplate = situation.strategyTemplateId
    ? (state.growthHypotheses ?? []).find((hypothesis) => hypothesis.id === situation.strategyTemplateId && hypothesis.originatingPresenceId === presence.id && hypothesis.template && !["retired", "disfavored"].includes(hypothesis.status))
    : undefined;
  const hypotheses = [
    ...(requestedTemplate ? [requestedTemplate] : []),
    ...relevantHypotheses(state, presence, situation.objective).filter((hypothesis) => hypothesis.id !== requestedTemplate?.id),
  ].slice(0, 5);
  const templates = hypotheses.filter((hypothesis) => hypothesis.template);
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
    relevantSocialTemplateIds: templates.map((hypothesis) => hypothesis.id),
    selectedTemplateId: requestedTemplate?.id,
    compatibleSkillIds: skills.map((skill) => skill.id),
    recentStrategyShape: recent,
    noPatternReason,
    createdAt: new Date().toISOString(),
  };
  const patternText = candidates.length
    ? candidates.map((pattern) => `- ${pattern.id} · ${pattern.mechanism} · audience role: ${pattern.audienceRole}\n  useful when: ${pattern.usefulConditions.join("; ")}\n  weak when: ${pattern.weakConditions.join("; ")}\n  risks: ${pattern.risks.join("; ")}`).join("\n")
    : `- ${noPatternReason}`;
  const performanceText = strategyPerformanceContext(state, presence.id);
  const templateText = templates.length ? templates.map((h) => `- ${h.id} · ${h.template!.title} · ${h.template!.body} · ${h.status}/${h.confidence}${h.template!.sourceCount ? ` · abstracted from ${h.template!.sourceCount} observed source posts` : ""}${h.template!.audienceFit ? `\n  audience fit: ${h.template!.audienceFit}` : ""}${h.template!.visualGuidance ? `\n  visual guidance: ${h.template!.visualGuidance}` : ""}`).join("\n") : "- No reusable template applies.";
  const skillText = skills.length ? skills.flatMap((skill) => (skill.strategyContributions ?? []).map((contribution) => `- ${skill.id}/${contribution.id}: ${contribution.guidance}`)).join("\n") : "- No specialized strategy Skill applies.";
  const visualText = visualAssetContext(state, presence.id);
  const preferenceText = durablePreferenceContext(state, presence);
  const growthText = `${hypotheses.length ? hypotheses.map((hypothesis) => `- ${hypothesis.id} · ${hypothesis.scope} · ${hypothesis.status} · ${hypothesis.statement}`).join("\n") : "- No applicable structured Growth hypothesis."}\n\n${preferenceText}`;
  const growthProfile = deriveGrowthProfile(state, presence.id);
  const growthProfileText = growthProfile ? `GROWTH PROFILE (derived from the selected Presence brief, active Growth plan, reusable formats, and typed evidence):\n- audience: ${growthProfile.audience}\n- primary territory: ${growthProfile.primaryTerritory.join(", ") || "not specified"}\n- adjacent territory: ${growthProfile.adjacentTerritory.join(", ") || "not specified"}\n- qualified outcome: ${growthProfile.qualifiedOutcome}\n- relationship focus: ${growthProfile.relationshipFocus.join(", ") || "not specified"}\n- active approach: ${growthProfile.activeApproach.join("; ")}\n- reusable formats: ${growthProfile.reusableFormats.join(", ") || "none saved yet"}\n- media approach: ${growthProfile.mediaApproach}\n- exclusions: ${growthProfile.exclusions.join("; ")}\n- evidence confidence: ${growthProfile.confidence}` : "No derived Growth profile is available; keep audience claims conservative.";
  const recentText = Object.entries(recent).filter(([, count]) => count > 0).map(([mechanism, count]) => `${mechanism} ${count} of last ${Math.max(1, Object.values(recent).reduce((sum, value) => sum + value, 0))}`).join(", ") || "no selected strategy shape recorded";
  return {
    retrievalRun,
    prompt: `SOCIAL STRATEGY INTELLIGENCE (possibilities, never instructions)\nChannel: ${presence.channel}\nPlaybook: ${selectedPlaybook ? `${selectedPlaybook.id} v${selectedPlaybook.version}` : "no built-in Playbook"}\nBefore choosing, compare relevant alternatives among the supplied patterns, especially a different mechanism when recent decisions repeat one. Variety is a consideration, never a quota or reason to publish irrelevant content.\nRecent strategy shape: ${recentText}\n${growthProfileText}\n${legacy ? `Legacy Channel guidance: ${legacy.text}\n` : ""}\nConsider up to five candidates, select none when appropriate, and never copy example wording.\n${patternText}\n\nRelevant Growth hypotheses (evidence, not policy):\n${growthText}\n\nReusable templates (structure only; ground every variable and never invent identity):\n${templateText}\n\n${performanceText}\n\n${visualText}\n\nIMAGE DECISION RULE: explicitly compare image versus text-only for every original post or quote. Attach one authorized visual only when it materially improves proof, comprehension, identity, or attention for this specific idea; prefer a relevant durable asset with verified reuse evidence, and stay text-only when no asset passes relevance, rights, readiness, and reuse checks. Do not attach ads, generic decoration, or uninspected temporary discoveries.\n\nCompatible strategy Skills (extensions, not replacements):\n${skillText}\n\nFor every act, declare strategyId from the supplied IDs and mechanismId from that pattern. If a requested template is in scope, preserve its exact ID in strategyTemplateId. If none fits, omit strategyId and give noStrategyReason. Missing selections or invented IDs require correction. Do not choose a pattern just to fill this field.`,
  };
}

export function strategyUseFromDecision(run: SocialStrategyRetrievalRun | undefined, acts: Array<{ action: string; strategyId?: string; mechanismId?: string; noStrategyReason?: string }> | undefined): SocialStrategyUse | undefined {
  if (!run) return undefined;
  const allowed = new Set(run.consideredPatterns.map((pattern) => pattern.id));
  const selectedByAct = (acts ?? []).map((act) => {
    const pattern = act.strategyId ? run.consideredPatterns.find((candidate) => candidate.id === act.strategyId) : undefined;
    return {
      act: act.action,
      patternId: pattern && allowed.has(pattern.id) ? pattern.id : undefined,
      // A mechanism is valid only when it belongs to this act's selected
      // pattern; never attach a mechanism borrowed from another candidate.
      mechanismId: pattern && (!act.mechanismId || act.mechanismId === pattern.mechanism) ? pattern.mechanism : undefined,
      reason: act.noStrategyReason?.trim() || (!pattern ? "Strategy selection not recorded." : undefined),
    };
  });
  return { retrievalRunId: run.id, playbookId: run.playbookId, playbookVersion: run.playbookVersion, consideredPatternIds: run.consideredPatterns.map((pattern) => pattern.id), selectedByAct, strategyTemplateId: run.selectedTemplateId };
}

/** Store a source-backed interpretation; only later outcome review can support it. */
export function learnObservedSocialPattern(source: OpenPresenceState, presenceId: string, input: { statement: string; mirrorObjectIds: string[] }) {
  const state = structuredClone(source);
  ensureGrowthEvidenceRecords(state, presenceId, new Date().toISOString(), input.mirrorObjectIds);
  const evidenceIds = [...new Set(input.mirrorObjectIds)].map((id) => `growth-evidence:observed:${id}`);
  if (!evidenceIds.length || evidenceIds.some((id) => !state.growthEvidenceRecords?.some((record) => record.id === id && record.presenceId === presenceId))) throw new Error("Learn a pattern only from observed public posts in this Presence. Search or inspect the sources first.");
  const existing = state.growthHypotheses?.find((item) => item.originatingPresenceId === presenceId && item.statement === input.statement.trim());
  if (existing) return { state, hypothesis: existing };
  const reviewId = `chat-pattern:${crypto.randomUUID()}`;
  applyGrowthHypothesisActions(state, presenceId, reviewId, [{ action: "create", statement: input.statement, evidenceIds, confidence: "low", scope: "presence" }]);
  return { state, hypothesis: state.growthHypotheses!.find((item) => item.id === `growth-hypothesis:${reviewId}:0`)! };
}
