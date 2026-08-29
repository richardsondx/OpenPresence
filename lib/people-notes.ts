import type { MirrorObject, OpenPresenceState, PeopleNote, Presence, PresenceDMInstructions } from "./types";

/** A small, inspectable Markdown note belongs to one Agent/Presence/person tuple. */
export function peopleNoteKey(agentId: string, presenceId: string, personId: string) {
  return `${agentId}:${presenceId}:${personId}`;
}

export function readPeopleNote(state: OpenPresenceState, presenceId: string, personId: string): PeopleNote | undefined {
  const agentId = state.agent?.id;
  const presence = state.presences.find((item) => item.id === presenceId);
  const person = state.people.find((item) => item.id === personId);
  if (!agentId || !presence || !person || person.agentId !== agentId || person.memoryState !== "active") return undefined;
  return (state.peopleNotes ?? []).find((note) => note.agentId === agentId && note.presenceId === presenceId && note.personId === personId);
}

/** Only the current Presence and requested active person can enter social cognition. */
export function cognitionSafePeopleNoteProjection(state: OpenPresenceState, presence: Presence, personId?: string) {
  if (!personId || state.agent?.id !== presenceAgentId(state, presence.id)) return undefined;
  const note = readPeopleNote(state, presence.id, personId);
  if (!note) return undefined;
  return { presenceId: presence.id, personId, markdown: note.markdown, revision: note.revision, updatedAt: note.updatedAt };
}

/** DM instructions are Presence configuration, never executable code. */
export function cognitionSafeDMInstructionsProjection(presence: Presence): PresenceDMInstructions | undefined {
  const instructions = presence.dmInstructions?.instructions.trim();
  if (!instructions) return undefined;
  return { when: "private_message_arrives", condition: presence.dmInstructions?.condition?.trim().slice(0, 1_000) || undefined, instructions: instructions.slice(0, 8_000), revision: presence.dmInstructions!.revision, updatedAt: presence.dmInstructions!.updatedAt, provenance: { ...presence.dmInstructions!.provenance } };
}

export function cognitionSafeDMInstructionsForObject(presence: Presence, object: MirrorObject): PresenceDMInstructions | undefined {
  if (object.objectType !== "message" || object.visibility !== "direct-message") return undefined;
  return cognitionSafeDMInstructionsProjection(presence);
}

function presenceAgentId(state: OpenPresenceState, presenceId: string) {
  return state.presences.some((item) => item.id === presenceId) ? state.agent?.id : undefined;
}
