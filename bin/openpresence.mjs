#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { extname } from "node:path";

const DEFAULT_URL = process.env.OPENPRESENCE_URL ?? "http://localhost:3000";

const HELP = `OpenPresence agent CLI

The CLI is sandbox-only and emits JSON by default so another agent can consume it.

Usage:
  openpresence playground <command> [options]

Commands:
  start       Start a new Playground session
  inspect     Return the current world, Presence, decisions, and review queue
  inject      Add a simulated social event and let the Agent evaluate it
              (use --observe-only when loading historical replay context)
  inspect-media  Inspect media attached to a simulated object
  consider    Let the Agent evaluate the current simulated world
  advance     Move virtual time and evaluate due Standing Intents
  schedule    Add a Calendar Standing Intent used by later Playground time advances
  timeline    Return the session's auditable event/intent/execution timeline
  approve-introduction  Approve a consent-aware sandbox introduction
  decline-introduction  Decline a proposed sandbox introduction
  reset       Reset the selected session to a fresh simulated world
  run         Execute a JSON scenario file step by step

Common options:
  --url <url>          OpenPresence server URL (default: $OPENPRESENCE_URL or localhost:3000)
  --session <id>       Playground session id
  --presence <id>      Presence id when starting a session
  --minutes-from-now <number> Schedule relative to the session's virtual clock
  --assets-json <json> JSON array of simulated assets; use path for local fixtures
  --observe-only       Add replay context without triggering social cognition
  --human              Use concise human-readable output instead of JSON

Examples:
  openpresence playground start --presence presence_123
  openpresence playground inspect --session session_123
  openpresence playground inject --actor Maya --handle @maya --action reply --content "What are you building?"
  openpresence playground consider --session session_123
  openpresence playground advance --session session_123 --minutes 60
  openpresence playground run scenarios/reply.json
`;

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [name, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[name] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = true;
    }
  }
  return { positionals, options };
}

function fail(message, code = "CLI_ERROR", details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function required(options, key, message = `Missing --${key}.`) {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) fail(message, "INVALID_ARGUMENT");
  return value.trim();
}

function parseInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) fail(`--${name} must be an integer.`, "INVALID_ARGUMENT");
  return parsed;
}

function parseExternalRef(value) {
  if (value && typeof value === "object" && typeof value.type === "string" && typeof value.id === "string") return value;
  if (typeof value !== "string" || !value.includes(":")) fail("Target must use the form type:id.", "INVALID_ARGUMENT");
  const separator = value.indexOf(":");
  return { type: value.slice(0, separator), id: value.slice(separator + 1) };
}

function parseJsonOption(value, name) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`--${name} must contain valid JSON.`, "INVALID_ARGUMENT", { cause: error instanceof Error ? error.message : String(error) });
  }
}

function sessionFor(state, explicitSessionId) {
  const session = explicitSessionId
    ? state.playgroundSessions?.find((item) => item.id === explicitSessionId)
    : state.playgroundSessions?.find((item) => item.presenceId === state.presence?.id && item.status === "active")
      ?? state.playgroundSessions?.find((item) => item.status === "active")
      ?? state.playgroundSessions?.[0];
  if (!session) fail("No Playground session exists. Run `playground start` first.", "NO_SESSION");
  return session;
}

function presenceFor(state, session) {
  return state.presences?.find((item) => item.id === session.presenceId) ?? state.presence;
}

function scopedMeaningFiles(state, presence) {
  return (state.files ?? []).map((file) => file.kind === "PRESENCE"
    ? {
        kind: file.kind,
        revision: file.revision,
        content: [
          "# PRESENCE.md",
          "",
          `## ${presence.channel} · ${presence.handle}`,
          "",
          `I speak as ${presence.mode === "ghost" ? "the represented public identity" : "myself"}. I adapt to this channel without flattening worthwhile ideas.`,
          "",
          "## Public self",
          "",
          `I appear here as ${presence.name}. My public disclosure posture is ${presence.publicSelf?.posture ?? presence.context?.publicSelf?.posture ?? "contextual"}. Respond socially and naturally from this Presence identity. Do not volunteer implementation details.`,
          "",
          "Treat people as people, not engagement opportunities.",
        ].join("\\n"),
      }
    : { kind: file.kind, content: file.content, revision: file.revision });
}

function projectState(state, explicitSessionId, mode = "inspect") {
  const session = sessionFor(state, explicitSessionId);
  const presence = presenceFor(state, session);
  if (!presence) fail("The Playground session's Presence is unavailable.", "INVALID_STATE");
  const channelDefinition = (state.channelDefinitions ?? []).find((item) => item.id === session.channelId);
  const model = (state.modelProfiles ?? []).find((item) => item.agentId === state.agent?.id) ?? state.modelProfiles?.[0];
  const mediaTool = (state.toolBindings ?? []).find((item) => item.agentId === state.agent?.id && item.toolId === "asset.inspect");
  const objects = (state.mirrorObjects ?? [])
    .filter((item) => item.sessionId === session.id)
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "") || (right.observedAt ?? "").localeCompare(left.observedAt ?? ""));
  const intents = (state.socialIntents ?? []).filter((item) => item.sessionId === session.id);
  const executions = (state.executions ?? []).filter((item) => item.sessionId === session.id);
  const outcomes = (state.outcomes ?? []).filter((item) => item.sessionId === session.id);
  const events = (state.events ?? []).filter((item) => item.sessionId === session.id);
  const networkSearches = (state.networkSearches ?? []).filter((item) => item.sessionId === session.id);
  const networkIntroductions = (state.networkIntroductions ?? []).filter((item) => item.sessionId === session.id);
  const result = {
    ok: true,
    command: mode,
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
      agent: state.agent ? { id: state.agent.id, name: state.agent.name, description: state.agent.description, audience: state.agent.audience, topics: state.agent.topics } : undefined,
      model: model ? {
        provider: model.provider,
        model: model.model,
        quality: model.quality,
        capabilities: model.capabilities,
        reasoning: model.provider === "openai" && ["low", "medium", "high"].includes(model.quality ?? "")
          ? { parameter: "reasoning_effort", value: model.quality }
          : model.provider === "ollama"
            ? { parameter: "think", value: false }
            : undefined,
      } : undefined,
      mediaTool: {
        toolId: "asset.inspect",
        provider: mediaTool?.provider,
        model: mediaTool?.model,
        connectionId: mediaTool?.connectionId,
      },
      meaningFiles: scopedMeaningFiles(state, presence),
      presenceContext: presence.context,
      executionEnvelope: presence.executionEnvelope,
      channel: channelDefinition ? { id: channelDefinition.id, name: channelDefinition.name, description: channelDefinition.description, affordances: channelDefinition.affordances, supportedAssetKinds: channelDefinition.supportedAssetKinds, formats: channelDefinition.formats, relationships: channelDefinition.relationships, privacyDefaults: channelDefinition.privacyDefaults } : { id: session.channelId, affordances: presence.capabilities ?? Object.keys(presence.execution ?? {}).map((id) => ({ id })) },
      calendar: (state.calendar ?? []).filter((slot) => slot.presence === presence.id),
      standingIntents: (state.standingIntents ?? []).filter((intent) => !intent.presenceId || intent.presenceId === presence.id),
      skills: state.skills ?? [],
      toolBindings: state.toolBindings ?? [],
      actors: (state.sandboxActors ?? []).filter((actor) => actor.sessionId === session.id),
    },
    world: objects.map((item) => ({
      id: item.id,
      externalRef: item.externalRef,
      parentExternalRef: item.parentExternalRef,
      objectType: item.objectType,
      author: item.author,
      content: item.content,
      assetRefs: (item.assetRefs ?? []).map((ref) => {
        const perceptions = (state.perceptions ?? []).filter((perception) => perception.assetId === ref.assetId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const latest = perceptions[0];
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
    })),
    reviewQueue: executions
      .filter((item) => item.status === "awaiting-review")
      .map((item) => ({
        executionId: item.id,
        socialIntentId: item.socialIntentId,
        affordance: item.affordance,
        target: item.target,
        reason: item.reviewReason,
        publication: item.publication,
      })),
    network: { searches: networkSearches, introductions: networkIntroductions },
    recentEvents: events.slice(0, 12).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      detail: item.detail,
      tone: item.tone,
      time: item.time,
      sourceObjectId: item.sourceObjectId,
    })),
  };
  if (mode === "timeline") {
    result.timeline = [
      ...objects.map((item) => ({ at: item.observedAt ?? item.occurredAt, kind: "observation", id: item.id, objectType: item.objectType, author: item.author, content: item.content, target: item.parentExternalRef })),
      ...(state.perceptions ?? []).filter((item) => item.sessionId === session.id).map((item) => ({ at: item.createdAt, kind: "perception", id: item.id, assetId: item.assetId, socialObjectId: item.socialObjectId, level: item.level, result: item.result, providerId: item.providerId, modelId: item.modelId })),
      ...intents.map((intent) => ({ at: intent.formedAt, kind: "intent", id: intent.id, affordance: intent.affordance, target: intent.target, state: intent.state, validity: intent.validity })),
      ...executions.map((execution) => ({ at: execution.updatedAt, kind: "execution", id: execution.id, affordance: execution.affordance, status: execution.status, mode: execution.mode, target: execution.target, externalRef: execution.externalRef, failure: execution.failure })),
      ...outcomes.map((outcome) => ({ at: outcome.observedAt, kind: "outcome", id: outcome.id, status: outcome.status, evidence: outcome.evidence })),
      ...networkSearches.map((search) => ({ at: search.createdAt, kind: "network-search", id: search.id, status: search.status, query: search.query, candidates: search.candidates, limitation: search.limitation })),
      ...networkIntroductions.map((introduction) => ({ at: introduction.updatedAt, kind: "network-introduction", id: introduction.id, status: introduction.status, candidateActorId: introduction.candidateActorId, socialIntentId: introduction.socialIntentId, executionId: introduction.executionId })),
      ...events.map((item) => ({ at: item.time, kind: "event", id: item.id, title: item.title, detail: item.detail, tone: item.tone })),
    ].sort((left, right) => String(right.at ?? "").localeCompare(String(left.at ?? "")));
  }
  return result;
}

async function requestJson(baseUrl, path, init = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (error) {
    fail(`Could not reach OpenPresence at ${baseUrl}. Is the app running?`, "SERVER_UNAVAILABLE", { cause: error instanceof Error ? error.message : String(error) });
  }
  const body = await response.json().catch(() => undefined);
  if (!response.ok) fail(body?.error ?? `OpenPresence returned HTTP ${response.status}.`, body?.code ?? "SERVER_ERROR", body);
  return body;
}

async function getState(baseUrl) {
  return requestJson(baseUrl, "/api/state");
}

async function postOperation(baseUrl, payload) {
  return requestJson(baseUrl, "/api/state", { method: "POST", body: JSON.stringify(payload) });
}

function sessionForOperation(snapshot, options) {
  return sessionFor(snapshot, options.session);
}

function resolveScenarioValue(value, previousResult) {
  if (typeof value !== "string") return value;
  if (value === "$session") return previousResult?.session?.id ?? previousResult?.result?.session?.id;
  if (value === "$latest-object") return previousResult?.world?.[0]?.externalRef ?? previousResult?.result?.world?.[0]?.externalRef;
  if (value === "$latest-object-id") return previousResult?.world?.[0]?.id ?? previousResult?.result?.world?.[0]?.id;
  if (value === "$latest-inbound") {
    const world = previousResult?.world ?? previousResult?.result?.world ?? [];
    return world.find((item) => !item.actorPresenceId)?.externalRef ?? world[0]?.externalRef;
  }
  return value;
}

function resolveScenarioOptions(options, previousResult) {
  return Object.fromEntries(Object.entries(options ?? {}).map(([key, value]) => [key, resolveScenarioValue(value, previousResult)]));
}

function mimeTypeForPath(path) {
  const extension = extname(path).toLowerCase();
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  })[extension] ?? "application/octet-stream";
}

async function resolveAssetFiles(assets) {
  return Promise.all(assets.map(async (asset) => {
    if (!asset || typeof asset !== "object" || typeof asset.path !== "string" || asset.dataUrl || asset.sourceUrl) return asset;
    const bytes = await readFile(asset.path);
    const mimeType = asset.mimeType ?? mimeTypeForPath(asset.path);
    return { ...asset, name: asset.name ?? asset.path.split(/[\\/]/).pop(), kind: asset.kind ?? (mimeType.startsWith("video/") ? "video" : mimeType === "image/gif" ? "gif" : "image"), mimeType, dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, path: undefined };
  }));
}

async function injectPayload(snapshot, options) {
  const session = sessionForOperation(snapshot, options);
  const action = options.action ?? options.kind ?? "post";
  const content = ["like", "reaction", "repost", "restack"].includes(action)
    ? (typeof options.content === "string" ? options.content.trim() : "")
    : required(options, "content");
  const payload = {
    type: "addSandboxEvent",
    sessionId: session.id,
    actionId: action,
    actorName: required(options, "actor"),
    content,
  };
  if (typeof options.handle === "string") payload.actorHandle = options.handle;
  if (options.profile && typeof options.profile === "object" && !Array.isArray(options.profile)) payload.profile = options.profile;
  if (options.target) payload.targetExternalRef = parseExternalRef(options.target);
  if (options.parent) payload.parentExternalRef = parseExternalRef(options.parent);
  if (options["assets-json"]) {
    const assets = parseJsonOption(options["assets-json"], "assets-json");
    if (!Array.isArray(assets)) fail("--assets-json must contain an array.", "INVALID_ARGUMENT");
    payload.assets = await resolveAssetFiles(assets);
  }
  if (options["observe-only"] === true || options.observeOnly === true) payload.observeOnly = true;
  return payload;
}

async function execute(baseUrl, command, options, positionals) {
  if (command === "start") {
    const next = await postOperation(baseUrl, { type: "startPlayground", presenceId: options.presence, source: options.source ?? "fresh" });
    const startedSessionId = options.session ?? next.playgroundSessions
      ?.filter((session) => !options.presence || session.presenceId === options.presence)
      .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))[0]?.id;
    return projectState(next, startedSessionId, command);
  }
  if (command === "inspect" || command === "status") return projectState(await getState(baseUrl), options.session, "inspect");
  if (command === "timeline") return projectState(await getState(baseUrl), options.session, "timeline");
  if (command === "approve-introduction" || command === "decline-introduction") {
    const current = await getState(baseUrl);
    const id = typeof options.id === "string" ? options.id : positionals[0];
    if (!id) fail("Provide an introduction id with --id or as the first argument.", "INVALID_ARGUMENT");
    const type = command === "approve-introduction" ? "approveSandboxIntroduction" : "declineSandboxIntroduction";
    const next = await postOperation(baseUrl, { type, id });
    return projectState(next, options.session ?? sessionFor(current, options.session).id, command);
  }
  if (command === "reset") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    return projectState(await postOperation(baseUrl, { type: "resetPlayground", sessionId: session.id }), session.id, command);
  }
  if (command === "consider") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    return projectState(await postOperation(baseUrl, { type: "runSandboxPulse", sessionId: session.id }), session.id, command);
  }
  if (command === "advance") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const minutes = options.minutes ?? positionals[0];
    if (minutes === undefined) fail("Missing --minutes.", "INVALID_ARGUMENT");
    return projectState(await postOperation(baseUrl, { type: "advanceSandboxTime", sessionId: session.id, minutes: parseInteger(minutes, "minutes") }), session.id, command);
  }
  if (command === "schedule") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const instruction = required(options, "instruction");
    let day = options.day;
    let time = options.time;
    if (options["minutes-from-now"] !== undefined) {
      const future = new Date(session.virtualNow);
      future.setMinutes(future.getMinutes() + parseInteger(options["minutes-from-now"], "minutes-from-now"));
      day = future.toLocaleDateString("en-US", { weekday: "long" });
      time = future.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (typeof day !== "string" || !day.trim()) fail("Provide --day or --minutes-from-now.", "INVALID_ARGUMENT");
    if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("Provide --time in HH:MM format or use --minutes-from-now.", "INVALID_ARGUMENT");
    const objective = options.objective ?? "usefulness";
    const executionWindow = options.window ?? `${time}–${time}`;
    return projectState(await postOperation(baseUrl, { type: "addSlot", instruction, day, time, objective, executionWindow, presenceId: session.presenceId }), session.id, command);
  }
  if (command === "inject") {
    const current = await getState(baseUrl);
    const payload = await injectPayload(current, options);
    return projectState(await postOperation(baseUrl, payload), payload.sessionId, command);
  }
  if (command === "inspect-media") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const objectId = required(options, "object");
    return projectState(await postOperation(baseUrl, { type: "inspectSandboxMedia", sessionId: session.id, objectId }), session.id, command);
  }
  if (command === "run") {
    const file = positionals[0] ?? options.file;
    if (!file) fail("Provide a scenario JSON file.", "INVALID_ARGUMENT");
    let scenario;
    try {
      scenario = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      fail(`Could not read scenario ${file}.`, "INVALID_SCENARIO", { cause: error instanceof Error ? error.message : String(error) });
    }
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) fail("Scenario must contain a non-empty steps array.", "INVALID_SCENARIO");
    const results = [];
    let scenarioSessionId = typeof options.session === "string" ? options.session : undefined;
    for (const [index, step] of scenario.steps.entries()) {
      if (!step || typeof step.command !== "string") fail(`Scenario step ${index + 1} is missing command.`, "INVALID_SCENARIO");
      const previousResult = results.at(-1)?.result;
      const resolvedOptions = resolveScenarioOptions(step.options, previousResult);
      const stepOptions = {
        ...options,
        ...resolvedOptions,
        ...(Array.isArray(resolvedOptions.assets) ? { "assets-json": JSON.stringify(resolvedOptions.assets) } : {}),
      };
      if (!stepOptions.session && scenarioSessionId) stepOptions.session = scenarioSessionId;
      const result = await execute(baseUrl, step.command, stepOptions, step.args ?? []);
      const projected = result?.result ?? result;
      if (step.command === "start" && projected?.session?.id) scenarioSessionId = projected.session.id;
      results.push({
        index: index + 1,
        command: step.command,
        ...(stepOptions.observeOnly === true ? { observeOnly: true } : {}),
        result,
      });
    }
    return { ok: true, command: "run", scenario: file, steps: results, result: results.at(-1)?.result };
  }
  fail(`Unknown Playground command: ${command}.`, "INVALID_ARGUMENT");
}

function humanize(result) {
  const session = result.result?.session ?? result.session;
  const lastEvent = result.result?.recentEvents?.[0] ?? result.recentEvents?.[0];
  const decisions = result.result?.decisions ?? result.decisions ?? [];
  const latest = decisions[0];
  return [
    `${result.command}: ${result.ok ? "ok" : "failed"}`,
    session ? `session ${session.id} · ${session.channel} · virtual time ${session.virtualNow}` : "",
    latest ? `decision ${latest.affordance} · ${latest.execution?.status ?? "formed"}` : "",
    lastEvent ? `${lastEvent.title}: ${lastEvent.detail}` : "",
  ].filter(Boolean).join("\n");
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (positionals.length === 0 || positionals.includes("help") || options.help) {
    process.stdout.write(HELP);
    return;
  }
  const [scope, command, ...args] = positionals;
  if (scope !== "playground") fail("Only the `playground` scope is available in this version.", "INVALID_ARGUMENT");
  const result = await execute(options.url ?? DEFAULT_URL, command, options, args);
  if (options.human) process.stdout.write(`${humanize(result)}\n`);
  else process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const payload = { ok: false, error: { code: error.code ?? "CLI_ERROR", message: error.message, ...(error.details ? { details: error.details } : {}) } };
  if (process.argv.includes("--human")) process.stderr.write(`${payload.error.message}\n`);
  else process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
});

export { parseArgs, projectState, sessionFor };
