import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const childTest = join(process.cwd(), "tests/plan-intervention-process-boundary-child.test.ts");
const vitestBin = join(process.cwd(), "node_modules/vitest/vitest.mjs");

function runPhase(phase: "A" | "B", databasePath: string) {
  return execFileSync(process.execPath, [vitestBin, "run", childTest, "--reporter=dot"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAN_INTERVENTION_PHASE: phase, OPENPRESENCE_DB_PATH: databasePath, OPENPRESENCE_TEST_MODE: "1", OPENPRESENCE_ALLOW_DATABASE_INIT: "1", OPENPRESENCE_AI_MOCK: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("Agent-owned plan intervention process boundary", () => {
  it("restores a mutated responsibility and executes it after Process A terminates", () => {
    const directory = mkdtempSync(join(tmpdir(), "openpresence-plan-intervention-"));
    const databasePath = join(directory, "workspace.db");
    try {
      const phaseA = runPhase("A", databasePath);
      const phaseB = runPhase("B", databasePath);
      expect(phaseA).toContain('"phase":"A"');
      expect(phaseA).toContain('"createdBy":"agent"');
      expect(phaseB).toContain('"phase":"B"');
      expect(phaseB).toContain('"instructionIncludesConstraint":true');
      expect(phaseB).toContain('"executionCount":1');
      expect(phaseB).toContain('"userActivationRequired":false');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
