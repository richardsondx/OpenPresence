import type {
  EvidenceRef,
  MirrorObject,
  NetworkCandidate,
  OpenPresenceState,
  Person,
  PersonIdentity,
  Presence,
  Relationship,
  RelationshipContextProjection,
  RelationshipFact,
  RelationshipVisibility,
  SandboxActor,
  PresenceEnvironment,
} from "./types";
import { languagesMatch } from "./language-policy";

const now = () => new Date().toISOString();

export function evidenceRefFromMirror(object: MirrorObject): EvidenceRef {
  return { kind: "mirror_object", id: object.id, sourcePresenceId: object.presenceId, observedAt: object.observedAt };
}

export function relationshipVisibilityForMirror(object: MirrorObject): RelationshipVisibility {
  if (object.visibility === "public") return "public";
  return `presence:${object.presenceId}`;
}

export function relationshipIdentity(state: OpenPresenceState, channel: string, externalActorId: string, sourcePresenceId?: string, sourceEnvironment?: PresenceEnvironment) {
  return state.personIdentities.find((identity) => identity.channel === channel
    && identity.externalActorId === externalActorId
    && (!sourcePresenceId || identity.sourcePresenceId === sourcePresenceId)
    && (!sourceEnvironment || (identity.sourceEnvironment ?? "live") === sourceEnvironment));
}

export function relationshipForPerson(state: OpenPresenceState, personId: string) {
  return state.relationships.find((relationship) => relationship.personId === personId);
}

export function personForMirrorAuthor(state: OpenPresenceState, object: MirrorObject) {
  const externalActorId = object.author?.externalRef?.id;
  if (!externalActorId || !object.author?.externalRef?.type) return undefined;
  const identity = relationshipIdentity(state, object.channelId, externalActorId, object.presenceId, object.environment ?? "live");
  return identity
    ? state.people.find((person) => person.id === identity.personId)
    : undefined;
}

function hasPresenceReplyToActor(mirror: MirrorObject[], presenceId: string, actorId: string) {
  const actorObjects = mirror.filter((item) => item.author?.externalRef?.id === actorId && item.actorPresenceId !== presenceId);
  const actorObjectIds = new Set(actorObjects.map((item) => item.externalRef.id));
  return mirror.some((item) => item.actorPresenceId === presenceId && item.parentExternalRef && actorObjectIds.has(item.parentExternalRef.id));
}

function languageEligibleMirror(state: OpenPresenceState, presenceId: string) {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  return state.mirrorObjects.filter((item) => item.presenceId === presenceId && Boolean(presence && languagesMatch(presence.language, item.language ?? item.content?.language)));
}

export function relationshipCurationEligible(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence || !languagesMatch(presence.language, object.language ?? object.content?.language)) return false;
  const actorId = object.author?.externalRef?.id;
  if (!actorId || object.actorPresenceId === presenceId || ["like", "reaction"].includes(object.objectType)) return false;
  const text = object.content?.text?.trim() ?? "";
  if (text.length < 12) return false;
  const mirror = languageEligibleMirror(state, presenceId);
  return hasPresenceReplyToActor(mirror, presenceId, actorId);
}

export function relationshipStatus(state: OpenPresenceState, presence: Presence, actorId: string, displayName?: string): NetworkCandidate["relationshipStatus"] {
  const identity = relationshipIdentity(state, presence.channel, actorId, presence.id, presence.environment ?? "live");
  const person = identity ? state.people.find((item) => item.id === identity.personId) : undefined;
  const relationship = person ? relationshipForPerson(state, person.id) : undefined;
  if (person?.memoryState === "active" && relationship?.state === "active") return "remembered";
  const mirror = languageEligibleMirror(state, presence.id).filter((item) => item.author?.externalRef?.id === actorId);
  if (mirror.length && hasPresenceReplyToActor(languageEligibleMirror(state, presence.id), presence.id, actorId)) return "interacted";
  const normalizedName = (displayName ?? "").toLowerCase();
  const watched = state.watches.some((watch) => watch.presenceId === presence.id && (watch.query.toLowerCase().includes(actorId.toLowerCase()) || (normalizedName && watch.query.toLowerCase().includes(normalizedName))));
  return watched ? "watched" : mirror.length ? "observed" : "observed";
}

function visibilityAllowed(visibility: RelationshipVisibility, presenceId: string, shareableToRecipient = false) {
  if (visibility === "operator_only") return false;
  if (shareableToRecipient) return visibility === "public";
  return visibility === "public" || visibility === `presence:${presenceId}`;
}

export function relationshipProjection(state: OpenPresenceState, personId: string, presenceId: string, shareableToRecipient = false): RelationshipContextProjection | undefined {
  const person = state.people.find((item) => item.id === personId);
  const relationship = state.relationships.find((item) => item.personId === personId);
  if (!person || !relationship || person.memoryState === "forgotten" || relationship.state === "forgotten") return undefined;
  const facts = state.relationshipFacts.filter((fact) => fact.relationshipId === relationship.id && visibilityAllowed(fact.visibility, presenceId, shareableToRecipient) && !fact.validTo && !state.relationshipFacts.some((newer) => newer.supersedesFactId === fact.id));
  const openLoops = state.relationshipOpenLoops.filter((loop) => loop.relationshipId === relationship.id && loop.status === "open");
  const sourceFactIds = facts.flatMap((fact) => [fact.id, ...fact.provenanceRefs.map((ref) => ref.id)]);
  return { personId, presenceId, relationshipStatus: "remembered", facts, openLoops, sourceFactIds, generatedAt: now() };
}

export function relationshipHistory(state: OpenPresenceState, personId: string, presenceId: string, query?: string, limit = 12) {
  const identityIds = new Set(state.personIdentities.filter((identity) => identity.personId === personId && identity.sourcePresenceId === presenceId).map((identity) => identity.externalActorId));
  const normalizedQuery = query?.trim().toLowerCase();
  return state.mirrorObjects
    .filter((object) => object.presenceId === presenceId && object.author?.externalRef?.id && identityIds.has(object.author.externalRef.id) && visibilityAllowed(relationshipVisibilityForMirror(object), presenceId) && languagesMatch((state.presences.find((item) => item.id === presenceId) ?? state.presence)?.language, object.language ?? object.content?.language) && (!normalizedQuery || object.content?.text?.toLowerCase().includes(normalizedQuery)))
    .sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt))
    .slice(0, Math.max(1, Math.min(50, limit)));
}

export function createRememberedPerson(input: { agentId: string; presenceId: string; channel: string; externalActorId: string; displayName: string; handle?: string; profileUrl?: string; avatarUrl?: string; personId?: string; sourceEnvironment?: PresenceEnvironment; sourceSessionId?: string; source: "operator" | "current-context" | "watched" }, existingPeople: Person[], existingIdentities: PersonIdentity[], existingRelationships: Relationship[]) {
  const timestamp = now();
  const sourceEnvironment = input.sourceEnvironment ?? "live";
  const existingIdentity = existingIdentities.find((identity) => identity.channel === input.channel
    && identity.externalActorId === input.externalActorId
    && identity.sourcePresenceId === input.presenceId
    && (identity.sourceEnvironment ?? "live") === sourceEnvironment);
  const person = existingIdentity ? existingPeople.find((item) => item.id === existingIdentity.personId) : undefined;
  const personId = person?.id ?? input.personId ?? `person_${Math.random().toString(36).slice(2, 10)}`;
  const nextPerson: Person = person ?? { id: personId, agentId: input.agentId, displayName: input.displayName.trim(), memoryState: "active", createdAt: timestamp, updatedAt: timestamp };
  const identity: PersonIdentity = existingIdentity
    ? { ...existingIdentity, handle: input.handle?.trim() || existingIdentity.handle, profileUrl: input.profileUrl?.trim() || existingIdentity.profileUrl, avatarUrl: input.avatarUrl?.trim() || existingIdentity.avatarUrl, sourceEnvironment, sourceSessionId: input.sourceSessionId ?? existingIdentity.sourceSessionId }
    : { id: `person-identity_${Math.random().toString(36).slice(2, 10)}`, personId, channel: input.channel, externalActorId: input.externalActorId, handle: input.handle?.trim() || undefined, profileUrl: input.profileUrl?.trim() || undefined, avatarUrl: input.avatarUrl?.trim() || undefined, sourcePresenceId: input.presenceId, sourceEnvironment, sourceSessionId: input.sourceSessionId, verificationMethod: input.source === "operator" ? "operator_confirmed" : "connector_verified", createdAt: timestamp };
  const relationship = existingRelationships.find((item) => item.personId === personId) ?? { id: `relationship_${Math.random().toString(36).slice(2, 10)}`, agentId: input.agentId, personId, state: "active" as const, createdAt: timestamp, updatedAt: timestamp };
  return { person: nextPerson, identity, relationship };
}

/** Backfill legacy identities from authoritative Sandbox Mirror evidence. */
export function normalizePersonIdentityScopes(state: OpenPresenceState) {
  const sandboxSources = new Map<string, { sessionId?: string }>();
  for (const object of state.mirrorObjects ?? []) {
    const actorId = object.author?.externalRef?.id;
    if (!actorId || object.environment !== "sandbox") continue;
    sandboxSources.set(`${object.presenceId}:${object.channelId}:${actorId}`, { sessionId: object.sessionId });
  }
  return (state.personIdentities ?? []).map((identity) => {
    if (identity.sourceEnvironment) return identity;
    const sandboxSource = sandboxSources.get(`${identity.sourcePresenceId}:${identity.channel}:${identity.externalActorId}`);
    return sandboxSource
      ? { ...identity, sourceEnvironment: "sandbox" as const, sourceSessionId: identity.sourceSessionId ?? sandboxSource.sessionId }
      : { ...identity, sourceEnvironment: "live" as const };
  });
}

export function actorToNetworkCandidate(state: OpenPresenceState, presence: Presence, actor: SandboxActor, source: NetworkCandidate["candidateSource"] = "sandbox-directory"): NetworkCandidate {
  const actorId = actor.id;
  const identity = relationshipIdentity(state, presence.channel, actorId, presence.id, presence.environment ?? "sandbox");
  const person = identity ? state.people.find((item) => item.id === identity.personId) : undefined;
  const relationship = person ? relationshipForPerson(state, person.id) : undefined;
  const evidence = [actor.profile?.bio, actor.profile?.location, ...(actor.profile?.roles ?? []), ...(actor.profile?.skills ?? [])].filter(Boolean) as string[];
  const refs: EvidenceRef[] = [{ kind: "community_directory", id: actor.id, sourcePresenceId: presence.id }];
  return { candidateId: person?.id ?? actorId, actorId, personId: person?.id, displayName: actor.displayName, handle: actor.handle, candidateSource: source, relationshipStatus: person?.memoryState === "active" && relationship?.state === "active" ? "remembered" : relationshipStatus(state, presence, actorId, actor.displayName), relevantEvidence: refs, shareableEvidence: refs, evidence };
}

export function factForCorrection(relationshipId: string, statement: string, visibility: RelationshipVisibility, sourcePresenceId: string): RelationshipFact {
  return { id: `relationship-fact_${Math.random().toString(36).slice(2, 10)}`, relationshipId, statement: statement.trim(), epistemicKind: "operator_provided", confidence: "high", provenanceRefs: [{ kind: "operator_input", id: `operator_${Math.random().toString(36).slice(2, 10)}`, sourcePresenceId, observedAt: now() }], visibility, validFrom: now(), createdAt: now() };
}
