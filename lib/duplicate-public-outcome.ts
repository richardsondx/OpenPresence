import type { EntityRef, Execution, MirrorObject, OpenPresenceState } from "./types";

export interface DuplicatePublicOutcomeEvidence {
  targetRef: EntityRef;
  target?: MirrorObject;
  replies: MirrorObject[];
}

/**
 * Return true when the Social Mirror already proves that this Presence has
 * authored a reply under the target. This is deliberately world evidence,
 * not an execution-history shortcut: a lost acknowledgement or an older
 * workspace snapshot must not make a fresh worker write the same thread again.
 */
export function hasObservedOwnReplyForTarget(
  state: Pick<OpenPresenceState, "mirrorObjects" | "presences" | "presence">,
  input: Pick<Execution, "presenceId" | "environment" | "target" | "externalRef">,
) {
  const target = input.target;
  if (!target || input.environment === "sandbox" || target.type !== "x.post") return false;
  const presence = state.presences.find((item) => item.id === input.presenceId) ?? state.presence;
  const expectedHandle = presence?.handle?.replace(/^@/, "").trim().toLowerCase();
  return state.mirrorObjects.some((object) => {
    if (object.presenceId !== input.presenceId || object.environment === "sandbox" || object.archived) return false;
    if (object.objectType !== "reply") return false;
    if (object.parentExternalRef?.type !== target.type || object.parentExternalRef.id !== target.id) return false;
    if (input.externalRef && object.externalRef.type === input.externalRef.type && object.externalRef.id === input.externalRef.id) return false;
    // Keep the handle as a conservative compatibility fallback for legacy
    // Mirror rows that predate actorPresenceId attribution.
    return object.actorPresenceId === input.presenceId || Boolean(expectedHandle && object.author?.handle?.replace(/^@/, "").trim().toLowerCase() === expectedHandle);
  });
}

/**
 * Derive duplicate-public-action evidence from observed world state. This is
 * intentionally a projection of the Social Mirror, not incident metadata:
 * recovery UI and safety enforcement therefore describe the same reality.
 */
export function duplicatePublicOutcomeEvidence(
  state: Pick<OpenPresenceState, "mirrorObjects">,
  presenceId?: string,
): DuplicatePublicOutcomeEvidence[] {
  if (!presenceId) return [];
  const byTarget = new Map<string, MirrorObject[]>();

  for (const object of state.mirrorObjects) {
    if (object.presenceId !== presenceId || object.environment === "sandbox" || object.archived) continue;
    if (object.actorPresenceId !== presenceId || object.objectType !== "reply" || !object.parentExternalRef) continue;
    const key = `${object.parentExternalRef.type}:${object.parentExternalRef.id}`;
    const group = byTarget.get(key) ?? [];
    if (!group.some((candidate) => candidate.externalRef.type === object.externalRef.type && candidate.externalRef.id === object.externalRef.id)) {
      group.push(object);
    }
    byTarget.set(key, group);
  }

  return [...byTarget.values()].flatMap((replies) => {
    if (replies.length < 2) return [];
    const targetRef = replies[0]!.parentExternalRef!;
    const target = state.mirrorObjects.find((object) => object.presenceId === presenceId
      && object.environment !== "sandbox"
      && !object.archived
      && object.externalRef.type === targetRef.type
      && object.externalRef.id === targetRef.id);
    return [{ targetRef, target, replies }];
  });
}
