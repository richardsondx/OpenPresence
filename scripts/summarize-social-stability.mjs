#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const semanticPath = process.argv[2];
const rawPath = process.argv[3];
const outputPath = process.argv[4];
if (!semanticPath || !rawPath) throw new Error("Usage: node scripts/summarize-social-stability.mjs <semantic.json> <run.json> [output.json]");

const semantic = JSON.parse(await readFile(semanticPath, "utf8"));
const raw = JSON.parse(await readFile(rawPath, "utf8"));
const judged = semantic.semanticEvaluation?.result?.cases ?? [];
const runs = Array.isArray(raw.runs) ? raw.runs.map((item) => item.output).filter(Boolean) : [raw];
const runCount = runs.length;
const perRun = [];
const packets = [];

for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
  const injections = (runs[runIndex].steps ?? []).filter((step) => step.command === "inject" && step.observeOnly !== true);
  const runPackets = [];
  for (let sourceCase = 1; sourceCase <= injections.length; sourceCase += 1) {
    const result = injections[sourceCase - 1]?.result ?? {};
    const world = Array.isArray(result.world) ? result.world : [];
    const inbound = world.find((item) => !item.actorPresenceId && ["post", "reply", "quote", "mention"].includes(item.objectType));
    const intent = inbound ? (result.decisions ?? []).find((item) => item.target?.id === inbound.externalRef?.id) : undefined;
    runPackets.push({
      run: runIndex + 1,
      sourceCase,
      action: intent?.affordance ?? "no_op_or_unavailable",
      textEmitted: Boolean(intent?.publication?.text),
      actor: inbound?.author?.displayName ?? null,
      input: inbound?.content?.text ?? null,
    });
  }
  perRun.push({
    run: runIndex + 1,
    actionDistribution: Object.fromEntries(Object.entries(Object.groupBy(runPackets, (item) => item.action)).map(([action, values]) => [action, values.length])),
    packets: runPackets.length,
  });
  packets.push(...runPackets);
}

const judgedBySource = new Map();
for (const [index, score] of judged.entries()) {
  const packet = packets[index];
  const run = packet?.run ?? 1;
  const sourceCase = packet?.sourceCase ?? index + 1;
  const caseResult = semantic.caseResults?.[index];
  const entry = judgedBySource.get(sourceCase) ?? { sourceCase, category: caseResult?.category ?? "unclassified", actor: packet?.actor ?? null, input: packet?.input ?? null, runs: [] };
  entry.runs.push({ run, act: score.actAppropriateness, wording: score.wordingQuality, layer: score.earliestFailureLayer, rationale: score.rationale });
  judgedBySource.set(sourceCase, entry);
}

const cases = [...judgedBySource.values()].map((entry) => {
  const act = entry.runs.map((item) => item.act);
  const wording = entry.runs.map((item) => item.wording).filter((item) => item !== null && item !== undefined);
  const pass = (value) => value.every((item) => item === 2);
  const actPassAll = pass(act);
  const actFailAll = act.every((item) => item < 2);
  const wordingPassAll = wording.length === 0 || pass(wording);
  const wordingFailAll = wording.length > 0 && wording.every((item) => item < 2);
  return {
    sourceCase: entry.sourceCase,
    category: entry.category,
    actor: entry.actor,
    actPassAll,
    actFailAll,
    actUnstable: !actPassAll && !actFailAll,
    wordingPassAll,
    wordingFailAll,
    wordingUnstable: wording.length > 0 && !wordingPassAll && !wordingFailAll,
    runs: entry.runs,
  };
});

const report = {
  reportVersion: "social-capability-stability.v1",
  source: semantic.source,
  packets: judged.length,
  repeatedRuns: runCount,
  semanticEvaluator: semantic.semanticEvaluator,
  aggregate: semantic.aggregates,
  perRun,
  stability: {
    uniqueSourceCases: cases.length,
    actPassAllRuns: cases.filter((item) => item.actPassAll).length,
    actUnstable: cases.filter((item) => item.actUnstable).length,
    actFailAllRuns: cases.filter((item) => item.actFailAll).length,
    wordingPassAllRuns: cases.filter((item) => item.wordingPassAll).length,
    wordingUnstable: cases.filter((item) => item.wordingUnstable).length,
    wordingFailAllRuns: cases.filter((item) => item.wordingFailAll).length,
    byCategory: Object.fromEntries(Object.entries(Object.groupBy(cases, (item) => item.category ?? "unclassified")).map(([category, values]) => [category, {
      cases: values.length,
      actPassAllRuns: values.filter((item) => item.actPassAll).length,
      actUnstable: values.filter((item) => item.actUnstable).length,
      actFailAllRuns: values.filter((item) => item.actFailAll).length,
      wordingPassAllRuns: values.filter((item) => item.wordingPassAll).length,
      wordingUnstable: values.filter((item) => item.wordingUnstable).length,
      wordingFailAllRuns: values.filter((item) => item.wordingFailAll).length,
    }])) ,
  },
  cases,
};
if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
