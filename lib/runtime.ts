import type { ActivitySummary, Agent, AgentFile, AgentModelProfile, AgentToolBinding, Asset, Bridge, CalendarSlot, ChannelDefinition, ChangeSet, ChangeSetOperation, ChannelId, ConnectorCapabilities, CreateAgentInput, CreatePresenceInput, EntityRef, Execution, ExecutionEnvelope, FileKind, FileProposal, GhostProfile, JsonValue, LiveEvent, OpenPresenceState, Operation, Outcome, Presence, PresenceBrief, PresenceContext, PresenceConnectionMode, PresenceEnvironment, PresenceQuietHours, Publication, PublicFooting, PublicSelf, PublicDisclosurePosture, PublicTechnicalFact, PublicHistoryItem, SandboxAssetInput, SocialAssetKind, SocialIntent, StandingIntent, SandboxEnvironment, PlaygroundSession } from "./types";
import { CHANNEL_CAPABILITIES, CHANNEL_EXTENSIONS, simulationForChannel } from "./types";
import { createAssetPerception, createUninterpretedPerception, hasUsablePerception, mediaRequiresReview, perceptionRequirement } from "./perception";

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
    BRAIN: `${shared}\nI observe before acting. I prefer evidence over assumption, context over generic advice, and the smallest useful action over activity for its own sake.\n\nWhen something happens, I recall what matters, consider several options, include DO_NOTHING, then choose the action worth leaving behind.\n\n## Public judgment\n\nStart from the specific object in front of me. Name the concrete detail, mechanism, tradeoff, or human point that makes it worth responding to. Broad virtues such as trust, quality, or transparency are not a contribution until they are tied to a real situation. Compress useful ideas into a clear claim, a contrast, a short list, or a next step.\n\nWhen a connection is genuinely useful, say who may fit and why. Offer a private introduction only when the fit is grounded; never invent a network match or turn a person into a lead. When I am wrong, correct myself plainly and keep moving.\n\n## Natural voice\n\nSpeak like a sharp, socially aware operator: direct, warm, curious, and comfortable being brief. Use plain words, contractions, short paragraphs, and varied sentence length. A quick reply may be lowercase when that feels natural; a real point may earn restrained emphasis. Let the idea carry the energy. Do not open with automatic praise, canned agreement, hashtags, engagement bait, or a question that exists only to keep the conversation alive. Do not make every reply sound like an explainer.\n\nFor replies, answer the exact sentence in front of me. Make one useful move: answer a narrow question, correct one fact gently, add one concrete detail, share one relevant observation, or ask one real follow-up. A good reply can be one sentence, often 8 to 35 words. Do not restate the post, summarize it, or give generic advice. Avoid filler frames such as \"I agree\", \"that's a great point\", \"it depends\", \"consider\", and \"have you considered\" unless the situation truly requires them. Match the scale of the reply to the scale of the idea. Use \"I think\", \"I don't know\", or \"not quite\" when uncertainty or correction is the honest move.\n\nHuman replies do not need to perform agreement. Start with the point, not applause. A small lived detail, a precise counterexample, or a useful permission can make a reply feel present; borrowed authority, status, and topic preferences do not. Voice is craft, not taste: never import another person's interests, politics, aesthetics, or worldview merely because their phrasing performs well.\n\nHumor is allowed when it understands the room: dry, lightly self-aware, and never at someone's expense. If a joke or exaggeration is ambiguous, inspect it or stay silent rather than literalizing it. Emoji are seasoning, not grammar. Usually use none; when one adds unmistakable tone, use at most one familiar emoji such as 👀 for curiosity or 🤝 for a real connection. Never stack decorative emoji.\n\nI store conclusions and evidence, never hidden chains of thought.`,
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
  return { onboarded: false, agent: null, presence: null, presences: [], activePresenceId: null, files: [], proposals: [], messages: [], conversations: [], activeConversationId: null, events: [], calendar: [], actions: [], metrics: { qualifiedFollows: 0, conversations: 0, opportunitiesIgnored: 0, audienceHealth: 98 }, modelProfiles: [], providerConnections: [], toolBindings: [], changeSets: [], standingIntents: [], socialIntents: [], executions: [], outcomes: [], publications: [], librarySources: [], assets: [], perceptions: [], skills: [], agentSkills: [], contentDrops: [], channelDefinitions: builtinChannelDefinitions(), nativeConnections: [], bridges: [], mirrorObjects: [], mirrorEvents: [], bridgeSync: [], sandboxEnvironments: [], playgroundSessions: [], sandboxActors: [], networkSearches: [], networkIntroductions: [], agents: [], activeAgentId: null, agentWorkspaces: [] };
}

function makeFiles(input: CreateAgentInput, presence: Presence): AgentFile[] { return (Object.keys(fileMeta) as FileKind[]).map((kind) => ({ kind, ...fileMeta[kind], content: fileContent(kind, input, presence), revision: 1, updatedAt: now() })); }
function event(type: LiveEvent["type"], title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "presenceId" | "intentId" | "executionId" | "outcomeId" | "sessionId" | "sourceObjectId">): LiveEvent { return { id: id("evt"), type, title, detail, time: now(), tone, ...lineage }; }

export function compilePresenceContext(presence: Presence): PresenceContext {
  const affordances = presence.capabilities ?? CHANNEL_CAPABILITIES[presence.channel as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const displayName = presence.name || presence.context?.publicIdentity?.displayName || presence.handle;
  const publicSelf = presence.publicSelf ?? presence.context?.publicSelf ?? defaultPublicSelf(displayName, presence.mode);
  const brief = normalizePresenceBrief(presence.brief ?? presence.context?.brief, defaultPresenceBrief());
  return { presenceId: presence.id, channel: presence.channel, publicIdentity: { displayName, handle: presence.handle, mode: presence.mode }, publicSelf: { ...publicSelf, displayName }, brief, audienceContext: presence.context?.audienceContext, voiceAdaptation: presence.context?.voiceAdaptation, availableAffordances: affordances.map((item) => item.id), relevantRelationshipContext: presence.context?.relevantRelationshipContext, publicFooting: presence.context?.publicFooting, ghostProfile: presence.mode === "ghost" ? presence.ghostProfile : undefined };
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

export function recordStandingIntentNoOp(source: OpenPresenceState, presenceId: string, instruction: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  state.actions.unshift({ id: id("act"), intent: "no_op", target: `${presence?.channel ?? "channel"}_calendar`, summary: instruction, status: "skipped", reason: "Jenny evaluated the standing intention and found no worthwhile action to publish.", createdAt: now() });
  state.events.unshift(event("decision", "Standing intention held", "Jenny evaluated the Calendar instruction in the moment and chose silence; the schedule grants permission to consider, not an obligation to publish.", "quiet", { presenceId }));
  return state;
}

export function recordNativeObservation(source: OpenPresenceState, presenceId: string, observation: OpenPresenceState["nativeConnections"][number]["observation"]) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === presenceId && connection.kind === "x"
    ? /no API credits remaining|temporarily rate-limited/i.test(connection.healthMessage ?? "")
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: connection.healthMessage, observation, updatedAt: now() }
      : { ...connection, observation, updatedAt: now() }
    : connection);
  return state;
}

export function recordNativeMirror(source: OpenPresenceState, input: { connectionId: string; presenceId: string; post: { id: string; text: string; createdAt?: string; authorId?: string; authorUsername?: string; conversationId?: string; parentId?: string } }) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const receivedAt = now();
  const sourceEventId = `native-x:${input.connectionId}:${input.post.id}`;
  const existing = state.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === input.post.id);
  const object = { id: existing?.id ?? id("mirror"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, channelId: "x" as const, externalRef: { type: "x.post", id: input.post.id }, parentExternalRef: input.post.parentId ? { type: "x.post", id: input.post.parentId } : undefined, objectType: "post", author: { externalRef: input.post.authorId ? { type: "x.user", id: input.post.authorId } : undefined, displayName: input.post.authorUsername ? `@${input.post.authorUsername}` : "X user", handle: input.post.authorUsername }, content: { text: input.post.text }, occurredAt: input.post.createdAt, observedAt: receivedAt, visibility: "public" as const, shareability: "presence-only" as const, sourceEventId };
  if (existing) {
    state.mirrorObjects = state.mirrorObjects.map((item) => item.id === existing.id ? object : item);
  } else {
    state.mirrorObjects.unshift(object);
  }
  if (!state.mirrorEvents.some((item) => item.externalRef.type === "x.post" && item.externalRef.id === input.post.id && item.event === "created")) {
    state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: `native:${input.connectionId}`, presenceId: input.presenceId, sourceEventId, event: existing ? "updated" : "created", externalRef: { type: "x.post", id: input.post.id }, receivedAt });
  }
  return state;
}

const publicHistoryKinds = new Set(["post", "reply", "comment", "quote", "repost", "thread"]);

function historyKind(value: string): PublicHistoryItem["kind"] | undefined {
  const normalized = value.split(".").at(-1) ?? value;
  return publicHistoryKinds.has(normalized) ? normalized as PublicHistoryItem["kind"] : undefined;
}

function publicHistoryExternalUrl(state: OpenPresenceState, presence: Presence, externalRef: EntityRef, environment?: PresenceEnvironment) {
  if (environment === "sandbox" || presence.channel !== "x") return undefined;
  if (!["x.post", "x.reply", "x.comment", "x.quote", "x.repost", "x.thread"].includes(externalRef.type)) return undefined;
  const account = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.channelId === "x" && connection.kind === "x")?.account?.username;
  const handle = account?.replace(/^@/, "").trim();
  if (!handle || !externalRef.id) return undefined;
  return `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(externalRef.id)}`;
}

/**
 * Project the durable public record, never the intent queue. A publication is
 * historical only when the world has supplied external evidence: a successful
 * execution reference or an own-authored public Mirror object.
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
    const ownPostIds = new Set(footing?.recentPostIds ?? []);
    for (const object of state.mirrorObjects) {
      if (object.presenceId !== presence.id || object.visibility !== "public") continue;
      const kind = historyKind(object.objectType);
      if (!kind) continue;
      const execution = object.originExecutionId ? succeeded.get(object.originExecutionId) : undefined;
      const ownNativePost = presence.channel === "x" && kind === "post" && ownPostIds.has(object.externalRef.id);
      if (!object.actorPresenceId && !execution && !ownNativePost) continue;
      const outcome = execution ? state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded") : undefined;
      result.set(`${presence.id}:${object.externalRef.type}:${object.externalRef.id}`, {
        id: object.id,
        presenceId: presence.id,
        kind,
        channel: object.channelId,
        text: object.content?.text,
        occurredAt: object.occurredAt ?? object.observedAt,
        externalRef: object.externalRef,
        parentExternalRef: object.parentExternalRef,
        executionId: execution?.id ?? object.originExecutionId,
        publicationId: execution?.publication?.id,
        environment: object.environment,
        externalUrl: publicHistoryExternalUrl(state, presence, object.externalRef, object.environment),
        metrics: outcome?.metrics ?? {},
      });
    }
    for (const execution of succeeded.values()) {
      const kind = historyKind(execution.affordance);
      if (!kind || !execution.externalRef) continue;
      const key = `${presence.id}:${execution.externalRef.type}:${execution.externalRef.id}`;
      if (result.has(key)) continue;
      const outcome = state.outcomes.find((item) => item.executionId === execution.id && item.status === "succeeded");
      const publication = execution.publication ?? (execution.socialIntentId ? state.publications.find((item) => item.id === state.socialIntents.find((intent) => intent.id === execution.socialIntentId)?.publicationId) : undefined);
      const payload = publication?.payload;
      result.set(key, {
        id: execution.id,
        presenceId: presence.id,
        kind,
        channel: presence.channel,
        text: payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : undefined,
        occurredAt: execution.executedAt ?? execution.updatedAt,
        externalRef: execution.externalRef,
        parentExternalRef: execution.target,
        executionId: execution.id,
        publicationId: publication?.id,
        environment: execution.environment,
        externalUrl: publicHistoryExternalUrl(state, presence, execution.externalRef, execution.environment),
        metrics: outcome?.metrics ?? {},
      });
    }
  }
  return [...result.values()].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export function recordRuntimeEvent(source: OpenPresenceState, presenceId: string, title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "intentId" | "executionId" | "outcomeId" | "sessionId" | "sourceObjectId">) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.events.unshift(event("system", title, detail, tone, { presenceId, ...lineage }));
  return state;
}

export function markNativeConnectionNeedsAttention(source: OpenPresenceState, presenceId: string, message: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const deliveryOnlyFailure = /no API credits remaining|temporarily rate-limited/i.test(message);
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === presenceId && connection.kind === "x"
    ? deliveryOnlyFailure
      ? { ...connection, status: "connected" as const, healthMessage: undefined, deliveryError: message, updatedAt: now() }
      : { ...connection, status: "needs-attention" as const, healthMessage: message, deliveryError: undefined, updatedAt: now() }
    : connection);
  return recordRuntimeEvent(state, presenceId, deliveryOnlyFailure ? "X delivery needs attention" : "X connection needs attention", message, "warning");
}

export function isLaunchCandidate(source: OpenPresenceState, presenceId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || presence.id !== presenceId) return false;
  const footing = presence.context.publicFooting;
  const successfulPost = state.executions.some((execution) => execution.presenceId === presenceId && execution.affordance === "x.post" && execution.status === "succeeded");
  return !successfulPost && (footing?.postsPublished ?? 0) === 0;
}

export function finishPulse(source: OpenPresenceState, presenceId: string, detail: string) {
  return recordRuntimeEvent(source, presenceId, "Pulse completed", detail, "positive");
}

const activityModeLabel = (mode: string | undefined) => mode ? mode.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Off";
const activityAffordanceLabel = (affordance: string | undefined) => activityModeLabel(affordance?.split(".").pop());

const relativeSchedule = (value: string | undefined) => {
  if (!value) return undefined;
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta)) return undefined;
  if (delta <= 0) return "due now";
  const minutes = Math.max(1, Math.round(delta / 60_000));
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
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

  let current: ActivitySummary["current"] = {
    label: "Waiting for the next meaningful event",
    detail: "Nothing is running right now. Jenny will look again when you check now or a standing intent is invoked.",
    tone: "neutral",
  };
  if (!presence) {
    current = { label: "No Presence selected", detail: "Select a Presence to see its operating state.", tone: "neutral" };
  } else if (presence.status === "paused") {
    current = { label: "Asleep", detail: "Jenny is not watching or acting on this channel right now.", tone: "warning" };
  } else if (presence.status === "disconnected") {
    current = { label: "Disconnected", detail: "This Presence cannot observe or embody actions until its channel connection is restored.", tone: "warning" };
  } else if (reviewCount > 0) {
    current = { label: "Waiting for review", detail: `${reviewCount} social intent${reviewCount === 1 ? "" : "s"} ${reviewCount === 1 ? "is" : "are"} ready for your decision.`, tone: "warning" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Calendar evaluation unavailable") {
    current = { label: "Calendar evaluation unavailable", detail: latestEvent.detail, tone: "warning" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Standing intention held") {
    current = { label: "Waiting for a better moment", detail: latestEvent.detail, tone: "quiet" };
  } else if (latestEventIsNewerThanExecution && latestEvent?.title === "Calendar attention started") {
    current = { label: "Evaluating a standing intention", detail: latestEvent.detail, tone: "positive" };
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
    current = { label: `Ready to observe ${channelName(presence.channel)}`, detail: "The native channel is connected. Observation begins when you check now or a standing intent is invoked.", tone: "positive" };
  }

  const nextAttention = presence?.status === "paused"
    ? { label: "After waking", detail: "Wake up Jenny to resume attention and begin a first check." }
    : nextSlot
      ? { label: "Next standing intent", detail: `${nextSlot.day} at ${nextSlot.time} · ${nextSlot.label}` }
      : observation?.nextObservationAt
        ? { label: "Next X observation", detail: relativeSchedule(observation.nextObservationAt) ?? "Scheduled by the connected observer." }
        : { label: "On demand", detail: "No automatic scan is scheduled because no observer or standing intent is connected." };
  const nextIntent = nextSlot
    ? { label: nextSlot.label, detail: `${nextSlot.day} at ${nextSlot.time} · ${nextSlot.executionWindow}` }
    : { label: "No standing intent scheduled", detail: "Calendar is optional; Jenny can still be asked to check the channel now." };
  const rhythm = {
    attention: presence?.status === "paused" ? "Asleep" : nativeConnection ? `Every ${attentionIntervalLabel(presence ?? undefined)}` : "On demand",
    publishing: activityModeLabel(presence?.execution.post),
    replies: activityModeLabel(presence?.execution.reply ?? presence?.execution.comment),
    quietHours: quietHoursLabel(presence?.quietHours),
  };
  return { current, lastPulseAt: pulseEvent?.time, nextAttention, nextIntent, needsAttention: { count: reviewCount, label: reviewCount ? "Needs review" : "No review items", detail: reviewCount ? `${reviewCount} action${reviewCount === 1 ? "" : "s"} waiting for approval.` : "Nothing is waiting for your decision." }, rhythm };
}

const attentionIntervalLabel = (presence: Presence | undefined) => {
  if (!presence || presence.pacing === "recommended") return "5 min";
  if (presence.pacing === "gentle") return "15 min";
  return `${Math.max(5, Math.min(120, presence.attentionIntervalMinutes || 30))} min`;
};

export const quietHoursLabel = (quietHours: PresenceQuietHours | undefined) =>
  quietHours?.enabled ? `${quietHours.start}–${quietHours.end}` : "Off";

const defaultGhostProfile = (): GhostProfile => ({ subject: "Me / my organization", priorities: "", preferences: "", voice: "", boundaries: "" });
export const defaultPublicSelf = (displayName: string, mode: "agent" | "ghost"): PublicSelf => ({ displayName, posture: mode === "ghost" ? "representational" : "contextual", approvedTechnicalFacts: [] });
export const PUBLIC_TECHNICAL_FACT_LABELS: Record<PublicTechnicalFact, string> = { "ai-presence": "This is an AI presence", "open-source": "Open source", "built-with-openpresence": "Built with OpenPresence", "model-provider": "Current model provider", "exact-model": "Exact model", tools: "Tools used" };

export function publicSelfGuidance(presence: Presence): string {
  const posture = presence.publicSelf?.posture ?? defaultPublicSelf(presence.name, presence.mode).posture;
  const facts = (presence.publicSelf?.approvedTechnicalFacts ?? []).map((fact) => PUBLIC_TECHNICAL_FACT_LABELS[fact]).join(", ") || "none";
  const postureGuidance: Record<PublicDisclosurePosture, string> = {
    contextual: "Answer from this Presence's interests, point of view, and purpose. Acknowledge AI only when relevant.",
    "ai-forward": "It is acceptable to be direct that this is an AI presence when relevant, while keeping implementation details private.",
    private: "Keep technical identity private. Answer socially from the Presence without volunteering AI or implementation details.",
    representational: "Speak as the represented person or organization. Do not collapse this public self into the private Agent behind it.",
    "open-about-assistance": "Speak as the represented person or organization, and acknowledge AI assistance when relevant without exposing private machinery.",
  };
  return `PUBLIC SELF BOUNDARY\nThis Presence appears publicly as ${presence.name}. ${postureGuidance[posture]}\nApproved technical facts that may be disclosed when relevant: ${facts}. Never invent or volunteer unapproved implementation details.`;
}

export function identityLeakageReason(state: OpenPresenceState, presence: Presence, text: string): string | undefined {
  if (presence.mode !== "ghost") return undefined;
  const approved = new Set(presence.publicSelf?.approvedTechnicalFacts ?? []);
  const agentName = state.agent?.name?.trim();
  if (agentName && agentName.toLowerCase() !== presence.name.toLowerCase() && new RegExp(`\\b${agentName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(text)) return `This Ghost draft names the private Agent identity (${agentName}).`;
  const implementationTerms = [
    !approved.has("built-with-openpresence") && "OpenPresence",
    !approved.has("model-provider") && "(?:OpenAI|Anthropic|OpenRouter|Ollama|provider)",
    !approved.has("exact-model") && "(?:GPT[- ]?\\w+|Claude|model)",
    !approved.has("tools") && "(?:system prompt|credentials?|API key|database|tool registry|worker topology|implementation details?|internal machinery|private machinery|how (?:this|the account) works)",
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
  const presence = { id: presenceId, channel: input.channel, name, handle: input.handle.trim(), mode: input.mode, status: "live" as const, accent: input.accent, capabilities, execution, executionEnvelope: makeEnvelope(presenceId, capabilities, execution), context, brief, publicSelf, mediaPerceptionPolicy: input.mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const, ghostProfile: input.mode === "ghost" ? defaultGhostProfile() : undefined, pacing: "recommended" as const, attentionIntervalMinutes: 5, quietHours: { enabled: false, start: "22:00", end: "07:00" }, accountHealth: "healthy" as const, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, connectionMode };
  presence.context = compilePresenceContext(presence);
  return presence;
}

function makeConversation(): import("./types").Conversation { const timestamp = now(); return { id: id("conversation"), title: "New conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] }; }
function defaultModel(agentId: string): AgentModelProfile { return { id: id("model"), agentId, provider: "anthropic", model: "claude", quality: "high", capabilities: { vision: true, toolCalling: true, structuredOutput: true, streaming: true }, updatedAt: now() }; }
function defaultBindings(agentId: string): AgentToolBinding[] { return ["web.search", "asset.inspect", "chart.render", "channel.execute"].map((toolId) => ({ id: id("binding"), agentId, toolId })); }

export function createAgent(input: CreateAgentInput): OpenPresenceState {
  const agent = { id: id("agent"), name: input.name.trim(), description: input.description.trim(), audience: input.audience?.trim() || "builders and curious operators", topics: ["AI agents", "software", "useful ideas"], accent: input.accent, glyph: "◉" };
  const definitions = builtinChannelDefinitions();
  const presence = makePresence({ channel: "x", handle: input.handle.trim() || `@${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`, mode: input.mode, accent: input.accent, connectionMode: "sandbox" }, agent.name, definitions[0], defaultPresenceBrief(agent));
  const conversation = makeConversation();
  const skills = [{ id: "research-to-thread", name: "Research to thread", description: "Turn a source into a clear social thread.", channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.thread", "linkedin.post"] }, { id: "data-story", name: "Data story", description: "Turn evidence into a useful visual story.", channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: ["asset.inspect", "chart.render"], compatibleFormats: ["x.media-post", "linkedin.image-post"] }];
  const environment = makeSandboxEnvironment(presence);
  return { ...initialState(), onboarded: true, agent, agents: [agent], activeAgentId: agent.id, presence, presences: [presence], activePresenceId: presence.id, files: makeFiles(input, presence), modelProfiles: [defaultModel(agent.id)], providerConnections: [{ id: id("connection"), provider: "anthropic", label: "Anthropic", status: "needs-configuration", createdAt: now() }], toolBindings: defaultBindings(agent.id), conversations: [conversation], activeConversationId: conversation.id, channelDefinitions: definitions, sandboxEnvironments: [environment], skills, agentSkills: skills.map((skill) => ({ id: id("agent-skill"), agentId: agent.id, skillId: skill.id, enabled: true })), events: [event("system", `${agent.name} is live`, `Your ${input.mode === "ghost" ? "Ghost " : "agent-owned "}Presence is ready on X.`, "positive")] };
}

function makeSandboxEnvironment(presence: Presence): SandboxEnvironment {
  const timestamp = now();
  return { id: id("sandbox"), presenceId: presence.id, channelId: presence.channel, connectorId: `sandbox-connector:${presence.id}`, status: "ready", createdAt: timestamp, updatedAt: timestamp };
}

function cloneState(source: OpenPresenceState) { return normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState); }

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

export function startPlaygroundSession(source: OpenPresenceState, presenceId?: string, sourceType: PlaygroundSession["source"] = "fresh") {
  const state = cloneState(source);
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.activePresenceId)) ?? state.presence;
  if (!presence) throw new Error("Choose a Presence before starting Playground.");
  const environment = sandboxEnvironmentFor(state, presence);
  const timestamp = now();
  const session: PlaygroundSession = { id: id("session"), environmentId: environment.id, presenceId: presence.id, channelId: presence.channel, source: sourceType, status: "active", virtualNow: timestamp, createdAt: timestamp, updatedAt: timestamp, evaluatedSlotIds: [], judgedObjectIds: [] };
  state.playgroundSessions.unshift(session);
  state.sandboxEnvironments = state.sandboxEnvironments.map((item) => item.id === environment.id ? { ...item, status: "active", updatedAt: timestamp } : item);
  state.events.unshift(event("system", "Playground session started", `${channelName(presence.channel)} is simulated. ${presence.name} is using the real Agent runtime in an isolated world.`, "positive", { presenceId: presence.id }));
  state.events[0]!.sessionId = session.id;
  return state;
}

function sandboxAssetFromInput(state: OpenPresenceState, presence: Presence, session: PlaygroundSession, input: SandboxAssetInput, visibility: "public" | "private-community" | "private-thread" | "direct-message" | "unknown", shareability: "presence-only" | "agent-wide" | "public"): Asset {
  const timestamp = now();
  const sourceUrl = input.sourceUrl?.trim() || undefined;
  const dataUrl = input.dataUrl?.trim() || undefined;
  return { id: id("asset"), agentId: state.agent?.id ?? "", presenceId: presence.id, sessionId: session.id, type: input.kind, dataUrl, checksum: `${input.name}:${input.mimeType ?? ""}:${dataUrl?.length ?? sourceUrl ?? ""}`, status: "ready", provenance: { origin: "sandbox", sourceUrl, importedAt: timestamp }, mimeType: input.mimeType, sizeBytes: dataUrl ? Math.ceil((dataUrl.length * 3) / 4) : undefined, visibility, shareability, environment: "sandbox", createdAt: timestamp, updatedAt: timestamp };
}

export function addSandboxEvent(source: OpenPresenceState, input: { sessionId: string; kind?: string; actionId?: string; actorId?: string; actorName?: string; actorHandle?: string; profile?: import("./types").SandboxActorProfile; content?: string; assets?: SandboxAssetInput[]; targetExternalRef?: EntityRef; parentExternalRef?: EntityRef }) {
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
  const content = input.content?.trim() || `${action?.label ?? "A simulated event"} occurred.`;
  const externalRef = { type: `${session.channelId}.${objectType}`, id: objectId };
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
  const object = { id: mirrorId, bridgeId: `sandbox:${session.environmentId}`, presenceId: presence.id, channelId: session.channelId, externalRef, parentExternalRef: targetExternalRef, objectType, simulationActionId: actionId, author: { externalRef: { type: `${session.channelId}.user`, id: actorId }, displayName: actorName, handle: (actor?.handle ?? input.actorHandle?.trim()) || undefined }, content: { text: content }, assetRefs: [] as { assetId: string; kind: SocialAssetKind; role?: "primary" | "attachment" | "link-preview" }[], occurredAt: observedAt, observedAt: now(), visibility, shareability, environment: "sandbox" as const, sessionId: session.id, sourceEventId: `sandbox-event:${objectId}` };
  for (const assetInput of assetInputs) {
    const asset = sandboxAssetFromInput(state, presence, session, assetInput, visibility, shareability);
    state.assets.unshift(asset);
    object.assetRefs.push({ assetId: asset.id, kind: assetInput.kind, role: assetInput.kind === "link" ? "link-preview" : object.assetRefs.length ? "attachment" : "primary" });
    state.perceptions.unshift(createAssetPerception({ asset, presenceId: presence.id, socialObjectId: mirrorId, sessionId: session.id, level: "glance", result: createUninterpretedPerception(asset) }));
  }
  state.mirrorObjects.unshift(object);
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
  session.updatedAt = now();
  state.events.unshift({ ...event("system", "Sandbox time moved", `${safeMinutes >= 0 ? "+" : ""}${safeMinutes} minutes · ${new Date(session.virtualNow).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`, "neutral", { presenceId: session.presenceId }), sessionId });
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
  state.networkSearches = state.networkSearches.filter((item) => item.sessionId !== sessionId);
  state.networkIntroductions = state.networkIntroductions.filter((item) => item.sessionId !== sessionId);
  state.publications = state.publications.filter((item) => item.sessionId !== sessionId);
  state.actions = state.actions.filter((item) => item.sessionId !== sessionId);
  state.events = state.events.filter((item) => item.sessionId !== sessionId);
  state.playgroundSessions = state.playgroundSessions.map((item) => item.id === sessionId ? { ...item, status: "active", virtualNow: timestamp, updatedAt: timestamp, evaluatedSlotIds: [], judgedObjectIds: [] } : item);
  state.sandboxEnvironments = state.sandboxEnvironments.map((item) => item.id === environmentId ? { ...item, status: "active", updatedAt: timestamp } : item);
  state.events.unshift({ ...event("system", "Fresh Sandbox account ready", "The simulated account has been refreshed for a new rehearsal.", "positive", { presenceId: session.presenceId }), sessionId });
  return state;
}

export function formSandboxIntent(source: OpenPresenceState, input: { sessionId: string; affordance: string; text: string; target?: EntityRef; perceptionTarget?: EntityRef }) {
  const state = cloneState(source);
  const session = sandboxSessionFor(state, input.sessionId);
  const presence = state.presences.find((item) => item.id === session.presenceId) ?? state.presence;
  if (!presence) throw new Error("Sandbox delivery requires a Sandbox Presence.");
  const perceptionTarget = input.target ?? input.perceptionTarget;
  const targetObject = perceptionTarget ? state.mirrorObjects.find((item) => item.sessionId === session.id && item.externalRef.type === perceptionTarget.type && item.externalRef.id === perceptionTarget.id) : undefined;
  const requirement = perceptionRequirement(targetObject, input.affordance, presence);
  const mediaReady = !requirement.materiallyDependsOnAsset || (targetObject?.assetRefs ?? []).every((ref) => hasUsablePerception(state.perceptions, ref.assetId, requirement.requiredLevel === "none" ? "glance" : requirement.requiredLevel));
  if (!mediaReady) {
    state.events.unshift({ ...event("decision", "Media needs inspection", `${presence.name} did not form a ${input.affordance} intent because attached media has not been successfully interpreted.`, "warning", { presenceId: presence.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
    return state;
  }
  const mediaReviewRequired = mediaRequiresReview(state.perceptions, targetObject, presence, requirement.requiredLevel === "none" ? "glance" : requirement.requiredLevel);
  const executionMode = presence.execution[input.affordance] ?? "off";
  const timestamp = now();
  const publication: Publication = { id: id("publication"), format: `${session.channelId}.${input.affordance}`, payload: { text: input.text.trim() }, assetIds: [], links: [], createdAt: timestamp, environment: "sandbox", sessionId: session.id };
  const intent: SocialIntent = { id: id("intent"), agentId: state.agent?.id ?? "", presenceId: presence.id, affordance: input.affordance, target: input.target, publicationId: publication.id, priority: 50, validity: { staleAfterMs: 60 * 60 * 1000 }, state: executionMode === "off" ? "withdrawn" : "active", formedAt: timestamp, updatedAt: timestamp, environment: "sandbox", sessionId: session.id };
  if (executionMode === "off") {
    state.publications.unshift(publication);
    state.socialIntents.unshift(intent);
    state.actions.unshift({ id: id("act"), intent: "no_op", target: input.target?.id, summary: input.text.trim() || `Selected ${input.affordance}`, status: "skipped", reason: `${input.affordance} is off in the Presence execution envelope.`, createdAt: timestamp, socialIntentId: intent.id, sessionId: session.id });
    state.events.unshift({ ...event("decision", "Affordance is off", `${presence.name} considered ${input.affordance}, but the operator's execution envelope leaves it off. No execution was created.`, "quiet", { presenceId: presence.id, intentId: intent.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
    return state;
  }
  const leakageReason = identityLeakageReason(state, presence, input.text);
  const reviewReason = leakageReason ?? (mediaReviewRequired ? "Attached media remains uncertain and this Presence requires review before acting." : undefined);
  const status = reviewReason ? "awaiting-review" : executionMode === "auto" ? "queued" : executionMode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: intent.id, presenceId: presence.id, affordance: input.affordance, mode: executionMode, status, attempts: 0, bridgeId: `sandbox:${session.environmentId}`, connector: "simulated", idempotencyKey: `sandbox:${session.id}:${intent.id}`, target: input.target, publication, reviewReason, createdAt: timestamp, updatedAt: timestamp, environment: "sandbox", sessionId: session.id };
  state.publications.unshift(publication); state.socialIntents.unshift(intent); state.executions.unshift(execution);
  state.events.unshift({ ...event("decision", leakageReason ? "Identity disclosure needs review" : mediaReviewRequired ? "Media action needs review" : "Social Intent formed", reviewReason ?? `${presence.name} chose ${input.affordance} for the simulated ${channelName(session.channelId)} world.`, leakageReason || mediaReviewRequired ? "warning" : "positive", { presenceId: presence.id, intentId: intent.id, executionId: execution.id, sourceObjectId: targetObject?.id }), sessionId: session.id });
  return state;
}

export function deliverSandboxExecution(source: OpenPresenceState, executionId: string) {
  const state = cloneState(source);
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution || execution.environment !== "sandbox" || execution.connector !== "simulated" || !execution.sessionId || !execution.bridgeId?.startsWith("sandbox:")) throw new Error("Sandbox delivery rejected a non-simulated execution.");
  const session = sandboxSessionFor(state, execution.sessionId);
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  const publication = intent?.publicationId ? state.publications.find((item) => item.id === intent.publicationId) : undefined;
  const text = publication?.payload && typeof publication.payload === "object" && "text" in publication.payload && typeof publication.payload.text === "string" ? publication.payload.text : "";
  if (!text.trim() && !["like", "reaction", "repost"].includes(execution.affordance)) throw new Error("Sandbox delivery requires a publication draft.");
  const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
  if (!presence) throw new Error("The Sandbox Presence is unavailable.");
  const objectId = id("sandbox-post");
  const externalRef = { type: `${session.channelId}.${execution.affordance}`, id: objectId };
  const object = { id: id("mirror"), bridgeId: `sandbox:${session.environmentId}`, presenceId: presence.id, channelId: session.channelId, externalRef, parentExternalRef: execution.target, objectType: execution.affordance, author: { externalRef: { type: `${session.channelId}.user`, id: `agent:${presence.id}` }, displayName: presence.name, handle: presence.handle }, content: { text: text || undefined }, occurredAt: session.virtualNow, observedAt: now(), visibility: "public" as const, shareability: "presence-only" as const, originExecutionId: execution.id, actorPresenceId: presence.id, sourceEventId: `sandbox-delivery:${execution.id}`, environment: "sandbox" as const, sessionId: session.id };
  state.mirrorObjects.unshift(object);
  state.mirrorEvents.unshift({ id: id("mirror-event"), bridgeId: object.bridgeId, presenceId: presence.id, sourceEventId: object.sourceEventId!, event: "created", externalRef, object, receivedAt: now(), environment: "sandbox", sessionId: session.id });
  execution.status = "succeeded"; execution.attempts += 1; execution.externalRef = externalRef; execution.executedAt = now(); execution.updatedAt = now();
  state.outcomes.unshift({ id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: presence.id, status: "succeeded", observedAt: now(), metrics: {}, evidence: [externalRef], environment: "sandbox", sessionId: session.id });
  state.events.unshift({ ...event("execution", "Sandbox delivery complete", `The ${channelName(session.channelId)} object is visible in this simulated world only.`, "positive", { presenceId: presence.id, executionId: execution.id }), sessionId: session.id });
  return state;
}

export function recordSandboxNetworkSearch(source: OpenPresenceState, input: { sessionId: string; presenceId: string; result: import("./network").NetworkSearchResult }) {
  const state = cloneState(source);
  const timestamp = now();
  const searchId = id("network-search");
  state.networkSearches.unshift({ id: searchId, sessionId: input.sessionId, presenceId: input.presenceId, query: input.result.query, status: input.result.status, candidates: input.result.candidates, limitation: input.result.limitation, createdAt: timestamp });
  for (const candidate of input.result.candidates.filter((item) => item.permission !== "not-available")) {
    state.networkIntroductions.unshift({ id: id("network-intro"), searchId, sessionId: input.sessionId, presenceId: input.presenceId, candidateActorId: candidate.actorId, status: candidate.permission === "allowed" ? "proposed" : "awaiting-consent", createdAt: timestamp, updatedAt: timestamp });
  }
  const detail = input.result.status === "matches"
    ? `The Agent found ${input.result.candidates.length} verified sandbox candidate${input.result.candidates.length === 1 ? "" : "s"}; introduction permission was preserved in the audit record.`
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

function normalizeState(raw: OpenPresenceState): OpenPresenceState {
  const state = raw as OpenPresenceState & { presences?: Presence[]; conversations?: import("./types").Conversation[]; activeConversationId?: string | null; activePresenceId?: string | null };
  const agents = state.agents?.length ? state.agents : state.agent ? [state.agent] : [];
  const activeAgentId = state.activeAgentId ?? state.agent?.id ?? agents[0]?.id ?? null;
  const activeAgent = agents.find((item) => item.id === activeAgentId) ?? agents[0];
  const fallbackBrief = defaultPresenceBrief(activeAgent);
  const fallbackPresence = state.presence ? hydratePresence(state.presence, fallbackBrief) : null;
  const presences = state.presences?.length ? state.presences.map((item) => hydratePresence(item, fallbackBrief)) : fallbackPresence ? [fallbackPresence] : [];
  const activePresenceId = state.activePresenceId ?? presences[0]?.id ?? null;
  const presence = presences.find((item) => item.id === activePresenceId) ?? presences[0] ?? null;
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
  const skills = (state.skills ?? []).map((skill) => ({ ...skill, name: skill.name ?? skill.id.replaceAll("-", " ") }));
  const providerConnections = (state.providerConnections ?? []).map((connection) => ({ ...connection, label: providerName(connection.provider) }));
  const normalized = { ...base, ...state, agents, activeAgentId, agentWorkspaces: state.agentWorkspaces ?? [], presence, presences, activePresenceId, conversations, activeConversationId, calendar, messages: conversations.find((item) => item.id === activeConversationId)?.messages ?? legacyMessages, modelProfiles: state.modelProfiles ?? [], providerConnections, toolBindings: state.toolBindings ?? [], changeSets: state.changeSets ?? [], standingIntents: state.standingIntents ?? [], socialIntents: state.socialIntents ?? [], executions: state.executions ?? [], outcomes: state.outcomes ?? [], publications: state.publications ?? [], librarySources: state.librarySources ?? [], assets: state.assets ?? [], perceptions: state.perceptions ?? [], skills, agentSkills: state.agentSkills ?? [], contentDrops: state.contentDrops ?? [], channelDefinitions: state.channelDefinitions?.length ? state.channelDefinitions : base.channelDefinitions, nativeConnections: state.nativeConnections ?? [], bridges: state.bridges ?? [], mirrorObjects: state.mirrorObjects ?? [], mirrorEvents: state.mirrorEvents ?? [], bridgeSync: state.bridgeSync ?? [], sandboxEnvironments: state.sandboxEnvironments ?? [], playgroundSessions: state.playgroundSessions ?? [], sandboxActors: state.sandboxActors ?? [], networkSearches: state.networkSearches ?? [], networkIntroductions: state.networkIntroductions ?? [] };
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
  const brief = normalizePresenceBrief(raw.brief ?? raw.context?.brief, fallbackBrief);
  const context = raw.context ?? { presenceId: idValue, channel: raw.channel ?? "x", publicIdentity: { displayName: name, handle: raw.handle, mode }, publicSelf, brief, availableAffordances: capabilities.map((item) => item.id) };
  const executionEnvelope = raw.executionEnvelope ?? makeEnvelope(idValue, capabilities, execution);
  const ghostProfile = raw.ghostProfile ?? (raw.mode === "ghost" ? defaultGhostProfile() : undefined);
  const connectionMode: PresenceConnectionMode = raw.connectionMode ?? (raw.environment === "sandbox" ? "sandbox" : raw.channel === "x" ? "native" : "bridge");
  const pacing = raw.pacing ?? "recommended";
  const attentionIntervalMinutes = Math.max(5, Math.min(120, raw.attentionIntervalMinutes ?? (pacing === "gentle" ? 15 : 5)));
  const quietHours = { enabled: Boolean(raw.quietHours?.enabled), start: raw.quietHours?.start ?? "22:00", end: raw.quietHours?.end ?? "07:00" };
  return { ...raw, id: idValue, channel: raw.channel ?? "x", name, mode, capabilities, execution, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, executionEnvelope: { ...executionEnvelope, presenceId: idValue, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? executionEnvelope.affordances?.[item.id]?.mode ?? "off" }])) }, context: compilePresenceContext({ ...raw, id: idValue, name, mode, capabilities, brief, ghostProfile, publicSelf, mediaPerceptionPolicy, executionEnvelope, context } as Presence), pacing, attentionIntervalMinutes, quietHours, accountHealth: raw.accountHealth ?? "healthy", environment: connectionMode === "sandbox" ? "sandbox" : "live", connectionMode };
}

function snapshotWorkspace(state: OpenPresenceState): import("./types").AgentWorkspaceSnapshot {
  const workspace = JSON.parse(JSON.stringify(state)) as Partial<OpenPresenceState>;
  delete workspace.agents;
  delete workspace.activeAgentId;
  delete workspace.agentWorkspaces;
  return workspace as import("./types").AgentWorkspaceSnapshot;
}

function restoreWorkspace(state: OpenPresenceState, workspace: import("./types").AgentWorkspaceSnapshot, agentWorkspaces: import("./types").AgentWorkspaceSnapshot[]): OpenPresenceState {
  return normalizeState({ ...state, ...workspace, agents: state.agents, activeAgentId: workspace.agent?.id ?? null, agentWorkspaces });
}

function recordChangeSet(state: OpenPresenceState, summary: string, operations: ChangeSetOperation[], conversationId?: string): string | undefined {
  if (!state.agent) return undefined;
  const changeSet: ChangeSet = { id: id("changeset"), agentId: state.agent.id, conversationId, summary, operations, createdAt: now() };
  state.changeSets.unshift(changeSet);
  return changeSet.id;
}
function proposal(state: OpenPresenceState, kind: FileKind, proposed: string, reason: string, conversationId?: string): FileProposal { const current = state.files.find((file) => file.kind === kind)?.content ?? ""; const changeSetId = recordChangeSet(state, `Propose ${kind}.md change`, [{ path: `agentFiles.${kind}`, action: "update", before: current, after: proposed }], conversationId); return { id: id("proposal"), file: kind, title: `Update ${kind}.md`, reason, current, proposed, status: "pending", createdAt: now(), changeSetId }; }
function activeConversation(state: OpenPresenceState, conversationId?: string) { return state.conversations.find((conversation) => conversation.id === (conversationId ?? state.activeConversationId)) ?? state.conversations[0]; }
function syncMessages(state: OpenPresenceState) { state.messages = activeConversation(state)?.messages ?? []; }

function inferPresenceBriefChange(content: string, current: PresenceBrief): { brief: PresenceBrief; summary: string } | undefined {
  const clean = (value: string) => value.trim().replace(/[.!?]+$/, "").trim();
  const splitTerritory = (value: string) => value.split(/,|\s+and\s+/i).map(clean).filter(Boolean);
  const territory = content.match(/\b(?:mostly|mainly)\s+about\s+(.+?)(?:[.!?]|$)/i)?.[1];
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

function makeStandingIntent(state: OpenPresenceState, instruction: string, presence: Presence | null, day: string, time: string, objective: string, executionWindow: string): StandingIntent {
  const timestamp = now();
  return { id: id("standing"), agentId: state.agent?.id ?? "", presenceId: presence?.id, instruction: instruction.trim(), trigger: { type: "schedule", config: { day, time } }, objective, quality: { skipIfNothingWorthSaying: true }, executionWindow: { startsAt: executionWindow.split("–")[0], endsAt: executionWindow.split("–")[1] }, status: "active", createdAt: timestamp, updatedAt: timestamp };
}

function bridgeFor(state: OpenPresenceState, presenceId: string, affordance: string): Bridge | undefined { return state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.state !== "offline" && bridge.capabilities.affordances.includes(affordance)); }
function normalizedCapabilities(input: ConnectorCapabilities): ConnectorCapabilities { return { inbound: input.inbound, reconcile: input.reconcile, affordances: [...new Set(input.affordances)], formats: [...new Set(input.formats)], metrics: [...new Set(input.metrics)] }; }
function makePublication(state: OpenPresenceState, text: string, format: string): Publication { const publication: Publication = { id: id("publication"), format, payload: { text }, assetIds: [], links: [], createdAt: now() }; state.publications.unshift(publication); return publication; }

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
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId: standing.id, environment: presence.environment ?? "live" };
  state.socialIntents.unshift(socialIntent);
  const mode = slot.mode;
  if (mode !== "off") {
    const bridge = presence.connectionMode === "bridge" ? bridgeFor(state, presence.id, "post") : undefined;
    const nativeX = presence.channel === "x" && presence.connectionMode !== "bridge" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write") : undefined;
    const simulated = !bridge && !nativeX && presence.channel === "x" && process.env.OPENPRESENCE_TEST_MODE === "1";
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

export function formChatPostIntent(source: OpenPresenceState, text: string, standingIntentId?: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const publication = makePublication(state, text.trim(), "x.post");
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.post", publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId };
  state.socialIntents.unshift(socialIntent);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Post intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
    return state;
  }
  const bridge = presence.connectionMode === "bridge" ? bridgeFor(state, presence.id, "post") : undefined;
  const nativeX = presence.connectionMode !== "bridge" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write") : undefined;
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const status = leakageReason ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.post", mode, status, attempts: 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, reviewReason: leakageReason, createdAt: formedAt, updatedAt: formedAt };
  state.executions.unshift(execution);
  const reason = standingIntentId ? "Jenny evaluated a Calendar standing intention and handed the resulting Social Intent to the Presence execution envelope." : "The operator asked Jenny to introduce this Presence through the native X connector.";
  state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: mode === "review" ? "review" : "queued", reason, createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", leakageReason ? "Identity disclosure needs review" : standingIntentId ? "A Calendar post intention was formed" : "A post intention was formed", leakageReason ?? (connector ? (standingIntentId ? `${presence.name} judged the standing intention worthwhile and handed it to the native X connector.` : `${presence.name} formed an X post from the conversation and handed it to the Presence execution envelope.`) : `${presence.name} formed an X post, but no write-enabled X connector is available.`), leakageReason ? "warning" : connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id }));
  return state;
}

export function formStandingPostIntent(source: OpenPresenceState, text: string, standingIntentId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || !text.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const affordance = `${presence.channel}.post`;
  const publication = makePublication(state, text.trim(), affordance);
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId, environment: presence.environment ?? "live" };
  state.socialIntents.unshift(socialIntent);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Calendar intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
    return state;
  }
  const bridge = presence.connectionMode === "bridge" ? bridgeFor(state, presence.id, "post") : undefined;
  const nativeX = presence.channel === "x" && presence.connectionMode !== "bridge" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write") : undefined;
  const simulated = !bridge && !nativeX && presence.channel === "x" && process.env.OPENPRESENCE_TEST_MODE === "1";
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

export function formXReplyIntent(source: OpenPresenceState, text: string, parentId: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim() || !parentId.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const publication = makePublication(state, text.trim(), "x.reply");
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.reply", target: { type: "x.post", id: parentId }, publicationId: publication.id, priority: 60, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt };
  state.socialIntents.unshift(socialIntent);
  const mode = presence.execution.reply ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: "skipped", reason: "Replies are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Reply intention held", "Jenny formed a social intention, but Replies are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
    return state;
  }
  const nativeX = presence.connectionMode !== "bridge" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write") : undefined;
  const bridge = presence.connectionMode === "bridge" ? bridgeFor(state, presence.id, "reply") : undefined;
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const leakageReason = identityLeakageReason(state, presence, text);
  const status = leakageReason ? "awaiting-review" : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.reply", mode, status, attempts: 0, bridgeId: bridge?.id, connector, target: { type: "x.post", id: parentId }, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, reviewReason: leakageReason, createdAt: formedAt, updatedAt: formedAt };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: "reply", target: parentId, summary: text.trim(), status: mode === "review" ? "review" : "queued", reason: "Jenny chose to continue a relevant conversation through the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", "A reply intention was formed", connector ? "Jenny found a relevant X conversation and handed a contextual reply to the Presence execution envelope." : "Jenny found a relevant X conversation, but no write-enabled X connector is available.", connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id }));
  return state;
}

export function completeNativeExecution(source: OpenPresenceState, executionId: string, externalRef: import("./types").EntityRef) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const execution = state.executions.find((item) => item.id === executionId && item.connector === "native");
  if (!execution) throw new Error("Native execution not found.");
  execution.status = "succeeded";
  execution.attempts += 1;
  execution.externalRef = externalRef;
  execution.executedAt = now();
  execution.updatedAt = now();
  const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [externalRef] };
  state.outcomes.unshift(outcome);
  state.nativeConnections = state.nativeConnections.map((connection) => connection.presenceId === execution.presenceId && connection.kind === "x"
    ? { ...connection, deliveryError: undefined, updatedAt: now() }
    : connection);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "executed"; action.outcomeId = outcome.id; }
  state.events.unshift(event("execution", "Published on X", "The native X connector delivered the approved action and returned an external reference.", "positive", { presenceId: execution.presenceId, executionId: execution.id, outcomeId: outcome.id }));
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

export function applyOperation(source: OpenPresenceState, operation: Operation | import("./types").ToolBindingOperation): OpenPresenceState {
  let state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  switch (operation.type) {
    case "reset": return initialState();
    case "setToolBinding": {
      if (!state.agent || !operation.toolId.trim()) return state;
      const toolId = operation.toolId.trim();
      const existing = state.toolBindings.find((item) => item.agentId === state.agent?.id && item.toolId === toolId);
      if (existing) {
        if (operation.provider !== undefined) existing.provider = operation.provider;
        if (operation.model !== undefined) existing.model = operation.model.trim() || undefined;
        if (operation.connectionId !== undefined) existing.connectionId = operation.connectionId.trim() || undefined;
      } else state.toolBindings.push({ id: id("binding"), agentId: state.agent.id, toolId, provider: operation.provider, model: operation.model?.trim() || undefined, connectionId: operation.connectionId?.trim() || undefined });
      state.events.unshift(event("system", "Tool binding updated", `${toolId} now has an explicit runtime binding for this Agent.`, "positive"));
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
    case "createBridge": { const presence = state.presences.find((item) => item.id === operation.input.presenceId); if (!presence) return state; const existing = state.bridges.find((bridge) => bridge.presenceId === presence.id && bridge.state !== "offline" && operation.input.capabilities.affordances.some((affordance) => bridge.capabilities.affordances.includes(affordance))); if (existing) return state; const timestamp = now(); const bridge: Bridge = { id: id("bridge"), presenceId: presence.id, channelId: presence.channel, name: operation.input.name.trim() || "External Bridge", kind: operation.input.kind, state: operation.input.kind === "manual" ? "online" : "offline", capabilities: normalizedCapabilities(operation.input.capabilities), createdAt: timestamp, updatedAt: timestamp }; state.bridges.unshift(bridge); state.bridgeSync.unshift({ bridgeId: bridge.id, status: bridge.state === "online" ? "healthy" : "offline" }); if (presence.connectionMode === "sandbox") { presence.connectionMode = "bridge"; presence.environment = "live"; presence.context = compilePresenceContext(presence); } state.events.unshift(event("system", `${bridge.name} added`, bridge.kind === "manual" ? "Manual relay is ready." : "Connect the executor to begin syncing.", "positive")); return state; }
    case "rotateBridgeKey": { const bridge = state.bridges.find((item) => item.id === operation.id); if (bridge) { bridge.updatedAt = now(); bridge.state = "offline"; state.events.unshift(event("system", "Bridge key rotated", `${bridge.name} is offline until the new key is connected.`, "warning")); } return state; }
    case "revokeBridge": { const bridge = state.bridges.find((item) => item.id === operation.id); if (bridge) { bridge.state = "offline"; bridge.updatedAt = now(); state.events.unshift(event("system", "Bridge disconnected", `${bridge.name} can no longer receive work.`, "warning")); } return state; }
    case "removeBridge": { const bridge = state.bridges.find((item) => item.id === operation.id); if (!bridge || bridge.state !== "offline") return state; state.bridges = state.bridges.filter((item) => item.id !== operation.id); state.bridgeSync = state.bridgeSync.filter((item) => item.bridgeId !== operation.id); state.events.unshift(event("system", "Bridge removed", `${bridge.name} was removed from the active connector list. Historical mirror data was retained.`, "warning")); return state; }
    case "selectPresence": { const selected = state.presences.find((item) => item.id === operation.id); if (!selected) return state; state.activePresenceId = selected.id; state.presence = selected; return state; }
    case "selectConversation": { if (!state.conversations.some((conversation) => conversation.id === operation.id)) return state; state.activeConversationId = operation.id; syncMessages(state); return state; }
    case "newConversation": { const conversation = makeConversation(); state.conversations.unshift(conversation); state.activeConversationId = conversation.id; syncMessages(state); return state; }
    case "sendMessage": {
      const content = operation.content.trim(); if (!content || !state.agent) return state; let conversation = activeConversation(state, operation.conversationId); if (!conversation) { conversation = makeConversation(); state.conversations.unshift(conversation); state.activeConversationId = conversation.id; }
      conversation.messages.push({ id: id("msg"), role: "operator", content, timestamp: now() }); if (conversation.title === "New conversation") conversation.title = content.replace(/\s+/g, " ").slice(0, 42) + (content.length > 42 ? "…" : "");
      const lower = content.toLowerCase(); let reply = "I heard you. I’ll keep that in the working context and use it when the next decision calls for it."; let change: string | undefined;
      const briefChange = state.presence ? inferPresenceBriefChange(content, state.presence.brief) : undefined;
      if (briefChange && state.presence) { state = applyOperation(state, { type: "setPresence", patch: { brief: briefChange.brief } }); reply = "I updated this Presence Brief. The Agent remains the same, while this social role now has a clearer emphasis here."; change = briefChange.summary; }
      else if (lower.includes("em dash") || lower.includes("em-dash")) { const current = state.files.find((file) => file.kind === "TASTE")?.content ?? ""; state.proposals.push(proposal(state, "TASTE", `${current}\n\n## Style note\n\nPrefer commas, periods, or a clean line break over em dashes.`, "You asked for a durable writing preference. Protected identity files change through proposals.", conversation.id)); reply = "I turned that into a Taste proposal so it can become a durable preference without silently rewriting who I am."; change = "Taste proposal created"; }
      else if (lower.includes("tuesday") || lower.includes("schedule") || lower.includes("every ")) { const instruction = content.replace(/^schedule\s+/i, "").replace(/[.!?]+$/, "").trim() || "Teach the audience one useful thing."; const slot = makeCalendarSlot(instruction, state.presence); const standing = makeStandingIntent(state, instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); slot.standingIntentId = standing.id; state.standingIntents.push(standing); state.calendar.push(slot); recordChangeSet(state, "Create standing intent", [{ path: "standingIntents", action: "create", after: standing.instruction }], conversation.id); reply = `I created a standing intention: ${slot.label}. I’ll evaluate it in the moment and let it expire without publishing if there is nothing worthwhile.`; change = "Standing intention created"; }
      else if (lower.includes("ghost")) { const presence = state.presence ? { ...state.presence, mode: "ghost" as const } : null; if (presence) { presence.context = compilePresenceContext(presence); state.presence = presence; state.presences = state.presences.map((item) => item.id === presence.id ? presence : item); } const file = state.files.find((item) => item.kind === "PRESENCE"); if (file && presence) file.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode: "ghost", handle: presence.handle, accent: state.agent.accent }); recordChangeSet(state, "Change Presence mode", [{ path: `presences.${state.presence?.id}.mode`, action: "update", after: "ghost" }], conversation.id); reply = "I updated this Presence to Ghost mode. I’ll extend the operator’s attention and judgment rather than pretending to be a different public speaker."; change = "Presence changed to Ghost"; }
      conversation.messages.push({ id: id("msg"), role: "agent", content: reply, timestamp: now(), change }); conversation.updatedAt = now(); state.events.unshift(event("decision", "A conversation with the operator", change ?? "Working context updated.", change ? "positive" : "neutral")); syncMessages(state); return state;
    }
    case "saveFile": { const file = state.files.find((item) => item.kind === operation.kind); if (!file || file.content === operation.content) return state; if (file.protected) { state.proposals.push(proposal(state, operation.kind, operation.content, "Protected meaning files are reviewed before they change.")); state.events.unshift(event("system", `${operation.kind}.md needs your review`, "A protected meaning change is waiting in Brain.", "warning")); } else { const before = file.content; file.content = operation.content; file.revision += 1; file.updatedAt = now(); recordChangeSet(state, `Update ${operation.kind}.md`, [{ path: `agentFiles.${operation.kind}`, action: "update", before, after: operation.content }]); state.events.unshift(event("learning", `${operation.kind}.md updated`, "The change was saved to the local agent state.", "positive")); } return state; }
    case "resolveProposal": { const item = state.proposals.find((entry) => entry.id === operation.id); if (!item || item.status !== "pending") return state; item.status = operation.decision === "approve" ? "approved" : "rejected"; if (operation.decision === "approve") { const file = state.files.find((entry) => entry.kind === item.file); if (file) { file.content = item.proposed; file.revision += 1; file.updatedAt = now(); } state.events.unshift(event("system", `${item.file}.md approved`, "The protected meaning file was updated and versioned.", "positive")); } else state.events.unshift(event("system", `${item.file}.md proposal rejected`, "The current meaning stays unchanged.", "quiet")); return state; }
    case "addSlot": { const targetPresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; const slot = makeCalendarSlot(operation.instruction, targetPresence, operation.day, operation.time, operation.objective, operation.executionWindow); const standing = makeStandingIntent(state, slot.instruction, targetPresence, slot.day, slot.time, slot.objective, slot.executionWindow); slot.standingIntentId = standing.id; state.standingIntents.push(standing); state.calendar.push(slot); recordChangeSet(state, "Create standing intent", [{ path: "standingIntents", action: "create", after: standing.instruction }]); state.events.unshift(event("system", "Standing intention added", `${slot.label} · ${slot.day} at ${slot.time}.`, "positive")); return state; }
    case "editSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const targetPresence = state.presences.find((item) => item.id === slot.presence) ?? state.presence; const previous = { ...slot }; const scheduleChanged = previous.day !== operation.day || previous.time !== operation.time; slot.instruction = operation.instruction.trim() || slot.instruction; slot.label = slot.instruction.length > 34 ? `${slot.instruction.slice(0, 34).trim()}…` : slot.instruction; slot.day = operation.day; slot.time = operation.time; slot.objective = operation.objective; slot.executionWindow = operation.executionWindow; slot.mode = targetPresence?.execution.post ?? slot.mode; if (scheduleChanged) slot.lastEvaluatedAt = undefined; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId); if (standing) { const [startsAt, endsAt] = slot.executionWindow.split(/[–-]/).map((part) => part.trim()); standing.instruction = slot.instruction; standing.presenceId = targetPresence?.id; standing.trigger = { type: "schedule", config: { day: slot.day, time: slot.time } }; standing.objective = slot.objective; standing.executionWindow = { startsAt, endsAt: endsAt || startsAt }; standing.updatedAt = now(); } recordChangeSet(state, "Edit standing intent", [{ path: `calendar.${slot.id}`, action: "update", before: previous.instruction, after: slot.instruction }]); state.events.unshift(event("system", "Standing intention updated", `${slot.label} · ${slot.day} at ${slot.time}.`, "positive")); return state; }
    case "createSkill": { if (!state.agent || !operation.name.trim() || !operation.description.trim()) return state; const skillId = `${operation.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill"}-${Date.now().toString(36)}`; const skill = { id: skillId, name: operation.name.trim(), description: operation.description.trim(), channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: [], compatibleFormats: [] }; state.skills.push(skill); state.agentSkills.push({ id: id("agent-skill"), agentId: state.agent.id, skillId: skill.id, enabled: true }); state.events.unshift(event("learning", "Skill created", `${skill.name} is installed and enabled for ${state.agent.name}.`, "positive")); return state; }
    case "editSkill": { const skill = state.skills.find((item) => item.id === operation.id); if (!skill || !operation.name.trim() || !operation.description.trim()) return state; const previous = { name: skill.name, description: skill.description }; skill.name = operation.name.trim(); skill.description = operation.description.trim(); state.events.unshift(event("learning", "Skill updated", `${skill.name} instruction prompt updated.`, "positive")); recordChangeSet(state, "Edit skill", [{ path: `skills.${skill.id}`, action: "update", before: previous.description, after: skill.description }]); return state; }
    case "configureProvider": { if (!state.agent) return state; const name = providerName(operation.provider); const existing = state.providerConnections.find((item) => item.provider === operation.provider); const status = operation.provider === "ollama" ? "local" as const : "available" as const; if (existing) { existing.label = name; existing.status = status; existing.endpoint = operation.endpoint?.trim() || existing.endpoint; existing.secretConfigured = operation.hasSecret || existing.secretConfigured; } else state.providerConnections.push({ id: id("connection"), provider: operation.provider, label: name, status, endpoint: operation.endpoint?.trim() || undefined, secretConfigured: operation.hasSecret, createdAt: now() }); state.events.unshift(event("system", `${name} connected`, operation.provider === "ollama" ? "Local models are ready to use." : "Provider access is configured for this Agent.", "positive")); return state; }
    case "runSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId) ?? makeStandingIntent(state, slot.instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); addSocialEvaluation(state, standing, slot); return state; }
    case "confirmAutoMode": return confirmAutoMode(state, operation.presenceId, operation.capabilities, operation.executionIds);
    case "approveExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (execution?.status === "awaiting-review") { execution.status = execution.bridgeId ? "approved" : "approved"; execution.updatedAt = now(); state.events.unshift(event("execution", "Approved for execution", "The operator approved this social action; it remains separate from Jenny's judgment.", "positive", { executionId: execution.id })); } return state; }
    case "executeIntent": { const intent = state.socialIntents.find((item) => item.id === operation.id); if (!intent) return state; const execution = state.executions.find((item) => item.socialIntentId === intent.id); if (!execution || intent.state !== "active") return state; if (["awaiting-review", "awaiting-manual", "awaiting-connector", "claimed", "executing", "succeeded"].includes(execution.status)) { if (execution.status === "approved" && execution.bridgeId) execution.status = "queued"; else return state; } if (intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) { intent.state = "expired"; execution.status = "expired"; execution.updatedAt = now(); state.events.unshift(event("decision", "Intent expired", "The social moment passed before execution.", "quiet", { intentId: intent.id, executionId: execution.id })); return state; } if (execution.bridgeId) { execution.status = "queued"; execution.updatedAt = now(); state.events.unshift(event("execution", "Queued for Bridge", "The execution is ready for an external executor.", "positive", { intentId: intent.id, executionId: execution.id })); return state; } execution.status = "succeeded"; execution.attempts += 1; execution.updatedAt = now(); execution.executedAt = now(); const outcome = { id: id("outcome"), socialIntentId: intent.id, executionId: execution.id, presenceId: intent.presenceId, status: "succeeded" as const, observedAt: now(), metrics: {} }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Execution completed", "The simulated channel accepted the action.", "positive", { intentId: intent.id, executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "markManualExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (!execution || execution.status !== "awaiting-manual") return state; execution.status = "succeeded"; execution.externalRef = operation.externalRef; execution.attempts += 1; execution.executedAt = now(); execution.updatedAt = now(); const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [operation.externalRef] }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Manual relay completed", "The operator marked the external action as posted.", "positive", { executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "setModel": { const profile = state.modelProfiles.find((item) => item.agentId === state.agent?.id); if (profile && operation.model.trim()) { profile.model = operation.model.trim(); if (operation.provider) profile.provider = operation.provider; if (operation.quality) profile.quality = operation.quality; if (operation.vision !== undefined) profile.capabilities = { ...profile.capabilities, vision: operation.vision }; else if (operation.provider) profile.capabilities = { ...profile.capabilities, vision: ["openai", "anthropic", "gemini"].includes(operation.provider) }; const connection = state.providerConnections.find((item) => item.provider === profile.provider && item.status !== "needs-configuration"); if (connection) profile.connectionId = connection.id; profile.updatedAt = now(); } return state; }
    case "wakePresence": { const target = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!target || target.status !== "paused") return state; const updated = { ...target, status: "live" as const }; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); if (state.presence?.id === updated.id) state.presence = updated; state.events.unshift(event("system", "Jenny woke up", "The Presence is active again and beginning its first attention cycle.", "positive", { presenceId: updated.id })); return state.nativeConnections.some((connection) => connection.presenceId === updated.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, updated); }
    case "runPulse": { const pulsePresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!pulsePresence || pulsePresence.status !== "live") return state; return state.nativeConnections.some((connection) => connection.presenceId === pulsePresence.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, pulsePresence); }
    case "syncNativeX": return state;
    case "startPlayground":
    case "resetPlayground":
    case "inspectSandboxMedia":
    case "addSandboxEvent":
    case "advanceSandboxTime":
    case "runSandboxPulse": return state;
    case "approveSandboxIntroduction":
    case "declineSandboxIntroduction": return state;
    case "setPresence": { if (state.presence) { const patch = operation.patch as typeof operation.patch & { publicSelf?: PublicSelf }; const requestedConnectionMode = patch.connectionMode ?? state.presence.connectionMode ?? (state.presence.environment === "sandbox" ? "sandbox" : state.presence.channel === "x" ? "native" : "bridge"); const connectionMode = requestedConnectionMode === "native" && state.presence.channel !== "x" ? "bridge" as const : requestedConnectionMode; const name = patch.name?.trim() || state.presence.name; const mode = patch.mode ?? state.presence.mode; const posture = patch.publicSelf?.posture ?? state.presence.publicSelf?.posture; const compatiblePostures = mode === "ghost" ? ["representational", "open-about-assistance"] : ["contextual", "ai-forward", "private"]; const publicSelf = { ...(patch.publicSelf ?? state.presence.publicSelf ?? defaultPublicSelf(name, mode)), displayName: name, posture: compatiblePostures.includes(posture as never) ? posture! : defaultPublicSelf(name, mode).posture }; const mediaPerceptionPolicy = patch.mediaPerceptionPolicy ?? state.presence.mediaPerceptionPolicy ?? (mode === "ghost" ? "review-uncertain" as const : "use-judgment" as const); const updated = { ...state.presence, ...patch, mediaPerceptionPolicy, publicSelf, connectionMode, environment: connectionMode === "sandbox" ? "sandbox" as const : "live" as const, name, mode, ghostProfile: patch.ghostProfile ?? state.presence.ghostProfile ?? (mode === "ghost" ? defaultGhostProfile() : undefined), execution: patch.execution ? { ...state.presence.execution, ...patch.execution } : state.presence.execution }; updated.executionEnvelope = { ...state.presence.executionEnvelope, affordances: Object.fromEntries(channelCapabilities(state, updated.channel).map((item) => [item.id, { mode: updated.execution[item.id] ?? "off" }])) }; updated.context = compilePresenceContext(updated); if (patch.brief) recordChangeSet(state, "Update Presence Brief", [{ path: `presences.${updated.id}.brief`, action: "update", before: state.presence.brief as unknown as JsonValue, after: updated.brief as unknown as JsonValue }]); state.presence = updated; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); const presenceFile = state.files.find((file) => file.kind === "PRESENCE"); if (presenceFile && state.agent) { presenceFile.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode, handle: updated.handle, accent: state.agent.accent }, updated); presenceFile.revision += 1; presenceFile.updatedAt = now(); } } state.events.unshift(event("system", "Presence settings updated", state.presence?.status === "paused" ? "All external actions are paused." : "The new execution envelope is active.", state.presence?.status === "paused" ? "warning" : "positive", { presenceId: state.presence?.id })); return state; }
  }
  return state;
}

function makeCalendarSlot(instruction: string, presence: Presence | null, day = "Tuesday", time = "08:00", objective = "audience_growth", executionWindow = "08:00–11:00"): CalendarSlot { const clean = instruction.trim().replace(/[.!?]+$/, "") || "Teach the audience one useful thing"; const label = clean.length > 34 ? `${clean.slice(0, 34).trim()}…` : clean; const mode = presence?.execution.post ?? "review"; return { id: id("slot"), label, instruction: clean, day, time, objective, presence: presence?.id ?? "", mode, enabled: true, executionWindow }; }

export { normalizeState };
