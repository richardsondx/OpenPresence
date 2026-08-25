import { afterEach, describe, expect, it, vi } from "vitest";
import { claimExecutions, closeChromeVerification, createBridgeWithKey, failExecution, ingestEvents, recordVerifiedBridgeReaction, reportBridgeIdentity } from "../lib/bridge";
import { applyOperation, createAgent, formXReplyIntent } from "../lib/runtime";
import { readState, WorkspaceConflictError, writeState } from "../lib/db";
import type { Execution } from "../lib/types";

afterEach(() => vi.unstubAllEnvs());

describe("Bridge browser retry lifecycle", () => {
  it("settles a verified Assignment quote and mirror object", () => {
    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Quote one worthwhile public post with a distinct contribution.", objective: "education" });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    const executionId = "execution-assignment-quote";
    const target = { type: "x.post", id: "target-quote" } as const;
    state.mirrorObjects.unshift({ id: "mirror-quote", bridgeId: bridgeResult.bridge!.id, presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "published-quote" }, parentExternalRef: target, objectType: "reply", author: { displayName: "Genny", handle: "example_agent" }, content: { text: "A distinct contribution." }, visibility: "public", shareability: "presence-only", occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), environment: "live", source: "native" });
    state.executions.unshift({ id: executionId, socialIntentId: "intent-assignment-quote", presenceId: state.presence!.id, affordance: "x.quote", mode: "auto", status: "verification-pending", attempts: 1, connector: "bridge", bridgeId: bridgeResult.bridge!.id, target, assignmentId: assignment.id, publication: { id: "publication-assignment-quote", format: "x.quote", payload: { text: "A distinct contribution." }, assetIds: [], links: [], createdAt: new Date().toISOString(), environment: "live" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), environment: "live" } as unknown as Execution);
    const verified = recordVerifiedBridgeReaction(state, executionId, { type: "x.post", id: "published-quote" });
    const settled = verified.assignments.find((item) => item.id === assignment.id)!;
    const mirror = verified.mirrorObjects.find((item) => item.id === "mirror-quote")!;
    expect(verified.executions.find((item) => item.id === executionId)?.status).toBe("succeeded");
    expect(settled.status).toBe("completed");
    expect(settled.progress.verified).toBe(1);
    expect(mirror.objectType).toBe("quote");
    expect(mirror.originExecutionId).toBe(executionId);
  });

  it("preserves a newer verified browser identity across a stale workspace write", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] } } });
    const staleWorkspace = readState();
    const bridge = staleWorkspace.bridges.find((item) => item.id === bridgeResult.bridge?.id)!;

    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    const staleBridge = staleWorkspace.bridges.find((item) => item.id === bridge.id)!;
    staleBridge.accountIdentity = undefined;
    expect(() => writeState(staleWorkspace)).toThrow(WorkspaceConflictError);

    expect(readState().bridges.find((item) => item.id === bridge.id)?.accountIdentity).toMatchObject({ status: "verified", username: "example_agent" });
  });

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

  it("issues a fresh permit after an expired browser lease", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "Retry with a fresh permit.", "target-post-expired-lease");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(readState().bridges.find((item) => item.id === bridge.id)!, { events: [{ sourceEventId: "expired-lease-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-expired-lease" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;

    const firstClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    const firstExecution = firstClaim.executions[0]!;
    const firstPermitIssuedAt = firstExecution.permit!.issuedAt;
    const expiredState = readState();
    const expiredExecution = expiredState.executions.find((item) => item.id === firstExecution.id)!;
    expiredExecution.lease = { executorId: "chrome-test", claimedAt: new Date(Date.now() - 121_000).toISOString(), expiresAt: new Date(Date.now() - 1_000).toISOString() };
    writeState(expiredState);

    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    const secondClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    const retriedExecution = secondClaim.executions[0]!;
    expect(retriedExecution.id).toBe(firstExecution.id);
    expect(retriedExecution.permit!.issuedAt).not.toBe(firstPermitIssuedAt);
    expect(new Date(retriedExecution.permit!.expiresAt).getTime()).toBeGreaterThan(Date.now() + 150_000);
    expect(retriedExecution.publication?.publicExpression?.safetyStatus).toBe("sealed");
  });

  it("serializes active browser work without letting passive verification block the queue", () => {
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

    // Verification is now a passive, durable reconciliation state. It has
    // released the browser lease, so unrelated queued work can proceed while
    // execution 1 remains excluded from the claim candidates.
    const thirdClaimWhilePending = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(thirdClaimWhilePending.executions).toHaveLength(1);
    expect(thirdClaimWhilePending.executions[0]?.publication?.publicExpression?.text).toBe("Second reply queued.");
    expect(thirdClaimWhilePending.executions[0]?.id).not.toBe(firstClaim.executions[0]?.id);

    // The original execution can still reconcile independently afterward.
    state = readState();
    const exec1Success = state.executions.find((item) => item.id === firstClaim.executions[0]!.id)!;
    exec1Success.status = "succeeded";
    writeState(state);

    // Execution 2 is already leased, so no duplicate is returned.
    const finalClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(finalClaim.executions).toHaveLength(0);
  });

  it("closes an unverified browser submission without counting delivery", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "A submission with no authoritative proof.", "target-post-close");
    writeState(state);
    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(readState().bridges.find((item) => item.id === bridge.id)!, { events: [{ sourceEventId: "close-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-close" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "Target" }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    const claimed = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    const executionId = claimed.executions[0]!.id;
    const pending = readState();
    pending.executions.find((item) => item.id === executionId)!.status = "verification-pending";
    writeState(pending);

    const closed = closeChromeVerification(readState().bridges.find((item) => item.id === bridge.id)!, executionId, { executorId: "chrome-test", note: "No matching public object after bounded verification." });
    expect(closed.execution.status).toBe("verification-closed");
    expect(closed.execution.externalRef).toBeUndefined();
    expect(closed.execution.failure?.reviewDisposition).toBe("operator_action_required");
    expect(closed.execution.failure?.reviewNote).toContain("No matching public object");
  });
});
