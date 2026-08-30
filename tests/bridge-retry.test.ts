import { afterEach, describe, expect, it, vi } from "vitest";
import { claimExecutions, closeChromeVerification, createBridgeWithKey, failExecution, ingestEvents, recordVerifiedBridgeReaction, reportBridgeIdentity } from "../lib/bridge";
import { applyOperation, createAgent, formXReplyIntent } from "../lib/runtime";
import { readState, readStateForBridge, readStateVersion, WorkspaceConflictError, writeState } from "../lib/db";
import type { Execution } from "../lib/types";

afterEach(() => vi.unstubAllEnvs());

describe("Bridge browser retry lifecycle", () => {
  it("resolves connector state from the indexed Bridge owner", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    const scoped = readStateForBridge(bridgeResult.bridge!.id);
    expect(scoped.bridges.some((bridge) => bridge.id === bridgeResult.bridge!.id)).toBe(true);
    expect(scoped.presences.some((presence) => presence.id === state.presence!.id)).toBe(true);
    expect(scoped.agentWorkspaces).toEqual([]);
  });

  it("isolates mutable Bridge reads from the cached canonical snapshot", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    const first = readStateForBridge(bridgeResult.bridge!.id);
    first.bridges[0]!.state = "offline";
    first.presences[0]!.status = "paused";

    const second = readStateForBridge(bridgeResult.bridge!.id);
    expect(second.bridges.find((bridge) => bridge.id === bridgeResult.bridge!.id)?.state).not.toBe("offline");
    expect(second.presences.find((presence) => presence.id === state.presence!.id)?.status).not.toBe("paused");
  });

  it("does not rewrite the workspace for a fresh unchanged identity probe", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    const bridge = bridgeResult.bridge!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    const beforeVersion = readStateVersion();
    const beforeRevision = readState().workspaceRevision;
    const repeated = reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    expect(repeated.identity).toMatchObject({ status: "verified", username: "example_agent" });
    expect(readStateVersion()).toBe(beforeVersion);
    expect(readState().workspaceRevision).toBe(beforeRevision);
  });

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

  it("does not claim a queued reply after the target establishes a blocked boundary", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    const presence = state.presence!;
    const observedAt = new Date().toISOString();
    state.people.push({ id: "person-blocked-claim", agentId: state.agent!.id, displayName: "Blocked Author", memoryState: "active", createdAt: observedAt, updatedAt: observedAt } as never);
    state.personIdentities.push({ id: "identity-blocked-claim", personId: "person-blocked-claim", channel: "x", externalActorId: "person-blocked-claim", sourcePresenceId: presence.id, sourceEnvironment: "live", displayName: "Blocked Author", handle: "blocked_author", createdAt: observedAt, updatedAt: observedAt } as never);
    state.mirrorObjects.unshift({ id: "mirror-blocked-claim", bridgeId: bridgeResult.bridge!.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "target-post-blocked-claim" }, objectType: "post", author: { externalRef: { type: "x.user", id: "person-blocked-claim" }, displayName: "Blocked Author", handle: "blocked_author" }, content: { text: "A target conversation.", language: "en" }, language: "en", visibility: "public", shareability: "presence-only", observedAt, occurredAt: observedAt, environment: "live" } as never);
    state = formXReplyIntent(state, "This must never reach the blocked author.", "target-post-blocked-claim");
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Reply to the target post." });
    const assignment = state.assignments[0]!;
    assignment.status = "active";
    state.executions[0]!.assignmentId = assignment.id;
    state.personIdentities.find((identity) => identity.id === "identity-blocked-claim")!.contactability = { status: "blocked_by_person", observedAt, source: "browser_delivery", evidenceExecutionId: "prior-block" };
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    const claim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    const persisted = readState();

    expect(claim.executions).toHaveLength(0);
    expect(persisted.executions[0]).toMatchObject({ status: "cancelled", failure: { code: "TARGET_BLOCKED_PRESENCE" } });
    expect(persisted.assignments[0]).toMatchObject({ status: "needs_operator", work: { phase: "blocked" } });
    expect(persisted.events[0]).toMatchObject({ title: "Delivery stopped" });
  });

  it("isolates account identity per Chrome executor", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "Only Genny's browser may claim this.", "target-post-executor-isolation");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "genny-browser", username: "example_agent" });
    reportBridgeIdentity(bridge, { executorId: "operator-browser", username: "richardsondx" });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    ingestEvents(bridge, { events: [{ sourceEventId: "executor-isolation-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-executor-isolation" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;

    expect(bridge.accountIdentity).toMatchObject({ status: "verified", username: "example_agent" });
    const wrongExecutor = claimExecutions(bridge, { executorId: "operator-browser", limit: 1 });
    expect(wrongExecutor.executions).toHaveLength(0);
    expect(wrongExecutor.retryAfterIdentity).toBe(true);

    const gennyExecutor = claimExecutions(bridge, { executorId: "genny-browser", limit: 1 });
    expect(gennyExecutor.executions).toHaveLength(1);
    expect(gennyExecutor.retryAfterIdentity).toBe(false);
  });

  it("holds a claimed pre-write action and resumes automatically after the expected account returns", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "This action must wait for the right account.", "target-post-identity-hold");
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(readState().bridges.find((item) => item.id === bridge.id)!, { events: [{ sourceEventId: "identity-hold-target", event: "created", object: { externalRef: { type: "x.post", id: "target-post-identity-hold" }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    const claimed = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 }).executions[0]!;

    const held = failExecution(bridge, claimed.id, { executorId: "chrome-test", code: "ACCOUNT_MISMATCH", message: "Account check failed. Expected @example_agent; the controlled tab is signed in as @another-account.", retryable: false });
    expect(held.execution).toMatchObject({ status: "queued", deliveryHold: { reason: "bridge_identity" }, failure: { code: "ACCOUNT_MISMATCH", retryable: true } });
    expect(held.execution.permit).toBeUndefined();
    expect(held.execution.publication?.publicExpression?.safetyStatus).toBe("candidate");

    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    const resumed = readState().executions.find((item) => item.id === claimed.id)!;
    expect(resumed.status).toBe("queued");
    expect(resumed.deliveryHold).toBeUndefined();
  });

  it("quarantines an expired browser lease instead of replaying an uncertain public write", () => {
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
    const expiredState = readState();
    const expiredExecution = expiredState.executions.find((item) => item.id === firstExecution.id)!;
    expiredExecution.lease = { executorId: "chrome-test", claimedAt: new Date(Date.now() - 121_000).toISOString(), expiresAt: new Date(Date.now() - 1_000).toISOString() };
    writeState(expiredState);

    bridge = readState().bridges.find((item) => item.id === bridge.id)!;
    const secondClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(secondClaim.executions).toHaveLength(0);
    const quarantined = readState().executions.find((item) => item.id === firstExecution.id)!;
    expect(quarantined.status).toBe("verification-pending");
    expect(quarantined.failure).toMatchObject({ code: "DELIVERY_ACK_LOST", retryable: false });
    expect(quarantined.lease).toBeUndefined();
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

  it("never hands Chrome two differently worded replies for the same target", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");

    const targetId = `bridge-duplicate-target-${Date.now()}-${Math.random()}`;
    let state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = applyOperation(bridgeResult.state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "First independent wording.", targetId);
    state = formXReplyIntent(state, "Second independent wording.", targetId);
    writeState(state);

    let bridge = readState().bridges.find((item) => item.id === bridgeResult.bridge?.id)!;
    reportBridgeIdentity(bridge, { executorId: "chrome-test", username: "example_agent" });
    ingestEvents(readState().bridges.find((item) => item.id === bridge.id)!, { events: [{ sourceEventId: targetId, event: "created", object: { externalRef: { type: "x.post", id: targetId }, objectType: "post", language: "en", author: { displayName: "Target" }, content: { text: "A target conversation." }, visibility: "public", shareability: "presence-only" } }] });
    bridge = readState().bridges.find((item) => item.id === bridge.id)!;

    const firstClaim = claimExecutions(bridge, { executorId: "chrome-test", limit: 1 });
    expect(firstClaim.executions).toHaveLength(1);
    const pending = readState();
    pending.executions.find((item) => item.id === firstClaim.executions[0]!.id)!.status = "verification-pending";
    pending.executions.find((item) => item.id === firstClaim.executions[0]!.id)!.lease = undefined;
    writeState(pending);

    const secondClaim = claimExecutions(readState().bridges.find((item) => item.id === bridge.id)!, { executorId: "chrome-test", limit: 1 });
    expect(secondClaim.executions).toHaveLength(0);
    const sameTarget = readState().executions.filter((execution) => execution.target?.id === targetId);
    expect(sameTarget.filter((execution) => execution.status === "verification-pending")).toHaveLength(1);
    expect(sameTarget.filter((execution) => execution.status === "cancelled" && execution.failure?.code === "DUPLICATE_EXECUTION")).toHaveLength(1);
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
