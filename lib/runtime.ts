import type { ActivitySummary, AgentFile, AgentModelProfile, AgentToolBinding, Bridge, CalendarSlot, ChannelDefinition, ChangeSet, ChangeSetOperation, ChannelId, ConnectorCapabilities, CreateAgentInput, CreatePresenceInput, Execution, ExecutionEnvelope, FileKind, FileProposal, GhostProfile, LiveEvent, OpenPresenceState, Operation, Outcome, Presence, PresenceContext, Publication, PublicFooting, SocialIntent, StandingIntent } from "./types";
import { CHANNEL_CAPABILITIES, CHANNEL_EXTENSIONS } from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const channelName = (channel: ChannelId) => channel === "x" ? "X" : channel === "linkedin" ? "LinkedIn" : channel === "substack" ? "Substack" : channel;

function builtinChannelDefinitions(): ChannelDefinition[] {
  return (["x", "linkedin", "substack"] as const).map((channel) => ({
    id: channel,
    name: channelName(channel),
    description: `The ${channelName(channel)} social environment.`,
    entities: [{ id: "person", label: "Person" }, { id: "post", label: "Post" }, { id: "conversation", label: "Conversation" }],
    affordances: CHANNEL_CAPABILITIES[channel],
    formats: CHANNEL_EXTENSIONS[channel].formats,
    relationships: [{ from: "post", to: ["post"], relation: "replies-to" as const }],
    metrics: [{ id: "replies", label: "Replies" }, { id: "reactions", label: "Reactions" }],
    privacyDefaults: { visibility: "public" as const, shareability: "presence-only" as const },
    builtIn: true,
    createdAt: now(),
    updatedAt: now(),
  }));
}

function channelDefinition(state: OpenPresenceState, channel: ChannelId): ChannelDefinition | undefined { return state.channelDefinitions.find((item) => item.id === channel); }
function channelCapabilities(state: OpenPresenceState, channel: ChannelId) { return channelDefinition(state, channel)?.affordances ?? CHANNEL_CAPABILITIES[channel as keyof typeof CHANNEL_CAPABILITIES] ?? []; }

const fileMeta: Record<FileKind, Pick<AgentFile, "title" | "subtitle" | "protected">> = {
  BRAIN: { title: "How I think", subtitle: "Judgment before activity.", protected: true }, SOUL: { title: "Who I am", subtitle: "A character with a point of view.", protected: true }, MISSION: { title: "What I am here to do", subtitle: "A direction, not a dashboard target.", protected: true }, TASTE: { title: "What I consider good", subtitle: "The filter behind every public action.", protected: true }, MEMORY: { title: "What I should remember", subtitle: "Durable context and relationships.", protected: false }, GROWTH: { title: "What results have taught me", subtitle: "Evidence changes strategy, not identity.", protected: false }, PULSE: { title: "What keeps me active", subtitle: "Standing attention without hidden scheduler state.", protected: true }, PRESENCE: { title: "Where I exist", subtitle: "The person this channel encounters.", protected: true },
};

const fileContent = (kind: FileKind, input: CreateAgentInput, presence?: Presence) => {
  const shared = `# ${kind}.md\n\n_OpenPresence meaning file._\n`;
  const content: Record<FileKind, string> = {
    BRAIN: `${shared}\nI observe before acting. I prefer evidence over assumption, context over generic advice, and the smallest useful action over activity for its own sake.\n\nWhen something happens, I recall what matters, consider several options, include DO_NOTHING, then choose the action worth leaving behind.\n\nI store conclusions and evidence, never hidden chains of thought.`,
    SOUL: `${shared}\nI am ${input.name}: curious, precise, warm without being performative, and slightly allergic to hype.\n\nI want people to feel more capable after encountering me. I can be playful, but never at the expense of someone's dignity.`,
    MISSION: `${shared}\nMy work is to become useful to ${input.audience || "people building thoughtful things"}.\n\nI am here to earn durable attention by making ${input.description || "clear, useful observations"} easier to understand. Growth is a consequence of being worth returning to.`,
    TASTE: `${shared}\nI notice original thinking, honest uncertainty, specific examples, and ideas that make a person more capable.\n\nI do not post filler, manufacture controversy, or repeat a point merely because it performed once. Silence is better than a forgettable contribution.`,
    MEMORY: `${shared}\n## Durable context\n\nNo durable memories yet. I will keep only context that helps future judgment.`,
    GROWTH: `${shared}\n## Current strategy\n\nStill learning. Results may change tactics faster than they change identity.`,
    PULSE: `${shared}\n## Standing attention\n\nListen for relevant conversations, maintain important relationships, honor scheduled intent, and reflect on outcomes. Skip anything that is not worth saying.\n\n## Launch\n\nWhen a Presence has no public footing, understand where it is, inspect the current channel, and choose one strong first move that establishes why it is worth hearing from. Do not wait indefinitely for inbound attention that cannot exist yet. Once meaningful public footing exists, this program becomes dormant.`,
    PRESENCE: `${shared}\n## ${presence ? `${channelName(presence.channel)} · ${presence.handle}` : "Current Presence"}\n\nI speak as ${presence?.mode === "ghost" ? "the operator, extending their attention and judgment" : "myself"}. I adapt to this channel without flattening worthwhile ideas.\n\nTreat people as people, not engagement opportunities.`,
  };
  return content[kind];
};

export function initialState(): OpenPresenceState {
  return { onboarded: false, agent: null, presence: null, presences: [], activePresenceId: null, files: [], proposals: [], messages: [], conversations: [], activeConversationId: null, events: [], calendar: [], actions: [], metrics: { qualifiedFollows: 0, conversations: 0, opportunitiesIgnored: 0, audienceHealth: 98 }, modelProfiles: [], providerConnections: [], toolBindings: [], changeSets: [], standingIntents: [], socialIntents: [], executions: [], outcomes: [], publications: [], librarySources: [], assets: [], skills: [], agentSkills: [], contentDrops: [], channelDefinitions: builtinChannelDefinitions(), nativeConnections: [], bridges: [], mirrorObjects: [], mirrorEvents: [], bridgeSync: [], agents: [], activeAgentId: null, agentWorkspaces: [] };
}

function makeFiles(input: CreateAgentInput, presence: Presence): AgentFile[] { return (Object.keys(fileMeta) as FileKind[]).map((kind) => ({ kind, ...fileMeta[kind], content: fileContent(kind, input, presence), revision: 1, updatedAt: now() })); }
function event(type: LiveEvent["type"], title: string, detail: string, tone: LiveEvent["tone"] = "neutral", lineage?: Pick<LiveEvent, "presenceId" | "intentId" | "executionId" | "outcomeId">): LiveEvent { return { id: id("evt"), type, title, detail, time: now(), tone, ...lineage }; }

export function compilePresenceContext(presence: Presence): PresenceContext {
  const affordances = presence.capabilities ?? CHANNEL_CAPABILITIES[presence.channel as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  return { presenceId: presence.id, channel: presence.channel, publicIdentity: { displayName: presence.context?.publicIdentity?.displayName || presence.handle, handle: presence.handle, mode: presence.mode }, audienceContext: presence.context?.audienceContext, voiceAdaptation: presence.context?.voiceAdaptation, availableAffordances: affordances.map((item) => item.id), relevantRelationshipContext: presence.context?.relevantRelationshipContext, publicFooting: presence.context?.publicFooting, ghostProfile: presence.mode === "ghost" ? presence.ghostProfile : undefined };
}

export function recordPublicFooting(source: OpenPresenceState, presenceId: string, footing: PublicFooting) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const update = (presence: Presence) => ({ ...presence, context: { ...presence.context, publicFooting: footing } });
  state.presences = state.presences.map((presence) => presence.id === presenceId ? update(presence) : presence);
  if (state.presence?.id === presenceId) state.presence = update(state.presence);
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

export function recordRuntimeEvent(source: OpenPresenceState, presenceId: string, title: string, detail: string, tone: LiveEvent["tone"] = "neutral") {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  state.events.unshift(event("system", title, detail, tone, { presenceId }));
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
  const events = state.events.filter((item) => !presence || item.presenceId === presence.id);
  const executions = state.executions
    .filter((item) => !presence || item.presenceId === presence.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestExecution = executions[0];
  const reviewCount = executions.filter((item) => item.status === "awaiting-review").length;
  const pulseEvent = events.find((item) => item.title === "Pulse completed");
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === presence?.id);
  const observation = nativeConnection?.observation;
  const standingSlots = state.calendar
    .filter((slot) => slot.presence === presence?.id && slot.enabled)
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  const nextSlot = standingSlots[0];

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
  } else if (latestExecution && ["queued", "claimed", "executing", "approved"].includes(latestExecution.status)) {
    current = { label: "Preparing to act", detail: `A ${latestExecution.affordance} intent is moving through the execution envelope.`, tone: "positive" };
  } else if (latestExecution?.status === "succeeded") {
    current = { label: "Action completed", detail: `The latest ${latestExecution.affordance} was delivered and remains visible in the execution ledger.`, tone: "positive" };
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
    current = { label: `Ready to observe ${nativeConnection.account?.username ? `@${nativeConnection.account.username}` : channelName(presence.channel)}`, detail: "The native channel is connected. Observation begins when you check now or a standing intent is invoked.", tone: "positive" };
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
    attention: presence?.status === "paused" ? "Asleep" : nativeConnection ? "Continuous observation" : "On demand",
    publishing: activityModeLabel(presence?.execution.post),
    replies: activityModeLabel(presence?.execution.reply ?? presence?.execution.comment),
    quietHours: "Not configured",
  };
  return { current, lastPulseAt: pulseEvent?.time, nextAttention, nextIntent, needsAttention: { count: reviewCount, label: reviewCount ? "Needs review" : "No review items", detail: reviewCount ? `${reviewCount} action${reviewCount === 1 ? "" : "s"} waiting for approval.` : "Nothing is waiting for your decision." }, rhythm };
}

const defaultGhostProfile = (): GhostProfile => ({ subject: "Me / my organization", priorities: "", preferences: "", voice: "", boundaries: "" });

function makeEnvelope(presenceId: string, capabilities: { id: string }[], execution: Record<string, import("./types").ExecutionMode>): ExecutionEnvelope { return { presenceId, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? "off" }])), pacingProfile: "recommended", accountProtection: "guidance" }; }
function makePresence(input: CreatePresenceInput, displayName = input.handle, definition?: ChannelDefinition): Presence {
  const presenceId = id("presence");
  const capabilities = definition?.affordances ?? CHANNEL_CAPABILITIES[input.channel as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const execution = Object.fromEntries(capabilities.map((capability) => [capability.id, capability.id === "post" ? "auto" : capability.id === "reply" || capability.id === "comment" ? "review" : "off"])) as Presence["execution"];
  const context: PresenceContext = { presenceId, channel: input.channel, publicIdentity: { displayName, handle: input.handle.trim(), mode: input.mode }, audienceContext: "People who may find this Presence useful.", voiceAdaptation: `Adapt the Agent's point of view to ${channelName(input.channel)} without flattening it.`, availableAffordances: capabilities.map((item) => item.id) };
  const presence = { id: presenceId, channel: input.channel, handle: input.handle.trim(), mode: input.mode, status: "live" as const, accent: input.accent, capabilities, execution, executionEnvelope: makeEnvelope(presenceId, capabilities, execution), context, ghostProfile: input.mode === "ghost" ? defaultGhostProfile() : undefined, pacing: "recommended" as const, accountHealth: "healthy" as const };
  presence.context = compilePresenceContext(presence);
  return presence;
}

function makeConversation(): import("./types").Conversation { const timestamp = now(); return { id: id("conversation"), title: "New conversation", createdAt: timestamp, updatedAt: timestamp, messages: [] }; }
function defaultModel(agentId: string): AgentModelProfile { return { id: id("model"), agentId, provider: "anthropic", model: "claude", quality: "high", capabilities: { vision: true, toolCalling: true, structuredOutput: true, streaming: true }, updatedAt: now() }; }
function defaultBindings(agentId: string): AgentToolBinding[] { return ["web.search", "asset.inspect", "chart.render", "channel.execute"].map((toolId) => ({ id: id("binding"), agentId, toolId })); }

export function createAgent(input: CreateAgentInput): OpenPresenceState {
  const agent = { id: id("agent"), name: input.name.trim(), description: input.description.trim(), audience: input.audience?.trim() || "builders and curious operators", topics: ["AI agents", "software", "useful ideas"], accent: input.accent, glyph: "◉" };
  const definitions = builtinChannelDefinitions();
  const presence = makePresence({ channel: "x", handle: input.handle.trim() || `@${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`, mode: input.mode, accent: input.accent }, agent.name, definitions[0]);
  const conversation = makeConversation();
  const skills = [{ id: "research-to-thread", name: "Research to thread", description: "Turn a source into a clear social thread.", channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: ["web.search", "asset.inspect"], compatibleFormats: ["x.thread", "linkedin.post"] }, { id: "data-story", name: "Data story", description: "Turn evidence into a useful visual story.", channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: ["asset.inspect", "chart.render"], compatibleFormats: ["x.media-post", "linkedin.image-post"] }];
  return { ...initialState(), onboarded: true, agent, agents: [agent], activeAgentId: agent.id, presence, presences: [presence], activePresenceId: presence.id, files: makeFiles(input, presence), modelProfiles: [defaultModel(agent.id)], providerConnections: [{ id: id("connection"), provider: "anthropic", label: "Anthropic", status: "needs-configuration", createdAt: now() }], toolBindings: defaultBindings(agent.id), conversations: [conversation], activeConversationId: conversation.id, channelDefinitions: definitions, skills, agentSkills: skills.map((skill) => ({ id: id("agent-skill"), agentId: agent.id, skillId: skill.id, enabled: true })), events: [event("system", `${agent.name} is live`, `Your ${input.mode === "ghost" ? "Ghost " : "agent-owned "}Presence is ready on X.`, "positive")] };
}

function normalizeState(raw: OpenPresenceState): OpenPresenceState {
  const state = raw as OpenPresenceState & { presences?: Presence[]; conversations?: import("./types").Conversation[]; activeConversationId?: string | null; activePresenceId?: string | null };
  const agents = state.agents?.length ? state.agents : state.agent ? [state.agent] : [];
  const activeAgentId = state.activeAgentId ?? state.agent?.id ?? agents[0]?.id ?? null;
  const fallbackPresence = state.presence ? hydratePresence(state.presence) : null;
  const presences = state.presences?.length ? state.presences.map(hydratePresence) : fallbackPresence ? [fallbackPresence] : [];
  const activePresenceId = state.activePresenceId ?? presences[0]?.id ?? null;
  const presence = presences.find((item) => item.id === activePresenceId) ?? presences[0] ?? null;
  const legacyMessages = state.messages ?? [];
  const conversations = state.conversations?.length ? state.conversations : [{ id: id("conversation"), title: legacyMessages.length ? "Earlier conversation" : "New conversation", createdAt: now(), updatedAt: now(), messages: legacyMessages }];
  const activeConversationId = state.activeConversationId ?? conversations[0]?.id ?? null;
  const calendar = (state.calendar ?? []).map((slot) => ({ ...slot, instruction: slot.instruction || slot.label || "Evaluate a useful idea for the audience", executionWindow: slot.executionWindow || "08:00–11:00" }));
  const base = initialState();
  const skills = (state.skills ?? []).map((skill) => ({ ...skill, name: skill.name ?? skill.id.replaceAll("-", " ") }));
  return { ...base, ...state, agents, activeAgentId, agentWorkspaces: state.agentWorkspaces ?? [], presence, presences, activePresenceId, conversations, activeConversationId, calendar, messages: conversations.find((item) => item.id === activeConversationId)?.messages ?? legacyMessages, modelProfiles: state.modelProfiles ?? [], providerConnections: state.providerConnections ?? [], toolBindings: state.toolBindings ?? [], changeSets: state.changeSets ?? [], standingIntents: state.standingIntents ?? [], socialIntents: state.socialIntents ?? [], executions: state.executions ?? [], outcomes: state.outcomes ?? [], publications: state.publications ?? [], librarySources: state.librarySources ?? [], assets: state.assets ?? [], skills, agentSkills: state.agentSkills ?? [], contentDrops: state.contentDrops ?? [], channelDefinitions: state.channelDefinitions?.length ? state.channelDefinitions : base.channelDefinitions, nativeConnections: state.nativeConnections ?? [], bridges: state.bridges ?? [], mirrorObjects: state.mirrorObjects ?? [], mirrorEvents: state.mirrorEvents ?? [], bridgeSync: state.bridgeSync ?? [] };
}

function hydratePresence(raw: Presence): Presence {
  const capabilities = raw.capabilities ?? CHANNEL_CAPABILITIES[(raw.channel ?? "x") as keyof typeof CHANNEL_CAPABILITIES] ?? [];
  const execution = raw.execution ?? Object.fromEntries(capabilities.map((item) => [item.id, "off"]));
  const idValue = raw.id || id("presence");
  const context = raw.context ?? { presenceId: idValue, channel: raw.channel ?? "x", publicIdentity: { displayName: raw.handle, handle: raw.handle, mode: raw.mode ?? "agent" }, availableAffordances: capabilities.map((item) => item.id) };
  const executionEnvelope = raw.executionEnvelope ?? makeEnvelope(idValue, capabilities, execution);
  const ghostProfile = raw.ghostProfile ?? (raw.mode === "ghost" ? defaultGhostProfile() : undefined);
  return { ...raw, id: idValue, channel: raw.channel ?? "x", capabilities, execution, ghostProfile, executionEnvelope: { ...executionEnvelope, presenceId: idValue, affordances: Object.fromEntries(capabilities.map((item) => [item.id, { mode: execution[item.id] ?? executionEnvelope.affordances?.[item.id]?.mode ?? "off" }])) }, context: compilePresenceContext({ ...raw, id: idValue, capabilities, execution, ghostProfile, executionEnvelope, context } as Presence), pacing: raw.pacing ?? "recommended", accountHealth: raw.accountHealth ?? "healthy" };
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
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance, publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt, standingIntentId: standing.id };
  state.socialIntents.unshift(socialIntent);
  const mode = slot.mode;
  if (mode !== "off") {
    const bridge = bridgeFor(state, presence.id, "post");
    const nativeX = presence.channel === "x" ? state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write") : undefined;
    const simulated = !bridge && !nativeX && presence.channel === "x" && process.env.OPENPRESENCE_TEST_MODE === "1";
    const connector = nativeX ? "native" as const : bridge ? bridge.kind : simulated ? "simulated" as const : undefined;
    const status = simulated ? (mode === "auto" ? "succeeded" : mode === "review" ? "awaiting-review" : "awaiting-manual") : mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
    const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance, mode: mode as Exclude<import("./types").ExecutionMode, "off">, status, attempts: simulated && mode === "auto" ? 1 : 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, createdAt: formedAt, updatedAt: formedAt, executedAt: simulated && mode === "auto" ? formedAt : undefined };
    state.executions.unshift(execution);
    if (simulated && mode === "auto") {
      const outcome: Outcome = { id: id("outcome"), socialIntentId: socialIntent.id, executionId: execution.id, presenceId: presence.id, status: "succeeded", observedAt: formedAt, metrics: { qualifiedFollows: 3 }, evidence: [] };
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

export function formChatPostIntent(source: OpenPresenceState, text: string) {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  const presence = state.presence;
  if (!state.agent || !presence || presence.status !== "live" || presence.channel !== "x" || !text.trim()) return state;
  const formedAt = now();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const publication = makePublication(state, text.trim(), "x.post");
  const socialIntent: SocialIntent = { id: id("intent"), agentId: state.agent.id, presenceId: presence.id, affordance: "x.post", publicationId: publication.id, priority: 50, validity: { expiresAt }, state: "active", formedAt, updatedAt: formedAt };
  state.socialIntents.unshift(socialIntent);
  const mode = presence.execution.post ?? "off";
  if (mode === "off") {
    state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: "skipped", reason: "Posts are off in the Presence execution envelope.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id });
    state.events.unshift(event("decision", "Post intention held", "Jenny formed a social intention, but Posts are off for this Presence.", "quiet", { presenceId: presence.id, intentId: socialIntent.id }));
    return state;
  }
  const bridge = bridgeFor(state, presence.id, "post");
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write");
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const status = mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.post", mode, status, attempts: 0, bridgeId: bridge?.id, connector, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, createdAt: formedAt, updatedAt: formedAt };
  state.executions.unshift(execution);
  state.actions.unshift({ id: id("act"), intent: "post", summary: text.trim(), status: mode === "review" ? "review" : "queued", reason: "The operator asked Jenny to introduce this Presence through the native X connector.", createdAt: formedAt, expiresAt, socialIntentId: socialIntent.id, executionId: execution.id });
  state.events.unshift(event("decision", "A post intention was formed", connector ? "Jenny formed an X post from the conversation and handed it to the Presence execution envelope." : "Jenny formed an X post, but no write-enabled X connector is available.", connector ? "positive" : "warning", { presenceId: presence.id, intentId: socialIntent.id, executionId: execution.id }));
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
  const nativeX = state.nativeConnections.find((connection) => connection.presenceId === presence.id && connection.status === "connected" && connection.access === "read-write");
  const bridge = bridgeFor(state, presence.id, "reply");
  const connector = nativeX ? "native" as const : bridge ? bridge.kind : undefined;
  const status = mode === "auto" ? (connector ? "queued" : "awaiting-connector") : mode === "review" ? "awaiting-review" : "awaiting-manual";
  const execution: Execution = { id: id("execution"), socialIntentId: socialIntent.id, presenceId: presence.id, affordance: "x.reply", mode, status, attempts: 0, bridgeId: bridge?.id, connector, target: { type: "x.post", id: parentId }, idempotencyKey: `${presence.id}:${socialIntent.id}`, publication, createdAt: formedAt, updatedAt: formedAt };
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

export function applyOperation(source: OpenPresenceState, operation: Operation): OpenPresenceState {
  const state = normalizeState(JSON.parse(JSON.stringify(source)) as OpenPresenceState);
  switch (operation.type) {
    case "reset": return initialState();
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
    case "createPresence": { if (!state.agent) return state; const definition = state.channelDefinitions.find((item) => item.id === operation.input.channel) ?? operation.input.channelDefinition; if (operation.input.channelDefinition && !state.channelDefinitions.some((item) => item.id === operation.input.channelDefinition!.id)) state.channelDefinitions.push(operation.input.channelDefinition); const created = makePresence(operation.input, state.agent.name, definition); state.presences.push(created); state.presence = created; state.activePresenceId = created.id; state.events.unshift(event("system", `${channelName(created.channel)} Presence added`, `${created.handle} is ready as ${created.mode === "ghost" ? "a Ghost Presence" : "an agent-owned Presence"}.`, "positive", { presenceId: created.id })); return state; }
    case "createChannel": { if (!state.channelDefinitions.some((item) => item.id === operation.definition.id)) { state.channelDefinitions.push(operation.definition); state.events.unshift(event("system", `${operation.definition.name} defined`, "The social environment is ready for a Presence.", "positive")); } return state; }
    case "createBridge": { const presence = state.presences.find((item) => item.id === operation.input.presenceId); if (!presence) return state; const existing = state.bridges.find((bridge) => bridge.presenceId === presence.id && bridge.state !== "offline" && operation.input.capabilities.affordances.some((affordance) => bridge.capabilities.affordances.includes(affordance))); if (existing) return state; const timestamp = now(); const bridge: Bridge = { id: id("bridge"), presenceId: presence.id, channelId: presence.channel, name: operation.input.name.trim() || "External Bridge", kind: operation.input.kind, state: operation.input.kind === "manual" ? "online" : "offline", capabilities: normalizedCapabilities(operation.input.capabilities), createdAt: timestamp, updatedAt: timestamp }; state.bridges.unshift(bridge); state.bridgeSync.unshift({ bridgeId: bridge.id, status: bridge.state === "online" ? "healthy" : "offline" }); state.events.unshift(event("system", `${bridge.name} added`, bridge.kind === "manual" ? "Manual relay is ready." : "Connect the executor to begin syncing.", "positive")); return state; }
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
      if (lower.includes("em dash") || lower.includes("em-dash")) { const current = state.files.find((file) => file.kind === "TASTE")?.content ?? ""; state.proposals.push(proposal(state, "TASTE", `${current}\n\n## Style note\n\nPrefer commas, periods, or a clean line break over em dashes.`, "You asked for a durable writing preference. Protected identity files change through proposals.", conversation.id)); reply = "I turned that into a Taste proposal so it can become a durable preference without silently rewriting who I am."; change = "Taste proposal created"; }
      else if (lower.includes("tuesday") || lower.includes("schedule") || lower.includes("every ")) { const instruction = content.replace(/^schedule\s+/i, "").replace(/[.!?]+$/, "").trim() || "Teach the audience one useful thing."; const slot = makeCalendarSlot(instruction, state.presence); const standing = makeStandingIntent(state, instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); slot.standingIntentId = standing.id; state.standingIntents.push(standing); state.calendar.push(slot); recordChangeSet(state, "Create standing intent", [{ path: "standingIntents", action: "create", after: standing.instruction }], conversation.id); reply = `I created a standing intention: ${slot.label}. I’ll evaluate it in the moment and let it expire without publishing if there is nothing worthwhile.`; change = "Standing intention created"; }
      else if (lower.includes("ghost")) { const presence = state.presence ? { ...state.presence, mode: "ghost" as const } : null; if (presence) { presence.context = compilePresenceContext(presence); state.presence = presence; state.presences = state.presences.map((item) => item.id === presence.id ? presence : item); } const file = state.files.find((item) => item.kind === "PRESENCE"); if (file && presence) file.content = fileContent("PRESENCE", { name: state.agent.name, description: state.agent.description, audience: state.agent.audience, mode: "ghost", handle: presence.handle, accent: state.agent.accent }); recordChangeSet(state, "Change Presence mode", [{ path: `presences.${state.presence?.id}.mode`, action: "update", after: "ghost" }], conversation.id); reply = "I updated this Presence to Ghost mode. I’ll extend the operator’s attention and judgment rather than pretending to be a different public speaker."; change = "Presence changed to Ghost"; }
      conversation.messages.push({ id: id("msg"), role: "agent", content: reply, timestamp: now(), change }); conversation.updatedAt = now(); state.events.unshift(event("decision", "A conversation with the operator", change ?? "Working context updated.", change ? "positive" : "neutral")); syncMessages(state); return state;
    }
    case "saveFile": { const file = state.files.find((item) => item.kind === operation.kind); if (!file || file.content === operation.content) return state; if (file.protected) { state.proposals.push(proposal(state, operation.kind, operation.content, "Protected meaning files are reviewed before they change.")); state.events.unshift(event("system", `${operation.kind}.md needs your review`, "A protected meaning change is waiting in Brain.", "warning")); } else { const before = file.content; file.content = operation.content; file.revision += 1; file.updatedAt = now(); recordChangeSet(state, `Update ${operation.kind}.md`, [{ path: `agentFiles.${operation.kind}`, action: "update", before, after: operation.content }]); state.events.unshift(event("learning", `${operation.kind}.md updated`, "The change was saved to the local agent state.", "positive")); } return state; }
    case "resolveProposal": { const item = state.proposals.find((entry) => entry.id === operation.id); if (!item || item.status !== "pending") return state; item.status = operation.decision === "approve" ? "approved" : "rejected"; if (operation.decision === "approve") { const file = state.files.find((entry) => entry.kind === item.file); if (file) { file.content = item.proposed; file.revision += 1; file.updatedAt = now(); } state.events.unshift(event("system", `${item.file}.md approved`, "The protected meaning file was updated and versioned.", "positive")); } else state.events.unshift(event("system", `${item.file}.md proposal rejected`, "The current meaning stays unchanged.", "quiet")); return state; }
    case "addSlot": { const targetPresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; const slot = makeCalendarSlot(operation.instruction, targetPresence, operation.day, operation.time, operation.objective, operation.executionWindow); const standing = makeStandingIntent(state, slot.instruction, targetPresence, slot.day, slot.time, slot.objective, slot.executionWindow); slot.standingIntentId = standing.id; state.standingIntents.push(standing); state.calendar.push(slot); recordChangeSet(state, "Create standing intent", [{ path: "standingIntents", action: "create", after: standing.instruction }]); state.events.unshift(event("system", "Standing intention added", `${slot.label} · ${slot.day} at ${slot.time}.`, "positive")); return state; }
    case "editSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const targetPresence = state.presences.find((item) => item.id === slot.presence) ?? state.presence; const previous = { ...slot }; slot.instruction = operation.instruction.trim() || slot.instruction; slot.label = slot.instruction.length > 34 ? `${slot.instruction.slice(0, 34).trim()}…` : slot.instruction; slot.day = operation.day; slot.time = operation.time; slot.objective = operation.objective; slot.executionWindow = operation.executionWindow; slot.mode = targetPresence?.execution.post ?? slot.mode; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId); if (standing) { standing.instruction = slot.instruction; standing.presenceId = targetPresence?.id; standing.trigger = { type: "schedule", config: { day: slot.day, time: slot.time } }; standing.objective = slot.objective; standing.executionWindow = { startsAt: slot.executionWindow, endsAt: slot.executionWindow }; standing.updatedAt = now(); } recordChangeSet(state, "Edit standing intent", [{ path: `calendar.${slot.id}`, action: "update", before: previous.instruction, after: slot.instruction }]); state.events.unshift(event("system", "Standing intention updated", `${slot.label} · ${slot.day} at ${slot.time}.`, "positive")); return state; }
    case "createSkill": { if (!state.agent || !operation.name.trim() || !operation.description.trim()) return state; const skillId = `${operation.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill"}-${Date.now().toString(36)}`; const skill = { id: skillId, name: operation.name.trim(), description: operation.description.trim(), channels: ["x", "linkedin"] as import("./types").ChannelId[], requiresTools: [], compatibleFormats: [] }; state.skills.push(skill); state.agentSkills.push({ id: id("agent-skill"), agentId: state.agent.id, skillId: skill.id, enabled: true }); state.events.unshift(event("learning", "Skill created", `${skill.name} is installed and enabled for ${state.agent.name}.`, "positive")); return state; }
    case "editSkill": { const skill = state.skills.find((item) => item.id === operation.id); if (!skill || !operation.name.trim() || !operation.description.trim()) return state; const previous = { name: skill.name, description: skill.description }; skill.name = operation.name.trim(); skill.description = operation.description.trim(); state.events.unshift(event("learning", "Skill updated", `${skill.name} instruction prompt updated.`, "positive")); recordChangeSet(state, "Edit skill", [{ path: `skills.${skill.id}`, action: "update", before: previous.description, after: skill.description }]); return state; }
    case "configureProvider": { if (!state.agent || !operation.label.trim()) return state; const existing = state.providerConnections.find((item) => item.provider === operation.provider); const status = operation.provider === "ollama" ? "local" as const : "available" as const; if (existing) { existing.label = operation.label.trim(); existing.status = status; existing.endpoint = operation.endpoint?.trim() || existing.endpoint; existing.secretConfigured = operation.hasSecret || existing.secretConfigured; } else state.providerConnections.push({ id: id("connection"), provider: operation.provider, label: operation.label.trim(), status, endpoint: operation.endpoint?.trim() || undefined, secretConfigured: operation.hasSecret, createdAt: now() }); state.events.unshift(event("system", `${operation.label.trim()} connected`, operation.provider === "ollama" ? "Local models are ready to use." : "Provider access is configured for this Agent.", "positive")); return state; }
    case "runSlot": { const slot = state.calendar.find((item) => item.id === operation.id); if (!slot) return state; const standing = state.standingIntents.find((item) => item.id === slot.standingIntentId) ?? makeStandingIntent(state, slot.instruction, state.presence, slot.day, slot.time, slot.objective, slot.executionWindow); addSocialEvaluation(state, standing, slot); return state; }
    case "approveExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (execution?.status === "awaiting-review") { execution.status = execution.bridgeId ? "approved" : "approved"; execution.updatedAt = now(); state.events.unshift(event("execution", "Approved for execution", "The operator approved this social action; it remains separate from Jenny's judgment.", "positive", { executionId: execution.id })); } return state; }
    case "executeIntent": { const intent = state.socialIntents.find((item) => item.id === operation.id); if (!intent) return state; const execution = state.executions.find((item) => item.socialIntentId === intent.id); if (!execution || intent.state !== "active") return state; if (["awaiting-review", "awaiting-manual", "awaiting-connector", "claimed", "executing", "succeeded"].includes(execution.status)) { if (execution.status === "approved" && execution.bridgeId) execution.status = "queued"; else return state; } if (intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) { intent.state = "expired"; execution.status = "expired"; execution.updatedAt = now(); state.events.unshift(event("decision", "Intent expired", "The social moment passed before execution.", "quiet", { intentId: intent.id, executionId: execution.id })); return state; } if (execution.bridgeId) { execution.status = "queued"; execution.updatedAt = now(); state.events.unshift(event("execution", "Queued for Bridge", "The execution is ready for an external executor.", "positive", { intentId: intent.id, executionId: execution.id })); return state; } execution.status = "succeeded"; execution.attempts += 1; execution.updatedAt = now(); execution.executedAt = now(); const outcome = { id: id("outcome"), socialIntentId: intent.id, executionId: execution.id, presenceId: intent.presenceId, status: "succeeded" as const, observedAt: now(), metrics: {} }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Execution completed", "The simulated channel accepted the action.", "positive", { intentId: intent.id, executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "markManualExecution": { const execution = state.executions.find((item) => item.id === operation.id); if (!execution || execution.status !== "awaiting-manual") return state; execution.status = "succeeded"; execution.externalRef = operation.externalRef; execution.attempts += 1; execution.executedAt = now(); execution.updatedAt = now(); const outcome: Outcome = { id: id("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: now(), metrics: {}, evidence: [operation.externalRef] }; state.outcomes.unshift(outcome); state.events.unshift(event("execution", "Manual relay completed", "The operator marked the external action as posted.", "positive", { executionId: execution.id, outcomeId: outcome.id })); return state; }
    case "setModel": { const profile = state.modelProfiles.find((item) => item.agentId === state.agent?.id); if (profile && operation.model.trim()) { profile.model = operation.model.trim(); if (operation.provider) profile.provider = operation.provider; if (operation.quality) profile.quality = operation.quality; const connection = state.providerConnections.find((item) => item.provider === profile.provider && item.status !== "needs-configuration"); if (connection) profile.connectionId = connection.id; profile.updatedAt = now(); } return state; }
    case "wakePresence": { const target = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!target || target.status !== "paused") return state; const updated = { ...target, status: "live" as const }; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); if (state.presence?.id === updated.id) state.presence = updated; state.events.unshift(event("system", "Jenny woke up", "The Presence is active again and beginning its first attention cycle.", "positive", { presenceId: updated.id })); return state.nativeConnections.some((connection) => connection.presenceId === updated.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, updated); }
    case "runPulse": { const pulsePresence = state.presences.find((item) => item.id === operation.presenceId) ?? state.presence; if (!pulsePresence || pulsePresence.status !== "live") return state; return state.nativeConnections.some((connection) => connection.presenceId === pulsePresence.id && connection.channelId === "x" && connection.status === "connected") ? state : runAttentionCycle(state, pulsePresence); }
    case "syncNativeX": return state;
    case "setPresence": { if (state.presence) { const updated = { ...state.presence, ...operation.patch, ghostProfile: operation.patch.ghostProfile ?? state.presence.ghostProfile ?? (operation.patch.mode === "ghost" ? defaultGhostProfile() : undefined), execution: operation.patch.execution ? { ...state.presence.execution, ...operation.patch.execution } : state.presence.execution }; updated.executionEnvelope = { ...state.presence.executionEnvelope, affordances: Object.fromEntries(channelCapabilities(state, updated.channel).map((item) => [item.id, { mode: updated.execution[item.id] ?? "off" }])) }; updated.context = compilePresenceContext(updated); state.presence = updated; state.presences = state.presences.map((item) => item.id === updated.id ? updated : item); } state.events.unshift(event("system", "Presence settings updated", state.presence?.status === "paused" ? "All external actions are paused." : "The new execution envelope is active.", state.presence?.status === "paused" ? "warning" : "positive", { presenceId: state.presence?.id })); return state; }
  }
}

function makeCalendarSlot(instruction: string, presence: Presence | null, day = "Tuesday", time = "08:00", objective = "audience_growth", executionWindow = "08:00–11:00"): CalendarSlot { const clean = instruction.trim().replace(/[.!?]+$/, "") || "Teach the audience one useful thing"; const label = clean.length > 34 ? `${clean.slice(0, 34).trim()}…` : clean; const mode = presence?.execution.post ?? "review"; return { id: id("slot"), label, instruction: clean, day, time, objective, presence: presence?.id ?? "", mode, enabled: true, executionWindow }; }

export { normalizeState };
