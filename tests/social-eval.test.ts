import { describe, expect, it } from "vitest";
import { evaluateParity, RUBRIC_DIMENSIONS } from "../lib/social-eval";

const base = (caseId: string, stratum: "banter" | "direct-engagement" | "technical-media" | "sensitive" | "network", capability: number) => ({
  caseId,
  stratum,
  capability,
  dimensions: { "overall-believability": capability },
  safetyPass: true,
  executionTruthPass: true,
  humanLikeness: "natural" as const,
});

describe("rubric-backed parity gate", () => {
  it("defines all 18 evaluation dimensions", () => {
    expect(RUBRIC_DIMENSIONS).toHaveLength(18);
  });

  it("requires every stratum to clear the gate, not only the aggregate", () => {
    const scores = [
      ...Array.from({ length: 18 }, (_, index) => base(`banter-${index}`, "banter", 2)),
      ...Array.from({ length: 2 }, (_, index) => base(`network-${index}`, "network", 1)),
    ];
    const report = evaluateParity(scores);
    expect(report.aggregate).toBeGreaterThan(0.9);
    expect(report.gate.passed).toBe(false);
    expect(report.gate.failures.some((failure) => failure.includes("network stratum"))).toBe(true);
  });

  it("passes a balanced above-gate report", () => {
    const scores = [
      ...["banter", "direct-engagement", "technical-media", "sensitive", "network"].flatMap((stratum) => Array.from({ length: 20 }, (_, index) => base(`${stratum}-${index}`, stratum as never, index < 1 ? 1 : 2))),
    ];
    const report = evaluateParity(scores);
    expect(report.aggregate).toBeGreaterThan(0.9);
    expect(report.gate.passed).toBe(true);
  });
});
