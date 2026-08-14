#!/usr/bin/env node

/** Fail-closed validator for the independent supplemental review packet. */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packetPath = path.resolve(root, process.argv[2] ?? "qa-learnings/social-capability-independent-review-packet-v1.json");
const outputPath = path.resolve(root, process.argv[3] ?? "qa-learnings/social-capability-independent-review-validation-latest.json");
const errors = [];
const warnings = [];
const targets = {
  "technical-link-media": 15,
  "network-introduction": 15,
  "sensitive-adversarial": 10,
  restraint: 20,
};
const forbiddenKeys = new Set(["expectedAction", "expectedAct", "expectedWording", "idealResponse", "goldResponse", "targetResponse"]);

let packet;
try {
  packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
} catch {
  packet = { cases: [] };
  errors.push(`review packet unavailable: ${packetPath}`);
}

function findForbidden(value, location = "packet") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => findForbidden(item, `${location}[${index}]`));
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`${location} contains forbidden expected-answer field: ${key}`);
    findForbidden(child, `${location}.${key}`);
  }
}

findForbidden(packet);
const cases = Array.isArray(packet.cases) ? packet.cases : [];
if (cases.length !== 60) errors.push(`candidate count is ${cases.length}/60`);
const seenIds = new Set();
const seenUnits = new Set();
const includedByCategory = Object.fromEntries(Object.keys(targets).map((category) => [category, 0]));
let included = 0;
let pending = 0;
let excluded = 0;

for (const [index, item] of cases.entries()) {
  const label = item.caseId ?? `index-${index}`;
  if (seenIds.has(item.caseId)) errors.push(`${label} duplicates caseId`);
  seenIds.add(item.caseId);
  if (!item.proposedThreadUnit) errors.push(`${label} missing proposedThreadUnit`);
  if (seenUnits.has(item.proposedThreadUnit)) errors.push(`${label} duplicates proposedThreadUnit`);
  seenUnits.add(item.proposedThreadUnit);
  if (!Object.prototype.hasOwnProperty.call(targets, item.proposedCategory)) errors.push(`${label} has invalid proposedCategory`);
  const decision = item.reviewDecision ?? {};
  if (decision.includeInFrozenSet === null || decision.includeInFrozenSet === undefined) pending += 1;
  else if (decision.includeInFrozenSet === false) {
    excluded += 1;
    if (!decision.exclusionReason) errors.push(`${label} excludes the case without exclusionReason`);
  } else {
    included += 1;
    if (decision.completeThreadUnit !== true) errors.push(`${label} is included without completeThreadUnit=true`);
    if (!Object.prototype.hasOwnProperty.call(targets, decision.category)) errors.push(`${label} has invalid reviewed category`);
    if (!decision.threadUnit) errors.push(`${label} is included without reviewed threadUnit`);
    if (decision.evidenceStatus !== "verified") errors.push(`${label} is included without evidenceStatus=verified`);
    if (!["high", "medium"].includes(decision.confidence)) errors.push(`${label} is included without high/medium confidence`);
    if (Object.prototype.hasOwnProperty.call(includedByCategory, decision.category)) includedByCategory[decision.category] += 1;
  }
}

for (const [category, target] of Object.entries(targets)) {
  if (includedByCategory[category] < target) errors.push(`included ${category} units are ${includedByCategory[category]}/${target}`);
}
if (packet.status !== "approved-for-freeze") warnings.push(`packet status is ${packet.status ?? "<missing>"}; promotion requires approved-for-freeze`);

const result = {
  generatedAt: new Date().toISOString(),
  packet: path.relative(root, packetPath),
  status: errors.length === 0 ? "ready" : "not-ready",
  counts: { candidates: cases.length, uniqueThreadUnits: seenUnits.size, included, pending, excluded, includedByCategory },
  errors,
  warnings,
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = errors.length === 0 ? 0 : 1;
