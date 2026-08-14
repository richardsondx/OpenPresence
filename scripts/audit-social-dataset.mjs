#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const targets = {
  boardyReplies: 50,
  boardyOriginalOrQuote: 20,
  technicalLinkMedia: 15,
  networkIntroduction: 15,
  sensitiveAdversarial: 10,
  independentRestraint: 20,
  total: 130,
};

async function load(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function loadOptional(relativePath) {
  try { return await load(relativePath); } catch { return null; }
}

function injectCount(scenario) {
  return (scenario.steps ?? []).filter((step) => step.command === "inject").length;
}

function fieldPresence(value) {
  return value !== undefined && value !== null && value !== "";
}

function sourceCaseAudit(item, kind) {
  const sourceUrl = item.sourceUrl ?? item.url;
  const observedText = item.sourceObservedText ?? item.text;
  const actor = item.actor ?? (item.sourceObservedText ? {
    displayName: item.sourceObservedText.split("\n")[0] ?? null,
    handle: item.sourceObservedText.split("\n")[1] ?? null,
  } : null);
  const observedAction = item.observedBoardyAction ?? null;
  const observedReply = item.observedBoardyResponse ?? item.observedBoardyReplyUrl ?? item.observedBoardyReplyText ?? null;
  return {
    caseId: item.caseId ?? null,
    kind,
    threadUnit: item.threadUnit ?? null,
    confidence: item.confidence ?? "unrated",
    provenance: {
      sourceUrl: fieldPresence(sourceUrl),
      captureTimestamp: fieldPresence(item.capturedAt ?? item.observedAt),
      actor: fieldPresence(actor?.displayName) && fieldPresence(actor?.handle),
      inboundObject: fieldPresence(observedText),
      observedBoardyAction: fieldPresence(observedAction),
      observedBoardyResponse: fieldPresence(observedReply),
      relationshipContext: fieldPresence(item.relationshipHistory),
      knownUnknownBoundary: Array.isArray(item.unknown) || fieldPresence(item.privateOutcome) || fieldPresence(item.known),
    },
    sourceUrlValue: sourceUrl ?? null,
  };
}

const [sourceCapture, originalCapture, development, restraint, fresh, holdout, holdout60, longitudinalOne, longitudinalTwo, longitudinalThree, partitionCandidate, provenanceEnrichment, provenanceReviewPacket, threadUnitAnalysis, threadReplayInventory, additionalThreadLeads, sourcePoolCandidate, sourcePoolReviewPacket, sourcePoolReviewValidation, strataCoverage, independentReviewPacket, independentReviewValidation, frozenManifest, frozenValidation] = await Promise.all([
  load("qa-learnings/boardy-source-capture-2026-08-13.json"),
  load("qa-learnings/boardy-original-capture-2026-08-13.json"),
  load("qa-learnings/boardy-development-manifest-2026-08-13.json"),
  load("scenarios/restraint-development-20.json"),
  Promise.all([1, 2, 3].map((id) => load(`scenarios/fresh-social-capability-${id}.json`))),
  load("scenarios/social-capability-holdout-20.json"),
  load("scenarios/social-capability-holdout-60.json"),
  load("scenarios/social-capability-longitudinal-1.json"),
  load("scenarios/social-capability-longitudinal-2.json"),
  load("scenarios/social-capability-longitudinal-3.json"),
  loadOptional("qa-learnings/social-capability-partition-candidate-v1.json"),
  loadOptional("qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json"),
  loadOptional("qa-learnings/boardy-provenance-review-packet-v1.json"),
  loadOptional("qa-learnings/boardy-thread-unit-analysis-v1.json"),
  loadOptional("qa-learnings/boardy-thread-replay-inventory-v1.json"),
  loadOptional("qa-learnings/boardy-additional-thread-leads-2026-08-13.json"),
  loadOptional("qa-learnings/social-capability-source-pool-candidate-v1.json"),
  loadOptional("qa-learnings/social-capability-source-pool-review-packet-v1.json"),
  loadOptional("qa-learnings/social-capability-source-pool-review-validation-latest.json"),
  loadOptional("qa-learnings/social-capability-strata-coverage-latest.json"),
  loadOptional("qa-learnings/social-capability-independent-review-packet-v1.json"),
  loadOptional("qa-learnings/social-capability-independent-review-validation-latest.json"),
  loadOptional("qa-learnings/social-capability-frozen-manifest.json"),
  loadOptional("qa-learnings/social-capability-freeze-validation-latest.json"),
]);

const sourceCases = sourceCapture.cases.map((item) => sourceCaseAudit(item, "boardy-reply-development"));
const originalCases = originalCapture.cases.map((item) => sourceCaseAudit(item, "boardy-original-or-quote-development"));
const devCases = development.cases.map((item) => sourceCaseAudit(item, "boardy-curated-development"));
const sourceIds = [...sourceCases, ...originalCases, ...devCases].map((item) => item.caseId).filter(Boolean);
const sourceUrls = [...sourceCases, ...originalCases].map((item) => item.sourceUrlValue);
const threadUnits = devCases.map((item) => item.threadUnit).filter(Boolean);

const inventory = {
  boardyReplySourceCapture: sourceCapture.cases.length,
  boardyOriginalOrQuoteSourceCapture: originalCapture.cases.length,
  boardyCuratedDevelopment: development.cases.length,
  restraintDevelopment: injectCount(restraint),
  freshGeneralization: fresh.map(injectCount),
  freshGeneralizationTotal: fresh.reduce((sum, scenario) => sum + injectCount(scenario), 0),
  hiddenOrOperationalHoldout: injectCount(holdout),
  sealedParaphrasedHoldout: injectCount(holdout60),
  longitudinalWorlds: [injectCount(longitudinalOne), injectCount(longitudinalTwo), injectCount(longitudinalThree)],
};

const duplicate = (values) => [...new Set(values.filter(Boolean).filter((value, index, all) => all.indexOf(value) !== index))];
const provenanceMissing = [...sourceCases, ...originalCases].filter((item) => Object.values(item.provenance).some((value) => !value)).map((item) => item.caseId);

const report = {
  reportVersion: "social-capability-dataset-audit.v1",
  auditedAt: new Date().toISOString(),
  methodology: "qa-learnings/social-capability-evaluation-v2.md",
  target: targets,
  inventory,
  observedEvaluationArtifacts: Object.fromEntries(await Promise.all([
    ["boardyReplayGptLowFinal3", "qa-learnings/boardy-capture-gpt-luna-low-final3-2026-08-13-semantic-gpt56.json"],
    ["boardyReplayGptLowPostGuidance", "qa-learnings/boardy-capture-gpt-luna-low-postguidance-2026-08-13-semantic-gpt56.json"],
    ["boardyReplayGlm52Final", "qa-learnings/boardy-capture-glm52-final-2026-08-13-semantic-gpt56.json"],
    ["restraintGptLowFinal3", "qa-learnings/restraint-gpt-luna-low-final3-2026-08-13-semantic-gpt56.json"],
    ["sealedHoldout60GptLow", "qa-learnings/holdout-60-gpt-luna-low-final-2026-08-13-semantic-gpt56.json"],
    ["longitudinal3GptLow", "qa-learnings/longitudinal-3-gpt-luna-low-final-2026-08-13-semantic-gpt56.json"],
    ["fresh1GptLowFinal2", "qa-learnings/fresh-social-capability-1-gpt-luna-low-final2-2026-08-13-semantic-gpt56.json"],
    ["fresh2GptLowFinal2", "qa-learnings/fresh-social-capability-2-gpt-luna-low-final2-2026-08-13-semantic-gpt56.json"],
    ["fresh3GptLowFinal2", "qa-learnings/fresh-social-capability-3-gpt-luna-low-final2-2026-08-13-semantic-gpt56.json"],
    ["plannerGeneralizationGptLow", "qa-learnings/planner-generalization-gpt-luna-low-2026-08-13-semantic-gpt56.json"],
    ["clarificationToneGptLow", "qa-learnings/clarification-tone-gpt-luna-low-2026-08-13-semantic-gpt56.json"],
    ["boardyReplayGptLowClarificationRegression", "qa-learnings/boardy-capture-gpt-luna-low-clarification-regression-2026-08-13-semantic-gpt56.json"],
    ["restraintGptLowClarificationRegression", "qa-learnings/restraint-gpt-luna-low-clarification-regression-2026-08-13-semantic-gpt56.json"],
  ].map(async ([label, path]) => {
    const result = await loadOptional(path);
    return [label, result ? { aggregates: result.aggregates, structuralChecks: result.structuralChecks, semanticEvaluator: result.semanticEvaluator } : null];
  }))),
  sourceDerivedAudit: {
    sourceCaseCount: sourceCases.length,
    originalOrQuoteCaseCount: originalCases.length,
    curatedDevelopmentCaseCount: devCases.length,
    sourceCaseIdsUnique: duplicate(sourceIds).length === 0,
    sourceUrlsUniqueWithinCapture: duplicate(sourceUrls).length === 0,
    threadUnitCoverageInCuratedManifest: threadUnits.length,
    missingProvenanceFields: provenanceMissing,
    finalFrozenSetPresent: false,
    finalFrozenSetReason: "Current source captures are explicitly development-only and the 48-case capture lacks threadUnit fields; promoting them would violate the provenance and thread-split requirements.",
  },
  partitionCandidate: partitionCandidate ? {
    status: partitionCandidate.status,
    counts: Object.fromEntries(Object.entries(partitionCandidate.partitions ?? {}).map(([name, items]) => [name, Array.isArray(items) ? items.length : 0])),
    excludedBoardySourceCaseCount: partitionCandidate.excludedBoardySourceCases?.length ?? null,
  } : null,
  provenanceEnrichmentCandidate: provenanceEnrichment ? {
    status: provenanceEnrichment.status,
    inputCases: provenanceEnrichment.summary?.inputCases ?? null,
    enrichedCases: provenanceEnrichment.summary?.enrichedCases ?? null,
    casesWithParentChain: provenanceEnrichment.summary?.casesWithParentChain ?? null,
    casesWithQuotedContext: provenanceEnrichment.summary?.casesWithQuotedContext ?? null,
    uniqueRetrievedThreadRoots: new Set((provenanceEnrichment.cases ?? [])
      .filter((item) => item.provenance?.sourceType === "read_only_visible_feed_capture")
      .filter((item) => (item.provenance?.publicStatus?.chain?.length ?? 0) > 1)
      .map((item) => item.provenance?.publicStatus?.chain?.at(-1)?.id)
      .filter(Boolean)).size,
    enrichmentErrors: provenanceEnrichment.summary?.enrichmentErrors ?? null,
    privateOrRelationshipOutcomesStillUnknown: provenanceEnrichment.summary?.stillUnknownPrivateOrRelationshipOutcomes ?? true,
  } : null,
  provenanceReviewPacket: provenanceReviewPacket ? {
    status: provenanceReviewPacket.status,
    cases: provenanceReviewPacket.summary?.cases ?? null,
    decisionsPending: provenanceReviewPacket.summary?.decisionsPending ?? null,
  } : null,
  threadUnitAnalysis: threadUnitAnalysis ? {
    replyCapturedCases: threadUnitAnalysis.reply?.capturedCases ?? null,
    replyUniqueRetrievedThreadRoots: threadUnitAnalysis.reply?.uniqueRetrievedThreadRoots ?? null,
    curatedNewUnitsNotAlreadyInCapture: threadUnitAnalysis.reply?.curatedNewUnitsNotAlreadyInCapture ?? null,
    potentialReplyUnitUnionBeforeManualDeduplication: threadUnitAnalysis.reply?.potentialUnionUnitsBeforeManualDeduplication ?? null,
    additionalReplyUnitsNeeded: threadUnitAnalysis.reply?.additionalUnitsAfterAddingCuratedCases ?? null,
    visibleLeadDistinctRoots: threadUnitAnalysis.reply?.visibleLeadDistinctRoots ?? null,
    visibleLeadRootsNotAlreadyInCapture: threadUnitAnalysis.reply?.visibleLeadRootsNotAlreadyInCapture ?? null,
    potentialReplyUnitUnionIncludingVisibleLeads: threadUnitAnalysis.reply?.potentialUnionIncludingVisibleLeadsBeforeManualDeduplication ?? null,
    additionalReplyUnitsNeededAfterVisibleLeads: threadUnitAnalysis.reply?.additionalUnitsAfterAddingCuratedCasesAndVisibleLeads ?? null,
    originalOrQuoteUniqueRoots: threadUnitAnalysis.originalOrQuote?.uniqueRetrievedThreadRoots ?? null,
  } : null,
  threadReplayFixture: threadReplayInventory ? {
    status: threadReplayInventory.status,
    scenario: threadReplayInventory.scenario,
    summary: threadReplayInventory.summary,
  } : null,
  additionalThreadLeads: additionalThreadLeads ? {
    status: additionalThreadLeads.status,
    candidateCases: additionalThreadLeads.summary?.candidateCases ?? null,
    candidateDistinctRoots: additionalThreadLeads.summary?.candidateDistinctRoots ?? null,
    currentlyCountedAsFrozen: additionalThreadLeads.summary?.currentlyCountedAsFrozen ?? 0,
  } : null,
  sourcePoolCandidate: sourcePoolCandidate ? {
    status: sourcePoolCandidate.status,
    summary: sourcePoolCandidate.summary,
  } : null,
  sourcePoolReviewPacket: sourcePoolReviewPacket ? {
    status: sourcePoolReviewPacket.status,
    sourcePool: sourcePoolReviewPacket.sourcePool,
    summary: sourcePoolReviewPacket.summary,
  } : null,
  sourcePoolReviewValidation: sourcePoolReviewValidation ? {
    status: sourcePoolReviewValidation.status,
    counts: sourcePoolReviewValidation.counts,
    errorCount: sourcePoolReviewValidation.errors?.length ?? null,
  } : null,
  independentStrataCoverage: strataCoverage ? {
    status: strataCoverage.status,
    totalCandidateCases: strataCoverage.totalCandidateCases,
    totalIndependentThreadUnits: strataCoverage.totalIndependentThreadUnits,
    targetIndependentTotal: strataCoverage.targetIndependentTotal,
    additionalIndependentUnitsNeeded: strataCoverage.additionalIndependentUnitsNeeded,
    byCategory: Object.fromEntries(Object.entries(strataCoverage.byCategory ?? {}).map(([category, value]) => [category, {
      targetIndependentUnits: value.targetIndependentUnits,
      independentThreadUnits: value.independentThreadUnits,
      additionalIndependentUnitsNeeded: value.additionalIndependentUnitsNeeded,
    }])),
  } : null,
  independentReviewPacket: independentReviewPacket ? {
    status: independentReviewPacket.status,
    summary: independentReviewPacket.summary,
  } : null,
  independentReviewValidation: independentReviewValidation ? {
    status: independentReviewValidation.status,
    counts: independentReviewValidation.counts,
    errorCount: independentReviewValidation.errors?.length ?? null,
  } : null,
  frozenManifest: frozenManifest ? {
    status: frozenManifest.status,
    counts: Object.fromEntries(Object.entries(frozenManifest.partitions ?? {}).map(([name, items]) => [name, Array.isArray(items) ? items.length : 0])),
    promotionErrors: frozenManifest.promotionGate?.errors ?? [],
  } : null,
  frozenValidation: frozenValidation ? {
    status: frozenValidation.status,
    counts: frozenValidation.counts,
    errorCount: frozenValidation.errors?.length ?? null,
  } : null,
  releaseEvidence: {
    freshInteractionsAtLeast60: inventory.freshGeneralizationTotal >= 60,
    threeLongitudinalWorlds: inventory.longitudinalWorlds.length >= 3,
    holdoutAtLeast50: inventory.sealedParaphrasedHoldout >= 50,
    humanReviewPacketPresent: true,
    humanReviewComplete: false,
    independentSecondSemanticJudgePresent: false,
    macroCapabilityReportPresent: true,
    macroCapabilityReportComplete: false,
    sourceProvenanceReviewComplete: false,
    sourcePoolReviewPacketPresent: Boolean(sourcePoolReviewPacket),
    sourcePoolReviewReady: sourcePoolReviewValidation?.status === "ready",
    independentStrataTargetsMet: strataCoverage?.status === "targets-met",
    independentReviewPacketPresent: Boolean(independentReviewPacket),
    independentReviewComplete: independentReviewPacket?.status === "approved-for-freeze",
    independentReviewReady: independentReviewValidation?.status === "ready",
    finalFrozenManifestReady: frozenValidation?.status === "ready",
  },
  verdict: "PROMISING_BUT_NOT_YET_ESTABLISHED",
  missingForParity: [
    "Freeze a 130-case provenance-backed stratified set with complete thread/relationship units.",
    "Complete repeated runs for the frozen set and repeat the model comparison on that unchanged set.",
    "Complete blinded human review of at least 20% of final cases and measure judge agreement.",
    "Add a second independent semantic judge or document why one judge is sufficient.",
    "Report equal-weight macro capability scores and per-stratum floors.",
    "Complete provenance review decisions for source-derived cases before freezing partitions.",
    "Construct and review the remaining independent thread units for technical/media, network, sensitive, and restraint strata.",
    "Complete independent-strata review decisions before freezing the supplemental 60 cases.",
  ],
};

const outputPath = process.argv[2] ?? "qa-learnings/social-capability-dataset-audit-2026-08-13.json";
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
