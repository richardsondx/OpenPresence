#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const baseUrl = option("url", process.env.OPENPRESENCE_URL ?? "http://localhost:3000");
const presenceId = option("presence", undefined);
const waitSeconds = Math.max(15, Number(option("wait-seconds", "120")));
const outputPath = option("output", undefined);
const confirmed = args.includes("--confirm-live");

function option(name, fallback) { const index = args.indexOf(`--${name}`); return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback; }
async function request(path, init) { const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error ?? `OpenPresence returned HTTP ${response.status}.`); return body; }
function normalized(value) { return String(value ?? "").replace(/^@/, "").trim().toLowerCase(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function selectedPresence(state) { const id = presenceId ?? state.activePresenceId ?? state.presence?.id; return state.presences?.find((item) => item.id === id) ?? (state.presence?.id === id ? state.presence : undefined); }
function bridgeFor(state, selected) { return state.bridges?.find((item) => item.presenceId === selected?.id && item.channelId === "x" && item.kind === "bridge" && item.state !== "offline"); }
function report(state, selected, bridge, startedAt, trial, execution, mirror, status) { return { ok: status === "PASS_VERIFIED" || status === "WAITING_REVIEW", test: "repost-only-live-capability-trial", environment: "live", presence: { id: selected?.id, name: selected?.name, handle: selected?.handle }, bridge: bridge ? { id: bridge.id, state: bridge.state, adapterStatus: bridge.adapterStatus, accountIdentity: bridge.accountIdentity } : null, startedAt, executionIsolation: { testedCapability: "repost", mode: trial?.executionIsolation?.mode, presenceWide: false, suppressedActs: trial?.candidateAudits?.flatMap((item) => item.suppressedActs ?? []) ?? [] }, decision: trial?.candidateAudits?.[0] ? { acts: trial.candidateAudits[0].acts, rationale: trial.candidateAudits[0].rationale, targetMirrorObjectId: trial.candidateAudits[0].mirrorObjectId } : null, execution: execution ? { id: execution.id, affordance: execution.affordance, connector: execution.connector, status: execution.status, externalRef: execution.externalRef, failure: execution.failure } : null, verifiedSocialMirror: mirror ? { id: mirror.id, objectType: mirror.objectType, externalRef: mirror.externalRef, originExecutionId: mirror.originExecutionId, actorPresenceId: mirror.actorPresenceId } : null, status, noOtherPublicActionsCreated: (state.executions ?? []).filter((item) => item.createdAt >= startedAt && item.capabilityTrialId === trial?.id && item.affordance !== "x.repost").length === 0 }; }

let state = await request("/api/state");
const selected = selectedPresence(state);
if (!selected?.id || selected.channel !== "x") throw new Error("Select an X Presence before running the repost trial.");
const bridge = bridgeFor(state, selected);
const native = state.nativeConnections?.find((item) => item.presenceId === selected.id && item.channelId === "x");
if (!native && !bridge) throw new Error(`No readable Native X connection or live Chrome Bridge is configured for ${selected.handle}.`);
const expectedHandle = normalized(selected.handle);
const actualHandle = normalized(bridge?.accountIdentity?.username ?? native?.account?.username);
const heartbeatAge = bridge?.lastHeartbeatAt ? Date.now() - new Date(bridge.lastHeartbeatAt).getTime() : 0;
const prerequisites = { presence: selected.handle, nativeConnection: native ? { id: native.id, status: native.status, access: native.access } : null, bridgeId: bridge?.id, bridgeStatus: bridge?.adapterStatus, accountMatches: Boolean(actualHandle && actualHandle === expectedHandle), heartbeatFresh: !bridge || heartbeatAge <= 120_000, aiMockDisabled: process.env.OPENPRESENCE_AI_MOCK !== "1" };
if (!confirmed) { process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, test: "repost-only-live-capability-trial", environment: "live", prerequisites, proposedIsolation: { testedCapability: "repost", mode: "auto", presenceWide: false }, nextStep: "Re-run with --confirm-live only after reviewing this scope. The flag authorizes one bounded live trial and may create one public repost." }, null, 2)}\n`); process.exit(0); }
if (!prerequisites.accountMatches || !prerequisites.heartbeatFresh || (bridge && bridge.adapterStatus !== "connected" && !native)) throw new Error(`Live repost trial refused: ${JSON.stringify(prerequisites)}`);
if (!prerequisites.aiMockDisabled) throw new Error("Live repost trial refused while OPENPRESENCE_AI_MOCK=1.");

const startedAt = new Date().toISOString();
state = await request("/api/state", { method: "POST", body: JSON.stringify({ type: "createCapabilityTrial", presenceId: selected.id, capability: "repost", environment: "live", executionMode: "auto" }) });
let trial = state.capabilityTrials?.find((item) => item.presenceId === selected.id);
if (!trial) throw new Error("OpenPresence did not create a capability trial record.");
state = await request("/api/state", { method: "POST", body: JSON.stringify({ type: "startCapabilityTrial", id: trial.id, confirmLive: true }) });
state = await request("/api/state", { method: "POST", body: JSON.stringify({ type: "runCapabilityTrial", id: trial.id }) });
trial = state.capabilityTrials?.find((item) => item.id === trial.id) ?? trial;
let execution = trial.executionId ? state.executions?.find((item) => item.id === trial.executionId) : undefined;
const deadline = Date.now() + waitSeconds * 1_000;
while (Date.now() < deadline && ["active", "discovering", "judging", "awaiting_execution", "awaiting_verification"].includes(trial.status)) { await sleep(1_500); state = await request("/api/state"); trial = state.capabilityTrials?.find((item) => item.id === trial.id) ?? trial; execution = trial.executionId ? state.executions?.find((item) => item.id === trial.executionId) : execution; if (["active", "discovering", "judging"].includes(trial.status)) state = await request("/api/state", { method: "POST", body: JSON.stringify({ type: "runCapabilityTrial", id: trial.id }) }); }
const currentPresence = selectedPresence(state);
const currentBridge = bridgeFor(state, currentPresence);
const mirror = trial.executionId ? state.mirrorObjects?.find((item) => item.originExecutionId === trial.executionId) : undefined;
const status = trial.result ?? (trial.status === "awaiting_execution" ? "WAITING_REVIEW" : "INCONCLUSIVE_NO_OPPORTUNITY");
const result = report(state, currentPresence, currentBridge, startedAt, trial, execution, mirror, status);
if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
