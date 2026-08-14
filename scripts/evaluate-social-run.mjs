#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/evaluate-social-run.mjs <playground-run.json>");

const raw = await readFile(inputPath, "utf8");
const jsonStart = raw.indexOf("{");
if (jsonStart < 0) throw new Error("The run file does not contain a JSON Playground result or experiment report.");
const run = JSON.parse(raw.slice(jsonStart));
const playgroundRuns = Array.isArray(run.runs)
  ? run.runs.map((item) => item.output).filter(Boolean)
  : [run];

function parseDetail(value) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function recentEvents(result) {
  return Array.isArray(result.recentEvents) ? result.recentEvents : [];
}

function observeCase(step, index, runNumber) {
  const result = step?.result ?? {};
  const world = Array.isArray(result.world) ? result.world : [];
  const inbound = world.find((item) => !item.actorPresenceId && ["post", "reply", "quote", "mention"].includes(item.objectType));
  const intent = inbound
    ? (result.decisions ?? []).find((item) => item.target?.id === inbound.externalRef?.id)
    : undefined;
  const currentDeliveryId = intent?.execution?.externalRef?.id;
  const events = recentEvents(result);
  const eventMatchesInbound = (event) => !event.sourceObjectId || event.sourceObjectId === inbound?.id;
  const plan = events
    .filter((event) => event.title === "Social plan formed" && eventMatchesInbound(event))
    .map((event) => parseDetail(event.detail))
    .filter(Boolean)
    .at(0);
  const perception = events
    .filter((event) => event.title === "Social perception recorded" && eventMatchesInbound(event))
    .map((event) => parseDetail(event.detail))
    .filter(Boolean)
    .at(0);
  const action = plan?.action ?? intent?.affordance ?? (events.some((event) => event.title?.toLowerCase().includes("chose silence")) ? "no_op" : "unknown");
  const affordances = result.configuration?.channel?.affordances?.map((capability) => capability.id)
    ?? Object.keys(result.presence?.execution ?? {});
  return {
    ...(runNumber === undefined ? {} : { run: runNumber }),
    case: index + 1,
    context: {
      actor: inbound?.author?.displayName ?? null,
      handle: inbound?.author?.handle ?? null,
      post: inbound?.content?.text ?? null,
      thread: world
        .filter((item) => ["post", "reply", "quote", "mention"].includes(item.objectType))
        .filter((item) => item.externalRef?.id !== currentDeliveryId)
        .slice(0, 8)
        .map((item) => ({ author: item.author?.displayName ?? null, text: item.content?.text ?? null, parent: item.parentExternalRef?.id ?? null })),
      mediaObserved: Boolean(inbound?.assetRefs?.length),
      mediaPerceived: Boolean((inbound?.assetRefs ?? []).some((ref) => ref.perception)),
      mediaEvidence: (inbound?.assetRefs ?? []).map((ref) => ({
        kind: ref.kind ?? null,
        perception: ref.perception ? {
          level: ref.perception.level ?? null,
          observation: ref.perception.result?.observation ?? null,
          interpretation: ref.perception.result?.interpretation ?? null,
          uncertainty: ref.perception.result?.uncertainty ?? null,
          missingContext: ref.perception.result?.missingContext ?? [],
        } : null,
      })),
      availableActs: affordances,
      relationshipEvidencePresent: Boolean(perception?.relationshipStage),
      networkEvidence: {
        searches: (result.network?.searches ?? []).map((item) => ({
          status: item.status ?? null,
          query: item.query ?? null,
          limitation: item.limitation ?? null,
          candidates: (item.candidates ?? []).map((candidate) => ({
            displayName: candidate.displayName ?? null,
            handle: candidate.handle ?? null,
            permission: candidate.permission ?? null,
            evidence: candidate.evidence ?? [],
          })),
        })),
        introductions: (result.network?.introductions ?? []).map((item) => ({
          status: item.status ?? null,
          candidateActorId: item.candidateActorId ?? null,
        })),
      },
    },
    chosenAct: action,
    executionAct: intent?.affordance ?? null,
    plannerRationale: plan?.rationale ?? null,
    emittedText: intent?.publication?.text ?? "",
    modelPerception: perception ? {
      speechAct: perception.speechAct ?? null,
      responseNeed: perception.responseNeed ?? null,
      newInformation: perception.newInformation ?? null,
      relationshipStage: perception.relationshipStage ?? null,
      evidence: perception.evidence ?? [],
      recommendedAction: perception.recommendedAction ?? null,
      confidence: perception.confidence ?? null,
    } : null,
    structural: {
      executionStatus: intent?.execution?.status ?? null,
      outcomeStatus: intent?.outcome?.status ?? null,
      targetPresent: Boolean(intent?.target),
      plannerExecutionAct: plan?.executionAffordance ?? null,
    },
  };
}

const packetGroups = playgroundRuns.map((playgroundRun, runIndex) => {
  const injections = (playgroundRun.steps ?? []).filter((step) => step.command === "inject" && step.observeOnly !== true);
  return injections.map((step, index) => observeCase(step, index, playgroundRuns.length > 1 ? runIndex + 1 : undefined));
});
const packets = packetGroups.flat().map((packet, index) => ({
  ...packet,
  sourceCase: packet.case,
  case: index + 1,
}));
const firstPlaygroundRun = playgroundRuns[0] ?? {};
const firstInjections = (firstPlaygroundRun.steps ?? []).filter((step) => step.command === "inject" && step.observeOnly !== true);

async function loadCaseMetadata(playgroundRun) {
  const scenarioPath = playgroundRun.scenario;
  if (typeof scenarioPath !== "string") return [];
  try {
    const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
    if (!Array.isArray(scenario.caseMetadata)) return [];
    return scenario.caseMetadata.map((item) => {
      const categories = Array.isArray(item?.categories)
        ? item.categories
        : Array.isArray(item?.category) ? item.category : [item?.category];
      const cleanCategories = categories.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      return {
      caseId: typeof item?.caseId === "string" ? item.caseId : null,
      categories: cleanCategories,
      category: cleanCategories[0] ?? "unclassified",
      threadUnit: typeof item?.threadUnit === "string" ? item.threadUnit : null,
      partition: typeof item?.partition === "string" ? item.partition : null,
      sourceType: typeof item?.sourceType === "string" ? item.sourceType : null,
      confidence: typeof item?.confidence === "string" ? item.confidence : null,
      };
    });
  } catch {
    return [];
  }
}

const metadataGroups = await Promise.all(playgroundRuns.map(loadCaseMetadata));

const evaluatorInstructions = `You are an independent social-quality evaluator. Judge only the supplied observed context, model-selected planner act, execution affordance, emitted text, and factual structural fields. A planner act such as clarify may be mechanically executed through a channel affordance such as reply; judge the planner act and execution truth separately. Do not infer an expected answer, do not reward keywords, and do not use scenario IDs, provider identity, or model identity. Respect that silence can be correct. Score each case independently:

- actAppropriateness: 0 = wrong, unsafe, unsupported, or materially misaligned act; 1 = defensible but suboptimal; 2 = the best-supported act among the available acts.
- wordingQuality: null when no public wording was emitted; otherwise 0 = poor, generic, misleading, or socially off; 1 = adequate but noticeably weak; 2 = natural, specific, evidence-grounded, and appropriately restrained.
- earliestFailureLayer: one of observation, context, relationship_memory, perception, planning, expression, execution, or none.

Return JSON only: {"cases":[{"case":1,"actAppropriateness":0,"wordingQuality":null,"earliestFailureLayer":"none","rationale":"brief evidence-based explanation"}]}. Do not propose a rewritten answer.`;

async function runEvaluator(evaluationPackets) {
  const endpoint = process.env.OPENPRESENCE_SEMANTIC_EVAL_URL;
  if (!endpoint) return { status: "pending", reason: "Set OPENPRESENCE_SEMANTIC_EVAL_URL to run the independent evaluator.", packets: evaluationPackets };
  const model = process.env.OPENPRESENCE_SEMANTIC_EVAL_MODEL;
  if (!model) return { status: "pending", reason: "Set OPENPRESENCE_SEMANTIC_EVAL_MODEL to run the independent evaluator.", packets: evaluationPackets };
  const headers = { "content-type": "application/json" };
  if (process.env.OPENPRESENCE_SEMANTIC_EVAL_API_KEY) headers.authorization = `Bearer ${process.env.OPENPRESENCE_SEMANTIC_EVAL_API_KEY}`;
  const requestBody = {
    model,
    messages: [
      { role: "system", content: evaluatorInstructions },
      { role: "user", content: JSON.stringify({ cases: evaluationPackets }) },
    ],
  };
  if (process.env.OPENPRESENCE_SEMANTIC_EVAL_REASONING) requestBody.reasoning_effort = process.env.OPENPRESENCE_SEMANTIC_EVAL_REASONING;
  const response = await fetch(evaluatorEndpoint(endpoint), {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(`Semantic evaluator returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Semantic evaluator returned no message content.");
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Semantic evaluator did not return JSON.");
  return { status: "complete", result: JSON.parse(content.slice(start, end + 1)) };
}

function average(values) {
  const finite = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function evaluatorProvider(endpoint) {
  if (endpoint.includes("api.openai.com")) return "openai";
  if (endpoint.includes("openrouter.ai")) return "openrouter";
  if (endpoint.includes("localhost:11434") || endpoint.includes("127.0.0.1:11434")) return "ollama";
  return "custom";
}

function evaluatorEndpoint(endpoint) {
  return /\/chat\/completions\/?$/.test(endpoint)
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
}

function scoreByCategory(caseResults) {
  const groups = {};
  for (const item of caseResults) {
    const categories = item.categories?.length ? item.categories : ["unclassified"];
    for (const category of categories) (groups[category] ??= []).push(item);
  }
  const categories = Object.fromEntries(Object.entries(groups).map(([category, values]) => [category, {
    cases: values.length,
    actAppropriateness: average(values.map((item) => typeof item.actAppropriateness === "number" ? item.actAppropriateness / 2 : null)),
    wordingQuality: average(values.map((item) => typeof item.wordingQuality === "number" ? item.wordingQuality / 2 : null)),
    actPassRate: average(values.map((item) => typeof item.actAppropriateness === "number" ? (item.actAppropriateness === 2 ? 1 : 0) : null)),
    wordingPassRate: average(values.map((item) => typeof item.wordingQuality === "number" ? (item.wordingQuality === 2 ? 1 : 0) : null)),
  }]));
  const scoredCategories = Object.entries(categories).filter(([category]) => category !== "unclassified");
  return {
    categories,
    unclassifiedCases: caseResults.filter((item) => !item.categories?.length).length,
    equalWeightMacro: {
      actAppropriateness: average(scoredCategories.map(([, value]) => value.actAppropriateness)),
      wordingQuality: average(scoredCategories.map(([, value]) => value.wordingQuality)),
    },
  };
}

const semantic = await runEvaluator(packets);
const scored = semantic.status === "complete" && Array.isArray(semantic.result?.cases) ? semantic.result.cases : [];
const caseResults = scored.map((score, index) => {
  const packet = packets[index];
  const runNumber = packet?.run ?? 1;
  const sourceCase = packet?.sourceCase ?? packet?.case ?? (index + 1);
  const metadata = metadataGroups[runNumber - 1]?.[sourceCase - 1] ?? {};
  return {
    case: score.case ?? index + 1,
    run: runNumber,
    sourceCase,
    category: metadata.category ?? "unclassified",
    categories: metadata.categories ?? [],
    caseId: metadata.caseId ?? null,
    threadUnit: metadata.threadUnit ?? null,
    partition: metadata.partition ?? null,
    sourceType: metadata.sourceType ?? null,
    confidence: metadata.confidence ?? null,
    actAppropriateness: score.actAppropriateness ?? null,
    wordingQuality: score.wordingQuality ?? null,
    earliestFailureLayer: score.earliestFailureLayer ?? null,
    rationale: score.rationale ?? null,
  };
});
const report = {
  source: run.scenario ?? firstPlaygroundRun.scenario ?? null,
  // Provider/model/reasoning metadata remains here for experiment comparison,
  // but is deliberately absent from evaluatorInstructions and packets.
  experimentMetadata: run.runs
    ? run.runs.map((item) => item.configuration ?? null)
    : run.result?.configuration ?? firstInjections[0]?.result?.configuration ?? null,
  semanticEvaluator: process.env.OPENPRESENCE_SEMANTIC_EVAL_URL && process.env.OPENPRESENCE_SEMANTIC_EVAL_MODEL
    ? {
      provider: evaluatorProvider(process.env.OPENPRESENCE_SEMANTIC_EVAL_URL),
      model: process.env.OPENPRESENCE_SEMANTIC_EVAL_MODEL,
      reasoning: process.env.OPENPRESENCE_SEMANTIC_EVAL_REASONING ?? null,
    }
    : null,
  semanticEvaluation: semantic,
  // Case metadata is joined after blind judging. It is never included in the
  // evaluator packets, so category labels cannot steer the semantic score.
  caseResults,
  macro: scoreByCategory(caseResults),
  aggregates: {
    actAppropriateness: average(scored.map((item) => typeof item.actAppropriateness === "number" ? item.actAppropriateness / 2 : null)),
    wordingQuality: average(scored.map((item) => typeof item.wordingQuality === "number" ? item.wordingQuality / 2 : null)),
  },
  structuralChecks: {
    allAuto: run.runs
      ? run.runs.every((item) => item.allAuto === true)
      : Object.values(firstInjections[0]?.result?.presence?.execution ?? {}).every((mode) => mode === "auto"),
    truthfulExecution: packets.every((item) => !item.structural.executionStatus || ["succeeded", "awaiting-review", "awaiting-manual", "queued"].includes(item.structural.executionStatus)),
  },
};
process.stdout.write(JSON.stringify(report, null, 2));
