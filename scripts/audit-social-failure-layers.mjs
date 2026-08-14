#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
const inputPaths = args.filter((_, index) => index !== outputIndex && index !== outputIndex + 1);
if (inputPaths.length === 0) {
  throw new Error("Usage: node scripts/audit-social-failure-layers.mjs <development-semantic.json>... [--output report.json]");
}

const allowedLayers = ["observation", "context", "relationship_memory", "perception", "planning", "expression", "execution", "none", "unknown"];
const reports = [];

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

for (const inputPath of inputPaths) {
  const semantic = JSON.parse(await readFile(inputPath, "utf8"));
  const cases = semantic.semanticEvaluation?.result?.cases;
  if (!Array.isArray(cases)) throw new Error(`${inputPath} has no completed semantic cases.`);

  const layerCounts = {};
  const actFailures = [];
  const wordingFailures = [];
  for (const score of cases) {
    const actFailure = finiteNumber(score.actAppropriateness) && score.actAppropriateness < 2;
    const wordingFailure = finiteNumber(score.wordingQuality) && score.wordingQuality < 2;
    if (!actFailure && !wordingFailure) continue;
    const layer = allowedLayers.includes(score.earliestFailureLayer) ? score.earliestFailureLayer : "unknown";
    increment(layerCounts, layer);
    const record = {
      case: score.case ?? null,
      layer,
      actAppropriateness: score.actAppropriateness ?? null,
      wordingQuality: score.wordingQuality ?? null,
      rationale: score.rationale ?? null,
    };
    if (actFailure) actFailures.push(record);
    if (wordingFailure) wordingFailures.push(record);
  }

  reports.push({
    source: semantic.source ?? inputPath,
    inputPath,
    semanticEvaluator: semantic.semanticEvaluator ?? null,
    cases: cases.length,
    aggregate: semantic.aggregates ?? null,
    failureCount: Object.values(layerCounts).reduce((sum, value) => sum + value, 0),
    failureLayers: layerCounts,
    actFailureCount: actFailures.length,
    wordingFailureCount: wordingFailures.length,
    actFailures,
    wordingFailures,
  });
}

const overallLayers = {};
let overallActFailures = 0;
let overallWordingFailures = 0;
for (const report of reports) {
  for (const [layer, count] of Object.entries(report.failureLayers)) overallLayers[layer] = (overallLayers[layer] ?? 0) + count;
  overallActFailures += report.actFailureCount;
  overallWordingFailures += report.wordingFailureCount;
}

const output = {
  reportVersion: "social-capability-development-failure-layers.v1",
  purpose: "Summarize earliest failure layers from development semantic artifacts only; do not inspect or tune against hidden holdout cases.",
  inputs: reports.map((report) => report.inputPath),
  overall: {
    artifacts: reports.length,
    actFailureCount: overallActFailures,
    wordingFailureCount: overallWordingFailures,
    failureLayers: overallLayers,
  },
  artifacts: reports,
};

if (outputPath) await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
