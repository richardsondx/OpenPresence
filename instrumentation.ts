export async function register() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const temporalEngineEnabled = process.env.OPENPRESENCE_ENABLE_TEMPORAL_ENGINE === "1"
    || (!isDevelopment && process.env.OPENPRESENCE_DISABLE_TEMPORAL_ENGINE !== "1");
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
