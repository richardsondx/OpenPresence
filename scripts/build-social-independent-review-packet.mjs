#!/usr/bin/env node

/**
 * Build the review packet for the independent supplemental strata.
 *
 * This selects distinct social thread units for coverage accounting only. It
 * never assigns an expected action, wording, or model-specific answer.
 */

import { readFile, writeFile } from "node:fs/promises";

const outputPath = process.argv[2] ?? "qa-learnings/social-capability-independent-review-packet-v1.json";
const targets = {
  "technical-link-media": 15,
  "network-introduction": 15,
  "sensitive-adversarial": 10,
  restraint: 20,
};
const scenarioFiles = [
  "scenarios/fresh-social-capability-1.json",
  "scenarios/fresh-social-capability-2.json",
  "scenarios/fresh-social-capability-3.json",
  "scenarios/restraint-development-20.json",
  "scenarios/independent-strata-development-24.json",
];

const scenarios = await Promise.all(scenarioFiles.map(async (file) => ({
  file,
  data: JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8")),
})));

const units = new Map();
for (const { file, data } of scenarios) {
  const injects = (data.steps ?? []).filter((step) => step.command === "inject");
  for (const [index, metadata] of (data.caseMetadata ?? []).entries()) {
    const unit = units.get(metadata.threadUnit) ?? {
      threadUnit: metadata.threadUnit,
      categories: new Set(),
      cases: [],
    };
    for (const category of metadata.categories ?? []) unit.categories.add(category);
    unit.cases.push({
      caseId: metadata.caseId,
      file,
      index,
      categories: metadata.categories ?? [],
      inject: injects[index]?.options ?? null,
      sourceType: metadata.sourceType,
      confidence: metadata.confidence,
    });
    units.set(metadata.threadUnit, unit);
  }
}

const selected = [];
const usedUnits = new Set();
for (const [category, target] of Object.entries(targets)) {
  const candidates = [...units.values()].filter((unit) => !usedUnits.has(unit.threadUnit) && unit.categories.has(category));
  if (candidates.length < target) throw new Error(`Insufficient independent units for ${category}: ${candidates.length}/${target}`);
  for (const unit of candidates.slice(0, target)) {
    const representative = unit.cases.find((item) => item.categories.includes(category)) ?? unit.cases[0];
    selected.push({
      caseId: `independent-frozen-${category}-${String(selected.filter((item) => item.proposedCategory === category).length + 1).padStart(2, "0")}`,
      proposedCategory: category,
      proposedThreadUnit: unit.threadUnit,
      sourceType: representative.sourceType,
      currentConfidence: representative.confidence,
      sourceCases: unit.cases.map((item) => ({
        caseId: item.caseId,
        scenario: item.file,
        categories: item.categories,
        actor: item.inject?.actor ?? null,
        handle: item.inject?.handle ?? null,
        content: item.inject?.content ?? null,
        assets: item.inject?.assets ?? [],
      })),
      evidenceBoundary: {
        known: ["The situation is independently curated for OpenPresence development and has no claim to be a historical Boardy no-op or response."],
        unknown: ["historical Boardy action", "private relationship state", "external search or introduction outcome"],
      },
      reviewDecision: {
        completeThreadUnit: null,
        includeInFrozenSet: null,
        category: null,
        threadUnit: null,
        evidenceStatus: null,
        confidence: null,
        reviewerNote: null,
        exclusionReason: null,
      },
    });
    usedUnits.add(unit.threadUnit);
  }
}

const output = {
  packetVersion: "social-capability-independent-review-packet.v1",
  generatedAt: new Date().toISOString(),
  status: "pending-independent-review",
  purpose: "Review independent thread-unit completeness, category assignment, and frozen-set eligibility without defining expected social behavior.",
  sourceScenarios: scenarioFiles,
  targetCounts: targets,
  reviewerInstructions: [
    "Review one complete thread/relationship unit at a time; multiple turns from the same unit are context, not independent cases.",
    "Confirm that the selected target and available preceding context form a coherent social situation.",
    "Assign the final primary category only from the declared category vocabulary.",
    "These are independent OpenPresence cases, not historical Boardy labels; do not invent a Boardy action or treat silence as proven Boardy behavior.",
    "Only mark evidenceStatus verified and includeInFrozenSet true when the case is sufficiently reviewed for the final benchmark.",
    "Do not add expectedAction, expectedAct, expectedWording, idealResponse, goldResponse, or equivalent fields.",
  ],
  cases: selected,
  summary: {
    totalCandidates: selected.length,
    independentThreadUnits: new Set(selected.map((item) => item.proposedThreadUnit)).size,
    byCategory: Object.fromEntries(Object.keys(targets).map((category) => [category, selected.filter((item) => item.proposedCategory === category).length])),
    decisionsPending: selected.length,
  },
};

await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, summary: output.summary }, null, 2)}\n`);
