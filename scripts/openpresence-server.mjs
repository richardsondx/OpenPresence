import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const preferredDbPath = path.join(projectRoot, "data", "openpresence-genny-restored-full-v2.db");
const fallbackDbPath = path.join(projectRoot, "data", "openpresence.db");
const dbPath = process.env.OPENPRESENCE_DB_PATH || (fs.existsSync(preferredDbPath) ? preferredDbPath : fallbackDbPath);
const port = process.env.OPENPRESENCE_PORT || "3015";
// Multiple local Presence workspaces can run side by side. Keep their Next
// build artifacts isolated so one dev server cannot invalidate another
// server's route manifests while Chrome is exercising the interface.
const nextDistDir = process.env.OPENPRESENCE_NEXT_DIST_DIR || `.next-${port}`;
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

const child = spawn("pnpm", ["exec", "next", mode, "-p", port], {
  cwd: projectRoot,
  env: {
    ...process.env,
    OPENPRESENCE_DB_PATH: dbPath,
    OPENPRESENCE_SECRET_KEY: localSecretKey,
    OPENPRESENCE_DEFAULT_AGENT_NAME: process.env.OPENPRESENCE_DEFAULT_AGENT_NAME || "Genny",
    OPENPRESENCE_PUBLICATION_SIGNING_KEY: publicationSigningKey,
    OPENPRESENCE_NEXT_DIST_DIR: nextDistDir,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
