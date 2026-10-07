import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeConfigPath = path.join(projectRoot, "data", "openpresence-runtime.json");
const manifestPath = path.join(projectRoot, "data", "openpresence-db.json");
const defaultPort = 3015;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${path.relative(projectRoot, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolvePath(value) {
  return path.resolve(projectRoot, value);
}

function normalizeProfile(name, profile) {
  if (!profile || typeof profile !== "object") throw new Error(`Runtime profile ${name} must be an object.`);
  if (typeof profile.dbPath !== "string" || !profile.dbPath.trim()) throw new Error(`Runtime profile ${name} must define dbPath.`);
  const port = Number(profile.port ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Runtime profile ${name} must define a valid port.`);
  return {
    name,
    label: typeof profile.label === "string" && profile.label.trim() ? profile.label.trim() : name,
    dbPath: profile.dbPath,
    resolvedDbPath: resolvePath(profile.dbPath),
    port,
    agentId: typeof profile.agentId === "string" ? profile.agentId : undefined,
    presenceId: typeof profile.presenceId === "string" ? profile.presenceId : undefined,
    handle: typeof profile.handle === "string" ? profile.handle : undefined,
    description: typeof profile.description === "string" ? profile.description : undefined,
  };
}

function inferredRegularProfile() {
  const manifest = readJson(manifestPath) ?? {};
  const dbPath = typeof manifest.dbPath === "string" && manifest.dbPath.trim()
    ? manifest.dbPath
    : "data/openpresence-main.db";
  return normalizeProfile("regular", {
    label: "Regular local app",
    dbPath,
    port: defaultPort,
    agentId: manifest.agentId,
    presenceId: manifest.presenceId,
    handle: manifest.handle,
    description: "Canonical local OpenPresence workspace.",
  });
}

export function readRuntimeConfig() {
  const raw = readJson(runtimeConfigPath) ?? {};
  const profiles = {};
  for (const [name, profile] of Object.entries(raw.profiles ?? {})) profiles[name] = normalizeProfile(name, profile);
  if (!profiles.regular) profiles.regular = inferredRegularProfile();
  const activeProfile = typeof raw.activeProfile === "string" && profiles[raw.activeProfile]
    ? raw.activeProfile
    : "regular";
  return { version: 1, activeProfile, profiles, path: runtimeConfigPath, exists: fs.existsSync(runtimeConfigPath) };
}

export function selectRuntimeProfile(name) {
  const config = readRuntimeConfig();
  const profile = config.profiles[name];
  if (!profile) throw new Error(`Unknown runtime profile “${name}”. Run pnpm openpresence runtime list.`);
  return profile;
}

export function resolveRuntimeSelection(env = process.env) {
  const config = readRuntimeConfig();
  const requestedProfile = typeof env.OPENPRESENCE_PROFILE === "string" && env.OPENPRESENCE_PROFILE.trim()
    ? env.OPENPRESENCE_PROFILE.trim()
    : config.activeProfile;
  const profile = selectRuntimeProfile(requestedProfile);
  const envDbPath = typeof env.OPENPRESENCE_DB_PATH === "string" && env.OPENPRESENCE_DB_PATH.trim() ? env.OPENPRESENCE_DB_PATH.trim() : undefined;
  const envPort = typeof env.OPENPRESENCE_PORT === "string" && env.OPENPRESENCE_PORT.trim() ? Number(env.OPENPRESENCE_PORT) : undefined;
  const hasDbOverride = Boolean(envDbPath && resolvePath(envDbPath) !== profile.resolvedDbPath);
  const hasPortOverride = envPort !== undefined && envPort !== profile.port;
  const overrideAllowed = env.OPENPRESENCE_ALLOW_RUNTIME_OVERRIDE === "1" || env.OPENPRESENCE_TEST_MODE === "1";
  if ((hasDbOverride || hasPortOverride) && !overrideAllowed) {
    const details = [
      hasDbOverride ? `database ${envDbPath} conflicts with profile ${profile.name} (${profile.dbPath})` : "",
      hasPortOverride ? `port ${envPort} conflicts with profile ${profile.name} (${profile.port})` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`Runtime configuration mismatch: ${details}. Use OPENPRESENCE_PROFILE=<name>, or set OPENPRESENCE_ALLOW_RUNTIME_OVERRIDE=1 for an intentional isolated runtime.`);
  }
  return {
    config,
    profile,
    profileName: profile.name,
    dbPath: hasDbOverride ? resolvePath(envDbPath) : profile.resolvedDbPath,
    port: hasPortOverride ? envPort : profile.port,
    agentId: profile.agentId,
    presenceId: profile.presenceId,
    handle: profile.handle,
    source: hasDbOverride || hasPortOverride ? "environment override" : config.exists ? "runtime profile" : "canonical manifest fallback",
    overridden: hasDbOverride || hasPortOverride,
  };
}

export function writeRuntimeConfig({ activeProfile, profiles }) {
  fs.mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
  const serializableProfiles = Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, {
    ...(profile.label ? { label: profile.label } : {}),
    dbPath: profile.dbPath,
    port: profile.port,
    ...(profile.agentId ? { agentId: profile.agentId } : {}),
    ...(profile.presenceId ? { presenceId: profile.presenceId } : {}),
    ...(profile.handle ? { handle: profile.handle } : {}),
    ...(profile.description ? { description: profile.description } : {}),
  }]));
  fs.writeFileSync(runtimeConfigPath, `${JSON.stringify({ version: 1, activeProfile, profiles: serializableProfiles }, null, 2)}\n`, { mode: 0o600 });
  return readRuntimeConfig();
}

export function runtimeConfigPathForDisplay() {
  return runtimeConfigPath;
}

export { defaultPort, manifestPath, projectRoot };
