#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/render-social-review-packet.mjs <packet.json> <review.md>");
}

const packet = JSON.parse(await readFile(inputPath, "utf8"));
const cases = Array.isArray(packet.cases) ? packet.cases : [];
const isSourcePacket = cases.some((item) => item.evidenceSnapshot || item.provenance);

function text(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\s+/g, " ").trim();
}

function cell(value) {
  return text(value).replaceAll("|", "\\|");
}

function list(values) {
  if (!Array.isArray(values) || values.length === 0) return "—";
  return values.map((value) => `- ${text(value)}`).join("\n");
}

function sourceCase(item) {
  const evidence = item.evidenceSnapshot ?? {};
  const observed = evidence.observedBoardy?.publicStatus?.chain?.[0]?.text;
  const chain = Array.isArray(evidence.publicStatus?.chain) ? evidence.publicStatus.chain : [];
  const author = evidence.targetAuthor ?? {};
  return [
    `## ${text(item.caseId)}`,
    "",
    `- Candidate partition: **${text(item.candidatePartition)}**`,
    `- Source type: ${text(item.sourceType)}`,
    `- Source: ${evidence.sourceUrl ? `[open source](${evidence.sourceUrl})` : "—"}`,
    `- API evidence: ${evidence.sourceApiUrl ? `[open source API](${evidence.sourceApiUrl})` : "—"}`,
    `- Capture time: ${text(evidence.captureTimestamp)}`,
    `- Current proposed thread unit: \`${text(item.currentThreadUnit)}\``,
    `- Available public chain objects: ${chain.length}`,
    `- Target author: ${text(author.name)} (${text(author.screenName)})`,
    "",
    "### Target object",
    "",
    `> ${text(evidence.targetText)}`,
    "",
    `- Media present: ${evidence.mediaPresent === true ? "yes" : "no"}`,
    `- Link card present: ${evidence.linkCardPresent === true ? "yes" : "no"}`,
    "",
    "### Observed Boardy provenance",
    "",
    "> This is provenance only. It is not an expected OpenPresence action or wording.",
    "",
    `> ${text(observed)}`,
    "",
    "### Evidence boundary",
    "",
    "Known:",
    list(evidence.known),
    "",
    "Unknown:",
    list(evidence.unknown),
    "",
    "### Reviewer decision — fill manually",
    "",
    "- Complete available thread unit: [ ] true  [ ] false",
    "- Include in frozen set: [ ] true  [ ] false",
    `- Primary category: ${text(packet.categoryVocabulary?.join(" | "))}`,
    "- Evidence status: [ ] verified  [ ] partial  [ ] insufficient",
    "- Confidence: [ ] high  [ ] medium  [ ] low",
    "- Final thread unit: ",
    "- Reviewer note: ",
    "- Exclusion reason, if any: ",
  ].join("\n");
}

function independentCase(item) {
  const sources = Array.isArray(item.sourceCases) ? item.sourceCases : [];
  const first = sources[0] ?? {};
  const content = sources.map((source) => `- **${text(source.actor)}** (${text(source.handle)}): ${text(source.content)}`).join("\n");
  return [
    `## ${text(item.caseId)}`,
    "",
    `- Source type: ${text(item.sourceType)}`,
    `- Proposed category: ${text(item.proposedCategory)}`,
    `- Proposed thread unit: \`${text(item.proposedThreadUnit)}\``,
    `- Scenario evidence: ${text(first.scenario)}`,
    "",
    "### Available situation",
    "",
    content || "—",
    "",
    "### Evidence boundary",
    "",
    "Known:",
    list(item.evidenceBoundary?.known),
    "",
    "Unknown:",
    list(item.evidenceBoundary?.unknown),
    "",
    "### Reviewer decision — fill manually",
    "",
    "- Complete thread unit: [ ] true  [ ] false",
    "- Include in frozen set: [ ] true  [ ] false",
    "- Primary category: technical-link-media | network-introduction | sensitive-adversarial | restraint",
    "- Evidence status: [ ] verified  [ ] partial  [ ] insufficient",
    "- Confidence: [ ] high  [ ] medium  [ ] low",
    "- Final thread unit: ",
    "- Reviewer note: ",
    "- Exclusion reason, if any: ",
  ].join("\n");
}

const title = isSourcePacket ? "Boardy Source Review Workbook" : "Independent Strata Review Workbook";
const instructions = Array.isArray(packet.reviewerInstructions) ? packet.reviewerInstructions : [];
const markdown = [
  `# ${title}`,
  "",
  `Generated from: \`${inputPath}\``,
  `Packet status: **${text(packet.status)}**`,
  "",
  "> This workbook is for provenance, thread-unit, category, and eligibility review only. It contains no expected action or expected wording.",
  "",
  "## Reviewer instructions",
  "",
  ...instructions.map((instruction) => `- ${instruction}`),
  "",
  "## Cases",
  "",
  ...cases.map((item) => (isSourcePacket ? sourceCase(item) : independentCase(item))),
  "",
].join("\n");

await writeFile(outputPath, markdown);
console.log(JSON.stringify({ outputPath, cases: cases.length, sourcePacket: isSourcePacket }, null, 2));
