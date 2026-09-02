#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dimensions = ["socialFit", "identityVoice", "naturalness", "judgment", "grounding", "constraints"];

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function trialResult(trial) {
  const grades = Array.isArray(trial.grades) ? trial.grades : [];
  if (!grades.length) return { graded: false, pass: false, overall: 0, scores: {}, requiredFailure: false, uncertain: false, disagreement: false };
  const scores = Object.fromEntries(dimensions.map((dimension) => [dimension, mean(grades.map((grade) => Number(grade.scores?.[dimension] ?? 0)))]));
  const overall = mean(Object.values(scores));
  const requiredFailure = grades.some((grade) => grade.requiredFailure === true);
  const uncertain = grades.some((grade) => grade.uncertain === true);
  const disagreement = dimensions.some((dimension) => {
    const values = grades.map((grade) => Number(grade.scores?.[dimension] ?? 0));
    return Math.max(...values) - Math.min(...values) >= 2;
  }) || grades.some((grade) => grade.requiredFailure === true) !== grades.every((grade) => grade.requiredFailure === true);
  return {
    graded: true,
    pass: !requiredFailure && overall >= 2.5 && scores.socialFit >= 2 && scores.naturalness >= 2,
    overall,
    scores,
    requiredFailure,
    uncertain,
    disagreement,
  };
}

function groupKey(trial) {
  return `${trial.variant}::${trial.caseId}::${trial.surface}`;
}

function summarize(rawDocuments) {
  const cases = new Map();
  const trials = [];
  for (const document of rawDocuments) {
    if (document.schema !== "conversation-prompt-eval-raw.v1") throw new Error(`Unsupported raw schema in run ${document.runId ?? "unknown"}.`);
    for (const item of document.cases ?? []) cases.set(item.id, item);
    for (const trial of document.trials ?? []) trials.push({ ...trial, sourceRunId: document.runId });
  }

  const grouped = new Map();
  for (const trial of trials) {
    const key = groupKey(trial);
    const bucket = grouped.get(key) ?? [];
    bucket.push({ trial, result: trialResult(trial) });
    grouped.set(key, bucket);
  }

  const groups = [...grouped.entries()].map(([key, entries]) => {
    const [variant, caseId, surface] = key.split("::");
    const graded = entries.filter((entry) => entry.result.graded);
    const passRate = graded.length ? graded.filter((entry) => entry.result.pass).length / graded.length : 0;
    const item = cases.get(caseId);
    const dimensionMeans = Object.fromEntries(dimensions.map((dimension) => [dimension, mean(graded.map((entry) => entry.result.scores[dimension]))]));
    return {
      variant,
      caseId,
      surface,
      required: item?.required === true,
      gradedTrials: graded.length,
      trialCount: entries.length,
      passRate,
      pass: graded.length > 0 && passRate >= 0.8 && !graded.some((entry) => entry.result.requiredFailure),
      requiredFailures: graded.filter((entry) => entry.result.requiredFailure).length,
      uncertainTrials: graded.filter((entry) => entry.result.uncertain).length,
      graderDisagreements: graded.filter((entry) => entry.result.disagreement).length,
      scores: dimensionMeans,
      representativeOutput: entries.find((entry) => !entry.result.pass)?.trial.output ?? entries[0]?.trial.output ?? "",
      graderReasons: entries.flatMap((entry) => (entry.trial.grades ?? []).map((grade) => grade.reason)).filter(Boolean).slice(0, 3),
    };
  }).sort((left, right) => left.variant.localeCompare(right.variant) || left.caseId.localeCompare(right.caseId) || left.surface.localeCompare(right.surface));

  const variants = [...new Set(groups.map((group) => group.variant))].map((variant) => {
    const variantGroups = groups.filter((group) => group.variant === variant);
    const requiredGroups = variantGroups.filter((group) => group.required);
    const graded = variantGroups.reduce((total, group) => total + group.gradedTrials, 0);
    return {
      variant,
      verdict: graded === 0 ? "UNGRADED" : requiredGroups.every((group) => group.pass) ? "PASS" : "NEEDS_WORK",
      requiredPassRate: requiredGroups.length ? requiredGroups.filter((group) => group.pass).length / requiredGroups.length : 0,
      requiredGroups: requiredGroups.length,
      failedRequiredGroups: requiredGroups.filter((group) => !group.pass).map((group) => `${group.caseId}/${group.surface}`),
      uncertainTrials: variantGroups.reduce((total, group) => total + group.uncertainTrials, 0),
      graderDisagreements: variantGroups.reduce((total, group) => total + group.graderDisagreements, 0),
    };
  });

  const baseline = variants.find((item) => item.variant === "A") ? "A" : variants[0]?.variant;
  const candidate = variants.find((item) => item.variant === "B") ? "B" : variants.length > 1 ? variants[1]?.variant : undefined;
  const comparisons = [];
  if (baseline && candidate) {
    for (const before of groups.filter((group) => group.variant === baseline)) {
      const after = groups.find((group) => group.variant === candidate && group.caseId === before.caseId && group.surface === before.surface);
      if (!after || !before.gradedTrials || !after.gradedTrials) continue;
      const passRateDelta = after.passRate - before.passRate;
      const identityDelta = after.scores.identityVoice - before.scores.identityVoice;
      comparisons.push({
        caseId: before.caseId,
        surface: before.surface,
        baseline,
        candidate,
        passRateDelta,
        identityDelta,
        regression: passRateDelta < -0.1 || after.requiredFailures > before.requiredFailures || identityDelta < -0.35,
        improvement: passRateDelta > 0.1 && after.requiredFailures <= before.requiredFailures && identityDelta >= -0.35,
      });
    }
  }

  return {
    schema: "conversation-prompt-eval-report.v1",
    generatedAt: new Date().toISOString(),
    sourceRuns: rawDocuments.map((document) => ({ runId: document.runId, provider: document.provider, grader: document.grader })),
    variants,
    groups,
    comparisons,
    decision: {
      candidate,
      status: candidate ? comparisons.some((item) => item.regression) ? "REGRESSION" : variants.find((item) => item.variant === candidate)?.verdict === "PASS" ? "HUMAN_REVIEW_REQUIRED" : "NEEDS_WORK" : "BASELINE_ONLY",
      note: candidate ? "A candidate is never applied from scores alone. Review representative outputs and grader disagreements before changing prompts." : "Run a candidate variant against the same cases, models, settings, and trial count before proposing a prompt change.",
    },
  };
}

function markdown(report) {
  const lines = [
    "# Agent prompt evaluation",
    "",
    `**Decision:** ${report.decision.status}`,
    "",
    "| Variant | Verdict | Required surface pass rate | Uncertain trials | Grader disagreements |",
    "|---|---|---:|---:|---:|",
    ...report.variants.map((variant) => `| ${variant.variant} | ${variant.verdict} | ${percent(variant.requiredPassRate)} | ${variant.uncertainTrials} | ${variant.graderDisagreements} |`),
    "",
  ];

  const failures = report.groups.filter((group) => group.required && !group.pass);
  if (failures.length) {
    lines.push("## Required failures", "");
    for (const failure of failures.slice(0, 8)) {
      lines.push(`### ${failure.caseId} · ${failure.surface} · ${failure.variant}`, "", `Pass rate: ${percent(failure.passRate)} (${failure.gradedTrials}/${failure.trialCount} graded).`, "");
      if (failure.representativeOutput) lines.push(`> ${String(failure.representativeOutput).replace(/\n+/g, "\n> ")}`, "");
      if (failure.graderReasons[0]) lines.push(`Reviewer evidence: ${failure.graderReasons[0]}`, "");
    }
  }

  if (report.comparisons.length) {
    lines.push("## A/B comparison", "", "| Case / surface | Pass-rate change | Identity change | Result |", "|---|---:|---:|---|");
    for (const item of report.comparisons) {
      const label = item.regression ? "regression" : item.improvement ? "improvement" : "no clear change";
      lines.push(`| ${item.caseId} / ${item.surface} | ${item.passRateDelta >= 0 ? "+" : ""}${Math.round(item.passRateDelta * 100)} pp | ${item.identityDelta >= 0 ? "+" : ""}${item.identityDelta.toFixed(2)} | ${label} |`);
    }
    lines.push("");
  }

  lines.push("## Next action", "", report.decision.note, "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const inputs = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (!inputs.length) throw new Error("Usage: node scripts/summarize-conversation-eval.mjs <run.raw.json> [candidate.raw.json]");
  const documents = await Promise.all(inputs.map(async (input) => JSON.parse(await readFile(path.resolve(input), "utf8"))));
  const report = summarize(documents);
  const base = inputs.length === 1 ? inputs[0].replace(/\.raw\.json$/, "") : path.join(path.dirname(inputs[inputs.length - 1]), `${documents[0].runId}-vs-${documents[documents.length - 1].runId}`);
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, markdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
