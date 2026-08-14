#!/usr/bin/env node

import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [input, curated, visibleLeads] = await Promise.all([
  fs.readFile(new URL("qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json", root), "utf8").then(JSON.parse),
  fs.readFile(new URL("qa-learnings/boardy-development-manifest-2026-08-13.json", root), "utf8").then(JSON.parse),
  fs.readFile(new URL("qa-learnings/boardy-additional-thread-leads-2026-08-13.json", root), "utf8").then(JSON.parse),
]);
const outputPath = process.argv[2] ?? "qa-learnings/boardy-thread-unit-analysis-v1.json";

const sourceCases = input.cases.filter((item) => item.provenance?.sourceType === "read_only_visible_feed_capture");
const originalCases = input.cases.filter((item) => item.provenance?.sourceType === "read_only_visible_profile_capture");

function rootId(item) {
  const chain = item.provenance?.publicStatus?.chain ?? [];
  return chain.at(-1)?.id ?? item.provenance?.sourceApiUrl?.split("/").at(-1) ?? item.caseId;
}

function group(items) {
  const groups = new Map();
  for (const item of items) {
    const id = rootId(item);
    const list = groups.get(id) ?? [];
    list.push(item.caseId);
    groups.set(id, list);
  }
  return [...groups.entries()].map(([threadRoot, caseIds]) => ({ threadRoot, caseIds, count: caseIds.length }));
}

const replyUnits = group(sourceCases);
const originalUnits = group(originalCases);
const capturedSourceUrls = new Set(sourceCases.map((item) => item.provenance?.sourceUrl));
const curatedReplyCases = curated.cases.filter((item) => item.category?.includes("direct-engagement") || item.category?.includes("banter") || item.category?.includes("continuity") || item.category?.includes("network"));
const curatedNewCases = curatedReplyCases.filter((item) => !capturedSourceUrls.has(item.sourceUrl));
const repeatedReplyUnits = replyUnits.filter((item) => item.count > 1);
const leadRoots = [...new Set((visibleLeads.cases ?? []).map((item) => item.threadRoot).filter(Boolean))];
const nonOverlappingLeadRoots = leadRoots.filter((threadRoot) => !replyUnits.some((item) => item.threadRoot === threadRoot));
const uniqueReplyUnits = replyUnits.length;
const targetReplyUnits = 50;
const targetOriginalUnits = 20;

const output = {
  analysisVersion: "boardy-thread-unit-analysis.v1",
  generatedAt: new Date().toISOString(),
  source: "qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json",
  policy: "A retrieved public parent root is a candidate thread unit only. It does not prove relationship state, private outcomes, or that two apparently separate roots are unrelated.",
  reply: {
    capturedCases: sourceCases.length,
    uniqueRetrievedThreadRoots: uniqueReplyUnits,
    repeatedRoots: repeatedReplyUnits,
    targetIndependentUnits: targetReplyUnits,
    additionalDistinctUnitsNeeded: Math.max(0, targetReplyUnits - uniqueReplyUnits),
    curatedExplicitThreadUnits: curatedReplyCases.length,
    curatedNewUnitsNotAlreadyInCapture: curatedNewCases.length,
    potentialUnionUnitsBeforeManualDeduplication: uniqueReplyUnits + curatedNewCases.length,
    additionalUnitsAfterAddingCuratedCases: Math.max(0, targetReplyUnits - uniqueReplyUnits - curatedNewCases.length),
    visibleLeadDistinctRoots: leadRoots.length,
    visibleLeadRootsNotAlreadyInCapture: nonOverlappingLeadRoots.length,
    potentialUnionIncludingVisibleLeadsBeforeManualDeduplication: uniqueReplyUnits + curatedNewCases.length + nonOverlappingLeadRoots.length,
    additionalUnitsAfterAddingCuratedCasesAndVisibleLeads: Math.max(0, targetReplyUnits - uniqueReplyUnits - curatedNewCases.length - nonOverlappingLeadRoots.length),
    singletonsWithoutRetrievedParent: sourceCases.filter((item) => (item.provenance?.publicStatus?.chain?.length ?? 0) === 1).length,
    units: replyUnits,
  },
  originalOrQuote: {
    capturedCases: originalCases.length,
    uniqueRetrievedThreadRoots: originalUnits.length,
    targetIndependentUnits: targetOriginalUnits,
    additionalDistinctUnitsNeeded: Math.max(0, targetOriginalUnits - originalUnits.length),
    units: originalUnits,
  },
  conclusion: uniqueReplyUnits + curatedNewCases.length + nonOverlappingLeadRoots.length >= targetReplyUnits && originalUnits.length >= targetOriginalUnits
    ? "candidate-count-targets-met-but-enrichment-and-provenance-review-still-required"
    : "additional-distinct-thread-units-required",
};

await fs.writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, reply: output.reply, originalOrQuote: output.originalOrQuote, conclusion: output.conclusion }, null, 2)}\n`);
