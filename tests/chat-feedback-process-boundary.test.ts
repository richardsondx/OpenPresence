import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const childTest = join(process.cwd(), "tests/chat-feedback-process-boundary-child.test.ts");
const vitestBin = join(process.cwd(), "node_modules/vitest/vitest.mjs");

function runPhase(phase: "A" | "B", databasePath: string) {
  return execFileSync(process.execPath, [vitestBin, "run", childTest, "--reporter=dot"], {
    cwd: process.cwd(),
    env: { ...process.env, CHAT_FEEDBACK_PHASE: phase, OPENPRESENCE_VITEST_DB_PATH: databasePath, OPENPRESENCE_DB_PATH: databasePath, OPENPRESENCE_TEST_MODE: "1", OPENPRESENCE_ALLOW_DATABASE_INIT: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("Chat feedback process-boundary contract", () => {
  it("survives Process A termination and a fresh Process B restore", () => {
    const directory = mkdtempSync(join(tmpdir(), "openpresence-chat-feedback-"));
    const databasePath = join(directory, "workspace.db");
    try {
      const phaseA = runPhase("A", databasePath);
      expect(existsSync(databasePath), "Process A must persist to the declared isolated database.").toBe(true);
      const phaseB = runPhase("B", databasePath);
      expect(phaseA).toContain('"phase":"A"');
      expect(phaseB).toContain('"phase":"B"');
      expect(phaseB).toContain('"strategyContextIncludesCorrection":true');
      expect(phaseB).toContain('"executionCount":0');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
