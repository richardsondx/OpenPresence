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
  return "Check now did not return before the request timed out. It may still be queued or running; Activity will verify its state and show whether it is queued, running, complete, or failed before you try again.";
}
