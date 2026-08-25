#!/usr/bin/env node

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const port = process.env.OPENPRESENCE_PORT || "3015";
const baseUrl = (process.env.OPENPRESENCE_RUNTIME_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const cycleIntervalMs = Math.max(30_000, Number(process.env.OPENPRESENCE_AUTONOMY_INTERVAL_MS || 5 * 60_000));
const requestTimeoutMs = Math.max(30_000, Number(process.env.OPENPRESENCE_AUTONOMY_TIMEOUT_MS || 8 * 60_000));
const dbPath = process.env.OPENPRESENCE_DB_PATH ? path.resolve(process.cwd(), process.env.OPENPRESENCE_DB_PATH) : null;

let stopping = false;
let cycleInFlight = false;

function log(message) {
  console.log(`[Autonomy ${new Date().toISOString()}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLivePresences() {
  if (!dbPath) return [];
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare("SELECT payload FROM presences").all()
      .map((row) => {
        try { return JSON.parse(row.payload); } catch { return null; }
      })
      .filter((presence) => presence?.status === "live");
  } finally {
    db.close();
  }
}

async function fetchWithTimeout(input, init = {}, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRuntime() {
  while (!stopping) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/runtime/health`, {}, 4_000);
      if (response.ok) return await response.json();
    } catch {
      // The launcher may start this worker slightly before Next is ready.
    }
    await sleep(2_000);
  }
  return null;
}

async function runCycle(runtimeHealth) {
  if (stopping || cycleInFlight) return;
  cycleInFlight = true;
  try {
    const health = runtimeHealth ?? await (async () => {
      const response = await fetchWithTimeout(`${baseUrl}/runtime/health`, {}, 4_000);
      if (!response.ok) throw new Error(`runtime health returned HTTP ${response.status}`);
      return response.json();
    })();
    // Do not generate more work while the runtime has an explicit human or
    // connector gate. The queued responsibility remains durable and the
    // next scheduled cycle will resume as soon as the gate clears. This is
    // important for liveness: repeated cognition while delivery is paused
    // needlessly churns the large state snapshot and can starve health/UI
    // requests during startup.
    const livePresences = readLivePresences();
    if (!livePresences.length) {
      log("attention deferred: no live Presence is configured");
      return;
    }
    const presenceHealth = await Promise.all(livePresences.map(async (presence) => {
      const response = await fetchWithTimeout(`${baseUrl}/api/runtime/health?presenceId=${encodeURIComponent(presence.id)}`, {}, 4_000);
      if (!response.ok) throw new Error(`health for ${presence.id} returned HTTP ${response.status}`);
      return { presence, health: await response.json() };
    }));
    const runnablePresences = presenceHealth.filter(({ health }) => health?.status !== "needs_you");
    if (!runnablePresences.length) {
      const summary = presenceHealth[0]?.health?.summary || health?.summary || "runtime requires attention";
      log(`attention deferred: ${summary}`);
      return;
    }
    const stateResponse = await fetchWithTimeout(`${baseUrl}/api/state?projection=activity&read=${Date.now()}`);
    if (!stateResponse.ok) throw new Error(`state read returned HTTP ${stateResponse.status}`);
    const state = await stateResponse.json();
    const agentId = state.agent?.id ?? state.activeAgentId;
    const runnableIds = new Set(runnablePresences.map(({ presence }) => presence.id));
    for (const presence of (state.presences ?? []).filter((item) => item.status === "live" && runnableIds.has(item.id))) {
      if (stopping) break;
      const response = await fetchWithTimeout(`${baseUrl}/api/state`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openpresence-projection": "activity",
          ...(agentId ? { "x-openpresence-agent-id": agentId } : {}),
          "x-openpresence-presence-id": presence.id,
        },
        body: JSON.stringify({ type: "runAttentionWorker", presenceId: presence.id, scheduled: true }),
      });
      if (!response.ok) throw new Error(`attention for ${presence.id} returned HTTP ${response.status}`);
      log(`completed attention cycle for ${presence.handle ?? presence.name ?? presence.id}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`attention cycle deferred: ${message}`);
  } finally {
    cycleInFlight = false;
  }
}

async function main() {
  log(`started; runtime=${baseUrl}, interval=${cycleIntervalMs}ms`);
  const runtimeHealth = await waitForRuntime();
  if (!runtimeHealth) return;
  await runCycle(runtimeHealth);
  const timer = setInterval(() => void runCycle(), cycleIntervalMs);
  const shutdown = () => {
    stopping = true;
    clearInterval(timer);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
