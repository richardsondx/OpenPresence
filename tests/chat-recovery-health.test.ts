import { describe, expect, it } from "vitest";
import { createAgent } from "../lib/runtime";
import { getRecoveryIncident, upsertRecoveryIncident, writeState } from "../lib/db";
import { classifyFailureRootCause } from "../lib/incident-engine";
import { readOperationalHealth } from "../lib/operational-context";
import type { Execution, RecoveryIncident } from "../lib/types";

describe("persisted billing recovery", () => {
  it("closes only the native billing incident after a newer verified native write", () => {
    const state = createAgent({ name: "Recovery", handle: "@recovery", description: "Test", mode: "agent", accent: "#777777" });
    const presenceId = state.presence!.id;
    const incident: RecoveryIncident = { id: `billing-${presenceId}`, presenceId, dependencyId: `dh_native_x_${presenceId}`, rootCauseKey: "native_x.credits_exhausted", state: "needs_operator", openedAt: "2026-09-01T00:00:00Z", lastObservedAt: "2026-09-02T00:00:00Z", affectedRunIds: [], recoveryAttempts: 0, safeSummary: classifyFailureRootCause("X has no API credits remaining.", "native_x").safeSummary, operatorActionRequired: true, updatedAt: "2026-09-02T00:00:00Z" };
    upsertRecoveryIncident(incident);
    const duplicate = { ...incident, id: `duplicate-${presenceId}`, rootCauseKey: "runtime.duplicate_public_outcome", dependencyId: `dh_runtime_${presenceId}`, safeSummary: "Duplicate public outcome needs review." };
    upsertRecoveryIncident(duplicate);
    const execution = { id: `execution-${presenceId}`, presenceId, socialIntentId: "intent", affordance: "x.post", mode: "auto", connector: "native", environment: "live", status: "verification-pending", attempts: 1, idempotencyKey: "test", createdAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-03T00:00:00Z", externalRef: { type: "x.post", id: "123" }, executedAt: "2026-09-03T00:00:00Z" } as Execution;
    state.executions = [execution];
    const check = () => { writeState(state, { force: true }); readOperationalHealth(presenceId); return getRecoveryIncident(incident.id)?.state; };
    expect(check()).toBe("needs_operator");
    execution.status = "succeeded";
    execution.connector = "bridge";
    expect(check()).toBe("needs_operator");
    execution.connector = "native";
    execution.executedAt = "2026-09-01T00:00:00Z";
    expect(check()).toBe("needs_operator");
    execution.executedAt = "2026-09-03T00:00:00Z";
    expect(check()).toBe("resolved");
    expect(getRecoveryIncident(duplicate.id)?.state).toBe("needs_operator");
  });
});
