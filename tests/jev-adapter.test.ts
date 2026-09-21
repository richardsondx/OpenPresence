import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("JEV verification adapter", () => {
  it("fails closed in off mode without invoking a service", async () => {
    const { runJevTriage } = await import("../.agents/skills/verify-app/scripts/jev-adapter.mjs");
    const result = await runJevTriage({ claimId: "claim:safety", affectedCapability: "execution", deterministicResult: "SAFETY_STOP", assertionSummary: ["authority fence held"], route: "/chat", visibleTextSummary: "blocked", consoleSummary: [], networkSummary: [], trajectoryStateSummary: "blocked execution" }, { mode: "off" });
    expect(result.decision.mode).toBe("off");
    expect(result.decision.deterministicAuthority).toBe(true);
    expect(result.decision.routingApplied).toBe("ignore");
    expect(result.serviceAvailable).toBe(false);
  });

  it("persists bounded shadow metadata and never upgrades a deterministic failure", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "openpresence-jev-test-"));
    const persistPath = path.join(dir, "jev.ndjson");
    const { runJevTriage } = await import("../.agents/skills/verify-app/scripts/jev-adapter.mjs");
    const result = await runJevTriage({ claimId: "claim:blocked", affectedCapability: "bridge", deterministicResult: "BLOCKED", assertionSummary: ["x".repeat(2000)], route: "/chat", visibleTextSummary: "visible", consoleSummary: [], networkSummary: [], trajectoryStateSummary: "blocked" }, { mode: "shadow", persistPath });
    expect(result.decision.mode).toBe("shadow");
    expect(result.decision.deterministicAuthority).toBe(true);
    expect(result.decision.claimId).toBe("claim:blocked");
    const saved = JSON.parse((await readFile(persistPath, "utf8")).trim());
    expect(saved.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.questionVersion).toBe("openpresence-verification-triage.v1");
    expect(saved.answers).toEqual({});
    expect(saved.error).toBeTruthy();
  });
});
