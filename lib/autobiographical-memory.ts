import type { AutobiographicalEvent, OpenPresenceState, Presence } from "./types";

export interface AutobiographicalContextPacket {
  text: string;
  eventIds: string[];
}

const NEGATIVE_INTERPERSONAL_COOLDOWN_MS = 12 * 60 * 60_000;
const REFERENCE_SUPPRESSION_MS = 30 * 24 * 60 * 60_000;
const boundaryRelevance = /\b(boundar(?:y|ies)|block(?:ed|ing)?|reject(?:ed|ion)?|social consequence|social intelligence|awkward|self[- ]deprecat|when to stop|move on|leave alone)\b/i;

function eventWasPubliclyReferenced(state: OpenPresenceState, eventId: string, nowMs: number) {
  const deliveredIntentIds = new Set(state.outcomes
    .filter((outcome) => outcome.status === "succeeded")
    .map((outcome) => outcome.socialIntentId));
  return state.socialIntents.some((intent) => intent.autobiographicalEventIds?.includes(eventId)
    && intent.source !== "operator"
    && deliveredIntentIds.has(intent.id)
    && nowMs - Date.parse(intent.formedAt) < REFERENCE_SUPPRESSION_MS);
}

function requiresNegativeInterpersonalCooldown(event: AutobiographicalEvent) {
  return event.kind === "relationship_boundary" && event.facts.boundary === "blocked";
}

function reflectionFor(state: OpenPresenceState, eventId: string) {
  return state.autobiographicalReflections
    .filter((item) => item.eventId === eventId && !state.autobiographicalReflections.some((newer) => newer.supersedesReflectionId === item.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function eventRelevant(event: AutobiographicalEvent, context: string, state: OpenPresenceState) {
  if (event.kind === "relationship_boundary") return boundaryRelevance.test(context);
  const reflection = reflectionFor(state, event.id);
  const terms = reflection?.possibleRelevance ?? [];
  const normalized = context.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase().replaceAll("-", " ")));
}

/**
 * Retrieve autobiography as context, never as a content queue. Negative
 * interpersonal events are abstracted before cognition receives them: no
 * identity, timing, preceding exchange, screenshot, link, or distinctive quote.
 */
export function retrievePublicSafeAutobiographicalContext(
  state: OpenPresenceState,
  presence: Presence,
  context: string,
  nowMs = Date.now(),
): AutobiographicalContextPacket | undefined {
  const eligible = state.autobiographicalEvents
    .filter((event) => event.presenceId === presence.id && event.agentId === state.agent?.id)
    .filter((event) => eventRelevant(event, context, state))
    .filter((event) => !requiresNegativeInterpersonalCooldown(event)
      || nowMs - Date.parse(event.observedAt) >= NEGATIVE_INTERPERSONAL_COOLDOWN_MS)
    .filter((event) => !eventWasPubliclyReferenced(state, event.id, nowMs))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 3);
  if (!eligible.length) return undefined;

  const lines = eligible.map((event) => {
    if (event.kind === "relationship_boundary" && event.facts.boundary === "blocked") {
      return "A person on this channel established a clear boundary by blocking this Presence. The observation is verified, and their reason is unknown.";
    }
    if (event.kind === "relationship_boundary" && event.facts.boundary === "available") {
      return "A previously unavailable relationship became contactable again after a verified channel action. This does not itself require renewed interaction.";
    }
    const reflection = reflectionFor(state, event.id);
    return reflection?.interpretation ?? "A verified event in this Presence's history may be relevant to the current judgment.";
  });
  return {
    eventIds: eligible.map((event) => event.id),
    text: [
      "Relevant personal experience (private, factual context—not a content obligation):",
      ...lines.map((line) => `- ${line}`),
      "Use this only when it contributes naturally to the current social judgment. Silence is valid.",
      "For a relationship-boundary experience, do not identify the person directly or indirectly: omit identity, handle, timing, preceding conversation, screenshots, links, distinctive quotations, and contextual clues. Do not target, tag, invite attention toward, or speculate about the person. The independent public relevance of their work remains a separate judgment.",
    ].join("\n"),
  };
}

/** Deterministic final-boundary check for an expression that cites a negative
 * interpersonal experience. The model still owns the sentence. */
export function autobiographicalExpressionSafetyReason(
  state: OpenPresenceState,
  presenceId: string,
  eventIds: string[] | undefined,
  text: string,
) {
  if (!eventIds?.length || !text.trim()) return undefined;
  const boundaryEvents = state.autobiographicalEvents.filter((event) => eventIds.includes(event.id)
    && event.presenceId === presenceId
    && event.kind === "relationship_boundary"
    && event.facts.boundary === "blocked");
  if (!boundaryEvents.length) return undefined;
  const normalized = text.toLowerCase();
  for (const event of boundaryEvents) {
    const identity = event.counterpartyPersonId
      ? state.personIdentities.find((item) => item.personId === event.counterpartyPersonId && item.sourcePresenceId === presenceId)
      : undefined;
    const person = event.counterpartyPersonId ? state.people.find((item) => item.id === event.counterpartyPersonId) : undefined;
    const identifyingTerms = [identity?.handle?.replace(/^@/, ""), identity?.displayName, person?.displayName]
      .filter((value): value is string => Boolean(value && value.trim().length >= 3));
    if (identifyingTerms.some((value) => normalized.includes(value.toLowerCase()))) {
      return "This autobiographical expression identifies a person whose block established a no-contact boundary.";
    }
  }
  if (/\b(today|tonight|this morning|this afternoon|this evening|just got blocked|recently blocked)\b/i.test(text)) {
    return "This autobiographical expression reveals timing that could indirectly identify the person behind a relationship boundary.";
  }
  if (/@[a-z0-9_]{1,15}\b|https?:\/\/|\b(?:screenshot|the post where|our exchange|our conversation)\b/i.test(text)) {
    return "This autobiographical expression includes a handle, link, screenshot, or preceding-conversation clue that could identify the person behind a relationship boundary.";
  }
  return undefined;
}

export function autobiographicalEventsForPerson(state: OpenPresenceState, presenceId: string, personId: string) {
  return state.autobiographicalEvents
    .filter((event) => event.presenceId === presenceId && event.counterpartyPersonId === personId)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export const autobiographicalMemoryPolicy = {
  negativeInterpersonalMinimumCooldownMs: NEGATIVE_INTERPERSONAL_COOLDOWN_MS,
  negativeInterpersonalReferenceSuppressionMs: REFERENCE_SUPPRESSION_MS,
};
