import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directoryNames = new Set(["tmp", "var", "Users", "coverage", "test-results", "playwright-report"]);
const privateFile = /(?:^\.env(?:\.|$)|^\.(?:secret-key|publication-signing-key)$|\.(?:db|sqlite3?)(?:[.-]|$)|\.(?:bak|backup|pem|key|p12|pfx)(?:[.-]|$)|^storage[-_]?state.*\.json$)/i;

export function cleanupPlan(root) {
  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => (entry.isDirectory() && (entry.name === ".next" || entry.name.startsWith(".next-") || directoryNames.has(entry.name)))
      || (entry.isFile() && (entry.name.endsWith(".tsbuildinfo") || entry.name === ".eslintcache")))
    .map((entry) => entry.name).sort();
  const tracked = spawnSync("git", ["ls-files", "--cached", "-z", "--", ...candidates], { cwd: root, encoding: "utf8" });
  if (tracked.status !== 0) throw new Error("Cannot verify tracked-file boundaries; cleanup stopped.");
  const trackedFiles = tracked.stdout.split("\0").filter(Boolean);
  const remove = [], preserve = [];
  for (const name of candidates) {
    let reason = trackedFiles.some((file) => file === name || file.startsWith(`${name}/`)) ? "contains tracked source" : undefined;
    const pending = [path.join(root, name)];
    while (!reason && pending.length) {
      const current = pending.pop();
      const entry = fs.lstatSync(current);
      if (entry.isSymbolicLink()) continue; // rm removes a link, never its target.
      if (privateFile.test(path.basename(current)) || [".git", "Cookies", "Login Data", "Web Data", "Local State"].includes(path.basename(current)) || /browser[-_]profile|chrome[-_]profile|user[-_]data/i.test(path.basename(current))) {
        reason = "contains private state or a Git checkout";
      } else if (entry.isDirectory()) {
        pending.push(...fs.readdirSync(current).map((child) => path.join(current, child)));
      }
    }
    if (reason) preserve.push({ path: name, reason });
    else remove.push(name);
  }
  return { remove, preserve };
}

export function assertIdle(root) {
  // The launcher holds a database lock for the lifetime of the server.
  const pending = [path.join(root, "data")];
  while (pending.length) {
    const current = pending.pop();
    if (!fs.existsSync(current) || fs.lstatSync(current).isSymbolicLink()) continue;
    if (fs.statSync(current).isDirectory()) {
      pending.push(...fs.readdirSync(current).map((child) => path.join(current, child)));
    } else if (current.endsWith(".server-lock")) {
      let lock;
      try { lock = JSON.parse(fs.readFileSync(current, "utf8")); }
      catch { throw new Error("Unreadable server lock; stop the app and resolve the lock before cleanup."); }
      if (Number.isInteger(lock.pid) && lock.pid > 0) {
        try { process.kill(lock.pid, 0); }
        catch (error) { if (error.code === "ESRCH") continue; throw error; }
        throw new Error("A project server is running. Stop it before cleanup.");
      }
    }
  }
  // Also cover direct Next commands, which do not use the launcher lock.
  const processes = spawnSync("lsof", ["-a", "-d", "cwd", "-Fpn"], { encoding: "utf8" });
  if (processes.error || ![0, 1].includes(processes.status)) throw new Error("Cannot check active processes (lsof required); cleanup stopped.");
  let pid;
  for (const line of processes.stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    if (!line.startsWith("n") || !pid) continue;
    const cwd = line.slice(1);
    if (cwd !== root && !cwd.startsWith(`${root}${path.sep}`)) continue;
    const command = spawnSync("ps", ["-p", pid, "-o", "args="], { encoding: "utf8" });
    if (command.status === 0 && /(?:next-server|(?:^|[ /])next(?:\.js)?\s+(?:dev|build|start)|openpresence-server\.mjs|v2-(?:http|mcp)\.(?:ts|mjs))/.test(command.stdout)) {
      throw new Error("A project server or build is running. Stop it before cleanup.");
    }
  }
}

export function cleanProject(root, { dryRun = false } = {}) {
  if (!dryRun) assertIdle(root);
  const plan = cleanupPlan(root);
  for (const name of plan.remove) {
    if (!dryRun) fs.rmSync(path.join(root, name), { recursive: true, force: true });
    console.log(`${dryRun ? "Would remove" : "Removed"}: ${name}`);
  }
  for (const item of plan.preserve) console.log(`Preserved: ${item.path} (${item.reason})`);
  console.log(`${dryRun ? "Previewed" : "Removed"} ${plan.remove.length} generated paths. Private runtime data, QA evidence, exports, and dependencies are retained.`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    console.error("Usage: pnpm clean [--dry-run]"); process.exitCode = 1;
  } else {
    try { cleanProject(projectRoot, { dryRun: args.includes("--dry-run") }); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
