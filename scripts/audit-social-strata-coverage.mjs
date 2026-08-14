#!/usr/bin/env node

/**
 * Audit independent development/validation strata by social thread unit.
 * Hidden holdout files are intentionally not read here.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.resolve(root, process.argv[2] ?? "qa-learnings/social-capability-strata-coverage-latest.json");
const scenarioDir = path.resolve(root, "scenarios");
const targetMinimums = {
  "technical-link-media": 15,
  "network-introduction": 15,
  "sensitive-adversarial": 10,
  restraint: 20,
};
const targetIndependentTotal = 60;
const canonicalCategories = new Set(Object.keys(targetMinimums));

const files = (await readdir(scenarioDir))
  .filter((file) => /^fresh-social-capability-[123]\.json$/.test(file) || file === "restraint-development-20.json" || file === "independent-strata-development-24.json")
  .sort();

const cases = [];
for (const file of files) {
  const scenario = JSON.parse(await readFile(path.join(scenarioDir, file), "utf8"));
  for (const metadata of scenario.caseMetadata ?? []) {
    const categories = (metadata.categories ?? []).filter((category) => canonicalCategories.has(category));
    if (!categories.length) continue;
    cases.push({
      caseId: metadata.caseId,
      file,
      categories,
      threadUnit: metadata.threadUnit,
      sourceType: metadata.sourceType,
      partition: metadata.partition,
    });
  }
}

const byCategory = Object.fromEntries(Object.keys(targetMinimums).map((category) => {
  const categoryCases = cases.filter((item) => item.categories.includes(category));
  const units = [...new Set(categoryCases.map((item) => item.threadUnit).filter(Boolean))];
  return [category, {
    targetIndependentUnits: targetMinimums[category],
    candidateCases: categoryCases.length,
    independentThreadUnits: units.length,
    additionalIndependentUnitsNeeded: Math.max(0, targetMinimums[category] - units.length),
    threadUnits: units,
  }];
}));

const result = {
  auditVersion: "social-capability-strata-coverage.v1",
  generatedAt: new Date().toISOString(),
  status: Object.values(byCategory).every((item) => item.additionalIndependentUnitsNeeded === 0)
    && new Set(cases.map((item) => item.threadUnit).filter(Boolean)).size >= targetIndependentTotal
    ? "targets-met"
    : "additional-independent-units-needed",
  policy: "Repeated turns from one actor/thread unit are counted once for independence. This audit does not inspect or score the hidden holdout.",
  inputFiles: files,
  totalCandidateCases: cases.length,
  totalIndependentThreadUnits: new Set(cases.map((item) => item.threadUnit).filter(Boolean)).size,
  targetIndependentTotal,
  additionalIndependentUnitsNeeded: Math.max(0, targetIndependentTotal - new Set(cases.map((item) => item.threadUnit).filter(Boolean)).size),
  byCategory,
  cases,
  nextAction: "Construct new independently curated thread units for every remaining deficit before freezing the supplemental strata.",
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath: path.relative(root, outputPath), status: result.status, byCategory }, null, 2)}\n`);
