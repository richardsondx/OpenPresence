import type { OpenPresenceState, Presence, PublicationMetricSnapshot } from "./types";

export type PresenceGrowthBoundarySource =
  | "recorded"
  | "presence-event"
  | "sandbox-environment"
  | "bridge"
  | "native-connection"
  | "unknown";

export interface PresenceGrowthBoundary {
  startAt?: string;
  source: PresenceGrowthBoundarySource;
}

function validTime(value: string | undefined) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : undefined;
}

function earliest(values: Array<string | undefined>) {
  return values
    .map(validTime)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
}

function presenceFor(state: OpenPresenceState, presenceId: string): Presence | undefined {
  return state.presences?.find((presence) => presence.id === presenceId)
    ?? (state.presence?.id === presenceId ? state.presence : undefined);
}

/**
 * Find the earliest trustworthy lifecycle marker for a Presence. New records
 * use Presence.createdAt. Older local records are bounded by the first
 * Presence-owned artifact rather than by the account's oldest history.
 */
export function presenceGrowthBoundary(state: OpenPresenceState, presenceId: string): PresenceGrowthBoundary {
  const presence = presenceFor(state, presenceId);
  const recorded = validTime(presence?.createdAt);
  if (recorded) return { startAt: recorded, source: "recorded" };

  const candidates: Array<{ startAt: string; source: PresenceGrowthBoundarySource }> = [
    {
      startAt: earliest((state.events ?? [])
        .filter((event) => event.presenceId === presenceId && /presence (?:added|created)/i.test(event.title))
        .map((event) => event.time)),
      source: "presence-event" as const,
    },
    {
      startAt: earliest((state.sandboxEnvironments ?? [])
        .filter((environment) => environment.presenceId === presenceId)
        .map((environment) => environment.createdAt)),
      source: "sandbox-environment" as const,
    },
    {
      startAt: earliest((state.bridges ?? [])
        .filter((bridge) => bridge.presenceId === presenceId)
        .map((bridge) => bridge.createdAt)),
      source: "bridge" as const,
    },
    {
      startAt: earliest((state.nativeConnections ?? [])
        .filter((connection) => connection.presenceId === presenceId)
        .map((connection) => connection.createdAt)),
      source: "native-connection" as const,
    },
  ].flatMap((candidate) => candidate.startAt ? [{ startAt: candidate.startAt, source: candidate.source }] : [])
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
  if (candidates[0]) return candidates[0];

  return { source: "unknown" };
}

export function presenceGrowthStartAt(state: OpenPresenceState, presenceId: string) {
  return presenceGrowthBoundary(state, presenceId).startAt;
}

/** Evidence with an unknown timestamp is not safe to present as Presence performance. */
export function growthEvidenceIsInPresenceScope(state: OpenPresenceState, presenceId: string, observedAt: string | undefined) {
  const startAt = presenceGrowthStartAt(state, presenceId);
  if (!startAt || !validTime(observedAt)) return false;
  return new Date(observedAt!).getTime() >= new Date(startAt).getTime();
}

export function growthPublicationIsInPresenceScope(state: OpenPresenceState, presenceId: string, snapshot: PublicationMetricSnapshot) {
  const publication = state.mirrorObjects?.find((item) => item.id === snapshot.mirrorObjectId);
  return growthEvidenceIsInPresenceScope(state, presenceId, publication?.occurredAt ?? snapshot.observedAt)
    && growthEvidenceIsInPresenceScope(state, presenceId, snapshot.observedAt);
}

export function growthWindowStartAt(state: OpenPresenceState, presenceId: string, periodDays: number, now = Date.now()) {
  const periodStart = now - periodDays * 86_400_000;
  const presenceStart = presenceGrowthStartAt(state, presenceId);
  const presenceStartTime = presenceStart ? new Date(presenceStart).getTime() : Number.NaN;
  return new Date(Math.max(periodStart, Number.isFinite(presenceStartTime) ? presenceStartTime : periodStart)).toISOString();
}
