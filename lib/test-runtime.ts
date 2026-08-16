export function isTestRuntime() {
  return process.env.NODE_ENV !== "production" && process.env.OPENPRESENCE_TEST_MODE === "1";
}

export function isAiMockEnabled() {
  return isTestRuntime() && process.env.OPENPRESENCE_AI_MOCK === "1";
}

export function isXMockEnabled() {
  return isTestRuntime() && process.env.OPENPRESENCE_X_API_MOCK === "1";
}

/** Live channel writes are forbidden from test or mock runtimes, even when credentials exist. */
export function assertLiveWriteRuntimeAllowed() {
  if (isTestRuntime() || isAiMockEnabled()) {
    throw new Error("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME: live channel writes require a real runtime outside test mode and AI mock mode.");
  }
}
