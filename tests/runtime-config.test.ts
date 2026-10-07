import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];

function runtimeStatus(env: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "openpresence-runtime-config-")));
  fixtures.push(root);
  for (const directory of ["bin", "scripts", "data"]) mkdirSync(join(root, directory));
  for (const file of ["bin/openpresence.mjs", "scripts/openpresence-runtime-config.mjs"]) {
    copyFileSync(join(process.cwd(), file), join(root, file));
  }
  symlinkSync(join(process.cwd(), "node_modules"), join(root, "node_modules"), "junction");
  writeFileSync(join(root, "data/openpresence-runtime.json"), JSON.stringify({
    version: 1,
    activeProfile: "regular",
    profiles: { regular: { dbPath: "data/test-workspace.db", port: 3015,
      agentId: "agent-runtime-fixture", presenceId: "presence-runtime-fixture", handle: "@runtime_fixture" } },
  }));
  // Keep routing evidence local to the fixture; never inspect a running workspace.
  const output = execFileSync(process.execPath, [join(root, "bin/openpresence.mjs"), "runtime", "status", "--url", "http://127.0.0.1:1"], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...env },
    encoding: "utf8",
  });
  return { status: JSON.parse(output), root };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local runtime profiles", () => {
  it("resolves the regular profile to its configured immutable scope", () => {
    const { status } = runtimeStatus();
    expect(status.profile).toMatchObject({ name: "regular", port: 3015, agentId: "agent-runtime-fixture", presenceId: "presence-runtime-fixture", handle: "@runtime_fixture" });
    expect(status.selection.overridden).toBe(false);
  });

  it("rejects an accidental database or port override outside test mode", () => {
    const { status } = runtimeStatus({ OPENPRESENCE_DB_PATH: "data/vitest.db", OPENPRESENCE_PORT: "3113" });
    expect(status.healthy).toBe(false);
    expect(status.issues[0]).toMatch(/Runtime configuration mismatch/);
  });

  it("allows explicitly isolated test runtimes to override the profile", () => {
    const { status, root } = runtimeStatus({ OPENPRESENCE_DB_PATH: "data/vitest.db", OPENPRESENCE_PORT: "3113", OPENPRESENCE_TEST_MODE: "1" });
    expect(status.selection.overridden).toBe(true);
    expect(status.selection.port).toBe(3113);
    expect(status.database.path).toBe(join(root, "data/vitest.db"));
  });

  it("exposes the configured regular profile through the status command", () => {
    const { status } = runtimeStatus();
    expect(status.profile).toMatchObject({ dbPath: "data/test-workspace.db", port: 3015, agentId: "agent-runtime-fixture", presenceId: "presence-runtime-fixture" });
  });
});
