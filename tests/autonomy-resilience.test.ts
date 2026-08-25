import { describe, expect, it } from "vitest";
import { GET as systemLogGet } from "../app/api/runtime/log/route";
import {
  readState,
  upsertDependencyHealth,
  upsertOperationalRun,
  upsertRecoveryIncident,
  writeState,
} from "../lib/db";
import {
  recordOperationalFailure,
  recordOperationalSuccess,
  logRecoveryAttempt,
} from "../lib/incident-engine";
import { readOperationalHealth } from "../lib/operational-context";
import { queueAutonomyRun } from "../lib/autonomy-worker";
import { assignmentWorkerStaleAfterMs, recoverStaleAssignmentRuns } from "../lib/assignment-recovery";
import {
  defaultSelfDirectedAttentionPolicy,
  recordSocialDecision,
  formXActionIntent,
  createAgent,
} from "../lib/runtime";
import type { Assignment, OperationalRun, RecoveryIncident } from "../lib/types";

describe("Autonomous Resilience, System Log Projection & Dynamic Freshness", () => {
  const presenceId = "presence_resilience_test";

  it("projects correlated hierarchical System & Cognition Log DTO with write-time trace links", async () => {
    let state = createAgent({ name: "Resilience Test Agent", description: "Test agent", audience: "Testers", mode: "agent", handle: "@resilience_test", accent: "#777777" });
    const presence = {
      ...state.presence!,
      id: presenceId,
      status: "live" as const,
      channel: "x" as const,
      execution: { like: "auto" as const, quote: "auto" as const, reply: "auto" as const, follow: "auto" as const, repost: "auto" as const },
    };
    state.presence = presence;
    state.presences = [presence];

    const runId = "run_trace_propagation_test";
    const invocationId = "inv_trace_123";

    state = recordSocialDecision(state, {
      presenceId,
      decision: "quote",
      summary: "Adding distinct perspective to a major research paper",
      acts: [
        { decision: "quote", text: "Insightful milestone on agent memory.", rationale: "Adds perspective" },
        { decision: "like", rationale: "Quiet signal of appreciation" },
      ],
      origin: { kind: "self_directed_discovery" },
      confidence: "high",
      runId,
      invocationId,
    });

    state = formXActionIntent(state, {
      affordance: "x.like",
      target: { type: "x.post", id: "focal_post_999" },
      decision: {
        decision: "like",
        summary: "Like post",
        runId,
        invocationId,
      },
      runId,
      invocationId,
    });
    writeState(state);

    const run: OperationalRun = {
      id: runId,
      runId,
      invocationId,
      presenceId,
      kind: "discovery",
      state: "succeeded",
      stage: "completed",
      createdAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
      attemptCount: 1,
      recoveryCount: 0,
    };
    upsertOperationalRun(run);

    const response = await systemLogGet(new Request(`http://localhost/api/runtime/log?presenceId=${presenceId}`));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.presenceId).toBe(presenceId);
    expect(Array.isArray(payload.records)).toBe(true);

    const matchedRunRecord = payload.records.find((r: { runId?: string }) => r.runId === runId);
    expect(matchedRunRecord).toBeDefined();
    expect(matchedRunRecord.traceCompleteness).toBe("full");
    expect(matchedRunRecord.facets).toContain("run");
    expect(matchedRunRecord.facets).toContain("decision");
    expect(matchedRunRecord.facets).toContain("execution");
    expect(matchedRunRecord.decisions).toBeDefined();
    expect(matchedRunRecord.decisions.length).toBeGreaterThan(0);
    const multiActDecision = matchedRunRecord.decisions.find((d: { decision: string }) => d.decision === "quote");
    expect(multiActDecision).toBeDefined();
    expect(multiActDecision.acts).toHaveLength(2);
    expect(payload.page).toBe(1);
    expect(payload.pageSize).toBe(50);
    expect(payload.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("pages the forensic ledger instead of returning an unbounded first view", async () => {
    const response = await systemLogGet(new Request(`http://localhost/api/runtime/log?presenceId=${presenceId}&page=2&pageSize=10`));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.page).toBe(2);
    expect(payload.pageSize).toBe(10);
    expect(payload.records.length).toBeLessThanOrEqual(10);
    expect(payload.totalRecords).toBeGreaterThanOrEqual(payload.records.length);
  });

  it("proves EXACT incident identity-set equality between Operating Health and Recovery audit log", async () => {
    const parityPresenceId = "presence_parity_isolated_test";

    // Set up diverse incident scenarios
    const incZeroAttempt: RecoveryIncident = {
      id: "inc_zero_attempt_parity",
      rootCauseKey: "native_x.connection_lost",
      dependencyId: "dh_native_x_presence_parity_isolated_test",
      presenceId: parityPresenceId,
      state: "recovering",
      openedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
      affectedRunIds: [],
      recoveryAttempts: 0,
      safeSummary: "Zero-attempt connection failure",
      operatorActionRequired: false,
      updatedAt: new Date().toISOString(),
    };

    const incWaiting: RecoveryIncident = {
      id: "inc_waiting_rate_limit_parity",
      rootCauseKey: "native_x.rate_limit",
      dependencyId: "dh_native_x_presence_parity_isolated_test",
      presenceId: parityPresenceId,
      state: "waiting",
      openedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
      affectedRunIds: ["run_waiting_456"],
      recoveryAttempts: 1,
      nextAttemptAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      safeSummary: "X API rate limit waiting for quota reset",
      operatorActionRequired: false,
      updatedAt: new Date().toISOString(),
    };

    const incNeedsOperator: RecoveryIncident = {
      id: "inc_needs_operator_auth_parity",
      rootCauseKey: "native_x.auth_expired",
      dependencyId: "dh_native_x_presence_parity_isolated_test",
      presenceId: parityPresenceId,
      state: "needs_operator",
      openedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
      affectedRunIds: [],
      recoveryAttempts: 3,
      safeSummary: "X account authentication expired",
      operatorActionRequired: true,
      requiresAuth: true,
      updatedAt: new Date().toISOString(),
    };

    upsertRecoveryIncident(incZeroAttempt);
    upsertRecoveryIncident(incWaiting);
    upsertRecoveryIncident(incNeedsOperator);

    // 1. Health snapshot projection
    const health = readOperationalHealth(parityPresenceId);
    const healthActiveIncidentIds = new Set(health.incidents.map((i) => i.id));

    expect(health.counts.activeIncidents).toBe(3);
    expect(health.counts.recoveringIncidents).toBe(1);
    expect(health.counts.waitingIncidents).toBe(1);
    expect(health.counts.needsOperatorIncidents).toBe(1);
    expect(health.status).toBe("needs_you");

    // 2. Audit log recovery projection
    const response = await systemLogGet(new Request(`http://localhost/api/runtime/log?presenceId=${parityPresenceId}&facet=recovery`));
    expect(response.status).toBe(200);
    const payload = await response.json();

    const auditIncidentIds = new Set(payload.records.map((r: { incident?: { id: string } }) => r.incident?.id).filter(Boolean));

    // INVARIANT: Exactly identical active incident ID sets across health and audit projections!
    expect(auditIncidentIds).toEqual(healthActiveIncidentIds);
  });

  it("updates recovery attempt counts atomically and resolves incidents by dependency", () => {
    const { incident } = recordOperationalFailure({
      dependency: "native_x",
      presenceId,
      error: "connection reset by peer",
    });

    expect(incident.recoveryAttempts).toBe(0);

    const attempt1 = logRecoveryAttempt({
      incidentId: incident.id,
      step: "verify_socket",
      outcome: "failed",
      error: "still disconnected",
    });

    expect(attempt1.attemptNumber).toBe(1);

    const health1 = readOperationalHealth(presenceId);
    const updatedInc = health1.incidents.find((i) => i.id === incident.id);
    expect(updatedInc?.recoveryAttempts).toBe(1);
    expect(updatedInc?.currentRecoveryStep).toBe("verify_socket");

    // Operational success resolves incidents by dependency
    const { resolvedIncidents } = recordOperationalSuccess("native_x", presenceId);
    expect(resolvedIncidents.some((i) => i.id === incident.id)).toBe(true);

    const healthAfterSuccess = readOperationalHealth(presenceId);
    expect(healthAfterSuccess.incidents.find((i) => i.id === incident.id)).toBeUndefined();
  });

  it("queues durable OperationalRun with deterministic IDs and updates database", () => {
    const { run } = queueAutonomyRun(presenceId, "observation", { stage: "manual_check" });
    expect(run.id).toMatch(/^op_run_/);
    expect(run.state).toBe("queued");
    expect(run.stage).toBe("manual_check");
    expect(run.presenceId).toBe(presenceId);
    expect(run.attemptCount).toBe(0);
    expect(run.retryReason).toBeUndefined();
  });

  it("fails an abandoned Assignment run only after its grace period and preserves live workers", () => {
    const state = readState();
    const timestamp = new Date("2026-08-21T00:00:00.000Z").getTime();
    const assignment = {
      id: "assignment:stale-test",
      agentId: state.agent?.id ?? "agent:stale-test",
      presenceId: state.presence?.id ?? presenceId,
      status: "active" as const,
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: new Date(timestamp - 60_000).toISOString(),
      updatedAt: new Date(timestamp - 60_000).toISOString(),
    } as Assignment;
    const run = {
      id: "assignment-run:stale-test",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: assignment.presenceId,
      sessionId: "session:stale-test",
      status: "researching" as const,
      leaseOwner: "worker:dead",
      leaseExpiresAt: new Date(timestamp - 1).toISOString(),
      heartbeatAt: new Date(timestamp - assignmentWorkerStaleAfterMs - 1).toISOString(),
      currentStage: "researching" as const,
      attempts: 3,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: new Date(timestamp - assignmentWorkerStaleAfterMs - 10_000).toISOString(),
      updatedAt: new Date(timestamp - assignmentWorkerStaleAfterMs - 1).toISOString(),
    };
    const candidate = { ...state, assignments: [{ ...assignment, status: "working" as const }], assignmentRuns: [run] };
    const recovered = recoverStaleAssignmentRuns(candidate, timestamp);
    expect(recovered.recoveredRunIds).toEqual([run.id]);
    expect(recovered.state.assignmentRuns?.[0]).toMatchObject({ status: "failed", leaseOwner: undefined, leaseExpiresAt: undefined });
    expect(recovered.state.assignments[0]).toMatchObject({ status: "blocked", work: { blockedReason: expect.stringContaining("stopped reporting") } });

    const active = recoverStaleAssignmentRuns(candidate, timestamp, new Set([run.id]));
    expect(active.recoveredRunIds).toHaveLength(0);
    expect(active.state.assignmentRuns?.[0]?.status).toBe("researching");
  });

  it("calculates self-directed attention presets with bounded, realistic budgets", () => {
    const balanced = defaultSelfDirectedAttentionPolicy("balanced");
    expect(balanced.enabled).toBe(true);
    expect(balanced.intensity).toBe("balanced");
    expect(balanced.budget?.maxChannelReadsPerDay).toBe(60);
    expect(balanced.budget?.maxModelCallsPerDay).toBe(40);

    const curious = defaultSelfDirectedAttentionPolicy("curious");
    expect(curious.budget?.maxChannelReadsPerDay).toBe(150);
    expect(curious.budget?.maxModelCallsPerDay).toBe(90);
  });
});
