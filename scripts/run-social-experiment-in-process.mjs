#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const scenario = args.find((value) => !value.startsWith("--"));
if (!scenario) throw new Error("Usage: node scripts/run-social-experiment-in-process.mjs <scenario.json> [--runs N] [--db FILE] [--output FILE]");

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function booleanOption(name) {
  return args.includes(`--${name}`);
}

const runCount = Number(option("runs", "1"));
const dbPath = option("db", process.env.OPENPRESENCE_DB_PATH);
const secretKeyFile = option("secret-key-file");
const routeArtifact = option("route", ".next/server/app/api/state/route.js");
const outputPath = option("output");
const requestedProvider = option("provider", "openai");
const requestedModel = option("model", "gpt-5.6-luna");
const requestedQuality = option("quality", "low");
const requiredProvider = option("require-provider");
const requiredModel = option("require-model");
const requiredReasoning = option("require-reasoning");
if (!Number.isInteger(runCount) || runCount < 1) throw new Error("--runs must be a positive integer.");
if (process.env.OPENPRESENCE_AI_MOCK === "1") throw new Error("Social capability experiments cannot run with OPENPRESENCE_AI_MOCK=1.");
if (dbPath) process.env.OPENPRESENCE_DB_PATH = path.resolve(dbPath);
if (secretKeyFile) process.env.OPENPRESENCE_SECRET_KEY = (await readFile(path.resolve(secretKeyFile))).toString("base64");

const imported = await import(path.resolve(routeArtifact));
const routeRuntime = await imported.default;
const methods = routeRuntime.routeModule.methods;

async function getState() {
  const response = await methods.GET(new Request("http://openpresence.local/api/state"));
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `OpenPresence returned HTTP ${response.status}.`);
  return body;
}

async function postOperation(operation) {
  const response = await methods.POST(new Request("http://openpresence.local/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(operation),
  }));
  const body = await response.json();
  if (!response.ok || body?.error) throw new Error(body?.error ?? `OpenPresence returned HTTP ${response.status}.`);
  return body;
}

function sessionFor(state, explicitId) {
  const session = explicitId
    ? state.playgroundSessions?.find((item) => item.id === explicitId)
    : state.playgroundSessions?.find((item) => item.presenceId === state.presence?.id && item.status === "active")
      ?? state.playgroundSessions?.find((item) => item.status === "active")
      ?? state.playgroundSessions?.[0];
  if (!session) throw new Error("No Playground session exists.");
  return session;
}

function presenceFor(state, session) {
  return state.presences?.find((item) => item.id === session.presenceId) ?? state.presence;
}

function projectedState(state, explicitSessionId, command = "inspect") {
  const session = sessionFor(state, explicitSessionId);
  const presence = presenceFor(state, session);
  if (!presence) throw new Error("The Playground session's Presence is unavailable.");
  const channel = (state.channelDefinitions ?? []).find((item) => item.id === session.channelId);
  const model = (state.modelProfiles ?? []).find((item) => item.agentId === state.agent?.id) ?? state.modelProfiles?.[0];
  const mediaTool = (state.toolBindings ?? []).find((item) => item.agentId === state.agent?.id && item.toolId === "asset.inspect");
  const objects = (state.mirrorObjects ?? [])
    .filter((item) => item.sessionId === session.id)
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "") || (right.observedAt ?? "").localeCompare(left.observedAt ?? ""));
  const intents = (state.socialIntents ?? []).filter((item) => item.sessionId === session.id);
  const executions = (state.executions ?? []).filter((item) => item.sessionId === session.id);
  const outcomes = (state.outcomes ?? []).filter((item) => item.sessionId === session.id);
  const socialDecisions = (state.socialDecisions ?? []).filter((item) => item.sessionId === session.id);
  const learning = (state.growthHypotheses ?? []).filter((item) => item.sandboxSessionId === session.id);
  const events = (state.events ?? [])
    .filter((item) => item.sessionId === session.id)
    .sort((left, right) => String(right.time ?? "").localeCompare(String(left.time ?? "")));
  const searches = (state.networkSearches ?? []).filter((item) => item.sessionId === session.id);
  const introductions = (state.networkIntroductions ?? []).filter((item) => item.sessionId === session.id);
  const result = {
    ok: true,
    command,
    environment: "sandbox",
    session: {
      id: session.id,
      environmentId: session.environmentId,
      status: session.status,
      channel: session.channelId,
      virtualNow: session.virtualNow,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      evaluatedSlotIds: session.evaluatedSlotIds ?? [],
      judgedObjectIds: session.judgedObjectIds ?? [],
    },
    presence: {
      id: presence.id,
      name: presence.name,
      handle: presence.handle,
      channel: presence.channel,
      mode: presence.mode,
      status: presence.status,
      execution: presence.execution,
    },
    configuration: {
      model: model ? {
        provider: model.provider,
        model: model.model,
        quality: model.quality,
        capabilities: model.capabilities,
        reasoning: model.provider === "openai" && ["low", "medium", "high"].includes(model.quality ?? "")
          ? { parameter: "reasoning_effort", value: model.quality }
          : model.provider === "ollama" ? { parameter: "think", value: false } : undefined,
      } : undefined,
      mediaTool: {
        toolId: "asset.inspect",
        provider: mediaTool?.provider ?? model?.provider,
        model: mediaTool?.model ?? model?.model,
        connectionId: mediaTool?.connectionId,
      },
      channel: channel ? {
        id: channel.id,
        name: channel.name,
        affordances: channel.affordances,
        supportedAssetKinds: channel.supportedAssetKinds,
      } : { id: session.channelId, affordances: presence.capabilities ?? [] },
    },
    world: objects.map((item) => ({
      id: item.id,
      externalRef: item.externalRef,
      parentExternalRef: item.parentExternalRef,
      objectType: item.objectType,
      author: item.author,
      content: item.content,
      assetRefs: (item.assetRefs ?? []).map((ref) => {
        const latest = (state.perceptions ?? [])
          .filter((perception) => perception.assetId === ref.assetId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return { ...ref, perception: latest ? { level: latest.level, result: latest.result, providerId: latest.providerId, modelId: latest.modelId, createdAt: latest.createdAt } : undefined };
      }),
      occurredAt: item.occurredAt,
      observedAt: item.observedAt,
      actorPresenceId: item.actorPresenceId,
    })),
    decisions: intents.map((intent) => ({
      id: intent.id,
      affordance: intent.affordance,
      target: intent.target,
      publication: intent.publicationId ? state.publications?.find((item) => item.id === intent.publicationId)?.payload : undefined,
      state: intent.state,
      formedAt: intent.formedAt,
      validity: intent.validity,
      execution: executions.find((item) => item.socialIntentId === intent.id),
      outcome: outcomes.find((item) => item.socialIntentId === intent.id),
      socialDecision: socialDecisions.find((item) => item.socialIntentId === intent.id),
    })),
    network: { searches, introductions },
    recentEvents: events.slice(0, 20).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      detail: item.detail,
      tone: item.tone,
      time: item.time,
      sourceObjectId: item.sourceObjectId,
    })),
    learning,
    growthReviews: (state.growthReviews ?? []).filter((item) => item.presenceId === presence.id && item.assignmentId),
    growthEvidence: (state.growthEvidenceRecords ?? []).filter((item) => item.presenceId === presence.id && item.sandboxSessionId === session.id),
    publicationMetrics: (state.publicationMetricSnapshots ?? []).filter((item) => item.presenceId === presence.id && state.mirrorObjects.some((object) => object.id === item.mirrorObjectId && object.sessionId === session.id)),
    learningCounterfactuals: (state.learningCounterfactuals ?? []).filter((item) => item.presenceId === presence.id && item.sandboxSessionId === session.id),
  };
  if (command === "timeline") {
    result.timeline = [
      ...objects.map((item) => ({ at: item.observedAt ?? item.occurredAt, kind: "observation", id: item.id, objectType: item.objectType, author: item.author, content: item.content, target: item.parentExternalRef })),
      ...(state.perceptions ?? []).filter((item) => item.sessionId === session.id).map((item) => ({ at: item.createdAt, kind: "perception", id: item.id, assetId: item.assetId, socialObjectId: item.socialObjectId, level: item.level, result: item.result, providerId: item.providerId, modelId: item.modelId })),
      ...intents.map((intent) => ({ at: intent.formedAt, kind: "intent", id: intent.id, affordance: intent.affordance, target: intent.target, state: intent.state, validity: intent.validity })),
      ...executions.map((execution) => ({ at: execution.updatedAt, kind: "execution", id: execution.id, affordance: execution.affordance, status: execution.status, mode: execution.mode, target: execution.target, externalRef: execution.externalRef, failure: execution.failure })),
      ...outcomes.map((outcome) => ({ at: outcome.observedAt, kind: "outcome", id: outcome.id, status: outcome.status, evidence: outcome.evidence })),
      ...searches.map((search) => ({ at: search.createdAt, kind: "network-search", id: search.id, status: search.status, query: search.query, candidates: search.candidates, limitation: search.limitation })),
      ...introductions.map((introduction) => ({ at: introduction.updatedAt, kind: "network-introduction", id: introduction.id, status: introduction.status, candidateActorId: introduction.candidateActorId, socialIntentId: introduction.socialIntentId, executionId: introduction.executionId })),
      ...events.map((item) => ({ at: item.time, kind: "event", id: item.id, title: item.title, detail: item.detail, tone: item.tone })),
    ].sort((left, right) => String(right.at ?? "").localeCompare(String(left.at ?? "")));
  }
  return result;
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" })[extension] ?? "application/octet-stream";
}

async function resolveAssets(assets) {
  if (!Array.isArray(assets)) return undefined;
  return Promise.all(assets.map(async (asset) => {
    if (!asset || typeof asset !== "object" || typeof asset.path !== "string") return asset;
    const filePath = path.resolve(asset.path);
    const mimeType = asset.mimeType ?? mimeTypeFor(filePath);
    const bytes = await readFile(filePath);
    return {
      name: asset.name ?? path.basename(filePath),
      kind: asset.kind ?? (mimeType.startsWith("video/") ? "video" : mimeType === "image/gif" ? "gif" : "image"),
      mimeType,
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };
  }));
}

function resolveValue(value, previous) {
  if (typeof value !== "string") return value;
  if (value === "$session") return previous?.session?.id;
  if (value === "$latest-object-id") return previous?.world?.[0]?.id;
  if (value === "$latest-object") return previous?.world?.[0]?.externalRef;
  if (value === "$latest-own-post-id") return previous?.world?.find((item) => item.objectType === "post" && item.actorPresenceId)?.id;
  if (value === "$latest-own-post") return previous?.world?.find((item) => item.objectType === "post" && item.actorPresenceId)?.externalRef;
  if (value === "$latest-own-reply-id") return previous?.world?.find((item) => item.objectType === "reply" && item.actorPresenceId)?.id;
  if (value === "$latest-own-reply") return previous?.world?.find((item) => item.objectType === "reply" && item.actorPresenceId)?.externalRef;
  if (value === "$latest-inbound") return previous?.world?.find((item) => !item.actorPresenceId)?.externalRef ?? previous?.world?.[0]?.externalRef;
  return value;
}

async function runScenario(scenarioPath, presenceId) {
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new Error("Scenario must contain a non-empty steps array.");
  const steps = [];
  let sessionId;
  for (const [index, step] of scenario.steps.entries()) {
    const previous = steps.at(-1)?.result;
    const options = Object.fromEntries(Object.entries(step.options ?? {}).map(([key, value]) => [key, resolveValue(value, previous)]));
    let result;
    if (step.command === "start") {
      const state = await postOperation({ type: "startPlayground", presenceId, source: options.source ?? "scenario" });
      const session = state.playgroundSessions.filter((item) => item.presenceId === presenceId).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0];
      if (!session) throw new Error("The Playground session could not be started.");
      sessionId = session.id;
      result = projectedState(state, sessionId, "start");
    } else if (step.command === "inject") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} injects before a session starts.`);
      const action = options.action ?? options.kind ?? "post";
      const payload = {
        type: "addSandboxEvent",
        sessionId,
        actionId: action,
        actorName: String(options.actor ?? "Unknown actor"),
        actorHandle: options.handle,
        content: ["like", "reaction", "repost", "restack"].includes(action) ? String(options.content ?? "") : String(options.content ?? ""),
        assets: await resolveAssets(options.assets),
        observeOnly: options.observeOnly === true,
      };
      if (options.parent) payload.parentExternalRef = options.parent;
      if (options.target) payload.targetExternalRef = options.target;
      const state = await postOperation(payload);
      result = projectedState(state, sessionId, "inject");
    } else if (step.command === "advance") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} advances before a session starts.`);
      const state = await postOperation({ type: "advanceSandboxTime", sessionId, minutes: Number(options.minutes) });
      result = projectedState(state, sessionId, "advance");
    } else if (step.command === "consider") {
      const state = await postOperation({ type: "runSandboxPulse", sessionId });
      result = projectedState(state, sessionId, "consider");
    } else if (step.command === "original") {
      const state = await postOperation({ type: "considerOriginalPublication", sessionId, inspiration: options.inspiration });
      result = projectedState(state, sessionId, "original");
    } else if (step.command === "metric") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} records a metric before a session starts.`);
      const state = await getState();
      const mirrorId = resolveValue(options.object, previous);
      const updated = await postOperation({ type: "recordPublicationMetricSnapshot", presenceId: sessionFor(state, sessionId).presenceId, mirrorObjectId: mirrorId, publicationAgeSeconds: Number(options.publicationAgeSeconds ?? 3600), metrics: options.metrics ?? { impressions: 100, likes: 10, replies: 4, reposts: 2, quotes: 1 }, source: "sandbox", observationStatus: "observed" });
      result = projectedState(updated, sessionId, "metric");
    } else if (step.command === "assert-own-posts") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} checks own publications before a session starts.`);
      const state = await getState();
      const projected = projectedState(state, sessionId, "assert-own-posts");
      const minimum = Number(options.minimum ?? 1);
      const ownPosts = projected.world.filter((item) => item.objectType === "post" && item.actorPresenceId);
      if (ownPosts.length < minimum) {
        const evidencePath = outputPath ?? "stdout-only run";
        throw new Error(`Public canary precondition failed: expected at least ${minimum} measurable own post${minimum === 1 ? "" : "s"} from the autonomous path, found ${ownPosts.length}. Failed-run output: ${evidencePath}`);
      }
      result = projected;
    } else if (step.command === "audience") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} records audience data before a session starts.`);
      const current = await getState();
      const session = sessionFor(current, sessionId);
      const updated = await postOperation({ type: "recordAudienceSnapshot", presenceId: session.presenceId, followers: Number(options.followers), following: options.following === undefined ? undefined : Number(options.following), source: "sandbox", observationStatus: "observed", observedAt: session.virtualNow, sessionId });
      result = projectedState(updated, sessionId, "audience");
    } else if (step.command === "review") {
      if (!sessionId) throw new Error(`Scenario step ${index + 1} reviews before a session starts.`);
      const current = await getState();
      const session = sessionFor(current, sessionId);
      const state = await postOperation({ type: "reviewGrowth", presenceId: session.presenceId, kind: options.kind ?? "weekly", sandboxSessionId: sessionId });
      result = projectedState(state, sessionId, "review");
    } else if (step.command === "timeline") {
      const state = await getState();
      result = projectedState(state, sessionId, "timeline");
    } else if (step.command === "inspect-media") {
      const state = await postOperation({ type: "inspectSandboxMedia", sessionId, objectId: resolveValue(options.object, previous) });
      result = projectedState(state, sessionId, "inspect-media");
    } else {
      throw new Error(`Unsupported in-process scenario command: ${step.command}`);
    }
    steps.push({ index: index + 1, command: step.command, ...(options.observeOnly === true ? { observeOnly: true } : {}), result });
  }
  const unavailable = steps.flatMap((step) => step.result?.recentEvents ?? [])
    .filter((event) => event.title === "Sandbox evaluation unavailable");
  if (unavailable.length) throw new Error(`The model runtime was unavailable during the Playground run: ${unavailable[0]?.detail ?? "provider request failed"}`);
  return { ok: true, command: "run", scenario: scenarioPath, steps, result: steps.at(-1)?.result };
}

const initial = await getState();
const presence = initial.presence ?? initial.presences?.[0];
if (!presence?.id) throw new Error("No active Presence is available for the experiment.");
const providerConnection = initial.providerConnections?.find((item) => item.provider === requestedProvider && (item.status === "available" || item.status === "local") && (requestedProvider === "ollama" || item.secretConfigured !== false));
if (!providerConnection) throw new Error(`The selected QA database has no available configured ${requestedProvider} provider.`);
const affordances = ["post", "reply", "repost", "quote", "like", "message"];
const autoExecution = Object.fromEntries(affordances.map((affordance) => [affordance, "auto"]));
const configured = await postOperation({ type: "setModel", model: requestedModel, provider: requestedProvider, quality: requestedQuality, vision: true });
const sandboxState = await postOperation({
  type: "setPresence",
  patch: {
    connectionMode: "sandbox",
    execution: autoExecution,
    // Bootstrap the Presence-owned publishing responsibility through the
    // public runtime path. This is not a user-created Assignment; it is the
    // standing Agent-owned responsibility required by the canary's Growth
    // review and autonomous publication loop.
    publishingInitiative: {
      ...(presence.publishingInitiative ?? { mode: "adaptive", timezone: "America/Toronto", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      mode: presence.publishingInitiative?.mode === "off" ? "adaptive" : (presence.publishingInitiative?.mode ?? "adaptive"),
      updatedAt: new Date().toISOString(),
    },
  },
});
const configuredPresence = sandboxState.presences?.find((item) => item.id === presence.id) ?? sandboxState.presence;
const model = configured.modelProfiles?.find((item) => item.agentId === configured.agent?.id) ?? configured.modelProfiles?.[0];
if (!model || model.provider !== requestedProvider || model.model !== requestedModel || model.quality !== requestedQuality) throw new Error(`The requested ${requestedProvider}/${requestedModel}/${requestedQuality} configuration was not applied.`);
if (/qwen/i.test(model.model)) throw new Error("Qwen is prohibited for message experiments.");
if (requiredProvider && model.provider !== requiredProvider) throw new Error(`Expected provider ${requiredProvider}, received ${model.provider}.`);
if (requiredModel && model.model !== requiredModel) throw new Error(`Expected model ${requiredModel}, received ${model.model}.`);
if (requiredReasoning && model.quality !== requiredReasoning) throw new Error(`Expected reasoning setting ${requiredReasoning}, received ${model.quality}.`);
if (!affordances.every((affordance) => configuredPresence?.execution?.[affordance] === "auto")) throw new Error("Could not establish Auto mode for every interaction affordance.");

const results = [];
for (let index = 0; index < runCount; index += 1) {
  const output = await runScenario(path.resolve(scenario), presence.id);
  const first = output.steps.find((step) => step.command === "start")?.result ?? output.steps[0]?.result;
  const configuration = first?.configuration ?? output.result?.configuration;
  const execution = first?.presence?.execution ?? output.result?.presence?.execution;
  const actualModel = configuration?.model;
  if (/qwen/i.test(String(actualModel?.model ?? ""))) throw new Error("Qwen is prohibited for message experiments.");
  results.push({
    run: index + 1,
    scenario,
    configuration,
    execution,
    allAuto: affordances.every((affordance) => execution?.[affordance] === "auto"),
    output,
  });
}

const report = {
  scenario,
  requestedRuns: runCount,
  autoConfiguration: autoExecution,
  runs: results,
  providerModels: results.map((item) => item.configuration?.model ?? null),
  mediaTools: results.map((item) => item.configuration?.mediaTool ?? null),
  structuralGate: {
    allRunsAuto: results.every((item) => item.allAuto),
    sameProviderModel: new Set(results.map((item) => JSON.stringify(item.configuration?.model ?? null))).size <= 1,
    requiredProvider: requiredProvider ?? null,
    requiredModel: requiredModel ?? null,
    requiredReasoning: requiredReasoning ?? null,
    sandboxOnly: results.every((item) => item.output.steps.every((step) => step.result?.environment === "sandbox")),
    runtimeAvailable: true,
  },
};
const serialized = JSON.stringify(report, null, 2);
if (outputPath) await writeFile(path.resolve(outputPath), `${serialized}\n`);
process.stdout.write(`${serialized}\n`);
