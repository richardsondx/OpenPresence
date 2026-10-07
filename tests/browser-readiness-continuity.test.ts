import { describe, expect, it } from "vitest";
import { createAgent, compileAssignmentInstruction } from "../lib/runtime";
import { createBridgeWithKey, heartbeatBridge, reportBridgeIdentity } from "../lib/bridge";
import { readState, writeState, readBrowserAdapterObservations } from "../lib/db";
import { bridgeReadyForExpectedAccount } from "../lib/bridge-contract";
import { resumeBrowserBlockedResponsibilities } from "../lib/assignment-recovery";

const adapter = { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post", "reply"] } };
function fixture() {
  const state = createAgent({ name: "Browser Continuity", description: "Useful social work", mode: "agent", handle: "@continuity", accent: "#777" });
  state.presence!.environment = "live"; state.presence!.browserAccess = { enabled: true }; state.presence!.status = "live"; state.presence!.execution.post = "review";
  state.presences = state.presences.map(presence => presence.id === state.presence!.id ? state.presence! : presence);
  const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome · Continuity", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply"], formats: ["x.post"], metrics: [] } } });
  const executorId = "openpresence-chrome-continuity";
  return { state: result.state, bridge: result.bridge!, executorId };
}
function blockedState() {
  const result = fixture();
  const assignment = compileAssignmentInstruction(result.state, "Publish one useful original post", result.state.presence!.id, "live");
  assignment.status = "blocked"; assignment.lastOutcome = { class: "assignment_blocked", message: "X API billing is unavailable and no authorized browser route is ready.", at: new Date().toISOString() }; result.state.assignments = [assignment];
  result.state.nativeConnections = [{ id: "unhealthy-api", presenceId: result.state.presence!.id, channelId: "x", kind: "x", status: "needs-attention", access: "read-write", deliveryError: "HTTP 402 credits depleted", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  writeState(result.state); return { ...result, assignment };
}

describe("fresh executor browser capability and responsibility continuity", () => {
  it("requires successful content probe, matching executor identity and fresh server observation across state reloads", () => {
    const { bridge, executorId } = fixture();
    heartbeatBridge(bridge, executorId); reportBridgeIdentity(bridge, { executorId, username: "continuity" });
    expect(bridgeReadyForExpectedAccount(readState().bridges[0]!, "@continuity")).toBe(false);
    heartbeatBridge(bridge, executorId, adapter);
    const ready = readState().bridges[0]!;
    expect(bridgeReadyForExpectedAccount(ready, "@continuity", Date.now(), { affordance: "post", media: true })).toBe(true);
    expect(readBrowserAdapterObservations(bridge.id)[0]).toMatchObject({ ...adapter, executorId, accountIdentity: { username: "continuity", status: "verified" } });
    expect(bridgeReadyForExpectedAccount(ready, "@wrong")).toBe(false);
    expect(bridgeReadyForExpectedAccount(ready, "@continuity", Date.now() + 120_001)).toBe(false);
    expect(bridgeReadyForExpectedAccount(ready, "@continuity", Date.now(), { affordance: "delete" })).toBe(false);
    heartbeatBridge(bridge, executorId); expect(bridgeReadyForExpectedAccount(readState().bridges[0]!, "@continuity")).toBe(false);
  });

  it("does not borrow a different executor's identity or stale advertised capability", () => {
    const { bridge, executorId } = fixture();
    heartbeatBridge(bridge, executorId); reportBridgeIdentity(bridge, { executorId, username: "continuity" });
    heartbeatBridge(bridge, "openpresence-chrome-other", adapter);
    expect(bridgeReadyForExpectedAccount(readState().bridges[0]!, "@continuity")).toBe(false);
    reportBridgeIdentity(bridge, { executorId: "openpresence-chrome-other", username: "wrong" });
    expect(bridgeReadyForExpectedAccount(readState().bridges[0]!, "@continuity")).toBe(false);
    heartbeatBridge(bridge, executorId, { ...adapter, probed: false });
    expect(bridgeReadyForExpectedAccount(readState().bridges[0]!, "@continuity")).toBe(false);
  });

  it("resumes one blocked responsibility only after probe and account become ready, preserving unhealthy API and failure truth", () => {
    const { bridge, executorId, assignment } = blockedState();
    reportBridgeIdentity(bridge, { executorId, username: "continuity" });
    expect(readState().assignments[0]?.status).toBe("blocked");
    heartbeatBridge(bridge, executorId, adapter);
    const resumed = readState(); expect(resumed.assignments).toHaveLength(1); expect(resumed.assignments[0]).toMatchObject({ id: assignment.id, status: "active", progress: { verified: 0 }, lastOutcome: { class: "incomplete" } });
    expect(resumed.nativeConnections[0]).toMatchObject({ status: "needs-attention", deliveryError: "HTTP 402 credits depleted" }); expect(resumed.outcomes).toHaveLength(0); expect(resumed.executions).toHaveLength(0);
    heartbeatBridge(bridge, executorId, adapter); expect(readState().assignments[0]?.revision).toBe(resumed.assignments[0]?.revision); expect(resumeBrowserBlockedResponsibilities(readState())).toEqual([]);
  });

  it.each(["audience_growth", "maintain_original_presence"] as const)("resumes the actual ongoing %s responsibility through supported browser actions", kind => {
    const { bridge, executorId, assignment } = blockedState();
    const state = readState();
    state.assignments[0]!.deliverable.type = kind;
    state.assignments[0]!.lastOutcome = { class: "delivery_failed", message: "The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted.", at: new Date().toISOString() };
    writeState(state);
    reportBridgeIdentity(bridge, { executorId, username: "continuity" }); heartbeatBridge(bridge, executorId, adapter);
    expect(readState().assignments[0]).toMatchObject({ id: assignment.id, status: "active" });
  });

  it("preserves paused, completed, expired, uncertain, canceled and already-outcomed work", () => {
    const { state, bridge, executorId, assignment } = blockedState();
    reportBridgeIdentity(bridge, { executorId, username: "continuity" }); heartbeatBridge(bridge, executorId, adapter);
    const ready = readState();
    for (const alter of [
      (candidate: typeof state) => { candidate.presences[0]!.status = "paused"; },
      (candidate: typeof state) => { candidate.assignments[0]!.status = "cancelled"; },
      (candidate: typeof state) => { candidate.assignments[0]!.status = "completed"; },
      (candidate: typeof state) => { candidate.assignments[0]!.timeframe = { deadline: new Date(0).toISOString() }; },
      (candidate: typeof state) => { candidate.executions = [{ id: "unsafe", assignmentId: assignment.id, presenceId: candidate.presence!.id, environment: "live", status: "verification-pending", socialIntentId: "intent", affordance: "x.post", mode: "auto", attempts: 1, idempotencyKey: "unsafe", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]; },
      (candidate: typeof state) => { candidate.presences[0]!.execution.post = "off"; },
      (candidate: typeof state) => { candidate.assignments[0]!.planningOnly = true; },
    ]) { const candidate = structuredClone(ready); candidate.assignments[0]!.status = "blocked"; candidate.assignments[0]!.lastOutcome = assignment.lastOutcome; alter(candidate); expect(resumeBrowserBlockedResponsibilities(candidate)).toEqual([]); }
  });

  it("never renews an expired intent or auto-requeues a failed action on identity verification", () => {
    const { state, bridge, executorId } = fixture(); const at = new Date().toISOString();
    state.socialIntents = [{ id: "expired", agentId: state.agent!.id, presenceId: state.presence!.id, affordance: "x.post", priority: 1, validity: { expiresAt: new Date(0).toISOString() }, state: "expired", formedAt: at, updatedAt: at }];
    state.executions = [{ id: "old", socialIntentId: "expired", presenceId: state.presence!.id, affordance: "x.post", mode: "auto", status: "failed", connector: "native", attempts: 1, idempotencyKey: "old", failure: { code: "X_API_CREDITS_EXHAUSTED", message: "X API billing credits depleted", retryable: false }, environment: "live", createdAt: at, updatedAt: at }]; writeState(state);
    heartbeatBridge(bridge, executorId, adapter); reportBridgeIdentity(bridge, { executorId, username: "continuity" });
    expect(readState().executions[0]).toMatchObject({ id: "old", status: "failed", connector: "native", attempts: 1 }); expect(readState().socialIntents[0]).toMatchObject({ state: "expired", validity: { expiresAt: new Date(0).toISOString() } });
  });

  it("resumes an unmet metric responsibility despite prior verified actions, without replaying them", () => {
    const { bridge, executorId, assignment } = blockedState();
    const state = readState();
    state.assignments[0]!.progress = { ...assignment.progress, required: 1, verified: 10 };
    state.assignments[0]!.successEvidence = { kind: "metric_threshold", metric: "followers", comparator: ">=", value: 100000 };
    const at = new Date().toISOString();
    state.executions = [{ id: "prior-occurrence", assignmentId: assignment.id, socialIntentId: "prior", presenceId: state.presence!.id, environment: "live", affordance: "x.post", mode: "auto", status: "succeeded", attempts: 1, idempotencyKey: "prior", externalRef: { type: "x.post", id: "123" }, executedAt: at, createdAt: at, updatedAt: at }];
    writeState(state);
    reportBridgeIdentity(bridge, { executorId, username: "continuity" }); heartbeatBridge(bridge, executorId, adapter);
    expect(readState().assignments[0]).toMatchObject({ id: assignment.id, status: "active", progress: { verified: 10 } });
    expect(readState().executions).toMatchObject([{ id: "prior-occurrence", status: "succeeded", attempts: 1 }]);
    expect(readState().outcomes).toHaveLength(0);
  });
});
