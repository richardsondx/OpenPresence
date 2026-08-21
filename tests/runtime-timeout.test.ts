import { describe, expect, it } from "vitest";
import { LONG_RUNNING_OPERATION_TIMEOUT_MS, RUNTIME_REQUEST_TIMEOUT_MS, runtimeTimeoutForOperation, runtimeTimeoutMessage } from "../lib/runtime-timeout";

describe("runtime operation timeouts", () => {
  it("gives attention operations a longer client window than ordinary requests", () => {
    expect(runtimeTimeoutForOperation("runPulse")).toBe(LONG_RUNNING_OPERATION_TIMEOUT_MS);
    expect(runtimeTimeoutForOperation("wakePresence")).toBe(LONG_RUNNING_OPERATION_TIMEOUT_MS);
    expect(runtimeTimeoutForOperation("selectPresence")).toBe(RUNTIME_REQUEST_TIMEOUT_MS);
  });

  it("does not promise an automatic retry after a client timeout", () => {
    expect(runtimeTimeoutMessage()).toContain("verify its state");
    expect(runtimeTimeoutMessage()).not.toContain("retry automatically");
  });
});
