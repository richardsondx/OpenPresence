export const RUNTIME_REQUEST_TIMEOUT_MS = 90_000;
export const LONG_RUNNING_OPERATION_TIMEOUT_MS = 180_000;

const LONG_RUNNING_OPERATION_TYPES = new Set([
  "wakePresence",
  "runPulse",
  "runAttentionWorker",
  "runLiveAssignment",
  "startAssignment",
  "workAssignment",
]);

export function runtimeTimeoutForOperation(operationType?: string | null) {
  return operationType && LONG_RUNNING_OPERATION_TYPES.has(operationType)
    ? LONG_RUNNING_OPERATION_TIMEOUT_MS
    : RUNTIME_REQUEST_TIMEOUT_MS;
}

export function runtimeTimeoutMessage() {
  return "The operation is taking longer than expected. Open Activity to verify its state before trying again.";
}
