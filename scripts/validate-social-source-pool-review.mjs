#!/usr/bin/env node

/**
 * Fail-closed validator for the source-pool review packet.
 *
 * This validates factual dataset metadata only. It deliberately has no
 * concept of an expected social act, ideal wording, or model preference.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packetPath = path.resolve(root, process.argv[2] ?? "qa-learnings/social-capability-source-pool-review-packet-v1.json");
const outputPath = path.resolve(root, process.argv[3] ?? "qa-learnings/social-capability-source-pool-review-validation-latest.json");
const errors = [];
const warnings = [];
const allowedCategories = new Set([
  "boardy-reply-reaction",
  "boardy-original-quote",
  "technical-link-media",
  "network-introduction",
  "sensitive-adversarial",
  "restraint",
]);
const forbiddenKeys = new Set([
  "expectedAction",
  "expectedAct",
  "expectedWording",
  "idealResponse",
  "goldResponse",
  "targetResponse",
]);

let packet;
try {
  packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
} catch {
  packet = { cases: [] };
  errors.push(`review packet unavailable: ${packetPath}`);
}

function findForbiddenKeys(value, location = "packet") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${location}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`${location} contains forbidden expected-answer field: ${key}`);
    findForbiddenKeys(child, `${location}.${key}`);
  }
}

findForbiddenKeys(packet);

const cases = Array.isArray(packet.cases) ? packet.cases : [];
if (cases.length !== 70) errors.push(`candidate count is ${cases.length}/70`);

const seenIds = new Set();
const seenThreadUnits = new Map();
const decisions = cases.map((item, index) => {
  const label = `${item.candidatePartition ?? "unknown"}:${item.caseId ?? `index-${index}`}`;
  if (!item.caseId) errors.push(`${label} missing caseId`);
  if (seenIds.has(item.caseId)) errors.push(`${label} duplicates caseId`);
  seenIds.add(item.caseId);

  if (!["boardy-reply-reaction", "boardy-original-quote"].includes(item.candidatePartition)) {
    errors.push(`${label} has invalid candidatePartition`);
  }
  if (!item.currentThreadUnit) errors.push(`${label} missing currentThreadUnit`);
  if (item.currentThreadUnit) {
    const prior = seenThreadUnits.get(item.currentThreadUnit);
    if (prior) errors.push(`current threadUnit is duplicated: ${item.currentThreadUnit} (${prior}, ${label})`);
    else seenThreadUnits.set(item.currentThreadUnit, label);
  }

  const decision = item.reviewDecision ?? {};
  if (typeof decision.completeAvailableThreadUnit !== "boolean") {
    errors.push(`${label} missing boolean completeAvailableThreadUnit decision`);
  }
  if (typeof decision.includeInFrozenSet !== "boolean") {
    errors.push(`${label} missing boolean includeInFrozenSet decision`);
  }
  if (decision.includeInFrozenSet === true) {
    if (!allowedCategories.has(decision.category)) errors.push(`${label} has invalid frozen category`);
    if (!decision.threadUnit) errors.push(`${label} missing reviewed threadUnit`);
    if (decision.evidenceStatus !== "verified") errors.push(`${label} is included but evidenceStatus is not verified`);
    if (!["high", "medium"].includes(decision.confidence)) errors.push(`${label} is included but confidence is not high or medium`);
    if (decision.completeAvailableThreadUnit !== true) errors.push(`${label} is included without completeAvailableThreadUnit=true`);
  } else if (decision.includeInFrozenSet === false && !decision.exclusionReason) {
    errors.push(`${label} excludes the case without exclusionReason`);
  }
  return { label, includeInFrozenSet: decision.includeInFrozenSet, category: decision.category };
});

const included = decisions.filter((item) => item.includeInFrozenSet === true);
const includedByCategory = Object.fromEntries([...allowedCategories].map((category) => [
  category,
  included.filter((item) => item.category === category).length,
]));

if (packet.status !== "approved-for-freeze") {
  warnings.push(`packet status is ${packet.status ?? "<missing>"}; promotion requires approved-for-freeze`);
}
if (includedByCategory["boardy-reply-reaction"] < 50) {
  errors.push(`included Boardy reply/reaction units are ${includedByCategory["boardy-reply-reaction"]}/50`);
}
if (includedByCategory["boardy-original-quote"] < 20) {
  errors.push(`included Boardy original/quote units are ${includedByCategory["boardy-original-quote"]}/20`);
}

const result = {
  generatedAt: new Date().toISOString(),
  packet: path.relative(root, packetPath),
  status: errors.length === 0 ? "ready" : "not-ready",
  counts: {
    candidates: cases.length,
    included: included.length,
    pending: decisions.filter((item) => item.includeInFrozenSet === null || item.includeInFrozenSet === undefined).length,
    excluded: decisions.filter((item) => item.includeInFrozenSet === false).length,
    includedByCategory,
  },
  errors,
  warnings,
};

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = errors.length === 0 ? 0 : 1;
