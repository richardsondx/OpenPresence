import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error This standalone Node maintenance script has no declaration file.
import { assertIdle, cleanupPlan, cleanProject } from "../scripts/clean-project.mjs";

const roots: string[] = [];
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "openpresence-clean-")));
  roots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  for (const name of [".next-old", "tmp", "var", "data", "out", "node_modules", "qa-learnings", "docs/screenshots"]) fs.mkdirSync(path.join(root, name), { recursive: true });
  fs.writeFileSync(path.join(root, ".next-old/cache"), "generated");
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("generated-file cleanup", () => {
  it("previews without deletion and cleans only regenerable paths without following symlinks", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "data/private.db"), "private");
    fs.symlinkSync(path.join(root, "data"), path.join(root, "tmp/linked-data"));
    cleanProject(root, { dryRun: true });
    expect(fs.existsSync(path.join(root, ".next-old/cache"))).toBe(true);
    cleanProject(root);
    expect(fs.existsSync(path.join(root, ".next-old"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "data/private.db"), "utf8")).toBe("private");
    for (const name of ["out", "node_modules", "qa-learnings", "docs/screenshots"]) expect(fs.existsSync(path.join(root, name))).toBe(true);
  });
  it("preserves temporary folders containing tracked source, secrets, databases, or nested repositories", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "tmp/source.ts"), "source");
    execFileSync("git", ["add", "tmp/source.ts"], { cwd: root });
    fs.writeFileSync(path.join(root, "var/private.sqlite3-wal"), "private");
    fs.writeFileSync(path.join(root, ".next-old/.env.local"), "private");
    fs.mkdirSync(path.join(root, "Users/.git"), { recursive: true });
    fs.mkdirSync(path.join(root, ".next-browser/Default"), { recursive: true });
    fs.writeFileSync(path.join(root, ".next-browser/Default/Cookies"), "private-session");
    const plan = cleanupPlan(root);
    expect(plan.remove).toEqual([]);
    expect(plan.preserve.map((item: { path: string }) => item.path).sort()).toEqual([".next-browser", ".next-old", "Users", "tmp", "var"]);
  });
  it("refuses cleanup while a server lock belongs to a live process", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "data/workspace.db.server-lock"), JSON.stringify({ pid: process.pid }));
    expect(() => assertIdle(root)).toThrow("server is running");
    expect(fs.existsSync(path.join(root, ".next-old/cache"))).toBe(true);
  });
});
