import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (flag) => args.includes(flag);
const usage = `Usage:
  pnpm db:rotate-key -- [--db <path>] [--key-file <path>] [--backup-dir <outside-project>] [--apply]
  pnpm db:rotate-key -- --recover [--db <path>] [--key-file <path>]

Without --apply, the command only checks that every saved credential can be
decrypted. Apply mode creates a private database/key backup and rotates the
local AES-256-GCM key while preserving credential values. Recovery restores the
pre-rotation database and key if an interrupted rotation left its guard file.
`;

if (has("--help")) {
  process.stdout.write(usage);
  process.exit(0);
}

function resolveDbPath() {
  const requested = valueAfter("--db") || process.env.OPENPRESENCE_DB_PATH;
  if (requested) return path.resolve(requested);
  const manifestPath = path.join(projectRoot, "data", "openpresence-db.json");
  if (!fs.existsSync(manifestPath)) throw new Error("No database path was supplied and data/openpresence-db.json is missing.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.dbPath) throw new Error("The database manifest has no dbPath.");
  return path.resolve(projectRoot, manifest.dbPath);
}

function keyFromFile(filePath) {
  const key = fs.readFileSync(filePath);
  if (key.length !== 32) throw new Error(`The key file must contain exactly 32 bytes: ${filePath}`);
  return key;
}

function decrypt(row, key) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64url")),
    decipher.final(),
  ]);
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    auth_tag: cipher.getAuthTag().toString("base64url"),
  };
}

function credentialTables(db) {
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  return ["channel_credentials", "provider_credentials"].filter((name) => existing.has(name));
}

function countsFor(db, tables) {
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

function acquireServerLock(dbPath) {
  const lockPath = `${dbPath}.server-lock`;
  const contents = JSON.stringify({ pid: process.pid, port: "credential-key-rotation", startedAt: new Date().toISOString() });
  try {
    const fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, contents);
    fs.closeSync(fd);
    return () => { try { fs.unlinkSync(lockPath); } catch {} };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let existing;
  try { existing = JSON.parse(fs.readFileSync(lockPath, "utf8")); }
  catch { throw new Error(`The database has an unreadable server lock: ${lockPath}`); }
  if (processIsAlive(Number(existing.pid))) throw new Error(`Database is in use by process ${existing.pid} on port ${existing.port ?? "unknown"}. Stop it before key rotation.`);
  fs.unlinkSync(lockPath);
  return acquireServerLock(dbPath);
}

function writePrivateFile(filePath, contents) {
  const fd = fs.openSync(filePath, "wx", 0o600);
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  writePrivateFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function ensureOutsideProject(directory) {
  const relative = path.relative(projectRoot, directory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("The backup directory must be outside the repository.");
  }
  if (!fs.statSync(path.dirname(directory)).isDirectory()) throw new Error("The backup directory parent must already exist.");
}

function restoreFromMarker(markerPath, dbPath, keyPath) {
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  if (path.resolve(marker.dbPath) !== dbPath || path.resolve(marker.keyPath) !== keyPath) {
    throw new Error("The recovery marker points to different database/key paths. Use the exact paths recorded in the marker.");
  }
  if (!fs.existsSync(marker.databaseBackup) || !fs.existsSync(marker.keyBackup)) {
    throw new Error("The private recovery backup is incomplete; refusing to replace the current database or key.");
  }
  const dbTemp = `${dbPath}.recover-${process.pid}`;
  const keyTemp = `${keyPath}.recover-${process.pid}`;
  fs.copyFileSync(marker.databaseBackup, dbTemp);
  fs.chmodSync(dbTemp, 0o600);
  fs.copyFileSync(marker.keyBackup, keyTemp);
  fs.chmodSync(keyTemp, 0o600);
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.renameSync(dbTemp, dbPath);
  fs.renameSync(keyTemp, keyPath);
  fs.rmSync(markerPath, { force: true });
  process.stdout.write("Restored the pre-rotation database and key from the private backup.\n");
}

const dbPath = resolveDbPath();
const keyPath = path.resolve(valueAfter("--key-file") || path.join(path.dirname(dbPath), ".secret-key"));
const markerPath = `${dbPath}.credential-key-rotation.json`;

if (has("--recover")) {
  if (!fs.existsSync(markerPath)) throw new Error(`No interrupted key-rotation marker exists at ${markerPath}.`);
  const releaseLock = acquireServerLock(dbPath);
  try { restoreFromMarker(markerPath, dbPath, keyPath); }
  finally { releaseLock(); }
  process.exit(0);
}

if (fs.existsSync(markerPath)) throw new Error(`An interrupted key rotation is recorded at ${markerPath}. Recover it before using the database.`);
if (process.env.OPENPRESENCE_SECRET_KEY) throw new Error("OPENPRESENCE_SECRET_KEY overrides the key file. Remove or migrate that environment setting before using this key-file rotation command.");
const oldKey = keyFromFile(keyPath);
if (!fs.existsSync(dbPath)) throw new Error(`Database does not exist: ${dbPath}`);

const backupDirectoryValue = valueAfter("--backup-dir");
if (has("--apply") && !backupDirectoryValue) throw new Error("Apply mode requires --backup-dir outside the repository.");
const backupDirectory = backupDirectoryValue ? path.resolve(backupDirectoryValue) : undefined;
if (has("--apply")) {
  ensureOutsideProject(backupDirectory);
  fs.mkdirSync(backupDirectory, { mode: 0o700 });
  fs.chmodSync(backupDirectory, 0o700);
}
const releaseLock = has("--apply") ? acquireServerLock(dbPath) : undefined;

let inspectionDb;
let tables;
let beforeCounts;
let credentialCount = 0;
try {
  inspectionDb = new Database(dbPath, has("--apply") ? {} : { readonly: true, fileMustExist: true });
  tables = credentialTables(inspectionDb);
  beforeCounts = countsFor(inspectionDb, tables);
  for (const table of tables) {
    for (const row of inspectionDb.prepare(`SELECT ciphertext, iv, auth_tag FROM ${table}`).all()) {
      decrypt(row, oldKey).fill(0);
      credentialCount += 1;
    }
  }
} catch (error) {
  try { inspectionDb?.close(); } catch {}
  releaseLock?.();
  throw error;
}
if (!has("--apply")) {
  inspectionDb.close();
  process.stdout.write(`Dry run passed: decrypted ${credentialCount} credential records across ${tables.length} tables. No files were changed.\n`);
  process.exit(0);
}

const databaseBackup = path.join(backupDirectory, "database-before-rotation.sqlite");
const keyBackup = path.join(backupDirectory, "secret-key-before-rotation.bin");
const stagedDatabase = `${dbPath}.rotation-next-${process.pid}`;
const stagedKey = `${keyPath}.rotation-next-${process.pid}`;
const previousDatabase = `${dbPath}.rotation-previous-${process.pid}`;
const previousKey = `${keyPath}.rotation-previous-${process.pid}`;
const newKey = crypto.randomBytes(32);
let markerWritten = false;
let swappedDatabase = false;
let swappedKey = false;

try {
  await inspectionDb.backup(databaseBackup);
  inspectionDb.close();
  fs.chmodSync(databaseBackup, 0o600);
  fs.copyFileSync(keyPath, keyBackup);
  fs.chmodSync(keyBackup, 0o600);

  fs.copyFileSync(databaseBackup, stagedDatabase);
  fs.chmodSync(stagedDatabase, 0o600);
  const stagedDb = new Database(stagedDatabase);
  const rotate = stagedDb.transaction(() => {
    for (const table of tables) {
      const rows = stagedDb.prepare(`SELECT rowid, ciphertext, iv, auth_tag FROM ${table}`).all();
      const update = stagedDb.prepare(`UPDATE ${table} SET ciphertext = ?, iv = ?, auth_tag = ? WHERE rowid = ?`);
      for (const row of rows) {
        const plaintext = decrypt(row, oldKey);
        const encrypted = encrypt(plaintext, newKey);
        update.run(encrypted.ciphertext, encrypted.iv, encrypted.auth_tag, row.rowid);
        plaintext.fill(0);
      }
    }
  });
  rotate();
  const afterCounts = countsFor(stagedDb, tables);
  if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) throw new Error("Credential counts changed during key rotation.");
  for (const table of tables) {
    for (const row of stagedDb.prepare(`SELECT ciphertext, iv, auth_tag FROM ${table}`).all()) decrypt(row, newKey).fill(0);
  }
  const integrity = stagedDb.pragma("integrity_check", { simple: true });
  stagedDb.close();
  if (integrity !== "ok") throw new Error(`Rotated database integrity check failed: ${integrity}`);

  writePrivateFile(stagedKey, newKey);
  writeJsonAtomic(markerPath, { dbPath, keyPath, databaseBackup, keyBackup, createdAt: new Date().toISOString() });
  markerWritten = true;
  fs.renameSync(dbPath, previousDatabase);
  swappedDatabase = true;
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.renameSync(stagedDatabase, dbPath);
  fs.renameSync(keyPath, previousKey);
  swappedKey = true;
  fs.renameSync(stagedKey, keyPath);

  const verifyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  for (const table of tables) {
    for (const row of verifyDb.prepare(`SELECT ciphertext, iv, auth_tag FROM ${table}`).all()) decrypt(row, newKey).fill(0);
  }
  verifyDb.close();
  fs.rmSync(previousDatabase, { force: true });
  fs.rmSync(previousKey, { force: true });
  fs.rmSync(markerPath, { force: true });
  markerWritten = false;
  process.stdout.write(`Rotation complete: ${credentialCount} records re-encrypted. Private backups: ${backupDirectory}\n`);
} catch (error) {
  try { inspectionDb.close(); } catch {}
  if (markerWritten || swappedDatabase || swappedKey) {
    try { restoreFromMarker(markerPath, dbPath, keyPath); markerWritten = false; }
    catch (restoreError) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} Recovery also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}. Keep the server stopped and use --recover.`);
    }
  }
  fs.rmSync(stagedDatabase, { force: true });
  fs.rmSync(stagedKey, { force: true });
  throw error;
} finally {
  releaseLock?.();
}
