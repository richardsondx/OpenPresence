#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifyApp = path.join(root, ".agents/skills/verify-app/scripts/verify-app.mjs");
const fixturePath = path.join(root, "verification/fixtures/claim-chat-surface-v1.json");
const verifierVersion = "verification-slice.v1";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [key, value] = item.slice(2).split("=", 2);
    const next = argv[index + 1];
    options[key] = value ?? (next && !next.startsWith("--") ? argv[++index] : true);
  }
  return options;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) { return crypto.createHash("sha256").update(canonical(value)).digest("hex"); }

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [command, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      let parsed;
      try { parsed = out ? JSON.parse(out) : undefined; } catch { parsed = { raw: out }; }
      resolve({ code: code ?? 1, stdout: parsed, stderr: err });
    });
  });
}

function runExecutable(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      let parsed;
      try { parsed = out ? JSON.parse(out) : undefined; } catch { parsed = { raw: out }; }
      resolve({ code: code ?? 1, stdout: parsed, stderr: err });
    });
  });
}

async function fileFingerprint(paths) {
  const contents = [];
  for (const item of paths) contents.push([item, await fs.readFile(path.join(root, item), "utf8")]);
  return digest(contents);
}

async function stopWorker(env) {
  await run(verifyApp, ["stop"], env);
}

async function runWorker({ workerId, port, runDir, plan, inputFingerprint }) {
  const runtimeDir = path.join(runDir, workerId);
  const env = { ...process.env, OPENPRESENCE_VERIFY_DIR: runtimeDir, OPENPRESENCE_VERIFY_PORT: String(port), OPENPRESENCE_JEV_MODE: "off" };
  await fs.mkdir(path.join(runtimeDir, "artifacts"), { recursive: true });
  await fs.copyFile(fixturePath, path.join(runtimeDir, "artifacts", "fixture.json"));
  const startedAt = Date.now();
  const start = await run(verifyApp, ["start"], env);
  const assertions = [];
  const artifacts = [path.join(runtimeDir, "artifacts", "fixture.json")];
  let route = "/chat";
  let visibleTextSummary = "";
  let stateSummary = "";
  let consoleSummary = [];
  let networkSummaryValue = {};
  let status = "PASS";
  let failure;
  try {
    if (start.code !== 0) throw new Error(start.stderr || "isolated app failed to start");
    const open = await run(verifyApp, ["open", "chat"], env);
    const snapshotPath = path.join(runtimeDir, "artifacts", "snapshot.json");
    await fs.writeFile(snapshotPath, `${JSON.stringify(open.stdout ?? {}, null, 2)}\n`);
    artifacts.push(snapshotPath);
    route = open.stdout?.route ?? route;
    visibleTextSummary = open.stdout?.heading ?? open.stdout?.title ?? "Chat opened";
    if (open.code !== 0) throw new Error(open.stderr || "chat route did not open");
    const snapshot = await run(verifyApp, ["snapshot", "--route", route], env);
    const snapshotArtifact = path.join(runtimeDir, "artifacts", "dom-snapshot.json");
    await fs.writeFile(snapshotArtifact, `${JSON.stringify(snapshot.stdout ?? {}, null, 2)}\n`);
    artifacts.push(snapshotArtifact);
    if (snapshot.code !== 0) throw new Error(snapshot.stderr || "DOM snapshot failed");
    const bodyText = snapshot.stdout?.snapshot?.bodyText ?? "";
    visibleTextSummary = bodyText.replace(/\s+/g, " ").slice(0, 1000);
    assertions.push({ id: "chat-route-open", passed: true, detail: route });
    assertions.push({ id: "chat-visible-text", passed: bodyText.length > 0, detail: bodyText.length > 0 ? "visible text captured" : "empty body text" });
    if (!bodyText.length) throw new Error("chat surface returned no visible text");
    const state = await run(verifyApp, ["state", "--projection", "summary"], env);
    const stateArtifact = path.join(runtimeDir, "artifacts", "state.json");
    await fs.writeFile(stateArtifact, `${JSON.stringify(state.stdout ?? {}, null, 2)}\n`);
    artifacts.push(stateArtifact);
    stateSummary = JSON.stringify({ ok: state.stdout?.ok, projection: state.stdout?.projection, workspaceRevision: state.stdout?.workspaceRevision ?? state.stdout?.state?.workspaceRevision ?? null }).slice(0, 1200);
    if (state.code !== 0) throw new Error(state.stderr || "state projection failed");
    assertions.push({ id: "state-projection", passed: true, detail: "isolated persisted state readable" });
    const screenshot = await run(verifyApp, ["screenshot", "--path", path.join(runtimeDir, "artifacts", "chat.png")], env);
    if (screenshot.code === 0) artifacts.push(path.join(runtimeDir, "artifacts", "chat.png"));
    const consoleEvents = await run(verifyApp, ["console"], env);
    const networkSummary = await run(verifyApp, ["network-summary"], env);
    const consoleArtifact = path.join(runtimeDir, "artifacts", "console.json");
    const networkArtifact = path.join(runtimeDir, "artifacts", "network-summary.json");
    await fs.writeFile(consoleArtifact, `${JSON.stringify(consoleEvents.stdout ?? {}, null, 2)}\n`);
    await fs.writeFile(networkArtifact, `${JSON.stringify(networkSummary.stdout ?? {}, null, 2)}\n`);
    artifacts.push(consoleArtifact, networkArtifact);
    consoleSummary = Array.isArray(consoleEvents.stdout?.events) ? consoleEvents.stdout.events.filter((event) => event.level === "error").slice(0, 12).map((event) => event.text) : [];
    networkSummaryValue = networkSummary.stdout?.byStatus ?? {};
  } catch (error) {
    status = "FAILURE";
    failure = error instanceof Error ? error.message : String(error);
    assertions.push({ id: "worker-failure", passed: false, detail: failure });
  } finally {
    await stopWorker(env);
  }
  const completedAt = Date.now();
  return {
    schemaVersion: "openpresence-verification-evidence.v1",
    claimId: plan.claimId,
    verificationNodeId: `${workerId}:app-and-browser`,
    executor: "verify-app",
    inputFingerprint,
    environmentFingerprint: digest({ node: process.version, platform: process.platform, port, runtimeDir, verifierVersion }),
    status,
    assertions,
    durationMs: completedAt - startedAt,
    artifacts,
    causalRefs: [{ kind: "verification-plan", id: plan.planId }, { kind: "fixture", id: "claim-chat-surface-v1" }],
    freshVsCached: "fresh",
    failure: failure ? { message: failure, runtimeDir, serverLog: path.join(runtimeDir, "server.log") } : null,
    route,
    visibleTextSummary,
    consoleSummary,
    networkSummary: networkSummaryValue,
    trajectoryStateSummary: stateSummary
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options["jev-mode"] ?? process.env.OPENPRESENCE_JEV_MODE ?? "shadow");
  if (!["off", "shadow", "active"].includes(mode)) throw new Error("--jev-mode must be off, shadow, or active");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.resolve(String(options.output ?? path.join(os.tmpdir(), `openpresence-verification-slice-${runId}`)));
  await fs.mkdir(runDir, { recursive: true });
  const plan = {
    schemaVersion: "openpresence-verification-plan.v1",
    planId: `plan:${runId}`,
    claimId: "claim:chat-surface-projection",
    affectedCapability: "chat-surface-projection",
    selectedBecause: ["changed capability maps to the Chat route and persisted state projection", "verification must cross the real app/browser boundary"],
    unknownImpactPolicy: "widen-to-all-local-nodes",
    nodes: [
      { id: "sandbox-fixture-integrity", executor: "deterministic", reason: "validate the reusable fixture before stateful jobs", cacheable: true },
      { id: "app-and-browser", executor: "verify-app", reason: "prove persisted state and visible Chat projection through the real running app", cacheable: false }
    ],
    mandatory: ["deterministic state assertions", "isolated app/browser evidence", "JEV triage after deterministic evidence"],
    createdAt: new Date().toISOString()
  };
  const inputFingerprint = await fileFingerprint(["verification/fixtures/claim-chat-surface-v1.json", "app/client-page.tsx", "app/chat-attention.tsx", "lib/chat-activity-presentation.ts", "lib/runtime.ts", ".agents/skills/verify-app/scripts/verify-app.mjs", ".agents/skills/verify-app/scripts/jev-adapter.mjs"]);
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  plan.inputFingerprint = inputFingerprint;
  plan.environmentFingerprint = digest({ node: process.version, platform: process.platform, verifierVersion, mode });
  plan.cacheKey = digest({ code: inputFingerprint, fixture: digest(fixture), scenario: "chat-surface-v1", environment: plan.environmentFingerprint, verifierVersion });
  await fs.writeFile(path.join(runDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  const fixtureRecord = { schemaVersion: "openpresence-verification-evidence.v1", claimId: plan.claimId, verificationNodeId: "sandbox-fixture-integrity", executor: "deterministic", inputFingerprint: digest(fixture), environmentFingerprint: plan.environmentFingerprint, status: fixture.capability === plan.affectedCapability && fixture.externalWorldProof === false ? "PASS" : "FAIL", assertions: [{ id: "fixture-contract", passed: fixture.capability === plan.affectedCapability && fixture.externalWorldProof === false, detail: "fixture is bounded and cannot certify external outcomes" }], durationMs: 0, artifacts: [fixturePath], causalRefs: [{ kind: "verification-plan", id: plan.planId }], freshVsCached: "fresh" };
  const workers = await Promise.all([runWorker({ workerId: "worker-a", port: Number(options.portA ?? 3411), runDir, plan, inputFingerprint }), runWorker({ workerId: "worker-b", port: Number(options.portB ?? 3412), runDir, plan, inputFingerprint })]);
  const deterministicEvidence = [fixtureRecord, ...workers];
  const ultrafastEnabled = options["with-jev-ultrafast"] === true || String(process.env.OPENPRESENCE_JEV_ULTRAFAST ?? "") === "1";
  let ultrafast = null;
  if (ultrafastEnabled) {
    const probeEnv = { ...process.env, OPENPRESENCE_VERIFY_DIR: path.join(runDir, "worker-a"), OPENPRESENCE_VERIFY_PORT: String(options.portA ?? 3411) };
    const probeRuntime = path.join(runDir, "worker-a", "evidence", "jev-ultrafast");
    const probeStart = await run(verifyApp, ["start"], probeEnv);
    if (probeStart.code !== 0) {
      ultrafast = { finalProbeState: "INDETERMINATE", error: probeStart.stderr || "JEV-ultrafast probe runtime failed to start" };
    } else if (!process.env.BU_CDP_URL && !process.env.OPENPRESENCE_JEV_CDP_URL) {
      ultrafast = { finalProbeState: "SAFETY_STOP", error: "JEV-ultrafast requires BU_CDP_URL or OPENPRESENCE_JEV_CDP_URL for an isolated CDP browser" };
      await run(verifyApp, ["stop"], probeEnv);
    } else {
      const probe = await runExecutable("uv", ["run", "--project", "verification/jev-ultrafast", "--locked", "python", "verification/jev-ultrafast/run_probe.py", "--url", `http://127.0.0.1:${options.portA ?? 3411}/chat`, "--goal", "Set the Name field to Jev Probe and stop when the Name field visibly contains Jev Probe.", "--expected", "Jev Probe", "--cdp-url", process.env.BU_CDP_URL ?? process.env.OPENPRESENCE_JEV_CDP_URL, "--record-dir", probeRuntime, "--claim-id", plan.claimId, "--node-id", "jev-ultrafast:chat-name-input"], { ...probeEnv, TEXT_MODEL_BASE_URL: process.env.TEXT_MODEL_BASE_URL ?? "https://openrouter.ai/api/v1", TEXT_MODEL: process.env.TEXT_MODEL ?? "inception/mercury-2.5" });
      ultrafast = probe.stdout ?? { finalProbeState: "INDETERMINATE", error: probe.stderr || "JEV-ultrafast emitted no evidence" };
      ultrafast.runtimeExitCode = probe.code;
      await run(verifyApp, ["stop"], probeEnv);
    }
    const probeStatus = ultrafast.finalProbeState === "PROBE_OK" ? "PASS" : ultrafast.finalProbeState;
    deterministicEvidence.push({ schemaVersion: "openpresence-verification-evidence.v1", claimId: plan.claimId, verificationNodeId: "jev-ultrafast:chat-name-input", executor: "playwright-postcondition", inputFingerprint, environmentFingerprint: plan.environmentFingerprint, status: probeStatus, assertions: [{ id: "probe-postcondition", passed: probeStatus === "PASS", detail: ultrafast.deterministicPostcondition ?? ultrafast.error ?? ultrafast.finalProbeState }], durationMs: ultrafast.durationMs ?? 0, artifacts: [path.join(probeRuntime, "evidence.json"), path.join(probeRuntime, "trace.json")], causalRefs: [{ kind: "verification-plan", id: plan.planId }], freshVsCached: "fresh", route: "/chat", visibleTextSummary: ultrafast.observedFinalText ?? "", consoleSummary: [], networkSummary: {}, trajectoryStateSummary: ultrafast.finalProbeState });
  }
  const bundle = { claimId: plan.claimId, affectedCapability: plan.affectedCapability, deterministicResult: deterministicEvidence.every((item) => item.status === "PASS") ? "PASS" : "FAILURE", assertionSummary: deterministicEvidence.flatMap((item) => item.assertions.map((assertion) => `${item.verificationNodeId}:${assertion.id}=${assertion.passed ? "pass" : "fail"}`)).slice(0, 12), route: workers[0].route, visibleTextSummary: workers.map((item) => item.visibleTextSummary).join(" | "), consoleSummary: workers.flatMap((item) => item.consoleSummary).slice(0, 12), networkSummary: workers.map((item) => item.networkSummary), trajectoryStateSummary: workers.map((item) => item.trajectoryStateSummary).join(" | "), browserProbeSummary: ultrafast ? { finalProbeState: ultrafast.finalProbeState, actionCount: ultrafast.actionCount, browserProtocolCallCount: ultrafast.browserProtocolCallCount, deterministicPostcondition: JSON.stringify(ultrafast.deterministicPostcondition ?? {}), traceRef: ultrafast.traceRef } : null, verificationNodeIds: deterministicEvidence.map((item) => item.verificationNodeId), evidenceRefs: workers.flatMap((item) => item.artifacts), inputFingerprint, environmentFingerprint: plan.environmentFingerprint, cacheKey: plan.cacheKey };
  const evidencePath = path.join(runDir, "sanitized-evidence-bundle.json");
  await fs.writeFile(evidencePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const jev = await run(verifyApp, ["jev-triage", "--evidence", evidencePath, "--jev-mode", mode], { ...process.env, OPENPRESENCE_VERIFY_DIR: path.join(runDir, "worker-a"), OPENPRESENCE_VERIFY_PORT: String(options.portA ?? 3411), OPENPRESENCE_JEV_MODE: mode });
  const jevResult = jev.stdout ?? { ok: false, error: jev.stderr || "JEV triage failed" };
  const jevRoute = jevResult.decision?.routingApplied ?? "ignore";
  const activeJev = mode === "active" && Boolean(jevResult.serviceAvailable) && !jevResult.decision?.error;
  const runOptionalReview = mode !== "active" || !activeJev || jevRoute !== "ignore";
  const optionalStartedAt = Date.now();
  let optionalReview;
  if (runOptionalReview) {
    const optionalEnv = { ...process.env, OPENPRESENCE_VERIFY_DIR: path.join(runDir, "worker-a"), OPENPRESENCE_VERIFY_PORT: String(options.portA ?? 3411) };
    const optionalStart = await run(verifyApp, ["start"], optionalEnv);
    const optional = optionalStart.code === 0 ? await run(verifyApp, ["perf-metrics", "--route", "/chat", "--runs", "3"], optionalEnv) : optionalStart;
    const optionalPath = path.join(runDir, "optional-review.json");
    await fs.writeFile(optionalPath, `${JSON.stringify(optional.stdout ?? { error: optional.stderr }, null, 2)}\n`);
    optionalReview = { status: optional.code === 0 ? "PASS" : "FAILURE", action: "optional-review", reason: mode === "active" && activeJev ? `JEV routed ${jevRoute}` : `${mode} preserves optional review`, durationMs: Date.now() - optionalStartedAt, artifact: optionalPath };
    await run(verifyApp, ["stop"], optionalEnv);
  } else {
    optionalReview = { status: "SKIPPED", action: "optional-review", reason: "JEV active route=ignore; deterministic evidence was sufficient", durationMs: Date.now() - optionalStartedAt, artifact: null };
  }
  const packet = { schemaVersion: "openpresence-verification-packet.v1", plan, deterministicEvidence, ultrafast, jev: jevResult, activeRouting: { mode, route: jevRoute, optionalReview, changedNextAction: mode === "active" && activeJev ? (runOptionalReview ? "ran-optional-review" : "skipped-optional-review") : "unchanged" }, deterministicAuthority: deterministicEvidence.every((item) => item.status === "PASS"), generatedAt: new Date().toISOString(), runDir, realJevRequestAttempted: mode !== "off", realJevRequestSucceeded: Boolean(jevResult.serviceAvailable) };
  const packetPath = path.join(runDir, "verification-packet.json");
  await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(JSON.stringify({ ok: packet.deterministicAuthority, packetPath, planPath: path.join(runDir, "plan.json"), evidencePath, mode, workers: workers.map((item) => ({ node: item.verificationNodeId, status: item.status, durationMs: item.durationMs, runtimeDir: item.failure?.runtimeDir ?? path.dirname(item.artifacts[0]) })), ultrafast: packet.ultrafast ? { state: packet.ultrafast.finalProbeState, durationMs: packet.ultrafast.durationMs ?? null, actionCount: packet.ultrafast.actionCount ?? null, traceRef: packet.ultrafast.traceRef ?? null, error: packet.ultrafast.error ?? null } : null, jev: { attempted: packet.realJevRequestAttempted, succeeded: packet.realJevRequestSucceeded, route: jevRoute, requestId: jevResult.decision?.response?.headers?.["x-typesafe-request-id"] ?? null, error: jevResult.decision?.error ?? jevResult.error ?? null }, activeRouting: packet.activeRouting }, null, 2));
  if (!packet.deterministicAuthority) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
