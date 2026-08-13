#!/usr/bin/env node

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const scenario = args.find((value) => !value.startsWith("--"));
if (!scenario) throw new Error("Usage: node scripts/run-social-experiment.mjs <scenario.json> [--runs N] [--url URL] [--output FILE]");

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

const url = option("url", process.env.OPENPRESENCE_URL ?? "http://localhost:3000");
const runs = Math.max(1, Number(option("runs", "1")));
const outputPath = option("output");
const requiredProvider = option("require-provider");
const requiredModel = option("require-model");
const requiredReasoning = option("require-reasoning");
if (!Number.isInteger(runs)) throw new Error("--runs must be a positive integer.");

async function request(path, init) {
  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `OpenPresence returned HTTP ${response.status}.`);
  return body;
}

const initial = await request("/api/state");
const presence = initial.presence ?? initial.presences?.[0];
if (!presence?.id) throw new Error("No active Presence is available for the experiment.");
const affordances = ["post", "reply", "repost", "quote", "like", "message"];
const autoExecution = Object.fromEntries(affordances.map((affordance) => [affordance, "auto"]));
const autoState = await request("/api/state", {
  method: "POST",
  body: JSON.stringify({ type: "setPresence", patch: { execution: autoExecution } }),
});
const configuredPresence = autoState.presences?.find((item) => item.id === presence.id) ?? autoState.presence;
const allAuto = affordances.every((affordance) => configuredPresence?.execution?.[affordance] === "auto");
if (!allAuto) throw new Error("Could not establish Auto mode for every interaction affordance.");

async function runOnce() {
  const result = await execFileAsync("pnpm", ["--silent", "openpresence", "playground", "run", scenario, "--url", url], {
    cwd: process.cwd(),
    maxBuffer: 50 * 1024 * 1024,
    env: process.env,
  });
  const parsed = JSON.parse(result.stdout.trim());
  if (!parsed.ok) throw new Error(parsed.error?.message ?? "The Playground scenario failed.");
  const configuration = parsed.result?.configuration ?? parsed.steps?.[0]?.result?.configuration ?? null;
  const execution = parsed.result?.presence?.execution ?? parsed.steps?.[0]?.result?.presence?.execution ?? null;
  const model = configuration?.model;
  if (requiredProvider && model?.provider !== requiredProvider) throw new Error(`Expected provider ${requiredProvider}, received ${model?.provider ?? "unknown"}.`);
  if (requiredModel && model?.model !== requiredModel) throw new Error(`Expected model ${requiredModel}, received ${model?.model ?? "unknown"}.`);
  if (requiredReasoning && model?.reasoning?.value !== requiredReasoning) throw new Error(`Expected reasoning setting ${requiredReasoning}, received ${model?.reasoning?.value ?? "unknown"}.`);
  return {
    scenario,
    configuration,
    execution,
    allAuto: affordances.every((affordance) => execution?.[affordance] === "auto"),
    output: parsed,
  };
}

const results = [];
for (let index = 0; index < runs; index += 1) {
  const result = await runOnce();
  if (!result.allAuto) throw new Error(`Run ${index + 1} did not remain in Auto mode.`);
  results.push({ run: index + 1, ...result });
}

const report = {
  scenario,
  requestedRuns: runs,
  autoConfiguration: autoExecution,
  runs: results,
  providerModels: results.map((result) => result.configuration?.model ?? null),
  mediaTools: results.map((result) => result.configuration?.mediaTool ?? null),
  structuralGate: {
    allRunsAuto: results.every((result) => result.allAuto),
    sameProviderModel: new Set(results.map((result) => JSON.stringify(result.configuration?.model ?? null))).size <= 1,
    requiredProvider: requiredProvider ?? null,
    requiredModel: requiredModel ?? null,
    requiredReasoning: requiredReasoning ?? null,
  },
};

const serialized = JSON.stringify(report, null, 2);
if (outputPath) await writeFile(outputPath, `${serialized}\n`);
process.stdout.write(`${serialized}\n`);
