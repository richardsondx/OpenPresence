import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The launcher chooses the database before Next.js has a chance to load its
// environment files. Load the local file here, without overriding an
// intentional shell-level override.
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadDotEnv(path.join(projectRoot, ".env"));
const mode = process.argv[2] === "start" ? "start" : "dev";
const dbSelectionManifestPath = path.join(projectRoot, "data", "openpresence-db.json");
const explicitDbPath = process.env.OPENPRESENCE_DB_PATH
  ? path.resolve(projectRoot, process.env.OPENPRESENCE_DB_PATH)
  : undefined;
let manifestDbPath;
if (!explicitDbPath && fs.existsSync(dbSelectionManifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(dbSelectionManifestPath, "utf8"));
  if (manifest.dbPath) manifestDbPath = path.resolve(projectRoot, manifest.dbPath);
}
const preferredDbPath = path.join(projectRoot, "data", "openpresence-genny-restored-full-v2.db");
const fallbackDbPath = path.join(projectRoot, "data", "openpresence.db");
if (explicitDbPath && !fs.existsSync(explicitDbPath)) {
  throw new Error(`Configured OpenPresence database does not exist: ${explicitDbPath}. Fix OPENPRESENCE_DB_PATH; the launcher will not create or select a random workspace.`);
}
if (manifestDbPath && !fs.existsSync(manifestDbPath)) {
  throw new Error(`Configured OpenPresence database does not exist: ${manifestDbPath}. Set OPENPRESENCE_DB_PATH explicitly or restore that file; the launcher will not fall back to another workspace.`);
}
const dbPath = explicitDbPath || manifestDbPath || (fs.existsSync(preferredDbPath) ? preferredDbPath : fallbackDbPath);
const allowDatabaseInitialization = process.env.OPENPRESENCE_ALLOW_DATABASE_INIT === "1";
if (!fs.existsSync(dbPath) && process.env.OPENPRESENCE_TEST_MODE !== "1" && !allowDatabaseInitialization) {
  throw new Error(`Configured OpenPresence database does not exist: ${dbPath}. Refusing to create a blank workspace; restore the database or set OPENPRESENCE_ALLOW_DATABASE_INIT=1 for an intentional first-run initialization.`);
}
if (fs.existsSync(dbPath)) {
  const stat = fs.statSync(dbPath);
  const testRuntime = process.env.OPENPRESENCE_TEST_MODE === "1";
  if (stat.size === 0 && !testRuntime && !allowDatabaseInitialization) throw new Error(`Configured OpenPresence database is empty: ${dbPath}. Refusing to start a fresh workspace over an existing data path.`);
  if (stat.size > 0) {
    const descriptor = fs.openSync(dbPath, "r");
    const header = Buffer.alloc(16);
    try { fs.readSync(descriptor, header, 0, 16, 0); } finally { fs.closeSync(descriptor); }
    if (!header.equals(Buffer.from("SQLite format 3\u0000"))) throw new Error(`Configured OpenPresence database is not a valid SQLite file: ${dbPath}. Refusing to start.`);
  }
}
const port = process.env.OPENPRESENCE_PORT || "3015";
// Multiple local Presence workspaces can run side by side. Keep their Next
// build artifacts isolated so one dev server cannot invalidate another
// server's route manifests while Chrome is exercising the interface.
const nextDistDir = process.env.OPENPRESENCE_NEXT_DIST_DIR || `.next-${port}`;
const serverLockPath = `${dbPath}.server-lock`;
let serverLockFd;
function processIsAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
function acquireServerLock() {
  const lockContents = JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() });
  try {
    serverLockFd = fs.openSync(serverLockPath, "wx", 0o600);
    fs.writeFileSync(serverLockFd, lockContents);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(serverLockPath, "utf8"));
  } catch {
    throw new Error(`OpenPresence database is already starting or has an unreadable server lock: ${serverLockPath}`);
  }
  if (processIsAlive(Number(existing?.pid))) {
    throw new Error(`OpenPresence database is already served by process ${existing.pid} on port ${existing.port ?? "unknown"}. Stop that server before starting another one against ${dbPath}.`);
  }
  try {
    fs.unlinkSync(serverLockPath);
  } catch (unlinkError) {
    throw new Error(`OpenPresence found a stale server lock but could not remove it: ${serverLockPath}. ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
  }
  serverLockFd = fs.openSync(serverLockPath, "wx", 0o600);
  fs.writeFileSync(serverLockFd, lockContents);
}
function releaseServerLock() {
  if (serverLockFd === undefined) return;
  try { fs.closeSync(serverLockFd); } catch { /* process is already exiting */ }
  serverLockFd = undefined;
  try { fs.unlinkSync(serverLockPath); } catch { /* another process may have repaired a stale lock */ }
}
acquireServerLock();
const publicationSigningKeyPath = path.join(path.dirname(dbPath), ".publication-signing-key");
const localSecretKeyPath = path.join(path.dirname(dbPath), ".secret-key");
const localSecretKey = process.env.OPENPRESENCE_SECRET_KEY || (() => {
  try {
    const existing = fs.readFileSync(localSecretKeyPath);
    if (existing.length === 32) return existing.toString("base64");
  } catch { /* Generate the local development key below. */ }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(localSecretKeyPath, generated, { mode: 0o600 });
  return generated.toString("base64");
})();
const publicationSigningKey = process.env.OPENPRESENCE_PUBLICATION_SIGNING_KEY || (() => {
  try {
    const existing = fs.readFileSync(publicationSigningKeyPath, "utf8").trim();
    if (existing) return existing;
  } catch { /* Generate the local development key below. */ }
  const generated = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(publicationSigningKeyPath, generated, { mode: 0o600 });
  return generated;
})();

const childEnv = {
  ...process.env,
  OPENPRESENCE_DB_PATH: dbPath,
  OPENPRESENCE_PORT: port,
  OPENPRESENCE_SECRET_KEY: localSecretKey,
  OPENPRESENCE_DEFAULT_AGENT_NAME: process.env.OPENPRESENCE_DEFAULT_AGENT_NAME || "Genny",
  OPENPRESENCE_PUBLICATION_SIGNING_KEY: publicationSigningKey,
  OPENPRESENCE_NEXT_DIST_DIR: nextDistDir,
};
// Turbopack keeps the large OpenPresence development graph substantially
// smaller and less CPU-hungry than Webpack. Keep an escape hatch for a plugin
// or debugging session that specifically requires Webpack.
const useTurbo = mode === "dev" && process.env.OPENPRESENCE_USE_TURBO !== "0";
childEnv.OPENPRESENCE_USE_TURBO = useTurbo ? "1" : "0";
// Bound the development compiler/application heap so a hot-reload storm
// cannot consume the host's entire memory budget. Preserve an explicit
// operator setting when one is already present.
if (mode === "dev" && !/--max-old-space-size(?:=|\s)/.test(process.env.NODE_OPTIONS || "")) {
  const maxOldSpaceSize = process.env.OPENPRESENCE_NODE_MAX_OLD_SPACE_SIZE || "4096";
  childEnv.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--max-old-space-size=${maxOldSpaceSize}`].filter(Boolean).join(" ");
}
// Production starts the canonical temporal owner from Next instrumentation.
// Development keeps that eager import disabled to avoid duplicating the large
// runtime module graph, and instead gives the same durable sweep one child
// supervisor. This leaves one scheduler owner per database in both modes.
const schedulerToken = process.env.OPENPRESENCE_SCHEDULER_TOKEN || crypto.randomBytes(32).toString("base64url");
childEnv.OPENPRESENCE_SCHEDULER_TOKEN = schedulerToken;

const nextArgs = ["exec", "next", mode, ...(useTurbo ? ["--turbo"] : []), "-p", port];
const child = spawn("pnpm", nextArgs, {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
});

let stopping = false;
let scheduler;
let schedulerRestartTimer;

function startDevScheduler() {
  if (mode !== "dev" || process.env.OPENPRESENCE_DISABLE_DEV_SCHEDULER === "1" || stopping) return;
  scheduler = spawn(process.execPath, [path.join(projectRoot, "scripts", "openpresence-scheduler-worker.mjs")], {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
  });
  scheduler.on("error", (error) => {
    console.error(`[openpresence-server] scheduler error: ${error instanceof Error ? error.message : String(error)}`);
  });
  scheduler.on("exit", (code, signal) => {
    scheduler = undefined;
    if (stopping) return;
    console.error(`[openpresence-server] scheduler exited (code=${code ?? "?"}, signal=${signal ?? "none"}); restarting.`);
    schedulerRestartTimer = setTimeout(startDevScheduler, 1_000);
  });
}

function stopChildren(signal) {
  stopping = true;
  if (schedulerRestartTimer) clearTimeout(schedulerRestartTimer);
  child.kill(signal);
  if (scheduler) scheduler.kill(signal);
}

startDevScheduler();

child.on("error", (error) => {
  stopChildren("SIGTERM");
  releaseServerLock();
  throw error;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChildren(signal);
  });
}

child.on("exit", (code, signal) => {
  stopping = true;
  if (schedulerRestartTimer) clearTimeout(schedulerRestartTimer);
  if (scheduler) scheduler.kill(signal || "SIGTERM");
  releaseServerLock();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
