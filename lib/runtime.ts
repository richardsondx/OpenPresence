import type { ActivitySummary, Agent, AgentFile, AgentModelProfile, AgentToolBinding, Asset, Assignment, AssignmentDelegationPolicy, AssignmentPlan, AssignmentPreflight, AssignmentQuantityMode, AssignmentReadinessCheck, Bridge, CalendarSlot, ChannelDefinition, ChangeSet, ChangeSetOperation, ChannelId, ConnectorCapabilities, CreateAgentInput, CreatePresenceInput, EntityRef, Execution, ExecutionEnvelope, ExplorationBrief, ExplorationFinding, ExplorationSession, ExplorationSessionStatus, FileKind, FileProposal, GhostProfile, GhostRepresentation, JsonValue, LiveEvent, MirrorObject, OpenPresenceState, Operation, OperatorDirective, Outcome, Presence, PresenceBrief, PresenceContext, PresenceConnectionMode, PresenceEnvironment, PresenceQuietHours, Publication, PublicFooting, PublicSelf, PublicDisclosurePosture, PublicTechnicalFact, PublicHistoryItem, RuntimeScope, SandboxAssetInput, SocialAssetKind, SocialDecision, SocialDecisionConfidence, SocialDecisionKind, SocialIntent, SocialOrigin, StandingIntent, SandboxEnvironment, PlaygroundSession, PreferenceEvidence, PreferenceReason, PreferenceReaction, OriginalPostRehearsalAttempt, Watch, WatchKind, LanguagePolicy, Scenario, ScenarioStimulus, ScenarioStimulusRequirements, ScenarioVersion, ScenarioRun, ScenarioRunProvenance, ScenarioRunEvaluation, StructuralFinding, PublishingInitiative, PublishingInitiativeProgress, PublishingPlan, PublishingPlanDraft, PublishingPlanWorkEvent, PresenceCapability, PresenceCapabilityManifest, PublicationMetricSnapshot, PresenceAudienceSnapshot } from "./types";
import { AGENT_CAPABILITY_DEFINITIONS, CHANNEL_CAPABILITIES, CHANNEL_EXTENSIONS, simulationForChannel } from "./types";
import { buildScenarioFromPrompt, builtinScenarioDefinitions, repairScenarioStimuli, scenarioFromImport, stableHash, validateScenarioFidelity } from "./scenarios";
import { DEFAULT_PRESENCE_LANGUAGE, effectiveLanguagePolicy, EMPTY_LANGUAGE_POLICY, languagesMatch, normalizeLanguagePolicy, normalizePresenceLanguage, normalizedObservedLanguage, validateLanguage } from "./language-policy";
import { createAssetPerception, createUninterpretedPerception, hasUsablePerception, mediaRequiresReview, perceptionRequirement } from "./perception";
import { epistemicState } from "./asset-intelligence";
import { isTestRuntime } from "./test-runtime";
import { createRememberedPerson, evidenceRefFromMirror, factForCorrection, relationshipCurationEligible, relationshipForPerson } from "./network-memory";
import { ensureConversationEpisode, settleConversationClosure, updateConversationEpisodeFromMirror } from "./conversation-episodes";
import { createPublicExpressionCandidate, PublicationSecurityError, verifyExecutionPermit } from "./publication-security";
import { publicExpressionLeakageReason } from "./public-expression";
import { normalizeMirrorObject } from "./mirror-content";
import { chromeBrowserBridgeCapabilities } from "./bridge-contract";
import type { RelationshipVisibility } from "./types";
import { addKnowledgeItem, archiveKnowledgeCollection, archiveKnowledgeItem, createKnowledgeCollection, setKnowledgeBinding, updateKnowledgeCollection, uploadKnowledgeVersion } from "./knowledge";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const channelName = (channel: ChannelId) => channel === "x" ? "X" : channel === "linkedin" ? "LinkedIn" : channel === "substack" ? "Substack" : channel;
const providerName = (provider: import("./types").ModelProvider) => provider === "openai" ? "OpenAI" : provider === "openrouter" ? "OpenRouter" : provider === "ollama" ? "Ollama" : provider === "anthropic" ? "Anthropic" : provider === "gemini" ? "Gemini" : provider === "custom" ? "Custom" : provider;

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
  BRAIN: { title: "How I think", subtitle: "Judgment before activity.", protected: true }, SOUL: { title: "Who I am", subtitle: "A character with a point of view.", protected: true }, MISSION: { title: "What I am here to do", subtitle: "A direction, not a dashboard target.", protected: true }, TASTE: { title: "What I consider good", subtitle: "The filter behind every public action.", protected: true }, MEMORY: { title: "What I should remember", subtitle: "Durable context and relationships.", protected: false }, GROWTH: { title: "What results have taught me", subtitle: "Evidence changes strategy, not identity.", protected: false }, PULSE: { title: "What keeps me active", subtitle: "Standing attention without hidden scheduler state.", protected: true }, PRESENCE: { title: "What role I inhabit here", subtitle: "A situated social self, not just a channel.", protected: true },
};

export function defaultPresenceBrief(agent?: Pick<Agent, "description" | "audience" | "topics">): PresenceBrief {
  const topics = agent?.topics?.filter(Boolean).slice(0, 8) ?? [];
  const territory = topics.length ? topics : ["Useful ideas"];
  return {
    purpose: agent?.description?.trim() ? `Become a recognizable, useful voice around ${territory.slice(0, 3).join(", ")}.` : "Become a recognizable, useful voice in this social world.",
    audience: agent?.audience?.trim() || "People who may find this Presence useful.",
    primaryTerritory: territory,
    adjacentTerritory: [],
    boundaries: [],
  };
}

function normalizePresenceBrief(value: Partial<PresenceBrief> | undefined, fallback: PresenceBrief): PresenceBrief {
  return {
    purpose: value?.purpose?.trim() || fallback.purpose,
    audience: value?.audience?.trim() || fallback.audience,
    primaryTerritory: value?.primaryTerritory?.map((item) => item.trim()).filter(Boolean) ?? fallback.primaryTerritory,
    adjacentTerritory: value?.adjacentTerritory?.map((item) => item.trim()).filter(Boolean) ?? fallback.adjacentTerritory,
    boundaries: value?.boundaries?.map((item) => item.trim()).filter(Boolean) ?? fallback.boundaries,
  };
}

const fileContent = (kind: FileKind, input: CreateAgentInput, presence?: Presence) => {
  const shared = `# ${kind}.md\n\n_OpenPresence meaning file._\n`;
  const content: Record<FileKind, string> = {
    BRAIN: `${shared}\nI observe before acting. I prefer evidence over assumption, context over generic advice, and the smallest useful action over activity for its own sake.\n\nWhen something happens, I recall what matters, consider several options, include DO_NOTHING, then choose the action worth leaving behind.\n\n## Public judgment\n\nStart from the specific object in front of me. Name the concrete detail, mechanism, tradeoff, or human point that makes it worth responding to. Broad virtues such as trust, quality, or transparency are not a contribution until they are tied to a real situation. Compress useful ideas into a clear claim, a contrast, a short list, or a next step.\n\nWhen a connection is genuinely useful, say who may fit and why. Offer a private introduction only when the fit is grounded; never invent a network match or turn a person into a lead. When I am wrong, correct myself plainly and keep moving.\n\n## Natural voice\n\nSpeak like a sharp, socially aware operator: direct, warm, curious, and comfortable being brief. Use plain words, contractions, short paragraphs, and varied sentence length. A quick reply may be lowercase when that feels natural; a real point may earn restrained emphasis. Let the idea carry the energy. Do not open with automatic praise, canned agreement, hashtags, engagement bait, or a question that exists only to keep the conversation alive. Do not make every reply sound like an explainer.\n\nFor replies, answer the exact sentence in front of me. Make one useful move: answer a narrow question, correct one fact gently, add one concrete detail, share one relevant observation, or ask one real follow-up. A good reply can be one sentence, often 8 to 35 words. Do not restate the post, summarize it, or give generic advice. Avoid filler frames such as \"I agree\", \"that's a great point\", \"it depends\", \"consider\", and \"have you considered\" unless the situation truly requires them. Match the scale of the reply to the scale of the idea. Use \"I think\", \"I don't know\", or \"not quite\" when uncertainty or correction is the honest move.\n\nHuman replies do not need to perform agreement. Start with the point, not applause. A small lived detail, a precise counterexample, or a useful permission can make a reply feel present; borrowed authority, status, and topic preferences do not. Voice is craft, not taste: never import another person's interests, politics, aesthetics, or worldview merely because their phrasing performs well.\n\nHumor is allowed when it understands the room: dry, lightly self-aware, and never at someone's expense. If a joke or exaggeration is ambiguous, inspect it or stay silent rather than literalizing it. Emoji are seasoning, not grammar. Usually use none; when one adds unmistakable tone, use at most one familiar emoji such as 👀 for curiosity or 🤝 for a real connection. Never stack decorative emoji.\n\nLow-information social cues are context-dependent. A fragment, punctuation mark, emoji, brief acknowledgment, or casual greeting is not automatically a question or a reply obligation. First decide whether it opens a real exchange in this thread and relationship. If it does, choose the smallest natural response, such as a quiet signal, tiny acknowledgment, or short clarifying question. If it does not, choose no_op. Never expand a one-character cue into an assistant-style onboarding prompt or invent a topic.\n\nI store conclusions and evidence, never hidden chains of thought.`,
    SOUL: `${shared}\nI am ${input.name}: curious, precise, warm without being performative, and slightly allergic to hype.\n\nI want people to feel more capable after encountering me. I can be playful, but never at the expense of someone's dignity.`,
    MISSION: `${shared}\nMy work is to become useful to ${input.audience || "people building thoughtful things"}.\n\nI am here to earn durable attention by making ${input.description || "clear, useful observations"} easier to understand. Growth is a consequence of being worth returning to.`,
    TASTE: `${shared}\nI notice original thinking, honest uncertainty, specific examples, and ideas that make a person more capable.\n\nI do not post filler, manufacture controversy, or repeat a point merely because it performed once. Silence is better than a forgettable contribution.`,
    MEMORY: `${shared}\n## Durable context\n\nNo durable memories yet. I will keep only context that helps future judgment.`,
    GROWTH: `${shared}\n## Current strategy\n\nStill learning. Results may change tactics faster than they change identity.`,
    PULSE: `${shared}\n## Standing attention\n\nListen for relevant conversations, maintain important relationships, honor scheduled intent, and reflect on outcomes. Skip anything that is not worth saying.\n\n## Launch\n\nWhen a Presence has no public footing, understand where it is, inspect the current channel, and choose one strong first move that establishes why it is worth hearing from. Do not wait indefinitely for inbound attention that cannot exist yet. Once meaningful public footing exists, this program becomes dormant.`,
    PRESENCE: `${shared}\n## ${presence ? `${channelName(presence.channel)} · ${presence.handle}` : "Current Presence"}\n\nI speak as ${presence?.mode === "ghost" ? "the operator, extending their attention and judgment" : "myself"}. I adapt to this social world without flattening worthwhile ideas.\n\n## Presence brief\n\n### Purpose\n${presence?.brief.purpose ?? "Become a recognizable, useful voice in this social world."}\n\n### Audience\n${presence?.brief.audience ?? "People who may find this Presence useful."}\n\n### Primary territory\n${presence?.brief.primaryTerritory?.join(", ") || "Not narrowed yet."}\n\n### Adjacent territory\n${presence?.brief.adjacentTerritory?.join(", ") || "None specified yet."}\n\n### Boundaries\n${presence?.brief.boundaries?.join(", ") || "None specified yet."}\n\nThis brief specializes the Agent for this place. It does not replace the Agent's Mission, Soul, or Taste. Boundaries guide public expression and amplification; they do not make me blind to the surrounding world.\n\n## Public self\n\nI appear here as ${presence?.name ?? "this Presence"}. My public disclosure posture is ${presence?.publicSelf.posture ?? "contextual"}. Respond socially and naturally from this Presence identity. Do not volunteer implementation details.\n\n## Media understanding\n\nPerception explains what an attached asset appears to mean. Taste decides whether it is good or worth acting on. If media is not successfully interpreted, do not infer its contents. This Presence uses ${presence?.mediaPerceptionPolicy ?? "use-judgment"} when uncertainty remains.\n\nTreat people as people, not engagement opportunities.`,
  };
  return content[kind];
};

export function initialState(): OpenPresenceState {
  return { onboarded: false, agent: null, presence: null, presences: [], activePresenceId: null, files: [], proposals: [], messages: [], conversations: [], activeConversationId: null, presenceChatSessions: [], agentRequests: [], capabilityChangeEvents: [], events: [], socialDecisions: [], calendar: [], assignments: [], growthReviews: [], growthFileVersions: [], audienceSnapshots: [], publicationMetricSnapshots: [], watches: [], explorations: [], discoveryPlans: [], explorationSessions: [], explorationFindings: [], actions: [], publishingPlans: [], metrics: { qualifiedFollows: 0, conversations: 0, opportunitiesIgnored: 0, audienceHealth: 98 }, modelProfiles: [], providerConnections: [], assetProviderConnections: [], toolBindings: [], changeSets: [], standingIntents: [], operatorDirectives: [], socialIntents: [], executions: [], outcomes: [], publications: [], assetUsages: [], sourceEvidence: [], claimGrounding: [], preferenceEvidence: [], originalPostRehearsals: [], librarySources: [], assets: [], perceptions: [], assetResearchSessions: [], skills: [], agentSkills: [], contentDrops: [], channelDefinitions: builtinChannelDefinitions(), nativeConnections: [], bridges: [], mirrorObjects: [], mirrorEvents: [], bridgeSync: [], conversationEpisodes: [], assignmentContributions: [], people: [], personIdentities: [], relationships: [], relationshipFacts: [], relationshipOpenLoops: [], recommendationRecords: [], introductionRecords: [], sandboxEnvironments: [], playgroundSessions: [], sandboxActors: [], networkSearches: [], networkIntroductions: [], scenarios: [], scenarioVersions: [], scenarioRuns: [], scenarioRunProvenance: [], scenarioEvaluations: [], knowledgeCollections: [], knowledgeItems: [], knowledgeVersions: [], knowledgeSegments: [], presenceKnowledgeBindings: [], knowledgeRetrievalRuns: [], knowledgeCitations: [], agents: [], activeAgentId: null, agentWorkspaces: [] };
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
export function derivePresenceCapabilityManifest(source: OpenPresenceState, presenceId?: string): PresenceCapabilityManifest {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) return { presenceId: presenceId ?? "", channel: "x", generatedAt: now(), bodyStatus: "unavailable", items: [] };
  const channelIds = new Set(channelCapabilities(state, presence.channel).map((item) => item.id));
  // Connector selection is capability-first: a configured native X body is
  // preferred even when a Bridge is also available. The Bridge is the
  // fallback for capabilities the native body cannot perform.
  const native = state.nativeConnections.find((item) => item.presenceId === presence.id && item.channelId === presence.channel);
  const bridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const bridgeConnected = Boolean(bridge && bridgeAdapterIsConnected(bridge));
  const nativeWritable = Boolean(native && native.access === "read-write" && (native.status === "connected" || (native.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(native.healthMessage ?? native.deliveryError ?? ""))));
  const nativeAction = (action: string) => Boolean(nativeWritable && ["post", "reply", "like", "repost", "quote", "follow"].includes(action));
  const nativeReadable = Boolean(native && nativeConnectionCanObserve(native));
  const bridgeAction = (action: string) => Boolean(bridgeConnected && bridge?.capabilities.affordances.some((item) => item === action || item === `${presence.channel}.${action}`));
  const bridgeMetric = (metric: string) => Boolean(bridgeConnected && bridge?.capabilities.metrics.some((item) => item === metric || item.includes(metric)));
  const actionItem = (action: string, supported = channelIds.has(action)): PresenceCapability => {
    const nativeCan = supported && nativeAction(action);
    const bridgeCan = supported && bridgeAction(action);
    const canExecute = nativeCan || bridgeCan;
    const requiresBrowser = !nativeCan && bridgeCan;
    const canVerify = nativeCan ? true : bridgeCan ? Boolean(bridge?.capabilities.reconcile) : false;
    const configuredMode = presence.execution[action];
    const limitation = canExecute ? undefined : !supported ? `${capabilityLabel[action] ?? action} is not supported by ${channelName(presence.channel)}.` : bridge && !bridgeConnected ? `${capabilityLabel[action] ?? action} requires the connected browser body.` : `No connected ${channelName(presence.channel)} body can perform this action.`;
    return { capability: action, label: capabilityLabel[action] ?? action, availability: canExecute && canVerify ? "available" : bridge && !bridgeConnected && supported ? "temporarily-unavailable" : "unavailable", executionMode: configuredMode, provider: nativeCan ? "Native X" : bridgeCan ? "Browser Bridge" : undefined, requiresBrowser, canObserve: nativeCan || bridgeCan, canExecute, canVerify, limitation };
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
    return { capability: kind, label: capabilityLabel[kind], availability: canExecute && canVerify ? "available" : bridge && !bridgeConnected ? "temporarily-unavailable" : "unavailable", provider: nativeCan ? "Native X" : bridgeCan ? "Browser Bridge" : undefined, requiresBrowser: !nativeCan && bridgeCan, canObserve: canExecute, canExecute, canVerify, limitation: canExecute ? undefined : "The connected channel does not currently support this media type." };
  };
  items.push(mediaItem("image"));
  items.push(mediaItem("video"));
  const requiredBody = items.some((item) => item.requiresBrowser && item.availability === "available");
  const bodyStatus = presence.status === "paused" ? "unavailable" : requiredBody && !bridgeConnected ? "degraded" : native || bridgeConnected ? "ready" : "unavailable";
  return { presenceId: presence.id, channel: presence.channel, generatedAt: now(), bodyStatus, items };
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
  return bridge.state !== "offline" && Boolean(bridge.lastHeartbeatAt && Date.now() - new Date(bridge.lastHeartbeatAt).getTime() < 90_000);
}

export function latestAudienceSnapshot(source: OpenPresenceState, presenceId: string) {
  return normalizeState(source).audienceSnapshots.filter((item) => item.presenceId === presenceId).sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())[0];
}

export function audienceDeltas(source: OpenPresenceState, presenceId: string) {
  const snapshots = normalizeState(source).audienceSnapshots.filter((item) => item.presenceId === presenceId).sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
  const latest = snapshots.at(-1);
  const since = (days: number) => {
    if (!latest) return undefined;
    const cutoff = new Date(new Date(latest.observedAt).getTime() - days * 86_400_000);
    const prior = snapshots.filter((item) => new Date(item.observedAt) <= cutoff).at(-1);
    return prior ? latest.followers - prior.followers : undefined;
  };
  return { current: latest?.followers, daily: since(1), sevenDay: since(7), twentyEightDay: since(28) };
}

function comparableSnapshots(source: OpenPresenceState, presenceId: string, mirrorObjectId: string, ageSeconds: number) {
  return normalizeState(source).publicationMetricSnapshots.filter((item) => item.presenceId === presenceId && item.mirrorObjectId !== mirrorObjectId && Math.abs(item.publicationAgeSeconds - ageSeconds) <= Math.max(21_600, ageSeconds * 0.25));
}

function median(values: number[]) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return undefined;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function publicationMetricBaseline(source: OpenPresenceState, snapshot: PublicationMetricSnapshot) {
  const prior = comparableSnapshots(source, snapshot.presenceId, snapshot.mirrorObjectId, snapshot.publicationAgeSeconds);
  const relative: NonNullable<PublicationMetricSnapshot["baseline"]>["relative"] = {};
  for (const metric of ["impressions", "likes", "replies", "reposts", "quotes"] as const) {
    const baseline = median(prior.map((item) => item[metric]).filter((value): value is number => typeof value === "number"));
    const value = snapshot[metric];
    if (baseline && typeof value === "number") relative[metric] = Number((value / baseline).toFixed(2));
  }
  return { comparableCount: prior.length, confidence: prior.length >= 20 ? "high" as const : prior.length >= 5 ? "medium" as const : "low" as const, relative };
}

/**
 * Promote only an actual two-way interaction into Network Memory. Passive
 * observations, directory entries, searches, and Watches remain world
 * evidence until the operator explicitly chooses Remember or the Agent has
 * actually continued the interaction.
 */
export function curateRelationshipFromMirror(source: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  if (!state.agent || !relationshipCurationEligible(state, object, presenceId)) return state;
  const actor = object.author;
  const externalActorId = actor?.externalRef?.id;
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || !externalActorId || !actor?.externalRef?.type) return state;
  const existingIdentity = state.personIdentities.find((identity) => identity.channel === object.channelId && identity.externalActorId === externalActorId);
  const existingPerson = existingIdentity ? state.people.find((person) => person.id === existingIdentity.personId) : undefined;
  const existingRelationship = existingPerson ? relationshipForPerson(state, existingPerson.id) : undefined;
  const occurredAt = object.occurredAt ?? object.observedAt;
  if (existingRelationship?.state === "forgotten" && existingRelationship.forgottenAt && new Date(occurredAt).getTime() <= new Date(existingRelationship.forgottenAt).getTime()) return state;
  const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId, channel: object.channelId, externalActorId, displayName: actor.displayName, handle: actor.handle, avatarUrl: actor.avatarUrl, source: "current-context" }, state.people, state.personIdentities, state.relationships);
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
  state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId))];
  state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
  const statement = actor.displayName + " said: " + (object.content?.text?.trim().slice(0, 360) ?? "[no text]");
  const relationshipId = remembered.relationship.id;
  const duplicate = state.relationshipFacts.some((fact) => fact.relationshipId === relationshipId && fact.statement === statement && fact.provenanceRefs.some((ref) => ref.id === object.id));
  if (!duplicate) state.relationshipFacts.unshift({ id: id("relationship-fact"), relationshipId, statement, epistemicKind: "stated_by_person", confidence: "high", provenanceRefs: [evidenceRefFromMirror(object)], visibility: object.visibility === "public" ? "public" : `presence:${presenceId}`, validFrom: occurredAt, createdAt: timestamp });
  state.events.unshift(event("memory", "Relationship curated", `${remembered.person.displayName} now has selective relationship continuity from a meaningful interaction.`, "positive", { presenceId, sourceObjectId: object.id }));
  return state;
}

function makeFiles(input: CreateAgentInput, presence: Presence): AgentFile[] { return (Object.keys(fileMeta) as FileKind[]).map((kind) => ({ kind, ...fileMeta[kind], content: fileContent(kind, input, presence), revision: 1, updatedAt: now() })); }
function event(type: LiveEvent["type"], title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "presenceId" | "intentId" | "executionId" | "outcomeId" | "decisionId" | "sessionId" | "sourceObjectId">): LiveEvent { return { id: id("evt"), type, title, detail, time: now(), tone, ...lineage }; }

export interface SocialDecisionInput {
  decision: SocialDecisionKind;
  focalMirrorObjectIds?: string[];
  origin?: SocialOrigin;
  summary?: string;
  influences?: string[];
  confidence?: SocialDecisionConfidence;
  closestAlternative?: SocialDecisionKind;
  closestAlternativeReason?: string;
  plannerRunId?: string;
}

function socialDecisionLabel(decision: SocialDecisionKind) {
  return decision === "no_op" ? "silence" : decision === "original_post" ? "an original post" : `a ${decision}`;
}

function createSocialDecision(state: OpenPresenceState, input: SocialDecisionInput, socialIntentId?: string): SocialDecision | undefined {
  if (!state.agent || !state.presence) return undefined;
  return {
    id: id("decision"),
    agentId: state.agent.id,
    presenceId: state.presence.id,
    environment: state.presence.environment ?? "live",
    focalMirrorObjectIds: [...new Set((input.focalMirrorObjectIds ?? []).filter(Boolean))].slice(0, 6),
    origin: input.origin,
    decision: input.decision,
    summary: input.summary?.trim() || `The Presence selected ${socialDecisionLabel(input.decision)} from the available channel context.`,
    influences: [...new Set((input.influences ?? ["Mission", "Taste", "Current social context"]).map((value) => value.trim()).filter(Boolean))].slice(0, 5),
    confidence: input.confidence ?? "medium",
    closestAlternative: input.closestAlternative,
    closestAlternativeReason: input.closestAlternativeReason?.trim() || undefined,
    socialIntentId,
    plannerRunId: input.plannerRunId,
    createdAt: now(),
  };
}

export function recordSocialDecision(source: OpenPresenceState, input: SocialDecisionInput) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const decision = createSocialDecision(state, input);
  if (decision) state.socialDecisions.unshift(decision);
  return state;
}

const activityObservationTitles = new Set(["Pulse completed", "New mention received", "Social Mirror updated", "X observation failed", "Considering first public move", "Reply observed", "Calendar attention started", "Calendar evaluation unavailable", "Publishing plan requested", "Publishing plan unavailable"]);
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
  assignment.origin = "publishing_initiative";
  assignment.activation = { type: "continuous" };
  assignment.instruction = isPace ? `Aim for ${quantity ?? 1} original posts per ${initiative.target?.period ?? "day"}.` : "Maintain a useful original presence when there is something worth publishing.";
  assignment.deliverable = { type: isPace ? "original_publication" : "maintain_original_presence", quantity, quantityMode: mode };
  assignment.quantityPolicy = { quantity: quantity ?? "agent_planned", mode, period: initiative.target?.period ?? "assignment", timezone: initiative.timezone };
  assignment.status = assignment.status === "completed" && isPace && (assignment.progress.verified >= (quantity ?? 0)) ? "completed" : "active";
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

export function derivePublishingProgress(source: OpenPresenceState, presenceId?: string, at: string | number | Date = new Date()): PublishingInitiativeProgress {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  const initiative = normalizePublishingInitiative(presence?.publishingInitiative);
  const period = initiative.target?.period ?? "day";
  const periodStart = periodKey(at, period, initiative.timezone);
  const verifiedOriginals = presence
    ? derivePublicHistory(state, presence.id).filter((item) => item.kind === "post" && !item.parentExternalRef && periodKey(item.occurredAt, period, initiative.timezone) === periodStart).length
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

export function derivePublishingPlanProjection(source: OpenPresenceState, presenceId?: string, at: string | number | Date = new Date()): PublishingPlan | undefined {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || presence.publishingInitiative.mode === "off") return undefined;
  const environment = planEnvironmentFor(presence);
  const plan = [...state.publishingPlans]
    .filter((item) => item.presenceId === presence.id && item.environment === environment && item.status !== "superseded")
    .sort((left, right) => right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!plan) return undefined;
  const atMs = at instanceof Date ? at.getTime() : typeof at === "number" ? at : new Date(at).getTime();
  const verifiedOriginals = derivePublicHistory(state, presence.id).filter((item) => item.kind === "post" && !item.parentExternalRef && item.environment === environment && new Date(item.occurredAt).getTime() >= new Date(plan.horizonStart).getTime() && new Date(item.occurredAt).getTime() <= new Date(plan.horizonEnd).getTime()).length;
  const windows = plan.windows.map((window) => ({ ...window, status: window.status === "completed" ? "completed" as const : atMs >= new Date(window.endAt).getTime() ? "completed" as const : atMs >= new Date(window.startAt).getTime() ? "active" as const : "future" as const }));
  return { ...plan, verifiedOriginals, windows };
}

function activePublishingPlanFor(source: OpenPresenceState, presenceId: string, environment: PresenceEnvironment) {
  return [...source.publishingPlans]
    .filter((item) => item.presenceId === presenceId && item.environment === environment && item.status !== "superseded")
    .sort((left, right) => right.revision - left.revision || right.updatedAt.localeCompare(left.updatedAt))[0];
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

export function replacePublishingPlan(source: OpenPresenceState, input: { presenceId?: string; environment?: PresenceEnvironment; draft: PublishingPlanDraft; modelProvider?: string; modelId?: string }) {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (input.presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence || presence.publishingInitiative.mode === "off" || !state.agent) return state;
  const environment = input.environment ?? planEnvironmentFor(presence);
  const timestamp = now();
  const previous = state.publishingPlans.filter((item) => item.presenceId === presence.id && item.environment === environment && item.status !== "superseded");
  state.publishingPlans = state.publishingPlans.map((item) => previous.some((old) => old.id === item.id) ? { ...item, status: "superseded" as const, updatedAt: timestamp } : item);
  const initiative = presence.publishingInitiative;
  const plan: PublishingPlan = {
    id: id("publishing-plan"), agentId: state.agent.id, presenceId: presence.id, environment,
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
  const prior = state.publishingPlans.find((item) => item.presenceId === presence.id && item.environment === planEnvironmentFor(presence) && item.status !== "superseded");
  if (prior) {
    prior.status = "blocked";
    prior.rationaleSummary = message.slice(0, 500);
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
  return recordPublicFooting(state, presenceId, { ...footing, judgedInboundIds });
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

export function recordNativeObservation(source: OpenPresenceState, presenceId: string, observation: OpenPresenceState["nativeConnections"][number]["observation"]) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === presenceId && connection.kind === "x"
    ? nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? "")
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: connection.deliveryError ?? connection.healthMessage, observation, updatedAt: now() }
      : { ...connection, observation, updatedAt: now() }
    : connection);
  return state;
}

export function recordNativeMirror(source: OpenPresenceState, input: { connectionId: string; presenceId: string; own?: boolean; post: { id: string; text: string; language?: string; createdAt?: string; authorId?: string; authorUsername?: string; authorName?: string; authorAvatarUrl?: string; conversationId?: string; parentId?: string; referencedPosts?: Array<{ type: "replied_to" | "quoted" | "retweeted"; id: string }>; media?: Array<{ mediaKey: string; type: "photo" | "video" | "animated_gif"; url?: string; previewImageUrl?: string; altText?: string }> } }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  // Keep unverified provider data auditable, but never admit a confirmed
  // non-English observation to this Presence. Feed and cognition projections
  // reject unknown language as well, so a missing provider tag cannot bypass
  // the English-only boundary.
  if (!input.own && input.post.language !== undefined && !languagesMatch(presence?.language, input.post.language)) return state;
  const receivedAt = now();
  const sourceEventId = `native-x:${input.connectionId}:${input.post.id}`;
  const existing = state.mirrorObjects.find((item) => item.presenceId === input.presenceId && item.externalRef.type === "x.post" && item.externalRef.id === input.post.id);
  const mediaRefs = (input.post.media ?? []).flatMap((media) => {
    const sourceUrl = media.url ?? media.previewImageUrl;
    if (!sourceUrl) return [];
    const type = media.type === "photo" ? "image" : media.type === "animated_gif" ? "gif" : "video";
    const asset = state.assets.find((item) => item.presenceId === input.presenceId && item.provenance.sourceUrl === sourceUrl)
      ?? { id: id("asset"), agentId: state.agent?.id ?? "", presenceId: input.presenceId, type, mediaKind: type, status: "ready" as const, nature: "observed" as const, rights: { status: "unknown" as const }, provenance: { origin: "native-x", sourceUrl, publisher: "X", author: input.post.authorUsername, importedAt: receivedAt, sourceIdentityStatus: "unknown" as const }, description: media.altText ?? `X ${type} attachment`, mimeType: type === "image" ? "image/jpeg" : undefined, visibility: "public" as const, shareability: "presence-only" as const, environment: "live" as const, createdAt: receivedAt, updatedAt: receivedAt };
    if (!state.assets.some((item) => item.id === asset.id)) state.assets.unshift(asset);
    return [{ assetId: asset.id, kind: type as "image" | "video" | "gif", role: "attachment" as const }];
  });
  const matchingExecution = state.executions.find((execution) => execution.presenceId === input.presenceId && execution.connector === "native" && execution.status === "succeeded" && execution.externalRef?.type === "x.post" && execution.externalRef.id === input.post.id);
  const verifiedAssignmentId = matchingExecution?.assignmentId ?? existing?.assignmentId;
  const objectType = matchingExecution?.affordance === "x.reply" || (input.own && Boolean(input.post.parentId)) ? "reply" : existing?.objectType ?? "post";
  const object = { id: existing?.id ?? id("mirror"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, channelId: "x" as const, externalRef: { type: "x.post", id: input.post.id }, parentExternalRef: input.post.parentId ? { type: "x.post", id: input.post.parentId } : undefined, conversationExternalRef: input.post.conversationId, referencedExternalRefs: input.post.referencedPosts?.map((reference) => ({ type: "x.post", id: reference.id })), objectType, language: input.post.language, author: { externalRef: input.post.authorId ? { type: "x.user", id: input.post.authorId } : undefined, displayName: input.post.authorName ?? (input.post.authorUsername ? `@${input.post.authorUsername}` : "X user"), handle: input.post.authorUsername, avatarUrl: input.post.authorAvatarUrl }, content: { text: input.post.text }, assetRefs: mediaRefs.length ? mediaRefs : existing?.assetRefs, occurredAt: input.post.createdAt, observedAt: receivedAt, visibility: "public" as const, shareability: "presence-only" as const, originExecutionId: matchingExecution?.id ?? existing?.originExecutionId, assignmentId: verifiedAssignmentId, actorPresenceId: existing?.actorPresenceId ?? (input.own ? input.presenceId : undefined), sourceEventId, archived: false, environment: "live" as const, source: "native" as const, trust: "untrusted_world_content" as const };
  if (existing) {
    state.mirrorObjects = state.mirrorObjects.map((item) => item.id === existing.id ? object : item);
  } else {
    state.mirrorObjects.unshift(object);
  }
  if (!state.mirrorEvents.some((item) => item.externalRef.type === "x.post" && item.externalRef.id === input.post.id && item.event === "created")) {
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, sourceEventId, event: existing ? "updated" : "created", externalRef: { type: "x.post", id: input.post.id }, receivedAt });
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
  return curationTarget ? curateRelationshipFromMirror(state, curationTarget, input.presenceId) : state;
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

const publicHistoryKinds = new Set(["post", "reply", "comment", "quote", "repost", "thread"]);

/** Keep the Feed on the active Presence's channel and execution environment. */
export function publicHistoryMatchesPresence(item: PublicHistoryItem, presence?: Presence | null) {
  if (!presence || item.channel !== presence.channel) return false;
  return presence.environment === "sandbox" ? item.environment === "sandbox" : item.environment !== "sandbox";
}

function historyKind(value: string): PublicHistoryItem["kind"] | undefined {
  const normalized = value.split(".").at(-1) ?? value;
  return publicHistoryKinds.has(normalized) ? normalized as PublicHistoryItem["kind"] : undefined;
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
  if (input.channelId === "x" && ["x.post", "x.reply", "x.comment", "x.quote", "x.repost", "x.thread"].includes(type)) {
    const handle = authorHandle?.replace(/^@/, "").trim();
    return handle ? `https://x.com/${encodeURIComponent(handle)}/status/${id}` : `https://x.com/i/status/${id}`;
  }
  if (input.channelId === "linkedin" && ["linkedin.post", "linkedin.reply", "linkedin.comment", "linkedin.share"].includes(type)) {
    return `https://www.linkedin.com/feed/update/${id}`;
  }
  return undefined;
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
export function derivePublicHistory(source: OpenPresenceState, presenceId?: string): PublicHistoryItem[] {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
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
      const kind = historyKind(object.objectType);
      if (!kind) continue;
      const execution = object.originExecutionId ? succeeded.get(object.originExecutionId) : undefined;
      const intent = execution ? state.socialIntents.find((item) => item.id === execution.socialIntentId) : undefined;
      const ownNativePost = presence.channel === "x" && kind === "post" && ownPostIds.has(object.externalRef.id);
      const publicHandle = (presence.context.publicIdentity.handle ?? presence.handle).replace(/^@/, "").toLowerCase();
      const authorHandle = object.author?.handle?.replace(/^@/, "").toLowerCase();
      const authoredByIdentity = Boolean(publicHandle && authorHandle && publicHandle === authorHandle);
      const attributedToPresence = object.actorPresenceId === presence.id || ownNativePost || authoredByIdentity || Boolean(object.originExecutionId && succeeded.has(object.originExecutionId));
      if (!attributedToPresence) continue;
      const outcome = execution ? state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded") : undefined;
      result.set(`${presence.id}:${object.externalRef.type}:${object.externalRef.id}`, {
        id: object.id,
        presenceId: presence.id,
        kind,
        channel: object.channelId,
        text: object.content?.text,
        authorAvatarUrl: object.author?.avatarUrl ?? (attributedToPresence ? nativeAccount?.profileImageUrl : undefined),
        occurredAt: object.occurredAt ?? object.observedAt,
        observedAt: object.observedAt,
        externalRef: object.externalRef,
        parentExternalRef: object.parentExternalRef,
        executionId: execution?.id ?? object.originExecutionId,
        publicationId: execution?.publication?.id,
        origin: execution?.publication?.origin ?? intent?.origin,
        assetIds: object.assetRefs?.map((ref) => ref.assetId),
        environment: object.environment,
        externalUrl: publicHistoryExternalUrl(state, presence, object.externalRef, object.environment, object.author?.handle),
        availability: object.archived ? "deleted" : "available",
        metrics: outcome?.metrics ?? {},
      });
    }
  }
  return [...result.values()].sort((left, right) => {
    const leftTime = left.environment === "sandbox" ? left.observedAt : left.occurredAt;
    const rightTime = right.environment === "sandbox" ? right.observedAt : right.occurredAt;
    return rightTime.localeCompare(leftTime) || right.occurredAt.localeCompare(left.occurredAt);
  });
}

export function recordRuntimeEvent(source: OpenPresenceState, presenceId: string, title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "intentId" | "executionId" | "outcomeId" | "decisionId" | "sessionId" | "sourceObjectId">) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.events.unshift(event("system", title, detail, tone, { presenceId, ...lineage }));
  return state;
}

export function markNativeConnectionNeedsAttention(source: OpenPresenceState, presenceId: string, message: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const deliveryOnlyFailure = nativeDeliveryFailureIsConnectionScoped(message);
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === presenceId && connection.kind === "x"
    ? deliveryOnlyFailure
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: message, updatedAt: now() }
      : { ...connection, status: "needs-attention" as const, healthMessage: message, deliveryError: undefined, updatedAt: now() }
    : connection);
  return recordRuntimeEvent(state, presenceId, deliveryOnlyFailure ? "X delivery needs attention" : "X connection needs attention", message, "warning");
}

// A rejected reply target is a failed action, not evidence that the native
// connection itself is unhealthy. Keep the connector available for unrelated
// actions such as original posts while retaining the delivery error for review.
export function nativeDeliveryFailureIsConnectionScoped(message: string) {
  // A target-policy rejection means the requested interaction is not allowed
  // for that post. It does not invalidate credentials or original-post
  // delivery, so keep the native connection healthy for unrelated actions.
  return /no API credits remaining|temporarily rate-limited|you can only reply to or quote posts where you are mentioned or are the author/i.test(message);
}

/**
 * Read access is independent from the native writer's health. A write-only
 * permission failure must not force follower or publication evidence through
 * the browser Bridge when the API can still read it.
 */
export function nativeConnectionCanObserve(connection: Pick<OpenPresenceState["nativeConnections"][number], "access" | "status" | "observation">) {
  return (connection.access === "read" || connection.access === "read-write")
    && (connection.status === "connected" || connection.observation?.status === "up-to-date");
}

export function isLaunchCandidate(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || presence.id !== presenceId) return false;
  const footing = presence.context.publicFooting;
  const successfulPost = state.executions.some((execution) => execution.presenceId === presenceId && execution.affordance === "x.post" && execution.status === "succeeded");
  return !successfulPost && (footing?.postsPublished ?? 0) === 0;
}

export function finishPulse(source: OpenPresenceState, presenceId: string, detail: string, lineage?: Pick<LiveEvent, "intentId" | "executionId" | "outcomeId" | "sessionId" | "sourceObjectId">) {
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

export function deriveActivitySummary(source: OpenPresenceState, presenceId?: string): ActivitySummary {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
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
    if (activityEnvironment === "sandbox") return !item.sessionId || activitySessionIds.has(item.sessionId);
    return !item.sessionId;
  };
  const isScopedExecution = (item: Execution) => {
    if (!presence || item.presenceId !== presence.id) return !presence;
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
  } else if (latestExecution?.status === "failed") {
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
  const publishingInitiative = derivePublishingProgress(state, presence?.id);
  return { current, lastPulseAt: pulseEvent?.time, nextAttention, nextIntent, needsAttention: { count: reviewCount, label: reviewCount ? "Needs review" : "No review items", detail: reviewCount ? `${reviewCount} action${reviewCount === 1 ? "" : "s"} waiting for approval.` : "Nothing is waiting for your decision." }, rhythm, publishingInitiative, publishingPlan: derivePublishingPlanProjection(state, presence?.id) };
}

function growthAssignmentFor(source: OpenPresenceState, presenceId: string, assignmentId?: string) {
  const assignments = source.assignments.filter((assignment) => assignment.presenceId === presenceId && assignment.successEvidence?.kind === "metric_threshold" && !["cancelled", "completed"].includes(assignment.status));
  return assignmentId ? assignments.find((assignment) => assignment.id === assignmentId) : assignments.find((assignment) => ["active", "working", "accepted", "planning"].includes(assignment.status)) ?? assignments[0];
}

function applyGrowthInterpretation(state: OpenPresenceState, assignment: Assignment, review: import("./types").GrowthReview) {
  const file = state.files.find((item) => item.kind === "GROWTH");
  const plan = assignment.plan;
  if (!file || !plan) return;
  const scope = `${state.presences.find((item) => item.id === assignment.presenceId)?.channel ?? assignment.channelId}`;
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
    recordChangeSet(state, "Update GROWTH.md from evidence review", [{ path: "agentFiles.GROWTH", action: "update", before, after: lines }]);
  }
}

function createGrowthReview(source: OpenPresenceState, assignment: Assignment, kind: import("./types").GrowthReviewKind, modelDecision?: import("./types").GrowthReviewDecision) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const recent = state.growthReviews.find((item) => item.assignmentId === assignment.id && item.kind === kind && Date.now() - new Date(item.createdAt).getTime() < 86_400_000);
  if (recent) return state;
  const nowDate = new Date();
  const periodDays = kind === "strategic" ? 28 : 7;
  const periodEnd = nowDate.toISOString();
  const periodStart = new Date(nowDate.getTime() - periodDays * 86_400_000).toISOString();
  const deltas = audienceDeltas(state, assignment.presenceId);
  const recentMetrics = state.publicationMetricSnapshots.filter((snapshot) => snapshot.presenceId === assignment.presenceId && new Date(snapshot.observedAt).getTime() >= new Date(periodStart).getTime());
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
  const summary = modelDecision?.summary ?? `${kind === "strategic" ? "Strategic" : "Weekly"} review completed from ${state.audienceSnapshots.filter((item) => item.presenceId === assignment.presenceId).length} audience snapshot${state.audienceSnapshots.filter((item) => item.presenceId === assignment.presenceId).length === 1 ? "" : "s"} and ${recentMetrics.length} publication-performance snapshot${recentMetrics.length === 1 ? "" : "s"}. The current approach remains active unless repeated evidence justifies a change.`;
  const reviewedWorking = modelDecision?.working?.length ? modelDecision.working : working;
  const reviewedUncertain = modelDecision?.uncertain?.length ? modelDecision.uncertain : uncertain;
  const reviewedWeak = modelDecision?.weak?.length ? modelDecision.weak : weak;
  const persistedAssignment = state.assignments.find((item) => item.id === assignment.id);
  let changedPlan = false;
  let planChangeSummary: string | undefined;
  if (modelDecision?.plan && persistedAssignment?.plan) {
    const proposedPlan: AssignmentPlan = { ...persistedAssignment.plan, ...modelDecision.plan, id: id("assignment-plan"), assignmentId: persistedAssignment.id, revision: (persistedAssignment.plan.revision ?? 0) + 1, source: "agent", createdAt: periodEnd, updatedAt: periodEnd, nextWeeklyReviewAt: new Date(nowDate.getTime() + 7 * 86_400_000).toISOString(), nextStrategicReviewAt: new Date(nowDate.getTime() + 28 * 86_400_000).toISOString() };
    const beforePlan = JSON.stringify(persistedAssignment.plan);
    const afterPlan = JSON.stringify(proposedPlan);
    if (beforePlan !== afterPlan) {
      persistedAssignment.planHistory = [...(persistedAssignment.planHistory ?? []), proposedPlan];
      persistedAssignment.plan = proposedPlan;
      persistedAssignment.revision = (persistedAssignment.revision ?? 0) + 1;
      persistedAssignment.updatedAt = periodEnd;
      changedPlan = true;
      planChangeSummary = modelDecision.rationale ?? "The model-backed Growth Review revised the operating approach from observed evidence.";
    }
  }
  const review: import("./types").GrowthReview = { id: id("growth-review"), assignmentId: assignment.id, presenceId: assignment.presenceId, kind, periodStart, periodEnd, summary, working: reviewedWorking, uncertain: reviewedUncertain, weak: reviewedWeak, changedPlan, planChangeSummary, assignmentPlanRevision: persistedAssignment?.plan?.revision ?? assignment.plan?.revision, evidenceIds: [...state.audienceSnapshots.filter((item) => item.presenceId === assignment.presenceId).map((item) => item.id), ...recentMetrics.map((item) => item.id)], createdAt: periodEnd, reviewSource: modelDecision ? "model" : "deterministic" };
  applyGrowthInterpretation(state, persistedAssignment ?? assignment, review);
  if (persistedAssignment?.plan && !changedPlan) {
    const nextReviewAt = new Date(nowDate.getTime() + 7 * 86_400_000).toISOString();
    const nextStrategicAt = new Date(nowDate.getTime() + 28 * 86_400_000).toISOString();
    persistedAssignment.plan = { ...persistedAssignment.plan, nextWeeklyReviewAt: nextReviewAt, nextStrategicReviewAt: nextStrategicAt, updatedAt: periodEnd };
    assignment.plan = persistedAssignment.plan;
  }
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
  return `PUBLIC SELF BOUNDARY\nThis Presence appears publicly as ${presence.name}. ${postureGuidance[posture]}${presence.mode === "ghost" ? `\nRepresented identity: ${representedIdentity}.` : ""}\nApproved technical facts that may be disclosed when relevant: ${facts}. Never invent or volunteer unapproved implementation details.`;
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
  const presence = { id: presenceId, channel: input.channel, name, handle: input.handle.trim(), mode: input.mode, status: "live" as const, accent: input.accent, capabilities, execution, executionEnvelope: makeEnvelope(presenceId, capabilities, execution), context, brief, publicSelf, mediaPerceptionPolicy: input.mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const, language: DEFAULT_PRESENCE_LANGUAGE, languagePolicy: { ...EMPTY_LANGUAGE_POLICY }, ghostProfile: input.mode === "ghost" ? defaultGhostProfile() : undefined, pacing: "recommended" as const, attentionIntervalMinutes: 5, quietHours: { enabled: false, start: "22:00", end: "07:00" }, publishingInitiative, accountHealth: "healthy" as const, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, connectionMode, browserAccess: { enabled: false } };
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
function defaultBindings(agentId: string): AgentToolBinding[] { return ["web.search", "asset.inspect", "chart.render", "channel.execute"].map((toolId) => ({ id: id("binding"), agentId, toolId, enabled: true })); }
function defaultSkills(): import("./types").Skill[] {
  return [
    { id: "research-to-thread", name: "Research to thread", description: "Turn a source into a clear social thread.", channels: ["x", "linkedin"], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.thread", "linkedin.post"] },
    { id: "data-story", name: "Data story", description: "Turn evidence into a useful visual story.", channels: ["x", "linkedin"], requiresTools: ["asset.inspect", "chart.render"], compatibleFormats: ["x.media-post", "linkedin.image-post"] },
    { id: "evidence-led-visual-storytelling", name: "Evidence-led visual storytelling", description: "Start from a concrete observation or idea, identify what evidence would materially support it, choose the visual role that fits this Presence, and keep the expression, source, perception, and uncertainty aligned. Use no asset when none performs the intended role.", channels: ["x", "linkedin", "substack"], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.media-post", "x.long-post", "linkedin.image-post", "substack.article"] },
  ];
}

export function createAgent(input: CreateAgentInput): OpenPresenceState {
  const agent = { id: id("agent"), name: input.name.trim(), description: input.description.trim(), audience: input.audience?.trim() || "builders and curious operators", topics: ["AI agents", "software", "useful ideas"], accent: input.accent, glyph: "◉", languagePolicy: { ...EMPTY_LANGUAGE_POLICY } };
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

function cloneState(source: OpenPresenceState) { return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState); }

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
  return { id: id("watch"), agentId, presenceId, channel, kind, title, query: clean, purpose: purpose?.trim() || undefined, observation: { status: source === "automatic" ? "watching" : "manual", source, observedCount: 0, baseline: "not-started" }, createdAt: timestamp, updatedAt: timestamp };
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
  const state = cloneState(source);
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
  const state = cloneState(source);
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

export function executionPublicationText(state: OpenPresenceState, execution: Execution): string {
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  const publication = intent?.publicationId ? state.publications.find((item) => item.id === intent.publicationId) : execution.publication;
  const payload = publication?.payload;
  return payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : "";
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
  const conversationExternalRef = parentObject?.conversationExternalRef ?? parentObject?.externalRef.id ?? objectId;
  const observedAt = session.virtualNow;
  const visibility = definition?.privacyDefaults.visibility ?? "public";
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

export function formSandboxIntent(source: OpenPresenceState, input: { sessionId: string; affordance: string; format?: string; text: string; target?: EntityRef; perceptionTarget?: EntityRef; rehearsalAttemptId?: string; assignmentId?: string; conversationEpisodeId?: string; invocationId?: string; assets?: SandboxAssetInput[]; expressionMode?: import("./types").ExpressionMode; groundingStatus?: import("./types").GroundingStatus; assetReuse?: { usageType: import("./types").AssetUsageType; reason: string }; networkMetadata?: { referencedPeople?: import("./types").SocialIntentPersonReference[]; networkReason?: string }; operatorDirectiveId?: string; origin?: SocialOrigin }) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, input.sessionId);
  const presence = state.presences.find((item) => item.id === session.presenceId) ?? state.presence;
  if (!presence) throw new Error("Sandbox delivery requires a Sandbox Presence.");
  const perceptionTarget = input.target ?? input.perceptionTarget;
  const targetObject = perceptionTarget ? state.mirrorObjects.find((item) => item.sessionId === session.id && item.externalRef.type === perceptionTarget.type && item.externalRef.id === perceptionTarget.id) : undefined;
  const conversationEpisodeId = input.conversationEpisodeId ?? (targetObject ? ensureConversationEpisode(state, targetObject, presence?.id ?? session.presenceId).id : undefined);
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
  const publication: Publication = { id: id("publication"), format: input.format ?? `${session.channelId}.${input.affordance}`, payload: { text: input.text.trim() }, assetIds: publicationAssets.map((asset) => asset.id), links: publicationAssets.filter((asset) => asset.type === "link" && asset.provenance.sourceUrl).map((asset) => ({ url: asset.provenance.sourceUrl!, label: asset.description })), assetReuse: input.assetReuse, origin, ...expression, createdAt: timestamp, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, assignmentId: input.assignmentId, invocationId: input.invocationId } as Publication & { invocationId?: string };
  const intent: SocialIntent = { id: id("intent"), agentId: state.agent?.id ?? "", presenceId: presence.id, affordance: input.affordance, target: input.target, publicationId: publication.id, priority: 50, validity: { staleAfterMs: 60 * 60 * 1000 }, state: executionMode === "off" ? "withdrawn" : "active", formedAt: timestamp, updatedAt: timestamp, origin, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, assignmentId: input.assignmentId, conversationEpisodeId, invocationId: input.invocationId, referencedPeople: input.networkMetadata?.referencedPeople, networkReason: input.networkMetadata?.networkReason, source: input.operatorDirectiveId ? "operator" : "agent", operatorDirectiveId: input.operatorDirectiveId } as SocialIntent & { invocationId?: string };
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
  const languageResult = validateLanguage(input.text, effectiveLanguagePolicy(state.agent, presence));
  const languageReason = languageResult.valid ? undefined : "The final expression violates an explicit Never use language rule.";
  const duplicateReason = duplicateAssets.length && !input.assetReuse ? "This exact asset was already used in this Sandbox Presence and needs an explicit reuse reason." : undefined;
  const reviewReason = languageReason ?? duplicateReason ?? publicExpressionLeakageReasonValue ?? leakageReason ?? runtimeLeakageReasonValue ?? (mediaReviewRequired ? "Attached media remains uncertain and this Presence requires review before acting." : undefined);
  const status = languageReason || duplicateReason || publicExpressionLeakageReasonValue ? "blocked" as const : reviewReason ? "awaiting-review" as const : executionMode === "auto" ? "queued" as const : executionMode === "review" ? "awaiting-review" as const : "awaiting-manual" as const;
  const execution: Execution = { id: id("execution"), socialIntentId: intent.id, presenceId: presence.id, affordance: input.affordance, mode: executionMode, status, attempts: 0, bridgeId: `sandbox:${session.environmentId}`, connector: "simulated", idempotencyKey: `sandbox:${session.id}:${intent.id}`, target: input.target, publication, reviewReason, createdAt: timestamp, updatedAt: timestamp, assignmentId: input.assignmentId, conversationEpisodeId, environment: "sandbox", sessionId: session.id, rehearsalAttemptId: input.rehearsalAttemptId, invocationId: input.invocationId, source: input.operatorDirectiveId ? "operator" : "agent", operatorDirectiveId: input.operatorDirectiveId } as Execution & { invocationId?: string };
  state.publications.unshift(publication); state.socialIntents.unshift(intent); state.executions.unshift(execution);
  if (languageReason) execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by Never use: " + languageResult.violations.map((item) => item.literal).join(", ") + ".", retryable: false };
  if (duplicateReason) execution.failure = { code: "DUPLICATE_ASSET_CANDIDATE", message: duplicateReason, retryable: false };
  if (publicExpressionLeakageReasonValue) execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionLeakageReasonValue, retryable: false };
  state.events.unshift({ ...event("decision", publicExpressionLeakageReasonValue ? "Public text boundary blocked" : leakageReason ? "Identity disclosure needs review" : mediaReviewRequired ? "Media action needs review" : "Social Intent formed", reviewReason ?? `${presence.name} chose ${input.affordance} for the simulated ${channelName(session.channelId)} world.`, publicExpressionLeakageReasonValue || leakageReason || mediaReviewRequired ? "warning" : "positive", { presenceId: presence.id, intentId: intent.id, executionId: execution.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
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
  const text = publication?.payload && typeof publication.payload === "object" && "text" in publication.payload && typeof publication.payload.text === "string" ? publication.payload.text : "";
  if (!text.trim() && !["like", "reaction", "repost"].includes(execution.affordance)) throw new Error("Sandbox delivery requires a publication draft.");
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
  const object = { id: id("mirror"), bridgeId: `sandbox:${session.environmentId}`, presenceId: presence.id, channelId: session.channelId, externalRef, parentExternalRef: execution.target, objectType: execution.affordance, language: presence.language, author: { externalRef: { type: `${session.channelId}.user`, id: `agent:${presence.id}` }, displayName: presence.name, handle: presence.handle }, content: { text: text || undefined, language: presence.language }, assetRefs, occurredAt: session.virtualNow, observedAt: now(), visibility: "public" as const, shareability: "presence-only" as const, originExecutionId: execution.id, actorPresenceId: presence.id, sourceEventId: `sandbox-delivery:${execution.id}`, environment: "sandbox" as const, sessionId: session.id, assignmentId: execution.assignmentId };
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
  return {
    ...input,
    title: input.title ?? input.instruction,
    origin,
    activation,
    deliverable: { ...input.deliverable, type: input.deliverable?.type ?? "custom", quantity: typeof quantity === "number" ? quantity : undefined, quantityMode: mode },
    quantityPolicy: input.quantityPolicy ?? { quantity: typeof quantity === "number" ? quantity : "agent_planned", mode, period: recurrence?.kind === "weekly" ? "week" : recurrence?.kind === "daily" || recurrence?.kind === "weekdays" ? "day" : "assignment" },
    revision: input.revision ?? 0,
    progress: { required, verified: input.progress?.verified ?? 0 },
    work: input.work ?? { phase: input.status === "blocked" ? "blocked" as const : input.status === "completed" ? "completed" as const : "candidate_review" as const, attempts: input.rejectedCandidates ?? 0, maxAttempts: Math.min(12, Math.max(4, required * 4 || 4)), storiesResearched: 0 },
    attemptHistory: input.attemptHistory ?? [],
    storyResearch: input.storyResearch ?? [],
  };
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

function normalizeState(raw: OpenPresenceState): OpenPresenceState {
  const state = raw as OpenPresenceState & { presences?: Presence[]; conversations?: import("./types").Conversation[]; activeConversationId?: string | null; activePresenceId?: string | null; presenceChatSessions?: import("./types").PresenceChatSession[] };
  const agents = (state.agents?.length ? state.agents : state.agent ? [state.agent] : []).map((agent) => ({ ...agent, languagePolicy: normalizeLanguagePolicy((agent as Agent & { languagePolicy?: LanguagePolicy }).languagePolicy) }));
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
  const base = initialState();
  const existingSkills = (state.skills ?? []).map((skill) => ({ ...skill, name: skill.name ?? skill.id.replaceAll("-", " ") }));
  const skills = [...defaultSkills().filter((skill) => !existingSkills.some((item) => item.id === skill.id)), ...existingSkills];
  const existingSkillIds = new Set((state.agentSkills ?? []).map((binding) => binding.skillId));
  const agentSkills = [...(state.agentSkills ?? []), ...defaultSkills().filter((skill) => !existingSkillIds.has(skill.id)).map((skill) => ({ id: id("agent-skill"), agentId: activeAgentId ?? "", skillId: skill.id, enabled: true }))];
  const providerConnections = (state.providerConnections ?? []).map((connection) => ({ ...connection, label: providerName(connection.provider) }));
  const normalizedPresences = presences.map((item) => ({ ...migrateBuiltInXCapabilities(item), languagePolicy: normalizeLanguagePolicy((item as Presence & { languagePolicy?: LanguagePolicy }).languagePolicy) }));
  const hydratedPresence = normalizedPresences.find((item) => item.id === activePresenceId) ?? normalizedPresences[0] ?? null;
  const channelDefinitions = (state.channelDefinitions?.length ? state.channelDefinitions : base.channelDefinitions).map((definition) => {
    const builtin = base.channelDefinitions.find((item) => item.id === definition.id);
    if (!builtin || definition.id !== "x") return definition;
    return { ...definition, affordances: [...builtin.affordances.filter((item) => !definition.affordances.some((current) => current.id === item.id)), ...definition.affordances], supportedAssetKinds: [...new Set([...(builtin.supportedAssetKinds ?? []), ...(definition.supportedAssetKinds ?? [])])] };
  });
  const normalized = { ...base, ...state, agents, agent: agents.find((item) => item.id === activeAgentId) ?? agents[0] ?? null, activeAgentId, agentWorkspaces: state.agentWorkspaces ?? [], workspaceRevision: state.workspaceRevision, presence: hydratedPresence, presences: normalizedPresences, activePresenceId, conversations, activeConversationId, presenceChatSessions: state.presenceChatSessions ?? [], agentRequests: (state.agentRequests ?? []).filter((request) => request.kind !== "capability"), capabilityChangeEvents: state.capabilityChangeEvents ?? [], calendar, assignments: (state.assignments ?? []).map((assignment) => normalizeAssignment(assignment)), assignmentRuns: state.assignmentRuns ?? [], growthReviews: state.growthReviews ?? [], growthFileVersions: state.growthFileVersions ?? [], audienceSnapshots: state.audienceSnapshots ?? [], publicationMetricSnapshots: state.publicationMetricSnapshots ?? [], watches: state.watches ?? [], explorations: state.explorations ?? [], discoveryPlans: state.discoveryPlans ?? [], explorationSessions: state.explorationSessions ?? [], explorationFindings: state.explorationFindings ?? [], messages: conversations.find((item) => item.id === activeConversationId)?.messages ?? legacyMessages, modelProfiles: state.modelProfiles ?? [], providerConnections, assetProviderConnections: state.assetProviderConnections ?? [], toolBindings: (state.toolBindings ?? []).map((binding) => ({ ...binding, enabled: binding.enabled !== false })), changeSets: state.changeSets ?? [], standingIntents: state.standingIntents ?? [], operatorDirectives: state.operatorDirectives ?? [], socialDecisions: state.socialDecisions ?? [], socialIntents: state.socialIntents ?? [], executions: state.executions ?? [], outcomes: state.outcomes ?? [], publications: state.publications ?? [], assetUsages: state.assetUsages ?? [], sourceEvidence: state.sourceEvidence ?? [], claimGrounding: state.claimGrounding ?? [], preferenceEvidence: state.preferenceEvidence ?? [], originalPostRehearsals: state.originalPostRehearsals ?? [], librarySources: state.librarySources ?? [], assets: state.assets ?? [], perceptions: state.perceptions ?? [], assetResearchSessions: state.assetResearchSessions ?? [], skills, agentSkills, contentDrops: state.contentDrops ?? [], channelDefinitions, nativeConnections: state.nativeConnections ?? [], bridges: state.bridges ?? [], mirrorObjects: state.mirrorObjects ?? [], mirrorEvents: state.mirrorEvents ?? [], bridgeSync: state.bridgeSync ?? [], conversationEpisodes: state.conversationEpisodes ?? [], assignmentContributions: state.assignmentContributions ?? [], people: state.people ?? [], personIdentities: state.personIdentities ?? [], relationships: state.relationships ?? [], relationshipFacts: state.relationshipFacts ?? [], relationshipOpenLoops: state.relationshipOpenLoops ?? [], recommendationRecords: state.recommendationRecords ?? [], introductionRecords: state.introductionRecords ?? [], sandboxEnvironments: state.sandboxEnvironments ?? [], playgroundSessions: (state.playgroundSessions ?? []).map((session) => ({ ...session, virtualTimeMode: session.virtualTimeMode ?? "realtime", worldRevision: session.worldRevision ?? 1 })), sandboxActors: state.sandboxActors ?? [], networkSearches: state.networkSearches ?? [], networkIntroductions: state.networkIntroductions ?? [], scenarios: state.scenarios ?? [], scenarioVersions: state.scenarioVersions ?? [], scenarioRuns: state.scenarioRuns ?? [], scenarioRunProvenance: state.scenarioRunProvenance ?? [], scenarioEvaluations: state.scenarioEvaluations ?? [], knowledgeCollections: state.knowledgeCollections ?? [], knowledgeItems: state.knowledgeItems ?? [], knowledgeVersions: state.knowledgeVersions ?? [], knowledgeSegments: state.knowledgeSegments ?? [], presenceKnowledgeBindings: state.presenceKnowledgeBindings ?? [], knowledgeRetrievalRuns: state.knowledgeRetrievalRuns ?? [], knowledgeCitations: state.knowledgeCitations ?? [] };
  for (const slot of normalized.calendar) {
    if (!slot.enabled || slot.assignmentId) continue;
    const existing = normalized.assignments.find((assignment) => assignment.origin === "schedule" && assignment.presenceId === slot.presence && assignment.instruction === slot.instruction && assignment.schedule?.day === slot.day && assignment.schedule?.time === slot.time);
    if (existing) {
      slot.assignmentId = existing.id;
      continue;
    }
    const migrated = compileAssignmentInstruction(normalized, slot.instruction, slot.presence, normalized.presences.find((item) => item.id === slot.presence)?.environment ?? "sandbox", undefined, { day: slot.day, time: slot.time, executionWindow: slot.executionWindow });
    migrated.origin = "schedule";
    normalized.assignments.unshift(migrated);
    slot.assignmentId = migrated.id;
  }
  normalized.assignments = normalized.assignments.map((assignment) => {
    const successEvidence = assignment.preflight?.contract?.successEvidence ?? "";
    const needsPreflightCopyRefresh = successEvidence.includes("Social Mirror") || successEvidence.includes("persisted and explains");
    return assignment.preflight && !needsPreflightCopyRefresh
      ? assignment
      : { ...assignment, preflight: preflightAssignment(normalized, assignment, assignment.executionPolicy.delegationPolicy) };
  });
  normalized.bridges = (state.bridges ?? []).map(migrateLegacyXBrowserBridge);
  normalized.mirrorObjects = repairNativeReplyClassifications({ ...normalized, mirrorObjects: (state.mirrorObjects ?? []).map(normalizeMirrorObject) });
  normalized.publishingPlans = state.publishingPlans ?? [];
  if (normalized.agent && normalized.scenarios.length === 0) {
    const builtins = builtinScenarioDefinitions(normalized.agent.id, normalized.presence?.channel ?? "x");
    normalized.scenarios = builtins.map((item) => item.scenario);
    normalized.scenarioVersions = builtins.map((item) => item.version);
  }
  migrateLegacyDefaultModel(normalized);
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
  return normalized;
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
  const connectionMode: PresenceConnectionMode = raw.connectionMode ?? (raw.environment === "sandbox" ? "sandbox" : raw.channel === "x" ? "native" : "bridge");
  const pacing = raw.pacing ?? "recommended";
  const attentionIntervalMinutes = Math.max(5, Math.min(120, raw.attentionIntervalMinutes ?? (pacing === "gentle" ? 15 : 5)));
  const quietHours = { enabled: Boolean(raw.quietHours?.enabled), start: raw.quietHours?.start ?? "22:00", end: raw.quietHours?.end ?? "07:00" };
  const publishingInitiative = normalizePublishingInitiative(raw.publishingInitiative);
  const browserAccess = raw.browserAccess ?? { enabled: false };
  return { ...raw, id: idValue, channel: raw.channel ?? "x", name, mode, capabilities, execution, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, language, languagePolicy, browserAccess, executionEnvelope: { ...executionEnvelope, presenceId: idValue, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? executionEnvelope.affordances?.[item.id]?.mode ?? "off" }])) }, context: compilePresenceContext({ ...raw, id: idValue, name, mode, capabilities, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, language, languagePolicy, browserAccess, executionEnvelope, context, publishingInitiative } as Presence), pacing, attentionIntervalMinutes, quietHours, publishingInitiative, accountHealth: raw.accountHealth ?? "healthy", environment: connectionMode === "sandbox" ? "sandbox" : "live", connectionMode };
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

function recordChangeSet(state: OpenPresenceState, summary: string, operations: ChangeSetOperation[], conversationId?: string): string | undefined {
  if (!state.agent) return undefined;
  const changeSet: ChangeSet = { id: id("changeset"), agentId: state.agent.id, conversationId, summary, operations, createdAt: now() };
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
  const cleaned = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^[^:\n]{1,80}\s*\((?:post|reply|quote|repost|like|reaction)\):\s*/i, "")
    .replace(/\bQA-[A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/gi, "")
    .split(/\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.!?,])/g, "$1").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const deliverableMatch = instruction.match(/\b(\d+)\s+(?:(?:original|verified|sandbox|simulated|x|social|channel|distinct|new)\s+){0,6}(?:posts?|publications?|repl(?:y|ies)|quotes?|reposts?|messages?)\b/i);
  const match = modifierMatch ?? deliverableMatch;
  const quantity = Math.max(1, Number(match?.[2] ?? match?.[1] ?? 1));
  const modifier = (modifierMatch?.[1] ?? "").toLowerCase().replace(/\s+/g, " ");
  const quantityMode: AssignmentQuantityMode = /exactly/.test(modifier) ? "exact" : /at least|minimum|min/.test(modifier) ? "at_least" : /up to|no more|at most|maximum|max/.test(modifier) ? "at_most" : "target";
  return { quantity, quantityMode };
}

function assignmentDeliverableType(instruction: string): Assignment["deliverable"]["type"] {
  if (growthTarget(instruction)) return "audience_growth";
  const evaluationOnly = /\b(?:evaluate|assess|review|recommend|decide\s+whether|tell\s+me\s+whether)\b/i.test(instruction)
    && (!/\b(?:publish|post|reply|respond|answer|handle|send|engage|message)\b/i.test(instruction) || /\b(?:evaluate|assess|review)\s+(?:whether|if)\b/i.test(instruction));
  if (evaluationOnly) return "decision_report";
  if (/\b(reply|repl(?:y|ies)|respond|answer|engage|comment)\b/i.test(instruction)) return "reply";
  if (/\b(quote|repost|message)\b/i.test(instruction)) return instruction.match(/\bquote\b/i) ? "quote" : instruction.match(/\brepost\b/i) ? "repost" : "message";
  return "original_publication";
}

function assignmentDeliverableLabel(type: Assignment["deliverable"]["type"]) {
  if (type === "audience_growth") return "a long-term audience-growth responsibility";
  return type === "original_publication" ? "one original post published" : type === "reply" ? "one public reply or conversation contribution" : type === "decision_report" ? "one reasoned decision report" : `one ${type.replaceAll("_", " ")}`;
}

function assignmentSuccessEvidence(type: Assignment["deliverable"]["type"], presence: Presence | null | undefined, environment: PresenceEnvironment) {
  if (type === "audience_growth") return `The latest ${presence?.channel === "x" ? "X" : presence?.name ?? "channel"} audience snapshot verifies the follower target.`;
  if (type === "decision_report") return "A reasoned report is saved and explains the recommendation, including when no public action is warranted.";
  const destination = presence?.channel === "x" ? "X" : presence?.name ?? "the selected channel";
  if (environment === "sandbox") {
    if (type === "original_publication") return "The post appears in the Sandbox and is confirmed.";
    if (type === "reply") return "The reply is visible in the Sandbox conversation and confirmed.";
    if (type === "quote") return "The quote-post appears in the Sandbox and is confirmed.";
    if (type === "repost") return "The repost appears in the Sandbox and is confirmed.";
  }
  if (type === "original_publication") return `The post is live on ${destination} and confirmed.`;
  if (type === "reply") return `The reply is visible in the conversation on ${destination} and confirmed.`;
  if (type === "quote") return `The quote-post is live on ${destination} and confirmed.`;
  if (type === "repost") return `The repost is live on ${destination} and confirmed.`;
  if (type === "message") return "The message is delivered to the recipient and confirmed.";
  return `The ${type.replaceAll("_", " ")} is completed and confirmed.`;
}

function assignmentAffordance(type: Assignment["deliverable"]["type"]) {
  if (type === "original_publication") return "post";
  if (type === "reply" || type === "meaningful_engagement") return "reply";
  if (type === "quote" || type === "repost" || type === "message") return type;
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
  const timing = assignment.schedule ? `${assignment.schedule.day} · ${assignment.schedule.time} · ${assignment.schedule.executionWindow}` : undefined;

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
  } else if (presence && affordance) {
    const hasCapability = presence.capabilities.some((item) => item.id === affordance);
    const mode = presence.execution[affordance];
    const unavailable = !hasCapability || (assignment.environment === "live" && mode === "off");
    checks.push({ label: "Channel capability", status: unavailable ? "fail" : "pass", detail: unavailable ? `${presence.name} cannot perform ${affordance} on ${presence.channel} with the current capability and authority.` : `${affordance} is available through the Presence execution envelope.` });
    if (unavailable) issues.push(`Enable ${affordance} authority for ${presence.name} or change the Assignment's requested outcome.`);
  } else {
    checks.push({ label: "Channel capability", status: "pass", detail: "No public channel action is required for this deliverable." });
  }

  const status = issues.some((issue) => issue.includes("cannot perform") || issue.includes("Enable")) ? "blocked" : issues.length ? "needs_input" : assumptions.length ? "ready_with_assumptions" : "ready";
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

export function compileAssignmentInstruction(source: OpenPresenceState, instruction: string, presenceId?: string, environment: PresenceEnvironment = "sandbox", sessionId?: string, schedule?: Assignment["schedule"], delegationPolicy: AssignmentDelegationPolicy = "keep_moving", objective?: string): Assignment {
  const clean = instruction.trim();
  if (!clean) throw new Error("An Assignment needs an expected outcome.");
  const presence = source.presences.find((item) => item.id === (presenceId ?? source.activePresenceId)) ?? source.presence;
  if (!presence || !source.agent) throw new Error("Choose a Presence before creating an Assignment.");
  const { quantity, quantityMode } = assignmentQuantity(clean);
  const recurrence = /every\s+(?:weekday|workday)|each\s+weekday/i.test(clean) ? { kind: "weekdays" as const, label: "Every weekday" } : /every\s+day|each\s+day|per\s+day|daily/i.test(clean) ? { kind: "daily" as const, label: "Every day" } : /this\s+week|each\s+week|per\s+week|weekly/i.test(clean) ? { kind: "weekly" as const, label: "This week" } : { kind: "once" as const, label: "Once" };
  const targetFollowers = growthTarget(clean);
  const type = assignmentDeliverableType(clean);
  const topicMatch = clean.match(/\b(?:about|around|focus(?:ed)?\s+on|cover(?:ing)?)\s+(.+?)(?:\.|;|$)/i);
  const topics = topicMatch?.[1]?.split(/,|\bor\b|\band\b/i).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const constraints = [
    /don't\s+repeat|do\s+not\s+repeat|different\s+angles/i.test(clean) ? "Keep the delivered ideas meaningfully distinct." : "",
    /choose\s+your\s+own|find\s+your\s+own/i.test(clean) ? "The Agent chooses the topics, thesis, examples, format, and wording." : "",
  ].filter(Boolean);
  const timestamp = now();
  const growthPlan: AssignmentPlan | undefined = targetFollowers ? { id: id("assignment-plan"), assignmentId: "pending", revision: 1, summary: "Build durable attention by publishing useful original ideas, participating where the Presence can add value, and developing relationships with people in the intended territory.", dailyTargets: ["Aim for 1–2 useful original publications when there is something worth saying.", "Inspect relevant conversations and continue promising relationships."], publishingApproach: ["Prefer concrete implementation lessons over broad commentary.", "Use the format that best serves the idea; do not publish filler to hit a quota."], discoveryDirections: topics?.length ? topics : presence.brief.primaryTerritory.slice(0, 6), relationshipFocus: [presence.brief.audience], hypotheses: ["Specific, useful observations should create stronger repeat interaction than generic commentary."], nextWeeklyReviewAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), nextStrategicReviewAt: new Date(Date.now() + 28 * 86_400_000).toISOString(), source: "agent", createdAt: timestamp, updatedAt: timestamp } : undefined;
  const assignment: Assignment = { id: id("assignment"), agentId: source.agent.id, presenceId: presence.id, sessionId, channelId: presence.channel, environment, title: clean, origin: schedule ? "schedule" : "manual", activation: targetFollowers ? { type: "continuous" } : schedule ? { type: "scheduled", recurrence } : { type: "manual" }, instruction: clean, deliverable: { type, quantity: targetFollowers ? undefined : quantity, quantityMode: targetFollowers ? undefined : quantityMode }, quantityPolicy: targetFollowers ? { quantity: "agent_planned", mode: "at_least", period: "assignment" } : { quantity, mode: quantityMode, period: recurrence.kind === "weekly" ? "week" : recurrence.kind === "daily" || recurrence.kind === "weekdays" ? "day" : "assignment" }, recurrence: targetFollowers ? { kind: "once", label: "Continuous responsibility" } : recurrence, schedule, editorialContext: { topics, constraints }, audienceObjective: targetFollowers ? clean.split(/\bwhile\b/i)[1]?.trim() || presence.brief.audience : undefined, objective, successEvidence: targetFollowers ? { kind: "metric_threshold", metric: "followers", comparator: ">=", value: targetFollowers, label: `${targetFollowers.toLocaleString()} followers` } : undefined, plan: growthPlan, planHistory: growthPlan ? [growthPlan] : [], executionPolicy: { usePresenceEnvelope: true, delegationPolicy }, status: "draft", progress: { required: targetFollowers ? 1 : quantity, verified: 0 }, rejectedCandidates: 0, systemFailures: 0, work: { phase: "candidate_review", attempts: 0, maxAttempts: targetFollowers ? 0 : Math.min(12, Math.max(4, quantity * 4)), storiesResearched: 0 }, attemptHistory: [], storyResearch: [], createdAt: timestamp, updatedAt: timestamp };
  if (growthPlan) growthPlan.assignmentId = assignment.id;
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

export function assignmentIsOpen(assignment: Assignment) {
  return !["completed", "completed_with_adaptation", "cancelled"].includes(assignment.status);
}

function bridgeFor(state: OpenPresenceState, presenceId: string, affordance: string): Bridge | undefined { return state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.state !== "offline" && bridge.capabilities.affordances.includes(affordance)); }
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
  if (!isLegacyDefault && !isPreviouslyShippedChromeDefault) return bridge;
  return { ...bridge, capabilities: chromeBrowserBridgeCapabilities() };
}

function makePublication(state: OpenPresenceState, text: string, format: string, source: "agent_model" | "operator_manual" | "operational" = "operational", assetIds: string[] = []): Publication {
  const presence = state.presence;
  const publication: Publication = { id: id("publication"), format, payload: { text }, assetIds: [...assetIds], links: [], publicExpression: presence ? createPublicExpressionCandidate({ state, presence, affordance: format, text, source, mediaIds: assetIds }) : undefined, createdAt: now(), environment: presence?.environment ?? "live" };
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
  const publication = makePublication(state, slot.instruction, `${presence.channel}.post`);
  const origin: SocialOrigin = { kind: "standing_intent", refId: standing.id };
  publication.origin = origin;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId: standing.id, origin, environment: presence.environment ?? "live" };
  state.socialIntents.unshift(socialIntent);
  const mode = slot.mode;
  if (mode !== "off") {
    const nativeX = presence.channel === "x" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.status === "connected" && connection.access === "read-write") : undefined;
    const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "post");
    const simulated = !bridge && !nativeX && presence.channel === "x" && isTestRuntime();
    const connector = nativeX ? "native" as const : bridge ? bridge.kind : simulated ? "simulated" as const : undefined;
    const status = simulated ? (mode === "auto" ? "succeeded" : mode === "review" ? "awaiting-review" : "awaiting-manual") : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
    const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance, mode: mode as Exclude<import("./types").ExecutionMode, "off">, status, attempts: simulated && mode === "auto" ? 1 : 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, createdAt: formedAt, updatedAt: formedAt, executedAt: simulated && mode === "auto" ? formedAt : undefined, environment: presence.environment ?? "live" };
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
  const lower = content.toLowerCase();
  return lower.includes("introduce this presence on x") ||
    (lower.includes("post on x") && (lower.includes("presence") || lower.includes("publish")));
}

export function formChatPostIntent(source: OpenPresenceState, text: string, standingIntentId?: string, sourceKind: "agent" | "operator" = "agent", assetIds: string[] = [], decisionInput?: SocialDecisionInput) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const validAssetIds = assetIds.filter((assetId) => state.assets.some((asset) => asset.id === assetId && asset.status === "ready"));
  const publication = makePublication(state, text.trim(), validAssetIds.length ? "x.media-post" : "x.post", sourceKind === "operator" ? "operator_manual" : "agent_model", validAssetIds);
  const origin: SocialOrigin = standingIntentId ? { kind: "standing_intent", refId: standingIntentId } : sourceKind === "operator" ? { kind: "operator" } : { kind: "other" };
  publication.origin = origin;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.post", publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId, origin };
  if (publication.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = decisionInput ? createSocialDecision(state, { ...decisionInput, origin: decisionInput.origin ?? origin }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Post intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.access === "read-write" && (connection.status === "connected" || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? ""))));
  const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "post");
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const publicExpressionReason = publicExpressionLeakageReason(text);
  const status = publicExpressionReason ? "blocked" : leakageReason ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.post", mode, status, attempts: 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, reviewReason: publicExpressionReason ?? leakageReason, createdAt: formedAt, updatedAt: formedAt, environment: presence.environment ?? "live" };
  execution.source = sourceKind;
  if (publicExpressionReason) execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionReason, retryable: false };
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
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance, mode, status, attempts: simulated && mode === "auto" ? 1 : 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, createdAt: formedAt, updatedAt: formedAt, executedAt: simulated && mode === "auto" ? formedAt : undefined, environment: presence.environment ?? "live" };
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
export function formAssignmentPostIntent(source: OpenPresenceState, text: string, assignmentId: string, assetIds: string[] = []) {
  const state = formChatPostIntent(source, text, undefined, "agent", assetIds);
  const intent = state.socialIntents[0];
  const execution = intent ? state.executions.find((item) => item.socialIntentId === intent.id) : undefined;
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  if (!intent || !execution || !assignment) return state;
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

export function formXReplyIntent(source: OpenPresenceState, text: string, parentId: string, operatorDirectiveId?: string, assignmentId?: string, assetIds: string[] = [], decisionInput?: SocialDecisionInput) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim() || !parentId.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const validAssetIds = assetIds.filter((assetId) => state.assets.some((asset) => asset.id === assetId && asset.status === "ready"));
  const publication = makePublication(state, text.trim(), validAssetIds.length ? "x.media-post" : "x.reply", operatorDirectiveId ? "operator_manual" : "agent_model", validAssetIds);
  const parentObject = state.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === parentId && item.presenceId === presence.id);
  const conversationEpisodeId = parentObject ? ensureConversationEpisode(state, parentObject, presence.id).id : undefined;
  const origin: SocialOrigin = assignmentId
    ? { kind: "assignment", refId: assignmentId }
    : operatorDirectiveId
      ? { kind: "operator", refId: operatorDirectiveId }
      : { kind: "inbound_social", refId: parentId };
  publication.origin = origin;
  publication.assignmentId = assignmentId;
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.reply", target: { type: "x.post", id: parentId }, publicationId: publication.id, priority: 60, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, origin, source: operatorDirectiveId ? "operator" : "agent", operatorDirectiveId, conversationEpisodeId, assignmentId };
  if (publication.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = decisionInput ? createSocialDecision(state, { ...decisionInput, focalMirrorObjectIds: decisionInput.focalMirrorObjectIds ?? (parentObject ? [parentObject.id] : []), origin: decisionInput.origin ?? origin }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  const mode = presence.execution.reply ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: "skipped", reason: "Replies are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Reply intention held", "Jenny formed a social intention, but Replies are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.status === "connected" && connection.access === "read-write");
  const bridge = nativeX ? undefined : bridgeFor(state, presence.id, "reply");
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const runtimeLeakageReasonValue = runtimeContextLeakageReason(text);
  const publicExpressionReason = publicExpressionLeakageReason(text);
  const status = publicExpressionReason ? "blocked" : leakageReason || runtimeLeakageReasonValue ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.reply", mode, status, attempts: 0, bridgeId: bridge?.id, connector, target: { type: "x.post", id: parentId }, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, reviewReason: publicExpressionReason ?? leakageReason ?? runtimeLeakageReasonValue, createdAt: formedAt, updatedAt: formedAt, source: operatorDirectiveId ? "operator" : "agent", operatorDirectiveId, conversationEpisodeId, assignmentId, environment: presence.environment ?? "live" };
  if (publicExpressionReason) execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: publicExpressionReason, retryable: false };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: publicExpressionReason ? "failed" : mode === "review" ? "review" : "queued", reason: publicExpressionReason ?? (operatorDirectiveId ? "The operator directed Jenny to enter this conversation; Jenny supplied the expression through the Presence execution envelope." : "Jenny chose to continue a relevant conversation through the Presence execution envelope."), createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", publicExpressionReason ? "Public text boundary blocked" : operatorDirectiveId ? "Jenny expressed the requested reply" : "A reply intention was formed", publicExpressionReason ?? (connector ? (operatorDirectiveId ? "The operator set the social act; Jenny supplied a contextual reply for the Presence execution envelope." : "Jenny found a relevant X conversation and handed a contextual reply to the Presence execution envelope.") : "Jenny found a relevant X conversation, but no write-enabled X connector is available."), publicExpressionReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, decisionId: socialDecision?.id }));
  return state;
}

/** Form a verified live X reaction or follow through the same execution envelope as publishing. */
export function formXActionIntent(source: OpenPresenceState, input: { affordance: "x.like" | "x.repost" | "x.quote" | "x.follow"; target: EntityRef; text?: string; assignmentId?: string; assetIds?: string[]; decision?: SocialDecisionInput }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !input.target.id) return state;
  const capability = input.affordance.slice("x.".length);
  const requiresExpression = capability === "quote";
  if (requiresExpression && !input.text?.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const origin: SocialOrigin = input.assignmentId ? { kind: "assignment", refId: input.assignmentId } : { kind: "inbound_social", refId: input.target.id };
  const validAssetIds = (input.assetIds ?? []).filter((assetId) => state.assets.some((asset) => asset.id === assetId && asset.status === "ready"));
  const publication = requiresExpression ? makePublication(state, input.text!.trim(), validAssetIds.length ? "x.media-post" : input.affordance, "agent_model", validAssetIds) : undefined;
  if (publication) { publication.origin = origin; publication.assignmentId = input.assignmentId; }
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: input.affordance, target: input.target, publicationId: publication?.id, priority: capability === "follow" ? 35 : 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, origin, assignmentId: input.assignmentId, environment: "live" };
  if (publication?.publicExpression) publication.publicExpression.socialIntentId = socialIntent.id;
  state.socialIntents.unshift(socialIntent);
  const socialDecision = input.decision ? createSocialDecision(state, { ...input.decision, focalMirrorObjectIds: input.decision.focalMirrorObjectIds ?? [] , origin: input.decision.origin ?? origin }, socialIntent.id) : undefined;
  if (socialDecision) state.socialDecisions.unshift(socialDecision);
  const mode = presence.execution[capability] ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: capability as "like" | "repost" | "quote" | "follow", target: input.target.id, summary: input.text?.trim() ?? capability, status: "skipped", reason: `${capability} is off in the Presence execution envelope.`, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", `X ${capability} intention held`, `The Presence selected ${capability}, but that affordance is off in the execution envelope.`, "quiet", { presenceId: presence.id, intentId: socialIntent.id, decisionId: socialDecision?.id }));
    return state;
  }
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.access === "read-write" && (connection.status === "connected" || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? ""))));
  const connectedNative = nativeX;
  const bridge = nativeX ? undefined : bridgeFor(state, presence.id, capability);
  const connector = connectedNative ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = publication ? publicExpressionLeakageReason(input.text!.trim()) : undefined;
  const status = leakageReason ? "blocked" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: input.affordance, mode, status, attempts: 0, bridgeId: bridge?.id, connector, target: input.target, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, reviewReason: leakageReason, createdAt: formedAt, updatedAt: formedAt, assignmentId: input.assignmentId, environment: "live", source: "agent" };
  if (leakageReason) execution.failure = { code: "PUBLIC_TEXT_INTERNAL_MARKER", message: leakageReason, retryable: false };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: capability as "like" | "repost" | "quote" | "follow", target: input.target.id, summary: input.text?.trim() ?? capability, status: leakageReason ? "failed" : mode === "review" ? "review" : "queued", reason: leakageReason ?? `The Presence formed a ${capability} action through the live X execution envelope.`, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", leakageReason ? "Public action blocked" : `X ${capability} intention formed`, leakageReason ?? `${capability} is ready for the authorized X connector.`, leakageReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id, decisionId: socialDecision?.id }));
  return state;
}

export function completeNativeExecution(source: OpenPresenceState, executionId: string, externalRef: import("./types").EntityRef) {
  let state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId && item.connector === "native");
  if (!execution) throw new Error("Native execution not found.");
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
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [externalRef] };
  state.outcomes.unshift(outcome);
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
  return state;
}

/** Persist a verified Follow as selective Network memory; an observed author alone never creates this state. */
export function recordVerifiedFollow(source: OpenPresenceState, presenceId: string, target: EntityRef) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!state.agent || !presence || target.type !== "x.user" || !target.id) return state;
  const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId, channel: presence.channel, externalActorId: target.id, displayName: target.id.startsWith("@") ? target.id : `@${target.id}`, handle: target.id.replace(/^@/, ""), source: "current-context" }, state.people, state.personIdentities, state.relationships);
  remembered.relationship.following = true;
  remembered.relationship.state = "active";
  remembered.relationship.updatedAt = now();
  state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
  state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId))];
  state.relationships = [remembered.relationship, ...state.relationships.filter((item) => item.id !== remembered.relationship.id)];
  state.events.unshift(event("memory", "Following relationship verified", `${remembered.person.displayName} is now marked as followed from a verified X action.`, "positive", { presenceId }));
  return state;
}

export function failNativeExecution(source: OpenPresenceState, executionId: string, message: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId && item.connector === "native");
  if (!execution) return state;
  execution.status = "failed";
  execution.failure = { message, retryable: true };
  execution.updatedAt = now();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "failed", observedAt: now(), metrics: {} };
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

export function applyOperation(source: OpenPresenceState, operation: Operation | import("./types").ToolBindingOperation | import("./types").CapabilityOperation): OpenPresenceState {
  let state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  if (operation.type === "setPresenceBrowserAccess") {
    if (operation.presenceId && state.presence?.id !== operation.presenceId) return state;
    return applyOperation(state, {
      type: "setPresence",
      patch: { browserAccess: { enabled: operation.enabled }, ...(operation.enabled ? { connectionMode: "bridge" } : {}) },
    } as Operation);
  }
  if (operation.type === "askPresenceToIgnore") {
    const presence = state.presences.find((item) => item.id === operation.presenceId);
    const target = state.mirrorObjects.find((item) => item.id === operation.objectId && item.presenceId === operation.presenceId && (!operation.sessionId || item.sessionId === operation.sessionId));
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
    const existing = state.operatorDirectives.find((item) => item.presenceId === presence.id && item.target.id === target.externalRef.id && item.status !== "failed");
    if (existing) return state;
    const directive: OperatorDirective = { id: id("directive"), agentId: state.agent.id, presenceId: presence.id, target: target.externalRef, requiredAct: "reply", optionalDirection: operation.optionalDirection?.trim() || undefined, provenance: "operator", initialAct: "no_op", status: "requested", environment: target.environment ?? presence.environment, sessionId: target.sessionId, createdAt: now() };
    state.operatorDirectives.unshift(directive);
    state.events.unshift(event("decision", `The operator asked ${presence.name} to reply`, `${presence.name} will decide how to express a reply. The operator supplied the social act; the Presence still owns the wording and safety boundaries.`, "positive", { presenceId: presence.id, sourceObjectId: target.id }));
    return state;
  }
  if (operation.type === "updateAssignmentPlan") {
    const assignment = state.assignments.find((item) => item.id === operation.assignmentId);
    if (!assignment || !assignment.successEvidence || assignment.status === "cancelled") return state;
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
    if (!state.audienceSnapshots.some((item) => item.presenceId === snapshot.presenceId && item.observedAt === snapshot.observedAt && item.followers === snapshot.followers)) state.audienceSnapshots.unshift(snapshot);
    const growthAssignment = growthAssignmentFor(state, presence.id);
    if (growthAssignment && assignmentIsSatisfied(growthAssignment, state)) {
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
    const presence = state.presences.find((item) => item.id === (operation.presenceId ?? state.activePresenceId)) ?? state.presence;
    const mirror = state.mirrorObjects.find((item) => item.id === operation.mirrorObjectId && item.presenceId === presence?.id);
    if (!presence || !mirror || !Number.isFinite(operation.publicationAgeSeconds ?? 0)) return state;
    const snapshot: PublicationMetricSnapshot = { id: id("publication-metric"), presenceId: presence.id, mirrorObjectId: mirror.id, observedAt: now(), publicationAgeSeconds: Math.max(0, Math.round(operation.publicationAgeSeconds ?? Math.max(0, (Date.now() - new Date(mirror.occurredAt ?? mirror.observedAt).getTime()) / 1000))), ...operation.metrics, source: operation.source ?? (presence.environment === "sandbox" ? "sandbox" : "manual"), observationStatus: operation.observationStatus ?? "observed" };
    snapshot.baseline = publicationMetricBaseline(state, snapshot);
    state.publicationMetricSnapshots.unshift(snapshot);
    state.events.unshift(event("learning", "Publication performance observed", `Performance evidence for a verified ${presence.channel === "x" ? "X" : presence.name} publication is available for Growth review.`, "positive", { presenceId: presence.id, sourceObjectId: mirror.id }));
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
  if (operation.type === "createAssignment") {
    const assignment = compileAssignmentInstruction(state, operation.instruction, operation.presenceId, operation.environment ?? "sandbox", operation.sessionId, operation.schedule, operation.delegationPolicy, operation.objective);
    assignment.revision = 0;
    state.assignments.unshift(assignment);
    ensureCapabilityRequests(state, assignment.presenceId);
    state.events.unshift(event("system", "Assignment reviewed", `${assignment.preflight?.status === "ready" || assignment.preflight?.status === "ready_with_assumptions" ? "Ready to activate" : "Needs input before activation"} · ${assignment.progress.required} ${assignment.deliverable.type === "original_publication" ? "original publications" : assignment.deliverable.type} · ${assignment.recurrence?.label ?? "Once"}.`, assignment.preflight?.status === "blocked" || assignment.preflight?.status === "needs_input" ? "warning" : "positive", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
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
  if (operation.type === "createWatch") {
    const query = operation.query.trim();
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!state.agent || !presence || !query) return state;
    const watch = compileWatch(state.agent.id, presence.id, presence.channel, query, operation.purpose);
    if (state.watches.some((item) => item.presenceId === watch.presenceId && item.query.toLowerCase() === watch.query.toLowerCase())) return state;
    state.watches.unshift(watch);
    state.events.unshift(event("system", "Watch added", `${watch.title} is now part of ${presence.name}'s attention. Observation is ${watch.observation.status === "manual" ? "waiting for a source" : "available automatically"}.`, "positive", { presenceId: presence.id }));
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
      assignment.title = operation.mode === "objective" ? "Exploration engagement objective" : "Exploration opportunistic engagement";
      assignment.origin = "exploration";
      assignment.activation = { type: "attention_source", sourceIds: [exploration.id] };
      assignment.deliverable = { type: "meaningful_engagement", quantity: assignment.deliverable.quantity, quantityMode: assignment.deliverable.quantityMode };
      const explicitObjectiveQuantity = Boolean(operation.objective?.match(/\b(?:up\s+to|at\s+most|at\s+least|exactly|aim\s+for|maximum|max(?:imum)?|\d+\s+(?:meaningful\s+)?engagements?)\b/i));
      assignment.quantityPolicy = operation.mode === "opportunistic" || !explicitObjectiveQuantity ? { quantity: "agent_planned", mode: "target", period: "assignment" } : assignment.quantityPolicy?.quantity ? { ...assignment.quantityPolicy, period: assignment.quantityPolicy.period === "assignment" ? "day" : assignment.quantityPolicy.period } : { quantity: "agent_planned", mode: "target", period: "assignment" };
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
  if (operation.type === "rememberPerson") {
    const presence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence;
    if (!state.agent || !presence || !operation.externalActorId.trim() || !operation.displayName.trim()) return state;
    const remembered = createRememberedPerson({ agentId: state.agent.id, presenceId: presence.id, channel: operation.channel ?? presence.channel, externalActorId: operation.externalActorId.trim(), displayName: operation.displayName, handle: operation.handle, profileUrl: operation.profileUrl, personId: operation.personId, source: operation.source ?? "operator" }, state.people, state.personIdentities, state.relationships);
    state.people = [remembered.person, ...state.people.filter((item) => item.id !== remembered.person.id)];
    state.personIdentities = [remembered.identity, ...state.personIdentities.filter((item) => item.id !== remembered.identity.id && !(item.channel === remembered.identity.channel && item.externalActorId === remembered.identity.externalActorId))];
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
  if (operation.type === "createKnowledgeCollection") return createKnowledgeCollection(state, operation);
  if (operation.type === "updateKnowledgeCollection") return updateKnowledgeCollection(state, operation);
  if (operation.type === "addKnowledgeItem") return addKnowledgeItem(state, operation);
  if (operation.type === "uploadKnowledgeVersion") return uploadKnowledgeVersion(state, operation);
  if (operation.type === "setKnowledgeBinding") return setKnowledgeBinding(state, operation);
  if (operation.type === "archiveKnowledgeItem") return archiveKnowledgeItem(state, operation.itemId);
  if (operation.type === "archiveKnowledgeCollection") return archiveKnowledgeCollection(state, operation.collectionId);
  switch (operation.type) {
    case "reset": return initialState();
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
      assignment.status = "cancelled";
      assignment.work = { ...(assignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "The operator cancelled this Assignment." };
      assignment.revision = (assignment.revision ?? 0) + 1;
      assignment.updatedAt = now();
      assignment.lastOutcome = { class: "assignment_cancelled", message: `${assignment.progress.verified} / ${assignment.progress.required} verified publications remain recorded, but this Assignment will not continue.`, at: assignment.updatedAt };
      state.events.unshift(event("decision", "Assignment cancelled", assignment.lastOutcome.message, "quiet", { presenceId: assignment.presenceId, sessionId: assignment.sessionId }));
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
    case "renameAgent": {
      if (!state.agent || !operation.name.trim()) return state;
      const previous = state.agent.name;
      const name = operation.name.trim();
      state.agent = { ...state.agent, name };
      state.agents = state.agents.map((item) => item.id === state.agent?.id ? { ...item, name } : item);
      state.events.unshift(event("system", "Agent name updated", `${previous} is now ${name}. Agent-wide meaning files were left unchanged for your review.`, "positive"));
      return state;
    }
    case "createPresence": { if (!state.agent) return state; const definition = state.channelDefinitions.find((item) => item.id === operation.input.channel) ?? operation.input.channelDefinition; if (operation.input.channelDefinition && !state.channelDefinitions.some((item) => item.id === operation.input.channelDefinition!.id)) state.channelDefinitions.push(operation.input.channelDefinition); const created = makePresence(operation.input, operation.input.name?.trim() || operation.input.handle, definition, defaultPresenceBrief(state.agent)); state.presences.push(created); state.sandboxEnvironments.push(makeSandboxEnvironment(created)); state.presence = created; state.activePresenceId = created.id; state.events.unshift(event("system", `${channelName(created.channel)} Presence added`, `${created.handle} is ready as ${created.mode === "ghost" ? "a Ghost Presence" : "an agent-owned Presence"}.`, "positive", { presenceId: created.id })); return state; }
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
    case "configureAssetProvider": { if (!state.agent) return state; const existing = state.assetProviderConnections.find((item) => item.provider === operation.provider); if (existing) { existing.label = operation.label.trim(); existing.status = operation.hasSecret ? "available" : existing.status; existing.secretConfigured = operation.hasSecret || existing.secretConfigured; } else state.assetProviderConnections.push({ id: id("asset-connection"), provider: operation.provider, label: operation.label.trim(), status: operation.hasSecret ? "available" : "needs-configuration", secretConfigured: operation.hasSecret, createdAt: now() }); state.events.unshift(event("system", `${operation.label.trim()} connected`, "Asset discovery is ready for operator-approved source research.", "positive")); return state; }
    case "disconnectAssetProvider": { const connection = state.assetProviderConnections.find((item) => item.provider === operation.provider); if (connection) { state.assetProviderConnections = state.assetProviderConnections.filter((item) => item.id !== connection.id); state.events.unshift(event("system", `${connection.label} disconnected`, "Asset discovery will ask for setup before searching again.", "quiet")); } return state; }
    case "runSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId) ?? makeStandingIntent(state, slot.instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); addSocialEvaluation(state, standing, slot); return state; }
    case "confirmAutoMode": return confirmAutoMode(state, operation.presenceId, operation.capabilities, operation.executionIds);
    case "approveExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (execution?.status === "awaiting-review") { execution.status = execution.bridgeId ? "approved" : "approved"; execution.updatedAt = now(); state.events.unshift(event("execution", "Approved for execution", "The operator approved this social action; it remains separate from Jenny's judgment.", "positive", { executionId: execution.id })); } return state; }
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
    case "setPresence": { if (state.presence) { const patch = operation.patch as typeof operation.patch & { publicSelf?: PublicSelf }; const requestedConnectionMode = patch.connectionMode ?? state.presence.connectionMode ?? (state.presence.environment === "sandbox" ? "sandbox" : state.presence.channel === "x" ? "native" : "bridge"); const connectionMode = requestedConnectionMode === "native" && state.presence.channel !== "x" ? "bridge" as const : requestedConnectionMode; const name = patch.name?.trim() || state.presence.name; const mode = patch.mode ?? state.presence.mode; const posture = patch.publicSelf?.posture ?? state.presence.publicSelf?.posture; const compatiblePostures = mode === "ghost" ? ["representational", "open-about-assistance"] : ["contextual", "ai-forward", "private"]; const publicSelf = { ...(patch.publicSelf ?? state.presence.publicSelf ?? defaultPublicSelf(name, mode)), displayName: name, posture: compatiblePostures.includes(posture as never) ? posture! : defaultPublicSelf(name, mode).posture }; const mediaPerceptionPolicy = patch.mediaPerceptionPolicy ?? state.presence.mediaPerceptionPolicy ?? (mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const); const ghostProfile = normalizeGhostProfile(patch.ghostProfile ?? state.presence.ghostProfile ?? (mode === "ghost" ? defaultGhostProfile() : undefined)); const publishingInitiative = normalizePublishingInitiative(patch.publishingInitiative ?? state.presence.publishingInitiative); const updated = { ...state.presence, ...patch, publishingInitiative: patch.publishingInitiative ? { ...publishingInitiative, updatedAt: now() } : publishingInitiative, mediaPerceptionPolicy, publicSelf, connectionMode, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, name, mode, ghostProfile, execution: patch.execution ? { ...state.presence.execution, ...patch.execution } : state.presence.execution }; updated.executionEnvelope = { ...state.presence.executionEnvelope, affordances: Object.fromEntries(channelCapabilities(state, updated.channel).map((item) => [item.id, { mode: updated.execution[item.id] ?? "off" }])) }; updated.context = compilePresenceContext(updated); if (patch.brief) recordChangeSet(state, "Update Presence Brief", [{ path: `presences.${updated.id}.brief`, action: "update", before: state.presence.brief as unknown as JsonValue, after: updated.brief as unknown as JsonValue }]); state.presence = updated; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); if (patch.publishingInitiative) { const linked = syncPublishingInitiativeAssignment(state, updated.id); state.assignments = linked.assignments; state.presences = linked.presences; state.presence = linked.presence; } const presenceFile = state.files.find((file) => file.kind === "PRESENCE"); if (presenceFile && state.agent) { presenceFile.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode, handle: updated.handle, accent: state.agent.accent }, state.presence ?? updated); presenceFile.revision += 1; presenceFile.updatedAt = now(); } } state.events.unshift(event("system", "Presence settings updated", state.presence?.status === "paused" ? "All external actions are paused." : "The new execution envelope is active.", state.presence?.status === "paused" ? "warning" : "positive", { presenceId: state.presence?.id })); return state; }
  }
  return state;
}

function makeCalendarSlot(instruction: string, presence: Presence | null, day = "Tuesday", time = "08:00", objective = "audience_growth", executionWindow = "08:00–11:00"): CalendarSlot { const clean = instruction.trim().replace(/[.!?]+$/, "") || "Teach the audience one useful thing"; const label = clean.length > 34 ? `${clean.slice(0, 34).trim()}…` : clean; const mode = presence?.execution.post ?? "review"; return { id: id("slot"), label, instruction: clean, day, time, objective, presence: presence?.id ?? "", mode, enabled: true, executionWindow }; }

export { normalizeState };
