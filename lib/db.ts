import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { initialState, normalizeState, stateForAgent } from "./runtime";
import type { AgentWorkspaceSnapshot, OpenPresenceState } from "./types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(process.env.OPENPRESENCE_DB_PATH ?? path.join(dataDir, "openpresence.db"));
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// app_state is retained as a compatibility read model for the first local release.
// The domain collections below are the normalized write projection used for audit,
// migrations, and future queries. All mutations still pass through writeState.
db.run(sql`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)`);
sqlite.exec("CREATE TABLE IF NOT EXISTS agent_workspaces (agent_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
const normalizedTables = [
  "agents", "agent_files", "provider_connections", "agent_model_profiles", "agent_tool_bindings", "presences", "execution_envelopes", "conversations", "presence_chat_sessions", "messages", "change_sets", "standing_intents", "social_intents", "executions", "outcomes", "publications", "library_sources", "assets", "skills", "agent_skills", "content_drops", "channel_definitions", "native_channel_connections", "bridges", "mirror_objects", "mirror_events", "bridge_sync",
];
for (const table of normalizedTables) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, agent_id TEXT, parent_id TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}
sqlite.exec("CREATE TABLE IF NOT EXISTS bridge_credentials (bridge_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL, revoked_at TEXT, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS channel_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL, key_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)");
sqlite.exec("CREATE TABLE IF NOT EXISTS provider_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL, key_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)");

export function readBridgeCredentialMetadata(bridgeId: string) {
  const row = sqlite.prepare("SELECT key_prefix, revoked_at FROM bridge_credentials WHERE bridge_id = ?").get(bridgeId) as { key_prefix: string; revoked_at?: string | null } | undefined;
  return row ? { keyPrefix: row.key_prefix, credentialRevokedAt: row.revoked_at ?? undefined } : undefined;
}

function hydrateBridgeCredentials(state: OpenPresenceState): OpenPresenceState {
  return { ...state, bridges: state.bridges.map((bridge) => {
    const metadata = readBridgeCredentialMetadata(bridge.id);
    return metadata ? { ...bridge, ...metadata } : bridge;
  }) };
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
  const stored = new Map<string, AgentWorkspaceSnapshot>();
  for (const row of rows) {
    try { stored.set(row.agent_id, JSON.parse(row.payload) as AgentWorkspaceSnapshot); } catch { /* retain the compatibility snapshot below */ }
  }
  const snapshots = state.agentWorkspaces.map((workspace) => workspace.agent?.id ? stored.get(workspace.agent.id) ?? workspace : workspace);
  for (const workspace of stored.values()) {
    if (workspace.agent?.id && workspace.agent.id !== state.activeAgentId && !snapshots.some((item) => item.agent?.id === workspace.agent?.id)) snapshots.push(workspace);
  }
  return { ...state, agentWorkspaces: snapshots };
}

export function readState(): OpenPresenceState {
  const row = sqlite.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload?: string } | undefined;
  if (!row?.payload) {
    const state = initialState();
    writeState(state);
    return state;
  }
  try { return hydrateBridgeCredentials(hydrateAgentWorkspaces(normalizeState(JSON.parse(row.payload) as OpenPresenceState))); } catch { const state = initialState(); writeState(state); return state; }
}

export function readStateForAgent(agentId?: string | null): OpenPresenceState {
  return stateForAgent(readState(), agentId);
}

function entityRows(state: OpenPresenceState): Record<string, { id: string; agentId?: string; parentId?: string; payload: unknown }[]> {
  const agentId = state.agent?.id;
  return {
    agents: state.agents.map((agent) => ({ id: agent.id, agentId: agent.id, payload: agent })),
    agent_files: state.files.map((item) => ({ id: `${agentId ?? "agent"}:${item.kind}`, agentId, payload: item })),
    provider_connections: state.providerConnections.map((item) => ({ id: item.id, payload: item })),
    agent_model_profiles: state.modelProfiles.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    agent_tool_bindings: state.toolBindings.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    presences: state.presences.map((item) => ({ id: item.id, agentId, payload: item })),
    execution_envelopes: state.presences.map((item) => ({ id: item.id, parentId: item.id, payload: item.executionEnvelope })),
    conversations: state.conversations.map((item) => ({ id: item.id, agentId, payload: item })),
    presence_chat_sessions: state.presenceChatSessions.map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    messages: state.conversations.flatMap((conversation) => conversation.messages.map((item) => ({ id: item.id, parentId: conversation.id, payload: item }))),
    change_sets: state.changeSets.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    standing_intents: state.standingIntents.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    social_intents: state.socialIntents.map((item) => ({ id: item.id, agentId: item.agentId, parentId: item.presenceId, payload: item })),
    executions: state.executions.map((item) => ({ id: item.id, parentId: item.socialIntentId, payload: item })),
    outcomes: state.outcomes.map((item) => ({ id: item.id, parentId: item.executionId ?? item.socialIntentId, payload: item })),
    publications: state.publications.map((item) => ({ id: item.id, agentId, payload: item })),
    library_sources: state.librarySources.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    assets: state.assets.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    skills: state.skills.map((item) => ({ id: item.id, payload: item })),
    agent_skills: state.agentSkills.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    content_drops: state.contentDrops.map((item) => ({ id: item.id, agentId: item.agentId, payload: item })),
    channel_definitions: state.channelDefinitions.map((item) => ({ id: item.id, payload: item })),
    native_channel_connections: state.nativeConnections.map((item) => ({ id: item.id, parentId: item.presenceId, payload: item })),
    bridges: state.bridges.map((item) => ({ id: item.id, parentId: item.presenceId, payload: item })),
    mirror_objects: state.mirrorObjects.map((item) => ({ id: item.id, agentId, parentId: item.presenceId, payload: item })),
    mirror_events: state.mirrorEvents.map((item) => ({ id: item.id, parentId: item.bridgeId, payload: item })),
    bridge_sync: state.bridgeSync.map((item) => ({ id: item.bridgeId, payload: item })),
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

export function writeState(state: OpenPresenceState) {
  const normalized = normalizeState(state);
  sqlite.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(JSON.stringify(normalized));
  const timestamp = new Date().toISOString();
  // A request mutates only its explicitly materialized Agent. Updating every
  // snapshot here would let a concurrent tab write an older copy of another
  // Agent back over that Agent's newer workspace.
  const snapshots = normalized.agent ? [snapshotWorkspace(normalized)] : [];
  const workspaceTransaction = sqlite.transaction(() => {
    if (!snapshots.length) sqlite.prepare("DELETE FROM agent_workspaces").run();
    const upsert = sqlite.prepare("INSERT INTO agent_workspaces (agent_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at");
    for (const workspace of snapshots) if (workspace.agent?.id) upsert.run(workspace.agent.id, JSON.stringify(workspace), timestamp);
  });
  workspaceTransaction();
  writeNormalized(normalized);
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
export { authenticateBridgeKey, issueBridgeKey, revokeBridgeKey };
