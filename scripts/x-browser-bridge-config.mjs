const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function boundedInterval(value, fallback, minimum, maximum) {
  const parsed = finiteNumber(value);
  return Math.min(maximum, Math.max(minimum, parsed ?? fallback));
}

export function browserBridgeIntervals(env = process.env) {
  return {
    pollMs: boundedInterval(env.BRIDGE_POLL_MS, 1_000, 250, 60_000),
    // Mentions are the operator-visible latency canary. Keep this frequent
    // enough for responsive replies, but never allow a busy-loop.
    mentionObserveMs: boundedInterval(env.X_BROWSER_MENTION_OBSERVE_MS, 5_000, 5_000, 60_000),
    // Discovery and metrics are deliberately independent of the mention path
    // so a slow/large page cannot make a fresh mention wait behind it.
    discoveryObserveMs: boundedInterval(env.X_BROWSER_DISCOVERY_OBSERVE_MS, 30_000, 15_000, 300_000),
  };
}
