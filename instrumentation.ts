export function shouldStartTemporalEngine(env: NodeJS.ProcessEnv = process.env) {
  const isDevelopment = env.NODE_ENV === "development";
  // The server launcher owns a separate lightweight scheduler process. Do not
  // start a second in-process timer in the Next child; both would claim the
  // same durable wakes and multiply SQLite reads/writes. Standalone Next
  // processes remain supported through the normal production default.
  if (env.OPENPRESENCE_EXTERNAL_SCHEDULER_OWNER === "1") return false;
  return env.OPENPRESENCE_ENABLE_TEMPORAL_ENGINE === "1"
    || (!isDevelopment && env.OPENPRESENCE_DISABLE_TEMPORAL_ENGINE !== "1");
}

export async function register() {
  const temporalEngineEnabled = shouldStartTemporalEngine();
  // Next's development compiler loads instrumentation and route bundles
  // independently. Eagerly importing the full autonomy graph here duplicates
  // a large module tree, inflates RSS, and can starve the first request. Dev
  // uses explicit operator actions for bounded sweeps; production keeps the
  // durable temporal loop enabled by default.
  if (process.env.NEXT_RUNTIME === "nodejs" && temporalEngineEnabled) {
    const { startTemporalEngine } = await import("./lib/temporal");
    startTemporalEngine();
  }
}
