#!/usr/bin/env node

/** Build a development replay from manually verified visible X lead pages. */

import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "qa-learnings/boardy-additional-thread-leads-2026-08-13.json";
const outputPath = process.argv[3] ?? "scenarios/boardy-additional-leads-development.json";
const source = JSON.parse(await readFile(inputPath, "utf8"));

function idFromUrl(url) {
  return url.match(/\/status\/(\d+)/)?.[1];
}

function actorFor(handle) {
  if (handle === "@boardyai") return { actor: "Boardy", handle };
  return { actor: handle ?? "Observed author", handle };
}

const cases = source.cases.map((item) => {
  const targetId = idFromUrl(item.sourceUrl);
  const targetIndex = item.publicContextVisible.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) throw new Error(`${item.candidateId} does not contain its source object in publicContextVisible.`);
  const context = item.publicContextVisible.slice(0, targetIndex);
  const steps = [{ command: "start", options: { source: "replay" } }];
  context.forEach((entry) => {
    const actor = actorFor(entry.author);
    steps.push({ command: "inject", options: { ...actor, action: "post", content: entry.text, observeOnly: true } });
  });
  const targetActor = actorFor(item.sourceActor.handle);
  steps.push({ command: "inject", options: { ...targetActor, actor: item.sourceActor.displayName, action: "post", content: item.sourceText } });
  return {
    candidateId: item.candidateId,
    targetId,
    threadRoot: item.threadRoot,
    sourceUrl: item.sourceUrl,
    observedBoardyReply: item.observedBoardyReply,
    steps,
  };
});

const steps = cases.flatMap((item) => item.steps);
const output = {
  name: "Boardy visible lead replay, development only",
  sourceType: "development-derived-visible-leads",
  manifest: inputPath,
  caseCount: cases.length,
  warning: "The visible page establishes public text and order only. Parent links, relationship state, private outcomes, and consent remain unknown unless separately enriched. Observed Boardy replies are metadata, not expected answers.",
  replayContract: {
    historicalEvents: "observe-only",
    targetEvents: "one final source event per lead",
    sessionIsolation: "a new Playground session starts for every lead",
    parentLinks: "not rehydrated because the visible lead packet does not prove every parent ID",
  },
  steps,
  cases,
};
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, caseCount: cases.length, steps: steps.length, historicalEvents: steps.filter((step) => step.options?.observeOnly).length, targetEvents: steps.filter((step) => step.command === "inject" && !step.options?.observeOnly).length }, null, 2)}\n`);
