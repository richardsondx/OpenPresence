import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Export current source, including pending changes, without copying Git history,
// ignored runtime data, or ignored historical evidence. Never modify the source.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destinationArgument = process.argv[2] === "--" ? process.argv[3] : process.argv[2];
const destination = path.resolve(root, destinationArgument ?? "out/openpresence-public");
if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${destination}. Choose a new empty destination.`);
if (destination === root || root.startsWith(`${destination}${path.sep}`)) throw new Error("Destination cannot contain the source repository.");
const candidates = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean))].sort();
// Apply ignores even to tracked files: .gitignore alone cannot untrack a file.
const result = spawnSync("git", ["check-ignore", "--no-index", "-z", "--stdin"], { cwd: root, input: candidates.join("\0") + "\0", encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(result.stderr);
const ignored = new Set(result.stdout.split("\0").filter(Boolean));
const files = candidates.filter((name) => !ignored.has(name) && !name.split("/").includes(".git") && fs.existsSync(path.join(root, name)));
for (const name of files) {
  if (!fs.lstatSync(path.join(root, name)).isFile()) throw new Error(`Only regular source files may be exported: ${name}`);
}
fs.mkdirSync(destination, { recursive: true });
for (const name of files) {
  const target = path.join(destination, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, name), target, fs.constants.COPYFILE_EXCL);
}
console.log(JSON.stringify({ destination, files: files.length, gitHistoryIncluded: false, nextStep: "Scan this export, then initialize a new repository here. Do not push the original repository history." }, null, 2));
