import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), "evals/v2", name), "utf8");
const inputs = JSON.parse(read("inputs.json"));
const grading = JSON.parse(read("grading.private.json"));
const manifest = JSON.parse(read("manifest.json"));

describe("frozen V2 holdout infrastructure (not model performance)", () => {
  it("contains 48 unique cases and six cases in every declared group", () => {
    expect(inputs.cases).toHaveLength(48);
    expect(new Set(inputs.cases.map((item: { id: string }) => item.id)).size).toBe(48);
    for (const [group, count] of Object.entries(manifest.groups)) {
      expect(inputs.cases.filter((item: { group: string }) => item.group === group)).toHaveLength(count as number);
    }
    expect(Object.keys(manifest.groups)).toHaveLength(8);
  });
  it("seals both input and independent grading files", () => {
    expect(createHash("sha256").update(read("inputs.json")).digest("hex")).toBe(manifest.inputsSha256);
    expect(createHash("sha256").update(read("grading.private.json")).digest("hex")).toBe(manifest.gradingSha256);
    expect(grading.cases.map((item: { id: string }) => item.id)).toEqual(inputs.cases.map((item: { id: string }) => item.id));
  });
  it("keeps expected behaviors and scoring out of host inputs", () => {
    for (const item of inputs.cases) {
      expect(Object.keys(item).sort()).toEqual(["context", "group", "id", "prompt", "publicExecutionAllowed", "sourceType"]);
      expect(item.publicExecutionAllowed).toBe(false);
      expect(item.sourceType).toBe("synthetic");
      expect(typeof item.prompt).toBe("string");
      expect(typeof item.context).toBe("string");
    }
  });
});
