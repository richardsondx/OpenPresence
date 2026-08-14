#!/usr/bin/env node

/**
 * Build the human-review packet for the deduplicated Boardy source pool.
 *
 * This packet records evidence and eligibility decisions only. It must never
 * assign an expected social act, wording, or response to OpenPresence.
 */

import { readFile, writeFile } from "node:fs/promises";

const sourcePath = process.argv[2] ?? "qa-learnings/social-capability-source-pool-candidate-v1.json";
const outputPath = process.argv[3] ?? "qa-learnings/social-capability-source-pool-review-packet-v1.json";
const [sourcePool, enriched, curated, originals, leads] = await Promise.all([
  readFile(new URL(`../${sourcePath}`, import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json", import.meta.url)).then(JSON.parse),
  readFile(new URL("../qa-learnings/boardy-development-manifest-2026-08-13.json", import.meta.url)).then(JSON.parse),
  readFile(new URL("../qa-learnings/boardy-original-capture-2026-08-13.json", import.meta.url)).then(JSON.parse),
  readFile(new URL("../qa-learnings/boardy-additional-thread-leads-2026-08-13.json", import.meta.url)).then(JSON.parse),
]);

const categories = [
  "boardy-reply-reaction",
  "boardy-original-quote",
  "technical-link-media",
  "network-introduction",
  "sensitive-adversarial",
  "restraint",
];

const enrichedById = new Map((enriched.cases ?? []).map((item) => [item.caseId, item]));
const curatedById = new Map((curated.cases ?? []).map((item) => [item.caseId, item]));
const originalById = new Map((originals.cases ?? []).map((item) => [item.caseId, item]));
const leadById = new Map((leads.cases ?? []).map((item) => [item.candidateId, item]));

function compactStatus(status) {
  if (!status) return null;
  return {
    requestedId: status.requestedId ?? null,
    errors: status.errors ?? [],
    depthLimitReached: status.depthLimitReached ?? false,
    chain: (status.chain ?? []).map((entry) => ({
      id: entry.id ?? null,
      url: entry.url ?? null,
      text: entry.text ?? null,
      author: entry.author ?? null,
      createdAt: entry.createdAt ?? null,
      replyingTo: entry.replyingTo ?? null,
      replyingToStatus: entry.replyingToStatus ?? null,
      mediaPresent: Boolean(entry.media?.all?.length),
      linkCardPresent: Boolean(entry.twitterCard),
      quoted: entry.quoted ? {
        id: entry.quoted.id ?? null,
        url: entry.quoted.url ?? null,
        text: entry.quoted.text ?? null,
        author: entry.quoted.author ?? null,
        createdAt: entry.quoted.createdAt ?? null,
      } : null,
    })),
  };
}

function evidenceSnapshot(item) {
  const sourceIds = item.provenance?.sourceCaseIds ?? [];
  const enrichedItem = sourceIds.map((id) => enrichedById.get(id)).find(Boolean);
  if (enrichedItem) {
    const publicStatus = enrichedItem.provenance?.publicStatus;
    const observedReply = enrichedItem.provenance?.observedBoardyReply;
    return {
      recordType: "public-api-enrichment",
      sourceCaseIds: sourceIds,
      sourceUrl: enrichedItem.sourceUrl ?? null,
      sourceApiUrl: enrichedItem.provenance?.sourceApiUrl ?? null,
      captureTimestamp: enrichedItem.provenance?.captureTimestamp ?? null,
      targetText: publicStatus?.chain?.[0]?.text ?? enrichedItem.sourceObservedText ?? null,
      targetAuthor: publicStatus?.chain?.[0]?.author ?? null,
      targetCreatedAt: publicStatus?.chain?.[0]?.createdAt ?? null,
      publicStatus: compactStatus(publicStatus),
      observedBoardy: observedReply ? {
        sourceUrl: observedReply.sourceUrl ?? null,
        sourceApiUrl: observedReply.sourceApiUrl ?? null,
        publicStatus: compactStatus(observedReply.publicStatus),
      } : null,
      mediaPresent: Boolean(publicStatus?.chain?.some((entry) => entry.media?.all?.length)),
      linkCardPresent: Boolean(publicStatus?.chain?.some((entry) => entry.twitterCard)),
      known: enrichedItem.provenance?.known ?? [],
      unknown: [
        !enrichedItem.relationshipHistory || enrichedItem.relationshipHistory === "unknown" ? "relationship history" : null,
        !enrichedItem.privateOutcome || enrichedItem.privateOutcome === "unknown" ? "private outcome and consent state" : null,
      ].filter(Boolean),
    };
  }

  const curatedItem = sourceIds.map((id) => curatedById.get(id)).find(Boolean);
  if (curatedItem) {
    return {
      recordType: "curated-development-capture",
      sourceCaseIds: sourceIds,
      sourceUrl: curatedItem.sourceUrl ?? null,
      captureTimestamp: curatedItem.observedAt ?? curated.capturedAt ?? null,
      targetText: curatedItem.inbound ?? null,
      targetAuthor: curatedItem.actor ?? null,
      observedBoardy: {
        action: curatedItem.observedBoardyAction ?? null,
        text: curatedItem.observedBoardyResponse ?? null,
      },
      mediaPresent: null,
      linkCardPresent: null,
      known: curatedItem.known ?? [],
      reconstructed: curatedItem.reconstructed ?? [],
      unknown: curatedItem.unknown ?? [],
    };
  }

  const originalItem = sourceIds.map((id) => originalById.get(id)).find(Boolean);
  if (originalItem) {
    return {
      recordType: "public-profile-capture",
      sourceCaseIds: sourceIds,
      sourceUrl: originalItem.url ?? null,
      captureTimestamp: originals.capturedAt ?? null,
      targetText: originalItem.text ?? null,
      targetKind: originalItem.kind ?? "post",
      targetAuthor: originals.sourceProfile ?? null,
      mediaPresent: Boolean(originalItem.hasMedia),
      linkCardPresent: null,
      known: ["The public profile capture contains the displayed original or quote object."],
      unknown: [
        "complete parent context",
        "relationship history",
        "private search, consent, and introduction outcome",
      ],
    };
  }

  const lead = sourceIds.map((id) => leadById.get(id)).find(Boolean);
  if (lead) {
    return {
      recordType: "visible-chrome-lead",
      sourceCaseIds: sourceIds,
      sourceUrl: lead.sourceUrl ?? null,
      captureTimestamp: lead.sourceDisplayedTimestamp ?? leads.capturedOn ?? null,
      targetText: lead.sourceText ?? null,
      targetAuthor: lead.sourceActor ?? null,
      publicContextVisible: lead.publicContextVisible ?? [],
      observedBoardy: lead.observedBoardyReply ?? null,
      media: lead.sourceMedia ?? [],
      known: ["The target and visible Boardy reference were recorded from the public X page."],
      unknown: lead.unknown ?? [],
    };
  }

  return {
    recordType: "unresolved-source-record",
    sourceCaseIds: sourceIds,
    known: [],
    unknown: ["source record could not be joined to an available capture artifact"],
  };
}

function reviewItem(item, partition) {
  const existingCategories = Array.isArray(item.category) ? item.category : [];
  return {
    caseId: item.caseId,
    candidatePartition: partition,
    sourceType: item.sourceType ?? null,
    currentEvidenceStatus: item.evidenceStatus ?? null,
    currentConfidence: item.confidence ?? null,
    currentCategory: existingCategories,
    currentCategoryStatus: item.categoryStatus ?? null,
    currentThreadUnit: item.threadUnit ?? null,
    provenance: {
      ...(item.provenance ?? {}),
      sourceCaseIds: item.provenance?.sourceCaseIds ?? [],
      relationshipAndPrivateOutcome: item.provenance?.relationshipAndPrivateOutcome ?? "unknown",
    },
    evidenceSnapshot: evidenceSnapshot(item),
    reviewDecision: {
      completeAvailableThreadUnit: null,
      includeInFrozenSet: null,
      category: null,
      threadUnit: null,
      evidenceStatus: null,
      confidence: null,
      reviewerNote: null,
      exclusionReason: null,
    },
  };
}

const replyItems = (sourcePool.replyPool ?? []).map((item) => reviewItem(item, "boardy-reply-reaction"));
const originalItems = (sourcePool.originalOrQuotePool ?? []).map((item) => reviewItem(item, "boardy-original-quote"));
const cases = [...replyItems, ...originalItems];

const output = {
  packetVersion: "social-capability-source-pool-review-packet.v1",
  generatedAt: new Date().toISOString(),
  status: "pending-source-review",
  sourcePool: sourcePath,
  purpose: "Review provenance, thread-unit integrity, category, confidence, and frozen-set eligibility without defining expected social behavior.",
  categoryVocabulary: categories,
  reviewerInstructions: [
    "Review the complete available public situation, not only the target object.",
    "Confirm whether the candidate is one independent thread or relationship unit and override the proposed unit when evidence shows otherwise.",
    "Mark completeAvailableThreadUnit true only when the available public history is sufficient for a credible parity judgment; private and relationship facts may remain explicitly unknown.",
    "Assign one primary category from categoryVocabulary; do not infer a category from the observed Boardy act or wording alone.",
    "Use evidenceStatus verified only when the source and available context are sufficiently checked for the frozen set; otherwise exclude or downgrade the case.",
    "Observed Boardy actions and wording are provenance references, never expected OpenPresence answers.",
    "Do not write expectedAction, expectedAct, expectedWording, idealResponse, or any equivalent field.",
  ],
  requiredFrozenSourceCounts: {
    "boardy-reply-reaction": 50,
    "boardy-original-quote": 20,
  },
  cases,
  summary: {
    totalCandidates: cases.length,
    replyCandidates: replyItems.length,
    originalOrQuoteCandidates: originalItems.length,
    categoryDecisionsPending: cases.filter((item) => item.reviewDecision.category === null).length,
    provenanceDecisionsPending: cases.length,
    threadUnitDecisionsPending: cases.length,
    frozenEligibilityDecisionsPending: cases.length,
  },
};

await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, summary: output.summary }, null, 2)}\n`);
