export type View = "teach" | "knowledge" | "chat" | "watching" | "people" | "playground" | "live" | "feed" | "growth" | "calendar" | "schedule" | "brain" | "presence";
export type BuiltInChannelId = "x" | "linkedin" | "substack";
export type ChannelId = string;
export type ConnectorKind = "simulated" | "native" | "bridge" | "manual";
export type PresenceMode = "agent" | "ghost";
export type MediaPerceptionPolicy = "use-judgment" | "review-uncertain" | "always-review";
export type SocialAssetKind = "image" | "video" | "gif" | "audio" | "document" | "chart" | "link";
export type AssetMediaKind = "image" | "gif" | "video" | "document" | "audio" | "other";
export type AssetSemanticKind = "chart" | "screenshot" | "photo" | "illustration" | "logo" | "meme" | "diagram" | "clip" | "generated" | "other";
export type VisualRole = "evidence" | "subject" | "context" | "identity" | "atmosphere" | "none";
export type AssetOrigin = "discovered" | "operator_upload" | "generated" | "transformed" | "mirror_observation" | "historical_import" | "sandbox";
export type AssetNature = "observed" | "generated" | "edited" | "composited" | "synthetic" | "unknown";
export type ExpressionMode = "factual" | "analysis" | "opinion" | "hypothetical" | "satire" | "parody" | "fiction" | "entertainment";
export type GroundingStatus = "supported" | "partially_supported" | "unsupported" | "not_required" | "unknown";
export type Factuality = "intended_factual" | "intentionally_fictional" | "mixed";
export type SourceIdentityStatus = "verified" | "partially_verified" | "unknown";
export type RightsStatus = "owned" | "licensed" | "public_domain" | "permission_recorded" | "unknown" | "restricted";
export type AssetUsageType = "new" | "repurpose" | "repost" | "quote" | "cross_channel_adaptation" | "operator_directed_reuse";
export type PerceptionLevel = "glance" | "inspect" | "resolve";
export type PerceptionUncertainty = "low" | "medium" | "high" | "insufficient";
export type AssetResearchDecision = "select" | "search_again" | "render" | "text_only" | "replan";
export type PublicDisclosurePosture = "contextual" | "ai-forward" | "private" | "representational" | "open-about-assistance";
export type PublicTechnicalFact = "ai-presence" | "open-source" | "built-with-openpresence" | "model-provider" | "exact-model" | "tools";
export type ExecutionMode = "off" | "manual" | "review" | "auto";
export type ExecutionStatus = "awaiting-review" | "approved" | "awaiting-manual" | "awaiting-connector" | "queued" | "claimed" | "executing" | "succeeded" | "failed" | "blocked" | "cancelled" | "expired";
export type FileKind = "BRAIN" | "SOUL" | "MISSION" | "TASTE" | "MEMORY" | "GROWTH" | "PULSE" | "PRESENCE";
export type EventTone = "neutral" | "positive" | "quiet" | "warning";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface RuntimeScope {
  userId: string;
  agentId: string;
  presenceId?: string;
  environment: PresenceEnvironment;
  playgroundSessionId?: string;
  worldRevision?: number;
  assignmentId?: string;
  assignmentRevision?: number;
  conversationId?: string;
  invocationId: string;
}
export interface RuntimeInvocation {
  id: string;
  scope: RuntimeScope;
  trigger: "operator" | "pulse" | "schedule" | "watch" | "social_event" | "playground" | "assignment";
  createdAt: string;
  status: "running" | "completed" | "cancelled" | "stale" | "failed";
}

export type Shareability = "presence-only" | "agent-wide" | "public";
export type VisibilityScope = "public" | "private-community" | "private-thread" | "direct-message" | "unknown";
export type PresenceEnvironment = "live" | "sandbox";
export type PresenceConnectionMode = "sandbox" | "native" | "bridge";
export interface PresenceBrowserAccess { enabled: boolean; }
export type RelationshipMemoryState = "active" | "forgotten";
export type RelationshipEpistemicKind = "stated_by_person" | "inferred" | "operator_provided" | "connector_verified";
export type RelationshipVisibility = "public" | `presence:${string}` | `community:${string}` | `conversation:${string}` | "operator_only";
export type PersonIdentityVerificationMethod = "provider_verified" | "connector_verified" | "operator_confirmed";
export type RelationshipOpenLoopStatus = "open" | "resolved" | "superseded";
export type IntroductionState = "offered" | "requester_interested" | "candidate_contact_pending" | "candidate_contacted" | "candidate_accepted" | "candidate_declined" | "introduced" | "closed";
export type BridgeAdapterStatus = "waiting" | "connected" | "stale" | "disconnected";
// The richer lifecycle is the canonical vocabulary. `active` and `paused`
// remain accepted for older persisted workspaces and are normalized by the
// runtime without destroying their history.
export type AssignmentStatus = "draft" | "accepted" | "planning" | "active" | "working" | "awaiting_execution" | "awaiting_review" | "needs_operator" | "paused" | "blocked" | "completed" | "completed_with_adaptation" | "failed" | "expired_incomplete" | "cancelled";
export type AssignmentPreflightStatus = "ready" | "ready_with_assumptions" | "needs_input" | "blocked";
export type AssignmentDelegationPolicy = "keep_moving" | "ask_before_change" | "stop_on_deviation";
export type AssignmentQuantityMode = "target" | "at_least" | "exact" | "at_most" | "minimum" | "maximum";
export type AssignmentOrigin = "schedule" | "exploration" | "watchlist" | "publishing_initiative" | "teach" | "manual" | "system";
export type AssignmentMetricComparator = ">=" | ">" | "=" | "<" | "<=";
export interface AssignmentMetricThreshold { metric: string; comparator: AssignmentMetricComparator; value: number; label?: string; }
export interface AssignmentPlan {
  id: string;
  assignmentId: string;
  revision: number;
  summary: string;
  dailyTargets: string[];
  publishingApproach: string[];
  discoveryDirections: string[];
  relationshipFocus: string[];
  hypotheses: string[];
  nextWeeklyReviewAt?: string;
  nextStrategicReviewAt?: string;
  source: "agent" | "operator";
  createdAt: string;
  updatedAt: string;
}
export type GrowthReviewKind = "weekly" | "strategic";
export interface GrowthReview {
  id: string;
  assignmentId: string;
  presenceId: string;
  kind: GrowthReviewKind;
  periodStart: string;
  periodEnd: string;
  summary: string;
  working: string[];
  uncertain: string[];
  weak: string[];
  changedPlan: boolean;
  assignmentPlanRevision?: number;
  growthFileRevision?: number;
  evidenceIds: string[];
  createdAt: string;
  reviewSource?: "model" | "deterministic";
  planChangeSummary?: string;
}
export interface GrowthReviewDecision {
  summary: string;
  working: string[];
  uncertain: string[];
  weak: string[];
  rationale?: string;
  plan?: {
    summary?: string;
    dailyTargets?: string[];
    publishingApproach?: string[];
    discoveryDirections?: string[];
    relationshipFocus?: string[];
    hypotheses?: string[];
  };
}
export interface GrowthFileVersion {
  version: number;
  previousVersion?: number;
  content: string;
  presenceId: string;
  scope: string;
  reviewId?: string;
  reviewSource?: "model" | "deterministic";
  changeSummary: string;
  createdAt: string;
}
export type AgentRequestKind = "capability" | "knowledge" | "permission" | "growth_review" | "operator_decision" | "connector";
export type AgentRequestStatus = "open" | "accepted" | "rejected" | "resolved" | "snoozed";
export interface AgentRequest {
  id: string;
  agentId: string;
  presenceId?: string;
  assignmentId?: string;
  kind: AgentRequestKind;
  importance: "blocking" | "important" | "informational";
  title: string;
  need: string;
  why: string;
  currentWorkaround?: string;
  capability?: string;
  dedupeKey: string;
  status: AgentRequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}
export interface CapabilityChangeEvent {
  id: string;
  presenceId: string;
  capability: string;
  previousAvailability: CapabilityAvailability;
  nextAvailability: CapabilityAvailability;
  provider?: string;
  detail: string;
  createdAt: string;
}
export type MetricObservationSource = "native" | "bridge" | "manual" | "sandbox";
export interface PresenceAudienceSnapshot {
  id: string;
  presenceId: string;
  channel: ChannelId;
  followers: number;
  following?: number;
  source: MetricObservationSource;
  observationStatus: "observed" | "partial" | "unavailable";
  observedAt: string;
  environment?: PresenceEnvironment;
}
export interface PublicationMetricSnapshot {
  id: string;
  presenceId: string;
  mirrorObjectId: string;
  observedAt: string;
  publicationAgeSeconds: number;
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  source: MetricObservationSource;
  observationStatus: "observed" | "partial" | "unavailable";
  baseline?: {
    comparableCount: number;
    confidence: "low" | "medium" | "high";
    relative: Partial<Record<"impressions" | "likes" | "replies" | "reposts" | "quotes", number>>;
  };
}
export type CapabilityAvailability = "available" | "temporarily-unavailable" | "unavailable" | "blocked" | "unknown";
export interface PresenceCapability {
  capability: string;
  label: string;
  availability: CapabilityAvailability;
  executionMode?: ExecutionMode;
  provider?: string;
  requiresBrowser: boolean;
  canObserve: boolean;
  canExecute: boolean;
  canVerify: boolean;
  limitation?: string;
}
export interface PresenceCapabilityManifest {
  presenceId: string;
  channel: ChannelId;
  generatedAt: string;
  bodyStatus: "ready" | "degraded" | "unavailable";
  items: PresenceCapability[];
}
export type AssignmentActivation =
  | { type: "scheduled"; startsAt?: string; recurrence?: Assignment["recurrence"]; deadline?: string }
  | { type: "attention_source"; sourceIds: string[]; startsAt?: string; endsAt?: string }
  | { type: "continuous" }
  | { type: "manual" };
export type AssignmentDeliverableType = "original_publication" | "maintain_original_presence" | "meaningful_engagement" | "reply" | "public_interaction" | "introduction" | "quote" | "repost" | "message" | "decision_report" | "custom" | string;
export type AssignmentOutcomeClass = "candidate_rejected" | "action_no_op" | "assignment_blocked" | "assignment_completed" | "assignment_cancelled" | "evaluation_failed" | "delivery_failed" | "language_policy_failed" | "incomplete";
export type AssignmentWorkPhase = "researching" | "candidate_review" | "visual_research" | "publishing" | "blocked" | "completed";
export type AssignmentRunStatus = "queued" | "researching" | "selecting" | "writing" | "delivering" | "published" | "blocked" | "failed" | "cancelled";
export type ConversationDisposition = "continue" | "react_only" | "close_with_reply" | "close_silently" | "defer";
export type ConversationEpisodeStatus = "active" | "cooling" | "closing" | "closed";

export interface ChannelEntityDefinition { id: string; label: string; }
export interface ChannelRelationshipDefinition { from: string; to: string[]; relation: "contains" | "replies-to" | "mentions" | "direct"; }
export interface ChannelMetricDefinition { id: string; label: string; }
export interface ChannelPrivacyDefaults { visibility: VisibilityScope; shareability: Shareability; }
export interface ChannelSurfaceDefinition { id: string; label: string; description?: string; accepts?: string[]; }
export interface ChannelDiscoverySurface { id: string; label: string; description?: string; }
export interface ChannelSimulationAction {
  id: string;
  label: string;
  description: string;
  objectType: string;
  actorLabel: string;
  contentLabel: string;
  contentPlaceholder: string;
  contentRequired?: boolean;
  submitLabel: string;
  target?: { label: string; relation: "reply" | "quote" | "repost" | "like" };
}
export interface ChannelSimulationDefinition {
  worldLabel: string;
  worldDescription: string;
  startingStateLabel: string;
  surfaces: ChannelSurfaceDefinition[];
  actions: ChannelSimulationAction[];
}
export interface ChannelDefinition {
  id: ChannelId;
  name: string;
  description?: string;
  icon?: string;
  domain?: string;
  entities: ChannelEntityDefinition[];
  affordances: ChannelCapability[];
  supportedAssetKinds?: SocialAssetKind[];
  formats: FormatDefinition[];
  relationships: ChannelRelationshipDefinition[];
  metrics: ChannelMetricDefinition[];
  simulation?: ChannelSimulationDefinition;
  discovery?: ChannelDiscoverySurface[];
  playbook?: string;
  privacyDefaults: ChannelPrivacyDefaults;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorCapabilities { inbound: boolean; reconcile: boolean; affordances: string[]; formats: string[]; metrics: string[]; assetKinds?: SocialAssetKind[]; }
export interface Bridge {
  id: string;
  presenceId: string;
  sessionId?: string;
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
  adapterStatus?: BridgeAdapterStatus;
  lastHeartbeatAt?: string;
  /** Account identity observed by the external adapter in its controlled tab. */
  accountIdentity?: {
    username?: string;
    status: "verified" | "mismatch" | "unknown";
    message?: string;
    observedAt: string;
  };
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
  /** Channel-neutral conversation/thread identity when the connector provides one. */
  conversationExternalRef?: string;
  /** Provider-neutral root identity when the connector can supply it. */
  rootExternalRef?: EntityRef;
  /** Referenced objects that are not necessarily reply ancestors, such as quotes. */
  referencedExternalRefs?: EntityRef[];
  /** Additional provider relationships, retained as evidence without flattening channel semantics. */
  referenceRelations?: Array<{ type: "reply" | "quote" | "repost" | "mention" | "dm_reply" | "comment_reply" | string; externalRef: EntityRef }>;
  objectType: string;
  /** Provider- or adapter-supplied BCP-47 language tag for observed text. */
  language?: string;
  author?: { externalRef?: EntityRef; displayName: string; handle?: string; avatarUrl?: string };
  content?: { text?: string; payload?: JsonValue; language?: string };
  assetRefs?: SocialAssetRef[];
  occurredAt?: string;
  observedAt: string;
  visibility: VisibilityScope;
  shareability: Shareability;
  originExecutionId?: string;
  actorPresenceId?: string;
  sourceEventId?: string;
  simulationActionId?: string;
  archived?: boolean;
  environment?: PresenceEnvironment;
  sessionId?: string;
  assignmentId?: string;
  source?: "scenario" | "operator" | "native" | "manual" | "system";
  trust?: "untrusted_world_content";
  scenarioStimulusId?: string;
}

export interface EvidenceRef {
  kind: "mirror_object" | "conversation_event" | "connector_identity" | "community_directory" | "operator_input" | "publication" | "social_intent";
  id: string;
  sourcePresenceId?: string;
  observedAt?: string;
}

export interface Person {
  id: string;
  agentId: string;
  displayName: string;
  memoryState: RelationshipMemoryState;
  forgottenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonIdentity {
  id: string;
  personId: string;
  channel: ChannelId;
  externalActorId: string;
  handle?: string;
  profileUrl?: string;
  avatarUrl?: string;
  sourcePresenceId: string;
  /** Environment that established this identity. Legacy records are inferred during normalization. */
  sourceEnvironment?: PresenceEnvironment;
  sourceSessionId?: string;
  verificationMethod: PersonIdentityVerificationMethod;
  createdAt: string;
}

export interface Relationship {
  id: string;
  agentId: string;
  personId: string;
  following?: boolean;
  firstMeaningfulInteractionAt?: string;
  lastMeaningfulInteractionAt?: string;
  state: RelationshipMemoryState;
  forgottenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipFact {
  id: string;
  relationshipId: string;
  statement: string;
  epistemicKind: RelationshipEpistemicKind;
  confidence?: "low" | "medium" | "high";
  provenanceRefs: EvidenceRef[];
  visibility: RelationshipVisibility;
  validFrom?: string;
  validTo?: string;
  supersedesFactId?: string;
  createdAt: string;
}

export interface RelationshipOpenLoop {
  id: string;
  relationshipId: string;
  description: string;
  provenanceRefs: EvidenceRef[];
  status: RelationshipOpenLoopStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface RecommendationRecord {
  id: string;
  agentId: string;
  presenceId: string;
  recipientPersonId?: string;
  recipientActorId?: string;
  recommendedPersonId?: string;
  candidateId?: string;
  sourceSocialIntentId: string;
  rationale: string;
  evidenceRefs: EvidenceRef[];
  visibility: RelationshipVisibility;
  deliveredAt: string;
  outcome?: string;
}

export interface IntroductionRecord {
  id: string;
  agentId: string;
  presenceId: string;
  requesterPersonId?: string;
  requesterActorId?: string;
  candidatePersonId?: string;
  candidateActorId?: string;
  requesterConsent: "unknown" | "asked" | "consented" | "declined";
  candidateConsent: "unknown" | "asked" | "consented" | "declined";
  sourceIntentIds: string[];
  executionIds: string[];
  state: IntroductionState;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipContextProjection {
  personId: string;
  presenceId: string;
  relationshipStatus: "observed" | "watched" | "interacted" | "remembered";
  summary?: string;
  facts: RelationshipFact[];
  openLoops: RelationshipOpenLoop[];
  sourceFactIds: string[];
  generatedAt: string;
}

export interface NetworkCandidate {
  candidateId: string;
  actorId?: string;
  personId?: string;
  displayName: string;
  handle?: string;
  candidateSource: "remembered" | "interacted" | "watched" | "community-directory" | "sandbox-directory" | "current-context";
  relationshipStatus: "observed" | "watched" | "interacted" | "remembered";
  relevantEvidence: EvidenceRef[];
  shareableEvidence: EvidenceRef[];
  evidence: string[];
}

export interface SocialAssetRef { assetId: string; kind: SocialAssetKind; role?: "primary" | "attachment" | "link-preview"; }
export interface SandboxAssetInput {
  name: string;
  kind: SocialAssetKind;
  mimeType?: string;
  dataUrl?: string;
  /** Direct media URL used for rendering the asset in Sandbox. */
  sourceUrl?: string;
  /** Human-facing source page for provenance and verification. */
  sourcePageUrl?: string;
  /** Publisher or dataset owner shown beside the asset. */
  publisher?: string;
  /** Reuse a previously materialized immutable asset without downloading it again. */
  existingAssetId?: string;
}
export interface PerceivedFact { label: string; value: string; confidence?: PerceptionUncertainty; }
export interface PerceptionResult { observation: string; interpretation?: string; alternativeInterpretations?: string[]; visibleText?: string; transcript?: string; extractedFacts?: PerceivedFact[]; uncertainty: PerceptionUncertainty; missingContext?: string[]; visualForm?: AssetSemanticKind; visualRole?: VisualRole; claimsSupported?: string[]; claimsNotSupported?: string[]; legibility?: "clear" | "partial" | "poor"; decorative?: boolean; sourceCitationVisible?: boolean; }
export interface AssetPerception { id: string; assetId: string; socialObjectId?: string; presenceId: string; level: PerceptionLevel; result: PerceptionResult; providerId?: string; modelId?: string; sourceAssetVersion: string; contextObjectIds?: string[]; supersedesId?: string; createdAt: string; environment?: PresenceEnvironment; sessionId?: string; }

export interface MirrorEvent {
  id: string;
  bridgeId: string;
  presenceId: string;
  sourceEventId: string;
  event: "created" | "updated" | "deleted";
  externalRef: EntityRef;
  object?: MirrorObject;
  receivedAt: string;
  environment?: PresenceEnvironment;
  sessionId?: string;
}

export interface BridgeSyncState { bridgeId: string; cursor?: string; lastSyncAt?: string; status: "idle" | "syncing" | "healthy" | "degraded" | "offline"; error?: string; }

export interface NativeObservationState {
  status: "syncing" | "up-to-date" | "stale" | "degraded" | "error";
  lastObservedAt?: string;
  nextObservationAt?: string;
  ownPostCount?: number;
  mentionCount?: number;
  conversationCount?: number;
  error?: string;
}

export interface NativeChannelConnection {
  id: string;
  presenceId: string;
  channelId: ChannelId;
  kind: "x";
  status: "connected" | "needs-attention";
  access: "read" | "read-write";
  account?: { id: string; username: string; name: string; profileImageUrl?: string };
  healthMessage?: string;
  deliveryError?: string;
  observation?: NativeObservationState;
  updatedAt: string;
  createdAt: string;
}

export type GhostRepresentationKind = "individual" | "organization";

export interface GhostIndividualIdentity {
  firstName: string;
  middleName: string;
  lastName: string;
}

export interface GhostOrganizationIdentity {
  name: string;
  website: string;
}

export interface GhostRepresentation {
  kind: GhostRepresentationKind;
  individual: GhostIndividualIdentity;
  organization: GhostOrganizationIdentity;
}

export interface GhostProfile {
  /** Legacy unstructured identity retained for persisted profiles created before structured representation. */
  subject: string;
  representation?: GhostRepresentation;
  priorities: string;
  preferences: string;
  voice: string;
  boundaries: string;
}

export interface PublicFooting {
  postsPublished: number;
  recentPostIds: string[];
  recentInboundIds?: string[];
  judgedInboundIds?: string[];
  observedAt: string;
}

export interface PublicSelf {
  displayName: string;
  posture: PublicDisclosurePosture;
  approvedTechnicalFacts: PublicTechnicalFact[];
}

/** The role an Agent inhabits in one social world. This is not a connector policy. */
export interface PresenceBrief {
  purpose: string;
  audience: string;
  primaryTerritory: string[];
  adjacentTerritory: string[];
  boundaries: string[];
}

export interface ChannelCapability { id: string; label: string; description: string; }

export const CHANNEL_CAPABILITIES: Record<ChannelId, ChannelCapability[]> = {
  x: [
    { id: "post", label: "Posts", description: "Create a new point of view." },
    { id: "reply", label: "Replies", description: "Join a conversation." },
    { id: "repost", label: "Reposts", description: "Pass along something worth seeing." },
    { id: "quote", label: "Quotes", description: "Add context to another post." },
    { id: "like", label: "Likes", description: "A quiet signal of attention." },
    { id: "follow", label: "Follows", description: "Follow a relevant person in the Presence's territory." },
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
export interface FormatDefinition { id: string; label: string; description: string; channel: ChannelId; maxCharacters?: number; }
export interface ChannelExtension { id: ChannelId; affordances: AffordanceDefinition[]; formats: FormatDefinition[]; }

export const CHANNEL_EXTENSIONS: Record<ChannelId, ChannelExtension> = {
  x: { id: "x", affordances: CHANNEL_CAPABILITIES.x.map((item) => ({ ...item, channel: "x" })), formats: [
    { id: "x.post", label: "Post", description: "A single text publication.", channel: "x", maxCharacters: 280 },
    { id: "x.media-post", label: "Media post", description: "A post with one or more assets.", channel: "x", maxCharacters: 280 },
    { id: "x.long-post", label: "Long post", description: "A long-form text publication supported by the Presence's X plan.", channel: "x", maxCharacters: 25000 },
    { id: "x.thread", label: "Thread", description: "A connected sequence of posts.", channel: "x", maxCharacters: 280 },
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

const xSimulation: ChannelSimulationDefinition = {
  worldLabel: "Simulated X",
  worldDescription: "Rehearse how this Presence behaves on X.",
  startingStateLabel: "Fresh X account",
  surfaces: [{ id: "feed", label: "Feed", description: "Public posts and the conversations around them.", accepts: ["post", "reply", "quote", "repost", "like"] }, { id: "messages", label: "Messages", description: "Private conversations.", accepts: ["message"] }],
  actions: [
    { id: "post", label: "Someone posts", description: "Put a new post into the simulated X feed.", objectType: "post", actorLabel: "Who posted?", contentLabel: "What did they post?", contentPlaceholder: "Write the post Jenny should consider…", submitLabel: "Add post" },
    { id: "reply", label: "Someone replies to Jenny", description: "Attach a reply to one of Jenny's simulated posts.", objectType: "reply", actorLabel: "Who replied?", contentLabel: "What do they say?", contentPlaceholder: "Write the reply Jenny should consider…", submitLabel: "Add reply", target: { label: "Replying to", relation: "reply" } },
    { id: "quote", label: "Someone quotes a post", description: "Add commentary while quoting a simulated post.", objectType: "quote", actorLabel: "Who quoted it?", contentLabel: "What do they say?", contentPlaceholder: "Write the quote commentary…", submitLabel: "Add quote", target: { label: "Quoting", relation: "quote" } },
    { id: "repost", label: "Someone reposts a post", description: "Simulate a repost signal around a post.", objectType: "repost", actorLabel: "Who reposted it?", contentLabel: "Comment (optional)", contentPlaceholder: "Add context, or leave this blank…", contentRequired: false, submitLabel: "Add repost", target: { label: "Reposting", relation: "repost" } },
    { id: "like", label: "Someone likes a post", description: "Add a quiet signal of attention to a post.", objectType: "like", actorLabel: "Who liked it?", contentLabel: "Note (optional)", contentPlaceholder: "Add an internal note, or leave this blank…", contentRequired: false, submitLabel: "Add like", target: { label: "Liking", relation: "like" } },
    { id: "message", label: "Someone sends a message", description: "Put an inbound private message into the simulated X world.", objectType: "message", actorLabel: "Who sent it?", contentLabel: "What do they say?", contentPlaceholder: "Write the message Jenny should consider…", submitLabel: "Add message" },
  ],
};

const simulationActionFromCapability = (capability: ChannelCapability): ChannelSimulationAction => {
  const isTargeted = ["reply", "comment", "reaction", "like", "repost", "quote", "restack"].includes(capability.id);
  const isOptional = ["reaction", "like", "repost", "restack"].includes(capability.id);
  return {
    id: capability.id,
    label: `Someone ${capability.label.toLowerCase()}`,
    description: capability.description,
    objectType: capability.id,
    actorLabel: "Who did this?",
    contentLabel: isOptional ? "Comment (optional)" : "What happened?",
    contentPlaceholder: isOptional ? "Add context, or leave this blank…" : "Describe what happened…",
    contentRequired: !isOptional,
    submitLabel: `Add ${capability.label.toLowerCase().replace(/s$/, "")}`,
    target: isTargeted ? { label: capability.id === "reply" || capability.id === "comment" ? "Replying to" : capability.label, relation: capability.id === "reply" || capability.id === "comment" ? "reply" : capability.id === "quote" ? "quote" : capability.id === "like" || capability.id === "reaction" ? "like" : "repost" } : undefined,
  };
};

export function simulationForChannel(channel: ChannelId, definition?: ChannelDefinition): ChannelSimulationDefinition {
  if (definition?.simulation) return definition.simulation;
  if (channel === "x") return xSimulation;
  const capabilities = definition?.affordances ?? CHANNEL_CAPABILITIES[channel] ?? [];
  const name = definition?.name ?? channel;
  return { worldLabel: name === channel ? `Simulated ${name}` : name, worldDescription: `Rehearse how this Presence behaves in ${name}.`, startingStateLabel: `New ${name} world`, surfaces: [{ id: "main", label: name, description: `The main ${name} surface.`, accepts: capabilities.map((item) => item.id) }], actions: capabilities.filter((item) => item.id !== "mention").map(simulationActionFromCapability) };
}

export const CHANNEL_SIMULATIONS: Record<string, ChannelSimulationDefinition> = { x: xSimulation };

export interface AgentFile { kind: FileKind; title: string; subtitle: string; content: string; protected: boolean; revision: number; updatedAt: string; }
export interface FileProposal { id: string; file: FileKind; title: string; reason: string; current: string; proposed: string; status: "pending" | "approved" | "rejected"; createdAt: string; changeSetId?: string; target?: { type: "presence_identity"; presenceId: string; name: string }; }
export type PresenceLanguage = "en";
export interface LanguagePolicy { avoid: string[]; prohibited: string[]; }
export interface Agent { id: string; name: string; description: string; audience: string; topics: string[]; accent: string; glyph: string; languagePolicy: LanguagePolicy; }

export interface ModelRuntimeCapabilities { vision: boolean; toolCalling: boolean; structuredOutput: boolean; streaming: boolean; }
export type ModelProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "custom";
export type ModelQuality = "low" | "medium" | "high" | "local";
export interface AgentModelProfile { id: string; agentId: string; provider: ModelProvider; model: string; quality?: ModelQuality; connectionId?: string; capabilities: ModelRuntimeCapabilities; updatedAt: string; }
export interface ProviderConnection { id: string; provider: ModelProvider; label: string; status: "available" | "needs-configuration" | "local"; endpoint?: string; secretConfigured?: boolean; createdAt: string; }
export type AssetDiscoveryProviderId = "tavily";
export interface AssetProviderConnection { id: string; provider: AssetDiscoveryProviderId; label: string; status: "available" | "needs-configuration"; endpoint?: string; secretConfigured?: boolean; createdAt: string; }
export interface AgentToolBinding { id: string; agentId: string; toolId: string; enabled?: boolean; provider?: string; model?: string; connectionId?: string; config?: Record<string, JsonValue>; }
export type AgentCapabilityId = "research" | "asset-intelligence" | "visual-creation" | "channel-action";
export interface AgentCapabilityDefinition { id: AgentCapabilityId; name: string; description: string; toolIds: string[]; scope: "agent" | "presence"; }
export interface AgentToolDefinition { id: string; name: string; description: string; scope: "agent" | "presence"; }
export const AGENT_CAPABILITY_DEFINITIONS: AgentCapabilityDefinition[] = [
  { id: "research", name: "Web research", description: "Find and retrieve outside evidence when useful.", toolIds: ["web.search"], scope: "agent" },
  { id: "asset-intelligence", name: "Asset intelligence", description: "Find, understand, verify, and prepare media.", toolIds: ["asset.inspect"], scope: "agent" },
  { id: "visual-creation", name: "Visual creation", description: "Create original visual explanations from grounded evidence.", toolIds: ["chart.render"], scope: "agent" },
  { id: "channel-action", name: "Channel action", description: "Publish approved Social Intents through the active Presence.", toolIds: ["channel.execute"], scope: "presence" },
];
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  { id: "web.search", name: "Web search", description: "Retrieve public sources when an idea needs current evidence.", scope: "agent" },
  { id: "network.search", name: "Network search", description: "Retrieve provider-backed people candidates and relationship evidence without creating memory or contact.", scope: "agent" },
  { id: "relationship.history", name: "Relationship history", description: "Read source-backed history for a remembered person within the current Presence scope.", scope: "agent" },
  { id: "asset.inspect", name: "Asset inspection", description: "Read operator-provided images and documents when they are relevant.", scope: "agent" },
  { id: "chart.render", name: "Chart rendering", description: "Turn structured evidence into a visual explanation.", scope: "agent" },
  { id: "channel.execute", name: "Channel execution", description: "Hand an approved Social Intent to the selected Presence connector.", scope: "presence" },
];

export function agentCapabilityDefinition(id: AgentCapabilityId) {
  return AGENT_CAPABILITY_DEFINITIONS.find((definition) => definition.id === id);
}

export function isAgentToolEnabled(toolBindings: AgentToolBinding[], agentId: string | undefined, toolId: string) {
  const binding = toolBindings.find((item) => item.agentId === agentId && item.toolId === toolId);
  return Boolean(binding && binding.enabled !== false);
}

export function isAgentCapabilityEnabled(toolBindings: AgentToolBinding[], agentId: string | undefined, capabilityId: AgentCapabilityId) {
  const definition = agentCapabilityDefinition(capabilityId);
  return Boolean(definition?.scope === "agent" && definition.toolIds.every((toolId) => isAgentToolEnabled(toolBindings, agentId, toolId)));
}

export type KnowledgeRole = "reference" | "procedure";
export type KnowledgeUse = "none" | "internal" | "public";
export type KnowledgeSourceType = "upload" | "pasted_text" | "markdown";

export interface KnowledgeCollection {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  defaultRole: KnowledgeRole;
  defaultUse: KnowledgeUse;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeItem {
  id: string;
  collectionId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  role: KnowledgeRole;
  useOverride?: KnowledgeUse;
  effectiveFrom?: string;
  reviewAfter?: string;
  status: "active" | "archived";
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersion {
  id: string;
  itemId: string;
  versionNumber: number;
  supersedesVersionId?: string;
  originalAssetId?: string;
  contentHash: string;
  mimeType: string;
  normalizedContent: string;
  parseStatus: "pending" | "ready" | "failed";
  parseError?: string;
  effectiveAt?: string;
  createdAt: string;
}

export interface KnowledgeSegment {
  id: string;
  knowledgeVersionId: string;
  ordinal: number;
  headingPath?: string[];
  pageNumber?: number;
  text: string;
  textRange?: { start: number; end: number };
  contentHash: string;
  tokenCount: number;
  indexStatus: "pending" | "ready" | "failed";
}

export interface PresenceKnowledgeBinding {
  id: string;
  agentId: string;
  presenceId: string;
  collectionId: string;
  maximumUse: KnowledgeUse;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeRetrievalPurpose = "operator_chat" | "social_planning" | "public_expression" | "assignment" | "support" | string;
export interface KnowledgeRetrievalRun {
  id: string;
  agentId: string;
  presenceId: string;
  invocationId: string;
  purpose: KnowledgeRetrievalPurpose;
  query: string;
  accessibleCollectionIds: string[];
  candidateSegmentIds: string[];
  selectedSegmentIds: string[];
  createdAt: string;
}

export type KnowledgeCitationUsage = "retrieved" | "relied_on" | "quoted" | "constraint";
export interface KnowledgeCitation {
  id: string;
  retrievalRunId: string;
  knowledgeItemId: string;
  knowledgeVersionId: string;
  knowledgeSegmentId: string;
  usage: KnowledgeCitationUsage;
  outputArtifactType?: string;
  outputArtifactId?: string;
  createdAt: string;
}

export interface KnowledgeEvidence {
  collectionId: string;
  collectionName: string;
  itemId: string;
  itemTitle: string;
  versionId: string;
  versionNumber: number;
  segmentId: string;
  headingPath?: string[];
  pageNumber?: number;
  textRange?: { start: number; end: number };
  excerpt: string;
  effectiveUse: Exclude<KnowledgeUse, "none">;
  sourceType: KnowledgeSourceType;
  reviewAfter?: string;
}

export interface KnowledgeContextPacket {
  retrievalRunId: string;
  publicEvidence: KnowledgeEvidence[];
  restrictedEvidence: KnowledgeEvidence[];
  unresolvedConflicts?: string[];
  missingEvidence?: string[];
  staleWarnings?: string[];
}

export interface ExecutionEnvelope { presenceId: string; affordances: Record<string, { mode: ExecutionMode }>; pacingProfile: "recommended" | "custom"; customPacing?: Record<string, JsonValue>; accountProtection: "guidance" | "auto-protect"; }
export type PublishingInitiativeMode = "off" | "adaptive" | "pace";
export type PublishingInitiativePeriod = "day" | "week";
export interface PublishingInitiative {
  mode: PublishingInitiativeMode;
  target?: { count: number; period: PublishingInitiativePeriod };
  assignmentId?: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
export type PublishingPlanStatus = "planning" | "active" | "blocked" | "completed" | "expired" | "superseded";
export type PublishingPlanWindowPurpose = "originate" | "research" | "develop" | "reassess";
export type PublishingPlanWindowStatus = "future" | "active" | "completed" | "missed" | "superseded";
export interface PublishingPlanWindow {
  id: string;
  startAt: string;
  endAt: string;
  purpose: PublishingPlanWindowPurpose;
  desiredContribution?: { min: number; max: number };
  status: PublishingPlanWindowStatus;
  summary: string;
  attempts?: number;
  lastAttemptAt?: string;
  nextConsiderAt?: string;
  outcome?: "pending" | "researching" | "candidate_rejected" | "original_selected" | "awaiting_review" | "delivery_failed" | "verified";
}
export type PublishingWorkItemStatus = "exploring" | "researching" | "developing" | "candidate_ready" | "blocked" | "waiting";
export interface PublishingWorkItem {
  id: string;
  status: PublishingWorkItemStatus;
  summary: string;
  sourceIds?: string[];
  createdAt: string;
  updatedAt: string;
}
export type PublishingPlanWorkStage = "eligible" | "claimed" | "agenda" | "considered" | "researching" | "candidate_rejected" | "original_selected" | "intent_formed" | "awaiting_review" | "delivery_succeeded" | "delivery_failed" | "mirror_verified" | "progress_incremented" | "reassessed";
export interface PublishingPlanWorkEvent {
  id: string;
  planId: string;
  planRevision: number;
  windowId: string;
  stage: PublishingPlanWorkStage;
  detail: string;
  at: string;
  socialIntentId?: string;
  executionId?: string;
  mirrorObjectId?: string;
  outcomeId?: string;
}
export interface PublishingPlan {
  id: string;
  agentId: string;
  presenceId: string;
  environment: PresenceEnvironment;
  initiativeMode: Exclude<PublishingInitiativeMode, "off">;
  horizonStart: string;
  horizonEnd: string;
  timezone: string;
  status: PublishingPlanStatus;
  expectedOriginals?: { min: number; max: number };
  operatorTarget?: { quantity: number; period: PublishingInitiativePeriod };
  verifiedOriginals: number;
  windows: PublishingPlanWindow[];
  currentWork?: PublishingWorkItem[];
  nextReassessmentAt?: string;
  rationaleSummary?: string;
  evidenceSummary?: string[];
  constraints?: string[];
  replanSignals?: string[];
  nextAttentionAt?: string;
  workHistory?: PublishingPlanWorkEvent[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  modelProvider?: string;
  modelId?: string;
}
export interface PublishingPlanDraft {
  horizonStart: string;
  horizonEnd: string;
  expectedOriginals?: { min: number; max: number };
  windows: Array<Omit<PublishingPlanWindow, "id" | "status">>;
  currentWork?: Array<Omit<PublishingWorkItem, "id" | "createdAt" | "updatedAt">>;
  nextReassessmentAt?: string;
  rationaleSummary?: string;
  evidenceSummary?: string[];
  constraints?: string[];
  replanSignals?: string[];
}
export type SocialOriginKind = "publishing_initiative" | "assignment" | "standing_intent" | "exploration" | "inbound_social" | "operator" | "teach" | "other";
export interface SocialOrigin {
  kind: SocialOriginKind;
  refId?: string;
  planId?: string;
  planRevision?: number;
  planWindowId?: string;
}
export type SocialDecisionKind = "reply" | "like" | "follow" | "quote" | "repost" | "original_post" | "no_op";
export type SocialDecisionConfidence = "low" | "medium" | "high";
export interface SocialDecision {
  id: string;
  agentId: string;
  presenceId: string;
  environment: PresenceEnvironment;
  focalMirrorObjectIds: string[];
  origin?: SocialOrigin;
  decision: SocialDecisionKind;
  summary: string;
  influences: string[];
  confidence?: SocialDecisionConfidence;
  closestAlternative?: SocialDecisionKind;
  closestAlternativeReason?: string;
  socialIntentId?: string;
  plannerRunId?: string;
  createdAt: string;
}
export type PublishingInitiativeStatus = "idle" | "seeking" | "awaiting_review" | "blocked" | "at_pace";
export interface PublishingInitiativeProgress {
  mode: PublishingInitiativeMode;
  period: PublishingInitiativePeriod;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  target?: number;
  verifiedOriginals: number;
  remaining?: number;
  status: PublishingInitiativeStatus;
}
export type AssignmentPeriodStatus = "open" | "at_cap" | "satisfied" | "below_target" | "expired" | "blocked";
export interface AssignmentPeriod {
  id: string;
  assignmentId: string;
  startAt: string;
  endAt: string;
  status: AssignmentPeriodStatus;
  verifiedProgress: number;
  createdAt: string;
  closedAt?: string;
}
export interface AssignmentContract {
  objective: string;
  deliverable: string;
  successEvidence: string;
  timing?: string;
  agentDecides: string[];
  hardConstraints: string[];
  assumptions: string[];
}
export interface AssignmentReadinessCheck {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}
export interface AssignmentPreflight {
  status: AssignmentPreflightStatus;
  delegationPolicy: AssignmentDelegationPolicy;
  semanticSummary: string;
  contract?: AssignmentContract;
  checks: AssignmentReadinessCheck[];
  issues: string[];
  reviewedAt: string;
  reviewedRevision: number;
}
export interface PresenceContext { presenceId: string; channel: ChannelId; language?: PresenceLanguage; publicIdentity: { displayName: string; handle?: string; mode: PresenceMode }; publicSelf: PublicSelf; brief: PresenceBrief; audienceContext?: string; voiceAdaptation?: string; availableAffordances: string[]; relevantRelationshipContext?: string; publicFooting?: PublicFooting; ghostProfile?: GhostProfile; publishingInitiative?: PublishingInitiative; }
export type PresencePacing = "recommended" | "gentle" | "custom";
export interface PresenceQuietHours { enabled: boolean; start: string; end: string; }
export interface Presence { id: string; channel: ChannelId; name: string; handle: string; mode: PresenceMode; status: "live" | "paused" | "disconnected"; accent: string; capabilities: ChannelCapability[]; execution: Record<string, ExecutionMode>; executionEnvelope: ExecutionEnvelope; context: PresenceContext; brief: PresenceBrief; publicSelf: PublicSelf; mediaPerceptionPolicy: MediaPerceptionPolicy; evidencePolicy?: "use-judgment" | "review-uncertain" | "always-review"; language?: PresenceLanguage; languagePolicy: LanguagePolicy; ghostProfile?: GhostProfile; pacing: PresencePacing; attentionIntervalMinutes: number; quietHours: PresenceQuietHours; publishingInitiative: PublishingInitiative; accountHealth: "healthy" | "elevated"; environment?: PresenceEnvironment; connectionMode?: PresenceConnectionMode; browserAccess?: PresenceBrowserAccess; }

export interface ChatMessage { id: string; role: "agent" | "operator"; content: string; timestamp: string; change?: string; }
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[]; }
export interface PresenceChatAttachment {
  id: string;
  name: string;
  kind: SocialAssetKind;
  mimeType?: string;
  dataUrl?: string;
  sourceUrl?: string;
  perception?: {
    observation: string;
    interpretation?: string;
    uncertainty: PerceptionUncertainty;
    missingContext?: string[];
    providerId?: string;
  };
}
export interface PresenceChatMessage { id: string; role: "presence" | "user"; content: string; timestamp: string; attachments?: PresenceChatAttachment[]; replyToMessageId?: string; }
export interface PresenceChatSession { id: string; presenceId: string; title: string; createdAt: string; updatedAt: string; messages: PresenceChatMessage[]; }
export interface ChangeSetOperation { path: string; action: "create" | "update" | "delete"; before?: JsonValue; after?: JsonValue; }
export interface ChangeSet { id: string; agentId: string; conversationId?: string; summary: string; operations: ChangeSetOperation[]; createdAt: string; }
export interface StandingIntent { id: string; agentId: string; presenceId?: string; instruction: string; trigger: { type: "schedule" | "event"; config: { day?: string; time?: string; event?: string } }; objective?: string; quality: { skipIfNothingWorthSaying: boolean }; executionWindow?: { startsAt?: string; endsAt?: string }; status: "active" | "paused"; createdAt: string; updatedAt: string; }
export interface EntityRef { type: string; id: string; }
export type PublicExpressionArtifactKind = "agent_model" | "operator_manual" | "test_stub" | "operational";
export type PublicExpressionModelMode = "real" | "mock" | "test_stub";
export type PublicExpressionSafetyStatus = "candidate" | "sealed" | "blocked";
export interface PublicExpression {
  id: string;
  agentId: string;
  presenceId: string;
  environment: PresenceEnvironment;
  socialIntentId: string;
  channel: ChannelId;
  affordance: string;
  text: string;
  mediaIds: string[];
  provenance: {
    cognitionPurpose: "public_expression";
    artifactKind: PublicExpressionArtifactKind;
    modelMode: PublicExpressionModelMode;
    provider: string;
    model: string;
    expressionRunId: string;
  };
  safetyStatus: PublicExpressionSafetyStatus;
  payloadHash?: string;
  createdAt: string;
}
export interface ExecutionPermit {
  executionId: string;
  publicExpressionId: string;
  presenceId: string;
  environment: "live";
  channel: string;
  affordance: string;
  payloadHash: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
}
export interface Publication { id: string; format: string; payload: JsonValue; assetIds: string[]; links: { url: string; label?: string }[]; publicExpression?: PublicExpression; expressionMode?: ExpressionMode; groundingStatus?: GroundingStatus; factuality?: Factuality; assetReuse?: { usageType: AssetUsageType; reason: string }; operatorOverride?: { operatorId?: string; reason: string; at: string }; origin?: SocialOrigin; createdAt: string; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; assignmentId?: string; invocationId?: string; }
export interface SocialIntentPersonReference { candidateId: string; personId?: string; purpose: "recommendation" | "introduction_offer" | "introduction_request" | "contextual_reference"; }
export interface OperatorDirective { id: string; agentId: string; presenceId: string; target: EntityRef; requiredAct: "reply" | "no_op"; optionalDirection?: string; provenance: "operator"; initialAct: "no_op"; status: "requested" | "expressed" | "failed"; environment?: PresenceEnvironment; sessionId?: string; createdAt: string; }
export interface SocialIntent { id: string; agentId: string; presenceId: string; affordance: string; target?: EntityRef; publicationId?: string; priority: number; validity: { expiresAt?: string; staleAfterMs?: number }; state: "active" | "withdrawn" | "expired"; formedAt: string; updatedAt: string; standingIntentId?: string; assignmentId?: string; conversationEpisodeId?: string; origin?: SocialOrigin; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; invocationId?: string; referencedPeople?: SocialIntentPersonReference[]; networkReason?: string; source?: "agent" | "operator"; operatorDirectiveId?: string; }
export interface Execution { id: string; socialIntentId: string; presenceId: string; affordance: string; mode: Exclude<ExecutionMode, "off">; status: ExecutionStatus; attempts: number; bridgeId?: string; connector?: ConnectorKind; idempotencyKey: string; target?: EntityRef; publication?: Publication; permit?: ExecutionPermit; lease?: { executorId: string; claimedAt: string; expiresAt: string }; externalRef?: EntityRef; failure?: { code?: string; message: string; retryable?: boolean }; reviewReason?: string; createdAt: string; updatedAt: string; executedAt?: string; assignmentId?: string; conversationEpisodeId?: string; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; invocationId?: string; source?: "agent" | "operator"; operatorDirectiveId?: string; }
export interface Outcome { id: string; socialIntentId: string; executionId?: string; presenceId: string; status: "succeeded" | "failed" | "unknown"; observedAt: string; metrics: Record<string, number>; evidence?: EntityRef[]; environment?: PresenceEnvironment; sessionId?: string; conversationEpisodeId?: string; }

export interface ConversationEpisode {
  id: string;
  agentId: string;
  presenceId: string;
  environment: PresenceEnvironment;
  channelId: ChannelId;
  surface: string;
  privacyScope: VisibilityScope;
  rootMirrorObjectId?: string;
  branchAnchorMirrorObjectId?: string;
  participantActorIds: string[];
  linkedEpisodeIds: string[];
  status: ConversationEpisodeStatus;
  lastDisposition?: ConversationDisposition;
  lastDispositionReason?: string;
  unresolvedItems?: string[];
  lastMeaningfulDevelopment?: string;
  lastExternalObjectId?: string;
  lastAgentObjectId?: string;
  agentTurnCount: number;
  externalTurnCount: number;
  loopRisk?: { detectedAt: string; reason: string };
  nextEligibleAt?: string;
  eligibilityReason?: string;
  closingSocialIntentId?: string;
  closedAt?: string;
  closureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentContribution {
  id: string;
  assignmentId: string;
  conversationEpisodeId: string;
  engagementEpisodeId?: string;
  deliverableKind: string;
  counted: boolean;
  sharedEvidence: boolean;
  verifiedOutcomeIds: string[];
}

export interface Assignment {
  id: string;
  agentId: string;
  presenceId: string;
  sessionId?: string;
  channelId: ChannelId;
  environment: PresenceEnvironment;
  title?: string;
  origin?: AssignmentOrigin;
  activation?: AssignmentActivation;
  instruction: string;
  deliverable: { type: AssignmentDeliverableType; quantity?: number; quantityMode?: AssignmentQuantityMode };
  quantityPolicy?: { quantity?: number | "agent_planned"; mode: AssignmentQuantityMode; period?: "day" | "week" | "assignment"; timezone?: string };
  periods?: AssignmentPeriod[];
  recurrence?: { kind: "once" | "daily" | "weekdays" | "weekly"; label?: string };
  schedule?: { day: string; time: string; executionWindow: string };
  timeframe?: { startsAt?: string; deadline?: string };
  editorialContext?: { topics?: string[]; sources?: string[]; constraints?: string[] };
  audienceObjective?: string;
  objective?: string;
  successEvidence?: { kind: "metric_threshold"; metric: string; comparator: AssignmentMetricComparator; value: number; label?: string };
  plan?: AssignmentPlan;
  planHistory?: AssignmentPlan[];
  executionPolicy: { usePresenceEnvelope: boolean; delegationPolicy?: AssignmentDelegationPolicy };
  preflight?: AssignmentPreflight;
  status: AssignmentStatus;
  revision?: number;
  progress: { required: number; verified: number };
  rejectedCandidates: number;
  systemFailures: number;
  work?: {
    phase: AssignmentWorkPhase;
    attempts: number;
    maxAttempts: number;
    storiesResearched: number;
    lastAttemptAt?: string;
    blockedReason?: string;
  };
  attemptHistory?: Array<{
    id: string;
    attempt: number;
    phase: AssignmentWorkPhase;
    outcome: AssignmentOutcomeClass;
    message: string;
    at: string;
  }>;
  storyResearch?: Array<{
    query: string;
    resultCount: number;
    sources: Array<{ title?: string; url?: string; publisher?: string; excerpt?: string }>;
    at: string;
  }>;
  lastOutcome?: { class: AssignmentOutcomeClass; message: string; at: string };
  completionReport?: string;
  lastEvaluatedAt?: string;
  nextDueAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** One durable, bounded worker execution for an operator-owned Assignment. */
export interface AssignmentRun {
  id: string;
  assignmentId: string;
  agentId: string;
  presenceId: string;
  sessionId: string;
  status: AssignmentRunStatus;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  currentStage?: AssignmentWorkPhase;
  attempts: number;
  maxAttempts: number;
  rejectedCandidates: number;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxEnvironment { id: string; presenceId: string; channelId: ChannelId; connectorId: string; status: "ready" | "active" | "paused" | "error"; createdAt: string; updatedAt: string; }
export interface PlaygroundSession { id: string; environmentId: string; presenceId: string; channelId: ChannelId; source: "fresh" | "scenario" | "replay"; status: "ready" | "active" | "paused" | "completed"; virtualNow: string; virtualTimeMode?: "realtime" | "manual"; worldRevision?: number; createdAt: string; updatedAt: string; evaluatedSlotIds: string[]; judgedObjectIds?: string[]; scenarioRunId?: string; scenarioVersionId?: string; }
export type ScenarioOwnerScope = "system" | "agent" | "presence";
export type ScenarioSource = "builtin" | "natural_language" | "import";
export type ScenarioStimulusOrigin = "built_in" | "generated" | "operator" | "imported";
export type ScenarioStimulusTrust = "untrusted_world_content";
export type ScenarioStimulusFidelity = "verified" | "unverified";
export type ScenarioLanguageRequirement = "forbidden" | "allowed" | "required";
export type ScenarioRealism = "mild" | "realistic" | "severe";
export type ScenarioRunStatus = "active" | "completed" | "abandoned" | "failed";
export interface ScenarioActor { id: string; displayName: string; handle?: string; role?: SandboxActor["role"]; profile?: SandboxActorProfile; }
export interface ScenarioStimulusRequirements {
  hostility?: boolean;
  profanity?: ScenarioRealism | "none";
  explicitLanguage?: ScenarioLanguageRequirement;
  explicitLanguageMinimum?: number;
  directChallengeMinimum?: number;
  disagreement?: boolean;
  sarcasm?: boolean;
  personalAttack?: boolean;
  repeatedProvocation?: boolean;
  escalatingRudeness?: boolean;
  privacyPressure?: boolean;
  promptInjection?: boolean;
  publicationSecurity?: boolean;
  pileOn?: boolean;
  syntheticSecrets?: string[];
  realism?: ScenarioRealism;
}
export interface ScenarioStimulus {
  id: string;
  sequence: number;
  offsetMinutes?: number;
  type: string;
  actorRef: string;
  targetRef?: string;
  content: string;
  /** Language of the simulated world content, used by targeted execution gates. */
  language?: string;
  assets?: SandboxAssetInput[];
  origin?: ScenarioStimulusOrigin;
  trust?: ScenarioStimulusTrust;
  fidelity?: ScenarioStimulusFidelity;
}
export interface ScenarioWorldSpec { startingWorld?: { description?: string; actors?: ScenarioActor[] }; stimuli: ScenarioStimulus[]; stimulusRequirements?: ScenarioStimulusRequirements; }
export interface ScenarioCriterion { id: string; label: string; description: string; severity?: "low" | "medium" | "high" | "critical"; }
export interface ScenarioEvaluationSpec { purpose: string; structuralCriteria: ScenarioCriterion[]; socialCriteria: ScenarioCriterion[]; }
export interface ScenarioRunPolicy { maxSteps: number; maxDurationMinutes: number; }
export interface ScenarioFidelityCheck { id: string; label: string; status: "met" | "missing" | "uncertain"; evidenceRefs: string[]; explanation: string; }
export interface ScenarioFidelityReport { status: "verified" | "needs_revision"; checks: ScenarioFidelityCheck[]; validatorVersion: string; validatedAt: string; }
export interface ScenarioVersion { id: string; scenarioId: string; version: number; worldSpec: ScenarioWorldSpec; evaluationSpec: ScenarioEvaluationSpec; runPolicy: ScenarioRunPolicy; source: ScenarioSource; sourcePrompt?: string; fidelity?: ScenarioFidelityReport; generationStatus?: "ready" | "failed"; generationError?: string; createdAt: string; }
export interface Scenario { id: string; ownerScope: ScenarioOwnerScope; agentId?: string; presenceId?: string; currentVersionId: string; title: string; description: string; purpose: string; riskCategories: string[]; requiredChannelCapabilities: string[]; supportedChannels?: ChannelId[]; createdAt: string; updatedAt: string; }
export interface ScenarioRunProvenance { id: string; agentId: string; presenceId: string; channelId: ChannelId; scenarioId: string; scenarioVersionId: string; model?: Pick<AgentModelProfile, "provider" | "model" | "quality">; meaningRevisions: Partial<Record<FileKind, number>>; meaningHashes: Partial<Record<FileKind, string>>; presenceContextHash: string; executionEnvelopeHash: string; channelDefinitionHash: string; runtimeVersion: string; virtualClockOrigin: string; createdAt: string; }
export interface StructuralFinding { id: string; criterionId: string; status: "pass" | "fail"; evidenceRefs: string[]; explanation: string; checkerVersion: string; }
export interface ModelReviewFinding { id: string; criterionId: string; status: "satisfied" | "uncertain" | "violated"; severity?: "low" | "medium" | "high" | "critical"; evidenceRefs: string[]; explanation: string; }
export interface ScenarioRunEvaluation { id: string; runId: string; status: "passed" | "needs_review" | "failed" | "unavailable"; structuralFindings: StructuralFinding[]; modelFindings: ModelReviewFinding[]; fidelity?: ScenarioFidelityReport; reviewer?: { provider?: string; model?: string; quality?: string; promptVersion: string; reviewedAt: string; retryCount: number }; operatorReview?: { disposition: "accepted" | "okay" | "concern"; note?: string; reviewedAt: string }; createdAt: string; updatedAt: string; }
export interface ScenarioRun { id: string; scenarioId: string; scenarioVersionId: string; agentId: string; presenceId: string; playgroundSessionId: string; status: ScenarioRunStatus; nextStimulusIndex: number; startedAt: string; completedAt?: string; provenanceId: string; evaluationId?: string; }
export interface SandboxActorProfile {
  bio?: string;
  location?: string;
  roles?: string[];
  skills?: string[];
  introductionPermission?: "allowed" | "ask-first" | "not-available";
}
export interface SandboxActor { id: string; sessionId: string; displayName: string; handle?: string; role: "audience" | "operator" | "community"; profile?: SandboxActorProfile; createdAt: string; }
export interface SandboxNetworkCandidate { actorId: string; displayName: string; handle?: string; permission: "allowed" | "ask-first" | "not-available"; evidence: string[]; score: number; }
export interface SandboxNetworkSearch { id: string; sessionId: string; presenceId: string; query: string; status: "matches" | "no-match" | "insufficient-evidence"; candidates: SandboxNetworkCandidate[]; limitation?: string; createdAt: string; }
export interface SandboxNetworkIntroduction { id: string; searchId: string; sessionId: string; presenceId: string; candidateActorId: string; status: "proposed" | "awaiting-consent" | "approved" | "declined" | "executing" | "succeeded" | "failed"; socialIntentId?: string; executionId?: string; createdAt: string; updatedAt: string; }
export type PreferenceReaction = "fits" | "does_not_fit" | "good_silence" | "expected_action";
export type PreferenceReason = "idea" | "voice" | "topic" | "humor" | "format" | "technical_depth" | "too_generic" | "too_promotional" | "too_long" | "too_risky" | "factually_wrong" | "not_something_i_would_say" | "other";
export interface PreferenceEvidence { id: string; agentId: string; presenceId?: string; sessionId: string; source: "playground_publication" | "playground_no_op" | "chat_calibration" | "operator_explicit"; subjectRef: { type: "publication" | "decision"; id: string }; reaction: PreferenceReaction; reasons?: PreferenceReason[]; note?: string; scopeHint: "agent" | "presence" | "unknown"; environment: "sandbox"; createdAt: string; }
export interface OriginalPostRehearsalAttempt { id: string; sessionId: string; presenceId: string; triggeredAt: string; completedAt?: string; stimulus: { type: "none" | "text"; value?: string }; result: "running" | "published" | "review" | "manual" | "no_op" | "research" | "failed"; publicationId?: string; executionId?: string; preferenceEvidenceIds?: string[]; }
export interface LibrarySource { id: string; agentId: string; type: "local-folder" | "remote" | "url-collection" | "content-drop"; location: string; access: "read"; status: "available" | "indexing" | "failed"; }
export interface Asset { id: string; agentId: string; sourceId?: string; presenceId?: string; sessionId?: string; type: "image" | "video" | "gif" | "audio" | "pdf" | "document" | "chart" | "link"; mediaKind?: AssetMediaKind; semanticKind?: AssetSemanticKind; storagePath?: string; dataUrl?: string; checksum?: string; storage?: { storeKey: string; mimeType: string; byteSize: number; exactHash: string; perceptualHash?: string }; status: "queued" | "processing" | "ready" | "failed"; provenance: { origin: AssetOrigin | string; sourceUrl?: string; sourcePageUrl?: string; canonicalSourcePage?: string; publisher?: string; author?: string; publishedAt?: string; retrievedAt?: string; acquisitionProvider?: string; importedAt: string; sourceIdentityStatus?: SourceIdentityStatus }; perception?: { observation: string; likelyMeaning?: string; visibleText?: string[]; chartSeries?: string[]; dataThrough?: string; uncertainty?: string[] }; rights?: { status: RightsStatus; evidence?: string[] }; nature?: AssetNature; lineage?: { parentAssetIds: string[]; transformation?: string }; mimeType?: string; sizeBytes?: number; dimensions?: { width: number; height: number }; durationMs?: number; description?: string; topics?: string[]; transcript?: string; usageNotes?: string; visibility?: VisibilityScope; shareability?: Shareability; environment?: PresenceEnvironment; createdAt: string; updatedAt: string; }
export interface AssetUsage { id: string; assetId: string; agentId: string; presenceId: string; publicationId: string; socialIntentId?: string; assignmentId?: string; channelId: ChannelId; environment: PresenceEnvironment; usageType: AssetUsageType; reuseReason?: string; publishedAt: string; }
export interface EvidenceNeed { question: string; mustShow?: string[]; preferredForms?: AssetSemanticKind[]; freshness?: "current" | "recent" | "historical" | "any"; }
export type VisualImportance = "none" | "helpful" | "important" | "required";
export type VisualPurpose = "evidence" | "explanation" | "illustration" | "attention";
export interface VisualNeed { importance: VisualImportance; purpose?: VisualPurpose; description?: string; }
export interface VisualBrief { role: VisualRole; mustShow?: string[]; preferredForms?: AssetSemanticKind[]; avoidForms?: AssetSemanticKind[]; rationale?: string; }
export interface StoryCandidate { trigger?: string; whyNow?: string; claim?: string; evidenceNeed?: EvidenceNeed; visualNeed?: VisualNeed; visualBrief?: VisualBrief; }
export interface AssetCandidate { id: string; query: string; name: string; mediaUrl?: string; sourcePageUrl?: string; title?: string; description?: string; publisher?: string; author?: string; publishedAt?: string; provider: string; relevance?: number; /** Search metadata is a lead, never the inspected visual classification. */ searchMetadataSemanticHint?: AssetSemanticKind; semanticKind?: AssetSemanticKind; pageContext?: string; assetPublisher?: string; underlyingDataSource?: string; isHeroImage?: boolean; isThumbnail?: boolean; perception?: PerceptionResult; }
export interface AssetDiscoveryProvider { id: string; searchAssets(request: { query: string; semanticKind?: AssetSemanticKind; limit?: number }): Promise<AssetCandidate[]>; }
export interface SourceEvidence { id: string; canonicalUrl: string; publisher?: string; author?: string; publishedAt?: string; retrievedAt: string; acquisitionProvider: string; title?: string; excerpt?: string; assetIds: string[]; assetPublisher?: string; underlyingDataSource?: string; lineage?: { assetUrl?: string; sourcePageUrl?: string; dataSourceUrl?: string; relationship: "same_source" | "secondary_visualization" | "unknown" }; }

export interface AssetResearchCandidate { id: string; candidate: AssetCandidate; assetId?: string; perception?: PerceptionResult; sourceEvidenceId?: string; decision?: AssetResearchDecision; rejectionReasons?: string[]; }
export type AssetResearchOutcome = "discovery_empty" | "fetch_failed" | "inspection_rejected" | "editorial_rejected";
export interface AssetResearchSession { id: string; agentId: string; presenceId: string; sessionId: string; assignmentId?: string; assignmentRunId?: string; invocationId?: string; status: "researching" | "selected" | "search_again" | "text_only" | "replanned" | "failed"; outcome?: AssetResearchOutcome; storyCandidate?: StoryCandidate; evidenceNeed?: EvidenceNeed; visualNeed?: VisualNeed; visualBrief?: VisualBrief; searchHistory: Array<{ query: string; attempt: number; resultCount: number; createdAt: string }>; candidates: AssetResearchCandidate[]; selectedCandidateId?: string; decisionHistory: Array<{ decision: AssetResearchDecision; rationale?: string; candidateId?: string; createdAt: string }>; recentVisualAssetIds?: string[]; createdAt: string; updatedAt: string; }
export interface ClaimGrounding { id: string; publicationId: string; claim: string; claimType: "factual" | "interpretation" | "opinion" | "fictional" | "satirical"; sourceEvidenceIds: string[]; assetIds: string[]; status: GroundingStatus; uncertainty?: string; }
export interface Skill { id: string; name?: string; /** The instruction prompt that defines this reusable behavior. */ description: string; channels: ChannelId[]; requiresTools: string[]; compatibleFormats: string[]; }
export interface AgentSkill { id: string; agentId: string; skillId: string; enabled: boolean; }
export interface ContentDrop { id: string; agentId: string; origin: string; brief?: string; sourceIds: string[]; assetIds: string[]; suggestedUse?: string; suggestedWindow?: string; expiresAt?: string; status: "received" | "reviewed" | "used" | "ignored" | "expired"; createdAt: string; }

export type WatchKind = "creator" | "topic" | "opportunity";
export type WatchObservationStatus = "watching" | "manual" | "stale";
export interface Watch {
  id: string;
  agentId: string;
  presenceId: string;
  channel: ChannelId;
  kind: WatchKind;
  title: string;
  query: string;
  purpose?: string;
  observation: {
    status: WatchObservationStatus;
    source: "automatic" | "manual";
    observedCount: number;
    baseline: "not-started" | "building" | "ready";
    lastObservedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type ExplorationStatus = "active" | "paused" | "archived";
export type ExplorationCoverageStatus = "available" | "limited" | "unavailable";
export type ExplorationSessionStatus = "running" | "completed" | "degraded" | "failed";
export type ExplorationFindingStatus = "considering" | "surfaced" | "acted" | "no_op" | "blocked";
export type ExplorationEngagementMode = "surface" | "opportunistic" | "objective";

/** Operator meaning: Presence-scoped durable attention, not a query or permission. */
export interface ExplorationBrief {
  id: string;
  agentId: string;
  presenceId: string;
  channel: ChannelId;
  title: string;
  brief: string;
  interpretation: string;
  status: ExplorationStatus;
  revision: number;
  coverage: { status: ExplorationCoverageStatus; label: string; detail: string };
  engagement?: { mode: ExplorationEngagementMode; assignmentId?: string };
  lastLookedAt?: string;
  nextEligibleAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Cached Agent strategy. It may adapt; it cannot rewrite the operator brief. */
export interface DiscoveryPlan {
  id: string;
  explorationId: string;
  briefRevision: number;
  channel: ChannelId;
  surfaces: string[];
  directions: string[];
  exclusions: string[];
  source: "agent" | "fallback";
  generatedAt: string;
  expiresAt: string;
}

export interface ExplorationSession {
  id: string;
  explorationId: string;
  agentId: string;
  presenceId: string;
  environment: PresenceEnvironment;
  status: ExplorationSessionStatus;
  discoverySource: "mirror" | "native" | "bridge" | "unavailable";
  /** Exact connector query and Mirror objects attributed to this run. */
  searchQuery?: string;
  artifactIds?: string[];
  startedAt: string;
  completedAt?: string;
  candidatesSeen: number;
  candidatesHydrated: number;
  findingsCreated: number;
  findingIds: string[];
  failureReason?: string;
}

export interface ExplorationFinding {
  id: string;
  explorationId: string;
  sessionId: string;
  presenceId: string;
  mirrorObjectId: string;
  safeSummary: string;
  whyItMayMatter: string;
  status: ExplorationFindingStatus;
  createdAt: string;
  updatedAt: string;
  socialIntentId?: string;
}

export interface LiveEvent { id: string; type: "decision" | "execution" | "learning" | "memory" | "system"; title: string; detail: string; time: string; tone: EventTone; presenceId?: string; intentId?: string; executionId?: string; outcomeId?: string; decisionId?: string; sessionId?: string; invocationId?: string; sourceObjectId?: string; }
export interface CalendarSlot { id: string; label: string; instruction: string; day: string; time: string; objective: string; presence: string; mode: ExecutionMode; enabled: boolean; executionWindow: string; standingIntentId?: string; assignmentId?: string; lastEvaluatedAt?: string; }
export type PublicHistoryKind = "post" | "reply" | "quote" | "repost" | "thread" | "comment";
export interface PublicHistoryItem {
  id: string;
  presenceId: string;
  kind: PublicHistoryKind;
  channel: ChannelId;
  text?: string;
  authorAvatarUrl?: string;
  occurredAt: string;
  observedAt: string;
  externalRef: EntityRef;
  parentExternalRef?: EntityRef;
  executionId?: string;
  publicationId?: string;
  origin?: SocialOrigin;
  assetIds?: string[];
  environment?: PresenceEnvironment;
  externalUrl?: string;
  availability?: "available" | "deleted";
  metrics: Record<string, number>;
}
export interface ActivitySummary {
  current: { label: string; detail: string; tone: EventTone };
  lastPulseAt?: string;
  nextAttention: { label: string; detail: string };
  nextIntent: { label: string; detail: string };
  needsAttention: { count: number; label: string; detail: string };
  rhythm: { attention: string; publishing: string; replies: string; quietHours: string };
  publishingInitiative: PublishingInitiativeProgress;
  publishingPlan?: PublishingPlan;
}
/** Legacy projection kept for the first UI and older local databases. */
export interface ActionRecord { id: string; intent: "post" | "reply" | "like" | "repost" | "quote" | "follow" | "no_op"; target?: string; summary: string; status: "queued" | "review" | "executed" | "skipped" | "failed"; reason: string; createdAt: string; expiresAt?: string; socialIntentId?: string; executionId?: string; outcomeId?: string; sessionId?: string; }

export interface AgentWorkspaceSnapshot {
  onboarded: boolean; agent: Agent | null; presence: Presence | null; presences: Presence[]; activePresenceId: string | null;
  files: AgentFile[]; proposals: FileProposal[]; messages: ChatMessage[]; conversations: Conversation[]; activeConversationId: string | null; presenceChatSessions: PresenceChatSession[]; agentRequests: AgentRequest[]; capabilityChangeEvents: CapabilityChangeEvent[];
  events: LiveEvent[]; socialDecisions: SocialDecision[]; calendar: CalendarSlot[]; assignments: Assignment[]; growthReviews: GrowthReview[]; growthFileVersions: GrowthFileVersion[]; audienceSnapshots: PresenceAudienceSnapshot[]; publicationMetricSnapshots: PublicationMetricSnapshot[]; watches: Watch[]; explorations: ExplorationBrief[]; discoveryPlans: DiscoveryPlan[]; explorationSessions: ExplorationSession[]; explorationFindings: ExplorationFinding[]; actions: ActionRecord[]; publishingPlans: PublishingPlan[]; metrics: { qualifiedFollows: number; conversations: number; opportunitiesIgnored: number; audienceHealth: number };
  modelProfiles: AgentModelProfile[]; providerConnections: ProviderConnection[]; assetProviderConnections: AssetProviderConnection[]; toolBindings: AgentToolBinding[]; changeSets: ChangeSet[]; standingIntents: StandingIntent[]; operatorDirectives: OperatorDirective[]; socialIntents: SocialIntent[]; executions: Execution[]; outcomes: Outcome[]; publications: Publication[]; assetUsages: AssetUsage[]; sourceEvidence: SourceEvidence[]; claimGrounding: ClaimGrounding[]; preferenceEvidence: PreferenceEvidence[]; originalPostRehearsals: OriginalPostRehearsalAttempt[]; librarySources: LibrarySource[]; assets: Asset[]; perceptions: AssetPerception[]; assetResearchSessions: AssetResearchSession[]; skills: Skill[]; agentSkills: AgentSkill[]; contentDrops: ContentDrop[]; channelDefinitions: ChannelDefinition[]; nativeConnections: NativeChannelConnection[]; bridges: Bridge[]; mirrorObjects: MirrorObject[]; mirrorEvents: MirrorEvent[]; bridgeSync: BridgeSyncState[]; conversationEpisodes: ConversationEpisode[]; assignmentContributions: AssignmentContribution[]; people: Person[]; personIdentities: PersonIdentity[]; relationships: Relationship[]; relationshipFacts: RelationshipFact[]; relationshipOpenLoops: RelationshipOpenLoop[]; recommendationRecords: RecommendationRecord[]; introductionRecords: IntroductionRecord[]; sandboxEnvironments: SandboxEnvironment[]; playgroundSessions: PlaygroundSession[]; sandboxActors: SandboxActor[]; networkSearches: SandboxNetworkSearch[]; networkIntroductions: SandboxNetworkIntroduction[]; scenarios: Scenario[]; scenarioVersions: ScenarioVersion[]; scenarioRuns: ScenarioRun[]; scenarioRunProvenance: ScenarioRunProvenance[]; scenarioEvaluations: ScenarioRunEvaluation[]; knowledgeCollections: KnowledgeCollection[]; knowledgeItems: KnowledgeItem[]; knowledgeVersions: KnowledgeVersion[]; knowledgeSegments: KnowledgeSegment[]; presenceKnowledgeBindings: PresenceKnowledgeBinding[]; knowledgeRetrievalRuns: KnowledgeRetrievalRun[]; knowledgeCitations: KnowledgeCitation[];
  workspaceRevision?: number;
}

export interface OpenPresenceState extends AgentWorkspaceSnapshot {
  agents: Agent[]; activeAgentId: string | null; agentWorkspaces: AgentWorkspaceSnapshot[]; assignmentRuns?: AssignmentRun[];
}

export interface CreateAgentInput { name: string; description: string; audience?: string; mode: PresenceMode; handle: string; accent: string; }
export type ToolBindingOperation = { type: "setToolBinding"; toolId: string; provider?: ModelProvider; model?: string; connectionId?: string };
export type CapabilityOperation = { type: "setCapability"; capabilityId: AgentCapabilityId; enabled: boolean };
export type RuntimeOperation = Operation | ToolBindingOperation | CapabilityOperation;
export type KnowledgeOperation =
  | { type: "createKnowledgeCollection"; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }
  | { type: "updateKnowledgeCollection"; collectionId: string; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }
  | { type: "addKnowledgeItem"; collectionId: string; title: string; role?: KnowledgeRole; useOverride?: KnowledgeUse; sourceType: KnowledgeSourceType; content: string; mimeType?: string; originalDataUrl?: string; originalFileName?: string; originalAssetId?: string }
  | { type: "uploadKnowledgeVersion"; itemId: string; content: string; mimeType?: string; originalDataUrl?: string; originalFileName?: string; originalAssetId?: string }
  | { type: "setKnowledgeBinding"; presenceId: string; collectionId: string; maximumUse: KnowledgeUse; enabled?: boolean }
  | { type: "archiveKnowledgeItem"; itemId: string }
  | { type: "archiveKnowledgeCollection"; collectionId: string };
export interface CreatePresenceInput { channel: ChannelId; name?: string; handle: string; mode: PresenceMode; accent: string; channelDefinition?: ChannelDefinition; connectionMode?: PresenceConnectionMode; }
export type AssignmentOperation =
  | { type: "createAssignment"; instruction: string; presenceId?: string; sessionId?: string; environment?: PresenceEnvironment; schedule?: { day: string; time: string; executionWindow: string }; objective?: string; delegationPolicy?: AssignmentDelegationPolicy }
  | { type: "activateAssignment"; id: string; delegationPolicy?: AssignmentDelegationPolicy }
  | { type: "updateAssignmentPlan"; assignmentId: string; plan: Omit<AssignmentPlan, "id" | "assignmentId" | "revision" | "createdAt" | "updatedAt"> }
  | { type: "startAssignment"; id: string; sessionId: string }
  | { type: "workAssignment"; id: string; sessionId: string }
  | { type: "cancelAssignment"; id: string };
export type LanguagePolicyOperation =
  | { type: "setAgentLanguagePolicy"; policy: LanguagePolicy }
  | { type: "setPresenceLanguagePolicy"; policy: LanguagePolicy }
  | { type: "overrideLanguagePolicy"; id: string };
export type ScenarioOperation =
  | { type: "createScenarioFromPrompt"; prompt: string; presenceId?: string }
  | { type: "importScenario"; payload: JsonValue; presenceId?: string }
  | { type: "generateMissingScenarioEvents"; scenarioId: string }
  | { type: "updateScenarioEvents"; scenarioId: string; stimuli: ScenarioStimulus[] }
  | { type: "updateScenarioRequirements"; scenarioId: string; requirements: ScenarioStimulusRequirements }
  | { type: "renameScenario"; scenarioId: string; title: string }
  | { type: "deleteScenario"; scenarioId: string }
  | { type: "startScenarioRun"; scenarioId: string; presenceId?: string }
  | { type: "resumeScenarioRun"; runId: string }
  | { type: "stopScenarioRun"; runId: string }
  | { type: "rerunScenario"; runId: string }
  | { type: "evaluateScenarioRun"; runId: string }
  | { type: "recordScenarioReview"; runId: string; disposition: "accepted" | "okay" | "concern"; note?: string };
export type PublishingPlanOperation = { type: "replanPublishing"; presenceId?: string };
export type GrowthOperation =
  | { type: "recordAudienceSnapshot"; presenceId?: string; followers: number; following?: number; source?: MetricObservationSource; observationStatus?: PresenceAudienceSnapshot["observationStatus"]; observedAt?: string }
  | { type: "recordPublicationMetricSnapshot"; presenceId?: string; mirrorObjectId: string; publicationAgeSeconds?: number; metrics: Partial<Pick<PublicationMetricSnapshot, "impressions" | "likes" | "replies" | "reposts" | "quotes">>; source?: MetricObservationSource; observationStatus?: PublicationMetricSnapshot["observationStatus"] }
  | { type: "reviewGrowth"; assignmentId?: string; presenceId?: string; kind?: GrowthReviewKind; modelDecision?: GrowthReviewDecision };
export type AgentRequestOperation =
  | { type: "updateAgentRequest"; id: string; status: AgentRequestStatus }
  | { type: "recordCapabilityChange"; presenceId: string; changes: Array<Pick<CapabilityChangeEvent, "capability" | "previousAvailability" | "nextAvailability" | "provider" | "detail">> };
export type ExplorationOperation =
  | { type: "createExploration"; brief: string; presenceId?: string }
  | { type: "updateExploration"; id: string; brief: string }
  | { type: "setExplorationStatus"; id: string; status: ExplorationStatus }
  | { type: "setExplorationEngagement"; id: string; mode: ExplorationEngagementMode; objective?: string }
  | { type: "lookNow"; id: string }
  | { type: "runAttentionWorker" };
export type BrowserOperation = { type: "setPresenceBrowserAccess"; presenceId?: string; enabled: boolean };
export type Operation = AssignmentOperation | LanguagePolicyOperation | ScenarioOperation | PublishingPlanOperation | GrowthOperation | AgentRequestOperation | ExplorationOperation
  | BrowserOperation
  | KnowledgeOperation
  | { type: "removeSandboxObject"; sessionId: string; objectId: string }
  | { type: "askPresenceToReply"; presenceId: string; objectId: string; sessionId?: string; optionalDirection?: string }
  | { type: "importXPost"; presenceId: string; url: string }
  | { type: "removeLegacyCalendarEntries" }
  | { type: "askPresenceToIgnore"; presenceId: string; objectId: string; sessionId?: string }
  | { type: "reset" } | { type: "createAgent"; input: CreateAgentInput } | { type: "createAdditionalAgent"; input: CreateAgentInput } | { type: "selectAgent"; id: string } | { type: "renameAgent"; name: string } | { type: "createPresence"; input: CreatePresenceInput } | { type: "createChannel"; definition: ChannelDefinition } | { type: "updateChannel"; definition: ChannelDefinition } | { type: "createBridge"; input: { presenceId: string; name: string; kind: ConnectorKind; capabilities: ConnectorCapabilities } } | { type: "rotateBridgeKey"; id: string } | { type: "revokeBridge"; id: string } | { type: "removeBridge"; id: string } | { type: "markManualExecution"; id: string; externalRef: EntityRef } | { type: "selectPresence"; id: string } | { type: "selectConversation"; id: string } | { type: "newConversation" } | { type: "sendMessage"; content: string; conversationId?: string } | { type: "newPresenceChatSession"; presenceId: string } | { type: "sendPresenceChatMessage"; presenceId: string; sessionId: string; content: string; attachments?: SandboxAssetInput[]; replyToMessageId?: string } | { type: "saveFile"; kind: FileKind; content: string } | { type: "resolveProposal"; id: string; decision: "approve" | "reject" } | { type: "addSlot"; instruction: string; day: string; time: string; objective: string; executionWindow: string; presenceId?: string } | { type: "editSlot"; id: string; instruction: string; day: string; time: string; objective: string; executionWindow: string; presenceId?: string } | { type: "runNow"; instruction: string; presenceId?: string } | { type: "createWatch"; query: string; purpose?: string; presenceId?: string } | { type: "deleteWatch"; id: string } | { type: "rememberPerson"; personId?: string; presenceId?: string; channel?: ChannelId; externalActorId: string; displayName: string; handle?: string; profileUrl?: string; source?: "operator" | "current-context" | "watched" } | { type: "forgetRelationship"; relationshipId: string } | { type: "restoreRelationship"; relationshipId: string } | { type: "correctRelationshipFact"; factId?: string; relationshipId: string; statement: string; visibility?: RelationshipVisibility } | { type: "createIntroductionRecord"; presenceId?: string; requesterPersonId?: string; requesterActorId?: string; candidatePersonId?: string; candidateActorId?: string; sourceIntentIds?: string[] } | { type: "respondIntroductionConsent"; id: string; party: "requester" | "candidate"; consent: boolean } | { type: "createSkill"; name: string; description: string } | { type: "editSkill"; id: string; name: string; description: string } | { type: "configureProvider"; provider: ModelProvider; label: string; endpoint?: string; hasSecret?: boolean; secret?: string } | { type: "configureAssetProvider"; provider: AssetProviderConnection["provider"]; label: string; endpoint?: string; secretConfigured?: boolean; hasSecret?: boolean; secret?: string; createdAt?: string } | { type: "disconnectAssetProvider"; provider: AssetDiscoveryProviderId } | { type: "wakePresence"; presenceId?: string } | { type: "runPulse"; presenceId?: string } | { type: "syncNativeX"; presenceId?: string } | { type: "setModel"; model: string; provider?: ModelProvider; quality?: ModelQuality; vision?: boolean } | { type: "runSlot"; id: string; scheduled?: boolean } | { type: "approveExecution"; id: string } | { type: "executeIntent"; id: string } | { type: "confirmAutoMode"; presenceId: string; capabilities: string[]; executionIds: string[] } | { type: "approveSandboxIntroduction"; id: string } | { type: "declineSandboxIntroduction"; id: string } | { type: "setPresence"; patch: Partial<Pick<Presence, "name" | "handle" | "mode" | "status" | "pacing" | "attentionIntervalMinutes" | "quietHours" | "publishingInitiative" | "execution" | "ghostProfile" | "connectionMode" | "brief" | "publicSelf" | "mediaPerceptionPolicy" | "language">> } | { type: "startPlayground"; presenceId?: string; source?: "fresh" | "scenario" | "replay" } | { type: "syncPlaygroundTime"; sessionId: string } | { type: "resetPlayground"; sessionId: string } | { type: "inspectMirrorMedia"; presenceId: string; objectId: string } | { type: "inspectSandboxMedia"; sessionId: string; objectId: string } | { type: "addSandboxEvent"; sessionId: string; kind?: string; actionId?: string; actorId?: string; actorName?: string; actorHandle?: string; profile?: SandboxActorProfile; content?: string; language?: string; assets?: SandboxAssetInput[]; targetExternalRef?: EntityRef; parentExternalRef?: EntityRef; observeOnly?: boolean } | { type: "advanceSandboxTime"; sessionId: string; minutes: number } | { type: "runSandboxPulse"; sessionId: string } | { type: "considerOriginalPublication"; sessionId: string; inspiration?: string } | { type: "recordPreferenceEvidence"; sessionId: string; attemptId: string; reaction: PreferenceReaction; reasons?: PreferenceReason[]; note?: string };
