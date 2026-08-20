import { afterEach, describe, expect, it, vi } from "vitest";
import { claimExecutions, createBridgeWithKey, failExecution, ingestEvents, reportBridgeIdentity } from "../lib/bridge";
import { applyOperation, createAgent, formXReplyIntent } from "../lib/runtime";
import { readState, writeState } from "../lib/db";

afterEach(() => vi.unstubAllEnvs());

describe("Bridge browser retry lifecycle", () => {
  it("waits for a fresh verified account before claiming live Chrome work", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "Claim only after identity.", "target-post-identity");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    const held = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(held.executions).toHaveLength(0);
    expect(held.retryAfterIdentity).toBe(true);
    const queuedExecutionId = held.state.executions.find((item) => item.status === "queued")?.id;
    expect(queuedExecutionId).toBeTruthy();

    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!, { events: [{ sourceEventId: "identity-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-identity" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    const claimed = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(claimed.retryAfterIdentity).toBe(false);
    expect(claimed.executions[0]?.id).toBe(queuedExecutionId);
  });

  it("retires expired queued work and continues to the next live action", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "This stale action should retire.", "target-post-stale");
    const staleIntent = state.socialIntents.find((intent) => intent.state === "active");
    staleIntent!.validity.expiresAt = new Date(Date.now() - 1_000).toISOString();
    state = formXReplyIntent(state, "This current action should still claim.", "target-post-current");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    ingestEvents(bridge, { events: [
      { sourceEventId: "stale-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-stale" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A stale target." }, visibility: "public", shareability: "presence-only" } },
      { sourceEventId: "current-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-current" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A current target." }, visibility: "public", shareability: "presence-only" } },
    ] });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    const claimed = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(claimed.executions).toHaveLength(1);
    expect(claimed.executions[0]?.publication?.publicExpression?.text).toBe("This current action should still claim.");
    const persisted = readState();
    expect(persisted.executions.find((execution) => execution.target?.id === "target-post-stale")?.status).toBe("expired");
    expect(persisted.socialIntents.find((intent) => intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() < Date.now())?.state).toBe("expired");
  });

  it("re-seals a retryable browser failure instead of rejecting the next claim as stale", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
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
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
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

  it("fails closed when the controlled tab reports a different X account", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "This must never reach the wrong account.", "target-post-2");
    writeState(state);

    const bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "another-account" });
    const claim = claimExecutions(readState().bridges.find((item) => item.id === bridge.id)!, { executorId: "chrome-test", limit: 1 });

    expect(claim.executions).toHaveLength(0);
    expect(claim.state.bridges.find((item) => item.id === bridge.id)?.accountIdentity).toMatchObject({ status: "mismatch", username: "another-account" });
    expect(claim.state.executions[0]?.status).toBe("queued");
  });

  it("strictly serializes executions and holds queued actions while an execution is in verification", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "First reply to verify.", "target-post-1");
    state = formXReplyIntent(state, "Second reply queued.", "target-post-2");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(bridge, { events: [
      { sourceEventId: "target-1", event: "created", object: { externalRef: { type: "x.post", id: "target-post-1" }, objectType: "post", language: "en", author: { displayName: "Target 1" }, content: { text: "Target 1" }, visibility: "public", shareability: "presence-only" } },
      { sourceEventId: "target-2", event: "created", object: { externalRef: { type: "x.post", id: "target-post-2" }, objectType: "post", language: "en", author: { displayName: "Target 2" }, content: { text: "Target 2" }, visibility: "public", shareability: "presence-only" } },
    ] });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    // First claim gets execution 1
    const firstClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(firstClaim.executions).toHaveLength(1);
    expect(firstClaim.executions[0]?.publication?.publicExpression?.text).toBe("First reply to verify.");

    // While execution 1 is claimed, second claim attempt returns empty
    const secondClaimWhileClaimed = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(secondClaimWhileClaimed.executions).toHaveLength(0);

    // Simulate execution 1 moving to verification-pending
    state = readState();
    const exec1 = state.executions.find((item) => item.id === firstClaim.executions[0]!.id)!;
    exec1.status = "verification-pending";
    writeState(state);

    // While execution 1 is verification-pending, second claim attempt STILL returns empty
    const thirdClaimWhilePending = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(thirdClaimWhilePending.executions).toHaveLength(0);

    // Simulate execution 1 succeeding
    state = readState();
    const exec1Success = state.executions.find((item) => item.id === firstClaim.executions[0]!.id)!;
    exec1Success.status = "succeeded";
    writeState(state);

    // Now execution 2 is claimed cleanly
    const finalClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(finalClaim.executions).toHaveLength(1);
    expect(finalClaim.executions[0]?.publication?.publicExpression?.text).toBe("Second reply queued.");
  });
});
