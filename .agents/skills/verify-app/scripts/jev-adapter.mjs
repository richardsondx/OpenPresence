import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const JEV_QUESTION_VERSION = "openpresence-verification-triage.v1";
export const JEV_MODES = new Set(["off", "shadow", "active"]);

const MAX_TEXT = 800;
const MAX_ITEMS = 12;

const questions = {
  routing: {
    type: "choice",
    instructions: "Given deterministic verification evidence, choose the smallest safe next verification action. This is triage only; it cannot change the deterministic result.",
    criteria: {
      ignore: "No optional follow-up is warranted.",
      rerun: "Rerun a bounded deterministic check because the evidence suggests a harness or transient issue.",
      deep_review: "Collect bounded additional evidence or ask for a deeper review of this claim.",
      security_review: "Escalate for a security, privacy, authority, or identity review.",
      human_now: "A human must inspect or resolve the situation before optional verification can continue."
    }
  },
  failure_class: {
    type: "choice",
    instructions: "Classify the most likely source of a non-PASS deterministic verification result. If the evidence is insufficient, choose unknown.",
    criteria: {
      product: "The OpenPresence product behavior is likely wrong.",
      harness: "The verification control plane or browser harness is likely wrong.",
      fixture: "The deterministic fixture or scenario is invalid or stale.",
      environment: "The machine, service, dependency, or runtime environment is unhealthy.",
      authority: "Identity, permission, privacy, account, or execution authority is the likely issue.",
      safety_stop: "A valid safety stop or protected boundary was reached.",
      unknown: "The bounded evidence does not support a more specific class."
    }
  },
  customer_impact: {
    type: "choice",
    instructions: "Estimate customer impact from this deterministic verification result, using only the supplied evidence.",
    criteria: {
      none: "No customer-visible impact is supported by this evidence.",
      low: "A narrow or cosmetic impact is plausible.",
      moderate: "A meaningful workflow may be impaired for some users.",
      high: "A core workflow or many users may be blocked or misled.",
      critical: "A severe safety, privacy, authority, or external-outcome risk is plausible."
    }
  },
  visual_review_required: {
    type: "boolean",
    instructions: "Does the supplied evidence require a visual product review to resolve uncertainty that deterministic assertions do not settle?",
    criteria: {
      true: "A human visual review is required for a meaningful unresolved question.",
      false: "The bounded deterministic evidence is sufficient without visual review."
    }
  }
};

function boundedText(value, max = MAX_TEXT) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function boundedItem(value, max = 300) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return boundedText(value, max);
  if (value === null || value === undefined) return "";
  try { return boundedText(JSON.stringify(value), max); }
  catch { return boundedText(value, max); }
}

function boundedList(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS).map((item) => boundedItem(item, 300)) : [];
}

function sanitizeEvidence(input) {
  const source = input && typeof input === "object" ? input : {};
  const probe = source.browserProbeSummary && typeof source.browserProbeSummary === "object" ? source.browserProbeSummary : null;
  return {
    claimId: boundedText(source.claimId, 160),
    affectedCapability: boundedText(source.affectedCapability, 200),
    deterministicResult: boundedText(source.deterministicResult, 80),
    assertionSummary: boundedList(source.assertionSummary ?? source.assertions),
    route: boundedText(source.route, 240),
    visibleTextSummary: boundedText(source.visibleTextSummary, 1200),
    consoleSummary: boundedList(source.consoleSummary),
    networkSummary: boundedList(source.networkSummary),
    trajectoryStateSummary: boundedText(source.trajectoryStateSummary ?? source.stateSummary, 1200),
    browserProbeSummary: probe ? {
      finalProbeState: boundedText(probe.finalProbeState, 80),
      actionCount: Number.isFinite(probe.actionCount) ? probe.actionCount : null,
      browserProtocolCallCount: Number.isFinite(probe.browserProtocolCallCount) ? probe.browserProtocolCallCount : null,
      deterministicPostcondition: boundedText(probe.deterministicPostcondition, 600),
      traceRef: path.basename(boundedText(probe.traceRef, 240))
    } : null,
    status: boundedText(source.status, 80),
    verificationNodeIds: boundedList(source.verificationNodeIds),
    evidenceRefs: boundedList(source.evidenceRefs).map((ref) => path.basename(ref))
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function resolveMode(options = {}) {
  const mode = String(options.mode ?? process.env.OPENPRESENCE_JEV_MODE ?? "off").toLowerCase();
  if (!JEV_MODES.has(mode)) throw new Error(`OPENPRESENCE_JEV_MODE must be one of: ${[...JEV_MODES].join(", ")}`);
  return mode;
}

async function runTypeSafeEvaluate(state, options = {}) {
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.TYPESAFE_AI_API_KEY;
  if (!apiKey) throw new Error("TypeSafe authentication is unavailable. Set TYPESAFE_API_KEY in the process environment.");
  const [{ experimental_evaluate }, { createTypeSafeAi }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/typesafe-ai")
  ]);
  const provider = createTypeSafeAi({ apiKey });
  return experimental_evaluate({
    model: provider.evaluationModel(options.model ?? "jev-latest"),
    state,
    questions
  });
}

function maxProbability(answer) {
  const probabilities = answer?.probabilities;
  if (!probabilities || typeof probabilities !== "object") return undefined;
  const values = Object.values(probabilities).filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : undefined;
}

function normalizeDecision({ mode, evidence, inputDigest, startedAt, completedAt, raw, error, requestedModel }) {
  const answers = raw?.answers ?? {};
  const confidences = Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, maxProbability(answer) ?? answer?.probability ?? null]));
  const confidenceValues = Object.values(confidences).filter((value) => typeof value === "number");
  const confidence = confidenceValues.length ? Math.min(...confidenceValues) : null;
  const response = raw?.response ?? {};
  const metadata = raw?.providerMetadata ?? {};
  const gateway = metadata.gateway && typeof metadata.gateway === "object" ? metadata.gateway : undefined;
  const usage = raw?.usage ?? null;
  const normalizedUsage = usage && typeof usage === "object"
    ? { ...usage, totalTokens: usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) || undefined) }
    : null;
  return {
    schemaVersion: "openpresence-jev-decision.v1",
    mode,
    claimId: evidence.claimId,
    questionVersion: JEV_QUESTION_VERSION,
    model: response.modelId ?? requestedModel ?? "jev-latest",
    requestedModel: requestedModel ?? "jev-latest",
    inputDigest,
    startedAt,
    completedAt,
    timestamp: completedAt,
    latencyMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    answers,
    rawAnswers: answers,
    confidence,
    confidences,
    providerConfidence: metadata.typesafe?.confidence ?? null,
    usage: normalizedUsage,
    cost: gateway ? Object.fromEntries(Object.entries(gateway).filter(([key]) => /cost/i.test(key))) : null,
    response: { timestamp: response.timestamp ?? null, headers: response.headers ? Object.fromEntries(Object.entries(response.headers).filter(([key]) => /request|response|vercel/i.test(key))) : null },
    error: error ? boundedText(error, 500) : null,
    deterministicAuthority: true,
    routingApplied: mode === "active" && !error && confidence !== null && confidence >= 0.65 ? answers.routing?.choice ?? "ignore" : "ignore"
  };
}

export async function runJevTriage(evidence, options = {}) {
  const mode = resolveMode(options);
  const sanitizedEvidence = sanitizeEvidence(evidence);
  const inputDigest = digest({ questionVersion: JEV_QUESTION_VERSION, evidence: sanitizedEvidence });
  const startedAt = new Date().toISOString();
  let raw;
  let error;
  if (mode !== "off") {
    try { raw = await runTypeSafeEvaluate(sanitizedEvidence, options); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  const completedAt = new Date().toISOString();
  const decision = normalizeDecision({ mode, evidence: sanitizedEvidence, inputDigest, startedAt, completedAt, raw, error, requestedModel: options.model });
  if (options.persistPath) {
    await fs.mkdir(path.dirname(options.persistPath), { recursive: true });
    await fs.appendFile(options.persistPath, `${JSON.stringify(decision)}\n`);
  }
  return { decision, evidence: sanitizedEvidence, raw: raw ?? null, serviceAvailable: !error && mode !== "off" };
}
