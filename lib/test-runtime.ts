export function isTestRuntime() {
  return process.env.OPENPRESENCE_TEST_RUNTIME === "1" && process.env.OPENPRESENCE_TEST_MODE === "1";
}

export function isAiMockEnabled() {
  return isTestRuntime() && process.env.OPENPRESENCE_AI_MOCK === "1";
}

export function isXMockEnabled() {
  return isTestRuntime() && process.env.OPENPRESENCE_X_API_MOCK === "1";
}
