export type View = "teach" | "knowledge" | "assets" | "usage" | "chat" | "rehearsal" | "watching" | "people" | "playground" | "live" | "feed" | "growth" | "calendar" | "schedule" | "brain" | "presence";
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
export type AssetAccessScope =
  | { mode: "all_agent_presences" }
  | { mode: "selected_presences"; presenceIds: string[] };
export type AssetReadiness = "ready" | "needs_review" | "unavailable" | "failed" | "processing";
export type AssetSourceAnalysisPolicy = "index-only" | "analyze-new" | "analyze-existing-and-new";
export type AssetSourceStatus = "available" | "indexing" | "paused" | "failed";
export type AssetMetadataReviewStatus = "open" | "resolved";
export type AssetProcessingJobStatus = "queued" | "running" | "completed" | "failed";
export type AssetResearchDecision = "select" | "search_again" | "render" | "text_only" | "replan";
export type PublicDisclosurePosture = "contextual" | "ai-forward" | "private" | "representational" | "open-about-assistance";
export type PublicTechnicalFact = "ai-presence" | "open-source" | "built-with-openpresence" | "model-provider" | "exact-model" | "tools";
export type ExecutionMode = "off" | "manual" | "review" | "auto";
export type ExecutionStatus = "awaiting-review" | "approved" | "awaiting-manual" | "awaiting-connector" | "queued" | "claimed" | "executing" | "verification-pending" | "verification-closed" | "succeeded" | "failed" | "blocked" | "cancelled" | "expired";
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
export interface PresenceBrowserFallback {
  /** Channel affordance, optionally qualified like `x.reply`. */
  action: string;
  /** The channel/provider reason that made native execution unsuitable. */
  reason: string;
  learnedAt: string;
}
export interface PresenceBrowserAccess {
  enabled: boolean;
  /** Durable per-action knowledge; this is a learned execution hint, not a channel route. */
  learnedFallbacks?: PresenceBrowserFallback[];
}

export interface PresenceDestination {
  handle?: string;
  accountExternalRef?: string;
  communityId?: string;
  displayName?: string;
  destinationUrl?: string;
}

export type AccessBindingKind = "native" | "managed_browser" | "user_attached_browser" | "external_bridge";

export type AccessBinding =
  | { kind: "native"; channel: ChannelId; status: "connected" | "needs-attention" | "disconnected" }
  | { kind: "managed_browser"; channel: ChannelId; profileDir?: string; status: "healthy" | "needs_auth" | "recovering" | "unstarted" }
  | { kind: "user_attached_browser"; channel: ChannelId; status: "connected" | "disconnected" }
  | { kind: "external_bridge"; channel: ChannelId; bridgeId?: string; status: "connected" | "disconnected" };

export type SelfDirectedAttentionIntensity = "quiet" | "balanced" | "curious" | "custom";
export type SelfDirectedAttentionDeferral = "deferred_priority" | "deferred_budget" | "deferred_provider_quota" | "deferred_body_unavailable" | "deferred_pacing" | "insufficient_context";
export interface AttentionAllocation {
  /** Soft share of the self-directed envelope available for initial discovery. */
  observationPercent?: number;
  /** Soft share available for candidate evaluation before action capacity is protected. */
  evaluationPercent?: number;
  /** Soft capacity held for qualified social action decisions. */
  actionReservePercent?: number;
}
export interface ResourceBudget {
  maxEstimatedCostCentsPerDay?: number;
  maxModelCallsPerDay?: number;
  maxVisionCallsPerDay?: number;
  maxChannelReadsPerDay?: number;
  maxHydrationsPerDay?: number;
}
export interface SelfDirectedAttentionPolicy {
  /** Compatibility projection; actual availability follows Presence status. */
  enabled: boolean;
  intensity: SelfDirectedAttentionIntensity;
  budget?: ResourceBudget;
  allocation?: AttentionAllocation;
  mediaUnderstanding: "when_needed" | "off";
  lastRunAt?: string;
  nextEligibleAt?: string;
  lastRunId?: string;
  /** Usage remains auditable; this epoch excludes earlier self-directed events from the active budget. */
  usageResetAt?: string;
}
export type ResourceUsageCategory = "model" | "vision" | "channel_read" | "channel_write" | "media_fetch" | "hydration";
export interface ResourceUsageEvent {
  id: string;
  agentId: string;
  presenceId?: string;
  invocationId: string;
  runId?: string;
  originKind: SocialOriginKind | "self_directed_discovery";
  originId?: string;
  attentionSource?: "self_directed_discovery" | "exploration" | "watchlist" | "inbound_social" | "assignment" | "publishing" | "relationship_research";
  category: ResourceUsageCategory;
  /** Provider operation or product affordance, when the caller can identify it. */
  action?: string;
  provider: string;
  model?: string;
  usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number; cacheReadTokens?: number; requests?: number; bytes?: number };
  cost?: { amount: number; currency: string; provenance: "reported" | "estimated" };
  quota?: { remaining?: number; resetsAt?: string; provenance: "reported" | "inferred" };
  createdAt: string;
  attentionEpisodeId?: string;
}
/**
 * Complete active-epoch usage for one Presence. This compact read model is
 * returned with Activity projections so budget UI never derives totals from a
 * truncated event timeline.
 */
export interface ActivityAttentionUsageSnapshot {
  selfDirected: { channelReads: number; modelCalls: number; visionCalls: number; hydrations: number };
  background: { channelReads: number; modelCalls: number; visionCalls: number; hydrations: number };
  limits: { channelReads: number; modelCalls: number; visionCalls: number; hydrations: number };
  left: { channelReads: number; modelCalls: number; visionCalls: number; hydrations: number };
  allocation: Required<AttentionAllocation>;
  observationCaps: { channelReads: number; modelCalls: number; visionCalls: number; hydrations: number };
  actionReservePercent: number;
  resetAt?: string;
}
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

// ============================================================================
// Operational Autonomy & Temporal Runtime Types (Phase 1)
// ============================================================================

export type OperationalRunState =
  | "queued"
  | "running"
  | "waiting"
  | "recovering"
  | "delivery_uncertain"
  | "reconciling"
  | "blocked"
  | "needs_operator"
  | "succeeded"
  | "failed"
  | "cancelled";

export type OperationalRunKind =
  | "attention"
  | "operator_chat"
  | "delivery"
  | "verification"
  | "observation"
  | "discovery"
  | "browser_recovery"
  | "runtime_recovery"
  | "reconsideration";

export type AttentionTrigger =
  | "scheduled_observation"
  | "self_directed"
  | "operator_check"
  | "operator_nudge"
  | "inbound_event"
  | "watch_judgment"
  | "assignment_due"
  | "recovery";

export type AttentionScope = "observe_inbound" | "judge_watches" | "broad" | "assignment" | "recovery";

export type AttentionRunDisposition =
  | "observed_no_change"
  | "judged_no_action"
  | "silence"
  | "verified"
  | "waiting_delivery"
  | "blocked_capability"
  | "expired_unfulfilled"
  | "failed"
  | "budget_exhausted";

export interface AttentionRunRequest {
  triggers: AttentionTrigger[];
  scope: AttentionScope;
  requestedAt: string;
  signalIds: string[];
  /** The connector already supplied authenticated evidence for this wake. */
  source?: "bridge";
}

export interface AttentionRunResult {
  disposition: AttentionRunDisposition;
  reasonCode?: string;
  summary: string;
  selectedActionCount: number;
  pendingExecutionCount: number;
  failedExecutionCount: number;
  verifiedOutcomeCount: number;
  completedAt?: string;
}

export interface OperationalRun {
  id: string;
  presenceId: string;
  kind: OperationalRunKind;
  sourceRef?: string;
  executionId?: string;
  invocationId?: string;
  runId?: string;
  state: OperationalRunState;
  stage: string;
  createdAt: string;
  eligibleAt?: string;
  startedAt?: string;
  lastProgressAt?: string;
  lastHeartbeatAt?: string;
  nextWakeAt?: string;
  deadlineAt?: string;
  expiresAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attemptCount: number;
  /** Human-readable reason when attemptCount is greater than one. */
  retryReason?: string;
  recoveryCount: number;
  incidentId?: string;
  blockedReason?: string;
  lastErrorCode?: string;
  dependencyRefs?: string[];
  metadata?: Record<string, JsonValue>;
  attentionEpisodeId?: string;
  attention?: AttentionRunRequest;
  result?: AttentionRunResult;
}

export type AttentionEpisodeStatus = "running" | "waiting" | "succeeded" | "failed" | "needs_operator";
export type AttentionEpisodeStage = "looking" | "choosing" | "acting" | "confirming" | "completed";
export type AttentionEpisodeSource = "scheduled" | "operator" | "inbound_social" | "self_directed_discovery" | "mixed";
export type AttentionEpisodeAction = "like" | "follow" | "reply" | "quote" | "repost";

export type AttentionStepKind = "queued" | "observing" | "searching" | "triaging" | "judging" | "acting" | "verifying" | "completed";
export interface AttentionStep {
  id: string;
  kind: AttentionStepKind;
  status: "pending" | "active" | "completed" | "failed";
  label: string;
  detail?: string;
  startedAt?: string;
  completedAt?: string;
  current?: number;
  total?: number;
  evidenceRefs?: EntityRef[];
}

/**
 * Operator-facing grouping for one coherent act of attention.
 *
 * ObservationRuns, DiscoveryRuns, model calls, executions, and verification
 * remain the durable machinery underneath. This record only gives them one
 * truthful, inspectable social episode for Activity and forensic audit.
 */
export interface AttentionEpisode {
  id: string;
  agentId: string;
  presenceId: string;
  channel: ChannelId;
  environment: PresenceEnvironment;
  source: AttentionEpisodeSource;
  status: AttentionEpisodeStatus;
  stage: AttentionEpisodeStage;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  summary?: string;
  lastError?: string;
  runIds: string[];
  mirrorObjectIds: string[];
  newMirrorObjectIds: string[];
  changedMirrorObjectIds: string[];
  socialDecisionIds: string[];
  socialIntentIds: string[];
  executionIds: string[];
  outcomeIds: string[];
  currentMirrorObjectId?: string;
  currentExecutionId?: string;
  steps?: AttentionStep[];
  fetchedCount: number;
  newCount: number;
  changedCount: number;
  knownCount: number;
  consideredCount: number;
  closeAttentionCount: number;
  noOpCount: number;
  actionCounts: Partial<Record<AttentionEpisodeAction, number>>;
  verifiedOutcomeCount: number;
  pendingExecutionCount: number;
  failedExecutionCount: number;
  resourceUsage: {
    channelReads: number;
    channelWrites: number;
    modelCalls: number;
    visionCalls: number;
    hydrations: number;
    mediaFetches: number;
    totalTokens?: number;
    estimatedCost?: number;
    currency?: string;
  };
}

export type ScheduledWakeKind =
  | "retry"
  | "verification"
  | "provider_reset"
  | "stale_check"
  | "deadline"
  | "recovery_cooldown"
  | "circuit_reopen"
  | "reconsideration"
  | "observation"
  | "attention"
  | "self_directed_discovery";

export interface ScheduledWake {
  id: string;
  presenceId?: string;
  wakeAt: string; // ISO UTC
  kind: ScheduledWakeKind;
  targetId?: string;
  payload?: Record<string, JsonValue>;
  state: "pending" | "dispatched" | "cancelled" | "failed";
  createdAt: string;
  updatedAt: string;
}

export type DependencyHealthState =
  | "healthy"
  | "degraded"
  | "recovering"
  | "waiting"
  | "circuit_open"
  | "unavailable"
  | "requires_operator";

export type DependencyHealthKind =
  | "runtime"
  | "native_x"
  | "managed_browser"
  | "user_attached_bridge"
  | "model_provider"
  | "database";

export interface DependencyHealth {
  id: string;
  presenceId?: string;
  dependency: DependencyHealthKind;
  state: DependencyHealthState;
  lastHealthyAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  circuitUntil?: string;
  currentIncidentId?: string;
  metadata?: Record<string, JsonValue>;
  updatedAt: string;
}

export type RecoveryIncidentState =
  | "open"
  | "recovering"
  | "waiting"
  | "needs_operator"
  | "resolved";

export interface RecoveryIncident {
  id: string;
  rootCauseKey: string;
  dependencyId: string;
  presenceId?: string;
  state: RecoveryIncidentState;
  openedAt: string;
  lastObservedAt: string;
  resolvedAt?: string;
  affectedRunIds: string[];
  currentRecoveryStep?: string;
  recoveryAttempts: number;
  nextAttemptAt?: string;
  safeSummary: string;
  operatorActionRequired: boolean;
  requiresAuth?: boolean;
  invocationId?: string;
  runId?: string;
  updatedAt: string;
}

export interface RecoveryAttempt {
  id: string;
  incidentId: string;
  attemptNumber: number;
  step: string;
  outcome: "succeeded" | "failed" | "deferred";
  error?: string;
  runId?: string;
  invocationId?: string;
  timestamp: string;
}

export type BrowserBodyState =
  | "stopped"
  | "starting"
  | "healthy"
  | "degraded"
  | "recovering"
  | "circuit_open"
  | "needs_auth";

export interface BrowserBody {
  presenceId: string;
  mode: "managed" | "user_attached";
  ownership: "openpresence" | "operator";
  state: BrowserBodyState;
  canOpenTabs: boolean;
  canCloseOwnedTabs: boolean;
  canRestartBrowser: boolean;
  canRestoreSession: boolean;
  expectedIdentity?: string;
  verifiedIdentity?: string;
  lastHealthyAt?: string;
  profileDir?: string;
  updatedAt: string;
}

export interface OperationalHealthCounts {
  activeIncidents: number;
  recoveringIncidents: number;
  waitingIncidents: number;
  needsOperatorIncidents: number;
  orphanRecoveringRuns: number;
}

export interface OperationalHealthSnapshot {
  now: string;
  status: "healthy" | "degraded" | "recovering" | "waiting" | "needs_you";
  summary: string;
  operatorAction?: { kind: "schedule" | "settings"; label: string };
  presenceId?: string;
  counts: OperationalHealthCounts;
  dependencyHealth: DependencyHealth[];
  incidents: Array<Pick<RecoveryIncident, "id" | "rootCauseKey" | "state" | "safeSummary" | "affectedRunIds" | "recoveryAttempts" | "nextAttemptAt" | "currentRecoveryStep" | "operatorActionRequired" | "requiresAuth"> & { lastObservedAt: string }>;
  activeRuns: Array<Pick<OperationalRun, "id" | "kind" | "state" | "stage" | "lastProgressAt" | "nextWakeAt" | "expiresAt" | "blockedReason" | "incidentId">>;
  dueWakeCount: number;
  browserBody?: BrowserBody;
  heartbeats: ProcessHeartbeat[];
}

export interface ProcessHeartbeat {
  processId: string;
  processType: "supervisor" | "runtime" | "browser_worker" | "scheduler";
  lastHeartbeatAt: string;
  metadata?: Record<string, JsonValue>;
}

export type AssignmentDelegationPolicy = "keep_moving" | "ask_before_change" | "stop_on_deviation";
export type AssignmentQuantityMode = "target" | "at_least" | "exact" | "at_most" | "minimum" | "maximum";
export type AssignmentOrigin = "schedule" | "exploration" | "watchlist" | "public_request" | "publishing_initiative" | "teach" | "manual" | "system" | "capability_trial";
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
  capabilitiesConsidered?: string[];
  stopConditions?: string[];
  evidenceNeeded?: string[];
  nextWeeklyReviewAt?: string;
  nextStrategicReviewAt?: string;
  source: "agent" | "operator";
  createdAt: string;
  updatedAt: string;
}
export type GrowthReviewKind = "weekly" | "strategic" | "event_driven";

export interface GrowthEvidenceSnapshot {
  id: string;
  presenceId: string;
  watermark: number;
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  sourceRefs: string[];
  metricAvailability: Record<string, boolean>;
  observedActivity: {
    posts: number;
    replies: number;
    quotes: number;
    likes: number;
    follows: number;
    totalActions: number;
  };
  observedOutcomes: {
    currentFollowers?: number;
    followerDelta?: number;
    topPostReach?: number;
    medianPostReach?: number;
    repliesWithResponses: number;
    activeRelationships: number;
  };
  baselineMaturity: {
    daysObserved: number;
    periodTargetDays: number;
    confidence: "low" | "medium" | "high";
  };
}

export interface GrowthRevision {
  id: string;
  presenceId: string;
  assignmentId: string;
  plan: AssignmentPlan;
  createdAt: string;
  previousRevisionRef?: string;
  causedByReviewRef: string;
}

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
  strategyChanged?: boolean;
  evidenceSnapshotId?: string;
  previousGrowthRevisionRef?: string;
  resultingGrowthRevisionRef?: string;
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
  strategyChanged?: boolean;
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
export type PresenceRequestAccess = "nobody" | "allowlist" | "anyone";
export type PublicRequestType = "answer" | "research" | "recommendation" | "introduction" | "content" | "other";
export type PublicRequestEligibility = "eligible" | "not_allowed" | "identity_unverified" | "addressing_required" | "unsupported";
export type PublicRequestDisposition = "pending" | "considering" | "needs_operator_review" | "accepted" | "declined" | "ignored" | "needs_clarification";
export interface PresenceRequestPolicy {
  presenceId: string;
  access: PresenceRequestAccess;
  allowedRequestTypes: PublicRequestType[];
  requireDirectAddress: boolean;
  acceptance: "operator_review" | "agent_autonomous";
  impactLimit: "low" | "moderate";
  updatedAt: string;
}
export interface DelegationGrant {
  id: string;
  agentId: string;
  presenceId: string;
  personId?: string;
  externalActorId?: string;
  channel: ChannelId;
  allowedRequestTypes: PublicRequestType[];
  enabled: boolean;
  acceptance: "operator_review" | "agent_autonomous";
  impactLimit: "low" | "moderate";
  createdBy: "operator";
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}
export interface PublicRequest {
  id: string;
  agentId: string;
  presenceId: string;
  channel: ChannelId;
  sourceMirrorObjectId: string;
  requesterPersonId?: string;
  requesterExternalActorId?: string;
  requestType: PublicRequestType;
  text: string;
  eligibility: PublicRequestEligibility;
  disposition: PublicRequestDisposition;
  policySource?: "presence" | "person_grant";
  policyRevisionAtEvaluation?: string;
  decisionReason?: string;
  assignmentId?: string;
  createdAt: string;
  updatedAt: string;
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
export type AssignmentDeliverableType = "original_publication" | "maintain_original_presence" | "meaningful_engagement" | "reply" | "like" | "public_interaction" | "introduction" | "quote" | "repost" | "message" | "decision_report" | "custom" | string;
export type AssignmentOutcomeClass = "candidate_rejected" | "action_no_op" | "assignment_blocked" | "assignment_completed" | "assignment_cancelled" | "evaluation_failed" | "delivery_failed" | "language_policy_failed" | "incomplete";
export type AssignmentWorkPhase = "researching" | "candidate_review" | "visual_research" | "publishing" | "blocked" | "completed";
export type AssignmentRunStatus = "queued" | "researching" | "selecting" | "writing" | "delivering" | "delivery_pending" | "published" | "deferred" | "blocked" | "failed" | "cancelled" | "superseded_stale";
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
  attentionEpisodeId?: string;
  attentionInvocationId?: string;
  attentionRunId?: string;
}

export interface EvidenceRef {
  kind: "mirror_object" | "conversation_event" | "connector_identity" | "community_directory" | "operator_input" | "publication" | "social_intent" | "conversation_episode" | "relationship" | "knowledge" | "growth_revision" | "presence_revision" | "assignment";
  id: string;
  sourcePresenceId?: string;
  observedAt?: string;
}

/** A factual, provenance-backed part of the Agent's own history. Interpretation
 * and public suitability deliberately live elsewhere. */
export type AutobiographicalEventKind =
  | "relationship_boundary"
  | "relationship_milestone"
  | "public_correction"
  | "agent_changed_mind"
  | "publication_outcome"
  | "audience_milestone";
export interface AutobiographicalEvent {
  id: string;
  agentId: string;
  presenceId: string;
  kind: AutobiographicalEventKind;
  counterpartyPersonId?: string;
  facts: Record<string, JsonValue>;
  evidenceRefs: EvidenceRef[];
  occurredAt: string;
  observedAt: string;
  createdAt: string;
}

/** A revisable Agent interpretation. New reflections supersede rather than
 * rewrite the factual event that prompted them. */
export interface AutobiographicalReflection {
  id: string;
  agentId: string;
  presenceId: string;
  eventId: string;
  supersedesReflectionId?: string;
  significance: "minor" | "meaningful" | "major";
  interpretation: string;
  possibleRelevance: string[];
  modelProvider?: string;
  modelId?: string;
  createdAt: string;
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

export interface PeopleNote {
  id: string;
  agentId: string;
  presenceId: string;
  personId: string;
  /** Markdown is intentionally flexible: the note is a human-readable primitive, not a rigid ledger. */
  markdown: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  provenance: { source: "operator" | "agent" | "system"; reason?: string; operationId?: string; updatedAt: string };
}

/** Operator-authored guidance for genuine private inbound messages. It is
 * context for social judgment, never executable code or a permission grant. */
export interface PresenceDMInstructions {
  when: "private_message_arrives";
  condition?: string;
  instructions: string;
  revision: number;
  updatedAt: string;
  provenance: { source: "operator" | "agent" | "system"; reason?: string; operationId?: string; updatedAt: string };
}

export type IdentitySourceKind =
  | "provider_profile"
  | "mirror_author"
  | "reply_target"
  | "structured_mention"
  | "operator";

export interface IdentityFactEvidence {
  kind: IdentitySourceKind;
  observedAt: string;
  detail?: string;
}

export type IdentityHydrationState = "unhydrated" | "partial" | "hydrated";

export type PersonContactabilityStatus = "available" | "blocked_by_person";
export interface PersonContactability {
  status: PersonContactabilityStatus;
  observedAt: string;
  source: "native_delivery" | "browser_delivery" | "verified_action";
  evidenceExecutionId?: string;
  reason?: string;
}

export interface IdentityHydrationLead {
  channel: ChannelId;
  possibleHandle?: string;
  possibleDisplayName?: string;
  sourceRef: string;
  observedAt: string;
}

export interface PersonIdentity {
  id: string;
  personId: string;
  channel: ChannelId;
  externalActorId: string;
  handle?: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  sourcePresenceId: string;
  /** Environment that established this identity. Legacy records are inferred during normalization. */
  sourceEnvironment?: PresenceEnvironment;
  sourceSessionId?: string;
  verificationMethod: PersonIdentityVerificationMethod;
  hydrationState?: IdentityHydrationState;
  displayNameEvidence?: IdentityFactEvidence;
  handleEvidence?: IdentityFactEvidence;
  avatarEvidence?: IdentityFactEvidence;
  lastHydratedAt?: string;
  /** Presence-scoped channel evidence about whether this person can be
   * contacted. This belongs to the social relationship, not connector health. */
  contactability?: PersonContactability;
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

export type RelationshipLearningMode = "off" | "selective";
export type RelationshipEngagementMode = "observe_only" | "when_worthwhile" | "maintain_relationship";
export interface RelationshipPolicy {
  id: string;
  agentId: string;
  presenceId: string;
  personId: string;
  learning: RelationshipLearningMode;
  engagement: RelationshipEngagementMode;
  rhythm?: "light" | "regular";
  sourceDescription?: string;
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

/** A deliberately operator-triggered historical study. Watching alone never creates one. */
export type RelationshipStudyMode = "existing_evidence" | "recent_history" | "deep_history";
export type RelationshipStudyStatus = "planning" | "collecting" | "analyzing" | "completed" | "failed";
export type RelationshipInsightConfidence = "tentative" | "supported" | "strong";
export type RelationshipInsightCategory = "person_context" | "public_pattern" | "direct_relationship" | "current_focus" | "approach";

export interface RelationshipStudy {
  id: string;
  agentId: string;
  presenceId: string;
  personId: string;
  mode: RelationshipStudyMode;
  refresh?: boolean;
  status: RelationshipStudyStatus;
  requestedEvidenceCount: number;
  evidenceRefs: EvidenceRef[];
  resourceUsage: { channelReads: number; hydrations: number; modelCalls: number; visionCalls: number };
  insightSetId?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipInsight {
  id: string;
  category: RelationshipInsightCategory;
  statement: string;
  confidence: RelationshipInsightConfidence;
  evidenceRefs: EvidenceRef[];
}

export interface RelationshipInsightSet {
  id: string;
  agentId: string;
  presenceId: string;
  personId: string;
  studyId: string;
  previousVersionId?: string;
  interests: RelationshipInsight[];
  publicInteractionPatterns: RelationshipInsight[];
  directRelationshipPatterns: RelationshipInsight[];
  currentFocus: RelationshipInsight[];
  currentApproach: RelationshipInsight;
  createdAt: string;
  updatedAt: string;
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
export interface AssetPerception { id: string; assetId: string; agentId?: string; socialObjectId?: string; presenceId: string; scope?: "library" | "social"; level: PerceptionLevel; result: PerceptionResult; providerId?: string; modelId?: string; sourceAssetVersion: string; contextObjectIds?: string[]; supersedesId?: string; createdAt: string; environment?: PresenceEnvironment; sessionId?: string; }

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
  /** Consecutive unchanged reads used only to widen the next poll interval. */
  zeroDeltaStreak?: number;
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
  /** Temporary per-post retry gates prevent one provider failure from starving newer mentions. */
  inboundAttentionCooldowns?: Record<string, string>;
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

export type ChannelAffordance = string;

export interface PresenceContext {
  presenceId: string;
  channel: ChannelId;
  language?: PresenceLanguage;
  publicIdentity: { displayName: string; handle: string; mode: PresenceMode };
  publicSelf: PublicSelf;
  brief: PresenceBrief;
  audienceContext?: string;
  voiceAdaptation?: string;
  availableAffordances: string[];
  relevantRelationshipContext?: string;
  publicFooting?: PublicFooting;
  ghostProfile?: GhostProfile;
  publishingInitiative?: PublishingInitiative;
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
export interface ConversationStylePreview { id: string; label: string; input: string; reply: string; }
export interface ConversationStyleDefinition { corePrinciple: string; conversationSignature: string; postMoves?: string[]; replyMoves?: string[]; acknowledgmentMoves?: string[]; disagreementMoves?: string[]; humorMoves?: string[]; questionMoves?: string[]; closureMoves?: string[]; languageTexture?: string[]; formatting?: string[]; antiPatterns?: string[]; boundaries?: string[]; }
export interface ConversationStyleProfile { id: string; name: string; description: string; source: "built_in" | "custom"; channel: ChannelId; schema: "taste.conversation_style.v1"; style: ConversationStyleDefinition; previews: ConversationStylePreview[]; createdAt?: string; updatedAt?: string; }
export interface Agent { id: string; name: string; description: string; audience: string; topics: string[]; accent: string; glyph: string; languagePolicy: LanguagePolicy; resourceBudget?: ResourceBudget; conversationStyleId?: string; }

export interface ModelRuntimeCapabilities { vision: boolean; toolCalling: boolean; structuredOutput: boolean; streaming: boolean; }
export type ModelProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "custom";
export type ModelQuality = "low" | "medium" | "high" | "local";
export interface AgentModelProfile { id: string; agentId: string; provider: ModelProvider; model: string; quality?: ModelQuality; connectionId?: string; capabilities: ModelRuntimeCapabilities; updatedAt: string; }
export interface ProviderConnection { id: string; provider: ModelProvider; label: string; status: "available" | "needs-configuration" | "local"; endpoint?: string; secretConfigured?: boolean; createdAt: string; }
export type AssetDiscoveryProviderId = "tavily" | "evidence-visual";
export interface AssetProviderConnection { id: string; provider: AssetDiscoveryProviderId; label: string; status: "available" | "needs-configuration"; endpoint?: string; secretConfigured?: boolean; config?: Record<string, JsonValue>; createdAt: string; }
export interface AgentToolBinding { id: string; agentId: string; toolId: string; enabled?: boolean; provider?: string; model?: string; connectionId?: string; config?: Record<string, JsonValue>; }
export type AgentCapabilityId = "research" | "asset-intelligence" | "visual-creation" | "channel-action";
export interface AgentCapabilityDefinition { id: AgentCapabilityId; name: string; description: string; toolIds: string[]; scope: "agent" | "presence"; }
export interface AgentToolDefinition { id: string; name: string; description: string; scope: "agent" | "presence"; }
export const AGENT_CAPABILITY_DEFINITIONS: AgentCapabilityDefinition[] = [
  { id: "research", name: "Web research", description: "Find and retrieve outside evidence when useful.", toolIds: ["web.search"], scope: "agent" },
  { id: "asset-intelligence", name: "Asset intelligence", description: "Find, understand, verify, and prepare media.", toolIds: ["evidence.search", "asset.inspect"], scope: "agent" },
  { id: "visual-creation", name: "Visual creation", description: "Create original visual explanations from grounded evidence.", toolIds: ["chart.render"], scope: "agent" },
  { id: "channel-action", name: "Channel action", description: "Publish approved Social Intents through the active Presence.", toolIds: ["channel.execute"], scope: "presence" },
];
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  { id: "web.search", name: "Web search", description: "Retrieve public sources when an idea needs current evidence.", scope: "agent" },
  { id: "evidence.search", name: "EvidenceVisual search", description: "Search the local, source-linked visual evidence corpus without writing to it.", scope: "agent" },
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

/** Canonical Agent-owned Knowledge document. Legacy collection fields are migrated at the runtime boundary. */
export interface KnowledgeDocument {
  id: string;
  agentId: string;
  name: string;
  sourceType: KnowledgeSourceType;
  role: KnowledgeRole;
  /** Stored effective source visibility. Presence access can only narrow it. */
  knowledgeUse: KnowledgeUse;
  effectiveFrom?: string;
  reviewAfter?: string;
  status: "active" | "archived";
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  /** Retained only to explain and repair legacy provenance after flattening. */
  legacyCollectionId?: string;
  legacyCollectionName?: string;
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

export interface PresenceKnowledgeAccess {
  id: string;
  agentId: string;
  presenceId: string;
  maximumUse: KnowledgeUse;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Explicit Agent-owned Knowledge context attached to one meaning file. */
export interface MindFileKnowledgeBinding {
  id: string;
  agentId: string;
  fileKind: FileKind;
  knowledgeDocumentId: string;
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
  knowledgeAccess: KnowledgeUse;
  accessibleDocumentIds: string[];
  /** Legacy audit field retained for old retrieval records. */
  accessibleCollectionIds?: string[];
  candidateSegmentIds: string[];
  selectedSegmentIds: string[];
  createdAt: string;
}

export type KnowledgeCitationUsage = "retrieved" | "relied_on" | "quoted" | "constraint";
export interface KnowledgeCitation {
  id: string;
  retrievalRunId: string;
  knowledgeDocumentId: string;
  /** Legacy citation field retained for old audit records. */
  knowledgeItemId?: string;
  knowledgeVersionId: string;
  knowledgeSegmentId: string;
  usage: KnowledgeCitationUsage;
  outputArtifactType?: string;
  outputArtifactId?: string;
  createdAt: string;
}

export interface KnowledgeEvidence {
  agentId: string;
  documentId: string;
  documentName: string;
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
  /** Legacy collection/item aliases retained at the evidence boundary. */
  collectionId?: string;
  collectionName?: string;
  itemId?: string;
  itemTitle?: string;
}

export interface KnowledgeContextPacket {
  retrievalRunId: string;
  publicEvidence: KnowledgeEvidence[];
  restrictedEvidence: KnowledgeEvidence[];
  /** Internal style references may shape public wording without becoming public facts. */
  styleEvidence: KnowledgeEvidence[];
  /** Curated Knowledge passages explicitly attached to a meaning file. */
  mindFileEvidence?: Partial<Record<FileKind, KnowledgeEvidence[]>>;
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
export type PublishingPlanStatus = "planning" | "active" | "paused" | "blocked" | "completed" | "expired" | "superseded";
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
  growthRevisionRef?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  supersededBy?: string;
  supersededAt?: string;
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
  growthRevisionRef?: string;
}
export type SocialOriginKind = "publishing_initiative" | "assignment" | "capability_trial" | "standing_intent" | "exploration" | "watchlist" | "public_request" | "inbound_social" | "operator" | "teach" | "other";
export interface SocialOrigin {
  kind: SocialOriginKind | "self_directed_discovery";
  refId?: string;
  planId?: string;
  planRevision?: number;
  planWindowId?: string;
}
export type SocialActDecision =
  | { kind: "like" }
  | { kind: "repost" }
  | { kind: "follow" }
  | { kind: "reply"; expressionIntent?: string; text?: string }
  | { kind: "quote"; expressionIntent?: string; text?: string };

export type SocialPlannerResult =
  | {
      kind: "inspect_more";
      requests: Array<{ type: "thread_context" | "media_inspection" | "author_profile"; targetRef: string }>;
      safeSummary?: string;
    }
  | {
      kind: "decision";
      acts: SocialActDecision[];
      conversationDisposition?: ConversationDisposition;
      safeSummary: string;
      evidenceRefs: EvidenceRef[];
    };

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
  /** A decision may express several independent, compatible social acts. */
  acts?: Array<{ decision: Exclude<SocialDecisionKind, "no_op" | "original_post">; text?: string; rationale?: string }>;
  conversationDisposition?: ConversationDisposition;
  /** Natural private response to the operator when this decision came from Chat. */
  operatorReaction?: string;
  summary: string;
  influences: string[];
  confidence?: SocialDecisionConfidence;
  closestAlternative?: SocialDecisionKind;
  closestAlternativeReason?: string;
  evidenceRefs?: EvidenceRef[];
  socialIntentId?: string;
  plannerRunId?: string;
  runId?: string;
  invocationId?: string;
  relevantGrowthRevisionRef?: string;
  autobiographicalEventIds?: string[];
  createdAt: string;
  attentionEpisodeId?: string;
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
export type PresencePacing = "recommended" | "gentle" | "custom";
export interface PresenceQuietHours { enabled: boolean; start: string; end: string; }
export interface Presence { id: string; createdAt?: string; channel: ChannelId; name: string; handle: string; mode: PresenceMode; status: "live" | "paused" | "disconnected"; accent: string; avatarLook?: import("./avatars").AvatarLook; capabilities: ChannelCapability[]; execution: Record<string, ExecutionMode>; executionEnvelope: ExecutionEnvelope; context: PresenceContext; brief: PresenceBrief; publicSelf: PublicSelf; mediaPerceptionPolicy: MediaPerceptionPolicy; evidencePolicy?: "use-judgment" | "review-uncertain" | "always-review"; language?: PresenceLanguage; languagePolicy: LanguagePolicy; ghostProfile?: GhostProfile; pacing: PresencePacing; attentionIntervalMinutes: number; nextExecutionCheckAt?: string; quietHours: PresenceQuietHours; publishingInitiative: PublishingInitiative; selfDirectedAttention?: SelfDirectedAttentionPolicy; requestPolicy?: PresenceRequestPolicy; dmInstructions?: PresenceDMInstructions; accountHealth: "healthy" | "elevated"; environment?: PresenceEnvironment; destination?: PresenceDestination; accessBindings?: AccessBinding[]; connectionMode?: PresenceConnectionMode; browserAccess?: PresenceBrowserAccess; growthEvidenceWatermark?: number; lastTriagedEvidenceWatermark?: number; activeGrowthRevisionRef?: string; curationSources?: CurationSourceConfig[]; conversationStyleId?: string; }

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
export interface PresenceChatMessage { id: string; role: "presence" | "user"; content: string; timestamp: string; attachments?: PresenceChatAttachment[]; replyToMessageId?: string; operatorFeedback?: boolean; }
export interface PresenceChatSession { id: string; presenceId: string; title: string; createdAt: string; updatedAt: string; messages: PresenceChatMessage[]; }

export type OperatorNudgeStatus = "queued" | "acknowledged" | "working" | "resolved" | "held_paused" | "assignment_created" | "failed";
export interface OperatorNudge {
  id: string;
  agentId: string;
  presenceId: string;
  conversationId: string;
  messageId: string;
  content: string;
  status: OperatorNudgeStatus;
  sourceUrls: string[];
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  attentionEpisodeIds: string[];
  assignmentId?: string;
  resultSummary?: string;
  lastError?: string;
  /** Client-generated retry key; prevents a double submit from becoming two nudges. */
  clientRequestId?: string;
}
export interface OperatorConversationMessage {
  id: string;
  role: "operator" | "presence" | "system";
  content: string;
  timestamp: string;
  nudgeId?: string;
  milestone?: "acknowledgment" | "assignment" | "decision" | "action" | "verified" | "failure";
  externalRefs?: EntityRef[];
  attachments?: PresenceChatAttachment[];
  /** Client-generated retry key for operator-authored turns. */
  clientRequestId?: string;
}
export interface OperatorConversation {
  id: string;
  agentId: string;
  presenceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: OperatorConversationMessage[];
}

export type ActivityNowState = "working" | "bursting" | "resting" | "paused" | "recovering" | "stuck";
export interface ActivityNowProjection {
  presenceId: string;
  state: ActivityNowState;
  title: string;
  detail: string;
  since?: string;
  nextWakeAt?: string;
  nextWakePurpose?: string;
  activeRunId?: string;
  activeEpisodeId?: string;
  activeAssignmentId?: string;
  steps: AttentionStep[];
  pendingInboundCount: number;
  pendingNudgeCount: number;
  staleForMs?: number;
}
export interface ChangeSetOperation { path: string; action: "create" | "update" | "delete"; before?: JsonValue; after?: JsonValue; }
export interface ChangeSet { id: string; agentId: string; presenceId?: string; conversationId?: string; summary: string; operations: ChangeSetOperation[]; createdAt: string; }
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
export interface Publication { id: string; format: string; payload: JsonValue; assetIds: string[]; links: { url: string; label?: string }[]; publicExpression?: PublicExpression; expressionMode?: ExpressionMode; groundingStatus?: GroundingStatus; factuality?: Factuality; assetReuse?: { usageType: AssetUsageType; reason: string }; operatorOverride?: { operatorId?: string; reason: string; at: string }; origin?: SocialOrigin; autobiographicalEventIds?: string[]; createdAt: string; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; assignmentId?: string; invocationId?: string; }
export interface SocialIntentPersonReference { candidateId: string; personId?: string; purpose: "recommendation" | "introduction_offer" | "introduction_request" | "contextual_reference"; }
export interface OperatorDirective { id: string; agentId: string; presenceId: string; target: EntityRef; requiredAct: "reply" | "no_op"; optionalDirection?: string; provenance: "operator"; initialAct: "no_op"; status: "requested" | "expressed" | "failed"; migratedToAssignmentId?: string; environment?: PresenceEnvironment; sessionId?: string; createdAt: string; }
export interface SocialIntent { id: string; agentId: string; presenceId: string; affordance: string; target?: EntityRef; publicationId?: string; priority: number; validity: { expiresAt?: string; staleAfterMs?: number }; state: "active" | "withdrawn" | "expired"; formedAt: string; updatedAt: string; standingIntentId?: string; assignmentId?: string; conversationEpisodeId?: string; origin?: SocialOrigin; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; invocationId?: string; runId?: string; referencedPeople?: SocialIntentPersonReference[]; networkReason?: string; source?: "agent" | "operator"; operatorDirectiveId?: string; attentionTestId?: string; capabilityTrialId?: string; attentionEpisodeId?: string; autobiographicalEventIds?: string[]; }
export type FailureReviewDisposition = "closed_non_retryable" | "stale" | "operator_action_required";
export interface Execution { id: string; socialIntentId: string; presenceId: string; affordance: string; mode: Exclude<ExecutionMode, "off">; status: ExecutionStatus; attempts: number; bridgeId?: string; connector?: ConnectorKind; idempotencyKey: string; target?: EntityRef; publication?: Publication; permit?: ExecutionPermit; lease?: { executorId: string; claimedAt: string; expiresAt: string }; deliveryHold?: { reason: "bridge_identity"; at: string }; externalRef?: EntityRef; failure?: { code?: string; message: string; retryable?: boolean; reviewedAt?: string; reviewDisposition?: FailureReviewDisposition; reviewNote?: string }; reviewReason?: string; createdAt: string; updatedAt: string; executedAt?: string; assignmentId?: string; conversationEpisodeId?: string; environment?: PresenceEnvironment; sessionId?: string; rehearsalAttemptId?: string; invocationId?: string; runId?: string; source?: "agent" | "operator"; operatorDirectiveId?: string; attentionTestId?: string; capabilityTrialId?: string; attentionEpisodeId?: string; }
export interface Outcome { id: string; socialIntentId: string; executionId?: string; presenceId: string; status: "succeeded" | "failed" | "unknown"; observedAt: string; metrics: Record<string, number>; evidence?: EntityRef[]; environment?: PresenceEnvironment; sessionId?: string; conversationEpisodeId?: string; attentionEpisodeId?: string; }

export type AgendaHorizon = "now" | "ongoing" | "upcoming" | "attention";

export type AgendaWorkKind =
  | "social_opportunity"
  | "discovery_session"
  | "conversation"
  | "assignment_step"
  | "publishing_step"
  | "growth_review"
  | "reconciliation";

export type AgendaWorkSource =
  | "assignment"
  | "conversation"
  | "mention"
  | "publishing"
  | "exploration"
  | "watchlist"
  | "self_directed_discovery"
  | "capability_trial"
  | "growth_review";
export type AgendaWorkState = "working" | "ready" | "waiting" | "watching" | "upcoming" | "awaiting_verification" | "deferred" | "needs_operator";

export interface AgendaWorkItem {
  id: string;
  source: AgendaWorkSource;
  workKind?: AgendaWorkKind;
  step?: "reassess_plan" | "create_plan" | "window_work" | string;
  planRef?: string;
  planRevision?: number;
  sourceRef?: string;
  assignmentId?: string;
  state: AgendaWorkState;
  currentRank?: number;
  safePriorityReason: string;
  nextAction: string;
  doneWhen: string;
  title: string;
  originLabel: string;
  statusLabel: string;
  detail: string;
  progress?: { verified: number; required?: number; label?: string };
  nextEligibleAt?: string;
  targetMirrorObjectId?: string;
  updatedAt?: string;
  urgencyScore: number;
  assignment?: Assignment;
}

export interface AgendaWatchingItem {
  id: string;
  source: AgendaWorkSource;
  label: string;
  statusLabel: string;
  detail: string;
  count?: number;
  lastCheckedAt?: string;
  nextEligibleAt?: string;
  currentAgendaRank?: number;
}

export interface AgendaItem {
  id: string;
  assignmentId: string;
  horizon: AgendaHorizon;
  title: string;
  subtitle?: string;
  statusLabel: string;
  detail: string;
  deliverableLabel?: string;
  timingLabel?: string;
  isReady: boolean;
  isWorking: boolean;
  isDueNow: boolean;
  urgencyScore: number;
  scheduledFor?: string;
  targetMirrorObjectId?: string;
  assignment: Assignment;
}

export interface AgendaCompilation {
  items: AgendaItem[];
  now: AgendaItem[];
  ongoing: AgendaItem[];
  upcoming: AgendaItem[];
  attention: AgendaItem[];
  compiledAt?: string;
  pendingMentionCount?: number;
  workItems?: AgendaWorkItem[];
  working?: AgendaWorkItem[];
  nextUp?: AgendaWorkItem[];
  waiting?: AgendaWorkItem[];
  responsibilities?: Assignment[];
  needsYou?: AgendaWorkItem[];
  watching?: AgendaWatchingItem[];
}

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
  createdBy?: "operator" | "agent" | "system";
  origin?: AssignmentOrigin;
  activation?: AssignmentActivation;
  target?: { mirrorObjectId: string; relationshipId?: string };
  /** The durable object an Assignment was seeded from, when one exists. */
  seed?: AssignmentSeed;
  migration?: { sourceType: "operatorDirective" | string; sourceId: string };
  instruction: string;
  deliverable: { type: AssignmentDeliverableType; quantity?: number; quantityMode?: AssignmentQuantityMode };
  quantityPolicy?: { quantity?: number | "agent_planned"; mode: AssignmentQuantityMode; period?: "day" | "week" | "assignment"; timezone?: string };
  periods?: AssignmentPeriod[];
  recurrence?: { kind: "once" | "daily" | "weekdays" | "weekly"; label?: string };
  schedule?: { day: string; time: string; executionWindow: string };
  timeframe?: { startsAt?: string; deadline?: string };
  editorialContext?: { topics?: string[]; sources?: string[]; constraints?: string[] };
  assetConstraint?: { collectionId?: string; required?: boolean };
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

export type AssignmentSeedRole = "context" | "distributable_target" | "required_target";
export interface AssignmentSeed {
  externalRef: EntityRef;
  role: AssignmentSeedRole;
  mirrorObjectId?: string;
  availability?: "available" | "deleted" | "unknown";
  deletedAt?: string;
  lastKnownText?: string;
}

export type CapabilityTrialCapability = "like" | "repost" | "quote" | "follow" | "reply" | "original_post" | "image_post" | "video_post";
export type CapabilityTrialEnvironment = "sandbox" | "live";
export type CapabilityTrialStatus = "draft" | "preflight" | "active" | "discovering" | "judging" | "awaiting_execution" | "awaiting_verification" | "completed" | "expired" | "failed" | "cancelled";
export type CapabilityTrialResult = "PASS_VERIFIED" | "INCONCLUSIVE_NO_OPPORTUNITY" | "WAITING_REVIEW" | "BLOCKED_CAPABILITY" | "BLOCKED_RESOURCE" | "FAIL_EXECUTION" | "FAIL_VERIFICATION" | "CANCELLED";
export interface CapabilityTrialResourceEnvelope { maxDurationMinutes: number; maxSearchDirections: number; maxLightweightHits: number; maxCandidatesTriaged: number; maxHydratedCandidates: number; maxModelCalls?: number; maxVisionCalls?: number; }
export interface CapabilityTrialCandidateAudit { mirrorObjectId: string; socialDecisionId?: string; acts?: string[]; suppressedActs?: string[]; status: "rejected" | "matched" | "blocked"; rationale?: string; createdAt: string; }
export interface CapabilityTrial {
  id: string;
  agentId: string;
  presenceId: string;
  capability: CapabilityTrialCapability;
  environment: CapabilityTrialEnvironment;
  assignmentId: string;
  status: CapabilityTrialStatus;
  focusPolicy: { objective: string; discovery: "agent-directed"; target: "agent-discovered"; preservePlannerVocabulary: true };
  executionIsolation: { testedCapability: CapabilityTrialCapability; mode: "auto" | "review"; suppressOtherTrialActs: true; presenceWide: false };
  resourceEnvelope: CapabilityTrialResourceEnvelope;
  /** Optional operator-selected observed post for a bounded capability proof. */
  candidateId?: string;
  startedAt?: string;
  expiresAt: string;
  result?: CapabilityTrialResult;
  discoveryPlanId?: string;
  candidateAudits: CapabilityTrialCandidateAudit[];
  matchedCandidateMirrorObjectId?: string;
  socialIntentId?: string;
  executionId?: string;
  verifiedOutcomeId?: string;
  why?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
export type CapabilityTrialPlan = Record<string, JsonValue>;
export type CapabilityTrialStimulus = Record<string, JsonValue>;
export type CapabilityTrialObservation = Record<string, JsonValue>;
export type CapabilityTrialEvaluation = Record<string, JsonValue>;

export interface OperationalStagePolicy {
  stage: AssignmentWorkPhase | string;
  expectedProgressWithinMs: number;
}

/** One durable, bounded worker execution for an operator-owned Assignment. */
export interface AssignmentRun {
  id: string;
  assignmentId: string;
  agentId: string;
  presenceId: string;
  sessionId: string;
  pursuitWindowId?: string;
  status: AssignmentRunStatus;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  lastProgressAt?: string;
  currentStage?: AssignmentWorkPhase;
  recoveryOf?: string;
  attempts: number;
  maxAttempts: number;
  rejectedCandidates: number;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssignmentPursuitAction = "reply" | "quote" | "repost" | "like" | "follow";
export type AssignmentPursuitWindowStatus = "active" | "paused" | "completed" | "expired" | "cancelled";
export interface AssignmentPursuitResourceBudget {
  maxChannelReads?: number;
  maxHydrations?: number;
  maxModelCalls?: number;
  maxVisionCalls?: number;
  maxEstimatedCostCents?: number;
}
export interface AssignmentPursuitWindow {
  id: string;
  assignmentId: string;
  agentId: string;
  presenceId: string;
  startsAt: string;
  deadlineAt: string;
  /** Capacity, never a completion quota. Taste may stop well below this. */
  maxVerifiedActions: number;
  actionCaps?: Partial<Record<AssignmentPursuitAction, number>>;
  maxActionsPerHour?: number;
  maxActionsPerPerson?: number;
  maxActionsPerConversation?: number;
  resourceBudget?: AssignmentPursuitResourceBudget;
  status: AssignmentPursuitWindowStatus;
  pauseReason?: string;
  /** Stable social objects already judged during this temporary push. */
  consideredCandidateKeys?: string[];
  lastRunAt?: string;
  nextRunAt?: string;
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
export interface LibrarySource { id: string; agentId: string; type: "local-folder" | "remote" | "url-collection" | "content-drop"; location: string; access: "read"; status: AssetSourceStatus; analysisPolicy?: AssetSourceAnalysisPolicy; lastScannedAt?: string; lastError?: string; createdAt?: string; updatedAt?: string; }
export interface AssetSourceOccurrence { id: string; sourceId?: string; path?: string; fileName?: string; exactHash?: string; observedAt: string; status?: "present" | "missing" | "ignored"; }
export interface AssetMetadataEdit { id: string; assetId: string; agentId: string; status: AssetMetadataReviewStatus; observation?: string; likelyMeaning?: string; visibleText?: string[]; semanticKind?: AssetSemanticKind; uncertainty?: string[]; note?: string; createdAt: string; resolvedAt?: string; }
export interface AssetCollection { id: string; agentId: string; name: string; description?: string; defaultAccessScope?: AssetAccessScope; reuseGuidance?: string; status: "active" | "archived"; createdAt: string; updatedAt: string; }
export interface AssetCollectionMembership { id: string; agentId: string; collectionId: string; assetId: string; addedAt: string; removedAt?: string; }
export interface AssetProcessingJob { id: string; agentId: string; assetId: string; status: AssetProcessingJobStatus; attempts: number; maxAttempts: number; progress: number; leaseOwner?: string; leaseExpiresAt?: string; lastError?: string; createdAt: string; updatedAt: string; }
export interface Asset { id: string; agentId: string; sourceId?: string; sourceOccurrences?: AssetSourceOccurrence[]; accessScope?: AssetAccessScope; metadataReview?: { status: AssetMetadataReviewStatus; lastEditId?: string; resolvedAt?: string }; presenceId?: string; sessionId?: string; type: "image" | "video" | "gif" | "audio" | "pdf" | "document" | "chart" | "link"; mediaKind?: AssetMediaKind; semanticKind?: AssetSemanticKind; storagePath?: string; dataUrl?: string; checksum?: string; storage?: { storeKey: string; mimeType: string; byteSize: number; exactHash: string; perceptualHash?: string }; status: "queued" | "processing" | "ready" | "failed"; provenance: { origin: AssetOrigin | string; sourceUrl?: string; sourcePageUrl?: string; canonicalSourcePage?: string; publisher?: string; author?: string; publishedAt?: string; retrievedAt?: string; acquisitionProvider?: string; importedAt: string; sourceIdentityStatus?: SourceIdentityStatus }; perception?: { observation: string; likelyMeaning?: string; visibleText?: string[]; chartSeries?: string[]; dataThrough?: string; uncertainty?: string[] }; rights?: { status: RightsStatus; evidence?: string[] }; nature?: AssetNature; lineage?: { parentAssetIds: string[]; transformation?: string }; mimeType?: string; sizeBytes?: number; dimensions?: { width: number; height: number }; durationMs?: number; description?: string; topics?: string[]; transcript?: string; usageNotes?: string; visibility?: VisibilityScope; shareability?: Shareability; environment?: PresenceEnvironment; archivedAt?: string; createdAt: string; updatedAt: string; }
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

export interface SourceLead { id: string; providerId: string; query: string; sourceUrl: string; mediaUrl?: string; title: string; snippet?: string; publisher?: string; author?: string; publishedAt?: string; discoveredAt: string; relevanceScore?: number; underlyingDataRef?: string; }
export interface HydratedSource { leadId: string; assets: SourceAsset[]; underlyingDataRefs?: string[]; }
export interface SourceAsset { id: string; leadId: string; mediaKind: "image" | "video" | "gif" | "chart_data"; mimeType: string; storeKey?: string; dataUrl?: string; sourceUrl: string; canonicalSourcePage?: string; publisher?: string; exactHash: string; dimensions?: { width: number; height: number }; retrievedAt: string; }
export interface RightsAssessment { id: string; sourceAssetId: string; status: "permitted" | "permitted_with_attribution" | "restricted" | "unknown"; basisRefs: string[]; attributionRequirement?: string; assessedAt: string; }
export interface MediaPerception { id: string; sourceAssetId: string; visualForm: "chart" | "screenshot" | "photo" | "illustration" | "diagram" | "clip" | "table" | "other"; visualSalience: string; axesAndMetrics?: { xAxis?: string; yAxis?: string; secondaryYAxis?: string; timeRange?: string; units?: string }; keyDataSeries?: Array<{ name: string; trendOrValue: string; highlighted?: boolean }>; literalObservation: string; interpretation: string; visibleText?: string; legibility: "clear" | "partial" | "poor"; decorative: boolean; uncertainty: "low" | "medium" | "high" | "insufficient"; missingContext?: string[]; perceivedAt: string; }
export interface VerificationRecord { id: string; perceptionId: string; status: "supported" | "partially_supported" | "unsupported" | "contradicted" | "unverified"; verifiedClaims: string[]; unsupportedClaims: string[]; underlyingDataMatch?: "exact_match" | "secondary_derived" | "unverified"; notes?: string; verifiedAt: string; }
export type AssetEditorialStrategy = "use_source_asset" | "derive_from_source_data" | "find_better_source_asset" | "reject";
export interface EditorialDecision { id: string; sourceAssetId: string; perceptionRef: string; verificationRefs: string[]; rightsAssessmentRef?: string; tasteRevisionRef?: string; growthRevisionRef?: string; editorialReferenceRefs?: string[]; noveltyContext?: { recentPublicationOverlap: boolean; similarRecentStoriesCount: number; hoursSinceSimilarTheme?: number }; worthSharing: boolean; whyPicked: string; whyMatters: string; whyShareNow: string; editorialThesis: string; assetStrategy: AssetEditorialStrategy; risks: string[]; rejectionReason?: string; judgedAt: string; }
export interface PublicationPackage { id: string; opportunityId: string; expression: { text: string; mediaRefs: string[]; attribution?: string }; packagedAt: string; }
export interface EditorialOpportunity { id: string; agentId: string; presenceId: string; sessionId?: string; environment: "sandbox" | "live"; leadId: string; sourceAssetId?: string; perceptionId?: string; verificationId?: string; rightsAssessmentId?: string; decisionId?: string; publicationPackageId?: string; status: "discovered" | "evaluated" | "approved" | "rejected" | "starred" | "published"; feedbackIds: string[]; createdAt: string; updatedAt: string; }

export type ArchitectureLayer = "taste" | "source_policy" | "perception" | "channel" | "rights";
export type EditorialFeedbackReason = "too_cluttered" | "hard_to_read" | "weak_source" | "stale_data" | "misread_chart" | "not_interesting" | "too_obvious" | "does_not_fit_presence" | "wrong_visual_format" | "already_covered" | "rights_unclear" | "asset_unavailable";
export interface EditorialFeedbackEvent { id: string; opportunityId: string; presenceId: string; reaction: "good_pick" | "rejected" | "starred_benchmark"; reasons: EditorialFeedbackReason[]; note?: string; affectedLayers: ArchitectureLayer[]; createdAt: string; }
export interface ComparativeFeedbackEvent { id: string; presenceId: string; selectedOpportunityId: string; rejectedOpportunityId: string; rationale?: string; affectedLayers: ArchitectureLayer[]; createdAt: string; }
export interface EditorialReference { id: string; presenceId: string; kind: "positive_benchmark" | "negative_benchmark"; title: string; notes?: string; sourceAssetId: string; mediaUrl: string; sourceUrl?: string; publisher?: string; samplePostText?: string; visualForm: "chart" | "screenshot" | "photo" | "clip" | "diagram"; createdAt: string; }
export interface CalibrationAnalysis { presenceId: string; analyzedEventsCount: number; findings: { taste: string[]; sourcePolicy: string[]; perception: string[]; channel: string[]; rights: string[] }; tasteProposal?: { currentTaste: string; proposedTaste: string; diffSummary: string }; }
export interface TasteProposalTestResult { proposalId?: string; calibrationCount: number; heldOutCount: number; heldOutApprovedTotal: number; heldOutApprovedRetained: number; heldOutRejectedTotal: number; heldOutRejectedAgreed: number; overallAgreementRate: number; topImprovements: string[]; regressions: Array<{ opportunityId: string; title: string; previouslyApprovedReason: string; whyNowRejected: string }>; testedAt: string; }

export type CurationSourceKind = "macro_primary" | "government" | "corporate" | "research" | "tech_code" | "rss_feed" | "web_discovery" | "custom_api";

export interface CurationSourceConfig {
  id: string;
  name: string;
  kind: CurationSourceKind;
  enabled: boolean;
  icon?: string;
  description?: string;
  urlOrEndpoint?: string;
  domains?: string[];
  topics?: string[];
}

export interface AssetResearchCandidate { id: string; candidate: AssetCandidate; assetId?: string; perception?: PerceptionResult; sourceEvidenceId?: string; decision?: AssetResearchDecision; rejectionReasons?: string[]; }
export type AssetResearchOutcome = "discovery_empty" | "fetch_failed" | "inspection_rejected" | "editorial_rejected";
export interface AssetResearchSession { id: string; agentId: string; presenceId: string; sessionId: string; assignmentId?: string; assignmentRunId?: string; invocationId?: string; status: "researching" | "selected" | "search_again" | "text_only" | "replanned" | "failed"; outcome?: AssetResearchOutcome; storyCandidate?: StoryCandidate; evidenceNeed?: EvidenceNeed; visualNeed?: VisualNeed; visualBrief?: VisualBrief; searchHistory: Array<{ query: string; attempt: number; resultCount: number; createdAt: string }>; candidates: AssetResearchCandidate[]; selectedCandidateId?: string; decisionHistory: Array<{ decision: AssetResearchDecision; rationale?: string; candidateId?: string; createdAt: string }>; recentVisualAssetIds?: string[]; createdAt: string; updatedAt: string; }
export interface ClaimGrounding { id: string; publicationId: string; claim: string; claimType: "factual" | "interpretation" | "opinion" | "fictional" | "satirical"; sourceEvidenceIds: string[]; assetIds: string[]; status: GroundingStatus; uncertainty?: string; }
export interface Skill { id: string; name?: string; /** The instruction prompt that defines this reusable behavior. */ description: string; channels: ChannelId[]; requiresTools: string[]; compatibleFormats: string[]; }
export interface AgentSkill { id: string; agentId: string; skillId: string; enabled: boolean; }
export interface ContentDrop { id: string; agentId: string; origin: string; brief?: string; sourceIds: string[]; assetIds: string[]; suggestedUse?: string; suggestedWindow?: string; expiresAt?: string; status: "received" | "reviewed" | "used" | "ignored" | "expired"; createdAt: string; }

export type WatchKind = "creator" | "topic" | "opportunity";
export type WatchObservationStatus = "watching" | "manual" | "stale";
export type WatchState = "active" | "paused";
export type WatchSource = "posts" | "replies" | "mentions";
export type WatchSignalType = "new_content" | "direct_address" | "relationship_event";
export type WatchSignalDisposition = "pending" | "considered" | "remembered" | "social_opportunity" | "assignment_created" | "dismissed";
export interface WatchSignal {
  id: string;
  watchId: string;
  personId?: string;
  presenceId: string;
  mirrorObjectId: string;
  signalType: WatchSignalType;
  disposition: WatchSignalDisposition;
  createdAt: string;
  updatedAt: string;
  decisionId?: string;
  assignmentId?: string;
}
export interface Watch {
  id: string;
  agentId: string;
  presenceId: string;
  channel: ChannelId;
  kind: WatchKind;
  title: string;
  query: string;
  purpose?: string;
  target?: { personId?: string; channel: ChannelId; externalActorId?: string; handle?: string; identityStatus: "unresolved" | "verified" };
  state?: WatchState;
  sources?: WatchSource[];
  lastObservedAt?: string;
  nextObservationAt?: string;
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
  explorationId?: string;
  presenceId?: string;
  origin?: "operator_exploration" | "self_directed_discovery";
  briefRevision?: number;
  revision?: number;
  channel: ChannelId;
  surfaces: string[];
  directions: string[];
  exclusions: string[];
  source: "agent" | "fallback";
  safeRationale?: string;
  searchQueries?: string[];
  evidenceRequirements?: string[];
  resourceHints?: string[];
  growthRevisionRef?: string;
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

export interface LiveEvent { id: string; type: "decision" | "execution" | "learning" | "memory" | "system"; title: string; detail: string; time: string; tone: EventTone; presenceId?: string; intentId?: string; executionId?: string; outcomeId?: string; decisionId?: string; sessionId?: string; invocationId?: string; runId?: string; sourceObjectId?: string; attentionEpisodeId?: string; }
export interface CalendarSlot { id: string; label: string; instruction: string; day: string; time: string; objective: string; presence: string; mode: ExecutionMode; enabled: boolean; executionWindow: string; standingIntentId?: string; assignmentId?: string; lastEvaluatedAt?: string; }
export type PublicHistoryKind = "post" | "reply" | "quote" | "repost" | "like" | "thread" | "comment";
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
export type AttentionTestAction = "like" | "repost" | "quote";
export type AttentionTestMode = "sandbox" | "live";
export type AttentionTestDecisionAction = AttentionTestAction | "no_op";
export type AttentionTestStage = "queued" | "decided" | "claimed" | "executed" | "verified" | "recorded" | "visible" | "held" | "retrying" | "failed";
export interface AttentionTestTelemetry {
  id: string;
  stage: AttentionTestStage;
  at: string;
  executionId?: string;
  action?: AttentionTestAction;
  targetId?: string;
  bridgeStatus?: string;
  verificationResult?: "pending" | "verified" | "failed" | "timeout" | "not_run";
  persistenceResult?: "pending" | "recorded" | "failed";
  detail?: string;
  transitionKey: string;
}
export interface AttentionTest {
  id: string;
  agentId: string;
  presenceId: string;
  candidateId?: string;
  action?: AttentionTestAction;
  mode: AttentionTestMode;
  targetUrl?: string;
  target?: EntityRef;
  targetLabel?: string;
  quoteText?: string;
  decision?: { action: AttentionTestDecisionAction; rationale: string; at: string };
  executionId?: string;
  sessionId?: string;
  status: AttentionTestStage;
  failure?: { code: string; message: string; retryable?: boolean };
  lastFailure?: { code: string; message: string; at: string };
  feedRecordId?: string;
  calendarRecordId?: string;
  externalUrl?: string;
  telemetry: AttentionTestTelemetry[];
  createdAt: string;
  updatedAt: string;
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
  files: AgentFile[]; proposals: FileProposal[]; messages: ChatMessage[]; conversations: Conversation[]; activeConversationId: string | null; presenceChatSessions: PresenceChatSession[]; operatorConversations?: OperatorConversation[]; operatorNudges?: OperatorNudge[]; agentRequests: AgentRequest[]; capabilityChangeEvents: CapabilityChangeEvent[];
  events: LiveEvent[]; socialDecisions: SocialDecision[]; autobiographicalEvents: AutobiographicalEvent[]; autobiographicalReflections: AutobiographicalReflection[]; resourceUsageEvents: ResourceUsageEvent[]; calendar: CalendarSlot[]; assignments: Assignment[]; growthReviews: GrowthReview[]; growthFileVersions: GrowthFileVersion[]; growthRevisions?: GrowthRevision[]; growthEvidenceSnapshots?: GrowthEvidenceSnapshot[]; audienceSnapshots: PresenceAudienceSnapshot[]; publicationMetricSnapshots: PublicationMetricSnapshot[]; watches: Watch[]; explorations: ExplorationBrief[]; discoveryPlans: DiscoveryPlan[]; explorationSessions: ExplorationSession[]; explorationFindings: ExplorationFinding[]; actions: ActionRecord[]; publishingPlans: PublishingPlan[]; metrics: { qualifiedFollows: number; conversations: number; opportunitiesIgnored: number; audienceHealth: number };
  modelProfiles: AgentModelProfile[]; providerConnections: ProviderConnection[]; assetProviderConnections: AssetProviderConnection[]; toolBindings: AgentToolBinding[]; changeSets: ChangeSet[]; standingIntents: StandingIntent[]; operatorDirectives: OperatorDirective[]; socialIntents: SocialIntent[]; executions: Execution[]; outcomes: Outcome[]; attentionTests: AttentionTest[]; capabilityTrials: CapabilityTrial[]; publications: Publication[]; assetUsages: AssetUsage[]; sourceEvidence: SourceEvidence[]; claimGrounding: ClaimGrounding[]; preferenceEvidence: PreferenceEvidence[]; originalPostRehearsals: OriginalPostRehearsalAttempt[]; librarySources: LibrarySource[]; assets: Asset[]; perceptions: AssetPerception[]; assetResearchSessions: AssetResearchSession[]; skills: Skill[]; agentSkills: AgentSkill[]; contentDrops: ContentDrop[]; channelDefinitions: ChannelDefinition[]; nativeConnections: NativeChannelConnection[]; bridges: Bridge[]; mirrorObjects: MirrorObject[]; mirrorEvents: MirrorEvent[]; bridgeSync: BridgeSyncState[]; conversationEpisodes: ConversationEpisode[]; assignmentContributions: AssignmentContribution[]; people: Person[]; personIdentities: PersonIdentity[]; relationships: Relationship[]; relationshipFacts: RelationshipFact[]; relationshipOpenLoops: RelationshipOpenLoop[]; recommendationRecords: RecommendationRecord[]; introductionRecords: IntroductionRecord[]; watchSignals: WatchSignal[]; relationshipPolicies: RelationshipPolicy[]; presenceRequestPolicies: PresenceRequestPolicy[]; delegationGrants: DelegationGrant[]; publicRequests: PublicRequest[]; sandboxEnvironments: SandboxEnvironment[]; playgroundSessions: PlaygroundSession[]; sandboxActors: SandboxActor[]; networkSearches: SandboxNetworkSearch[]; networkIntroductions: SandboxNetworkIntroduction[]; scenarios: Scenario[]; scenarioVersions: ScenarioVersion[]; scenarioRuns: ScenarioRun[]; scenarioRunProvenance: ScenarioRunProvenance[]; scenarioEvaluations: ScenarioRunEvaluation[]; knowledgeDocuments: KnowledgeDocument[]; knowledgeVersions: KnowledgeVersion[]; knowledgeSegments: KnowledgeSegment[]; presenceKnowledgeAccess: PresenceKnowledgeAccess[]; mindFileKnowledgeBindings?: MindFileKnowledgeBinding[]; knowledgeRetrievalRuns: KnowledgeRetrievalRun[]; knowledgeCitations: KnowledgeCitation[]; knowledgeCollections?: KnowledgeCollection[]; knowledgeItems?: KnowledgeItem[]; presenceKnowledgeBindings?: PresenceKnowledgeBinding[];
  assetCollections?: AssetCollection[]; assetCollectionMemberships?: AssetCollectionMembership[]; assetMetadataEdits?: AssetMetadataEdit[]; assetProcessingJobs?: AssetProcessingJob[];
  conversationStyles?: ConversationStyleProfile[];
  peopleNotes?: PeopleNote[];
  relationshipStudies?: RelationshipStudy[]; relationshipInsightSets?: RelationshipInsightSet[];
  operationalRuns?: OperationalRun[]; attentionEpisodes?: AttentionEpisode[]; scheduledWakes?: ScheduledWake[]; dependencyHealth?: DependencyHealth[]; recoveryIncidents?: RecoveryIncident[]; recoveryAttempts?: RecoveryAttempt[]; browserBodies?: BrowserBody[];
  editorialOpportunities?: EditorialOpportunity[]; editorialFeedbackEvents?: EditorialFeedbackEvent[]; editorialReferences?: EditorialReference[]; sourceAssets?: SourceAsset[]; mediaPerceptions?: MediaPerception[]; verificationRecords?: VerificationRecord[]; rightsAssessments?: RightsAssessment[]; editorialDecisions?: EditorialDecision[]; publicationPackages?: PublicationPackage[];
  assignmentPursuitWindows?: AssignmentPursuitWindow[];
  workspaceRevision?: number;
}

export interface OpenPresenceState extends AgentWorkspaceSnapshot {
  agents: Agent[]; activeAgentId: string | null; agentWorkspaces: AgentWorkspaceSnapshot[]; assignmentRuns?: AssignmentRun[];
  /** Identifies whether an API response contains the complete workspace or the compact Activity read model. Never persisted. */
  responseProjection?: "activity" | "chat" | "full";
  /** Activity-only compact summaries. They are derived from the full ledger and never persisted as workspace state. */
  activityAttentionUsageSnapshots?: Record<string, ActivityAttentionUsageSnapshot>;
  activityNow?: Record<string, ActivityNowProjection>;
  lastStimulus?: PlaygroundStimulusResult;
}

export interface CreateAgentInput { name: string; description: string; audience?: string; mode: PresenceMode; handle: string; accent: string; }
export type ToolBindingOperation = { type: "setToolBinding"; toolId: string; provider?: ModelProvider; model?: string; connectionId?: string };
export type CapabilityOperation = { type: "setCapability"; capabilityId: AgentCapabilityId; enabled: boolean };
export type RuntimeOperation = Operation | ToolBindingOperation | CapabilityOperation;
export type AssetLibraryOperation =
  | { type: "connectAssetSource"; location: string; analysisPolicy: AssetSourceAnalysisPolicy }
  | { type: "rescanAssetSource"; sourceId: string }
  | { type: "pauseAssetSource"; sourceId: string }
  | { type: "resumeAssetSource"; sourceId: string }
  | { type: "createAssetCollection"; name: string; description?: string; reuseGuidance?: string; defaultAccessScope?: AssetAccessScope }
  | { type: "updateAssetCollection"; collectionId: string; name: string; description?: string; reuseGuidance?: string; defaultAccessScope?: AssetAccessScope }
  | { type: "archiveAssetCollection"; collectionId: string }
  | { type: "addAssetToCollection"; collectionId: string; assetId: string }
  | { type: "removeAssetFromCollection"; collectionId: string; assetId: string }
  | { type: "setAssetAccessScope"; assetId: string; accessScope: AssetAccessScope }
  | { type: "editAssetMetadata"; assetId: string; observation?: string; likelyMeaning?: string; visibleText?: string[]; semanticKind?: AssetSemanticKind; uncertainty?: string[]; note?: string }
  | { type: "approveAssetMetadata"; assetId: string; observation?: string; likelyMeaning?: string; visibleText?: string[]; semanticKind?: AssetSemanticKind; uncertainty?: string[]; note?: string }
  | { type: "resolveAssetReview"; assetId: string; observation: string; likelyMeaning?: string; visibleText?: string[]; semanticKind?: AssetSemanticKind; uncertainty?: string[]; note?: string }
  | { type: "reanalyzeAsset"; assetId: string }
  | { type: "archiveAsset"; assetId: string }
  | { type: "restoreAsset"; assetId: string };
export type KnowledgeOperation =
  | { type: "createKnowledgeDocument"; name: string; content: string; sourceType?: KnowledgeSourceType; mimeType?: string; originalDataUrl?: string; originalFileName?: string; originalAssetId?: string }
  | { type: "saveKnowledgeDocument"; documentId: string; name: string; content: string; mimeType?: string; originalAssetId?: string }
  | { type: "setKnowledgeAccess"; presenceId: string; maximumUse: KnowledgeUse; enabled?: boolean }
  | { type: "setMindFileKnowledgeBinding"; fileKind: FileKind; knowledgeDocumentId: string; enabled: boolean }
  | { type: "archiveKnowledgeDocument"; documentId: string }
  | { type: "createKnowledgeCollection"; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }
  | { type: "updateKnowledgeCollection"; collectionId: string; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }
  | { type: "addKnowledgeItem"; collectionId: string; title: string; role?: KnowledgeRole; useOverride?: KnowledgeUse; sourceType: KnowledgeSourceType; content: string; mimeType?: string; originalDataUrl?: string; originalFileName?: string; originalAssetId?: string }
  | { type: "uploadKnowledgeVersion"; itemId: string; content: string; mimeType?: string; originalDataUrl?: string; originalFileName?: string; originalAssetId?: string }
  | { type: "setKnowledgeBinding"; presenceId: string; collectionId: string; maximumUse: KnowledgeUse; enabled?: boolean }
  | { type: "archiveKnowledgeItem"; itemId: string }
  | { type: "archiveKnowledgeCollection"; collectionId: string };
export interface CreatePresenceInput { channel: ChannelId; name?: string; handle: string; mode: PresenceMode; accent: string; avatarLook?: import("./avatars").AvatarLook; channelDefinition?: ChannelDefinition; connectionMode?: PresenceConnectionMode; }
export type AssignmentOperation =
  | { type: "createAssignment"; instruction: string; presenceId?: string; sessionId?: string; environment?: PresenceEnvironment; schedule?: { day: string; time: string; executionWindow: string }; objective?: string; delegationPolicy?: AssignmentDelegationPolicy; assetConstraint?: { collectionId?: string; required?: boolean } }
  | { type: "updateAssignment"; id: string; instruction: string; schedule?: { day: string; time: string; executionWindow: string } | null; objective?: string; assetConstraint?: { collectionId?: string; required?: boolean } }
  | { type: "confirmSchedulePrompt"; promptId: string; presenceId: string; drafts: Array<{ instruction: string; schedule: { day: string; time: string; executionWindow: string }; objective?: string; environment?: PresenceEnvironment; delegationPolicy?: AssignmentDelegationPolicy; plan?: Omit<AssignmentPlan, "id" | "assignmentId" | "revision" | "createdAt" | "updatedAt"> }> }
  | { type: "activateAssignment"; id: string; delegationPolicy?: AssignmentDelegationPolicy }
  | { type: "updateAssignmentPlan"; assignmentId: string; plan: Omit<AssignmentPlan, "id" | "assignmentId" | "revision" | "createdAt" | "updatedAt"> }
  | { type: "startAssignment"; id: string; sessionId: string }
  | { type: "workAssignment"; id: string; sessionId: string }
  | { type: "runLiveAssignment"; assignmentId: string; presenceId?: string }
  | { type: "startAssignmentPursuit"; assignmentId: string; presenceId?: string; startsAt?: string; deadlineAt: string; maxVerifiedActions: number; actionCaps?: Partial<Record<AssignmentPursuitAction, number>>; maxActionsPerHour?: number; maxActionsPerPerson?: number; maxActionsPerConversation?: number; resourceBudget?: AssignmentPursuitResourceBudget }
  | { type: "scaleAssignmentPursuit"; id: string; maxVerifiedActions: number; maxActionsPerHour?: number; resourceBudget?: AssignmentPursuitResourceBudget }
  | { type: "pauseAssignmentPursuit"; id: string }
  | { type: "resumeAssignmentPursuit"; id: string }
  | { type: "cancelAssignmentPursuit"; id: string }
  | { type: "pauseAssignment"; id: string }
  | { type: "resumeAssignment"; id: string }
  | { type: "cancelAssignment"; id: string };
export type CapabilityTrialOperation =
  | { type: "createCapabilityTrial"; presenceId?: string; capability: CapabilityTrialCapability; environment?: CapabilityTrialEnvironment; executionMode?: "auto" | "review"; candidateId?: string; resourceEnvelope?: Partial<CapabilityTrialResourceEnvelope> }
  | { type: "startCapabilityTrial"; id: string; confirmLive?: true }
  | { type: "pauseCapabilityTrial"; id: string }
  | { type: "resumeCapabilityTrial"; id: string }
  | { type: "completeCapabilityTrial"; id: string; status?: "completed" | "failed" | "cancelled"; feedback?: string }
  | { type: "updateCapabilityTrialPlan"; id: string; plan: CapabilityTrialPlan }
  | { type: "recordCapabilityTrialCandidate"; trialId: string; stimulus: CapabilityTrialStimulus; observation: CapabilityTrialObservation; evaluation: CapabilityTrialEvaluation }
  | { type: "runCapabilityTrialStep"; id: string }
  | { type: "cancelCapabilityTrial"; id: string }
  | { type: "runCapabilityTrial"; id: string };
export type LanguagePolicyOperation =
  | { type: "setLanguagePolicy"; presenceId?: string; policy: Partial<LanguagePolicy> }
  | { type: "setPresenceLanguage"; presenceId: string; language: PresenceLanguage }
  | { type: "recordLanguageConflictOverride"; presenceId: string; intentId: string; ruleId: string; author: "operator"; reason?: string };
export type ScenarioOperation =
  | { type: "createScenario"; input: { title: string; objective: string; initialPost: string; targetAuthorName: string; targetAuthorHandle: string; difficulty: "beginner" | "intermediate" | "advanced"; audienceState: "neutral" | "skeptical" | "enthusiastic" | "adversarial"; domain: "technology" | "business" | "creative" | "general" } }
  | { type: "saveScenarioVersion"; input: { scenarioId: string; title: string; objective: string; initialPost: string; targetAuthorName: string; targetAuthorHandle: string; difficulty: "beginner" | "intermediate" | "advanced"; audienceState: "neutral" | "skeptical" | "enthusiastic" | "adversarial"; domain: "technology" | "business" | "creative" | "general" } }
  | { type: "runScenario"; input: { scenarioId: string; versionId?: string; presenceId: string } }
  | { type: "evaluateScenarioRun"; input: { runId: string } };
export type PublishingPlanOperation =
  | { type: "createPublishingPlan"; presenceId?: string; title: string; objective: string; timeWindow: string; scheduleDays: string[]; slotsPerDay: number; topics: string[]; targetThemes: string[]; voiceNotes: string[]; constraints: string[] }
  | { type: "updatePublishingPlan"; id: string; patch: Partial<PublishingPlan> }
  | { type: "activatePublishingPlan"; id: string }
  | { type: "pausePublishingPlan"; id: string }
  | { type: "archivePublishingPlan"; id: string };
export type GrowthOperation =
  | { type: "reviewGrowth"; assignmentId?: string; presenceId?: string; kind?: GrowthReviewKind; modelDecision?: GrowthReviewDecision };
export type AgentRequestOperation =
  | { type: "updateAgentRequest"; id: string; status: AgentRequestStatus }
  | { type: "recordCapabilityChange"; presenceId: string; changes: Array<Pick<CapabilityChangeEvent, "capability" | "previousAvailability" | "nextAvailability" | "provider" | "detail">> };
export type FailureReviewOperation =
  | { type: "reviewFailedExecution"; id: string; disposition: FailureReviewDisposition; note?: string }
  | { type: "reviewAllFailedExecutions"; presenceId?: string; disposition?: FailureReviewDisposition; note?: string }
  | { type: "clearReviewedExecutions"; presenceId?: string }
  | { type: "closeUnverifiedExecutions"; ids: string[]; note?: string };
export type ExplorationOperation =
  | { type: "createExploration"; brief: string; presenceId?: string }
  | { type: "updateExploration"; id: string; brief: string }
  | { type: "setExplorationStatus"; id: string; status: ExplorationStatus }
  | { type: "setExplorationEngagement"; id: string; mode: ExplorationEngagementMode; objective?: string }
  | { type: "lookNow"; id: string }
  | { type: "runAttentionWorker"; presenceId?: string; scheduled?: boolean };
export type BrowserOperation = { type: "setPresenceBrowserAccess"; presenceId?: string; enabled: boolean };
export type ObservabilityOperation =
  | { type: "recordAudienceSnapshot"; presenceId?: string; followers: number; following?: number; source?: MetricObservationSource; observationStatus?: "observed" | "partial" | "unavailable"; observedAt?: string }
  | { type: "recordPublicationMetricSnapshot"; presenceId?: string; mirrorObjectId: string; publicationAgeSeconds?: number; metrics: Partial<Record<"impressions" | "likes" | "replies" | "reposts" | "quotes", number>>; source?: MetricObservationSource; observationStatus?: "observed" | "partial" | "unavailable" };
export type LegacyLanguageOperation =
  | { type: "setAgentLanguagePolicy"; policy: Partial<LanguagePolicy> }
  | { type: "setPresenceLanguagePolicy"; policy: Partial<LanguagePolicy> }
  | { type: "overrideLanguagePolicy"; id: string };
export type OperationalOperation =
  | { type: "createOperationalRun"; run: OperationalRun }
  | { type: "updateOperationalRun"; id: string; patch: Partial<OperationalRun> }
  | { type: "scheduleWake"; wake: ScheduledWake }
  | { type: "cancelWake"; id: string }
  | { type: "recordDependencyHealth"; health: DependencyHealth }
  | { type: "createRecoveryIncident"; incident: RecoveryIncident }
  | { type: "updateRecoveryIncident"; id: string; patch: Partial<RecoveryIncident> }
  | { type: "recordRecoveryAttempt"; attempt: RecoveryAttempt }
  | { type: "updateBrowserBody"; presenceId: string; patch: Partial<BrowserBody> }
  | { type: "reconsiderAffectedRuns"; incidentId?: string; presenceId?: string };

export type AttentionControlOperation =
  | { type: "resumeAttention"; presenceId?: string }
  | { type: "resetAttentionBudget"; presenceId?: string };

export type WatchRequestOperation =
  | { type: "updateWatch"; id: string; query: string; purpose?: string }
  | { type: "setWatchState"; id: string; state: WatchState }
  | { type: "setRelationshipPolicy"; presenceId: string; personId: string; learning: RelationshipLearningMode; engagement: RelationshipEngagementMode; rhythm?: "light" | "regular"; sourceDescription?: string }
  | { type: "setPresenceRequestPolicy"; presenceId: string; policy: Omit<PresenceRequestPolicy, "presenceId" | "updatedAt"> }
  | { type: "createDelegationGrant"; presenceId: string; personId?: string; externalActorId?: string; channel?: ChannelId; allowedRequestTypes: PublicRequestType[]; acceptance?: "operator_review" | "agent_autonomous"; impactLimit?: "low" | "moderate" }
  | { type: "revokeDelegationGrant"; id: string }
  | { type: "decidePublicRequest"; id: string; disposition: Exclude<PublicRequestDisposition, "pending" | "considering" | "needs_operator_review"> };

export type RelationshipStudyOperation =
  | { type: "studyRelationship"; presenceId: string; personId: string; mode: RelationshipStudyMode; refresh?: boolean };

export type PeopleNoteOperation =
  | { type: "updatePeopleNote"; presenceId: string; personId: string; markdown: string; source?: "operator" | "agent"; reason?: string; operationId?: string }
  | { type: "setPresenceDMInstructions"; presenceId: string; condition?: string; instructions: string; source?: "operator" | "agent"; reason?: string; operationId?: string };

export type PlaygroundStimulusTarget = "quote" | "repost" | "like" | "reply" | "silence";
export type PresenceChatRehearsalOperation =
  | { type: "sendPresenceChatMessage"; presenceId: string; sessionId: string; content: string; attachments?: SandboxAssetInput[]; replyToMessageId?: string; briefOverride?: PresenceBrief; respond?: boolean }
  | { type: "askPresenceChatToReply"; presenceId: string; sessionId: string; targetMessageId: string; briefOverride?: PresenceBrief };
export type OperatorConversationOperation =
  | { type: "sendPresenceNudge"; presenceId: string; content: string; attachments?: SandboxAssetInput[]; clientRequestId?: string }
  | { type: "retryPresenceNudge"; presenceId: string; nudgeId: string }
  | { type: "createAssignmentFromNudge"; presenceId: string; nudgeId: string; title?: string }
  | { type: "lookNow"; presenceId?: string };

export interface PlaygroundStimulusResult {
  authorName: string;
  authorHandle: string;
  content: string;
  targetAffordance: PlaygroundStimulusTarget;
  rationale: string;
}

export type CurationOperation =
  | { type: "findEditorialOpportunities"; presenceId: string; sessionId?: string; goal?: string; sources?: string[]; mediaTypes?: string[]; count?: number }
  | { type: "recordEditorialFeedback"; opportunityId: string; reaction: "good_pick" | "rejected" | "starred_benchmark" | "undo"; reasons?: EditorialFeedbackReason[]; note?: string; affectedLayers?: ArchitectureLayer[] }
  | { type: "generateOpportunityPublicationPackage"; opportunityId: string }
  | { type: "addEditorialReference"; presenceId: string; kind: "positive_benchmark" | "negative_benchmark"; title: string; sourceAssetId?: string; mediaUrl: string; sourceUrl?: string; publisher?: string; samplePostText?: string; notes?: string; visualForm?: "chart" | "screenshot" | "photo" | "clip" | "diagram" }
  | { type: "removeEditorialReference"; id: string }
  | { type: "generateTasteProposalFromCalibration"; presenceId: string }
  | { type: "testTasteProposal"; presenceId: string; proposedTaste: string }
  | { type: "configureCurationSources"; presenceId: string; sources: CurationSourceConfig[] };

export type ConversationStyleOperation =
  | { type: "saveConversationStyle"; presenceId: string; style: ConversationStyleProfile }
  | { type: "setConversationStyle"; presenceId: string; styleId: string };

export type OperationalRecheckOperation =
  | { type: "recheckModelProvider"; presenceId?: string; incidentId?: string }
  | { type: "syncNativeX"; presenceId?: string; manual?: boolean; incidentId?: string };

export type Operation = AssignmentOperation | CapabilityTrialOperation | LanguagePolicyOperation | ScenarioOperation | PublishingPlanOperation | GrowthOperation | AgentRequestOperation | FailureReviewOperation | ExplorationOperation | OperationalOperation | AttentionControlOperation | WatchRequestOperation | RelationshipStudyOperation | PeopleNoteOperation | AssetLibraryOperation
  | BrowserOperation
  | ObservabilityOperation
  | LegacyLanguageOperation
  | PresenceChatRehearsalOperation
  | OperatorConversationOperation
  | KnowledgeOperation
  | ConversationStyleOperation
  | OperationalRecheckOperation
  | CurationOperation
  | { type: "removeSandboxObject"; sessionId: string; objectId: string }
  | { type: "cancelExecution"; id: string }
  | { type: "askPresenceToReply"; presenceId: string; objectId: string; sessionId?: string; optionalDirection?: string }
  | { type: "askPresenceToEvaluate"; presenceId: string; objectId: string; sessionId?: string; optionalDirection?: string }
  | { type: "importXPost"; presenceId: string; url: string }
  | { type: "runAttentionTest"; presenceId: string; mode: AttentionTestMode; confirmed: true }
  | { type: "removeLegacyCalendarEntries" }
  | { type: "askPresenceToIgnore"; presenceId: string; objectId: string; sessionId?: string }
  | { type: "generatePlaygroundStimulus"; sessionId: string; presenceId?: string; targetAffordance: PlaygroundStimulusTarget; topic?: string }
  | { type: "reset" } | { type: "createAgent"; input: CreateAgentInput } | { type: "createAdditionalAgent"; input: CreateAgentInput } | { type: "selectAgent"; id: string } | { type: "deleteAgent"; confirmationName: string } | { type: "setAgentAccent"; agentId: string; accent: string } | { type: "renameAgent"; name: string } | { type: "createPresence"; input: CreatePresenceInput } | { type: "deletePresence"; presenceId: string; confirmationName: string } | { type: "createChannel"; definition: ChannelDefinition } | { type: "updateChannel"; definition: ChannelDefinition } | { type: "createBridge"; input: { presenceId: string; name: string; kind: ConnectorKind; capabilities: ConnectorCapabilities } } | { type: "rotateBridgeKey"; id: string } | { type: "revokeBridge"; id: string } | { type: "removeBridge"; id: string } | { type: "markManualExecution"; id: string; externalRef: EntityRef } | { type: "retryExecution"; id: string } | { type: "reconcileXDeliveries"; presenceId?: string; retryMissing?: boolean } | { type: "selectPresence"; id: string } | { type: "selectConversation"; id: string } | { type: "newConversation" } | { type: "sendMessage"; content: string; conversationId?: string } | { type: "newPresenceChatSession"; presenceId: string } | { type: "sendPresenceChatMessage"; presenceId: string; sessionId: string; content: string; attachments?: SandboxAssetInput[]; replyToMessageId?: string; briefOverride?: PresenceBrief } | { type: "saveFile"; kind: FileKind; content: string } | { type: "resolveProposal"; id: string; decision: "approve" | "reject" } | { type: "addSlot"; instruction: string; day: string; time: string; objective: string; executionWindow: string; presenceId?: string } | { type: "editSlot"; id: string; instruction: string; day: string; time: string; objective: string; executionWindow: string; presenceId?: string } | { type: "runNow"; instruction: string; presenceId?: string } | { type: "createWatch"; query: string; purpose?: string; presenceId?: string } | { type: "deleteWatch"; id: string } | { type: "rememberPerson"; personId?: string; presenceId?: string; channel?: ChannelId; externalActorId: string; displayName: string; handle?: string; profileUrl?: string; source?: "operator" | "current-context" | "watched" } | { type: "forgetRelationship"; relationshipId: string } | { type: "restoreRelationship"; relationshipId: string } | { type: "correctRelationshipFact"; factId?: string; relationshipId: string; statement: string; visibility?: RelationshipVisibility } | { type: "createIntroductionRecord"; presenceId?: string; requesterPersonId?: string; requesterActorId?: string; candidatePersonId?: string; candidateActorId?: string; sourceIntentIds?: string[] } | { type: "respondIntroductionConsent"; id: string; party: "requester" | "candidate"; consent: boolean } | { type: "createSkill"; name: string; description: string } | { type: "editSkill"; id: string; name: string; description: string } | { type: "configureProvider"; provider: ModelProvider; label: string; endpoint?: string; hasSecret?: boolean; secret?: string } | { type: "configureAssetProvider"; provider: AssetProviderConnection["provider"]; label: string; endpoint?: string; hasSecret?: boolean; secret?: string } | { type: "disconnectAssetProvider"; provider: AssetProviderConnection["provider"] } | { type: "wakePresence"; presenceId?: string } | { type: "runPulse"; presenceId?: string } | { type: "syncNativeX"; presenceId?: string } | { type: "setModel"; model: string; provider?: ModelProvider; quality?: ModelQuality; vision?: boolean } | { type: "runSlot"; id: string; scheduled?: boolean } | { type: "approveExecution"; id: string } | { type: "executeIntent"; id: string } | { type: "confirmAutoMode"; presenceId: string; capabilities: string[]; executionIds: string[] } | { type: "approveSandboxIntroduction"; id: string } | { type: "declineSandboxIntroduction"; id: string } | { type: "setPresence"; patch: Partial<Pick<Presence, "name" | "handle" | "mode" | "status" | "avatarLook" | "pacing" | "attentionIntervalMinutes" | "quietHours" | "publishingInitiative" | "execution" | "ghostProfile" | "connectionMode" | "brief" | "publicSelf" | "mediaPerceptionPolicy" | "language" | "selfDirectedAttention" | "curationSources">> } | { type: "startPlayground"; presenceId?: string; source?: "fresh" | "scenario" | "replay" } | { type: "syncPlaygroundTime"; sessionId: string } | { type: "resetPlayground"; sessionId: string } | { type: "inspectMirrorMedia"; presenceId: string; objectId: string } | { type: "inspectSandboxMedia"; sessionId: string; objectId: string } | { type: "addSandboxEvent"; sessionId: string; kind?: string; actionId?: string; actorId?: string; actorName?: string; actorHandle?: string; profile?: SandboxActorProfile; targetExternalRef?: EntityRef; parentExternalRef?: EntityRef; observeOnly?: boolean } | { type: "advanceSandboxTime"; sessionId: string; minutes: number } | { type: "runSandboxPulse"; sessionId: string } | { type: "considerOriginalPublication"; sessionId: string; inspiration?: string } | { type: "recordPreferenceEvidence"; sessionId: string; attemptId: string; reaction: PreferenceReaction; reasons?: PreferenceReason[]; note?: string };
