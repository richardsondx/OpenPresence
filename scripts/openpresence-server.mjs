import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const preferredDbPath = path.join(projectRoot, "data", "openpresence-genny-restored-full-v2.db");
const fallbackDbPath = path.join(projectRoot, "data", "openpresence.db");
const dbPath = process.env.OPENPRESENCE_DB_PATH || (fs.existsSync(preferredDbPath) ? preferredDbPath : fallbackDbPath);
const port = process.env.OPENPRESENCE_PORT || "3015";

const child = spawn("pnpm", ["exec", "next", mode, "-p", port], {
  cwd: projectRoot,
  env: {
    ...process.env,
    OPENPRESENCE_DB_PATH: dbPath,
    OPENPRESENCE_DEFAULT_AGENT_NAME: process.env.OPENPRESENCE_DEFAULT_AGENT_NAME || "Genny",
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
