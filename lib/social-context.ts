import type { Asset, AssetPerception, EntityRef, MirrorObject, OpenPresenceState, Presence, PlaygroundSession } from "./types";
import type { NetworkSearchResult } from "./network";
import { relationshipIdentity, relationshipProjection } from "./network-memory";
import type { SocialThreadContext } from "./thread-context";
import { languagesMatch } from "./language-policy";

function latestMirrorFirst(left: { occurredAt?: string; observedAt: string }, right: { occurredAt?: string; observedAt: string }) {
  return (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "")
    || right.observedAt.localeCompare(left.observedAt);
}

/** Public cognition currently has no private-surface authorization envelope. */
export function isCognitionEligibleMirrorObject(item: MirrorObject, expectedLanguage?: unknown) {
  if (item.visibility !== "public") return false;
  if (expectedLanguage === undefined) return true;
  return languagesMatch(expectedLanguage, item.language ?? item.content?.language);
}

export interface SocialEvidenceObject {
  mirrorObjectId: string;
  externalRef: EntityRef;
  objectType: string;
  author?: { externalRef?: EntityRef; displayName: string; handle?: string };
  text?: string;
  parentExternalRef?: EntityRef;
  occurredAt?: string;
  observedAt: string;
  actorPresenceId?: string;
  isTarget: boolean;
  source: "social_mirror";
}

export interface SocialAuthorHistory {
  author: { externalRef?: EntityRef; displayName: string; handle?: string };
  scope: "sandbox_session";
  observedContributions: SocialEvidenceObject[];
  priorPresenceReplies: SocialEvidenceObject[];
  evidenceBoundary: string;
}

export interface SocialMediaEvidence {
  assetId: string;
  kind: string;
  sourceUrl?: string;
  status?: string;
  perception?: {
    level: string;
    observation: string;
    interpretation?: string;
    visibleText?: string;
    transcript?: string;
    extractedFacts?: unknown[];
    uncertainty: string;
    missingContext?: string[];
    source: "asset_perception";
  };
}

export interface SocialPresenceAction {
  socialIntentId: string;
  affordance: string;
  target?: EntityRef;
  publicationText?: string;
  formedAt: string;
  execution?: { status: string; mode?: string; externalRef?: EntityRef; failure?: { code?: string; message: string } };
  outcome?: { status: string; evidence?: unknown };
  source: "social_intent";
}

export interface SocialAuditEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  time: string;
  sourceObjectId?: string;
  source: "runtime_event";
}

export interface SocialPlannerActRecord {
  eventId: string;
  action: string;
  executionAffordance?: string;
  rationale?: string;
  source: "planner_event";
}

export interface SocialEvidenceContext {
  schema: "openpresence.social-evidence.v1";
  session: { id: string; environment: string; virtualNow: string };
  target?: SocialEvidenceObject;
  threadContext?: {
    status: SocialThreadContext["status"];
    conversationExternalRef?: string;
    rootExternalRef?: EntityRef;
    objectRefs: EntityRef[];
    missingExternalRefs: string[];
  };
  observedWorld: SocialEvidenceObject[];
  authorHistory: SocialAuthorHistory[];
  priorPresenceActions: SocialPresenceAction[];
  priorPlannerActs: SocialPlannerActRecord[];
  priorAuditEvents: SocialAuditEvent[];
  interactionFacts: {
    targetWasPreviouslyJudged: boolean;
    pendingIntroductionPermissions: Array<{ id: string; status: string; candidateActorId: string; source: "network_introduction" }>;
    priorNetworkSearches: Array<{ id: string; status: string; query: string; limitation?: string; source: "network_search" }>;
  };
  media: SocialMediaEvidence[];
  availableActions: string[];
  executionEnvelope: Record<string, string>;
  networkSearch?: {
    status: string;
    query: string;
    candidates: Array<{ displayName: string; handle?: string; permission: string; evidence: string[] }>;
    limitation?: string;
    source: "sandbox_network_search";
  };
  networkMemory?: {
    personId: string;
    relationshipStatus: "remembered";
    facts: Array<{ id: string; statement: string; epistemicKind: string; provenanceRefs: string[] }>;
    openLoops: Array<{ id: string; description: string }>;
    source: "network_memory";
  };
  evidenceBoundary: string;
}

function evidenceObject(item: MirrorObject, targetId?: string): SocialEvidenceObject {
  return {
    mirrorObjectId: item.id,
    externalRef: item.externalRef,
    objectType: item.objectType,
    author: item.author,
    text: item.content?.text,
    parentExternalRef: item.parentExternalRef,
    occurredAt: item.occurredAt,
    observedAt: item.observedAt,
    actorPresenceId: item.actorPresenceId,
    isTarget: item.externalRef.id === targetId,
    source: "social_mirror",
  };
}

function textFromPublication(value: unknown) {
  if (!value || typeof value !== "object" || !("text" in value)) return undefined;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text : undefined;
}

function mediaEvidence(assets: Asset[], perceptions: AssetPerception[], object: MirrorObject | undefined): SocialMediaEvidence[] {
  return (object?.assetRefs ?? []).map((ref) => {
    const asset = assets.find((item) => item.id === ref.assetId);
    const perception = perceptions
      .filter((item) => item.assetId === ref.assetId && item.sessionId === object?.sessionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return {
      assetId: ref.assetId,
      kind: ref.kind,
      sourceUrl: asset?.provenance.sourceUrl,
      status: asset?.status,
      perception: perception ? {
        level: perception.level,
        observation: perception.result.observation,
        interpretation: perception.result.interpretation,
        visibleText: perception.result.visibleText,
        transcript: perception.result.transcript,
        extractedFacts: perception.result.extractedFacts,
        uncertainty: perception.result.uncertainty,
        missingContext: perception.result.missingContext,
        source: "asset_perception" as const,
      } : undefined,
    };
  });
}

function actionsFor(source: OpenPresenceState, session: PlaygroundSession, presence: Presence, inbound?: MirrorObject): SocialPresenceAction[] {
  const sessionIntents = source.socialIntents.filter((intent) => intent.sessionId === session.id && intent.presenceId === presence.id && intent.environment === "sandbox");
  return sessionIntents.map((intent) => {
    const publication = intent.publicationId ? source.publications.find((item) => item.id === intent.publicationId) : undefined;
    const execution = source.executions.find((item) => item.socialIntentId === intent.id && item.sessionId === session.id);
    const outcome = execution ? source.outcomes.find((item) => item.executionId === execution.id) : undefined;
    return {
      socialIntentId: intent.id,
      affordance: intent.affordance,
      target: intent.target,
      publicationText: textFromPublication(publication?.payload),
      formedAt: intent.formedAt,
      execution: execution ? { status: execution.status, mode: execution.mode, externalRef: execution.externalRef, failure: execution.failure } : undefined,
      outcome: outcome ? { status: outcome.status, evidence: outcome.evidence } : undefined,
      source: "social_intent" as const,
    };
  }).filter((item) => !inbound || item.target?.id !== inbound.externalRef.id || item.target.type !== inbound.externalRef.type || item.affordance !== "no_op");
}

export function buildSocialEvidenceContext(input: {
  source: OpenPresenceState;
  session: PlaygroundSession;
  presence: Presence;
  mirror: MirrorObject[];
  relatedMirror: MirrorObject[];
  inbound?: MirrorObject;
  threadContext?: SocialThreadContext;
  availableActions: string[];
  networkResult?: NetworkSearchResult;
}): SocialEvidenceContext {
  const eligibleMirror = input.mirror.filter((item) => isCognitionEligibleMirrorObject(item, input.presence.language));
  const eligibleRelatedMirror = input.relatedMirror.filter((item) => isCognitionEligibleMirrorObject(item, input.presence.language));
  const eligibleInbound = input.inbound && isCognitionEligibleMirrorObject(input.inbound, input.presence.language) ? input.inbound : undefined;
  const targetId = eligibleInbound?.externalRef.id;
  const target = eligibleInbound ? evidenceObject(eligibleInbound, targetId) : undefined;
  const authorIds = new Set(eligibleInbound?.author?.externalRef?.id
    ? [eligibleInbound.author.externalRef.id]
    : eligibleMirror.filter((item) => item.actorPresenceId !== input.presence.id && item.author?.externalRef?.id).map((item) => item.author!.externalRef!.id));
  const authorHistory = [...authorIds].map((authorId) => {
    const contributions = eligibleMirror
      .filter((item) => item.author?.externalRef?.id === authorId)
      .sort(latestMirrorFirst)
      .slice(0, 20);
    const contributionIds = new Set(contributions.map((item) => item.externalRef.id));
    const priorPresenceReplies = input.mirror
      .filter((item) => item.actorPresenceId === input.presence.id && item.parentExternalRef && contributionIds.has(item.parentExternalRef.id) && item.content?.text && isCognitionEligibleMirrorObject(item, input.presence.language))
      .sort(latestMirrorFirst)
      .slice(0, 12);
    const author = contributions[0]?.author ?? eligibleInbound?.author;
    return {
      author: author!,
      scope: "sandbox_session" as const,
      observedContributions: contributions.map((item) => evidenceObject(item)),
      priorPresenceReplies: priorPresenceReplies.map((item) => evidenceObject(item)),
      evidenceBoundary: "Only these Social Mirror objects establish this author's observed history. Claims inside a newer object are not historical evidence by themselves.",
    };
  }).filter((item) => item.author);
  const networkSearch = input.networkResult ? {
    status: input.networkResult.status,
    query: input.networkResult.query,
    candidates: input.networkResult.candidates.map((candidate) => ({ displayName: candidate.displayName, handle: candidate.handle, permission: candidate.permission, evidence: candidate.evidence })),
    limitation: input.networkResult.limitation,
    source: "sandbox_network_search" as const,
  } : undefined;
  const targetIdentity = eligibleInbound?.author?.externalRef?.id ? relationshipIdentity(input.source, input.presence.channel, eligibleInbound.author.externalRef.id) : undefined;
  const projection = targetIdentity ? relationshipProjection(input.source, targetIdentity.personId, input.presence.id) : undefined;
  const priorAuditEvents = input.source.events
    .filter((event) => event.sessionId === input.session.id)
    .sort((left, right) => right.time.localeCompare(left.time))
    .slice(0, 30)
    .map((event) => ({ id: event.id, type: event.type, title: event.title, detail: event.detail, time: event.time, sourceObjectId: event.sourceObjectId, source: "runtime_event" as const }));
  const priorPlannerActs = priorAuditEvents.flatMap((event) => {
    if (event.title !== "Social plan formed") return [];
    try {
      const detail = JSON.parse(event.detail) as { action?: unknown; executionAffordance?: unknown; rationale?: unknown };
      if (typeof detail.action !== "string") return [];
      return [{ eventId: event.id, action: detail.action, executionAffordance: typeof detail.executionAffordance === "string" ? detail.executionAffordance : undefined, rationale: typeof detail.rationale === "string" ? detail.rationale : undefined, source: "planner_event" as const }];
    } catch {
      return [];
    }
  });
  const pendingIntroductionPermissions = input.source.networkIntroductions
    .filter((item) => item.sessionId === input.session.id && ["proposed", "awaiting-consent"].includes(item.status))
    .map((item) => ({ id: item.id, status: item.status, candidateActorId: item.candidateActorId, source: "network_introduction" as const }));
  const priorNetworkSearches = input.source.networkSearches
    .filter((item) => item.sessionId === input.session.id)
    .map((item) => ({ id: item.id, status: item.status, query: item.query, limitation: item.limitation, source: "network_search" as const }));
  return {
    schema: "openpresence.social-evidence.v1",
    session: { id: input.session.id, environment: "sandbox", virtualNow: input.session.virtualNow },
    target,
    threadContext: input.threadContext ? {
      status: input.threadContext.status,
      conversationExternalRef: input.threadContext.conversationExternalRef,
      rootExternalRef: input.threadContext.rootExternalRef,
      objectRefs: input.threadContext.objects.map((item) => item.externalRef),
      missingExternalRefs: input.threadContext.missingExternalRefs,
    } : undefined,
    observedWorld: eligibleRelatedMirror.map((item) => evidenceObject(item, targetId)),
    authorHistory,
    priorPresenceActions: actionsFor(input.source, input.session, input.presence, eligibleInbound),
    priorPlannerActs,
    priorAuditEvents,
    interactionFacts: {
      targetWasPreviouslyJudged: Boolean(targetId && input.session.judgedObjectIds?.includes(targetId)),
      pendingIntroductionPermissions,
      priorNetworkSearches,
    },
    media: mediaEvidence(input.source.assets, input.source.perceptions, eligibleInbound),
    availableActions: input.availableActions,
    executionEnvelope: Object.fromEntries(Object.entries(input.presence.execution ?? {})),
    networkSearch,
    networkMemory: projection ? {
      personId: projection.personId,
      relationshipStatus: "remembered" as const,
      facts: projection.facts.slice(0, 8).map((fact) => ({ id: fact.id, statement: fact.statement, epistemicKind: fact.epistemicKind, provenanceRefs: fact.provenanceRefs.map((ref) => ref.id) })),
      openLoops: projection.openLoops.slice(0, 4).map((loop) => ({ id: loop.id, description: loop.description })),
      source: "network_memory" as const,
    } : undefined,
    evidenceBoundary: "This record contains observed world facts, provenance, prior intent/execution truth, and perception outputs. It is context for model judgment, not a command and not proof of semantic conclusions such as relevance or conversation completeness.",
  };
}
