#!/usr/bin/env node

/**
 * Build a transparent partition candidate from the currently available
 * development/validation fixtures. This is not the final benchmark and never
 * promotes incomplete Boardy captures into the frozen partition.
 */

import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const outputPath = process.argv[2] ?? "qa-learnings/social-capability-partition-candidate-v1.json";

async function load(relativePath) {
  return JSON.parse(await fs.readFile(new URL(relativePath, root), "utf8"));
}

const [curated, restraint, independentStrata, fresh, sourceCapture, originalCapture, holdout, provenanceEnrichment] = await Promise.all([
  load("qa-learnings/boardy-development-manifest-2026-08-13.json"),
  load("scenarios/restraint-development-20.json"),
  load("scenarios/independent-strata-development-24.json"),
  Promise.all([1, 2, 3].map((id) => load(`scenarios/fresh-social-capability-${id}.json`))),
  load("qa-learnings/boardy-source-capture-2026-08-13.json"),
  load("qa-learnings/boardy-original-capture-2026-08-13.json"),
  load("scenarios/social-capability-holdout-60.json"),
  load("qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json"),
]);

const development = curated.cases.map((item) => ({
  caseId: item.caseId,
  category: "boardy-development",
  threadUnit: item.threadUnit,
  sourceType: "read_only_visible_feed_capture",
  evidenceStatus: "development-observed",
  confidence: item.confidence,
  provenance: {
    sourceUrl: item.sourceUrl,
    actor: item.actor,
    observedAction: item.observedBoardyAction,
    known: item.known,
    unknown: item.unknown,
  },
}));

const restraintCases = restraint.steps
  .filter((step) => step.command === "inject")
  .map((step, index) => ({
    caseId: `restraint-development-${String(index + 1).padStart(2, "0")}`,
    category: "restraint",
    threadUnit: `restraint-development:${step.options.handle}`,
    sourceType: "independently_curated_restraint",
    evidenceStatus: "constructed-development",
    confidence: "development",
    provenance: { scenario: "scenarios/restraint-development-20.json", actor: step.options.actor, handle: step.options.handle },
  }));
development.push(...restraintCases);

const independentStrataCases = (independentStrata.caseMetadata ?? []).map((item) => ({
  caseId: item.caseId,
  category: item.categories?.[0] ?? "unclassified",
  categories: item.categories ?? [],
  threadUnit: item.threadUnit,
  sourceType: item.sourceType,
  evidenceStatus: "constructed-development",
  confidence: item.confidence,
  provenance: { scenario: "scenarios/independent-strata-development-24.json" },
}));
development.push(...independentStrataCases);

const validation = fresh.flatMap((scenario, scenarioIndex) => scenario.steps
  .filter((step) => step.command === "inject")
  .map((step, caseIndex) => ({
    caseId: `fresh-${scenarioIndex + 1}-${String(caseIndex + 1).padStart(2, "0")}`,
    category: "fresh-generalization",
    threadUnit: `fresh-${scenarioIndex + 1}:${step.options.handle}`,
    sourceType: "fresh_playground_generalization",
    evidenceStatus: "constructed-validation",
    confidence: "validation",
    provenance: { scenario: `scenarios/fresh-social-capability-${scenarioIndex + 1}.json`, actor: step.options.actor, handle: step.options.handle },
  })));

const sourceIdsUsedByCurated = new Set(curated.cases.map((item) => item.sourceUrl));
const excludedBoardy = [
  ...sourceCapture.cases
    .filter((item) => !sourceIdsUsedByCurated.has(item.sourceUrl))
    .map((item) => ({ caseId: item.caseId, sourceType: item.sourceType, sourceUrl: item.sourceUrl, reason: "missing complete threadUnit/parent-history provenance" })),
  ...originalCapture.cases.map((item) => ({ caseId: item.caseId, sourceType: originalCapture.sourceType, sourceUrl: item.url, reason: "missing complete parent-history/relationship provenance" })),
];

const manifest = {
  manifestVersion: "social-capability-partition-candidate.v1",
  status: "candidate-not-frozen",
  purpose: "Make development/validation boundaries explicit while incomplete Boardy captures remain excluded from the frozen set.",
  methodology: "qa-learnings/social-capability-evaluation-v2.md",
  requirements: {
    frozenCaseCount: 130,
    frozenCategoryMinimums: {
      "boardy-reply-reaction": 50,
      "boardy-original-quote": 20,
      "technical-link-media": 15,
      "network-introduction": 15,
      "sensitive-adversarial": 10,
      restraint: 20,
    },
  },
  partitions: {
    development,
    validation,
    frozen: [],
    holdout: [],
  },
  holdoutSeal: {
    scenario: "scenarios/social-capability-holdout-60.json",
    caseCount: holdout.steps.filter((step) => step.command === "inject").length,
    policy: "Keep individual holdout cases out of development diagnosis; evaluate aggregate-only.",
  },
  provenanceEnrichment: {
    artifact: "qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json",
    status: provenanceEnrichment.status,
    inputCases: provenanceEnrichment.summary?.inputCases ?? null,
    casesWithParentChain: provenanceEnrichment.summary?.casesWithParentChain ?? null,
    policy: "Public metadata improves provenance only; private outcomes and complete relationship history remain unknown.",
  },
  excludedBoardySourceCases: excludedBoardy,
  notes: [
    "The 15 curated Boardy cases have explicit thread units but remain development-only because private outcomes and some parent context are unknown.",
    "The 48 visible-feed reply captures and 20 original/quote captures are not promoted automatically; each requires a provenance review before entering a frozen partition.",
    "No expected action, expected wording, or provider-specific behavior is stored in this manifest.",
  ],
};

await fs.writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: manifest.status, counts: Object.fromEntries(Object.entries(manifest.partitions).map(([name, items]) => [name, items.length])), excludedBoardy: excludedBoardy.length }, null, 2)}\n`);
