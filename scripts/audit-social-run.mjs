#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/audit-social-run.mjs <playground-run.json>");
const raw = await readFile(inputPath, "utf8");
const jsonStart = raw.indexOf("{");
if (jsonStart < 0) throw new Error("The run file does not contain a JSON Playground result or experiment report.");
const run = JSON.parse(raw.slice(jsonStart));
const playgroundRuns = Array.isArray(run.runs)
  ? run.runs.map((item) => item.output).filter(Boolean)
  : [run];

function auditPlaygroundRun(playgroundRun) {
  const injects = (playgroundRun.steps ?? []).filter((step) => step.command === "inject");
  const observations = injects.map((step, index) => {
  const result = step.result ?? {};
  const mirror = Array.isArray(result.world) ? result.world : [];
  const inbound = mirror.find((item) => !item.actorPresenceId && ["post", "reply", "quote", "mention"].includes(item.objectType));
  const intent = inbound
    ? (result.decisions ?? []).find((item) => item.target?.id === inbound.externalRef?.id)
    : undefined;
  const events = Array.isArray(result.recentEvents) ? result.recentEvents : [];
  const eventMatchesInbound = (event) => !event.sourceObjectId || event.sourceObjectId === inbound?.id;
  const perceptionEvent = events.find((event) => event.title === "Social perception recorded" && eventMatchesInbound(event));
  let perceptionRecord = null;
  try { perceptionRecord = perceptionEvent?.detail ? JSON.parse(perceptionEvent.detail) : null; } catch { perceptionRecord = null; }
  const perception = (inbound?.assetRefs ?? []).map((ref) => ref.perception).filter(Boolean);
  return {
    case: index + 1,
    actor: inbound?.author?.displayName ?? null,
    input: inbound?.content?.text ?? null,
    action: intent?.affordance ?? "no_op_or_unavailable",
    draft: intent?.publication?.text ?? "",
    rationale: intent?.rationale ?? null,
    perception: perception.map((item) => ({
      provider: item.providerId ?? null,
      model: item.modelId ?? null,
      level: item.level ?? null,
      uncertainty: item.result?.uncertainty ?? null,
    })),
    socialPerception: perceptionRecord,
    replans: events.filter((event) => event.title === "Social replan requested" && eventMatchesInbound(event)).length,
    editorActMismatches: events.filter((event) => event.title === "Social editor act mismatch" && eventMatchesInbound(event)).length,
    networkSearches: result.network?.searches?.length ?? 0,
    introductions: result.network?.introductions?.length ?? 0,
    executionStatus: intent?.execution?.status ?? null,
    outcomeStatus: intent?.outcome?.status ?? null,
  };
  });

  return {
    source: playgroundRun.scenario ?? null,
    configuration: injects[0]?.result?.configuration ?? playgroundRun.result?.configuration ?? null,
    execution: injects[0]?.result?.presence?.execution ?? playgroundRun.result?.presence?.execution ?? null,
    session: injects[0]?.result?.session ?? playgroundRun.result?.session ?? null,
    cases: observations,
    structuralChecks: {
      allAuto: injects.length > 0 && injects.every((item) => Object.values(item.result?.presence?.execution ?? {}).every((mode) => mode === "auto")),
      executionTruth: observations.every((item) => !item.executionStatus || ["succeeded", "awaiting-review", "awaiting-manual", "queued"].includes(item.executionStatus)),
      mediaProvenancePresentWhenObserved: observations.every((item) => item.perception.every((perception) => perception.provider || perception.model)),
      editorDidNotOverridePlannerAct: observations.every((item) => item.editorActMismatches === 0),
    },
  };
}

const text = JSON.stringify(run);
const fallbackMarkers = ["fallbackSocialDecision", "classifySocialCue", "socialCueInstruction", "fallbackUsed"];
const auditedRuns = playgroundRuns.map(auditPlaygroundRun);
const report = {
  source: run.scenario ?? auditedRuns[0]?.source ?? null,
  configurations: auditedRuns.map((item) => item.configuration),
  runs: auditedRuns,
  structuralChecks: {
    allRunsAuto: auditedRuns.length > 0 && auditedRuns.every((item) => item.structuralChecks.allAuto),
    executionTruth: auditedRuns.every((item) => item.structuralChecks.executionTruth),
    mediaProvenancePresentWhenObserved: auditedRuns.every((item) => item.structuralChecks.mediaProvenancePresentWhenObserved),
    noKnownFallbackMarkerInRun: !fallbackMarkers.some((marker) => text.includes(marker)),
    editorDidNotOverridePlannerAct: auditedRuns.every((item) => item.structuralChecks.editorDidNotOverridePlannerAct),
  },
  semanticReview: "Run scripts/evaluate-social-run.mjs separately. It scores act appropriateness and wording quality independently, without expected wording or provider/model identity.",
};
process.stdout.write(JSON.stringify(report, null, 2));
