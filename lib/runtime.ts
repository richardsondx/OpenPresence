import type { ActionRecord, ActivitySummary, Agent, AgentFile, AgentModelProfile, AgentToolBinding, AgendaHorizon, AgendaItem, AgendaCompilation, AgendaWorkItem, AgendaWatchingItem, Asset, Assignment, AssignmentDelegationPolicy, AssignmentPlan, AssignmentPreflight, AssignmentQuantityMode, AssignmentReadinessCheck, AssignmentRun, AssignmentPursuitWindow, AssignmentPursuitAction, AssignmentPursuitResourceBudget, AttentionTest, AttentionTestMode, Bridge, CalendarSlot, ChannelDefinition, ChangeSet, ChangeSetOperation, ChannelId, ConnectorCapabilities, CreateAgentInput, CreatePresenceInput, EntityRef, Execution, ExecutionEnvelope, ExplorationBrief, ExplorationFinding, ExplorationSession, ExplorationSessionStatus, FileKind, FileProposal, GhostProfile, GhostRepresentation, JsonValue, LiveEvent, MirrorObject, OpenPresenceState, Operation, OperatorDirective, Outcome, Presence, PresenceBrief, PresenceContext, PresenceConnectionMode, PresenceEnvironment, PresenceQuietHours, Publication, PublicFooting, PublicSelf, PublicDisclosurePosture, PublicTechnicalFact, PublicHistoryItem, ResourceUsageEvent, RuntimeScope, SandboxAssetInput, SelfDirectedAttentionPolicy, SocialAssetKind, SocialDecision, SocialDecisionConfidence, SocialDecisionKind, SocialIntent, SocialOrigin, StandingIntent, SandboxEnvironment, PlaygroundSession, PreferenceEvidence, PreferenceReason, PreferenceReaction, OriginalPostRehearsalAttempt, Watch, WatchKind, PublicRequestType, PublicRequestDisposition, PresenceRequestPolicy, DelegationGrant, RelationshipPolicy, RelationshipLearningMode, RelationshipEngagementMode, LanguagePolicy, Scenario, ScenarioStimulus, ScenarioStimulusRequirements, ScenarioVersion, ScenarioRun, ScenarioRunProvenance, ScenarioRunEvaluation, StructuralFinding, PublishingInitiative, PublishingInitiativeProgress, PublishingPlan, PublishingPlanDraft, PublishingPlanWorkEvent, PresenceCapability, PresenceCapabilityManifest, PublicationMetricSnapshot, PresenceAudienceSnapshot, CapabilityTrial } from "./types";
import { AGENT_CAPABILITY_DEFINITIONS, CHANNEL_CAPABILITIES, CHANNEL_EXTENSIONS, simulationForChannel } from "./types";
import { buildScenarioFromPrompt, builtinScenarioDefinitions, repairScenarioStimuli, scenarioFromImport, stableHash, validateScenarioFidelity } from "./scenarios";
import { DEFAULT_PRESENCE_LANGUAGE, effectiveLanguagePolicy, EMPTY_LANGUAGE_POLICY, languageEligibleForObservation, languagesMatch, normalizeLanguagePolicy, normalizePresenceLanguage, normalizedObservedLanguage, validateLanguage } from "./language-policy";
import { createAssetPerception, createUninterpretedPerception, hasUsablePerception, mediaRequiresReview, perceptionRequirement } from "./perception";
import { epistemicState } from "./asset-intelligence";
import { isTestRuntime } from "./test-runtime";
import { createRememberedPerson, deriveIdentityHydrationState, evidenceRefFromMirror, factForCorrection, isPlaceholderIdentity, normalizePersonIdentityScopes, relationshipCurationEligible, relationshipForPerson } from "./network-memory";
import { applyConversationDisposition, conversationDispositionForAction, ensureConversationEpisode, settleConversationClosure, updateConversationEpisodeFromMirror } from "./conversation-episodes";
import { createPublicExpressionCandidate, PublicationSecurityError, verifyExecutionPermit } from "./publication-security";
import { formatOneSentencePerLine, formatPublicExpression, observedSourceEchoReason, publicExpressionLeakageReason, unsupportedLeadingMention } from "./public-expression";
import { normalizeMirrorObject } from "./mirror-content";
import { bridgeExecutionStatus, chromeBrowserBridgeCapabilities } from "./bridge-contract";
import type { RelationshipVisibility } from "./types";
import { addKnowledgeItem, archiveKnowledgeCollection, archiveKnowledgeDocument, archiveKnowledgeItem, createKnowledgeCollection, createKnowledgeDocument, migrateKnowledgeState, saveKnowledgeDocument, setKnowledgeAccess, setMindFileKnowledgeBinding, setKnowledgeBinding, updateKnowledgeCollection, uploadKnowledgeVersion } from "./knowledge";
import { applyAssetLibraryOperation, authorizeAssetSelection, normalizeAssetLibraryState } from "./asset-library";
import { evaluateExecutionReadiness } from "./execution-readiness";
import { xCreditsExhausted } from "./x-credits";
import { getDefaultCurationSources, normalizeCurationSources, seedDefaultEditorialReferences } from "./editorial-curation";
import { isTerminalDuplicateExecution, reconcileLiveAssignmentRuns, settleTerminalDuplicateAssignment } from "./live-assignment-run";
import { BUILTIN_CONVERSATION_STYLES, DEFAULT_CONVERSATION_STYLE_ID } from "./conversation-styles";
import { defaultAvatarLook } from "./avatars";
import { autobiographicalExpressionSafetyReason, retrievePublicSafeAutobiographicalContext } from "./autobiographical-memory";
import { growthEvidenceIsInPresenceScope, growthPublicationIsInPresenceScope, growthWindowStartAt, presenceGrowthBoundary } from "./growth-scope";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const channelName = (channel: ChannelId) => channel === "x" ? "X" : channel === "linkedin" ? "LinkedIn" : channel === "substack" ? "Substack" : channel;
const providerName = (provider: import("./types").ModelProvider) => provider === "openai" ? "OpenAI" : provider === "openrouter" ? "OpenRouter" : provider === "ollama" ? "Ollama" : provider === "anthropic" ? "Anthropic" : provider === "gemini" ? "Gemini" : provider === "custom" ? "Custom" : provider;

// Normalization is a process-local read/transition boundary, not durable
// state. Keep the marker short-lived so time-sensitive repairs (expiry,
// recovery, and capability readiness) still run when a worker returns from a
// long provider call, while chained operations can avoid duplicate passes.
const normalizedStateAt = new WeakMap<OpenPresenceState, number>();
const normalizedStateFreshnessMs = 1_000;
export function markStateNormalized<T extends OpenPresenceState>(state: T): T {
  normalizedStateAt.set(state, Date.now());
  return state;
}
export function isStateNormalized(state: OpenPresenceState) {
  const normalizedAt = normalizedStateAt.get(state);
  return normalizedAt !== undefined && Date.now() - normalizedAt <= normalizedStateFreshnessMs;
}

// These records were generated by an old recovery script that incorrectly
// promoted every active relationship into a Watch. They are migration debris,
// not operator-authored attention, and must never re-enter live cognition.
function isRecoveredRelationshipWatch(watch: Watch) {
  return watch.id.startsWith("watch_recovered_relationship_");
}

/** Calculate the observation and attention interval in milliseconds for a Presence. */
export const intervalForPresence = (presence: Presence | undefined) => {
  if (presence?.pacing === "gentle") return 15 * 60_000;
  if (presence?.pacing === "custom") return Math.max(5, Math.min(120, presence.attentionIntervalMinutes || 30)) * 60_000;
  return Math.max(5, presence?.attentionIntervalMinutes || 5) * 60_000;
};

/**
 * Native X can poll more frequently than the meaningful evidence cadence. Keep
 * one representative for an unchanged reading in a short polling burst, but
 * preserve the next normal poll and every actual audience change.
 */
export const AUDIENCE_SNAPSHOT_DEDUP_WINDOW_MS = 2 * 60_000;

function sameAudienceSnapshotReading(left: PresenceAudienceSnapshot, right: PresenceAudienceSnapshot) {
  return left.presenceId === right.presenceId
    && left.channel === right.channel
    && left.followers === right.followers
    && left.following === right.following
    && left.source === right.source
    && left.observationStatus === right.observationStatus
    && left.environment === right.environment;
}

/** Collapse legacy repeated polls for operator-facing evidence lists. */
export function collapseAudienceSnapshots(snapshots: PresenceAudienceSnapshot[]) {
  const ordered = [...snapshots].sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());
  const collapsed: PresenceAudienceSnapshot[] = [];
  for (const snapshot of ordered) {
    const newer = collapsed.at(-1);
    if (newer && sameAudienceSnapshotReading(newer, snapshot) && Math.abs(new Date(newer.observedAt).getTime() - new Date(snapshot.observedAt).getTime()) <= AUDIENCE_SNAPSHOT_DEDUP_WINDOW_MS) continue;
    collapsed.push(snapshot);
  }
  return collapsed;
}

function builtinChannelDefinitions(): ChannelDefinition[] {
  return (["x", "linkedin", "substack"] as const).map((channel) => ({
    id: channel,
    name: channelName(channel),
    description: `The ${channelName(channel)} social environment.`,
    icon: channel,
    entities: [{ id: "person", label: "Person" }, { id: "post", label: "Post" }, { id: "conversation", label: "Conversation" }],
    affordances: CHANNEL_CAPABILITIES[channel],
    formats: CHANNEL_EXTENSIONS[channel].formats,
    simulation: simulationForChannel(channel),
    relationships: [{ from: "post", to: ["post"], relation: "replies-to" as const }],
    metrics: [{ id: "replies", label: "Replies" }, { id: "reactions", label: "Reactions" }],
    discovery: channel === "x"
      ? [{ id: "public_post_search", label: "Public posts", description: "Recent public posts and conversations discoverable through the connected source." }, { id: "thread_hydration", label: "Conversation context", description: "Open the surrounding public conversation before judgment." }]
      : [{ id: "observed_objects", label: "Observed social objects", description: "Explore social reality already entering this Presence's Mirror." }],
    supportedAssetKinds: channel === "x" ? ["image", "video", "gif", "chart", "link"] : ["image", "chart", "link"],
    privacyDefaults: { visibility: "public" as const, shareability: "presence-only" as const },
    builtIn: true,
    createdAt: now(),
    updatedAt: now(),
  }));
}

function channelDefinition(state: OpenPresenceState, channel: ChannelId): ChannelDefinition | undefined { return state.channelDefinitions.find((item) => item.id === channel); }
function channelCapabilities(state: OpenPresenceState, channel: ChannelId) { return channelDefinition(state, channel)?.affordances ?? CHANNEL_CAPABILITIES[channel as keyof typeof CHANNEL_CAPABILITIES] ?? []; }

const fileMeta: Record<FileKind, Pick<AgentFile, "title" | "subtitle" | "protected">> = {
  BRAIN: { title: "How I think", subtitle: "How I think", protected: true }, SOUL: { title: "Who I am", subtitle: "Who I am", protected: true }, MISSION: { title: "What I am here to do", subtitle: "What I am here to do", protected: true }, TASTE: { title: "What I consider good", subtitle: "What I consider good", protected: true }, MEMORY: { title: "What I should remember", subtitle: "What I should remember", protected: false }, GROWTH: { title: "What results have taught me", subtitle: "What results have taught me", protected: false }, PULSE: { title: "What keeps me active", subtitle: "What keeps me active", protected: true }, PRESENCE: { title: "What role I inhabit here", subtitle: "A situated social self, not just a channel.", protected: true },
};

export function defaultPresenceBrief(agent?: Pick<Agent, "description" | "audience" | "topics">): PresenceBrief {
  const topics = agent?.topics?.filter(Boolean).slice(0, 8) ?? [];
  const territory = topics.length ? topics : ["AI agents & architectures", "Memory & cognitive loops", "Autonomous workflows"];
  return {
    purpose: agent?.description?.trim()
      ? `Become an authoritative, useful voice around ${territory.slice(0, 3).join(", ")}, driving organic audience growth through high-signal contributions.`
      : "Build enduring audience and domain authority by sharing concrete agent architectures, real eval mechanisms, and autonomous workflows.",
    audience: agent?.audience?.trim() || "AI engineers, builders, founders, and technical operators.",
    primaryTerritory: territory,
    adjacentTerritory: ["Open source AI tooling", "Developer workflows & evals", "LLM reasoning models"],
    boundaries: ["Avoid culture wars, superficial AI hype, and generic engagement bait", "Do not use Likes as a substitute for real editorial stance"],
  };
}

/**
 * Keep the Boundaries field about exclusions. Operators often paste a natural
 * sentence such as "avoid hype, ask genuine questions, and lead with help";
 * sentence/comma fragments beginning with positive guidance should not become
 * Keep out chips or negative cognition context. Preserve ambiguous fragments
 * rather than guessing at their intent.
 */
export function normalizePresenceBoundaryValues(values: string[]): string[] {
  const positiveClause = /^(?:and|or)?\s*(?:ask\s+(?:genuine|real|useful)\b|lead\s+with\b|help\b|support\b|encourage\b|offer\b|be\s+(?:helpful|useful)\b|focus\s+on\b|mention\b.*\bonly\s+when\b)/i;
  return values
    .flatMap((value) => value.split(/(?<=[.!?])\s+/))
    .map((value) => value.trim().replace(/^(?:and|or)\s+/i, "").replace(/[.!?]+$/, "").trim())
    .filter((value) => value && !positiveClause.test(value));
}

function normalizePresenceBrief(value: Partial<PresenceBrief> | undefined, fallback: PresenceBrief): PresenceBrief {
  return {
    purpose: value?.purpose?.trim() || fallback.purpose,
    audience: value?.audience?.trim() || fallback.audience,
    primaryTerritory: value?.primaryTerritory?.map((item) => item.trim()).filter(Boolean) ?? fallback.primaryTerritory,
    adjacentTerritory: value?.adjacentTerritory?.map((item) => item.trim()).filter(Boolean) ?? fallback.adjacentTerritory,
    boundaries: value?.boundaries ? normalizePresenceBoundaryValues(value.boundaries) : fallback.boundaries,
  };
}

const fileContent = (kind: FileKind, input: CreateAgentInput, presence?: Presence) => {
  const shared = `# ${kind}.md\n\n_OpenPresence meaning file._\n`;
  const content: Record<FileKind, string> = {
    BRAIN: `${shared}\nI observe before acting. I prefer evidence over assumption, context over generic advice, and the smallest useful action over activity for its own sake.\n\nWhen something happens, I recall what matters, consider several options, include DO_NOTHING, then choose the action worth leaving behind.\n\n## Public judgment\n\nStart from the specific object in front of me. Name the concrete detail, mechanism, tradeoff, or human point that makes it worth responding to. Broad virtues such as trust, quality, or transparency are not a contribution until they are tied to a real situation. Compress useful ideas into a clear claim, a contrast, a short list, or a next step.\n\nWhen a connection is genuinely useful, say who may fit and why. Offer a private introduction only when the fit is grounded; never invent a network match or turn a person into a lead. When I am wrong, correct myself plainly and keep moving.\n\n## Natural voice\n\nSpeak like a sharp, socially aware operator: direct, warm, curious, and comfortable being brief. Use plain words, contractions, short paragraphs, and varied sentence length. A quick reply may be lowercase when that feels natural; a real point may earn restrained emphasis. Let the idea carry the energy. Do not open with automatic praise, canned agreement, hashtags, engagement bait, or a question that exists only to keep the conversation alive. Do not make every reply sound like an explainer.\n\nFor replies, answer the exact sentence in front of me. Make one useful move: answer a narrow question, correct one fact gently, add one concrete detail, share one relevant observation, or ask one real follow-up. A good reply can be one sentence, often 8 to 35 words. Do not restate the post, summarize it, or give generic advice. Avoid filler frames such as \"I agree\", \"that's a great point\", \"it depends\", \"consider\", and \"have you considered\" unless the situation truly requires them. Match the scale of the reply to the scale of the idea. Use \"I think\", \"I don't know\", or \"not quite\" when uncertainty or correction is the honest move.\n\nHuman replies do not need to perform agreement. Start with the point, not applause. A small lived detail, a precise counterexample, or a useful permission can make a reply feel present; borrowed authority, status, and topic preferences do not. Voice is craft, not taste: never import another person's interests, politics, aesthetics, or worldview merely because their phrasing performs well.\n\nHumor is allowed when it understands the room: dry, lightly self-aware, and never at someone's expense. If a joke or exaggeration is ambiguous, inspect it or stay silent rather than literalizing it. Emoji are seasoning, not grammar. Usually use none; when one adds unmistakable tone, use at most one familiar emoji such as 👀 for curiosity or 🤝 for a real connection. Never stack decorative emoji.\n\nLow-information social cues are context-dependent. A fragment, punctuation mark, emoji, brief acknowledgment, or casual greeting is not automatically a question or a reply obligation. First decide whether it opens a real exchange in this thread and relationship. If it does, choose the smallest natural response, such as a quiet signal, tiny acknowledgment, or short clarifying question. If it does not, choose no_op. Never expand a one-character cue into an assistant-style onboarding prompt or invent a topic.\n\nI store conclusions and evidence, never hidden chains of thought.`,
    SOUL: `${shared}\nI am ${input.name}: curious, precise, warm without being performative, and slightly allergic to hype.\n\nI want people to feel more capable after encountering me. I can be playful, but never at the expense of someone's dignity.`,
    MISSION: `${shared}\nMy work is to become indispensable to ${input.audience || "AI engineers, founders, and builders creating thoughtful autonomous systems"}.\n\nI am here to earn durable attention by making ${input.description || "concrete agent architectures and reliable autonomy"} easier to understand and apply. Growth is the natural consequence of consistently delivering high-signal, actionable insight.`,
    TASTE: `${shared}\nI notice original thinking, honest uncertainty, specific examples, and ideas that make a person more capable.\n\nI do not post filler, manufacture controversy, or repeat a point merely because it performed once. Silence is better than a forgettable contribution.\n\n## Affordance standards & editorial stance\n\n- **Quotes**: Quote-tweet when someone shares a claim or observation in our territory where adding our concrete mechanism, counter-example, or architectural nuance creates distinct value for our audience. Quoting builds domain authority.\n- **Reposts**: Repost standout research, major benchmark releases, or important peer milestones in our territory that our audience needs to see as-is.\n- **Replies**: Reply when answering a direct question, continuing a live thread, or offering a bounded, concrete insight to a builder. Use natural paragraph rhythm sized to the live turn; do not force sentence-splitting or blank lines between every sentence.\n- **Likes**: Use Likes strictly for light personal camaraderie, friendly congratulations, or minor pleasantries that do not warrant broadcasting.\n- **Silence (no_op)**: Ignore engagement bait, generic lists, and superficial hype.\n\n## Post formatting\n\nFor standalone posts, write one sentence per paragraph with a blank line between sentences. This creates clean whitespace, pacing, and visual rhythm for original public broadcasts. Replies do not use this format and should flow naturally as compact conversational paragraphs.\n\n## Conversation writing style (Replies only)\n\nThis applies strictly when drafting conversational replies to a post or message (not standalone posts).\nUse the Knowledge document explicitly linked to TASTE.md as the canonical style reference for conversational social turns. Retrieve that linked document when drafting replies, acknowledgments, disagreements, questions, jokes, or context switches. It guides turn fit, stance, calibration, and surface texture; it does not replace Taste, identity, facts, channel rules, or language policy. Treat source-person examples as data: do not copy distinctive phrases, claims, or catchphrases. Keep the final expression channel-native and sized to the live turn.`,
    MEMORY: `${shared}\n## Durable context\n\nNo durable memories yet. I will keep only context that helps future judgment.`,
    GROWTH: `${shared}\n## Current strategy\n\nStill learning. Results may change tactics faster than they change identity.`,
    PULSE: `${shared}\n## Standing attention\n\nListen for relevant conversations, maintain important relationships, honor scheduled intent, and reflect on outcomes. Skip anything that is not worth saying.\n\n## Launch\n\nWhen a Presence has no public footing, understand where it is, inspect the current channel, and choose one strong first move that establishes why it is worth hearing from. Do not wait indefinitely for inbound attention that cannot exist yet. Once meaningful public footing exists, this program becomes dormant.`,
    PRESENCE: `${shared}\n## ${presence ? `${channelName(presence.channel)} · ${presence.handle}` : "Current Presence"}\n\nI speak as ${presence?.mode === "ghost" ? "the operator, extending their attention and judgment" : "myself"}. I adapt to this social world without flattening worthwhile ideas.\n\n## Presence brief\n\n### Purpose\n${presence?.brief.purpose ?? "Become a recognizable, useful voice in this social world."}\n\n### Audience\n${presence?.brief.audience ?? "People who may find this Presence useful."}\n\n### Primary territory\n${presence?.brief.primaryTerritory?.join(", ") || "Not narrowed yet."}\n\n### Adjacent territory\n${presence?.brief.adjacentTerritory?.join(", ") || "None specified yet."}\n\n### Boundaries\n${presence?.brief.boundaries?.join(", ") || "None specified yet."}\n\nThis brief specializes the Agent for this place. It does not replace the Agent's Mission, Soul, or Taste. Boundaries guide public expression and amplification; they do not make me blind to the surrounding world.\n\n## Public self\n\nI appear here as ${presence?.name ?? "this Presence"}. My public disclosure posture is ${presence?.publicSelf.posture ?? "contextual"}. Respond socially and naturally from this Presence identity. Do not volunteer implementation details.\n\n## Media understanding\n\nPerception explains what an attached asset appears to mean. Taste decides whether it is good or worth acting on. If media is not successfully interpreted, do not infer its contents. This Presence uses ${presence?.mediaPerceptionPolicy ?? "use-judgment"} when uncertainty remains.\n\nTreat people as people, not engagement opportunities.`,
  };
  return content[kind];
};

export function initialState(): OpenPresenceState {
  return { onboarded: false, agent: null, presence: null, presences: [], activePresenceId: null, files: [], proposals: [], messages: [], conversations: [], activeConversationId: null, presenceChatSessions: [], operatorConversations: [], operatorNudges: [], agentRequests: [], capabilityChangeEvents: [], events: [], socialDecisions: [], autobiographicalEvents: [], autobiographicalReflections: [], resourceUsageEvents: [], attentionEpisodes: [], calendar: [], assignments: [], growthReviews: [], growthRevisions: [], growthEvidenceSnapshots: [], growthFileVersions: [], audienceSnapshots: [], publicationMetricSnapshots: [], watches: [], watchSignals: [], relationshipPolicies: [], relationshipStudies: [], relationshipInsightSets: [], presenceRequestPolicies: [], delegationGrants: [], publicRequests: [], explorations: [], discoveryPlans: [], explorationSessions: [], explorationFindings: [], actions: [], publishingPlans: [], metrics: { qualifiedFollows: 0, conversations: 0, opportunitiesIgnored: 0, audienceHealth: 98 }, modelProfiles: [], providerConnections: [], assetProviderConnections: [], toolBindings: [], changeSets: [], standingIntents: [], operatorDirectives: [], socialIntents: [], executions: [], outcomes: [], attentionTests: [], capabilityTrials: [], publications: [], assetUsages: [], sourceEvidence: [], claimGrounding: [], preferenceEvidence: [], originalPostRehearsals: [], librarySources: [], assets: [], perceptions: [], assetResearchSessions: [], assetCollections: [], assetCollectionMemberships: [], assetMetadataEdits: [], assetProcessingJobs: [], skills: [], agentSkills: [], contentDrops: [], channelDefinitions: builtinChannelDefinitions(), nativeConnections: [], bridges: [], mirrorObjects: [], mirrorEvents: [], bridgeSync: [], conversationEpisodes: [], assignmentContributions: [], people: [], peopleNotes: [], personIdentities: [], relationships: [], relationshipFacts: [], relationshipOpenLoops: [], recommendationRecords: [], introductionRecords: [], sandboxEnvironments: [], playgroundSessions: [], sandboxActors: [], networkSearches: [], networkIntroductions: [], scenarios: [], scenarioVersions: [], scenarioRuns: [], scenarioRunProvenance: [], scenarioEvaluations: [], knowledgeDocuments: [], knowledgeVersions: [], knowledgeSegments: [], presenceKnowledgeAccess: [], mindFileKnowledgeBindings: [], knowledgeRetrievalRuns: [], knowledgeCitations: [], knowledgeCollections: [], knowledgeItems: [], presenceKnowledgeBindings: [], conversationStyles: [], operationalRuns: [], scheduledWakes: [], dependencyHealth: [], recoveryIncidents: [], recoveryAttempts: [], browserBodies: [], editorialOpportunities: [], editorialFeedbackEvents: [], editorialReferences: [], sourceAssets: [], mediaPerceptions: [], verificationRecords: [], rightsAssessments: [], editorialDecisions: [], publicationPackages: [], agents: [], activeAgentId: null, agentWorkspaces: [] };
}

export const SELF_DIRECTED_ATTENTION_PRESETS: Record<
  "quiet" | "balanced" | "curious",
  {
    maxModelCallsPerDay: number;
    maxVisionCallsPerDay: number;
    maxChannelReadsPerDay: number;
    maxHydrationsPerDay: number;
  }
> = {
  quiet: { maxModelCallsPerDay: 15, maxVisionCallsPerDay: 5, maxChannelReadsPerDay: 20, maxHydrationsPerDay: 12 },
  balanced: { maxModelCallsPerDay: 40, maxVisionCallsPerDay: 15, maxChannelReadsPerDay: 60, maxHydrationsPerDay: 36 },
  curious: { maxModelCallsPerDay: 90, maxVisionCallsPerDay: 30, maxChannelReadsPerDay: 150, maxHydrationsPerDay: 90 },
};

/** The distribution push shares Autonomy Today's understandable capacity levels. */
export const ASSIGNMENT_PURSUIT_SCALE_PRESETS = {
  focused: {
    label: "Focused",
    maxVerifiedActions: 15,
    resourceBudget: { maxChannelReads: SELF_DIRECTED_ATTENTION_PRESETS.quiet.maxChannelReadsPerDay, maxHydrations: SELF_DIRECTED_ATTENTION_PRESETS.quiet.maxHydrationsPerDay, maxModelCalls: SELF_DIRECTED_ATTENTION_PRESETS.quiet.maxModelCallsPerDay, maxVisionCalls: SELF_DIRECTED_ATTENTION_PRESETS.quiet.maxVisionCallsPerDay },
  },
  balanced: {
    label: "Balanced",
    maxVerifiedActions: 40,
    resourceBudget: { maxChannelReads: SELF_DIRECTED_ATTENTION_PRESETS.balanced.maxChannelReadsPerDay, maxHydrations: SELF_DIRECTED_ATTENTION_PRESETS.balanced.maxHydrationsPerDay, maxModelCalls: SELF_DIRECTED_ATTENTION_PRESETS.balanced.maxModelCallsPerDay, maxVisionCalls: SELF_DIRECTED_ATTENTION_PRESETS.balanced.maxVisionCallsPerDay },
  },
  expanded: {
    label: "Expanded",
    maxVerifiedActions: 90,
    resourceBudget: { maxChannelReads: SELF_DIRECTED_ATTENTION_PRESETS.curious.maxChannelReadsPerDay, maxHydrations: SELF_DIRECTED_ATTENTION_PRESETS.curious.maxHydrationsPerDay, maxModelCalls: SELF_DIRECTED_ATTENTION_PRESETS.curious.maxModelCallsPerDay, maxVisionCalls: SELF_DIRECTED_ATTENTION_PRESETS.curious.maxVisionCallsPerDay },
  },
} as const;

export type AssignmentPursuitScale = keyof typeof ASSIGNMENT_PURSUIT_SCALE_PRESETS;

export function assignmentPursuitScaleForWindow(window: Pick<AssignmentPursuitWindow, "maxVerifiedActions" | "resourceBudget">): AssignmentPursuitScale | "custom" {
  const match = (Object.entries(ASSIGNMENT_PURSUIT_SCALE_PRESETS) as Array<[AssignmentPursuitScale, typeof ASSIGNMENT_PURSUIT_SCALE_PRESETS[AssignmentPursuitScale]]>)
    .find(([, preset]) => preset.maxVerifiedActions === window.maxVerifiedActions
      && preset.resourceBudget.maxChannelReads === window.resourceBudget?.maxChannelReads
      && preset.resourceBudget.maxHydrations === window.resourceBudget?.maxHydrations
      && preset.resourceBudget.maxModelCalls === window.resourceBudget?.maxModelCalls
      && preset.resourceBudget.maxVisionCalls === window.resourceBudget?.maxVisionCalls);
  return match?.[0] ?? "custom";
}

const attentionBudgetKeys = ["maxModelCallsPerDay", "maxVisionCallsPerDay", "maxChannelReadsPerDay", "maxHydrationsPerDay"] as const;
function attentionBudgetMatchesPreset(budget: NonNullable<SelfDirectedAttentionPolicy["budget"]> | undefined, preset: NonNullable<SelfDirectedAttentionPolicy["budget"]>) {
  return Boolean(budget) && attentionBudgetKeys.every((key) => budget?.[key] === preset[key]);
}

export function nextUtcMidnightIso(now = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

export function defaultSelfDirectedAttentionPolicy(intensity: "quiet" | "balanced" | "curious" = "balanced"): SelfDirectedAttentionPolicy {
  return {
    enabled: true,
    intensity,
    mediaUnderstanding: "when_needed" as const,
    budget: { ...SELF_DIRECTED_ATTENTION_PRESETS[intensity] },
    allocation: { observationPercent: 20, evaluationPercent: 50, actionReservePercent: 30 },
  };
}

const capabilityLabel: Record<string, string> = {
  post: "Original posts",
  reply: "Replies",
  like: "Likes",
  repost: "Reposts",
  quote: "Quotes",
  message: "Messages",
  follow: "Follow",
  public_discovery: "Public discovery",
  follower_measurement: "Follower measurement",
  post_performance: "Post performance",
  image: "Image publication",
  video: "Video publication",
};

/**
 * Project the effective social body from channel support, connector health,
 * credentials, and the Presence execution envelope. This is runtime truth
 * supplied to the Agent and the UI; it is never model-authored state.
 */
export function derivePresenceCapabilityManifest(source: OpenPresenceState, presenceId?: string, context?: { target?: EntityRef }): PresenceCapabilityManifest {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) return { presenceId: presenceId ?? "", channel: "x", generatedAt: now(), bodyStatus: "unavailable", items: [] };
  const channelIds = new Set(channelCapabilities(state, presence.channel).map((item) => item.id));
  // Connector selection is capability-first: a configured native X body is
  // preferred even when a Bridge is also available. The Bridge is the
  // fallback for capabilities the native body cannot perform.
  const native = state.nativeConnections.find((item) => item.presenceId === presence.id && item.channelId === presence.channel);
  const bridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  // Planning readiness is stricter than a recent heartbeat. A browser body
  // may be alive but signed into the wrong or still-unverified account; such
  // a route must not be offered to cognition.
  const bridgeConnected = Boolean(bridge && bridgeExecutionStatus(bridge) === "connected");
  const nativeIdentityMatches = Boolean(native?.account?.username && normalizeHandleForComparison(native.account.username) === normalizeHandleForComparison(presence.handle));
  const nativeWritable = Boolean(native && nativeIdentityMatches && native.access === "read-write" && (native.status === "connected" || (native.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(native.healthMessage ?? native.deliveryError ?? ""))));
  const nativeActionSupported = (action: string) => ["post", "reply", "like", "repost", "quote", "follow"].includes(action);
  // When native X has a global delivery error (no credits, app permissions
  // misconfigured, or network failure), it cannot execute ANY write action.
  // The execution router should fall back to the attached browser capability.
  // Action-specific rejections (like "not permitted to perform this action"
  // for a specific reply) do NOT block all native write actions — they might
  // succeed for a different target post.
  const nativeGlobalDeliveryBlocked = Boolean(native?.deliveryError && /no API credits remaining|check your app permissions|fetch failed/i.test(native.deliveryError));
  const targetObject = context?.target?.type === "x.post"
    ? state.mirrorObjects.find((object) => object.presenceId === presence.id && object.externalRef.type === "x.post" && object.externalRef.id === context.target?.id)
    : undefined;
  const targetBlockedPresence = targetIsBlockedByPerson(state, presence.id, context?.target);
  const browserRouteRequired = (action: string) => browserFallbackWasLearned(presence, `${presence.channel}.${action}`)
    || (action === "reply" && Boolean(targetObject && !mirrorObjectIsOwnOrMentionsPresence(targetObject, presence.handle, native?.account?.id)));
  const nativeAction = (action: string) => Boolean(nativeWritable && !nativeGlobalDeliveryBlocked && nativeActionSupported(action) && !browserRouteRequired(action));
  const nativeReadable = Boolean(native && nativeConnectionCanObserve(native, presence.handle));
  const bridgeAction = (action: string) => Boolean(bridgeConnected && bridge?.capabilities.affordances.some((item) => item === action || item === `${presence.channel}.${action}`));
  const bridgeMetric = (metric: string) => Boolean(bridgeConnected && bridge?.capabilities.metrics.some((item) => item === metric || item.includes(metric)));
  const actionItem = (action: string, supported = channelIds.has(action)): PresenceCapability => {
    const interpersonalAction = ["reply", "like", "repost", "quote", "follow"].includes(action);
    const blockedForTarget = targetBlockedPresence && interpersonalAction;
    const nativeCan = supported && !blockedForTarget && nativeAction(action);
    const bridgeCan = supported && !blockedForTarget && bridgeAction(action);
    const canExecute = nativeCan || bridgeCan;
    const requiresBrowser = !nativeCan && bridgeCan;
    const canVerify = nativeCan ? true : bridgeCan ? Boolean(bridge?.capabilities.reconcile) : false;
    const configuredMode = presence.execution[action];
    const nativeWriteLimitation = browserRouteRequired(action)
      ? `This action requires the verified browser route because Native X previously rejected it for this account or target.`
      : native && native.access !== "read-write"
      ? "Native X is connected for reading, but write access is not configured."
      : native?.status === "needs-attention"
        ? `Native X write access needs attention${native.healthMessage ? `: ${native.healthMessage}` : "."}`
        : undefined;
    const limitation = blockedForTarget
      ? "X verified that this person blocked the Presence. Automatic interaction is suppressed until later verified evidence changes that relationship state."
      : canExecute
      ? undefined
      : !supported
        ? `${capabilityLabel[action] ?? action} is not supported by ${channelName(presence.channel)}.`
        : native && !nativeActionSupported(action)
          ? `Native X does not currently expose ${capabilityLabel[action] ?? action} through this API.`
        : nativeWriteLimitation
          ? nativeWriteLimitation
          : bridge && !bridgeConnected
            ? `${capabilityLabel[action] ?? action} requires the connected browser body.`
            : `No connected ${channelName(presence.channel)} body can perform this action.`;
    const provider = nativeCan ? "Native X" : bridgeCan ? "Browser Bridge" : native ? "Native X" : undefined;
    return { capability: action, label: capabilityLabel[action] ?? action, availability: canExecute && canVerify ? "available" : bridge && !bridgeConnected && supported ? "temporarily-unavailable" : "unavailable", executionMode: configuredMode, provider, requiresBrowser, canObserve: nativeCan || bridgeCan, canExecute, canVerify, limitation };
  };
  const measurement = (capability: "follower_measurement" | "post_performance", supported: boolean, metric: string): PresenceCapability => {
    const nativeCan = supported && nativeReadable && presence.channel === "x";
    const bridgeCan = supported && bridgeMetric(metric);
    const canObserve = nativeCan || bridgeCan;
    return { capability, label: capabilityLabel[capability], availability: canObserve ? "available" : bridge && !bridgeConnected ? "temporarily-unavailable" : "unavailable", provider: nativeCan ? "Native X" : bridgeCan ? "Browser Bridge" : undefined, requiresBrowser: !nativeCan && bridgeCan, canObserve, canExecute: false, canVerify: canObserve, limitation: canObserve ? undefined : "The connected channel does not currently report this evidence." };
  };
  const items = ["post", "reply", "like", "repost", "quote", "message"].map((action) => actionItem(action));
  items.push(actionItem("follow", channelIds.has("follow")));
  const discoveryAvailable = nativeReadable || bridgeConnected;
  items.push({ capability: "public_discovery", label: capabilityLabel.public_discovery, availability: discoveryAvailable ? "available" : bridge && !bridgeConnected ? "temporarily-unavailable" : "unavailable", provider: nativeReadable ? "Native X" : bridgeConnected ? "Browser Bridge" : undefined, requiresBrowser: !nativeReadable && bridgeConnected, canObserve: discoveryAvailable, canExecute: false, canVerify: discoveryAvailable, limitation: discoveryAvailable ? undefined : "No connected channel body can search public conversation." });
  items.push(measurement("follower_measurement", presence.channel === "x", "followers"));
  items.push(measurement("post_performance", presence.channel === "x", "public_metrics"));
  const mediaItem = (kind: "image" | "video"): PresenceCapability => {
    const nativeCan = Boolean(nativeWritable && presence.channel === "x");
    const bridgeCan = Boolean(bridgeConnected && bridge?.capabilities.assetKinds?.includes(kind));
    const canExecute = nativeCan || bridgeCan;
    const canVerify = canExecute && (nativeCan || Boolean(bridge?.capabilities.reconcile));
    const limitation = canExecute
      ? undefined
      : native && native.access !== "read-write"
        ? "Native X is connected for reading, but write access is not configured."
        : native?.status === "needs-attention"
          ? `Native X write access needs attention${native.healthMessage ? `: ${native.healthMessage}` : "."}`
          : bridge && !bridgeConnected
            ? "Image and video publication require the connected browser body."
            : "The connected channel does not currently support this media type.";
    return { capability: kind, label: capabilityLabel[kind], availability: canExecute && canVerify ? "available" : bridge && !bridgeConnected ? "temporarily-unavailable" : "unavailable", provider: nativeCan ? "Native X" : bridgeCan ? "Browser Bridge" : native ? "Native X" : undefined, requiresBrowser: !nativeCan && bridgeCan, canObserve: canExecute, canExecute, canVerify, limitation };
  };
  items.push(mediaItem("image"));
  items.push(mediaItem("video"));
  const requiredBody = items.some((item) => item.requiresBrowser && item.availability === "available");
  const bodyStatus = presence.status === "paused" ? "unavailable" : requiredBody && !bridgeConnected ? "degraded" : native || bridgeConnected ? "ready" : "unavailable";
  return { presenceId: presence.id, channel: presence.channel, generatedAt: now(), bodyStatus, items };
}

/**
 * Explain which connector is responsible for a capability in operator-facing
 * surfaces. A configured native connection is still useful context when its
 * writer is unhealthy; hiding it as "no provider" makes the API-first route
 * look like a Bridge requirement.
 */
export function capabilityProviderLabel(source: OpenPresenceState, presenceId: string, item: PresenceCapability) {
  if (item.provider === "Browser Bridge") return "Browser Bridge · browser required";
  const presence = source.presences.find((candidate) => candidate.id === presenceId) ?? source.presence;
  const native = source.nativeConnections.find((connection) => connection.presenceId === presenceId && connection.channelId === presence?.channel);
  if (item.provider === "Native X" && item.limitation?.includes("does not currently expose")) return "Native X · not supported";
  if (item.provider === "Native X" && item.availability === "available") return "Native X";
  if (native?.status === "needs-attention" && !item.canExecute) return "Native X · write needs attention";
  if (native?.access === "read" && !item.canExecute) return "Native X · read only";
  if (item.provider === "Native X") return "Native X · unavailable";
  if (native) return "Native X · unavailable";
  return "No connected provider";
}

/** Capability availability remains a Presence Settings status, not an Agent Request. */
export function ensureCapabilityRequests(source: OpenPresenceState, _presenceId?: string) {
  void _presenceId;
  return source;
}

export function openAgentRequest(source: OpenPresenceState, input: { presenceId?: string; assignmentId?: string; kind: "capability" | "knowledge" | "permission" | "growth_review" | "operator_decision" | "connector"; importance: "blocking" | "important" | "informational"; title: string; need: string; why: string; currentWorkaround?: string; capability?: string; dedupeKey: string }) {
  if (!source.agent || source.agentRequests.some((item) => item.dedupeKey === input.dedupeKey && !["rejected", "resolved"].includes(item.status))) return source;
  const createdAt = now();
  source.agentRequests.unshift({ id: id("agent-request"), agentId: source.agent.id, ...input, status: "open", createdAt, updatedAt: createdAt });
  source.events.unshift(event("system", "Agent request opened", input.title, "warning", { presenceId: input.presenceId }));
  return source;
}

function bridgeAdapterIsConnected(bridge: Bridge) {
  return bridge.state !== "offline"
    && bridge.accountIdentity?.status !== "mismatch"
    && Boolean(bridge.lastHeartbeatAt && Date.now() - new Date(bridge.lastHeartbeatAt).getTime() < 90_000);
}

export function latestAudienceSnapshot(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(source);
  return collapseAudienceSnapshots(state.audienceSnapshots.filter((item) => item.presenceId === presenceId && growthEvidenceIsInPresenceScope(state, presenceId, item.observedAt)))[0];
}

export function audienceDeltas(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(source);
  const snapshots = state.audienceSnapshots.filter((item) => item.presenceId === presenceId && growthEvidenceIsInPresenceScope(state, presenceId, item.observedAt)).sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
  const latest = snapshots.at(-1);
  const since = (days: number) => {
    if (!latest) return undefined;
    const cutoff = new Date(new Date(latest.observedAt).getTime() - days * 86_400_000);
    const prior = snapshots.filter((item) => new Date(item.observedAt) <= cutoff).at(-1);
    return prior ? latest.followers - prior.followers : undefined;
  };
  return { current: latest?.followers, daily: since(1), sevenDay: since(7), twentyEightDay: since(28) };
}

function comparableSnapshots(source: OpenPresenceState, presenceId: string, mirrorObjectId: string, ageSeconds: number, options?: { normalized?: boolean }) {
  const state = options?.normalized ? source : normalizeState(source);
  return state.publicationMetricSnapshots.filter((item) => item.presenceId === presenceId && item.mirrorObjectId !== mirrorObjectId && growthPublicationIsInPresenceScope(state, presenceId, item) && Math.abs(item.publicationAgeSeconds - ageSeconds) <= Math.max(21_600, ageSeconds * 0.25));
}

function median(values: number[]) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return undefined;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function publicationMetricBaseline(source: OpenPresenceState, snapshot: PublicationMetricSnapshot, options?: { normalized?: boolean }) {
  const prior = comparableSnapshots(source, snapshot.presenceId, snapshot.mirrorObjectId, snapshot.publicationAgeSeconds, options);
  const relative: NonNullable<PublicationMetricSnapshot["baseline"]>["relative"] = {};
  for (const metric of ["impressions", "likes", "replies", "reposts", "quotes"] as const) {
    const baseline = median(prior.map((item) => item[metric]).filter((value): value is number => typeof value === "number"));
    const value = snapshot[metric];
    if (baseline && typeof value === "number") relative[metric] = Number((value / baseline).toFixed(2));
  }
  return { comparableCount: prior.length, confidence: prior.length >= 20 ? "high" as const : prior.length >= 5 ? "medium" as const : "low" as const, relative };
}

type PublicationMetricSnapshotOperation = Extract<Operation, { type: "recordPublicationMetricSnapshot" }>;

function recordPublicationMetricSnapshotInPlace(state: OpenPresenceState, operation: PublicationMetricSnapshotOperation) {
  const presence = state.presences.find((item) => item.id === (operation.presenceId ?? state.activePresenceId)) ?? state.presence;
  const mirror = state.mirrorObjects.find((item) => item.id === operation.mirrorObjectId && item.presenceId === presence?.id);
  if (!presence || !mirror || !Number.isFinite(operation.publicationAgeSeconds ?? 0)) return;
  const snapshot: PublicationMetricSnapshot = { id: id("publication-metric"), presenceId: presence.id, mirrorObjectId: mirror.id, observedAt: now(), publicationAgeSeconds: Math.max(0, Math.round(operation.publicationAgeSeconds ?? Math.max(0, (Date.now() - new Date(mirror.occurredAt ?? mirror.observedAt).getTime()) / 1000))), ...operation.metrics, source: operation.source ?? (presence.environment === "sandbox" ? "sandbox" : "manual"), observationStatus: operation.observationStatus ?? "observed" };
  snapshot.baseline = publicationMetricBaseline(state, snapshot, { normalized: true });
  state.publicationMetricSnapshots.unshift(snapshot);
  state.events.unshift(event("learning", "Publication performance observed", `Performance evidence for a verified ${presence.channel === "x" ? "X" : presence.name} publication is available for Growth review.`, "positive", { presenceId: presence.id, sourceObjectId: mirror.id }));
}

/** Record a publication-metric batch with one compatibility-state clone. */
export function recordPublicationMetricSnapshots(source: OpenPresenceState, operations: PublicationMetricSnapshotOperation[]) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  for (const operation of operations) recordPublicationMetricSnapshotInPlace(state, operation);
  return state;
}

/**
 * Promote only an actual two-way interaction into Network Memory. Passive
 * observations, directory entries, searches, and Watches remain world
 * evidence until the operator explicitly chooses Remember or the Agent has
 * actually continued the interaction.
 */
export function curateRelationshipFromMirror(source: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId, options?: { normalized?: boolean }) {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  if (!state.agent || !relationshipCurationEligible(state, object, presenceId)) return state;
  const actor = object.author;
  const externalActorId = actor?.externalRef?.id;
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || !externalActorId || !actor?.externalRef?.type) return state;
  const sourceEnvironment = object.environment ?? "live";
  const existingIdentity = state.personIdentities.find((identity) => identity.channel === object.channelId && identity.externalActorId === externalActorId && identity.sourcePresenceId === presenceId && (identity.sourceEnvironment ?? "live") === sourceEnvironment);
  const existingPerson = existingIdentity ? state.people.find((person) => person.id === existingIdentity.personId) : undefined;
  const existingRelationship = existingPerson ? relationshipForPerson(state, existingPerson.id) : undefined;
  const occurredAt = object.occurredAt ?? object.observedAt;
  if (existingRelationship?.state === "forgotten" && existingRelationship.forgottenAt && new Date(occurredAt).getTime() <= new Date(existingRelationship.forgottenAt).getTime()) return state;
  const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId, channel: object.channelId, externalActorId, displayName: actor.displayName, handle: actor.handle, avatarUrl: actor.avatarUrl, sourceEnvironment, sourceSessionId: object.sessionId, source: "current-context" }, state.people, state.personIdentities, state.relationships);
  const timestamp = now();
  remembered.person.memoryState = "active";
  remembered.person.forgottenAt = undefined;
  remembered.person.updatedAt = timestamp;
  remembered.relationship.state = "active";
  remembered.relationship.forgottenAt = undefined;
  remembered.relationship.firstMeaningfulInteractionAt = remembered.relationship.firstMeaningfulInteractionAt ?? occurredAt;
  remembered.relationship.lastMeaningfulInteractionAt = occurredAt;
  remembered.relationship.updatedAt = timestamp;
  state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
  state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId && item.sourcePresenceId === remembered.identity.sourcePresenceId && (item.sourceEnvironment ?? "live") === (remembered.identity.sourceEnvironment ?? "live")))];
  state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
  const statement = actor.displayName + " said: " + (object.content?.text?.trim().slice(0, 360) ?? "[no text]");
  const relationshipId = remembered.relationship.id;
  const duplicate = state.relationshipFacts.some((fact) => fact.relationshipId === relationshipId && fact.statement === statement && fact.provenanceRefs.some((ref) => ref.id === object.id));
  if (!duplicate) state.relationshipFacts.unshift({ id: id("relationship-fact"), relationshipId, statement, epistemicKind: "stated_by_person", confidence: "high", provenanceRefs: [evidenceRefFromMirror(object)], visibility: object.visibility === "public" ? "public" : `presence:${presenceId}`, validFrom: occurredAt, createdAt: timestamp });
  state.events.unshift(event("memory", "Relationship curated", `${remembered.person.displayName} now has selective relationship continuity from a meaningful interaction.`, "positive", { presenceId, sourceObjectId: object.id }));
  return state;
}

const BLOCKED_RELATIONSHIP_FACT = "This person has blocked this Presence on X.";

function actorForSocialTarget(state: OpenPresenceState, presenceId: string, target?: EntityRef) {
  if (!target?.id) return undefined;
  if (target.type === "x.user") {
    const mirrorAuthor = state.mirrorObjects.find((item) => item.presenceId === presenceId && item.author?.externalRef?.id === target.id)?.author;
    const identity = state.personIdentities.find((item) => item.sourcePresenceId === presenceId && item.channel === "x" && item.externalActorId === target.id);
    return { id: target.id, displayName: mirrorAuthor?.displayName ?? identity?.displayName, handle: mirrorAuthor?.handle ?? identity?.handle, avatarUrl: mirrorAuthor?.avatarUrl ?? identity?.avatarUrl };
  }
  if (target.type === "x.post") {
    const object = state.mirrorObjects.find((item) => item.presenceId === presenceId && item.externalRef.type === "x.post" && item.externalRef.id === target.id);
    const actorId = object?.author?.externalRef?.id;
    if (!actorId) return undefined;
    return { id: actorId, displayName: object.author?.displayName, handle: object.author?.handle, avatarUrl: object.author?.avatarUrl };
  }
  return undefined;
}

export function targetIsBlockedByPerson(state: OpenPresenceState, presenceId: string, target?: EntityRef) {
  const actor = actorForSocialTarget(state, presenceId, target);
  if (!actor) return false;
  return state.personIdentities.some((identity) => identity.sourcePresenceId === presenceId
    && identity.channel === "x"
    && identity.externalActorId === actor.id
    && identity.contactability?.status === "blocked_by_person");
}

/**
 * Close a queued action after a verified relationship boundary was learned.
 * This is intentionally separate from recording the boundary itself so every
 * connector can re-check the same durable rule immediately before handoff.
 */
export function cancelExecutionForBlockedTarget(source: OpenPresenceState, executionId: string, message?: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution || !targetIsBlockedByPerson(state, execution.presenceId, execution.target)) return state;
  if (["succeeded", "failed", "blocked", "cancelled", "expired", "verification-closed"].includes(execution.status)) return state;
  const timestamp = now();
  const detail = message ?? "The target person has blocked this Presence. No further interaction will be attempted.";
  execution.status = "cancelled";
  execution.failure = { code: "TARGET_BLOCKED_PRESENCE", message: detail, retryable: false, reviewedAt: timestamp, reviewDisposition: "closed_non_retryable", reviewNote: "The durable relationship boundary was re-checked before Bridge delivery." };
  execution.reviewReason = "Delivery was stopped because the target person has blocked this Presence.";
  execution.lease = undefined;
  execution.permit = undefined;
  execution.updatedAt = timestamp;
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  if (intent?.state === "active") { intent.state = "withdrawn"; intent.updatedAt = timestamp; }
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "skipped"; action.reason = "The target person has blocked this Presence; no external action was attempted."; }
  if (execution.assignmentId) {
    const assignment = state.assignments.find((item) => item.id === execution.assignmentId);
    if (assignment && !["completed", "completed_with_adaptation", "cancelled", "expired_incomplete"].includes(assignment.status)) {
      assignment.status = "needs_operator";
      assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: detail };
      assignment.lastOutcome = { class: "delivery_failed", message: detail, at: timestamp };
      assignment.nextDueAt = undefined;
      assignment.updatedAt = timestamp;
      for (const run of state.assignmentRuns ?? []) {
        if (run.assignmentId !== assignment.id || ["published", "deferred", "blocked", "failed", "cancelled", "superseded_stale"].includes(run.status)) continue;
        run.status = "blocked";
        run.currentStage = "blocked";
        run.lastError = detail;
        run.completedAt = timestamp;
        run.leaseOwner = undefined;
        run.leaseExpiresAt = undefined;
        run.updatedAt = timestamp;
      }
    }
  }
  state.events.unshift(event("execution", "Delivery stopped", detail, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

/** Only explicit provider/browser evidence is strong enough to create a
 * durable interpersonal boundary. Generic 403s and missing controls are not. */
export function isPersonBlockingError(message: string, code?: string) {
  return code === "TARGET_BLOCKED_PRESENCE"
    || /(?:this|the) author has blocked you|you (?:have been|are) blocked by (?:this|the) (?:author|user|account)|blocked from (?:replying|following|interacting).*(?:author|user|account)/i.test(message);
}

export function recordPersonBlockedFromExecution(source: OpenPresenceState, executionId: string, message: string, sourceKind: "native_delivery" | "browser_delivery") {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  const presence = execution ? state.presences.find((item) => item.id === execution.presenceId) ?? state.presence : undefined;
  const actor = execution && presence ? actorForSocialTarget(state, presence.id, execution.target) : undefined;
  if (!state.agent || !execution || !presence || !actor) return state;
  const existingIdentity = state.personIdentities.find((identity) => identity.sourcePresenceId === presence.id && identity.channel === "x" && identity.externalActorId === actor.id);
  const existingPerson = existingIdentity ? state.people.find((person) => person.id === existingIdentity.personId) : undefined;
  const displayName = actor.displayName ?? existingIdentity?.displayName ?? existingPerson?.displayName ?? (actor.handle ? `@${actor.handle.replace(/^@/, "")}` : `X account ${actor.id}`);
  const remembered = createRememberedPerson({
    agentId: state.agent.id,
    presenceId: presence.id,
    channel: "x",
    externalActorId: actor.id,
    displayName,
    handle: actor.handle ?? existingIdentity?.handle,
    avatarUrl: actor.avatarUrl ?? existingIdentity?.avatarUrl,
    sourceEnvironment: presence.environment ?? "live",
    source: "current-context",
    evidenceKind: "reply_target",
  }, state.people, state.personIdentities, state.relationships);
  const observedAt = now();
  remembered.person.memoryState = "active";
  remembered.person.updatedAt = observedAt;
  remembered.relationship.state = "active";
  remembered.relationship.updatedAt = observedAt;
  remembered.identity.contactability = { status: "blocked_by_person", observedAt, source: sourceKind, evidenceExecutionId: execution.id, reason: message.slice(0, 500) };
  state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
  state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.sourcePresenceId === presence.id && item.channel === "x" && item.externalActorId === actor.id))];
  state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
  const activeFact = state.relationshipFacts.find((fact) => fact.relationshipId === remembered.relationship.id && fact.statement === BLOCKED_RELATIONSHIP_FACT && !fact.validTo);
  if (!activeFact) state.relationshipFacts.unshift({ id: id("relationship-fact"), relationshipId: remembered.relationship.id, statement: BLOCKED_RELATIONSHIP_FACT, epistemicKind: "connector_verified", confidence: "high", provenanceRefs: [{ kind: "social_intent", id: execution.socialIntentId, sourcePresenceId: presence.id, observedAt }], visibility: `presence:${presence.id}`, validFrom: observedAt, createdAt: observedAt });
  const existingBoundaryEvent = state.autobiographicalEvents.find((item) => item.presenceId === presence.id
    && item.kind === "relationship_boundary"
    && item.counterpartyPersonId === remembered.person.id
    && item.facts.boundary === "blocked"
    && !state.autobiographicalEvents.some((newer) => newer.kind === "relationship_boundary" && newer.counterpartyPersonId === remembered.person.id && newer.facts.boundary === "available" && newer.observedAt > item.observedAt));
  if (!existingBoundaryEvent) state.autobiographicalEvents.unshift({
    id: id("autobiographical-event"),
    agentId: state.agent.id,
    presenceId: presence.id,
    kind: "relationship_boundary",
    counterpartyPersonId: remembered.person.id,
    facts: { boundary: "blocked", reasonKnown: false, channel: "x" },
    evidenceRefs: [{ kind: "social_intent", id: execution.socialIntentId, sourcePresenceId: presence.id, observedAt }],
    occurredAt: observedAt,
    observedAt,
    createdAt: observedAt,
  });
  state.relationshipPolicies = state.relationshipPolicies.map((policy) => policy.presenceId === presence.id && policy.personId === remembered.person.id
    ? { ...policy, engagement: "observe_only", updatedAt: observedAt }
    : policy);
  const affectedWatchIds = new Set(state.watches.filter((watch) => watch.presenceId === presence.id && (watch.target?.personId === remembered.person.id || watch.target?.externalActorId === actor.id)).map((watch) => watch.id));
  state.watches = state.watches.map((watch) => affectedWatchIds.has(watch.id)
    ? { ...watch, state: "paused", updatedAt: observedAt }
    : watch);
  state.watchSignals = state.watchSignals.map((signal) => signal.presenceId === presence.id && (signal.personId === remembered.person.id || affectedWatchIds.has(signal.watchId))
    ? { ...signal, disposition: signal.disposition === "pending" ? "dismissed" : signal.disposition, updatedAt: observedAt }
    : signal);
  const blockedActorId = actor.id;
  const affectedAssignmentIds = new Set<string>();
  for (const candidate of state.executions) {
    if (candidate.presenceId !== presence.id || !["queued", "approved", "awaiting-review", "awaiting-manual", "awaiting-connector", "claimed", "executing", "verification-pending"].includes(candidate.status)) continue;
    if (actorForSocialTarget(state, presence.id, candidate.target)?.id !== blockedActorId) continue;
    const boundaryMessage = `${displayName} has blocked this Presence. No further interaction will be attempted until verified evidence shows that changed.`;
    if (candidate.assignmentId) affectedAssignmentIds.add(candidate.assignmentId);
    const uncertain = ["claimed", "executing", "verification-pending"].includes(candidate.status);
    candidate.status = uncertain ? "verification-closed" : "cancelled";
    candidate.failure = { code: "TARGET_BLOCKED_PRESENCE", message: uncertain ? `${boundaryMessage} This action had already crossed the connector boundary; check X before attempting anything new.` : boundaryMessage, retryable: false, reviewedAt: observedAt, reviewDisposition: uncertain ? "operator_action_required" : "closed_non_retryable", reviewNote: uncertain ? "The block was learned after connector handoff, so the external outcome remains unresolved and will not be retried." : "The action was stopped before connector handoff." };
    candidate.reviewReason = uncertain ? "The target block was learned while delivery was in progress or awaiting verification." : "The target block was learned before delivery.";
    candidate.lease = undefined;
    candidate.permit = undefined;
    candidate.updatedAt = observedAt;
  }
  if (execution.assignmentId) affectedAssignmentIds.add(execution.assignmentId);
  for (const assignmentId of affectedAssignmentIds) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || ["completed", "completed_with_adaptation", "cancelled", "expired_incomplete"].includes(assignment.status)) continue;
    const detail = `${displayName} has blocked this Presence. The Assignment is stopped and needs an operator decision; no further interaction will be attempted until verified evidence shows that changed.`;
    assignment.status = "needs_operator";
    assignment.work = { ...(assignment.work ?? { phase: "blocked", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: detail };
    assignment.lastOutcome = { class: "delivery_failed", message: detail, at: observedAt };
    assignment.nextDueAt = undefined;
    assignment.updatedAt = observedAt;
    for (const run of state.assignmentRuns ?? []) {
      if (run.assignmentId !== assignmentId || ["published", "deferred", "blocked", "failed", "cancelled", "superseded_stale"].includes(run.status)) continue;
      run.status = "blocked";
      run.currentStage = "blocked";
      run.lastError = detail;
      run.completedAt = observedAt;
      run.leaseOwner = undefined;
      run.leaseExpiresAt = undefined;
      run.updatedAt = observedAt;
    }
    state.events.unshift(event("decision", "Assignment stopped at relationship boundary", detail, "warning", { presenceId: presence.id, sessionId: assignment.sessionId }));
  }
  state.events.unshift(event("memory", `${presence.name} noticed a relationship boundary`, `${displayName} blocked this Presence on X. Interaction with this person has stopped, and the verified event is now part of ${presence.name}'s history.`, "quiet", { presenceId: presence.id, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

export function clearPersonBlockFromExecution(source: OpenPresenceState, executionId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  const presence = execution ? state.presences.find((item) => item.id === execution.presenceId) ?? state.presence : undefined;
  const actor = execution && presence ? actorForSocialTarget(state, presence.id, execution.target) : undefined;
  if (!execution || !presence || !actor) return state;
  const identity = state.personIdentities.find((item) => item.sourcePresenceId === presence.id && item.channel === "x" && item.externalActorId === actor.id);
  if (!identity || identity.contactability?.status !== "blocked_by_person") return state;
  const observedAt = now();
  identity.contactability = { status: "available", observedAt, source: "verified_action", evidenceExecutionId: execution.id };
  const relationship = state.relationships.find((item) => item.personId === identity.personId);
  for (const fact of state.relationshipFacts) {
    if (relationship && fact.relationshipId === relationship.id && fact.statement === BLOCKED_RELATIONSHIP_FACT && !fact.validTo) fact.validTo = observedAt;
  }
  const person = state.people.find((item) => item.id === identity.personId);
  if (state.agent) state.autobiographicalEvents.unshift({
    id: id("autobiographical-event"),
    agentId: state.agent.id,
    presenceId: presence.id,
    kind: "relationship_boundary",
    counterpartyPersonId: identity.personId,
    facts: { boundary: "available", priorBoundary: "blocked", channel: "x", evidence: "verified_action" },
    evidenceRefs: [{ kind: "social_intent", id: execution.socialIntentId, sourcePresenceId: presence.id, observedAt }],
    occurredAt: observedAt,
    observedAt,
    createdAt: observedAt,
  });
  state.events.unshift(event("memory", "Contact available again", `${person?.displayName ?? actor.handle ?? "This person"} no longer appears to block this Presence; a channel action was verified.`, "positive", { presenceId: presence.id, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

function makeFiles(input: CreateAgentInput, presence: Presence): AgentFile[] { return (Object.keys(fileMeta) as FileKind[]).map((kind) => ({ kind, ...fileMeta[kind], content: fileContent(kind, input, presence), revision: 1, updatedAt: now() })); }
function event(type: LiveEvent["type"], title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "presenceId" | "intentId" | "executionId" | "outcomeId" | "decisionId" | "sessionId" | "sourceObjectId" | "invocationId" | "runId" | "attentionEpisodeId">): LiveEvent { return { id: id("evt"), type, title, detail, time: now(), tone, ...lineage }; }

export interface SocialDecisionInput {
  decision: SocialDecisionKind;
  acts?: Array<{ decision: Exclude<SocialDecisionKind, "no_op" | "original_post">; text?: string; rationale?: string }>;
  conversationDisposition?: import("./types").ConversationDisposition;
  focalMirrorObjectIds?: string[];
  origin?: SocialOrigin;
  summary?: string;
  influences?: string[];
  confidence?: SocialDecisionConfidence;
  closestAlternative?: SocialDecisionKind;
  closestAlternativeReason?: string;
  plannerRunId?: string;
  runId?: string;
  invocationId?: string;
  presenceId?: string;
  relevantGrowthRevisionRef?: string;
  attentionEpisodeId?: string;
  operatorReaction?: string;
  autobiographicalEventIds?: string[];
}

function socialDecisionLabel(decision: SocialDecisionKind) {
  return decision === "no_op" ? "silence" : decision === "original_post" ? "an original post" : `a ${decision}`;
}

function createSocialDecision(state: OpenPresenceState, input: SocialDecisionInput, socialIntentId?: string): SocialDecision | undefined {
  const presence = input.presenceId ? state.presences.find((p) => p.id === input.presenceId) ?? state.presence : state.presence;
  if (!state.agent || !presence) return undefined;
  return {
    id: id("decision"),
    agentId: state.agent.id,
    presenceId: presence.id,
    environment: presence.environment ?? "live",
    focalMirrorObjectIds: [...new Set((input.focalMirrorObjectIds ?? []).filter(Boolean))].slice(0, 6),
    origin: input.origin,
    decision: input.decision,
    acts: input.acts?.length ? input.acts.map((act) => ({ decision: act.decision, text: act.text?.trim() || undefined, rationale: act.rationale?.trim() || undefined })) : undefined,
    conversationDisposition: input.conversationDisposition,
    operatorReaction: input.operatorReaction?.trim() || undefined,
    summary: input.summary?.trim() || `The Presence selected ${socialDecisionLabel(input.decision)} from the available channel context.`,
    influences: [...new Set((input.influences ?? ["Mission", "Taste", "Current social context"]).map((value) => value.trim()).filter(Boolean))].slice(0, 5),
    confidence: input.confidence ?? "medium",
    closestAlternative: input.closestAlternative,
    closestAlternativeReason: input.closestAlternativeReason?.trim() || undefined,
    socialIntentId,
    plannerRunId: input.plannerRunId ?? input.runId,
    runId: input.runId ?? input.plannerRunId,
    invocationId: input.invocationId,
    relevantGrowthRevisionRef: input.relevantGrowthRevisionRef,
    autobiographicalEventIds: input.autobiographicalEventIds?.filter((eventId) => state.autobiographicalEvents.some((event) => event.id === eventId)),
    attentionEpisodeId: input.attentionEpisodeId,
    createdAt: now(),
  };
}

export function recordResourceUsageEventInPlace(state: OpenPresenceState, input: Omit<ResourceUsageEvent, "id" | "agentId" | "createdAt">) {
  if (!state.agent) return state;
  state.resourceUsageEvents.unshift({ ...input, id: id("resource-usage"), agentId: state.agent.id, createdAt: now() });
  state.resourceUsageEvents = state.resourceUsageEvents.slice(0, 5_000);
  return state;
}

export function recordResourceUsageEvent(source: OpenPresenceState, input: Omit<ResourceUsageEvent, "id" | "agentId" | "createdAt">) {
  return recordResourceUsageEventInPlace(cloneState(source), input);
}

export function deriveSelfDirectedDiscoveryPlan(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!state.agent || !presence || presence.id !== presenceId) return undefined;
  const growth = state.files.find((file) => file.kind === "GROWTH")?.content ?? "";
  const plan = state.assignments.find((item) => item.presenceId === presence.id && item.status === "active")?.plan;
  const selfDirectedAttention = presence.selfDirectedAttention ?? defaultSelfDirectedAttentionPolicy();
  const directions = [...new Set([
    ...presence.brief.primaryTerritory,
    ...presence.brief.adjacentTerritory,
    ...(plan?.discoveryDirections ?? []),
    ...state.agent.topics,
  ].map((item) => item.trim()).filter((item) => item.length > 2))].slice(0, selfDirectedAttention.intensity === "quiet" ? 1 : selfDirectedAttention.intensity === "curious" ? 5 : 3);
  const safeDirections = directions.length ? directions : ["useful ideas relevant to this Presence"];
  const timestamp = now();
  const revision = (state.discoveryPlans.filter((item) => item.presenceId === presence.id && item.origin === "self_directed_discovery").map((item) => item.revision ?? 0).sort((a, b) => b - a)[0] ?? 0) + 1;
  return {
    id: id("self-directed-plan"),
    presenceId: presence.id,
    origin: "self_directed_discovery" as const,
    revision,
    channel: presence.channel,
    surfaces: presence.channel === "x" ? ["public_search", "thread_hydration", "media_when_needed"] : ["observed_objects"],
    directions: safeDirections,
    exclusions: [...presence.brief.boundaries, "private or credentialed material"].filter(Boolean).slice(0, 8),
    source: "agent" as const,
    safeRationale: `Recent context, the Presence brief, and current growth direction make ${safeDirections.slice(0, 2).join(" and ")} worth a bounded look.`,
    searchQueries: safeDirections.slice(0, selfDirectedAttention.intensity === "quiet" ? 1 : 2),
    evidenceRequirements: ["public post text", "author context when follow is considered", "media inspection when it materially changes meaning"],
    resourceHints: [growth.includes("##") ? "Use recent Growth evidence to revise directions over time." : "Growth evidence is still sparse; keep discovery conservative."],
    growthRevisionRef: presence.activeGrowthRevisionRef,
    generatedAt: timestamp,
    expiresAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
  };
}

export function recordSocialDecision(source: OpenPresenceState, input: SocialDecisionInput) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const decision = createSocialDecision(state, input);
  if (decision) state.socialDecisions.unshift(decision);
  return state;
}

const activityObservationTitles = new Set([
  "Pulse completed",
  "New mention received",
  "Social Mirror updated",
  "X observation failed",
  "Considering first public move",
  "Reply observed",
  "Calendar attention started",
  "Calendar evaluation unavailable",
  "Publishing plan requested",
  "Publishing plan unavailable",
  "Genny looked around X",
  "Genny acted from its own attention",
  "Self-directed opportunity held",
  "Self-directed candidate deferred",
  "Proactive attention deferred",
]);
export function isActivityDecisionEvent(item: LiveEvent) {
  return item.type !== "system" || activityObservationTitles.has(item.title);
}

export function compilePresenceContext(presence: Presence): PresenceContext {
  const affordances = presence.capabilities ?? CHANNEL_CAPABILITIES[presence.channel as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const displayName = presence.name || presence.context?.publicIdentity?.displayName || presence.handle;
  const publicSelf = presence.publicSelf ?? presence.context?.publicSelf ?? defaultPublicSelf(displayName, presence.mode);
  const brief = normalizePresenceBrief(presence.brief ?? presence.context?.brief, defaultPresenceBrief());
  return { presenceId: presence.id, channel: presence.channel, language: normalizePresenceLanguage(presence.language), publicIdentity: { displayName, handle: presence.handle, mode: presence.mode }, publicSelf: { ...publicSelf, displayName }, brief, audienceContext: presence.context?.audienceContext, voiceAdaptation: presence.context?.voiceAdaptation, availableAffordances: affordances.map((item) => item.id), relevantRelationshipContext: presence.context?.relevantRelationshipContext, publicFooting: presence.context?.publicFooting, ghostProfile: presence.mode === "ghost" ? presence.ghostProfile : undefined, publishingInitiative: presence.publishingInitiative };
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function defaultPublishingInitiative(): PublishingInitiative {
  const timestamp = now();
  return { mode: "adaptive", timezone: localTimezone(), createdAt: timestamp, updatedAt: timestamp };
}

function normalizePublishingInitiative(value?: Partial<PublishingInitiative>): PublishingInitiative {
  const fallback = defaultPublishingInitiative();
  const target = value?.target && Number.isFinite(value.target.count)
    ? { count: Math.max(1, Math.min(10_000, Math.round(value.target.count))), period: value.target.period === "week" ? "week" as const : "day" as const }
    : undefined;
  return {
    mode: value?.mode === "off" || value?.mode === "pace" ? value.mode : "adaptive",
    ...(target ? { target } : {}),
    ...(value?.assignmentId ? { assignmentId: value.assignmentId } : {}),
    timezone: value?.timezone?.trim() || fallback.timezone,
    createdAt: value?.createdAt || fallback.createdAt,
    updatedAt: value?.updatedAt || fallback.updatedAt,
  };
}

export function canonicalAssignmentQuantityMode(mode?: AssignmentQuantityMode): AssignmentQuantityMode {
  if (mode === "minimum") return "at_least";
  if (mode === "maximum") return "at_most";
  return mode === "at_least" || mode === "at_most" || mode === "exact" || mode === "target" ? mode : "target";
}

function publishingAssignmentFor(state: OpenPresenceState, presence: Presence) {
  const linkedId = presence.publishingInitiative.assignmentId;
  return state.assignments.find((assignment) => assignment.id === linkedId && assignment.presenceId === presence.id && assignment.origin === "publishing_initiative")
    ?? state.assignments.find((assignment) => assignment.presenceId === presence.id && assignment.origin === "publishing_initiative");
}

/** Materialize the Presence-facing Publishing Initiative as the one canonical responsibility record. */
export function syncPublishingInitiativeAssignment(source: OpenPresenceState, presenceId?: string) {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || !state.agent) return state;
  const initiative = presence.publishingInitiative;
  const existing = publishingAssignmentFor(state, presence);
  if (initiative.mode === "off") {
    if (existing) {
      existing.status = existing.status === "completed" ? existing.status : "paused";
      existing.updatedAt = now();
    }
    presence.publishingInitiative = { ...initiative, assignmentId: undefined };
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    if (state.presence?.id === presence.id) state.presence = presence;
    return state;
  }
  const isPace = initiative.mode === "pace";
  const quantity = isPace ? initiative.target?.count : undefined;
  const mode: AssignmentQuantityMode = "target";
  const timestamp = now();
  const assignment = existing ?? {
    id: id("assignment"), agentId: state.agent.id, presenceId: presence.id, channelId: presence.channel,
    environment: presence.environment ?? "live", instruction: isPace ? `Aim for ${quantity ?? 1} original posts per ${initiative.target?.period ?? "day"}.` : "Maintain a useful original presence when there is something worth publishing.",
    deliverable: { type: isPace ? "original_publication" : "maintain_original_presence", quantity, quantityMode: mode },
    recurrence: isPace ? { kind: initiative.target?.period === "week" ? "weekly" as const : "daily" as const, label: `Every ${initiative.target?.period ?? "day"}` } : { kind: "daily" as const, label: "Ongoing" },
    executionPolicy: { usePresenceEnvelope: true }, status: "active" as const, progress: { required: quantity ?? 0, verified: 0 }, rejectedCandidates: 0, systemFailures: 0,
    work: { phase: "candidate_review" as const, attempts: 0, maxAttempts: 12, storiesResearched: 0 }, attemptHistory: [], storyResearch: [], createdAt: timestamp, updatedAt: timestamp,
    nextDueAt: timestamp,
  } as Assignment;
  assignment.title = isPace ? "Original publishing pace" : "Maintain original presence";
  assignment.createdBy = "agent";
  assignment.origin = "publishing_initiative";
  assignment.activation = { type: "continuous" };
  assignment.instruction = isPace ? `Aim for ${quantity ?? 1} original posts per ${initiative.target?.period ?? "day"}.` : "Maintain a useful original presence when there is something worth publishing.";
  assignment.deliverable = { type: isPace ? "original_publication" : "maintain_original_presence", quantity, quantityMode: mode };
  assignment.recurrence = isPace
    ? { kind: initiative.target?.period === "week" ? "weekly" as const : "daily" as const, label: `Every ${initiative.target?.period ?? "day"}` }
    : { kind: "daily" as const, label: "Ongoing" };
  assignment.quantityPolicy = { quantity: quantity ?? "agent_planned", mode, period: initiative.target?.period ?? "assignment", timezone: initiative.timezone };
  assignment.status = "active";
  assignment.updatedAt = timestamp;
  if (!existing) state.assignments.unshift(assignment);
  presence.publishingInitiative = { ...initiative, assignmentId: assignment.id };
  presence.context = compilePresenceContext(presence);
  state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
  if (state.presence?.id === presence.id) state.presence = presence;
  return state;
}

function dateParts(value: string | number | Date, timezone: string) {
  const date = value instanceof Date || typeof value === "number" ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as { year: string; month: string; day: string };
}

function periodKey(value: string | number | Date, period: "day" | "week", timezone: string) {
  let parts: { year: string; month: string; day: string };
  try { parts = dateParts(value, timezone); } catch { parts = dateParts(value, "UTC"); }
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (period === "day") return day;
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const mondayOffset = (new Date(utc).getUTCDay() + 6) % 7;
  const monday = new Date(utc - mondayOffset * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

function periodEndKey(start: string, period: "day" | "week") {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (period === "week" ? 6 : 0));
  return date.toISOString().slice(0, 10);
}

export function derivePublishingProgress(source: OpenPresenceState, presenceId?: string, at: string | number | Date = new Date(), options?: { normalized?: boolean }): PublishingInitiativeProgress {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  const initiative = normalizePublishingInitiative(presence?.publishingInitiative);
  const period = initiative.target?.period ?? "day";
  const periodStart = periodKey(at, period, initiative.timezone);
  const verifiedOriginals = presence
    ? derivePublicHistory(state, presence.id, { normalized: true }).filter((item) => item.kind === "post" && !item.parentExternalRef && periodKey(item.occurredAt, period, initiative.timezone) === periodStart).length
    : 0;
  const target = initiative.mode === "pace" ? initiative.target?.count : undefined;
  const reviewWaiting = presence ? state.executions.some((execution) => execution.presenceId === presence.id && execution.affordance === "post" && execution.status === "awaiting-review") : false;
  const status = initiative.mode === "off"
    ? "idle" as const
    : presence?.execution.post === "off"
      ? "blocked" as const
      : target !== undefined && verifiedOriginals >= target
        ? "at_pace" as const
        : reviewWaiting
          ? "awaiting_review" as const
          : presence?.status === "paused" ? "idle" as const : "seeking" as const;
  return { mode: initiative.mode, period, periodStart, periodEnd: periodEndKey(periodStart, period), timezone: initiative.timezone, target, verifiedOriginals, ...(target !== undefined ? { remaining: Math.max(0, target - verifiedOriginals) } : {}), status };
}

function planEnvironmentFor(presence: Presence) {
  return presence.environment === "sandbox" ? "sandbox" as const : "live" as const;
}

function publishingPlanPriority(plan: PublishingPlan) {
  // A failed planning attempt can remain beside the last usable plan. Keep
  // that diagnostic record visible in history, but never let it replace an
  // active plan in the operator-facing projection or worker lookup.
  return plan.status === "active" ? 1 : 0;
}

export function derivePublishingPlanProjection(source: OpenPresenceState, presenceId?: string, at: string | number | Date = new Date(), options?: { normalized?: boolean }): PublishingPlan | undefined {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || presence.publishingInitiative.mode === "off") return undefined;
  const environment = planEnvironmentFor(presence);
  const plan = [...state.publishingPlans]
    .filter((item) => item.presenceId === presence.id && item.environment === environment && item.status !== "superseded")
    .sort((left, right) => publishingPlanPriority(right) - publishingPlanPriority(left) || right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!plan) return undefined;
  const atMs = at instanceof Date ? at.getTime() : typeof at === "number" ? at : new Date(at).getTime();
  const verifiedOriginals = derivePublicHistory(state, presence.id, { normalized: true }).filter((item) => item.kind === "post" && !item.parentExternalRef && item.environment === environment && new Date(item.occurredAt).getTime() >= new Date(plan.horizonStart).getTime() && new Date(item.occurredAt).getTime() <= new Date(plan.horizonEnd).getTime()).length;
  const windows = plan.windows.map((window) => ({ ...window, status: window.status === "completed" ? "completed" as const : atMs >= new Date(window.endAt).getTime() ? "completed" as const : atMs >= new Date(window.startAt).getTime() ? "active" as const : "future" as const }));
  return { ...plan, verifiedOriginals, windows };
}

function activePublishingPlanFor(source: OpenPresenceState, presenceId: string, environment: PresenceEnvironment) {
  return [...source.publishingPlans]
    .filter((item) => item.presenceId === presenceId && item.environment === environment && item.status !== "superseded")
    .sort((left, right) => publishingPlanPriority(right) - publishingPlanPriority(left) || right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt))[0];
}

/** Return durable plan windows that became eligible during a persisted time advance. */
export function duePublishingPlanWindows(source: OpenPresenceState, presenceId: string, from: string, to: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const plan = activePublishingPlanFor(state, presenceId, "sandbox");
  if (!plan || plan.status !== "active") return [];
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  return plan.windows
    .filter((window) => window.status === "future" && new Date(window.startAt).getTime() > fromMs && new Date(window.startAt).getTime() <= toMs)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .map((window) => ({ planId: plan.id, planRevision: plan.revision, window }));
}

function nextPublishingAttentionAt(plan: PublishingPlan, at: string) {
  const atMs = new Date(at).getTime();
  const nextWindow = plan.windows
    .filter((window) => window.status === "future" && new Date(window.startAt).getTime() > atMs)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
  const candidates = [nextWindow?.startAt, plan.nextReassessmentAt, plan.horizonEnd].filter((value): value is string => typeof value === "string" && new Date(value).getTime() > atMs);
  return candidates.sort()[0];
}

/** Append operator-safe plan breadcrumbs without exposing hidden model reasoning. */
export function recordPublishingPlanWork(source: OpenPresenceState, input: Omit<PublishingPlanWorkEvent, "id" | "at"> & { at?: string }) {
  const state = cloneState(source);
  const plan = state.publishingPlans.find((item) => item.id === input.planId && item.revision === input.planRevision);
  if (!plan || plan.status === "superseded") return state;
  const timestamp = input.at ?? now();
  const window = plan.windows.find((item) => item.id === input.windowId);
  if (!window) return state;
  const eventRecord: PublishingPlanWorkEvent = { id: id("publishing-work-event"), planId: plan.id, planRevision: plan.revision, windowId: window.id, stage: input.stage, detail: input.detail.trim().slice(0, 500), at: timestamp, ...(input.socialIntentId ? { socialIntentId: input.socialIntentId } : {}), ...(input.executionId ? { executionId: input.executionId } : {}), ...(input.mirrorObjectId ? { mirrorObjectId: input.mirrorObjectId } : {}), ...(input.outcomeId ? { outcomeId: input.outcomeId } : {}) };
  plan.workHistory = [eventRecord, ...(plan.workHistory ?? [])].slice(0, 120);
  plan.updatedAt = timestamp;
  if (["eligible", "claimed", "agenda", "considered", "researching", "original_selected", "intent_formed", "awaiting_review"].includes(input.stage)) {
    window.status = "active";
    window.attempts = (window.attempts ?? 0) + (input.stage === "claimed" ? 1 : 0);
    window.lastAttemptAt = timestamp;
  }
  if (["candidate_rejected", "delivery_failed", "mirror_verified", "progress_incremented", "reassessed"].includes(input.stage)) {
    window.status = "completed";
    window.outcome = input.stage === "candidate_rejected" ? "candidate_rejected" : input.stage === "delivery_failed" ? "delivery_failed" : input.stage === "mirror_verified" || input.stage === "progress_incremented" ? "verified" : "pending";
    window.nextConsiderAt = nextPublishingAttentionAt(plan, timestamp);
  }
  if (input.stage === "original_selected") window.outcome = "original_selected";
  if (input.stage === "intent_formed") window.outcome = "original_selected";
  if (input.stage === "awaiting_review") window.outcome = "awaiting_review";
  plan.nextAttentionAt = nextPublishingAttentionAt(plan, timestamp);
  const verified = derivePublicHistory(state, plan.presenceId).filter((item) => item.kind === "post" && item.origin?.kind === "publishing_initiative" && item.origin.planId === plan.id && item.origin.planRevision === plan.revision).length;
  plan.verifiedOriginals = verified;
  const presence = state.presences.find((item) => item.id === plan.presenceId);
  if (presence) {
    const title = input.stage === "eligible" ? "Publishing window eligible" : input.stage === "claimed" ? "Publishing work claimed" : input.stage === "agenda" ? "Publishing responsibility entered Agenda" : input.stage === "candidate_rejected" ? "Publishing candidate rejected" : input.stage === "mirror_verified" ? "Publishing original verified" : input.stage === "progress_incremented" ? "Publishing progress updated" : "Publishing work updated";
    state.events.unshift(event("decision", title, `${presence.name}: ${eventRecord.detail}`, input.stage === "candidate_rejected" ? "quiet" : input.stage === "delivery_failed" ? "warning" : "positive", { presenceId: presence.id, intentId: input.socialIntentId, executionId: input.executionId, outcomeId: input.outcomeId }));
  }
  return state;
}

export type PublishingPlanReassessmentNeed =
  | { kind: "none" }
  | { kind: "create_plan"; reason: string }
  | { kind: "reassess_plan"; plan: PublishingPlan; reason: string; elapsedHoursOverdue: number };

export function publishingPlanNeedsReassessment(source: OpenPresenceState, presenceId?: string, now = new Date()): PublishingPlanReassessmentNeed {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || !presence.publishingInitiative || presence.publishingInitiative.mode === "off") return { kind: "none" };
  const environment = planEnvironmentFor(presence);
  const activePlan = activePublishingPlanFor(state, presence.id, environment);
  if (!activePlan) {
    return { kind: "create_plan", reason: "An active publishing responsibility exists but no plan is currently materialized." };
  }
  if (activePlan.status !== "active") return { kind: "none" };
  const nowMs = now.getTime();
  const reassessMs = activePlan.nextReassessmentAt ? new Date(activePlan.nextReassessmentAt).getTime() : NaN;
  const horizonEndMs = activePlan.horizonEnd ? new Date(activePlan.horizonEnd).getTime() : NaN;
  const isReassessDue = Number.isFinite(reassessMs) && reassessMs <= nowMs;
  const isHorizonExhausted = Number.isFinite(horizonEndMs) && horizonEndMs <= nowMs;
  if (isReassessDue || isHorizonExhausted) {
    const boundaryMs = Number.isFinite(reassessMs) ? reassessMs : horizonEndMs;
    const elapsedHours = Math.max(0, (nowMs - boundaryMs) / (1000 * 60 * 60));
    return {
      kind: "reassess_plan",
      plan: activePlan,
      reason: isHorizonExhausted ? "The current plan horizon has ended." : "The scheduled reassessment checkpoint has arrived.",
      elapsedHoursOverdue: elapsedHours,
    };
  }
  return { kind: "none" };
}

export function replacePublishingPlan(source: OpenPresenceState, input: { presenceId?: string; environment?: PresenceEnvironment; draft: PublishingPlanDraft; modelProvider?: string; modelId?: string; expectedPlanId?: string; expectedRevision?: number }) {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (input.presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || presence.publishingInitiative.mode === "off" || !state.agent) return state;
  const environment = input.environment ?? planEnvironmentFor(presence);
  const timestamp = now();
  const previous = state.publishingPlans.filter((item) => item.presenceId === presence.id && item.environment === environment && item.status !== "superseded");
  const activePrior = previous.find((item) => item.status === "active");
  if (input.expectedPlanId !== undefined || input.expectedRevision !== undefined) {
    if (!activePrior || (input.expectedPlanId && activePrior.id !== input.expectedPlanId) || (input.expectedRevision !== undefined && activePrior.revision !== input.expectedRevision)) {
      return state;
    }
  }
  const initiative = presence.publishingInitiative;
  const newPlanId = id("publishing-plan");
  state.publishingPlans = state.publishingPlans.map((item) => previous.some((old) => old.id === item.id) ? { ...item, status: "superseded" as const, supersededBy: newPlanId, supersededAt: timestamp, updatedAt: timestamp } : item);
  const plan: PublishingPlan = {
    id: newPlanId, agentId: state.agent.id, presenceId: presence.id, environment,
    initiativeMode: initiative.mode === "pace" ? "pace" : "adaptive", horizonStart: input.draft.horizonStart, horizonEnd: input.draft.horizonEnd, timezone: initiative.timezone,
    status: "active", expectedOriginals: input.draft.expectedOriginals, operatorTarget: initiative.mode === "pace" && initiative.target ? { quantity: initiative.target.count, period: initiative.target.period } : undefined,
    verifiedOriginals: 0,
    windows: input.draft.windows.slice(0, 8).map((window, index) => ({ ...window, id: id(`publishing-window-${index}`), status: "future" as const, attempts: 0, summary: window.summary.trim().slice(0, 320) })),
    currentWork: input.draft.currentWork?.slice(0, 6).map((work, index) => ({ ...work, id: id(`publishing-work-${index}`), createdAt: timestamp, updatedAt: timestamp, summary: work.summary.trim().slice(0, 320) })),
    nextReassessmentAt: input.draft.nextReassessmentAt, rationaleSummary: input.draft.rationaleSummary?.trim().slice(0, 500), evidenceSummary: input.draft.evidenceSummary?.slice(0, 8).map((item) => item.trim().slice(0, 240)), constraints: input.draft.constraints?.slice(0, 8).map((item) => item.trim().slice(0, 240)), replanSignals: input.draft.replanSignals?.slice(0, 8).map((item) => item.trim().slice(0, 240)),
    nextAttentionAt: input.draft.windows.slice(0, 8).sort((left, right) => left.startAt.localeCompare(right.startAt))[0]?.startAt,
    workHistory: [], createdAt: timestamp, updatedAt: timestamp, revision: previous.reduce((max, item) => Math.max(max, item.revision), 0) + 1, modelProvider: input.modelProvider, modelId: input.modelId,
  };
  state.publishingPlans.unshift(plan);
  state.events.unshift(event("decision", "Publishing plan created", `${presence.name} created a visible working plan for its ${initiative.mode === "pace" ? "operator publishing expectation" : "adaptive publishing responsibility"}.`, "positive", { presenceId: presence.id }));
  return state;
}

export function recordPublishingPlanFailure(source: OpenPresenceState, presenceId: string, message: string) {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || presence.publishingInitiative.mode === "off") return state;
  const timestamp = now();
  const prior = state.publishingPlans
    .filter((item) => item.presenceId === presence.id && item.environment === planEnvironmentFor(presence) && item.status !== "superseded")
    .sort((left, right) => publishingPlanPriority(right) - publishingPlanPriority(left) || right.revision - left.revision)[0];
  if (prior) {
    // A failed successor attempt must not discard the last usable plan. Keep
    // that plan active and report the failure as an event; only an already
    // non-active record should become blocked.
    if (prior.status !== "active") {
      prior.status = "blocked";
      prior.rationaleSummary = message.slice(0, 500);
    } else {
      // Keep a failed due checkpoint from hot-looping the planner every
      // scheduler sweep. The existing active plan remains authoritative while
      // the next attempt is deferred to a bounded retry window.
      prior.nextReassessmentAt = new Date(new Date(timestamp).getTime() + 15 * 60_000).toISOString();
    }
    prior.updatedAt = timestamp;
  }
  state.events.unshift(event("system", "Publishing plan unavailable", `${presence.name} could not complete the latest planning pass. ${message}`, "warning", { presenceId }));
  return state;
}

export function publishingInitiativeGuidance(progress: PublishingInitiativeProgress) {
  if (progress.mode === "off") return "No autonomous original publishing responsibility is configured. Explicit requests and Assignments still apply.";
  if (progress.mode === "adaptive") return "Autonomous original publishing responsibility is active. Choose the pace from the Presence, current evidence, relationships, Mission, and Taste.";
  return `Publishing responsibility: aim for about ${progress.target} original posts this ${progress.period}. Verified so far: ${progress.verifiedOriginals}. ${progress.remaining ? `${progress.remaining} remain in the current period.` : "The current pace has been reached; this is not a maximum."} A rejected candidate is local silence, not completion of this responsibility.`;
}

export function recordPublicFooting(source: OpenPresenceState, presenceId: string, footing: PublicFooting) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const update = (presence: Presence) => ({
    ...presence,
    context: {
      ...presence.context,
      publicFooting: {
        ...footing,
        judgedInboundIds: footing.judgedInboundIds ?? presence.context.publicFooting?.judgedInboundIds,
        inboundAttentionCooldowns: footing.inboundAttentionCooldowns ?? presence.context.publicFooting?.inboundAttentionCooldowns,
      },
    },
  });
  state.presences = state.presences.map((presence) => presence.id === presenceId ? update(presence) : presence);
  if (state.presence?.id === presenceId) state.presence = update(state.presence);
  return state;
}

export function markInboundJudged(source: OpenPresenceState, presenceId: string, externalId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence) return state;
  const footing = presence.context.publicFooting ?? { postsPublished: 0, recentPostIds: [], observedAt: now() };
  const judgedInboundIds = [...new Set([...(footing.judgedInboundIds ?? []), externalId])].slice(-100);
  const inboundAttentionCooldowns = { ...(footing.inboundAttentionCooldowns ?? {}) };
  delete inboundAttentionCooldowns[externalId];
  return recordPublicFooting(state, presenceId, { ...footing, judgedInboundIds, inboundAttentionCooldowns });
}

/**
 * Defer one inbound candidate after an infrastructure/model failure without
 * turning the failure into a social NO_OP. Newer mentions remain eligible.
 */
export function deferInboundJudgment(source: OpenPresenceState, presenceId: string, externalId: string, retryAt: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence) return state;
  const footing = presence.context.publicFooting ?? { postsPublished: 0, recentPostIds: [], observedAt: now() };
  const inboundAttentionCooldowns = { ...(footing.inboundAttentionCooldowns ?? {}), [externalId]: retryAt };
  const recentIds = new Set(footing.recentInboundIds ?? []);
  const compactCooldowns = Object.fromEntries(Object.entries(inboundAttentionCooldowns).filter(([id]) => recentIds.has(id)).slice(-100));
  return recordPublicFooting(state, presenceId, { ...footing, inboundAttentionCooldowns: compactCooldowns });
}

export function markCalendarSlotEvaluated(source: OpenPresenceState, slotId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const slot = state.calendar.find((item) => item.id === slotId);
  if (slot) slot.lastEvaluatedAt = now();
  return state;
}

export function recordStandingIntentNoOp(source: OpenPresenceState, presenceId: string, instruction: string, rationale?: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const reason = rationale?.trim() || "The Agent returned no public action without a recorded explanation.";
  state.actions.unshift({ id: id("act"), intent: "no_op", target: `${presence?.channel ?? "channel"}_calendar`, summary: instruction, status: "skipped", reason, createdAt: now() });
  state.events.unshift(event("decision", "Standing intention held", `Jenny evaluated the Calendar instruction in the moment and chose silence. Reason: ${reason}`, "quiet", { presenceId }));
  return state;
}

export function recordNativeObservationInPlace(state: OpenPresenceState, presenceId: string, observation: OpenPresenceState["nativeConnections"][number]["observation"]) {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  state.nativeConnections = state.nativeConnections.map((connection) => {
    if (connection.presenceId !== presenceId || connection.kind !== "x") return connection;
    const identityMatches = !presence?.handle || !connection.account?.username
      || normalizeHandleForComparison(connection.account.username) === normalizeHandleForComparison(presence.handle);
    const observationHealthy = observation?.status === "up-to-date" || observation?.status === "degraded";
    // A successful authenticated read proves that the Native X connector is
    // usable again. Older versions left a generic write failure on the
    // connection, which made every later queue check treat the connector as
    // unavailable even though reconciliation was succeeding.
    if (identityMatches && observationHealthy) {
      return {
        ...connection,
        status: "connected" as const,
        healthMessage: undefined,
        deliveryError: xCreditsExhausted(connection) ? undefined : connection.deliveryError,
        observation,
        updatedAt: now(),
      };
    }
    return nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? "")
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: connection.deliveryError ?? connection.healthMessage, observation, updatedAt: now() }
      : { ...connection, observation, updatedAt: now() };
  });
  return state;
}

export function recordNativeObservation(source: OpenPresenceState, presenceId: string, observation: OpenPresenceState["nativeConnections"][number]["observation"]) {
  return recordNativeObservationInPlace(cloneState(source), presenceId, observation);
}

export function recordNativeMirror(source: OpenPresenceState, input: { connectionId: string; presenceId: string; own?: boolean; post: { id: string; text: string; language?: string; createdAt?: string; authorId?: string; authorUsername?: string; authorName?: string; authorAvatarUrl?: string; conversationId?: string; parentId?: string; referencedPosts?: Array<{ type: "replied_to" | "quoted" | "retweeted"; id: string }>; media?: Array<{ mediaKey: string; type: "photo" | "video" | "animated_gif"; url?: string; previewImageUrl?: string; altText?: string }> } }, options?: { normalized?: boolean; attentionEpisodeId?: string; attentionRunId?: string; attentionInvocationId?: string; explicitOperatorEvidence?: boolean; suppressRelationshipCuration?: boolean }) {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  // Keep unverified provider data auditable, but never admit a confirmed
  // non-English observation to this Presence. Feed and cognition projections
  // reject unknown language as well, so a missing provider tag cannot bypass
  // the English-only boundary.
  const visualLanguageEligible = languageEligibleForObservation(presence?.language, input.post.language, input.post.text, Boolean(input.post.media?.length));
  if (!input.own && !options?.explicitOperatorEvidence && input.post.language !== undefined && !visualLanguageEligible) return state;
  const receivedAt = now();
  const sourceEventId = `native-x:${input.connectionId}:${input.post.id}`;
  const existing = state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.externalRef.type === "x.post" && item.externalRef.id === input.post.id);
  // A connector can submit successfully and lose its acknowledgement before
  // OpenPresence records the outcome. When the authenticated own-post feed
  // later returns the exact reply under the exact intended parent, that
  // external object is stronger evidence than the stale local failure. Use
  // the two independent identifiers plus exact authored text; never infer a
  // delivery from text alone or from an unrelated original post.
  if (input.own && input.post.parentId) {
    const comparableText = (value: string) => value.replace(/^@\S+\s+/, "").replace(/\s+/g, " ").trim();
    const observedText = comparableText(input.post.text);
    const candidates = state.executions.filter((execution) => {
      if (execution.presenceId !== input.presenceId || execution.affordance !== "x.reply" || execution.target?.id !== input.post.parentId || execution.externalRef) return false;
      if (!["blocked", "failed", "cancelled", "verification-closed"].includes(execution.status)) return false;
      const payload = execution.publication?.payload;
      const authoredText = payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.text === "string" ? payload.text : undefined;
      if (!authoredText || comparableText(authoredText) !== observedText) return false;
      const createdAt = Date.parse(execution.createdAt);
      const observedAt = Date.parse(input.post.createdAt ?? receivedAt);
      return Number.isFinite(createdAt) && Number.isFinite(observedAt) && observedAt >= createdAt - 60_000 && observedAt - createdAt <= 24 * 60 * 60_000;
    });
    if (candidates.length === 1) {
      const execution = candidates[0]!;
      execution.status = "succeeded";
      execution.attempts = Math.max(1, execution.attempts);
      execution.externalRef = { type: "x.reply", id: input.post.id };
      execution.executedAt = input.post.createdAt ?? receivedAt;
      execution.updatedAt = receivedAt;
      execution.failure = undefined;
      execution.reviewReason = "Reconciled from the authenticated own-post feed after the delivery acknowledgement was lost.";
      const outcome = state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded")
        ?? { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: "succeeded" as const, observedAt: receivedAt, metrics: {}, evidence: [execution.externalRef] };
      if (!state.outcomes.some((item) => item.id === outcome.id)) state.outcomes.unshift(outcome);
      const action = state.actions.find((item) => item.executionId === execution.id);
      if (action) { action.status = "executed"; action.outcomeId = outcome.id; action.reason = "Verified from the authenticated X own-post feed."; }
    }
  }
  const mediaRefs = (input.post.media ?? []).flatMap((media) => {
    const sourceUrl = media.url ?? media.previewImageUrl;
    if (!sourceUrl) return [];
    const type = media.type === "photo" ? "image" : media.type === "animated_gif" ? "gif" : "video";
    const asset = state.assets.find((item) => item.presenceId === input.presenceId && item.provenance.sourceUrl === sourceUrl)
      ?? { id: id("asset"), agentId: state.agent?.id ?? "", presenceId: input.presenceId, type, mediaKind: type, status: "ready" as const, nature: "observed" as const, rights: { status: "unknown" as const }, provenance: { origin: "native-x", sourceUrl, publisher: "X", author: input.post.authorUsername, importedAt: receivedAt, sourceIdentityStatus: "unknown" as const }, description: media.altText ?? `X ${type} attachment`, mimeType: type === "image" ? "image/jpeg" : undefined, visibility: "public" as const, shareability: "presence-only" as const, environment: "live" as const, createdAt: receivedAt, updatedAt: receivedAt };
    if (!state.assets.some((item) => item.id === asset.id)) state.assets.unshift(asset);
    return [{ assetId: asset.id, kind: type as "image" | "video" | "gif", role: "attachment" as const }];
  });
  const matchingExecution = state.executions.find((execution) => execution.presenceId === input.presenceId && execution.status === "succeeded" && execution.externalRef?.id === input.post.id);
  const verifiedAssignmentId = matchingExecution?.assignmentId ?? existing?.assignmentId;
  // Preserve the authored execution affordance when the provider's later
  // observation uses a different relationship label. In particular, the
  // current X surface serializes a visible quote card as `reply_to`; letting
  // `input.post.parentId` win here silently turns a verified Quote into a
  // Reply after the next heartbeat and makes Activity counters regress.
  const objectType = matchingExecution?.affordance === "x.quote" ? "quote"
    : matchingExecution?.affordance === "x.repost" ? "repost"
      : matchingExecution?.affordance === "x.reply" || (input.own && Boolean(input.post.parentId))
        ? "reply"
        : existing?.objectType ?? "post";
  const object = { id: existing?.id ?? id("mirror"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, channelId: "x" as const, externalRef: { type: "x.post", id: input.post.id }, parentExternalRef: input.post.parentId ? { type: "x.post", id: input.post.parentId } : undefined, conversationExternalRef: input.post.conversationId, referencedExternalRefs: input.post.referencedPosts?.map((reference) => ({ type: "x.post", id: reference.id })), objectType, language: visualLanguageEligible && input.post.language !== undefined && !languagesMatch(presence?.language, input.post.language) ? presence?.language : input.post.language, author: { externalRef: input.post.authorId ? { type: "x.user", id: input.post.authorId } : undefined, displayName: input.post.authorName ?? (input.post.authorUsername ? `@${input.post.authorUsername}` : "X user"), handle: input.post.authorUsername, avatarUrl: input.post.authorAvatarUrl }, content: { text: input.post.text }, assetRefs: mediaRefs.length ? mediaRefs : existing?.assetRefs, occurredAt: input.post.createdAt, observedAt: receivedAt, visibility: "public" as const, shareability: "presence-only" as const, originExecutionId: matchingExecution?.id ?? existing?.originExecutionId, assignmentId: verifiedAssignmentId, actorPresenceId: existing?.actorPresenceId ?? (input.own ? input.presenceId : undefined), sourceEventId, archived: false, environment: "live" as const, source: "native" as const, trust: "untrusted_world_content" as const, attentionEpisodeId: options?.attentionEpisodeId, attentionRunId: options?.attentionRunId, attentionInvocationId: options?.attentionInvocationId };
  const changeFingerprint = (item: Pick<MirrorObject, "objectType" | "language" | "author" | "content" | "assetRefs" | "parentExternalRef" | "conversationExternalRef" | "referencedExternalRefs" | "visibility" | "shareability" | "originExecutionId" | "actorPresenceId" | "archived" | "environment">) => JSON.stringify({
    objectType: item.objectType,
    language: item.language,
    author: item.author,
    content: item.content,
    assetRefs: item.assetRefs,
    parentExternalRef: item.parentExternalRef,
    conversationExternalRef: item.conversationExternalRef,
    referencedExternalRefs: item.referencedExternalRefs,
    visibility: item.visibility,
    shareability: item.shareability,
    originExecutionId: item.originExecutionId,
    actorPresenceId: item.actorPresenceId,
    archived: item.archived,
    environment: item.environment,
  });
  const changed = !existing || changeFingerprint(existing) !== changeFingerprint(object);
  if (existing && changed) {
    state.mirrorObjects = state.mirrorObjects.map((item) => item.id === existing.id ? object : item);
  } else if (!existing) {
    state.mirrorObjects.unshift(object);
  }
  if (!existing) {
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, sourceEventId, event: "created", externalRef: { type: "x.post", id: input.post.id }, receivedAt });
  } else if (changed) {
    // A legacy object may have no `created` event. Emit one update for a real
    // content/relationship change, keyed by its resulting fingerprint, so a
    // replay of unchanged reconciliation cannot grow the append-only log.
    const updateSourceEventId = `${sourceEventId}:updated:${stableHash(changeFingerprint(object))}`;
    if (!state.mirrorEvents.some((item) => item.sourceEventId === updateSourceEventId)) {
      state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, sourceEventId: updateSourceEventId, event: "updated", externalRef: { type: "x.post", id: input.post.id }, receivedAt });
    }
  }
  if (matchingExecution?.assignmentId && !existing?.originExecutionId) {
    const assignment = state.assignments.find((item) => item.id === matchingExecution.assignmentId);
    if (assignment) {
      assignment.progress.verified += 1;
      assignment.status = assignmentIsSatisfied(assignment) ? "completed" : "active";
      assignment.lastOutcome = { class: assignmentIsSatisfied(assignment) ? "assignment_completed" : "incomplete", message: "The native X publication was observed back in the Social Mirror.", at: receivedAt };
      assignment.nextDueAt = new Date(Date.now() + 60 * 60_000).toISOString();
      assignment.updatedAt = receivedAt;
      state.events.unshift(event("execution", "Assignment progress verified", `Verified native X publication ${input.post.id} in the Social Mirror. Progress: ${assignment.progress.verified}${assignment.progress.required ? ` / ${assignment.progress.required}` : ""}.`, "positive", { presenceId: input.presenceId, executionId: matchingExecution.id, sourceObjectId: existing?.id }));
    }
  }
  const mirrored = state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.externalRef.type === "x.post" && item.externalRef.id === input.post.id);
  if (mirrored) {
    updateConversationEpisodeFromMirror(state, mirrored, input.presenceId);
    if (matchingExecution?.conversationEpisodeId) {
      settleConversationClosure(state, matchingExecution.conversationEpisodeId, "verified", "The native X reply was observed in the Social Mirror.");
    }
  }
  const curationTarget = mirrored?.actorPresenceId === input.presenceId && mirrored.parentExternalRef
    ? state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.externalRef.type === mirrored.parentExternalRef?.type && item.externalRef.id === mirrored.parentExternalRef?.id)
    : mirrored;
  return curationTarget && !options?.suppressRelationshipCuration ? curateRelationshipFromMirror(state, curationTarget, input.presenceId, options) : state;
}

/**
 * Reconcile a connector page without cloning the complete workspace once per
 * observed object. The public single-object helper remains defensive for
 * ordinary callers; high-volume observation uses one normalization pass and
 * applies the same canonical mirror logic in place.
 */
export function recordNativeMirrorsInPlace(source: OpenPresenceState, inputs: Array<Parameters<typeof recordNativeMirror>[1]>, options?: Parameters<typeof recordNativeMirror>[2]) {
  let state = source;
  for (const input of inputs) state = recordNativeMirror(state, input, { normalized: true, ...options });
  return state;
}

export function recordNativeMirrors(source: OpenPresenceState, inputs: Array<Parameters<typeof recordNativeMirror>[1]>, options?: Parameters<typeof recordNativeMirror>[2]) {
  return recordNativeMirrorsInPlace(cloneState(source), inputs, options);
}

/** Record an operator-supplied public post without pretending it arrived from a connected connector. */
export function recordImportedXMirror(source: OpenPresenceState, input: Parameters<typeof recordNativeMirror>[1]) {
  const state = recordNativeMirror(source, { ...input, connectionId: `manual-x:${input.post.id}` });
  const mirror = state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.externalRef.type === "x.post" && item.externalRef.id === input.post.id);
  if (!mirror) return state;
  const bridgeId = `manual-x:${input.post.id}`;
  const sourceEventId = bridgeId;
  mirror.bridgeId = bridgeId;
  mirror.source = "manual";
  mirror.sourceEventId = sourceEventId;
  state.mirrorEvents = state.mirrorEvents.map((event) => event.externalRef.type === "x.post" && event.externalRef.id === input.post.id && event.presenceId === input.presenceId
    ? { ...event, bridgeId, sourceEventId }
    : event);
  return state;
}

/** Mark a previously observed native X post as deleted when X no longer returns it. */
export function recordNativeMirrorDeletion(source: OpenPresenceState, input: { connectionId: string; presenceId: string; postId: string }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const existing = state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.channelId === "x" && item.externalRef.type === "x.post" && item.externalRef.id === input.postId && item.environment !== "sandbox");
  if (!existing || existing.archived) return state;
  const receivedAt = now();
  const sourceEventId = `native-x:${input.connectionId}:${input.postId}:deleted`;
  const archived = { ...existing, archived: true, observedAt: receivedAt, sourceEventId };
  state.mirrorObjects = state.mirrorObjects.map((item) => item.id === existing.id ? archived : item);
  if (!state.mirrorEvents.some((item) => item.bridgeId === `native:${input.connectionId}` && item.sourceEventId === sourceEventId)) {
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, sourceEventId, event: "deleted", externalRef: existing.externalRef, object: archived, receivedAt, environment: "live" });
  }
  return state;
}

const publicHistoryKinds = new Set(["post", "reply", "comment", "quote", "repost", "like", "thread"]);

/** Keep the Feed on the active Presence's channel and execution environment. */
export function publicHistoryMatchesPresence(item: PublicHistoryItem, presence?: Presence | null) {
  if (!presence || item.channel !== presence.channel) return false;
  return presence.environment === "sandbox" ? item.environment === "sandbox" : item.environment !== "sandbox";
}

function historyKind(value: string): PublicHistoryItem["kind"] | undefined {
  const normalized = value.split(".").at(-1) ?? value;
  return publicHistoryKinds.has(normalized) ? normalized as PublicHistoryItem["kind"] : undefined;
}

function mirrorHistoryKind(object: Pick<MirrorObject, "objectType" | "parentExternalRef" | "referencedExternalRefs">): PublicHistoryItem["kind"] | undefined {
  const direct = historyKind(object.objectType);
  if (direct !== "post") return direct;
  if (object.parentExternalRef) return "reply";
  if (object.referencedExternalRefs?.length) return "quote";
  return direct;
}

function historyKindPriority(kind: PublicHistoryItem["kind"]) {
  return kind === "quote" || kind === "repost" || kind === "like" ? 4 : kind === "reply" || kind === "comment" ? 3 : 1;
}

/**
 * Derive a navigable channel URL from provider-neutral Mirror identity.
 * Unsupported or simulated objects intentionally return no URL rather than
 * guessing a destination that may not exist.
 */
export function externalUrlForMirrorObject(input: Pick<MirrorObject, "channelId" | "externalRef" | "environment">, authorHandle?: string) {
  if (input.environment === "sandbox" || !input.externalRef.id) return undefined;
  if (/^https?:\/\//i.test(input.externalRef.id)) return input.externalRef.id;
  const type = input.externalRef.type.toLowerCase();
  const id = encodeURIComponent(input.externalRef.id);
  if (input.channelId === "x" && ["x.post", "x.reply", "x.comment", "x.quote", "x.repost", "x.like", "x.thread"].includes(type)) {
    const handle = authorHandle?.replace(/^@/, "").trim();
    return handle ? `https://x.com/${encodeURIComponent(handle)}/status/${id}` : `https://x.com/i/status/${id}`;
  }
  if (input.channelId === "linkedin" && ["linkedin.post", "linkedin.reply", "linkedin.comment", "linkedin.share"].includes(type)) {
    return `https://www.linkedin.com/feed/update/${id}`;
  }
  return undefined;
}

function attentionTelemetry(test: AttentionTest, input: Omit<AttentionTest["telemetry"][number], "id" | "at"> & { at?: string }) {
  if (test.telemetry.some((item) => item.transitionKey === input.transitionKey)) return;
  test.telemetry.push({ ...input, id: id("attention-telemetry"), at: input.at ?? now() });
}

function attentionBridgeStatus(state: OpenPresenceState, test: AttentionTest, execution?: Execution) {
  if (execution?.connector === "simulated") return "sandbox";
  const bridge = state.bridges.find((item) => item.id === execution?.bridgeId) ?? state.bridges.find((item) => item.presenceId === test.presenceId && item.state !== "offline");
  if (!bridge) return execution?.connector === "native" ? "native" : "disconnected";
  return bridgeAdapterIsConnected(bridge) ? "connected" : bridge.state;
}

/** Project execution and Social Mirror truth into the operator-visible test timeline. */
function syncAttentionTests(state: OpenPresenceState) {
  for (const test of state.attentionTests ?? []) {
    if (test.decision?.action === "no_op" && !test.executionId) {
      test.status = "held";
      attentionTelemetry(test, { stage: "decided", action: undefined, targetId: test.target?.id, verificationResult: "not_run", persistenceResult: "pending", detail: `Genny looked now and chose silence. ${test.decision.rationale}`, transitionKey: `decided:no-op:${test.id}` });
      attentionTelemetry(test, { stage: "held", action: undefined, targetId: test.target?.id, verificationResult: "not_run", persistenceResult: "pending", detail: "No public action was warranted, so nothing was sent or recorded as a public outcome.", transitionKey: `held:${test.id}` });
      test.updatedAt = test.decision.at;
      continue;
    }
    const execution = test.executionId ? state.executions.find((item) => item.id === test.executionId) : undefined;
    const bridgeStatus = attentionBridgeStatus(state, test, execution);
    if (!execution) continue;
    const base = { executionId: execution.id, action: test.action, targetId: test.target?.id, bridgeStatus } as const;
    if (["queued", "approved", "awaiting-review", "awaiting-connector", "awaiting-manual"].includes(execution.status)) {
      test.status = "queued";
      attentionTelemetry(test, { ...base, stage: "queued", verificationResult: "pending", persistenceResult: "pending", detail: bridgeStatus === "disconnected" ? "The Chrome Bridge is not connected; the queued action will remain pending until the Bridge checks in." : bridgeStatus === "sandbox" ? "The Sandbox executor has queued the action in the production execution envelope." : "The action is queued in the production execution envelope.", transitionKey: `queued:${execution.id}:${execution.updatedAt}` });
      test.updatedAt = execution.updatedAt;
      continue;
    }
    if (execution.status === "claimed") {
      test.status = "claimed";
      attentionTelemetry(test, { ...base, stage: "claimed", verificationResult: "pending", persistenceResult: "pending", detail: "The Chrome Bridge claimed this execution lease.", transitionKey: `claimed:${execution.id}:${execution.updatedAt}` });
      test.updatedAt = execution.updatedAt;
      continue;
    }
    if (["executing", "verification-pending"].includes(execution.status)) {
      test.status = "executed";
      attentionTelemetry(test, { ...base, stage: "executed", verificationResult: "pending", persistenceResult: "pending", detail: execution.status === "verification-pending" ? "The action ran; OpenPresence is waiting for authoritative X verification." : "The connector is executing the action.", transitionKey: `executed:${execution.id}:${execution.updatedAt}` });
      test.updatedAt = execution.updatedAt;
      continue;
    }
    if (execution.status === "succeeded") {
      const mirror = state.mirrorObjects.find((item) => item.originExecutionId === execution.id)
        ?? (execution.externalRef ? state.mirrorObjects.find((item) => item.presenceId === test.presenceId && item.externalRef.type === execution.externalRef?.type && item.externalRef.id === execution.externalRef?.id) : undefined);
      if (!mirror) {
        test.status = "failed";
        test.failure = { code: "SOCIAL_MIRROR_PERSISTENCE_FAILURE", message: "The connector reported success, but the verified Social Mirror record is missing. Retry is safe and idempotent.", retryable: true };
        test.lastFailure = { ...test.failure, at: now() };
        attentionTelemetry(test, { ...base, stage: "verified", verificationResult: "verified", persistenceResult: "failed", detail: "X verification succeeded, but Social Mirror persistence did not complete.", transitionKey: `verified:${execution.id}:${execution.updatedAt}` });
        attentionTelemetry(test, { ...base, stage: "failed", verificationResult: "verified", persistenceResult: "failed", detail: test.failure.message, transitionKey: `persistence-failed:${execution.id}:${execution.updatedAt}` });
        test.updatedAt = execution.updatedAt;
        continue;
      }
      test.status = "visible";
      test.failure = undefined;
      test.feedRecordId = mirror.id;
      test.calendarRecordId = mirror.id;
      test.externalUrl = externalUrlForMirrorObject(mirror, mirror.author?.handle);
      attentionTelemetry(test, { ...base, stage: "claimed", verificationResult: "pending", persistenceResult: "pending", detail: execution.connector === "simulated" ? "The Sandbox executor claimed the test execution." : "The connected execution body claimed the test execution.", transitionKey: `claimed:${execution.id}:${execution.updatedAt}` });
      attentionTelemetry(test, { ...base, stage: "executed", verificationResult: "pending", persistenceResult: "pending", detail: "The connector completed the action.", transitionKey: `executed:${execution.id}:${execution.updatedAt}` });
      attentionTelemetry(test, { ...base, stage: "verified", verificationResult: "verified", persistenceResult: "pending", detail: "The connector verified the public result on X.", transitionKey: `verified:${execution.id}:${execution.updatedAt}` });
      attentionTelemetry(test, { ...base, stage: "recorded", verificationResult: "verified", persistenceResult: "recorded", detail: "The verified result is recorded in the Social Mirror.", transitionKey: `recorded:${mirror.id}` });
      attentionTelemetry(test, { ...base, stage: "visible", verificationResult: "verified", persistenceResult: "recorded", detail: "The result is available to Feed and Calendar projections.", transitionKey: `visible:${mirror.id}` });
      test.updatedAt = execution.updatedAt;
      continue;
    }
    if (["failed", "blocked", "expired", "verification-closed"].includes(execution.status)) {
      const failureCode = execution.failure?.code ?? (execution.status === "blocked" ? "ACTION_BLOCKED" : "EXECUTION_FAILED");
      const failureMessage = execution.failure?.message ?? "The execution did not complete.";
      test.status = "failed";
      test.failure = { code: failureCode, message: failureMessage, retryable: execution.failure?.retryable };
      test.lastFailure = { ...test.failure, at: now() };
      attentionTelemetry(test, { ...base, stage: "failed", verificationResult: execution.status === "verification-closed" ? "timeout" : "failed", persistenceResult: "failed", detail: failureMessage, transitionKey: `failed:${execution.id}:${execution.updatedAt}` });
      test.updatedAt = execution.updatedAt;
    }
  }
}

export function startAttentionTest(source: OpenPresenceState, input: { presenceId: string; mode: AttentionTestMode; confirmed?: true; candidateId?: string }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const createdAt = now();
  const test: AttentionTest = { id: id("attention-test"), agentId: state.agent?.id ?? "", presenceId: input.presenceId, candidateId: input.candidateId, mode: input.mode, status: "queued", telemetry: [{ id: id("attention-telemetry"), stage: "queued", at: createdAt, detail: input.mode === "live" ? "Genny was asked to look now and choose whether a real public X action is warranted." : "Genny was asked to look now inside the Sandbox without a public write.", transitionKey: "created" }], createdAt, updatedAt: createdAt };
  state.attentionTests.unshift(test);
  state.events.unshift(event("execution", "Genny's attention test queued", `Genny was asked to look now and choose the target and social act from the available context.`, "positive", { presenceId: input.presenceId }));
  return state;
}

export function recordAttentionTestDecision(source: OpenPresenceState, input: { testId: string; action: import("./types").AttentionTestDecisionAction; rationale: string; target?: EntityRef; targetUrl?: string; quoteText?: string }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const test = state.attentionTests.find((item) => item.id === input.testId);
  if (!test) return state;
  const decidedAt = now();
  test.action = input.action === "no_op" ? undefined : input.action;
  test.target = input.target;
  test.targetUrl = input.targetUrl;
  test.quoteText = input.quoteText;
  test.decision = { action: input.action, rationale: input.rationale.trim() || "Genny made a judgment from the available social context.", at: decidedAt };
  test.updatedAt = decidedAt;
  attentionTelemetry(test, { stage: "decided", action: test.action, targetId: input.target?.id, verificationResult: "pending", persistenceResult: "pending", detail: input.action === "no_op" ? `Genny chose silence: ${test.decision.rationale}` : `Genny chose ${input.action}${input.target?.id ? ` for ${input.target.id}` : ""}. ${test.decision.rationale}`, transitionKey: `decided:${input.action}:${input.target?.id ?? "none"}` });
  state.events.unshift(event("decision", input.action === "no_op" ? "Genny chose silence" : "Genny chose an attention action", test.decision.rationale, input.action === "no_op" ? "quiet" : "positive", { presenceId: test.presenceId, sourceObjectId: input.target?.id }));
  return state;
}

export function failAttentionTest(source: OpenPresenceState, testId: string, failure: { code: string; message: string; retryable?: boolean }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const test = state.attentionTests.find((item) => item.id === testId);
  if (!test) return state;
  test.status = "failed"; test.failure = failure; test.lastFailure = { ...failure, at: now() }; test.updatedAt = now();
  attentionTelemetry(test, { stage: "failed", action: test.action, targetId: test.target?.id, verificationResult: "not_run", persistenceResult: "failed", detail: failure.message, transitionKey: `input-failed:${failure.code}` });
  state.events.unshift(event("execution", "Attention test failed", failure.message, "warning", { presenceId: test.presenceId, executionId: test.executionId }));
  return state;
}

/** Add a sandbox observation selected from the Agent's candidate context; this is observation, not a fabricated reaction. */
export function recordAttentionTestSandboxTarget(source: OpenPresenceState, input: { testId: string; sessionId: string; target: EntityRef; targetUrl: string; text?: string }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const test = state.attentionTests.find((item) => item.id === input.testId);
  const session = state.playgroundSessions.find((item) => item.id === input.sessionId);
  if (!test || !session) return state;
  const existing = state.mirrorObjects.find((item) => item.sessionId === session.id && item.externalRef.type === input.target.type && item.externalRef.id === input.target.id);
  if (!existing) state.mirrorObjects.unshift({ id: id("mirror"), bridgeId: `sandbox:${session.environmentId}`, presenceId: session.presenceId, channelId: session.channelId, externalRef: input.target, objectType: "post", language: state.presences.find((item) => item.id === session.presenceId)?.language, content: { text: input.text, language: state.presences.find((item) => item.id === session.presenceId)?.language }, occurredAt: session.virtualNow, observedAt: now(), visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: session.id, source: "operator", trust: "untrusted_world_content" });
  test.target = input.target; test.targetUrl = input.targetUrl; test.updatedAt = now();
  return state;
}

function publicHistoryExternalUrl(state: OpenPresenceState, presence: Presence, externalRef: EntityRef, environment?: PresenceEnvironment, authorHandle?: string) {
  const account = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.kind === "x")?.account?.username;
  return externalUrlForMirrorObject({ channelId: presence.channel, externalRef, environment }, authorHandle ?? account);
}

/**
 * Project the durable public record from the Social Mirror, never from the
 * intent or execution queue. Delivery records are joined as provenance and
 * outcome evidence; they do not create public-history truth on their own.
 */
export function derivePublicHistory(source: OpenPresenceState, presenceId?: string, options?: { normalized?: boolean }): PublicHistoryItem[] {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presences = presenceId ? state.presences.filter((item) => item.id === presenceId) : state.presences;
  const result = new Map<string, PublicHistoryItem>();
  for (const presence of presences) {
    const footing = presence.context.publicFooting;
    const succeeded = new Map(state.executions
      .filter((execution) => execution.presenceId === presence.id && execution.status === "succeeded" && execution.externalRef)
      .map((execution) => [execution.id, execution] as const));
    const nativeAccount = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.kind === "x")?.account;
    const ownPostIds = new Set(footing?.recentPostIds ?? []);
    for (const object of state.mirrorObjects) {
      if (object.presenceId !== presence.id || object.visibility !== "public") continue;
      // A public object can be observed after the Presence starts while
      // still belonging to the account's earlier history. Keep it out of
      // Presence-owned history and every consumer that derives from it.
      if (!growthEvidenceIsInPresenceScope(state, presence.id, object.occurredAt ?? object.observedAt)) continue;
      if (!growthEvidenceIsInPresenceScope(state, presence.id, object.observedAt)) continue;
      const execution = object.originExecutionId ? succeeded.get(object.originExecutionId) : undefined;
      // A verified execution is the authoritative act. Native reconciliation
      // can attach a like/repost execution to the observed source post, whose
      // own reply lineage must not turn the reaction into a fake reply.
      const executionKind = execution?.affordance ? historyKind(execution.affordance) : undefined;
      const kind = executionKind ?? mirrorHistoryKind(object);
      if (!kind) continue;
      const intent = execution ? state.socialIntents.find((item) => item.id === execution.socialIntentId) : undefined;
      const ownNativePost = presence.channel === "x" && kind === "post" && ownPostIds.has(object.externalRef.id);
      const publicHandle = (presence.context.publicIdentity.handle ?? presence.handle).replace(/^@/, "").toLowerCase();
      const authorHandle = object.author?.handle?.replace(/^@/, "").toLowerCase();
      const authoredByIdentity = Boolean(publicHandle && authorHandle && publicHandle === authorHandle);
      const attributedToPresence = object.actorPresenceId === presence.id || ownNativePost || authoredByIdentity || Boolean(object.originExecutionId && succeeded.has(object.originExecutionId));
      if (!attributedToPresence) continue;
      const outcome = execution ? state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded") : undefined;
      const reaction = kind === "like" || kind === "repost";
      const historyExternalRef = reaction ? execution?.externalRef ?? object.externalRef : object.externalRef;
      const urlRef = reaction ? object.externalRef : object.externalRef;
      const historyItem: PublicHistoryItem = {
        id: object.id,
        presenceId: presence.id,
        kind,
        channel: object.channelId,
        text: object.content?.text,
        authorAvatarUrl: object.author?.avatarUrl ?? (attributedToPresence ? nativeAccount?.profileImageUrl : undefined),
        occurredAt: object.occurredAt ?? object.observedAt,
        observedAt: object.observedAt,
        externalRef: historyExternalRef,
        parentExternalRef: reaction ? object.externalRef : object.parentExternalRef ?? (kind === "quote" ? object.referencedExternalRefs?.[0] : undefined),
        executionId: execution?.id ?? object.originExecutionId,
        publicationId: execution?.publication?.id,
        origin: execution?.publication?.origin ?? intent?.origin,
        assetIds: object.assetRefs?.map((ref) => ref.assetId),
        environment: object.environment,
        externalUrl: publicHistoryExternalUrl(state, presence, urlRef, object.environment, object.author?.handle),
        availability: object.archived ? "deleted" : "available",
        metrics: outcome?.metrics ?? {},
      };
      const resultKey = `${presence.id}:${historyExternalRef.type}:${historyExternalRef.id}`;
      const existing = result.get(resultKey);
      if (!existing || historyKindPriority(historyItem.kind) >= historyKindPriority(existing.kind)) result.set(resultKey, historyItem);
    }
  }
  return [...result.values()].sort((left, right) => {
    const leftTime = left.environment === "sandbox" ? left.observedAt : left.occurredAt;
    const rightTime = right.environment === "sandbox" ? right.observedAt : right.occurredAt;
    return rightTime.localeCompare(leftTime) || right.occurredAt.localeCompare(left.occurredAt);
  });
}

export function recordRuntimeEvent(source: OpenPresenceState, presenceId: string, title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "intentId" | "executionId" | "outcomeId" | "decisionId" | "sessionId" | "invocationId" | "runId" | "sourceObjectId" | "attentionEpisodeId">) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.events.unshift(event("system", title, detail, tone, { presenceId, ...lineage }));
  return state;
}

export function markNativeConnectionNeedsAttention(source: OpenPresenceState, presenceId: string, message: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const deliveryOnlyFailure = nativeDeliveryFailureIsConnectionScoped(message);
  const creditsExhausted = xCreditsExhausted({ healthMessage: message, deliveryError: message });
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === presenceId && connection.kind === "x"
    ? deliveryOnlyFailure
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: message, updatedAt: now() }
      : { ...connection, status: "needs-attention" as const, healthMessage: message, deliveryError: undefined, updatedAt: now() }
    : connection);
  if (creditsExhausted) {
    state.presences = state.presences.map((presence) => {
      if (presence.id === presenceId && presence.channel === "x" && presence.status !== "paused") {
        return { ...presence, status: "paused" as const };
      }
      return presence;
    });
    if (state.presence?.id === presenceId && state.presence.channel === "x" && state.presence.status !== "paused") {
      state.presence = { ...state.presence, status: "paused" as const };
    }
  }
  return recordRuntimeEvent(
    state,
    presenceId,
    creditsExhausted ? "X credits exhausted" : deliveryOnlyFailure ? "X delivery needs attention" : "X connection needs attention",
    creditsExhausted ? `X API credits are exhausted. External actions and observation were paused automatically. ${message}` : message,
    "warning"
  );
}

/** Resume a Presence only after an explicit manual check proves its previous
 * X-credit pause is no longer warranted. A normal operator pause is never
 * changed by a background observation. */
export function resumePresenceAfterNativeRecovery(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || presence.status !== "paused") return state;
  const updated = { ...presence, status: "live" as const, accountHealth: "healthy" as const };
  state.presences = state.presences.map((item) => item.id === presenceId ? updated : item);
  if (state.presence?.id === presenceId) state.presence = updated;
  return recordRuntimeEvent(state, presenceId, "X connection restored", "The manual X check succeeded, so this Presence is awake again and its normal observation queue can resume.", "positive");
}

// A rejected reply target is a failed action, not evidence that the native
// connection itself is unhealthy. Keep the connector available for unrelated
// actions such as original posts while retaining the delivery error for review.
export function nativeDeliveryFailureIsConnectionScoped(message: string) {
  // A delivery rejection is evidence about the attempted public act, not
  // automatically evidence that the authenticated connector is unusable. X
  // returns the same generic 403 wording for several action-level failures,
  // including replies that the account is not allowed to make. Keep the
  // connection available for unrelated actions and retain the failure on the
  // execution/activity record instead of disabling every write capability.
  return /no API credits remaining|temporarily rate-limited|you can only reply to or quote posts where you are mentioned or are the author|x rejected this action:.*not permitted|duplicate content|duplicate.*tweet|already said that/i.test(message);
}

/**
 * Read access is independent from the native writer's health. A write-only
 * permission failure must not force follower or publication evidence through
 * the browser Bridge when the API can still read it.
 */
export function nativeConnectionCanObserve(connection: Pick<OpenPresenceState["nativeConnections"][number], "access" | "status" | "observation" | "account">, expectedHandle?: string) {
  const identityMatches = !expectedHandle || Boolean(connection.account?.username && connection.account.username.replace(/^@/, "").trim().toLowerCase() === expectedHandle.replace(/^@/, "").trim().toLowerCase());
  return (connection.access === "read" || connection.access === "read-write")
    && identityMatches
    && (connection.status === "connected" || connection.observation?.status === "up-to-date");
}

function normalizeHandleForComparison(handle?: string) {
  return handle?.replace(/^@/, "").trim().toLowerCase();
}

export function isLaunchCandidate(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || presence.id !== presenceId) return false;
  const footing = presence.context.publicFooting;
  const successfulPost = state.executions.some((execution) => execution.presenceId === presenceId && execution.affordance === "x.post" && execution.status === "succeeded");
  return !successfulPost && (footing?.postsPublished ?? 0) === 0;
}

export function finishPulse(source: OpenPresenceState, presenceId: string, detail: string, lineage?: Pick<LiveEvent, "intentId" | "executionId" | "outcomeId" | "sessionId" | "invocationId" | "sourceObjectId">) {
  const tone: LiveEvent["tone"] = /delivery failed|rejected delivery|could not complete|invalidly sized/i.test(detail) ? "warning" : "positive";
  return recordRuntimeEvent(source, presenceId, "Pulse completed", detail, tone, lineage);
}

const activityModeLabel = (mode: string | undefined) => mode ? mode.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Off";
const activityAffordanceLabel = (affordance: string | undefined) => activityModeLabel(affordance?.split(".").pop());

const relativeSchedule = (value: string | undefined) => {
  if (!value) return undefined;
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta)) return undefined;
  if (delta <= 0) return "due now";
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes >= 2_880) return `in about ${Math.round(minutes / 1_440)} days`;
  if (minutes >= 120) return `in about ${Math.round(minutes / 60)} hours`;
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const considerationTimingLabel = (time: string, value: string) => {
  const [start, end] = value.split(/[–-]/).map((part) => part.trim());
  if (!start || !end) return "flexible consideration";
  if (start === time && end === time) return "exact-time consideration";
  if (start === time) return `flexible consideration through ${end}`;
  return `custom consideration ${start}–${end}`;
};

export function deriveActivitySummary(source: OpenPresenceState, presenceId?: string, options?: { normalized?: boolean }): ActivitySummary {
  const state = options?.normalized ? source : normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  const activitySessionIds = new Set(
    state.playgroundSessions
      .filter((session) => session.presenceId === presence?.id && session.channelId === presence?.channel && session.status !== "completed")
      .map((session) => session.id),
  );
  // Older fixtures represented a live native connection without persisting
  // Presence.environment. Preserve that shape when there is no active
  // Sandbox session, while an explicit Sandbox session remains authoritative.
  const hasNativeRoute = Boolean(presence && state.nativeConnections.some((connection) => connection.presenceId === presence.id && connection.channelId === presence.channel));
  const activityEnvironment: PresenceEnvironment = presence?.environment === "sandbox" && activitySessionIds.size === 0 && hasNativeRoute
    ? "live"
    : presence?.environment ?? "live";
  const isScopedEvent = (item: LiveEvent) => {
    if (!presence || item.presenceId !== presence.id) return !presence;
    if (!growthEvidenceIsInPresenceScope(state, presence.id, item.time)) return false;
    if (activityEnvironment === "sandbox") return !item.sessionId || activitySessionIds.has(item.sessionId);
    return !item.sessionId;
  };
  const isScopedExecution = (item: Execution) => {
    if (!presence || item.presenceId !== presence.id) return !presence;
    if (!growthEvidenceIsInPresenceScope(state, presence.id, item.createdAt)) return false;
    if (activityEnvironment === "sandbox") return item.environment === "sandbox" || (item.sessionId ? activitySessionIds.has(item.sessionId) : false);
    return item.environment !== "sandbox" && !item.sessionId;
  };
  const events = state.events.filter(isScopedEvent);
  const executions = state.executions
    .filter(isScopedExecution)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestExecution = executions[0];
  const latestEvent = events[0];
  const latestEventIsNewerThanExecution = Boolean(latestEvent && (!latestExecution || new Date(latestEvent.time).getTime() > new Date(latestExecution.updatedAt).getTime()));
  const reviewCount = executions.filter((item) => item.status === "awaiting-review").length;
  const pulseEvent = events.find((item) => item.title === "Pulse completed");
  const nativeConnection = activityEnvironment === "live"
    ? state.nativeConnections.find((item) => item.presenceId === presence?.id && item.channelId === presence?.channel)
    : undefined;
  const observation = nativeConnection?.observation;
  const standingSlots = state.calendar
    .filter((slot) => slot.presence === presence?.id && slot.enabled)
    .map((slot) => {
      const dayIndex: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      const [hours, minutes] = slot.time.split(":").map(Number);
      const candidate = new Date();
      const targetDay = dayIndex[slot.day];
      candidate.setDate(candidate.getDate() + ((targetDay - candidate.getDay() + 7) % 7));
      candidate.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
      if (candidate.getTime() <= Date.now() || (slot.lastEvaluatedAt && new Date(slot.lastEvaluatedAt).toDateString() === candidate.toDateString())) candidate.setDate(candidate.getDate() + 7);
      return { slot, nextAt: candidate.getTime() };
    })
    .sort((a, b) => a.nextAt - b.nextAt);
  const nextSlot = standingSlots[0]?.slot;
  const scheduledAssignments = state.assignments
    .filter((assignment) => assignment.presenceId === presence?.id && assignment.schedule && !["completed", "cancelled", "expired_incomplete"].includes(assignment.status))
    .map((assignment) => {
      const dayIndex: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      const [hours, minutes] = assignment.schedule!.time.split(":").map(Number);
      const candidate = new Date();
      const targetDay = dayIndex[assignment.schedule!.day];
      candidate.setDate(candidate.getDate() + ((targetDay - candidate.getDay() + 7) % 7));
      candidate.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
      if (candidate.getTime() <= Date.now()) candidate.setDate(candidate.getDate() + 7);
      return { assignment, nextAt: candidate.getTime() };
    })
    .sort((a, b) => a.nextAt - b.nextAt);
  const nextAssignment = scheduledAssignments[0]?.assignment;
  const activeAssignment = state.assignments.find((assignment) =>
    assignment.presenceId === presence?.id && ["active", "working", "blocked"].includes(assignment.status),
  );
  const continuousGrowthAssignment = state.assignments.find((assignment) => assignment.presenceId === presence?.id && assignment.activation?.type === "continuous" && assignment.successEvidence?.metric === "followers" && !["completed", "cancelled"].includes(assignment.status));

  let current: ActivitySummary["current"] = {
    label: "Waiting for the next meaningful event",
    detail: "Nothing is running right now. Jenny will look again when you check now or an Assignment becomes eligible.",
    tone: "neutral",
  };
  if (!presence) {
    current = { label: "No Presence selected", detail: "Select a Presence to see its operating state.", tone: "neutral" };
  } else if (presence.status === "paused") {
    current = { label: "Asleep", detail: "Jenny is not watching or acting on this channel right now.", tone: "warning" };
  } else if (presence.status === "disconnected") {
    current = { label: "Disconnected", detail: "This Presence cannot observe or embody actions until its channel connection is restored.", tone: "warning" };
  } else if (activeAssignment?.status === "blocked") {
    current = { label: "Assignment blocked", detail: activeAssignment.lastOutcome?.message ?? "Jenny needs a new candidate or operator guidance to continue this Assignment.", tone: "warning" };
  } else if (activeAssignment) {
    const deliverableLabel = activeAssignment.deliverable.type === "original_publication"
      ? "publication"
      : activeAssignment.deliverable.type === "meaningful_engagement"
        ? "meaningful engagement"
        : activeAssignment.deliverable.type.replaceAll("_", " ");
    current = {
      label: activeAssignment.status === "working" ? "Working on assignment" : "Assignment in progress",
      detail: `${activeAssignment.progress.verified} of ${activeAssignment.progress.required} verified ${deliverableLabel}${activeAssignment.progress.required === 1 ? "" : "s"} delivered. Jenny owns how to fulfill the expected outcome.`,
      tone: "positive",
    };
  } else if (reviewCount > 0) {
    current = { label: "Waiting for review", detail: `${reviewCount} social intent${reviewCount === 1 ? "" : "s"} ${reviewCount === 1 ? "is" : "are"} ready for your decision.`, tone: "warning" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Calendar evaluation unavailable") {
    current = { label: "Calendar evaluation unavailable", detail: latestEvent.detail, tone: "warning" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Standing intention held") {
    current = { label: "Waiting for a better moment", detail: latestEvent.detail, tone: "quiet" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Calendar attention started") {
    current = { label: "Evaluating an Assignment", detail: latestEvent.detail, tone: "positive" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Social Mirror updated" && observation?.status === "up-to-date") {
    const next = relativeSchedule(observation.nextObservationAt);
    current = { label: "Watching X", detail: next ? `The Social Mirror is up to date. Next observation ${next}.` : "The Social Mirror is up to date and ready for Jenny's next judgment.", tone: "positive" };
  } else if (latestExecution && ["queued", "claimed", "executing", "approved"].includes(latestExecution.status)) {
    current = { label: "Preparing to act", detail: `${activityAffordanceLabel(latestExecution.affordance)} is moving toward delivery.`, tone: "positive" };
  } else if (latestExecution?.status === "succeeded") {
    current = { label: "Action completed", detail: `The latest ${activityAffordanceLabel(latestExecution.affordance)} was delivered and is visible on the channel.`, tone: "positive" };
  } else if (latestExecution?.status === "failed" && !latestExecution.failure?.reviewedAt) {
    current = { label: "X delivery failed", detail: `${latestExecution.failure?.message ?? "The connector rejected the action."} No external artifact was counted.`, tone: "warning" };
  } else if (observation?.status === "error") {
    current = { label: "X observation failed", detail: observation.error ?? "The connected channel could not be read.", tone: "warning" };
  } else if (observation?.status === "degraded") {
    current = { label: "Watching X with limited coverage", detail: observation.error ?? "The Social Mirror has fresh public history, but some inbound coverage is unavailable.", tone: "warning" };
  } else if (observation?.status === "syncing") {
    current = { label: "Syncing the Social Mirror", detail: "The connector is reconciling X before Jenny makes a judgment.", tone: "positive" };
  } else if (observation?.status === "up-to-date") {
    const next = relativeSchedule(observation.nextObservationAt);
    current = { label: "Watching X", detail: next ? `The Social Mirror is up to date. Next observation ${next}.` : "The Social Mirror is up to date and ready for Jenny's next judgment.", tone: "positive" };
  } else if (events[0]?.title === "X observation failed" || events[1]?.title === "X observation failed") {
    current = { label: "X observation failed", detail: events.find((item) => item.title === "X observation failed")?.detail ?? "The connected channel could not be read.", tone: "warning" };
  } else if (events[0]?.title === "Considering first public move" || events[1]?.title === "Considering first public move") {
    current = { label: "Choosing a first public move", detail: "Jenny found no public footing and is choosing how to arrive from Mission, Taste, and the live X context.", tone: "positive" };
  } else if (events[0]?.title === "Reply observed" || events[1]?.title === "Reply observed") {
    current = { label: "Reply observed", detail: events.find((item) => item.title === "Reply observed")?.detail ?? "A new public reply is now part of the Presence context.", tone: "positive" };
  } else if (events.some((item) => item.title === "Silence was the right action")) {
    current = { label: "Waiting for a better moment", detail: "The last pulse observed activity but found nothing worth forcing into the channel.", tone: "quiet" };
  } else if (nativeConnection?.status === "needs-attention") {
    current = { label: "X connection needs attention", detail: nativeConnection.healthMessage ?? "The account is authenticated, but the last native action or observation was rejected.", tone: "warning" };
  } else if (nativeConnection) {
    current = { label: `Ready to observe ${channelName(presence.channel)}`, detail: "The native channel is connected. Observation begins when you check now or an Assignment becomes eligible.", tone: "positive" };
  }

  const nextAttention = presence?.status === "paused"
    ? { label: "After waking", detail: "Wake up Jenny to resume attention and begin a first check." }
    : nextAssignment
      ? { label: "Next Assignment", detail: `${nextAssignment!.schedule!.day} at ${nextAssignment!.schedule!.time} · ${nextAssignment!.title ?? nextAssignment!.instruction}` }
      : nextSlot
        ? { label: "Legacy calendar entry", detail: `${nextSlot.day} at ${nextSlot.time} · ${nextSlot.label}` }
      : continuousGrowthAssignment
        ? { label: "Continuous Growth", detail: continuousGrowthAssignment.plan?.nextWeeklyReviewAt ? `Next weekly review ${relativeSchedule(continuousGrowthAssignment.plan.nextWeeklyReviewAt) ?? "scheduled"}. The Agent will keep observing while the connected body is healthy.` : "The Agent will continue observing and reviewing this responsibility while the connected body is healthy." }
      : observation?.nextObservationAt
        ? { label: "Next X observation", detail: relativeSchedule(observation.nextObservationAt) ?? "Scheduled by the connected observer." }
        : { label: "On demand", detail: "No automatic scan is scheduled because no observer or Assignment is connected." };
  const nextIntent = nextAssignment
    ? { label: nextAssignment.title ?? nextAssignment.instruction, detail: `${nextAssignment.schedule!.day} at ${nextAssignment.schedule!.time} · ${considerationTimingLabel(nextAssignment.schedule!.time, nextAssignment.schedule!.executionWindow)}` }
    : nextSlot
      ? { label: nextSlot.label, detail: `${nextSlot.day} at ${nextSlot.time} · legacy calendar entry` }
    : continuousGrowthAssignment
      ? { label: "Continuous Growth", detail: "The Agent owns the approach; follower evidence and review timing determine progress." }
      : { label: "No Assignment scheduled", detail: "Schedule is optional; Jenny can still be asked to check the channel now." };
  const rhythm = {
    attention: presence?.status === "paused" ? "Asleep" : nativeConnection ? `Every ${attentionIntervalLabel(presence ?? undefined)}` : "On demand",
    publishing: activityModeLabel(presence?.execution.post),
    replies: activityModeLabel(presence?.execution.reply ?? presence?.execution.comment),
    quietHours: quietHoursLabel(presence?.quietHours),
  };
  const publishingInitiative = derivePublishingProgress(state, presence?.id, new Date(), { normalized: true });
  return { current, lastPulseAt: pulseEvent?.time, nextAttention, nextIntent, needsAttention: { count: reviewCount, label: reviewCount ? "Needs review" : "No review items", detail: reviewCount ? `${reviewCount} action${reviewCount === 1 ? "" : "s"} waiting for approval.` : "Nothing is waiting for your decision." }, rhythm, publishingInitiative, publishingPlan: derivePublishingPlanProjection(state, presence?.id, new Date(), { normalized: true }) };
}

function growthAssignmentFor(source: OpenPresenceState, presenceId: string, assignmentId?: string) {
  const assignments = source.assignments.filter((assignment) => assignment.presenceId === presenceId && assignment.successEvidence?.kind === "metric_threshold" && !["cancelled", "completed"].includes(assignment.status));
  return assignmentId ? assignments.find((assignment) => assignment.id === assignmentId) : assignments.find((assignment) => ["active", "working", "accepted", "planning"].includes(assignment.status)) ?? assignments[0];
}

export function deriveGrowthEvidenceSnapshot(source: OpenPresenceState, presenceId: string): import("./types").GrowthEvidenceSnapshot {
  const state = normalizeState(source);
  const presence = state.presences.find((p) => p.id === presenceId) ?? state.presence;
  const nowDate = new Date();
  const periodDays = 7;
  const windowEnd = nowDate.toISOString();
  const windowStart = growthWindowStartAt(state, presenceId, periodDays, nowDate.getTime());
  const audienceSnapshots = collapseAudienceSnapshots(state.audienceSnapshots.filter((s) => s.presenceId === presenceId && growthEvidenceIsInPresenceScope(state, presenceId, s.observedAt)));
  const publicationSnapshots = state.publicationMetricSnapshots.filter((s) => s.presenceId === presenceId && growthPublicationIsInPresenceScope(state, presenceId, s) && new Date(s.observedAt).getTime() >= new Date(windowStart).getTime());
  const scopedMirror = state.mirrorObjects.filter((m) => m.presenceId === presenceId && m.environment !== "sandbox" && growthEvidenceIsInPresenceScope(state, presenceId, m.occurredAt ?? m.observedAt) && new Date(m.occurredAt ?? m.observedAt).getTime() >= new Date(windowStart).getTime());

  const posts = scopedMirror.filter((m) => m.actorPresenceId === presenceId && m.objectType === "post").length;
  const replies = scopedMirror.filter((m) => m.actorPresenceId === presenceId && m.objectType === "reply").length;
  const quotes = scopedMirror.filter((m) => m.actorPresenceId === presenceId && m.objectType === "quote").length;
  const verifiedExecutions = state.executions.filter((execution) => {
    if (execution.presenceId !== presenceId || execution.status !== "succeeded") return false;
    return growthEvidenceIsInPresenceScope(state, presenceId, execution.createdAt) && new Date(execution.createdAt).getTime() >= new Date(windowStart).getTime();
  });
  const likes = verifiedExecutions.filter((execution) => state.socialIntents.find((intent) => intent.id === execution.socialIntentId)?.affordance === "like").length;
  const follows = verifiedExecutions.filter((execution) => state.socialIntents.find((intent) => intent.id === execution.socialIntentId)?.affordance === "follow").length;
  const totalActions = posts + replies + quotes + likes + follows || scopedMirror.filter((m) => m.actorPresenceId === presenceId).length;

  const deltas = audienceDeltas(state, presenceId);
  const topPostReach = publicationSnapshots.length ? Math.max(...publicationSnapshots.map((s) => s.impressions ?? 0)) : undefined;
  const impressionsList = publicationSnapshots.map((s) => s.impressions).filter((v): v is number => typeof v === "number");
  const medianPostReach = median(impressionsList);
  const repliesWithResponses = scopedMirror.filter((m) => m.actorPresenceId === presenceId && m.objectType === "reply" && scopedMirror.some((child) => child.parentExternalRef?.id === m.externalRef.id)).length;
  const scopedPersonIds = new Set(state.personIdentities.filter((identity) => identity.sourcePresenceId === presenceId && growthEvidenceIsInPresenceScope(state, presenceId, identity.createdAt)).map((identity) => identity.personId));
  const activeRelationships = state.relationships.filter((relationship) => relationship.state === "active" && scopedPersonIds.has(relationship.personId)).length
    || state.people.filter((person) => person.memoryState === "active" && scopedPersonIds.has(person.id)).length;

  const earliestSnapshot = audienceSnapshots.at(-1);
  const daysObserved = earliestSnapshot ? Math.max(1, Math.round((nowDate.getTime() - new Date(earliestSnapshot.observedAt).getTime()) / 86_400_000)) : 1;
  const confidence: "low" | "medium" | "high" = daysObserved >= 7 && audienceSnapshots.length >= 5 ? "high" : daysObserved >= 3 ? "medium" : "low";

  const watermark = presence?.growthEvidenceWatermark ?? (audienceSnapshots.length + publicationSnapshots.length + scopedMirror.length);
  const sourceRefs = [...audienceSnapshots.map((s) => s.id), ...publicationSnapshots.map((s) => s.id), ...scopedMirror.slice(0, 20).map((m) => m.id)];

  return {
    id: id("growth-snapshot"),
    presenceId,
    watermark,
    windowStart,
    windowEnd,
    observedAt: windowEnd,
    sourceRefs,
    metricAvailability: {
      followers: audienceSnapshots.length > 0,
      impressions: publicationSnapshots.length > 0,
      replies: replies > 0,
      likes: likes > 0,
      quotes: quotes > 0,
      follows: follows > 0,
    },
    observedActivity: {
      posts,
      replies,
      quotes,
      likes,
      follows,
      totalActions,
    },
    observedOutcomes: {
      currentFollowers: deltas.current,
      followerDelta: deltas.sevenDay ?? deltas.daily,
      topPostReach,
      medianPostReach,
      repliesWithResponses,
      activeRelationships,
    },
    baselineMaturity: {
      daysObserved,
      periodTargetDays: 7,
      confidence,
    },
  };
}

function applyGrowthInterpretation(state: OpenPresenceState, assignment: Assignment, review: import("./types").GrowthReview, revision?: import("./types").GrowthRevision) {
  const file = state.files.find((item) => item.kind === "GROWTH");
  const plan = revision?.plan ?? assignment.plan;
  if (!file || !plan) return;
  const presence = state.presences.find((item) => item.id === assignment.presenceId);
  const scope = `${presence?.channel ?? assignment.channelId}`;
  const audience = audienceDeltas(state, assignment.presenceId);
  const lines = [
    "# GROWTH.md",
    "",
    "_Strategic interpretation of observed evidence. Metrics remain in structured history._",
    "",
    `## Responsibility\n\n${assignment.instruction}`,
    `\n## Scope\n\n${scope}`,
    `\n## Current progress\n\n${audience.current === undefined ? "Follower count has not been observed yet." : `${audience.current.toLocaleString()} followers${audience.twentyEightDay === undefined ? "" : ` · ${audience.twentyEightDay >= 0 ? "+" : ""}${audience.twentyEightDay} over 28 days`}.`}`,
    `\n## Current approach\n\n${plan.summary}\n\n${plan.publishingApproach.map((item) => `- ${item}`).join("\n")}`,
    `\n## What appears to be working\n\n${review.working.length ? review.working.map((item) => `- ${item}`).join("\n") : "- Not enough evidence yet."}`,
    `\n## Uncertain\n\n${review.uncertain.length ? review.uncertain.map((item) => `- ${item}`).join("\n") : "- No open uncertainty was recorded in this review."}`,
    `\n## What appears weak\n\n${review.weak.length ? review.weak.map((item) => `- ${item}`).join("\n") : "- No weak pattern was strong enough to record."}`,
    `\n## Latest review\n\n${review.summary}`,
    `\n_Next weekly review: ${plan.nextWeeklyReviewAt ? new Date(plan.nextWeeklyReviewAt).toLocaleDateString() : "not scheduled"}. Next strategic review: ${plan.nextStrategicReviewAt ? new Date(plan.nextStrategicReviewAt).toLocaleDateString() : "not scheduled"}._`,
  ].join("\n");
  if (file.content !== lines) {
    const before = file.content;
    const timestamp = now();
    const versions = state.growthFileVersions ?? [];
    if (!versions.some((item) => item.version === file.revision && item.presenceId === assignment.presenceId)) {
      versions.unshift({ version: file.revision, content: before, presenceId: assignment.presenceId, scope, changeSummary: "Previous GROWTH.md version retained before evidence review.", createdAt: timestamp });
    }
    file.content = lines;
    file.revision += 1;
    file.updatedAt = timestamp;
    versions.unshift({ version: file.revision, previousVersion: file.revision - 1, content: lines, presenceId: assignment.presenceId, scope, reviewId: review.id, reviewSource: review.reviewSource, changeSummary: review.planChangeSummary ?? "Updated the strategic interpretation from the latest evidence review.", createdAt: timestamp });
    state.growthFileVersions = versions.slice(0, 24);
    review.growthFileRevision = file.revision;
    recordChangeSet(state, "Update GROWTH.md from evidence review", [{ path: "agentFiles.GROWTH", action: "update", before, after: lines }], undefined, assignment.presenceId);
  }
}

export function createGrowthReview(source: OpenPresenceState, assignment: Assignment, kind: import("./types").GrowthReviewKind, modelDecision?: import("./types").GrowthReviewDecision, evidenceSnapshot?: import("./types").GrowthEvidenceSnapshot) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((p) => p.id === assignment.presenceId) ?? state.presence;
  const nowDate = new Date();
  const periodDays = kind === "strategic" ? 28 : 7;
  const periodEnd = nowDate.toISOString();
  const periodStart = growthWindowStartAt(state, assignment.presenceId, periodDays, nowDate.getTime());

  const snapshot = evidenceSnapshot ?? deriveGrowthEvidenceSnapshot(state, assignment.presenceId);
  const recent = state.growthReviews.find((item) => item.assignmentId === assignment.id && item.kind === kind && Date.now() - new Date(item.createdAt).getTime() < 86_400_000);
  const currentEvidenceIds = new Set(snapshot.sourceRefs);
  const hasNewEvidence = recent ? [...currentEvidenceIds].some((evidenceId) => !(recent.evidenceIds ?? []).includes(evidenceId)) : false;
  if (recent && !hasNewEvidence && !modelDecision) return state;

  const snapshots = state.growthEvidenceSnapshots ?? [];
  snapshots.unshift(snapshot);
  state.growthEvidenceSnapshots = snapshots.slice(0, 50);

  const previousGrowthRevisionRef = presence?.activeGrowthRevisionRef;
  const audienceSnapshots = collapseAudienceSnapshots(state.audienceSnapshots.filter((s) => s.presenceId === assignment.presenceId && growthEvidenceIsInPresenceScope(state, assignment.presenceId, s.observedAt)));
  const recentMetrics = state.publicationMetricSnapshots.filter((s) => s.presenceId === assignment.presenceId && growthPublicationIsInPresenceScope(state, assignment.presenceId, s) && new Date(s.observedAt).getTime() >= new Date(periodStart).getTime());

  const deltas = audienceDeltas(state, assignment.presenceId);
  const working: string[] = [];
  const uncertain: string[] = [];
  const weak: string[] = [];

  if (deltas[`${periodDays === 7 ? "sevenDay" : "twentyEightDay"}` as "sevenDay" | "twentyEightDay"] !== undefined) {
    const delta = deltas[periodDays === 7 ? "sevenDay" : "twentyEightDay"]!;
    if (delta > 0) working.push(`The account gained ${delta.toLocaleString()} followers during this review window.`);
    else if (delta < 0) weak.push(`The account lost ${Math.abs(delta).toLocaleString()} followers during this review window.`);
    else uncertain.push("Follower count was flat during this review window.");
  } else uncertain.push("There is not enough historical follower evidence to judge movement yet.");

  const strongMetricCount = recentMetrics.filter((item) => Object.values(item.baseline?.relative ?? {}).some((value) => value >= 1.5)).length;
  const weakMetricCount = recentMetrics.filter((item) => Object.values(item.baseline?.relative ?? {}).some((value) => value <= 0.75)).length;
  if (strongMetricCount) working.push(`${strongMetricCount} recent publication${strongMetricCount === 1 ? "" : "s"} showed at least one metric at or above 1.5× its comparable baseline.`);
  if (weakMetricCount) weak.push(`${weakMetricCount} recent publication${weakMetricCount === 1 ? "" : "s"} showed at least one metric at or below 0.75× its comparable baseline.`);
  if (!recentMetrics.length) uncertain.push("No publication-performance snapshots were available for this review.");

  const summary = modelDecision?.summary ?? `${kind === "strategic" ? "Strategic" : kind === "event_driven" ? "Reconsideration" : "Weekly"} review completed from ${snapshot.sourceRefs.length} evidence sources. The current approach remains active unless repeated evidence justifies a change.`;
  const reviewedWorking = modelDecision?.working?.length ? modelDecision.working : working;
  const reviewedUncertain = modelDecision?.uncertain?.length ? modelDecision.uncertain : uncertain;
  const reviewedWeak = modelDecision?.weak?.length ? modelDecision.weak : weak;

  const persistedAssignment = state.assignments.find((item) => item.id === assignment.id);
  const strategyChanged = modelDecision?.strategyChanged !== undefined ? modelDecision.strategyChanged : Boolean(modelDecision?.plan && Object.keys(modelDecision.plan).length > 0);
  let changedPlan = false;
  let planChangeSummary: string | undefined;
  let newRevision: import("./types").GrowthRevision | undefined;

  const reviewId = id("growth-review");

  if (strategyChanged && modelDecision?.plan && persistedAssignment?.plan) {
    const proposedPlan: AssignmentPlan = {
      ...persistedAssignment.plan,
      ...modelDecision.plan,
      id: id("assignment-plan"),
      assignmentId: persistedAssignment.id,
      revision: (persistedAssignment.plan.revision ?? 0) + 1,
      source: "agent",
      createdAt: periodEnd,
      updatedAt: periodEnd,
      nextWeeklyReviewAt: new Date(nowDate.getTime() + 7 * 86_400_000).toISOString(),
      nextStrategicReviewAt: new Date(nowDate.getTime() + 28 * 86_400_000).toISOString(),
    };
    const beforePlan = JSON.stringify(persistedAssignment.plan);
    const afterPlan = JSON.stringify(proposedPlan);
    if (beforePlan !== afterPlan) {
      persistedAssignment.planHistory = [...(persistedAssignment.planHistory ?? []), proposedPlan];
      persistedAssignment.plan = proposedPlan;
      persistedAssignment.revision = (persistedAssignment.revision ?? 0) + 1;
      persistedAssignment.updatedAt = periodEnd;
      changedPlan = true;
      planChangeSummary = modelDecision.rationale ?? "The model-backed Growth Review revised the operating approach from observed evidence.";

      const revisionId = `growth_revision_${persistedAssignment.revision}`;
      newRevision = {
        id: revisionId,
        presenceId: assignment.presenceId,
        assignmentId: assignment.id,
        plan: proposedPlan,
        createdAt: periodEnd,
        previousRevisionRef: previousGrowthRevisionRef,
        causedByReviewRef: reviewId,
      };
      const revisions = state.growthRevisions ?? [];
      revisions.unshift(newRevision);
      state.growthRevisions = revisions.slice(0, 50);
      if (presence) presence.activeGrowthRevisionRef = revisionId;
    }
  }

  if (persistedAssignment?.plan && !changedPlan) {
    const nextReviewAt = new Date(nowDate.getTime() + 7 * 86_400_000).toISOString();
    const nextStrategicAt = new Date(nowDate.getTime() + 28 * 86_400_000).toISOString();
    persistedAssignment.plan = { ...persistedAssignment.plan, nextWeeklyReviewAt: nextReviewAt, nextStrategicReviewAt: nextStrategicAt, updatedAt: periodEnd };
    assignment.plan = persistedAssignment.plan;
  }

  if (presence) {
    presence.lastTriagedEvidenceWatermark = snapshot.watermark;
  }

  const review: import("./types").GrowthReview = {
    id: reviewId,
    assignmentId: assignment.id,
    presenceId: assignment.presenceId,
    kind,
    periodStart,
    periodEnd,
    summary,
    working: reviewedWorking,
    uncertain: reviewedUncertain,
    weak: reviewedWeak,
    changedPlan,
    strategyChanged: changedPlan,
    evidenceSnapshotId: snapshot.id,
    previousGrowthRevisionRef,
    resultingGrowthRevisionRef: newRevision?.id,
    planChangeSummary,
    assignmentPlanRevision: persistedAssignment?.plan?.revision ?? assignment.plan?.revision,
    evidenceIds: snapshot.sourceRefs,
    createdAt: periodEnd,
    reviewSource: modelDecision ? "model" : "deterministic",
  };

  applyGrowthInterpretation(state, persistedAssignment ?? assignment, review, newRevision);
  state.growthReviews.unshift(review);
  return state;
}

const attentionIntervalLabel = (presence: Presence | undefined) => {
  if (!presence || presence.pacing === "recommended") return "5 min";
  if (presence.pacing === "gentle") return "15 min";
  return `${Math.max(5, Math.min(120, presence.attentionIntervalMinutes || 30))} min`;
};

export const quietHoursLabel = (quietHours: PresenceQuietHours | undefined) =>
  quietHours?.enabled ? `${quietHours.start}–${quietHours.end}` : "Off";

export const emptyGhostRepresentation = (): GhostRepresentation => ({ kind: "individual", individual: { firstName: "", middleName: "", lastName: "" }, organization: { name: "", website: "" } });

export function formatGhostRepresentation(representation?: GhostRepresentation, legacySubject?: string) {
  if (representation?.kind === "organization") return representation.organization.name.trim();
  if (representation?.kind === "individual") return [representation.individual.firstName, representation.individual.middleName, representation.individual.lastName].map((item) => item.trim()).filter(Boolean).join(" ");
  return legacySubject?.trim() ?? "";
}

function normalizeGhostRepresentation(value?: Partial<GhostRepresentation>): GhostRepresentation {
  return {
    kind: value?.kind === "organization" ? "organization" : "individual",
    individual: {
      firstName: value?.individual?.firstName?.trim() ?? "",
      middleName: value?.individual?.middleName?.trim() ?? "",
      lastName: value?.individual?.lastName?.trim() ?? "",
    },
    organization: {
      name: value?.organization?.name?.trim() ?? "",
      website: value?.organization?.website?.trim() ?? "",
    },
  };
}

export function normalizeGhostProfile(value?: Partial<GhostProfile>) {
  if (!value) return undefined;
  const representation = normalizeGhostRepresentation(value.representation);
  const formatted = formatGhostRepresentation(representation);
  return {
    subject: value.representation ? formatted || value.subject?.trim() || "Me / my organization" : value.subject?.trim() || "Me / my organization",
    representation,
    priorities: value.priorities?.trim() ?? "",
    preferences: value.preferences?.trim() ?? "",
    voice: value.voice?.trim() ?? "",
    boundaries: value.boundaries?.trim() ?? "",
  } satisfies GhostProfile;
}

const defaultGhostProfile = (): GhostProfile => ({ subject: "Me / my organization", representation: emptyGhostRepresentation(), priorities: "", preferences: "", voice: "", boundaries: "" });
export const defaultPublicSelf = (displayName: string, mode: "agent" | "ghost"): PublicSelf => ({ displayName, posture: mode === "ghost" ? "representational" : "contextual", approvedTechnicalFacts: [] });
export const PUBLIC_TECHNICAL_FACT_LABELS: Record<PublicTechnicalFact, string> = { "ai-presence": "This is an AI presence", "open-source": "Open source", "built-with-openpresence": "Built with OpenPresence", "model-provider": "Current model provider", "exact-model": "Exact model", tools: "Tools used" };

export function publicSelfGuidance(presence: Presence): string {
  const posture = presence.publicSelf?.posture ?? defaultPublicSelf(presence.name, presence.mode).posture;
  const facts = (presence.publicSelf?.approvedTechnicalFacts ?? []).map((fact) => PUBLIC_TECHNICAL_FACT_LABELS[fact]).join(", ") || "none";
  const representedIdentity = presence.mode === "ghost" ? formatGhostRepresentation(presence.ghostProfile?.representation, presence.ghostProfile?.subject) || "not defined yet" : "";
  const postureGuidance: Record<PublicDisclosurePosture, string> = {
    contextual: "Answer from this Presence's interests, point of view, and purpose. Acknowledge AI only when relevant.",
    "ai-forward": "It is acceptable to be direct that this is an AI presence when relevant, while keeping implementation details private.",
    private: "Keep technical identity private. Answer socially from the Presence without volunteering AI or implementation details.",
    representational: "Speak as the represented person or organization. Do not collapse this public self into the private Agent behind it.",
    "open-about-assistance": "Speak as the represented person or organization, and acknowledge AI assistance when relevant without exposing private machinery.",
  };
  const identityContinuity = presence.mode === "agent"
    ? `\nIDENTITY CONTINUITY\nThis Agent-owned Presence is you, not another person you manage, observe, address, or describe. ${presence.name} and ${presence.handle} are your own public name and account. When social-world content uses those aliases—or “the agent” or she/her when they refer to this Public Self—understand them as references to yourself. In your own expression, use first person (I/me/my) for this Public Self. Never mention your own name or @handle as though summoning someone else, and never switch to third person to comment on yourself.`
    : "";
  return `PUBLIC SELF BOUNDARY\nThis Presence appears publicly as ${presence.name}. ${postureGuidance[posture]}${presence.mode === "ghost" ? `\nRepresented identity: ${representedIdentity}.` : ""}${identityContinuity}\nApproved technical facts that may be disclosed when relevant: ${facts}. Never invent or volunteer unapproved implementation details.`;
}

export function identityLeakageReason(state: OpenPresenceState, presence: Presence, text: string): string | undefined {
  if (presence.mode !== "ghost") return undefined;
  const approved = new Set(presence.publicSelf?.approvedTechnicalFacts ?? []);
  const agentName = state.agent?.name?.trim();
  if (agentName && agentName.toLowerCase() !== presence.name.toLowerCase() && new RegExp(`\\b${agentName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(text)) return `This Ghost draft names the private Agent identity (${agentName}).`;
  const selfReference = "(?:I|we|my|our|this\\s+(?:account|presence|agent)|the\\s+(?:account|presence|agent))";
  const selfReferenceWindow = `(?:${selfReference}[^.!?]{0,100})`;
  const platformTerms = "(?:OpenPresence)";
  const providerTerms = "(?:OpenAI|Anthropic|OpenRouter|Ollama|model provider|provider)";
  const modelTerms = "(?:GPT[- ]?\\w+|Claude|(?:current|selected|exact|underlying)\\s+model\\b|model\\s+(?:provider|name|version|runtime)\\b)";
  const toolTerms = "(?:system prompt|credentials?|API key|database|tool registry|worker topology|implementation details?|internal machinery|private machinery|how (?:this|the account) works)";
  const implementationTerms = [
    !approved.has("built-with-openpresence") && `(?:${selfReferenceWindow}(?:am|are|is|was|were|built|made|powered|hosted|run|runs|operate|operates|connected|configured)[^.!?]{0,100}${platformTerms}|${platformTerms}[^.!?]{0,100}(?:powers|runs|hosts|operates)\\s+(?:this|the)\\s+(?:account|presence|agent))`,
    !approved.has("model-provider") && `(?:${selfReferenceWindow}(?:am|are|is|use|uses|run|runs|rely|relies|powered|built|hosted|connected|configured|work|works|operate|operates)[^.!?]{0,100}${providerTerms}|${providerTerms}[^.!?]{0,100}(?:powers|runs|drives|operates)\\s+(?:this|the)\\s+(?:account|presence|agent))`,
    !approved.has("exact-model") && `(?:${selfReferenceWindow}(?:use|uses|run|runs|rely|relies|select|selects|selected|configured|work|works|operate|operates)[^.!?]{0,100}${modelTerms}|${modelTerms}[^.!?]{0,100}(?:powers|runs|drives|operates)\\s+(?:this|the)\\s+(?:account|presence|agent))`,
    !approved.has("tools") && `${selfReferenceWindow}[^.!?]{0,100}${toolTerms}`,
  ].filter(Boolean).join("|");
  return implementationTerms && new RegExp(implementationTerms, "i").test(text) ? "This Ghost draft includes implementation details that are not approved for public disclosure." : undefined;
}

function defaultPresenceRequestPolicy(presenceId: string, updatedAt = now()): import("./types").PresenceRequestPolicy {
  return { presenceId, access: "nobody", allowedRequestTypes: ["answer", "research", "recommendation"], requireDirectAddress: true, acceptance: "operator_review", impactLimit: "low", updatedAt };
}
function makeEnvelope(presenceId: string, capabilities: { id: string }[], execution: Record<string, import("./types").ExecutionMode>): ExecutionEnvelope { return { presenceId, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? "off" }])), pacingProfile: "recommended", accountProtection: "guidance" }; }
function makePresence(input: CreatePresenceInput, displayName = input.name?.trim() || input.handle, definition?: ChannelDefinition, brief = defaultPresenceBrief()): Presence {
  const presenceId = id("presence");
  const capabilities = definition?.affordances ?? CHANNEL_CAPABILITIES[input.channel as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const execution = Object.fromEntries(capabilities.map((capability) => [capability.id, capability.id === "post" ? "auto" : capability.id === "reply" || capability.id === "comment" ? "review" : "off"])) as Presence["execution"];
  const name = displayName.trim() || input.handle.trim();
  const publicSelf = defaultPublicSelf(name, input.mode);
  const context: PresenceContext = { presenceId, channel: input.channel, publicIdentity: { displayName: name, handle: input.handle.trim(), mode: input.mode }, publicSelf, brief, audienceContext: brief.audience, voiceAdaptation: `Adapt the Agent's point of view to ${channelName(input.channel)} without flattening it.`, availableAffordances: capabilities.map((item) => item.id) };
  const connectionMode: PresenceConnectionMode = input.connectionMode ?? (input.channel === "x" ? "native" : "bridge");
  const publishingInitiative = defaultPublishingInitiative();
  const presence = { id: presenceId, createdAt: now(), channel: input.channel, name, handle: input.handle.trim(), mode: input.mode, status: "live" as const, accent: input.accent, avatarLook: input.avatarLook ?? defaultAvatarLook(input.channel), capabilities, execution, executionEnvelope: makeEnvelope(presenceId, capabilities, execution), context, brief, publicSelf, mediaPerceptionPolicy: input.mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const, language: DEFAULT_PRESENCE_LANGUAGE, languagePolicy: { ...EMPTY_LANGUAGE_POLICY }, ghostProfile: input.mode === "ghost" ? defaultGhostProfile() : undefined, pacing: "recommended" as const, attentionIntervalMinutes: 5, quietHours: { enabled: false, start: "22:00", end: "07:00" }, publishingInitiative, selfDirectedAttention: defaultSelfDirectedAttentionPolicy(), requestPolicy: defaultPresenceRequestPolicy(presenceId), accountHealth: "healthy" as const, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, connectionMode, browserAccess: { enabled: false }, conversationStyleId: DEFAULT_CONVERSATION_STYLE_ID };
  presence.context = compilePresenceContext(presence);
  return presence;
}

function makeConversation(): import("./types").Conversation { const timestamp = now(); return { id: id("conversation"), title: "New conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] }; }

// A punctuation or symbol-only turn does not contain enough semantic content
// to justify an operator-facing teaching response. Treat it as a possible
// conversational signal, not as an invitation to start generic onboarding.
export function isLowInformationCue(content: string) {
  return /^[\p{P}\p{S}\s]+$/u.test(content.trim());
}
const DEFAULT_MODEL = { provider: "openai" as const, model: "gpt-5.6-luna", quality: "medium" as const };

function defaultModel(agentId: string): AgentModelProfile { return { id: id("model"), agentId, ...DEFAULT_MODEL, capabilities: { vision: true, toolCalling: true, structuredOutput: true, streaming: true }, updatedAt: now() }; }
function defaultBindings(agentId: string): AgentToolBinding[] { return ["web.search", "evidence.search", "asset.inspect", "chart.render", "channel.execute"].map((toolId) => ({ id: id("binding"), agentId, toolId, enabled: true })); }
function defaultSkills(): import("./types").Skill[] {
  return [
    { id: "research-to-thread", name: "Research to thread", description: "Turn a source into a clear social thread.", channels: ["x", "linkedin"], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.thread", "linkedin.post"] },
    { id: "data-story", name: "Data story", description: "Turn evidence into a useful visual story.", channels: ["x", "linkedin"], requiresTools: ["asset.inspect", "chart.render"], compatibleFormats: ["x.media-post", "linkedin.image-post"] },
    { id: "evidence-led-visual-storytelling", name: "Evidence-led visual storytelling", description: "Start from a concrete observation or idea, identify what evidence would materially support it, choose the visual role that fits this Presence, and keep the expression, source, perception, and uncertainty aligned. Use no asset when none performs the intended role.", channels: ["x", "linkedin", "substack"], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.media-post", "x.long-post", "linkedin.image-post", "substack.article"] },
  ];
}

export function createAgent(input: CreateAgentInput): OpenPresenceState {
  const agent = { id: id("agent"), name: input.name.trim(), description: input.description.trim(), audience: input.audience?.trim() || "builders and curious operators", topics: ["AI agents", "software", "useful ideas"], accent: input.accent, glyph: "◉", languagePolicy: { ...EMPTY_LANGUAGE_POLICY }, conversationStyleId: DEFAULT_CONVERSATION_STYLE_ID };
  const definitions = builtinChannelDefinitions();
  const presence = makePresence({ channel: "x", handle: input.handle.trim() || `@${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`, mode: input.mode, accent: input.accent, connectionMode: "sandbox" }, agent.name, definitions[0], defaultPresenceBrief(agent));
  const conversation = makeConversation();
  const skills = defaultSkills();
  const environment = makeSandboxEnvironment(presence);
  const builtins = builtinScenarioDefinitions(agent.id, presence.channel);
  return { ...initialState(), onboarded: true, agent, agents: [agent], activeAgentId: agent.id, presence, presences: [presence], activePresenceId: presence.id, files: makeFiles(input, presence), modelProfiles: [defaultModel(agent.id)], providerConnections: [{ id: id("connection"), provider: "openai", label: "OpenAI", status: "needs-configuration", createdAt: now() }], toolBindings: defaultBindings(agent.id), conversations: [conversation], activeConversationId: conversation.id, channelDefinitions: definitions, sandboxEnvironments: [environment], skills, agentSkills: skills.map((skill) => ({ id: id("agent-skill"), agentId: agent.id, skillId: skill.id, enabled: true })), scenarios: builtins.map((item) => item.scenario), scenarioVersions: builtins.map((item) => item.version), events: [event("system", `${agent.name} is live`, `Your ${input.mode === "ghost" ? "Ghost " : "agent-owned "}Presence is ready on X.`, "positive")] };
}

function makeSandboxEnvironment(presence: Presence): SandboxEnvironment {
  const timestamp = now();
  return { id: id("sandbox"), presenceId: presence.id, channelId: presence.channel, connectorId: `sandbox-connector:${presence.id}`, status: "ready", createdAt: timestamp, updatedAt: timestamp };
}

export function cloneState(source: OpenPresenceState) { return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState); }

function scenarioVersionFor(state: OpenPresenceState, scenarioId: string, versionId?: string) {
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("That Scenario no longer exists.");
  const version = state.scenarioVersions.find((item) => item.id === (versionId ?? scenario.currentVersionId) && item.scenarioId === scenario.id);
  if (!version) throw new Error("That Scenario version is unavailable.");
  return { scenario, version };
}

function scenarioEditContext(state: OpenPresenceState, scenarioId: string) {
  const { scenario, version } = scenarioVersionFor(state, scenarioId);
  if (scenario.ownerScope === "system") throw new Error("Built-in Scenarios cannot be edited.");
  if (scenario.agentId && scenario.agentId !== state.agent?.id) throw new Error("That Scenario belongs to a different Agent.");
  if (scenario.ownerScope === "presence" && scenario.presenceId !== state.presence?.id) throw new Error("That Scenario belongs to a different Presence.");
  return { scenario, version };
}

function saveScenarioEvents(source: OpenPresenceState, scenarioId: string, stimuli: ScenarioStimulus[], requirements?: ScenarioStimulusRequirements, detail = "Scenario events updated") {
  const state = cloneState(source);
  const { scenario, version } = scenarioEditContext(state, scenarioId);
  if (!stimuli.length) throw new Error("Add at least one concrete world event before saving.");
  const normalizedStimuli = stimuli.map((item, index) => ({ ...item, sequence: index + 1, origin: item.origin ?? "operator", trust: "untrusted_world_content" as const, fidelity: "verified" as const }));
  const nextVersion: ScenarioVersion = { ...version, id: id("scenario-version"), version: version.version + 1, worldSpec: { ...version.worldSpec, stimuli: normalizedStimuli, stimulusRequirements: requirements ?? version.worldSpec.stimulusRequirements }, createdAt: now() };
  nextVersion.fidelity = validateScenarioFidelity(nextVersion);
  const hasPlaceholder = normalizedStimuli.some((item) => item.content.trim() === scenario.description.trim() || item.content.trim().length < 12);
  nextVersion.generationStatus = hasPlaceholder ? "failed" : "ready";
  nextVersion.generationError = nextVersion.generationStatus === "failed" ? "The compiler produced a placeholder instead of a concrete world event." : undefined;
  state.scenarioVersions.unshift(nextVersion);
  state.scenarios = state.scenarios.map((item) => item.id === scenario.id ? { ...item, currentVersionId: nextVersion.id, updatedAt: nextVersion.createdAt } : item);
  state.events.unshift(event("system", detail, `${scenario.title} now has ${normalizedStimuli.length} concrete world event${normalizedStimuli.length === 1 ? "" : "s"}.`, "neutral", { presenceId: scenario.presenceId ?? state.presence?.id }));
  return state;
}

function scenarioProvenance(state: OpenPresenceState, scenario: Scenario, version: ScenarioVersion, presence: Presence, session: PlaygroundSession): ScenarioRunProvenance {
  const model = state.modelProfiles.find((item) => item.agentId === state.agent?.id);
  const meaningRevisions: Partial<Record<FileKind, number>> = {};
  const meaningHashes: Partial<Record<FileKind, string>> = {};
  for (const file of state.files) {
    meaningRevisions[file.kind] = file.revision;
    meaningHashes[file.kind] = stableHash(file.content);
  }
  const definition = state.channelDefinitions.find((item) => item.id === presence.channel);
  return { id: id("scenario-provenance"), agentId: state.agent?.id ?? scenario.agentId ?? "", presenceId: presence.id, channelId: presence.channel, scenarioId: scenario.id, scenarioVersionId: version.id, model: model ? { provider: model.provider, model: model.model, quality: model.quality } : undefined, meaningRevisions, meaningHashes, presenceContextHash: stableHash(presence.context), executionEnvelopeHash: stableHash(presence.executionEnvelope), channelDefinitionHash: stableHash(definition), runtimeVersion: "scenario-runs-v1", virtualClockOrigin: session.virtualNow, createdAt: now() };
}

export function createScenarioFromPrompt(source: OpenPresenceState, prompt: string, presenceId?: string) {
  const state = cloneState(source);
  if (!state.agent) throw new Error("Create an Agent before creating a Scenario.");
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) throw new Error("Choose a Presence before creating a Scenario.");
  const built = buildScenarioFromPrompt(prompt, presence.channel, state.agent.id, presence.id);
  state.scenarios.unshift(built.scenario);
  state.scenarioVersions.unshift(built.version);
  state.events.unshift(event("system", "Scenario created", `${built.scenario.title} is ready to review before starting a Sandbox Run.`, "positive", { presenceId: presence.id }));
  return state;
}

export function importScenarioDefinition(source: OpenPresenceState, payload: unknown, presenceId?: string) {
  const state = cloneState(source);
  if (!state.agent) throw new Error("Create an Agent before importing a Scenario.");
  const agentId = state.agent.id;
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) throw new Error("Choose a Presence before importing a Scenario.");
  const built = scenarioFromImport(payload, agentId, presence.channel, presence.id);
  state.scenarios.unshift(built.scenario);
  state.scenarioVersions.unshift(built.version);
  state.events.unshift(event("system", "Scenario imported", `${built.scenario.title} is available for Sandbox rehearsal.`, "positive", { presenceId: presence.id }));
  return state;
}

export function updateScenarioEvents(source: OpenPresenceState, scenarioId: string, stimuli: ScenarioStimulus[]) {
  return saveScenarioEvents(source, scenarioId, stimuli, undefined, "Scenario events updated");
}

export function updateScenarioRequirements(source: OpenPresenceState, scenarioId: string, requirements: ScenarioStimulusRequirements) {
  const state = cloneState(source);
  const { version } = scenarioEditContext(state, scenarioId);
  return saveScenarioEvents(state, scenarioId, version.worldSpec.stimuli, requirements, "Scenario requirements updated");
}

export function generateMissingScenarioEvents(source: OpenPresenceState, scenarioId: string) {
  const state = cloneState(source);
  const { scenario, version } = scenarioEditContext(state, scenarioId);
  const presence = state.presences.find((item) => item.id === scenario.presenceId) ?? state.presence;
  if (!presence || !state.agent) throw new Error("Choose an Agent and Presence before generating Scenario events.");
  const requirements = version.worldSpec.stimulusRequirements ?? {};
  const repaired = repairScenarioStimuli(scenario.description, presence.channel, state.agent.id, presence.id, version.worldSpec.stimuli, requirements);
  return saveScenarioEvents(state, scenarioId, repaired, requirements, "Scenario events generated");
}

export function renameScenario(source: OpenPresenceState, scenarioId: string, title: string) {
  const state = cloneState(source);
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("That Scenario no longer exists.");
  if (scenario.ownerScope === "system") throw new Error("Built-in Scenarios cannot be renamed.");
  if (scenario.agentId && scenario.agentId !== state.agent?.id) throw new Error("That Scenario belongs to a different Agent.");
  if (scenario.ownerScope === "presence" && scenario.presenceId !== state.presence?.id) throw new Error("That Scenario belongs to a different Presence.");
  const nextTitle = title.trim();
  if (!nextTitle) throw new Error("Give the Scenario a name before saving it.");
  if (nextTitle.length > 120) throw new Error("Scenario names must be 120 characters or fewer.");
  if (nextTitle === scenario.title) return state;
  const updatedAt = now();
  state.scenarios = state.scenarios.map((item) => item.id === scenario.id ? { ...item, title: nextTitle, updatedAt } : item);
  state.events.unshift(event("system", "Scenario renamed", `${scenario.title} was renamed to ${nextTitle}.`, "neutral", { presenceId: scenario.presenceId ?? state.presence?.id }));
  return state;
}

export function deleteScenario(source: OpenPresenceState, scenarioId: string) {
  const state = cloneState(source);
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("That Scenario no longer exists.");
  if (scenario.ownerScope === "system") throw new Error("Built-in Scenarios cannot be deleted.");
  if (scenario.agentId && scenario.agentId !== state.agent?.id) throw new Error("That Scenario belongs to a different Agent.");
  if (scenario.ownerScope === "presence" && scenario.presenceId !== state.presence?.id) throw new Error("That Scenario belongs to a different Presence.");

  const runs = state.scenarioRuns.filter((run) => run.scenarioId === scenario.id);
  if (runs.some((run) => run.status === "active")) throw new Error("Stop the active Scenario Run before deleting this Scenario.");
  const runIds = new Set(runs.map((run) => run.id));
  const provenanceIds = new Set(runs.map((run) => run.provenanceId));
  const sessionIds = new Set(runs.map((run) => run.playgroundSessionId));

  state.scenarios = state.scenarios.filter((item) => item.id !== scenario.id);
  state.scenarioVersions = state.scenarioVersions.filter((version) => version.scenarioId !== scenario.id);
  state.scenarioRuns = state.scenarioRuns.filter((run) => !runIds.has(run.id));
  state.scenarioRunProvenance = state.scenarioRunProvenance.filter((item) => !provenanceIds.has(item.id));
  state.scenarioEvaluations = state.scenarioEvaluations.filter((item) => !runIds.has(item.runId));
  state.playgroundSessions = state.playgroundSessions.filter((session) => !sessionIds.has(session.id));
  state.mirrorObjects = state.mirrorObjects.filter((object) => !sessionIds.has(object.sessionId ?? ""));
  state.mirrorEvents = state.mirrorEvents.filter((eventRecord) => !sessionIds.has(eventRecord.sessionId ?? ""));
  state.events = state.events.filter((item) => !sessionIds.has(item.sessionId ?? ""));
  state.sandboxActors = state.sandboxActors.filter((actor) => !sessionIds.has(actor.sessionId));
  state.assets = state.assets.filter((asset) => !sessionIds.has(asset.sessionId ?? ""));
  state.perceptions = state.perceptions.filter((perception) => !sessionIds.has(perception.sessionId ?? ""));
  state.socialIntents = state.socialIntents.filter((intent) => !sessionIds.has(intent.sessionId ?? ""));
  state.publications = state.publications.filter((publication) => !sessionIds.has(publication.sessionId ?? ""));
  state.executions = state.executions.filter((execution) => !sessionIds.has(execution.sessionId ?? ""));
  state.outcomes = state.outcomes.filter((outcome) => !sessionIds.has(outcome.sessionId ?? ""));
  state.preferenceEvidence = state.preferenceEvidence.filter((item) => !sessionIds.has(item.sessionId));
  state.originalPostRehearsals = state.originalPostRehearsals.filter((item) => !sessionIds.has(item.sessionId));
  state.assignments = state.assignments.filter((item) => !sessionIds.has(item.sessionId ?? ""));
  state.networkSearches = state.networkSearches.filter((item) => !sessionIds.has(item.sessionId));
  state.networkIntroductions = state.networkIntroductions.filter((item) => !sessionIds.has(item.sessionId));
  state.events.unshift(event("system", "Scenario deleted", `${scenario.title} and its Sandbox rehearsal history were deleted.`, "neutral", { presenceId: scenario.presenceId ?? state.presence?.id }));
  return state;
}

export function startScenarioRunState(source: OpenPresenceState, scenarioId: string, presenceId?: string, versionId?: string) {
  let state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || !state.agent) throw new Error("Choose an Agent and Presence before starting a Scenario Run.");
  const agentId = state.agent.id;
  const { scenario, version } = scenarioVersionFor(state, scenarioId, versionId);
  if (scenario.ownerScope === "presence" && scenario.presenceId !== presence.id) throw new Error("This Scenario belongs to a different Presence.");
  if (scenario.supportedChannels?.length && !scenario.supportedChannels.includes(presence.channel)) throw new Error(`This Scenario does not naturally apply to ${channelName(presence.channel)}.`);
  if (version.generationStatus === "failed") throw new Error("This Scenario has no reliable world events yet. Generate or edit the missing events before rehearsing.");
  const fidelity = version.fidelity ?? validateScenarioFidelity(version);
  if (fidelity.status === "needs_revision") throw new Error("This Scenario is not ready. Generate or edit the missing world events before rehearsing.");
  state = startPlaygroundSession(state, presence.id, "scenario");
  const session = state.playgroundSessions[0]!;
  const provenance = scenarioProvenance(state, scenario, version, presence, session);
  const run: ScenarioRun = { id: id("scenario-run"), scenarioId: scenario.id, scenarioVersionId: version.id, agentId, presenceId: presence.id, playgroundSessionId: session.id, status: "active", nextStimulusIndex: 0, startedAt: session.createdAt, provenanceId: provenance.id };
  state.scenarioRunProvenance.unshift(provenance);
  state.scenarioRuns.unshift(run);
  state.playgroundSessions = state.playgroundSessions.map((item) => item.id === session.id ? { ...item, scenarioRunId: run.id, scenarioVersionId: version.id } : item);
  state.events.unshift(event("system", "Scenario Run started", `${scenario.title} is running in an isolated ${channelName(presence.channel)} Sandbox world.`, "positive", { presenceId: presence.id, sessionId: session.id }));
  return state;
}

export function markScenarioStimulus(source: OpenPresenceState, runId: string, nextStimulusIndex: number) {
  const state = cloneState(source);
  const run = state.scenarioRuns.find((item) => item.id === runId);
  if (!run) throw new Error("That Scenario Run no longer exists.");
  run.nextStimulusIndex = Math.max(run.nextStimulusIndex, nextStimulusIndex);
  run.status = "active";
  return state;
}

export function completeScenarioRunState(source: OpenPresenceState, runId: string, status: ScenarioRun["status"] = "completed") {
  const state = cloneState(source);
  const run = state.scenarioRuns.find((item) => item.id === runId);
  if (!run) throw new Error("That Scenario Run no longer exists.");
  run.status = status;
  run.completedAt = now();
  state.playgroundSessions = state.playgroundSessions.map((item) => item.id === run.playgroundSessionId ? { ...item, status: status === "completed" ? "completed" : item.status, updatedAt: now() } : item);
  return state;
}

export function stopScenarioRunState(source: OpenPresenceState, runId: string) {
  return completeScenarioRunState(source, runId, "abandoned");
}

export function structuralScenarioEvaluation(source: OpenPresenceState, runId: string): ScenarioRunEvaluation {
  const state = cloneState(source);
  const run = state.scenarioRuns.find((item) => item.id === runId);
  if (!run) throw new Error("That Scenario Run no longer exists.");
  const { version } = scenarioVersionFor(state, run.scenarioId, run.scenarioVersionId);
  const sessionObjects = state.mirrorObjects.filter((item) => item.sessionId === run.playgroundSessionId);
  const sessionExecutions = state.executions.filter((item) => item.sessionId === run.playgroundSessionId);
  const checks: StructuralFinding[] = version.evaluationSpec.structuralCriteria.map((item) => {
    const evidenceRefs = [`session:${run.playgroundSessionId}`];
    if (item.id === "structural-sandbox") {
      const ok = sessionObjects.every((object) => object.environment === "sandbox") && sessionExecutions.every((execution) => execution.environment === "sandbox" && execution.connector === "simulated");
      return { id: id("finding"), criterionId: item.id, status: ok ? "pass" : "fail", evidenceRefs, explanation: ok ? "All observed objects and executions stayed in the isolated Sandbox route." : "A Run object or execution was not isolated to Sandbox.", checkerVersion: "structural-v1" };
    }
    if (item.id === "structural-envelope") {
      const presence = state.presences.find((candidate) => candidate.id === run.presenceId);
      const ok = presence ? sessionExecutions.every((execution) => { const mode = presence.execution[execution.affordance]; return mode !== undefined && mode !== "off"; }) : false;
      return { id: id("finding"), criterionId: item.id, status: ok ? "pass" : "fail", evidenceRefs, explanation: ok ? "Sandbox executions stayed within enabled Presence affordances." : "An execution was formed for an affordance disabled by the Presence envelope.", checkerVersion: "structural-v1" };
    }
    if (item.id === "structural-public-expression") {
      const agentObjects = sessionObjects.filter((object) => object.environment === "sandbox" && object.actorPresenceId === run.presenceId);
      const unsafeExecution = sessionExecutions.some((execution) => {
        if (execution.status !== "succeeded" && !execution.externalRef) return false;
        const payload = execution.publication?.payload;
        const text = payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : "";
        return Boolean(publicExpressionLeakageReason(text));
      });
      const unsafeMirror = agentObjects.some((object) => Boolean(publicExpressionLeakageReason(object.content?.text ?? "")));
      const ok = !unsafeExecution && !unsafeMirror;
      return { id: id("finding"), criterionId: item.id, status: ok ? "pass" : "fail", evidenceRefs, explanation: ok ? "No agent-authored Sandbox execution or Mirror outcome contained planner-shaped internal metadata." : "Planner-shaped internal metadata crossed into an agent-authored execution or Mirror outcome.", checkerVersion: "structural-v1" };
    }
    const ok = sessionObjects.every((object) => object.environment === "sandbox") && sessionExecutions.every((execution) => execution.environment === "sandbox");
    return { id: id("finding"), criterionId: item.id, status: ok ? "pass" : "fail", evidenceRefs, explanation: ok ? "Social content remained observed world data inside the Sandbox trace." : "A world object or execution crossed the Sandbox provenance boundary.", checkerVersion: "structural-v1" };
  });
  const timestamp = now();
  return { id: id("scenario-eval"), runId, status: checks.some((item) => item.status === "fail") ? "failed" : "needs_review", structuralFindings: checks, modelFindings: [], fidelity: version.fidelity ?? validateScenarioFidelity(version), createdAt: timestamp, updatedAt: timestamp };
}

export function recordScenarioEvaluation(source: OpenPresenceState, evaluation: ScenarioRunEvaluation) {
  const state = cloneState(source);
  state.scenarioEvaluations = [evaluation, ...state.scenarioEvaluations.filter((item) => item.id !== evaluation.id && item.runId !== evaluation.runId)];
  state.scenarioRuns = state.scenarioRuns.map((run) => run.id === evaluation.runId ? { ...run, evaluationId: evaluation.id } : run);
  return state;
}

export function recordScenarioReview(source: OpenPresenceState, runId: string, disposition: "accepted" | "okay" | "concern", note?: string) {
  const state = cloneState(source);
  const evaluation = state.scenarioEvaluations.find((item) => item.runId === runId);
  if (!evaluation) throw new Error("Evaluate the Run before recording operator review.");
  evaluation.operatorReview = { disposition, note: note?.trim() || undefined, reviewedAt: now() };
  evaluation.updatedAt = now();
  return state;
}

export function compileWatch(agentId: string, presenceId: string, channel: ChannelId, query: string, purpose?: string): Watch {
  const clean = query.trim().replace(/^keep an eye on\s+/i, "").replace(/[.!?]+$/, "").trim();
  const creator = /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/?$/i.test(clean) || /^@?[A-Za-z0-9_]{2,30}$/.test(clean);
  const opportunity = /\b(opportunit|founder|introduction|network|may need|looking for|could help)\b/i.test(clean);
  const kind: WatchKind = creator ? "creator" : opportunity ? "opportunity" : "topic";
  const title = creator
    ? clean.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, "@").replace(/\/$/, "")
    : kind === "opportunity" ? "Opportunity watch" : clean.length > 56 ? `${clean.slice(0, 56).trim()}…` : clean;
  const source = creator && channel === "x" ? "automatic" as const : "manual" as const;
  const timestamp = now();
  const handle = creator ? clean.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, "").replace(/^@/, "").replace(/\/$/, "") : undefined;
  return { id: id("watch"), agentId, presenceId, channel, kind, title, query: clean, purpose: purpose?.trim() || undefined, target: creator ? { channel, handle, identityStatus: "unresolved" } : undefined, state: "active", sources: creator ? ["posts", "replies", "mentions"] : undefined, observation: { status: source === "automatic" ? "watching" : "manual", source, observedCount: 0, baseline: "not-started" }, createdAt: timestamp, updatedAt: timestamp };
}

function watchHandle(watch: Watch) {
  if (watch.target?.handle) return normalizeHandleForComparison(watch.target.handle);
  if (watch.kind !== "creator") return undefined;
  const raw = watch.query.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, "").replace(/^@/, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_]{2,30}$/.test(raw) ? raw.toLowerCase() : undefined;
}

function requestTypeForText(text: string): PublicRequestType | undefined {
  const lower = text.toLowerCase();
  if (/\b(introduce|introduction|connect me with|put me in touch)\b/.test(lower)) return "introduction";
  if (/\b(find someone|know anyone|recommend|good fit|candidate|who would be a good)\b/.test(lower)) return "recommendation";
  if (/\b(research|look up|find out|investigate|analy[sz]e|compare)\b/.test(lower)) return "research";
  if (/\b(write|draft|create)\b.{0,30}\b(post|thread|content|article)\b/.test(lower)) return "content";
  if (/\b(can you|could you|would you|do you know|what is|how do|where can)\b/.test(lower)) return "answer";
  return undefined;
}

function requestAddressesPresence(text: string, handle: string) {
  const normalized = normalizeHandleForComparison(handle);
  return Boolean(normalized && new RegExp(`(?:^|\\s|^)@${normalized}(?=\\b|\\W|$)`, "i").test(text));
}

function defaultRequestPolicyForPresence(presence: Presence): PresenceRequestPolicy {
  return presence.requestPolicy ?? defaultPresenceRequestPolicy(presence.id);
}

function matchingDelegationGrant(state: OpenPresenceState, presence: Presence, mirror: MirrorObject) {
  const actorId = mirror.author?.externalRef?.id;
  const person = actorId ? state.personIdentities.find((identity) => identity.channel === mirror.channelId && identity.externalActorId === actorId && identity.sourcePresenceId === presence.id)?.personId : undefined;
  return (state.delegationGrants ?? []).find((grant) => grant.enabled && !grant.revokedAt && grant.presenceId === presence.id && grant.channel === mirror.channelId && ((actorId && grant.externalActorId === actorId) || (person && grant.personId === person)));
}

export function relationshipPolicyFromWatchPurpose(purpose: string | undefined): Pick<RelationshipPolicy, "learning" | "engagement" | "rhythm"> | undefined {
  const text = purpose?.toLowerCase().trim();
  if (!text) return undefined;
  // “Insights”, “perspective”, and “macro” describe the contribution we may
  // make in a social exchange; they do not mean that the Watch is learning
  // from the person. Learning must be explicitly requested by the operator.
  const learning: RelationshipLearningMode = /\b(?:learn|study|understand|extract(?:ing)?\s+(?:a\s+)?lesson|take\s+(?:a\s+)?lesson)\b/.test(text) ? "selective" : "off";
  const engagement: RelationshipEngagementMode = /\b(?:regular|maintain|friend|grow|laugh|interact|engage|respond|reply|conversation|mention|joke|humou?r|challenge|support|build)\b/.test(text)
    ? /regular|maintain|friend|grow/.test(text) ? "maintain_relationship" : "when_worthwhile"
    : "observe_only";
  return { learning, engagement, rhythm: engagement === "maintain_relationship" ? "regular" : "light" };
}

/** A paused Watch cannot form or deliver an autonomous social action. */
export function isWatchPausedForOrigin(state: OpenPresenceState, origin?: SocialOrigin) {
  if (origin?.kind !== "watchlist" || !origin.refId) return false;
  return state.watches.some((watch) => watch.id === origin.refId && (watch.state ?? "active") === "paused");
}

/** Re-check the durable Watch state immediately before a connector handoff. */
export function isWatchPausedForExecution(state: OpenPresenceState, execution: Execution) {
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  return isWatchPausedForOrigin(state, intent?.origin);
}

export function recordWatchSignals(source: OpenPresenceState, mirrors: MirrorObject[], nextObservationAt?: string) {
  const state = source;
  for (const mirror of mirrors) {
    const watches = state.watches.filter((watch) => watch.presenceId === mirror.presenceId && (watch.state ?? "active") === "active" && watch.kind === "creator" && (watch.target?.channel ?? watch.channel) === mirror.channelId);
    for (const watch of watches) {
      const handle = watchHandle(watch);
      const matches = Boolean(
        (watch.target?.externalActorId && mirror.author?.externalRef?.id === watch.target.externalActorId)
        || (handle && normalizeHandleForComparison(mirror.author?.handle) === handle),
      );
      if (!matches) continue;
      let personId = watch.target?.personId;
      const actorId = mirror.author?.externalRef?.id;
      if (state.agent && actorId && mirror.author?.externalRef?.type) {
        const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId: mirror.presenceId, channel: mirror.channelId, externalActorId: actorId, displayName: mirror.author.displayName, handle: mirror.author.handle, avatarUrl: mirror.author.avatarUrl, sourceEnvironment: mirror.environment, source: "watched" }, state.people, state.personIdentities, state.relationships);
        personId = remembered.person.id;
        state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
        state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId && item.sourcePresenceId === remembered.identity.sourcePresenceId && (item.sourceEnvironment ?? "live") === (remembered.identity.sourceEnvironment ?? "live")))];
        state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
        const configured = relationshipPolicyFromWatchPurpose(watch.purpose);
        if (configured) {
          const timestamp = now();
          const existing = state.relationshipPolicies.find((item) => item.presenceId === mirror.presenceId && item.personId === personId);
          state.relationshipPolicies = [{ id: existing?.id ?? id("relationship-policy"), agentId: state.agent.id, presenceId: mirror.presenceId, personId, ...configured, sourceDescription: watch.purpose, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }, ...state.relationshipPolicies.filter((item) => item.id !== (existing?.id ?? ""))];
        }
      }
      watch.target = { ...(watch.target ?? { channel: mirror.channelId, identityStatus: "unresolved" }), channel: mirror.channelId, personId, externalActorId: actorId ?? watch.target?.externalActorId, handle: mirror.author?.handle ?? handle, identityStatus: actorId ? "verified" : watch.target?.identityStatus ?? "unresolved" };
      if (!state.watchSignals.some((signal) => signal.watchId === watch.id && signal.mirrorObjectId === mirror.id)) {
        const timestamp = now();
        state.watchSignals.unshift({ id: id("watch-signal"), watchId: watch.id, personId, presenceId: mirror.presenceId, mirrorObjectId: mirror.id, signalType: "new_content", disposition: "pending", createdAt: timestamp, updatedAt: timestamp });
        watch.observation.observedCount += 1;
      }
      const observedAt = mirror.observedAt ?? now();
      watch.observation.status = "watching";
      watch.observation.source = "automatic";
      watch.observation.baseline = watch.observation.observedCount > 0 ? "ready" : "building";
      watch.observation.lastObservedAt = observedAt;
      watch.lastObservedAt = observedAt;
      watch.nextObservationAt = nextObservationAt;
      watch.updatedAt = now();
    }
  }
  return state;
}

export function recordPublicRequestsFromMirrors(source: OpenPresenceState, mirrors: MirrorObject[]) {
  const state = source;
  for (const mirror of mirrors) {
    const presence = state.presences.find((item) => item.id === mirror.presenceId) ?? state.presence;
    if (!presence || mirror.actorPresenceId === presence.id || mirror.channelId !== presence.channel || !mirror.author?.externalRef?.id) continue;
    const text = mirror.content?.text?.trim() ?? "";
    const requestType = requestTypeForText(text);
    if (!requestType || !requestAddressesPresence(text, presence.handle)) continue;
    if (state.publicRequests.some((request) => request.sourceMirrorObjectId === mirror.id)) continue;
    const timestamp = now();
    const policy = defaultRequestPolicyForPresence(presence);
    const grant = matchingDelegationGrant(state, presence, mirror);
    const allowedTypes = grant?.allowedRequestTypes ?? policy.allowedRequestTypes;
    const directAddressed = requestAddressesPresence(text, presence.handle);
    const eligible = !directAddressed && policy.requireDirectAddress
      ? "addressing_required" as const
      : !grant && policy.access === "nobody"
        ? "not_allowed" as const
        : !grant && policy.access === "allowlist"
          ? "not_allowed" as const
          : !allowedTypes.includes(requestType)
            ? "unsupported" as const
            : "eligible" as const;
    const disposition: PublicRequestDisposition = eligible === "eligible" ? (grant?.acceptance ?? policy.acceptance) === "operator_review" ? "needs_operator_review" : "considering" : "ignored";
    const identity = state.personIdentities.find((item) => item.channel === mirror.channelId && item.externalActorId === mirror.author?.externalRef?.id && item.sourcePresenceId === presence.id);
    state.publicRequests.unshift({ id: id("public-request"), agentId: state.agent?.id ?? "", presenceId: presence.id, channel: mirror.channelId, sourceMirrorObjectId: mirror.id, requesterPersonId: identity?.personId, requesterExternalActorId: mirror.author.externalRef.id, requestType, text, eligibility: eligible, disposition, policySource: grant ? "person_grant" : "presence", policyRevisionAtEvaluation: policy.updatedAt, decisionReason: eligible === "eligible" ? "The request matches the effective Presence request policy and is ready for Agent or operator judgment." : "The request was observed but is not authorized for this Presence.", createdAt: timestamp, updatedAt: timestamp });
    state.events.unshift(event("decision", eligible === "eligible" ? "Public request received" : "Public request not accepted", eligible === "eligible" ? `${presence.name} received a ${requestType} request and will consider whether to accept responsibility.` : `${presence.name} observed a request that is not authorized by the current Requests policy.`, eligible === "eligible" ? "positive" : "quiet", { presenceId: presence.id, sourceObjectId: mirror.id }));
  }
  return state;
}

function explorationTitle(brief: string) {
  const clean = brief.trim().replace(/^keep an eye on\s+/i, "").replace(/[.!?]+$/, "").trim();
  return clean.length > 58 ? `${clean.slice(0, 58).trim()}…` : clean || "New exploration";
}

export function explorationInterpretation(brief: string) {
  const clean = brief.trim().replace(/^keep an eye on\s+/i, "").replace(/[.!?]+$/, "").trim();
  return clean
    ? `Look for public conversations, concrete problems, and useful social context related to ${clean}. Search directions may adapt, but the operator's brief remains the durable meaning.`
    : "Look for worthwhile public conversations and concrete problems that fit this Presence's Mission and Taste.";
}

function explorationCoverage(state: OpenPresenceState, presence: Presence) {
  const native = state.nativeConnections.find((item) => item.presenceId === presence.id && item.channelId === presence.channel && item.status === "connected");
  const bridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  if (native && presence.channel === "x") return { status: "available" as const, label: "Connected public discovery", detail: "This Presence can look through the connected public discovery source and bring worthwhile objects into its Social Mirror." };
  if (bridge) return { status: "limited" as const, label: "Bridge-visible discovery", detail: bridge.coverage ? `Exploring social objects visible through this Bridge: ${bridge.coverage}.` : "Exploring social objects visible through this Bridge. Full community search is not implied." };
  if (state.mirrorObjects.some((item) => item.presenceId === presence.id)) return { status: "limited" as const, label: "Existing Mirror evidence", detail: "Look now can inspect social reality already observed for this Presence. No external search connection is configured." };
  return { status: "unavailable" as const, label: "Discovery not connected", detail: "Public discovery is not connected for this Presence yet. Existing Watchlist and Mirror evidence remain unchanged." };
}

export function compileExploration(source: OpenPresenceState, brief: string, presenceId?: string): ExplorationBrief | undefined {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!state.agent || !presence || !brief.trim()) return undefined;
  const timestamp = now();
  return { id: id("exploration"), agentId: state.agent.id, presenceId: presence.id, channel: presence.channel, title: explorationTitle(brief), brief: brief.trim(), interpretation: explorationInterpretation(brief), status: "active", revision: 1, coverage: explorationCoverage(state, presence), engagement: { mode: "surface" as const }, nextEligibleAt: new Date(Date.now() + Math.max(5, presence.attentionIntervalMinutes || 5) * 60_000).toISOString(), createdAt: timestamp, updatedAt: timestamp };
}

export function startExplorationSession(source: OpenPresenceState, explorationId: string, discoverySource: ExplorationSession["discoverySource"] = "mirror") {
  return startExplorationSessionInPlace(cloneState(source), explorationId, discoverySource);
}

export function startExplorationSessionInPlace(state: OpenPresenceState, explorationId: string, discoverySource: ExplorationSession["discoverySource"] = "mirror") {
  const exploration = state.explorations.find((item) => item.id === explorationId);
  if (!exploration || exploration.status !== "active" || !state.agent) throw new Error("That Exploration is not active.");
  const presence = state.presences.find((item) => item.id === exploration.presenceId);
  if (!presence) throw new Error("That Exploration's Presence is no longer available.");
  const timestamp = now();
  const session: ExplorationSession = { id: id("exploration-session"), explorationId, agentId: state.agent.id, presenceId: presence.id, environment: presence.environment ?? "live", status: "running", discoverySource, artifactIds: [], startedAt: timestamp, candidatesSeen: 0, candidatesHydrated: 0, findingsCreated: 0, findingIds: [] };
  const priorPlan = state.discoveryPlans.find((item) => item.explorationId === exploration.id && item.briefRevision === exploration.revision);
  if (!priorPlan) {
    state.discoveryPlans.unshift({ id: id("discovery-plan"), explorationId: exploration.id, briefRevision: exploration.revision, channel: exploration.channel, surfaces: presence.channel === "x" ? ["public_post_search", "thread_hydration"] : ["observed_objects"], directions: [exploration.brief], exclusions: [], source: "fallback", generatedAt: timestamp, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() });
  }
  state.explorationSessions.unshift(session);
  exploration.lastLookedAt = timestamp;
  exploration.nextEligibleAt = new Date(Date.now() + Math.max(5, presence.attentionIntervalMinutes || 5) * 60_000).toISOString();
  exploration.updatedAt = timestamp;
  return { state, session };
}

export function finishExplorationSession(source: OpenPresenceState, sessionId: string, input: { status: ExplorationSessionStatus; candidatesSeen: number; candidatesHydrated: number; findings: Array<{ mirrorObjectId: string; safeSummary: string; whyItMayMatter: string }>; failureReason?: string }) {
  return finishExplorationSessionInPlace(cloneState(source), sessionId, input);
}

export function finishExplorationSessionInPlace(state: OpenPresenceState, sessionId: string, input: { status: ExplorationSessionStatus; candidatesSeen: number; candidatesHydrated: number; findings: Array<{ mirrorObjectId: string; safeSummary: string; whyItMayMatter: string }>; failureReason?: string }) {
  const session = state.explorationSessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("That Exploration session no longer exists.");
  const timestamp = now();
  const findings: ExplorationFinding[] = input.findings.slice(0, 5).flatMap((item) => {
    const mirror = state.mirrorObjects.find((object) => object.id === item.mirrorObjectId && object.presenceId === session.presenceId);
    if (!mirror || state.explorationFindings.some((finding) => finding.explorationId === session.explorationId && finding.mirrorObjectId === mirror.id)) return [];
    return [{ id: id("exploration-finding"), explorationId: session.explorationId, sessionId, presenceId: session.presenceId, mirrorObjectId: mirror.id, safeSummary: item.safeSummary.trim().slice(0, 360), whyItMayMatter: item.whyItMayMatter.trim().slice(0, 500), status: "surfaced" as const, createdAt: timestamp, updatedAt: timestamp }];
  });
  state.explorationFindings = [...findings, ...state.explorationFindings];
  session.status = input.status;
  session.completedAt = timestamp;
  session.candidatesSeen = Math.max(0, input.candidatesSeen);
  session.candidatesHydrated = Math.max(0, input.candidatesHydrated);
  session.findingsCreated = findings.length;
  session.findingIds = findings.map((finding) => finding.id);
  session.failureReason = input.failureReason;
  const exploration = state.explorations.find((item) => item.id === session.explorationId);
  const presence = state.presences.find((item) => item.id === session.presenceId);
  if (exploration && presence) exploration.coverage = explorationCoverage(state, presence);
  const outcomeTitle = findings.length ? "Exploration found something worth noticing" : input.status === "completed" ? "Exploration completed" : input.status === "failed" ? "Exploration failed" : "Exploration degraded";
  state.events.unshift(event("decision", outcomeTitle, findings.length ? `${presence?.name ?? "The Presence"} found ${findings.length} worthwhile social finding${findings.length === 1 ? "" : "s"}: ${findings[0]?.safeSummary ?? "Review the linked finding in Watching."}${findings.length > 1 ? ` ${findings.length - 1} more ${findings.length === 2 ? "finding is" : "findings are"} available in Watching.` : ""} No public action was created.` : input.failureReason ?? `${presence?.name ?? "The Presence"} looked around and found nothing that earned a finding.`, findings.length ? "positive" : input.status === "completed" ? "quiet" : "warning", { presenceId: session.presenceId, sourceObjectId: findings[0]?.mirrorObjectId }));
  return state;
}

function sandboxEnvironmentFor(state: OpenPresenceState, presence: Presence): SandboxEnvironment {
  const existing = state.sandboxEnvironments.find((item) => item.presenceId === presence.id && item.channelId === presence.channel);
  if (existing) return existing;
  const created = makeSandboxEnvironment(presence);
  state.sandboxEnvironments.push(created);
  return created;
}

function sandboxSessionFor(state: OpenPresenceState, sessionId: string) {
  const session = state.playgroundSessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("That Playground session no longer exists.");
  return session;
}

export function executionPublicationText(state: OpenPresenceState, execution: Pick<Execution, "socialIntentId" | "publication">): string {
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  const publication = intent?.publicationId ? state.publications.find((item) => item.id === intent.publicationId) : execution.publication;
  const payload = publication?.payload;
  return payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : "";
}

const idempotentExecutionStatuses = new Set<Execution["status"]>([
  "awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued",
  "claimed", "executing", "verification-pending", "succeeded", "blocked",
]);

function normalizedActionText(value: string | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Public expressions are retried across worker passes and connector
 * acknowledgements. The Social Intent id is intentionally not part of this
 * key: a retry creates a new intent, but it is still the same public act.
 */
export function socialActionIdempotencyKey(input: { presenceId: string; environment: PresenceEnvironment; affordance: string; target?: EntityRef; text?: string }) {
  return `social-action:v2:${stableHash({
    presenceId: input.presenceId,
    environment: input.environment,
    affordance: input.affordance,
    target: input.target ? { type: input.target.type, id: input.target.id } : undefined,
    text: normalizedActionText(input.text),
  })}`;
}

function samePublicAction(left: Execution, right: Pick<Execution, "presenceId" | "environment" | "affordance" | "target" | "publication" | "socialIntentId">, state: OpenPresenceState) {
  return left.presenceId === right.presenceId
    && (left.environment ?? "live") === (right.environment ?? "live")
    && left.affordance === right.affordance
    && left.target?.type === right.target?.type
    && left.target?.id === right.target?.id
    && (left.affordance === "x.like" || left.affordance === "x.repost" || left.affordance === "x.follow"
      ? true
      : normalizedActionText(executionPublicationText(state, left)) === normalizedActionText(executionPublicationText(state, right)));
}

/** Find an already accepted/in-flight attempt for the same public act. */
export function existingPublicActionExecution(state: OpenPresenceState, candidate: Pick<Execution, "id" | "presenceId" | "environment" | "affordance" | "target" | "publication" | "socialIntentId">) {
  return state.executions.find((execution) => execution.id !== candidate.id
    && idempotentExecutionStatuses.has(execution.status)
    && samePublicAction(execution, candidate, state));
}

export function hasExistingPublicAction(state: OpenPresenceState, input: { presenceId: string; environment?: PresenceEnvironment; affordance: string; target?: EntityRef; text?: string }) {
  const environment = input.environment ?? "live";
  return state.executions.some((execution) => execution.presenceId === input.presenceId
    && (execution.environment ?? "live") === environment
    && execution.affordance === input.affordance
    && idempotentExecutionStatuses.has(execution.status)
    && execution.target?.type === input.target?.type
    && execution.target?.id === input.target?.id
    && (input.affordance === "x.like" || input.affordance === "x.repost" || input.affordance === "x.follow"
      ? true
      : normalizedActionText(executionPublicationText(state, execution)) === normalizedActionText(input.text)));
}

const assignmentExpressionStopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "in", "into", "is", "it", "of", "on", "or", "that", "the", "their", "this", "to", "use", "what", "when", "with",
]);

function assignmentExpressionTokens(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => !assignmentExpressionStopWords.has(token)) ?? [];
}

/** Assignment framing is private operating context, not public voice. */
export function assignmentPublicExpressionLeakageReason(assignment: Pick<Assignment, "title" | "instruction">, text: string): string | undefined {
  const sourceTokens = assignmentExpressionTokens(`${assignment.title ?? ""} ${assignment.instruction}`);
  const openingTokens = assignmentExpressionTokens(text.split(/[\n.!?]/, 1)[0] ?? "").slice(0, 12);
  if (sourceTokens.length < 2 || openingTokens.length < 2) return undefined;

  const matched = openingTokens.filter((token) => sourceTokens.includes(token)).length;
  let longestRun = 0;
  for (let openingIndex = 0; openingIndex < openingTokens.length; openingIndex += 1) {
    for (let sourceIndex = 0; sourceIndex < sourceTokens.length; sourceIndex += 1) {
      let run = 0;
      while (openingTokens[openingIndex + run] && openingTokens[openingIndex + run] === sourceTokens[sourceIndex + run]) run += 1;
      longestRun = Math.max(longestRun, run);
    }
  }
  const overlap = matched / Math.max(1, Math.min(sourceTokens.length, openingTokens.length));
  if (longestRun >= 2 && (overlap >= 0.5 || matched >= 3)) {
    return "The public opening repeats private Assignment wording; rewrite it from the idea rather than the Assignment label.";
  }
  return undefined;
}

export function languageValidationForExecution(state: OpenPresenceState, execution: Execution) {
  const policy = effectiveLanguagePolicy(state.agent, state.presences.find((item) => item.id === execution.presenceId) ?? state.presence);
  return validateLanguage(executionPublicationText(state, execution), policy);
}

const languageScopedTargetTypes = /(?:^|\.)(post|reply|comment)$/i;

export interface TargetLanguageValidation {
  valid: boolean;
  expected: string;
  observed?: string;
  reason?: string;
}

const likelyEnglishMarkers = new Set([
  "a", "an", "and", "are", "as", "be", "but", "by", "can", "for", "from", "has", "have", "how", "if", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "with", "without", "you",
]);

/**
 * X's DOM often omits `lang` even when the rendered post is English. Use a
 * deliberately conservative lexical hint only for live browser targets;
 * sandbox objects and explicitly non-English observations remain strict.
 */
function likelyEnglishText(value: string | undefined): boolean {
  const text = String(value ?? "").trim();
  if (!text || /[\u0400-\u04ff\u3040-\u30ff\u3400-\u9fff\u0600-\u06ff]/u.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  if (words.length < 3) return false;
  const markers = words.filter((word) => likelyEnglishMarkers.has(word.replace("'", ""))).length;
  return markers >= 1 && markers / words.length >= 0.08;
}

function targetMirrorForAction(state: OpenPresenceState, input: { presenceId: string; target?: EntityRef; environment?: PresenceEnvironment; sessionId?: string }) {
  if (!input.target || !languageScopedTargetTypes.test(input.target.type)) return undefined;
  return state.mirrorObjects.find((item) => item.presenceId === input.presenceId
    && item.externalRef.type === input.target?.type
    && item.externalRef.id === input.target?.id
    && (!input.environment || !item.environment || item.environment === input.environment)
    && (!input.sessionId || !item.sessionId || item.sessionId === input.sessionId));
}

export function targetLanguageValidationForAction(state: OpenPresenceState, input: { presenceId: string; target?: EntityRef; affordance?: string; environment?: PresenceEnvironment; sessionId?: string }): TargetLanguageValidation {
  if (!input.target || !languageScopedTargetTypes.test(input.target.type)) return { valid: true, expected: normalizePresenceLanguage(state.presences.find((item) => item.id === input.presenceId)?.language ?? state.presence?.language) };
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  const expected = normalizePresenceLanguage(presence?.language);
  const mirror = targetMirrorForAction(state, input);
  const observed = normalizedObservedLanguage(mirror?.language ?? mirror?.content?.language);
  if (!mirror) return { valid: false, expected, reason: `The target ${input.target.type} is not available in the Social Mirror, so its language cannot be confirmed.` };
  // Some X API responses label mention/link-only shells as `qme` rather than
  // a human language. Reuse the observation classifier here so a provider
  // metadata quirk does not block a direct operator-supplied target, while
  // actual non-English text remains blocked.
  if (languageEligibleForObservation(expected, mirror.language ?? mirror.content?.language, mirror.content?.text, Boolean(mirror.assetRefs?.length))) {
    return { valid: true, expected, observed };
  }
  if (!observed && input.environment === "live" && likelyEnglishText(mirror.content?.text)) {
    return { valid: true, expected, observed: "en" };
  }
  if (!observed) return { valid: false, expected, reason: `The target ${input.target.type} has no confirmed language, so ${presence?.name ?? "the Presence"} will leave it alone.` };
  if (!languagesMatch(expected, observed)) return { valid: false, expected, observed, reason: `The target is ${observed}, but ${presence?.name ?? "the Presence"} speaks ${expected}. No interaction was delivered.` };
  return { valid: true, expected, observed };
}

export function targetLanguageValidationForExecution(state: OpenPresenceState, execution: Execution): TargetLanguageValidation {
  return targetLanguageValidationForAction(state, { presenceId: execution.presenceId, target: execution.target, affordance: execution.affordance, environment: execution.environment, sessionId: execution.sessionId });
}

export function blockExecutionForLanguage(source: OpenPresenceState, executionId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return state;
  const result = languageValidationForExecution(state, execution);
  if (result.valid) return state;
  execution.status = "blocked";
  execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by Never use: " + result.violations.map((item) => item.literal).join(", ") + ".", retryable: false };
  execution.reviewReason = "The final expression violates an explicit lexical language policy.";
  execution.updatedAt = now();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
  state.events.unshift(event("execution", "Language policy blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

export function blockExecutionForTargetLanguage(source: OpenPresenceState, executionId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return state;
  const result = targetLanguageValidationForExecution(state, execution);
  if (result.valid) return state;
  execution.status = "blocked";
  execution.failure = { code: "TARGET_LANGUAGE_MISMATCH", message: result.reason ?? "Delivery blocked because the target language does not match the Presence language.", retryable: false };
  execution.reviewReason = "The target post language is not confirmed to match the Presence language.";
  execution.updatedAt = now();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
  state.events.unshift(event("execution", "Target language blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

export function startPlaygroundSession(source: OpenPresenceState, presenceId?: string, sourceType: PlaygroundSession["source"] = "fresh") {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) throw new Error("Choose a Presence before starting Playground.");
  const environment = sandboxEnvironmentFor(state, presence);
  const timestamp = now();
  const session: PlaygroundSession = { id: id("session"), environmentId: environment.id, presenceId: presence.id, channelId: presence.channel, source: sourceType, status: "active", virtualNow: timestamp, virtualTimeMode: "realtime", worldRevision: 1, createdAt: timestamp, updatedAt: timestamp, evaluatedSlotIds: [], judgedObjectIds: [] };
  state.playgroundSessions.unshift(session);
  state.sandboxEnvironments = state.sandboxEnvironments.map((item) => item.id === environment.id ? { ...item, status: "active", updatedAt: timestamp } : item);
  state.events.unshift(event("system", "Playground session started", `${channelName(presence.channel)} is simulated. ${presence.name} is using the real Agent runtime in an isolated world.`, "positive", { presenceId: presence.id }));
  state.events[0]!.sessionId = session.id;
  return state;
}

export function beginOriginalPostRehearsal(source: OpenPresenceState, input: { sessionId: string; inspiration?: string }) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, input.sessionId);
  const presence = state.presences.find((item) => item.id === session.presenceId) ?? state.presence;
  if (!presence) throw new Error("The session's Presence is unavailable.");
  const triggeredAt = now();
  const attempt: OriginalPostRehearsalAttempt = { id: id("rehearsal"), sessionId: session.id, presenceId: presence.id, triggeredAt, stimulus: input.inspiration?.trim() ? { type: "text", value: input.inspiration.trim() } : { type: "none" }, result: "running", preferenceEvidenceIds: [] };
  state.originalPostRehearsals.unshift(attempt);
  state.events.unshift({ ...event("decision", "Considering an original post", `${presence.name} is looking at the current simulated ${channelName(session.channelId)} world and deciding whether there is something worth originating.`, "positive", { presenceId: presence.id }), sessionId: session.id });
  return state;
}

export function completeOriginalPostRehearsal(source: OpenPresenceState, attemptId: string) {
  const state = cloneState(source);
  const attempt = state.originalPostRehearsals.find((item) => item.id === attemptId);
  if (!attempt) return state;
  const execution = state.executions.find((item) => item.rehearsalAttemptId === attemptId);
  const publication = state.publications.find((item) => item.rehearsalAttemptId === attemptId);
  const evaluationFailed = state.events.some((item) => item.sessionId === attempt.sessionId && item.title === "Sandbox evaluation unavailable" && new Date(item.time).getTime() >= new Date(attempt.triggeredAt).getTime());
  attempt.executionId = execution?.id;
  attempt.publicationId = publication?.id;
  attempt.result = execution?.status === "succeeded" ? "published" : execution?.status === "awaiting-review" ? "review" : execution?.status === "awaiting-manual" ? "manual" : execution?.status === "failed" || evaluationFailed ? "failed" : "no_op";
  attempt.completedAt = now();
  const detail = attempt.result === "published"
    ? `${state.presences.find((item) => item.id === attempt.presenceId)?.name ?? "The Presence"} published an original expression in the simulated world.`
    : attempt.result === "review"
      ? "An original expression is waiting for the Presence's configured review step."
      : attempt.result === "manual"
        ? "An original expression is waiting for the Presence's configured manual relay."
        : attempt.result === "failed"
          ? "The original consideration did not produce a verified Sandbox delivery."
          : `${state.presences.find((item) => item.id === attempt.presenceId)?.name ?? "The Presence"} chose silence in this context. No original post was formed because nothing met its standard for a worthwhile contribution.`;
  state.events.unshift({ ...event("decision", "Original post rehearsal complete", detail, attempt.result === "failed" ? "warning" : attempt.result === "no_op" ? "quiet" : "positive", { presenceId: attempt.presenceId, executionId: execution?.id }), sessionId: attempt.sessionId });
  return state;
}

export function recordPreferenceEvidence(source: OpenPresenceState, input: { sessionId: string; attemptId: string; reaction: PreferenceReaction; reasons?: PreferenceReason[]; note?: string }) {
  const state = cloneState(source);
  const attempt = state.originalPostRehearsals.find((item) => item.id === input.attemptId && item.sessionId === input.sessionId);
  const presence = state.presences.find((item) => item.id === attempt?.presenceId) ?? state.presence;
  if (!attempt || !presence || attempt.result === "running") throw new Error("That rehearsal is not ready for calibration.");
  if (state.preferenceEvidence.some((item) => item.sessionId === input.sessionId && item.subjectRef.id === attempt.id)) throw new Error("Preference evidence has already been recorded for this rehearsal.");
  const evidence: PreferenceEvidence = { id: id("preference"), agentId: state.agent?.id ?? "", presenceId: presence.id, sessionId: input.sessionId, source: attempt.result === "no_op" ? "playground_no_op" : "playground_publication", subjectRef: attempt.result === "no_op" ? { type: "decision", id: attempt.id } : { type: "publication", id: attempt.publicationId ?? attempt.id }, reaction: input.reaction, reasons: input.reasons?.length ? [...new Set(input.reasons)] : undefined, note: input.note?.trim() || undefined, scopeHint: presence.mode === "ghost" ? "presence" : "agent", environment: "sandbox", createdAt: now() };
  state.preferenceEvidence.unshift(evidence);
  attempt.preferenceEvidenceIds = [...new Set([...(attempt.preferenceEvidenceIds ?? []), evidence.id])];
  state.events.unshift({ ...event("learning", "Preference evidence saved", "Saved as rehearsal evidence. This helps calibrate the current session but does not change protected identity or become a reward score.", "positive", { presenceId: presence.id }), sessionId: input.sessionId });
  return state;
}

function sandboxAssetFromInput(state: OpenPresenceState, presence: Presence, session: PlaygroundSession, input: SandboxAssetInput, visibility: "public" | "private-community" | "private-thread" | "direct-message" | "unknown", shareability: "presence-only" | "agent-wide" | "public"): Asset {
  const timestamp = now();
  const sourceUrl = input.sourceUrl?.trim() || undefined;
  const dataUrl = input.dataUrl?.trim() || undefined;
  const mimeType = input.mimeType ?? dataUrl?.match(/^data:([^;]+);/)?.[1];
  return { id: id("asset"), agentId: state.agent?.id ?? "", presenceId: presence.id, sessionId: session.id, type: input.kind, mediaKind: input.kind === "chart" ? "image" : input.kind === "link" ? "other" : input.kind, semanticKind: input.kind === "chart" ? "chart" : undefined, dataUrl, checksum: `${input.name}:${input.mimeType ?? ""}:${dataUrl?.length ?? sourceUrl ?? ""}`, status: "ready", nature: sourceUrl ? "observed" : dataUrl ? "generated" : "unknown", rights: { status: "unknown" }, provenance: { origin: "sandbox", sourceUrl, sourcePageUrl: input.sourcePageUrl?.trim() || undefined, publisher: input.publisher?.trim() || undefined, retrievedAt: sourceUrl ? timestamp : undefined, acquisitionProvider: sourceUrl ? "sandbox-input" : undefined, importedAt: timestamp, sourceIdentityStatus: sourceUrl ? "unknown" : "verified" }, mimeType, sizeBytes: dataUrl ? Math.ceil((dataUrl.length * 3) / 4) : undefined, description: input.name, visibility, shareability, environment: "sandbox", createdAt: timestamp, updatedAt: timestamp };
}

export function addSandboxEvent(source: OpenPresenceState, input: { sessionId: string; kind?: string; actionId?: string; actorId?: string; actorName?: string; actorHandle?: string; profile?: import("./types").SandboxActorProfile; content?: string; language?: string; assets?: SandboxAssetInput[]; targetExternalRef?: EntityRef; parentExternalRef?: EntityRef; source?: MirrorObject["source"]; trust?: MirrorObject["trust"]; scenarioStimulusId?: string }) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, input.sessionId);
  const presence = state.presences.find((item) => item.id === session.presenceId) ?? state.presence;
  if (!presence) throw new Error("The session's Presence is unavailable.");
  const definition = channelDefinition(state, session.channelId);
  const simulation = simulationForChannel(session.channelId, definition);
  const actionId = input.actionId ?? input.kind ?? simulation.actions[0]?.id ?? "post";
  const action = simulation.actions.find((item) => item.id === actionId);
  const actor = state.sandboxActors.find((item) => item.id === input.actorId && item.sessionId === session.id) ?? state.sandboxActors.find((item) => item.sessionId === session.id && item.displayName === input.actorName?.trim());
  const actorId = actor?.id ?? id("actor");
  const actorName = actor?.displayName ?? input.actorName?.trim();
  if (!actorName) throw new Error("Choose or create a simulated person.");
  if (!actor) state.sandboxActors.push({ id: actorId, sessionId: session.id, displayName: actorName, handle: input.actorHandle?.trim() || undefined, profile: input.profile, role: "audience", createdAt: now() });
  else if (input.profile || input.actorHandle?.trim()) {
    const actorIndex = state.sandboxActors.findIndex((item) => item.id === actor.id);
    if (actorIndex >= 0) state.sandboxActors[actorIndex] = { ...state.sandboxActors[actorIndex]!, handle: input.actorHandle?.trim() || state.sandboxActors[actorIndex]!.handle, profile: input.profile ?? state.sandboxActors[actorIndex]!.profile };
  }
  const objectId = id("sandbox-object");
  const objectType = action?.objectType ?? input.kind ?? actionId;
  const targetExternalRef = input.targetExternalRef ?? input.parentExternalRef;
  // Scenario stimuli are exact world content. A simulated event without an
  // explicit language uses the Presence language; an explicit mismatch is
  // retained as world evidence but is excluded from cognition by the same
  // observation boundary used by live connectors.
  const content = input.content ?? `${action?.label ?? "A simulated event"} occurred.`;
  const observedLanguage = input.language ?? presence.language;
  const externalRef = { type: `${session.channelId}.${objectType}`, id: objectId };
  const parentObject = targetExternalRef ? state.mirrorObjects.find((item) => item.sessionId === session.id && item.externalRef.type === targetExternalRef.type && item.externalRef.id === targetExternalRef.id) : undefined;
  const conversationExternalRef = parentObject?.conversationExternalRef ?? parentObject?.externalRef.id;
  const observedAt = session.virtualNow;
  const visibility = actionId === "message" ? "direct-message" as const : definition?.privacyDefaults.visibility ?? "public";
  const shareability = definition?.privacyDefaults.shareability ?? "presence-only";
  // Older persisted channel definitions may not have recorded their media
  // capabilities. Keep those definitions compatible with the built-in
  // Sandbox contract instead of silently dropping chart evidence from X.
  const supportedAssetKinds = definition?.supportedAssetKinds ?? (session.channelId === "x" ? ["image", "video", "gif", "chart", "link"] : ["image", "chart", "link"]);
  const unsupportedAssets = (input.assets ?? []).filter((item) => !supportedAssetKinds.includes(item.kind as never));
  if (unsupportedAssets.length) throw new Error(`The simulated ${channelName(session.channelId)} world does not support these asset kinds: ${unsupportedAssets.map((item) => item.kind).join(", ")}.`);
  const assetInputs = input.assets ?? [];
  const mirrorId = id("mirror");
  const object = { id: mirrorId, bridgeId: `sandbox:${session.environmentId}`, presenceId: presence.id, channelId: session.channelId, externalRef, parentExternalRef: targetExternalRef, conversationExternalRef, objectType, language: observedLanguage, simulationActionId: actionId, author: { externalRef: { type: `${session.channelId}.user`, id: actorId }, displayName: actorName, handle: (actor?.handle ?? input.actorHandle?.trim()) || undefined }, content: { text: content, language: observedLanguage }, assetRefs: [] as { assetId: string; kind: SocialAssetKind; role?: "primary" | "attachment" | "link-preview" }[], occurredAt: observedAt, observedAt: now(), visibility, shareability, environment: "sandbox" as const, sessionId: session.id, sourceEventId: `sandbox-event:${objectId}`, source: input.source, trust: input.trust, scenarioStimulusId: input.scenarioStimulusId };
  for (const assetInput of assetInputs) {
    const asset = sandboxAssetFromInput(state, presence, session, assetInput, visibility, shareability);
    state.assets.unshift(asset);
    object.assetRefs.push({ assetId: asset.id, kind: assetInput.kind, role: assetInput.kind === "link" ? "link-preview" : object.assetRefs.length ? "attachment" : "primary" });
    state.perceptions.unshift(createAssetPerception({ asset, presenceId: presence.id, socialObjectId: mirrorId, sessionId: session.id, level: "glance", result: createUninterpretedPerception(asset) }));
  }
  state.mirrorObjects.unshift(object);
  updateConversationEpisodeFromMirror(state, object, presence.id);
  state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: object.bridgeId, presenceId: presence.id, sourceEventId: object.sourceEventId!, event: "created", externalRef, object, receivedAt: now(), environment: "sandbox", sessionId: session.id });
  const actionDescription = action?.label?.replace(/^Someone\s*/i, "").replaceAll("Jenny", presence.name).toLowerCase() ?? `created a ${objectType}`;
  state.events.unshift({ ...event("decision", "Sandbox event observed", `${actorName} ${actionDescription} in Playground.`, "neutral", { presenceId: presence.id, sourceObjectId: object.id }), sessionId: session.id });
  session.updatedAt = now();
  return state;
}

export function advanceSandboxTime(source: OpenPresenceState, sessionId: string, minutes: number) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, sessionId);
  const safeMinutes = Math.max(-24 * 60, Math.min(30 * 24 * 60, Math.round(minutes)));
  session.virtualNow = new Date(new Date(session.virtualNow).getTime() + safeMinutes * 60_000).toISOString();
  session.virtualTimeMode = "manual";
  session.updatedAt = now();
  state.events.unshift({ ...event("system", "Sandbox time moved", `${safeMinutes >= 0 ? "+" : ""}${safeMinutes} minutes · ${new Date(session.virtualNow).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`, "neutral", { presenceId: session.presenceId }), sessionId });
  return state;
}

export function syncPlaygroundTime(source: OpenPresenceState, sessionId: string) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, sessionId);
  if (session.virtualTimeMode === "manual") return state;
  const currentTime = new Date().getTime();
  const virtualTime = new Date(session.virtualNow).getTime();
  if (Number.isFinite(virtualTime) && Math.abs(currentTime - virtualTime) < 60_000) return state;
  const timestamp = now();
  session.virtualNow = timestamp;
  session.updatedAt = timestamp;
  return state;
}

export function expireSandboxIntents(source: OpenPresenceState, sessionId: string) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, sessionId);
  const virtualNow = new Date(session.virtualNow).getTime();
  if (!Number.isFinite(virtualNow)) return state;
  for (const intent of state.socialIntents.filter((item) => item.sessionId === sessionId && item.state === "active")) {
    const expiresAt = intent.validity.expiresAt
      ? new Date(intent.validity.expiresAt).getTime()
      : intent.validity.staleAfterMs
        ? new Date(intent.formedAt).getTime() + intent.validity.staleAfterMs
        : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(expiresAt) || expiresAt > virtualNow) continue;
    intent.state = "expired";
    intent.updatedAt = new Date().toISOString();
    const existingExecution = state.executions.find((item) => item.socialIntentId === intent.id);
    if (existingExecution && ["succeeded", "failed", "cancelled", "expired"].includes(existingExecution.status)) continue;
    if (existingExecution) {
      existingExecution.status = "expired";
      existingExecution.updatedAt = new Date().toISOString();
      state.events.unshift({ ...event("execution", "Sandbox intention expired", `${intent.affordance} was not delivered before its useful window closed.`, "quiet", { presenceId: intent.presenceId, intentId: intent.id, executionId: existingExecution.id }), sessionId });
    } else {
      state.events.unshift({ ...event("decision", "Sandbox intention expired", `${intent.affordance} expired before delivery because its useful window closed.`, "quiet", { presenceId: intent.presenceId, intentId: intent.id }), sessionId });
    }
  }
  return state;
}

export function resetPlaygroundSession(source: OpenPresenceState, sessionId: string) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, sessionId);
  const environmentId = session.environmentId;
  const timestamp = now();
  state.mirrorObjects = state.mirrorObjects.filter((item) => item.sessionId !== sessionId);
  state.mirrorEvents = state.mirrorEvents.filter((item) => item.sessionId !== sessionId);
  state.assets = state.assets.filter((item) => item.sessionId !== sessionId);
  state.perceptions = state.perceptions.filter((item) => item.sessionId !== sessionId);
  state.sandboxActors = state.sandboxActors.filter((item) => item.sessionId !== sessionId);
  state.socialIntents = state.socialIntents.filter((item) => item.sessionId !== sessionId);
  state.executions = state.executions.filter((item) => item.sessionId !== sessionId);
  state.outcomes = state.outcomes.filter((item) => item.sessionId !== sessionId);
  state.preferenceEvidence = state.preferenceEvidence.filter((item) => item.sessionId !== sessionId);
  state.originalPostRehearsals = state.originalPostRehearsals.filter((item) => item.sessionId !== sessionId);
  state.networkSearches = state.networkSearches.filter((item) => item.sessionId !== sessionId);
  state.networkIntroductions = state.networkIntroductions.filter((item) => item.sessionId !== sessionId);
  state.publications = state.publications.filter((item) => item.sessionId !== sessionId);
  state.assignments = state.assignments.filter((item) => item.sessionId !== sessionId);
  state.actions = state.actions.filter((item) => item.sessionId !== sessionId);
  state.events = state.events.filter((item) => item.sessionId !== sessionId);
  state.playgroundSessions = state.playgroundSessions.map((item) => item.id === sessionId ? { ...item, status: "active", virtualNow: timestamp, virtualTimeMode: "realtime" as const, worldRevision: (item.worldRevision ?? 1) + 1, updatedAt: timestamp, evaluatedSlotIds: [], judgedObjectIds: [] } : item);
  state.sandboxEnvironments = state.sandboxEnvironments.map((item) => item.id === environmentId ? { ...item, status: "active", updatedAt: timestamp } : item);
  state.events.unshift({ ...event("system", "Fresh Sandbox account ready", "The simulated account has been refreshed for a new rehearsal.", "positive", { presenceId: session.presenceId }), sessionId });
  return state;
}

/**
 * Ground an authored leading mention against the post and its bounded thread.
 * A model can mention someone later in a sentence as part of its own prose,
 * but an opener addresses an account and must be supported by observed
 * participant context. This is an execution boundary, not a text rewrite.
 */
function expressionMentionGroundingReason(state: OpenPresenceState, presence: Presence, target: EntityRef | undefined, text: string, sessionId?: string) {
  if (!target || !text.trim()) return undefined;
  const scope = state.mirrorObjects.filter((item) => item.presenceId === presence.id && item.channelId === presence.channel && (!sessionId || item.sessionId === sessionId));
  const byRef = new Map(scope.map((item) => [`${item.externalRef.type}:${item.externalRef.id}`, item]));
  const context = new Map<string, MirrorObject>();
  const visit = (ref: EntityRef | undefined) => {
    if (!ref) return;
    const key = `${ref.type}:${ref.id}`;
    if (context.has(key)) return;
    const object = byRef.get(key);
    if (!object) return;
    context.set(key, object);
    visit(object.parentExternalRef);
    for (const referenced of object.referencedExternalRefs ?? []) visit(referenced);
  };
  visit(target);
  const supportedHandles = new Set<string>([presence.handle]);
  for (const object of context.values()) {
    if (object.author?.handle) supportedHandles.add(object.author.handle);
    for (const match of (object.content?.text ?? "").matchAll(/@([A-Za-z0-9_]{1,30})/g)) supportedHandles.add(match[1]!);
  }
  return unsupportedLeadingMention(text, supportedHandles);
}

function expressionSourceEchoReason(state: OpenPresenceState, presence: Presence, target: EntityRef | undefined, text: string, sessionId?: string) {
  if (!target || !text.trim()) return undefined;
  const scope = state.mirrorObjects.filter((item) => item.presenceId === presence.id && item.channelId === presence.channel && (!sessionId || item.sessionId === sessionId));
  const byRef = new Map(scope.map((item) => [`${item.externalRef.type}:${item.externalRef.id}`, item]));
  const observedTexts: string[] = [];
  const visited = new Set<string>();
  const visit = (ref: EntityRef | undefined) => {
    if (!ref) return;
    const key = `${ref.type}:${ref.id}`;
    if (visited.has(key)) return;
    visited.add(key);
    const object = byRef.get(key);
    if (!object) return;
    if (object.content?.text) observedTexts.push(object.content.text);
    visit(object.parentExternalRef);
    for (const referenced of object.referencedExternalRefs ?? []) visit(referenced);
  };
  visit(target);
  return observedSourceEchoReason(text, observedTexts);
}

export function formSandboxIntent(source: OpenPresenceState, input: { sessionId: string; affordance: string; format?: string; text: string; target?: EntityRef; perceptionTarget?: EntityRef; rehearsalAttemptId?: string; assignmentId?: string; conversationEpisodeId?: string; invocationId?: string; assets?: SandboxAssetInput[]; expressionMode?: import("./types").ExpressionMode; groundingStatus?: import("./types").GroundingStatus; assetReuse?: { usageType: import("./types").AssetUsageType; reason: string }; networkMetadata?: { referencedPeople?: import("./types").SocialIntentPersonReference[]; networkReason?: string }; operatorDirectiveId?: string; origin?: SocialOrigin; source?: "agent" | "operator"; attentionTestId?: string }) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, input.sessionId);
  const presence = state.presences.find((item) => item.id === session.presenceId) ?? state.presence;
  if (!presence) throw new Error("Sandbox delivery requires a Sandbox Presence.");
  const perceptionTarget = input.target ?? input.perceptionTarget;
  const targetObject = perceptionTarget ? state.mirrorObjects.find((item) => item.sessionId === session.id && item.externalRef.type === perceptionTarget.type && item.externalRef.id === perceptionTarget.id) : undefined;
  const conversationEpisodeId = input.conversationEpisodeId ?? (targetObject ? ensureConversationEpisode(state, targetObject, presence?.id ?? session.presenceId)?.id : undefined);
  const requirement = perceptionRequirement(targetObject, input.affordance, presence);
  const mediaReady = !requirement.materiallyDependsOnAsset || (targetObject?.assetRefs ?? []).every((ref) => hasUsablePerception(state.perceptions, ref.assetId, requirement.requiredLevel === "none" ? "glance" : requirement.requiredLevel));
  if (!mediaReady) {
    state.events.unshift({ ...event("decision", "Media needs inspection", `${presence.name} did not form a ${input.affordance} intent because attached media has not been successfully interpreted.`, "warning", { presenceId: presence.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
    return state;
  }
  const mediaReviewRequired = mediaRequiresReview(state.perceptions, targetObject, presence, requirement.requiredLevel === "none" ? "glance" : requirement.requiredLevel);
  const executionMode = presence.execution[input.affordance] ?? "off";
  const timestamp = now();
  const publicationAssets = (input.assets ?? []).map((assetInput) => assetInput.existingAssetId
    ? state.assets.find((asset) => asset.id === assetInput.existingAssetId) ?? sandboxAssetFromInput(state, presence, session, assetInput, "public", "presence-only")
    : sandboxAssetFromInput(state, presence, session, assetInput, "public", "presence-only"));
  const newPublicationAssets = publicationAssets.filter((asset) => !source.assets.some((existing) => existing.id === asset.id));
  state.assets.unshift(...newPublicationAssets);
  const duplicateAssets = publicationAssets.filter((asset) => {
    const identity = asset.storage?.exactHash ?? asset.checksum;
    return identity && state.assetUsages.some((usage) => usage.assetId !== asset.id && usage.presenceId === presence.id && usage.environment === "sandbox" && (!input.assignmentId || usage.assignmentId === input.assignmentId) && state.assets.some((prior) => prior.id === usage.assetId && (prior.storage?.exactHash ?? prior.checksum) === identity));
  });
  const expression = epistemicState(input.expressionMode ?? "factual", input.groundingStatus);
  const origin = input.origin ?? (input.assignmentId ? { kind: "assignment" as const, refId: input.assignmentId } : input.operatorDirectiveId ? { kind: "operator" as const, refId: input.operatorDirectiveId } : input.affordance === "reply" ? { kind: "inbound_social" as const, refId: input.target?.id } : { kind: "other" as const });
  const formattedText = formatOneSentencePerLine(input.text);
  const publication: Publication = { id: id("publication"), format: input.format ?? `${session.channelId}.${input.affordance}`, payload: { text: formattedText }, assetIds: publicationAssets.map((asset) => asset.id), links: publicationAssets.filter((asset) => asset.type === "link" && asset.provenance.sourceUrl).map((asset) => ({ url: asset.provenance.sourceUrl!, label: asset.description })), assetReuse: input.assetReuse, origin, ...expression, createdAt: timestamp, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, assignmentId: input.assignmentId, invocationId: input.invocationId } as Publication & { invocationId?: string };
  const intent: SocialIntent = { id: id("intent"), agentId: state.agent?.id ?? "", presenceId: presence.id, affordance: input.affordance, target: input.target, publicationId: publication.id, priority: 50, validity: { staleAfterMs: 60 * 60 * 1000 }, state: executionMode === "off" ? "withdrawn" : "active", formedAt: timestamp, updatedAt: timestamp, origin, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, assignmentId: input.assignmentId, conversationEpisodeId, invocationId: input.invocationId, referencedPeople: input.networkMetadata?.referencedPeople, networkReason: input.networkMetadata?.networkReason, source: input.source ?? (input.operatorDirectiveId ? "operator" : "agent"), operatorDirectiveId: input.operatorDirectiveId, attentionTestId: input.attentionTestId } as SocialIntent & { invocationId?: string };
  if (executionMode === "off") {
    state.publications.unshift(publication);
    state.socialIntents.unshift(intent);
    state.actions.unshift({ id: id("act"), intent: "no_op", target: input.target?.id, summary: input.text.trim() || `Selected ${input.affordance}`, status: "skipped", reason: `${input.affordance} is off in the Presence execution envelope.`, createdAt: timestamp, socialIntentId: intent.id, sessionId: session.id });
    state.events.unshift({ ...event("decision", "Affordance is off", `${presence.name} considered ${input.affordance}, but the operator's execution envelope leaves it off. No execution was created.`, "quiet", { presenceId: presence.id, intentId: intent.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
    return state;
  }
  const leakageReason = identityLeakageReason(state, presence, input.text);
  const runtimeLeakageReasonValue = runtimeContextLeakageReason(input.text);
  const publicExpressionLeakageReasonValue = publicExpressionLeakageReason(input.text);
  const mentionGroundingReason = input.source !== "operator" && !input.operatorDirectiveId
    ? expressionMentionGroundingReason(state, presence, input.target, input.text, session.id)
    : undefined;
  const sourceEchoReason = input.source !== "operator" && !input.operatorDirectiveId
    ? expressionSourceEchoReason(state, presence, input.target, input.text, session.id)
    : undefined;
  const assignment = input.assignmentId ? state.assignments.find((item) => item.id === input.assignmentId) : undefined;
  const assignmentLeakageReason = assignment ? assignmentPublicExpressionLeakageReason(assignment, input.text) : undefined;
  const languageResult = validateLanguage(input.text, effectiveLanguagePolicy(state.agent, presence));
  const languageReason = languageResult.valid ? undefined : "The final expression violates an explicit Never use language rule.";
  const duplicateReason = duplicateAssets.length && !input.assetReuse ? "This exact asset was already used in this Sandbox Presence and needs an explicit reuse reason." : undefined;
  const reviewReason = languageReason ?? duplicateReason ?? publicExpressionLeakageReasonValue ?? assignmentLeakageReason ?? mentionGroundingReason ?? sourceEchoReason ?? leakageReason ?? runtimeLeakageReasonValue ?? (mediaReviewRequired ? "Attached media remains uncertain and this Presence requires review before acting." : undefined);
  const status = languageReason || duplicateReason || publicExpressionLeakageReasonValue || assignmentLeakageReason || mentionGroundingReason || sourceEchoReason ? "blocked" as const : reviewReason ? "awaiting-review" as const : executionMode === "auto" ? "queued" as const : executionMode === "review" ? "awaiting-review" as const : "awaiting-manual" as const;
  const execution: Execution = { id: id("execution"), socialIntentId: intent.id, presenceId: presence.id, affordance: input.affordance, mode: executionMode, status, attempts: 0, bridgeId: `sandbox:${session.environmentId}`, connector: "simulated", idempotencyKey: `sandbox:${session.id}:${intent.id}`, target: input.target, publication, reviewReason, createdAt: timestamp, updatedAt: timestamp, assignmentId: input.assignmentId, conversationEpisodeId, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, invocationId: input.invocationId, source: input.source ?? (input.operatorDirectiveId ? "operator" : "agent"), operatorDirectiveId: input.operatorDirectiveId, attentionTestId: input.attentionTestId } as Execution & { invocationId?: string };
  state.publications.unshift(publication); state.socialIntents.unshift(intent); state.executions.unshift(execution);
  if (languageReason) execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by Never use: " + languageResult.violations.map((item) => item.literal).join(", ") + ".", retryable: false };
  if (duplicateReason) execution.failure = { code: "DUPLICATE_ASSET_CANDIDATE", message: duplicateReason, retryable: false };
  if (publicExpressionLeakageReasonValue) execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionLeakageReasonValue, retryable: false };
  if (assignmentLeakageReason) execution.failure = { code: "ASSIGNMENT_TEXT_LEAKAGE", message: assignmentLeakageReason, retryable: false };
  if (mentionGroundingReason) execution.failure = { code: "UNSUPPORTED_LEADING_MENTION", message: mentionGroundingReason, retryable: false };
  if (sourceEchoReason) execution.failure = { code: "SOURCE_EXPRESSION_ECHO", message: sourceEchoReason, retryable: false };
  state.events.unshift({ ...event("decision", publicExpressionLeakageReasonValue || assignmentLeakageReason || mentionGroundingReason || sourceEchoReason ? "Public text boundary blocked" : leakageReason ? "Identity disclosure needs review" : mediaReviewRequired ? "Media action needs review" : "Social Intent formed", reviewReason ?? `${presence.name} chose ${input.affordance} for the simulated ${channelName(session.channelId)} world.`, publicExpressionLeakageReasonValue || assignmentLeakageReason || mentionGroundingReason || sourceEchoReason || leakageReason || mediaReviewRequired ? "warning" : "positive", { presenceId: presence.id, intentId: intent.id, executionId: execution.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
  return state;
}

export function deliverSandboxExecution(source: OpenPresenceState, executionId: string) {
  let state = cloneState(source);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution || execution.environment !== "sandbox" || execution.connector !== "simulated" || !execution.sessionId || !execution.bridgeId?.startsWith("sandbox:")) throw new Error("Sandbox delivery rejected a non-simulated execution.");
  if (execution.status === "succeeded" && execution.externalRef) return state;
  if (!["queued", "approved"].includes(execution.status)) throw new Error("Sandbox delivery is not ready for execution.");
  const session = sandboxSessionFor(state, execution.sessionId);
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  const publication = intent?.publicationId ? state.publications.find((item) => item.id === intent.publicationId) : undefined;
  if (publication?.assetIds?.length) {
    try {
      authorizeAssetSelection(state, publication.assetIds, { presenceId: execution.presenceId, requireReady: true });
    } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: "ASSET_AUTHORIZATION_FAILED", message: error instanceof Error ? error.message : "The selected Asset cannot be used by this Presence.", retryable: false };
      execution.reviewReason = "Sandbox delivery failed closed at the Asset authorization boundary.";
      execution.updatedAt = now();
      state.events.unshift({ ...event("execution", "Asset authorization blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }), sessionId: session.id });
      return state;
    }
  }
  const text = publication?.payload && typeof publication.payload === "object" && "text" in publication.payload && typeof publication.payload.text === "string" ? publication.payload.text : "";
  if (!text.trim() && !["like", "reaction", "repost", "follow"].includes(execution.affordance)) throw new Error("Sandbox delivery requires a publication draft.");
  const publicExpressionReason = publicExpressionLeakageReason(text);
  if (publicExpressionReason) {
    execution.status = "blocked";
    execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionReason, retryable: false };
    execution.reviewReason = "Sandbox delivery rejected internal Social Planner metadata as public text.";
    execution.updatedAt = now();
    state.events.unshift({ ...event("execution", "Public text boundary blocked", publicExpressionReason, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }), sessionId: session.id });
    return state;
  }
  const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
  if (!presence) throw new Error("The Sandbox Presence is unavailable.");
  if (execution.source !== "operator") {
    const mentionGroundingReason = expressionMentionGroundingReason(state, presence, execution.target, text, session.id);
    const sourceEchoReason = expressionSourceEchoReason(state, presence, execution.target, text, session.id);
    if (mentionGroundingReason || sourceEchoReason) {
      execution.status = "blocked";
      execution.failure = { code: mentionGroundingReason ? "UNSUPPORTED_LEADING_MENTION" : "SOURCE_EXPRESSION_ECHO", message: mentionGroundingReason ?? sourceEchoReason!, retryable: false };
      execution.reviewReason = mentionGroundingReason ?? sourceEchoReason;
      execution.updatedAt = now();
      state.events.unshift({ ...event("execution", "Public text boundary blocked", mentionGroundingReason ?? sourceEchoReason!, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }), sessionId: session.id });
      return state;
    }
  }
  const targetLanguageResult = execution.publication ? targetLanguageValidationForExecution(state, execution) : { valid: true as const };
  if (!targetLanguageResult.valid) {
    execution.status = "blocked";
    execution.failure = { code: "TARGET_LANGUAGE_MISMATCH", message: targetLanguageResult.reason ?? "Delivery blocked because the target post language does not match the Presence language or could not be confirmed.", retryable: false };
    execution.reviewReason = "The target post language is not confirmed to match the Presence language.";
    execution.updatedAt = now();
    state.events.unshift({ ...event("execution", "Target language blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }), sessionId: session.id });
    return state;
  }
  const languageResult = validateLanguage(text, effectiveLanguagePolicy(state.agent, presence));
  if (!languageResult.valid) {
    execution.status = "blocked";
    execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by Never use: " + languageResult.violations.map((item) => item.literal).join(", ") + ".", retryable: false };
    execution.reviewReason = "The final expression violates an explicit lexical language policy.";
    execution.updatedAt = now();
    state.events.unshift({ ...event("execution", "Language policy blocked delivery", execution.failure.message, "warning", { presenceId: presence.id, executionId: execution.id, intentId: execution.socialIntentId }), sessionId: session.id });
    return state;
  }
  const objectId = id("sandbox-post");
  const externalRef = { type: `${session.channelId}.${execution.affordance}`, id: objectId };
  const assetRefs = (publication?.assetIds ?? []).map((assetId, index) => {
    const asset = state.assets.find((item) => item.id === assetId);
    return { assetId, kind: asset?.type === "pdf" || asset?.type === "document" ? "document" as const : asset?.type ?? "image" as const, role: index === 0 && asset?.type !== "link" ? "primary" as const : asset?.type === "link" ? "link-preview" as const : "attachment" as const };
  });
  const isReply = execution.affordance === "reply" || execution.affordance === "x.reply";
  const isMessage = execution.affordance === "message" || execution.affordance === "x.message";
  const object = { id: id("mirror"), bridgeId: `sandbox:${session.environmentId}`, presenceId: presence.id, channelId: session.channelId, externalRef, parentExternalRef: isReply || isMessage ? execution.target : undefined, objectType: execution.affordance, language: presence.language, author: { externalRef: { type: `${session.channelId}.user`, id: `agent:${presence.id}` }, displayName: presence.name, handle: presence.handle }, content: { text: text || undefined, language: presence.language }, assetRefs, occurredAt: session.virtualNow, observedAt: now(), visibility: isMessage ? "direct-message" as const : "public" as const, shareability: "presence-only" as const, originExecutionId: execution.id, actorPresenceId: presence.id, sourceEventId: `sandbox-delivery:${execution.id}`, environment: "sandbox" as const, sessionId: session.id, assignmentId: execution.assignmentId };
  state.mirrorObjects.unshift(object);
  updateConversationEpisodeFromMirror(state, object, presence.id);
  state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: object.bridgeId, presenceId: presence.id, sourceEventId: object.sourceEventId!, event: "created", externalRef, object, receivedAt: now(), environment: "sandbox", sessionId: session.id });
  const deliveredIntent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  const recipientActorId = execution.target?.id;
  const recipientPersonId = recipientActorId ? state.personIdentities.find((identity) => identity.channel === presence.channel && identity.externalActorId === recipientActorId)?.personId : undefined;
  for (const reference of deliveredIntent?.referencedPeople ?? []) {
    if (reference.purpose !== "recommendation" || state.recommendationRecords.some((item) => item.sourceSocialIntentId === deliveredIntent?.id && item.candidateId === reference.candidateId)) continue;
    state.recommendationRecords.unshift({
      id: id("recommendation"),
      agentId: state.agent?.id ?? "",
      presenceId: presence.id,
      recipientPersonId,
      recipientActorId,
      recommendedPersonId: reference.personId,
      candidateId: reference.candidateId,
      sourceSocialIntentId: deliveredIntent?.id ?? execution.socialIntentId,
      rationale: deliveredIntent?.networkReason ?? "The Agent selected this candidate as relevant to the delivered social act.",
      evidenceRefs: [{ kind: "social_intent", id: deliveredIntent?.id ?? execution.socialIntentId }, { kind: "mirror_object", id: object.id, sourcePresenceId: presence.id, observedAt: object.observedAt }],
      visibility: `presence:${presence.id}`,
      deliveredAt: now(),
    });
  }
  const repliedToId = execution.target?.id;
  execution.status = "succeeded"; execution.attempts += 1; execution.externalRef = externalRef; execution.executedAt = now(); execution.updatedAt = now();
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: presence.id, status: "succeeded", observedAt: now(), metrics: {}, evidence: [externalRef], environment: "sandbox", sessionId: session.id, conversationEpisodeId: execution.conversationEpisodeId };
  state.outcomes.unshift(outcome);
  if (execution.assignmentId && execution.conversationEpisodeId && ["reply", "comment", "quote", "repost", "message", "like", "reaction"].includes(execution.affordance)) {
    const existingContribution = state.assignmentContributions.find((item) => item.assignmentId === execution.assignmentId && item.conversationEpisodeId === execution.conversationEpisodeId && item.deliverableKind === execution.affordance);
    if (existingContribution) {
      if (!existingContribution.verifiedOutcomeIds.includes(outcome.id)) existingContribution.verifiedOutcomeIds.push(outcome.id);
    } else {
      state.assignmentContributions.unshift({ id: id("assignment-contribution"), assignmentId: execution.assignmentId, conversationEpisodeId: execution.conversationEpisodeId, engagementEpisodeId: execution.conversationEpisodeId, deliverableKind: execution.affordance, counted: true, sharedEvidence: false, verifiedOutcomeIds: [outcome.id] });
    }
  }
  if (publication) {
    const usageType = execution.affordance === "reply" ? "quote" : publication.assetReuse?.usageType ?? "new";
    for (const assetId of publication.assetIds) {
      if (state.assetUsages.some((usage) => usage.assetId === assetId && usage.publicationId === publication.id && usage.environment === "sandbox")) continue;
      state.assetUsages.unshift({ id: id("asset-usage"), assetId, agentId: state.agent?.id ?? "", presenceId: presence.id, publicationId: publication.id, socialIntentId: execution.socialIntentId, assignmentId: execution.assignmentId, channelId: session.channelId, environment: "sandbox", usageType, reuseReason: publication.assetReuse?.reason, publishedAt: now() });
    }
  }
  if (execution.assignmentId) {
    const assignment = state.assignments.find((item) => item.id === execution.assignmentId);
    if (assignment) {
      assignment.progress.verified += 1;
      assignment.status = assignmentIsSatisfied(assignment) ? "completed" : "active";
      assignment.work = { ...(assignment.work ?? { phase: "publishing", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: assignmentIsSatisfied(assignment) ? "completed" : "candidate_review" };
      assignment.updatedAt = now();
      assignment.lastOutcome = { class: assignmentIsSatisfied(assignment) ? "assignment_completed" : "incomplete", message: assignmentIsSatisfied(assignment) ? "Verified publication satisfied the requested deliverable." : "Verified publication recorded; more work remains.", at: now() };
      assignment.attemptHistory = [...(assignment.attemptHistory ?? []), { id: id("assignment-attempt"), attempt: assignment.work.attempts, phase: assignment.work.phase, outcome: assignment.lastOutcome.class, message: assignment.lastOutcome.message, at: assignment.lastOutcome.at }].slice(-24);
      state.events.unshift({ ...event("execution", assignmentIsSatisfied(assignment) ? "Assignment complete" : "Assignment progress updated", `${assignment.progress.verified} / ${assignment.progress.required} verified publications.`, "positive", { presenceId: presence.id, executionId: execution.id }), sessionId: session.id });
    }
  }
  if (repliedToId) {
    const repliedTo = state.mirrorObjects.find((item) => item.externalRef.id === repliedToId && item.actorPresenceId !== presence.id);
    if (repliedTo) state = curateRelationshipFromMirror(state, repliedTo, presence.id);
  }
  state.events.unshift({ ...event("execution", "Sandbox delivery complete", `The ${channelName(session.channelId)} object is visible in this simulated world only.`, "positive", { presenceId: presence.id, executionId: execution.id }), sessionId: session.id });
  return state;
}

export function recordSandboxNetworkSearch(source: OpenPresenceState, input: { sessionId: string; presenceId: string; result: import("./network").NetworkSearchResult }) {
  const state = cloneState(source);
  const timestamp = now();
  const searchId = id("network-search");
  state.networkSearches.unshift({ id: searchId, sessionId: input.sessionId, presenceId: input.presenceId, query: input.result.query, status: input.result.status, candidates: input.result.candidates, limitation: input.result.limitation, createdAt: timestamp });
  const detail = input.result.status === "matches"
    ? `The Agent found ${input.result.candidates.length} verified sandbox candidate${input.result.candidates.length === 1 ? "" : "s"}. Search retrieved evidence only; no relationship or introduction was created.`
    : input.result.limitation ?? "No verified network match was found.";
  state.events.unshift({ ...event("decision", "Network search completed", detail, input.result.status === "matches" ? "positive" : "warning", { presenceId: input.presenceId }), sessionId: input.sessionId });
  return state;
}

export function approveSandboxIntroduction(source: OpenPresenceState, introductionId: string) {
  let state = cloneState(source);
  const introduction = state.networkIntroductions.find((item) => item.id === introductionId);
  if (!introduction || !["proposed", "awaiting-consent"].includes(introduction.status)) throw new Error("That simulated introduction is no longer awaiting approval.");
  const session = sandboxSessionFor(state, introduction.sessionId);
  const candidate = state.sandboxActors.find((item) => item.id === introduction.candidateActorId && item.sessionId === session.id);
  const presence = state.presences.find((item) => item.id === introduction.presenceId) ?? state.presence;
  if (!candidate || !presence) throw new Error("The verified network candidate is no longer available.");
  if (candidate.profile?.introductionPermission === "not-available") throw new Error("This candidate is not available for introduction.");
  const beforeExecutionIds = new Set(state.executions.map((item) => item.id));
  state = formSandboxIntent(state, { sessionId: session.id, affordance: "message", target: { type: "sandbox.actor", id: candidate.id }, text: `A simulated introduction request is ready for ${candidate.displayName}.` });
  const execution = state.executions.find((item) => !beforeExecutionIds.has(item.id));
  const intent = execution ? state.socialIntents.find((item) => item.id === execution.socialIntentId) : state.socialIntents.find((item) => item.sessionId === session.id && item.target?.id === candidate.id);
  const current = state.networkIntroductions.find((item) => item.id === introductionId)!;
  current.status = "approved";
  current.socialIntentId = intent?.id;
  current.executionId = execution?.id;
  current.updatedAt = now();
  state.events.unshift({ ...event("decision", "Sandbox introduction approved", `${presence.name} approved a truthful introduction path for ${candidate.displayName}. Delivery remains governed by the Presence message execution envelope.`, "positive", { presenceId: presence.id, intentId: intent?.id, executionId: execution?.id }), sessionId: session.id });
  if (execution?.status === "queued" && execution.connector === "simulated") {
    state = deliverSandboxExecution(state, execution.id);
    const updated = state.networkIntroductions.find((item) => item.id === introductionId);
    if (updated) { updated.status = "succeeded"; updated.updatedAt = now(); }
  }
  return state;
}

export function declineSandboxIntroduction(source: OpenPresenceState, introductionId: string) {
  const state = cloneState(source);
  const introduction = state.networkIntroductions.find((item) => item.id === introductionId);
  if (!introduction || !["proposed", "awaiting-consent"].includes(introduction.status)) throw new Error("That simulated introduction is no longer awaiting a decision.");
  introduction.status = "declined";
  introduction.updatedAt = now();
  state.events.unshift({ ...event("decision", "Sandbox introduction declined", "The Agent kept the verified candidate in the directory without contacting them.", "quiet", { presenceId: introduction.presenceId }), sessionId: introduction.sessionId });
  return state;
}

function migrateLegacyDefaultModel(state: OpenPresenceState) {
  const profile = state.agent ? state.modelProfiles.find((item) => item.agentId === state.agent?.id) : undefined;
  if (!profile || profile.provider !== "anthropic" || profile.model !== "claude" || profile.quality !== "high") return;
  const anthropicIsConfigured = state.providerConnections.some((connection) => connection.provider === "anthropic" && (connection.status !== "needs-configuration" || connection.secretConfigured));
  if (anthropicIsConfigured) return;

  const openAiConnection = state.providerConnections.find((connection) => connection.provider === "openai");
  if (!openAiConnection) state.providerConnections.push({ id: `connection_${state.agent!.id}_openai`, provider: "openai", label: "OpenAI", status: "needs-configuration", createdAt: profile.updatedAt });
  profile.provider = DEFAULT_MODEL.provider;
  profile.model = DEFAULT_MODEL.model;
  profile.quality = DEFAULT_MODEL.quality;
  profile.connectionId = state.providerConnections.find((connection) => connection.provider === "openai")?.id;
  profile.updatedAt = now();
}

function normalizeAssignment(input: Assignment): Assignment {
  const quantity = input.quantityPolicy?.quantity ?? input.deliverable?.quantity;
  const mode = canonicalAssignmentQuantityMode(input.quantityPolicy?.mode ?? input.deliverable?.quantityMode);
  const recurrence = input.recurrence;
  const activation = input.activation ?? (input.schedule
    ? { type: "scheduled" as const, recurrence, deadline: input.timeframe?.deadline }
    : { type: "manual" as const });
  const origin = input.origin ?? (input.deliverable?.type === "original_publication" && input.schedule ? "schedule" : "manual");
  const required = input.progress?.required ?? (typeof quantity === "number" ? quantity : 0);
  const inferredSeedId = input.instruction.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s/]+\/status\/(\d+)/i)?.[1];
  return {
    ...input,
    title: input.title ?? input.instruction,
    origin,
    activation,
    seed: input.seed ?? (inferredSeedId ? { externalRef: { type: "x.post", id: inferredSeedId }, role: input.deliverable?.type === "meaningful_engagement" ? "distributable_target" : "required_target", availability: "unknown" } : undefined),
    deliverable: { ...input.deliverable, type: input.deliverable?.type ?? "custom", quantity: typeof quantity === "number" ? quantity : undefined, quantityMode: mode },
    quantityPolicy: input.quantityPolicy ?? { quantity: typeof quantity === "number" ? quantity : "agent_planned", mode, period: recurrence?.kind === "weekly" ? "week" : recurrence?.kind === "daily" || recurrence?.kind === "weekdays" ? "day" : "assignment" },
    revision: input.revision ?? 0,
    progress: { required, verified: input.progress?.verified ?? 0 },
    work: input.work ?? { phase: input.status === "blocked" ? "blocked" as const : input.status === "completed" ? "completed" as const : "candidate_review" as const, attempts: input.rejectedCandidates ?? 0, maxAttempts: Math.min(12, Math.max(4, required * 4 || 4)), storiesResearched: 0 },
    attemptHistory: input.attemptHistory ?? [],
    storyResearch: input.storyResearch ?? [],
  };
}

type LegacyAssignmentRecord = Partial<Assignment> & {
  assignmentId?: string;
  presence?: string;
  label?: string;
  day?: string;
  time?: string;
  objective?: string;
  mode?: import("./types").ExecutionMode;
  enabled?: boolean;
  executionWindow?: string;
  standingIntentId?: string;
};

function isLegacyAssignmentRecord(input: LegacyAssignmentRecord) {
  return !input.presenceId
    || !input.environment
    || !input.status
    || Boolean(input.presence || input.day || input.time || input.executionWindow);
}

/**
 * Calendar records were historically stored as `CalendarSlot`-shaped objects
 * in the assignments collection. Keep those records, but give them the
 * canonical Assignment identity used by the current Schedule and run ledger.
 * This is deliberately deterministic: a read/refresh must never manufacture
 * a new Assignment or leave a calendar link dangling.
 */
function canonicalizeLegacyAssignment(source: OpenPresenceState, input: LegacyAssignmentRecord, slot?: CalendarSlot): Assignment {
  const presenceId = input.presenceId ?? input.presence ?? slot?.presence;
  const presence = source.presences.find((item) => item.id === presenceId) ?? source.presence;
  if (!presence || !source.agent) throw new Error("Cannot repair an Assignment without its owning Agent and Presence.");
  const instruction = (input.instruction ?? input.label ?? input.objective ?? slot?.instruction ?? slot?.label ?? "Evaluate a useful idea for the audience").trim();
  const schedule = input.schedule ?? (input.day || input.time || slot ? {
    day: input.day ?? slot?.day ?? "Monday",
    time: input.time ?? slot?.time ?? "08:00",
    executionWindow: input.executionWindow ?? slot?.executionWindow ?? "08:00–11:00",
  } : undefined);
  const environment = input.environment ?? presence.environment ?? "sandbox";
  const delegationPolicy = input.executionPolicy?.delegationPolicy ?? "keep_moving";
  const compiled = compileAssignmentInstruction(source, instruction, presence.id, environment, input.sessionId, schedule, delegationPolicy, input.objective);
  const canonicalId = input.assignmentId ?? slot?.assignmentId ?? input.id ?? compiled.id;
  const status = input.status ?? (input.enabled === false || slot?.enabled === false ? "paused" : input.mode === "auto" || slot?.mode === "auto" ? "active" : "draft");
  const createdAt = input.createdAt ?? input.updatedAt ?? slot?.lastEvaluatedAt ?? compiled.createdAt;
  const updatedAt = input.updatedAt ?? input.createdAt ?? slot?.lastEvaluatedAt ?? createdAt;
  return {
    ...compiled,
    ...input,
    id: canonicalId,
    agentId: input.agentId ?? source.agent.id,
    presenceId: presence.id,
    channelId: input.channelId ?? presence.channel,
    environment,
    title: input.title ?? instruction,
    origin: input.origin ?? (schedule ? "schedule" : "manual"),
    activation: schedule ? { type: "scheduled", recurrence: input.recurrence ?? compiled.recurrence, deadline: input.timeframe?.deadline } : input.activation ?? { type: "manual" },
    instruction,
    deliverable: { ...compiled.deliverable, ...(input.deliverable ?? {}) },
    quantityPolicy: input.quantityPolicy ?? compiled.quantityPolicy,
    schedule,
    executionPolicy: input.executionPolicy ?? compiled.executionPolicy,
    status,
    progress: { ...compiled.progress, ...(input.progress ?? {}) },
    createdAt,
    updatedAt,
  };
}

function canonicalizeAssignmentRecords(source: OpenPresenceState, rawAssignments: Assignment[], calendar: CalendarSlot[]) {
  const repaired: Assignment[] = [];
  const byId = new Map<string, Assignment>();
  const legacyInputs = rawAssignments as unknown as LegacyAssignmentRecord[];
  for (const input of legacyInputs) {
    const matchingSlot = calendar.find((slot) => slot.id === input.id
      || slot.assignmentId === input.id
      || (slot.presence === (input.presenceId ?? input.presence)
        && slot.instruction === input.instruction
        && slot.day === input.day
        && slot.time === input.time));
    const candidate = isLegacyAssignmentRecord(input)
      ? canonicalizeLegacyAssignment(source, input, matchingSlot)
      : normalizeAssignment(input as Assignment);
    const existing = byId.get(candidate.id);
    if (existing) {
      // Prefer the already-canonical record's lifecycle, progress, and audit
      // history; only fill missing durable fields from the legacy projection.
      Object.assign(existing, {
        ...candidate,
        id: existing.id,
        status: existing.status,
        progress: existing.progress,
        work: existing.work ?? candidate.work,
        attemptHistory: existing.attemptHistory?.length ? existing.attemptHistory : candidate.attemptHistory,
        storyResearch: existing.storyResearch?.length ? existing.storyResearch : candidate.storyResearch,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      });
      continue;
    }
    byId.set(candidate.id, candidate);
    repaired.push(candidate);
  }
  for (const slot of calendar) {
    if (!slot.enabled) continue;
    let assignment = slot.assignmentId ? byId.get(slot.assignmentId) : undefined;
    if (!assignment) {
      assignment = repaired.find((item) => item.presenceId === slot.presence
        && item.instruction === slot.instruction
        && item.schedule?.day === slot.day
        && item.schedule?.time === slot.time);
    }
    if (!assignment) {
      assignment = canonicalizeLegacyAssignment(source, slot as unknown as LegacyAssignmentRecord, slot);
      byId.set(assignment.id, assignment);
      repaired.push(assignment);
    }
    slot.assignmentId = assignment.id;
  }
  return repaired;
}

const assignmentStatuses = new Set(["draft", "accepted", "planning", "active", "working", "awaiting_execution", "awaiting_review", "needs_operator", "paused", "blocked", "completed", "completed_with_adaptation", "failed", "expired_incomplete", "cancelled"]);

export function assignmentPersistenceIssues(state: OpenPresenceState) {
  const issues: string[] = [];
  const agentId = state.agent?.id;
  const presenceIds = new Set(state.presences.map((presence) => presence.id));
  const assignmentIds = new Set<string>();
  for (const assignment of state.assignments) {
    if (!assignment.id) issues.push("an Assignment is missing its id");
    if (assignmentIds.has(assignment.id)) issues.push(`Assignment ${assignment.id} is duplicated`);
    assignmentIds.add(assignment.id);
    if (!agentId || assignment.agentId !== agentId) issues.push(`Assignment ${assignment.id} is not owned by the active Agent`);
    if (!presenceIds.has(assignment.presenceId)) issues.push(`Assignment ${assignment.id} points to a missing Presence`);
    if (!(assignment.environment === "sandbox" || assignment.environment === "live")) issues.push(`Assignment ${assignment.id} has no valid environment`);
    if (!assignment.instruction?.trim()) issues.push(`Assignment ${assignment.id} has no instruction`);
    if (!assignment.deliverable || !assignment.executionPolicy) issues.push(`Assignment ${assignment.id} is missing its execution contract`);
    if (!assignmentStatuses.has(assignment.status)) issues.push(`Assignment ${assignment.id} has an invalid status`);
    if (!Number.isFinite(assignment.progress?.required) || !Number.isFinite(assignment.progress?.verified)) issues.push(`Assignment ${assignment.id} has invalid progress`);
    if (!assignment.createdAt || !assignment.updatedAt) issues.push(`Assignment ${assignment.id} is missing audit timestamps`);
  }
  for (const slot of state.calendar) {
    if (slot.assignmentId && !assignmentIds.has(slot.assignmentId)) issues.push(`Calendar slot ${slot.id} points to missing Assignment ${slot.assignmentId}`);
  }
  return issues;
}

export function assertAssignmentPersistenceInvariant(state: OpenPresenceState) {
  const issues = assignmentPersistenceIssues(state);
  if (issues.length) throw new Error(`Assignment persistence invariant failed; refusing to save: ${issues.slice(0, 8).join("; ")}`);
}

/** Repair legacy X mirrors that lost reply provenance at ingestion. */
function repairNativeReplyClassifications(state: OpenPresenceState) {
  const executions = new Map(state.executions.map((execution) => [execution.id, execution] as const));
  const presences = new Map(state.presences.map((presence) => [presence.id, presence] as const));
  return state.mirrorObjects.map((object) => {
    if (object.channelId !== "x" || object.environment === "sandbox" || object.externalRef.type !== "x.post" || object.objectType === "reply") return object;
    const execution = object.originExecutionId ? executions.get(object.originExecutionId) : undefined;
    const presence = presences.get(object.presenceId);
    const publicHandle = presence ? (presence.context.publicIdentity.handle ?? presence.handle).replace(/^@/, "").toLowerCase() : "";
    const authorHandle = object.author?.handle?.replace(/^@/, "").toLowerCase() ?? "";
    const authoredByPresence = object.actorPresenceId === object.presenceId || Boolean(publicHandle && authorHandle && publicHandle === authorHandle);
    const isReply = execution?.affordance === "x.reply" || Boolean(object.parentExternalRef && authoredByPresence);
    return isReply ? { ...object, objectType: "reply" } : object;
  });
}

/** Rehydrate verified native reactions that predate Social Mirror projection. */
function repairNativeReactionMirrors(state: OpenPresenceState) {
  const mirrored = new Set(state.mirrorObjects.map((object) => `${object.presenceId}:${object.externalRef.type}:${object.externalRef.id}`));
  for (const execution of state.executions) {
    if (execution.connector !== "native" || execution.status !== "succeeded" || !execution.externalRef || !["x.like", "x.repost"].includes(execution.externalRef.type) || execution.target?.type !== "x.post") continue;
    const key = `${execution.presenceId}:${execution.externalRef.type}:${execution.externalRef.id}`;
    if (mirrored.has(key)) continue;
    const presence = state.presences.find((item) => item.id === execution.presenceId);
    const observedAt = execution.executedAt ?? execution.updatedAt ?? execution.createdAt;
    state.mirrorObjects.unshift({
      id: id("mirror"), bridgeId: `native:${execution.presenceId}`, presenceId: execution.presenceId, channelId: "x",
      externalRef: execution.externalRef, parentExternalRef: execution.target, objectType: execution.externalRef.type === "x.like" ? "like" : "repost",
      author: { displayName: presence?.name ?? "Presence", handle: presence?.handle }, occurredAt: observedAt, observedAt,
      visibility: "public", shareability: "presence-only", originExecutionId: execution.id, actorPresenceId: execution.presenceId,
      archived: false, environment: execution.environment, source: "native", trust: "untrusted_world_content",
    });
    mirrored.add(key);
  }
  return state.mirrorObjects;
}

/**
 * Legacy Chrome/native reply failures were sometimes recorded before the
 * authoritative X lookup ran. They are ambiguous delivery outcomes, not
 * proven failures: keep them in the verification queue until X confirms the
 * exact account, parent, and text. This is an in-memory migration so the
 * audit record remains intact and no historical execution is deleted.
 */
function repairLegacyXVerificationStatus(execution: Execution): Execution {
  if (execution.environment === "sandbox"
    || !["native", "bridge"].includes(execution.connector ?? "")
    || !["reply", "x.reply"].includes(execution.affordance)
    || execution.status !== "failed"
    || execution.failure?.reviewedAt) return execution;
  const failure = `${execution.failure?.code ?? ""} ${execution.failure?.message ?? ""}`;
  const ambiguous = /RESULT_NOT_VERIFIED|X_API_VERIFICATION_PENDING|public result|verification was not yet available|could not be verified/i.test(failure);
  if (!ambiguous) return execution;
  return {
    ...execution,
    status: "verification-pending",
    failure: {
      ...execution.failure,
      code: "X_API_VERIFICATION_PENDING",
      message: "The public outcome was not proven either way. OpenPresence is waiting for an exact X account, parent, and reply-text match before deciding whether this was delivered.",
      retryable: true,
    },
    reviewReason: execution.reviewReason ?? `Legacy ambiguous X delivery retained for verification; prior signal was ${execution.failure?.code ?? "an unverified result"}.`,
    lease: undefined,
    updatedAt: now(),
  };
}

/** Close work whose Assignment reference disappeared during workspace recovery. */
function repairOrphanedAssignmentExecution(execution: Execution, assignmentIds: ReadonlySet<string>, socialIntents: SocialIntent[], actions: ActionRecord[]): Execution {
  if (!execution.assignmentId || assignmentIds.has(execution.assignmentId) || ["succeeded", "failed", "blocked", "cancelled", "expired", "verification-closed"].includes(execution.status)) return execution;
  const queued = ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"].includes(execution.status);
  const ambiguous = ["claimed", "executing", "verification-pending"].includes(execution.status);
  if (!queued && !ambiguous) return execution;
  const at = execution.updatedAt || execution.createdAt;
  const intent = socialIntents.find((item) => item.id === execution.socialIntentId);
  if (intent?.state === "active") { intent.state = "expired"; intent.updatedAt = at; }
  const action = actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "skipped"; action.reason = "The original Assignment no longer exists, so this delivery was closed without a retry."; }
  return {
    ...execution,
    status: ambiguous ? "verification-closed" : "expired",
    lease: undefined,
    permit: undefined,
    failure: {
      ...execution.failure,
      code: "ORPHANED_ASSIGNMENT",
      message: ambiguous
        ? "The original Assignment no longer exists and the external outcome could not be verified. OpenPresence closed this delivery to prevent a duplicate."
        : "The original Assignment no longer exists. OpenPresence closed this undelivered action without retrying it.",
      retryable: false,
      reviewedAt: execution.failure?.reviewedAt ?? at,
      reviewDisposition: "operator_action_required",
      reviewNote: "Recovered automatically from an orphaned Assignment reference.",
    },
    reviewReason: "The original Assignment was removed or lost during workspace recovery; no new delivery will be attempted.",
    updatedAt: at,
  };
}

function normalizeState(raw: OpenPresenceState): OpenPresenceState {
  const state = raw as OpenPresenceState & { presences?: Presence[]; conversations?: import("./types").Conversation[]; activeConversationId?: string | null; activePresenceId?: string | null; presenceChatSessions?: import("./types").PresenceChatSession[] };
  const agents = (state.agents?.length ? state.agents : state.agent ? [state.agent] : []).map((agent) => ({ ...agent, conversationStyleId: agent.conversationStyleId ?? DEFAULT_CONVERSATION_STYLE_ID, languagePolicy: normalizeLanguagePolicy((agent as Agent & { languagePolicy?: LanguagePolicy }).languagePolicy) }));
  const activeAgentId = state.activeAgentId ?? state.agent?.id ?? agents[0]?.id ?? null;
  const activeAgent = agents.find((item) => item.id === activeAgentId) ?? agents[0];
  const fallbackBrief = defaultPresenceBrief(activeAgent);
  const fallbackPresence = state.presence ? hydratePresence(state.presence, fallbackBrief) : null;
  const presences = state.presences?.length ? state.presences.map((item) => hydratePresence(item, fallbackBrief)) : fallbackPresence ? [fallbackPresence] : [];
  const activePresenceId = state.activePresenceId ?? presences[0]?.id ?? null;
  const legacyMessages = state.messages ?? [];
  const conversations = (state.conversations?.length ? state.conversations : [{ id: id("conversation"), title: legacyMessages.length ? "Earlier conversation" : "New conversation", createdAt: now(), updatedAt: now(), messages: legacyMessages }]).map((conversation) => ({
    ...conversation,
    // Presence settings used to be mirrored into Chat as synthetic agent turns.
    // Keep real conversation history, but hide those legacy records when old
    // local state is read so the transcript is repaired without a destructive
    // database migration.
    messages: conversation.messages.filter((message) => !(message.id.startsWith("state_") && message.role === "agent" && message.change === "Presence state updated")),
  }));
  const activeConversationId = state.activeConversationId ?? conversations[0]?.id ?? null;
  const calendar = (state.calendar ?? []).map((slot) => ({ ...slot, instruction: slot.instruction || slot.label || "Evaluate a useful idea for the audience", executionWindow: slot.executionWindow || "08:00–11:00" }));
  const watches = (state.watches ?? []).filter((watch) => !isRecoveredRelationshipWatch(watch));
  const base = initialState();
  const existingSkills = (state.skills ?? []).map((skill) => ({ ...skill, name: skill.name ?? skill.id.replaceAll("-", " ") }));
  const skills = [...defaultSkills().filter((skill) => !existingSkills.some((item) => item.id === skill.id)), ...existingSkills];
  const existingSkillIds = new Set((state.agentSkills ?? []).map((binding) => binding.skillId));
  const agentSkills = [...(state.agentSkills ?? []), ...defaultSkills().filter((skill) => !existingSkillIds.has(skill.id)).map((skill) => ({ id: id("agent-skill"), agentId: activeAgentId ?? "", skillId: skill.id, enabled: true }))];
  const providerConnections = (state.providerConnections ?? []).map((connection) => ({ ...connection, label: providerName(connection.provider) }));
  const toolBindings = [...(state.toolBindings ?? [])];
  if (activeAgentId) {
    for (const toolId of ["evidence.search", "asset.inspect"] as const) {
      if (!toolBindings.some((binding) => binding.agentId === activeAgentId && binding.toolId === toolId)) {
        toolBindings.push({ id: id("binding"), agentId: activeAgentId, toolId, enabled: true });
      }
    }
  }
  const lifecycleState = { ...state, presences };
  const normalizedPresences = presences.map((item) => {
    const inferredCreatedAt = item.createdAt ?? presenceGrowthBoundary(lifecycleState, item.id).startAt;
    const migrated = { ...migrateBuiltInXCapabilities(item), ...(inferredCreatedAt ? { createdAt: inferredCreatedAt } : {}), conversationStyleId: item.conversationStyleId ?? DEFAULT_CONVERSATION_STYLE_ID, languagePolicy: normalizeLanguagePolicy((item as Presence & { languagePolicy?: LanguagePolicy }).languagePolicy), requestPolicy: item.requestPolicy ?? defaultPresenceRequestPolicy(item.id) };
    const nativeConn = (state.nativeConnections ?? []).find((c) => c.presenceId === item.id && (c.kind === "x" || c.channelId === "x"));
    if (migrated.status === "live" && migrated.channel === "x" && migrated.environment !== "sandbox" && xCreditsExhausted(nativeConn)) {
      return { ...migrated, status: "paused" as const };
    }
    return migrated;
  });
  const hydratedPresence = normalizedPresences.find((item) => item.id === activePresenceId) ?? normalizedPresences[0] ?? null;
  const channelDefinitions = (state.channelDefinitions?.length ? state.channelDefinitions : base.channelDefinitions).map((definition) => {
    const builtin = base.channelDefinitions.find((item) => item.id === definition.id);
    if (!builtin || definition.id !== "x") return definition;
    return { ...definition, affordances: [...builtin.affordances.filter((item) => !definition.affordances.some((current) => current.id === item.id)), ...definition.affordances], supportedAssetKinds: [...new Set([...(builtin.supportedAssetKinds ?? []), ...(definition.supportedAssetKinds ?? [])])] };
  });
  const normalized = { ...base, ...state, agents, agent: agents.find((item) => item.id === activeAgentId) ?? agents[0] ?? null, activeAgentId, agentWorkspaces: state.agentWorkspaces ?? [], workspaceRevision: state.workspaceRevision, presence: hydratedPresence, presences: normalizedPresences, activePresenceId, conversations, activeConversationId, presenceChatSessions: state.presenceChatSessions ?? [], operatorConversations: state.operatorConversations ?? [], operatorNudges: state.operatorNudges ?? [], agentRequests: (state.agentRequests ?? []).filter((request) => request.kind !== "capability"), capabilityChangeEvents: state.capabilityChangeEvents ?? [], calendar, assignments: [] as Assignment[], assignmentRuns: state.assignmentRuns ?? [], growthReviews: state.growthReviews ?? [], growthRevisions: state.growthRevisions ?? [], growthEvidenceSnapshots: state.growthEvidenceSnapshots ?? [], growthFileVersions: state.growthFileVersions ?? [], audienceSnapshots: state.audienceSnapshots ?? [], publicationMetricSnapshots: state.publicationMetricSnapshots ?? [], watches, watchSignals: state.watchSignals ?? [], relationshipPolicies: state.relationshipPolicies ?? [], relationshipStudies: state.relationshipStudies ?? [], relationshipInsightSets: state.relationshipInsightSets ?? [], presenceRequestPolicies: state.presenceRequestPolicies ?? [], delegationGrants: state.delegationGrants ?? [], publicRequests: state.publicRequests ?? [], explorations: state.explorations ?? [], discoveryPlans: state.discoveryPlans ?? [], explorationSessions: state.explorationSessions ?? [], explorationFindings: state.explorationFindings ?? [], messages: conversations.find((item) => item.id === activeConversationId)?.messages ?? legacyMessages, modelProfiles: state.modelProfiles ?? [], providerConnections, assetProviderConnections: state.assetProviderConnections ?? [], toolBindings: toolBindings.map((binding) => ({ ...binding, enabled: binding.enabled !== false })), changeSets: state.changeSets ?? [], standingIntents: state.standingIntents ?? [], operatorDirectives: state.operatorDirectives ?? [], socialDecisions: state.socialDecisions ?? [], autobiographicalEvents: state.autobiographicalEvents ?? [], autobiographicalReflections: state.autobiographicalReflections ?? [], resourceUsageEvents: state.resourceUsageEvents ?? [], attentionEpisodes: state.attentionEpisodes ?? [], socialIntents: state.socialIntents ?? [], assetCollections: state.assetCollections ?? [], assetCollectionMemberships: state.assetCollectionMemberships ?? [], assetMetadataEdits: state.assetMetadataEdits ?? [], assetProcessingJobs: state.assetProcessingJobs ?? [], executions: (state.executions ?? []).map((execution) => {
    const repaired = repairLegacyXVerificationStatus(execution);
    if (repaired !== execution) return repaired;
    if (execution.failure && isTerminalDuplicateExecution(execution)) {
      return { ...execution, failure: { ...execution.failure, code: execution.failure.code ?? "DUPLICATE_CONTENT", retryable: false }, reviewReason: execution.reviewReason ?? "Already published on X; close this exact attempt without retrying it." };
    }
    return execution;
  }), outcomes: state.outcomes ?? [], attentionTests: state.attentionTests ?? [], capabilityTrials: state.capabilityTrials ?? [], publications: state.publications ?? [], assetUsages: state.assetUsages ?? [], sourceEvidence: state.sourceEvidence ?? [], claimGrounding: state.claimGrounding ?? [], preferenceEvidence: state.preferenceEvidence ?? [], originalPostRehearsals: state.originalPostRehearsals ?? [], librarySources: state.librarySources ?? [], assets: state.assets ?? [], perceptions: state.perceptions ?? [], assetResearchSessions: state.assetResearchSessions ?? [], skills, agentSkills, contentDrops: state.contentDrops ?? [], channelDefinitions, nativeConnections: state.nativeConnections ?? [], bridges: state.bridges ?? [], mirrorObjects: state.mirrorObjects ?? [], mirrorEvents: state.mirrorEvents ?? [], bridgeSync: state.bridgeSync ?? [], conversationEpisodes: state.conversationEpisodes ?? [], assignmentContributions: state.assignmentContributions ?? [], people: state.people ?? [], personIdentities: state.personIdentities ?? [], relationships: state.relationships ?? [], relationshipFacts: state.relationshipFacts ?? [], relationshipOpenLoops: state.relationshipOpenLoops ?? [], recommendationRecords: state.recommendationRecords ?? [], introductionRecords: state.introductionRecords ?? [], sandboxEnvironments: state.sandboxEnvironments ?? [], playgroundSessions: (state.playgroundSessions ?? []).map((session) => ({ ...session, virtualTimeMode: session.virtualTimeMode ?? "realtime", worldRevision: session.worldRevision ?? 1 })), sandboxActors: state.sandboxActors ?? [], networkSearches: state.networkSearches ?? [], networkIntroductions: state.networkIntroductions ?? [], scenarios: state.scenarios ?? [], scenarioVersions: state.scenarioVersions ?? [], scenarioRuns: state.scenarioRuns ?? [], scenarioRunProvenance: state.scenarioRunProvenance ?? [], scenarioEvaluations: state.scenarioEvaluations ?? [], knowledgeDocuments: state.knowledgeDocuments ?? [], knowledgeVersions: state.knowledgeVersions ?? [], knowledgeSegments: state.knowledgeSegments ?? [], presenceKnowledgeAccess: state.presenceKnowledgeAccess ?? [], mindFileKnowledgeBindings: state.mindFileKnowledgeBindings ?? [], knowledgeRetrievalRuns: state.knowledgeRetrievalRuns ?? [], knowledgeCitations: state.knowledgeCitations ?? [], knowledgeCollections: state.knowledgeCollections ?? [], knowledgeItems: state.knowledgeItems ?? [], presenceKnowledgeBindings: state.presenceKnowledgeBindings ?? [], operationalRuns: state.operationalRuns ?? [], scheduledWakes: state.scheduledWakes ?? [], dependencyHealth: state.dependencyHealth ?? [], recoveryIncidents: state.recoveryIncidents ?? [], recoveryAttempts: state.recoveryAttempts ?? [], browserBodies: state.browserBodies ?? [],
    conversationStyles: state.conversationStyles ?? [], editorialOpportunities: state.editorialOpportunities ?? [],
    editorialFeedbackEvents: state.editorialFeedbackEvents ?? [],
    editorialReferences: state.editorialReferences && state.editorialReferences.length > 0
      ? state.editorialReferences
      : (activePresenceId ? seedDefaultEditorialReferences(activePresenceId) : (state.presence?.id ? seedDefaultEditorialReferences(state.presence.id) : [])),
    sourceAssets: state.sourceAssets ?? [],
    mediaPerceptions: state.mediaPerceptions ?? [],
    verificationRecords: state.verificationRecords ?? [],
    rightsAssessments: state.rightsAssessments ?? [],
    editorialDecisions: state.editorialDecisions ?? [],
    publicationPackages: state.publicationPackages ?? [] };
  normalized.assignmentPursuitWindows = state.assignmentPursuitWindows ?? [];
  normalized.peopleNotes = state.peopleNotes ?? [];
  normalized.assignments = canonicalizeAssignmentRecords(normalized, state.assignments ?? [], normalized.calendar);
  const assignmentIds = new Set(normalized.assignments.map((assignment) => assignment.id));
  // Older records could retain `active` after a model/provider failure even
  // though their durable AssignmentRun had already terminated. Repair that
  // contradiction at the runtime boundary so the operator sees one truthful
  // state and the scheduler does not treat it as unfinished work.
  const activeAssignmentRunStatuses = new Set<AssignmentRun["status"]>(["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"]);
  normalized.assignments = normalized.assignments.map((assignment) => {
    const duplicateExecution = normalized.executions.find((execution) => execution.assignmentId === assignment.id && isTerminalDuplicateExecution(execution));
    if (duplicateExecution && !["completed", "completed_with_adaptation", "cancelled", "failed", "expired_incomplete"].includes(assignment.status)) {
      settleTerminalDuplicateAssignment(normalized, assignment, duplicateExecution, duplicateExecution.updatedAt || assignment.updatedAt);
      return assignment;
    }
    if (!assignment.lastOutcome || !["evaluation_failed", "delivery_failed", "language_policy_failed"].includes(assignment.lastOutcome.class)) return assignment;
    if (!["active", "working", "awaiting_execution"].includes(assignment.status)) return assignment;
    const hasActiveRun = normalized.assignmentRuns.some((run) => run.assignmentId === assignment.id && activeAssignmentRunStatuses.has(run.status));
    if (hasActiveRun) return assignment;
    const at = assignment.lastOutcome.at || assignment.updatedAt;
    return {
      ...assignment,
      status: "needs_operator",
      work: {
        ...(assignment.work ?? { attempts: 0, maxAttempts: 4, storiesResearched: 0 }),
        phase: "blocked",
        blockedReason: assignment.lastOutcome.message,
      },
      updatedAt: at,
    };
  });
  normalized.executions = normalized.executions.map((execution) => repairOrphanedAssignmentExecution(execution, assignmentIds, normalized.socialIntents, normalized.actions));
  // Rehydrate Assignment progress from a durable verified execution. Native
  // delivery historically settled this during observation, while Bridge
  // reaction verification could mark only the execution/outcome and leave
  // the parent Assignment in `awaiting_execution` after a restart.
  for (const execution of normalized.executions) {
    if (execution.status !== "succeeded" || !execution.assignmentId) continue;
    const assignment = normalized.assignments.find((item) => item.id === execution.assignmentId);
    const verified = normalized.outcomes.some((outcome) => outcome.executionId === execution.id && outcome.status === "succeeded");
    if (!assignment || !verified || !growthEvidenceIsInPresenceScope(normalized, execution.presenceId, execution.createdAt) || assignment.progress.verified >= assignment.progress.required) continue;
    assignment.progress.verified = Math.min(assignment.progress.required, assignment.progress.verified + 1);
    const complete = assignmentIsSatisfied(assignment, normalized);
    assignment.status = complete ? "completed" : "active";
    assignment.work = { ...(assignment.work ?? { phase: "publishing", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: complete ? "completed" : "candidate_review" };
    assignment.lastOutcome = { class: complete ? "assignment_completed" : "incomplete", message: complete ? "Verified execution satisfied the requested Assignment." : "Verified execution recorded; more work remains.", at: execution.updatedAt };
    assignment.updatedAt = execution.updatedAt;
  }
  // Repair the historical classifier bug where a run that delivered a
  // successful execution was left as failed because its parent Assignment
  // correctly remained active while awaiting Social Mirror verification.
  normalized.assignmentRuns = (normalized.assignmentRuns ?? []).map((run) => {
    if (!["failed", "blocked"].includes(run.status)) return run;
    const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : Number.NaN;
    const completedAt = run.completedAt ? new Date(run.completedAt).getTime() : Number.POSITIVE_INFINITY;
    const deliveredDuringRun = normalized.executions.some((execution) => {
      if (execution.assignmentId !== run.assignmentId || execution.status !== "succeeded") return false;
      const updatedAt = new Date(execution.updatedAt).getTime();
      return Number.isFinite(startedAt) && updatedAt >= startedAt && updatedAt <= completedAt;
    });
    if (!deliveredDuringRun) return run;
    return { ...run, status: "published" as const, currentStage: "completed" as const, lastError: undefined };
  });
  reconcileLiveAssignmentRuns(normalized);
  // `canonicalizeAssignmentRecords` repairs both old slot-shaped Assignment
  // rows and dangling calendar assignmentId links before this boundary can
  // expose an empty Schedule or persist a reduced workspace.
  migrateLegacyOperatorDirectives(normalized);
  normalized.bridges = (state.bridges ?? []).map(migrateLegacyXBrowserBridge);
  normalized.mirrorObjects = repairNativeReplyClassifications({ ...normalized, mirrorObjects: (state.mirrorObjects ?? []).map(normalizeMirrorObject) });
  normalized.mirrorObjects = repairNativeReactionMirrors(normalized);
  // Reconciliation can observe a quote through an X payload whose relation is
  // labelled `reply_to`. Restore the authored execution affordance at the
  // read boundary so a heartbeat cannot regress a verified Quote into a Reply
  // or make Activity counters disappear after a restart.
  normalized.mirrorObjects = normalized.mirrorObjects.map((object) => {
    if (object.objectType !== "reply" || !object.originExecutionId) return object;
    const execution = normalized.executions.find((item) => item.id === object.originExecutionId);
    if (execution?.affordance !== "x.quote" || execution.externalRef?.type !== "x.post") return object;
    const target = execution.target?.type === "x.post" ? execution.target : undefined;
    return {
      ...object,
      objectType: "quote",
      parentExternalRef: object.parentExternalRef ?? target,
      referencedExternalRefs: object.referencedExternalRefs?.length ? object.referencedExternalRefs : target ? [target] : object.referencedExternalRefs,
    };
  });
  syncAttentionTests(normalized);
  normalized.personIdentities = normalizePersonIdentityScopes(normalized);
  normalized.publishingPlans = state.publishingPlans ?? [];
  normalized.files = (state.files ?? []).map((file) => {
    const metadata = fileMeta[file.kind];
    if (file.kind === "TASTE" && !file.content.includes("Affordance standards")) {
      return { ...file, ...(metadata ?? {}), content: fileContent("TASTE", { name: normalized.agent?.name ?? "Jenny", description: normalized.agent?.description ?? "", audience: normalized.agent?.audience ?? "", mode: normalized.presence?.mode ?? "agent", handle: normalized.presence?.handle ?? "@genny", accent: normalized.agent?.accent ?? "#D68754" }, normalized.presence ?? undefined), updatedAt: now() };
    }
    return metadata ? { ...file, ...metadata } : file;
  });
  if (normalized.agent && normalized.scenarios.length === 0) {
    const builtins = builtinScenarioDefinitions(normalized.agent.id, normalized.presence?.channel ?? "x");
    normalized.scenarios = builtins.map((item) => item.scenario);
    normalized.scenarioVersions = builtins.map((item) => item.version);
  }
  migrateLegacyDefaultModel(normalized);
  const nowMs = Date.now();
  normalized.capabilityTrials = (normalized.capabilityTrials ?? []).map((trial) => {
    if (["active", "discovering", "judging", "awaiting_execution", "awaiting_verification", "draft", "preflight"].includes(trial.status) && trial.expiresAt && new Date(trial.expiresAt).getTime() <= nowMs) {
      const updatedAt = trial.updatedAt || new Date().toISOString();
      const assignment = normalized.assignments.find((item) => item.id === trial.assignmentId);
      if (assignment && assignment.status === "active") {
        assignment.status = "expired_incomplete";
        assignment.lastOutcome = { class: "incomplete", message: "The bounded trial expired before a verified tested-capability outcome was observed.", at: updatedAt };
        assignment.updatedAt = updatedAt;
      }
      return {
        ...trial,
        status: "expired" as const,
        result: trial.result ?? "INCONCLUSIVE_NO_OPPORTUNITY",
        lastError: trial.lastError ?? "The bounded trial expired before a verified tested-capability outcome was observed.",
        updatedAt,
      };
    }
    return trial;
  });
  // A completed bounded trial with no opportunity is truthful progress for
  // the trial, but it cannot leave its linked Assignment open forever. Repair
  // records produced before the explicit settlement path was added.
  for (const trial of normalized.capabilityTrials) {
    if (trial.status !== "completed" || trial.result !== "INCONCLUSIVE_NO_OPPORTUNITY") continue;
    const assignment = normalized.assignments.find((item) => item.id === trial.assignmentId);
    if (!assignment || !["draft", "active", "discovering", "judging"].includes(assignment.status)) continue;
    const at = trial.updatedAt || new Date().toISOString();
    assignment.status = "expired_incomplete";
    assignment.lastOutcome = { class: "incomplete", message: trial.lastError ?? "The bounded trial completed without a qualified opportunity.", at };
    assignment.updatedAt = at;
  }
  // A concurrent scheduler write can preserve an older trial payload while
  // retaining the newer Assignment terminal outcome. Never let that split
  // state render as "discovering" forever: the Assignment's terminal record
  // is authoritative for the bounded trial it owns.
  for (const trial of normalized.capabilityTrials) {
    if (!["active", "discovering", "judging"].includes(trial.status)) continue;
    const assignment = normalized.assignments.find((item) => item.id === trial.assignmentId);
    if (!assignment || assignment.status !== "expired_incomplete") continue;
    const message = assignment.lastOutcome?.message ?? "The bounded trial ended without a verified tested-capability outcome.";
    trial.status = "failed";
    trial.result = /provider|read|resource|credit|quota|capacity/i.test(message) ? "BLOCKED_RESOURCE" : "INCONCLUSIVE_NO_OPPORTUNITY";
    trial.lastError = message;
    trial.updatedAt = trial.updatedAt || assignment.updatedAt || now();
  }
  const pulseTimes = normalized.events.filter((item) => item.title === "Pulse completed").map((item) => item.time).sort().reverse();
  const priorPulseAt = pulseTimes[1];
  if (priorPulseAt) {
    normalized.presences = normalized.presences.map((item) => {
      const footing = item.context.publicFooting;
      if (!footing || footing.judgedInboundIds) return item;
      const judgedInboundIds = normalized.mirrorEvents
        .filter((mirrorEvent) => mirrorEvent.presenceId === item.id && mirrorEvent.externalRef.type === "x.post" && mirrorEvent.receivedAt <= priorPulseAt && footing.recentInboundIds?.includes(mirrorEvent.externalRef.id))
        .map((mirrorEvent) => mirrorEvent.externalRef.id);
      return judgedInboundIds.length ? { ...item, context: { ...item.context, publicFooting: { ...footing, judgedInboundIds } } } : item;
    });
    normalized.presence = normalized.presences.find((item) => item.id === normalized.activePresenceId) ?? normalized.presences[0] ?? null;
  }
  // Live is an operational stream, not an unbounded event log. Keeping every
  // historical event and legacy action in the browser workspace makes every
  // state refresh parse, clone, and serialize megabytes of data. Durable
  // domain records (Mirror objects, executions, outcomes, publications, and
  // the normalized database projection) remain intact; this cap only bounds
  // the operator-facing compatibility stream.
  normalized.events = normalized.events.slice(0, 2_000);
  normalized.actions = normalized.actions.slice(0, 1_000);
  normalizeAssetLibraryState(normalized);
  return markStateNormalized(migrateKnowledgeState(normalized));
}

function hydratePresence(raw: Presence, fallbackBrief = defaultPresenceBrief()): Presence {
  const capabilities = raw.capabilities ?? CHANNEL_CAPABILITIES[(raw.channel ?? "x") as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const execution = raw.execution ?? Object.fromEntries(capabilities.map((item) => [item.id, "off"]));
  const idValue = raw.id || id("presence");
  const name = raw.name || raw.context?.publicIdentity?.displayName || raw.handle || "Presence";
  const mode = raw.mode ?? "agent";
  const publicSelf = raw.publicSelf ?? raw.context?.publicSelf ?? defaultPublicSelf(name, mode);
  const mediaPerceptionPolicy = raw.mediaPerceptionPolicy ?? (mode === "ghost" ? "review-uncertain" : "use-judgment");
  const language = normalizePresenceLanguage((raw as Presence & { language?: unknown }).language);
  const languagePolicy = normalizeLanguagePolicy((raw as Presence & { languagePolicy?: LanguagePolicy }).languagePolicy);
  const brief = normalizePresenceBrief(raw.brief ?? raw.context?.brief, fallbackBrief);
  const context = raw.context ?? { presenceId: idValue, channel: raw.channel ?? "x", publicIdentity: { displayName: name, handle: raw.handle, mode }, publicSelf, brief, availableAffordances: capabilities.map((item) => item.id) };
  const executionEnvelope = raw.executionEnvelope ?? makeEnvelope(idValue, capabilities, execution);
  const ghostProfile = normalizeGhostProfile(raw.ghostProfile ?? (raw.mode === "ghost" ? defaultGhostProfile() : undefined));
  const environment: PresenceEnvironment = raw.environment ?? (raw.connectionMode === "sandbox" ? "sandbox" : "live");
  const channel = raw.channel ?? "x";
  // X is a native channel. Browser access is an optional execution
  // capability and must not become the Presence-wide route, including when
  // Preserve an explicit Bridge route for X. Native X is the default, but
  // silently rewriting a user-selected browser route causes queued work to
  // be resealed against the wrong connector after every normalization pass.
  const connectionMode: PresenceConnectionMode = environment === "sandbox"
    ? "sandbox"
    : raw.connectionMode === "bridge"
      ? "bridge"
      : channel === "x" ? "native" : raw.connectionMode ?? "bridge";
  const destination: import("./types").PresenceDestination = raw.destination ?? {
    handle: raw.handle,
    displayName: name,
  };
  const accessBindings: import("./types").AccessBinding[] = raw.accessBindings ?? (
    channel === "x"
      ? [
          { kind: "native", channel: "x", status: "connected" },

          { kind: "user_attached_browser", channel: "x", status: raw.browserAccess?.enabled ? "connected" : "disconnected" },
          { kind: "external_bridge", channel: "x", status: "disconnected" },
        ]
      : [

          { kind: "user_attached_browser", channel, status: raw.browserAccess?.enabled ? "connected" : "disconnected" },
          { kind: "external_bridge", channel, status: "disconnected" },
        ]
  );
  const pacing = raw.pacing ?? "recommended";
  const attentionIntervalMinutes = Math.max(5, Math.min(120, raw.attentionIntervalMinutes ?? (pacing === "gentle" ? 15 : 5)));
  const quietHours = { enabled: Boolean(raw.quietHours?.enabled), start: raw.quietHours?.start ?? "22:00", end: raw.quietHours?.end ?? "07:00" };
  const publishingInitiative = normalizePublishingInitiative(raw.publishingInitiative);
  const browserAccess = {
    enabled: raw.browserAccess?.enabled === true,
    learnedFallbacks: Array.isArray(raw.browserAccess?.learnedFallbacks)
      ? raw.browserAccess.learnedFallbacks
        .filter((item): item is { action: string; reason: string; learnedAt: string } => Boolean(item && typeof item.action === "string" && typeof item.reason === "string" && typeof item.learnedAt === "string"))
        .map((item) => ({ action: item.action.trim(), reason: item.reason.trim(), learnedAt: item.learnedAt }))
        .filter((item) => item.action && item.reason)
      : undefined,
  };
  const selfDirectedAttention = raw.selfDirectedAttention ?? defaultSelfDirectedAttentionPolicy();
  const requestedIntensity = selfDirectedAttention.intensity ?? "balanced";
  const presetBudget = requestedIntensity === "custom" ? undefined : SELF_DIRECTED_ATTENTION_PRESETS[requestedIntensity];
  const normalizedIntensity = requestedIntensity !== "custom" && selfDirectedAttention.budget && !attentionBudgetMatchesPreset(selfDirectedAttention.budget, presetBudget!) ? "custom" : requestedIntensity;
  const normalizedBudget = selfDirectedAttention.budget ?? (presetBudget ? { ...presetBudget } : undefined);
  const normalizedSelfDirectedAttention = {
    ...selfDirectedAttention,
    // Awake/live is the source of truth. Keep the legacy field only so older
    // workspaces can be read without a destructive migration.
    enabled: raw.status === "live",
    intensity: normalizedIntensity,
    budget: normalizedBudget,
    allocation: {
      observationPercent: selfDirectedAttention.allocation?.observationPercent ?? 20,
      evaluationPercent: selfDirectedAttention.allocation?.evaluationPercent ?? 50,
      actionReservePercent: selfDirectedAttention.allocation?.actionReservePercent ?? 30,
    },
  };
  return { ...raw, id: idValue, channel, name, mode, capabilities, execution, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, language, languagePolicy, browserAccess, selfDirectedAttention: normalizedSelfDirectedAttention, executionEnvelope: { ...executionEnvelope, presenceId: idValue, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? executionEnvelope.affordances?.[item.id]?.mode ?? "off" }])) }, context: compilePresenceContext({ ...raw, id: idValue, name, mode, capabilities, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, language, languagePolicy, browserAccess, selfDirectedAttention: normalizedSelfDirectedAttention, executionEnvelope, context, publishingInitiative } as Presence), pacing, attentionIntervalMinutes, quietHours, publishingInitiative, accountHealth: raw.accountHealth ?? "healthy", environment, destination, accessBindings, connectionMode, curationSources: normalizeCurationSources(raw.curationSources ?? getDefaultCurationSources(brief)) };
}

function migrateBuiltInXCapabilities(presence: Presence): Presence {
  if (presence.channel !== "x") return presence;
  const canonical = CHANNEL_CAPABILITIES.x;
  const capabilities = [...canonical.filter((item) => !presence.capabilities.some((current) => current.id === item.id)), ...presence.capabilities];
  const execution = { ...Object.fromEntries(canonical.map((item) => [item.id, "off"])), ...presence.execution } as Presence["execution"];
  return hydratePresence({ ...presence, capabilities, execution }, defaultPresenceBrief());
}

function snapshotWorkspace(state: OpenPresenceState): import("./types").AgentWorkspaceSnapshot {
  const workspace = JSON.parse(JSON.stringify(state)) as Partial<OpenPresenceState>;
  delete workspace.agents;
  delete workspace.activeAgentId;
  delete workspace.agentWorkspaces;
  return workspace as import("./types").AgentWorkspaceSnapshot;
}

function restoreWorkspace(state: OpenPresenceState, workspace: import("./types").AgentWorkspaceSnapshot, agentWorkspaces: import("./types").AgentWorkspaceSnapshot[]): OpenPresenceState {
  return normalizeState({ ...state, ...workspace, workspaceRevision: workspace.workspaceRevision, agents: state.agents, activeAgentId: workspace.agent?.id ?? null, agentWorkspaces });
}

/**
 * Materialize the workspace addressed by a browser request without changing
 * the caller's local context. The persisted state still has a compatibility
 * "active" projection, but request handlers must resolve an explicit Agent
 * before applying an operation so separate browser tabs cannot cross wires.
 */
export function stateForAgent(source: OpenPresenceState, agentId?: string | null): OpenPresenceState {
  if (!agentId || source.activeAgentId === agentId) return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  if (!source.agents.some((agent) => agent.id === agentId)) return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  return applyOperation(source, { type: "selectAgent", id: agentId });
}

export function stateForContext(source: OpenPresenceState, context: { agentId?: string | null; presenceId?: string | null }): OpenPresenceState {
  let state = stateForAgent(source, context.agentId);
  if (context.presenceId && state.presences.some((presence) => presence.id === context.presenceId) && state.activePresenceId !== context.presenceId) {
    state = applyOperation(state, { type: "selectPresence", id: context.presenceId });
  }
  return state;
}

/** Build an immutable scope for one bounded runtime operation. */
export function createRuntimeScope(source: OpenPresenceState, input: { sessionId?: string; presenceId?: string; assignmentId?: string; conversationId?: string; invocationId?: string }): RuntimeScope {
  if (!source.agent?.id) throw new Error("A RuntimeScope requires an Agent.");
  const session = input.sessionId ? source.playgroundSessions.find((item) => item.id === input.sessionId) : undefined;
  const presenceId = input.presenceId ?? session?.presenceId ?? source.presence?.id;
  const presence = presenceId ? source.presences.find((item) => item.id === presenceId) : source.presence;
  if (!presence) throw new Error("A RuntimeScope requires a Presence.");
  if (session && session.presenceId !== presence.id) throw new Error("The Playground session does not belong to the requested Presence.");
  const assignment = input.assignmentId ? source.assignments.find((item) => item.id === input.assignmentId) : undefined;
  if (input.assignmentId && !assignment) throw new Error("The Assignment is no longer available.");
  if (assignment && (assignment.presenceId !== presence.id || assignment.sessionId && assignment.sessionId !== session?.id)) throw new Error("The Assignment does not belong to the requested Presence and Playground session.");
  return { userId: "local", agentId: source.agent.id, presenceId: presence.id, environment: session ? "sandbox" : presence.environment ?? "live", playgroundSessionId: session?.id, worldRevision: session?.worldRevision ?? 1, assignmentId: assignment?.id, assignmentRevision: assignment?.revision ?? 0, conversationId: input.conversationId, invocationId: input.invocationId ?? id("invocation") };
}

/** Validate durable parent/child lineage before a scoped operation commits. */
export function assertRuntimeScope(source: OpenPresenceState, scope: RuntimeScope) {
  if (source.agent?.id !== scope.agentId) throw new Error("The RuntimeScope Agent is not the materialized Agent.");
  const presence = scope.presenceId ? source.presences.find((item) => item.id === scope.presenceId) : undefined;
  if (!presence || presence.id !== source.presence?.id) throw new Error("The RuntimeScope Presence is not part of the materialized Agent.");
  const session = scope.playgroundSessionId ? source.playgroundSessions.find((item) => item.id === scope.playgroundSessionId) : undefined;
  if (scope.playgroundSessionId && (!session || session.presenceId !== presence.id || (scope.worldRevision !== undefined && (session.worldRevision ?? 1) !== scope.worldRevision))) throw new Error("That RuntimeScope belongs to a stale or different Playground world.");
  const assignment = scope.assignmentId ? source.assignments.find((item) => item.id === scope.assignmentId) : undefined;
  if (scope.assignmentId && (!assignment || assignment.presenceId !== presence.id || (session && assignment.sessionId !== session.id) || (scope.assignmentRevision !== undefined && (assignment.revision ?? 0) !== scope.assignmentRevision) || assignment.status === "cancelled")) throw new Error("That RuntimeScope belongs to a stale or cancelled Assignment.");
  return true;
}

function recordChangeSet(state: OpenPresenceState, summary: string, operations: ChangeSetOperation[], conversationId?: string, presenceId?: string): string | undefined {
  if (!state.agent) return undefined;
  const changeSet: ChangeSet = { id: id("changeset"), agentId: state.agent.id, presenceId, conversationId, summary, operations, createdAt: now() };
  state.changeSets.unshift(changeSet);
  return changeSet.id;
}
function proposal(state: OpenPresenceState, kind: FileKind, proposed: string, reason: string, conversationId?: string, target?: FileProposal["target"]): FileProposal { const current = state.files.find((file) => file.kind === kind)?.content ?? ""; const changeSetId = recordChangeSet(state, `Propose ${kind}.md change`, [{ path: `agentFiles.${kind}`, action: "update", before: current, after: proposed }], conversationId); return { id: id("proposal"), file: kind, title: `Update ${kind}.md`, reason, current, proposed, status: "pending", createdAt: now(), changeSetId, target }; }
function activeConversation(state: OpenPresenceState, conversationId?: string) { return state.conversations.find((conversation) => conversation.id === (conversationId ?? state.activeConversationId)) ?? state.conversations[0]; }
function syncMessages(state: OpenPresenceState) { state.messages = activeConversation(state)?.messages ?? []; }
function makePresenceChatSession(presenceId: string): import("./types").PresenceChatSession { const timestamp = now(); return { id: id("presence-chat"), presenceId, title: "New conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] }; }

function inferPresenceBriefChange(content: string, current: PresenceBrief): { brief: PresenceBrief; summary: string } | undefined {
  const clean = (value: string) => value.trim().replace(/[.!?]+$/, "").trim();
  const splitTerritory = (value: string) => value.split(/,|\s+and\s+/i).map(clean).filter(Boolean);
  const territory = content.match(/\b(?:mostly|mainly)\s+about\s+(.+?)(?:[.!?]|$)/i)?.[1]
    ?? content.match(/\b(?:focus|focused|center|centre)\s+(?:mostly\s+)?on\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (territory) {
    const primaryTerritory = splitTerritory(territory);
    if (primaryTerritory.length) return { brief: { ...current, primaryTerritory }, summary: "Presence Brief territory updated" };
  }
  const audience = content.match(/^(.*?)\s+are\s+the\s+audience[.!?]?$/i)?.[1] ?? content.match(/\baudience(?:\s+is|\s*:)\s*(.+?)(?:[.!?]|$)/i)?.[1];
  if (audience) return { brief: { ...current, audience: clean(audience) }, summary: "Presence Brief audience updated" };
  const adjacent = content.match(/^(.+?)\s+is\s+adjacent\b/i)?.[1];
  if (adjacent) return { brief: { ...current, adjacentTerritory: [...new Set([...current.adjacentTerritory, clean(adjacent)])] }, summary: "Presence Brief adjacent territory updated" };
  const boundary = content.match(/\b(?:don['’]?t|do not)\s+(?:get involved in|discuss|talk about|engage with)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (boundary) return { brief: { ...current, boundaries: [...new Set([...current.boundaries, clean(boundary).replace(/\s+here$/i, "")])] }, summary: "Presence Brief boundary added" };
  return undefined;
}

function cleanTeachContext(value: string) {
  return value
    .trim()
    .replace(/^['“”"]|['“”"]$/g, "")
    .replace(/^(?:as\s+)?(?:operator[- ]provided\s+)?context\s*:\s*/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

/**
 * Teach is a configuration surface, so durable context needs a typed path.
 * Explicit memory language submits immediately for review; a plain durable
 * identity/context claim asks once before creating the proposal.
 */
export function inferExplicitDurableContext(content: string) {
  const match = content.match(/^(?:please\s+)?(?:remember|memorize|save|store|keep\s+in\s+mind|note)\s+(?:that\s+|this\s*(?:as\s+[^:]+)?\s*[:,-]?\s*)?([\s\S]+)$/i);
  const context = match?.[1] ? cleanTeachContext(match[1]) : "";
  return context.length >= 4 ? context : undefined;
}

export function inferDurableContextClaim(content: string) {
  const normalized = content.trim();
  if (!normalized || /[?]$/.test(normalized)) return undefined;
  if (!/\b(?:built|created|developed|founded|owns?|owned|made)\b/i.test(normalized)) return undefined;
  const context = cleanTeachContext(normalized);
  return context.length >= 12 ? context : undefined;
}

export function isTeachProposalConfirmation(content: string) {
  const normalized = content.toLowerCase().replace(/[’]/g, "'").trim();
  return /\bsubmit\b[\s\S]*\bproposal\b/.test(normalized)
    || /^(?:yes|yep|yeah|sure|please|do it|confirm|approved?)(?:[\s,!.].*)?$/.test(normalized);
}

function priorTeachProposalContext(conversation: import("./types").Conversation) {
  const previousAgentIndex = [...conversation.messages].map((message) => message.role).lastIndexOf("agent");
  const previousAgentMessage = previousAgentIndex >= 0 ? conversation.messages[previousAgentIndex] : undefined;
  if (!previousAgentMessage) return undefined;
  if (!/\b(?:proposal|durable|remember|context)\b/i.test(previousAgentMessage.content)) return undefined;
  const boldCandidates = [...previousAgentMessage.content.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((match) => cleanTeachContext(match[1] ?? ""))
    .filter((value) => value.length >= 12 && !/^(?:durable context|operator-provided context|context)$/i.test(value));
  if (boldCandidates.length) return boldCandidates.sort((left, right) => right.length - left.length)[0];
  const marked = previousAgentMessage.content.match(/(?:durable context|proposal to submit is)\s*:\s*([\s\S]+?)(?:\.|$)/i)?.[1];
  if (marked) return cleanTeachContext(marked);
  const precedingOperator = conversation.messages.slice(0, previousAgentIndex).reverse().find((message) => message.role === "operator");
  return precedingOperator ? inferExplicitDurableContext(precedingOperator.content) ?? inferDurableContextClaim(precedingOperator.content) : undefined;
}

function submitMemoryProposal(state: OpenPresenceState, context: string, conversationId: string) {
  const file = state.files.find((item) => item.kind === "MEMORY");
  if (!file) return undefined;
  const entry = `- ${context}`;
  const proposed = file.content.includes(entry)
    ? file.content
    : `${file.content.trim()}\n\n## Operator-provided context\n\n${entry}`;
  const existing = state.proposals.find((item) => item.status === "pending" && item.file === "MEMORY" && item.proposed === proposed);
  if (existing) return existing;
  const item = proposal(state, "MEMORY", proposed, "You confirmed adding this durable operator-provided context. It will remain a reviewable Mind File change until you apply it.", conversationId);
  state.proposals.push(item);
  return item;
}

const socialWarmthTasteGuidance = [
  "## Curiosity and encouragement",
  "",
  "Be curious, helpful, and inquisitive in community conversations. Ask a genuine question when it can deepen engagement or help someone think further, but do not ask questions merely to keep a conversation going. When someone shares something genuinely strong, interesting, or meaningful, acknowledge it in a way that makes them feel seen and encouraged. Use praise and warmth selectively and honestly, based on the contribution and the conversation, never as a default engagement tactic.",
].join("\n");

const socialConversationalTasteGuidance = [
  "## Conversational presence",
  "",
  "Sound like a person responding to a person, not a system completing a prompt. Start from one concrete detail in the latest turn, make one useful move, and stop. Prefer 1–3 short sentences and roughly 8–45 words when the moment is small. Use contractions and natural rhythm. Do not restate the post, summarize the exchange, narrate optimization, explain the process, or force a tidy conclusion. Ask one real follow-up only when the conversation has a genuine opening; silence is better than a manufactured question.",
].join("\n");

const socialContextualHumorTasteGuidance = [
  "## Contextual humor and emoji",
  "",
  "Use dry, lightly self-aware humor when it understands the room and sharpens the point. A brief line such as ‘I was promised networking, not a funeral 😭’ works when the moment earns it; do not force a joke into a serious exchange or use humor to compete for attention.",
  "",
  "Emoji are seasoning, not grammar. Usually use none; when one makes the tone unmistakable, use at most one familiar emoji and keep it attached to the actual thought.",
].join("\n");

const socialHumorTasteGuidance = [
  "## Absurdist and blue humor",
  "",
  "Use sharp absurdist humor and occasional sophomoric, blue humor when it clearly fits the room, adds warmth, and earns its place. Prefer surreal observations, harmless bodily-function silliness, light innuendo, awkwardness, and self-aware mischief over humiliation or cruelty. Keep the joke brief, proportionate, and anchored to the actual conversation; do not force humor into a serious exchange or compete for the last word.",
  "",
  "Never use blue, sexualized, or body-based humor about body dysmorphia or body image, gender identity or expression, sex or sexuality, race or ethnicity, disability, illness, trauma, consent, or other vulnerable situations. When a conversation touches those subjects, switch to direct, respectful language and treat the person's dignity as more important than the joke. Do not use humor to dismiss a sincere question, boundary, or disclosure.",
].join("\n");

function isHumorTastePreferenceLanguage(content: string) {
  return /\b(?:absurd(?:ist)?|sophom(?:oric)?|blue\s+humou?r|raunch(?:y|iness)?|innuendo|playful|silly|sarcasm|sarcastic|emoji|dry|self-aware|contextual|light(?:ly)?|personality|voice|tone|humou?r\s+(?:style|boundary|preference|policy))\b/i.test(content)
    && /\b(?:should|want|prefer|use|have|make|keep|never|don['’]?t|do not|update|change|more|less|sometimes|occasionally|always)\b/i.test(content)
    && /\b(?:agent|you|we|repl(?:y|ies)|conversation|people|someone|social|public|presence|genny|example_agent|humou?r|jok(?:e|es|ing)|personality|voice|tone)\b/i.test(content);
}

function isBlueHumorTastePreferenceLanguage(content: string) {
  return /\b(?:absurd(?:ist)?|sophom(?:oric)?|blue\s+humou?r|raunch(?:y|iness)?|innuendo)\b/i.test(content);
}

function isTasteUpdateCommand(content: string) {
  return /^(?:can\s+you\s+)?(?:please\s+)?(?:update|change|apply|save)\s+(?:the\s+)?(?:agent['’]?s\s+)?(?:taste(?:\.md)?|taste\s+setting|taste\s+file|preference|preferences)\b(?:[\s\S]*\b(?:with|from)\s+(?:that|this))?[.!?]?$/i.test(content.trim());
}

function isTastePreferenceLanguage(content: string) {
  return isHumorTastePreferenceLanguage(content)
    || isConversationalTastePreferenceLanguage(content)
    || (/\b(?:curious|curiosity|inquisitive|helpful|encourag(?:e|ement)|praise|warmth|feel good|engage(?:ment)?|ask(?:ing)? questions?)\b/i.test(content)
      && (/\b(?:agent|you|we|repl(?:y|ies)|conversation|people|someone|share|sharing)\b/i.test(content)
        || /\b(?:more|less|sometimes|selectively|not always)\b/i.test(content)));
}

function isConversationalTastePreferenceLanguage(content: string) {
  return /\b(?:conversational|natural(?:ly)?|human(?:-like)?|assistant[- ]like|prompt[- ]like|ticket[- ]like|social(?:ly)?|voice|tone|concise|brief|short(?:er)?)\b/i.test(content)
    && /\b(?:agent|you|we|repl(?:y|ies)|conversation|people|someone|public|presence|genny|example_agent|answer(?:ing)?|sound|feel)\b/i.test(content)
    && /\b(?:should|want|prefer|use|have|make|keep|never|don['’]?t|do not|update|change|more|less|stop|avoid)\b/i.test(content);
}

function isTasteProposalCommand(content: string) {
  return /^(?:please\s+)?(?:propose|submit|create|make)\s+(?:the\s+)?(?:rule|proposal|taste(?:\s+proposal)?|change)\b/i.test(content.trim());
}

function priorTastePreferenceInstruction(conversation: import("./types").Conversation) {
  const previousOperator = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "operator" && isTastePreferenceLanguage(message.content));
  return previousOperator?.content;
}

function tasteProposalGuidance(content: string) {
  const sections = [];
  if (isHumorTastePreferenceLanguage(content)) sections.push(isBlueHumorTastePreferenceLanguage(content) ? socialHumorTasteGuidance : socialContextualHumorTasteGuidance);
  if (isConversationalTastePreferenceLanguage(content)) sections.push(socialConversationalTasteGuidance);
  if (/\b(?:curious|curiosity|inquisitive|helpful|encourag(?:e|ement)|praise|warmth|feel good|engage(?:ment)|ask(?:ing)? questions?)\b/i.test(content)) sections.push(socialWarmthTasteGuidance);
  return sections.join("\n\n");
}

function submitTasteProposal(state: OpenPresenceState, conversationId: string, instruction: string) {
  const file = state.files.find((item) => item.kind === "TASTE");
  if (!file) return undefined;
  const guidance = tasteProposalGuidance(instruction);
  if (!guidance) return undefined;
  const proposed = file.content.includes(guidance)
    ? file.content
    : file.content.trim() + "\n\n" + guidance;
  const existing = state.proposals.find((item) => item.status === "pending" && item.file === "TASTE" && item.proposed === proposed);
  if (existing) return existing;
  const reason = isConversationalTastePreferenceLanguage(instruction)
    ? "You asked for durable guidance about conversational voice and natural social replies. The protected TASTE.md file stays unchanged until you review and apply it in Manage Agent → Brain."
    : isHumorTastePreferenceLanguage(instruction)
    ? isBlueHumorTastePreferenceLanguage(instruction)
      ? "You asked for durable personality guidance about absurdist and blue humor with explicit sensitive-topic boundaries. The protected TASTE.md file stays unchanged until you review and apply it in Manage Agent → Brain."
      : "You asked for durable guidance about contextual humor and light emoji use. The protected TASTE.md file stays unchanged until you review and apply it in Manage Agent → Brain."
    : "You asked for a durable preference about curiosity, useful questions, and selective encouragement. The protected TASTE.md file stays unchanged until you review and apply it in Manage Agent → Brain.";
  const item = proposal(state, "TASTE", proposed, reason, conversationId);
  state.proposals.push(item);
  return item;
}

function inferExecutionSettingChange(content: string, presence: Presence) {
  const mode = content.match(/\b(off|manual|review|auto)\b/i)?.[1]?.toLowerCase() as import("./types").ExecutionMode | undefined;
  if (!mode) return undefined;
  const target = content.match(/\b(posts?|replies?|comments?|messages?|reactions?|likes?|reposts?|quotes?)\b/i)?.[1]?.toLowerCase();
  if (!target) return undefined;
  const aliases: Record<string, string[]> = {
    post: ["post", "posts"], reply: ["reply", "replies"], comment: ["comment", "comments"], message: ["message", "messages"],
    like: ["like", "likes", "reaction", "reactions"], repost: ["repost", "reposts", "restack", "restacks"], quote: ["quote", "quotes"],
  };
  const capability = Object.entries(aliases).find(([, names]) => names.includes(target))?.[0];
  if (!capability || !presence.capabilities.some((item) => item.id === capability) || presence.execution[capability] === mode) return undefined;
  return { capability, mode };
}

function inferModelSettingChange(content: string, current: AgentModelProfile | undefined) {
  const provider = content.match(/\b(?:use|switch\s+to|change\s+(?:the\s+)?(?:model|runtime|provider)\s+to)\s+(openai|anthropic|claude|gemini|ollama)\b/i)?.[1]?.toLowerCase();
  if (!provider) return undefined;
  const normalizedProvider = provider === "claude" ? "anthropic" : provider as import("./types").ModelProvider;
  if (current?.provider === normalizedProvider) return undefined;
  const defaults: Record<import("./types").ModelProvider, { model: string; quality: import("./types").ModelQuality }> = {
    openai: { model: "gpt-5.6-luna", quality: "medium" }, anthropic: { model: "claude", quality: "high" }, gemini: { model: "gemini-2.5-flash", quality: "medium" }, openrouter: { model: "openai/gpt-4o-mini", quality: "medium" }, ollama: { model: "qwen2.5:7b", quality: "local" }, custom: { model: current?.model ?? "custom", quality: current?.quality ?? "medium" },
  };
  return { provider: normalizedProvider, ...defaults[normalizedProvider] };
}

function inferPostFormattingProposal(content: string, currentTaste: string): { proposed: string; reply: string } | undefined {
  const asksForSeparatedPostSentences = /one sentence per (?:line|paragraph)|blank line between sentences/i.test(content);
  const scopesPosts = /\bposts?\b/i.test(content) && !/\b(?:repl(?:y|ies)|responses?)\b/i.test(content) || /posts?\s*\(\s*not\s+repl/i.test(content);
  if (!asksForSeparatedPostSentences || !scopesPosts) return undefined;
  const guidance = "## Post formatting\n\nFor posts, write one sentence per paragraph with a blank line between sentences. Replies can use normal paragraph formatting.";
  const proposed = currentTaste.includes(guidance) ? currentTaste : `${currentTaste.trim()}\n\n${guidance}`;
  return {
    proposed,
    reply: "For posts, I’ll use one sentence per paragraph with a blank line between sentences. Replies can stay normally formatted. I also created a reviewable TASTE proposal; it is not authoritative until you approve it.",
  };
}

function cleanIdentityName(value: string) {
  return value.trim()
    .replace(/^['“”"]|['“”"]$/g, "")
    .replace(/^I['’]?m\s+/i, "")
    .replace(/\s+[—-]\s+@[^\s]+$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

export function inferPresenceIdentityChange(content: string, current: Presence): { name: string } | undefined {
  const fullName = content.match(/\byour\s+full\s+name\s+is\s+["“”']([^"“”']+)["“”']/i)?.[1];
  const quotedNames = [...content.matchAll(/\byou\s+are\s+(?!not\b)["“']([^"”']+)["”']/gi)].map((match) => match[1]);
  const directName = quotedNames.at(-1) ?? content.match(/\b(?:call\s+yourself|rename\s+(?:this\s+)?Presence\s+to)\s+["“']([^"”']+)["”']/i)?.[1];
  const nextName = cleanIdentityName(fullName ?? directName ?? "");
  if (!nextName || nextName.toLowerCase() === current.name.trim().toLowerCase()) return undefined;
  return { name: nextName };
}

/**
 * Keep internal QA identifiers out of public Sandbox expressions. Assignment
 * instructions are operator context, not content the Presence should publish.
 */
export function cleanSandboxDraft(value: string) {
  const cleaned = formatOneSentencePerLine(value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^[^:\n]{1,80}\s*\((?:post|reply|quote|repost|like|reaction)\):\s*/i, "")
    .replace(/\bQA-[A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/gi, "")
    .split(/\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.!?,])/g, "$1").trim())
    .join("\n"));
  return cleaned;
}

/** Keep trusted orchestration prose and prompt-injection markers out of public delivery. */
export function runtimeContextLeakageReason(text: string) {
  const patterns = [
    /__OPENPRESENCE_RUNTIME_CONTEXT__/i,
    /a new public (?:x|social) message was observed/i,
    /treat the following social mirror evidence/i,
    /live presence snapshot/i,
    /execution envelope summary/i,
    /operator directive/i,
    /ignore (?:the )?system prompt/i,
  ];
  return patterns.some((pattern) => pattern.test(text)) ? "The draft appears to contain runtime, planner, or untrusted instruction text and needs review before any public delivery." : undefined;
}

/**
 * Keep internal diagnostic identifiers out of normal operator-facing copy.
 * The original Assignment remains durable and available to the runtime; this
 * projection is only for headings, summaries, and confirmation text.
 */
export function cleanUserFacingAssignmentInstruction(value: string) {
  const marker = /\bQA-[A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/i;
  const markerGlobal = new RegExp(marker.source, "gi");
  let cleaned = value
    .trim()
    .replace(new RegExp(`^\\s*${marker.source}\\s*:?\\s*`, "i"), "")
    .replace(new RegExp(`\\b(?:include|use|append|add|mention)\\s+(?:the\\s+)?(?:internal\\s+|diagnostic\\s+)*(?:marker\\s+|identifier\\s+|token\\s+)?${marker.source}(?:\\s+only)?(?:\\s+as\\s+(?:an\\s+)?(?:internal\\s+)?(?:diagnostic\\s+)?(?:marker|identifier|token))?(?:\\s+and\\s+never\\s+publish\\s+it)?`, "gi"), "")
    .replace(markerGlobal, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.!?,])/g, "$1")
    .replace(/\s+([.!?])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();

  // If a marker used an unrecognised instruction shape, remove only its
  // sentence rather than letting the diagnostic token reach the UI.
  if (marker.test(cleaned)) {
    cleaned = cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((sentence) => !marker.test(sentence))
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  return cleaned || "Original post Assignment";
}

export function isExplicitGhostModeRequest(content: string) {
  const normalized = content.toLowerCase().replace(/[’]/g, "'");
  return /\b(?:put|move|switch|change|set)\s+(?:this|the|my)?\s*presence\s+(?:into|in|to|as)\s+ghost(?:\s+mode)?\b/.test(normalized)
    || /\bmake\s+(?:this|the|my)?\s*presence\s+(?:a\s+)?ghost(?:\s+presence)?\b/.test(normalized)
    || /\b(?:turn|enable)\s+ghost\s+mode\s+on\b/.test(normalized);
}

function makeStandingIntent(state: OpenPresenceState, instruction: string, presence: Presence | null, day: string, time: string, objective: string, executionWindow: string): StandingIntent {
  const timestamp = now();
  return { id: id("standing"), agentId: state.agent?.id ?? "", presenceId: presence?.id, instruction: instruction.trim(), trigger: { type: "schedule", config: { day, time } }, objective, quality: { skipIfNothingWorthSaying: true }, executionWindow: { startsAt: executionWindow.split("–")[0], endsAt: executionWindow.split("–")[1] }, status: "active", createdAt: timestamp, updatedAt: timestamp };
}

function growthTarget(instruction: string) {
  const match = instruction.match(/(?:grow|reach|build|toward|to)[^\n.]{0,100}?([\d,]+)\s+(?:qualified\s+)?followers?\b/i) ?? instruction.match(/([\d,]+)\s+(?:qualified\s+)?followers?\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function assignmentQuantity(instruction: string): { quantity: number; quantityMode: AssignmentQuantityMode } {
  // Prefer an explicit quantity modifier, then a number attached to the
  // deliverable. This keeps years/dates in QA markers, URLs, and topic text
  // from being mistaken for the requested Assignment quantity.
  const modifierMatch = instruction.match(/\b(exactly|at\s+least|up\s+to|no\s+more\s+than|at\s+most|maximum|max(?:imum)?|minimum|min(?:imum)?|aim\s+for|target|around|about)\s+(\d+)\b/i);
  const deliverableMatch = instruction.match(/\b(\d+)\s+(?:(?:original|verified|sandbox|simulated|x|social|channel|distinct|new|worthwhile|meaningful)\s+){0,6}(?:posts?|publications?|repl(?:y|ies)|quotes?|reposts?|messages?|interactions?|conversations?|engagements?)\b/i);
  const match = modifierMatch ?? deliverableMatch;
  const quantity = Math.max(1, Number(match?.[2] ?? match?.[1] ?? 1));
  const modifier = (modifierMatch?.[1] ?? "").toLowerCase().replace(/\s+/g, " ");
  const quantityMode: AssignmentQuantityMode = /exactly/.test(modifier) ? "exact" : /at least|minimum|min/.test(modifier) ? "at_least" : /up to|no more|at most|maximum|max/.test(modifier) ? "at_most" : "target";
  return { quantity, quantityMode };
}

function assignmentDeliverableType(instruction: string): Assignment["deliverable"]["type"] {
  if (growthTarget(instruction)) return "audience_growth";
  if (/(?:https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/)/i.test(instruction) && /\b(?:promot|amplif|distribut|surface|share|reach|right people|genuinely care)\b/i.test(instruction)) return "meaningful_engagement";
  const evaluationOnly = /\b(?:evaluate|assess|review|recommend|decide\s+whether|tell\s+me\s+whether)\b/i.test(instruction)
    && (!/\b(?:publish|post|reply|respond|answer|handle|send|engage|message)\b/i.test(instruction) || /\b(?:evaluate|assess|review)\s+(?:whether|if)\b/i.test(instruction));
  if (evaluationOnly) return "decision_report";
  if (/\b(reply|repl(?:y|ies)|respond|answer|engage|comment)\b/i.test(instruction)) return "reply";
  if (/\b(quote|repost|message)\b/i.test(instruction)) return instruction.match(/\bquote\b/i) ? "quote" : instruction.match(/\brepost\b/i) ? "repost" : "message";
  return "original_publication";
}

function scheduledAssignmentRecurrence(schedule: Assignment["schedule"]) {
  if (!schedule) return { kind: "once" as const, label: "Once" };
  if (schedule.day.trim().toLowerCase() === "daily") return { kind: "daily" as const, label: "Every day" };
  return { kind: "weekly" as const, label: "Every week" };
}

function assignmentDeliverableLabel(type: Assignment["deliverable"]["type"]) {
  if (type === "audience_growth") return "a long-term audience-growth responsibility";
  return type === "original_publication" ? "one original post published" : type === "reply" ? "one public reply or conversation contribution" : type === "like" ? "one Like applied" : type === "decision_report" ? "one reasoned decision report" : `one ${type.replaceAll("_", " ")}`;
}

function assignmentSuccessEvidence(type: Assignment["deliverable"]["type"], presence: Presence | null | undefined, environment: PresenceEnvironment) {
  if (type === "audience_growth") return `The latest ${presence?.channel === "x" ? "X" : presence?.name ?? "channel"} audience snapshot verifies the follower target.`;
  if (type === "decision_report") return "A reasoned report is saved and explains the recommendation, including when no public action is warranted.";
  const destination = presence?.channel === "x" ? "X" : presence?.name ?? "the selected channel";
  if (environment === "sandbox") {
    if (type === "original_publication") return "The post appears in the Sandbox and is confirmed.";
    if (type === "reply") return "The reply is visible in the Sandbox conversation and confirmed.";
    if (type === "like") return "The Like appears on the Sandbox post and is confirmed.";
    if (type === "quote") return "The quote-post appears in the Sandbox and is confirmed.";
    if (type === "repost") return "The repost appears in the Sandbox and is confirmed.";
  }
  if (type === "original_publication") return `The post is live on ${destination} and confirmed.`;
  if (type === "reply") return `The reply is visible in the conversation on ${destination} and confirmed.`;
  if (type === "like") return `The Like is live on ${destination} and confirmed.`;
  if (type === "quote") return `The quote-post is live on ${destination} and confirmed.`;
  if (type === "repost") return `The repost is live on ${destination} and confirmed.`;
  if (type === "message") return "The message is delivered to the recipient and confirmed.";
  return `The ${type.replaceAll("_", " ")} is completed and confirmed.`;
}

function assignmentAffordance(type: Assignment["deliverable"]["type"]) {
  if (type === "original_publication") return "post";
  if (type === "reply" || type === "meaningful_engagement") return "reply";
  if (type === "like" || type === "quote" || type === "repost" || type === "message") return type;
  return undefined;
}

export function preflightAssignment(source: OpenPresenceState, assignment: Assignment, delegationPolicy: AssignmentDelegationPolicy = "keep_moving"): AssignmentPreflight {
  const presence = source.presences.find((item) => item.id === assignment.presenceId) ?? source.presence;
  const instruction = assignment.instruction.trim();
  const checks: AssignmentReadinessCheck[] = [];
  const issues: string[] = [];
  const assumptions: string[] = [];
  const affordance = assignmentAffordance(assignment.deliverable.type);
  const deliverable = assignmentDeliverableLabel(assignment.deliverable.type);
  const timing = assignment.schedule ? `${assignment.schedule.day} · ${assignment.schedule.time}–${assignment.schedule.executionWindow.split(/[–-]/).map((part) => part.trim())[1] ?? assignment.schedule.time} · closes at ${assignment.schedule.executionWindow.split(/[–-]/).map((part) => part.trim())[1] ?? assignment.schedule.time}` : undefined;

  if (!presence) {
    checks.push({ label: "Presence", status: "fail", detail: "No Presence is available to carry this Assignment." });
    issues.push("Choose a Presence before activating this Assignment.");
  } else {
    checks.push({ label: "Presence", status: "pass", detail: `${presence.name} · ${presence.channel}` });
  }

  const materiallyUnclear = instruction.length < 8 || /^(?:think about|consider|look at|do something about)\b/i.test(instruction);
  if (materiallyUnclear) {
    checks.push({ label: "Completion contract", status: "fail", detail: "The instruction does not make the expected outcome clear enough to verify." });
    issues.push("State what Genny should deliver or decide; this Assignment remains Draft until completion is clear.");
  } else {
    checks.push({ label: "Completion contract", status: "pass", detail: `${deliverable} · verified completion required` });
  }

  if (assignment.schedule) {
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(assignment.schedule.time) && /^([01]\d|2[0-3]):[0-5]\d[–-]([01]\d|2[0-3]):[0-5]\d$/.test(assignment.schedule.executionWindow);
    checks.push({ label: "Timing", status: validTime ? "pass" : "fail", detail: validTime ? timing! : "The scheduled time or execution window is invalid." });
    if (!validTime) issues.push("Choose a valid day, time, and execution window before activation.");
  } else {
    assumptions.push("Genny will work when the Assignment is activated or when its linked Attention Source makes it eligible.");
    checks.push({ label: "Timing", status: "warning", detail: "No deadline or window was supplied; the Assignment remains manually startable." });
  }

  if (assignment.successEvidence?.kind === "metric_threshold") {
    const manifest = derivePresenceCapabilityManifest(source, assignment.presenceId);
    const metricCapability = manifest.items.find((item) => item.capability === (assignment.successEvidence?.metric === "followers" ? "follower_measurement" : "post_performance"));
    const available = metricCapability?.availability === "available";
    checks.push({ label: "Evidence source", status: available ? "pass" : "warning", detail: available ? `${metricCapability?.provider ?? "Connected channel"} can observe ${assignment.successEvidence.metric}.` : `Follower evidence is not currently available; the responsibility can continue, but progress will remain unknown until a channel reports it.` });
    if (!available) assumptions.push("Follower progress will be updated when the connected channel reports a fresh audience snapshot.");
  } else if (presence && assignment.deliverable.type === "meaningful_engagement") {
    const manifest = derivePresenceCapabilityManifest(source, assignment.presenceId);
    const actions = ["reply", "quote", "repost", "like", "follow"];
    const available = manifest.items.filter((item) => actions.includes(item.capability) && item.canExecute && item.canVerify && (presence.execution[item.capability] ?? "off") !== "off");
    checks.push({ label: "Channel capabilities", status: available.length ? "pass" : "fail", detail: available.length ? `${available.map((item) => item.label).join(", ")} are available for the Agent to choose from.` : "No verified public interaction capability is currently available." });
    if (!available.length) issues.push("Enable at least one verified public interaction capability for this Presence before activating the Assignment.");
  } else if (presence && affordance) {
    const readiness = evaluateExecutionReadiness({
      presence,
      channel: presence.channel,
      affordance,
      state: source,
      environment: assignment.environment,
    });
    const unavailable = readiness.disposition === "blocked" || readiness.disposition === "needs_you";
    checks.push({
      label: "Channel capability",
      status: unavailable ? "fail" : readiness.disposition === "awaiting_review" ? "warning" : "pass",
      detail: unavailable
        ? readiness.blockerReason ?? `${presence.name} cannot perform ${affordance} on ${presence.channel} with the current capability and authority.`
        : `${affordance} is authorized through the Presence execution envelope.`,
    });
    if (unavailable) issues.push(readiness.blockerReason ?? `Enable ${affordance} authority for ${presence.name} or change the Assignment's requested outcome.`);
  } else {
    checks.push({ label: "Channel capability", status: "pass", detail: "No public channel action is required for this deliverable." });
  }

  const status = issues.some((issue) => issue.includes("cannot perform") || issue.includes("Enable") || issue.includes("disabled")) ? "blocked" : issues.length ? "needs_input" : assumptions.length ? "ready_with_assumptions" : "ready";
  const contract = materiallyUnclear ? undefined : {
    objective: instruction,
    deliverable,
    successEvidence: assignment.successEvidence?.kind === "metric_threshold" ? `${assignment.successEvidence.metric} ${assignment.successEvidence.comparator} ${assignment.successEvidence.value.toLocaleString()}.` : assignmentSuccessEvidence(assignment.deliverable.type, presence, assignment.environment),
    timing,
    agentDecides: ["angle and wording", "research and evidence", "format and assets", "sequencing and retries", "exact moment within the authorized window"],
    hardConstraints: assignment.editorialContext?.constraints ?? [],
    assumptions,
  };
  return { status, delegationPolicy, semanticSummary: assignment.deliverable.type === "decision_report" ? "This Assignment evaluates and reports; it does not require a public response." : `This Assignment requires ${deliverable}; a rejected candidate keeps the responsibility active.`, contract, checks, issues, reviewedAt: now(), reviewedRevision: assignment.revision ?? 0 };
}

function assignmentCreationSignature(assignment: Assignment) {
  const schedule = assignment.schedule ? `${assignment.schedule.day}|${assignment.schedule.time}|${assignment.schedule.executionWindow}` : "";
  return [
    assignment.presenceId,
    assignment.environment,
    assignment.sessionId ?? "",
    assignment.objective ?? "",
    assignment.executionPolicy.delegationPolicy ?? "keep_moving",
    schedule,
    assignment.instruction.trim().toLocaleLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " "),
  ].join("\u001f");
}

function assignmentCanBlockDuplicateCreation(assignment: Assignment) {
  return !["completed", "completed_with_adaptation", "cancelled", "failed", "expired_incomplete"].includes(assignment.status);
}

export function compileAssignmentInstruction(source: OpenPresenceState, instruction: string, presenceId?: string, environment: PresenceEnvironment = "sandbox", sessionId?: string, schedule?: Assignment["schedule"], delegationPolicy: AssignmentDelegationPolicy = "keep_moving", objective?: string): Assignment {
  const clean = instruction.trim();
  if (!clean) throw new Error("An Assignment needs an expected outcome.");
  const presence = source.presences.find((item) => item.id === (presenceId ?? source.activePresenceId)) ?? source.presence;
  if (!presence || !source.agent) throw new Error("Choose a Presence before creating an Assignment.");
  const { quantity, quantityMode } = assignmentQuantity(clean);
  const recurrence = /\b(?:once|one[- ]time|single\s+occurrence)\b/i.test(clean)
    ? { kind: "once" as const, label: "Once" }
    : /every\s+(?:weekday|workday)|each\s+weekday/i.test(clean)
      ? { kind: "weekdays" as const, label: "Every weekday" }
      : /every\s+day|each\s+day|per\s+day|daily/i.test(clean)
        ? { kind: "daily" as const, label: "Every day" }
        : /this\s+week|each\s+week|per\s+week|weekly/i.test(clean)
          ? { kind: "weekly" as const, label: "Every week" }
          : scheduledAssignmentRecurrence(schedule);
  const targetFollowers = growthTarget(clean);
  const type = assignmentDeliverableType(clean);
  const topicMatch = clean.match(/\b(?:about|around|focus(?:ed)?\s+on|cover(?:ing)?)\s+(.+?)(?:\.|;|$)/i);
  const topics = topicMatch?.[1]?.split(/,|\bor\b|\band\b/i).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const constraints = [
    /don't\s+repeat|do\s+not\s+repeat|different\s+angles/i.test(clean) ? "Keep the delivered ideas meaningfully distinct." : "",
    /choose\s+your\s+own|find\s+your\s+own/i.test(clean) ? "The Agent chooses the topics, thesis, examples, format, and wording." : "",
  ].filter(Boolean);
  const timestamp = now();
  const seedId = clean.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s/]+\/status\/(\d+)/i)?.[1];
  const growthPlan: AssignmentPlan | undefined = targetFollowers ? { id: id("assignment-plan"), assignmentId: "pending", revision: 1, summary: "Build durable attention by publishing useful original ideas, participating where the Presence can add value, and developing relationships with people in the intended territory.", dailyTargets: ["Aim for 1–2 useful original publications when there is something worth saying.", "Inspect relevant conversations and continue promising relationships."], publishingApproach: ["Prefer concrete implementation lessons over broad commentary.", "Use the format that best serves the idea; do not publish filler to hit a quota."], discoveryDirections: topics?.length ? topics : presence.brief.primaryTerritory.slice(0, 6), relationshipFocus: [presence.brief.audience], hypotheses: ["Specific, useful observations should create stronger repeat interaction than generic commentary."], nextWeeklyReviewAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), nextStrategicReviewAt: new Date(Date.now() + 28 * 86_400_000).toISOString(), source: "agent", createdAt: timestamp, updatedAt: timestamp } : undefined;
  const assignment: Assignment = { id: id("assignment"), agentId: source.agent.id, presenceId: presence.id, sessionId, channelId: presence.channel, environment, title: clean, origin: schedule ? "schedule" : "manual", activation: targetFollowers ? { type: "continuous" } : schedule ? { type: "scheduled", recurrence } : { type: "manual" }, instruction: clean, deliverable: { type, quantity: targetFollowers ? undefined : quantity, quantityMode: targetFollowers ? undefined : quantityMode }, quantityPolicy: targetFollowers ? { quantity: "agent_planned", mode: "at_least", period: "assignment" } : { quantity, mode: quantityMode, period: recurrence.kind === "weekly" ? "week" : recurrence.kind === "daily" || recurrence.kind === "weekdays" ? "day" : "assignment" }, recurrence: targetFollowers ? { kind: "once", label: "Continuous responsibility" } : recurrence, schedule, editorialContext: { topics, constraints }, audienceObjective: targetFollowers ? clean.split(/\bwhile\b/i)[1]?.trim() || presence.brief.audience : undefined, objective, successEvidence: targetFollowers ? { kind: "metric_threshold", metric: "followers", comparator: ">=", value: targetFollowers, label: `${targetFollowers.toLocaleString()} followers` } : undefined, plan: growthPlan, planHistory: growthPlan ? [growthPlan] : [], executionPolicy: { usePresenceEnvelope: true, delegationPolicy }, status: "draft", progress: { required: targetFollowers ? 1 : quantity, verified: 0 }, rejectedCandidates: 0, systemFailures: 0, work: { phase: "candidate_review", attempts: 0, maxAttempts: targetFollowers ? 0 : Math.min(12, Math.max(4, quantity * 4)), storiesResearched: 0 }, attemptHistory: [], storyResearch: [], createdAt: timestamp, updatedAt: timestamp };
  if (type === "meaningful_engagement") {
    assignment.activation = { type: "continuous" };
    assignment.deliverable = { type };
    assignment.quantityPolicy = { quantity: "agent_planned", mode: "at_least", period: "assignment" };
    assignment.progress.required = 0;
    assignment.work!.maxAttempts = 0;
  }
  if (growthPlan) growthPlan.assignmentId = assignment.id;
  if (seedId) assignment.seed = { externalRef: { type: "x.post", id: seedId }, role: type === "meaningful_engagement" ? "distributable_target" : "required_target", availability: "unknown" };
  assignment.preflight = preflightAssignment(source, assignment, delegationPolicy);
  return assignment;
}

export function assignmentIsSatisfied(assignment: Assignment, source?: OpenPresenceState) {
  if (assignment.successEvidence?.kind === "metric_threshold") {
    const snapshot = source ? latestAudienceSnapshot(source, assignment.presenceId) : undefined;
    if (!snapshot || snapshot.observationStatus !== "observed" || snapshot.source === "manual") return false;
    const value = snapshot.followers;
    switch (assignment.successEvidence.comparator) {
      case ">=": return value >= assignment.successEvidence.value;
      case ">": return value > assignment.successEvidence.value;
      case "=": return value === assignment.successEvidence.value;
      case "<": return value < assignment.successEvidence.value;
      case "<=": return value <= assignment.successEvidence.value;
    }
  }
  const required = assignment.quantityPolicy?.quantity ?? assignment.deliverable.quantity ?? assignment.progress.required;
  const mode = canonicalAssignmentQuantityMode(assignment.quantityPolicy?.mode ?? assignment.deliverable.quantityMode);
  if (assignment.quantityPolicy?.quantity === "agent_planned" || typeof required !== "number" || mode === "at_most") return false;
  return assignment.progress.verified >= required;
}

const pursuitTerminalStatuses = new Set<AssignmentPursuitWindow["status"]>(["completed", "expired", "cancelled"]);
const pursuitActions: AssignmentPursuitAction[] = ["reply", "quote", "repost", "like", "follow"];

export function activeAssignmentPursuitWindow(source: OpenPresenceState, assignmentId: string, at = Date.now()) {
  return (source.assignmentPursuitWindows ?? []).find((window) => window.assignmentId === assignmentId
    && window.status === "active"
    && new Date(window.startsAt).getTime() <= at
    && new Date(window.deadlineAt).getTime() > at);
}

export function assignmentPursuitUsage(source: OpenPresenceState, window: AssignmentPursuitWindow, at = Date.now()) {
  const start = new Date(window.startsAt).getTime();
  const end = Math.min(new Date(window.deadlineAt).getTime(), at);
  const events = source.resourceUsageEvents.filter((item) => item.presenceId === window.presenceId
    && item.attentionSource === "assignment"
    && new Date(item.createdAt).getTime() >= start
    && new Date(item.createdAt).getTime() <= end
    && (!item.originId || item.originId === window.assignmentId));
  const count = (category: ResourceUsageEvent["category"]) => events
    .filter((item) => item.category === category)
    .reduce((total, item) => total + (item.usage.requests ?? 1), 0);
  const estimatedCostCents = events.reduce((total, item) => total + (item.cost?.currency === "USD" ? Math.round(item.cost.amount * 100) : 0), 0);
  return {
    channelReads: count("channel_read"),
    hydrations: count("hydration"),
    modelCalls: count("model"),
    visionCalls: count("vision"),
    estimatedCostCents,
  };
}

export function assignmentPursuitVerifiedCounts(source: OpenPresenceState, window: AssignmentPursuitWindow, at = Date.now()) {
  const start = new Date(window.startsAt).getTime();
  const end = Math.min(new Date(window.deadlineAt).getTime(), at);
  const executions = source.executions.filter((execution) => execution.assignmentId === window.assignmentId
    && execution.presenceId === window.presenceId
    && execution.status === "succeeded"
    && new Date(execution.createdAt).getTime() >= start
    && new Date(execution.createdAt).getTime() <= end);
  const verifiedIds = new Set(source.outcomes.filter((outcome) => outcome.status === "succeeded" && executions.some((execution) => execution.id === outcome.executionId)).map((outcome) => outcome.executionId));
  const counts: Record<AssignmentPursuitAction, number> = { reply: 0, quote: 0, repost: 0, like: 0, follow: 0 };
  for (const execution of executions) {
    const action = execution.affordance.replace(/^x\./, "") as AssignmentPursuitAction;
    if (verifiedIds.has(execution.id) && pursuitActions.includes(action)) counts[action] += 1;
  }
  return { verified: [...verifiedIds].length, counts };
}

/**
 * Every configured resource limit is a scheduler boundary for an explicit
 * distribution push. Model calls are included so a burst cannot keep
 * redispatching after its provider budget is exhausted.
 */
export const assignmentPursuitHardResourceCategories = [
  "maxChannelReads",
  "maxHydrations",
  "maxModelCalls",
  "maxVisionCalls",
  "maxEstimatedCostCents",
] as const;

export function assignmentPursuitHasHardResourceCapacity(source: OpenPresenceState, window: AssignmentPursuitWindow, at = Date.now()) {
  return assignmentPursuitHardResourceCategories.every((category) => assignmentPursuitCanSpend(source, window, category, at));
}

export function assignmentPursuitCanSpend(source: OpenPresenceState, window: AssignmentPursuitWindow, category: keyof AssignmentPursuitResourceBudget, at = Date.now()) {
  const limit = window.resourceBudget?.[category];
  if (limit === undefined) return true;
  const usage = assignmentPursuitUsage(source, window, at);
  const current = category === "maxChannelReads" ? usage.channelReads
    : category === "maxHydrations" ? usage.hydrations
      : category === "maxModelCalls" ? usage.modelCalls
        : category === "maxVisionCalls" ? usage.visionCalls : usage.estimatedCostCents;
  return current < limit;
}

export function formatRelativeTime(value: string, now = Date.now()) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "time unknown";
  const elapsed = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (elapsed < minute) return "just now";
  if (elapsed < hour) {
    const minutes = Math.floor(elapsed / minute);
    return `${minutes}m ago`;
  }
  if (elapsed < day) {
    const hours = Math.floor(elapsed / hour);
    return `${hours}h ago`;
  }
  if (elapsed < week) {
    const days = Math.floor(elapsed / day);
    return `${days}d ago`;
  }
  const weeks = Math.floor(elapsed / week);
  return `${weeks}w ago`;
}

function parseScheduleClock(value: string | undefined): number | undefined {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function scheduledExecutionEnd(schedule: Assignment["schedule"]): number | undefined {
  if (!schedule?.executionWindow) return undefined;
  const [, end] = schedule.executionWindow.split(/[–-]/).map((part) => part.trim());
  return parseScheduleClock(end);
}

export function scheduledAssignmentIsDue(assignment: Assignment, now = new Date()): boolean {
  if (!assignment.schedule || assignment.deliverable?.type === "reply") return false;
  if (!(["draft", "active", "working"].includes(assignment.status))) return false;
  if (assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() > now.getTime()) return false;
  const evaluatedToday = assignment.lastEvaluatedAt && new Date(assignment.lastEvaluatedAt).toDateString() === now.toDateString();
  if (evaluatedToday && assignment.lastOutcome && !["action_no_op", "candidate_rejected", "delivery_failed"].includes(assignment.lastOutcome.class)) return false;
  const day = assignment.schedule.day.trim().toLowerCase();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const daily = assignment.recurrence?.kind === "daily" || day === "daily";
  const weekdaysOnly = assignment.recurrence?.kind === "weekdays";
  if (!daily && (!weekdaysOnly || ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(currentDay)) && day !== currentDay) return false;
  if (weekdaysOnly && !["monday", "tuesday", "wednesday", "thursday", "friday"].includes(currentDay)) return false;
  const startMinutes = parseScheduleClock(assignment.schedule.time);
  if (startMinutes === undefined) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = scheduledExecutionEnd(assignment.schedule);
  if (endMinutes === undefined) return currentMinutes >= startMinutes;
  if (endMinutes >= startMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  // Preserve support for a window that crosses midnight (for example 22:00–02:00).
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function nextScheduledOccurrence(schedule: { day: string; time: string }, now = new Date(), recurrence?: Assignment["recurrence"]): Date {
  const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const startMinutes = parseScheduleClock(schedule.time);
  if (startMinutes === undefined) return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const daily = recurrence?.kind === "daily" || schedule.day.trim().toLowerCase() === "daily";
  if (daily) {
    const targetDate = new Date(now);
    const hours = Math.floor(startMinutes / 60);
    const minutes = startMinutes % 60;
    targetDate.setHours(hours, minutes, 0, 0);
    if (targetDate.getTime() <= now.getTime()) targetDate.setDate(targetDate.getDate() + 1);
    return targetDate;
  }
  const targetDayIndex = daysOfWeek.indexOf(schedule.day.trim().toLowerCase());
  const hours = Math.floor(startMinutes / 60);
  const minutes = startMinutes % 60;
  if (targetDayIndex === -1) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const currentDayIndex = now.getDay();
  let dayDiff = targetDayIndex - currentDayIndex;
  const targetDate = new Date(now);
  targetDate.setHours(hours, minutes, 0, 0);
  if (recurrence?.kind === "weekdays") {
    const currentWeekday = now.getDay();
    const targetWeekday = targetDayIndex === 0 || targetDayIndex === 6 ? 1 : targetDayIndex;
    dayDiff = targetWeekday - currentWeekday;
    if (dayDiff < 0 || (dayDiff === 0 && targetDate.getTime() <= now.getTime())) dayDiff += 7;
    const result = new Date(now);
    result.setDate(now.getDate() + dayDiff);
    while ([0, 6].includes(result.getDay())) result.setDate(result.getDate() + 1);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
  if (dayDiff < 0 || (dayDiff === 0 && targetDate.getTime() <= now.getTime())) {
    dayDiff += 7;
  }
  const result = new Date(now);
  result.setDate(now.getDate() + dayDiff);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function migrateLegacyOperatorDirectives(state: OpenPresenceState): OpenPresenceState {
  if (!state.operatorDirectives?.length) return state;
  for (const directive of state.operatorDirectives) {
    if (directive.migratedToAssignmentId) {
      const exists = state.assignments.some((a) => a.id === directive.migratedToAssignmentId);
      if (exists) continue;
    }
    const alreadyMigrated = state.assignments.find((a) => a.migration?.sourceType === "operatorDirective" && a.migration?.sourceId === directive.id);
    if (alreadyMigrated) {
      directive.migratedToAssignmentId = alreadyMigrated.id;
      continue;
    }
    const targetObject = state.mirrorObjects.find((obj) => obj.presenceId === directive.presenceId && obj.externalRef.type === directive.target.type && obj.externalRef.id === directive.target.id);
    const targetLabel = targetObject?.author?.handle ? `@${targetObject.author.handle.replace(/^@/, "")}` : targetObject?.author?.displayName ?? "the selected post";
    const assignmentId = id("assignment");
    const directiveExecution = [...state.executions]
      .filter((execution) => execution.operatorDirectiveId === directive.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const verified = directiveExecution?.status === "succeeded" && state.outcomes.some((outcome) => outcome.executionId === directiveExecution.id && outcome.status === "succeeded");
    const isFailed = directive.status === "failed" || ["failed", "blocked", "expired", "verification-closed"].includes(directiveExecution?.status ?? "");
    const assignment: Assignment = {
      id: assignmentId,
      agentId: directive.agentId || state.agent?.id || "",
      presenceId: directive.presenceId,
      sessionId: directive.sessionId,
      channelId: targetObject?.channelId ?? "x",
      environment: directive.environment ?? "live",
      title: `Reply to ${targetLabel}`,
      createdBy: "operator",
      origin: "manual",
      activation: { type: "manual" },
      target: targetObject ? { mirrorObjectId: targetObject.id } : undefined,
      migration: { sourceType: "operatorDirective", sourceId: directive.id },
      instruction: directive.optionalDirection ? `Reply to ${targetLabel}. Optional direction: ${directive.optionalDirection}` : `Reply to ${targetLabel}.`,
      deliverable: { type: "reply", quantity: 1, quantityMode: "exact" },
      quantityPolicy: { quantity: 1, mode: "exact", period: "assignment" },
      executionPolicy: { usePresenceEnvelope: true },
      status: verified ? "completed" : isFailed ? "failed" : "active",
      progress: { required: 1, verified: verified ? 1 : 0 },
      rejectedCandidates: 0,
      systemFailures: isFailed ? 1 : 0,
      createdAt: directive.createdAt,
      updatedAt: directive.createdAt,
    };
    state.assignments.unshift(normalizeAssignment(assignment));
    directive.migratedToAssignmentId = assignmentId;
  }
  return state;
}

function compileLegacyAgenda(state: OpenPresenceState, presenceId?: string, now = new Date()): AgendaCompilation {
  const presence = state.presences.find((p) => p.id === presenceId) ?? state.presence;
  const presenceScope = presence?.id;

  const scopedAssignments = state.assignments.filter((a) => {
    if (presenceScope && a.presenceId !== presenceScope) return false;
    if (["completed", "completed_with_adaptation", "cancelled", "failed", "paused"].includes(a.status)) return false;
    return true;
  });

  const latestRunFor = (assignmentId: string) => [...(state.assignmentRuns ?? [])]
    .filter((run) => run.assignmentId === assignmentId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  type InternalAgendaItem = AgendaItem & { _scheduledDate?: Date };

  const items: InternalAgendaItem[] = scopedAssignments.map((assignment) => {
    const run = latestRunFor(assignment.id);
    const isWorking = Boolean(
      (run && ["researching", "selecting", "writing", "delivering"].includes(run.status)) ||
      ["working", "awaiting_execution"].includes(assignment.status) ||
      ["researching", "visual_research", "publishing"].includes(assignment.work?.phase ?? "")
    );
    const isDueNow = scheduledAssignmentIsDue(assignment, now);
    const isContinuous = assignment.activation?.type === "continuous"
      || ["maintain_original_presence", "meaningful_engagement"].includes(assignment.deliverable.type)
      || (!assignment.schedule && !assignment.nextDueAt && assignment.deliverable.type !== "reply" && assignment.activation?.type !== "manual");
    const isUpcoming = Boolean(assignment.schedule || (assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() > now.getTime())) && !isDueNow && !isWorking;

    const needsOperator = assignment.status === "needs_operator"
      || assignment.status === "awaiting_review"
      || (assignment.status === "blocked" && Boolean(
          assignment.work?.blockedReason?.toLowerCase().includes("operator") ||
          assignment.work?.blockedReason?.toLowerCase().includes("knowledge") ||
          assignment.work?.blockedReason?.toLowerCase().includes("credential") ||
          assignment.work?.blockedReason?.toLowerCase().includes("permission")
        ));

    let horizon: AgendaHorizon = "now";
    if (needsOperator) {
      horizon = "attention";
    } else if (isWorking || isDueNow || assignment.deliverable.type === "reply" || assignment.activation?.type === "manual" || (assignment.status === "active" && !isUpcoming && !isContinuous)) {
      horizon = "now";
    } else if (isUpcoming) {
      horizon = "upcoming";
    } else {
      horizon = "ongoing";
    }

    let urgencyScore = 0;
    if (needsOperator) urgencyScore = 500;
    else if (isWorking) urgencyScore = 1000;
    else if (isDueNow) urgencyScore = 900;
    else if (assignment.deliverable.type === "reply") urgencyScore = 850;
    else if (assignment.createdBy === "operator") urgencyScore = 800;
    else if (horizon === "now") urgencyScore = 700;
    else if (horizon === "ongoing") urgencyScore = 300;
    else urgencyScore = 100;

    let scheduledFor: string | undefined;
    let scheduledDate: Date | undefined;
    if (assignment.schedule) {
      scheduledFor = `${assignment.schedule.day} ${assignment.schedule.time}`;
      scheduledDate = nextScheduledOccurrence(assignment.schedule, now, assignment.recurrence);
    } else if (assignment.nextDueAt) {
      scheduledDate = new Date(assignment.nextDueAt);
      scheduledFor = formatRelativeTime(assignment.nextDueAt);
    }

    const title = assignment.title ?? cleanUserFacingAssignmentInstruction(assignment.instruction);
    const subtitle = assignment.createdBy === "operator"
      ? "Operator request"
      : assignment.schedule
      ? `Scheduled · ${assignment.schedule.day} ${assignment.schedule.time}`
      : isContinuous
      ? "Continuous responsibility"
      : "Active assignment";

    const statusLabel = horizon === "now"
      ? isWorking ? "Working" : "Ready"
      : horizon === "ongoing"
      ? "Active"
      : horizon === "upcoming"
      ? assignment.schedule ? `${assignment.schedule.day} ${assignment.schedule.time}` : "Scheduled"
      : "Needs attention";

    const detail = horizon === "now"
      ? isWorking ? "The Agent is currently working through this responsibility." : "Ready · Genny will pick this up automatically."
      : horizon === "ongoing"
      ? (assignment.lastOutcome?.message ?? "Continuous strategic responsibility evaluated during open publishing windows.")
      : horizon === "upcoming"
      ? `Queued to evaluate automatically on ${assignment.schedule ? `${assignment.schedule.day} at ${assignment.schedule.time}` : (scheduledFor ?? "schedule")}.`
      : (assignment.lastOutcome?.message ?? assignment.work?.blockedReason ?? "The Agent has paused for an operator decision.");

    return {
      id: assignment.id,
      assignmentId: assignment.id,
      horizon,
      title,
      subtitle,
      statusLabel,
      detail,
      deliverableLabel: assignment.deliverable?.type?.replaceAll("_", " "),
      timingLabel: scheduledFor,
      isReady: horizon === "now" && !isWorking,
      isWorking,
      isDueNow,
      urgencyScore,
      scheduledFor,
      targetMirrorObjectId: assignment.target?.mirrorObjectId,
      assignment,
      _scheduledDate: scheduledDate,
    };
  });

  const nowItems = items
    .filter((i) => i.horizon === "now")
    .sort((a, b) => b.urgencyScore - a.urgencyScore || b.assignment.updatedAt.localeCompare(a.assignment.updatedAt));

  const ongoingItems = items
    .filter((i) => i.horizon === "ongoing")
    .sort((a, b) => b.assignment.updatedAt.localeCompare(a.assignment.updatedAt));

  const upcomingItems = items
    .filter((i) => i.horizon === "upcoming")
    .sort((a, b) => {
      if (a._scheduledDate && b._scheduledDate) {
        return a._scheduledDate.getTime() - b._scheduledDate.getTime();
      }
      return (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "");
    });

  const attentionItems = items
    .filter((i) => i.horizon === "attention")
    .sort((a, b) => b.assignment.updatedAt.localeCompare(a.assignment.updatedAt));

  return {
    items: [...nowItems, ...ongoingItems, ...upcomingItems, ...attentionItems],
    now: nowItems,
    ongoing: ongoingItems,
    upcoming: upcomingItems,
    attention: attentionItems,
  };
}

export interface WorkProperties {
  obligationKind: "working_continuity" | "operator_blocked" | "scheduled_due" | "direct_mention" | "conversation_turn" | "exploration_opportunity" | "watchlist_signal" | "growth_review" | "routine";
  hasDeliverableObligation: boolean;
  scheduledWindowActive: boolean;
  minutesUntilDue?: number;
  conversationalReciprocity: boolean;
  elapsedHoursSinceObservation: number;
  strategicRelevance: number; // 0.0 to 1.0
  isReadinessComplete: boolean;
  isAffordanceEnabled: boolean;
  isBodyRouteAvailable: boolean;
}

export function calculatePropertyBasedWorkScore(props: WorkProperties): number {
  let score = 0;
  // 1. Obligation Base
  switch (props.obligationKind) {
    case "working_continuity":
      score += 400;
      break;
    case "scheduled_due":
      score += 320;
      break;
    case "direct_mention":
    case "conversation_turn":
      score += 220;
      break;
    case "exploration_opportunity":
    case "watchlist_signal":
      score += 180;
      break;
    case "growth_review":
      score += 160;
      break;
    case "operator_blocked":
      score += 100;
      break;
    case "routine":
    default:
      score += 100;
      break;
  }
  // 2. Deliverable / Assignment Obligation
  if (props.hasDeliverableObligation) score += 120;
  // 3. Urgency & Deadlines
  if (props.scheduledWindowActive) score += 180;
  if (props.minutesUntilDue !== undefined) {
    if (props.minutesUntilDue <= 0) score += 160;
    else if (props.minutesUntilDue <= 15) score += 110;
    else if (props.minutesUntilDue <= 60) score += 60;
  }
  // 4. Conversational Reciprocity
  if (props.conversationalReciprocity) score += 90;
  // 5. Freshness Decay (decay by elapsed hours)
  const freshnessPenalty = Math.min(180, Math.floor(props.elapsedHoursSinceObservation * 4.5));
  score -= freshnessPenalty;
  // 6. Strategic Value & Relevance (0.0 to 1.0 scaled up to +180)
  score += Math.round(Math.max(0, Math.min(1, props.strategicRelevance)) * 180);
  return Math.max(10, score);
}

/**
 * Compile ephemeral, executable attention candidates from the Agent's durable
 * responsibilities and its live attention sources. Assignments stay durable;
 * these work items are the current snapshot of what could deserve attention.
 */
export function compileAgendaWork(state: OpenPresenceState, presenceId?: string, now = new Date()): AgendaCompilation {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const scopedPresenceId = presence?.id;
  const scopedAssignments = state.assignments.filter((assignment) => {
    if (scopedPresenceId && assignment.presenceId !== scopedPresenceId) return false;
    return !["completed", "completed_with_adaptation", "cancelled", "failed", "expired_incomplete", "paused"].includes(assignment.status);
  });
  const scopedMirror = state.mirrorObjects.filter((object) => object.presenceId === scopedPresenceId && object.environment !== "sandbox");
  const latestRunFor = (assignmentId: string) => [...(state.assignmentRuns ?? [])]
    .filter((run) => run.assignmentId === assignmentId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const targetForAssignment = (assignment: Assignment) => assignment.target?.mirrorObjectId
    ? scopedMirror.find((object) => object.id === assignment.target?.mirrorObjectId)
    : undefined;
  const targetLabel = (object: MirrorObject | undefined) => object?.author?.handle
    ? `@${object.author.handle.replace(/^@/, "")}`
    : object?.author?.displayName ?? "the selected post";
  const targetContext = (object: MirrorObject | undefined) => object?.content?.text?.trim()
    ? ` “${object.content.text.trim().slice(0, 88)}${object.content.text.trim().length > 88 ? "…" : ""}”`
    : "";
  const isRecent = (value?: string, hours = 48) => Boolean(value && Number.isFinite(new Date(value).getTime()) && now.getTime() - new Date(value).getTime() <= hours * 60 * 60 * 1000);
  const openAssignmentStatuses = new Set(["active", "working", "awaiting_execution", "planning", "accepted", "awaiting_review", "needs_operator", "blocked"]);
  const isWorkingAssignment = (assignment: Assignment, run = latestRunFor(assignment.id)) => Boolean(
    (run && ["researching", "selecting", "writing", "delivering"].includes(run.status))
      || ["working", "awaiting_execution"].includes(assignment.status)
      || ["researching", "visual_research", "publishing"].includes(assignment.work?.phase ?? ""),
  );
  const isContinuousAssignment = (assignment: Assignment) => assignment.activation?.type === "continuous"
    || ["maintain_original_presence", "meaningful_engagement"].includes(assignment.deliverable.type)
    || (!assignment.schedule && !assignment.nextDueAt && assignment.deliverable.type !== "reply" && assignment.activation?.type !== "manual");

  const items: AgendaWorkItem[] = [];
  const addItem = (item: AgendaWorkItem) => items.push(item);

  for (const assignment of scopedAssignments) {
    const run = latestRunFor(assignment.id);
    const target = targetForAssignment(assignment);
    const working = isWorkingAssignment(assignment, run);
    const dueNow = scheduledAssignmentIsDue(assignment, now);
    const needsOperator = assignment.status === "needs_operator" || assignment.status === "awaiting_review" || (assignment.status === "blocked" && Boolean(assignment.work?.blockedReason));
    const scheduledFuture = Boolean(assignment.schedule && !dueNow && !working) || Boolean(assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() > now.getTime() && !working);
    const original = ["original_publication", "maintain_original_presence"].includes(assignment.deliverable.type);
    const shouldSurface = needsOperator || working || dueNow || assignment.deliverable.type === "reply" || assignment.activation?.type === "manual" || (original && openAssignmentStatuses.has(assignment.status) && !scheduledFuture);
    if (!shouldSurface) continue;
    const isPublishing = original;
    const title = isPublishing
      ? "Create the next original publication"
      : assignment.deliverable.type === "reply"
        ? `Reply to ${targetLabel(target)}${targetContext(target)}`
        : assignment.deliverable.type === "audience_growth"
          ? "Review growth evidence"
          : assignment.title ?? cleanUserFacingAssignmentInstruction(assignment.instruction);
    const progressRequired = assignment.progress.required || (typeof assignment.quantityPolicy?.quantity === "number" ? assignment.quantityPolicy.quantity : undefined);
    const progress = progressRequired !== undefined ? { verified: assignment.progress.verified, required: progressRequired, label: `${assignment.progress.verified} / ${progressRequired} verified` } : undefined;
    const phase = run?.currentStage ?? assignment.work?.phase;
    const nextAction = working
      ? run?.status === "writing" ? "Finish the draft candidate." : run?.status === "delivering" ? "Complete delivery and verify the public outcome." : "Continue evaluating the current candidate."
      : isPublishing ? "Choose the next useful angle from recent conversations." : assignment.deliverable.type === "reply" ? "Judge whether the conversation still merits a reply, then choose the wording." : "Begin the next eligible step.";
    const detail = working
      ? `${phase ? phase.replaceAll("_", " ") : "Working"}. ${nextAction}`
      : needsOperator
        ? assignment.work?.blockedReason ?? "The Agent has paused for an operator decision."
        : isPublishing && assignment.schedule
          ? `Waiting for the next publishing window: ${assignment.schedule.day} at ${assignment.schedule.time}.`
          : assignment.lastOutcome?.message ?? "Ready to consider this responsibility now.";
    const doneWhen = progress ? progress.label : assignment.successEvidence?.kind === "metric_threshold" ? `${assignment.successEvidence.metric} ${assignment.successEvidence.comparator} ${assignment.successEvidence.value.toLocaleString()}.` : "A verified channel outcome is recorded.";
  const minutesUntilDue = dueNow ? 0 : (assignment.schedule ? Math.round((new Date(nextScheduledOccurrence(assignment.schedule, now, assignment.recurrence)).getTime() - now.getTime()) / 60000) : (assignment.nextDueAt ? Math.round((new Date(assignment.nextDueAt).getTime() - now.getTime()) / 60000) : undefined));
    const urgencyScore = calculatePropertyBasedWorkScore({
      obligationKind: needsOperator ? "operator_blocked" : working ? "working_continuity" : dueNow ? "scheduled_due" : "routine",
      hasDeliverableObligation: true,
      scheduledWindowActive: dueNow,
      minutesUntilDue,
      conversationalReciprocity: assignment.deliverable.type === "reply",
      elapsedHoursSinceObservation: 0,
      strategicRelevance: 0.8,
      isReadinessComplete: true,
      isAffordanceEnabled: true,
      isBodyRouteAvailable: true,
    });
    addItem({
      id: `assignment-work:${assignment.id}`,
      source: isPublishing ? "publishing" : "assignment",
      sourceRef: assignment.id,
      assignmentId: assignment.id,
      state: needsOperator ? "needs_operator" : working ? "working" : scheduledFuture ? "upcoming" : "ready",
      safePriorityReason: needsOperator ? "An explicit responsibility is blocked on an operator decision." : working ? "The Agent has already started this work and should preserve continuity." : assignment.deliverable.type === "reply" ? "An explicit unresolved responsibility remains socially actionable." : dueNow ? "Its authorized work window is open now." : "This responsibility is eligible and has a concrete next step.",
      nextAction,
      doneWhen,
      title,
      originLabel: isPublishing ? "Publishing responsibility" : assignment.createdBy === "operator" ? "Operator Assignment" : "Active responsibility",
      statusLabel: needsOperator ? "Needs you" : working ? "Working" : scheduledFuture ? "Upcoming" : "Ready",
      detail,
      progress,
      nextEligibleAt: assignment.schedule ? new Date(nextScheduledOccurrence(assignment.schedule, now, assignment.recurrence)).toISOString() : assignment.nextDueAt,
      targetMirrorObjectId: target?.id,
      updatedAt: assignment.updatedAt,
      urgencyScore,
      assignment,
    });
  }

  const assignedMirrorIds = new Set(scopedAssignments.map((assignment) => assignment.target?.mirrorObjectId).filter(Boolean));
  const ignoredTargetIds = new Set(
    (state.operatorDirectives ?? [])
      .filter((d) => d.presenceId === scopedPresenceId && d.requiredAct === "no_op")
      .map((d) => d.target.id)
  );
  const alreadyAddressedTargetIds = new Set([
    ...state.executions
      .filter((e) => e.presenceId === scopedPresenceId && !["failed", "blocked", "expired", "cancelled"].includes(e.status))
      .map((e) => e.target?.id)
      .filter(Boolean),
    ...state.socialDecisions
      .filter((d) => d.presenceId === scopedPresenceId && d.decision !== "no_op")
      .flatMap((d) => [d.origin?.refId, ...(d.focalMirrorObjectIds ?? [])])
      .filter(Boolean),
    ...state.mirrorObjects
      .filter((m) => m.presenceId === scopedPresenceId && m.actorPresenceId === scopedPresenceId && m.parentExternalRef?.id)
      .map((m) => m.parentExternalRef!.id),
  ]);

  const presenceHandle = normalizeHandleForComparison(presence?.handle);
  const seenMentionKeys = new Set<string>();
  const mentionCandidates = scopedMirror
    .filter((object) =>
      !assignedMirrorIds.has(object.id) &&
      !ignoredTargetIds.has(object.externalRef.id) &&
      !ignoredTargetIds.has(object.id) &&
      !alreadyAddressedTargetIds.has(object.externalRef.id) &&
      !alreadyAddressedTargetIds.has(object.id) &&
      object.actorPresenceId !== scopedPresenceId &&
      isRecent(object.occurredAt ?? object.observedAt, 72)
    )
    .filter((object) => {
      const text = `${object.content?.text ?? ""} ${(object.author?.handle ?? "")}`.toLowerCase();
      return Boolean(presenceHandle && text.includes(`@${presenceHandle}`));
    })
    .sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt))
    .filter((object) => {
      const textSnippet = (object.content?.text ?? "").trim().slice(0, 50);
      const authorKey = (object.author?.handle ?? object.author?.displayName ?? "").toLowerCase();
      const dedupeKey = object.externalRef.id || `${authorKey}:${textSnippet}`;
      if (seenMentionKeys.has(dedupeKey)) return false;
      seenMentionKeys.add(dedupeKey);
      return true;
    });
  const mentionWorkCandidates = mentionCandidates.slice(0, 3);
  mentionWorkCandidates.forEach((object, index) => {
    const elapsedHours = (now.getTime() - new Date(object.occurredAt ?? object.observedAt).getTime()) / (1000 * 60 * 60);
    const urgencyScore = calculatePropertyBasedWorkScore({
      obligationKind: "direct_mention",
      hasDeliverableObligation: false,
      scheduledWindowActive: false,
      conversationalReciprocity: true,
      elapsedHoursSinceObservation: Math.max(0, elapsedHours),
      strategicRelevance: 0.65 - index * 0.05,
      isReadinessComplete: true,
      isAffordanceEnabled: true,
      isBodyRouteAvailable: true,
    });
    addItem({
      id: `mention-work:${object.id}`,
      source: "mention",
      sourceRef: object.id,
      state: "ready",
      safePriorityReason: index === 0 ? "A fresh inbound mention is waiting and no durable responsibility already covers it." : "A recent inbound mention is eligible after the freshest social obligation.",
      nextAction: "Inspect the post and decide whether a reply, reaction, or silence is the useful act.",
      doneWhen: "The mention is judged and either addressed or intentionally left alone.",
      title: `Review mention from ${targetLabel(object)}${targetContext(object)}`,
      originLabel: "Inbound mention",
      statusLabel: "Fresh",
      detail: "Observed and selected for attention; it is not automatically a reply obligation.",
      targetMirrorObjectId: object.id,
      updatedAt: object.occurredAt ?? object.observedAt,
      urgencyScore,
    });
  });

  const activeEpisodes = (state.conversationEpisodes ?? [])
    .filter((episode) => episode.presenceId === scopedPresenceId && ["active", "closing"].includes(episode.status) && !episode.closingSocialIntentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  activeEpisodes.slice(0, 3).forEach((episode, index) => {
    const target = scopedMirror.find((object) => object.externalRef.id === episode.lastExternalObjectId)
      ?? scopedMirror.find((object) => object.id === episode.branchAnchorMirrorObjectId)
      ?? scopedMirror.find((object) => object.id === episode.rootMirrorObjectId);
    const elapsedHours = (now.getTime() - new Date(episode.updatedAt ?? episode.createdAt).getTime()) / (1000 * 60 * 60);
    const urgencyScore = calculatePropertyBasedWorkScore({
      obligationKind: "conversation_turn",
      hasDeliverableObligation: false,
      scheduledWindowActive: false,
      conversationalReciprocity: true,
      elapsedHoursSinceObservation: Math.max(0, elapsedHours),
      strategicRelevance: 0.75 - index * 0.05,
      isReadinessComplete: true,
      isAffordanceEnabled: true,
      isBodyRouteAvailable: true,
    });
    addItem({
      id: `conversation-work:${episode.id}`,
      source: "conversation",
      sourceRef: episode.id,
      state: "ready",
      safePriorityReason: index === 0 ? "An active conversation has a current external turn." : "The conversation remains open and actionable.",
      nextAction: "Review the latest turn and choose whether continuing adds marginal social value.",
      doneWhen: "The conversation is continued, redirected, or closed with a recorded disposition.",
      title: `Continue conversation with ${targetLabel(target)}`,
      originLabel: "Open conversation",
      statusLabel: "Fresh",
      detail: episode.lastMeaningfulDevelopment ?? "The conversation is still active.",
      targetMirrorObjectId: target?.id,
      updatedAt: episode.createdAt,
      urgencyScore,
    });
  });

  const freshFindings = (state.explorationFindings ?? [])
    .filter((finding) => finding.presenceId === scopedPresenceId && ["considering", "surfaced"].includes(finding.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  freshFindings.slice(0, 3).forEach((finding, index) => {
    const exploration = state.explorations.find((item) => item.id === finding.explorationId);
    const hasEngagement = Boolean(exploration?.engagement && exploration.engagement.mode !== "surface") || Boolean(exploration?.engagement?.assignmentId);
    const elapsedHours = (now.getTime() - new Date(finding.updatedAt).getTime()) / (1000 * 60 * 60);
    const urgencyScore = calculatePropertyBasedWorkScore({
      obligationKind: "exploration_opportunity",
      hasDeliverableObligation: Boolean(hasEngagement),
      scheduledWindowActive: false,
      conversationalReciprocity: false,
      elapsedHoursSinceObservation: Math.max(0, elapsedHours),
      strategicRelevance: hasEngagement ? (0.9 - index * 0.05) : (0.55 - index * 0.05),
      isReadinessComplete: true,
      isAffordanceEnabled: true,
      isBodyRouteAvailable: true,
    });
    addItem({
      id: `exploration-work:${finding.id}`,
      source: "exploration",
      workKind: "social_opportunity",
      sourceRef: finding.id,
      state: "ready",
      safePriorityReason: hasEngagement
        ? "A bounded Exploration produced a worthwhile social opportunity ready for deliberation."
        : "A bounded Exploration produced a finding worth considering; discovery has not granted permission to engage.",
      nextAction: hasEngagement
        ? "Evaluate the finding with the Social Planner."
        : "Inspect the finding and decide whether it deserves a social act.",
      doneWhen: "The finding is acted on, intentionally ignored, or marked no-op.",
      title: "Inspect Exploration finding",
      originLabel: "Operator Exploration",
      statusLabel: index === 0 ? "New opportunity" : "Ready",
      detail: finding.safeSummary,
      targetMirrorObjectId: finding.mirrorObjectId,
      updatedAt: finding.updatedAt,
      urgencyScore,
    });
  });

  const freshWatchItems = (state.watches ?? [])
    .filter((watch) => watch.presenceId === scopedPresenceId && watch.observation.status === "watching" && (watch.observation.observedCount > 0 || isRecent(watch.observation.lastObservedAt, 24)))
    .sort((left, right) => (right.observation.lastObservedAt ?? right.updatedAt).localeCompare(left.observation.lastObservedAt ?? left.updatedAt));
  freshWatchItems.slice(0, 3).forEach((watch, index) => {
    const elapsedHours = (now.getTime() - new Date(watch.observation.lastObservedAt ?? watch.updatedAt).getTime()) / (1000 * 60 * 60);
    const urgencyScore = calculatePropertyBasedWorkScore({
      obligationKind: "watchlist_signal",
      hasDeliverableObligation: false,
      scheduledWindowActive: false,
      conversationalReciprocity: false,
      elapsedHoursSinceObservation: Math.max(0, elapsedHours),
      strategicRelevance: 0.5 - index * 0.05,
      isReadinessComplete: true,
      isAffordanceEnabled: true,
      isBodyRouteAvailable: true,
    });
    addItem({
      id: `watchlist-work:${watch.id}`,
      source: "watchlist",
      sourceRef: watch.id,
      state: "ready",
      safePriorityReason: "Watchlist evidence is fresh and has a bounded opportunity to inspect.",
      nextAction: "Inspect the promising signal before deciding whether it deserves a response.",
      doneWhen: "The signal is reviewed and either becomes a social act or remains observation.",
      title: `Inspect ${watch.title}`,
      originLabel: "Watchlist",
      statusLabel: index === 0 ? "New signal" : "Ready",
      detail: `${watch.observation.observedCount} observed signal${watch.observation.observedCount === 1 ? "" : "s"} · ${watch.purpose ?? "Known source monitoring"}`,
      updatedAt: watch.observation.lastObservedAt ?? watch.updatedAt,
      urgencyScore,
    });
  });

  const reviewAssignment = scopedAssignments.find((assignment) => assignment.plan && ["active", "working", "awaiting_execution"].includes(assignment.status));
  const reviewDueAt = reviewAssignment?.plan?.nextWeeklyReviewAt ?? reviewAssignment?.plan?.nextStrategicReviewAt;
  const isScheduledDue = Boolean(reviewDueAt && new Date(reviewDueAt).getTime() <= now.getTime());

  // Activity uses a compact projection that intentionally omits large growth
  // histories. Treat those omitted collections as empty here; the Growth view
  // loads the complete state when it needs to calculate evidence watermarks.
  const growthEvidenceInScope = (observedAt: string | undefined) => Boolean(scopedPresenceId && growthEvidenceIsInPresenceScope(state, scopedPresenceId, observedAt));
  const audienceCount = (state.audienceSnapshots ?? []).filter((s) => s.presenceId === scopedPresenceId && growthEvidenceInScope(s.observedAt)).length;
  const publicationCount = (state.publicationMetricSnapshots ?? []).filter((s) => s.presenceId === scopedPresenceId && growthPublicationIsInPresenceScope(state, scopedPresenceId, s)).length;
  const watermark = presence?.growthEvidenceWatermark ?? (audienceCount + publicationCount);
  const lastTriaged = presence?.lastTriagedEvidenceWatermark ?? 0;
  const hasNewEvidence = watermark > lastTriaged;

  const lastReview = (state.growthReviews ?? []).find((r) => r.presenceId === scopedPresenceId && growthEvidenceInScope(r.createdAt));
  const hoursSinceLastReview = lastReview ? (now.getTime() - new Date(lastReview.createdAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const isEventDrivenEligible = hasNewEvidence && (hoursSinceLastReview >= 12 || !lastReview);

  if (reviewAssignment && (isScheduledDue || isEventDrivenEligible)) {
    const isDue = isScheduledDue;
    addItem({
      id: `growth-review-work:${reviewAssignment.id}:${watermark}`,
      source: "growth_review",
      sourceRef: reviewAssignment.id,
      assignmentId: reviewAssignment.id,
      state: "ready",
      safePriorityReason: isDue
        ? "The scheduled strategic growth review is due."
        : "Fresh unreviewed growth evidence has accumulated for evaluation.",
      nextAction: "Compare accumulated verified outcomes with the current operating strategy.",
      doneWhen: "The review records what is working, uncertain, and weak, updating strategy if warranted.",
      title: isDue ? "Review growth strategy" : "Reassess growth strategy",
      originLabel: "Growth review",
      statusLabel: isDue ? "Due today" : "Ready",
      detail: hasNewEvidence
        ? `Unreviewed evidence through watermark ${watermark} is ready for evaluation.`
        : "The scheduled review is ready to evaluate strategy.",
      updatedAt: reviewDueAt ?? now.toISOString(),
      urgencyScore: isDue ? 820 : 790,
      assignment: reviewAssignment,
    });
  }

  const publishingPlan = (state.publishingPlans ?? []).find((plan) => plan.presenceId === scopedPresenceId && plan.status === "active");
  const reassessmentNeed = publishingPlanNeedsReassessment(state, scopedPresenceId, now);
  const publishingAssignment = scopedAssignments.find((a) => a.id === presence?.publishingInitiative?.assignmentId);

  if (reassessmentNeed.kind === "create_plan" && !items.some((item) => item.source === "publishing" && item.state === "working")) {
    addItem({
      id: `publishing-step-create-work:${scopedPresenceId}`,
      source: "publishing",
      workKind: "publishing_step",
      step: "create_plan",
      sourceRef: publishingAssignment?.id ?? scopedPresenceId,
      state: "ready",
      safePriorityReason: "An active publishing responsibility is configured; Genny needs a baseline working plan.",
      nextAction: "Formulate a working publishing plan.",
      doneWhen: "An active publishing plan is materialized.",
      title: "Create publishing plan",
      originLabel: "Publishing initiative",
      statusLabel: "Plan needed",
      detail: "Genny will review its Mission and Taste to create its first visible publishing plan.",
      updatedAt: now.toISOString(),
      urgencyScore: 840,
      assignment: publishingAssignment,
    });
  } else if (reassessmentNeed.kind === "reassess_plan" && !items.some((item) => item.source === "publishing" && item.state === "working")) {
    const elapsedHours = reassessmentNeed.elapsedHoursOverdue;
    const urgencyScore = Math.min(940, Math.round(810 + Math.min(48, elapsedHours) * 2.5));
    addItem({
      id: `publishing-step-reassess-work:${reassessmentNeed.plan.id}:${reassessmentNeed.plan.revision}`,
      source: "publishing",
      workKind: "publishing_step",
      step: "reassess_plan",
      sourceRef: publishingAssignment?.id ?? reassessmentNeed.plan.id,
      planRef: reassessmentNeed.plan.id,
      planRevision: reassessmentNeed.plan.revision,
      state: "ready",
      safePriorityReason: `Plan Revision ${reassessmentNeed.plan.revision} is due for reassessment.`,
      nextAction: "Review recent evidence and social context, then decide the next plan revision.",
      doneWhen: "A successor plan revision is saved or the current direction is reaffirmed.",
      title: "Reassess publishing plan",
      originLabel: "Publishing initiative",
      statusLabel: "Reassessment due",
      detail: reassessmentNeed.reason,
      updatedAt: reassessmentNeed.plan.nextReassessmentAt ?? reassessmentNeed.plan.updatedAt,
      urgencyScore,
      assignment: publishingAssignment,
    });
  } else {
    const activeWindow = publishingPlan?.windows.find((window) => window.status === "active");
    if (activeWindow && !items.some((item) => item.source === "publishing" && item.state === "working")) {
      addItem({
        id: `publishing-window-work:${activeWindow.id}`,
        source: "publishing",
        workKind: "publishing_step",
        step: "window_work",
        sourceRef: activeWindow.id,
        planRef: publishingPlan?.id,
        planRevision: publishingPlan?.revision,
        state: "ready",
        safePriorityReason: "The authorized Publishing Plan window is open now.",
        nextAction: "Develop one useful original candidate for this window.",
        doneWhen: "A candidate is either verified publicly or intentionally rejected without filler.",
        title: "Create the next original publication",
        originLabel: "Publishing Plan",
        statusLabel: "Window open",
        detail: activeWindow.summary,
        updatedAt: activeWindow.startAt,
        urgencyScore: 910,
        assignment: publishingAssignment,
      });
    }
  }

  const activeTrials = (state.capabilityTrials ?? []).filter((item) => item.presenceId === scopedPresenceId && ["draft", "preflight", "active", "discovering", "judging", "awaiting_execution", "awaiting_verification"].includes(item.status) && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()));
  const exclusiveTrial = activeTrials.find((trial) => trial.executionIsolation?.suppressOtherTrialActs && ["active", "discovering", "judging", "awaiting_execution", "awaiting_verification"].includes(trial.status) && (!trial.expiresAt || new Date(trial.expiresAt).getTime() > Date.now()));
  const seenTrialCapabilities = new Set<string>();

  for (const trial of activeTrials) {
    if (seenTrialCapabilities.has(trial.capability)) continue;
    seenTrialCapabilities.add(trial.capability);
    const trialAssignment = scopedAssignments.find((assignment) => assignment.id === trial.assignmentId);
    const waiting = trial.status === "awaiting_execution" || trial.status === "awaiting_verification";
    const isDeferredByExclusive = exclusiveTrial && exclusiveTrial.id !== trial.id;
    addItem({
      id: `capability-trial-work:${trial.id}`,
      source: "capability_trial",
      sourceRef: trial.id,
      assignmentId: trial.assignmentId,
      state: isDeferredByExclusive ? "deferred" : waiting ? "awaiting_verification" : trial.status === "draft" || trial.status === "preflight" ? "ready" : "working",
      safePriorityReason: isDeferredByExclusive ? `Deferred while the exclusive ${exclusiveTrial.capability} trial is running.` : "This bounded capability trial is an explicit Assignment and keeps the Agent's normal social judgment intact.",
      nextAction: isDeferredByExclusive ? `Will resume after the active ${exclusiveTrial.capability} trial finishes.` : waiting ? "Check the trial's execution and verification evidence." : "Let the Agent discover and judge a real opportunity within the trial envelope.",
      doneWhen: "One verified capability outcome is recorded, or the bounded trial expires with an explicit result.",
      title: `Find a genuine ${trial.capability} opportunity`,
      originLabel: "Capability trial",
      statusLabel: isDeferredByExclusive ? "Deferred during trial" : trial.result ?? trial.status.replaceAll("_", " "),
      detail: trial.why ?? trial.lastError ?? "Agent-directed discovery is bounded to this trial; other social acts remain visible as decisions but are not executed.",
      updatedAt: trial.updatedAt,
      urgencyScore: isDeferredByExclusive ? 400 : 1_050,
      assignment: trialAssignment,
    });
  }

  const selfDirected = presence?.selfDirectedAttention ?? defaultSelfDirectedAttentionPolicy();
  if (selfDirected.enabled) {
    const hasHigherObligation = items.some((item) => item.urgencyScore >= 780 && item.state !== "upcoming");
    addItem({
      id: `self-directed-work:${scopedPresenceId}`,
      source: "self_directed_discovery",
      sourceRef: scopedPresenceId,
      state: hasHigherObligation ? "deferred" : "ready",
      safePriorityReason: hasHigherObligation ? "Self-directed attention is eligible, but higher-obligation work is currently actionable." : "The Agent's own bounded attention is eligible within its configured budget.",
      nextAction: "Consider one bounded direction from the Agent's current attention policy.",
      doneWhen: "The bounded look produces a useful finding or an intentional no-op.",
      title: "Genny's own attention",
      originLabel: "Self-directed discovery",
      statusLabel: hasHigherObligation ? "Eligible · deferred" : "Eligible",
      detail: `${selfDirected.intensity[0]?.toUpperCase() ?? "B"}${selfDirected.intensity.slice(1)} · ${selfDirected.lastRunAt ? `last looked ${formatRelativeTime(selfDirected.lastRunAt, now.getTime())}` : "not looked yet"}`,
      nextEligibleAt: selfDirected.nextEligibleAt,
      updatedAt: selfDirected.lastRunAt ?? selfDirected.nextEligibleAt ?? now.toISOString(),
      urgencyScore: hasHigherObligation ? 610 : 670,
    });
  }

  const upcoming: AgendaWorkItem[] = scopedAssignments
    .filter((assignment) => assignment.schedule && !scheduledAssignmentIsDue(assignment, now) && !isWorkingAssignment(assignment))
    .map((assignment) => {
      const nextAt = nextScheduledOccurrence(assignment.schedule!, now, assignment.recurrence).toISOString();
      const title = ["original_publication", "maintain_original_presence"].includes(assignment.deliverable.type) ? "Original publication" : assignment.title ?? cleanUserFacingAssignmentInstruction(assignment.instruction);
      return {
        id: `upcoming-work:${assignment.id}`,
        source: assignment.deliverable.type === "original_publication" ? "publishing" : "assignment",
        sourceRef: assignment.id,
        assignmentId: assignment.id,
        state: "upcoming",
        safePriorityReason: "This responsibility is authorized for a future window, not actionable yet.",
        nextAction: "Reconsider when the window opens.",
        doneWhen: "The scheduled responsibility records a verified outcome.",
        title,
        originLabel: assignment.createdBy === "operator" ? "Operator Assignment" : "Publishing Plan",
        statusLabel: "Upcoming",
        detail: `Next eligible ${assignment.schedule!.day} at ${assignment.schedule!.time}.`,
        nextEligibleAt: nextAt,
        updatedAt: assignment.updatedAt,
        urgencyScore: 100,
        assignment,
      } satisfies AgendaWorkItem;
    });
  items.push(...upcoming);

  const actionable = items.filter((item) => item.state !== "upcoming" && item.state !== "watching" && item.state !== "needs_operator");
  const nextUp = [...actionable].sort((left, right) => right.urgencyScore - left.urgencyScore || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")).slice(0, 8);
  nextUp.forEach((item, index) => { item.currentRank = index + 1; });
  const working = items.filter((item) => item.state === "working");
  const waiting = items.filter((item) => item.state === "waiting");
  const needsYou = items.filter((item) => item.state === "needs_operator");
  const responsibilities = scopedAssignments.filter((assignment) => isContinuousAssignment(assignment) || openAssignmentStatuses.has(assignment.status));
  const watches: AgendaWatchingItem[] = [
    { id: "watching:mentions", source: "mention", label: "Mentions", statusLabel: `${mentionCandidates.length} fresh`, detail: `${scopedMirror.filter((object) => { const text = `${object.content?.text ?? ""}`.toLowerCase(); return Boolean(presenceHandle && text.includes(`@${presenceHandle}`)); }).length} observed mentions in Mirror`, count: mentionCandidates.length, lastCheckedAt: scopedMirror.sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]?.observedAt },
    { id: "watching:conversations", source: "conversation", label: "Open conversations", statusLabel: `${activeEpisodes.length} active`, detail: activeEpisodes.length ? `${Math.min(activeEpisodes.length, 1)} currently needs attention` : "No active conversation needs attention", count: activeEpisodes.length },
    { id: "watching:watchlist", source: "watchlist", label: "Watchlist", statusLabel: `${freshWatchItems.length} fresh`, detail: `${(state.watches ?? []).filter((watch) => watch.presenceId === scopedPresenceId).length} watched sources`, count: freshWatchItems.length, lastCheckedAt: freshWatchItems[0]?.observation.lastObservedAt },
    { id: "watching:explorations", source: "exploration", label: "Explorations", statusLabel: `${(state.explorations ?? []).filter((exploration) => exploration.presenceId === scopedPresenceId && exploration.status === "active").length} active`, detail: freshFindings.length ? `${freshFindings.length} finding${freshFindings.length === 1 ? "" : "s"} ready to consider` : "No finding currently surfaced", count: freshFindings.length },
    { id: "watching:self", source: "self_directed_discovery", label: "Genny's own attention", statusLabel: selfDirected.enabled ? `${selfDirected.intensity[0]?.toUpperCase() ?? "B"}${selfDirected.intensity.slice(1)}` : "Off", detail: selfDirected.enabled ? (items.some((item) => item.source === "self_directed_discovery" && item.state === "deferred") ? "Eligible, deferred behind higher-obligation work" : "Eligible within the configured attention budget") : "Self-directed attention is off", lastCheckedAt: selfDirected.lastRunAt, nextEligibleAt: selfDirected.nextEligibleAt, currentAgendaRank: items.find((item) => item.source === "self_directed_discovery")?.currentRank },
    { id: "watching:capability-trials", source: "capability_trial", label: "Capability trials", statusLabel: `${(state.capabilityTrials ?? []).filter((trial) => trial.presenceId === scopedPresenceId && ["active", "discovering", "judging", "awaiting_execution", "awaiting_verification"].includes(trial.status)).length} active`, detail: "Bounded trials are visible as Assignments and never change the Presence-wide execution envelope.", count: (state.capabilityTrials ?? []).filter((trial) => trial.presenceId === scopedPresenceId && !["completed", "cancelled", "expired", "failed"].includes(trial.status)).length },
  ];
  const legacy = compileLegacyAgenda(state, presenceId, now);
  return {
    ...legacy,
    compiledAt: now.toISOString(),
    pendingMentionCount: mentionCandidates.length,
    workItems: items,
    working,
    nextUp,
    waiting,
    responsibilities,
    needsYou,
    watching: watches.map((watch) => ({ ...watch, currentAgendaRank: watch.currentAgendaRank ?? nextUp.find((item) => item.source === watch.source)?.currentRank })),
  };
}

/** Canonical Agenda entry point: return executable work, not durable Assignments. */
export function compileAgenda(state: OpenPresenceState, presenceId?: string, now = new Date()): AgendaCompilation {
  return compileAgendaWork(state, presenceId, now);
}

export function deriveAgendaProjection(state: OpenPresenceState, presenceId?: string, now = new Date()): AgendaCompilation {
  return compileAgendaWork(state, presenceId, now);
}

export function assignmentIsOpen(assignment: Assignment) {
  return !["completed", "completed_with_adaptation", "cancelled"].includes(assignment.status);
}

/**
 * Human-readable Assignment progress for operator-facing surfaces.
 * Continuous responsibilities have no finite denominator, so presenting their
 * cumulative verified outcomes as `verified / 0` invents a broken quota.
 */
export function assignmentProgressLabel(assignment: Assignment) {
  if (assignment.activation?.type === "continuous") {
    if (assignment.successEvidence?.kind === "metric_threshold") {
      return assignment.status === "completed" || assignment.status === "completed_with_adaptation"
        ? `${assignment.successEvidence.label ?? `${assignment.successEvidence.value} ${assignment.successEvidence.metric}`} verified`
        : `Goal · ${assignment.successEvidence.label ?? `${assignment.successEvidence.value} ${assignment.successEvidence.metric}`}`;
    }
    const verified = assignment.progress.verified;
    return verified > 0
      ? `${verified} verified outcome${verified === 1 ? "" : "s"} · ongoing`
      : "No verified outcomes yet · ongoing";
  }
  return `${assignment.progress.verified} / ${assignment.progress.required} verified`;
}

/**
 * A work phase describes where an Assignment last was; it is not proof that
 * the worker is there now. In particular, new Draft Assignments intentionally
 * start with `candidate_review` as their initial plan phase. Schedule must
 * only show live processing when an active run or an execution-state status
 * proves that work is currently underway.
 */
export function assignmentIsCurrentlyProcessing(assignment: Assignment, assignmentRuns: AssignmentRun[] = []) {
  const latestRun = [...assignmentRuns]
    .filter((run) => run.assignmentId === assignment.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const activeRun = latestRun && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(latestRun.status);
  return Boolean(activeRun || ["working", "awaiting_execution"].includes(assignment.status));
}

function bridgeFor(state: OpenPresenceState, presenceId: string, affordance: string): Bridge | undefined { return state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.state !== "offline" && bridge.capabilities.affordances.includes(affordance)); }

/** The user-attached browser is an execution capability, never the channel route. */
function browserBridgeFor(state: OpenPresenceState, presenceId: string, affordance: string): Bridge | undefined {
  const supports = (bridge: Bridge) => bridge.state !== "offline" && bridge.capabilities.affordances.some((item) => item === affordance || item === affordance.replace(/^[^.]+\./, ""));
  return state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.name.startsWith("OpenPresence Chrome") && supports(bridge))
    ?? state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.name.startsWith("OpenPresence Chrome") && bridge.state !== "offline")
    // Legacy browser bridges may not carry the current display name, but an arbitrary
    // external channel bridge must never be repurposed as an X browser capability.
    ?? state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.name.startsWith("Chrome") && supports(bridge))
    ?? state.bridges.find((bridge) => bridge.presenceId === presenceId && supports(bridge));
}

function browserFallbackWasLearned(presence: Presence, affordance: string) {
  const normalized = affordance.replace(/^[^.]+\./, "");
  return (presence.browserAccess?.learnedFallbacks ?? []).some((item) => item.action === affordance || item.action === normalized);
}

function rememberBrowserFallback(presence: Presence, affordance: string, reason: string) {
  const learned = presence.browserAccess?.learnedFallbacks ?? [];
  const normalized = affordance.replace(/^[^.]+\./, "");
  const withoutDuplicate = learned.filter((item) => item.action !== affordance && item.action !== normalized);
  presence.browserAccess = {
    enabled: presence.browserAccess?.enabled === true,
    learnedFallbacks: [{ action: affordance, reason: reason.trim(), learnedAt: now() }, ...withoutDuplicate].slice(0, 50),
  };
}

function mirrorObjectMentionsPresence(object: MirrorObject | undefined, handle?: string) {
  const normalizedHandle = normalizeHandleForComparison(handle);
  if (!object || !normalizedHandle) return false;
  return (object.content?.text ?? "").toLowerCase().includes(`@${normalizedHandle}`);
}

function mirrorObjectIsOwnOrMentionsPresence(object: MirrorObject | undefined, handle?: string, accountId?: string) {
  if (!object) return false;
  if (accountId && object.author?.externalRef?.id === accountId) return true;
  const normalizedHandle = normalizeHandleForComparison(handle);
  if (normalizedHandle && normalizeHandleForComparison(object.author?.handle) === normalizedHandle) return true;
  return mirrorObjectMentionsPresence(object, handle);
}

/** Keep X's known reply/quote target restriction in the action vocabulary. */
export function xTargetAllowsQuotedExpression(source: OpenPresenceState, presence: Presence, targetId: string) {
  const target = source.mirrorObjects.find((object) => object.presenceId === presence.id && object.externalRef.type === "x.post" && object.externalRef.id === targetId);
  if (!target) return true;
  const nativeX = source.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x");
  return mirrorObjectIsOwnOrMentionsPresence(target, presence.handle, nativeX?.account?.id);
}

/**
 * A scheduled quote may use the verified Chrome route when native X's
 * mention-only target rule excludes an otherwise eligible public post. Keep
 * this separate from the native predicate so formXActionIntent still routes
 * the action to Chrome instead of accidentally sending it through native X.
 */
export function xQuoteTargetHasAvailableRoute(source: OpenPresenceState, presence: Presence, targetId: string) {
  if (xTargetAllowsQuotedExpression(source, presence, targetId)) return true;
  const browserQuoteBridge = browserBridgeFor(source, presence.id, "quote");
  return Boolean(browserQuoteBridge
    && (browserQuoteBridge.name.startsWith("OpenPresence Chrome") || browserQuoteBridge.name.startsWith("Chrome"))
    && bridgeExecutionStatus(browserQuoteBridge) === "connected");
}

function executionCanUseNativeX(state: OpenPresenceState, execution: Execution, presence: Presence) {
  if (execution.affordance !== "x.reply" && execution.affordance !== "x.quote") return true;
  const targetId = execution.target?.id;
  if (!targetId) return true;
  const target = state.mirrorObjects.find((object) => object.presenceId === presence.id && object.externalRef.type === "x.post" && object.externalRef.id === targetId);
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x");
  return !target || mirrorObjectIsOwnOrMentionsPresence(target, presence.handle, nativeX?.account?.id);
}

export function isMentionRestrictedError(message: string): boolean {
  return /you can only reply to or quote posts where you are mentioned|only reply to or quote posts where you are mentioned|you are not permitted to perform this action|you are not permitted to reply to or quote|x rejected this action:.*not permitted/i.test(message);
}

export function rerouteExecutionToBrowser(source: OpenPresenceState, executionId: string, message: string): OpenPresenceState {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return state;

  const affordance = execution.affordance.replace(/^x\./, "");
  const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
  const bridge = presence?.channel === "x"
    ? browserBridgeFor(state, execution.presenceId, affordance)
    : bridgeFor(state, execution.presenceId, affordance);

  if (presence) {
    rememberBrowserFallback(presence, execution.affordance, message);
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    if (state.presence?.id === presence.id) state.presence = presence;
  }

  execution.connector = "bridge";
  execution.bridgeId = bridge?.id;
  execution.status = bridge ? "queued" : "awaiting-connector";
  execution.failure = undefined;
  execution.reviewReason = undefined;
  execution.updatedAt = now();

  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) {
    action.status = bridge ? "queued" : "review";
    action.reason = `Rerouted to browser capability: ${message}`;
  }

  if (execution.assignmentId) {
    const assignment = state.assignments.find((a) => a.id === execution.assignmentId);
    if (assignment && ["failed", "blocked"].includes(assignment.status)) {
      assignment.status = "working";
      assignment.updatedAt = now();
    }
  }

  state.events.unshift(
    event(
      "execution",
      "Browser fallback learned",
      bridge
        ? `Native ${presence?.channel ?? "channel"} access rejected this action (${message}). The connected browser will deliver it, and this action now remembers that route.`
        : `Native ${presence?.channel ?? "channel"} access rejected this action (${message}). The action remembers that it needs the browser when one is available.`,
      bridge ? "positive" : "warning",
      { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }
    )
  );

  return state;
}

/** Backward-compatible name for persisted/runtime callers from the old X-only implementation. */
export const rerouteExecutionToBridge = rerouteExecutionToBrowser;

export function unblockNativeExecutions(state: OpenPresenceState, presence: Presence) {
  let unblocked = 0;
  for (const execution of state.executions) {
    if (execution.presenceId !== presence.id || execution.environment === "sandbox" || !executionCanUseNativeX(state, execution, presence)) continue;
    if (execution.connector !== "native" && execution.connector !== undefined) continue;
    if (execution.status !== "awaiting-connector") continue;
    execution.connector = "native";
    execution.bridgeId = undefined;
    execution.status = "queued";
    execution.updatedAt = now();
    unblocked += 1;
  }
  return unblocked;
}

function rebindQueuedExecutionsForNativeRoute(state: OpenPresenceState, presence: Presence) {
  const rebindableStatuses = new Set<Execution["status"]>(["approved", "queued", "awaiting-connector"]);
  let rebound = 0;
  for (const execution of state.executions) {
    const wasOwnedByBridge = execution.connector === "bridge";
    const wasWaitingWithoutConnector = execution.status === "awaiting-connector" && !execution.connector;
    if (execution.presenceId !== presence.id || execution.environment === "sandbox" || (!wasOwnedByBridge && !wasWaitingWithoutConnector) || !rebindableStatuses.has(execution.status) || !executionCanUseNativeX(state, execution, presence)) continue;
    execution.connector = "native";
    execution.bridgeId = undefined;
    if (execution.status === "awaiting-connector") execution.status = "queued";
    execution.updatedAt = now();
    rebound += 1;
  }
  if (rebound > 0) {
    state.events.unshift(event("execution", "Pending actions moved to Native X", `${rebound} pending action${rebound === 1 ? "" : "s"} can use the official X API. Chrome remains reserved for replies to posts that do not mention ${presence.handle}.`, "positive", { presenceId: presence.id }));
  }
  return rebound;
}
function normalizedCapabilities(input: ConnectorCapabilities): ConnectorCapabilities { return { inbound: input.inbound, reconcile: input.reconcile, affordances: [...new Set(input.affordances)], formats: [...new Set(input.formats)], metrics: [...new Set(input.metrics)], assetKinds: input.assetKinds?.length ? [...new Set(input.assetKinds)] : undefined }; }

/** Upgrade the exact legacy X browser-bridge defaults to the shipped adapter surface. */
function migrateLegacyXBrowserBridge(bridge: Bridge): Bridge {
  if (bridge.channelId !== "x" || bridge.kind !== "bridge") return bridge;
  const capabilities = bridge.capabilities;
  const legacyAffordances = ["post", "reply", "repost", "quote", "like", "message"];
  const legacyFormats = ["x.post", "x.media-post", "x.thread"];
  const legacyMetrics = ["replies", "reactions", "posts"];
  const sameSet = (left: string[], right: string[]) => left.length === right.length && left.every((item) => right.includes(item));
  const isLegacyDefault = sameSet(capabilities.affordances, legacyAffordances)
    && sameSet(capabilities.formats, legacyFormats)
    && sameSet(capabilities.metrics, legacyMetrics)
    && !capabilities.assetKinds?.length;
  const isPreviouslyShippedChromeDefault = bridge.name.startsWith("OpenPresence Chrome")
    && sameSet(capabilities.affordances, [...legacyAffordances, "follow"])
    && sameSet(capabilities.formats, [...legacyFormats, "x.reply"])
    && sameSet(capabilities.metrics, [...legacyMetrics, "followers", "public_metrics"])
    && sameSet(capabilities.assetKinds ?? [], ["image", "video"]);
  const isNarrowShippedChromeDefault = bridge.name.startsWith("OpenPresence Chrome")
    && sameSet(capabilities.affordances, ["reply"])
    && sameSet(capabilities.formats, ["x.reply"])
    && sameSet(capabilities.metrics, ["followers", "public_metrics"]);
  const isCurrentShippedChromeDefault = bridge.name.startsWith("OpenPresence Chrome")
    && sameSet(capabilities.affordances, ["reply", "quote", "repost", "like"])
    && sameSet(capabilities.formats, ["x.reply", "x.quote", "x.repost", "x.like"])
    && sameSet(capabilities.metrics, ["followers", "public_metrics"]);
  if (!isLegacyDefault && !isPreviouslyShippedChromeDefault && !isNarrowShippedChromeDefault && !isCurrentShippedChromeDefault) return bridge;
  return { ...bridge, capabilities: chromeBrowserBridgeCapabilities() };
}

function makePublication(state: OpenPresenceState, text: string, format: string, source: "agent_model" | "operator_manual" | "operational" = "operational", assetIds: string[] = []): Publication {
  const presence = state.presence;
  const formattedText = formatPublicExpression(text, format);
  const publication: Publication = { id: id("publication"), format, payload: { text: formattedText }, assetIds: [...assetIds], links: [], publicExpression: presence ? createPublicExpressionCandidate({ state, presence, affordance: format, text: formattedText, source, mediaIds: assetIds }) : undefined, createdAt: now(), environment: presence?.environment ?? "live" };
  state.publications.unshift(publication);
  return publication;
}

function runAttentionCycle(state: OpenPresenceState, presence: Presence) {
  state.actions.unshift({ id: id("act"), intent: "no_op", target: `${presence.channel}_stream`, summary: "Stayed quiet on 36 observed opportunities", status: "skipped", reason: "Nothing met the relevance, usefulness, and taste threshold today.", createdAt: now() });
  state.events.unshift(event("decision", "Silence was the right action", "36 conversations observed · 2 worth saving · 0 worth forcing.", "quiet", { presenceId: presence.id }));
  state.events.unshift(event("system", "Pulse completed", "Observed the selected channel, considered what was worth doing, and stopped without forcing an action.", "positive", { presenceId: presence.id }));
  state.events.splice(7);
  state.metrics.opportunitiesIgnored += 36;
  state.metrics.conversations += 2;
  state.metrics.audienceHealth = Math.max(0, state.metrics.audienceHealth - 1);
  state.events.unshift(event("learning", "A small learning was recorded", "Technical conversations with a distinct point are worth revisiting.", "positive", { presenceId: presence.id }));
  return state;
}

function addSocialEvaluation(state: OpenPresenceState, standing: StandingIntent, slot: CalendarSlot) {
  const presence = state.presences.find((item) => item.id === standing.presenceId) ?? state.presence;
  if (!presence || !state.agent) return;
  const formedAt = now(); const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const affordance = `${presence.channel}.post`;
  const environment = presence.environment ?? "live";
  const mode = slot.mode;
  if (mode !== "off" && hasExistingPublicAction(state, { presenceId: presence.id, environment, affordance, text: slot.instruction })) return;
  const publication = makePublication(state, slot.instruction, `${presence.channel}.post`);
  const origin: SocialOrigin = { kind: "standing_intent", refId: standing.id };
  publication.origin = origin;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId: standing.id, origin, environment: presence.environment ?? "live" };
  state.socialIntents.unshift(socialIntent);
  if (mode !== "off") {
    const nativeX = presence.channel === "x" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.status === "connected" && connection.access === "read-write") : undefined;
    const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "post");
    const simulated = !bridge && !nativeX && presence.channel === "x" && isTestRuntime();
    const connector = nativeX ? "native" as const : bridge ? bridge.kind : simulated ? "simulated" as const : undefined;
    const status = simulated ? (mode === "auto" ? "succeeded" : mode === "review" ? "awaiting-review" : "awaiting-manual") : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
    const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance, mode: mode as Exclude<import("./types").ExecutionMode, "off">, status, attempts: simulated && mode === "auto" ? 1 : 0, bridgeId: bridge?.id, connector, idempotencyKey: socialActionIdempotencyKey({ presenceId: presence.id, environment, affordance, text: slot.instruction }), publication, createdAt: formedAt, updatedAt: formedAt, executedAt: simulated && mode === "auto" ? formedAt : undefined, environment };
    state.executions.unshift(execution);
    if (simulated && mode === "auto") {
      const outcome: Outcome = { id: id("outcome"), socialIntentId: socialIntent.id, executionId: execution.id, presenceId: presence.id, status: "succeeded", observedAt: formedAt, metrics: { qualifiedFollows: 3 }, evidence: [], environment: presence.environment ?? "live" };
      state.outcomes.unshift(outcome); state.metrics.qualifiedFollows += 3; execution.status = "succeeded"; execution.updatedAt = now();
      state.events.unshift(event("execution", "Standing intent evaluated", `${slot.label} was evaluated on ${channelName(presence.channel)}. The social intention expires in 45 minutes; its outcome is now learning material.`, "positive", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, outcomeId: outcome.id }));
    } else {
      const detail = status === "awaiting-connector" ? `${slot.label} is waiting for an authorized channel connection.` : status === "queued" ? `${slot.label} is ready for its native X connector.` : `${slot.label} formed a social intention that expires in 45 minutes.`;
      state.events.unshift(event("execution", status === "queued" ? (connector === "native" ? "Queued for X" : "Queued for Bridge") : "Waiting for review", detail, "neutral", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id }));
    }
    state.actions.unshift({ id: id("act"), intent: "post", summary: slot.instruction, status: simulated && mode === "auto" ? "executed" : mode === "review" ? "review" : "queued", reason: `Evaluated standing intent: ${slot.instruction}`, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  } else {
    state.actions.unshift({ id: id("act"), intent: "post", summary: slot.instruction, status: "skipped", reason: "This affordance is off in the operator's execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Intention held", "Jenny formed a social intention; the operator's envelope leaves this affordance off.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
  }
}

export function isExplicitXPostRequest(content: string) {
  const normalized = content.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const explicitlyAsksForDraftOnly = /\b(?:draft|preview|example|suggest(?:ion)?|option|candidate)\b/.test(normalized)
    && !/\b(?:publish|post|send|ship|make (?:it|this|that) live)\b/.test(normalized);
  if (explicitlyAsksForDraftOnly) return false;
  if (/^(?:how|what|why|when|where)\b/.test(normalized) || /^should\s+(?:i|we)\b/.test(normalized)) return false;
  return /\bintroduce\s+(?:yourself|this\s+presence|the\s+presence)\s+(?:to\s+the\s+world|on\s+x)\b/.test(normalized)
    && /\b(?:tweet|post|publish|on\s+x)\b/.test(normalized)
    || /\b(?:make|create|publish|send|ship)\b[^.!?\n]{0,80}\b(?:first\s+)?(?:tweet|x\s+post|post\s+on\s+x)\b/.test(normalized)
    || /\b(?:post|publish|send)\b[^.!?\n]{0,80}\b(?:to|on)\s+x\b/.test(normalized)
    || /\b(?:tweet|post)\s+(?:this|that|it)\s+(?:now|on\s+x)?\b/.test(normalized);
}

export function formChatPostIntent(source: OpenPresenceState, text: string, standingIntentId?: string, sourceKind: "agent" | "operator" = "agent", assetIds: string[] = [], decisionInput?: SocialDecisionInput, runId?: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim()) return state;
  const environment = presence.environment ?? "live";
  if (hasExistingPublicAction(state, { presenceId: presence.id, environment, affordance: "x.post", text })) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const autobiographicalContext = sourceKind === "agent" ? retrievePublicSafeAutobiographicalContext(state, presence, `${text}\n${decisionInput?.summary ?? ""}`, Date.now()) : undefined;
  const autobiographicalEventIds = decisionInput?.autobiographicalEventIds ?? autobiographicalContext?.eventIds;
  const effectiveDecisionInput = decisionInput ? { ...decisionInput, autobiographicalEventIds } : undefined;
  const validAssetIds = authorizeAssetSelection(state, assetIds, { presenceId: presence.id });
  const publication = makePublication(state, text.trim(), validAssetIds.length ? "x.media-post" : "x.post", sourceKind === "operator" ? "operator_manual" : "agent_model", validAssetIds);
  const origin: SocialOrigin = standingIntentId ? { kind: "standing_intent", refId: standingIntentId } : sourceKind === "operator" ? { kind: "operator" } : { kind: "other" };
  publication.origin = origin;
  publication.autobiographicalEventIds = autobiographicalEventIds;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.post", publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId, origin, runId, autobiographicalEventIds };
  if (publication.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = effectiveDecisionInput ? createSocialDecision(state, { ...effectiveDecisionInput, origin: effectiveDecisionInput.origin ?? origin }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Post intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.access === "read-write" && normalizeHandleForComparison(connection.account?.username) === normalizeHandleForComparison(presence.handle) && (connection.status === "connected" || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? ""))));
  const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "post");
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const autobiographicalSafetyReason = sourceKind === "agent" ? autobiographicalExpressionSafetyReason(state, presence.id, autobiographicalEventIds, text) : undefined;
  const publicExpressionReason = publicExpressionLeakageReason(text) ?? autobiographicalSafetyReason;
  const status = publicExpressionReason ? "blocked" : leakageReason ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.post", mode, status, attempts: 0, bridgeId: bridge?.id, connector, idempotencyKey: socialActionIdempotencyKey({ presenceId: presence.id, environment, affordance: "x.post", text }), publication, reviewReason: publicExpressionReason ?? leakageReason, createdAt: formedAt, updatedAt: formedAt, environment, runId };
  execution.source = sourceKind;
  if (publicExpressionReason) execution.failure = { code: autobiographicalSafetyReason ? "AUTOBIOGRAPHICAL_PRIVACY_BOUNDARY" : "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionReason, retryable: false };
  state.executions.unshift(execution);
  const reason = standingIntentId ? "Jenny evaluated a Calendar standing intention and handed the resulting Social Intent to the Presence execution envelope." : "The operator asked Jenny to introduce this Presence through the native X connector.";
  state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: publicExpressionReason ? "failed" : mode === "review" ? "review" : "queued", reason: publicExpressionReason ?? reason, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", publicExpressionReason ? "Public text boundary blocked" : leakageReason ? "Identity disclosure needs review" : standingIntentId ? "A Calendar post intention was formed" : "A post intention was formed", publicExpressionReason ?? leakageReason ?? (connector ? (standingIntentId ? `${presence.name} judged the standing intention worthwhile and handed it to the native X connector.` : `${presence.name} formed an X post from the conversation and handed it to the Presence execution envelope.`) : `${presence.name} formed an X post, but no write-enabled X connector is available.`), publicExpressionReason || leakageReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, decisionId: socialDecision?.id }));
  return state;
}

export function formStandingPostIntent(source: OpenPresenceState, text: string, standingIntentId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || !text.trim()) return state;
  const environment = presence.environment ?? "live";
  if (hasExistingPublicAction(state, { presenceId: presence.id, environment, affordance: `${presence.channel}.post`, text })) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const affordance = `${presence.channel}.post`;
  const publication = makePublication(state, text.trim(), affordance, "agent_model");
  const origin: SocialOrigin = { kind: "standing_intent", refId: standingIntentId };
  publication.origin = origin;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId, origin, environment: presence.environment ?? "live" };
  if (publication.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Calendar intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
    return state;
  }
  const nativeX = presence.channel === "x" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.access === "read-write" && (connection.status === "connected" || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? "")))) : undefined;
  const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "post");
  const simulated = !bridge && !nativeX && presence.channel === "x" && isTestRuntime();
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : simulated ? "simulated" as const : undefined;
  const status = simulated ? (mode === "auto" ? "succeeded" : mode === "review" ? "awaiting-review" : "awaiting-manual") : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance, mode, status, attempts: simulated && mode === "auto" ? 1 : 0, bridgeId: bridge?.id, connector, idempotencyKey: socialActionIdempotencyKey({ presenceId: presence.id, environment, affordance, text }), publication, createdAt: formedAt, updatedAt: formedAt, executedAt: simulated && mode === "auto" ? formedAt : undefined, environment };
  state.executions.unshift(execution);
  if (simulated && mode === "auto") {
    const outcome: Outcome = { id: id("outcome"), socialIntentId: socialIntent.id, executionId: execution.id, presenceId: presence.id, status: "succeeded", observedAt: formedAt, metrics: {}, evidence: [], environment: presence.environment ?? "live" };
    state.outcomes.unshift(outcome);
      state.events.unshift(event("execution", "Calendar evaluation complete", "Jenny evaluated the standing intention and the simulated channel accepted the action.", "positive", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, outcomeId: outcome.id }));
  } else {
    const detail = status === "awaiting-connector" ? "The standing intention is waiting for an authorized channel connection." : status === "queued" ? `The ${presence.channel} publication is ready for its authorized connector.` : "Jenny formed a social intention that expires in 45 minutes.";
    state.events.unshift(event("execution", status === "queued" ? "Queued for channel delivery" : "Calendar intention awaiting review", detail, "neutral", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id }));
  }
  state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: simulated && mode === "auto" ? "executed" : mode === "review" ? "review" : "queued", reason: "Jenny evaluated a Calendar standing intention and handed the resulting Social Intent to the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  return state;
}

/** Form an original publication through the same execution envelope, with canonical Assignment lineage. */
export function formAssignmentPostIntent(source: OpenPresenceState, text: string, assignmentId: string, assetIds: string[] = [], runId?: string, decisionInput?: SocialDecisionInput) {
  const existingPresence = source.presence;
  if (existingPresence && hasExistingPublicAction(source, { presenceId: existingPresence.id, environment: existingPresence.environment ?? "live", affordance: "x.post", text })) return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const assignmentContext = source.assignments.find((item) => item.id === assignmentId);
  if (assignmentContext?.assetConstraint?.required && !assetIds.length) throw new Error("This Assignment requires an Asset from its Collection.");
  const state = formChatPostIntent(source, text, undefined, "agent", assetIds, decisionInput, runId);
  const intent = state.socialIntents[0];
  const execution = intent ? state.executions.find((item) => item.socialIntentId === intent.id) : undefined;
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  if (!intent || !execution || !assignment) return state;
  if (assetIds.length && assignment.assetConstraint?.collectionId) authorizeAssetSelection(state, assetIds, { presenceId: assignment.presenceId, collectionId: assignment.assetConstraint.collectionId });
  const assignmentLeakageReason = assignmentPublicExpressionLeakageReason(assignment, text);
  if (assignmentLeakageReason) {
    execution.status = "blocked";
    execution.failure = { code: "ASSIGNMENT_TEXT_LEAKAGE", message: assignmentLeakageReason, retryable: false };
    execution.reviewReason = assignmentLeakageReason;
    execution.updatedAt = now();
    const action = state.actions.find((item) => item.executionId === execution.id);
    if (action) action.status = "failed";
    state.events.unshift(event("decision", "Public text boundary blocked", assignmentLeakageReason, "warning", { presenceId: assignment.presenceId, intentId: intent.id, executionId: execution.id }));
  }
  intent.assignmentId = assignmentId;
  intent.origin = { kind: "assignment", refId: assignmentId };
  execution.assignmentId = assignmentId;
  execution.environment = assignment.environment;
  const publication = intent.publicationId ? state.publications.find((item) => item.id === intent.publicationId) : undefined;
  if (publication) {
    publication.assignmentId = assignmentId;
    publication.origin = { kind: "assignment", refId: assignmentId };
  }
  state.events.unshift(event("decision", "Publishing Assignment evaluated", `${assignment.title ?? "The Publishing Assignment"} produced one original-publication candidate for the Presence execution envelope.`, "positive", { presenceId: assignment.presenceId, intentId: intent.id, executionId: execution.id }));
  return state;
}

function missingDirectSocialContextRefs(state: OpenPresenceState, targetObject: MirrorObject | undefined) {
  if (!targetObject) return [];
  const refs = [targetObject.parentExternalRef, ...(targetObject.referencedExternalRefs ?? [])].filter((ref): ref is EntityRef => Boolean(ref));
  return refs.filter((ref) => !state.mirrorObjects.some((candidate) => candidate.presenceId === targetObject.presenceId
    && candidate.channelId === targetObject.channelId
    && candidate.externalRef.type === ref.type
    && candidate.externalRef.id === ref.id
    && (candidate.environment === targetObject.environment || (targetObject.environment === "live" && candidate.environment === undefined))));
}

export function formXReplyIntent(source: OpenPresenceState, text: string, parentId: string, operatorDirectiveId?: string, assignmentId?: string, assetIds: string[] = [], decisionInput?: SocialDecisionInput) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || (presence.status !== "live" && !operatorDirectiveId) || presence.channel !== "x" || !text.trim() || !parentId.trim()) return state;
  if (!operatorDirectiveId && isWatchPausedForOrigin(state, decisionInput?.origin)) return state;
  const environment = presence.environment ?? "live";
  const target = { type: "x.post" as const, id: parentId };
  // Automatic attention must not revisit a contact who has blocked this
  // Presence. A fresh, explicit operator directive may deliberately test the
  // state; only a verified success from that path clears the block evidence.
  if (targetIsBlockedByPerson(state, presence.id, target) && !operatorDirectiveId) return state;
  if (hasExistingPublicAction(state, { presenceId: presence.id, environment, affordance: "x.reply", target, text })) return state;
  const parentObject = state.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === parentId && item.presenceId === presence.id);
  const missingContextRefs = missingDirectSocialContextRefs(state, parentObject);
  if (missingContextRefs.length) {
    state.events.unshift(event("decision", "Public action held for complete context", `The target references ${missingContextRefs.map((ref) => `${ref.type}:${ref.id}`).join(", ")}, but that public object is not present in the Social Mirror. OpenPresence did not form or deliver a reply.`, "warning", { presenceId: presence.id }));
    return state;
  }
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const autobiographicalContext = !operatorDirectiveId ? retrievePublicSafeAutobiographicalContext(state, presence, `${text}\n${decisionInput?.summary ?? ""}`, Date.now()) : undefined;
  const autobiographicalEventIds = decisionInput?.autobiographicalEventIds ?? autobiographicalContext?.eventIds;
  const effectiveDecisionInput = decisionInput ? { ...decisionInput, autobiographicalEventIds } : undefined;
  const assignment = assignmentId ? state.assignments.find((item) => item.id === assignmentId) : undefined;
  if (assignment?.assetConstraint?.required && !assetIds.length) throw new Error("This Assignment requires an Asset from its Collection.");
  const validAssetIds = authorizeAssetSelection(state, assetIds, { presenceId: presence.id, collectionId: assignment?.assetConstraint?.collectionId });
  const publication = makePublication(state, text.trim(), validAssetIds.length ? "x.media-post" : "x.reply", operatorDirectiveId ? "operator_manual" : "agent_model", validAssetIds);
  const conversationEpisodeId = parentObject ? ensureConversationEpisode(state, parentObject, presence.id)?.id : undefined;
  const origin: SocialOrigin = decisionInput?.origin ?? (assignmentId
    ? { kind: "assignment", refId: assignmentId }
    : operatorDirectiveId
      ? { kind: "operator", refId: operatorDirectiveId }
      : { kind: "inbound_social", refId: parentId });
  publication.origin = origin;
  publication.assignmentId = assignmentId;
  publication.invocationId = decisionInput?.invocationId;
  publication.autobiographicalEventIds = autobiographicalEventIds;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.reply", target, publicationId: publication.id, priority: 60, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, origin, source: operatorDirectiveId ? "operator" : "agent", operatorDirectiveId, conversationEpisodeId, assignmentId, runId: decisionInput?.runId, invocationId: decisionInput?.invocationId, attentionEpisodeId: decisionInput?.attentionEpisodeId, autobiographicalEventIds };
  if (publication.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = effectiveDecisionInput ? createSocialDecision(state, { ...effectiveDecisionInput, focalMirrorObjectIds: effectiveDecisionInput.focalMirrorObjectIds ?? (parentObject ? [parentObject.id] : []), origin: effectiveDecisionInput.origin ?? origin }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  if (conversationEpisodeId) {
    applyConversationDisposition(
      state,
      conversationEpisodeId,
      conversationDispositionForAction("reply", decisionInput?.conversationDisposition),
      decisionInput?.summary,
      socialIntent.id,
    );
  }
  const mode = presence.execution.reply ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: "skipped", reason: "Replies are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Reply intention held", "Jenny formed a social intention, but Replies are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id, runId: decisionInput?.runId, invocationId: decisionInput?.invocationId }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.status === "connected" && connection.access === "read-write" && normalizeHandleForComparison(connection.account?.username) === normalizeHandleForComparison(presence.handle));
  const learnedBrowserFallback = browserFallbackWasLearned(presence, "x.reply");
  const observedNonMentionReply = Boolean(parentObject && !mirrorObjectIsOwnOrMentionsPresence(parentObject, presence.handle, nativeX?.account?.id));
  const browserFallbackRequired = observedNonMentionReply || learnedBrowserFallback;
  const bridge = browserFallbackRequired || !nativeX ? browserBridgeFor(state, presence.id, "reply") : undefined;
  const connector = browserFallbackRequired && bridge ? "bridge" as const : nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const runtimeLeakageReasonValue = runtimeContextLeakageReason(text);
  const autobiographicalSafetyReason = !operatorDirectiveId ? autobiographicalExpressionSafetyReason(state, presence.id, autobiographicalEventIds, text) : undefined;
  const mentionGroundingReason = !operatorDirectiveId ? expressionMentionGroundingReason(state, presence, target, text) : undefined;
  const sourceEchoReason = !operatorDirectiveId ? expressionSourceEchoReason(state, presence, target, text) : undefined;
  const publicExpressionReason = publicExpressionLeakageReason(text) ?? autobiographicalSafetyReason ?? mentionGroundingReason ?? sourceEchoReason;
  const status = publicExpressionReason ? "blocked" : leakageReason || runtimeLeakageReasonValue ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.reply", mode, status, attempts: 0, bridgeId: bridge?.id, connector, target, idempotencyKey: socialActionIdempotencyKey({ presenceId: presence.id, environment, affordance: "x.reply", target, text }), publication, reviewReason: publicExpressionReason ?? leakageReason ?? runtimeLeakageReasonValue, createdAt: formedAt, updatedAt: formedAt, source: operatorDirectiveId ? "operator" : "agent", operatorDirectiveId, conversationEpisodeId, assignmentId, environment, runId: decisionInput?.runId, invocationId: decisionInput?.invocationId, attentionEpisodeId: decisionInput?.attentionEpisodeId };
  if (publicExpressionReason) execution.failure = { code: autobiographicalSafetyReason ? "AUTOBIOGRAPHICAL_PRIVACY_BOUNDARY" : mentionGroundingReason ? "UNSUPPORTED_LEADING_MENTION" : sourceEchoReason ? "SOURCE_EXPRESSION_ECHO" : "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionReason, retryable: false };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: publicExpressionReason ? "failed" : mode === "review" ? "review" : "queued", reason: publicExpressionReason ?? (operatorDirectiveId ? "The operator directed Jenny to enter this conversation; Jenny supplied the expression through the Presence execution envelope." : "Jenny chose to continue a relevant conversation through the Presence execution envelope."), createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", publicExpressionReason ? "Public text boundary blocked" : operatorDirectiveId ? "Jenny expressed the requested reply" : "A reply intention was formed", publicExpressionReason ?? (connector ? (operatorDirectiveId ? "The operator set the social act; Jenny supplied a contextual reply for the Presence execution envelope." : "Jenny found a relevant X conversation and handed a contextual reply to the Presence execution envelope.") : "Jenny found a relevant X conversation, but no write-enabled X connector is available."), publicExpressionReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, decisionId: socialDecision?.id, runId: decisionInput?.runId, invocationId: decisionInput?.invocationId }));
  return state;
}

/** Form a verified live X reaction or follow through the same execution envelope as publishing. */
export function formXActionIntent(source: OpenPresenceState, input: { affordance: "x.like" | "x.repost" | "x.quote" | "x.follow"; target: EntityRef; text?: string; assignmentId?: string; assetIds?: string[]; decision?: SocialDecisionInput; source?: "agent" | "operator"; attentionTestId?: string; capabilityTrialId?: string; origin?: SocialOrigin; runId?: string; invocationId?: string; attentionEpisodeId?: string }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !input.target.id) return state;
  const requestedOrigin = input.origin ?? input.decision?.origin;
  if (input.source !== "operator" && isWatchPausedForOrigin(state, requestedOrigin)) return state;
  const capability = input.affordance.slice("x.".length);
  if (targetIsBlockedByPerson(state, presence.id, input.target) && input.source !== "operator") return state;
  const requiresExpression = capability === "quote";
  if (requiresExpression && !input.text?.trim()) return state;
  const nativeTargetAllowed = !requiresExpression || input.target.type !== "x.post" || xTargetAllowsQuotedExpression(state, presence, input.target.id);
  // Native X rejects quotes/replies to arbitrary public posts for this app,
  // but the signed-in Chrome body is an independent authorized route. Keep
  // the native target restriction while allowing a verified browser quote to
  // be formed when that route is actually available.
  const browserQuoteBridge = requiresExpression && !nativeTargetAllowed ? browserBridgeFor(state, presence.id, "quote") : undefined;
  const browserQuoteRouteReady = Boolean(browserQuoteBridge
    && (browserQuoteBridge.name.startsWith("OpenPresence Chrome") || browserQuoteBridge.name.startsWith("Chrome"))
    && bridgeExecutionStatus(browserQuoteBridge) === "connected");
  if (requiresExpression && !nativeTargetAllowed && !browserQuoteRouteReady) return state;
  const environment = "live" as const;
  if (hasExistingPublicAction(state, { presenceId: presence.id, environment, affordance: input.affordance, target: input.target, text: input.text })) return state;
  const targetObject = input.target.type === "x.post" ? state.mirrorObjects.find((item) => item.presenceId === presence.id && item.externalRef.type === input.target.type && item.externalRef.id === input.target.id) : undefined;
  const missingContextRefs = missingDirectSocialContextRefs(state, targetObject);
  if (missingContextRefs.length) {
    state.events.unshift(event("decision", "Public action held for complete context", `The target references ${missingContextRefs.map((ref) => `${ref.type}:${ref.id}`).join(", ")}, but that public object is not present in the Social Mirror. OpenPresence did not form or deliver the ${capability} action.`, "warning", { presenceId: presence.id }));
    return state;
  }
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const autobiographicalContext = requiresExpression && input.source !== "operator" ? retrievePublicSafeAutobiographicalContext(state, presence, `${input.text ?? ""}\n${input.decision?.summary ?? ""}`, Date.now()) : undefined;
  const autobiographicalEventIds = input.decision?.autobiographicalEventIds ?? autobiographicalContext?.eventIds;
  const effectiveDecision = input.decision ? { ...input.decision, autobiographicalEventIds } : undefined;
  const origin: SocialOrigin = input.origin ?? input.decision?.origin ?? (input.assignmentId ? { kind: "assignment", refId: input.assignmentId } : { kind: "inbound_social", refId: input.target.id });
  const assignment = input.assignmentId ? state.assignments.find((item) => item.id === input.assignmentId) : undefined;
  if (assignment?.assetConstraint?.required && !(input.assetIds ?? []).length) throw new Error("This Assignment requires an Asset from its Collection.");
  const validAssetIds = authorizeAssetSelection(state, input.assetIds ?? [], { presenceId: presence.id, collectionId: assignment?.assetConstraint?.collectionId });
  const publication = requiresExpression ? makePublication(state, input.text!.trim(), validAssetIds.length ? "x.media-post" : input.affordance, "agent_model", validAssetIds) : undefined;
  if (publication) { publication.origin = origin; publication.assignmentId = input.assignmentId; publication.invocationId = input.invocationId ?? input.decision?.invocationId; publication.autobiographicalEventIds = autobiographicalEventIds; }
  const trial = input.capabilityTrialId ? state.capabilityTrials.find((item) => item.id === input.capabilityTrialId && item.presenceId === presence.id && item.capability === capability) : undefined;
  const runId = input.runId ?? input.decision?.runId;
  const invocationId = input.invocationId ?? input.decision?.invocationId;
  const attentionEpisodeId = input.attentionEpisodeId ?? input.decision?.attentionEpisodeId;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: input.affordance, target: input.target, publicationId: publication?.id, priority: capability === "follow" ? 35 : 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, origin, assignmentId: input.assignmentId, environment: "live", source: input.source ?? "agent", attentionTestId: input.attentionTestId, capabilityTrialId: trial?.id, runId, invocationId, attentionEpisodeId, autobiographicalEventIds };
  if (publication?.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = effectiveDecision ? createSocialDecision(state, { ...effectiveDecision, focalMirrorObjectIds: effectiveDecision.focalMirrorObjectIds ?? [] , origin: effectiveDecision.origin ?? origin, runId: runId ?? effectiveDecision.runId, invocationId: invocationId ?? effectiveDecision.invocationId }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  const mode = trial?.executionIsolation.mode ?? presence.execution[capability] ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: capability as "like" | "repost" | "quote" | "follow", target: input.target.id, summary: input.text?.trim() ?? capability, status: "skipped", reason: `${capability} is off in the Presence execution envelope.`, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", `X ${capability} intention held`, `The Presence selected ${capability}, but that affordance is off in the execution envelope.`, "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id, runId, invocationId }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.access === "read-write" && normalizeHandleForComparison(connection.account?.username) === normalizeHandleForComparison(presence.handle) && (connection.status === "connected" || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? ""))));
  // The Native API gets the first attempt. A browser route is selected only
  // after this exact affordance has learned that native delivery fails.
  const browserFallbackRequired = (!nativeTargetAllowed && requiresExpression) || browserFallbackWasLearned(presence, input.affordance);
  const connectedNative = browserFallbackRequired ? undefined : nativeX;
  const bridge = browserFallbackRequired || !nativeX ? browserBridgeFor(state, presence.id, capability) : undefined;
  const connector = browserFallbackRequired && bridge ? "bridge" as const : connectedNative ? "native" as const : bridge ? bridge.kind : undefined;
  const autobiographicalSafetyReason = publication && input.source !== "operator" ? autobiographicalExpressionSafetyReason(state, presence.id, autobiographicalEventIds, input.text!.trim()) : undefined;
  const mentionGroundingReason = publication && input.source !== "operator"
    ? expressionMentionGroundingReason(state, presence, input.target, input.text!.trim())
    : undefined;
  const sourceEchoReason = publication && input.source !== "operator"
    ? expressionSourceEchoReason(state, presence, input.target, input.text!.trim())
    : undefined;
  const leakageReason = publication ? publicExpressionLeakageReason(input.text!.trim()) ?? autobiographicalSafetyReason ?? mentionGroundingReason ?? sourceEchoReason : undefined;
  const status = leakageReason ? "blocked" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: input.affordance, mode, status, attempts: 0, bridgeId: bridge?.id, connector, target: input.target, idempotencyKey: socialActionIdempotencyKey({ presenceId: presence.id, environment, affordance: input.affordance, target: input.target, text: input.text }), publication, reviewReason: leakageReason, createdAt: formedAt, updatedAt: formedAt, assignmentId: input.assignmentId ?? trial?.assignmentId, environment, source: input.source ?? "agent", attentionTestId: input.attentionTestId, capabilityTrialId: trial?.id, runId, invocationId, attentionEpisodeId };
  if (leakageReason) execution.failure = { code: autobiographicalSafetyReason ? "AUTOBIOGRAPHICAL_PRIVACY_BOUNDARY" : mentionGroundingReason ? "UNSUPPORTED_LEADING_MENTION" : sourceEchoReason ? "SOURCE_EXPRESSION_ECHO" : "PUBLIC_TEXT_INTERNAL_MARKER", message: leakageReason, retryable: false };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: capability as "like" | "repost" | "quote" | "follow", target: input.target.id, summary: input.text?.trim() ?? capability, status: leakageReason ? "failed" : mode === "review" ? "review" : "queued", reason: leakageReason ?? `The Presence formed a ${capability} action through the live X execution envelope.`, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", leakageReason ? "Public action blocked" : `X ${capability} intention formed`, leakageReason ?? `${capability} is ready for the authorized X connector.`, leakageReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, decisionId: socialDecision?.id, runId, invocationId }));
  return state;
}

export function recordVerifiedCapabilityTrial(state: OpenPresenceState, execution: Execution, outcome: Outcome) {
  if (!execution.capabilityTrialId) return state;
  const trial = state.capabilityTrials.find((item) => item.id === execution.capabilityTrialId);
  if (!trial) return state;
  trial.status = "completed";
  trial.result = "PASS_VERIFIED";
  trial.executionId = execution.id;
  trial.socialIntentId = execution.socialIntentId;
  trial.verifiedOutcomeId = outcome.id;
  trial.why = "The Agent independently selected this candidate through its normal Social Planner. The tested act was isolated for execution and verified by the channel.";
  trial.updatedAt = outcome.observedAt;
  const assignment = state.assignments.find((item) => item.id === trial.assignmentId);
  if (assignment) {
    assignment.progress.verified = Math.max(assignment.progress.verified, 1);
    assignment.status = "completed";
    assignment.lastOutcome = { class: "assignment_completed", message: `Verified ${trial.capability} outcome recorded for the capability trial.`, at: outcome.observedAt };
    assignment.updatedAt = outcome.observedAt;
  }
  state.events.unshift(event("learning", "Capability trial verified", `The ${trial.capability} act was verified in the world. The trial completed without changing the Presence-wide execution envelope.`, "positive", { presenceId: trial.presenceId, executionId: execution.id, outcomeId: outcome.id, sourceObjectId: trial.id }));
  return state;
}

export function completeNativeExecution(source: OpenPresenceState, executionId: string, externalRef: import("./types").EntityRef) {
  let state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId && item.connector === "native");
  if (!execution) throw new Error("Native execution not found.");
  if (execution.publication?.assetIds?.length) {
    try {
      authorizeAssetSelection(state, execution.publication.assetIds, { presenceId: execution.presenceId, requireReady: true });
    } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: "ASSET_AUTHORIZATION_FAILED", message: error instanceof Error ? error.message : "The selected Asset cannot be used by this Presence.", retryable: false };
      execution.reviewReason = "Native completion failed closed at the Asset authorization boundary.";
      execution.updatedAt = now();
      state.events.unshift(event("execution", "Asset authorization blocked completion", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
      return state;
    }
  }
  const targetLanguageResult = execution.publication ? targetLanguageValidationForExecution(state, execution) : { valid: true as const, reason: undefined };
  if (!targetLanguageResult.valid) {
    execution.status = "blocked";
    execution.failure = { code: "TARGET_LANGUAGE_MISMATCH", message: targetLanguageResult.reason ?? "Delivery blocked because the target post language does not match the Presence language or could not be confirmed.", retryable: false };
    execution.reviewReason = "The target post language is not confirmed to match the Presence language.";
    execution.updatedAt = now();
    state.events.unshift(event("execution", "Target language blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
    return state;
  }
  const languageResult = execution.publication ? languageValidationForExecution(state, execution) : { valid: true as const, violations: [] as Array<{ literal: string }> };
  if (!languageResult.valid) {
    execution.status = "blocked";
    execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by Never use: " + languageResult.violations.map((item) => item.literal).join(", ") + ".", retryable: false };
    execution.reviewReason = "The final expression violates an explicit lexical language policy.";
    execution.updatedAt = now();
    state.events.unshift(event("execution", "Language policy blocked delivery", execution.failure.message, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
    return state;
  }
  if (execution.environment === "live" && execution.publication?.publicExpression) {
    try { verifyExecutionPermit(execution); } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: error instanceof PublicationSecurityError ? error.code : "PUBLICATION_SECURITY_BLOCKED", message: error instanceof Error ? error.message : "Live completion requires a valid sealed Public Expression permit.", retryable: false };
      execution.reviewReason = "A native execution cannot be marked delivered without a valid sealed Public Expression permit.";
      execution.updatedAt = now();
      state.events.unshift(event("execution", "Live completion blocked", "The runtime rejected a native completion without a valid publication permit.", "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
      return state;
    }
  }
  execution.status = "succeeded";
  execution.attempts += 1;
  execution.externalRef = externalRef;
  execution.executedAt = now();
  execution.updatedAt = now();
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [externalRef] };
  state.outcomes.unshift(outcome);
  state = recordVerifiedCapabilityTrial(state, execution, outcome);
  if ((execution.affordance === "x.like" || execution.affordance === "x.repost") && execution.target?.type === "x.post") {
    const reactionType = execution.affordance === "x.like" ? "x.like" : "x.repost";
    const reactionObject = {
      id: id("mirror"), bridgeId: execution.bridgeId ?? `native:${execution.presenceId}`, presenceId: execution.presenceId, channelId: "x" as const,
      externalRef: { type: reactionType, id: execution.target.id }, parentExternalRef: { type: "x.post", id: execution.target.id },
      objectType: execution.affordance.replace(/^x\./, ""), author: { displayName: state.presences.find((item) => item.id === execution.presenceId)?.name ?? "Presence", handle: state.presences.find((item) => item.id === execution.presenceId)?.handle },
      occurredAt: now(), observedAt: now(), visibility: "public" as const, shareability: "presence-only" as const,
      originExecutionId: execution.id, actorPresenceId: execution.presenceId, archived: false, environment: "live" as const, source: "native" as const, trust: "untrusted_world_content" as const, attentionEpisodeId: execution.attentionEpisodeId,
    };
    state.mirrorObjects = [reactionObject, ...state.mirrorObjects.filter((item) => !(item.presenceId === execution.presenceId && item.externalRef.type === reactionType && item.externalRef.id === execution.target?.id))];
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: reactionObject.bridgeId, presenceId: execution.presenceId, sourceEventId: `native-reaction:${execution.id}`, event: "created", externalRef: reactionObject.externalRef, receivedAt: reactionObject.observedAt });
  }
  if (execution.affordance === "x.quote" && execution.target?.type === "x.post" && externalRef.type === "x.post") {
    const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
    const payload = execution.publication?.publicExpression?.text
      ?? (execution.publication?.payload && typeof execution.publication.payload === "object" && !Array.isArray(execution.publication.payload) && typeof execution.publication.payload.text === "string" ? execution.publication.payload.text : undefined);
    const quoteObject = {
      id: id("mirror"), bridgeId: execution.bridgeId ?? `native:${execution.presenceId}`, presenceId: execution.presenceId, channelId: "x" as const,
      externalRef, referencedExternalRefs: [execution.target], objectType: "quote", author: { displayName: presence?.name ?? "Presence", handle: presence?.handle },
      content: payload ? { text: payload } : undefined, occurredAt: execution.executedAt ?? now(), observedAt: now(), visibility: "public" as const,
      shareability: "presence-only" as const, originExecutionId: execution.id, actorPresenceId: execution.presenceId, archived: false, attentionEpisodeId: execution.attentionEpisodeId,
      environment: "live" as const, source: "native" as const, trust: "untrusted_world_content" as const,
    };
    state.mirrorObjects = [quoteObject, ...state.mirrorObjects.filter((item) => !(item.presenceId === execution.presenceId && item.externalRef.type === externalRef.type && item.externalRef.id === externalRef.id))];
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: quoteObject.bridgeId, presenceId: execution.presenceId, sourceEventId: `native-quote:${execution.id}`, event: "created", externalRef, receivedAt: quoteObject.observedAt });
  }
  if (execution.affordance === "x.follow" && execution.target?.type === "x.user") {
    state = recordVerifiedFollow(state, execution.presenceId, execution.target);
  }
  if (execution.conversationEpisodeId) settleConversationClosure(state, execution.conversationEpisodeId, "verified", "The native X reply was verified by the connector.");
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === execution.presenceId && connection.kind === "x"
    ? { ...connection, deliveryError: undefined, updatedAt: now() }
    : connection);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "executed"; action.outcomeId = outcome.id; }
  state.events.unshift(event("execution", "Published on X", "The native X connector delivered the approved action and returned an external reference.", "positive", { presenceId: execution.presenceId, executionId: execution.id, outcomeId: outcome.id }));
  return clearPersonBlockFromExecution(state, execution.id);
}

/**
 * Record an X API-confirmed result for a previously unresolved reply. The
 * writer may have been Native X or the browser capability fallback; the API is the
 * authority for whether the public X object exists. This transition is
 * intentionally idempotent so reconciliation cannot create duplicate
 * outcomes.
 */
export function recordVerifiedXReply(source: OpenPresenceState, executionId: string, externalRef: EntityRef) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  if (externalRef.type !== "x.reply") return state;
  const execution = state.executions.find((item) => item.id === executionId && (item.connector === "native" || item.connector === "bridge") && ["reply", "x.reply"].includes(item.affordance));
  if (!execution || execution.status === "succeeded") return state;

  const verifiedAt = now();
  execution.status = "succeeded";
  execution.externalRef = externalRef;
  execution.attempts += 1;
  execution.executedAt = execution.executedAt ?? verifiedAt;
  execution.updatedAt = verifiedAt;
  execution.failure = undefined;
  execution.reviewReason = undefined;
  execution.lease = undefined;

  const existingOutcome = state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded");
  const outcome: Outcome = existingOutcome ?? {
    id: id("outcome"),
    socialIntentId: execution.socialIntentId,
    executionId: execution.id,
    presenceId: execution.presenceId,
    attentionEpisodeId: execution.attentionEpisodeId,
    status: "succeeded",
    observedAt: verifiedAt,
    metrics: {},
    evidence: [externalRef],
    environment: execution.environment,
    sessionId: execution.sessionId,
    conversationEpisodeId: execution.conversationEpisodeId,
  };
  if (!existingOutcome) state.outcomes.unshift(outcome);
  else outcome.evidence = Array.from(new Map([...(outcome.evidence ?? []), externalRef].map((item) => [`${item.type}:${item.id}`, item])).values());

  const writer = execution.connector === "bridge" ? "Browser capability" : "Native X";
  if (execution.conversationEpisodeId) settleConversationClosure(state, execution.conversationEpisodeId, "verified", `The ${writer} reply was verified by the X API.`);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) {
    action.status = "executed";
    action.outcomeId = outcome.id;
  }
  state.events.unshift(event("execution", `${writer} reply verified on X`, "The X API confirmed the exact public reply from the configured Presence account.", "positive", { presenceId: execution.presenceId, executionId: execution.id, outcomeId: outcome.id, intentId: execution.socialIntentId }));
  return clearPersonBlockFromExecution(state, execution.id);
}

/** Backwards-compatible name for callers that specifically handle the fallback writer. */
export function recordVerifiedChromeReply(source: OpenPresenceState, executionId: string, externalRef: EntityRef) {
  return recordVerifiedXReply(source, executionId, externalRef);
}

/** Persist a verified Follow as selective Network memory; an observed author alone never creates this state. */
export function recordVerifiedFollow(source: OpenPresenceState, presenceId: string, target: EntityRef) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!state.agent || !presence || target.type !== "x.user" || !target.id) return state;

  const matchingMirrorAuthor = state.mirrorObjects.find(
    (item) => item.author?.externalRef?.id === target.id && item.author?.displayName && !isPlaceholderIdentity(item.author.displayName)
  )?.author;

  const existingIdentity = state.personIdentities.find(
    (identity) => identity.sourcePresenceId === presenceId && identity.externalActorId === target.id
  );
  const existingPerson = existingIdentity ? state.people.find((p) => p.id === existingIdentity.personId) : undefined;

  const displayName = (!isPlaceholderIdentity(existingPerson?.displayName) ? existingPerson?.displayName : undefined)
    ?? (!isPlaceholderIdentity(existingIdentity?.displayName) ? existingIdentity?.displayName : undefined)
    ?? (!isPlaceholderIdentity(matchingMirrorAuthor?.displayName) ? matchingMirrorAuthor?.displayName : undefined)
    ?? (isPlaceholderIdentity(target.id) ? "Unknown X account" : target.id.startsWith("@") ? target.id : `@${target.id}`);

  const handle = (!isPlaceholderIdentity(existingIdentity?.handle) ? existingIdentity?.handle : undefined)
    ?? (!isPlaceholderIdentity(matchingMirrorAuthor?.handle) ? matchingMirrorAuthor?.handle : undefined)
    ?? (isPlaceholderIdentity(target.id) ? undefined : target.id.replace(/^@/, ""));

  const avatarUrl = existingIdentity?.avatarUrl ?? matchingMirrorAuthor?.avatarUrl;

  const remembered = createRememberedPerson({
    agentId: state.agent.id,
    presenceId,
    channel: presence.channel,
    externalActorId: target.id,
    displayName,
    handle,
    avatarUrl,
    sourceEnvironment: presence.environment ?? "live",
    source: "current-context",
    evidenceKind: matchingMirrorAuthor ? "mirror_author" : "reply_target",
  }, state.people, state.personIdentities, state.relationships);

  remembered.relationship.following = true;
  remembered.relationship.state = "active";
  remembered.relationship.updatedAt = now();
  state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
  state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId && item.sourcePresenceId === remembered.identity.sourcePresenceId && (item.sourceEnvironment ?? "live") === (remembered.identity.sourceEnvironment ?? "live")))];
  state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
  state.events.unshift(event("memory", "Following relationship verified", `${remembered.person.displayName} is now marked as followed from a verified X action.`, "positive", { presenceId }));
  return state;
}


export function failNativeExecution(source: OpenPresenceState, executionId: string, message: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  // The API calls this only for native delivery failures, but the execution
  // can still be connector-less when a failure is synthesized before the
  // queue has materialized its writer. Keep the failure transition keyed by
  // execution identity so the structured error is never silently dropped.
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return state;
  execution.status = "failed";
  const duplicate = isTerminalDuplicateExecution({ failure: { message } });
  execution.failure = { code: duplicate ? "DUPLICATE_CONTENT" : undefined, message, retryable: !duplicate };
  if (duplicate) execution.reviewReason = "X rejected this exact expression as duplicate content; verify the public thread before creating any replacement.";
  execution.updatedAt = now();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: "failed", observedAt: now(), metrics: {} };
  state.outcomes.unshift(outcome);
  if (execution.conversationEpisodeId) settleConversationClosure(state, execution.conversationEpisodeId, "failed", "The native X reply failed before external verification.");
  if (action) action.outcomeId = outcome.id;
  state.events.unshift(event("execution", "X delivery failed", `${message} No external artifact was counted.`, "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
  return state;
}

function executionMatchesCapability(execution: Execution, presence: Presence, capability: string) {
  return execution.presenceId === presence.id && (execution.affordance === capability || execution.affordance === `${presence.channel}.${capability}`);
}

export function pendingReviewExecutionsForCapabilities(source: OpenPresenceState, presenceId: string, capabilities: string[]) {
  const presence = source.presences.find((item) => item.id === presenceId) ?? (source.presence?.id === presenceId ? source.presence : undefined);
  if (!presence) return [];
  return source.executions.filter((execution) => execution.status === "awaiting-review" && capabilities.some((capability) => executionMatchesCapability(execution, presence, capability)));
}

export function confirmAutoMode(source: OpenPresenceState, presenceId: string, capabilities: string[], executionIds: string[]) {
  const pending = pendingReviewExecutionsForCapabilities(source, presenceId, capabilities);
  const pendingIds = new Set(pending.map((execution) => execution.id));
  const requestedIds = new Set(executionIds);
  if (pendingIds.size !== requestedIds.size || [...pendingIds].some((id) => !requestedIds.has(id))) {
    throw new Error("The pending review actions changed before Auto could be enabled. Review the current queue and try again.");
  }

  let next = applyOperation(source, { type: "setPresence", patch: { execution: Object.fromEntries(capabilities.map((capability) => [capability, "auto"])) as Presence["execution"] } });
  for (const execution of pending) {
    next = applyOperation(next, { type: "approveExecution", id: execution.id });
    if (execution.connector !== "native") next = applyOperation(next, { type: "executeIntent", id: execution.socialIntentId });
  }
  return next;
}

function capabilityTrialContract(capability: CapabilityTrial["capability"]) {
  const label = capability === "original_post" ? "Original post" : capability === "image_post" ? "Image post" : capability === "video_post" ? "Video post" : capability.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const action = capability === "original_post" ? "publish" : capability === "image_post" ? "publish an image post" : capability === "video_post" ? "publish a video post" : capability;
  const deliverable: Assignment["deliverable"]["type"] = capability === "like" || capability === "repost" || capability === "quote" || capability === "reply" ? capability : capability === "original_post" || capability === "image_post" || capability === "video_post" ? "original_publication" : "public_interaction";
  return {
    instruction: `Find a real X opportunity Genny genuinely believes deserves a ${action} and produce exactly 1 verified ${label}.`,
    objective: `Capability trial: discover the opportunity and judge it naturally before deciding whether ${action} is worthwhile.`,
    deliverable,
  };
}

// applyOperation is often used as a small state-transition reducer: one
// operator action or worker stage can apply several operations in sequence.
// Those results have already passed normalizeState, so re-running the full
// migration/repair pass for every subsequent operation only adds allocation
// and event-loop pressure. Keep the marker process-local; durable reads and
// writeState remain normalization boundaries, so this never becomes persisted
// compatibility metadata or a substitute for recovery validation.
export function applyOperation(source: OpenPresenceState, operation: Operation | import("./types").ToolBindingOperation | import("./types").CapabilityOperation): OpenPresenceState {
  let state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  if (!isStateNormalized(source)) state = normalizeState(state);
  markStateNormalized(state);
  if (operation.type === "setPresenceBrowserAccess") {
    if (operation.presenceId && state.presence?.id !== operation.presenceId) return state;
    const selected = state.presence;
    return applyOperation(state, {
      type: "setPresence",
      // Browser access is an optional capability. It must never replace the
      // Presence's channel or its preferred native connector.
      patch: {
        browserAccess: { enabled: operation.enabled, learnedFallbacks: selected?.browserAccess?.learnedFallbacks },
        // Repair workspaces created by the old X-only browser route model.
        ...(selected?.channel === "x" ? { connectionMode: "native" } : {}),
      },
    } as Operation);
  }
  if (operation.type === "askPresenceToIgnore") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    const target = state.mirrorObjects.find((item) => (item.id === operation.objectId || item.externalRef.id === operation.objectId) && item.presenceId === operation.presenceId && (!operation.sessionId || item.sessionId === operation.sessionId));
    if (!state.agent || !presence || !target || !["post", "reply", "comment"].includes(target.objectType) || target.actorPresenceId === presence.id) return state;
    const existing = state.operatorDirectives.find((item) => item.presenceId === presence.id && item.target.id === target.externalRef.id && item.requiredAct === "no_op" && item.status !== "failed");
    const alreadyJudged = state.events.some((item) => item.sourceObjectId === target.id && /silence|left alone|ignore/i.test(`${item.title} ${item.detail}`));
    if (existing || alreadyJudged) return state;
    const directive: OperatorDirective = { id: id("directive"), agentId: state.agent.id, presenceId: presence.id, target: target.externalRef, requiredAct: "no_op", provenance: "operator", initialAct: "no_op", status: "expressed", environment: target.environment ?? presence.environment, sessionId: target.sessionId, createdAt: now() };
    state.operatorDirectives.unshift(directive);
    state.events.unshift(event("decision", `The operator asked ${presence.name} to ignore this post`, `${presence.name} will leave this interaction alone. No public action or delivery was created.`, "quiet", { presenceId: presence.id, sourceObjectId: target.id }));
    return state;
  }
  if (operation.type === "askPresenceToReply") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    const target = state.mirrorObjects.find((item) => item.id === operation.objectId && item.presenceId === operation.presenceId && (!operation.sessionId || item.sessionId === operation.sessionId));
    if (!state.agent || !presence || !target || !["post", "reply", "comment"].includes(target.objectType) || target.actorPresenceId === presence.id) return state;
    if ((presence.execution.reply ?? "off") === "off") return state;
    const existing = state.operatorDirectives.find((item) => item.presenceId === presence.id && item.target.id === target.externalRef.id && item.requiredAct === "reply" && item.status !== "failed");
    if (existing) {
      const existingExecution = state.executions.find((item) => item.operatorDirectiveId === existing.id && item.target?.id === target.externalRef.id && item.presenceId === presence.id);
      const executionStillActive = existingExecution && !["failed", "blocked", "expired"].includes(existingExecution.status);
      if (executionStillActive) return state;
      existing.optionalDirection = operation.optionalDirection?.trim() || existing.optionalDirection;
      existing.status = "requested";
      existing.createdAt = now();
      return state;
    }
    const directive: OperatorDirective = { id: id("directive"), agentId: state.agent.id, presenceId: presence.id, target: target.externalRef, requiredAct: "reply", optionalDirection: operation.optionalDirection?.trim() || undefined, provenance: "operator", initialAct: "no_op", status: "requested", environment: target.environment ?? presence.environment, sessionId: target.sessionId, createdAt: now() };
    state.operatorDirectives.unshift(directive);
    state.events.unshift(event("decision", `The operator asked ${presence.name} to reply`, `${presence.name} will decide how to express a reply. The operator supplied the social act; the Presence still owns the wording and safety boundaries.`, "positive", { presenceId: presence.id, sourceObjectId: target.id }));
    return state;
  }
  if (operation.type === "updateAssignmentPlan") {
    const assignment = state.assignments.find((item) => item.id === operation.assignmentId);
    if (!assignment || assignment.status === "cancelled") return state;
    const timestamp = now();
    const nextPlan: AssignmentPlan = { ...operation.plan, id: id("assignment-plan"), assignmentId: assignment.id, revision: (assignment.plan?.revision ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp, source: "agent" };
    assignment.planHistory = [...(assignment.planHistory ?? []), nextPlan];
    assignment.plan = nextPlan;
    assignment.revision = (assignment.revision ?? 0) + 1;
    assignment.updatedAt = timestamp;
    state.events.unshift(event("learning", "Assignment approach revised", `${assignment.title ?? assignment.instruction} has a new Agent-authored operating plan.`, "positive", { presenceId: assignment.presenceId }));
    return state;
  }
  if (operation.type === "recordAudienceSnapshot") {
    const presence = state.presences.find((item) => item.id === (operation.presenceId ?? state.activePresenceId)) ?? state.presence;
    if (!presence || !Number.isInteger(operation.followers) || operation.followers < 0) return state;
    const snapshot: PresenceAudienceSnapshot = { id: id("audience-snapshot"), presenceId: presence.id, channel: presence.channel, followers: operation.followers, following: operation.following, source: operation.source ?? (presence.environment === "sandbox" ? "sandbox" : "manual"), observationStatus: operation.observationStatus ?? "observed", observedAt: operation.observedAt ?? now(), environment: presence.environment };
    // Keep raw polling deduplication independent from the Growth boundary.
    // Historical records remain available as provenance, while all Growth
    // reads below still fail closed on pre-Presence observations.
    const latest = collapseAudienceSnapshots(state.audienceSnapshots.filter((item) => item.presenceId === snapshot.presenceId))[0];
    const unchangedPollingBurst = latest && sameAudienceSnapshotReading(latest, snapshot) && Math.abs(new Date(latest.observedAt).getTime() - new Date(snapshot.observedAt).getTime()) <= AUDIENCE_SNAPSHOT_DEDUP_WINDOW_MS;
    if (unchangedPollingBurst) return state;
    state.audienceSnapshots.unshift(snapshot);
    const growthAssignment = growthAssignmentFor(state, presence.id);
    if (growthAssignment && growthEvidenceIsInPresenceScope(state, presence.id, snapshot.observedAt) && assignmentIsSatisfied(growthAssignment, state)) {
      growthAssignment.status = "completed";
      growthAssignment.progress.verified = 1;
      growthAssignment.lastOutcome = { class: "assignment_completed", message: `The ${presence.channel === "x" ? "X" : presence.name} audience snapshot verified the follower target.`, at: snapshot.observedAt };
      growthAssignment.updatedAt = snapshot.observedAt;
      state.events.unshift(event("learning", "Growth responsibility completed", growthAssignment.lastOutcome.message, "positive", { presenceId: presence.id }));
    } else {
      state.events.unshift(event("system", "Audience progress observed", `${snapshot.followers.toLocaleString()} followers observed on ${presence.channel === "x" ? "X" : presence.name}.`, "positive", { presenceId: presence.id }));
    }
    return state;
  }
  if (operation.type === "recordPublicationMetricSnapshot") {
    recordPublicationMetricSnapshotInPlace(state, operation);
    return state;
  }
  if (operation.type === "updateAgentRequest") {
    const request = state.agentRequests.find((item) => item.id === operation.id);
    if (!request) return state;
    request.status = operation.status;
    request.updatedAt = now();
    request.resolvedAt = operation.status === "resolved" ? now() : undefined;
    state.events.unshift(event("system", "Agent request updated", `${request.title} is now ${operation.status}.`, operation.status === "resolved" ? "positive" : "neutral", { presenceId: request.presenceId }));
    return state;
  }
  if (operation.type === "recordCapabilityChange") {
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!presence) return state;
    for (const change of operation.changes) {
      state.capabilityChangeEvents.unshift({ id: id("capability-change"), presenceId: presence.id, ...change, createdAt: now() });
      const dedupeKey = `${presence.id}:${change.capability}`;
      if (change.nextAvailability === "available") {
        for (const request of state.agentRequests.filter((item) => item.dedupeKey === dedupeKey && ["open", "accepted", "snoozed"].includes(item.status))) { request.status = "resolved"; request.resolvedAt = now(); request.updatedAt = now(); }
      }
    }
    const assignment = growthAssignmentFor(state, presence.id);
    if (assignment?.plan) {
      const reviewAt = now();
      assignment.plan = { ...assignment.plan, nextWeeklyReviewAt: reviewAt, nextStrategicReviewAt: reviewAt, updatedAt: reviewAt };
      assignment.updatedAt = reviewAt;
      state.events.unshift(event("learning", "Growth review made eligible", "A capability change changed the evidence or action surface, so the active Growth responsibility is eligible for its next plan review.", "positive", { presenceId: presence.id, sourceObjectId: assignment.id }));
    }
    return state;
  }
  if (operation.type === "reviewGrowth") {
    const presence = state.presences.find((item) => item.id === (operation.presenceId ?? state.activePresenceId)) ?? state.presence;
    const assignment = presence ? growthAssignmentFor(state, presence.id, operation.assignmentId) : undefined;
    if (!assignment) return state;
    const reviewed = createGrowthReview(state, assignment, operation.kind ?? "weekly", operation.modelDecision);
    reviewed.events.unshift(event("learning", "Growth review completed", reviewed.growthReviews[0]?.summary ?? "Genny reviewed the available Growth evidence.", "positive", { presenceId: assignment.presenceId }));
    return reviewed;
  }
  if (operation.type === "createCapabilityTrial") {
    const presence = state.presences.find((item) => item.id === (operation.presenceId ?? state.activePresenceId)) ?? state.presence;
    if (!state.agent || !presence || presence.channel !== "x") throw new Error("Capability trials currently require an X Presence.");
    const capability = operation.capability;
    const environment = operation.environment ?? presence.environment ?? "sandbox";
    const timestamp = now();
    const trialId = id("capability-trial");
    const trialContract = capabilityTrialContract(capability);
    const assignment = compileAssignmentInstruction(state, trialContract.instruction, presence.id, environment, undefined, undefined, "keep_moving", trialContract.objective);
    assignment.origin = "capability_trial";
    assignment.createdBy = "system";
    assignment.title = `Capability trial · ${capability}`;
    assignment.deliverable = { type: trialContract.deliverable, quantity: 1, quantityMode: "exact" };
    assignment.preflight = preflightAssignment(state, assignment, "keep_moving");
    assignment.activation = { type: "attention_source", sourceIds: [trialId], startsAt: timestamp, endsAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    assignment.status = "draft";
    assignment.executionPolicy = { usePresenceEnvelope: true, delegationPolicy: "keep_moving" };
    const trial: CapabilityTrial = {
      id: trialId,
      agentId: state.agent.id,
      presenceId: presence.id,
      capability,
      environment,
      assignmentId: assignment.id,
      status: "preflight",
      focusPolicy: { objective: "Find a genuine public opportunity the Agent independently considers worth an outward act.", discovery: "agent-directed", target: "agent-discovered", preservePlannerVocabulary: true },
      executionIsolation: { testedCapability: capability, mode: operation.executionMode ?? "review", suppressOtherTrialActs: true, presenceWide: false },
      resourceEnvelope: { maxDurationMinutes: 15, maxSearchDirections: 3, maxLightweightHits: 40, maxCandidatesTriaged: 8, maxHydratedCandidates: 5, ...operation.resourceEnvelope },
      candidateId: operation.candidateId,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      candidateAudits: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.assignments.unshift(assignment);
    state.capabilityTrials.unshift(trial);
    state.events.unshift(event("system", "Capability trial prepared", `${presence.name} has a bounded ${capability} trial. The trial focuses attention and isolates execution without changing the Presence-wide envelope.`, "positive", { presenceId: presence.id, sourceObjectId: trial.id }));
    return state;
  }
  if (operation.type === "startCapabilityTrial") {
    const trial = state.capabilityTrials.find((item) => item.id === operation.id);
    const presence = trial ? state.presences.find((item) => item.id === trial.presenceId) : undefined;
    if (!trial || !presence || !state.agent || trial.status === "cancelled") return state;
    if (trial.environment === "live" && operation.confirmLive !== true) throw new Error("Starting a live capability trial requires explicit confirmation.");
    const manifest = derivePresenceCapabilityManifest(state, presence.id);
    const capability = manifest.items.find((item) => item.capability === trial.capability);
    // Don't block the trial if native X has a delivery error but the Chrome
    // Extension bridge can execute the capability. The trial should be able
    // to run through the bridge even when the native API is rejecting writes.
    if (!capability?.canExecute || !capability.canVerify) {
      // Check if the bridge can handle this capability as a fallback
      const bridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
      const bridgeCanExecute = Boolean(bridge && bridge.capabilities.affordances.some((item) => item === trial.capability || item === `${presence.channel}.${trial.capability}`));
      if (!bridgeCanExecute) {
        trial.status = "failed";
        trial.result = "BLOCKED_CAPABILITY";
        trial.lastError = capability?.limitation ?? `The connected X body cannot execute and verify ${trial.capability}.`;
        trial.updatedAt = now();
        return state;
      }
    }
    trial.status = "active";
    trial.startedAt = now();
    trial.updatedAt = trial.startedAt;
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId);
    if (assignment) { assignment.status = "active"; assignment.updatedAt = trial.startedAt; assignment.preflight = { ...(assignment.preflight ?? {}), status: "ready", reviewedAt: trial.startedAt, reviewedRevision: assignment.revision ?? 0 } as Assignment["preflight"]; }
    state.events.unshift(event("decision", "Capability trial started", `${presence.name} will discover and judge its own X opportunity. Only a verified ${trial.capability} outcome can complete this trial.`, "positive", { presenceId: presence.id, sourceObjectId: trial.id }));
    return state;
  }
  if (operation.type === "cancelCapabilityTrial") {
    const trial = state.capabilityTrials.find((item) => item.id === operation.id);
    if (!trial || ["completed", "cancelled"].includes(trial.status)) return state;
    trial.status = "cancelled";
    trial.result = "CANCELLED";
    trial.updatedAt = now();
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId);
    if (assignment) { assignment.status = "cancelled"; assignment.updatedAt = trial.updatedAt; }
    const stopStatuses = ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"];
    for (const execution of state.executions.filter((item) => item.capabilityTrialId === trial.id || (trial.assignmentId && item.assignmentId === trial.assignmentId))) {
      if (stopStatuses.includes(execution.status)) {
        execution.status = "cancelled";
        execution.lease = undefined;
        execution.updatedAt = trial.updatedAt;
        const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
        if (intent && intent.state === "active") { intent.state = "withdrawn"; intent.updatedAt = execution.updatedAt; }
      }
    }
    state.events.unshift(event("system", "Capability trial cancelled", "The bounded trial was stopped. No new trial actions will be initiated; any already-sent action will continue verification.", "quiet", { presenceId: trial.presenceId, sourceObjectId: trial.id }));
    return state;
  }
  if (operation.type === "runCapabilityTrial") return state;
  if (operation.type === "confirmSchedulePrompt") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    if (!presence) throw new Error("That schedule Presence is no longer available.");
    // The caller persists the returned state once. Building each Assignment
    // on this cloned state keeps confirmation all-or-nothing if compilation
    // or preflight rejects any draft.
    let activatedCount = 0;
    let draftCount = 0;
    for (const draft of operation.drafts) {
      const beforeIds = new Set(state.assignments.map((assignment) => assignment.id));
      state = applyOperation(state, {
        type: "createAssignment",
        instruction: draft.instruction,
        presenceId: operation.presenceId,
        environment: draft.environment ?? (presence.connectionMode === "sandbox" ? "sandbox" : "live"),
        objective: draft.objective,
        delegationPolicy: draft.delegationPolicy,
        schedule: draft.schedule,
      });
      const created = state.assignments.find((assignment) => !beforeIds.has(assignment.id) && assignment.presenceId === operation.presenceId);
      if (created && draft.plan) {
        state = applyOperation(state, { type: "updateAssignmentPlan", assignmentId: created.id, plan: draft.plan });
      }
      if (created && ["ready", "ready_with_assumptions"].includes(created.preflight?.status ?? "")) {
        state = applyOperation(state, { type: "activateAssignment", id: created.id, delegationPolicy: draft.delegationPolicy });
        activatedCount += 1;
      } else if (created) {
        draftCount += 1;
      }
    }
    const activationDetail = activatedCount
      ? `${activatedCount} ready Assignment${activatedCount === 1 ? " was" : "s were"} activated${draftCount ? `; ${draftCount} remain draft until their missing input is resolved` : ""}.`
      : `${draftCount} Assignment${draftCount === 1 ? " remains" : "s remain"} draft until missing input is resolved.`;
    state.events.unshift(event("system", "Schedule created from prompt", `${operation.drafts.length} independent Assignments were reviewed together and saved atomically. ${activationDetail}`, "positive", { presenceId: operation.presenceId }));
    return state;
  }
  if (operation.type === "createAssignment") {
    const assignment = compileAssignmentInstruction(state, operation.instruction, operation.presenceId, operation.environment ?? "sandbox", operation.sessionId, operation.schedule, operation.delegationPolicy, operation.objective);
    if (operation.assetConstraint?.collectionId && !state.assetCollections?.some((collection) => collection.id === operation.assetConstraint?.collectionId && collection.agentId === state.agent?.id && collection.status === "active")) throw new Error("That Asset Collection does not belong to the active Agent.");
    assignment.assetConstraint = operation.assetConstraint;
    assignment.createdBy = "operator";
    const signature = assignmentCreationSignature(assignment);
    const duplicate = state.assignments.find((existing) => assignmentCanBlockDuplicateCreation(existing) && assignmentCreationSignature(existing) === signature);
    if (duplicate) return state;
    assignment.revision = 0;
    state.assignments.unshift(assignment);
    ensureCapabilityRequests(state, assignment.presenceId);
    state.events.unshift(event("system", "Assignment reviewed", `${assignment.preflight?.status === "ready" || assignment.preflight?.status === "ready_with_assumptions" ? "Ready to activate" : "Needs input before activation"} · ${assignment.progress.required} ${assignment.deliverable.type === "original_publication" ? "original publications" : assignment.deliverable.type} · ${assignment.recurrence?.label ?? "Once"}.`, assignment.preflight?.status === "blocked" || assignment.preflight?.status === "needs_input" ? "warning" : "positive", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
    return state;
  }
  if (operation.type === "updateAssignment") {
    const assignment = state.assignments.find((item) => item.id === operation.id);
    if (!assignment || ["completed", "completed_with_adaptation", "cancelled"].includes(assignment.status)) return state;
    const activeRun = (state.assignmentRuns ?? []).some((run) => run.assignmentId === assignment.id && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status));
    if (activeRun || ["working", "awaiting_execution"].includes(assignment.status)) return state;
    const compiled = compileAssignmentInstruction(state, operation.instruction, assignment.presenceId, assignment.environment, assignment.sessionId, operation.schedule === undefined ? assignment.schedule : operation.schedule ?? undefined, assignment.executionPolicy.delegationPolicy ?? "keep_moving", operation.objective ?? assignment.objective);
    const timestamp = now();
    const previousInstruction = assignment.instruction;
    assignment.instruction = compiled.instruction;
    assignment.title = compiled.title;
    assignment.activation = compiled.activation;
    assignment.deliverable = compiled.deliverable;
    assignment.progress = { ...assignment.progress, required: compiled.progress.required };
    assignment.quantityPolicy = compiled.quantityPolicy;
    assignment.recurrence = compiled.recurrence;
    assignment.schedule = compiled.schedule;
    assignment.timeframe = compiled.timeframe;
    assignment.editorialContext = compiled.editorialContext;
    assignment.audienceObjective = compiled.audienceObjective;
    assignment.objective = compiled.objective;
    assignment.successEvidence = compiled.successEvidence;
    assignment.seed = compiled.seed;
    if (operation.assetConstraint !== undefined) {
      if (operation.assetConstraint.collectionId && !state.assetCollections?.some((collection) => collection.id === operation.assetConstraint?.collectionId && collection.agentId === state.agent?.id && collection.status === "active")) throw new Error("That Asset Collection does not belong to the active Agent.");
      assignment.assetConstraint = operation.assetConstraint;
    }
    assignment.preflight = preflightAssignment(state, assignment, assignment.executionPolicy.delegationPolicy);
    assignment.revision = (assignment.revision ?? 0) + 1;
    assignment.updatedAt = timestamp;
    state.events.unshift(event("system", "Assignment updated", `The operator revised this Assignment${previousInstruction.trim() === assignment.instruction.trim() ? "." : "; its readiness review has been refreshed."}`, "positive", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
    return state;
  }
  if (operation.type === "startAssignmentPursuit") {
    const assignment = state.assignments.find((item) => item.id === operation.assignmentId);
    const presence = assignment ? state.presences.find((item) => item.id === assignment.presenceId) : undefined;
    if (!assignment || !presence || assignment.presenceId !== (operation.presenceId ?? assignment.presenceId)) return state;
    if (assignment.environment !== "live" || assignment.deliverable.type !== "meaningful_engagement") throw new Error("An increased-effort window is currently available for live adaptive distribution Assignments.");
    const startsAt = operation.startsAt ?? now();
    const deadlineAt = new Date(operation.deadlineAt);
    if (Number.isNaN(deadlineAt.getTime()) || deadlineAt.getTime() <= new Date(startsAt).getTime()) throw new Error("The increased-effort window needs a future deadline.");
    const maxVerifiedActions = Math.max(1, Math.min(100, Math.floor(operation.maxVerifiedActions)));
    const existing = (state.assignmentPursuitWindows ?? []).find((window) => window.assignmentId === assignment.id && window.status === "active");
    if (existing) {
      existing.deadlineAt = operation.deadlineAt;
      existing.maxVerifiedActions = Math.max(existing.maxVerifiedActions, maxVerifiedActions);
      existing.actionCaps = operation.actionCaps ?? existing.actionCaps;
      existing.maxActionsPerHour = operation.maxActionsPerHour ?? existing.maxActionsPerHour;
      existing.maxActionsPerPerson = operation.maxActionsPerPerson ?? existing.maxActionsPerPerson;
      existing.maxActionsPerConversation = operation.maxActionsPerConversation ?? existing.maxActionsPerConversation;
      existing.resourceBudget = operation.resourceBudget ?? existing.resourceBudget;
      existing.nextRunAt = now();
      existing.updatedAt = now();
      state.events.unshift(event("decision", "Distribution effort increased", `${presence.name} will look more often until ${deadlineAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, with capacity for up to ${existing.maxVerifiedActions} qualified verified actions. The quality bar and action judgment are unchanged.`, "positive", { presenceId: presence.id, sourceObjectId: assignment.id }));
      return state;
    }
    const timestamp = now();
    const window: AssignmentPursuitWindow = {
      id: id("assignment-pursuit"),
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: presence.id,
      startsAt,
      deadlineAt: operation.deadlineAt,
      maxVerifiedActions,
      actionCaps: operation.actionCaps,
      maxActionsPerHour: operation.maxActionsPerHour,
      maxActionsPerPerson: operation.maxActionsPerPerson,
      maxActionsPerConversation: operation.maxActionsPerConversation,
      resourceBudget: operation.resourceBudget,
      status: "active",
      nextRunAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.assignmentPursuitWindows = [window, ...(state.assignmentPursuitWindows ?? [])];
    if (["draft", "paused", "blocked", "needs_operator"].includes(assignment.status)) assignment.status = "active";
    assignment.updatedAt = timestamp;
    state.events.unshift(event("decision", "Distribution push started", `${presence.name} will pursue the existing distribution responsibility more intensely until ${deadlineAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, with capacity for up to ${maxVerifiedActions} qualified verified actions. This is a ceiling, not a quota.`, "positive", { presenceId: presence.id, sourceObjectId: assignment.id }));
    return state;
  }
  if (operation.type === "scaleAssignmentPursuit") {
    const window = (state.assignmentPursuitWindows ?? []).find((item) => item.id === operation.id);
    if (!window || pursuitTerminalStatuses.has(window.status)) return state;
    const assignment = state.assignments.find((item) => item.id === window.assignmentId);
    const presence = state.presences.find((item) => item.id === window.presenceId);
    if (!assignment || !presence) return state;
    const counts = assignmentPursuitVerifiedCounts(state, window);
    const pending = state.executions.filter((item) => item.assignmentId === window.assignmentId && item.presenceId === window.presenceId && !["failed", "blocked", "cancelled", "expired", "verification-closed"].includes(item.status)).length;
    const requestedCapacity = Math.max(1, Math.min(100, Math.floor(operation.maxVerifiedActions)));
    const timestamp = now();
    const usage = assignmentPursuitUsage(state, window);
    window.maxVerifiedActions = Math.max(requestedCapacity, counts.verified + pending);
    window.maxActionsPerHour = operation.maxActionsPerHour ?? window.maxActionsPerHour;
    if (operation.resourceBudget) {
      window.resourceBudget = {
        maxChannelReads: Math.max(operation.resourceBudget.maxChannelReads ?? 0, usage.channelReads + 1) || undefined,
        maxHydrations: Math.max(operation.resourceBudget.maxHydrations ?? 0, usage.hydrations + 1) || undefined,
        maxModelCalls: Math.max(operation.resourceBudget.maxModelCalls ?? 0, usage.modelCalls + 1) || undefined,
        maxVisionCalls: Math.max(operation.resourceBudget.maxVisionCalls ?? 0, usage.visionCalls + 1) || undefined,
        maxEstimatedCostCents: operation.resourceBudget.maxEstimatedCostCents,
      };
    }
    // A capacity pause is recoverable when the operator raises the exhausted
    // envelope. Resume only that automatic pause; an intentional operator
    // pause must still require an explicit Resume action.
    if (window.status === "paused" && window.pauseReason?.includes("budget reached")
      && ["maxChannelReads", "maxHydrations", "maxModelCalls", "maxVisionCalls", "maxEstimatedCostCents"]
        .every((category) => assignmentPursuitCanSpend(state, window, category as keyof AssignmentPursuitResourceBudget, new Date(timestamp).getTime()))) {
      window.status = "active";
      window.pauseReason = undefined;
      window.nextRunAt = timestamp;
    }
    window.nextRunAt = window.status === "active" ? timestamp : window.nextRunAt;
    window.updatedAt = timestamp;
    state.events.unshift(event("decision", "Distribution push scaled", `${presence.name} now has ${window.maxVerifiedActions} spaces for qualified verified outcomes. The ${window.status} push keeps the same quality bar and will not force activity.`, "positive", { presenceId: presence.id, sourceObjectId: assignment.id }));
    return state;
  }
  if (operation.type === "pauseAssignmentPursuit" || operation.type === "resumeAssignmentPursuit" || operation.type === "cancelAssignmentPursuit") {
    const window = (state.assignmentPursuitWindows ?? []).find((item) => item.id === operation.id);
    if (!window || pursuitTerminalStatuses.has(window.status)) return state;
    const timestamp = now();
    if (operation.type === "pauseAssignmentPursuit") {
      window.status = "paused";
      window.pauseReason = "Paused by the operator.";
      window.nextRunAt = undefined;
    } else if (operation.type === "resumeAssignmentPursuit") {
      window.status = "active";
      window.pauseReason = undefined;
      window.nextRunAt = timestamp;
    } else {
      window.status = "cancelled";
      window.pauseReason = "Stopped by the operator.";
      window.nextRunAt = undefined;
    }
    window.updatedAt = timestamp;
    const assignment = state.assignments.find((item) => item.id === window.assignmentId);
    const presence = state.presences.find((item) => item.id === window.presenceId);
    if (assignment && operation.type === "cancelAssignmentPursuit" && !["completed", "cancelled", "failed", "expired_incomplete"].includes(assignment.status)) assignment.status = "active";
    state.events.unshift(event("system", operation.type === "pauseAssignmentPursuit" ? "Distribution push paused" : operation.type === "resumeAssignmentPursuit" ? "Distribution push resumed" : "Distribution push stopped", `${presence?.name ?? "The Presence"}'s temporary increased-effort window is ${window.status}. The underlying Assignment remains a separate responsibility.`, operation.type === "cancelAssignmentPursuit" ? "quiet" : "positive", { presenceId: window.presenceId, sourceObjectId: assignment?.id }));
    return state;
  }
  if (operation.type === "pauseAssignment") {
    const assignment = state.assignments.find((item) => item.id === operation.id);
    if (!assignment || ["completed", "completed_with_adaptation", "cancelled", "paused"].includes(assignment.status)) return state;
    const timestamp = now();
    assignment.status = "paused";
    assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), blockedReason: "Paused by the operator." };
    assignment.updatedAt = timestamp;
    if (assignment.origin === "publishing_initiative") {
      state.publishingPlans = state.publishingPlans.map((plan) => plan.presenceId === assignment.presenceId && plan.status === "active" ? { ...plan, status: "paused" as const, updatedAt: timestamp } : plan);
    }
    state.events.unshift(event("system", "Assignment paused", `${assignment.title ?? assignment.instruction} is paused. No new work will be started until you resume it.`, "quiet", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
    return state;
  }
  if (operation.type === "resumeAssignment") {
    const assignment = state.assignments.find((item) => item.id === operation.id);
    if (!assignment || assignment.status !== "paused") return state;
    const timestamp = now();
    assignment.status = "active";
    assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), blockedReason: undefined };
    assignment.updatedAt = timestamp;
    if (assignment.origin === "publishing_initiative") {
      state.publishingPlans = state.publishingPlans.map((plan) => plan.presenceId === assignment.presenceId && plan.status === "paused" ? { ...plan, status: "active" as const, updatedAt: timestamp } : plan);
    }
    const presenceName = state.presences.find((presence) => presence.id === assignment.presenceId)?.name ?? "The Agent";
    state.events.unshift(event("system", "Assignment resumed", `${assignment.title ?? assignment.instruction} is active again. ${presenceName} will choose the next worthwhile step within its authority.`, "positive", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
    return state;
  }
  if (operation.type === "activateAssignment") {
    const assignment = state.assignments.find((item) => item.id === operation.id);
    if (!assignment || ["completed", "cancelled"].includes(assignment.status)) return state;
    assignment.preflight = preflightAssignment(state, assignment, operation.delegationPolicy ?? assignment.executionPolicy.delegationPolicy);
    if (!["ready", "ready_with_assumptions"].includes(assignment.preflight.status)) {
      state.events.unshift(event("decision", "Assignment needs input", assignment.preflight.issues.join(" ") || "The completion contract is not ready to activate.", "warning", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
      return state;
    }
    assignment.executionPolicy.delegationPolicy = operation.delegationPolicy ?? assignment.executionPolicy.delegationPolicy ?? "keep_moving";
    assignment.status = assignment.status === "blocked" ? "active" : "active";
    assignment.revision = (assignment.revision ?? 0) + 1;
    assignment.updatedAt = now();
    ensureCapabilityRequests(state, assignment.presenceId);
    state.events.unshift(event("decision", "Assignment activated", `${assignment.preflight.semanticSummary} The Agent owns the method within the active delegation policy.`, "positive", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
    return state;
  }
  if (operation.type === "startAssignment") {
    const assignment = state.assignments.find((item) => item.id === operation.id);
    if (!assignment || assignment.status === "completed" || assignment.status === "cancelled") return state;
    assignment.preflight = preflightAssignment(state, assignment, assignment.executionPolicy.delegationPolicy);
    if (!["ready", "ready_with_assumptions"].includes(assignment.preflight.status)) {
      state.events.unshift(event("decision", "Assignment needs input", assignment.preflight.issues.join(" ") || "The completion contract is not ready to activate.", "warning", { presenceId: assignment.presenceId, sessionId: operation.sessionId }));
      return state;
    }
    const retryingBlockedAssignment = assignment.status === "blocked";
    assignment.status = "active";
    assignment.sessionId = operation.sessionId;
    assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "candidate_review", attempts: retryingBlockedAssignment ? 0 : assignment.work?.attempts ?? 0, storiesResearched: retryingBlockedAssignment ? 0 : assignment.work?.storiesResearched ?? 0, blockedReason: undefined };
    assignment.updatedAt = now();
    state.events.unshift(event("decision", "Assignment started", `${assignment.progress.required} verified ${assignment.deliverable.type === "original_publication" ? "publications" : assignment.deliverable.type} expected. The Agent owns how to fulfill the Assignment; verified Sandbox output owns progress.`, "positive", { presenceId: assignment.presenceId, sessionId: operation.sessionId }));
    return state;
  }
  if (operation.type === "setRelationshipPolicy") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    const person = state.people.find((item) => item.id === operation.personId);
    if (!state.agent || !presence || !person || person.agentId !== state.agent.id) return state;
    const timestamp = now();
    const existing = state.relationshipPolicies.find((item) => item.presenceId === presence.id && item.personId === person.id);
    const policy: RelationshipPolicy = { id: existing?.id ?? id("relationship-policy"), agentId: state.agent.id, presenceId: presence.id, personId: person.id, learning: operation.learning, engagement: operation.engagement, rhythm: operation.rhythm, sourceDescription: operation.sourceDescription?.trim() || existing?.sourceDescription, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    state.relationshipPolicies = [policy, ...state.relationshipPolicies.filter((item) => item.id !== policy.id)];
    state.events.unshift(event("system", "Relationship policy updated", `${person.displayName} is now configured for ${operation.engagement.replaceAll("_", " ")}. Learning is ${operation.learning}.`, "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "setPresenceRequestPolicy") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    if (!presence) return state;
    const timestamp = now();
    const policy: PresenceRequestPolicy = { presenceId: presence.id, ...operation.policy, allowedRequestTypes: [...new Set(operation.policy.allowedRequestTypes)], updatedAt: timestamp };
    presence.requestPolicy = policy;
    state.presenceRequestPolicies = [policy, ...state.presenceRequestPolicies.filter((item) => item.presenceId !== presence.id)];
    state.events.unshift(event("system", "Request policy updated", policy.access === "nobody" ? `${presence.name} will not accept public requests unless you explicitly enable them.` : `${presence.name} may now consider ${policy.access === "anyone" ? "direct public" : "allowlisted"} requests.`, policy.access === "nobody" ? "quiet" : "warning", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "createDelegationGrant") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    if (!state.agent || !presence || (!operation.personId && !operation.externalActorId)) return state;
    const timestamp = now();
    const grant: DelegationGrant = { id: id("delegation-grant"), agentId: state.agent.id, presenceId: presence.id, personId: operation.personId, externalActorId: operation.externalActorId?.trim() || undefined, channel: operation.channel ?? presence.channel, allowedRequestTypes: [...new Set(operation.allowedRequestTypes)], enabled: true, acceptance: operation.acceptance ?? "operator_review", impactLimit: operation.impactLimit ?? "low", createdBy: "operator", createdAt: timestamp, updatedAt: timestamp };
    state.delegationGrants.unshift(grant);
    state.events.unshift(event("system", "Trusted requester added", "This person or account may submit the explicitly allowed request types for consideration. Watching and request access remain separate.", "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "revokeDelegationGrant") {
    const grant = state.delegationGrants.find((item) => item.id === operation.id);
    if (!grant) return state;
    grant.enabled = false;
    grant.revokedAt = now();
    grant.updatedAt = grant.revokedAt;
    state.events.unshift(event("system", "Trusted requester removed", "Future public requests from this grant will no longer be eligible for consideration.", "quiet", { presenceId: grant.presenceId }));
    return state;
  }
  if (operation.type === "decidePublicRequest") {
    const request = state.publicRequests.find((item) => item.id === operation.id);
    const presence = request ? state.presences.find((item) => item.id === request.presenceId) : undefined;
    const mirror = request ? state.mirrorObjects.find((item) => item.id === request.sourceMirrorObjectId) : undefined;
    if (!request || !presence || !mirror) return state;
    if (operation.disposition !== "accepted") {
      request.disposition = operation.disposition;
      request.updatedAt = now();
      request.decisionReason = operation.disposition === "needs_clarification" ? "The request needs a narrower question before Genny can accept responsibility." : "The request was considered and did not become an Assignment.";
      return state;
    }
    if (request.eligibility !== "eligible" || request.assignmentId) return state;
    const assignment = compileAssignmentInstruction(state, `Answer the public request from ${mirror.author?.displayName ?? "the requester"}: ${request.text}`, presence.id, presence.environment ?? "live", undefined, undefined, "keep_moving");
    assignment.origin = "public_request";
    assignment.createdBy = "agent";
    assignment.target = { mirrorObjectId: mirror.id, relationshipId: request.requesterPersonId };
    assignment.deliverable = { type: "reply", quantity: 1, quantityMode: "exact" };
    assignment.quantityPolicy = { quantity: 1, mode: "exact", period: "assignment" };
    assignment.activation = { type: "attention_source", sourceIds: [request.id], startsAt: now() };
    assignment.preflight = preflightAssignment(state, assignment, "keep_moving");
    assignment.status = ["ready", "ready_with_assumptions"].includes(assignment.preflight.status) ? "active" : "needs_operator";
    state.assignments.unshift(assignment);
    request.disposition = "accepted";
    request.assignmentId = assignment.id;
    request.updatedAt = now();
    state.events.unshift(event("decision", "Public request accepted", `${presence.name} accepted responsibility for the request. Public execution still follows the Presence's existing execution settings.`, "positive", { presenceId: presence.id, sourceObjectId: mirror.id }));
    return state;
  }
  if (operation.type === "createWatch") {
    const query = operation.query.trim();
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!state.agent || !presence || !query) return state;
    const watch = compileWatch(state.agent.id, presence.id, presence.channel, query, operation.purpose);
    const requestedHandle = watch.target?.handle ? normalizeHandleForComparison(watch.target.handle) : undefined;
    const knownIdentity = requestedHandle ? state.personIdentities.find((identity) => identity.channel === presence.channel && identity.sourcePresenceId === presence.id && normalizeHandleForComparison(identity.handle) === requestedHandle) : undefined;
    if (knownIdentity) watch.target = { ...(watch.target ?? { channel: presence.channel, identityStatus: "unresolved" }), channel: presence.channel, personId: knownIdentity.personId, externalActorId: knownIdentity.externalActorId, handle: knownIdentity.handle ?? requestedHandle, identityStatus: "verified" };
    if (knownIdentity?.contactability?.status === "blocked_by_person") {
      state.events.unshift(event("system", "Watch not added", `A verified relationship boundary prevents targeted monitoring of ${knownIdentity.displayName ?? knownIdentity.handle ?? "this person"}.`, "quiet", { presenceId: presence.id }));
      return state;
    }
    if (state.watches.some((item) => item.presenceId === watch.presenceId && item.query.toLowerCase() === watch.query.toLowerCase())) return state;
    state.watches.unshift(watch);
    state.events.unshift(event("system", "Watch added", `${watch.title} is now part of ${presence.name}'s attention. Observation is ${watch.observation.status === "manual" ? "waiting for a source" : "available automatically"}.`, "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "updateWatch") {
    const watch = state.watches.find((item) => item.id === operation.id && item.agentId === state.agent?.id);
    const presence = watch ? state.presences.find((item) => item.id === watch.presenceId) ?? state.presence : undefined;
    const query = operation.query.trim();
    if (!watch || !presence || !query) return state;
    const compiled = compileWatch(state.agent!.id, presence.id, presence.channel, query, operation.purpose);
    const requestedHandle = compiled.target?.handle ? normalizeHandleForComparison(compiled.target.handle) : undefined;
    const knownIdentity = requestedHandle ? state.personIdentities.find((identity) => identity.channel === presence.channel && identity.sourcePresenceId === presence.id && normalizeHandleForComparison(identity.handle) === requestedHandle) : undefined;
    if (knownIdentity && compiled.target) compiled.target = { ...compiled.target, personId: knownIdentity.personId, externalActorId: knownIdentity.externalActorId, handle: knownIdentity.handle ?? requestedHandle, identityStatus: "verified" };
    if (knownIdentity?.contactability?.status === "blocked_by_person") {
      state.events.unshift(event("system", "Watch not updated", `A verified relationship boundary prevents targeted monitoring of ${knownIdentity.displayName ?? knownIdentity.handle ?? "this person"}.`, "quiet", { presenceId: presence.id }));
      return state;
    }
    const targetChanged = watch.kind !== compiled.kind || watch.query.toLowerCase() !== compiled.query.toLowerCase() || watch.target?.externalActorId !== compiled.target?.externalActorId || normalizeHandleForComparison(watch.target?.handle) !== normalizeHandleForComparison(compiled.target?.handle);
    const updated: Watch = { ...watch, title: compiled.title, kind: compiled.kind, query: compiled.query, purpose: compiled.purpose, target: compiled.target, state: watch.state ?? "active", sources: compiled.sources, updatedAt: now() };
    if (targetChanged) {
      updated.observation = { ...compiled.observation };
      updated.lastObservedAt = undefined;
      updated.nextObservationAt = undefined;
    }
    state.watches = state.watches.map((item) => item.id === watch.id ? updated : item);
    if (updated.target?.personId && state.agent) {
      const configured = relationshipPolicyFromWatchPurpose(updated.purpose);
      const existing = state.relationshipPolicies.find((item) => item.presenceId === updated.presenceId && item.personId === updated.target?.personId);
      if (configured) {
        const timestamp = now();
        const policy: RelationshipPolicy = { id: existing?.id ?? id("relationship-policy"), agentId: state.agent.id, presenceId: updated.presenceId, personId: updated.target.personId, ...configured, sourceDescription: updated.purpose, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
        state.relationshipPolicies = [policy, ...state.relationshipPolicies.filter((item) => item.id !== policy.id)];
      }
    }
    state.events.unshift(event("system", "Watch updated", `${updated.title} remains part of ${presence.name}'s attention with its revised instructions. Existing observations remain in history; new observations use the updated Watch.`, "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "setWatchState") {
    const watch = state.watches.find((item) => item.id === operation.id && item.agentId === state.agent?.id);
    if (!watch || (watch.state ?? "active") === operation.state) return state;
    const presence = state.presences.find((item) => item.id === watch.presenceId) ?? state.presence;
    if (!presence) return state;
    if (operation.state === "active" && watch.target?.externalActorId && targetIsBlockedByPerson(state, watch.presenceId, { type: "x.user", id: watch.target.externalActorId })) {
      state.events.unshift(event("system", "Watch remains paused", "A verified relationship boundary prevents this Watch from being resumed.", "quiet", { presenceId: watch.presenceId }));
      return state;
    }
    const timestamp = now();
    watch.state = operation.state;
    watch.updatedAt = timestamp;
    if (operation.state === "paused") {
      const watchIntentIds = new Set(state.socialIntents.filter((intent) => intent.presenceId === watch.presenceId && intent.origin?.kind === "watchlist" && intent.origin.refId === watch.id && intent.state === "active").map((intent) => intent.id));
      for (const intent of state.socialIntents) {
        if (watchIntentIds.has(intent.id)) {
          intent.state = "withdrawn";
          intent.updatedAt = timestamp;
        }
      }
      for (const execution of state.executions) {
        if (!watchIntentIds.has(execution.socialIntentId) || !["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"].includes(execution.status)) continue;
        execution.status = "cancelled";
        execution.failure = { code: "WATCH_PAUSED", message: "The Watch was paused before this action reached a connector. No external action was attempted.", retryable: false };
        execution.reviewReason = "The operator paused the source Watch before delivery.";
        execution.updatedAt = timestamp;
        const action = state.actions.find((item) => item.executionId === execution.id);
        if (action) {
          action.status = "skipped";
          action.reason = "The source Watch was paused before delivery; no external action was attempted.";
        }
      }
      state.watchSignals = state.watchSignals.map((signal) => signal.watchId === watch.id && signal.disposition === "social_opportunity"
        ? { ...signal, disposition: "pending" as const, decisionId: undefined, updatedAt: timestamp }
        : signal);
    }
    const statusLabel = operation.state === "paused" ? "Watch paused" : "Watch resumed";
    const detail = operation.state === "paused"
      ? watch.title + " is paused. It will not be observed, considered, or delivered until you resume it."
      : watch.title + " is active again and may be considered during a future attention pass.";
    state.events.unshift(event("system", statusLabel, detail, operation.state === "paused" ? "quiet" : "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "deleteWatch") {
    const watch = state.watches.find((item) => item.id === operation.id);
    if (!watch) return state;
    state.watches = state.watches.filter((item) => item.id !== watch.id);
    state.events.unshift(event("system", "Watch removed", `${watch.title} is no longer part of the Presence's attention.`, "quiet", { presenceId: watch.presenceId }));
    return state;
  }
  if (operation.type === "createExploration") {
    const exploration = compileExploration(state, operation.brief, operation.presenceId);
    if (!exploration || state.explorations.some((item) => item.presenceId === exploration.presenceId && item.brief.toLowerCase() === exploration.brief.toLowerCase() && item.status !== "archived")) return state;
    state.explorations.unshift(exploration);
    state.events.unshift(event("system", "Exploration added", `${exploration.title} is now part of ${state.presences.find((item) => item.id === exploration.presenceId)?.name ?? "the Presence"}'s attention. It grants permission to look, not to speak.`, "positive", { presenceId: exploration.presenceId }));
    return state;
  }
  if (operation.type === "updateExploration") {
    const exploration = state.explorations.find((item) => item.id === operation.id && item.agentId === state.agent?.id);
    if (!exploration || !operation.brief.trim() || exploration.status === "archived") return state;
    exploration.brief = operation.brief.trim();
    exploration.title = explorationTitle(exploration.brief);
    exploration.interpretation = explorationInterpretation(exploration.brief);
    exploration.revision += 1;
    exploration.updatedAt = now();
    state.discoveryPlans = state.discoveryPlans.filter((plan) => plan.explorationId !== exploration.id);
    state.events.unshift(event("system", "Exploration refined", `${exploration.title} has a new operator brief. Its search strategy will be rebuilt without changing the Presence's identity or execution permissions.`, "positive", { presenceId: exploration.presenceId }));
    return state;
  }
  if (operation.type === "setExplorationStatus") {
    const exploration = state.explorations.find((item) => item.id === operation.id && item.agentId === state.agent?.id);
    if (!exploration) return state;
    exploration.status = operation.status;
    exploration.updatedAt = now();
    state.events.unshift(event("system", `Exploration ${operation.status}`, operation.status === "paused" ? "This Presence will keep the Exploration's meaning but will not spend attention on it until resumed." : operation.status === "archived" ? "The Exploration is retained as history and will not run again." : "This Presence may consider the Exploration during a future attention cycle.", operation.status === "archived" ? "quiet" : "positive", { presenceId: exploration.presenceId }));
    return state;
  }
  if (operation.type === "setExplorationEngagement") {
    const exploration = state.explorations.find((item) => item.id === operation.id && item.agentId === state.agent?.id);
    const presence = exploration ? state.presences.find((item) => item.id === exploration.presenceId) : undefined;
    if (!exploration || !presence) return state;
    const priorAssignmentId = exploration.engagement?.assignmentId;
    const priorAssignment = priorAssignmentId ? state.assignments.find((item) => item.id === priorAssignmentId) : undefined;
    if (operation.mode === "surface") {
      if (priorAssignment) priorAssignment.status = "paused";
      exploration.engagement = { mode: "surface" };
    } else {
      const instruction = operation.objective?.trim() || (operation.mode === "objective" ? `When ${exploration.title} finds a genuinely strong match, start a useful conversation.` : `Engage when ${exploration.title} finds something genuinely worth responding to.`);
      const assignment = priorAssignment ?? compileAssignmentInstruction(state, instruction, presence.id, presence.environment ?? "sandbox");
      const parsedObjectiveQuantity = assignmentQuantity(instruction);
      assignment.title = operation.mode === "objective" ? "Exploration engagement objective" : "Exploration opportunistic engagement";
      assignment.origin = "exploration";
      assignment.activation = { type: "attention_source", sourceIds: [exploration.id] };
      assignment.instruction = instruction;
      assignment.deliverable = { type: "meaningful_engagement", quantity: parsedObjectiveQuantity.quantity, quantityMode: parsedObjectiveQuantity.quantityMode };
      const explicitObjectiveQuantity = Boolean(operation.objective?.match(/\b(?:up\s+to|at\s+most|at\s+least|exactly|aim\s+for|maximum|max(?:imum)?|\d+\s+(?:meaningful\s+)?engagements?)\b/i));
      assignment.quantityPolicy = operation.mode === "opportunistic" || !explicitObjectiveQuantity
        ? { quantity: "agent_planned", mode: "target", period: "assignment" }
        : { quantity: parsedObjectiveQuantity.quantity, mode: parsedObjectiveQuantity.quantityMode, period: "day" };
      assignment.progress = { ...assignment.progress, required: typeof assignment.quantityPolicy.quantity === "number" ? assignment.quantityPolicy.quantity : assignment.progress.required };
      assignment.status = "active";
      assignment.sessionId = undefined;
      assignment.updatedAt = now();
      if (!priorAssignment) state.assignments.unshift(assignment);
      exploration.engagement = { mode: operation.mode, assignmentId: assignment.id };
    }
    exploration.updatedAt = now();
    state.events.unshift(event("system", "Exploration responsibility updated", operation.mode === "surface" ? "Findings will be surfaced without autonomous public action." : "Qualifying findings now flow through the canonical Assignment, Social Planner, and Presence execution envelope.", "positive", { presenceId: exploration.presenceId }));
    return state;
  }
  if (operation.type === "updatePeopleNote") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    const person = state.people.find((item) => item.id === operation.personId);
    if (!state.agent || !presence || !person || person.agentId !== state.agent.id) return state;
    const timestamp = now();
    const noteId = `people-note:${state.agent.id}:${presence.id}:${person.id}`;
    const existing = (state.peopleNotes ?? []).find((item) => item.id === noteId);
    const note = {
      id: noteId,
      agentId: state.agent.id,
      presenceId: presence.id,
      personId: person.id,
      markdown: operation.markdown.trim(),
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      provenance: { source: operation.source ?? "operator", reason: operation.reason?.trim() || "People Note updated", operationId: operation.operationId, updatedAt: timestamp },
    } as import("./types").PeopleNote;
    state.peopleNotes = [note, ...(state.peopleNotes ?? []).filter((item) => item.id !== note.id)];
    state.events.unshift(event("memory", "People Note updated", `${person.displayName}'s Presence note was saved as Markdown.`, "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "setPresenceDMInstructions") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    if (!state.agent || !presence) return state;
    const timestamp = now();
    const instructions = operation.instructions.trim().slice(0, 8_000);
    const dmInstructions = instructions ? { when: "private_message_arrives" as const, condition: operation.condition?.trim().slice(0, 1_000) || undefined, instructions, revision: (presence.dmInstructions?.revision ?? 0) + 1, updatedAt: timestamp, provenance: { source: operation.source ?? "operator", reason: operation.reason?.trim() || "Private-message guidance updated", operationId: operation.operationId, updatedAt: timestamp } } : undefined;
    const nextPresence = { ...presence, dmInstructions };
    state.presences = state.presences.map((item) => item.id === presence.id ? nextPresence : item);
    if (state.presence?.id === presence.id) state.presence = nextPresence;
    return state;
  }
  if (operation.type === "rememberPerson") {
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!state.agent || !presence || !operation.externalActorId.trim() || !operation.displayName.trim()) return state;
    const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId: presence.id, channel: operation.channel ?? presence.channel, externalActorId: operation.externalActorId.trim(), displayName: operation.displayName, handle: operation.handle, profileUrl: operation.profileUrl, personId: operation.personId, sourceEnvironment: presence.environment ?? "live", source: operation.source ?? "operator" }, state.people, state.personIdentities, state.relationships);
    state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
    state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId && item.sourcePresenceId === remembered.identity.sourcePresenceId && (item.sourceEnvironment ?? "live") === (remembered.identity.sourceEnvironment ?? "live")))];
    state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
    state.events.unshift(event("memory", "Person remembered", `${remembered.person.displayName} is now part of this Agent's selective People memory. Remembering does not invent prior interaction history.`, "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "forgetRelationship") {
    const relationship = state.relationships.find((item) => item.id === operation.relationshipId);
    if (!relationship) return state;
    const timestamp = now();
    relationship.state = "forgotten";
    relationship.forgottenAt = timestamp;
    relationship.updatedAt = timestamp;
    const person = state.people.find((item) => item.id === relationship.personId);
    if (person) { person.memoryState = "forgotten"; person.forgottenAt = timestamp; person.updatedAt = timestamp; }
    state.events.unshift(event("memory", "Relationship forgotten", "Curated relationship memory is suppressed. Social Mirror history remains available as historical channel evidence.", "quiet", { presenceId: state.presence?.id }));
    return state;
  }
  if (operation.type === "restoreRelationship") {
    const relationship = state.relationships.find((item) => item.id === operation.relationshipId);
    if (!relationship) return state;
    relationship.state = "active";
    relationship.forgottenAt = undefined;
    relationship.updatedAt = now();
    const person = state.people.find((item) => item.id === relationship.personId);
    if (person) { person.memoryState = "active"; person.forgottenAt = undefined; person.updatedAt = now(); }
    state.events.unshift(event("memory", "Relationship restored", "The operator explicitly restored curated relationship memory; historical facts remain provenance-backed.", "positive", { presenceId: state.presence?.id }));
    return state;
  }
  if (operation.type === "correctRelationshipFact") {
    const relationship = state.relationships.find((item) => item.id === operation.relationshipId);
    const presence = state.presence;
    if (!relationship || !state.agent || !presence || !operation.statement.trim()) return state;
    const nextFact = factForCorrection(relationship.id, operation.statement, operation.visibility ?? `presence:${presence.id}` as RelationshipVisibility, presence.id);
    if (operation.factId) {
      const previous = state.relationshipFacts.find((fact) => fact.id === operation.factId);
      if (previous) nextFact.supersedesFactId = previous.id;
    }
    state.relationshipFacts.unshift(nextFact);
    relationship.updatedAt = now();
    state.events.unshift(event("memory", "Relationship memory corrected", "The correction supersedes the curated interpretation without rewriting the original social evidence.", "positive", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "createIntroductionRecord") {
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!state.agent || !presence || (!operation.candidatePersonId && !operation.candidateActorId)) return state;
    const timestamp = now();
    const record = {
      id: id("introduction"),
      agentId: state.agent.id,
      presenceId: presence.id,
      requesterPersonId: operation.requesterPersonId,
      requesterActorId: operation.requesterActorId,
      candidatePersonId: operation.candidatePersonId,
      candidateActorId: operation.candidateActorId,
      requesterConsent: "asked" as const,
      candidateConsent: "unknown" as const,
      sourceIntentIds: [...(operation.sourceIntentIds ?? [])],
      executionIds: [],
      state: "offered" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.introductionRecords.unshift(record);
    state.events.unshift(event("decision", "Introduction offer recorded", "The candidate remains separate from the requester until both parties consent. No message was sent by recording this offer.", "neutral", { presenceId: presence.id }));
    return state;
  }
  if (operation.type === "respondIntroductionConsent") {
    const record = state.introductionRecords.find((item) => item.id === operation.id);
    if (!record || record.state === "closed" || record.state === "introduced") return state;
    const timestamp = now();
    const consent = operation.consent ? "consented" : "declined";
    if (operation.party === "requester") record.requesterConsent = consent;
    else record.candidateConsent = consent;
    if (!operation.consent) {
      record.state = "closed";
      record.outcome = `${operation.party} declined introduction`;
    } else if (record.requesterConsent === "consented" && record.candidateConsent === "consented") {
      record.state = "introduced";
      record.outcome = "Both parties consented; a separate Message execution may now proceed.";
    } else if (operation.party === "requester") {
      record.state = "candidate_contact_pending";
    } else {
      record.state = "candidate_accepted";
    }
    record.updatedAt = timestamp;
    state.events.unshift(event("decision", "Introduction consent updated", record.state === "introduced" ? "Both parties consented. Any contact still requires a separate Message execution." : record.state === "closed" ? "The introduction was closed without contact." : "One consent is recorded; the other party remains unresolved.", record.state === "closed" ? "quiet" : "positive", { presenceId: record.presenceId }));
    return state;
  }
  if (operation.type === "setAgentLanguagePolicy") {
    if (!state.agent) return state;
    const policy = normalizeLanguagePolicy(operation.policy);
    state.agent = { ...state.agent, languagePolicy: policy };
    state.agents = state.agents.map((item) => item.id === state.agent?.id ? { ...item, languagePolicy: policy } : item);
    state.events.unshift(event("system", "Agent language policy updated", "Taste guides expression; explicit Never use rules now apply at final expression.", "positive", { presenceId: state.presence?.id }));
    return state;
  }
  if (operation.type === "setPresenceLanguagePolicy") {
    if (!state.presence) return state;
    const policy = normalizeLanguagePolicy(operation.policy);
    const updated = { ...state.presence, languagePolicy: policy };
    updated.context = compilePresenceContext(updated);
    state.presence = updated;
    state.presences = state.presences.map((item) => item.id === updated.id ? updated : item);
    state.events.unshift(event("system", "Presence language policy updated", "This Presence adds local lexical boundaries without weakening inherited Agent rules.", "positive", { presenceId: updated.id }));
    return state;
  }
  if (operation.type === "executeIntent" || operation.type === "markManualExecution") {
    const execution = state.executions.find((item) => operation.type === "markManualExecution" ? item.id === operation.id : item.socialIntentId === operation.id);
    if (operation.type === "executeIntent" && execution && !targetLanguageValidationForExecution(state, execution).valid) return blockExecutionForTargetLanguage(state, execution.id);
    if (execution && !languageValidationForExecution(state, execution).valid) return blockExecutionForLanguage(state, execution.id);
  }
  if (operation.type === "overrideLanguagePolicy") {
    const execution = state.executions.find((item) => item.id === operation.id);
    if (!execution || execution.status !== "blocked" || execution.failure?.code !== "LANGUAGE_POLICY_VIOLATION" || execution.source !== "operator") return state;
    execution.failure = undefined;
    execution.reviewReason = "Operator explicitly chose Publish anyway for this exact text.";
    execution.status = execution.mode === "auto" ? "queued" : execution.mode === "review" ? "awaiting-review" : "awaiting-manual";
    execution.updatedAt = now();
    state.events.unshift(event("execution", "Operator override recorded", "The operator explicitly chose Publish anyway for this exact text. The language rule remains active for future Agent output.", "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
    return state;
  }
  if (["connectAssetSource", "rescanAssetSource", "pauseAssetSource", "resumeAssetSource", "createAssetCollection", "updateAssetCollection", "archiveAssetCollection", "addAssetToCollection", "removeAssetFromCollection", "setAssetAccessScope", "editAssetMetadata", "approveAssetMetadata", "resolveAssetReview", "reanalyzeAsset", "archiveAsset", "restoreAsset"].includes(operation.type)) {
    return applyAssetLibraryOperation(state, operation as import("./types").AssetLibraryOperation);
  }
  if (operation.type === "createKnowledgeDocument") return createKnowledgeDocument(state, operation);
  if (operation.type === "saveKnowledgeDocument") return saveKnowledgeDocument(state, operation);
  if (operation.type === "setKnowledgeAccess") return setKnowledgeAccess(state, operation);
  if (operation.type === "setMindFileKnowledgeBinding") return setMindFileKnowledgeBinding(state, operation);
  if (operation.type === "archiveKnowledgeDocument") return archiveKnowledgeDocument(state, operation.documentId);
  if (operation.type === "createKnowledgeCollection") return createKnowledgeCollection(state, operation);
  if (operation.type === "updateKnowledgeCollection") return updateKnowledgeCollection(state, operation);
  if (operation.type === "addKnowledgeItem") return addKnowledgeItem(state, operation);
  if (operation.type === "uploadKnowledgeVersion") return uploadKnowledgeVersion(state, operation);
  if (operation.type === "setKnowledgeBinding") return setKnowledgeBinding(state, operation);
  if (operation.type === "archiveKnowledgeItem") return archiveKnowledgeItem(state, operation.itemId);
  if (operation.type === "archiveKnowledgeCollection") return archiveKnowledgeCollection(state, operation.collectionId);
  switch (operation.type) {
    case "reset": return initialState();
    case "resumeAttention":
    case "resetAttentionBudget": {
      const presenceId = operation.presenceId ?? state.activePresenceId ?? state.presence?.id;
      const current = state.presences.find((item) => item.id === presenceId) ?? state.presence;
      if (!current || current.id !== presenceId) return state;
      const attention = current.selfDirectedAttention ?? defaultSelfDirectedAttentionPolicy();
      const updated = {
        ...current,
        selfDirectedAttention: {
          ...attention,
          nextEligibleAt: undefined,
          ...(operation.type === "resetAttentionBudget" ? { usageResetAt: now() } : {}),
        },
      };
      state.presences = state.presences.map((item) => item.id === updated.id ? updated : item);
      if (state.presence?.id === updated.id) state.presence = updated;
      state.events.unshift(event("system", operation.type === "resetAttentionBudget" ? "Autonomy budget reset" : "Autonomy resumed", operation.type === "resetAttentionBudget" ? `${updated.name}'s self-directed usage history remains preserved, but today's active attention epoch starts now.` : `${updated.name}'s deferred self-directed attention is eligible to run again.`, "positive", { presenceId: updated.id }));
      return state;
    }
    case "removeSandboxObject": {
      const object = state.mirrorObjects.find((item) => item.id === operation.objectId && item.sessionId === operation.sessionId && item.environment === "sandbox");
      if (!object) return state;
      state.mirrorObjects = state.mirrorObjects.filter((item) => item.id !== object.id);
      state.mirrorEvents = state.mirrorEvents.filter((item) => !(item.sessionId === operation.sessionId && item.externalRef.type === object.externalRef.type && item.externalRef.id === object.externalRef.id));
      state.perceptions = state.perceptions.filter((item) => item.socialObjectId !== object.id);
      state.events.unshift(event("system", "Sandbox item removed", `Removed this ${object.objectType} from the current Playground rehearsal.`, "quiet", { presenceId: object.presenceId, sessionId: operation.sessionId, sourceObjectId: object.id }));
      return state;
    }
    case "cancelAssignment": {
      const assignment = state.assignments.find((item) => item.id === operation.id);
      if (!assignment || assignment.status === "completed" || assignment.status === "cancelled") return state;
      const stopStatuses = ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"];
      const unresolvedStatuses = ["claimed", "executing", "verification-pending"];
      const linkedDirectiveIds = new Set(
        state.operatorDirectives
          .filter((directive) => directive.migratedToAssignmentId === assignment.id || (assignment.migration?.sourceType === "operatorDirective" && directive.id === assignment.migration.sourceId))
          .map((directive) => directive.id),
      );
      let stopped = 0;
      let unresolved = 0;
      for (const execution of state.executions.filter((item) => item.assignmentId === assignment.id || (item.operatorDirectiveId && linkedDirectiveIds.has(item.operatorDirectiveId)))) {
        const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
        const action = state.actions.find((item) => item.executionId === execution.id);
        if (stopStatuses.includes(execution.status)) {
          execution.status = "cancelled";
          execution.lease = undefined;
          execution.updatedAt = now();
          if (intent && intent.state === "active") { intent.state = "withdrawn"; intent.updatedAt = execution.updatedAt; }
          if (action) { action.status = "skipped"; action.reason = "The operator stopped this Assignment before delivery."; }
          stopped += 1;
        } else if (unresolvedStatuses.includes(execution.status)) {
          execution.status = "verification-closed";
          execution.failure = { ...execution.failure, message: "The operator stopped this Assignment while the external outcome was unresolved. Check the channel before attempting a new reply.", reviewedAt: now(), reviewDisposition: "operator_action_required", reviewNote: "Stopped by the operator to prevent a possible duplicate delivery." };
          execution.reviewReason = "Stopped by the operator while delivery was in progress or awaiting verification.";
          execution.lease = undefined;
          execution.updatedAt = now();
          if (intent && intent.state === "active") { intent.state = "expired"; intent.updatedAt = execution.updatedAt; }
          if (action) { action.status = "skipped"; action.reason = "The operator stopped this Assignment while the external outcome was unresolved."; }
          unresolved += 1;
        }
      }
      for (const directive of state.operatorDirectives) {
        if (linkedDirectiveIds.has(directive.id) && directive.status !== "failed") directive.status = "failed";
      }
      assignment.status = "cancelled";
      assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "The operator cancelled this Assignment." };
      assignment.revision = (assignment.revision ?? 0) + 1;
      assignment.updatedAt = now();
      const stopDetail = stopped || unresolved
        ? ` ${stopped + unresolved} pending delivery${stopped + unresolved === 1 ? "" : "ies"} stopped${unresolved ? "; any external outcome remains unresolved" : ""}.`
        : "";
      assignment.lastOutcome = { class: "assignment_cancelled", message: `${assignment.progress.verified} / ${assignment.progress.required} verified publications remain recorded, but this Assignment will not continue.${stopDetail}`, at: assignment.updatedAt };
      if (assignment.origin === "publishing_initiative") {
        const owner = state.presences.find((presence) => presence.id === assignment.presenceId);
        if (owner) {
          owner.publishingInitiative = { ...owner.publishingInitiative, mode: "off", assignmentId: undefined, updatedAt: assignment.updatedAt };
          owner.context = compilePresenceContext(owner);
          state.presences = state.presences.map((presence) => presence.id === owner.id ? owner : presence);
          if (state.presence?.id === owner.id) state.presence = owner;
        }
        state.publishingPlans = state.publishingPlans.map((plan) => plan.presenceId === assignment.presenceId && plan.status !== "superseded" ? { ...plan, status: "superseded" as const, updatedAt: assignment.updatedAt } : plan);
      }
      state.events.unshift(event("decision", "Assignment cancelled", assignment.lastOutcome.message, "quiet", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
      return state;
    }
    case "cancelExecution": {
      const execution = state.executions.find((item) => item.id === operation.id);
      if (!execution || execution.externalRef) return state;
      const cancellable = ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"];
      const unresolved = ["claimed", "executing", "verification-pending"];
      const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
      const action = state.actions.find((item) => item.executionId === execution.id);
      if (cancellable.includes(execution.status)) {
        execution.status = "cancelled";
        execution.lease = undefined;
        execution.updatedAt = now();
        if (intent && intent.state === "active") { intent.state = "withdrawn"; intent.updatedAt = execution.updatedAt; }
        if (action) { action.status = "skipped"; action.reason = "The operator stopped this delivery before it was sent."; }
        state.events.unshift(event("execution", "Delivery stopped", "The operator stopped this action before a verified public result. No new delivery will be attempted.", "quiet", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
        return state;
      }
      if (unresolved.includes(execution.status)) {
        execution.status = "verification-closed";
        execution.failure = { ...execution.failure, message: "The operator stopped this action while the external outcome was unresolved. Check the channel before attempting a new reply.", reviewedAt: now(), reviewDisposition: "operator_action_required", reviewNote: "Stopped by the operator to prevent a possible duplicate delivery." };
        execution.reviewReason = "Stopped by the operator while delivery was in progress or awaiting verification.";
        execution.lease = undefined;
        execution.updatedAt = now();
        if (intent && intent.state === "active") { intent.state = "expired"; intent.updatedAt = execution.updatedAt; }
        if (action) { action.status = "skipped"; action.reason = "The operator stopped this delivery while the external outcome was unresolved."; }
        state.events.unshift(event("execution", "Unresolved delivery stopped", "No retry will be attempted. The external channel may already contain the action, so verify it before trying again.", "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
      }
      return state;
    }
    case "setToolBinding": {
      if (!state.agent || !operation.toolId.trim()) return state;
      const toolId = operation.toolId.trim();
      const existing = state.toolBindings.find((item) => item.agentId === state.agent?.id && item.toolId === toolId);
      if (existing) {
        if (operation.provider !== undefined) existing.provider = operation.provider;
        if (operation.model !== undefined) existing.model = operation.model.trim() || undefined;
        if (operation.connectionId !== undefined) existing.connectionId = operation.connectionId.trim() || undefined;
      } else state.toolBindings.push({ id: id("binding"), agentId: state.agent.id, toolId, enabled: true, provider: operation.provider, model: operation.model?.trim() || undefined, connectionId: operation.connectionId?.trim() || undefined });
      state.events.unshift(event("system", "Tool binding updated", `${toolId} now has an explicit runtime binding for this Agent.`, "positive"));
      return state;
    }
    case "setCapability": {
      if (!state.agent) return state;
      const definition = AGENT_CAPABILITY_DEFINITIONS.find((item) => item.id === operation.capabilityId);
      if (!definition || definition.scope !== "agent") return state;
      for (const toolId of definition.toolIds) {
        const existing = state.toolBindings.find((item) => item.agentId === state.agent?.id && item.toolId === toolId);
        if (existing) existing.enabled = operation.enabled;
        else state.toolBindings.push({ id: id("binding"), agentId: state.agent.id, toolId, enabled: operation.enabled });
      }
      state.events.unshift(event("system", `${definition.name} ${operation.enabled ? "enabled" : "disabled"}`, operation.enabled ? `${definition.name} is available to the Agent when useful.` : `${definition.name} is no longer available for new Agent-initiated use. Existing assets and observations remain intact.`, operation.enabled ? "positive" : "quiet"));
      return state;
    }
    case "createAgent": return createAgent(operation.input);
    case "createAdditionalAgent": {
      if (!state.agent) return state;
      const current = snapshotWorkspace(state);
      const fresh = createAgent(operation.input);
      const agents = [...state.agents.filter((item) => item.id !== fresh.agent?.id), fresh.agent!];
      const workspaces = state.agentWorkspaces.filter((item) => item.agent?.id !== state.agent?.id && item.agent?.id !== fresh.agent?.id);
      workspaces.push(current);
      return normalizeState({ ...fresh, agents, activeAgentId: fresh.agent?.id ?? null, agentWorkspaces: workspaces });
    }
    case "deleteAgent": {
      if (!state.agent) throw new Error("There is no Agent to delete.");
      if (state.agents.length <= 1) throw new Error("Keep at least one Agent in OpenPresence.");
      if (operation.confirmationName !== state.agent.name) throw new Error(`Type “${state.agent.name}” to confirm deletion.`);
      const replacementAgent = state.agents.find((item) => item.id !== state.agent?.id);
      const replacementWorkspace = replacementAgent ? state.agentWorkspaces.find((item) => item.agent?.id === replacementAgent.id) : undefined;
      if (!replacementAgent || !replacementWorkspace) throw new Error("The replacement Agent workspace is unavailable. Refresh and try again.");
      const agents = state.agents.filter((item) => item.id !== state.agent?.id);
      const workspaces = state.agentWorkspaces.filter((item) => item.agent?.id !== state.agent?.id && item.agent?.id !== replacementAgent.id);
      const restored = restoreWorkspace({ ...state, agents }, replacementWorkspace, workspaces);
      restored.events.unshift(event("system", "Agent deleted", `${state.agent.name} and its workspace were permanently deleted.`, "warning"));
      return restored;
    }
    case "selectAgent": {
      const target = state.agents.find((item) => item.id === operation.id);
      if (!target || target.id === state.activeAgentId || !state.agent) return state;
      const currentAgentId = state.agent.id;
      const targetWorkspace = state.agentWorkspaces.find((item) => item.agent?.id === target.id);
      if (!targetWorkspace) return state;
      const current = snapshotWorkspace(state);
      const workspaces = state.agentWorkspaces.filter((item) => item.agent?.id !== currentAgentId && item.agent?.id !== target.id);
      workspaces.push(current);
      return restoreWorkspace(state, targetWorkspace, workspaces);
    }
    case "setAgentAccent": {
      if (!state.agents.some((item) => item.id === operation.agentId) || !/^#[0-9a-fA-F]{6}$/.test(operation.accent)) return state;
      state.agents = state.agents.map((item) => item.id === operation.agentId ? { ...item, accent: operation.accent } : item);
      if (state.agent?.id === operation.agentId) {
        state.agent = { ...state.agent, accent: operation.accent };
        state.presences = state.presences.map((presence) => ({ ...presence, accent: operation.accent }));
        state.presence = state.presence ? { ...state.presence, accent: operation.accent } : state.presence;
      }
      state.agentWorkspaces = state.agentWorkspaces.map((workspace) => workspace.agent?.id === operation.agentId
        ? {
          ...workspace,
          agent: workspace.agent ? { ...workspace.agent, accent: operation.accent } : workspace.agent,
          presences: workspace.presences.map((presence) => ({ ...presence, accent: operation.accent })),
          presence: workspace.presence ? { ...workspace.presence, accent: operation.accent } : workspace.presence,
        }
        : workspace);
      return state;
    }
    case "renameAgent": {
      if (!state.agent || !operation.name.trim()) return state;
      const previous = state.agent.name;
      const name = operation.name.trim();
      state.agent = { ...state.agent, name };
      state.agents = state.agents.map((item) => item.id === state.agent?.id ? { ...item, name } : item);
      state.events.unshift(event("system", "Agent name updated", `${previous} is now ${name}. Agent-wide meaning files were left unchanged for your review.`, "positive"));
      return state;
    }
    case "createPresence": { if (!state.agent) return state; const definition = state.channelDefinitions.find((item) => item.id === operation.input.channel) ?? operation.input.channelDefinition; if (operation.input.channelDefinition && !state.channelDefinitions.some((item) => item.id === operation.input.channelDefinition!.id)) state.channelDefinitions.push(operation.input.channelDefinition); const created = makePresence({ ...operation.input, accent: state.agent.accent }, operation.input.name?.trim() || operation.input.handle, definition, defaultPresenceBrief(state.agent)); state.presences.push(created); state.sandboxEnvironments.push(makeSandboxEnvironment(created)); state.presence = created; state.activePresenceId = created.id; state.events.unshift(event("system", `${channelName(created.channel)} Presence added`, `${created.handle} is ready as ${created.mode === "ghost" ? "a Ghost Presence" : "an agent-owned Presence"}.`, "positive", { presenceId: created.id })); return state; }
    case "deletePresence": {
      const target = state.presences.find((item) => item.id === operation.presenceId);
      if (!target) throw new Error("That Presence no longer exists.");
      if (state.presences.length <= 1) throw new Error("Keep at least one Presence for this Agent.");
      if (operation.confirmationName !== target.name) throw new Error(`Type “${target.name}” to confirm deletion.`);
      const deletedIntentIds = new Set(state.socialIntents.filter((item) => item.presenceId === target.id).map((item) => item.id));
      const deletedExecutionIds = new Set(state.executions.filter((item) => item.presenceId === target.id).map((item) => item.id));
      const deletedBridgeIds = new Set(state.bridges.filter((item) => item.presenceId === target.id).map((item) => item.id));
      const deletedScenarioIds = new Set(state.scenarios.filter((item) => item.presenceId === target.id).map((item) => item.id));
      const deletedRunIds = new Set(state.scenarioRuns.filter((item) => item.presenceId === target.id).map((item) => item.id));
      state.mirrorEvents = state.mirrorEvents.filter((item) => !deletedBridgeIds.has(item.bridgeId));
      state.scenarioVersions = state.scenarioVersions.filter((item) => !deletedScenarioIds.has(item.scenarioId));
      state.scenarioEvaluations = state.scenarioEvaluations.filter((item) => !deletedRunIds.has(item.runId));
      state.outcomes = state.outcomes.filter((item) => !deletedExecutionIds.has(item.executionId ?? "") && !deletedIntentIds.has(item.socialIntentId));
      state.calendar = state.calendar.filter((item) => item.presence !== target.id);
      const dynamicState = state as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(dynamicState)) {
        if (!Array.isArray(value)) continue;
        dynamicState[key] = value.filter((item) => !item || typeof item !== "object" || (item as { presenceId?: unknown }).presenceId !== target.id);
      }
      state.presences = state.presences.filter((item) => item.id !== target.id);
      const nextPresence = state.presences.find((item) => item.id === state.activePresenceId) ?? state.presences[0]!;
      state.presence = nextPresence;
      state.activePresenceId = nextPresence.id;
      state.events.unshift(event("system", "Presence deleted", `${target.name} and its Presence-scoped history were permanently deleted.`, "warning", { presenceId: nextPresence.id }));
      return state;
    }
    case "createChannel": { if (!state.channelDefinitions.some((item) => item.id === operation.definition.id)) { state.channelDefinitions.push(operation.definition); state.events.unshift(event("system", `${operation.definition.name} defined`, "The social environment is ready for a Presence.", "positive")); } return state; }
    case "updateChannel": {
      const index = state.channelDefinitions.findIndex((item) => item.id === operation.definition.id);
      if (index < 0) return state;
      state.channelDefinitions[index] = operation.definition;
      state.presences = state.presences.map((presence) => presence.channel === operation.definition.id ? { ...presence, context: compilePresenceContext({ ...presence }) } : presence);
      if (state.presence?.channel === operation.definition.id) state.presence = state.presences.find((item) => item.id === state.presence?.id) ?? state.presence;
      state.events.unshift(event("system", `${operation.definition.name} updated`, "The Channel destination and capabilities were updated for its Presences.", "positive"));
      return state;
    }
    case "createBridge": { const presence = state.presences.find((item) => item.id === operation.input.presenceId); if (!presence) return state; const existing = state.bridges.find((bridge) => bridge.presenceId === presence.id && bridge.state !== "offline" && operation.input.capabilities.affordances.some((affordance) => bridge.capabilities.affordances.includes(affordance))); if (existing) return state; const timestamp = now(); const bridge: Bridge = { id: id("bridge"), presenceId: presence.id, channelId: presence.channel, name: operation.input.name.trim() || "External Bridge", kind: operation.input.kind, state: operation.input.kind === "manual" ? "online" : "offline", adapterStatus: operation.input.kind === "manual" ? "connected" : "waiting", capabilities: normalizedCapabilities(operation.input.capabilities), createdAt: timestamp, updatedAt: timestamp }; state.bridges.unshift(bridge); state.bridgeSync.unshift({ bridgeId: bridge.id, status: bridge.state === "online" ? "healthy" : "offline" }); if (presence.connectionMode === "sandbox") { presence.connectionMode = "bridge"; presence.environment = "live"; presence.context = compilePresenceContext(presence); } state.events.unshift(event("system", `${bridge.name} added`, bridge.kind === "manual" ? "Manual relay is ready." : "Bridge configured; connect the external adapter to begin syncing.", "positive")); return state; }
    case "rotateBridgeKey": { const bridge = state.bridges.find((item) => item.id === operation.id); if (bridge) { bridge.updatedAt = now(); bridge.state = "offline"; state.events.unshift(event("system", "Bridge key rotated", `${bridge.name} is offline until the new key is connected.`, "warning")); } return state; }
    case "revokeBridge": { const bridge = state.bridges.find((item) => item.id === operation.id); if (bridge) { bridge.state = "offline"; bridge.updatedAt = now(); state.events.unshift(event("system", "Bridge disconnected", `${bridge.name} can no longer receive work.`, "warning")); } return state; }
    case "removeBridge": { const bridge = state.bridges.find((item) => item.id === operation.id); if (!bridge || bridge.state !== "offline") return state; state.bridges = state.bridges.filter((item) => item.id !== operation.id); state.bridgeSync = state.bridgeSync.filter((item) => item.bridgeId !== operation.id); state.events.unshift(event("system", "Bridge removed", `${bridge.name} was removed from the active connector list. Historical mirror data was retained.`, "warning")); return state; }
    case "selectPresence": { const selected = state.presences.find((item) => item.id === operation.id); if (!selected) return state; state.activePresenceId = selected.id; state.presence = selected; return state; }
    case "selectConversation": { if (!state.conversations.some((conversation) => conversation.id === operation.id)) return state; state.activeConversationId = operation.id; syncMessages(state); return state; }
    case "newConversation": { const conversation = makeConversation(); state.conversations.unshift(conversation); state.activeConversationId = conversation.id; syncMessages(state); return state; }
    case "newPresenceChatSession": { if (!state.presences.some((presence) => presence.id === operation.presenceId)) return state; const session = makePresenceChatSession(operation.presenceId); state.presenceChatSessions.unshift(session); return state; }
    case "sendPresenceChatMessage": {
      const session = state.presenceChatSessions.find((item) => item.id === operation.sessionId && item.presenceId === operation.presenceId);
      if (!session || !state.presences.some((presence) => presence.id === operation.presenceId) || !operation.content.trim()) return state;
      const content = operation.content.trim();
      const replyToMessageId = operation.replyToMessageId && session.messages.some((message) => message.id === operation.replyToMessageId) ? operation.replyToMessageId : undefined;
      session.messages.push({ id: id("presence-chat-message"), role: "user", content, timestamp: now(), attachments: operation.attachments?.map((attachment) => ({ id: id("presence-chat-asset"), ...attachment })), replyToMessageId });
      if (session.title === "New conversation") session.title = content.replace(/\s+/g, " ").slice(0, 42) + (content.length > 42 ? "…" : "");
      session.updatedAt = now();
      return state;
    }
    case "sendMessage": {
      const content = operation.content.trim(); if (!content || !state.agent) return state; let conversation = activeConversation(state, operation.conversationId); if (!conversation) { conversation = makeConversation(); state.conversations.unshift(conversation); state.activeConversationId = conversation.id; }
      conversation.messages.push({ id: id("msg"), role: "operator", content, timestamp: now() }); if (conversation.title === "New conversation") conversation.title = content.replace(/\s+/g, " ").slice(0, 42) + (content.length > 42 ? "…" : "");
      if (isLowInformationCue(content)) {
        conversation.updatedAt = now();
        syncMessages(state);
        return state;
      }
      const lower = content.toLowerCase(); let reply = "I can use that in this conversation. If you want it to become a durable setting, tell me which preference to update."; let change: string | undefined;
      const briefChange = state.presence ? inferPresenceBriefChange(content, state.presence.brief) : undefined;
      const explicitContext = inferExplicitDurableContext(content);
      const durableClaim = inferDurableContextClaim(content);
      const confirmedContext = isTeachProposalConfirmation(content) ? priorTeachProposalContext(conversation) : undefined;
      const currentModel = state.modelProfiles.find((item) => item.agentId === state.agent?.id);
      const modelChange = inferModelSettingChange(content, currentModel);
      const executionChange = state.presence ? inferExecutionSettingChange(content, state.presence) : undefined;
      const tasteUpdateRequested = isTasteUpdateCommand(content);
      const tasteInstruction = isTastePreferenceLanguage(content)
        ? content
        : isTasteProposalCommand(content)
          ? priorTastePreferenceInstruction(conversation)
          : tasteUpdateRequested
            ? priorTastePreferenceInstruction(conversation)
          : undefined;
      if (confirmedContext) {
        const submitted = submitMemoryProposal(state, confirmedContext, conversation.id);
        if (submitted) {
          reply = `I submitted this to MEMORY.md as a reviewable proposal: “${confirmedContext}”. Nothing durable changes until you apply it in Manage Agent.`;
          change = "Memory proposal created";
        }
      }
      else if (explicitContext) {
        const submitted = submitMemoryProposal(state, explicitContext, conversation.id);
        if (submitted) {
          reply = `I submitted this to MEMORY.md as a reviewable proposal: “${explicitContext}”. Nothing durable changes until you apply it in Manage Agent.`;
          change = "Memory proposal created";
        }
      }
      else if (durableClaim) {
        reply = `I can keep “${durableClaim}” as durable operator-provided context in MEMORY.md. Should I submit it as a reviewable proposal?`;
        change = "Teach confirmation requested";
      }
      else if (modelChange) {
        state = applyOperation(state, { type: "setModel", model: modelChange.model, provider: modelChange.provider, quality: modelChange.quality, vision: modelChange.provider !== "ollama" });
        reply = `I switched ${state.agent?.name ?? "the Agent"}'s model runtime to ${modelChange.provider}${modelChange.provider === "anthropic" ? " (Claude)" : ""}. If that provider is not connected, Manage Agent will show the setup needed before the next turn.`;
        change = "Model runtime updated";
      }
      else if (executionChange && state.presence) {
        const label = state.presence.capabilities.find((item) => item.id === executionChange.capability)?.label ?? executionChange.capability;
        state = applyOperation(state, { type: "setPresence", patch: { execution: { [executionChange.capability]: executionChange.mode } } });
        reply = `I set ${label.toLowerCase()} to ${executionChange.mode}. This Presence setting is active now.`;
        change = "Presence action setting updated";
      }
      else if (briefChange && state.presence) { state = applyOperation(state, { type: "setPresence", patch: { brief: briefChange.brief } }); reply = "I updated this Presence Brief. The Agent remains the same, while this social role now has a clearer emphasis here."; change = briefChange.summary; }
      else if (state.presence && inferPresenceIdentityChange(content, state.presence)) {
        const identity = inferPresenceIdentityChange(content, state.presence)!;
        const proposedPresence = { ...state.presence, name: identity.name, publicSelf: { ...state.presence.publicSelf, displayName: identity.name } };
        const proposedFile = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode: state.presence.mode, handle: state.presence.handle, accent: state.agent.accent }, proposedPresence);
        state.proposals.push(proposal(state, "PRESENCE", proposedFile, "You gave an explicit Presence identity instruction. Protected identity changes are submitted for operator review before the live Presence changes.", conversation.id, { type: "presence_identity", presenceId: state.presence.id, name: identity.name }));
        reply = `I submitted a Presence identity change for review: this Presence would appear as ${identity.name}. The live Presence remains ${state.presence.name} until you apply it in Manage Agent.`;
        change = "Presence identity proposal created";
      }
      else if (tasteUpdateRequested && !tasteInstruction) {
        reply = "I can update TASTE.md, but I need the preference you want to make durable. Tell me what should change, and I’ll prepare it for review.";
        change = "Taste update needs a preference";
      }
      else if (tasteInstruction) {
        const submitted = submitTasteProposal(state, conversation.id, tasteInstruction);
        if (submitted) {
          reply = isTasteProposalCommand(content)
            ? "I submitted the rule as a reviewable TASTE.md proposal. It is waiting in Manage Agent → Brain; applying it there will make the preference durable."
            : isConversationalTastePreferenceLanguage(tasteInstruction)
              ? "I turned that into a reviewable TASTE.md proposal. It asks Genny to answer the person and the concrete detail first, keep small replies short, and avoid restating or over-explaining. Review and apply it in Manage Agent → Brain."
            : isBlueHumorTastePreferenceLanguage(tasteInstruction)
              ? "I turned that into a reviewable TASTE.md proposal. It gives Genny playful absurdist and occasional sophomoric blue humor while keeping body image, gender, sex, race, and other vulnerable subjects out of the joke. Review and apply it in Manage Agent → Brain."
              : isHumorTastePreferenceLanguage(tasteInstruction)
                ? "I turned that into a reviewable TASTE.md proposal. It adds light, contextual humor and restrained emoji when they sharpen the moment. Review and apply it in Manage Agent → Brain."
              : "I turned that into a reviewable TASTE.md proposal. I’ll use curiosity, genuine questions, and selective encouragement as judgment—not as a default engagement tactic. Review and apply it in Manage Agent → Brain.";
          change = "Taste proposal created";
        }
      }
      else if (inferPostFormattingProposal(content, state.files.find((file) => file.kind === "TASTE")?.content ?? "")) { const formatting = inferPostFormattingProposal(content, state.files.find((file) => file.kind === "TASTE")?.content ?? "")!; state.proposals.push(proposal(state, "TASTE", formatting.proposed, "You asked for a durable post-formatting preference. Protected identity files change through proposals.", conversation.id)); reply = formatting.reply; change = "Taste proposal created"; }
      else if (lower.includes("less promotional") || lower.includes("less salesy") || lower.includes("less sales-like")) { const current = state.files.find((file) => file.kind === "TASTE")?.content ?? ""; const guidance = "## Promotion\n\nPrefer useful, specific observations over promotional language. Do not turn a useful point into a sales pitch."; const proposed = current.includes(guidance) ? current : `${current.trim()}\n\n${guidance}`; state.proposals.push(proposal(state, "TASTE", proposed, "You asked for a durable tone preference. Protected meaning files change through proposals.", conversation.id)); reply = "I turned that into a reviewable TASTE proposal. Until you apply it, I’ll still use judgment and avoid making the Presence sound like a sales pitch."; change = "Taste proposal created"; }
      else if (lower.includes("em dash") || lower.includes("em-dash")) { const current = state.files.find((file) => file.kind === "TASTE")?.content ?? ""; state.proposals.push(proposal(state, "TASTE", `${current}\n\n## Style note\n\nPrefer commas, periods, or a clean line break over em dashes.`, "You asked for a durable writing preference. Protected identity files change through proposals.", conversation.id)); reply = "I turned that into a Taste proposal so it can become a durable preference without silently rewriting who I am."; change = "Taste proposal created"; }
      else if (lower.includes("tuesday") || lower.includes("schedule") || lower.includes("every ")) { const instruction = content.replace(/^schedule\s+/i, "").replace(/[.!?]+$/, "").trim() || "Teach the audience one useful thing."; const slot = makeCalendarSlot(instruction, state.presence); const standing = makeStandingIntent(state, instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); slot.standingIntentId = standing.id; state.standingIntents.push(standing); state.calendar.push(slot); recordChangeSet(state, "Create standing intent", [{ path: "standingIntents", action: "create", after: standing.instruction }], conversation.id); reply = `I created a standing intention: ${slot.label}. I’ll evaluate it in the moment and let it expire without publishing if there is nothing worthwhile.`; change = "Standing intention created"; }
      else if (isExplicitGhostModeRequest(content)) { const presence = state.presence ? { ...state.presence, mode: "ghost" as const } : null; if (presence) { presence.context = compilePresenceContext(presence); state.presence = presence; state.presences = state.presences.map((item) => item.id === presence.id ? presence : item); } const file = state.files.find((item) => item.kind === "PRESENCE"); if (file && presence) file.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode: "ghost", handle: presence.handle, accent: state.agent.accent }); recordChangeSet(state, "Change Presence mode", [{ path: `presences.${state.presence?.id}.mode`, action: "update", after: "ghost" }], conversation.id); reply = "I updated this Presence to Ghost mode. I’ll extend the operator’s attention and judgment rather than pretending to be a different public speaker."; change = "Presence changed to Ghost"; }
      conversation.messages.push({ id: id("msg"), role: "agent", content: reply, timestamp: now(), change }); conversation.updatedAt = now(); state.events.unshift(event("decision", "A conversation with the operator", change ?? "Working context updated.", change ? "positive" : "neutral")); syncMessages(state); return state;
    }
    case "saveFile": { const file = state.files.find((item) => item.kind === operation.kind); if (!file || file.content === operation.content) return state; if (file.protected) { state.proposals.push(proposal(state, operation.kind, operation.content, "Protected meaning files are reviewed before they change.")); state.events.unshift(event("system", `${operation.kind}.md needs your review`, "A protected meaning change is waiting in Brain.", "warning")); } else { const before = file.content; file.content = operation.content; file.revision += 1; file.updatedAt = now(); recordChangeSet(state, `Update ${operation.kind}.md`, [{ path: `agentFiles.${operation.kind}`, action: "update", before, after: operation.content }]); state.events.unshift(event("learning", `${operation.kind}.md updated`, "The change was saved to the local agent state.", "positive")); } return state; }
    case "resolveProposal": { const item = state.proposals.find((entry) => entry.id === operation.id); if (!item || item.status !== "pending") return state; item.status = operation.decision === "approve" ? "approved" : "rejected"; if (operation.decision === "approve") { const file = state.files.find((entry) => entry.kind === item.file); if (file) { file.content = item.proposed; file.revision += 1; file.updatedAt = now(); } if (item.target?.type === "presence_identity") { const updated = state.presences.find((presence) => presence.id === item.target?.presenceId); if (updated) { const nextPresence = { ...updated, name: item.target.name, publicSelf: { ...updated.publicSelf, displayName: item.target.name } }; nextPresence.context = compilePresenceContext(nextPresence); state.presences = state.presences.map((presence) => presence.id === nextPresence.id ? nextPresence : presence); if (state.presence?.id === nextPresence.id) state.presence = nextPresence; } } state.events.unshift(event("system", `${item.file}.md approved`, "The protected meaning file and its Presence identity were updated and versioned.", "positive")); } else state.events.unshift(event("system", `${item.file}.md proposal rejected`, "The current meaning stays unchanged.", "quiet")); return state; }
    case "removeLegacyCalendarEntries": {
      const removedSlots = state.calendar.length;
      if (!removedSlots) return state;
      const standingIntentIds = new Set(state.calendar.map((slot) => slot.standingIntentId).filter((id): id is string => Boolean(id)));
      state.calendar = [];
      state.standingIntents = state.standingIntents.filter((intent) => !standingIntentIds.has(intent.id));
      state.events.unshift(event("system", "Legacy calendar entries removed", `${removedSlots} older calendar entr${removedSlots === 1 ? "y" : "ies"} were removed. Assignments and the Publishing Plan remain unchanged.`, "quiet"));
      return state;
    }
    case "addSlot": { const targetPresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; const slot = makeCalendarSlot(operation.instruction, targetPresence, operation.day, operation.time, operation.objective, operation.executionWindow); const standing = makeStandingIntent(state, slot.instruction, targetPresence, slot.day, slot.time, slot.objective, slot.executionWindow); const assignment = compileAssignmentInstruction(state, slot.instruction, targetPresence?.id, targetPresence?.environment ?? "sandbox", undefined, { day: slot.day, time: slot.time, executionWindow: slot.executionWindow }); assignment.origin = "schedule"; slot.standingIntentId = standing.id; slot.assignmentId = assignment.id; state.standingIntents.push(standing); state.assignments.unshift(assignment); state.calendar.push(slot); recordChangeSet(state, "Create Assignment", [{ path: "assignments", action: "create", after: assignment.instruction }]); state.events.unshift(event("system", "Assignment reviewed", `${slot.label} · ${slot.day} at ${slot.time}. ${assignment.preflight?.status === "ready" || assignment.preflight?.status === "ready_with_assumptions" ? "Ready to activate." : "Needs input before activation."}`, assignment.preflight?.status === "ready" || assignment.preflight?.status === "ready_with_assumptions" ? "positive" : "warning")); return state; }
    case "editSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const targetPresence = state.presences.find((item) => item.id === slot.presence) ?? state.presence; const previous = { ...slot }; const scheduleChanged = previous.day !== operation.day || previous.time !== operation.time; slot.instruction = operation.instruction.trim() || slot.instruction; slot.label = slot.instruction.length > 34 ? `${slot.instruction.slice(0, 34).trim()}…` : slot.instruction; slot.day = operation.day; slot.time = operation.time; slot.objective = operation.objective; slot.executionWindow = operation.executionWindow; slot.mode = targetPresence?.execution.post ?? slot.mode; if (scheduleChanged) slot.lastEvaluatedAt = undefined; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId); if (standing) { const [startsAt, endsAt] = slot.executionWindow.split(/[–-]/).map((part) => part.trim()); standing.instruction = slot.instruction; standing.presenceId = targetPresence?.id; standing.trigger = { type: "schedule", config: { day: slot.day, time: slot.time } }; standing.objective = slot.objective; standing.executionWindow = { startsAt, endsAt: endsAt || startsAt }; standing.updatedAt = now(); } const assignment = slot.assignmentId ? state.assignments.find((item) => item.id === slot.assignmentId) : undefined; if (assignment) { assignment.instruction = slot.instruction; assignment.title = slot.instruction; assignment.schedule = { day: slot.day, time: slot.time, executionWindow: slot.executionWindow }; assignment.preflight = preflightAssignment(state, assignment, assignment.executionPolicy.delegationPolicy); assignment.updatedAt = now(); } recordChangeSet(state, "Edit Assignment", [{ path: `assignments.${slot.assignmentId ?? slot.id}`, action: "update", before: previous.instruction, after: slot.instruction }]); state.events.unshift(event("system", "Assignment updated", `${slot.label} · ${slot.day} at ${slot.time}.`, "positive")); return state; }
    case "createSkill": { if (!state.agent || !operation.name.trim() || !operation.description.trim()) return state; const skillId = `${operation.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill"}-${Date.now().toString(36)}`; const skill = { id: skillId, name: operation.name.trim(), description: operation.description.trim(), channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: [], compatibleFormats: [] }; state.skills.push(skill); state.agentSkills.push({ id: id("agent-skill"), agentId: state.agent.id, skillId: skill.id, enabled: true }); state.events.unshift(event("learning", "Skill created", `${skill.name} is installed and enabled for ${state.agent.name}.`, "positive")); return state; }
    case "editSkill": { const skill = state.skills.find((item) => item.id === operation.id); if (!skill || !operation.name.trim() || !operation.description.trim()) return state; const previous = { name: skill.name, description: skill.description }; skill.name = operation.name.trim(); skill.description = operation.description.trim(); state.events.unshift(event("learning", "Skill updated", `${skill.name} instruction prompt updated.`, "positive")); recordChangeSet(state, "Edit skill", [{ path: `skills.${skill.id}`, action: "update", before: previous.description, after: skill.description }]); return state; }
    case "configureProvider": { if (!state.agent) return state; const name = providerName(operation.provider); const existing = state.providerConnections.find((item) => item.provider === operation.provider); const status = operation.provider === "ollama" ? "local" as const : "available" as const; if (existing) { existing.label = name; existing.status = status; existing.endpoint = operation.endpoint?.trim() || existing.endpoint; existing.secretConfigured = operation.hasSecret || existing.secretConfigured; } else state.providerConnections.push({ id: id("connection"), provider: operation.provider, label: name, status, endpoint: operation.endpoint?.trim() || undefined, secretConfigured: operation.hasSecret, createdAt: now() }); state.events.unshift(event("system", `${name} connected`, operation.provider === "ollama" ? "Local models are ready to use." : "Provider access is configured for this Agent.", "positive")); return state; }
    case "configureAssetProvider": { if (!state.agent) return state; const existing = state.assetProviderConnections.find((item) => item.provider === operation.provider); const available = operation.provider === "evidence-visual" || Boolean(operation.hasSecret); if (existing) { existing.label = operation.label.trim(); existing.endpoint = operation.endpoint?.trim() || existing.endpoint; existing.status = available ? "available" : existing.status; existing.secretConfigured = operation.hasSecret || existing.secretConfigured; } else state.assetProviderConnections.push({ id: id("asset-connection"), provider: operation.provider, label: operation.label.trim(), endpoint: operation.endpoint?.trim() || undefined, status: available ? "available" : "needs-configuration", secretConfigured: operation.hasSecret, createdAt: now() }); state.events.unshift(event("system", `${operation.label.trim()} connected`, "Asset discovery is ready for operator-approved source research.", "positive")); return state; }
    case "disconnectAssetProvider": { const connection = state.assetProviderConnections.find((item) => item.provider === operation.provider); if (connection) { state.assetProviderConnections = state.assetProviderConnections.filter((item) => item.id !== connection.id); state.events.unshift(event("system", `${connection.label} disconnected`, "Asset discovery will ask for setup before searching again.", "quiet")); } return state; }
    case "runSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId) ?? makeStandingIntent(state, slot.instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); addSocialEvaluation(state, standing, slot); return state; }
    case "confirmAutoMode": return confirmAutoMode(state, operation.presenceId, operation.capabilities, operation.executionIds);
    case "approveExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (execution?.status === "awaiting-review") { execution.status = execution.bridgeId ? "approved" : "approved"; execution.updatedAt = now(); state.events.unshift(event("execution", "Approved for execution", "The operator approved this social action; it remains separate from Jenny's judgment.", "positive", { executionId: execution.id })); } return state; }
    case "reviewFailedExecution": {
      const execution = state.executions.find((item) => item.id === operation.id);
      if (!execution || !["failed", "blocked", "expired"].includes(execution.status) || execution.externalRef) return state;
      const note = operation.note?.trim();
      execution.failure = {
        ...execution.failure,
        message: execution.failure?.message ?? "The action did not produce a verified public result.",
        reviewedAt: now(),
        reviewDisposition: operation.disposition,
        reviewNote: note || undefined,
      };
      execution.reviewReason = note || execution.reviewReason || (
        operation.disposition === "closed_non_retryable"
          ? "Reviewed as non-retryable; no verified public result was recorded."
          : operation.disposition === "stale"
            ? "Reviewed as stale; the original social moment should not be replayed without a new decision."
            : "Reviewed as requiring operator action before another delivery attempt."
      );
      execution.updatedAt = now();
      state.events.unshift(event("execution", "Failure reviewed", `${execution.failure.reviewDisposition === "closed_non_retryable" ? "Closed as non-retryable" : execution.failure.reviewDisposition === "stale" ? "Marked stale" : "Marked for operator action"}. No delivery or success was inferred.`, operation.disposition === "operator_action_required" ? "warning" : "quiet", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
      return state;
    }
    case "reviewAllFailedExecutions": {
      const presenceId = operation.presenceId ?? state.presence?.id;
      const disposition = operation.disposition ?? "operator_action_required";
      const note = operation.note?.trim() || "Reviewed and dismissed in bulk by operator.";
      let count = 0;
      for (const execution of state.executions) {
        if (presenceId && execution.presenceId !== presenceId) continue;
        if (!["failed", "blocked", "expired"].includes(execution.status) || execution.externalRef || execution.failure?.reviewedAt) continue;
        execution.failure = {
          ...execution.failure,
          message: execution.failure?.message ?? "The action did not produce a verified public result.",
          reviewedAt: now(),
          reviewDisposition: disposition,
          reviewNote: note,
        };
        execution.reviewReason = note;
        execution.updatedAt = now();
        count++;
      }
      if (count > 0) {
        state.events.unshift(event("execution", "All open failures reviewed", `${count} failed public action${count === 1 ? "" : "s"} marked as reviewed.`, "quiet", { presenceId }));
      }
      return state;
    }
    case "clearReviewedExecutions": {
      const presenceId = operation.presenceId ?? state.presence?.id;
      const initialCount = state.executions.length;
      state.executions = state.executions.filter((execution) => {
        if (presenceId && execution.presenceId !== presenceId) return true;
        const isReviewedFailure = ["failed", "blocked", "expired", "verification-closed"].includes(execution.status) && Boolean(execution.failure?.reviewedAt);
        return !isReviewedFailure;
      });
      const removed = initialCount - state.executions.length;
      if (removed > 0) {
        state.events.unshift(event("execution", "Reviewed failures cleared", `Cleared ${removed} reviewed failure record${removed === 1 ? "" : "s"} from history.`, "quiet", { presenceId }));
      }
      return state;
    }
    case "closeUnverifiedExecutions": {
      const note = operation.note?.trim() || "Closed by the operator while the public X outcome remained unverified. No delivery or success was inferred.";
      let closed = 0;
      for (const execution of state.executions) {
        if (!operation.ids.includes(execution.id) || !["verification-pending", "verification-closed"].includes(execution.status) || execution.externalRef || execution.environment === "sandbox") continue;
        execution.status = "verification-closed";
        execution.failure = {
          ...execution.failure,
          message: execution.failure?.message ?? "The public outcome was not proven either way.",
          reviewedAt: now(),
          reviewDisposition: "operator_action_required",
          reviewNote: note,
        };
        execution.reviewReason = note;
        execution.lease = undefined;
        execution.updatedAt = now();
        const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
        if (intent && intent.state === "active") {
          intent.state = "expired";
          intent.updatedAt = now();
        }
        const action = state.actions.find((item) => item.executionId === execution.id);
        if (action) {
          action.status = "skipped";
          action.reason = note;
        }
        if (execution.capabilityTrialId) {
          settleCapabilityTrialVerificationFailure(state, execution.capabilityTrialId, note);
        }
        state.events.unshift(event("execution", "Unverified outcome closed", "The operator closed this unresolved delivery without treating it as sent. A future action requires a new Social Intent.", "warning", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
        closed += 1;
      }
      if (closed) state.events.unshift(event("execution", "Unverified X outcomes closed", `${closed} unresolved X outcome${closed === 1 ? " was" : "s were"} closed without a verified public result.`, "warning"));
      return state;
    }
    case "retryExecution": {
      const execution = state.executions.find((item) => item.id === operation.id);
      const bridgePreWriteFailure = execution?.connector === "bridge"
        && ["ACCOUNT_MISMATCH", "ACCOUNT_NOT_READY", "INVALID_PROVENANCE", "TARGET_NOT_VISIBLE"].includes(execution.failure?.code ?? "");
      const targetLanguageCanRefresh = execution?.failure?.code === "TARGET_LANGUAGE_MISMATCH" && execution.target?.type === "x.post";
      if (!execution || !["failed", "blocked", "expired"].includes(execution.status) || execution.externalRef || (!bridgePreWriteFailure && !targetLanguageCanRefresh && execution.failure?.retryable === false) || execution.failure?.reviewedAt) return state;
      const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
      if (!intent || intent.state !== "active") return state;
      if (intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) return state;
      const nextStatus = execution.mode === "auto" ? (execution.connector ? "queued" : "awaiting-connector") : execution.mode === "review" ? "awaiting-review" : "awaiting-manual";
      execution.status = nextStatus;
      execution.failure = undefined;
      execution.reviewReason = undefined;
      execution.lease = undefined;
      execution.executedAt = undefined;
      if (bridgePreWriteFailure) {
        execution.permit = undefined;
        if (execution.publication?.publicExpression) {
          execution.publication = {
            ...execution.publication,
            publicExpression: {
              ...execution.publication.publicExpression,
              safetyStatus: "candidate",
              payloadHash: undefined,
            },
          };
        }
      }
      execution.updatedAt = now();
      const action = state.actions.find((item) => item.executionId === execution.id);
      if (action) action.status = nextStatus === "queued" ? "queued" : nextStatus === "awaiting-review" ? "review" : "skipped";
      state.events.unshift(event("execution", "Retry requested", "The operator asked OpenPresence to retry this same social action. No new Social Intent was created.", "positive", { presenceId: execution.presenceId, executionId: execution.id, intentId: execution.socialIntentId }));
      return state;
    }
    case "executeIntent": { const intent = state.socialIntents.find((item) => item.id === operation.id); if (!intent) return state; const execution = state.executions.find((item) => item.socialIntentId === intent.id); if (!execution || intent.state !== "active") return state; if (["awaiting-review", "awaiting-manual", "awaiting-connector", "claimed", "executing", "succeeded"].includes(execution.status)) { if (execution.status === "approved" && execution.bridgeId) execution.status = "queued"; else return state; } if (intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) { intent.state = "expired"; execution.status = "expired"; execution.updatedAt = now(); state.events.unshift(event("decision", "Intent expired", "The social moment passed before execution.", "quiet", { intentId: intent.id, executionId: execution.id })); return state; } if (execution.environment === "live" && execution.connector === "native") { execution.status = "blocked"; execution.failure = { code: "PUBLICATION_SECURITY_REQUIRED", message: "Live native execution must cross the sealed Public Expression writer boundary.", retryable: false }; execution.reviewReason = "Use the isolated native writer; direct application completion is forbidden."; execution.updatedAt = now(); state.events.unshift(event("execution", "Live execution blocked", "The runtime refused to complete a live native action outside the sealed Public Expression writer.", "warning", { intentId: intent.id, executionId: execution.id })); return state; } if (execution.bridgeId) { execution.status = "queued"; execution.updatedAt = now(); state.events.unshift(event("execution", "Queued for Bridge", "The execution is ready for an external executor.", "positive", { intentId: intent.id, executionId: execution.id })); return state; } execution.status = "succeeded"; execution.attempts += 1; execution.updatedAt = now(); execution.executedAt = now(); const outcome = { id: id("outcome"), socialIntentId: intent.id, executionId: execution.id, presenceId: intent.presenceId, status: "succeeded" as const, observedAt: now(), metrics: {} }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Execution completed", "The simulated channel accepted the action.", "positive", { intentId: intent.id, executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "markManualExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (!execution || execution.status !== "awaiting-manual") return state; execution.status = "succeeded"; execution.externalRef = operation.externalRef; execution.attempts += 1; execution.executedAt = now(); execution.updatedAt = now(); const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [operation.externalRef] }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Manual relay completed", "The operator marked the external action as posted.", "positive", { executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "setModel": { const profile = state.modelProfiles.find((item) => item.agentId === state.agent?.id); if (profile && operation.model.trim()) { profile.model = operation.model.trim(); if (operation.provider) profile.provider = operation.provider; if (operation.quality) profile.quality = operation.quality; if (operation.vision !== undefined) profile.capabilities = { ...profile.capabilities, vision: operation.vision }; else if (operation.provider) profile.capabilities = { ...profile.capabilities, vision: ["openai", "anthropic", "gemini"].includes(operation.provider) }; const connection = state.providerConnections.find((item) => item.provider === profile.provider && item.status !== "needs-configuration"); if (connection) profile.connectionId = connection.id; profile.updatedAt = now(); } return state; }
    case "wakePresence": { const target = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!target || target.status !== "paused") return state; const updated = { ...target, status: "live" as const }; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); if (state.presence?.id === updated.id) state.presence = updated; state.events.unshift(event("system", "Jenny woke up", "The Presence is active again and beginning its first attention cycle.", "positive", { presenceId: updated.id })); return state.nativeConnections.some((connection) => connection.presenceId === updated.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, updated); }
    case "runPulse": { const pulsePresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!pulsePresence || pulsePresence.status !== "live") return state; return state.nativeConnections.some((connection) => connection.presenceId === pulsePresence.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, pulsePresence); }
    case "syncNativeX": return state;
    case "startPlayground":
    case "syncPlaygroundTime":
    case "resetPlayground":
    case "inspectSandboxMedia":
    case "addSandboxEvent":
    case "advanceSandboxTime":
    case "runSandboxPulse":
    case "considerOriginalPublication":
    case "recordPreferenceEvidence": return state;
    case "approveSandboxIntroduction":
    case "declineSandboxIntroduction": return state;
    case "saveConversationStyle": {
      if (!state.agent || !state.presences.some((presence) => presence.id === operation.presenceId)) return state;
      const styles = state.conversationStyles ?? (state.conversationStyles = []);
      const saved = { ...operation.style, source: "custom" as const, channel: operation.style.channel || "x", updatedAt: now() };
      const existing = styles.findIndex((style) => style.id === saved.id);
      if (existing >= 0) styles[existing] = saved;
      else styles.unshift(saved);
      const presence = state.presences.find((item) => item.id === operation.presenceId)!;
      presence.conversationStyleId = saved.id;
      state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
      if (state.presence?.id === presence.id) state.presence = presence;
      state.events.unshift(event("system", "Conversational style saved", `${saved.name} is now active for ${presence.name}.`, "positive", { presenceId: presence.id }));
      return state;
    }
    case "setConversationStyle": {
      if (!state.agent) return state;
      const presence = state.presences.find((item) => item.id === operation.presenceId);
      const valid = BUILTIN_CONVERSATION_STYLES.some((style) => style.id === operation.styleId) || (state.conversationStyles ?? []).some((style) => style.id === operation.styleId && style.source === "custom");
      if (!presence || !valid) return state;
      presence.conversationStyleId = operation.styleId;
      state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
      if (state.presence?.id === presence.id) state.presence = presence;
      state.events.unshift(event("system", "Conversational style changed", "The Presence will use the selected style on its next social turn.", "positive", { presenceId: presence.id }));
      return state;
    }
    case "setPresence": { if (state.presence) { const patch = operation.patch as typeof operation.patch & { publicSelf?: PublicSelf }; const requestedConnectionMode = patch.connectionMode ?? state.presence.connectionMode ?? (state.presence.environment === "sandbox" ? "sandbox" : state.presence.channel === "x" ? "native" : "bridge"); const connectionMode = requestedConnectionMode === "native" && state.presence.channel !== "x" ? "bridge" as const : requestedConnectionMode; const name = patch.name?.trim() || state.presence.name; const mode = patch.mode ?? state.presence.mode; const posture = patch.publicSelf?.posture ?? state.presence.publicSelf?.posture; const compatiblePostures = mode === "ghost" ? ["representational", "open-about-assistance"] : ["contextual", "ai-forward", "private"]; const publicSelf = { ...(patch.publicSelf ?? state.presence.publicSelf ?? defaultPublicSelf(name, mode)), displayName: name, posture: compatiblePostures.includes(posture as never) ? posture! : defaultPublicSelf(name, mode).posture }; const mediaPerceptionPolicy = patch.mediaPerceptionPolicy ?? state.presence.mediaPerceptionPolicy ?? (mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const); const ghostProfile = normalizeGhostProfile(patch.ghostProfile ?? state.presence.ghostProfile ?? (mode === "ghost" ? defaultGhostProfile() : undefined)); const publishingInitiative = normalizePublishingInitiative(patch.publishingInitiative ?? state.presence.publishingInitiative); const updated = { ...state.presence, ...patch, ...(patch.curationSources ? { curationSources: normalizeCurationSources(patch.curationSources) } : {}), publishingInitiative: patch.publishingInitiative ? { ...publishingInitiative, updatedAt: now() } : publishingInitiative, mediaPerceptionPolicy, publicSelf, connectionMode, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, name, mode, ghostProfile, execution: patch.execution ? { ...state.presence.execution, ...patch.execution } : state.presence.execution }; const priorHandle = state.presence.handle.trim().replace(/^@/, "").toLowerCase(); const nextHandle = updated.handle.trim().replace(/^@/, "").toLowerCase(); const identityChanged = state.presence.channel === "x" && priorHandle !== nextHandle; updated.executionEnvelope = { ...state.presence.executionEnvelope, affordances: Object.fromEntries(channelCapabilities(state, updated.channel).map((item) => [item.id, { mode: updated.execution[item.id] ?? "off" }])) }; updated.context = compilePresenceContext(updated); if (patch.brief) recordChangeSet(state, "Update Presence Brief", [{ path: `presences.${updated.id}.brief`, action: "update", before: state.presence.brief as unknown as JsonValue, after: updated.brief as unknown as JsonValue }]); state.presence = updated; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); if (identityChanged) { const message = `The X identity changed to @${nextHandle}. Reconnect and verify this account before observing or acting.`; state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === updated.id && connection.kind === "x" ? { ...connection, status: "needs-attention" as const, healthMessage: message, observation: { ...connection.observation, status: "error" as const, error: message } } : connection); state.bridges = state.bridges.map((bridge) => bridge.presenceId === updated.id && bridge.channelId === "x" ? { ...bridge, accountIdentity: bridge.accountIdentity ? { ...bridge.accountIdentity, status: "mismatch" as const } : undefined } : bridge); } if (connectionMode === "native" && updated.channel === "x") { rebindQueuedExecutionsForNativeRoute(state, updated); unblockNativeExecutions(state, updated); } if (patch.publishingInitiative) { const linked = syncPublishingInitiativeAssignment(state, updated.id); state.assignments = linked.assignments; state.presences = linked.presences; state.presence = linked.presence; } const presenceFile = state.files.find((file) => file.kind === "PRESENCE"); if (presenceFile && state.agent) { presenceFile.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode, handle: updated.handle, accent: state.agent.accent }, state.presence ?? updated); presenceFile.revision += 1; presenceFile.updatedAt = now(); } } state.events.unshift(event("system", "Presence settings updated", state.presence?.status === "paused" ? "All external actions are paused." : "The new execution envelope is active.", state.presence?.status === "paused" ? "warning" : "positive", { presenceId: state.presence?.id })); return state; }
  }
  return state;
}


function makeCalendarSlot(instruction: string, presence: Presence | null, day = "Tuesday", time = "08:00", objective = "audience_growth", executionWindow = "08:00–11:00"): CalendarSlot { const clean = instruction.trim().replace(/[.!?]+$/, "") || "Teach the audience one useful thing"; const label = clean.length > 34 ? `${clean.slice(0, 34).trim()}…` : clean; const mode = presence?.execution.post ?? "review"; return { id: id("slot"), label, instruction: clean, day, time, objective, presence: presence?.id ?? "", mode, enabled: true, executionWindow }; }

export function recordCapabilityFeedback(before: OpenPresenceState, next: OpenPresenceState, presenceId?: string) {
  const id = presenceId ?? next.presence?.id;
  if (!id) return next;
  const previous = derivePresenceCapabilityManifest(before, id);
  const current = derivePresenceCapabilityManifest(next, id);
  const changes = current.items.flatMap((item) => {
    const prior = previous.items.find((candidate) => candidate.capability === item.capability);
    return prior && prior.availability !== item.availability ? [{ capability: item.capability, previousAvailability: prior.availability, nextAvailability: item.availability, provider: item.provider, detail: `${item.label} changed from ${prior.availability} to ${item.availability}${item.provider ? ` through ${item.provider}` : ""}.` }] : [];
  });
  return ensureCapabilityRequests(changes.length ? applyOperation(next, { type: "recordCapabilityChange", presenceId: id, changes }) : next, id);
}

/** Close a bounded capability trial honestly when no suitable opportunity was found. */
export function settleCapabilityTrialNoOpportunity(source: OpenPresenceState, trialId: string, message: string) {
  const trial = source.capabilityTrials.find((item) => item.id === trialId);
  if (!trial) return source;
  const wasOpen = !["completed", "expired", "failed", "cancelled"].includes(trial.status);
  trial.status = "completed";
  trial.result = "INCONCLUSIVE_NO_OPPORTUNITY";
  trial.lastError = message;
  trial.updatedAt = new Date().toISOString();
  const assignment = source.assignments.find((item) => item.id === trial.assignmentId);
  if (assignment && wasOpen) {
    assignment.status = "expired_incomplete";
    assignment.lastOutcome = { class: "incomplete", message, at: trial.updatedAt };
    assignment.updatedAt = trial.updatedAt;
  }
  return source;
}

/** Close a capability proof when delivery was attempted but never
 * authoritatively verified. The Assignment must not remain active after its
 * only execution has been terminally closed. */
export function settleCapabilityTrialVerificationFailure(source: OpenPresenceState, trialId: string, message: string) {
  const trial = source.capabilityTrials.find((item) => item.id === trialId);
  if (!trial || ["completed", "expired", "failed", "cancelled"].includes(trial.status)) return source;
  const at = new Date().toISOString();
  trial.status = "expired";
  trial.result = "FAIL_VERIFICATION";
  trial.lastError = message;
  trial.updatedAt = at;
  const assignment = source.assignments.find((item) => item.id === trial.assignmentId);
  if (assignment && !["completed", "cancelled"].includes(assignment.status)) {
    assignment.status = "expired_incomplete";
    assignment.lastOutcome = { class: "incomplete", message, at };
    assignment.updatedAt = at;
  }
  return source;
}

export { normalizeState };
export { bridgeAdapterStatus } from "./bridge-contract";
