import type {
  EvidenceRef,
  MirrorObject,
  NetworkCandidate,
  OpenPresenceState,
  Person,
  PersonIdentity,
  PersonMemorySource,
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

function sourceToMemorySource(source: "operator" | "current-context" | "watched"): PersonMemorySource {
  if (source === "operator") return "operator";
  if (source === "watched") return "watchlist";
  return "agent";
}

export function evidenceRefFromMirror(object: MirrorObject): EvidenceRef {
  return { kind: "mirror_object", id: object.id, sourcePresenceId: object.presenceId, observedAt: object.observedAt };
}

export function relationshipVisibilityForMirror(object: MirrorObject): RelationshipVisibility {
  if (object.visibility === "public") return "public";
  return `presence:${object.presenceId}`;
}

export function relationshipIdentity(state: OpenPresenceState, channel: string, externalActorId: string, sourcePresenceId?: string, sourceEnvironment?: PresenceEnvironment) {
  return (state.personIdentities ?? []).find((identity) => identity.channel === channel
    && identity.externalActorId === externalActorId
    && (!sourcePresenceId || identity.sourcePresenceId === sourcePresenceId)
    && (!sourceEnvironment || (identity.sourceEnvironment ?? "live") === sourceEnvironment));
}

export function relationshipForPerson(state: OpenPresenceState, personId: string) {
  return state.relationships.find((relationship) => relationship.personId === personId);
}

/**
 * Return one remembered person per channel identity in a Presence scope.
 *
 * Restored workspaces can contain both the canonical Person record and legacy
 * Sandbox actor records for the same real X account. Those records are useful
 * for replay history, but they must not become duplicate relationship cards.
 * Prefer the record with relationship context, then a stable non-actor Person
 * record, then the most complete/recent identity.
 */
export function peopleForPresence(state: OpenPresenceState, presence: Presence): Person[] {
  const environment = presence.environment ?? "live";
  const scopedIdentities = (state.personIdentities ?? []).filter((identity) =>
    identity.sourcePresenceId === presence.id
    && (identity.sourceEnvironment ?? "live") === environment
    && identity.channel === presence.channel
    && Boolean(identity.externalActorId),
  );
  const identityByPersonId = new Map<string, PersonIdentity>();
  for (const identity of scopedIdentities) {
    if (!identityByPersonId.has(identity.personId)) identityByPersonId.set(identity.personId, identity);
  }

  const groups = new Map<string, Array<{ person: Person; identity: PersonIdentity }>>();
  for (const person of state.people) {
    if (person.memoryState !== "active") continue;
    const identity = identityByPersonId.get(person.id);
    if (!identity) continue;
    const key = `${identity.channel}:${identity.externalActorId}`;
    const group = groups.get(key) ?? [];
    group.push({ person, identity });
    groups.set(key, group);
  }

  const relationshipRank = (personId: string) => {
    const relationship = (state.relationships ?? []).find((item) => item.personId === personId);
    return relationship?.state === "active" ? 1 : 0;
  };
  const identityRank = (identity: PersonIdentity) => (
    (identity.avatarUrl ? 4 : 0)
    + (identity.hydrationState === "hydrated" ? 2 : identity.hydrationState === "partial" ? 1 : 0)
    + (identity.verificationMethod === "connector_verified" ? 2 : 0)
  );
  const timestampRank = (value?: string | null) => value ? new Date(value).getTime() || 0 : 0;

  return [...groups.values()].map((candidates) => candidates.sort((left, right) =>
    relationshipRank(right.person.id) - relationshipRank(left.person.id)
    || Number(!/^actor_/.test(right.person.id)) - Number(!/^actor_/.test(left.person.id))
    || identityRank(right.identity) - identityRank(left.identity)
    || timestampRank(right.person.updatedAt) - timestampRank(left.person.updatedAt)
    || timestampRank(right.identity.lastHydratedAt) - timestampRank(left.identity.lastHydratedAt)
    || timestampRank(left.person.createdAt) - timestampRank(right.person.createdAt)
    || left.person.id.localeCompare(right.person.id),
  )[0]!.person).sort((left, right) => timestampRank(right.updatedAt) - timestampRank(left.updatedAt) || left.id.localeCompare(right.id));
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

export function isPlaceholderIdentity(str?: string): boolean {
  if (!str) return true;
  const trimmed = str.trim();
  if (!trimmed) return true;
  if (/^@?\d{8,}$/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === "x user" ||
    lower === "unknown x account" ||
    lower === "profile details pending" ||
    lower === "profile details unavailable" ||
    lower === "unknown account"
  );
}

export function deriveIdentityHydrationState(
  channel: string,
  displayName?: string,
  handle?: string
): import("./types").IdentityHydrationState {
  const hasValidName = !isPlaceholderIdentity(displayName);
  const hasValidHandle = !isPlaceholderIdentity(handle);

  if (channel === "x") {
    if (hasValidHandle && hasValidName) return "hydrated";
    if (hasValidHandle || hasValidName) return "partial";
    return "unhydrated";
  }

  // Channels without handles (e.g. Skool, Discord, etc.)
  if (hasValidName) return "hydrated";
  return "unhydrated";
}

export function extractIdentityHydrationLeads(
  channel: import("./types").ChannelId,
  text: string,
  sourceRef: string
): import("./types").IdentityHydrationLead[] {
  if (!text) return [];
  const leads: import("./types").IdentityHydrationLead[] = [];
  const handleMatches = text.matchAll(/@([a-zA-Z0-9_]{1,30})\b/g);
  const seen = new Set<string>();
  const timestamp = now();

  for (const match of handleMatches) {
    const raw = match[1];
    if (!raw || seen.has(raw.toLowerCase()) || isPlaceholderIdentity(raw)) continue;
    seen.add(raw.toLowerCase());
    leads.push({
      channel,
      possibleHandle: raw,
      sourceRef,
      observedAt: timestamp,
    });
  }
  return leads;
}

export function resolveCanonicalPerson(
  state: OpenPresenceState,
  personId: string,
  presenceId?: string
): {
  displayName: string;
  handleLabel: string;
  rawHandle?: string;
  avatarUrl?: string;
  hydrationState: import("./types").IdentityHydrationState;
  isPlaceholder: boolean;
} {
  const person = state.people.find((p) => p.id === personId);
  const activePresenceId = presenceId ?? state.activePresenceId ?? state.presence?.id;
  const activePresence = state.presences.find((p) => p.id === activePresenceId) ?? state.presence;
  const targetEnv = activePresence?.environment ?? "live";

  // Identity is Presence- and environment-scoped. Falling back to an
  // identity from another Presence/world can make a remembered X person
  // appear as a sandbox placeholder (or vice versa).
  const identity = state.personIdentities.find(
    (item) =>
      item.personId === personId &&
      (!activePresenceId || item.sourcePresenceId === activePresenceId) &&
      (item.sourceEnvironment ?? "live") === targetEnv
  );

  const actorId = identity?.externalActorId;
  const matchingMirror = actorId
    ? state.mirrorObjects.find(
        (m) =>
          (!activePresenceId || m.presenceId === activePresenceId) &&
          (m.environment ?? "live") === targetEnv &&
          m.author?.externalRef?.id === actorId &&
          m.author?.displayName &&
          !isPlaceholderIdentity(m.author.displayName)
      )
    : undefined;

  const rawName = (!isPlaceholderIdentity(person?.displayName) ? person?.displayName : undefined)
    ?? (!isPlaceholderIdentity(identity?.displayName) ? identity?.displayName : undefined)
    ?? (!isPlaceholderIdentity(matchingMirror?.author?.displayName) ? matchingMirror?.author?.displayName : undefined);

  const rawHandle = (!isPlaceholderIdentity(identity?.handle) ? identity?.handle : undefined)
    ?? (!isPlaceholderIdentity(matchingMirror?.author?.handle) ? matchingMirror?.author?.handle : undefined);

  const avatarUrl = identity?.avatarUrl ?? matchingMirror?.author?.avatarUrl;
  const channel = identity?.channel ?? activePresence?.channel ?? "x";
  const hydrationState = identity?.hydrationState ?? deriveIdentityHydrationState(channel, rawName, rawHandle);

  const displayName = rawName ?? (rawHandle ? (rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`) : "Unknown X account");
  const handleLabel = rawHandle ? (rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`) : "Profile details pending";
  const isPlaceholder = isPlaceholderIdentity(rawName) && isPlaceholderIdentity(rawHandle);

  return { displayName, handleLabel, rawHandle, avatarUrl, hydrationState, isPlaceholder };
}

export function createRememberedPerson(
  input: {
    agentId: string;
    presenceId: string;
    channel: import("./types").ChannelId;
    externalActorId: string;
    displayName: string;
    handle?: string;
    profileUrl?: string;
    avatarUrl?: string;
    personId?: string;
    sourceEnvironment?: PresenceEnvironment;
    sourceSessionId?: string;
    source: "operator" | "current-context" | "watched";
    evidenceKind?: import("./types").IdentitySourceKind;
  },
  existingPeople: Person[],
  existingIdentities: PersonIdentity[],
  existingRelationships: Relationship[]
) {
  const timestamp = now();
  const sourceEnvironment = input.sourceEnvironment ?? "live";
  const evidenceKind = input.evidenceKind ?? (input.source === "operator" ? "operator" : "mirror_author");

  const existingIdentity = existingIdentities.find(
    (identity) =>
      identity.channel === input.channel &&
      identity.externalActorId === input.externalActorId &&
      identity.sourcePresenceId === input.presenceId &&
      (identity.sourceEnvironment ?? "live") === sourceEnvironment
  );

  const person = existingIdentity ? existingPeople.find((item) => item.id === existingIdentity.personId) : undefined;
  const personId = person?.id ?? input.personId ?? `person_${Math.random().toString(36).slice(2, 10)}`;

  // Protect against placeholders overwriting known names
  const candidateName = input.displayName.trim();
  const resolvedDisplayName = !isPlaceholderIdentity(candidateName)
    ? candidateName
    : (!isPlaceholderIdentity(person?.displayName) ? person!.displayName : candidateName);

  const nextPerson: Person = person
    ? { ...person, displayName: resolvedDisplayName, memorySource: person.memorySource ?? (existingIdentity?.verificationMethod === "operator_confirmed" ? "operator" : sourceToMemorySource(input.source)), updatedAt: timestamp }
    : { id: personId, agentId: input.agentId, displayName: resolvedDisplayName, memoryState: "active", memorySource: sourceToMemorySource(input.source), createdAt: timestamp, updatedAt: timestamp };

  const candidateHandle = input.handle?.trim();
  const resolvedHandle = !isPlaceholderIdentity(candidateHandle)
    ? candidateHandle
    : (!isPlaceholderIdentity(existingIdentity?.handle) ? existingIdentity!.handle : undefined);

  const candidateAvatar = input.avatarUrl?.trim();
  const resolvedAvatar = candidateAvatar || existingIdentity?.avatarUrl;

  const hydrationState = deriveIdentityHydrationState(input.channel, resolvedDisplayName, resolvedHandle);

  const displayNameEvidence: import("./types").IdentityFactEvidence | undefined = !isPlaceholderIdentity(candidateName)
    ? { kind: evidenceKind, observedAt: timestamp }
    : existingIdentity?.displayNameEvidence;

  const handleEvidence: import("./types").IdentityFactEvidence | undefined = !isPlaceholderIdentity(candidateHandle)
    ? { kind: evidenceKind, observedAt: timestamp }
    : existingIdentity?.handleEvidence;

  const avatarEvidence: import("./types").IdentityFactEvidence | undefined = candidateAvatar
    ? { kind: evidenceKind, observedAt: timestamp }
    : existingIdentity?.avatarEvidence;

  const identity: PersonIdentity = existingIdentity
    ? {
        ...existingIdentity,
        displayName: resolvedDisplayName,
        handle: resolvedHandle,
        profileUrl: input.profileUrl?.trim() || existingIdentity.profileUrl,
        avatarUrl: resolvedAvatar,
        sourceEnvironment,
        sourceSessionId: input.sourceSessionId ?? existingIdentity.sourceSessionId,
        hydrationState,
        displayNameEvidence,
        handleEvidence,
        avatarEvidence,
        lastHydratedAt: hydrationState === "hydrated" ? timestamp : existingIdentity.lastHydratedAt,
      }
    : {
        id: `person-identity_${Math.random().toString(36).slice(2, 10)}`,
        personId,
        channel: input.channel,
        externalActorId: input.externalActorId,
        displayName: resolvedDisplayName,
        handle: resolvedHandle,
        profileUrl: input.profileUrl?.trim() || undefined,
        avatarUrl: resolvedAvatar,
        sourcePresenceId: input.presenceId,
        sourceEnvironment,
        sourceSessionId: input.sourceSessionId,
        verificationMethod: input.source === "operator" ? "operator_confirmed" : "connector_verified",
        hydrationState,
        displayNameEvidence,
        handleEvidence,
        avatarEvidence,
        lastHydratedAt: hydrationState === "hydrated" ? timestamp : undefined,
        createdAt: timestamp,
      };

  const relationship = existingRelationships.find((item) => item.personId === personId) ?? {
    id: `relationship_${Math.random().toString(36).slice(2, 10)}`,
    agentId: input.agentId,
    personId,
    state: "active" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

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
    const sandboxSource = sandboxSources.get(`${identity.sourcePresenceId}:${identity.channel}:${identity.externalActorId}`);
    const env = identity.sourceEnvironment ?? (sandboxSource ? "sandbox" : "live");
    const sessionId = identity.sourceSessionId ?? sandboxSource?.sessionId;
    const hydrationState = identity.hydrationState ?? deriveIdentityHydrationState(identity.channel, identity.displayName, identity.handle);
    return {
      ...identity,
      sourceEnvironment: env,
      ...(sessionId ? { sourceSessionId: sessionId } : {}),
      hydrationState,
    };
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
