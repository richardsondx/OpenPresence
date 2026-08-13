export type View = "chat" | "live" | "calendar" | "brain" | "presence";
export type BuiltInChannelId = "x" | "linkedin" | "substack";
export type ChannelId = string;
export type ConnectorKind = "simulated" | "native" | "bridge" | "manual";
export type PresenceMode = "agent" | "ghost";
export type ExecutionMode = "off" | "manual" | "review" | "auto";
export type ExecutionStatus = "awaiting-review" | "approved" | "awaiting-manual" | "awaiting-connector" | "queued" | "claimed" | "executing" | "succeeded" | "failed" | "cancelled" | "expired";
export type FileKind = "BRAIN" | "SOUL" | "MISSION" | "TASTE" | "MEMORY" | "GROWTH" | "PULSE" | "PRESENCE";
export type EventTone = "neutral" | "positive" | "quiet" | "warning";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Shareability = "presence-only" | "agent-wide" | "public";
export type VisibilityScope = "public" | "private-community" | "private-thread" | "direct-message" | "unknown";

export interface ChannelEntityDefinition { id: string; label: string; }
export interface ChannelRelationshipDefinition { from: string; to: string[]; relation: "contains" | "replies-to" | "mentions" | "direct"; }
export interface ChannelMetricDefinition { id: string; label: string; }
export interface ChannelPrivacyDefaults { visibility: VisibilityScope; shareability: Shareability; }
export interface ChannelDefinition {
  id: ChannelId;
  name: string;
  description?: string;
  icon?: string;
  entities: ChannelEntityDefinition[];
  affordances: ChannelCapability[];
  formats: FormatDefinition[];
  relationships: ChannelRelationshipDefinition[];
  metrics: ChannelMetricDefinition[];
  playbook?: string;
  privacyDefaults: ChannelPrivacyDefaults;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorCapabilities { inbound: boolean; reconcile: boolean; affordances: string[]; formats: string[]; metrics: string[]; }
export interface Bridge {
  id: string;
  presenceId: string;
  channelId: ChannelId;
  name: string;
  kind: ConnectorKind;
  state: "online" | "offline" | "degraded";
  capabilities: ConnectorCapabilities;
  credentialId?: string;
  keyPrefix?: string;
  credentialRevokedAt?: string;
  lastSeenAt?: string;
  lastSyncAt?: string;
  coverage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MirrorObject {
  id: string;
  bridgeId: string;
  presenceId: string;
  channelId: ChannelId;
  externalRef: EntityRef;
  parentExternalRef?: EntityRef;
  objectType: string;
  author?: { externalRef?: EntityRef; displayName: string; handle?: string };
  content?: { text?: string; payload?: JsonValue };
  occurredAt?: string;
  observedAt: string;
  visibility: VisibilityScope;
  shareability: Shareability;
  originExecutionId?: string;
  actorPresenceId?: string;
  sourceEventId?: string;
  archived?: boolean;
}

export interface MirrorEvent {
  id: string;
  bridgeId: string;
  presenceId: string;
  sourceEventId: string;
  event: "created" | "updated" | "deleted";
  externalRef: EntityRef;
  object?: MirrorObject;
  receivedAt: string;
}

export interface BridgeSyncState { bridgeId: string; cursor?: string; lastSyncAt?: string; status: "idle" | "syncing" | "healthy" | "degraded" | "offline"; error?: string; }

export interface NativeChannelConnection {
  id: string;
  presenceId: string;
  channelId: ChannelId;
  kind: "x";
  status: "connected" | "needs-attention";
  access: "read" | "read-write";
  account?: { id: string; username: string; name: string };
  updatedAt: string;
  createdAt: string;
}

export interface GhostProfile {
  subject: string;
  priorities: string;
  preferences: string;
  voice: string;
  boundaries: string;
}

export interface PublicFooting {
  postsPublished: number;
  recentPostIds: string[];
  recentInboundIds?: string[];
  observedAt: string;
}

export interface ChannelCapability { id: string; label: string; description: string; }

export const CHANNEL_CAPABILITIES: Record<ChannelId, ChannelCapability[]> = {
  x: [
    { id: "post", label: "Posts", description: "Create a new point of view." },
    { id: "reply", label: "Replies", description: "Join a conversation." },
    { id: "repost", label: "Reposts", description: "Pass along something worth seeing." },
    { id: "quote", label: "Quotes", description: "Add context to another post." },
    { id: "like", label: "Likes", description: "A quiet signal of attention." },
    { id: "message", label: "Messages", description: "Start or continue a private conversation." },
  ],
  linkedin: [
    { id: "post", label: "Posts", description: "Publish a professional point of view." },
    { id: "comment", label: "Comments", description: "Join a professional conversation." },
    { id: "reaction", label: "Reactions", description: "Signal attention to a post." },
    { id: "repost", label: "Reposts", description: "Share something useful with context." },
    { id: "message", label: "Messages", description: "Continue a professional conversation." },
    { id: "connect", label: "Connections", description: "Request a relevant connection." },
  ],
  substack: [
    { id: "post", label: "Posts", description: "Publish a longer point of view." },
    { id: "note", label: "Notes", description: "Share a short observation." },
    { id: "comment", label: "Comments", description: "Join a reader conversation." },
    { id: "restack", label: "Restacks", description: "Pass along something worth reading." },
    { id: "message", label: "Replies", description: "Continue a reader conversation." },
  ],
};

export interface AffordanceDefinition extends ChannelCapability { channel: ChannelId; }
export interface FormatDefinition { id: string; label: string; description: string; channel: ChannelId; }
export interface ChannelExtension { id: ChannelId; affordances: AffordanceDefinition[]; formats: FormatDefinition[]; }

export const CHANNEL_EXTENSIONS: Record<ChannelId, ChannelExtension> = {
  x: { id: "x", affordances: CHANNEL_CAPABILITIES.x.map((item) => ({ ...item, channel: "x" })), formats: [
    { id: "x.post", label: "Post", description: "A single text publication.", channel: "x" },
    { id: "x.media-post", label: "Media post", description: "A post with one or more assets.", channel: "x" },
    { id: "x.thread", label: "Thread", description: "A connected sequence of posts.", channel: "x" },
  ] },
  linkedin: { id: "linkedin", affordances: CHANNEL_CAPABILITIES.linkedin.map((item) => ({ ...item, channel: "linkedin" })), formats: [
    { id: "linkedin.post", label: "Post", description: "A professional point of view.", channel: "linkedin" },
    { id: "linkedin.image-post", label: "Image post", description: "A post with an explanatory image.", channel: "linkedin" },
  ] },
  substack: { id: "substack", affordances: CHANNEL_CAPABILITIES.substack.map((item) => ({ ...item, channel: "substack" })), formats: [
    { id: "substack.note", label: "Note", description: "A short reader-facing observation.", channel: "substack" },
    { id: "substack.post", label: "Post", description: "A longer publication.", channel: "substack" },
  ] },
};

export interface AgentFile { kind: FileKind; title: string; subtitle: string; content: string; protected: boolean; revision: number; updatedAt: string; }
export interface FileProposal { id: string; file: FileKind; title: string; reason: string; current: string; proposed: string; status: "pending" | "approved" | "rejected"; createdAt: string; changeSetId?: string; }
export interface Agent { id: string; name: string; description: string; audience: string; topics: string[]; accent: string; glyph: string; }

export interface ModelRuntimeCapabilities { vision: boolean; toolCalling: boolean; structuredOutput: boolean; streaming: boolean; }
export type ModelProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "custom";
export type ModelQuality = "low" | "medium" | "high" | "local";
export interface AgentModelProfile { id: string; agentId: string; provider: ModelProvider; model: string; quality?: ModelQuality; connectionId?: string; capabilities: ModelRuntimeCapabilities; updatedAt: string; }
export interface ProviderConnection { id: string; provider: ModelProvider; label: string; status: "available" | "needs-configuration" | "local"; endpoint?: string; secretConfigured?: boolean; createdAt: string; }
export interface AgentToolBinding { id: string; agentId: string; toolId: string; provider?: string; model?: string; connectionId?: string; config?: Record<string, JsonValue>; }
export interface AgentToolDefinition { id: string; name: string; description: string; scope: "agent" | "presence"; }
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  { id: "web.search", name: "Web search", description: "Retrieve public sources when an idea needs current evidence.", scope: "agent" },
  { id: "asset.inspect", name: "Asset inspection", description: "Read operator-provided images and documents when they are relevant.", scope: "agent" },
  { id: "chart.render", name: "Chart rendering", description: "Turn structured evidence into a visual explanation.", scope: "agent" },
  { id: "channel.execute", name: "Channel execution", description: "Hand an approved Social Intent to the selected Presence connector.", scope: "presence" },
];

export interface ExecutionEnvelope { presenceId: string; affordances: Record<string, { mode: ExecutionMode }>; pacingProfile: "recommended" | "custom"; customPacing?: Record<string, JsonValue>; accountProtection: "guidance" | "auto-protect"; }
export interface PresenceContext { presenceId: string; channel: ChannelId; publicIdentity: { displayName: string; handle?: string; mode: PresenceMode }; audienceContext?: string; voiceAdaptation?: string; availableAffordances: string[]; relevantRelationshipContext?: string; publicFooting?: PublicFooting; ghostProfile?: GhostProfile; }
export interface Presence { id: string; channel: ChannelId; handle: string; mode: PresenceMode; status: "live" | "paused" | "disconnected"; accent: string; capabilities: ChannelCapability[]; execution: Record<string, ExecutionMode>; executionEnvelope: ExecutionEnvelope; context: PresenceContext; ghostProfile?: GhostProfile; pacing: "recommended" | "gentle" | "custom"; accountHealth: "healthy" | "elevated"; }

export interface ChatMessage { id: string; role: "agent" | "operator"; content: string; timestamp: string; change?: string; }
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[]; }
export interface ChangeSetOperation { path: string; action: "create" | "update" | "delete"; before?: JsonValue; after?: JsonValue; }
export interface ChangeSet { id: string; agentId: string; conversationId?: string; summary: string; operations: ChangeSetOperation[]; createdAt: string; }
export interface StandingIntent { id: string; agentId: string; presenceId?: string; instruction: string; trigger: { type: "schedule" | "event"; config: { day?: string; time?: string; event?: string } }; objective?: string; quality: { skipIfNothingWorthSaying: boolean }; executionWindow?: { startsAt?: string; endsAt?: string }; status: "active" | "paused"; createdAt: string; updatedAt: string; }
export interface EntityRef { type: string; id: string; }
export interface Publication { id: string; format: string; payload: JsonValue; assetIds: string[]; links: { url: string; label?: string }[]; createdAt: string; }
export interface SocialIntent { id: string; agentId: string; presenceId: string; affordance: string; target?: EntityRef; publicationId?: string; priority: number; validity: { expiresAt?: string; staleAfterMs?: number }; state: "active" | "withdrawn" | "expired"; formedAt: string; updatedAt: string; standingIntentId?: string; }
export interface Execution { id: string; socialIntentId: string; presenceId: string; affordance: string; mode: Exclude<ExecutionMode, "off">; status: ExecutionStatus; attempts: number; bridgeId?: string; connector?: ConnectorKind; idempotencyKey: string; target?: EntityRef; publication?: Publication; lease?: { executorId: string; claimedAt: string; expiresAt: string }; externalRef?: EntityRef; failure?: { code?: string; message: string; retryable?: boolean }; createdAt: string; updatedAt: string; executedAt?: string; }
export interface Outcome { id: string; socialIntentId: string; executionId?: string; presenceId: string; status: "succeeded" | "failed" | "unknown"; observedAt: string; metrics: Record<string, number>; evidence?: EntityRef[]; }
export interface LibrarySource { id: string; agentId: string; type: "local-folder" | "remote" | "url-collection" | "content-drop"; location: string; access: "read"; status: "available" | "indexing" | "failed"; }
export interface Asset { id: string; agentId: string; sourceId?: string; type: "image" | "video" | "gif" | "audio" | "pdf" | "document" | "chart"; storagePath?: string; status: "queued" | "processing" | "ready" | "failed"; provenance: { origin: string; sourceUrl?: string; importedAt: string }; mimeType?: string; sizeBytes?: number; dimensions?: { width: number; height: number }; durationMs?: number; description?: string; topics?: string[]; transcript?: string; usageNotes?: string; createdAt: string; updatedAt: string; }
export interface Skill { id: string; name?: string; /** The instruction prompt that defines this reusable behavior. */ description: string; channels: ChannelId[]; requiresTools: string[]; compatibleFormats: string[]; }
export interface AgentSkill { id: string; agentId: string; skillId: string; enabled: boolean; }
export interface ContentDrop { id: string; agentId: string; origin: string; brief?: string; sourceIds: string[]; assetIds: string[]; suggestedUse?: string; suggestedWindow?: string; expiresAt?: string; status: "received" | "reviewed" | "used" | "ignored" | "expired"; createdAt: string; }

export interface LiveEvent { id: string; type: "decision" | "execution" | "learning" | "memory" | "system"; title: string; detail: string; time: string; tone: EventTone; presenceId?: string; intentId?: string; executionId?: string; outcomeId?: string; }
export interface CalendarSlot { id: string; label: string; instruction: string; day: string; time: string; objective: string; presence: string; mode: ExecutionMode; enabled: boolean; executionWindow: string; standingIntentId?: string; }
export interface ActivitySummary {
  current: { label: string; detail: string; tone: EventTone };
  lastPulseAt?: string;
  nextAttention: { label: string; detail: string };
  nextIntent: { label: string; detail: string };
  needsAttention: { count: number; label: string; detail: string };
  rhythm: { attention: string; publishing: string; replies: string; quietHours: string };
}
/** Legacy projection kept for the first UI and older local databases. */
export interface ActionRecord { id: string; intent: "post" | "reply" | "like" | "repost" | "quote" | "no_op"; target?: string; summary: string; status: "queued" | "review" | "executed" | "skipped" | "failed"; reason: string; createdAt: string; expiresAt?: string; socialIntentId?: string; executionId?: string; outcomeId?: string; }

export interface AgentWorkspaceSnapshot {
  onboarded: boolean; agent: Agent | null; presence: Presence | null; presences: Presence[]; activePresenceId: string | null;
  files: AgentFile[]; proposals: FileProposal[]; messages: ChatMessage[]; conversations: Conversation[]; activeConversationId: string | null;
  events: LiveEvent[]; calendar: CalendarSlot[]; actions: ActionRecord[]; metrics: { qualifiedFollows: number; conversations: number; opportunitiesIgnored: number; audienceHealth: number };
  modelProfiles: AgentModelProfile[]; providerConnections: ProviderConnection[]; toolBindings: AgentToolBinding[]; changeSets: ChangeSet[]; standingIntents: StandingIntent[]; socialIntents: SocialIntent[]; executions: Execution[]; outcomes: Outcome[]; publications: Publication[]; librarySources: LibrarySource[]; assets: Asset[]; skills: Skill[]; agentSkills: AgentSkill[]; contentDrops: ContentDrop[]; channelDefinitions: ChannelDefinition[]; nativeConnections: NativeChannelConnection[]; bridges: Bridge[]; mirrorObjects: MirrorObject[]; mirrorEvents: MirrorEvent[]; bridgeSync: BridgeSyncState[];
}

export interface OpenPresenceState extends AgentWorkspaceSnapshot {
  agents: Agent[]; activeAgentId: string | null; agentWorkspaces: AgentWorkspaceSnapshot[];
}

export interface CreateAgentInput { name: string; description: string; audience?: string; mode: PresenceMode; handle: string; accent: string; }
export interface CreatePresenceInput { channel: ChannelId; handle: string; mode: PresenceMode; accent: string; channelDefinition?: ChannelDefinition; }
export type Operation =
  | { type: "reset" } | { type: "createAgent"; input: CreateAgentInput } | { type: "createAdditionalAgent"; input: CreateAgentInput } | { type: "selectAgent"; id: string } | { type: "createPresence"; input: CreatePresenceInput } | { type: "createChannel"; definition: ChannelDefinition } | { type: "createBridge"; input: { presenceId: string; name: string; kind: ConnectorKind; capabilities: ConnectorCapabilities } } | { type: "rotateBridgeKey"; id: string } | { type: "revokeBridge"; id: string } | { type: "removeBridge"; id: string } | { type: "markManualExecution"; id: string; externalRef: EntityRef } | { type: "selectPresence"; id: string } | { type: "selectConversation"; id: string } | { type: "newConversation" } | { type: "sendMessage"; content: string; conversationId?: string } | { type: "saveFile"; kind: FileKind; content: string } | { type: "resolveProposal"; id: string; decision: "approve" | "reject" } | { type: "addSlot"; instruction: string; day: string; time: string; objective: string; executionWindow: string; presenceId?: string } | { type: "editSlot"; id: string; instruction: string; day: string; time: string; objective: string; executionWindow: string } | { type: "createSkill"; name: string; description: string } | { type: "editSkill"; id: string; name: string; description: string } | { type: "configureProvider"; provider: ModelProvider; label: string; endpoint?: string; hasSecret?: boolean; secret?: string } | { type: "wakePresence"; presenceId?: string } | { type: "runPulse"; presenceId?: string } | { type: "setModel"; model: string; provider?: ModelProvider; quality?: ModelQuality } | { type: "runSlot"; id: string } | { type: "approveExecution"; id: string } | { type: "executeIntent"; id: string } | { type: "setPresence"; patch: Partial<Pick<Presence, "mode" | "status" | "pacing" | "execution" | "ghostProfile">> };
