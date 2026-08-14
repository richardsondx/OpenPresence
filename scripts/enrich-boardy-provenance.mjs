#!/usr/bin/env node

/**
 * Enrich development-only Boardy captures with public status metadata.
 *
 * This is provenance collection, not benchmark labeling: observed Boardy text
 * is preserved as evidence and is never converted into an expected response.
 * The output remains a candidate because public APIs cannot prove private
 * outcomes or complete relationship history.
 */

import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const outputPath = process.argv[2] ?? "qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json";
const maxParentDepth = 5;

async function load(relativePath) {
  return JSON.parse(await fs.readFile(new URL(relativePath, root), "utf8"));
}

function statusIdFromUrl(value) {
  return typeof value === "string" ? value.match(/\/status\/(\d+)/)?.[1] ?? null : null;
}

function compactTweet(tweet) {
  if (!tweet) return null;
  const quoted = tweet.quote ? {
    id: tweet.quote.id ?? null,
    url: tweet.quote.url ?? null,
    text: tweet.quote.text ?? null,
    author: tweet.quote.author ? { name: tweet.quote.author.name ?? null, screenName: tweet.quote.author.screen_name ?? null, id: tweet.quote.author.id ?? null } : null,
    createdAt: tweet.quote.created_at ?? null,
    media: tweet.quote.media ? { all: tweet.quote.media.all ?? [], external: tweet.quote.media.external ?? null } : null,
  } : null;
  return {
    id: tweet.id ?? null,
    url: tweet.url ?? null,
    text: tweet.text ?? null,
    author: tweet.author ? { name: tweet.author.name ?? null, screenName: tweet.author.screen_name ?? null, id: tweet.author.id ?? null } : null,
    createdAt: tweet.created_at ?? null,
    replyingTo: tweet.replying_to ?? null,
    replyingToStatus: tweet.replying_to_status ?? null,
    media: tweet.media ? { all: tweet.media.all ?? [], external: tweet.media.external ?? null } : null,
    twitterCard: tweet.twitter_card ? { title: tweet.twitter_card.title ?? null, description: tweet.twitter_card.description ?? null, image: tweet.twitter_card.image ?? null } : null,
    quoted,
  };
}

async function fetchStatus(id) {
  if (!id) return null;
  const response = await fetch(`https://api.fxtwitter.com/status/${id}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`status ${id}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.code !== 200 || !body.tweet) throw new Error(`status ${id}: ${body.message ?? "no tweet"}`);
  return body.tweet;
}

async function enrichStatus(id) {
  const errors = [];
  const chain = [];
  let currentId = id;
  for (let depth = 0; currentId && depth <= maxParentDepth; depth += 1) {
    try {
      const tweet = await fetchStatus(currentId);
      chain.push(compactTweet(tweet));
      currentId = tweet.replying_to_status ?? null;
    } catch (error) {
      errors.push(String(error));
      break;
    }
  }
  return { requestedId: id, chain, errors, depthLimitReached: chain.length > maxParentDepth };
}

async function enrichCase(item, kind, captureTimestamp) {
  const sourceUrl = item.sourceUrl ?? item.url;
  const sourceId = statusIdFromUrl(sourceUrl);
  const replyId = statusIdFromUrl(item.observedBoardyReplyUrl);
  const [source, observedBoardyReply] = await Promise.all([
    enrichStatus(sourceId),
    replyId ? enrichStatus(replyId) : Promise.resolve(null),
  ]);
  return {
    ...item,
    provenance: {
      sourceType: kind,
      sourceUrl: sourceUrl ?? null,
      sourceApiUrl: sourceId ? `https://api.fxtwitter.com/status/${sourceId}` : null,
      captureTimestamp: captureTimestamp ?? null,
      publicStatus: source,
      observedBoardyReply: observedBoardyReply ? {
        sourceUrl: item.observedBoardyReplyUrl ?? null,
        sourceApiUrl: replyId ? `https://api.fxtwitter.com/status/${replyId}` : null,
        publicStatus: observedBoardyReply,
      } : null,
      evidenceStatus: "partial-public-api",
      known: [
        "The public status metadata and available reply-parent chain were retrieved from the cited source endpoint.",
        "The observed Boardy text remains evidence only; it is not an expected OpenPresence answer.",
      ],
      reconstructed: [],
      unknown: [
        "Complete conversation history beyond the retrieved parent-chain depth.",
        "Private relationship state and private message/introduction outcomes.",
        "Whether an observed public action was preceded by private retrieval or consent not visible in the public record.",
      ],
    },
  };
}

const [sourceCapture, originalCapture] = await Promise.all([
  load("qa-learnings/boardy-source-capture-2026-08-13.json"),
  load("qa-learnings/boardy-original-capture-2026-08-13.json"),
]);

const inputs = [
  ...sourceCapture.cases.map((item) => ({ item, kind: "read_only_visible_feed_capture" })),
  ...originalCapture.cases.map((item) => ({ item, kind: "read_only_visible_profile_capture" })),
];
const enriched = [];
const errors = [];
const workerCount = 4;
let cursor = 0;
async function worker() {
  while (cursor < inputs.length) {
    const index = cursor;
    cursor += 1;
    const input = inputs[index];
    try {
      enriched[index] = await enrichCase(input.item, input.kind, sourceCapture.capturedAt ?? originalCapture.capturedAt);
    } catch (error) {
      errors.push({ caseId: input.item.caseId, error: String(error) });
      enriched[index] = { ...input.item, provenance: { sourceType: input.kind, evidenceStatus: "enrichment-failed", error: String(error) } };
    }
  }
}
await Promise.all(Array.from({ length: workerCount }, () => worker()));

const output = {
  manifestVersion: "boardy-provenance-enriched-candidate.v1",
  generatedAt: new Date().toISOString(),
  status: "development-candidate-not-frozen",
  sourceEndpoints: ["https://api.fxtwitter.com/status/:id"],
  policy: "Public metadata enriches provenance only. It does not establish expected social acts, wording, private outcomes, or complete relationships.",
  sourceProfile: sourceCapture.sourceProfileUrl,
  cases: enriched,
  summary: {
    inputCases: inputs.length,
    enrichedCases: enriched.filter((item) => item.provenance?.evidenceStatus === "partial-public-api").length,
    enrichmentErrors: errors.length,
    casesWithParentChain: enriched.filter((item) => (item.provenance?.publicStatus?.chain?.length ?? 0) > 1).length,
    casesWithQuotedContext: enriched.filter((item) => item.provenance?.publicStatus?.chain?.some((tweet) => tweet.quoted)).length,
    stillUnknownPrivateOrRelationshipOutcomes: true,
  },
  errors,
};

await fs.writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: output.status, summary: output.summary }, null, 2)}\n`);
