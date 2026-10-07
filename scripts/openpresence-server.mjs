import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { resolveRuntimeSelection } from "./openpresence-runtime-config.mjs";

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
const runtimeSelection = resolveRuntimeSelection(process.env);
const dbSelectionManifestPath = path.join(projectRoot, "data", "openpresence-db.json");
let manifestDbPath;
if (fs.existsSync(dbSelectionManifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(dbSelectionManifestPath, "utf8"));
  if (manifest.dbPath) manifestDbPath = path.resolve(projectRoot, manifest.dbPath);
}
if (manifestDbPath && !fs.existsSync(manifestDbPath)) {
  throw new Error(`Configured OpenPresence database does not exist: ${manifestDbPath}. Set OPENPRESENCE_DB_PATH explicitly or restore that file; the launcher will not fall back to another workspace.`);
}
const dbPath = runtimeSelection.dbPath;
const credentialKeyRotationMarker = `${dbPath}.credential-key-rotation.json`;
if (fs.existsSync(credentialKeyRotationMarker)) {
  throw new Error(`Credential-key rotation is incomplete for ${dbPath}. Recover it with: pnpm db:rotate-key -- --recover --db "${dbPath}"`);
}
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
const port = String(runtimeSelection.port);
// Multiple local Presence workspaces can run side by side. Keep their Next
// build artifacts isolated so one dev server cannot invalidate another
// server's route manifests while Chrome is exercising the interface.
const nextDistDir = process.env.OPENPRESENCE_NEXT_DIST_DIR || (mode === "dev" ? `.next-${port}` : ".next");
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
  // First-run initialization may select a directory that does not exist yet.
  // Create it only after the database selection and initialization checks pass.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
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
  OPENPRESENCE_PROFILE: runtimeSelection.profileName,
  ...(runtimeSelection.agentId ? { OPENPRESENCE_DEFAULT_AGENT_ID: runtimeSelection.agentId } : {}),
  ...(runtimeSelection.presenceId ? { OPENPRESENCE_DEFAULT_PRESENCE_ID: runtimeSelection.presenceId } : {}),
  OPENPRESENCE_SECRET_KEY: localSecretKey,
  OPENPRESENCE_DEFAULT_AGENT_NAME: process.env.OPENPRESENCE_DEFAULT_AGENT_NAME || "Genny",
  OPENPRESENCE_PUBLICATION_SIGNING_KEY: publicationSigningKey,
  OPENPRESENCE_NEXT_DIST_DIR: nextDistDir,
};
// A single local Next process owns the SQLite workspace and also carries the
// full in-memory compatibility snapshot. Keep provider/model work serialized
// by default so two large attention snapshots cannot exhaust the process
// before the RSS watchdog can recover it. Operators running isolated workers
// can still opt into a bounded higher value explicitly.
if (!childEnv.OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY) childEnv.OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY = "1";
// Turbopack keeps the large OpenPresence development graph substantially
// smaller and less CPU-hungry than Webpack. Keep an escape hatch for a plugin
// or debugging session that specifically requires Webpack.
const useTurbo = mode === "dev" && process.env.OPENPRESENCE_USE_TURBO !== "0";
childEnv.OPENPRESENCE_USE_TURBO = useTurbo ? "1" : "0";
// Bound the development compiler/application heap so a hot-reload storm
// cannot consume the host's entire memory budget. Preserve an explicit
// operator setting when one is already present.
if (mode === "dev" && !/--max-old-space-size(?:=|\s)/.test(process.env.NODE_OPTIONS || "")) {
  const maxOldSpaceSize = process.env.OPENPRESENCE_NODE_MAX_OLD_SPACE_SIZE || "1024";
  childEnv.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--max-old-space-size=${maxOldSpaceSize}`].filter(Boolean).join(" ");
}
// Production starts the canonical temporal owner from Next instrumentation.
// Development keeps that eager import disabled to avoid duplicating the large
// runtime module graph, and instead gives the same durable sweep one child
// supervisor. This leaves one scheduler owner per database in both modes.
const schedulerToken = process.env.OPENPRESENCE_SCHEDULER_TOKEN || crypto.randomBytes(32).toString("base64url");
childEnv.OPENPRESENCE_SCHEDULER_TOKEN = schedulerToken;
const schedulerOwnedByLauncher = process.env.OPENPRESENCE_DISABLE_SCHEDULER !== "1"
  && !(mode === "dev" && process.env.OPENPRESENCE_DISABLE_DEV_SCHEDULER === "1");
childEnv.OPENPRESENCE_EXTERNAL_SCHEDULER_OWNER = schedulerOwnedByLauncher ? "1" : "0";

const nextCliPath = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const nextArgs = [nextCliPath, mode, ...(useTurbo ? ["--turbo"] : []), "-p", port];
let stopping = false;
let recycling = false;
let child;
let scheduler;
let schedulerRestartTimer;
let memoryWatchdog;
let childStartedAt = 0;
const serverRssLimitMb = Number(process.env.OPENPRESENCE_SERVER_RSS_LIMIT_MB || process.env.OPENPRESENCE_DEV_RSS_LIMIT_MB || "1536");
const serverRssCheckMs = Math.max(5_000, Number(process.env.OPENPRESENCE_SERVER_RSS_CHECK_MS || process.env.OPENPRESENCE_DEV_RSS_CHECK_MS || "15000"));
const serverRssGraceMs = Math.max(0, Number(process.env.OPENPRESENCE_SERVER_RSS_GRACE_MS || process.env.OPENPRESENCE_DEV_RSS_GRACE_MS || "60000"));
const serverRssRequiredSamples = Math.max(1, Number(process.env.OPENPRESENCE_SERVER_RSS_REQUIRED_SAMPLES || "3"));
let serverRssOverLimitSamples = 0;

function childRssMb() {
  if (!child?.pid || process.platform === "win32") return undefined;
  try {
    // Measure the complete Next process tree so any compiler descendants are
    // included in the RSS budget.
    const output = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const processes = output.split("\n").map((line) => {
      const values = line.trim().split(/\s+/).map(Number);
      return values.length === 3 && values.every((value) => Number.isFinite(value))
        ? { pid: values[0], ppid: values[1], rssKb: values[2] }
        : undefined;
    }).filter((process) => process !== undefined);
    const descendants = new Set([child.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const process of processes) {
        if (descendants.has(process.ppid) && !descendants.has(process.pid)) {
          descendants.add(process.pid);
          changed = true;
        }
      }
    }
    const rssKb = processes.filter((process) => descendants.has(process.pid)).reduce((total, process) => total + process.rssKb, 0);
    return rssKb > 0 ? rssKb / 1024 : undefined;
  } catch {
    return undefined;
  }
}

function recycleNextChild(rssMb) {
  if (stopping || recycling || !child) return;
  recycling = true;
  console.warn(`[openpresence-server] ${mode} Next RSS reached ${Math.round(rssMb)} MB; recycling the child to release retained memory.`);
  signalNextChild("SIGTERM");
}

function signalNextChild(signal) {
  if (!child?.pid) return;
  if (process.platform !== "win32") {
    try {
      // Signal the whole detached process group so a recycle cannot leave a
      // Next descendant holding the port after the parent exits.
      process.kill(-child.pid, signal);
      return;
    } catch { /* Fall back to the wrapper when the group already exited. */ }
  }
  child.kill(signal);
}

function startScheduler() {
  if (process.env.OPENPRESENCE_DISABLE_SCHEDULER === "1" || (mode === "dev" && process.env.OPENPRESENCE_DISABLE_DEV_SCHEDULER === "1") || stopping) return;
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
    schedulerRestartTimer = setTimeout(startScheduler, 1_000);
  });
}

function stopChildren(signal) {
  stopping = true;
  if (schedulerRestartTimer) clearTimeout(schedulerRestartTimer);
  if (memoryWatchdog) clearInterval(memoryWatchdog);
  signalNextChild(signal);
  if (scheduler) scheduler.kill(signal);
  if (!child?.pid || child.exitCode !== null) {
    releaseServerLock();
    process.exit(0);
  }
  // A detached Next/Turbopack child can occasionally keep the wrapper alive
  // after SIGTERM, which strands Playwright's webServer teardown indefinitely.
  // Escalate only after a bounded grace period; ordinary shutdown still gets
  // the first chance to flush and release its own resources.
  const shutdownTimer = setTimeout(() => {
    signalNextChild("SIGKILL");
    if (scheduler) scheduler.kill("SIGKILL");
    releaseServerLock();
    process.exit(0);
  }, 2_000);
  shutdownTimer.unref();
}

startScheduler();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChildren(signal);
  });
}

function startNextChild() {
  serverRssOverLimitSamples = 0;
  child = spawn(process.execPath, nextArgs, {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
    // Playwright owns the test-mode process tree. Keeping Next attached there
    // lets the runner terminate the actual child instead of orphaning a
    // detached Turbopack process after the wrapper receives SIGTERM.
    detached: process.platform !== "win32" && process.env.OPENPRESENCE_TEST_MODE !== "1",
  });
  childStartedAt = Date.now();
  child.on("error", (error) => {
    stopChildren("SIGTERM");
    releaseServerLock();
    throw error;
  });
  child.on("exit", (code, signal) => {
    if (stopping) {
      releaseServerLock();
      process.exit(signal ? 0 : code ?? 0);
    }
    if (recycling) {
      recycling = false;
      setTimeout(startNextChild, 250);
      return;
    }
    stopping = true;
    if (schedulerRestartTimer) clearTimeout(schedulerRestartTimer);
    if (scheduler) scheduler.kill(signal || "SIGTERM");
    if (memoryWatchdog) clearInterval(memoryWatchdog);
    releaseServerLock();
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

startNextChild();
if (Number.isFinite(serverRssLimitMb) && serverRssLimitMb > 0 && process.platform !== "win32") {
  memoryWatchdog = setInterval(() => {
    if (Date.now() - childStartedAt < serverRssGraceMs) return;
    const rssMb = childRssMb();
    if (rssMb === undefined || rssMb < serverRssLimitMb) {
      serverRssOverLimitSamples = 0;
      return;
    }
    serverRssOverLimitSamples += 1;
    if (serverRssOverLimitSamples >= serverRssRequiredSamples) recycleNextChild(rssMb);
  }, serverRssCheckMs);
}
