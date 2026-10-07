import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

export class V2Error extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "V2Error"; }
}

function openDatabase() {
  // A separate host-integration namespace never reads the standalone developer workspace.
  const filename = process.env.OPENPRESENCE_V2_DB_PATH || path.resolve("data/openpresence-v2.db");
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  fs.chmodSync(filename, 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS v2_workspaces (tenant TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS v2_receipts (tenant TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(tenant, request_id));
    CREATE TABLE IF NOT EXISTS v2_calls (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, tool TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL);`);
  return db;
}

export function validTenant(tenant: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(tenant)) throw new V2Error("INVALID_ARGUMENT", "Invalid workspace identity.");
}

export function readV2State<T>(tenant: string, initial: () => T): T {
  validTenant(tenant);
  const db = openDatabase();
  try {
    const row = db.prepare("SELECT body FROM v2_workspaces WHERE tenant = ?").get(tenant) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as T : initial();
  } finally { db.close(); }
}

export function mutateV2State<T extends { revision: number }, R>(tenant: string, requestId: string, expectedRevision: number, fingerprintInput: unknown, initial: () => T, mutation: (state: T) => R): R {
  validTenant(tenant);
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
  const db = openDatabase();
  try {
    return db.transaction(() => {
      const receipt = db.prepare("SELECT fingerprint, result FROM v2_receipts WHERE tenant = ? AND request_id = ?").get(tenant, requestId) as { fingerprint: string; result: string } | undefined;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new V2Error("IDEMPOTENCY_CONFLICT", "This requestId was used for different input. Use a new requestId.");
        return JSON.parse(receipt.result) as R;
      }
      const row = db.prepare("SELECT body FROM v2_workspaces WHERE tenant = ?").get(tenant) as { body: string } | undefined;
      const state = row ? JSON.parse(row.body) as T : initial();
      if (state.revision !== expectedRevision) throw new V2Error("REVISION_CONFLICT", `Expected revision ${expectedRevision}; current revision is ${state.revision}. Reload and reconcile.`);
      state.revision += 1;
      const result = mutation(state);
      db.prepare("INSERT INTO v2_workspaces (tenant, revision, body) VALUES (?, ?, ?) ON CONFLICT(tenant) DO UPDATE SET revision = excluded.revision, body = excluded.body").run(tenant, state.revision, JSON.stringify(state));
      db.prepare("INSERT INTO v2_receipts (tenant, request_id, fingerprint, result) VALUES (?, ?, ?, ?)").run(tenant, requestId, fingerprint, JSON.stringify(result));
      return result;
    }).immediate();
  } finally { db.close(); }
}

export function recordV2Call(tenant: string, tool: string, status: string, id: string) {
  const db = openDatabase();
  try { db.prepare("INSERT INTO v2_calls (id, tenant, tool, status, at) VALUES (?, ?, ?, ?, ?)").run(id, tenant, tool, status, new Date().toISOString()); }
  finally { db.close(); }
}
