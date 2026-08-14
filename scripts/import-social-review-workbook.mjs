#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const approve = args.includes("--approve-for-freeze");
const positional = args.filter((arg) => arg !== "--approve-for-freeze");
const [packetPath, workbookPath, outputPath] = positional;
if (!packetPath || !workbookPath || !outputPath) {
  throw new Error("Usage: node scripts/import-social-review-workbook.mjs <packet.json> <review.md> <output.json> [--approve-for-freeze]");
}

const packet = JSON.parse(await readFile(packetPath, "utf8"));
const workbook = await readFile(workbookPath, "utf8");
const cases = Array.isArray(packet.cases) ? packet.cases : [];
const sourcePacket = cases.some((item) => item.evidenceSnapshot || item.provenance);
const categories = sourcePacket
  ? ["boardy-reply-reaction", "boardy-original-quote", "technical-link-media", "network-introduction", "sensitive-adversarial", "restraint"]
  : ["technical-link-media", "network-introduction", "sensitive-adversarial", "restraint"];
const errors = [];

const sections = new Map();
for (const chunk of workbook.split(/^## /m).slice(1)) {
  const newline = chunk.indexOf("\n");
  if (newline < 0) continue;
  const caseId = chunk.slice(0, newline).trim();
  if (caseId === "Cases" || caseId === "Reviewer instructions") continue;
  if (sections.has(caseId)) errors.push(`duplicate workbook section: ${caseId}`);
  sections.set(caseId, chunk.slice(newline + 1));
}

function lineValue(body, label, caseId) {
  const line = body.split("\n").find((item) => item.startsWith(`- ${label}:`));
  if (!line) {
    errors.push(`${caseId} missing ${label}`);
    return "";
  }
  return line.slice(`- ${label}:`.length).trim();
}

function checkboxValue(body, label, caseId, values) {
  const value = lineValue(body, label, caseId);
  const marked = values.filter((candidate) => new RegExp(`\\[x\\]\\s+${candidate}(?:\\s|$)`, "i").test(value));
  if (marked.length > 1) errors.push(`${caseId} has multiple ${label} decisions`);
  if (marked.length === 1) return marked[0];
  const bare = value.replace(/^\[[ xX]\]\s*/g, "").trim();
  if (values.includes(bare) && !bare.includes("|")) return bare;
  errors.push(`${caseId} has no selected ${label}`);
  return null;
}

function booleanValue(body, label, caseId) {
  const value = lineValue(body, label, caseId);
  const trueMarked = /\[x\]\s+true(?:\s|$)/i.test(value);
  const falseMarked = /\[x\]\s+false(?:\s|$)/i.test(value);
  if (trueMarked === falseMarked) {
    const bare = value.replace(/^\[[ xX]\]\s*/g, "").trim();
    if (bare === "true" || bare === "false") return bare === "true";
    errors.push(`${caseId} has no single boolean ${label} decision`);
    return null;
  }
  return trueMarked;
}

function freeText(body, label, caseId) {
  return lineValue(body, label, caseId) || null;
}

function validateDecision(item, decision) {
  const caseId = item.caseId;
  const included = decision.includeInFrozenSet;
  if (included === true) {
    if (decision.completeAvailableThreadUnit !== true && decision.completeThreadUnit !== true) errors.push(`${caseId} is included without a complete thread unit`);
    if (!categories.includes(decision.category)) errors.push(`${caseId} is included with an invalid category`);
    if (!decision.threadUnit) errors.push(`${caseId} is included without a final thread unit`);
    if (decision.evidenceStatus !== "verified") errors.push(`${caseId} is included without verified evidence`);
    if (!["high", "medium"].includes(decision.confidence)) errors.push(`${caseId} is included without high/medium confidence`);
  } else if (included === false && !decision.exclusionReason) {
    errors.push(`${caseId} is excluded without an exclusion reason`);
  }
}

const reviewedCases = cases.map((item) => {
  const body = sections.get(item.caseId);
  if (!body) {
    errors.push(`${item.caseId} is missing from the workbook`);
    return item;
  }
  const complete = booleanValue(body, sourcePacket ? "Complete available thread unit" : "Complete thread unit", item.caseId);
  const include = booleanValue(body, "Include in frozen set", item.caseId);
  const decision = {
    ...(sourcePacket ? { completeAvailableThreadUnit: complete } : { completeThreadUnit: complete }),
    includeInFrozenSet: include,
    category: checkboxValue(body, "Primary category", item.caseId, categories),
    evidenceStatus: checkboxValue(body, "Evidence status", item.caseId, ["verified", "partial", "insufficient"]),
    confidence: checkboxValue(body, "Confidence", item.caseId, ["high", "medium", "low"]),
    threadUnit: freeText(body, "Final thread unit", item.caseId),
    reviewerNote: freeText(body, "Reviewer note", item.caseId),
    exclusionReason: freeText(body, "Exclusion reason, if any", item.caseId),
  };
  validateDecision(item, decision);
  return { ...item, reviewDecision: decision };
});

const included = reviewedCases.filter((item) => item.reviewDecision?.includeInFrozenSet === true);
const includedByCategory = Object.fromEntries(categories.map((category) => [category, included.filter((item) => item.reviewDecision.category === category).length]));
const targets = sourcePacket
  ? { "boardy-reply-reaction": 50, "boardy-original-quote": 20 }
  : { "technical-link-media": 15, "network-introduction": 15, "sensitive-adversarial": 10, restraint: 20 };
if (approve) {
  if (reviewedCases.some((item) => item.reviewDecision?.includeInFrozenSet === null || item.reviewDecision?.includeInFrozenSet === undefined)) errors.push("cannot approve while any case is pending");
  for (const [category, target] of Object.entries(targets)) {
    if ((includedByCategory[category] ?? 0) < target) errors.push(`cannot approve: ${category} is ${includedByCategory[category] ?? 0}/${target}`);
  }
}

if (errors.length > 0) {
  const detail = { status: "rejected", errors, cases: cases.length, workbookCases: sections.size };
  process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`);
  process.exitCode = 1;
} else {
  const output = {
    ...packet,
    status: approve ? "approved-for-freeze" : "reviewed-pending-approval",
    reviewImportedFrom: workbookPath,
    cases: reviewedCases,
    summary: {
      ...(packet.summary ?? {}),
      included: included.length,
      pending: reviewedCases.filter((item) => item.reviewDecision.includeInFrozenSet === null || item.reviewDecision.includeInFrozenSet === undefined).length,
      includedByCategory,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: output.status, outputPath, cases: cases.length, included: included.length, includedByCategory }, null, 2)}\n`);
}
