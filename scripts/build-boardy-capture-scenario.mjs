#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "qa-learnings/boardy-source-capture-2026-08-13.json";
const outputPath = process.argv[3] ?? "scenarios/boardy-capture-development-48.json";
const manifest = JSON.parse(await readFile(inputPath, "utf8"));

const steps = [
  { command: "start", options: { source: "scenario" } },
  ...manifest.cases.map((item) => ({
    command: "inject",
    options: {
      actor: item.sourceObservedText.split("\n")[0] || "Observed author",
      handle: item.sourceObservedText.split("\n")[1] || "@unknown",
      action: "post",
      content: item.sourceObservedText,
    },
  })),
  { command: "timeline" },
];

await writeFile(outputPath, `${JSON.stringify({
  name: "Boardy visible-feed capture, development only",
  sourceType: "development-derived",
  manifest: inputPath,
  warning: "Observed Boardy replies are provenance context, not expected wording. Visible posts may be truncated or lack parent history.",
  steps,
}, null, 2)}\n`);
console.log(`Wrote ${outputPath} with ${manifest.cases.length} injections.`);
