import type { OpenPresenceState, PlaygroundSession } from "./types";

/**
 * A complete, session-scoped Sandbox world snapshot. This is deliberately
 * separate from the temporal snapshot: time is only one part of a replayable
 * world. The remaining collections are copied by the runtime boundary and
 * never include another Presence's records.
 */
export interface SandboxWorldSnapshot {
  version: 1;
  session: PlaygroundSession;
  collections: Record<string, unknown[]>;
  digest: string;
}

const SESSION_COLLECTIONS = [
  "events", "socialDecisions", "socialStrategyRetrievalRuns", "autobiographicalEvents",
  "autobiographicalReflections", "resourceUsageEvents", "socialIntents", "executions",
  "outcomes", "attentionTests", "capabilityTrials", "publications", "assetUsages",
  "assignments", "assignmentRuns", "assignmentContributions",
  "sourceEvidence", "claimGrounding", "preferenceEvidence", "originalPostRehearsals",
  "assets", "perceptions", "assetResearchSessions", "mirrorObjects", "mirrorEvents",
  "conversationEpisodes", "people", "personIdentities",
  "relationships", "relationshipFacts", "relationshipOpenLoops", "recommendationRecords",
  "introductionRecords", "sandboxActors", "networkSearches", "networkIntroductions",
  "publicRequests", "explorationFindings", "explorationSessions", "attentionEpisodes",
] as const;

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  throw new Error("Sandbox replay values must be JSON-compatible.");
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function sessionItems(state: OpenPresenceState, key: string, sessionId: string): unknown[] {
  const values = (state as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(values)) return [];
  return clone(values.filter((item) => Boolean(item && typeof item === "object" && (item as { sessionId?: string }).sessionId === sessionId)));
}

export function captureSandboxWorld(state: OpenPresenceState, sessionId: string): SandboxWorldSnapshot {
  const session = state.playgroundSessions.find((item) => item.id === sessionId);
  if (!session) throw new Error(`Sandbox session ${sessionId} was not found.`);
  const collections = Object.fromEntries(SESSION_COLLECTIONS.map((key) => [key, sessionItems(state, key, sessionId)]));
  const base = { version: 1 as const, session: clone(session), collections };
  return { ...base, digest: hash(canonical(base)) };
}

/** Return a stable digest suitable for replay equivalence evidence. */
export function sandboxWorldDigest(snapshot: Omit<SandboxWorldSnapshot, "digest"> | SandboxWorldSnapshot): string {
  const { digest: _digest, ...base } = snapshot as SandboxWorldSnapshot;
  return hash(canonical(base));
}

/** Restore only one isolated world's records; other sessions remain untouched. */
export function restoreSandboxWorld(source: OpenPresenceState, snapshot: SandboxWorldSnapshot): OpenPresenceState {
  if (snapshot.version !== 1) throw new Error(`Unsupported Sandbox replay version: ${snapshot.version}.`);
  const state = clone(source);
  const sessionId = snapshot.session.id;
  state.playgroundSessions = state.playgroundSessions.some((item) => item.id === sessionId)
    ? state.playgroundSessions.map((item) => item.id === sessionId ? clone(snapshot.session) : item)
    : [...state.playgroundSessions, clone(snapshot.session)];
  for (const key of SESSION_COLLECTIONS) {
    const values = (state as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(values)) continue;
    const restored = snapshot.collections[key] ?? [];
    (state as unknown as Record<string, unknown>)[key] = [
      ...values.filter((item) => !(item && typeof item === "object" && (item as { sessionId?: string }).sessionId === sessionId)),
      ...clone(restored),
    ];
  }
  return state;
}

export function assertSandboxWorldSnapshot(snapshot: SandboxWorldSnapshot): void {
  if (snapshot.digest !== sandboxWorldDigest(snapshot)) throw new Error("Sandbox replay checkpoint digest does not match its contents.");
}
