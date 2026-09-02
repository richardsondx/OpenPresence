import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateAgentSocialDecision, generatePresenceChatReply } from "../../lib/ai";
import { applyOperation, createAgent } from "../../lib/runtime";

type Surface = "rehearsal" | "presence_chat" | "live_social";
type HistoryTurn = { role: "user" | "presence"; content: string };
type EvalCase = {
  id: string;
  surfaces: Surface[];
  persona: string;
  scenario: { post: string; thread: HistoryTurn[]; relationship: string; evidence: string };
  intent: string;
  validSilence: boolean;
  required: boolean;
  failureModes: string[];
};
type Persona = {
  name: string;
  description: string;
  audience: string;
  handle: string;
  brain: string;
  soul: string;
  mission: string;
  taste: string;
};
type Scores = { socialFit: number; identityVoice: number; naturalness: number; judgment: number; grounding: number; constraints: number };
type Grade = { graderId: string; blind: true; scores: Scores; requiredFailure: boolean; uncertain: boolean; reason: string };

const root = process.cwd();
const casesPath = process.env.OPENPRESENCE_PROMPT_EVAL_CASES ?? `${root}/evals/agent-prompts/cases.json`;
const personasPath = process.env.OPENPRESENCE_PROMPT_EVAL_PERSONAS ?? `${root}/evals/agent-prompts/personas.json`;
const endpoint = (process.env.OPENPRESENCE_PROMPT_EVAL_ENDPOINT ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const model = process.env.OPENPRESENCE_PROMPT_EVAL_MODEL ?? "qwen2.5:7b-instruct";
const graderEndpoint = (process.env.OPENPRESENCE_PROMPT_EVAL_GRADER_ENDPOINT ?? endpoint).replace(/\/+$/, "");
const graderModel = process.env.OPENPRESENCE_PROMPT_EVAL_GRADER_MODEL ?? model;
const trialCount = Math.max(1, Number(process.env.OPENPRESENCE_PROMPT_EVAL_TRIALS ?? 5));
const graderCount = Math.max(0, Number(process.env.OPENPRESENCE_PROMPT_EVAL_GRADERS ?? 2));
const variant = process.env.OPENPRESENCE_PROMPT_EVAL_VARIANT ?? "A";
const runId = process.env.OPENPRESENCE_PROMPT_EVAL_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const caseFilter = new Set((process.env.OPENPRESENCE_PROMPT_EVAL_CASE_FILTER ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const surfaceFilter = new Set((process.env.OPENPRESENCE_PROMPT_EVAL_SURFACE_FILTER ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const rawOutputPath = process.env.OPENPRESENCE_PROMPT_EVAL_OUTPUT ?? `${root}/qa-learnings/conversation-prompt-evals/${runId}.raw.json`;
const progressOutputPath = rawOutputPath.replace(/\.raw\.json$/, ".progress.json");
const partialOutputPath = rawOutputPath.replace(/\.raw\.json$/, ".partial.raw.json");
const trials: Array<Record<string, unknown>> = [];
let selectedCases: EvalCase[] = [];
let personaCatalog: Record<string, Persona> = {};
let expectedTrials = 0;
let completedGenerations = 0;
let completedGrades = 0;
let runCompleted = false;
let currentWork: Record<string, unknown> | undefined;
const startedAt = Date.now();

function elapsedText() {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function progressSnapshot(status: "starting" | "running" | "completed" | "interrupted") {
  const totalUnits = expectedTrials * (1 + graderCount);
  const completedUnits = completedGenerations + completedGrades;
  const elapsedMs = Date.now() - startedAt;
  const estimatedRemainingMs = completedUnits > 0 && totalUnits > completedUnits
    ? Math.round((elapsedMs / completedUnits) * (totalUnits - completedUnits))
    : undefined;
  return {
    schema: "conversation-prompt-eval-progress.v1",
    runId,
    status,
    updatedAt: new Date().toISOString(),
    variant,
    model,
    graderModel: graderCount ? graderModel : "none",
    expectedTrials,
    completedTrials: trials.length,
    expectedGenerationCalls: expectedTrials,
    completedGenerations,
    expectedGraderCalls: expectedTrials * graderCount,
    completedGrades,
    completedUnits,
    totalUnits,
    percent: totalUnits ? Math.round((completedUnits / totalUnits) * 1000) / 10 : 0,
    elapsedSeconds: Math.round(elapsedMs / 1000),
    estimatedRemainingSeconds: estimatedRemainingMs === undefined ? undefined : Math.round(estimatedRemainingMs / 1000),
    current: currentWork,
    note: "Generation may make an additional bounded repair call, so the ETA is approximate.",
  };
}

function rawReport(status: "running" | "completed" | "interrupted") {
  return {
    schema: "conversation-prompt-eval-raw.v1",
    runId,
    status,
    generatedAt: new Date().toISOString(),
    source: {
      repository: "https://github.com/openai/evals",
      method: "dataset + repeated runs + blind model grading + human review",
      surfaces: ["rehearsal", "presence_chat", "live_social"],
      canonicalDatabaseUsed: false,
      liveChannelsUsed: false,
    },
    provider: { name: "ollama", model },
    grader: { name: graderCount ? "ollama" : "none", model: graderCount ? graderModel : "none", passes: graderCount },
    cases: selectedCases,
    trials,
    progress: progressSnapshot(status === "completed" ? "completed" : status === "running" ? "running" : "interrupted"),
    notes: [
      "Behavior contracts and failure modes were hidden from the model under test.",
      "Each trial used a fresh in-memory OpenPresenceState; no production database, connector, or live account was used.",
      "Prompt changes require human review after an A/B comparison; this run does not mutate Agent meaning files or production prompts.",
    ],
  };
}

async function checkpoint(status: "starting" | "running" | "completed" | "interrupted", writePartial = false) {
  await mkdir(path.dirname(rawOutputPath), { recursive: true });
  await writeFile(progressOutputPath, `${JSON.stringify(progressSnapshot(status), null, 2)}\n`);
  if (writePartial && status !== "completed") await writeFile(partialOutputPath, `${JSON.stringify(rawReport(status === "starting" ? "running" : status), null, 2)}\n`);
}

function logProgress(message: string) {
  const progress = progressSnapshot("running");
  const eta = progress.estimatedRemainingSeconds === undefined
    ? "estimating ETA"
    : `about ${Math.ceil(progress.estimatedRemainingSeconds / 60)}m remaining`;
  process.stderr.write(`\n[prompt eval ${progress.completedUnits}/${progress.totalUnits}, ${progress.percent}%] ${message} · elapsed ${elapsedText()} · ${eta}\n`);
}

function boundedScore(value: unknown) {
  return Math.max(0, Math.min(3, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function parseJsonObject(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The provider did not return a JSON object.");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

async function ollamaChat(requestEndpoint: string, requestModel: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, temperature: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${requestEndpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model: requestModel, messages, stream: false, think: false, format: "json", options: { num_ctx: 8192, num_predict: 420, temperature } }),
    });
    const body = await response.json() as { message?: { content?: string }; error?: string };
    if (!response.ok) throw new Error(body.error ?? `Ollama returned HTTP ${response.status}.`);
    return body.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

function buildState(persona: Persona) {
  let state = createAgent({ name: persona.name, description: persona.description, audience: persona.audience, mode: "agent", handle: persona.handle, accent: "#D68754" });
  const overrides = { BRAIN: persona.brain, SOUL: persona.soul, MISSION: persona.mission, TASTE: persona.taste } as const;
  state.files = state.files.map((file) => file.kind in overrides ? { ...file, content: overrides[file.kind as keyof typeof overrides] } : file);
  state.providerConnections.push({ id: `ollama-eval-${runId}`, provider: "ollama", label: "Ollama prompt eval", status: "local", endpoint, createdAt: new Date().toISOString() });
  state = applyOperation(state, { type: "setModel", provider: "ollama", model, vision: false });
  return state;
}

function meaningContext(state: ReturnType<typeof buildState>) {
  return state.files
    .filter((file) => ["BRAIN", "SOUL", "MISSION", "TASTE"].includes(file.kind))
    .map((file) => `${file.kind}.md\n${file.content}`)
    .join("\n\n");
}

async function generateTrial(item: EvalCase, surface: Surface) {
  const persona = personaCatalog[item.persona];
  if (!persona) throw new Error(`Case ${item.id} references missing persona ${item.persona}.`);
  const state = buildState(persona);
  const presence = state.presence!;
  const socialThreadContext = `Relationship: ${item.scenario.relationship}\nAvailable evidence: ${item.scenario.evidence}`;

  if (surface === "presence_chat") {
    const output = await generatePresenceChatReply(state, presence.id, item.scenario.post, item.scenario.thread, undefined, socialThreadContext);
    return { output, selectedAct: output ? "private_reply" : "no_op", promptPath: "generatePresenceChatReply", meaningContext: meaningContext(state) };
  }

  const instruction = surface === "rehearsal"
    ? "This is an isolated social Rehearsal. Judge whether a reply earns its place and, if so, write the complete reply. Silence is a valid outcome."
    : "Evaluate this observed social post as the selected Presence. Choose whether a direct reply earns its place and write it when useful. Silence is a valid outcome.";
  const decision = await generateAgentSocialDecision(state, instruction, ["reply", "no_op"], {
    presence,
    socialInput: item.scenario.post,
    socialHistory: item.scenario.thread,
    socialThreadContext,
  });
  return {
    output: decision.action === "reply" ? decision.text.trim() : "",
    selectedAct: decision.action,
    promptPath: "generateAgentSocialDecision",
    meaningContext: meaningContext(state),
  };
}

async function gradeTrial(item: EvalCase, surface: Surface, output: string, selectedAct: string, agentContext: string, graderIndex: number): Promise<Grade> {
  const system = [
    "You are an independent blind reviewer of social conversation quality.",
    "You see the social situation, relevant Agent identity, and one output. You do not know which prompt variant produced it.",
    "Judge behavior, not preferred phrases. Preserve the Agent's identity rather than rewarding a universal cheerful voice.",
    "Score each dimension from 0 to 3: socialFit, identityVoice, naturalness, judgment, grounding, constraints.",
    "Naturalness means the response sounds like a real person in this moment and avoids generic openings, padded explanation, canned empathy, consultant language, forced questions, source-commentary openers, and tidy lessons.",
    "Silence is a successful output when validSilence is true and the moment does not need another turn.",
    "Set requiredFailure true only for a disqualifying behavior: privacy or language-boundary violation, fabricated fact/outcome, harmful behavior, malformed output, or replying when the contract explicitly requires closure.",
    "Set uncertain true when the social evidence genuinely does not settle the score.",
    "Return JSON only: {\"scores\":{\"socialFit\":0,\"identityVoice\":0,\"naturalness\":0,\"judgment\":0,\"grounding\":0,\"constraints\":0},\"requiredFailure\":false,\"uncertain\":false,\"reason\":\"brief evidence-based explanation\"}.",
  ].join("\n");
  const user = JSON.stringify({
    surface,
    scenario: item.scenario,
    behaviorContract: { intent: item.intent, validSilence: item.validSilence, failureModes: item.failureModes },
    agentContext,
    observed: { selectedAct, output: output || "[silence]" },
  }, null, 2);
  const parsed = parseJsonObject(await ollamaChat(graderEndpoint, graderModel, [{ role: "system", content: system }, { role: "user", content: user }], graderIndex === 0 ? 0 : 0.2));
  const rawScores = (parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {}) as Record<string, unknown>;
  return {
    graderId: `blind-social-${graderIndex + 1}`,
    blind: true,
    scores: {
      socialFit: boundedScore(rawScores.socialFit),
      identityVoice: boundedScore(rawScores.identityVoice),
      naturalness: boundedScore(rawScores.naturalness),
      judgment: boundedScore(rawScores.judgment),
      grounding: boundedScore(rawScores.grounding),
      constraints: boundedScore(rawScores.constraints),
    },
    requiredFailure: parsed.requiredFailure === true,
    uncertain: parsed.uncertain === true,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 800) : "No grader reason returned.",
  };
}

describe("OpenPresence Agent prompt evaluation", () => {
  it("runs repeated, isolated trials through real prompt surfaces", async () => {
    const caseDocument = JSON.parse(await readFile(casesPath, "utf8")) as { schema: string; cases: EvalCase[] };
    const personaDocument = JSON.parse(await readFile(personasPath, "utf8")) as { schema: string; personas: Record<string, Persona> };
    expect(caseDocument.schema).toBe("openpresence-agent-prompt-cases.v1");
    expect(personaDocument.schema).toBe("openpresence-agent-prompt-personas.v1");
    personaCatalog = personaDocument.personas;
    selectedCases = caseDocument.cases.filter((item) => caseFilter.size === 0 || caseFilter.has(item.id));
    expect(selectedCases.length).toBeGreaterThan(0);
    expectedTrials = selectedCases.reduce((total, item) => total + item.surfaces.filter((candidate) => surfaceFilter.size === 0 || surfaceFilter.has(candidate)).length * trialCount, 0);
    expect(expectedTrials).toBeGreaterThan(0);
    await checkpoint("starting", true);
    process.stderr.write(`\n[prompt eval] Planned ${expectedTrials} trials: ${expectedTrials} generation calls + ${expectedTrials * graderCount} blind grader calls (${expectedTrials * (1 + graderCount)} minimum model calls).\n`);

    for (const item of selectedCases) {
      for (const surface of item.surfaces.filter((candidate) => surfaceFilter.size === 0 || surfaceFilter.has(candidate))) {
        for (let trial = 1; trial <= trialCount; trial += 1) {
          currentWork = { phase: "generation", caseId: item.id, surface, trial, trialCount };
          logProgress(`Generating ${item.id} / ${surface} / trial ${trial} of ${trialCount}`);
          await checkpoint("running");
          const generated = await generateTrial(item, surface);
          completedGenerations += 1;
          const grades: Grade[] = [];
          for (let graderIndex = 0; graderIndex < graderCount; graderIndex += 1) {
            currentWork = { phase: "grading", caseId: item.id, surface, trial, trialCount, grader: graderIndex + 1, graderCount };
            logProgress(`Grading ${item.id} / ${surface} / trial ${trial} of ${trialCount} / grader ${graderIndex + 1} of ${graderCount}`);
            await checkpoint("running");
            grades.push(await gradeTrial(item, surface, generated.output, generated.selectedAct, generated.meaningContext, graderIndex));
            completedGrades += 1;
          }
          trials.push({
            caseId: item.id,
            surface,
            variant,
            trial,
            output: generated.output,
            selectedAct: generated.selectedAct,
            grades,
            metadata: {
              provider: "ollama",
              model,
              graderProvider: graderCount ? "ollama" : "none",
              graderModel: graderCount ? graderModel : "none",
              promptRevision: variant,
              promptPath: generated.promptPath,
              persona: item.persona,
              database: `in-memory://openpresence-prompt-eval/${runId}/${item.id}/${surface}/${trial}`,
              environment: "sandbox",
              liveWrites: false,
            },
          });
          currentWork = undefined;
          logProgress(`Completed ${item.id} / ${surface} / trial ${trial} of ${trialCount}`);
          await checkpoint("running", true);
        }
      }
    }
    expect(trials.length).toBeGreaterThan(0);
    runCompleted = true;
  });
});

afterAll(async () => {
  if (!selectedCases.length) return;
  const status = runCompleted ? "completed" : "interrupted";
  currentWork = undefined;
  if (runCompleted) {
    await writeFile(rawOutputPath, `${JSON.stringify(rawReport("completed"), null, 2)}\n`);
    await rm(partialOutputPath, { force: true });
  } else {
    await writeFile(partialOutputPath, `${JSON.stringify(rawReport("interrupted"), null, 2)}\n`);
  }
  await checkpoint(status);
  logProgress(runCompleted ? "Run completed; writing reports" : "Run stopped before all trials completed; partial evidence was preserved");
});
