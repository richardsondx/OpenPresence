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
  /** Presence-scoped learned state captured with the world for isolated
   * counterfactual replay. It is intentionally separate from session records
   * because live learning is normally Presence-scoped. */
  learning?: {
    presenceId: string;
    growthHypotheses: unknown[];
    growthEvidenceRecords: unknown[];
    learningCheckpoints: unknown[];
    learningCounterfactuals: unknown[];
  };
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

function learningItems(state: OpenPresenceState, key: string, presenceId: string, sandboxSessionId?: string): unknown[] {
  const values = (state as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(values)) return [];
  return clone(values.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { presenceId?: string; originatingPresenceId?: string; sandboxSessionId?: string };
    return (record.presenceId === presenceId || record.originatingPresenceId === presenceId)
      && (!sandboxSessionId || record.sandboxSessionId === sandboxSessionId);
  }));
}

function namespacedLearningRecord(value: unknown, key: string, sessionId: string, idMap: Map<string, string>): unknown {
  if (!value || typeof value !== "object") return value;
  const record = clone(value) as Record<string, unknown>;
  if (record.sandboxSessionId === sessionId) return record;
  const originalId = typeof record.id === "string" ? record.id : undefined;
  if (originalId) {
    const nextId = `${originalId}:sandbox:${sessionId}`;
    idMap.set(originalId, nextId);
    record.id = nextId;
  }
  if (key === "growthHypotheses") {
    for (const field of ["supportingEvidenceIds", "contradictingEvidenceIds", "derivedFrom"] as const) {
      if (Array.isArray(record[field])) record[field] = record[field].map((item) => typeof item === "string" ? idMap.get(item) ?? item : item);
    }
  }
  if (key === "learningCheckpoints") {
    for (const field of ["hypothesisIds", "evidenceIds"] as const) {
      if (Array.isArray(record[field])) record[field] = record[field].map((item) => typeof item === "string" ? idMap.get(item) ?? item : item);
    }
    for (const field of ["parentCheckpointId", "parentCheckpointHash"] as const) {
      if (typeof record[field] === "string" && field === "parentCheckpointId") record[field] = idMap.get(record[field] as string) ?? record[field];
    }
  }
  if (key === "learningCounterfactuals" && typeof record.checkpointId === "string") record.checkpointId = idMap.get(record.checkpointId) ?? record.checkpointId;
  return { ...record, sandboxSessionId: sessionId };
}

export function captureSandboxWorld(state: OpenPresenceState, sessionId: string): SandboxWorldSnapshot {
  const session = state.playgroundSessions.find((item) => item.id === sessionId);
  if (!session) throw new Error(`Sandbox session ${sessionId} was not found.`);
  const collections = Object.fromEntries(SESSION_COLLECTIONS.map((key) => [key, sessionItems(state, key, sessionId)]));
  const learning = {
    presenceId: session.presenceId,
    growthHypotheses: learningItems(state, "growthHypotheses", session.presenceId, session.source === "replay" ? session.id : undefined),
    growthEvidenceRecords: learningItems(state, "growthEvidenceRecords", session.presenceId, session.source === "replay" ? session.id : undefined),
    learningCheckpoints: learningItems(state, "learningCheckpoints", session.presenceId, session.source === "replay" ? session.id : undefined),
    learningCounterfactuals: learningItems(state, "learningCounterfactuals", session.presenceId, session.source === "replay" ? session.id : undefined),
  };
  const base = { version: 1 as const, session: clone(session), collections, learning };
  return { ...base, digest: hash(canonical(base)) };
}

/** Return a stable digest suitable for replay equivalence evidence. */
export function sandboxWorldDigest(snapshot: Omit<SandboxWorldSnapshot, "digest"> | SandboxWorldSnapshot): string {
  const { digest: _digest, ...base } = snapshot as SandboxWorldSnapshot;
  return hash(canonical(base));
}

/** Restore only one isolated world's records; other sessions remain untouched. */
export function restoreSandboxWorld(source: OpenPresenceState, snapshot: SandboxWorldSnapshot, options: { restoreLearning?: boolean; learningSessionId?: string } = {}): OpenPresenceState {
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
  if (options.restoreLearning && snapshot.learning) {
    const learningKeys = ["growthHypotheses", "growthEvidenceRecords", "learningCheckpoints", "learningCounterfactuals"] as const;
    const idMap = new Map<string, string>();
    for (const key of learningKeys) for (const item of snapshot.learning[key]) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        const originalId = (item as { id: string }).id;
        idMap.set(originalId, (item as { sandboxSessionId?: string }).sandboxSessionId === options.learningSessionId
          ? originalId
          : `${originalId}:sandbox:${options.learningSessionId}`);
      }
    }
    for (const key of learningKeys) {
      const values = (state as unknown as Record<string, unknown>)[key];
      if (!Array.isArray(values)) continue;
      const learningSessionId = options.learningSessionId;
      const learningValues = clone(snapshot.learning[key]);
      (state as unknown as Record<string, unknown>)[key] = [
        ...values.filter((item) => {
          if (!item || typeof item !== "object") return true;
          const record = item as { presenceId?: string; originatingPresenceId?: string; sandboxSessionId?: string };
          return learningSessionId
            ? record.sandboxSessionId !== learningSessionId
            : Boolean(record.sandboxSessionId) || (record.presenceId !== snapshot.learning!.presenceId && record.originatingPresenceId !== snapshot.learning!.presenceId);
        }),
        ...learningValues.map((item) => learningSessionId ? namespacedLearningRecord(item, key, learningSessionId, idMap) : item),
      ];
    }
  }
  return state;
}

export function assertSandboxWorldSnapshot(snapshot: SandboxWorldSnapshot): void {
  if (snapshot.digest !== sandboxWorldDigest(snapshot)) throw new Error("Sandbox replay checkpoint digest does not match its contents.");
}
