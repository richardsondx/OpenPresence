#!/usr/bin/env node

/** Build a deduplicated, provenance-aware source pool; never freeze it. */

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const outputPath = process.argv[2] ?? "qa-learnings/social-capability-source-pool-candidate-v1.json";
const [enriched, curated, originals, leads] = await Promise.all([
  readFile(new URL("qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json", root), "utf8").then(JSON.parse),
  readFile(new URL("qa-learnings/boardy-development-manifest-2026-08-13.json", root), "utf8").then(JSON.parse),
  readFile(new URL("qa-learnings/boardy-original-capture-2026-08-13.json", root), "utf8").then(JSON.parse),
  readFile(new URL("qa-learnings/boardy-additional-thread-leads-2026-08-13.json", root), "utf8").then(JSON.parse),
]);

function rootId(item) {
  return item.provenance?.publicStatus?.chain?.at(-1)?.id ?? item.caseId;
}

function chainLength(item) {
  return item.provenance?.publicStatus?.chain?.length ?? 0;
}

function representative(items, kind) {
  const byRoot = new Map();
  for (const item of items) {
    const root = rootId(item);
    if (!byRoot.has(root)) byRoot.set(root, item);
  }
  return [...byRoot.values()].map((item) => ({
    caseId: `boardy-${kind}-root-${rootId(item)}`,
    category: [],
    categoryStatus: "pending-manual-label",
    threadUnit: `boardy-public-root:${rootId(item)}`,
    sourceType: `boardy_${kind}_public_api_candidate`,
    evidenceStatus: "partial-public-api",
    confidence: "candidate",
    provenance: {
      sourceCaseIds: [item.caseId],
      sourceUrl: item.provenance?.sourceUrl ?? item.sourceUrl ?? null,
      sourceApiUrl: item.provenance?.sourceApiUrl ?? null,
      rootId: rootId(item),
      chainLength: chainLength(item),
      relationshipAndPrivateOutcome: "unknown",
    },
  }));
}

const enrichedReplies = enriched.cases.filter((item) => item.provenance?.sourceType === "read_only_visible_feed_capture");
const enrichedOriginals = enriched.cases.filter((item) => item.provenance?.sourceType === "read_only_visible_profile_capture");
const capturedReplyUrls = new Set(enrichedReplies.map((item) => item.provenance?.sourceUrl));
const curatedNew = curated.cases
  .filter((item) => !capturedReplyUrls.has(item.sourceUrl))
  .map((item) => ({
    caseId: item.caseId,
    category: Array.isArray(item.category) ? item.category : [],
    categoryStatus: "development-label",
    threadUnit: item.threadUnit,
    sourceType: "boardy_curated_development_candidate",
    evidenceStatus: "development-observed",
    confidence: item.confidence ?? "candidate",
    provenance: { sourceUrl: item.sourceUrl, sourceCaseIds: [item.caseId], relationshipAndPrivateOutcome: "unknown" },
  }));
const leadItems = leads.cases.map((item) => ({
  caseId: item.candidateId,
  category: [],
  categoryStatus: "pending-manual-label",
  threadUnit: `boardy-visible-root:${item.threadRoot}`,
  sourceType: "boardy_visible_chrome_candidate",
  evidenceStatus: "visible-page-only",
  confidence: "candidate",
  provenance: { sourceUrl: item.sourceUrl, sourceCaseIds: [item.candidateId], rootId: item.threadRoot, relationshipAndPrivateOutcome: "unknown" },
}));

const replyPool = [...representative(enrichedReplies, "reply"), ...curatedNew, ...leadItems];
const originalPool = representative(enrichedOriginals, "original");
const duplicateRoots = (items) => {
  const seen = new Set();
  return items.map((item) => item.threadUnit).filter((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const output = {
  poolVersion: "social-capability-source-pool-candidate.v1",
  generatedAt: new Date().toISOString(),
  status: "candidate-not-frozen",
  purpose: "Deduplicate public Boardy source situations by thread root before manual provenance review and final partition assignment.",
  policy: "A pool count is not a parity score. Observed Boardy wording/actions are references only; unknown relationship, consent, private search, and outcome facts remain unknown.",
  requirements: { replyUnits: 50, originalOrQuoteUnits: 20 },
  replyPool,
  originalOrQuotePool: originalPool,
  summary: {
    replyPoolCases: replyPool.length,
    replyPoolThreadUnits: new Set(replyPool.map((item) => item.threadUnit)).size,
    replyPoolCategoryLabelsPending: replyPool.filter((item) => item.categoryStatus === "pending-manual-label").length,
    replyPoolProvenanceReviewPending: replyPool.length,
    originalPoolCases: originalPool.length,
    originalPoolThreadUnits: new Set(originalPool.map((item) => item.threadUnit)).size,
    originalPoolProvenanceReviewPending: originalPool.length,
    duplicateReplyThreadUnits: duplicateRoots(replyPool),
    replyTargetReachedBeforeReview: new Set(replyPool.map((item) => item.threadUnit)).size >= 50,
    originalTargetReachedBeforeReview: new Set(originalPool.map((item) => item.threadUnit)).size >= 20,
  },
  releaseBlockers: [
    "Complete public-chain and source-completeness review for every candidate.",
    "Assign frozen capability categories without using expected actions or wording.",
    "Resolve thread/actor sequence overlap across development, validation, frozen, and holdout partitions.",
    "Exclude or downgrade cases whose missing context prevents a credible parity judgment.",
  ],
};

await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, summary: output.summary }, null, 2)}\n`);
