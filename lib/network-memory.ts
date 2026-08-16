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
} from "./types";

const now = () => new Date().toISOString();

export function evidenceRefFromMirror(object: MirrorObject): EvidenceRef {
  return { kind: "mirror_object", id: object.id, sourcePresenceId: object.presenceId, observedAt: object.observedAt };
}

export function relationshipVisibilityForMirror(object: MirrorObject): RelationshipVisibility {
  if (object.visibility === "public") return "public";
  return `presence:${object.presenceId}`;
}

export function relationshipIdentity(state: OpenPresenceState, channel: string, externalActorId: string) {
  return state.personIdentities.find((identity) => identity.channel === channel && identity.externalActorId === externalActorId);
}

export function relationshipForPerson(state: OpenPresenceState, personId: string) {
  return state.relationships.find((relationship) => relationship.personId === personId);
}

export function personForMirrorAuthor(state: OpenPresenceState, object: MirrorObject) {
  const externalActorId = object.author?.externalRef?.id;
  if (!externalActorId || !object.author?.externalRef?.type) return undefined;
  return relationshipIdentity(state, object.channelId, externalActorId)
    ? state.people.find((person) => person.id === relationshipIdentity(state, object.channelId, externalActorId)?.personId)
    : undefined;
}

function hasPresenceReplyToActor(mirror: MirrorObject[], presenceId: string, actorId: string) {
  const actorObjects = mirror.filter((item) => item.author?.externalRef?.id === actorId && item.actorPresenceId !== presenceId);
  const actorObjectIds = new Set(actorObjects.map((item) => item.externalRef.id));
  return mirror.some((item) => item.actorPresenceId === presenceId && item.parentExternalRef && actorObjectIds.has(item.parentExternalRef.id));
}

export function relationshipCurationEligible(state: OpenPresenceState, object: MirrorObject, presenceId = object.presenceId) {
  const actorId = object.author?.externalRef?.id;
  if (!actorId || object.actorPresenceId === presenceId || ["like", "reaction"].includes(object.objectType)) return false;
  const text = object.content?.text?.trim() ?? "";
  if (text.length < 12) return false;
  const mirror = state.mirrorObjects.filter((item) => item.presenceId === presenceId);
  return hasPresenceReplyToActor(mirror, presenceId, actorId);
}

export function relationshipStatus(state: OpenPresenceState, presence: Presence, actorId: string, displayName?: string): NetworkCandidate["relationshipStatus"] {
  const identity = relationshipIdentity(state, presence.channel, actorId);
  const person = identity ? state.people.find((item) => item.id === identity.personId) : undefined;
  const relationship = person ? relationshipForPerson(state, person.id) : undefined;
  if (person?.memoryState === "active" && relationship?.state === "active") return "remembered";
  const mirror = state.mirrorObjects.filter((item) => item.presenceId === presence.id && item.author?.externalRef?.id === actorId);
  if (mirror.length && hasPresenceReplyToActor(state.mirrorObjects, presence.id, actorId)) return "interacted";
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
    .filter((object) => object.presenceId === presenceId && object.author?.externalRef?.id && identityIds.has(object.author.externalRef.id) && visibilityAllowed(relationshipVisibilityForMirror(object), presenceId) && (!normalizedQuery || object.content?.text?.toLowerCase().includes(normalizedQuery)))
    .sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt))
    .slice(0, Math.max(1, Math.min(50, limit)));
}

export function createRememberedPerson(input: { agentId: string; presenceId: string; channel: string; externalActorId: string; displayName: string; handle?: string; profileUrl?: string; avatarUrl?: string; personId?: string; source: "operator" | "current-context" | "watched" }, existingPeople: Person[], existingIdentities: PersonIdentity[], existingRelationships: Relationship[]) {
  const timestamp = now();
  const existingIdentity = existingIdentities.find((identity) => identity.channel === input.channel && identity.externalActorId === input.externalActorId);
  const person = existingIdentity ? existingPeople.find((item) => item.id === existingIdentity.personId) : undefined;
  const personId = person?.id ?? input.personId ?? `person_${Math.random().toString(36).slice(2, 10)}`;
  const nextPerson: Person = person ?? { id: personId, agentId: input.agentId, displayName: input.displayName.trim(), memoryState: "active", createdAt: timestamp, updatedAt: timestamp };
  const identity: PersonIdentity = existingIdentity
    ? { ...existingIdentity, handle: input.handle?.trim() || existingIdentity.handle, profileUrl: input.profileUrl?.trim() || existingIdentity.profileUrl, avatarUrl: input.avatarUrl?.trim() || existingIdentity.avatarUrl }
    : { id: `person-identity_${Math.random().toString(36).slice(2, 10)}`, personId, channel: input.channel, externalActorId: input.externalActorId, handle: input.handle?.trim() || undefined, profileUrl: input.profileUrl?.trim() || undefined, avatarUrl: input.avatarUrl?.trim() || undefined, sourcePresenceId: input.presenceId, verificationMethod: input.source === "operator" ? "operator_confirmed" : "connector_verified", createdAt: timestamp };
  const relationship = existingRelationships.find((item) => item.personId === personId) ?? { id: `relationship_${Math.random().toString(36).slice(2, 10)}`, agentId: input.agentId, personId, state: "active" as const, createdAt: timestamp, updatedAt: timestamp };
  return { person: nextPerson, identity, relationship };
}

export function actorToNetworkCandidate(state: OpenPresenceState, presence: Presence, actor: SandboxActor, source: NetworkCandidate["candidateSource"] = "sandbox-directory"): NetworkCandidate {
  const actorId = actor.id;
  const identity = relationshipIdentity(state, presence.channel, actorId);
  const person = identity ? state.people.find((item) => item.id === identity.personId) : undefined;
  const relationship = person ? relationshipForPerson(state, person.id) : undefined;
  const evidence = [actor.profile?.bio, actor.profile?.location, ...(actor.profile?.roles ?? []), ...(actor.profile?.skills ?? [])].filter(Boolean) as string[];
  const refs: EvidenceRef[] = [{ kind: "community_directory", id: actor.id, sourcePresenceId: presence.id }];
  return { candidateId: person?.id ?? actorId, actorId, personId: person?.id, displayName: actor.displayName, handle: actor.handle, candidateSource: source, relationshipStatus: person?.memoryState === "active" && relationship?.state === "active" ? "remembered" : relationshipStatus(state, presence, actorId, actor.displayName), relevantEvidence: refs, shareableEvidence: refs, evidence };
}

export function factForCorrection(relationshipId: string, statement: string, visibility: RelationshipVisibility, sourcePresenceId: string): RelationshipFact {
  return { id: `relationship-fact_${Math.random().toString(36).slice(2, 10)}`, relationshipId, statement: statement.trim(), epistemicKind: "operator_provided", confidence: "high", provenanceRefs: [{ kind: "operator_input", id: `operator_${Math.random().toString(36).slice(2, 10)}`, sourcePresenceId, observedAt: now() }], visibility, validFrom: now(), createdAt: now() };
}
