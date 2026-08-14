#!/usr/bin/env node

/**
 * Build the final partition manifest only after both provenance review packets
 * are approved. Pending review always produces an empty frozen partition.
 */

import { readFile, writeFile } from "node:fs/promises";

const outputPath = process.argv[2] ?? "qa-learnings/social-capability-frozen-manifest.json";

async function load(relativePath) {
  return JSON.parse(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"));
}

const [candidate, boardyPacket, independentPacket, boardyValidation, independentValidation] = await Promise.all([
  load("qa-learnings/social-capability-partition-candidate-v1.json"),
  load("qa-learnings/social-capability-source-pool-review-packet-v1.json"),
  load("qa-learnings/social-capability-independent-review-packet-v1.json"),
  load("qa-learnings/social-capability-source-pool-review-validation-latest.json"),
  load("qa-learnings/social-capability-independent-review-validation-latest.json"),
]);

const reviewReady = boardyValidation.status === "ready" && independentValidation.status === "ready";
const promotionErrors = [];
if (!reviewReady) promotionErrors.push("Both source-review validators must be ready before promotion.");

function boardyFrozenItems() {
  return boardyPacket.cases
    .filter((item) => item.reviewDecision?.includeInFrozenSet === true)
    .map((item) => ({
      caseId: item.caseId,
      category: item.reviewDecision.category,
      threadUnit: item.reviewDecision.threadUnit,
      sourceType: item.sourceType,
      evidenceStatus: item.reviewDecision.evidenceStatus,
      confidence: item.reviewDecision.confidence,
      provenance: item.provenance,
    }));
}

function independentFrozenItems() {
  return independentPacket.cases
    .filter((item) => item.reviewDecision?.includeInFrozenSet === true)
    .map((item) => ({
      caseId: item.caseId,
      category: item.reviewDecision.category,
      threadUnit: item.reviewDecision.threadUnit,
      sourceType: item.sourceType,
      evidenceStatus: item.reviewDecision.evidenceStatus,
      confidence: item.reviewDecision.confidence,
      provenance: {
        scenarios: [...new Set(item.sourceCases.map((source) => source.scenario))],
        sourceCaseIds: item.sourceCases.map((source) => source.caseId),
      },
    }));
}

const frozen = reviewReady ? [...boardyFrozenItems(), ...independentFrozenItems()] : [];
if (reviewReady && frozen.length !== 130) promotionErrors.push(`Reviewed frozen cases are ${frozen.length}/130.`);
if (reviewReady) {
  const ids = new Set();
  const units = new Set();
  for (const item of frozen) {
    if (ids.has(item.caseId)) promotionErrors.push(`Duplicate frozen caseId: ${item.caseId}`);
    ids.add(item.caseId);
    if (units.has(item.threadUnit)) promotionErrors.push(`Duplicate frozen threadUnit: ${item.threadUnit}`);
    units.add(item.threadUnit);
  }
}

const output = {
  manifestVersion: "social-capability-frozen-manifest.v1",
  generatedAt: new Date().toISOString(),
  status: promotionErrors.length === 0 && reviewReady ? "ready-for-validation" : "candidate-not-frozen",
  purpose: "Fail-closed partition manifest for the 130-case social-capability evaluation.",
  methodology: "qa-learnings/social-capability-evaluation-v2.md",
  requirements: candidate.requirements,
  partitions: {
    development: candidate.partitions.development,
    validation: candidate.partitions.validation,
    frozen,
    holdout: [],
  },
  holdoutSeal: candidate.holdoutSeal,
  promotionGate: {
    boardyReviewStatus: boardyPacket.status,
    independentReviewStatus: independentPacket.status,
    boardyValidationStatus: boardyValidation.status,
    independentValidationStatus: independentValidation.status,
    errors: promotionErrors,
    policy: "Observed Boardy action and wording are provenance only; no expected social behavior is stored in this manifest.",
  },
};

await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, frozenCases: frozen.length, promotionErrors }, null, 2)}\n`);
