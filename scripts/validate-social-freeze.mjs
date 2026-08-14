#!/usr/bin/env node

/**
 * Fail-closed validator for the final social-capability partition manifest.
 *
 * Dataset facts are validated here. Social actions, wording, and provider
 * identity are deliberately not evaluated by this script.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(root, process.argv[2] ?? "qa-learnings/social-capability-frozen-manifest.json");
const outputPath = path.resolve(root, process.argv[3] ?? "qa-learnings/social-capability-freeze-validation-latest.json");
const errors = [];
const warnings = [];

const requirements = {
  frozenCaseCount: 130,
  frozenCategoryMinimums: {
    "boardy-reply-reaction": 50,
    "boardy-original-quote": 20,
    "technical-link-media": 15,
    "network-introduction": 15,
    "sensitive-adversarial": 10,
    restraint: 20,
  },
};

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  errors.push(`manifest unavailable: ${manifestPath}`);
  manifest = { partitions: {} };
}

const partitionNames = ["development", "validation", "frozen", "holdout"];
const partitions = manifest.partitions ?? {};
for (const name of partitionNames) {
  if (!Array.isArray(partitions[name])) errors.push(`missing partition array: ${name}`);
}

const seenCaseIds = new Map();
const seenThreadUnits = new Map();
const seenSourceUrls = new Map();
const forbiddenExpectedFields = [
  "expectedAction",
  "expectedAct",
  "expectedWording",
  "idealResponse",
  "goldResponse",
  "targetResponse",
];

for (const partition of partitionNames) {
  for (const item of partitions[partition] ?? []) {
    const label = `${partition}:${item.caseId ?? "<missing-case-id>"}`;
    if (!item.caseId) errors.push(`${label} missing caseId`);
    if (!item.threadUnit) errors.push(`${label} missing threadUnit`);
    if (!item.category) errors.push(`${label} missing category`);
    if (!item.sourceType) errors.push(`${label} missing sourceType`);
    if (!item.evidenceStatus) errors.push(`${label} missing evidenceStatus`);
    if (!item.confidence) errors.push(`${label} missing confidence`);

    const priorCase = item.caseId ? seenCaseIds.get(item.caseId) : undefined;
    if (priorCase) errors.push(`caseId appears in ${priorCase} and ${label}`);
    else if (item.caseId) seenCaseIds.set(item.caseId, label);

    const priorThread = item.threadUnit ? seenThreadUnits.get(item.threadUnit) : undefined;
    if (priorThread && priorThread.partition !== partition) {
      errors.push(`threadUnit crosses partitions: ${item.threadUnit} (${priorThread.label}, ${label})`);
    } else if (item.threadUnit && !priorThread) {
      seenThreadUnits.set(item.threadUnit, { partition, label });
    }

    const sourceUrl = item.provenance?.sourceUrl ?? item.sourceUrl;
    const priorSource = sourceUrl ? seenSourceUrls.get(sourceUrl) : undefined;
    if (priorSource && priorSource.partition !== partition) {
      errors.push(`source URL crosses partitions: ${sourceUrl} (${priorSource.label}, ${label})`);
    } else if (sourceUrl && !priorSource) {
      seenSourceUrls.set(sourceUrl, { partition, label });
    }

    for (const field of forbiddenExpectedFields) {
      if (Object.prototype.hasOwnProperty.call(item, field)) {
        errors.push(`${label} contains forbidden expected-answer field: ${field}`);
      }
    }

    if (partition === "frozen" && item.evidenceStatus !== "verified") {
      errors.push(`${label} is frozen but evidenceStatus is ${item.evidenceStatus}, not verified`);
    }
    if (partition === "holdout" && item.caseText) warnings.push(`${label} exposes holdout caseText`);
  }
}

const frozen = partitions.frozen ?? [];
if (frozen.length !== requirements.frozenCaseCount) {
  errors.push(`frozen count is ${frozen.length}/${requirements.frozenCaseCount}`);
}
for (const [category, minimum] of Object.entries(requirements.frozenCategoryMinimums)) {
  const count = frozen.filter((item) => item.category === category).length;
  if (count < minimum) errors.push(`frozen category ${category} is ${count}/${minimum}`);
}

const result = {
  generatedAt: new Date().toISOString(),
  manifest: path.relative(root, manifestPath),
  status: errors.length === 0 ? "ready" : "not-ready",
  counts: Object.fromEntries(partitionNames.map((name) => [name, (partitions[name] ?? []).length])),
  verifiedFrozenCases: frozen.filter((item) => item.evidenceStatus === "verified").length,
  requirements,
  errors,
  warnings,
};

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = errors.length === 0 ? 0 : 1;
