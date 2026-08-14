#!/usr/bin/env node

/** Build a source-provenance review packet; never assign benchmark labels. */

import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const outputPath = process.argv[2] ?? "qa-learnings/boardy-provenance-review-packet-v1.json";
const enriched = JSON.parse(await fs.readFile(new URL("qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json", root), "utf8"));

function chainSummary(chain = []) {
  return chain.map((item) => ({
    id: item.id,
    url: item.url,
    author: item.author,
    createdAt: item.createdAt,
    text: item.text,
    replyingToStatus: item.replyingToStatus,
    quoted: item.quoted ? {
      id: item.quoted.id,
      url: item.quoted.url,
      author: item.quoted.author,
      createdAt: item.quoted.createdAt,
      text: item.quoted.text,
    } : null,
    mediaPresent: Boolean(item.media?.all?.length),
    linkCardPresent: Boolean(item.twitterCard),
  }));
}

const items = enriched.cases.map((item) => {
  const source = item.provenance?.publicStatus;
  const reply = item.provenance?.observedBoardyReply?.publicStatus;
  const chain = source?.chain ?? [];
  const gaps = [
    "relationship context",
    "private outcome and consent state",
  ];
  if (chain.length <= 1) gaps.push("retrieved parent chain beyond the observed object");
  if (source?.depthLimitReached) gaps.push("parent chain beyond the enrichment depth limit");
  return {
    caseId: item.caseId,
    captureKind: item.provenance?.sourceType,
    sourceUrl: item.provenance?.sourceUrl ?? item.sourceUrl ?? item.url ?? null,
    sourceApiUrl: item.provenance?.sourceApiUrl ?? null,
    capturedText: item.sourceObservedText ?? item.text ?? null,
    publicStatus: {
      requestedId: source?.requestedId ?? null,
      chain: chainSummary(chain),
      errors: source?.errors ?? [],
    },
    observedBoardyReply: reply ? {
      sourceUrl: item.provenance?.observedBoardyReply?.sourceUrl ?? null,
      sourceApiUrl: item.provenance?.observedBoardyReply?.sourceApiUrl ?? null,
      chain: chainSummary(reply.chain),
      errors: reply.errors ?? [],
    } : null,
    knownEvidence: item.provenance?.known ?? [],
    openEvidenceGaps: gaps,
    reviewDecision: {
      completeThreadUnit: null,
      threadUnit: null,
      confidence: null,
      includeInFrozenSet: null,
      reviewerNote: null,
    },
  };
});

const output = {
  packetVersion: "boardy-provenance-review-packet.v1",
  generatedAt: new Date().toISOString(),
  status: "pending-source-review",
  purpose: "Review source completeness and partition eligibility without assigning expected social actions or wording.",
  reviewerInstructions: [
    "Confirm whether the retrieved parent chain represents the complete available social situation.",
    "Assign one stable threadUnit for all cases from the same conversation or relationship sequence.",
    "Record unknown relationship/private facts explicitly; do not infer them from Boardy wording.",
    "Only mark includeInFrozenSet true when provenance is sufficient for a parity judgment and the case does not share a threadUnit with another partition.",
    "Observed Boardy actions and wording are references, never expected OpenPresence answers.",
  ],
  sourceEndpoint: "https://api.fxtwitter.com/status/:id",
  cases: items,
  summary: {
    cases: items.length,
    replyCaptures: items.filter((item) => item.captureKind === "read_only_visible_feed_capture").length,
    originalOrQuoteCaptures: items.filter((item) => item.captureKind === "read_only_visible_profile_capture").length,
    withParentChain: items.filter((item) => item.publicStatus.chain.length > 1).length,
    withQuotedContext: items.filter((item) => item.publicStatus.chain.some((entry) => entry.quoted)).length,
    decisionsPending: items.length,
  },
};

await fs.writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, summary: output.summary }, null, 2)}\n`);
