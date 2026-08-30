import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { assertAssignmentPersistenceInvariant, initialState, normalizeState, preflightAssignment, stateForAgent } from "./runtime";
import type { AgentWorkspaceSnapshot, AttentionScope, AttentionTrigger, Bridge, BridgeAdapterStatus, BrowserBody, DependencyHealth, DependencyHealthKind, DependencyHealthState, Execution, JsonValue, MirrorEvent, OpenPresenceState, OperationalRun, OperationalRunState, ProcessHeartbeat, RecoveryAttempt, RecoveryIncident, RecoveryIncidentState, ScheduledWake } from "./types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbSelectionManifestPath = path.join(dataDir, "openpresence-db.json");
const explicitDbPath = process.env.OPENPRESENCE_DB_PATH?.trim();
let selectionManifest: { dbPath?: string; agentId?: string; presenceId?: string; handle?: string } | undefined;
let manifestDbPath: string | undefined;
if (fs.existsSync(dbSelectionManifestPath)) {
  try {
    selectionManifest = JSON.parse(fs.readFileSync(dbSelectionManifestPath, "utf8")) as typeof selectionManifest;
    if (!explicitDbPath && selectionManifest?.dbPath) manifestDbPath = path.resolve(process.cwd(), selectionManifest.dbPath);
  } catch (error) {
    throw new Error(`Invalid ${dbSelectionManifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
const preferredDbPath = path.join(dataDir, "openpresence-genny-restored-full-v2.db");
const restoredDefaultPath = path.join(dataDir, "openpresence-genny-restored-safe.db");
const defaultDbPath = fs.existsSync(preferredDbPath)
  ? preferredDbPath
  : fs.existsSync(restoredDefaultPath)
    ? restoredDefaultPath
    : path.join(dataDir, "openpresence.db");
if (manifestDbPath && !fs.existsSync(manifestDbPath)) {
  throw new Error(`Configured OpenPresence database does not exist: ${manifestDbPath}. Set OPENPRESENCE_DB_PATH explicitly or restore that file; OpenPresence will not fall back to another workspace.`);
}
export const resolvedDbPath = path.resolve(explicitDbPath || manifestDbPath || defaultDbPath);
export const dbSelectionSource = explicitDbPath ? "OPENPRESENCE_DB_PATH" : manifestDbPath ? "data/openpresence-db.json" : "legacy filename fallback";
const isTestDatabaseRuntime = process.env.OPENPRESENCE_TEST_MODE === "1" || process.env.VITEST === "true";
const allowDatabaseInitialization = process.env.OPENPRESENCE_ALLOW_DATABASE_INIT === "1";
if (!fs.existsSync(resolvedDbPath) && !isTestDatabaseRuntime && !allowDatabaseInitialization) {
  throw new Error(`OpenPresence database ${resolvedDbPath} does not exist. Refusing to create a blank workspace; restore the database or set OPENPRESENCE_ALLOW_DATABASE_INIT=1 for an intentional first-run initialization.`);
}
if (fs.existsSync(resolvedDbPath)) {
  const stat = fs.statSync(resolvedDbPath);
  if (stat.size === 0 && !isTestDatabaseRuntime && !allowDatabaseInitialization) {
    throw new Error(`OpenPresence database ${resolvedDbPath} is empty. Refusing to open it because SQLite would create a fresh workspace and make existing data appear lost.`);
  }
  if (stat.size > 0) {
    const descriptor = fs.openSync(resolvedDbPath, "r");
    const headerBuffer = Buffer.alloc(16);
    try { fs.readSync(descriptor, headerBuffer, 0, 16, 0); } finally { fs.closeSync(descriptor); }
    const header = headerBuffer.toString("utf8");
    if (header !== "SQLite format 3\u0000") throw new Error(`OpenPresence database ${resolvedDbPath} is not a valid SQLite file. Refusing to start.`);
  }
}
// Next dev compiles route handlers into separate server bundles. Without a
// process-wide pool, every bundle constructs its own better-sqlite3 handle for
// the same file; hot compilation can then open and retire handles while Bridge
// ingestion and autonomy are writing. On macOS this eventually produced
// SQLITE_IOERR_SHORT_READ and corrupt b-trees. One Node process must own one
// SQLite handle per canonical database path.
type SqliteHandle = InstanceType<typeof Database>;
const sqlitePoolOwner = globalThis as typeof globalThis & {
  __openPresenceSqliteByPath?: Map<string, SqliteHandle>;
};
const sqlitePool = sqlitePoolOwner.__openPresenceSqliteByPath ?? new Map<string, SqliteHandle>();
sqlitePoolOwner.__openPresenceSqliteByPath = sqlitePool;
const sqlite = (() => {
  const existing = sqlitePool.get(resolvedDbPath);
  if (existing) return existing;
  const created = new Database(resolvedDbPath);
  // Refuse to run migrations or autonomous writes against a structurally
  // corrupt file. Starting in that state can turn a recoverable snapshot into
  // a moving target and makes the eventual repair much less trustworthy.
  const integrity = created.pragma("quick_check", { simple: true });
  if (integrity !== "ok") {
    created.close();
    throw new Error(`OpenPresence database ${resolvedDbPath} failed SQLite integrity check: ${String(integrity)}. Refusing to start; restore a validated backup before continuing.`);
  }
  created.pragma("journal_mode = WAL");
  // Chrome Bridge heartbeats and the Presence worker can touch the same local
  // database concurrently. Wait briefly for the writer instead of surfacing a
  // transient SQLITE_BUSY as a hung or failed interface request.
  created.pragma("busy_timeout = 5000");
  sqlitePool.set(resolvedDbPath, created);
  return created;
})();
const db = drizzle(sqlite);

type StateContext = { agentId?: string | null; presenceId?: string | null };
type StateCache = { updatedAt: string; state: OpenPresenceState };
let stateCache: StateCache | undefined;
type HotStateCache = { token: string; snapshot: OpenPresenceState; state: OpenPresenceState };
let hotStateCache: HotStateCache | undefined;

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
const manifestMatchesSelectedDb = Boolean(
  selectionManifest?.dbPath
  && path.resolve(process.cwd(), selectionManifest.dbPath) === resolvedDbPath,
);
if (manifestMatchesSelectedDb && selectionManifest?.agentId && selectionManifest.presenceId) {
  const row = sqlite.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload?: string } | undefined;
  if (!row?.payload) throw new Error(`Configured OpenPresence database ${resolvedDbPath} has no durable app_state snapshot. Refusing to initialize a blank workspace.`);
  try {
    const state = JSON.parse(row.payload) as { agent?: { id?: string }; presences?: Array<{ id?: string; handle?: string }> };
    // The compatibility app_state snapshot may have a different Agent active
    // than the manifest-selected Agent. Validate the configured scope against
    // the normalized ownership indexes first so multi-Agent workspaces remain
    // selectable without weakening the wrong-database protection.
    let configuredAgentId = state.agent?.id;
    let configuredPresenceId: string | undefined;
    let configuredHandle: string | undefined;
    try {
      const agentRow = sqlite.prepare("SELECT id FROM agents WHERE id = ?").get(selectionManifest.agentId) as { id?: string } | undefined;
      const presenceRow = sqlite.prepare("SELECT id, agent_id, payload FROM presences WHERE id = ?").get(selectionManifest.presenceId) as { id?: string; agent_id?: string; payload?: string } | undefined;
      if (agentRow?.id && presenceRow?.id && presenceRow.agent_id === selectionManifest.agentId) {
        configuredAgentId = agentRow.id;
        configuredPresenceId = presenceRow.id;
        try { configuredHandle = (JSON.parse(presenceRow.payload ?? "{}") as { handle?: string }).handle; } catch { /* use the fallback snapshot below */ }
      }
    } catch { /* Older databases may not have normalized identity indexes yet. */ }
    if (!configuredPresenceId) {
      const presence = state.presences?.find((candidate) => candidate.id === selectionManifest?.presenceId);
      configuredPresenceId = presence?.id;
      configuredHandle = presence?.handle;
    }
    if (configuredAgentId !== selectionManifest.agentId || configuredPresenceId !== selectionManifest.presenceId || (selectionManifest.handle && configuredHandle !== selectionManifest.handle)) {
      throw new Error(`Configured database identity does not match ${dbSelectionManifestPath}. Expected Agent ${selectionManifest.agentId}, Presence ${selectionManifest.presenceId}, handle ${selectionManifest.handle ?? "(unspecified)"}; loaded Agent ${configuredAgentId ?? "(missing)"}, Presence ${configuredPresenceId ?? "(missing)"}, handle ${configuredHandle ?? "(missing)"}. Refusing to start against the wrong workspace.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Configured database identity")) throw error;
    throw new Error(`Configured OpenPresence database ${resolvedDbPath} has an unreadable identity snapshot. Refusing to start. ${error instanceof Error ? error.message : String(error)}`);
  }
}
// Older local snapshots duplicated every Agent workspace inside app_state.
// Remove that compatibility-only key once, after confirming the durable
// workspace directory exists; hot reads must never run json_remove over the
// whole snapshot.
const durableWorkspaceCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM agent_workspaces").get() as { count?: number } | undefined)?.count ?? 0;
sqlite.prepare(`UPDATE app_state
  SET payload = json_remove(payload, '$.agentWorkspaces')
  WHERE id = 1
    AND json_type(payload, '$.agentWorkspaces') = 'array'
    AND (json_array_length(payload, '$.agentWorkspaces') = 0 OR ? > 0)`).run(durableWorkspaceCount);
// Bridge liveness is high-frequency operational telemetry. Keep it separate
// from the monolithic Agent workspace so a five-second heartbeat does not
// rewrite the full compatibility snapshot or advance workspace state.
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_health (bridge_id TEXT PRIMARY KEY, state TEXT NOT NULL, adapter_status TEXT NOT NULL, last_heartbeat_at TEXT, last_seen_at TEXT, last_sync_at TEXT, updated_at TEXT NOT NULL)");
// Account identity is a security-critical browser observation. Keep it out of
// the monolithic workspace so an older cognition write cannot erase a newer
// verified account binding.
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_identity (bridge_id TEXT PRIMARY KEY, executor_id TEXT NOT NULL, username TEXT, status TEXT NOT NULL, message TEXT, observed_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_executor_identity (bridge_id TEXT NOT NULL, executor_id TEXT NOT NULL, username TEXT, status TEXT NOT NULL, message TEXT, observed_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (bridge_id, executor_id))");
sqlite.exec("INSERT OR IGNORE INTO bridge_executor_identity (bridge_id, executor_id, username, status, message, observed_at, updated_at) SELECT bridge_id, executor_id, username, status, message, observed_at, updated_at FROM bridge_identity");
sqlite.exec("INSERT INTO agent_workspace_revisions (agent_id, revision, updated_at) SELECT agent_id, 0, updated_at FROM agent_workspaces WHERE agent_id NOT IN (SELECT agent_id FROM agent_workspace_revisions)");
const normalizedTables = [
  "agents", "agent_files", "provider_connections", "asset_provider_connections", "agent_model_profiles", "agent_tool_bindings", "presences", "execution_envelopes", "conversations", "presence_chat_sessions", "messages", "change_sets", "standing_intents", "publishing_plans", "social_intents", "executions", "outcomes", "publications", "asset_usages", "source_evidence", "claim_grounding", "library_sources", "assets", "asset_collections", "asset_collection_memberships", "asset_metadata_edits", "asset_processing_jobs", "assignment_runs", "skills", "agent_skills", "content_drops", "channel_definitions", "native_channel_connections", "bridges", "mirror_objects", "mirror_events", "bridge_sync", "conversation_episodes", "assignment_contributions", "people", "person_identities", "relationships", "relationship_facts", "relationship_open_loops", "recommendation_records", "introduction_records", "scenarios", "scenario_versions", "scenario_runs", "scenario_run_provenance", "scenario_evaluations", "attention_episodes",
  "operational_runs", "scheduled_wakes", "dependency_health", "recovery_incidents", "recovery_attempts", "browser_bodies", "people_notes",
];
for (const table of normalizedTables) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, agent_id TEXT, parent_id TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

// Mirror history is already durably indexed in `mirror_events`. Keeping the
// full append-only log inside app_state made every small autonomy write
// stringify tens of megabytes and block the request-serving event loop.
try {
  const mirrorHistoryCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM mirror_events").get() as { count?: number } | undefined)?.count ?? 0;
  if (mirrorHistoryCount > 0) {
    sqlite.prepare("UPDATE app_state SET payload = json_remove(payload, '$.mirrorEvents') WHERE id = 1 AND json_type(payload, '$.mirrorEvents') = 'array'").run();
    sqlite.prepare("UPDATE agent_workspaces SET payload = json_remove(payload, '$.mirrorEvents') WHERE json_type(payload, '$.mirrorEvents') = 'array'").run();
  }
} catch { /* Older/test databases may not have JSON1 or mirror history yet. */ }

// Operational autonomy indexed tables & high-frequency models (Phase 1)
sqlite.exec("CREATE TABLE IF NOT EXISTS operational_runs_idx (id TEXT PRIMARY KEY, presence_id TEXT, execution_id TEXT, state TEXT NOT NULL, stage TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT, eligible_at TEXT, next_wake_at TEXT, last_progress_at TEXT, last_heartbeat_at TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS scheduled_wakes_idx (id TEXT PRIMARY KEY, presence_id TEXT, wake_at TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT, state TEXT NOT NULL, payload TEXT, updated_at TEXT NOT NULL)");
try { sqlite.exec("ALTER TABLE scheduled_wakes_idx ADD COLUMN created_at TEXT"); } catch { /* Existing databases already have the column. */ }
sqlite.exec("CREATE TABLE IF NOT EXISTS dependency_health_live (id TEXT PRIMARY KEY, presence_id TEXT, dependency TEXT NOT NULL, state TEXT NOT NULL, consecutive_failures INTEGER NOT NULL DEFAULT 0, circuit_until TEXT, current_incident_id TEXT, metadata TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS recovery_incidents_live (id TEXT PRIMARY KEY, root_cause_key TEXT NOT NULL, dependency_id TEXT NOT NULL, presence_id TEXT, state TEXT NOT NULL, recovery_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, safe_summary TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS recovery_attempts_log (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, attempt_number INTEGER NOT NULL, step TEXT NOT NULL, outcome TEXT NOT NULL, error TEXT, timestamp TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS process_heartbeats (process_id TEXT PRIMARY KEY, process_type TEXT NOT NULL, last_heartbeat_at TEXT NOT NULL, metadata TEXT)");
sqlite.exec("CREATE TABLE IF NOT EXISTS body_sessions (presence_id TEXT PRIMARY KEY, mode TEXT NOT NULL, ownership TEXT NOT NULL, state TEXT NOT NULL, expected_identity TEXT, verified_identity TEXT, last_healthy_at TEXT, profile_dir TEXT, updated_at TEXT NOT NULL)");

// This is the external-effect idempotency boundary. Workspace snapshots are
// intentionally not used as the lock: Native routes, Bridge polling, workers,
// and hot-reloaded Next bundles can all hold different snapshots while sharing
// one SQLite database. A targeted public action gets exactly one durable slot,
// regardless of wording, intent id, run id, connector, or process.
sqlite.exec(`CREATE TABLE IF NOT EXISTS public_action_delivery_slots (
  scope_key TEXT PRIMARY KEY,
  presence_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  affordance TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  execution_id TEXT NOT NULL,
  state TEXT NOT NULL,
  external_type TEXT,
  external_id TEXT,
  reserved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
sqlite.exec("CREATE INDEX IF NOT EXISTS public_action_delivery_slots_execution_idx ON public_action_delivery_slots (execution_id)");

export type PublicActionDeliverySlotState = "reserved" | "handed_off" | "uncertain" | "verified";
export interface PublicActionDeliverySlot {
  scopeKey: string;
  presenceId: string;
  environment: string;
  affordance: string;
  targetType?: string;
  targetId?: string;
  executionId: string;
  state: PublicActionDeliverySlotState;
  externalType?: string;
  externalId?: string;
  reservedAt: string;
  updatedAt: string;
}

/**
 * Targeted social actions are unique by target, not by generated wording.
 * That is the safety invariant X users experience: one Presence may reply to
 * one post once. Untargeted original posts retain content idempotency through
 * their existing durable idempotency key.
 */
export function publicActionDeliveryScope(execution: Pick<Execution, "presenceId" | "environment" | "affordance" | "target" | "idempotencyKey">) {
  const environment = execution.environment ?? "live";
  const target = execution.target;
  const semanticIdentity = target
    ? `${execution.presenceId}\u0000${environment}\u0000${execution.affordance}\u0000${target.type}\u0000${target.id}`
    : `${execution.presenceId}\u0000${environment}\u0000${execution.affordance}\u0000${execution.idempotencyKey}`;
  return `delivery:v1:${crypto.createHash("sha256").update(semanticIdentity).digest("hex")}`;
}

function deliverySlotFromRow(row: Record<string, unknown>): PublicActionDeliverySlot {
  return {
    scopeKey: String(row.scope_key),
    presenceId: String(row.presence_id),
    environment: String(row.environment),
    affordance: String(row.affordance),
    targetType: row.target_type ? String(row.target_type) : undefined,
    targetId: row.target_id ? String(row.target_id) : undefined,
    executionId: String(row.execution_id),
    state: String(row.state) as PublicActionDeliverySlotState,
    externalType: row.external_type ? String(row.external_type) : undefined,
    externalId: row.external_id ? String(row.external_id) : undefined,
    reservedAt: String(row.reserved_at),
    updatedAt: String(row.updated_at),
  };
}

function durableExecutionSnapshots(): Execution[] {
  const rows = sqlite.prepare("SELECT payload FROM app_state WHERE id = 1 UNION ALL SELECT payload FROM agent_workspaces").all() as Array<{ payload?: string }>;
  const byId = new Map<string, Execution>();
  for (const row of rows) {
    if (!row.payload) continue;
    try {
      const executions = (JSON.parse(row.payload) as { executions?: Execution[] }).executions ?? [];
      for (const execution of executions) byId.set(execution.id, execution);
    } catch { /* A malformed compatibility row is handled by ordinary state loading. */ }
  }
  return [...byId.values()];
}

/** Atomically acquire the only connector handoff allowed for a public act. */
export function reservePublicActionDelivery(execution: Execution): { acquired: boolean; slot: PublicActionDeliverySlot } {
  const scopeKey = publicActionDeliveryScope(execution);
  return sqlite.transaction(() => {
    let row = sqlite.prepare("SELECT * FROM public_action_delivery_slots WHERE scope_key = ?").get(scopeKey) as Record<string, unknown> | undefined;
    if (!row) {
      // Backfill lazily from the canonical snapshot so upgrading an existing
      // workspace cannot reply again to a target that was already delivered.
      const represented = durableExecutionSnapshots().find((candidate) => candidate.id !== execution.id
        && ["claimed", "executing", "verification-pending", "succeeded"].includes(candidate.status)
        && publicActionDeliveryScope(candidate) === scopeKey);
      const owner = represented ?? execution;
      const nowIso = new Date().toISOString();
      const state: PublicActionDeliverySlotState = represented?.status === "succeeded" ? "verified"
        : represented ? "uncertain"
          : "reserved";
      sqlite.prepare(`INSERT OR IGNORE INTO public_action_delivery_slots
        (scope_key, presence_id, environment, affordance, target_type, target_id, execution_id, state, external_type, external_id, reserved_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        scopeKey,
        owner.presenceId,
        owner.environment ?? "live",
        owner.affordance,
        owner.target?.type ?? null,
        owner.target?.id ?? null,
        owner.id,
        state,
        owner.externalRef?.type ?? null,
        owner.externalRef?.id ?? null,
        nowIso,
        nowIso,
      );
      row = sqlite.prepare("SELECT * FROM public_action_delivery_slots WHERE scope_key = ?").get(scopeKey) as Record<string, unknown>;
    }
    const slot = deliverySlotFromRow(row);
    return { acquired: slot.executionId === execution.id, slot };
  })();
}

export function updatePublicActionDelivery(executionId: string, state: PublicActionDeliverySlotState, externalRef?: { type: string; id: string }) {
  const nowIso = new Date().toISOString();
  sqlite.prepare(`UPDATE public_action_delivery_slots
    SET state = ?, external_type = COALESCE(?, external_type), external_id = COALESCE(?, external_id), updated_at = ?
    WHERE execution_id = ?`).run(state, externalRef?.type ?? null, externalRef?.id ?? null, nowIso, executionId);
}

/** Release only when the connector proves it failed before any public write. */
export function releasePublicActionDelivery(executionId: string) {
  sqlite.prepare("DELETE FROM public_action_delivery_slots WHERE execution_id = ? AND state IN ('reserved', 'handed_off')").run(executionId);
}

export function readPublicActionDeliverySlot(execution: Pick<Execution, "presenceId" | "environment" | "affordance" | "target" | "idempotencyKey">) {
  const row = sqlite.prepare("SELECT * FROM public_action_delivery_slots WHERE scope_key = ?").get(publicActionDeliveryScope(execution)) as Record<string, unknown> | undefined;
  return row ? deliverySlotFromRow(row) : undefined;
}

sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_credentials (bridge_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL, revoked_at TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_executor_credentials (bridge_id TEXT NOT NULL, executor_id TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, revoked_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (bridge_id, executor_id))");
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
    const identity = readBridgeIdentity(bridgeId);
    if (identity) bridge.accountIdentity = identity;
    return bridge as unknown as Bridge;
  } catch { return undefined; }
}

function hydrateBridgeCredentials(state: OpenPresenceState): OpenPresenceState {
  return { ...state, bridges: state.bridges.map((bridge) => {
    const metadata = readBridgeCredentialMetadata(bridge.id);
    return metadata ? { ...bridge, ...metadata } : bridge;
  }) };
}

const mirrorEventReadWindow = 5_000;
function hydrateMirrorEvents(state: OpenPresenceState): OpenPresenceState {
  try {
    // The table is append-only. Reading the oldest window meant the current
    // observation repeatedly failed to see its prior source event, appended a
    // new audit row on every poll, and eventually made the dev server spend
    // most of its time cloning/parsing mirror history. Keep the newest
    // bounded window while preserving chronological order for consumers.
    const rows = sqlite.prepare("SELECT payload FROM mirror_events ORDER BY rowid DESC LIMIT ?").all(mirrorEventReadWindow) as Array<{ payload?: string }>;
    const events = rows.flatMap((row) => {
      try { return row.payload ? [JSON.parse(row.payload) as MirrorEvent] : []; } catch { return []; }
    }).reverse();
    return events.length ? { ...state, mirrorEvents: events } : state;
  } catch {
    return state;
  }
}

export function readBridgeIdentity(bridgeId: string): Bridge["accountIdentity"] | undefined {
  const row = sqlite.prepare("SELECT username, status, message, observed_at FROM bridge_identity WHERE bridge_id = ?").get(bridgeId) as { username?: string | null; status: string; message?: string | null; observed_at: string } | undefined;
  if (!row) return undefined;
  return { username: row.username ?? undefined, status: row.status as NonNullable<Bridge["accountIdentity"]>["status"], message: row.message ?? undefined, observedAt: row.observed_at };
}

export function readBridgeIdentityForExecutor(bridgeId: string, executorId: string): Bridge["accountIdentity"] | undefined {
  const row = sqlite.prepare("SELECT username, status, message, observed_at FROM bridge_executor_identity WHERE bridge_id = ? AND executor_id = ?").get(bridgeId, executorId) as { username?: string | null; status: string; message?: string | null; observed_at: string } | undefined;
  if (!row) return undefined;
  return { username: row.username ?? undefined, status: row.status as NonNullable<Bridge["accountIdentity"]>["status"], message: row.message ?? undefined, observedAt: row.observed_at };
}

function hydrateBridgeIdentity(state: OpenPresenceState): OpenPresenceState {
  const rows = sqlite.prepare("SELECT bridge_id, username, status, message, observed_at FROM bridge_identity").all() as Array<{ bridge_id: string; username?: string | null; status: string; message?: string | null; observed_at: string }>;
  if (!rows.length) return state;
  const identities = new Map(rows.map((row) => [row.bridge_id, { username: row.username ?? undefined, status: row.status as NonNullable<Bridge["accountIdentity"]>["status"], message: row.message ?? undefined, observedAt: row.observed_at }]));
  return { ...state, bridges: state.bridges.map((bridge) => identities.has(bridge.id) ? { ...bridge, accountIdentity: identities.get(bridge.id) } : bridge) };
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
  if (!rows.length) return hydrateBridgeIdentity(state);
  const health = new Map(rows.map((row) => [row.bridge_id, row]));
  return hydrateBridgeIdentity({
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
  });
}

function snapshotWorkspace(state: OpenPresenceState): AgentWorkspaceSnapshot {
  // Avoid cloning the full multi-Agent directory just to persist the active
  // workspace. The directory is already stored separately in
  // `agent_workspaces` and was the main source of multi-second writes.
  const workspace = structuredClone(state) as Partial<OpenPresenceState>;
  delete workspace.agents;
  delete workspace.activeAgentId;
  delete workspace.agentWorkspaces;
  delete workspace.mirrorEvents;
  return workspace as AgentWorkspaceSnapshot;
}

function hydrateAgentWorkspaces(state: OpenPresenceState): OpenPresenceState {
  const rows = sqlite.prepare("SELECT agent_id, payload FROM agent_workspaces").all() as Array<{ agent_id: string; payload: string }>;
  if (!rows.length) return state;
  const revisionRows = sqlite.prepare("SELECT agent_id, revision FROM agent_workspace_revisions").all() as Array<{ agent_id: string; revision: number }>;
  const revisions = new Map(revisionRows.map((row) => [row.agent_id, row.revision]));
  const stored = new Map<string, AgentWorkspaceSnapshot>();
  for (const row of rows) {
    // The compatibility app_state already contains the active workspace. Do
    // not parse and retain a second 20 MB copy of that same snapshot on every
    // cold read; only hydrate other Agents for the switcher.
    if (row.agent_id === state.activeAgentId) continue;
    try { stored.set(row.agent_id, { ...(JSON.parse(row.payload) as AgentWorkspaceSnapshot), workspaceRevision: revisions.get(row.agent_id) ?? 0 }); } catch { /* retain the compatibility snapshot below */ }
  }
  const snapshots = state.agentWorkspaces.map((workspace) => workspace.agent?.id ? stored.get(workspace.agent.id) ?? workspace : workspace);
  for (const workspace of stored.values()) {
    if (workspace.agent?.id && workspace.agent.id !== state.activeAgentId && !snapshots.some((item) => item.agent?.id === workspace.agent?.id)) snapshots.push(workspace);
  }
  return { ...state, workspaceRevision: state.activeAgentId ? revisions.get(state.activeAgentId) ?? state.workspaceRevision ?? 0 : state.workspaceRevision, agentWorkspaces: snapshots };
}

type BrowserBodyRow = {
  presence_id: string;
  mode: string;
  ownership: string;
  state: string;
  expected_identity?: string | null;
  verified_identity?: string | null;
  last_healthy_at?: string | null;
  profile_dir?: string | null;
  updated_at: string;
};

function browserBodyFromRow(row: BrowserBodyRow): BrowserBody {
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

  let browserBodies = state.browserBodies;
  try {
    const bodyRows = sqlite.prepare("SELECT presence_id, mode, ownership, state, expected_identity, verified_identity, last_healthy_at, profile_dir, updated_at FROM body_sessions").all() as BrowserBodyRow[];
    if (bodyRows.length > 0) browserBodies = bodyRows.map(browserBodyFromRow);
  } catch { /* retain compatibility when the body index is unavailable */ }

  let operationalRuns = state.operationalRuns;
  try {
    // The durable index is the source of truth, but the browser does not need
    // thousands of terminal scheduler records on every Activity read. Keep
    // active/recovering runs plus a bounded recent window for progressive
    // disclosure; direct run lookups and listOperationalRuns remain complete.
    const operationalRunCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const opRows = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE state NOT IN ('succeeded', 'failed', 'cancelled') OR updated_at >= ? ORDER BY updated_at DESC LIMIT 300").all(operationalRunCutoff) as Array<{ payload: string }>;
    if (opRows.length > 0) {
      operationalRuns = opRows.flatMap((r) => {
        try { return [JSON.parse(r.payload) as OperationalRun]; } catch { return []; }
      });
    }
  } catch { /* retain compatibility when table not available */ }

  let scheduledWakes = state.scheduledWakes;
  try {
    const wakeRows = sqlite.prepare("SELECT id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at FROM scheduled_wakes_idx WHERE state = 'pending' ORDER BY wake_at ASC LIMIT 300").all() as Array<{ id: string; presence_id?: string | null; wake_at: string; kind: string; target_id?: string | null; state: string; payload?: string | null; updated_at: string; created_at?: string | null }>;
    scheduledWakes = wakeRows.map((row) => ({ id: row.id, presenceId: row.presence_id ?? undefined, wakeAt: row.wake_at, kind: row.kind as ScheduledWake["kind"], targetId: row.target_id ?? undefined, state: row.state as ScheduledWake["state"], payload: row.payload ? JSON.parse(row.payload) as Record<string, JsonValue> : undefined, createdAt: row.created_at ?? row.updated_at, updatedAt: row.updated_at }));
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
    scheduledWakes: scheduledWakes ?? [],
    dependencyHealth: dependencyHealth ?? [],
    browserBodies: browserBodies ?? [],
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
  const identity = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM bridge_identity").get() as { updated_at?: string | null } | undefined;
  const incident = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM recovery_incidents_live").get() as { updated_at?: string | null } | undefined;
  const run = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM operational_runs_idx").get() as { updated_at?: string | null } | undefined;
  const wake = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM scheduled_wakes_idx").get() as { updated_at?: string | null } | undefined;
  const dependency = sqlite.prepare("SELECT MAX(updated_at) AS updated_at FROM dependency_health_live").get() as { updated_at?: string | null } | undefined;
  return `${workspace}:${health?.updated_at ?? "empty"}:${identity?.updated_at ?? "empty"}:${incident?.updated_at ?? "empty"}:${run?.updated_at ?? "empty"}:${wake?.updated_at ?? "empty"}:${dependency?.updated_at ?? "empty"}`;
}

export function writeBridgeIdentity(input: { bridgeId: string; executorId: string; username?: string; status: NonNullable<Bridge["accountIdentity"]>["status"]; message?: string; observedAt: string }) {
  sqlite.prepare(`INSERT INTO bridge_executor_identity (bridge_id, executor_id, username, status, message, observed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bridge_id, executor_id) DO UPDATE SET username = excluded.username,
      status = excluded.status, message = excluded.message, observed_at = excluded.observed_at, updated_at = excluded.updated_at`).run(
    input.bridgeId, input.executorId, input.username ?? null, input.status, input.message ?? null, input.observedAt, input.observedAt,
  );
  const cutoff = new Date(new Date(input.observedAt).getTime() - 30 * 60_000).toISOString();
  const aggregate = sqlite.prepare(`SELECT executor_id, username, status, message, observed_at, updated_at
    FROM bridge_executor_identity
    WHERE bridge_id = ?
    ORDER BY CASE WHEN status = 'verified' AND observed_at >= ? THEN 0 ELSE 1 END, observed_at DESC
    LIMIT 1`).get(input.bridgeId, cutoff) as { executor_id: string; username?: string | null; status: string; message?: string | null; observed_at: string; updated_at: string };
  sqlite.prepare(`INSERT INTO bridge_identity (bridge_id, executor_id, username, status, message, observed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bridge_id) DO UPDATE SET executor_id = excluded.executor_id, username = excluded.username,
      status = excluded.status, message = excluded.message, observed_at = excluded.observed_at, updated_at = excluded.updated_at`).run(
    input.bridgeId, aggregate.executor_id, aggregate.username ?? null, aggregate.status, aggregate.message ?? null, aggregate.observed_at, aggregate.updated_at,
  );
  stateCache = undefined;
}

export function deleteBridgeIdentity(bridgeId: string) {
  sqlite.prepare("DELETE FROM bridge_identity WHERE bridge_id = ?").run(bridgeId);
  sqlite.prepare("DELETE FROM bridge_executor_identity WHERE bridge_id = ?").run(bridgeId);
  stateCache = undefined;
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

/** Persist append-only Mirror history without rebuilding the full workspace. */
export function appendMirrorEvents(events: MirrorEvent[]) {
  if (!events.length) return;
  const updatedAt = new Date().toISOString();
  const insert = sqlite.prepare("INSERT OR REPLACE INTO mirror_events (id, agent_id, parent_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)");
  sqlite.transaction(() => {
    for (const event of events) insert.run(event.id, null, event.bridgeId, JSON.stringify(event), updatedAt);
  })();
  stateCache = undefined;
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
 * Read only the fields the browser adapter needs to discover its Presence.
 * The adapter polls this endpoint frequently; normalizing the complete Agent
 * workspace here turns a liveness check into a multi-megabyte CPU/memory job.
 */
export function readBrowserPresenceConfig(context: StateContext = {}) {
  // The browser bridge polls this path while an X tab is live. Do not use a
  // JSON extraction on the 40+ MB workspace snapshot here: SQLite has to
  // parse that whole document before returning a few Presence fields, which
  // can delay a heartbeat long enough to manufacture a "Connection stale"
  // state. Presences are already durably indexed for exactly this purpose.
  const rows = context.presenceId
    ? sqlite.prepare(`SELECT payload FROM presences WHERE id = ?${context.agentId ? " AND agent_id = ?" : ""} LIMIT 1`)
      .all(...(context.agentId ? [context.presenceId, context.agentId] : [context.presenceId])) as Array<{ payload?: string }>
    : context.agentId
      ? sqlite.prepare("SELECT payload FROM presences WHERE agent_id = ? ORDER BY updated_at DESC").all(context.agentId) as Array<{ payload?: string }>
      : sqlite.prepare("SELECT payload FROM presences WHERE json_extract(payload, '$.browserAccess.enabled') = 1 ORDER BY updated_at DESC").all() as Array<{ payload?: string }>;
  let presences: Array<Record<string, unknown>> = [];
  try {
    presences = rows.flatMap((row) => {
      if (!row.payload) return [];
      const parsed = JSON.parse(row.payload) as unknown;
      return parsed && typeof parsed === "object" ? [parsed as Record<string, unknown>] : [];
    });
  } catch {
    // A malformed compatibility projection must not take down the Bridge.
  }
  const enabled = presences.filter((presence) => (presence.browserAccess as { enabled?: boolean } | undefined)?.enabled === true);
  const selected = context.presenceId ? presences[0] : enabled[0];
  return {
    activePresenceId: typeof selected?.id === "string" ? selected.id : null,
    presences: context.presenceId ? presences : enabled,
  };
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
    const storedAgents = (sqlite.prepare("SELECT COUNT(*) AS count FROM agents").get() as { count?: number } | undefined)?.count ?? 0;
    if (storedAgents > 0) {
      throw new Error(`OpenPresence database ${resolvedDbPath} has normalized records but no app_state snapshot. Refusing to reset the workspace.`);
    }
    const state = initialState();
    writeState(state);
    return readStateSnapshot();
  }
  const cachedState = stateCache;
  if (cachedState && cachedState.updatedAt === row.updated_at) return cachedState.state;
  try {
    const state = hydrateBridgeCredentials(hydrateAgentWorkspaces(hydrateMirrorEvents(normalizeState(JSON.parse(row.payload) as OpenPresenceState))));
    stateCache = { updatedAt: row.updated_at ?? "", state };
    return state;
  } catch (error) {
    throw new Error(`OpenPresence database ${resolvedDbPath} contains an unreadable app_state snapshot. Refusing to replace it with an empty workspace. Restore a backup before continuing. ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function readState(): OpenPresenceState {
  return structuredClone(hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot()))) as OpenPresenceState;
}

/** Materialize a mutable context from the cached state with one clone. */
export function readStateForContext(context: StateContext): OpenPresenceState {
  const snapshot = readStateSnapshot();
  const requestedAgentId = context.agentId ?? snapshot.activeAgentId ?? undefined;
  const workspace = requestedAgentId && requestedAgentId !== snapshot.activeAgentId
    ? snapshot.agentWorkspaces.find((item) => item.agent?.id === requestedAgentId)
    : undefined;
  // The active workspace is already parsed and normalized in stateCache. Build
  // the requested Agent scope from that immutable snapshot instead of parsing
  // both the 14 MB compatibility row and its equally large workspace row on
  // every Bridge claim, identity, acknowledgement, or verification request.
  // A structured clone keeps mutation isolation without the extra stringify /
  // parse cycle that previously doubled event-loop and GC pressure.
  const scopedInput = structuredClone(workspace
    ? { ...snapshot, ...workspace, agents: snapshot.agents, activeAgentId: workspace.agent?.id ?? requestedAgentId, agentWorkspaces: [] }
    : { ...snapshot, agentWorkspaces: [] }) as OpenPresenceState;
  const scoped = workspace ? hydrateMirrorEvents(normalizeState(scopedInput)) : scopedInput;
  if (workspace || !requestedAgentId || requestedAgentId === snapshot.activeAgentId) {
    if (context.presenceId && scoped.presences.some((presence) => presence.id === context.presenceId)) {
      scoped.activePresenceId = context.presenceId;
      scoped.presence = scoped.presences.find((presence) => presence.id === context.presenceId) ?? scoped.presence;
    }
  } else {
    // Preserve the existing compatibility fallback for an unknown Agent ID;
    // callers still receive a complete canonical state rather than an empty
    // workspace and can apply their normal ownership validation.
    return readStateSnapshotForContext(context);
  }
  const hydrated = hydrateOperationalState(hydrateBridgeHealth(scoped));
  // Browser-facing mutations do not need the Agent directory snapshots. Keep
  // those durable rows server-side so POST responses stay small too.
  hydrated.agentWorkspaces = [];
  return hydrated;
}

/** Read-only context projection for GET responses; unchanged active reads share the cache. */
export function readStateSnapshotForContext(context: StateContext): OpenPresenceState {
  // Read the requested Agent workspace directly instead of hydrating the
  // compatibility row's historical Agent directory. This is the hot path for
  // Activity, health, and browser configuration requests.
  const row = sqlite.prepare("SELECT payload, updated_at FROM app_state WHERE id = 1").get() as { payload?: string; updated_at?: string } | undefined;
  if (!row?.payload) return JSON.parse(JSON.stringify(readStateSnapshot())) as OpenPresenceState;
  try {
    const compact = JSON.parse(row.payload) as OpenPresenceState;
    const requestedAgentId = context.agentId ?? compact.activeAgentId ?? undefined;
    const workspaceRow = requestedAgentId
      ? sqlite.prepare("SELECT payload FROM agent_workspaces WHERE agent_id = ?").get(requestedAgentId) as { payload?: string } | undefined
      : undefined;
    const workspace = workspaceRow?.payload ? JSON.parse(workspaceRow.payload) as Partial<OpenPresenceState> : undefined;
    const scopedInput = workspace
      ? { ...compact, ...workspace, agents: compact.agents, activeAgentId: workspace.agent?.id ?? requestedAgentId, agentWorkspaces: [workspace] }
      : { ...compact, agentWorkspaces: [] };
    const scoped = hydrateMirrorEvents(normalizeState(scopedInput as OpenPresenceState));
    // `scopedInput` is freshly parsed from SQLite, so normalization already
    // gives callers an isolated mutable context. Re-running stateForContext
    // here used to deep-clone and normalize the same multi-megabyte workspace
    // a second time on every worker read. Select the requested Presence
    // directly after validation while preserving the operational projections.
    if (context.presenceId && scoped.presences.some((presence) => presence.id === context.presenceId)) {
      scoped.activePresenceId = context.presenceId;
      scoped.presence = scoped.presences.find((presence) => presence.id === context.presenceId) ?? scoped.presence;
    }
    return hydrateOperationalState(hydrateBridgeHealth(scoped));
  } catch (error) {
    throw new Error(`OpenPresence database ${resolvedDbPath} contains an unreadable scoped workspace snapshot. ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Read-only hot-path view for health and browser GETs. The returned object is
 * backed by the in-process snapshot cache and must not be mutated. Mutating
 * callers should continue using readStateSnapshotForContext/readStateForContext.
 */
export function readStateViewForContext(context: StateContext): OpenPresenceState {
  const snapshot = readStateSnapshot();
  const hotToken = readStateReadToken();
  const hydratedHotState = hotStateCache?.snapshot === snapshot && hotStateCache.token === hotToken
    ? hotStateCache.state
    : hydrateOperationalState(hydrateBridgeHealth(snapshot));
  if (hotStateCache?.snapshot !== snapshot || hotStateCache.token !== hotToken) {
    hotStateCache = { token: hotToken, snapshot, state: hydratedHotState };
  }
  const requestedAgentId = context.agentId ?? snapshot.activeAgentId ?? undefined;
  const targetPresenceId = context.presenceId ?? snapshot.activePresenceId ?? undefined;
  // Preflight is a read projection of connector and authority state. Refresh
  // only the Presence visible to this browser request; doing this for every
  // Assignment during global normalization can multiply a large restored
  // workspace and exhaust the Node heap.
  const refreshVisibleAssignmentPreflights = (source: OpenPresenceState) => {
    const assignments = source.assignments.map((assignment) => {
      if (targetPresenceId && assignment.presenceId !== targetPresenceId) return assignment;
      // Completed/cancelled history is immutable from the Activity reader's
      // point of view. Re-running capability readiness for hundreds of old
      // Assignments on every heartbeat was the dominant allocation source in
      // the hot read path. Active/due work still gets a fresh preflight.
      if (["completed", "cancelled"].includes(assignment.status)) return assignment;
      const reviewedRevision = assignment.preflight?.reviewedRevision;
      if (reviewedRevision !== undefined && reviewedRevision === (assignment.revision ?? 0)) return assignment;
      return {
        ...assignment,
        preflight: preflightAssignment(source, assignment, assignment.executionPolicy.delegationPolicy),
      };
    });
    return assignments.some((assignment, index) => assignment !== source.assignments[index])
      ? { ...source, assignments }
      : source;
  };
  // The common browser path addresses the active Agent. `stateForContext`
  // defensively deep-clones and normalizes the entire workspace, which is
  // appropriate for mutations but catastrophic for a polling GET over a
  // 20 MB compatibility snapshot. Read-only Activity/health consumers can
  // share the cached immutable snapshot and only replace the active Presence
  // pointers when a Presence was explicitly requested.
  if (!context.agentId || context.agentId === snapshot.activeAgentId) {
    if (!context.presenceId || snapshot.presences.some((presence) => presence.id === context.presenceId)) {
      if (!context.presenceId || snapshot.activePresenceId === context.presenceId) return refreshVisibleAssignmentPreflights(hydratedHotState);
      return refreshVisibleAssignmentPreflights({
        ...hydratedHotState,
        activePresenceId: context.presenceId,
        presence: hydratedHotState.presences.find((presence) => presence.id === context.presenceId) ?? hydratedHotState.presence,
      });
    }
  }
  const workspace = requestedAgentId && requestedAgentId !== snapshot.activeAgentId
    ? snapshot.agentWorkspaces.find((item) => item.agent?.id === requestedAgentId)
    : undefined;
  let scoped = workspace
    ? { ...snapshot, ...workspace, agents: snapshot.agents, activeAgentId: workspace.agent?.id ?? requestedAgentId ?? null, agentWorkspaces: snapshot.agentWorkspaces }
    : snapshot;
  if (context.presenceId && scoped.presences.some((presence) => presence.id === context.presenceId) && scoped.activePresenceId !== context.presenceId) {
    scoped = { ...scoped, activePresenceId: context.presenceId, presence: scoped.presences.find((presence) => presence.id === context.presenceId) ?? null };
  }
  return refreshVisibleAssignmentPreflights({
    ...hydratedHotState,
    ...scoped,
  });
}

/**
 * Minimal read model for liveness/health decisions. Health checks must never
 * parse the 20 MB compatibility workspace (and then clone/normalize it) just
 * to answer whether a Presence, X connection, or queued bridge execution is
 * usable. Keep this projection on the indexed domain rows and the small
 * assignments slice instead.
 */
export function readRuntimeHealthProjection(presenceId?: string) {
  // The compatibility snapshot remains authoritative, but it is already
  // parsed and cached by readStateSnapshot(). Calling SQLite json_extract on
  // the full app_state payload here made every health poll scan ~43 MB and
  // caused the Node process to spend most of its time in JSON1 parsing/GC.
  // Use the cached canonical arrays; the cache invalidates on canonical writes
  // and the indexed tables continue to supply high-frequency health records.
  const snapshot = readStateSnapshot();
  const presences = (presenceId
    ? snapshot.presences.filter((presence) => presence.id === presenceId)
    : snapshot.presences);
  const nativeConnections = snapshot.nativeConnections.filter((item) => !presenceId || item.presenceId === presenceId);
  const executions = snapshot.executions.filter((item) => !presenceId || item.presenceId === presenceId);
  const assignments = snapshot.assignments.filter((item) => !presenceId || item.presenceId === presenceId);
  return { presences, nativeConnections, executions, assignments };
}

/** Cheap, read-only projection used by the Technical Audit ledger. */
export function readRuntimeAuditProjection(presenceId?: string) {
  const parseRows = <T>(rows: Array<{ payload?: string }>) => rows.flatMap((row) => {
    if (!row.payload) return [];
    try { return [JSON.parse(row.payload) as T]; } catch { return []; }
  });
  const parseJsonEach = <T>(path: string) => {
    const rows = sqlite.prepare("SELECT value FROM json_each((SELECT payload FROM app_state WHERE id = 1), ?)").all(path) as Array<{ value?: string }>;
    return rows.flatMap((row) => {
      if (!row.value) return [];
      try { return [JSON.parse(row.value) as T]; } catch { return []; }
    });
  };
  const filterPresence = <T extends { presenceId?: string }>(items: T[]) => items.filter((item) => !presenceId || item.presenceId === presenceId);
  const readNormalizedOrCompatibility = <T extends { presenceId?: string }>(table: string, jsonPath: string, whereSql?: string, whereArgs: string[] = []) => {
    // The compatibility snapshot is authoritative. Normalized tables may be
    // briefly behind because their rebuild is debounced; an audit view must
    // never make a durable execution or outcome disappear during that gap.
    const canonicalType = sqlite.prepare("SELECT json_type(payload, ?) AS type FROM app_state WHERE id = 1").get(jsonPath) as { type?: string | null } | undefined;
    if (canonicalType?.type === "array") return filterPresence(parseJsonEach<T>(jsonPath));
    const rows = sqlite.prepare(whereSql ? `SELECT payload FROM ${table} WHERE ${whereSql}` : `SELECT payload FROM ${table}`).all(...whereArgs) as Array<{ payload?: string }>;
    const normalized = filterPresence(parseRows<T>(rows));
    // Normalized writes are intentionally debounced so a high-frequency
    // state mutation cannot rebuild every audit table inline. During that
    // short projection window, fall back to the authoritative compatibility
    // snapshot instead of making a just-created decision/execution invisible
    // to the forensic ledger.
    return normalized;
  };
  return {
    mirrorObjects: filterPresence(parseRows<OpenPresenceState["mirrorObjects"][number]>(sqlite.prepare("SELECT payload FROM mirror_objects").all() as Array<{ payload?: string }>)),
    socialDecisions: filterPresence(parseJsonEach<OpenPresenceState["socialDecisions"][number]>("$.socialDecisions")),
    executions: readNormalizedOrCompatibility<OpenPresenceState["executions"][number]>("executions", "$.executions", presenceId ? "json_extract(payload, '$.presenceId') = ?" : undefined, presenceId ? [presenceId] : []),
    outcomes: readNormalizedOrCompatibility<OpenPresenceState["outcomes"][number]>("outcomes", "$.outcomes"),
    resourceUsageEvents: filterPresence(parseJsonEach<OpenPresenceState["resourceUsageEvents"][number]>("$.resourceUsageEvents")),
    attentionEpisodes: filterPresence(parseJsonEach<NonNullable<OpenPresenceState["attentionEpisodes"]>[number]>("$.attentionEpisodes")),
    modelProfiles: parseRows<OpenPresenceState["modelProfiles"][number]>(sqlite.prepare("SELECT payload FROM agent_model_profiles").all() as Array<{ payload?: string }>),
  };
}

export function readStateForAgent(agentId?: string | null): OpenPresenceState {
  return stateForAgent(hydrateOperationalState(hydrateBridgeHealth(readStateSnapshot())), agentId);
}

/** Resolve connector work from its durable Presence/Agent owner, never from the active projection. */
export function readStateForBridge(bridgeId: string): OpenPresenceState {
  // Bridge authentication and polling are high-frequency connector paths. The
  // normalized bridge index already records the owning Agent and Presence, so
  // do not deep-clone the complete compatibility workspace for every claim,
  // identity, acknowledgement, or verification request. Keep the complete
  // read as a compatibility fallback for older databases whose bridge index
  // has not been populated yet.
  const owner = sqlite.prepare("SELECT agent_id, parent_id FROM bridges WHERE id = ?").get(bridgeId) as { agent_id?: string | null; parent_id?: string | null } | undefined;
  if (owner?.parent_id) {
    const scoped = readStateForContext({ agentId: owner.agent_id, presenceId: owner.parent_id });
    if (scoped.bridges.some((bridge) => bridge.id === bridgeId)) return scoped;
  }
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
    asset_collections: (state.assetCollections ?? []).map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    asset_collection_memberships: (state.assetCollectionMemberships ?? []).map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.collectionId, payload: item })),
    asset_metadata_edits: (state.assetMetadataEdits ?? []).map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.assetId, payload: item })),
    asset_processing_jobs: (state.assetProcessingJobs ?? []).map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.assetId, payload: item })),
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
    people_notes: (state.peopleNotes ?? []).map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
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
    attention_episodes: (state.attentionEpisodes ?? []).map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
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
      if (table === "mirror_events") {
        // `mirror_events` is append-only history. The compatibility workspace
        // intentionally hydrates only a recent cognition window, so a
        // normalized projection refresh must never delete older rows.
        const insertMirrorEvent = sqlite.prepare("INSERT OR REPLACE INTO mirror_events (id, agent_id, parent_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)");
        for (const row of rowsByTable.get(table)?.values() ?? []) insertMirrorEvent.run(row.id, row.agentId ?? null, row.parentId ?? null, JSON.stringify(row.payload), timestamp);
        continue;
      }
      sqlite.prepare(`DELETE FROM ${table}`).run();
      const insert = sqlite.prepare(`INSERT INTO ${table} (id, agent_id, parent_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)`);
      for (const row of rowsByTable.get(table)?.values() ?? []) insert.run(row.id, row.agentId ?? null, row.parentId ?? null, JSON.stringify(row.payload), timestamp);
    }
  });
  transaction();
}

/**
 * Bridge credentials and connector routes use the indexed bridge table for a
 * cheap lookup. Keep only that small projection current on canonical writes;
 * the rest of the normalized model remains an opt-in derived projection.
 */
function writeActiveBridgeProjection(state: OpenPresenceState, timestamp: string) {
  const presenceIds = state.presences.map((presence) => presence.id);
  if (presenceIds.length > 0) {
    sqlite.prepare(`DELETE FROM bridges WHERE parent_id IN (${presenceIds.map(() => "?").join(",")})`).run(...presenceIds);
  }
  const insert = sqlite.prepare("INSERT OR REPLACE INTO bridges (id, agent_id, parent_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)");
  for (const bridge of state.bridges) {
    insert.run(bridge.id, state.agent?.id ?? null, bridge.presenceId ?? null, JSON.stringify(bridge), timestamp);
  }
}

// The JSON compatibility snapshot is the authoritative write model. The
// normalized tables are a derived projection used by indexed readers and
// migrations; rebuilding every table after every UI heartbeat made a harmless
// state change hold SQLite's writer lock and the Node event loop for seconds.
// Projection sync is therefore opt-in for maintenance/migration callers.
let normalizedSyncPending: OpenPresenceState | undefined;
let normalizedSyncTimer: ReturnType<typeof setTimeout> | undefined;
let normalizedSyncInFlight = false;

function flushNormalizedSync() {
  normalizedSyncTimer = undefined;
  const pending = normalizedSyncPending;
  normalizedSyncPending = undefined;
  if (!pending) return;
  normalizedSyncInFlight = true;
  try {
    writeNormalized(pending);
  } catch (error) {
    // Projection lag is recoverable; the canonical app_state write already
    // succeeded and the next state mutation will retry the projection.
    console.warn("OpenPresence normalized projection deferred", error instanceof Error ? error.message : String(error));
  } finally {
    normalizedSyncInFlight = false;
    if (normalizedSyncPending && !normalizedSyncTimer) {
      normalizedSyncTimer = setTimeout(flushNormalizedSync, 250);
      if (typeof normalizedSyncTimer.unref === "function") normalizedSyncTimer.unref();
    }
  }
}

function scheduleNormalizedSync(state: OpenPresenceState) {
  normalizedSyncPending = state;
  if (normalizedSyncTimer || normalizedSyncInFlight) return;
  normalizedSyncTimer = setTimeout(flushNormalizedSync, 250);
  if (typeof normalizedSyncTimer.unref === "function") normalizedSyncTimer.unref();
}

export function writeState(state: OpenPresenceState, options?: { advanceWorkspaceRevision?: boolean; syncNormalized?: boolean; persistAgentWorkspaces?: boolean; force?: boolean }) {
  const normalized = normalizeState(state);
  // Never overwrite a durable workspace with a partial or unlinked Assignment
  // collection. Known legacy records are repaired by normalizeState; anything
  // still invalid fails closed before SQLite is touched.
  assertAssignmentPersistenceInvariant(normalized);
  const agentId = normalized.agent?.id;
  const advanceWorkspaceRevision = options?.advanceWorkspaceRevision !== false;
  const syncNormalized = options?.syncNormalized === true;
  const expectedRevision = typeof state.workspaceRevision === "number" ? state.workspaceRevision : undefined;
  const persistedAt = new Date().toISOString();
  let compatibilityPayload = "";
  sqlite.transaction(() => {
    let actualRevision = 0;
    if (agentId) {
      sqlite.prepare("INSERT OR IGNORE INTO agent_workspace_revisions (agent_id, revision, updated_at) VALUES (?, 0, ?)").run(agentId, persistedAt);
      actualRevision = ((sqlite.prepare("SELECT revision FROM agent_workspace_revisions WHERE agent_id = ?").get(agentId) as { revision?: number } | undefined)?.revision ?? 0);
      if (expectedRevision !== undefined && expectedRevision !== actualRevision && !options?.force) throw new WorkspaceConflictError(agentId, expectedRevision, actualRevision);
      normalized.workspaceRevision = advanceWorkspaceRevision ? actualRevision + 1 : actualRevision;
    }
    // `agent_workspaces` is the durable directory for non-active Agents. Do
    // not duplicate all of those snapshots inside the compatibility row:
    // Activity and health reads would otherwise parse tens of megabytes just
    // to render one Presence.
    const compatibilityState = { ...normalized } as Partial<OpenPresenceState>;
    delete compatibilityState.agentWorkspaces;
    delete compatibilityState.mirrorEvents;
    compatibilityPayload = JSON.stringify(compatibilityState);
    sqlite.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(compatibilityPayload, persistedAt);
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
    writeActiveBridgeProjection(normalized, persistedAt);
  })();
  stateCache = undefined;
  // Keep direct in-process callers aligned with the durable token as well;
  // API callers still receive the same token in the JSON response/header.
  state.workspaceRevision = normalized.workspaceRevision;
  if (syncNormalized) scheduleNormalizedSync(normalized);
}

function hashBridgeKey(key: string) { return crypto.createHash("sha256").update(key).digest("hex"); }
function issueBridgeKey(bridgeId: string) {
  const key = `opb_${crypto.randomBytes(32).toString("base64url")}`;
  sqlite.prepare("INSERT INTO bridge_credentials (bridge_id, key_hash, key_prefix, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(bridge_id) DO UPDATE SET key_hash = excluded.key_hash, key_prefix = excluded.key_prefix, revoked_at = NULL, updated_at = excluded.updated_at").run(bridgeId, hashBridgeKey(key), key.slice(0, 12), new Date().toISOString());
  return key;
}
export function issueBridgeExecutorKey(bridgeId: string, executorId: string) {
  const key = `opb_${crypto.randomBytes(32).toString("base64url")}`;
  sqlite.prepare(`INSERT INTO bridge_executor_credentials (bridge_id, executor_id, key_hash, key_prefix, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bridge_id, executor_id) DO UPDATE SET key_hash = excluded.key_hash, key_prefix = excluded.key_prefix, revoked_at = NULL, updated_at = excluded.updated_at`).run(
    bridgeId, executorId, hashBridgeKey(key), key.slice(0, 12), new Date().toISOString(),
  );
  return key;
}
function revokeBridgeKey(bridgeId: string) {
  const at = new Date().toISOString();
  sqlite.prepare("UPDATE bridge_credentials SET revoked_at = ?, updated_at = ? WHERE bridge_id = ?").run(at, at, bridgeId);
  sqlite.prepare("UPDATE bridge_executor_credentials SET revoked_at = ?, updated_at = ? WHERE bridge_id = ?").run(at, at, bridgeId);
}
export function deleteBridgeCredential(bridgeId: string) {
  sqlite.prepare("DELETE FROM bridge_credentials WHERE bridge_id = ?").run(bridgeId);
  sqlite.prepare("DELETE FROM bridge_executor_credentials WHERE bridge_id = ?").run(bridgeId);
}
function authenticateBridgeKey(key: string) {
  const row = sqlite.prepare("SELECT bridge_id, key_hash, revoked_at FROM bridge_credentials WHERE key_hash = ?").get(hashBridgeKey(key)) as { bridge_id: string; key_hash: string; revoked_at?: string | null } | undefined;
  if (row && !row.revoked_at) return row.bridge_id;
  const executorRow = sqlite.prepare("SELECT bridge_id, revoked_at FROM bridge_executor_credentials WHERE key_hash = ?").get(hashBridgeKey(key)) as { bridge_id: string; revoked_at?: string | null } | undefined;
  return executorRow && !executorRow.revoked_at ? executorRow.bridge_id : undefined;
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
    const row = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at < ?)").get(runId, nowIso) as { payload?: string } | undefined;
    if (!row?.payload) return false;
    const run = JSON.parse(row.payload) as OperationalRun;
    run.leaseOwner = leaseOwner;
    run.leaseExpiresAt = expiresAt;
    run.lastHeartbeatAt = nowIso;
    const result = sqlite.prepare(`UPDATE operational_runs_idx SET lease_owner = ?, lease_expires_at = ?, last_heartbeat_at = ?, payload = ?, updated_at = ? WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at < ?)`)
      .run(leaseOwner, expiresAt, nowIso, JSON.stringify(run), nowIso, runId, nowIso);
    return result.changes === 1;
  })();
}

/**
 * Renew a claimed run without pretending that a long network/model call made
 * logical progress. The scheduler uses lastProgressAt for stale detection;
 * this heartbeat only keeps the lease alive while the worker is still
 * executing. That separation prevents both duplicate workers and false
 * "stalled" recoveries.
 */
export function heartbeatOperationalRunLease(runId: string, leaseOwner: string, durationMs = 120000): boolean {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();
  return sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT payload FROM operational_runs_idx WHERE id = ? AND lease_owner = ?").get(runId, leaseOwner) as { payload?: string } | undefined;
    if (!row?.payload) return false;
    let run: OperationalRun;
    try { run = JSON.parse(row.payload) as OperationalRun; } catch { return false; }
    run.lastHeartbeatAt = nowIso;
    run.leaseExpiresAt = expiresAt;
    const result = sqlite.prepare(`
      UPDATE operational_runs_idx
      SET lease_expires_at = ?, last_heartbeat_at = ?, payload = ?, updated_at = ?
      WHERE id = ? AND lease_owner = ?
    `).run(expiresAt, nowIso, JSON.stringify(run), nowIso, runId, leaseOwner);
    return result.changes === 1;
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
  const expired = sqlite.prepare("SELECT id, payload FROM operational_runs_idx WHERE lease_owner IS NOT NULL AND lease_expires_at < ?").all(nowIso) as Array<{ id: string; payload: string }>;
  if (!expired.length) return 0;
  const update = sqlite.prepare("UPDATE operational_runs_idx SET lease_owner = NULL, lease_expires_at = NULL, payload = ?, updated_at = ? WHERE id = ? AND lease_expires_at < ?");
  return sqlite.transaction(() => expired.reduce((count, row) => {
    let payload: OperationalRun;
    try { payload = JSON.parse(row.payload) as OperationalRun; } catch { return count; }
    delete payload.leaseOwner;
    delete payload.leaseExpiresAt;
    return count + update.run(JSON.stringify(payload), nowIso, row.id, nowIso).changes;
  }, 0))();
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

const attentionScopeRank: Record<AttentionScope, number> = {
  observe_inbound: 0,
  recovery: 1,
  assignment: 2,
  broad: 3,
};

/**
 * Atomically merge one attention signal into the single pending wake for a
 * Presence. A dispatched row may be reused as the one follow-up wake while an
 * Attention run is already past its coalescing stages.
 */
export function mergeAttentionWake(input: {
  presenceId: string;
  trigger: AttentionTrigger;
  scope: AttentionScope;
  requestedAt: string;
  signalId: string;
}): ScheduledWake {
  const id = `wake_attention_${input.presenceId}`;
  return sqlite.transaction(() => {
    const existing = sqlite.prepare("SELECT wake_at, state, payload, updated_at, created_at FROM scheduled_wakes_idx WHERE id = ?").get(id) as {
      wake_at: string;
      state: ScheduledWake["state"];
      payload?: string | null;
      updated_at: string;
      created_at?: string | null;
    } | undefined;
    // A dispatched row is only an identity slot for the next follow-up. Its
    // delivered triggers belong to the prior run and must not leak into the
    // next episode.
    const payload = existing?.state === "pending" && existing.payload ? JSON.parse(existing.payload) as { triggers?: AttentionTrigger[]; scope?: AttentionScope; signalIds?: string[] } : {};
    const priorScope = payload.scope ?? "observe_inbound";
    const scope = attentionScopeRank[input.scope] > attentionScopeRank[priorScope] ? input.scope : priorScope;
    const wakeAt = existing?.state === "pending" && existing.wake_at < input.requestedAt ? existing.wake_at : input.requestedAt;
    const nowIso = new Date().toISOString();
    const nextPayload = {
      triggers: [...new Set([...(payload.triggers ?? []), input.trigger])],
      scope,
      signalIds: [...new Set([...(payload.signalIds ?? []), input.signalId])].slice(-100),
    };
    const wake: ScheduledWake = {
      id,
      presenceId: input.presenceId,
      wakeAt,
      kind: "attention",
      targetId: input.presenceId,
      payload: nextPayload,
      state: "pending",
      createdAt: existing?.state === "pending" ? existing.created_at ?? nowIso : nowIso,
      updatedAt: nowIso,
    };
    sqlite.prepare(`
      INSERT INTO scheduled_wakes_idx (id, presence_id, wake_at, kind, target_id, state, payload, updated_at, created_at)
      VALUES (?, ?, ?, 'attention', ?, 'pending', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        presence_id = excluded.presence_id,
        wake_at = excluded.wake_at,
        kind = excluded.kind,
        target_id = excluded.target_id,
        state = excluded.state,
        payload = excluded.payload,
        updated_at = excluded.updated_at,
        created_at = COALESCE(scheduled_wakes_idx.created_at, excluded.created_at)
    `).run(id, input.presenceId, wakeAt, input.presenceId, JSON.stringify(nextPayload), nowIso, wake.createdAt);
    return wake;
  })();
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
  const row = sqlite.prepare("SELECT presence_id, mode, ownership, state, expected_identity, verified_identity, last_healthy_at, profile_dir, updated_at FROM body_sessions WHERE presence_id = ?").get(presenceId) as BrowserBodyRow | undefined;
  return row ? browserBodyFromRow(row) : undefined;
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
