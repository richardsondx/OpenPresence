import { describe, expect, it } from "vitest";
import { compileAssignmentInstruction, createAgent } from "../lib/runtime";
import { createBridgeWithKey, heartbeatBridge, reportBridgeIdentity } from "../lib/bridge";
import { readState } from "../lib/db";
import { resumeBrowserBlockedResponsibilities } from "../lib/assignment-recovery";
import type { Execution } from "../lib/types";
function fixture() {
  const state = createAgent({ name: "Recovery adversary", description: "Growth", mode: "agent", handle: "@recoveryqa", accent: "#777" });
  state.presence!.environment = "live"; state.presence!.browserAccess = { enabled: true }; state.presence!.status = "live"; state.presence!.execution.post = "review"; state.presences = [state.presence!];
  const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [] } } });
  const executorId = "openpresence-chrome-recoveryqa";
  reportBridgeIdentity(result.bridge!, { executorId, username: "recoveryqa" }); heartbeatBridge(result.bridge!, executorId, { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post"] } });
  const ready = readState(); const assignment = compileAssignmentInstruction(ready, "Publish one useful post", ready.presence!.id, "live");
  assignment.status = "blocked"; assignment.lastOutcome = { class: "assignment_blocked", message: "X API billing is unavailable and no authorized browser route is ready.", at: new Date().toISOString() };
  assignment.progress.verified = 1; assignment.progress.required = 1;
  assignment.successEvidence = { kind: "metric_threshold", metric: "followers", comparator: ">=", value: 100 };
  ready.assignments = [assignment];
  const at = new Date().toISOString();
  const prior: Execution = { id: "completed-old-occurrence", socialIntentId: "old-intent", assignmentId: assignment.id, presenceId: assignment.presenceId, environment: "live", status: "succeeded", affordance: "x.post", mode: "auto", attempts: 1, idempotencyKey: "old", externalRef: { type: "x.post", id: "111" }, executedAt: at, createdAt: at, updatedAt: at };
  ready.executions = [prior]; ready.outcomes = [{ id: "old-outcome", socialIntentId: "old-intent", executionId: prior.id, presenceId: prior.presenceId, status: "succeeded", observedAt: at, metrics: {}, evidence: [prior.externalRef!] }];
  return { state: ready, assignment, prior };
}
describe("responsibility recovery preserves occurrence and metric truth", () => {
  it("resumes unsatisfied metric responsibility despite an old successful occurrence without replaying it", () => {
    const { state, assignment } = fixture(); const executions = structuredClone(state.executions); const outcomes = structuredClone(state.outcomes);
    expect(resumeBrowserBlockedResponsibilities(state)).toEqual([assignment.id]);
    expect(state.executions).toEqual(executions); expect(state.outcomes).toEqual(outcomes);
    expect(state.assignments[0]).toMatchObject({ status: "active", progress: { verified: 1 } });
    expect(resumeBrowserBlockedResponsibilities(state)).toEqual([]);
  });
  it("keeps unresolved current occurrence blocked despite historical success", () => {
    const { state, prior } = fixture(); state.executions.push({ ...prior, id: "uncertain-current", status: "verification-pending", externalRef: undefined, executedAt: undefined });
    expect(resumeBrowserBlockedResponsibilities(state)).toEqual([]); expect(state.assignments[0].status).toBe("blocked");
  });
  it("does not reopen completed one-shot work from the same old-success fixture", () => {
    const { state } = fixture(); delete state.assignments[0].successEvidence;
    expect(resumeBrowserBlockedResponsibilities(state)).toEqual([]);
  });
});
