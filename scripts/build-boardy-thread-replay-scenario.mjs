#!/usr/bin/env node

/**
 * Build a development-only replay that preserves the public parent chain for
 * each captured source object. Historical objects are loaded observation-only;
 * only the captured target triggers the Agent. Observed Boardy behavior is
 * retained in the inventory for provenance, never as an expected answer.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json";
const scenarioPath = process.argv[3] ?? "scenarios/boardy-thread-replay-development.json";
const inventoryPath = process.argv[4] ?? "qa-learnings/boardy-thread-replay-inventory-v1.json";
const enriched = JSON.parse(await readFile(inputPath, "utf8"));

function authorParts(item) {
  const author = item?.author ?? {};
  const name = typeof author === "string" ? author : author.name ?? author.displayName ?? "Observed author";
  const handle = typeof author === "string" ? undefined : author.screenName ?? author.handle;
  return { name, handle: handle ? (handle.startsWith("@") ? handle : `@${handle}`) : undefined };
}

function cleanText(item) {
  return item?.text?.trim() || "[Public post contains no text; the source media or link is preserved as provenance.]";
}

function urlsIn(text) {
  return [...new Set((text.match(/https?:\/\/[^\s)]+/g) ?? []).map((value) => value.replace(/[.,!?]+$/, "")))];
}

function assetsFor(item) {
  const assets = [];
  for (const media of item?.media?.all ?? []) {
    const kind = media.type === "video" ? "video" : media.type === "gif" ? "gif" : "image";
    const sourceUrl = media.url ?? media.thumbnail_url;
    if (!sourceUrl) continue;
    assets.push({
      name: `public-${kind}-${media.id ?? assets.length + 1}`,
      kind,
      mimeType: media.format ? `${kind}/${media.format}` : undefined,
      sourceUrl,
    });
    if (assets.length >= 3) break;
  }
  for (const url of urlsIn(item?.text ?? "")) {
    if (assets.length >= 4 || assets.some((asset) => asset.sourceUrl === url)) continue;
    assets.push({ name: `public-link-${assets.length + 1}`, kind: "link", sourceUrl: url });
  }
  return assets;
}

function replayCase(item, index) {
  const chain = item.provenance?.publicStatus?.chain ?? [];
  const ordered = [...chain].reverse();
  const target = chain[0] ?? {};
  const threadRoot = chain.at(-1)?.id ?? target.id ?? item.caseId;
  const sourceType = item.provenance?.sourceType ?? "unknown";
  const steps = [{ command: "start", options: { source: "replay" } }];
  ordered.forEach((object, objectIndex) => {
    const author = authorParts(object);
    const options = {
      actor: author.name,
      ...(author.handle ? { handle: author.handle } : {}),
      action: "post",
      content: cleanText(object),
      ...(object.replyingToStatus ? { parent: `x.post:${object.replyingToStatus}` } : {}),
      ...(assetsFor(object).length ? { assets: assetsFor(object) } : {}),
      ...(objectIndex < ordered.length - 1 ? { observeOnly: true } : {}),
    };
    steps.push({ command: "inject", options });
  });
  return {
    caseId: item.caseId,
    sourceType,
    threadRoot,
    targetId: target.id ?? null,
    targetUrl: target.url ?? item.sourceUrl ?? null,
    chainLength: ordered.length,
    missingParentIds: ordered
      .map((object) => object.replyingToStatus)
      .filter(Boolean)
      .filter((parentId) => !ordered.some((object) => object.id === parentId)),
    quotedContextCount: ordered.filter((object) => object.quoted).length,
    mediaObjectCount: ordered.filter((object) => (object.media?.all ?? []).length > 0).length,
    linkObjectCount: ordered.filter((object) => urlsIn(object.text ?? "").length > 0).length,
    observedBoardyReplyUrl: item.observedBoardyReplyUrl ?? item.provenance?.observedBoardyReply?.sourceUrl ?? null,
    steps,
  };
}

const cases = enriched.cases.map(replayCase);
const steps = cases.flatMap((item) => item.steps);
const replaySteps = steps.filter((step) => step.command === "inject");
const targetSteps = replaySteps.filter((step) => step.options?.observeOnly !== true);
const observationSteps = replaySteps.filter((step) => step.options?.observeOnly === true);

await mkdir(new URL("../scenarios/", import.meta.url), { recursive: true });
await mkdir(new URL("../qa-learnings/", import.meta.url), { recursive: true });
await writeFile(new URL(`../${scenarioPath}`, import.meta.url), `${JSON.stringify({
  name: "Boardy public parent-chain replay, development only",
  sourceType: "development-derived-public-replay",
  manifest: inputPath,
  caseCount: cases.length,
  warning: "Public parent chains are reconstructed evidence. Relationship state, private outcomes, quoted-object bodies not in the chain, and unobserved actions remain unknown. Observed Boardy replies are provenance references, never expected wording or acts.",
  replayContract: {
    historicalEvents: "observe-only",
    targetEvents: "one final inject per captured source object",
    sessionIsolation: "a new Playground session starts for every captured source object",
    media: "source URLs are attached as provenance-backed assets; no binary is embedded",
  },
  steps,
  cases,
}, null, 2)}\n`);

const uniqueReplyRoots = new Set(cases.filter((item) => item.sourceType === "read_only_visible_feed_capture").map((item) => item.threadRoot));
const uniqueOriginalRoots = new Set(cases.filter((item) => item.sourceType === "read_only_visible_profile_capture").map((item) => item.threadRoot));
const inventory = {
  inventoryVersion: "boardy-thread-replay-inventory.v1",
  generatedAt: new Date().toISOString(),
  source: inputPath,
  scenario: scenarioPath,
  status: "development-fixture-not-frozen",
  policy: "Count independent social situations by thread root, not by replay target. Do not compare OpenPresence against the observed Boardy reply as an expected answer.",
  summary: {
    replayCases: cases.length,
    targetEvents: targetSteps.length,
    historicalObservationEvents: observationSteps.length,
    replyCaptureCases: cases.filter((item) => item.sourceType === "read_only_visible_feed_capture").length,
    uniqueReplyThreadRoots: uniqueReplyRoots.size,
    originalOrQuoteCases: cases.filter((item) => item.sourceType === "read_only_visible_profile_capture").length,
    uniqueOriginalOrQuoteRoots: uniqueOriginalRoots.size,
    casesWithReconstructedParentContext: cases.filter((item) => item.chainLength > 1).length,
    casesWithMissingParentObjects: cases.filter((item) => item.missingParentIds.length > 0).length,
    casesWithQuotedContextNotReplayedAsAnObject: cases.filter((item) => item.quotedContextCount > 0).length,
    casesWithMediaAssets: cases.filter((item) => item.mediaObjectCount > 0).length,
    casesWithLinkAssets: cases.filter((item) => item.linkObjectCount > 0).length,
  },
  cases: cases.map(({ steps: _steps, ...item }) => item),
};
await writeFile(new URL(`../${inventoryPath}`, import.meta.url), `${JSON.stringify(inventory, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  scenarioPath,
  inventoryPath,
  summary: inventory.summary,
}, null, 2)}\n`);
