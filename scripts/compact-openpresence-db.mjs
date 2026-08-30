#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error("Usage: node scripts/compact-openpresence-db.mjs --db <path> [--output <path>] [--dedupe-mirror-events] [--confirm]");
  console.error("\nWithout --confirm, the script only creates and validates a compacted candidate.");
  if (message) process.exit(2);
  process.exitCode = 0;
}

function parseArgs(argv) {
  const args = { confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") {
      continue;
    } else if (value === "--confirm") {
      args.confirm = true;
    } else if (value === "--dedupe-mirror-events") {
      args.dedupeMirrorEvents = true;
    } else if (value === "--db" || value === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) usage(`${value} requires a path`);
      args[value.slice(2)] = next;
      index += 1;
    } else if (value === "--help" || value === "-h") {
      usage();
      process.exit(0);
    } else {
      usage(`unknown argument: ${value}`);
    }
  }
  if (!args.db) usage("--db is required; refusing to infer a workspace database");
  return args;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
}

function assertSQLiteFile(dbPath) {
  const descriptor = fs.openSync(dbPath, "r");
  const header = Buffer.alloc(16);
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (!header.equals(Buffer.from("SQLite format 3\u0000"))) {
    throw new Error(`not a SQLite database: ${dbPath}`);
  }
}

function liveServerLock(dbPath) {
  const lockPath = `${dbPath}.server-lock`;
  if (!fs.existsSync(lockPath)) return undefined;
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    throw new Error(`server lock exists but is unreadable: ${lockPath}`);
  }
  const pid = Number(lock?.pid);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return { lockPath, pid, port: lock?.port };
    } catch (error) {
      if (error?.code === "EPERM") return { lockPath, pid, port: lock?.port };
    }
  }
  throw new Error(`stale server lock found; stop/reconcile it explicitly before compaction: ${lockPath}`);
}

function checkDatabase(dbPath, readonly = true) {
  const database = new Database(dbPath, { readonly, fileMustExist: true });
  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") throw new Error(`SQLite quick_check failed for ${dbPath}: ${quickCheck}`);
    const integrityCheck = database.pragma("integrity_check", { simple: true });
    if (integrityCheck !== "ok") throw new Error(`SQLite integrity_check failed for ${dbPath}: ${integrityCheck}`);
    const appState = database.prepare("SELECT payload FROM app_state WHERE id = 1").get();
    const counts = database.prepare("SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table'").get();
    const mirrorEvents = database.prepare("SELECT COUNT(*) AS rows, COUNT(DISTINCT json_extract(payload, '$.sourceEventId')) AS sources FROM mirror_events").get() ?? {};
    const appStatePayload = typeof appState?.payload === "string" ? appState.payload : "";
    return {
      quickCheck,
      integrityCheck,
      appStateBytes: Buffer.byteLength(appStatePayload),
      appStateHash: crypto.createHash("sha256").update(appStatePayload).digest("hex"),
      tableCount: Number(counts?.tables ?? 0),
      mirrorEventRows: Number(mirrorEvents.rows ?? 0),
      mirrorEventSources: Number(mirrorEvents.sources ?? 0),
    };
  } finally {
    database.close();
  }
}

function copyDatabaseFamily(sourcePath, backupDirectory) {
  const names = [path.basename(sourcePath), `${path.basename(sourcePath)}-wal`, `${path.basename(sourcePath)}-shm`];
  for (const name of names) {
    const source = path.join(path.dirname(sourcePath), name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backupDirectory, name));
  }
}

function sqliteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function compactDatabase(sourcePath, outputPath, { dedupeMirrorEvents = false } = {}) {
  const database = new Database(sourcePath, { readonly: false, fileMustExist: true });
  try {
    database.exec(`VACUUM INTO ${sqliteString(outputPath)}`);
  } finally {
    database.close();
  }
  if (!dedupeMirrorEvents) return 0;
  const candidate = new Database(outputPath, { readonly: false, fileMustExist: true });
  try {
    const hasMirrorEvents = candidate.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mirror_events'").get();
    if (!hasMirrorEvents) return 0;
    const result = candidate.prepare(`DELETE FROM mirror_events
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM mirror_events
        GROUP BY parent_id, json_extract(payload, '$.sourceEventId')
      )`).run();
    if (result.changes > 0) candidate.exec("VACUUM");
    return result.changes;
  } finally {
    candidate.close();
  }
}

function installCandidate(sourcePath, candidatePath, backupDirectory) {
  const sourceDir = path.dirname(sourcePath);
  const sourceName = path.basename(sourcePath);
  const oldPath = path.join(backupDirectory, sourceName);
  const sidecars = [`${sourcePath}-wal`, `${sourcePath}-shm`];
  const movedSidecars = [];
  fs.copyFileSync(sourcePath, oldPath);
  for (const sidecar of sidecars) {
    if (!fs.existsSync(sidecar)) continue;
    const destination = path.join(backupDirectory, path.basename(sidecar));
    fs.renameSync(sidecar, destination);
    movedSidecars.push({ sidecar, destination });
  }
  try {
    fs.renameSync(candidatePath, sourcePath);
  } catch (error) {
    for (const item of movedSidecars.reverse()) fs.renameSync(item.destination, item.sidecar);
    throw error;
  }
  console.log(`Installed compact database at ${sourcePath}`);
  console.log(`Rollback backup: ${path.join(backupDirectory, sourceName)}`);
  console.log(`Backup directory: ${backupDirectory}`);
  console.log(`Source directory: ${sourceDir}`);
}

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(args.db);
if (!fs.existsSync(sourcePath)) usage(`database does not exist: ${sourcePath}`);
assertSQLiteFile(sourcePath);
const lock = liveServerLock(sourcePath);
if (lock) throw new Error(`database is served by PID ${lock.pid}${lock.port ? ` on port ${lock.port}` : ""}; stop the server first`);

const before = checkDatabase(sourcePath);
const parent = path.dirname(sourcePath);
const stamp = timestamp();
const backupDirectory = path.join(parent, `${path.basename(sourcePath)}.precompact-${stamp}`);
const candidatePath = path.resolve(args.output ?? path.join(os.tmpdir(), `${path.basename(sourcePath)}.compact-${process.pid}-${stamp}.db`));
if (fs.existsSync(candidatePath)) throw new Error(`output already exists; refusing to overwrite: ${candidatePath}`);
fs.mkdirSync(backupDirectory, { recursive: false });
copyDatabaseFamily(sourcePath, backupDirectory);

try {
  const deduplicatedMirrorEvents = compactDatabase(sourcePath, candidatePath, { dedupeMirrorEvents: args.dedupeMirrorEvents });
  const after = checkDatabase(candidatePath);
  const beforeSize = fs.statSync(sourcePath).size;
  const afterSize = fs.statSync(candidatePath).size;
  if (after.appStateBytes !== before.appStateBytes || after.appStateHash !== before.appStateHash || after.tableCount !== before.tableCount) {
    throw new Error(`candidate metadata differs: app_state ${before.appStateBytes}B/${before.appStateHash} → ${after.appStateBytes}B/${after.appStateHash}, tables ${before.tableCount} → ${after.tableCount}`);
  }
  console.log(JSON.stringify({ sourcePath, candidatePath, backupDirectory, confirmed: args.confirm, dedupeMirrorEvents: args.dedupeMirrorEvents, deduplicatedMirrorEvents, before: { ...before, bytes: beforeSize }, after: { ...after, bytes: afterSize }, reclaimedBytes: beforeSize - afterSize }, null, 2));
  if (args.confirm) {
    installCandidate(sourcePath, candidatePath, backupDirectory);
    const installed = checkDatabase(sourcePath);
    console.log(JSON.stringify({ installed, installedBytes: fs.statSync(sourcePath).size }, null, 2));
  } else {
    console.log("Candidate validated only; canonical database was not changed. Re-run with --confirm to install it.");
  }
} catch (error) {
  try { if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath); } catch { /* preserve the source even if cleanup fails */ }
  throw error;
}
