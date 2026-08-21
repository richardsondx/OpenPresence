import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { initialState, normalizeState, stateForAgent, stateForContext } from "./runtime";
import type { AgentWorkspaceSnapshot, Bridge, BridgeAdapterStatus, BrowserBody, DependencyHealth, DependencyHealthKind, DependencyHealthState, JsonValue, OpenPresenceState, OperationalRun, OperationalRunState, ProcessHeartbeat, RecoveryAttempt, RecoveryIncident, RecoveryIncidentState, ScheduledWake } from "./types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const preferredDbPath = path.join(dataDir, "openpresence-genny-restored-full-v2.db");
const restoredDefaultPath = path.join(dataDir, "openpresence-genny-restored-safe.db");
const defaultDbPath = fs.existsSync(preferredDbPath)
  ? preferredDbPath
  : fs.existsSync(restoredDefaultPath)
    ? restoredDefaultPath
    : path.join(dataDir, "openpresence.db");
const sqlite = new Database(process.env.OPENPRESENCE_DB_PATH ?? defaultDbPath);
sqlite.pragma("journal_mode = WAL");
// Chrome Bridge heartbeats and the Presence worker can touch the same local
// database concurrently. Wait briefly for the writer instead of surfacing a
// transient SQLITE_BUSY as a hung or failed interface request.
sqlite.pragma("busy_timeout = 5000");
const db = drizzle(sqlite);

type StateContext = { agentId?: string | null; presenceId?: string | null };
type StateCache = { updatedAt: string; state: OpenPresenceState };
let stateCache: StateCache | undefined;

type UsageWorkspace = Pick<OpenPresenceState, "agent" | "presences" | "resourceUsageEvents">;

/** Read the small usage projection without normalizing the full operational workspace. */
export function readUsageWorkspaces(): UsageWorkspace[] {
  const rows = sqlite.prepare(`
    SELECT
      json_extract(payload, '$.agent') AS agent,
      json_extract(payload, '$.presences') AS presences,
      json_extract(payload, '$.resourceUsageEvents') AS resource_usage_events
    FROM app_state WHERE id = 1
    UNION ALL
    SELECT
      json_extract(payload, '$.agent') AS agent,
      json_extract(payload, '$.presences') AS presences,
      json_extract(payload, '$.resourceUsageEvents') AS resource_usage_events
    FROM agent_workspaces
  `).all() as Array<{ agent?: string | null; presences?: string | null; resource_usage_events?: string | null }>;
  return rows.flatMap((row) => {
    try {
      return [{
        agent: row.agent ? JSON.parse(row.agent) as UsageWorkspace["agent"] : null,
        presences: row.presences ? JSON.parse(row.presences) as UsageWorkspace["presences"] : [],
        resourceUsageEvents: row.resource_usage_events ? JSON.parse(row.resource_usage_events) as UsageWorkspace["resourceUsageEvents"] : [],
      }];
    } catch {
      return [];
    }
  });
}

// app_state is retained as a compatibility read model for the first local release.
// The domain collections below are the normalized write projection used for audit,
// migrations, and future queries. All mutations still pass through writeState.
db.run(sql`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)`);
sqlite.exec("CREATE TABLE IF NOT EXISTS agent_workspaces (agent_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS agent_workspace_revisions (agent_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)");
// Bridge liveness is high-frequency operational telemetry. Keep it separate
// from the monolithic Agent workspace so a five-second heartbeat does not
// rewrite the full compatibility snapshot or advance workspace state.
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_health (bridge_id TEXT PRIMARY KEY, state TEXT NOT NULL, adapter_status TEXT NOT NULL, last_heartbeat_at TEXT, last_seen_at TEXT, last_sync_at TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("INSERT INTO agent_workspace_revisions (agent_id, revision, updated_at) SELECT agent_id, 0, updated_at FROM agent_workspaces WHERE agent_id NOT IN (SELECT agent_id FROM agent_workspace_revisions)");
const normalizedTables = [
  "agents", "agent_files", "provider_connections", "asset_provider_connections", "agent_model_profiles", "agent_tool_bindings", "presences", "execution_envelopes", "conversations", "presence_chat_sessions", "messages", "change_sets", "standing_intents", "publishing_plans", "social_intents", "executions", "outcomes", "publications", "asset_usages", "source_evidence", "claim_grounding", "library_sources", "assets", "assignment_runs", "skills", "agent_skills", "content_drops", "channel_definitions", "native_channel_connections", "bridges", "mirror_objects", "mirror_events", "bridge_sync", "conversation_episodes", "assignment_contributions", "people", "person_identities", "relationships", "relationship_facts", "relationship_open_loops", "recommendation_records", "introduction_records", "scenarios", "scenario_versions", "scenario_runs", "scenario_run_provenance", "scenario_evaluations",
  "operational_runs", "scheduled_wakes", "dependency_health", "recovery_incidents", "recovery_attempts", "browser_bodies",
];
for (const table of normalizedTables) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, agent_id TEXT, parent_id TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

// Operational autonomy indexed tables & high-frequency models (Phase 1)
sqlite.exec("CREATE TABLE IF NOT EXISTS operational_runs_idx (id TEXT PRIMARY KEY, presence_id TEXT, execution_id TEXT, state TEXT NOT NULL, stage TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT, eligible_at TEXT, next_wake_at TEXT, last_progress_at TEXT, last_heartbeat_at TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS scheduled_wakes_idx (id TEXT PRIMARY KEY, presence_id TEXT, wake_at TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT, state TEXT NOT NULL, payload TEXT, updated_at TEXT NOT NULL)");
try { sqlite.exec("ALTER TABLE scheduled_wakes_idx ADD COLUMN created_at TEXT"); } catch { /* Existing databases already have the column. */ }
sqlite.exec("CREATE TABLE IF NOT EXISTS dependency_health_live (id TEXT PRIMARY KEY, presence_id TEXT, dependency TEXT NOT NULL, state TEXT NOT NULL, consecutive_failures INTEGER NOT NULL DEFAULT 0, circuit_until TEXT, current_incident_id TEXT, metadata TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS recovery_incidents_live (id TEXT PRIMARY KEY, root_cause_key TEXT NOT NULL, dependency_id TEXT NOT NULL, presence_id TEXT, state TEXT NOT NULL, recovery_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, safe_summary TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS recovery_attempts_log (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, attempt_number INTEGER NOT NULL, step TEXT NOT NULL, outcome TEXT NOT NULL, error TEXT, timestamp TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS process_heartbeats (process_id TEXT PRIMARY KEY, process_type TEXT NOT NULL, last_heartbeat_at TEXT NOT NULL, metadata TEXT)");
sqlite.exec("CREATE TABLE IF NOT EXISTS body_sessions (presence_id TEXT PRIMARY KEY, mode TEXT NOT NULL, ownership TEXT NOT NULL, state TEXT NOT NULL, expected_identity TEXT, verified_identity TEXT, last_healthy_at TEXT, profile_dir TEXT, updated_at TEXT NOT NULL)");

sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_credentials (bridge_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL, revoked_at TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS channel_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL, key_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS provider_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL, key_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)");

export function readBridgeCredentialMetadata(bridgeId: string) {
  const row = sqlite.prepare("SELECT key_prefix, revoked_at FROM bridge_credentials WHERE bridge_id = ?").get(bridgeId) as { key_prefix: string; revoked_at?: string | null } | undefined;
  return row ? { keyPrefix: row.key_prefix, credentialRevokedAt: row.revoked_at ?? undefined } : undefined;
}

/** Resolve Bridge authentication without materializing the full Agent workspace. */
export function readBridgeById(bridgeId: string): Bridge | undefined {
  const row = sqlite.prepare("SELECT payload FROM bridges WHERE id = ?").get(bridgeId) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try {
    const bridge = JSON.parse(row.payload) as Record<string, unknown> & { id?: string; state?: string; updatedAt?: string };
    const health = sqlite.prepare("SELECT state, adapter_status, last_heartbeat_at, last_seen_at, last_sync_at, updated_at FROM bridge_health WHERE bridge_id = ?").get(bridgeId) as { state: string; adapter_status: string; last_heartbeat_at?: string; last_seen_at?: string; last_sync_at?: string; updated_at: string } | undefined;
    if (health && (!bridge.updatedAt || health.updated_at > bridge.updatedAt)) Object.assign(bridge, { state: health.state, adapterStatus: health.adapter_status, lastHeartbeatAt: health.last_heartbeat_at, lastSeenAt: health.last_seen_at, lastSyncAt: health.last_sync_at, updatedAt: health.updated_at });
    return bridge as unknown as Bridge;
  } catch { return undefined; }
}

function hydrateBridgeCredentials(state: OpenPresenceState): OpenPresenceState {
  return { ...state, bridges: state.bridges.map((bridge) => {
    const metadata = readBridgeCredentialMetadata(bridge.id);
    return metadata ? { ...bridge, ...metadata } : bridge;
  }) };
}

/**
 * Bridge liveness is intentionally stored outside app_state. Re-merge that
 * operational read model whenever state is read so the UI and connector
 * routes see the same heartbeat that /api/bridge/status reports, without
 * invalidating the workspace cache on every heartbeat.
 */
function hydrateBridgeHealth(state: OpenPresenceState): OpenPresenceState {
  const rows = sqlite.prepare("SELECT bridge_id, state, adapter_status, last_heartbeat_at, last_seen_at, last_sync_at, updated_at FROM bridge_health").all() as Array<{
    bridge_id: string;
    state: string;
    adapter_status: string;
    last_heartbeat_at?: string | null;
    last_seen_at?: string | null;
    last_sync_at?: string | null;
    updated_at: string;
  }>;
  if (!rows.length) return state;
  const health = new Map(rows.map((row) => [row.bridge_id, row]));
  return {
    ...state,
    bridges: state.bridges.map((bridge) => {
      const live = health.get(bridge.id);
      if (!live) return bridge;
      return {
        ...bridge,
        state: live.state as Bridge["state"],
        adapterStatus: live.adapter_status as BridgeAdapterStatus,
        lastHeartbeatAt: live.last_heartbeat_at ?? bridge.lastHeartbeatAt,
        lastSeenAt: live.last_seen_at ?? bridge.lastSeenAt,
        lastSyncAt: live.last_sync_at ?? bridge.lastSyncAt,
        updatedAt: live.updated_at || bridge.updatedAt,
      };
    }),
  };
}

function snapshotWorkspace(state: OpenPresenceState): AgentWorkspaceSnapshot {
  const workspace = JSON.parse(JSON.stringify(state)) as Partial<OpenPresenceState>;
  delete workspace.agents;
  delete workspace.activeAgentId;
  delete workspace.agentWorkspaces;
  return workspace as AgentWorkspaceSnapshot;
}

function hydrateAgentWorkspaces(state: OpenPresenceState): OpenPresenceState {
  const rows = sqlite.prepare("SELECT agent_id, payload FROM agent_workspaces").all() as Array<{ agent_id: string; payload: string }>;
  if (!rows.length) return state;
  const revisionRows = sqlite.prepare("SELECT agent_id, revision FROM agent_workspace_revisions").all() as Array<{ agent_id: string; revision: number }>;
  const revisions = new Map(revisionRows.map((row) => [row.agent_id, row.revision]));
  const stored = new Map<string, AgentWorkspaceSnapshot>();
  for (const row of rows) {
    try { stored.set(row.agent_id, { ...(JSON.parse(row.payload) as AgentWorkspaceSnapshot), workspaceRevision: revisions.get(row.agent_id) ?? 0 }); } catch { /* retain the compatibility snapshot below */ }
  }
  const snapshots = state.agentWorkspaces.map((workspace) => workspace.agent?.id ? stored.get(workspace.agent.id) ?? workspace : workspace);
  for (const workspace of stored.values()) {
    if (workspace.agent?.id && workspace.agent.id !== state.activeAgentId && !snapshots.some((item) => item.agent?.id === workspace.agent?.id)) snapshots.push(workspace);
  }
  return { ...state, workspaceRevision: state.activeAgentId ? revisions.get(state.activeAgentId) ?? state.workspaceRevision ?? 0 : state.workspaceRevision, agentWorkspaces: snapshots };
}

function hydrateOperationalState(state: OpenPresenceState): OpenPresenceState {
  let recoveryIncidents = state.recoveryIncidents;
  try {
    const rows = sqlite.prepare("SELECT payload FROM recovery_incidents_live ORDER BY updated_at DESC").all() as Array<{ payload: string }>;
    if (rows.length > 0) {
      recoveryIncidents = rows.flatMap((r) => {
        try { return [JSON.parse(r.payload) as RecoveryIncident]; } catch { return []; }
      });
    }
  } catch { /* retain compatibility when table not available */ }

  let recoveryAttempts = state.recoveryAttempts;
  try {
    const attemptRows = sqlite.prepare("SELECT id, incident_id, attempt_number, step, outcome, error, timestamp FROM recovery_attempts_log ORDER BY timestamp ASC").all() as Array<{
      id: string;
      incident_id: string;
      attempt_number: number;
      step: string;
      outcome: string;
      error?: string | null;
      timestamp: string;
    }>;
    if (attemptRows.length > 0) {
      recoveryAttempts = attemptRows.map((r) => ({
        id: r.id,
        incidentId: r.incident_id,
        attemptNumber: r.attempt_number,
        step: r.step,
        outcome: r.outcome as RecoveryAttempt["outcome"],
        error: r.error ?? undefined,
        timestamp: r.timestamp,
      }));
    }
  } catch { /* retain compatibility when table not available */ }

  let operationalRuns = state.operationalRuns;
  try {
    const opRows = sqlite.prepare("SELECT payload FROM operational_runs_idx ORDER BY updated_at DESC").all() as Array<{ payload: string }>;
    if (opRows.length > 0) {
      operationalRuns = opRows.flatMap((r) => {
        try { return [JSON.parse(r.payload) as OperationalRun]; } catch { return []; }
      });
    }
  } catch { /* retain compatibility when table not available */ }

  let dependencyHealth = state.dependencyHealth;
  try {
    const dhRows = sqlite.prepare("SELECT id, presence_id, dependency, state, consecutive_failures, circuit_until, current_incident_id, metadata, updated_at FROM dependency_health_live").all() as Array<{
      id: string;
      presence_id?: string | null;
      dependency: string;
      state: string;
      consecutive_failures: number;
      circuit_until?: string | null;
      current_incident_id?: string | null;
      metadata?: string | null;
      updated_at: string;
    }>;
    if (dhRows.length > 0) {
      dependencyHealth = dhRows.map((r) => ({
        id: r.id,
        presenceId: r.presence_id ?? undefined,
        dependency: r.dependency as DependencyHealthKind,
        state: r.state as DependencyHealthState,
        consecutiveFailures: r.consecutive_failures,
        circuitUntil: r.circuit_until ?? undefined,
        currentIncidentId: r.current_incident_id ?? undefined,
        metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, JsonValue>) : undefined,
        updatedAt: r.updated_at,
      }));
    }
  } catch { /* retain compatibility when table not available */ }

  return {
    ...state,
    recoveryIncidents: recoveryIncidents ?? [],
    recoveryAttempts: recoveryAttempts ?? [],
    operationalRuns: operationalRuns ?? [],
    dependencyHealth: dependencyHealth ?? [],
  };
}

/** Return the cheap persistence token used by conditional state reads. */
export function readStateVersion() {
  const row = sqlite.prepare("SELECT updated_at FROM app_state WHERE id = 1").get() as { updated_at?: string } | undefined;
  return row?.updated_at ?? "empty";
}

/**
 * Conditional browser reads must also notice operational bridge and incident changes.
 * Keep readStateVersion focused on workspace writes for conflict semantics,
 * while this read token includes the separate high-frequency health model.
 */
export function readStateReadToken() {
  const workspace = readStateVersion();
  const health = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM bridge_health").get() as { updated_at?: string | null } | undefined;
  const incident = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM recovery_incidents_live").get() as { updated_at?: string | null } | undefined;
  return `${workspace}:${health?.updated_at ?? "empty"}:${incident?.updated_at ?? "empty"}`;
}

export function writeBridgeHeartbeat(input: { bridgeId: string; state: string; adapterStatus: string; lastHeartbeatAt: string; lastSeenAt: string }) {
  sqlite.prepare(`INSERT INTO bridge_health (bridge_id, state, adapter_status, last_heartbeat_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(bridge_id) DO UPDATE SET state = excluded.state, adapter_status = excluded.adapter_status,
      last_heartbeat_at = excluded.last_heartbeat_at, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`).run(
    input.bridgeId,
    input.state,
    input.adapterStatus,
    input.lastHeartbeatAt,
    input.lastSeenAt,
    input.lastSeenAt,
  );
}

export function readBridgeHealthForPresence(presenceId: string) {
  const rows = sqlite.prepare("SELECT payload FROM bridges WHERE parent_id = ?").all(presenceId) as Array<{ payload: string }>;
  const healthRows = sqlite.prepare("SELECT bridge_id, state, adapter_status, last_heartbeat_at, last_seen_at, last_sync_at FROM bridge_health").all() as Array<{ bridge_id: string; state: string; adapter_status: string; last_heartbeat_at?: string; last_seen_at?: string; last_sync_at?: string }>;
  const health = new Map(healthRows.map((row) => [row.bridge_id, row]));
  return rows.flatMap((row) => {
    try {
      const bridge = JSON.parse(row.payload) as Record<string, unknown> & { id?: string };
      const live = bridge.id ? health.get(bridge.id) : undefined;
      return [{ ...bridge, ...(live ? { state: live.state, adapterStatus: live.adapter_status, lastHeartbeatAt: live.last_heartbeat_at, lastSeenAt: live.last_seen_at, lastSyncAt: live.last_sync_at } : {}) }];
    } catch { return []; }
  });
}

/**
 * Read the normalized state owned by this process. Callers must treat this as
 * immutable; mutating callers should use readState() or stateForContext().
 * The cache is invalidated by writeState, avoiding a full JSON parse and
 * normalize pass for every browser heartbeat or progress poll.
 */
export function readStateSnapshot(): OpenPresenceState {
  const row = sqlite.prepare("SELECT payload, updated_at FROM app_state WHERE id = 1").get() as { payload?: string; updated_at?: string } | undefined;
  if (!row?.payload) {
    const state = initialState();
    writeState(state);
    return readStateSnapshot();
  }
  const cachedState = stateCache;
  if (cachedState && cachedState.updatedAt === row.updated_at) return cachedState.state;
  try {
    const state = hydrateBridgeCredentials(hydrateAgentWorkspaces(normalizeState(JSON.parse(row.payload) as OpenPresenceState)));
    stateCache = { updatedAt: row.updated_at ?? "", state };
    return state;
  } catch {
    const state = initialState();
    writeState(state);
    return readStateSnapshot();
  }
}

export function readState(): OpenPresenceState {
  return JSON.parse(JSON.stringify(hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot())))) as OpenPresenceState;
}

/** Materialize a mutable context from the cached state with one clone. */
export function readStateForContext(context: StateContext): OpenPresenceState {
  return stateForContext(hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot())), context);
}

/** Read-only context projection for GET responses; unchanged active reads share the cache. */
export function readStateSnapshotForContext(context: StateContext): OpenPresenceState {
  const state = hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot()));
  const activeAgentMatches = !context.agentId || context.agentId === state.activeAgentId;
  const activePresenceMatches = !context.presenceId || context.presenceId === state.activePresenceId;
  return activeAgentMatches && activePresenceMatches ? state : stateForContext(state, context);
}

export function readStateForAgent(agentId?: string | null): OpenPresenceState {
  return stateForAgent(hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot())), agentId);
}

/** Resolve connector work from its durable Presence/Agent owner, never from the active projection. */
export function readStateForBridge(bridgeId: string): OpenPresenceState {
  const state = readState();
  if (state.bridges.some((bridge) => bridge.id === bridgeId)) return state;
  for (const workspace of state.agentWorkspaces) {
    if (workspace.bridges.some((bridge) => bridge.id === bridgeId) && workspace.agent?.id) return stateForAgent(state, workspace.agent.id);
  }
  return state;
}

/** Resolve an immutable asset from its durable Agent workspace, not the active tab projection. */
export function readStateForAsset(assetId: string): OpenPresenceState {
  const state = readState();
  if (state.assets.some((asset) => asset.id === assetId)) return state;
  for (const workspace of state.agentWorkspaces) {
    if (workspace.assets.some((asset) => asset.id === assetId) && workspace.agent?.id) return stateForAgent(state, workspace.agent.id);
  }
  return state;
}

export class WorkspaceConflictError extends Error {
  readonly status = 409;
  constructor(readonly agentId: string, readonly expectedRevision: number, readonly actualRevision: number) {
    super("This Agent workspace changed in another tab or worker. Refreshing this context is required before applying the change.");
    this.name = "WorkspaceConflictError";
  }
}

/** Workspace contention is a local retry condition, not a Native X outage. */
export function shouldRecordNativeOperationalFailure(error: unknown) {
  return !(error instanceof WorkspaceConflictError);
}

function entityRows(state: OpenPresenceState): Record<string, { id: string; agentId?: string; parentId?: string; payload: unknown }[]> {
  const agentId = state.agent?.id;
  return {
    agents: state.agents.map((agent) => ({ id: agent.id, agentId: agent.id, payload: agent })),
    agent_files: state.files.map((item) => ({ id: `${agentId ?? "agent"}:${item.kind}`, agentId, payload: item })),
    provider_connections: state.providerConnections.map((item) => ({ id: item.id, payload: item })),
    asset_provider_connections: state.assetProviderConnections.map((item) => ({ id: item.id, agentId, payload: item })),
    agent_model_profiles: state.modelProfiles.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    agent_tool_bindings: state.toolBindings.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    presences: state.presences.map((item) => ({ id: item.id, agentId, payload: item })),
    execution_envelopes: state.presences.map((item) => ({ id: item.id, parentId: item.id, payload: item.executionEnvelope })),
    conversations: state.conversations.map((item) => ({ id: item.id, agentId, payload: item })),
    presence_chat_sessions: state.presenceChatSessions.map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    messages: state.conversations.flatMap((conversation) => conversation.messages.map((item) => ({ id: item.id, parentId: conversation.id, payload: item }))),
    change_sets: state.changeSets.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    standing_intents: state.standingIntents.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    publishing_plans: state.publishingPlans.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    social_intents: state.socialIntents.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    executions: state.executions.map((item) => ({ id: item.id, parentId: item.socialIntentId, payload: item })),
    outcomes: state.outcomes.map((item) => ({ id: item.id, parentId: item.executionId ?? item.socialIntentId, payload: item })),
    publications: state.publications.map((item) => ({ id: item.id, agentId, payload: item })),
    asset_usages: state.assetUsages.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.assetId, payload: item })),
    source_evidence: state.sourceEvidence.map((item) => ({ id: item.id, payload: item })),
    claim_grounding: state.claimGrounding.map((item) => ({ id: item.id, parentId: item.publicationId, payload: item })),
    library_sources: state.librarySources.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    assets: state.assets.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    assignment_runs: (state.assignmentRuns ?? []).map((item) => ({ id: item.id, agentId, parentId: item.assignmentId, payload: item })),
    skills: state.skills.map((item) => ({ id: item.id, payload: item })),
    agent_skills: state.agentSkills.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    content_drops: state.contentDrops.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    channel_definitions: state.channelDefinitions.map((item) => ({ id: item.id, payload: item })),
    native_channel_connections: state.nativeConnections.map((item) => ({ id: item.id, parentId: item.presenceId, payload: item })),
    bridges: state.bridges.map((item) => ({ id: item.id, parentId: item.presenceId, payload: item })),
    mirror_objects: state.mirrorObjects.map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    mirror_events: state.mirrorEvents.map((item) => ({ id: item.id, parentId: item.bridgeId, payload: item })),
    bridge_sync: state.bridgeSync.map((item) => ({ id: item.bridgeId, payload: item })),
    conversation_episodes: state.conversationEpisodes.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    assignment_contributions: state.assignmentContributions.map((item) => ({ id: item.id, parentId: item.assignmentId, payload: item })),
    people: state.people.map((item) => ({ id: item.id, agentId, payload: item })),
    person_identities: state.personIdentities.map((item) => ({ id: item.id, agentId, parentId: item.personId, payload: item })),
    relationships: state.relationships.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.personId, payload: item })),
    relationship_facts: state.relationshipFacts.map((item) => ({ id: item.id, agentId, parentId: item.relationshipId, payload: item })),
    relationship_open_loops: state.relationshipOpenLoops.map((item) => ({ id: item.id, agentId, parentId: item.relationshipId, payload: item })),
    recommendation_records: state.recommendationRecords.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    introduction_records: state.introductionRecords.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    scenarios: state.scenarios.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    scenario_versions: state.scenarioVersions.map((item) => ({ id: item.id, parentId: item.scenarioId, payload: item })),
    scenario_runs: state.scenarioRuns.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.scenarioId, payload: item })),
    scenario_run_provenance: state.scenarioRunProvenance.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.scenarioId, payload: item })),
    scenario_evaluations: state.scenarioEvaluations.map((item) => ({ id: item.id, parentId: item.runId, payload: item })),
    operational_runs: (state.operationalRuns ?? []).map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    scheduled_wakes: (state.scheduledWakes ?? []).map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    dependency_health: (state.dependencyHealth ?? []).map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    recovery_incidents: (state.recoveryIncidents ?? []).map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    recovery_attempts: (state.recoveryAttempts ?? []).map((item) => ({ id: item.id, parentId: item.incidentId, payload: item })),
    browser_bodies: (state.browserBodies ?? []).map((item) => ({ id: item.presenceId, agentId, parentId: item.presenceId, payload: item })),
  };
}

function writeNormalized(state: OpenPresenceState) {
  const workspaceStates = new Map<string, OpenPresenceState>();
  const storedRows = sqlite.prepare("SELECT agent_id, payload FROM agent_workspaces").all() as Array<{ agent_id: string; payload: string }>;
  for (const row of storedRows) {
    try {
      const workspace = JSON.parse(row.payload) as AgentWorkspaceSnapshot;
      if (workspace.agent?.id) workspaceStates.set(workspace.agent.id, normalizeState({ ...state, ...workspace, agents: state.agents, activeAgentId: workspace.agent.id, agentWorkspaces: state.agentWorkspaces }));
    } catch { /* retain the active state below when a legacy snapshot is malformed */ }
  }
  if (state.agent?.id) workspaceStates.set(state.agent.id, state);
  const rowsByTable = new Map<string, Map<string, { id: string; agentId?: string; parentId?: string; payload: unknown }>>();
  for (const workspace of workspaceStates.values()) {
    const rows = entityRows(workspace);
    for (const table of normalizedTables) {
      const tableRows = rowsByTable.get(table) ?? new Map();
      for (const row of rows[table] ?? []) tableRows.set(row.id, row);
      rowsByTable.set(table, tableRows);
    }
  }
  const timestamp = new Date().toISOString();
  const transaction = sqlite.transaction(() => {
    for (const table of normalizedTables) {
      sqlite.prepare(`DELETE FROM ${table}`).run();
      const insert = sqlite.prepare(`INSERT INTO ${table} (id, agent_id, parent_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)`);
      for (const row of rowsByTable.get(table)?.values() ?? []) insert.run(row.id, row.agentId ?? null, row.parentId ?? null, JSON.stringify(row.payload), timestamp);
    }
  });
  transaction();
}

export function writeState(state: OpenPresenceState, options?: { advanceWorkspaceRevision?: boolean; syncNormalized?: boolean; persistAgentWorkspaces?: boolean; force?: boolean }) {
  const normalized = normalizeState(state);
  const agentId = normalized.agent?.id;
  const advanceWorkspaceRevision = options?.advanceWorkspaceRevision !== false;
  const syncNormalized = options?.syncNormalized !== false;
  const expectedRevision = typeof state.workspaceRevision === "number" ? state.workspaceRevision : undefined;
  const persistedAt = new Date().toISOString();
  sqlite.transaction(() => {
    let actualRevision = 0;
    if (agentId) {
      sqlite.prepare("INSERT OR IGNORE INTO agent_workspace_revisions (agent_id, revision, updated_at) VALUES (?, 0, ?)").run(agentId, persistedAt);
      actualRevision = ((sqlite.prepare("SELECT revision FROM agent_workspace_revisions WHERE agent_id = ?").get(agentId) as { revision?: number } | undefined)?.revision ?? 0);
      if (expectedRevision !== undefined && expectedRevision !== actualRevision && !options?.force) throw new WorkspaceConflictError(agentId, expectedRevision, actualRevision);
      normalized.workspaceRevision = advanceWorkspaceRevision ? actualRevision + 1 : actualRevision;
    }
    sqlite.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(JSON.stringify(normalized), persistedAt);
    if (!agentId) {
      sqlite.prepare("DELETE FROM agent_workspaces").run();
      sqlite.prepare("DELETE FROM agent_workspace_revisions").run();
    } else {
      const snapshot = snapshotWorkspace(normalized);
      sqlite.prepare("INSERT INTO agent_workspaces (agent_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(agentId, JSON.stringify(snapshot), persistedAt);
      sqlite.prepare("INSERT INTO agent_workspace_revisions (agent_id, revision, updated_at) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at").run(agentId, normalized.workspaceRevision, persistedAt);
      if (options?.persistAgentWorkspaces) {
        for (const workspace of normalized.agentWorkspaces) {
          const workspaceAgentId = workspace.agent?.id;
          if (!workspaceAgentId || workspaceAgentId === agentId) continue;
          const workspaceSnapshot = JSON.parse(JSON.stringify(workspace)) as Record<string, unknown>;
          delete workspaceSnapshot.agents;
          delete workspaceSnapshot.activeAgentId;
          delete workspaceSnapshot.agentWorkspaces;
          sqlite.prepare("INSERT INTO agent_workspaces (agent_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(workspaceAgentId, JSON.stringify(workspaceSnapshot), persistedAt);
        }
      }
      const validAgentIds = new Set(normalized.agents.map((agent) => agent.id));
      const storedWorkspaceRows = sqlite.prepare("SELECT agent_id FROM agent_workspaces").all() as Array<{ agent_id: string }>;
      for (const row of storedWorkspaceRows) {
        if (validAgentIds.has(row.agent_id)) continue;
        sqlite.prepare("DELETE FROM agent_workspaces WHERE agent_id = ?").run(row.agent_id);
        sqlite.prepare("DELETE FROM agent_workspace_revisions WHERE agent_id = ?").run(row.agent_id);
      }
    }
  })();
  stateCache = undefined;
  // Keep direct in-process callers aligned with the durable token as well;
  // API callers still receive the same token in the JSON response/header.
  state.workspaceRevision = normalized.workspaceRevision;
  if (syncNormalized) writeNormalized(normalized);
}

function hashBridgeKey(key: string) { return crypto.createHash("sha256").update(key).digest("hex"); }
function issueBridgeKey(bridgeId: string) {
  const key = `opb_${crypto.randomBytes(32).toString("base64url")}`;
  sqlite.prepare("INSERT INTO bridge_credentials (bridge_id, key_hash, key_prefix, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(bridge_id) DO UPDATE SET key_hash = excluded.key_hash, key_prefix = excluded.key_prefix, revoked_at = NULL, updated_at = excluded.updated_at").run(bridgeId, hashBridgeKey(key), key.slice(0, 12), new Date().toISOString());
  return key;
}
function revokeBridgeKey(bridgeId: string) { sqlite.prepare("UPDATE bridge_credentials SET revoked_at = ?, updated_at = ? WHERE bridge_id = ?").run(new Date().toISOString(), new Date().toISOString(), bridgeId); }
export function deleteBridgeCredential(bridgeId: string) { sqlite.prepare("DELETE FROM bridge_credentials WHERE bridge_id = ?").run(bridgeId); }
function authenticateBridgeKey(key: string) {
  const row = sqlite.prepare("SELECT bridge_id, key_hash, revoked_at FROM bridge_credentials WHERE key_hash = ?").get(hashBridgeKey(key)) as { bridge_id: string; key_hash: string; revoked_at?: string | null } | undefined;
  return row && !row.revoked_at ? row.bridge_id : undefined;
}

type StoredSecret = Record<string, string | undefined>;
function masterKey() {
  const configured = process.env.OPENPRESENCE_SECRET_KEY;
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length === 32) return key;
    throw new Error("OPENPRESENCE_SECRET_KEY must be a 32-byte base64 or 64-character hex value.");
  }
  if (process.env.NODE_ENV === "production") throw new Error("Set OPENPRESENCE_SECRET_KEY before storing channel credentials.");
  const fallbackPath = path.join(dataDir, ".secret-key");
  try {
    const existing = fs.readFileSync(fallbackPath);
    if (existing.length === 32) return existing;
  } catch { /* create below */ }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(fallbackPath, generated, { mode: 0o600 });
  return generated;
}
function encryptSecret(value: object) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") };
}
function decryptSecret(row: { ciphertext: string; iv: string; auth_tag: string }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(row.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64url")), decipher.final()]).toString("utf8")) as StoredSecret;
}
export function saveChannelSecret(connectionId: string, secret: object) {
  const encrypted = encryptSecret(secret);
  sqlite.prepare("INSERT INTO channel_credentials (connection_id, ciphertext, iv, auth_tag, key_version, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(connection_id) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag, key_version = excluded.key_version, updated_at = excluded.updated_at").run(connectionId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, new Date().toISOString());
}
export function readChannelSecret(connectionId: string) {
  const row = sqlite.prepare("SELECT ciphertext, iv, auth_tag FROM channel_credentials WHERE connection_id = ?").get(connectionId) as { ciphertext: string; iv: string; auth_tag: string } | undefined;
  return row ? decryptSecret(row) : undefined;
}
export function deleteChannelSecret(connectionId: string) { sqlite.prepare("DELETE FROM channel_credentials WHERE connection_id = ?").run(connectionId); }
export function hasChannelSecret(connectionId: string) { return Boolean(sqlite.prepare("SELECT 1 FROM channel_credentials WHERE connection_id = ?").get(connectionId)); }
export function saveProviderSecret(connectionId: string, secret: string) {
  const encrypted = encryptSecret({ secret });
  sqlite.prepare("INSERT INTO provider_credentials (connection_id, ciphertext, iv, auth_tag, key_version, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(connection_id) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag, key_version = excluded.key_version, updated_at = excluded.updated_at").run(connectionId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, new Date().toISOString());
}
export function readProviderSecret(connectionId: string) {
  const row = sqlite.prepare("SELECT ciphertext, iv, auth_tag FROM provider_credentials WHERE connection_id = ?").get(connectionId) as { ciphertext: string; iv: string; auth_tag: string } | undefined;
  return row ? decryptSecret(row).secret : undefined;
}
export function deleteProviderSecret(connectionId: string) { sqlite.prepare("DELETE FROM provider_credentials WHERE connection_id = ?").run(connectionId); }
export { authenticateBridgeKey, issueBridgeKey, revokeBridgeKey };

// ============================================================================
// Operational Persistence & Telemetry API (Phase 1)
// ============================================================================

export function upsertOperationalRun(run: OperationalRun): void {
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify(run);
  sqlite.prepare(`
    INSERT INTO operational_runs_idx (id, presence_id, execution_id, state, stage, lease_owner, lease_expires_at, eligible_at, next_wake_at, last_progress_at, last_heartbeat_at, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      presence_id = excluded.presence_id,
      execution_id = excluded.execution_id,
      state = excluded.state,
      stage = excluded.stage,
      lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at,
      eligible_at = excluded.eligible_at,
      next_wake_at = excluded.next_wake_at,
      last_progress_at = excluded.last_progress_at,
      last_heartbeat_at = excluded.last_heartbeat_at,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run(
    run.id,
    run.presenceId,
    run.executionId ?? null,
    run.state,
    run.stage,
    run.leaseOwner ?? null,
    run.leaseExpiresAt ?? null,
    run.eligibleAt ?? null,
    run.nextWakeAt ?? null,
    run.lastProgressAt ?? null,
    run.lastHeartbeatAt ?? null,
    payload,
    timestamp,
  );
}

export function getOperationalRun(id: string): OperationalRun | undefined {
  const row = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE id = ?").get(id) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try { return JSON.parse(row.payload) as OperationalRun; } catch { return undefined; }
}

export function listOperationalRuns(presenceId?: string, states?: OperationalRunState[]): OperationalRun[] {
  let query = "SELECT payload FROM operational_runs_idx WHERE 1=1";
  const params: unknown[] = [];
  if (presenceId) {
    query += " AND presence_id = ?";
    params.push(presenceId);
  }
  if (states && states.length > 0) {
    query += ` AND state IN (${states.map(() => "?").join(",")})`;
    params.push(...states);
  }
  query += " ORDER BY updated_at DESC";
  const rows = sqlite.prepare(query).all(...params) as Array<{ payload: string }>;
  return rows.flatMap((r) => {
    try { return [JSON.parse(r.payload) as OperationalRun]; } catch { return []; }
  });
}

export function claimOperationalRunLease(runId: string, leaseOwner: string, durationMs = 60000): boolean {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();
  return sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE id = ? AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at < ?)").get(runId, leaseOwner, nowIso) as { payload?: string } | undefined;
    if (!row?.payload) return false;
    const run = JSON.parse(row.payload) as OperationalRun;
    run.leaseOwner = leaseOwner;
    run.leaseExpiresAt = expiresAt;
    run.lastHeartbeatAt = nowIso;
    sqlite.prepare(`UPDATE operational_runs_idx SET lease_owner = ?, lease_expires_at = ?, last_heartbeat_at = ?, payload = ?, updated_at = ? WHERE id = ? AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at < ?)`)
      .run(leaseOwner, expiresAt, nowIso, JSON.stringify(run), nowIso, runId, leaseOwner, nowIso);
    return true;
  })();
}

export function releaseOperationalRunLease(runId: string, leaseOwner: string): boolean {
  const nowIso = new Date().toISOString();
  return sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE id = ? AND lease_owner = ?").get(runId, leaseOwner) as { payload?: string } | undefined;
    if (!row?.payload) return false;
    const run = JSON.parse(row.payload) as OperationalRun;
    delete run.leaseOwner;
    delete run.leaseExpiresAt;
    sqlite.prepare("UPDATE operational_runs_idx SET lease_owner = NULL, lease_expires_at = NULL, payload = ?, updated_at = ? WHERE id = ? AND lease_owner = ?")
      .run(JSON.stringify(run), nowIso, runId, leaseOwner);
    return true;
  })();
}

export function reclaimExpiredLeases(nowIso = new Date().toISOString()): number {
  const result = sqlite.prepare(`
    UPDATE operational_runs_idx
    SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
    WHERE lease_owner IS NOT NULL AND lease_expires_at < ?
  `).run(nowIso, nowIso);
  return result.changes;
}

export function upsertScheduledWake(wake: ScheduledWake): void {
  const timestamp = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO scheduled_wakes_idx (id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      presence_id = excluded.presence_id,
      wake_at = excluded.wake_at,
      kind = excluded.kind,
      target_id = excluded.target_id,
      state = excluded.state,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      created_at = COALESCE(scheduled_wakes_idx.created_at, excluded.created_at)
  `).run(
    wake.id,
    wake.presenceId ?? null,
    wake.wakeAt,
    wake.kind,
    wake.targetId ?? null,
    wake.state,
    wake.payload ? JSON.stringify(wake.payload) : null,
    timestamp,
    wake.createdAt,
  );
}

export function getDueScheduledWakes(nowIso = new Date().toISOString()): ScheduledWake[] {
  const rows = sqlite.prepare(`
    SELECT id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at
    FROM scheduled_wakes_idx
    WHERE state = 'pending' AND wake_at <= ?
    ORDER BY wake_at ASC
  `).all(nowIso) as Array<{
    id: string;
    presence_id?: string | null;
    wake_at: string;
    kind: string;
    target_id?: string | null;
    state: string;
    payload?: string | null;
    updated_at: string;
    created_at?: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    presenceId: r.presence_id ?? undefined,
    wakeAt: r.wake_at,
    kind: r.kind as ScheduledWake["kind"],
    targetId: r.target_id ?? undefined,
    state: r.state as ScheduledWake["state"],
    payload: r.payload ? (JSON.parse(r.payload) as Record<string, JsonValue>) : undefined,
    createdAt: r.created_at ?? r.updated_at,
    updatedAt: r.updated_at,
  }));
}

export function listScheduledWakes(presenceId?: string): ScheduledWake[] {
  const query = presenceId
    ? `SELECT id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at FROM scheduled_wakes_idx WHERE presence_id = ? ORDER BY created_at DESC LIMIT 100`
    : `SELECT id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at FROM scheduled_wakes_idx ORDER BY created_at DESC LIMIT 100`;
  const rows = (presenceId ? sqlite.prepare(query).all(presenceId) : sqlite.prepare(query).all()) as Array<{
    id: string;
    presence_id?: string | null;
    wake_at: string;
    kind: string;
    target_id?: string | null;
    state: string;
    payload?: string | null;
    updated_at: string;
    created_at?: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    presenceId: r.presence_id ?? undefined,
    wakeAt: r.wake_at,
    kind: r.kind as ScheduledWake["kind"],
    targetId: r.target_id ?? undefined,
    state: r.state as ScheduledWake["state"],
    payload: r.payload ? (JSON.parse(r.payload) as Record<string, JsonValue>) : undefined,
    createdAt: r.created_at ?? r.updated_at,
    updatedAt: r.updated_at,
  }));
}

/** Atomically claim due wakes so two runtime workers cannot dispatch the same wake. */
export function claimDueScheduledWakes(nowIso = new Date().toISOString()): ScheduledWake[] {
  return sqlite.transaction(() => {
    const rows = sqlite.prepare(`SELECT id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at FROM scheduled_wakes_idx WHERE state = 'pending' AND wake_at <= ? ORDER BY wake_at ASC`).all(nowIso) as Array<{
      id: string; presence_id?: string | null; wake_at: string; kind: string; target_id?: string | null; state: string; payload?: string | null; updated_at: string; created_at?: string | null;
    }>;
    const claim = sqlite.prepare("UPDATE scheduled_wakes_idx SET state = 'dispatched', updated_at = ? WHERE id = ? AND state = 'pending'");
    return rows.flatMap((row) => {
      if (claim.run(nowIso, row.id).changes !== 1) return [];
      return [{
        id: row.id,
        presenceId: row.presence_id ?? undefined,
        wakeAt: row.wake_at,
        kind: row.kind as ScheduledWake["kind"],
        targetId: row.target_id ?? undefined,
        state: "dispatched" as const,
        payload: row.payload ? JSON.parse(row.payload) as Record<string, JsonValue> : undefined,
        createdAt: row.created_at ?? row.updated_at,
        updatedAt: nowIso,
      }];
    });
  })();
}

export function markWakeDispatched(id: string): void {
  const nowIso = new Date().toISOString();
  sqlite.prepare("UPDATE scheduled_wakes_idx SET state = 'dispatched', updated_at = ? WHERE id = ?").run(nowIso, id);
}

export function cancelScheduledWake(id: string): void {
  const nowIso = new Date().toISOString();
  sqlite.prepare("UPDATE scheduled_wakes_idx SET state = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso, id);
}

export function upsertDependencyHealth(health: DependencyHealth): void {
  const timestamp = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO dependency_health_live (id, presence_id, dependency, state, consecutive_failures, circuit_until, current_incident_id, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      presence_id = excluded.presence_id,
      dependency = excluded.dependency,
      state = excluded.state,
      consecutive_failures = excluded.consecutive_failures,
      circuit_until = excluded.circuit_until,
      current_incident_id = excluded.current_incident_id,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `).run(
    health.id,
    health.presenceId ?? null,
    health.dependency,
    health.state,
    health.consecutiveFailures,
    health.circuitUntil ?? null,
    health.currentIncidentId ?? null,
    health.metadata ? JSON.stringify(health.metadata) : null,
    timestamp,
  );
}

export function getDependencyHealth(dependency: DependencyHealthKind, presenceId?: string): DependencyHealth | undefined {
  const row = sqlite.prepare(`
    SELECT id, presence_id, dependency, state, consecutive_failures, circuit_until, current_incident_id, metadata, updated_at
    FROM dependency_health_live
    WHERE dependency = ? AND (presence_id = ? OR (presence_id IS NULL AND ? IS NULL))
  `).get(dependency, presenceId ?? null, presenceId ?? null) as {
    id: string;
    presence_id?: string | null;
    dependency: string;
    state: string;
    consecutive_failures: number;
    circuit_until?: string | null;
    current_incident_id?: string | null;
    metadata?: string | null;
    updated_at: string;
  } | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    presenceId: row.presence_id ?? undefined,
    dependency: row.dependency as DependencyHealthKind,
    state: row.state as DependencyHealthState,
    consecutiveFailures: row.consecutive_failures,
    circuitUntil: row.circuit_until ?? undefined,
    currentIncidentId: row.current_incident_id ?? undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, JsonValue>) : undefined,
    updatedAt: row.updated_at,
  };
}

export function listDependencyHealth(presenceId?: string): DependencyHealth[] {
  const query = presenceId
    ? "SELECT id, presence_id, dependency, state, consecutive_failures, circuit_until, current_incident_id, metadata, updated_at FROM dependency_health_live WHERE presence_id = ? OR presence_id IS NULL"
    : "SELECT id, presence_id, dependency, state, consecutive_failures, circuit_until, current_incident_id, metadata, updated_at FROM dependency_health_live";
  const rows = (presenceId ? sqlite.prepare(query).all(presenceId) : sqlite.prepare(query).all()) as Array<{
    id: string;
    presence_id?: string | null;
    dependency: string;
    state: string;
    consecutive_failures: number;
    circuit_until?: string | null;
    current_incident_id?: string | null;
    metadata?: string | null;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    presenceId: r.presence_id ?? undefined,
    dependency: r.dependency as DependencyHealthKind,
    state: r.state as DependencyHealthState,
    consecutiveFailures: r.consecutive_failures,
    circuitUntil: r.circuit_until ?? undefined,
    currentIncidentId: r.current_incident_id ?? undefined,
    metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, JsonValue>) : undefined,
    updatedAt: r.updated_at,
  }));
}

export function upsertRecoveryIncident(incident: RecoveryIncident): void {
  const timestamp = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO recovery_incidents_live (id, root_cause_key, dependency_id, presence_id, state, recovery_attempts, next_attempt_at, safe_summary, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      root_cause_key = excluded.root_cause_key,
      dependency_id = excluded.dependency_id,
      presence_id = excluded.presence_id,
      state = excluded.state,
      recovery_attempts = excluded.recovery_attempts,
      next_attempt_at = excluded.next_attempt_at,
      safe_summary = excluded.safe_summary,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run(
    incident.id,
    incident.rootCauseKey,
    incident.dependencyId,
    incident.presenceId ?? null,
    incident.state,
    incident.recoveryAttempts,
    incident.nextAttemptAt ?? null,
    incident.safeSummary,
    JSON.stringify(incident),
    timestamp,
  );
}

export function getOpenRecoveryIncident(rootCauseKey: string, presenceId?: string): RecoveryIncident | undefined {
  const row = sqlite.prepare(`
    SELECT payload FROM recovery_incidents_live
    WHERE root_cause_key = ? AND (presence_id = ? OR (presence_id IS NULL AND ? IS NULL)) AND state != 'resolved'
    ORDER BY updated_at DESC LIMIT 1
  `).get(rootCauseKey, presenceId ?? null, presenceId ?? null) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try { return JSON.parse(row.payload) as RecoveryIncident; } catch { return undefined; }
}

export function getRecoveryIncident(id: string): RecoveryIncident | undefined {
  const row = sqlite.prepare("SELECT payload FROM recovery_incidents_live WHERE id = ?").get(id) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try { return JSON.parse(row.payload) as RecoveryIncident; } catch { return undefined; }
}

export function listRecoveryIncidents(presenceId?: string, state?: RecoveryIncidentState): RecoveryIncident[] {
  let query = "SELECT payload FROM recovery_incidents_live WHERE 1=1";
  const params: unknown[] = [];
  if (presenceId) {
    query += " AND (presence_id = ? OR presence_id IS NULL)";
    params.push(presenceId);
  }
  if (state) {
    query += " AND state = ?";
    params.push(state);
  }
  query += " ORDER BY updated_at DESC";
  const rows = sqlite.prepare(query).all(...params) as Array<{ payload: string }>;
  return rows.flatMap((r) => {
    try { return [JSON.parse(r.payload) as RecoveryIncident]; } catch { return []; }
  });
}

export function recordRecoveryAttempt(attempt: RecoveryAttempt): void {
  sqlite.prepare(`
    INSERT INTO recovery_attempts_log (id, incident_id, attempt_number, step, outcome, error, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, error = excluded.error, timestamp = excluded.timestamp
  `).run(
    attempt.id,
    attempt.incidentId,
    attempt.attemptNumber,
    attempt.step,
    attempt.outcome,
    attempt.error ?? null,
    attempt.timestamp,
  );
}

export function listRecoveryAttempts(incidentId: string): RecoveryAttempt[] {
  const rows = sqlite.prepare("SELECT id, incident_id, attempt_number, step, outcome, error, timestamp FROM recovery_attempts_log WHERE incident_id = ? ORDER BY attempt_number ASC").all(incidentId) as Array<{
    id: string;
    incident_id: string;
    attempt_number: number;
    step: string;
    outcome: string;
    error?: string | null;
    timestamp: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    incidentId: r.incident_id,
    attemptNumber: r.attempt_number,
    step: r.step,
    outcome: r.outcome as RecoveryAttempt["outcome"],
    error: r.error ?? undefined,
    timestamp: r.timestamp,
  }));
}

export function upsertBrowserBody(body: BrowserBody): void {
  const timestamp = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO body_sessions (presence_id, mode, ownership, state, expected_identity, verified_identity, last_healthy_at, profile_dir, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(presence_id) DO UPDATE SET
      mode = excluded.mode,
      ownership = excluded.ownership,
      state = excluded.state,
      expected_identity = excluded.expected_identity,
      verified_identity = excluded.verified_identity,
      last_healthy_at = excluded.last_healthy_at,
      profile_dir = excluded.profile_dir,
      updated_at = excluded.updated_at
  `).run(
    body.presenceId,
    body.mode,
    body.ownership,
    body.state,
    body.expectedIdentity ?? null,
    body.verifiedIdentity ?? null,
    body.lastHealthyAt ?? null,
    body.profileDir ?? null,
    timestamp,
  );
}

export function getBrowserBody(presenceId: string): BrowserBody | undefined {
  const row = sqlite.prepare("SELECT presence_id, mode, ownership, state, expected_identity, verified_identity, last_healthy_at, profile_dir, updated_at FROM body_sessions WHERE presence_id = ?").get(presenceId) as {
    presence_id: string;
    mode: string;
    ownership: string;
    state: string;
    expected_identity?: string | null;
    verified_identity?: string | null;
    last_healthy_at?: string | null;
    profile_dir?: string | null;
    updated_at: string;
  } | undefined;
  if (!row) return undefined;
  const isManaged = row.mode === "managed";
  return {
    presenceId: row.presence_id,
    mode: row.mode as BrowserBody["mode"],
    ownership: row.ownership as BrowserBody["ownership"],
    state: row.state as BrowserBody["state"],
    canOpenTabs: true,
    canCloseOwnedTabs: true,
    canRestartBrowser: isManaged,
    canRestoreSession: isManaged,
    expectedIdentity: row.expected_identity ?? undefined,
    verifiedIdentity: row.verified_identity ?? undefined,
    lastHealthyAt: row.last_healthy_at ?? undefined,
    profileDir: row.profile_dir ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function recordProcessHeartbeat(processId: string, processType: ProcessHeartbeat["processType"], metadata?: Record<string, JsonValue>): void {
  const nowIso = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO process_heartbeats (process_id, process_type, last_heartbeat_at, metadata)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(process_id) DO UPDATE SET last_heartbeat_at = excluded.last_heartbeat_at, metadata = excluded.metadata
  `).run(processId, processType, nowIso, metadata ? JSON.stringify(metadata) : null);
}

export function getProcessHeartbeats(): ProcessHeartbeat[] {
  const rows = sqlite.prepare("SELECT process_id, process_type, last_heartbeat_at, metadata FROM process_heartbeats").all() as Array<{
    process_id: string;
    process_type: string;
    last_heartbeat_at: string;
    metadata?: string | null;
  }>;
  return rows.map((r) => ({
    processId: r.process_id,
    processType: r.process_type as ProcessHeartbeat["processType"],
    lastHeartbeatAt: r.last_heartbeat_at,
    metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, JsonValue>) : undefined,
  }));
}
