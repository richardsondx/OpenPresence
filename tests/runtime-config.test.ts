import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = join(process.cwd(), "bin/openpresence.mjs");

function runtimeStatus(env: Record<string, string> = {}) {
  const childEnv = { ...process.env, ...env };
  for (const key of ["OPENPRESENCE_PROFILE", "OPENPRESENCE_DB_PATH", "OPENPRESENCE_PORT", "OPENPRESENCE_TEST_MODE"]) {
    if (!(key in env)) delete childEnv[key];
  }
  const output = execFileSync(process.execPath, [cliPath, "runtime", "status"], { cwd: process.cwd(), env: childEnv, encoding: "utf8" });
  return JSON.parse(output);
}

describe("local runtime profiles", () => {
  it("resolves the regular profile to the canonical immutable scope", () => {
    const status = runtimeStatus();
    expect(status.profile).toMatchObject({ name: "regular", port: 3015, agentId: "agent_example_1", presenceId: "presence_example_19", handle: "@example_agent" });
    expect(status.selection.overridden).toBe(false);
  });

  it("rejects an accidental database or port override outside test mode", () => {
    const status = runtimeStatus({ OPENPRESENCE_DB_PATH: "data/vitest.db", OPENPRESENCE_PORT: "3113" });
    expect(status.healthy).toBe(false);
    expect(status.issues[0]).toMatch(/Runtime configuration mismatch/);
  });

  it("allows explicitly isolated test runtimes to override the profile", () => {
    const status = runtimeStatus({ OPENPRESENCE_DB_PATH: "data/vitest.db", OPENPRESENCE_PORT: "3113", OPENPRESENCE_TEST_MODE: "1" });
    expect(status.selection.overridden).toBe(true);
    expect(status.selection.port).toBe(3113);
    expect(status.database.path).toBe(`${process.cwd()}/data/vitest.db`);
  });

  it("exposes the regular profile through the status command", () => {
    const status = runtimeStatus();
    expect(status.profile).toMatchObject({ dbPath: "data/openpresence-main.db", port: 3015, agentId: "agent_example_1", presenceId: "presence_example_19" });
  });
});
