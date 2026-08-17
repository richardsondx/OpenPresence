import { afterEach, describe, expect, it, vi } from "vitest";
import { claimExecutions, createBridgeWithKey, failExecution, ingestEvents } from "../lib/bridge";
import { applyOperation, createAgent, formXReplyIntent } from "../lib/runtime";
import { readState, writeState } from "../lib/db";

afterEach(() => vi.unstubAllEnvs());

describe("Bridge browser retry lifecycle", () => {
  it("re-seals a retryable browser failure instead of rejecting the next claim as stale", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@gennyverse", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = bridgeResult.state;
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "A bounded browser retry test.", "target-post-1");
    expect(state.presence?.connectionMode).toBe("bridge");
    expect(state.bridges.find((item) => item.id === bridgeResult.bridge?.id)?.state).toBe("online");
    expect(state.executions[0]?.status).toBe("queued");
    writeState(state);

    const bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    ingestEvents(bridge, { events: [{ sourceEventId: "retry-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-1" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    const firstClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    const executionId = firstClaim.executions[0]!.id;
    expect(firstClaim.executions[0]?.publication?.publicExpression?.safetyStatus).toBe("sealed");

    const failed = failExecution(bridge, executionId, { executorId: "chrome-test", code: "COMPOSER_INPUT_FAILED", message: "The controlled composer was not ready.", retryable: true });
    expect(failed.execution.status).toBe("queued");
    expect(failed.execution.publication?.publicExpression?.safetyStatus).toBe("candidate");
    expect(failed.execution.permit).toBeUndefined();

    const secondClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(secondClaim.executions[0]?.id).toBe(executionId);
    expect(secondClaim.executions[0]?.publication?.publicExpression?.safetyStatus).toBe("sealed");
    expect(secondClaim.executions[0]?.failure?.code).toBe("COMPOSER_INPUT_FAILED");
  });
});
