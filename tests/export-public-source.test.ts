import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpresence-source-export-"));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(path.resolve("scripts/export-public-source.mjs"), path.join(root, "scripts/export-public-source.mjs"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  fs.writeFileSync(path.join(root, ".gitignore"), ".env\ndata/\nqa-learnings/**\nout/\n");
  fs.mkdirSync(path.join(root, "data"));
  fs.mkdirSync(path.join(root, "qa-learnings"));
  fs.writeFileSync(path.join(root, "README.md"), "old indexed source");
  fs.writeFileSync(path.join(root, ".env"), "PRIVATE_FIXTURE_VALUE=never-export");
  fs.writeFileSync(path.join(root, "data", ".secret-key"), "private-key-fixture");
  fs.writeFileSync(path.join(root, "qa-learnings", "trace.json"), "private-transcript-fixture");
  // Model the dangerous case: private files were tracked before ignores existed.
  execFileSync("git", ["add", "--force", ".env", "data/.secret-key", "qa-learnings/trace.json", "README.md"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "current pending source");
  fs.writeFileSync(path.join(root, "pending.ts"), "export const pending = true;");
  return root;
}

describe("public source export", () => {
  it("exports pending source while excluding ignored tracked data and Git history", () => {
    const root = fixture();
    execFileSync(process.execPath, ["scripts/export-public-source.mjs"], { cwd: root });
    const output = path.join(root, "out", "openpresence-public");
    expect(fs.readFileSync(path.join(output, "README.md"), "utf8")).toBe("current pending source");
    expect(fs.existsSync(path.join(output, "pending.ts"))).toBe(true);
    for (const name of [".git", ".env", "data", "qa-learnings"]) expect(fs.existsSync(path.join(output, name))).toBe(false);
    expect(fs.readFileSync(path.join(root, "data", ".secret-key"), "utf8")).toBe("private-key-fixture");
  });

  it("refuses to overwrite an existing destination or copy a symlink", () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, "existing"));
    const existing = spawnSync(process.execPath, ["scripts/export-public-source.mjs", "existing"], { cwd: root, encoding: "utf8" });
    expect(existing.status).not.toBe(0);
    expect(existing.stderr).toContain("Destination already exists");
    fs.symlinkSync(path.join(root, ".env"), path.join(root, "linked-source"));
    const linked = spawnSync(process.execPath, ["scripts/export-public-source.mjs"], { cwd: root, encoding: "utf8" });
    expect(linked.status).not.toBe(0);
    expect(linked.stderr).toContain("Only regular source files");
    expect(fs.existsSync(path.join(root, "out", "openpresence-public"))).toBe(false);
  });
});
