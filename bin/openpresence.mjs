#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { extname } from "node:path";

const DEFAULT_URL = process.env.OPENPRESENCE_URL ?? "http://localhost:3000";

const HELP = `OpenPresence agent CLI

The CLI is sandbox-only and emits JSON by default so another agent can consume it.

Usage:
  openpresence <scope> <command> [options]

Playground commands:
  scenario    List, create, import, export, run, inspect, resume, rerun, or evaluate a Scenario
  start       Start a new Playground session
  inspect     Return the current world, Presence, decisions, and review queue
  inject      Add a simulated social event and let the Agent evaluate it
              (use --observe-only when loading historical replay context)
  inspect-media  Inspect media attached to a simulated object
  consider    Let the Agent evaluate the current simulated world
  advance     Move virtual time and evaluate due Standing Intents
  rate        Set the Sandbox acceleration factor for explicit tick controls
  pause       Pause Sandbox virtual-time processing
  resume      Resume Sandbox virtual-time processing
  stage-outcome  Stage hidden world truth for later virtual-time release
  checkpoint  Persist a portable full-world Sandbox checkpoint
  restore     Restore a persisted Sandbox checkpoint by id
  schedule    Add a Calendar Standing Intent used by later Playground time advances
  timeline    Return the session's auditable event/intent/execution timeline
  rehearse    Consider an original publication and record the result
  feedback    Record preference evidence for the latest or selected rehearsal
  assignment  Create, start, continue, inspect, or cancel a Sandbox Assignment
  approve-introduction  Approve a consent-aware sandbox introduction
  decline-introduction  Decline a proposed sandbox introduction
  reset       Reset the selected session to a fresh simulated world
  run         Execute a JSON scenario file step by step

Schedule commands:
  list         Return Presence-scoped standing intentions and Assignments
  add          Add a Consider standing intention or a scheduled Assignment
  edit         Edit an existing Consider standing intention
  run          Evaluate one standing intention now (Sandbox-safe)
  cancel       Cancel a scheduled Assignment

Watching commands:
  list         Return Presence-scoped Watches and source status
  add          Add a creator, topic, conversation, or opportunity Watch
  remove       Remove a Watch

Common options:
  --url <url>          OpenPresence server URL (default: $OPENPRESENCE_URL or localhost:3000)
  --session <id>       Playground session id
  --presence <id>      Presence id when starting a session
  --seed <value>       Deterministic scenario seed recorded in the Sandbox session
  --factor <number>     Positive Sandbox acceleration factor (for rate)
  --cause-event <id>    Temporal cause event for stage-outcome
  --visible-after <n>   Minutes until staged outcome is observable
  --value-json <json>   JSON value held until staged outcome release
  --label <text>        Optional checkpoint label
  --checkpoint <id>     Persisted checkpoint id for restore
  --responsibility <mode>  Schedule mode: consider (default) or assign
  --id <id>            Existing Watch, Assignment, Calendar, or rehearsal id
  --reasons <list>     Comma-separated preference reasons for feedback
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
  openpresence playground rate --session session_123 --factor 24
  openpresence playground assignment create --instruction "Produce 2 original posts about useful agent decisions"
  openpresence schedule add --instruction "Teach one useful idea" --day Tuesday --time 08:00
  openpresence watching add --query "@AlexHormozi" --purpose "Study offer clarity"
  openpresence playground run scenarios/reply.json
  openpresence playground scenario list
  openpresence playground scenario create --prompt "Rehearse a privacy-sensitive hostile reply"
  openpresence playground scenario run <scenario-id> --presence presence_123
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

function selectedPresence(state, explicitPresenceId) {
  const presence = explicitPresenceId
    ? state.presences?.find((item) => item.id === explicitPresenceId) ?? (state.presence?.id === explicitPresenceId ? state.presence : undefined)
    : state.presences?.find((item) => item.id === state.activePresenceId) ?? state.presence;
  if (!presence) fail("No Presence exists. Create an Agent and Presence first.", "NO_PRESENCE");
  return presence;
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
      seed: session.seed,
      status: session.status,
      channel: session.channelId,
      virtualNow: session.virtualNow,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      evaluatedSlotIds: session.evaluatedSlotIds ?? [],
      judgedObjectIds: session.judgedObjectIds ?? [],
      checkpoints: (state.sandboxCheckpoints ?? []).filter((checkpoint) => checkpoint.sessionId === session.id).map(({ snapshot: _snapshot, ...checkpoint }) => checkpoint),
      temporal: session.temporalSnapshot ? {
        now: new Date(session.temporalSnapshot.now).toISOString(),
        paused: session.temporalSnapshot.paused,
        acceleration: session.temporalSnapshot.acceleration,
        events: session.temporalSnapshot.events,
        outcomes: session.temporalSnapshot.outcomes,
        retries: session.temporalSnapshot.retries,
      } : undefined,
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
    assignments: (state.assignments ?? [])
      .filter((item) => item.sessionId === session.id || (item.status === "draft" && item.presenceId === presence.id))
      .map((item) => ({
        id: item.id,
        instruction: item.instruction,
        status: item.status,
        environment: item.environment,
        presenceId: item.presenceId,
        sessionId: item.sessionId,
        schedule: item.schedule,
        progress: item.progress,
        rejectedCandidates: item.rejectedCandidates,
        lastOutcome: item.lastOutcome,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    rehearsals: (state.originalPostRehearsals ?? [])
      .filter((item) => item.sessionId === session.id)
      .map((item) => ({ ...item })),
    preferenceEvidence: (state.preferenceEvidence ?? [])
      .filter((item) => item.sessionId === session.id)
      .map((item) => ({ ...item })),
    recentEvents: events.slice(0, 12).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      detail: item.detail,
      tone: item.tone,
      time: item.time,
      sourceObjectId: item.sourceObjectId,
    })),
    // The temporal trace is the authoritative causal spine for Playground
    // verification. It is session-scoped and only contains truth released by
    // the kernel at or after its causal event.
    trajectory: (session.temporalSnapshot?.trajectory ?? []).map((record) => ({
      sequence: record.sequence,
      time: new Date(record.time).toISOString(),
      kind: record.kind,
      eventId: record.eventId,
      data: record.data,
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

function projectSchedule(state, explicitPresenceId, mode = "list") {
  const presence = selectedPresence(state, explicitPresenceId);
  const calendar = (state.calendar ?? [])
    .filter((item) => item.presence === presence.id)
    .map((item) => ({
      id: item.id,
      instruction: item.instruction,
      label: item.label,
      day: item.day,
      time: item.time,
      objective: item.objective,
      executionWindow: item.executionWindow,
      enabled: item.enabled,
      lastEvaluatedAt: item.lastEvaluatedAt,
      standingIntentId: item.standingIntentId,
    }));
  const standingIntents = (state.standingIntents ?? [])
    .filter((item) => !item.presenceId || item.presenceId === presence.id)
    .map((item) => ({
      id: item.id,
      instruction: item.instruction,
      objective: item.objective,
      status: item.status,
      trigger: item.trigger,
      executionWindow: item.executionWindow,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  const assignments = (state.assignments ?? [])
    .filter((item) => item.presenceId === presence.id)
    .map((item) => ({
      id: item.id,
      instruction: item.instruction,
      status: item.status,
      environment: item.environment,
      sessionId: item.sessionId,
      schedule: item.schedule,
      progress: item.progress,
      rejectedCandidates: item.rejectedCandidates,
      lastOutcome: item.lastOutcome,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  const intents = (state.socialIntents ?? []).filter((item) => item.presenceId === presence.id);
  const executions = (state.executions ?? []).filter((item) => item.presenceId === presence.id);
  const outcomes = (state.outcomes ?? []).filter((item) => item.presenceId === presence.id);
  const events = (state.events ?? []).filter((item) => item.presenceId === presence.id).slice(0, 12);
  return {
    ok: true,
    command: mode,
    environment: "sandbox",
    presence: { id: presence.id, name: presence.name, handle: presence.handle, channel: presence.channel, connectionMode: presence.connectionMode },
    calendar,
    standingIntents,
    assignments,
    evaluations: intents.map((intent) => ({
      id: intent.id,
      affordance: intent.affordance,
      standingIntentId: intent.standingIntentId,
      state: intent.state,
      formedAt: intent.formedAt,
      publication: intent.publicationId ? state.publications?.find((item) => item.id === intent.publicationId)?.payload : undefined,
      execution: executions.find((item) => item.socialIntentId === intent.id),
      outcome: outcomes.find((item) => item.socialIntentId === intent.id),
    })),
    recentEvents: events.map((item) => ({ id: item.id, title: item.title, detail: item.detail, tone: item.tone, time: item.time })),
  };
}

function projectWatching(state, explicitPresenceId, mode = "list") {
  const presence = selectedPresence(state, explicitPresenceId);
  const watches = (state.watches ?? [])
    .filter((item) => item.presenceId === presence.id)
    .map((item) => ({
      id: item.id,
      title: item.title,
      query: item.query,
      purpose: item.purpose,
      kind: item.kind,
      channel: item.channel,
      observation: item.observation,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  return {
    ok: true,
    command: mode,
    environment: "sandbox",
    presence: { id: presence.id, name: presence.name, handle: presence.handle, channel: presence.channel },
    watches,
    noticed: [],
    observationState: watches.some((item) => item.observation.observedCount > 0) ? "observations-available" : "no-observations",
  };
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

function scheduleFields(options, existing, baseDate = new Date()) {
  let day = options.day ?? existing?.day;
  let time = options.time ?? existing?.time;
  if (options["minutes-from-now"] !== undefined) {
    const future = new Date(baseDate);
    future.setMinutes(future.getMinutes() + parseInteger(options["minutes-from-now"], "minutes-from-now"));
    day = future.toLocaleDateString("en-US", { weekday: "long" });
    time = future.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (typeof day !== "string" || !day.trim()) fail("Provide --day or --minutes-from-now.", "INVALID_ARGUMENT");
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("Provide --time in HH:MM format or use --minutes-from-now.", "INVALID_ARGUMENT");
  const executionWindow = options.window ?? existing?.executionWindow ?? `${time}–${time}`;
  return { day: day.trim(), time, executionWindow };
}

function idOption(options, positionals, label) {
  const id = typeof options.id === "string" ? options.id : positionals[0];
  if (!id) fail(`Provide ${label} with --id or as the first argument.`, "INVALID_ARGUMENT");
  return id;
}

async function executePlayground(baseUrl, command, options, positionals) {
  if (command === "scenario") {
    const subcommand = positionals[0] ?? "list";
    const current = await getState(baseUrl);
    const presence = selectedPresence(current, options.presence);
    const scenarios = (current.scenarios ?? []).filter((scenario) => scenario.ownerScope !== "presence" || scenario.presenceId === presence.id);
    if (["list", "status"].includes(subcommand)) {
      return { ok: true, command: "scenario list", presence: { id: presence.id, name: presence.name, channel: presence.channel }, scenarios: scenarios.map((scenario) => ({ ...scenario, version: (current.scenarioVersions ?? []).find((version) => version.id === scenario.currentVersionId), runs: (current.scenarioRuns ?? []).filter((run) => run.scenarioId === scenario.id && run.presenceId === presence.id).map((run) => ({ ...run, evaluation: (current.scenarioEvaluations ?? []).find((evaluation) => evaluation.runId === run.id) })) })) };
    }
    if (["create", "new"].includes(subcommand)) {
      const prompt = typeof options.prompt === "string" ? options.prompt : positionals.slice(1).join(" ");
      if (!prompt.trim()) fail("Provide --prompt or the Scenario description after `scenario create`.", "INVALID_ARGUMENT");
      const next = await postOperation(baseUrl, { type: "createScenarioFromPrompt", prompt: prompt.trim(), presenceId: presence.id });
      const scenario = next.scenarios?.[0];
      return { ok: true, command: "scenario create", scenario, version: next.scenarioVersions?.find((version) => version.id === scenario?.currentVersionId) };
    }
    if (["import"].includes(subcommand)) {
      const file = typeof options.file === "string" ? options.file : positionals[1];
      if (!file) fail("Provide a Scenario JSON file after `scenario import` or with --file.", "INVALID_ARGUMENT");
      let payload;
      try { payload = JSON.parse(await readFile(file, "utf8")); } catch (error) { fail(`Could not read Scenario ${file}.`, "INVALID_SCENARIO", { cause: error instanceof Error ? error.message : String(error) }); }
      const next = await postOperation(baseUrl, { type: "importScenario", payload, presenceId: presence.id });
      const scenario = next.scenarios?.[0];
      return { ok: true, command: "scenario import", scenario, version: next.scenarioVersions?.find((version) => version.id === scenario?.currentVersionId) };
    }
    if (["export"].includes(subcommand)) {
      const scenarioId = idOption(options, positionals.slice(1), "a Scenario id");
      const scenario = scenarios.find((item) => item.id === scenarioId);
      if (!scenario) fail(`Scenario ${scenarioId} was not found.`, "NOT_FOUND");
      return { ok: true, command: "scenario export", scenario, version: (current.scenarioVersions ?? []).find((version) => version.id === scenario.currentVersionId) };
    }
    if (["run", "start", "resume", "rerun", "evaluate", "inspect"].includes(subcommand)) {
      const id = idOption(options, positionals.slice(1), subcommand === "inspect" ? "a Scenario Run id" : "a Scenario or Run id");
      if (subcommand === "run" || subcommand === "start") {
        const next = await postOperation(baseUrl, { type: "startScenarioRun", scenarioId: id, presenceId: presence.id, ...(typeof options.seed === "string" ? { seed: options.seed } : {}) });
        const run = next.scenarioRuns?.[0];
        return { ok: true, command: "scenario run", run, scenario: next.scenarios?.find((item) => item.id === run?.scenarioId), version: next.scenarioVersions?.find((version) => version.id === run?.scenarioVersionId), evaluation: next.scenarioEvaluations?.find((evaluation) => evaluation.runId === run?.id) };
      }
      const operationType = subcommand === "resume" ? "resumeScenarioRun" : subcommand === "rerun" ? "rerunScenario" : subcommand === "evaluate" ? "evaluateScenarioRun" : undefined;
      const next = operationType ? await postOperation(baseUrl, { type: operationType, runId: id }) : current;
      const run = next.scenarioRuns?.find((item) => item.id === id) ?? (subcommand === "rerun" ? next.scenarioRuns?.[0] : undefined);
      return { ok: true, command: `scenario ${subcommand}`, run, scenario: next.scenarios?.find((item) => item.id === run?.scenarioId), version: next.scenarioVersions?.find((version) => version.id === run?.scenarioVersionId), provenance: next.scenarioRunProvenance?.find((item) => item.id === run?.provenanceId), evaluation: next.scenarioEvaluations?.find((evaluation) => evaluation.runId === run?.id), trace: next.events?.filter((event) => event.sessionId === run?.playgroundSessionId) };
    }
    fail(`Unknown Scenario command: ${subcommand}.`, "INVALID_ARGUMENT");
  }
  if (command === "start") {
    const before = await getState(baseUrl);
    const priorSessionIds = new Set((before.playgroundSessions ?? []).map((session) => session.id));
    const next = await postOperation(baseUrl, { type: "startPlayground", presenceId: options.presence, source: options.source ?? "fresh", seed: typeof options.seed === "string" ? options.seed : undefined });
    // The API prepends the newly-created session. Do not infer recency from
    // createdAt: seeded sessions intentionally share a deterministic virtual
    // timestamp, so sorting can select an older world and contaminate replay.
    const newSessions = (next.playgroundSessions ?? []).filter((session) => !priorSessionIds.has(session.id) && (!options.presence || session.presenceId === options.presence));
    const startedSessionId = options.session
      ?? newSessions.find((session) => !options.seed || session.seed === options.seed)?.id
      ?? newSessions[0]?.id
      ?? next.playgroundSessions?.find((session) => !options.presence || session.presenceId === options.presence)?.id;
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
  if (["rate", "pause", "resume"].includes(command)) {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    if (command === "rate") {
      const factor = Number(options.factor ?? positionals[0]);
      if (!Number.isFinite(factor) || factor <= 0) fail("Provide a positive --factor.", "INVALID_ARGUMENT");
      return projectState(await postOperation(baseUrl, { type: "setSandboxAcceleration", sessionId: session.id, factor }), session.id, command);
    }
    return projectState(await postOperation(baseUrl, { type: "setSandboxPaused", sessionId: session.id, paused: command === "pause" }), session.id, command);
  }
  if (command === "stage-outcome") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const causeEventId = required(options, "cause-event");
    const visibleAfterMinutes = parseInteger(options["visible-after"] ?? positionals[0], "visible-after");
    const value = typeof options["value-json"] === "string" ? parseJsonOption(options["value-json"], "value-json") : undefined;
    return projectState(await postOperation(baseUrl, { type: "stageSandboxOutcome", sessionId: session.id, causeEventId, visibleAfterMinutes, value }), session.id, command);
  }
  if (command === "checkpoint") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    return projectState(await postOperation(baseUrl, { type: "createSandboxCheckpoint", sessionId: session.id, label: typeof options.label === "string" ? options.label : undefined }), session.id, command);
  }
  if (command === "restore") {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const checkpointId = required(options, "checkpoint");
    return projectState(await postOperation(baseUrl, { type: "restoreSandboxCheckpoint", sessionId: session.id, checkpointId }), session.id, command);
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
  if (["rehearse", "consider-original"].includes(command)) {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const next = await postOperation(baseUrl, { type: "considerOriginalPublication", sessionId: session.id, inspiration: typeof options.inspiration === "string" ? options.inspiration : undefined });
    return projectState(next, session.id, "rehearse");
  }
  if (["feedback", "calibrate"].includes(command)) {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const attempt = typeof options.attempt === "string"
      ? options.attempt
      : typeof options.id === "string"
        ? options.id
        : current.originalPostRehearsals?.find((item) => item.sessionId === session.id)?.id;
    if (!attempt) fail("No rehearsal exists to calibrate. Run `playground rehearse` first.", "NO_REHEARSAL");
    const reaction = required(options, "reaction");
    const reasons = typeof options.reasons === "string" ? options.reasons.split(",").map((item) => item.trim()).filter(Boolean) : undefined;
    const next = await postOperation(baseUrl, { type: "recordPreferenceEvidence", sessionId: session.id, attemptId: attempt, reaction, reasons, note: typeof options.note === "string" ? options.note : undefined });
    return projectState(next, session.id, "feedback");
  }
  if (["assignment", "assign", "start-assignment", "work-assignment", "cancel-assignment"].includes(command)) {
    const current = await getState(baseUrl);
    const session = sessionForOperation(current, options);
    const subcommand = command === "assignment" ? (positionals[0] ?? "inspect") : command.replace("-assignment", "");
    if (subcommand === "inspect" || subcommand === "list" || subcommand === "status") return projectState(current, session.id, "assignment");
    if (["create", "add"].includes(subcommand)) {
      const instruction = required(options, "instruction");
      const schedule = options.day || options.time || options["minutes-from-now"] !== undefined ? scheduleFields(options, undefined, new Date(session.virtualNow)) : undefined;
      const next = await postOperation(baseUrl, { type: "createAssignment", instruction, presenceId: session.presenceId, sessionId: session.id, environment: "sandbox", ...(schedule ? { schedule } : {}) });
      return projectState(next, session.id, "assignment");
    }
    const assignmentId = idOption(options, positionals.slice(command === "assignment" ? 1 : 0), "an Assignment id");
    if (subcommand === "start" || subcommand === "run") {
      const next = await postOperation(baseUrl, { type: "startAssignment", id: assignmentId, sessionId: session.id });
      return projectState(next, session.id, "assignment");
    }
    if (subcommand === "work" || subcommand === "continue") {
      const next = await postOperation(baseUrl, { type: "workAssignment", id: assignmentId, sessionId: session.id });
      return projectState(next, session.id, "assignment");
    }
    if (subcommand === "cancel") {
      const next = await postOperation(baseUrl, { type: "cancelAssignment", id: assignmentId });
      return projectState(next, session.id, "assignment");
    }
    fail(`Unknown Playground Assignment command: ${subcommand}.`, "INVALID_ARGUMENT");
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
      const scopedCommand = typeof step.command === "string" && step.command.includes(".") ? step.command.split(".") : undefined;
      const stepScope = step.scope ?? scopedCommand?.[0] ?? "playground";
      const stepCommand = scopedCommand?.[1] ?? step.command;
      const result = await executeScope(baseUrl, stepScope, stepCommand, stepOptions, step.args ?? []);
      const projected = result?.result ?? result;
      if (stepScope === "playground" && stepCommand === "start" && projected?.session?.id) scenarioSessionId = projected.session.id;
      results.push({
        index: index + 1,
        scope: stepScope,
        command: stepCommand,
        ...(stepOptions.observeOnly === true ? { observeOnly: true } : {}),
        result,
      });
    }
    return { ok: true, command: "run", scenario: file, steps: results, result: results.at(-1)?.result };
  }
  fail(`Unknown Playground command: ${command}.`, "INVALID_ARGUMENT");
}

async function executeSchedule(baseUrl, command = "list", options, positionals) {
  const current = await getState(baseUrl);
  if (["list", "inspect", "status"].includes(command)) return projectSchedule(current, options.presence, "list");
  if (["add", "create", "assign"].includes(command)) {
    const presence = selectedPresence(current, options.presence);
    const instruction = required(options, "instruction");
    const schedule = scheduleFields(options, undefined, new Date());
    const responsibility = options.assign === true || command === "assign" || options.responsibility === "assign" ? "assign" : "consider";
    if (responsibility === "assign") {
      const session = options.session ? sessionFor(current, options.session) : undefined;
      if (session && session.presenceId !== presence.id) fail("--session must belong to the selected --presence.", "INVALID_ARGUMENT");
      const next = await postOperation(baseUrl, { type: "createAssignment", instruction, presenceId: presence.id, environment: "sandbox", ...(session ? { sessionId: session.id } : {}), schedule });
      return projectSchedule(next, presence.id, "add");
    }
    const next = await postOperation(baseUrl, { type: "addSlot", instruction, day: schedule.day, time: schedule.time, objective: options.objective ?? "usefulness", executionWindow: schedule.executionWindow, presenceId: presence.id });
    return projectSchedule(next, presence.id, "add");
  }
  if (command === "edit") {
    const id = idOption(options, positionals, "a Calendar id");
    const slot = current.calendar?.find((item) => item.id === id);
    if (!slot) fail(`Calendar item ${id} was not found.`, "NOT_FOUND");
    const presence = selectedPresence(current, options.presence ?? slot.presence);
    const schedule = scheduleFields(options, slot, new Date());
    const next = await postOperation(baseUrl, { type: "editSlot", id, instruction: typeof options.instruction === "string" ? options.instruction : slot.instruction, day: schedule.day, time: schedule.time, objective: options.objective ?? slot.objective ?? "usefulness", executionWindow: schedule.executionWindow });
    return projectSchedule(next, presence.id, "edit");
  }
  if (command === "run" || command === "evaluate") {
    const id = idOption(options, positionals, "a Calendar id");
    const slot = current.calendar?.find((item) => item.id === id);
    if (!slot) fail(`Calendar item ${id} was not found.`, "NOT_FOUND");
    const presence = selectedPresence(current, slot.presence);
    const hasLiveNative = (current.nativeConnections ?? []).some((item) => item.presenceId === presence.id && item.status === "connected" && item.access === "read-write");
    const hasLiveBridge = (current.bridges ?? []).some((item) => item.presenceId === presence.id && item.state !== "offline");
    if (presence.connectionMode !== "sandbox" || hasLiveNative || hasLiveBridge) fail("The CLI only evaluates Schedule items in Sandbox mode; live connector execution is blocked.", "LIVE_SCOPE_BLOCKED");
    const next = await postOperation(baseUrl, { type: "runSlot", id, scheduled: options.scheduled === true });
    return projectSchedule(next, presence.id, "run");
  }
  if (["cancel", "cancel-assignment"].includes(command)) {
    const id = idOption(options, positionals, "an Assignment id");
    const assignment = current.assignments?.find((item) => item.id === id);
    if (!assignment) fail(`Assignment ${id} was not found.`, "NOT_FOUND");
    const next = await postOperation(baseUrl, { type: "cancelAssignment", id });
    return projectSchedule(next, assignment.presenceId, "cancel");
  }
  fail(`Unknown Schedule command: ${command}.`, "INVALID_ARGUMENT");
}

async function executeWatching(baseUrl, command = "list", options, positionals) {
  const current = await getState(baseUrl);
  if (["list", "inspect", "status"].includes(command)) return projectWatching(current, options.presence, "list");
  if (["add", "create"].includes(command)) {
    const presence = selectedPresence(current, options.presence);
    const query = typeof options.query === "string" ? options.query : positionals[0];
    if (typeof query !== "string" || !query.trim()) fail("Provide --query or the Watch description as the first argument.", "INVALID_ARGUMENT");
    const next = await postOperation(baseUrl, { type: "createWatch", presenceId: presence.id, query: query.trim(), purpose: typeof options.purpose === "string" ? options.purpose : undefined });
    return projectWatching(next, presence.id, "add");
  }
  if (["remove", "delete"].includes(command)) {
    const id = idOption(options, positionals, "a Watch id");
    const watch = current.watches?.find((item) => item.id === id);
    if (!watch) fail(`Watch ${id} was not found.`, "NOT_FOUND");
    const next = await postOperation(baseUrl, { type: "deleteWatch", id });
    return projectWatching(next, watch.presenceId, "remove");
  }
  fail(`Unknown Watching command: ${command}.`, "INVALID_ARGUMENT");
}

async function executeScope(baseUrl, scope, command, options, positionals) {
  if (scope === "playground") return executePlayground(baseUrl, command, options, positionals);
  if (scope === "schedule") return executeSchedule(baseUrl, command, options, positionals);
  if (scope === "watching") return executeWatching(baseUrl, command, options, positionals);
  fail(`Unknown scope: ${scope}. Use playground, schedule, or watching.`, "INVALID_ARGUMENT");
}

function humanize(result) {
  const session = result.result?.session ?? result.session;
  const lastEvent = session ? result.result?.recentEvents?.[0] ?? result.recentEvents?.[0] : undefined;
  const decisions = result.result?.decisions ?? result.decisions ?? [];
  const latest = decisions[0];
  const watches = result.result?.watches ?? result.watches;
  const calendar = result.result?.calendar ?? result.calendar;
  const assignments = result.result?.assignments ?? result.assignments;
  return [
    `${result.command}: ${result.ok ? "ok" : "failed"}`,
    session ? `session ${session.id} · ${session.channel} · virtual time ${session.virtualNow}` : "",
    watches ? `${watches.length} watch${watches.length === 1 ? "" : "es"}` : "",
    calendar ? `${calendar.length} calendar item${calendar.length === 1 ? "" : "s"}` : "",
    assignments ? `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}` : "",
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
  const result = await executeScope(options.url ?? DEFAULT_URL, scope, command ?? (scope === "playground" ? undefined : "list"), options, args);
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
