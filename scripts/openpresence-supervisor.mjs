#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";

const BACKOFF_MS = [1000, 5000, 15000, 60000];
const HEALTH_CHECK_INTERVAL_MS = 10000;
const HEALTH_PORT = process.env.OPENPRESENCE_PORT || process.env.PORT || 3015;

let restartAttempts = 0;
let childProcess = null;
let isShuttingDown = false;

function log(msg) {
  console.log(`[Supervisor ${new Date().toISOString()}] ${msg}`);
}

function probeHealth(port = HEALTH_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/runtime/health`, { timeout: 4000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startRuntime() {
  if (isShuttingDown) return;

  log(`Spawning OpenPresence runtime process (attempt ${restartAttempts + 1})...`);
  childProcess = spawn("node", ["scripts/openpresence-server.mjs", "start"], {
    stdio: "inherit",
    env: { ...process.env, OPENPRESENCE_SUPERVISED: "1" },
  });

  childProcess.on("exit", (code, signal) => {
    log(`Runtime process exited with code ${code}, signal ${signal}.`);
    childProcess = null;
    if (isShuttingDown) return;

    const delay = BACKOFF_MS[Math.min(restartAttempts, BACKOFF_MS.length - 1)];
    restartAttempts += 1;
    log(`Scheduling restart in ${delay / 1000}s...`);
    setTimeout(startRuntime, delay);
  });
}

async function monitorHealth() {
  while (!isShuttingDown) {
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    if (!childProcess || isShuttingDown) continue;

    const healthy = await probeHealth();
    if (healthy) {
      if (restartAttempts > 0) {
        log("Runtime reported healthy. Resetting restart counter.");
        restartAttempts = 0;
      }
    } else {
      log("Runtime health check probe failed! Checking again in 5s...");
      await new Promise((r) => setTimeout(r, 5000));
      const retryHealthy = await probeHealth();
      if (!retryHealthy && childProcess && !isShuttingDown) {
        log("Runtime unresponsive. Terminating stale process...");
        childProcess.kill("SIGTERM");
        setTimeout(() => {
          if (childProcess) {
            log("Force killing unresponsive runtime process...");
            childProcess.kill("SIGKILL");
          }
        }, 5000);
      }
    }
  }
}

function handleShutdown() {
  log("Shutting down supervisor and runtime child processes...");
  isShuttingDown = true;
  if (childProcess) {
    childProcess.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

log("Starting OpenPresence Out-of-Process Watchdog Supervisor...");
startRuntime();
monitorHealth();
