#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: summarize-conversation-eval.mjs --input raw-eval.json --markdown report.md --json report.json");
  process.exit(2);
}

function arg(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function gradePass(grades) {
  if (!grades.length) return { pass: false, uncertain: true, score: 0 };
  const scores = ["socialFit", "identityVoice", "naturalness", "judgment", "grounding", "constraints"];
  const score = mean(grades.flatMap((grade) => scores.map((key) => Number(grade.scores?.[key] ?? 0))));
  const socialFit = mean(grades.map((grade) => Number(grade.scores?.socialFit ?? 0)));
  const naturalness = mean(grades.map((grade) => Number(grade.scores?.naturalness ?? 0)));
  const requiredFailure = grades.some((grade) => grade.requiredFailure === true);
  const decisions = grades.map((grade) => grade.requiredFailure === true ? "fail" : grade.uncertain === true ? "uncertain" : score >= 2.5 && Number(grade.scores?.socialFit ?? 0) >= 2 && Number(grade.scores?.naturalness ?? 0) >= 2 ? "pass" : "fail");
  const disagreement = new Set(decisions).size > 1;
  const uncertain = grades.some((grade) => grade.uncertain === true) || disagreement;
  return { pass: !requiredFailure && !uncertain && score >= 2.5 && socialFit >= 2 && naturalness >= 2, uncertain, disagreement, requiredFailure, score, socialFit, naturalness };
}

function summarize(input) {
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const cases = Array.isArray(input.cases) ? input.cases : [];
  const grouped = new Map();
  for (const trial of trials) {
    const key = `${trial.variant ?? "A"}:${trial.caseId}:${trial.surface ?? "unknown"}`;
    const item = grouped.get(key) ?? { variant: trial.variant ?? "A", caseId: trial.caseId, surface: trial.surface, trials: [] };
    item.trials.push(trial);
    grouped.set(key, item);
  }
  const caseSummaries = [...grouped.values()].map((item) => {
    const outcomes = item.trials.map((trial) => ({ trial: trial.trial, output: trial.output ?? "", result: gradePass(trial.grades ?? []) }));
    const passRate = outcomes.length ? outcomes.filter((outcome) => outcome.result.pass).length / outcomes.length : 0;
    return { ...item, passRate, passCount: outcomes.filter((outcome) => outcome.result.pass).length, outcomes, meanScore: mean(outcomes.map((outcome) => outcome.result.score)), uncertainCount: outcomes.filter((outcome) => outcome.result.uncertain).length, disagreementCount: outcomes.filter((outcome) => outcome.result.disagreement).length, requiredFailureCount: outcomes.filter((outcome) => outcome.result.requiredFailure).length };
  });
  const requiredIds = new Set(cases.filter((item) => item.required !== false).map((item) => item.id));
  const required = caseSummaries.filter((item) => requiredIds.has(item.caseId));
  const variantSummaries = [...new Set(caseSummaries.map((item) => item.variant))].map((variant) => {
    const selected = caseSummaries.filter((item) => item.variant === variant);
    const requiredSelected = selected.filter((item) => requiredIds.has(item.caseId));
    return { variant, passRate: mean(requiredSelected.map((item) => item.passRate)), cases: selected.length, requiredCases: requiredSelected.length, regressions: [...new Set(requiredSelected.filter((item) => item.passRate < 0.8 || item.requiredFailureCount > 0).map((item) => item.caseId))] };
  });
  const a = variantSummaries.find((item) => item.variant === "A");
  const b = variantSummaries.find((item) => item.variant === "B");
  const regressions = b && a ? required.filter((item) => item.variant === "B").filter((item) => item.passRate < 0.8 || item.requiredFailureCount > 0 || item.passRate < (caseSummaries.find((candidate) => candidate.variant === "A" && candidate.caseId === item.caseId && candidate.surface === item.surface)?.passRate ?? 1) - 0.1).map((item) => item.caseId) : [];
  const failures = required.filter((item) => item.passRate < 0.8 || item.requiredFailureCount > 0 || item.uncertainCount > 0).map((item) => ({ caseId: item.caseId, variant: item.variant, surface: item.surface, passRate: item.passRate, uncertainCount: item.uncertainCount, disagreementCount: item.disagreementCount, requiredFailureCount: item.requiredFailureCount, examples: item.outcomes.filter((outcome) => !outcome.result.pass || outcome.result.uncertain).slice(0, 2) }));
  const verdict = regressions.length ? "REGRESSION" : required.some((item) => item.passRate < 0.8) ? "NEEDS WORK" : required.length ? "PASS" : "INSUFFICIENT EVIDENCE";
  return {
    schema: "conversation-prompt-eval-report.v1",
    runId: input.runId ?? null,
    verdict,
    confidence: trials.length >= cases.length * 5 ? "medium" : "low",
    variantSummaries,
    regressions,
    failures,
    caseSummaries,
    cases,
    trials,
    ablations: input.ablations ?? [],
    decision: input.decision ?? null,
    source: input.source ?? null,
  };
}

function markdown(report) {
  const lines = [`# Conversation prompt evaluation`, "", `**Verdict:** ${report.verdict}`, `**Confidence:** ${report.confidence}`, ""];
  if (report.variantSummaries.length) {
    lines.push("## Results", "", "| Variant | Required pass rate | Required cases | Regressions |", "|---|---:|---:|---|", ...report.variantSummaries.map((item) => `| ${item.variant} | ${(item.passRate * 100).toFixed(0)}% | ${item.requiredCases} | ${item.regressions.join(", ") || "None"} |`), "");
  }
  lines.push("## Review items", "");
  if (!report.failures.length) lines.push("No failed or uncertain required cases were recorded.");
  for (const failure of report.failures) {
    lines.push(`### ${failure.caseId} · ${failure.variant} · ${failure.surface}`, "", `Pass rate: ${(failure.passRate * 100).toFixed(0)}%. Uncertain trials: ${failure.uncertainCount}. Grader disagreements: ${failure.disagreementCount}. Required failures: ${failure.requiredFailureCount}.`, "");
    for (const example of failure.examples) lines.push(`- Trial ${example.trial}: ${example.output || "[empty output]"}`);
    lines.push("");
  }
  if (report.ablations?.length) {
    lines.push("## Targeted ablation", "");
    for (const ablation of report.ablations) {
      lines.push(`**Hypothesis:** ${ablation.hypothesis ?? "Unspecified"}`, "");
      const groups = new Map();
      for (const trial of ablation.trials ?? []) {
        const list = groups.get(trial.variant) ?? [];
        list.push(trial);
        groups.set(trial.variant, list);
      }
      for (const [variant, trials] of groups) lines.push(`- ${variant}: ${trials[0]?.text ?? trials[0]?.output ?? "[empty output]"}`);
      lines.push("");
    }
  }
  if (report.decision) {
    lines.push("## Decision support", "", `**Diagnosis:** ${report.decision.diagnosis ?? "Not recorded."}`, "", `**Smallest proposed prompt change:** ${report.decision.proposedPromptChange ?? "Not recorded."}`, "", `**Status:** ${report.decision.status ?? "Human review required."}`, "");
  }
  lines.push("## Optimization", "", report.verdict === "PASS" ? "Keep the current prompt for this corpus. Review exploratory uncertainty before adding rules." : "Use the failed examples to propose the smallest A/B prompt change. Do not apply it until the operator reviews the comparison.");
  return lines.join("\n");
}

const args = process.argv.slice(2);
const inputPath = arg("--input", args);
const markdownPath = arg("--markdown", args);
const jsonPath = arg("--json", args);
if (!inputPath || !markdownPath || !jsonPath) usage();
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const report = summarize(input);
fs.mkdirSync(path.dirname(path.resolve(markdownPath)), { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
fs.writeFileSync(path.resolve(markdownPath), markdown(report) + "\n");
fs.writeFileSync(path.resolve(jsonPath), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ verdict: report.verdict, markdown: path.resolve(markdownPath), json: path.resolve(jsonPath) }));
