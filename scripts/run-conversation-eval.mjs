#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const variant = option("--variant", "A");
const model = option("--model", process.env.OPENPRESENCE_PROMPT_EVAL_MODEL ?? "");
if (!model) {
  console.error("Choose an installed Ollama model with --model <name> or OPENPRESENCE_PROMPT_EVAL_MODEL.");
  process.exit(2);
}
const graderModel = option("--grader-model", process.env.OPENPRESENCE_PROMPT_EVAL_GRADER_MODEL ?? model);
const trials = option("--trials", process.env.OPENPRESENCE_PROMPT_EVAL_TRIALS ?? "5");
const graders = has("--no-grade") ? "0" : option("--graders", process.env.OPENPRESENCE_PROMPT_EVAL_GRADERS ?? "2");
const date = new Date().toISOString().slice(0, 10);
const safeModel = model.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const runId = option("--run-id", `${date}-agent-prompts-${variant.toLowerCase()}-${safeModel}-${trials}trials`);
const output = option("--output", path.resolve(`qa-learnings/conversation-prompt-evals/${runId}.raw.json`));
const env = {
  ...process.env,
  OPENPRESENCE_PROMPT_EVAL_VARIANT: variant,
  OPENPRESENCE_PROMPT_EVAL_MODEL: model,
  OPENPRESENCE_PROMPT_EVAL_GRADER_MODEL: graderModel,
  OPENPRESENCE_PROMPT_EVAL_TRIALS: trials,
  OPENPRESENCE_PROMPT_EVAL_GRADERS: graders,
  OPENPRESENCE_PROMPT_EVAL_RUN_ID: runId,
  OPENPRESENCE_PROMPT_EVAL_OUTPUT: output,
};
const caseFilter = option("--case", "");
const surfaceFilter = option("--surface", "");
if (surfaceFilter === "v2") env.OPENPRESENCE_V2_EVAL = "1";
if (caseFilter) env.OPENPRESENCE_PROMPT_EVAL_CASE_FILTER = caseFilter;
if (surfaceFilter) env.OPENPRESENCE_PROMPT_EVAL_SURFACE_FILTER = surfaceFilter;

const vitest = path.resolve("node_modules/.bin/vitest");
const run = spawnSync(vitest, ["run", "--config", "vitest.agent-prompts.config.ts"], { cwd: process.cwd(), env, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);

const summary = spawnSync(process.execPath, [path.resolve("scripts/summarize-conversation-eval.mjs"), output], { cwd: process.cwd(), env, stdio: "inherit" });
if (summary.status !== 0) process.exit(summary.status ?? 1);

console.log(`Raw evidence: ${output}`);
