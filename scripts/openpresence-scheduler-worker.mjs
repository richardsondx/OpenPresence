const port = process.env.OPENPRESENCE_PORT || "3015";
const baseUrl = (process.env.OPENPRESENCE_INTERNAL_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const token = process.env.OPENPRESENCE_SCHEDULER_TOKEN?.trim();
const configuredInterval = Number(process.env.OPENPRESENCE_SCHEDULER_INTERVAL_MS || 5_000);
const intervalMs = Number.isFinite(configuredInterval) ? Math.min(60_000, Math.max(1_000, configuredInterval)) : 5_000;

if (!token) throw new Error("OPENPRESENCE_SCHEDULER_TOKEN is required.");

let stopping = false;
let cycleInFlight = false;

function log(message) {
  process.stdout.write(`[openpresence-scheduler] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRuntime() {
  while (!stopping) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/runtime/health`, {}, 4_000);
      if (response.ok) return true;
    } catch {
      // The launcher starts this worker alongside Next; readiness is expected
      // to lag by a few seconds while the route graph compiles.
    }
    await sleep(1_000);
  }
  return false;
}

async function runCycle() {
  if (stopping || cycleInFlight) return;
  cycleInFlight = true;
  try {
    const memory = process.memoryUsage();
    const response = await fetchWithTimeout(`${baseUrl}/api/runtime/sweep`, {
      method: "POST",
      headers: {
        ["x-openpresence-scheduler-token"]: token,
        "x-openpresence-scheduler-telemetry": JSON.stringify({
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          rssMb: Math.round(memory.rss / 1024 / 1024),
        }),
      },
    });
    if (!response.ok) throw new Error(`sweep returned HTTP ${response.status}`);
    const result = await response.json();
    log(`sweep complete: staleRuns=${result.staleRuns ?? 0}, dispatchedWakes=${result.dispatchedWakes ?? 0}, durationMs=${result.durationMs ?? "?"}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log(`sweep deferred: ${detail}`);
  } finally {
    cycleInFlight = false;
  }
}

async function main() {
  if (!(await waitForRuntime())) return;
  await runCycle();
  while (!stopping) {
    await sleep(intervalMs);
    await runCycle();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[openpresence-scheduler] fatal: ${detail}\n`);
  process.exitCode = 1;
});
