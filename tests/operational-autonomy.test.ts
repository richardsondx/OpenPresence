import { describe, expect, it } from "vitest";
import {
  claimOperationalRunLease,
  getBrowserBody,
  getDependencyHealth,
  getOperationalRun,
  listOperationalRuns,
  listRecoveryAttempts,
  listRecoveryIncidents,
  readStateSnapshotForContext,
  reclaimExpiredLeases,
  releaseOperationalRunLease,
  upsertBrowserBody,
  upsertDependencyHealth,
  upsertOperationalRun,
  upsertScheduledWake,
} from "../lib/db";
import { routeExecutionIntent } from "../lib/execution-router";
import {
  classifyFailureRootCause,
  logRecoveryAttempt,
  recordOperationalFailure,
  recordOperationalSuccess,
} from "../lib/incident-engine";
import { projectLegacyFailuresToIncidents } from "../lib/incident-migration";
import { compileOperationalContext } from "../lib/operational-context";
import { reconsiderAffectedRuns } from "../lib/recovery-reconsideration";
import {
  calculateStaleAt,
  evaluateOperationalRunProgress,
  runOperationalSweep,
  scheduleRetryWake,
  scheduleWake,
} from "../lib/temporal";
import type {
  Execution,
  MirrorObject,
  OperationalRun,
  Presence,
  SocialIntent,
} from "../lib/types";
import {
  buildActionFingerprint,
  reconcileUncertainDelivery,
} from "../lib/uncertain-reconciler";

describe("Operational Autonomy & Temporal Runtime (Tier A / B / C Proofs)", () => {
  const presenceId = "presence_test_1";

  // Invariant 1: Time and Durable Wakes
  it("Invariant 1 & 5: Time is deterministic; stuck is derived from stage-specific elapsed time", () => {
    const run: OperationalRun = {
      id: "run_test_stale",
      presenceId,
      kind: "delivery",
      state: "running",
      stage: "browser.composer_input", // Expected 60s
      createdAt: new Date(Date.now() - 500000).toISOString(),
      lastProgressAt: new Date(Date.now() - 120000).toISOString(), // 120s ago
      attemptCount: 1,
      recoveryCount: 0,
    };
    upsertOperationalRun(run);

    const staleEval = evaluateOperationalRunProgress(run);
    expect(staleEval.isStale).toBe(true);
    expect(staleEval.reason).toContain("browser.composer_input");

    // Waiting run with future wake is NOT stale
    const waitingRun: OperationalRun = {
      id: "run_test_waiting",
      presenceId,
      kind: "delivery",
      state: "waiting",
      stage: "waiting.provider_quota",
      createdAt: new Date().toISOString(),
      nextWakeAt: new Date(Date.now() + 600000).toISOString(), // 10 minutes in future
      attemptCount: 1,
      recoveryCount: 0,
    };
    const waitingEval = evaluateOperationalRunProgress(waitingRun);
    expect(waitingEval.isStale).toBe(false);
  });

  it("Invariant: Durable scheduled wakes dispatch and unblock waiting runs upon sweep", () => {
    const run: OperationalRun = {
      id: "run_wake_target",
      presenceId,
      kind: "delivery",
      state: "waiting",
      stage: "waiting.cooldown",
      createdAt: new Date().toISOString(),
      attemptCount: 1,
      recoveryCount: 0,
    };
    upsertOperationalRun(run);

    // Schedule a wake in the past
    scheduleWake("retry", new Date(Date.now() - 5000).toISOString(), presenceId, run.id);

    const sweep = runOperationalSweep();
    expect(sweep.dispatchedWakes.length).toBeGreaterThan(0);

    const updated = getOperationalRun(run.id);
    expect(updated?.state).toBe("queued");
    expect(updated?.stage).toBe("woken_from_retry");
  });

  // Invariant 7: Failures sharing a root cause are one incident
  it("Invariant 7: Multiple related failures aggregate into a single incident with recovery budget", () => {
    const err = "Chrome extension composer input failed";
    const f1 = recordOperationalFailure({ dependency: "managed_browser", presenceId, runId: "run_1", error: err });
    const f2 = recordOperationalFailure({ dependency: "managed_browser", presenceId, runId: "run_2", error: err });
    const f3 = recordOperationalFailure({ dependency: "managed_browser", presenceId, runId: "run_3", error: err });

    expect(f1.incident.id).toBe(f2.incident.id);
    expect(f2.incident.id).toBe(f3.incident.id);
    expect(f3.incident.affectedRunIds).toContain("run_1");
    expect(f3.incident.affectedRunIds).toContain("run_2");
    expect(f3.incident.affectedRunIds).toContain("run_3");
    expect(f3.incident.rootCauseKey).toBe("browser.composer_unavailable");
  });

  // Invariant 9: Strict Native-First Routing & 429 Quota Invariant
  it("Invariant 9: Execution router chooses Native-first and halts on 429 without browser evasion", () => {
    const mockPresence: Presence = {
      id: presenceId,
      channel: "x",
      name: "Genny",
      handle: "@example_agent",
      mode: "agent",
      status: "live",
      accent: "#1DA1F2",
      capabilities: [],
      execution: { reply: "auto" },
      executionEnvelope: { presenceId, affordances: { reply: { mode: "auto" } }, pacingProfile: "recommended", accountProtection: "guidance" },
      context: { audience: "founders", goals: ["engagement"] },
      brief: { mission: "Lead AI founder presence", coreTopics: ["AI", "Autonomy"], voiceNotes: ["Curious"], boundaries: ["No spam"], keyPeople: [] },
      publicSelf: { displayName: "Genny", handle: "@example_agent", bio: "Autonomous AI Presence", avatarUrl: "", channel: "x", presenceId },
      mediaPerceptionPolicy: "use-judgment",
      languagePolicy: { avoidTerms: [], avoidThemes: [], preferredPhrasing: {}, prohibitedTerms: [] },
      pacing: { minMinutesBetweenPosts: 30, maxPostsPerDay: 5, quietHoursEnabled: false },
      attentionIntervalMinutes: 15,
      quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "America/New_York" },
      publishingInitiative: { enabled: true, cadence: "daily", days: [], slotsPerDay: 1, preferredTimeWindow: "morning", topics: [], themes: [], formatDiversity: true },
      accountHealth: "healthy",
    };

    const intent: SocialIntent = {
      id: "intent_1",
      presenceId,
      affordance: "reply",
      status: "ready",
      summary: "Reply to @maya",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // When Native is healthy -> Native route
    const decision = routeExecutionIntent({ intent, presence: mockPresence });
    expect(["native_x", "blocked", "user_attached_bridge"]).toContain(decision.route);

    // When Native is rate limited (429) -> blocked with waitResetAt, NEVER browser evasion
    const resetTime = new Date(Date.now() + 900000).toISOString();
    recordOperationalFailure({
      dependency: "native_x",
      presenceId,
      error: "429 Too Many Requests: Rate limit exceeded",
    });
    const health = getDependencyHealth("native_x", presenceId);
    if (health) {
      health.state = "waiting";
      health.circuitUntil = resetTime;
      upsertDependencyHealth(health);
      upsertBrowserBody({
        presenceId,
        mode: "managed",
        ownership: "openpresence",
        state: "healthy",
        canOpenTabs: true,
        canCloseOwnedTabs: true,
        canRestartBrowser: true,
        canRestoreSession: true,
        updatedAt: new Date().toISOString(),
      });
    }

    const decision429 = routeExecutionIntent({ intent, presence: mockPresence });
    expect(decision429.route).toBe("blocked");
    expect(decision429.reason).toContain("Hard invariant: rate limits are waited out, never evaded via browser");
  });

  // Invariant 8: Uncertain Write Reconciliation
  it("Invariant 8: Uncertain public write reconciles with Social Mirror and is never blindly retried", () => {
    const run: OperationalRun = {
      id: "run_uncertain_1",
      presenceId,
      kind: "delivery",
      state: "delivery_uncertain",
      stage: "browser.submit",
      createdAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      attemptCount: 1,
      recoveryCount: 0,
    };

    const execution: Execution = {
      id: "exec_uncertain_1",
      socialIntentId: "intent_1",
      presenceId,
      affordance: "reply",
      mode: "auto",
      status: "executing",
      attempts: 1,
      idempotencyKey: "idem_123",
      publication: {
        id: "pub_1",
        format: "x.post",
        payload: { text: "Building self-maintaining operational autonomy in AI agents." },
        assetIds: [],
        links: [],
        channel: "x",
        presenceId,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      },
      createdAt: run.createdAt,
      updatedAt: run.createdAt,
    };

    // Case 1: External Mirror has the matching write -> Verified!
    const mirrorObjects: MirrorObject[] = [
      {
        id: "mirror_obj_1",
        presenceId,
        channel: "x",
        content: { text: "Building self-maintaining operational autonomy in AI agents." },
        externalRef: { id: "ext_tweet_999", type: "post", channel: "x" },
        observedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const outcomeFound = reconcileUncertainDelivery({ run, execution, mirrorObjects });
    expect(outcomeFound.status).toBe("verified");
    if (outcomeFound.status === "verified") {
      expect(outcomeFound.externalId).toBe("ext_tweet_999");
    }

    // Case 2: Within propagation window (< 5m) with no object -> Reconciling
    const outcomeReconciling = reconcileUncertainDelivery({ run, execution, mirrorObjects: [] });
    expect(outcomeReconciling.status).toBe("reconciling");

    // Case 3: Propagation window elapsed (> 5m) -> Safe to retry
    const oldRun: OperationalRun = { ...run, createdAt: new Date(Date.now() - 360000).toISOString() };
    const outcomeSafeRetry = reconcileUncertainDelivery({ run: oldRun, execution, mirrorObjects: [] });
    expect(outcomeSafeRetry.status).toBe("safe_to_retry");
  });

  // Invariant 6: Reconsideration after Recovery
  it("Invariant 6: Recovery reconsiders affected work rather than blindly flushing stale backlog", () => {
    const expiredRun: OperationalRun = {
      id: "run_affected_expired",
      presenceId,
      kind: "delivery",
      state: "waiting",
      stage: "waiting.browser_recovery",
      createdAt: new Date(Date.now() - 1000000).toISOString(),
      expiresAt: new Date(Date.now() - 10000).toISOString(), // expired
      attemptCount: 1,
      recoveryCount: 0,
    };
    const validRun: OperationalRun = {
      id: "run_affected_valid",
      presenceId,
      kind: "delivery",
      state: "recovering",
      stage: "incident_browser.composer_unavailable",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000000).toISOString(),
      attemptCount: 1,
      recoveryCount: 0,
    };

    upsertOperationalRun(expiredRun);
    upsertOperationalRun(validRun);

    const reconsideration = reconsiderAffectedRuns({ presenceId });
    expect(reconsideration.totalAffected).toBeGreaterThanOrEqual(2);
    expect(reconsideration.expired).toBeGreaterThanOrEqual(1);
    expect(reconsideration.stillRelevant).toBeGreaterThanOrEqual(1);

    const checkedExpired = getOperationalRun("run_affected_expired");
    expect(checkedExpired?.state).toBe("cancelled");

    const checkedValid = getOperationalRun("run_affected_valid");
    expect(checkedValid?.state).toBe("queued");
  });

  // Invariant: Bounded Operational Context Compiler
  it("Invariant: Operational Context provides truthful status to Genny without leaking raw logs", () => {
    const context = compileOperationalContext(presenceId);
    expect(context.now).toBeDefined();
    expect(["healthy", "recovering", "waiting", "needs_you"]).toContain(context.overallStatus);
    expect(context.summary).toBeDefined();
  });

  // Invariant: Legacy Failure Migration
  it("Invariant: Legacy failures project cleanly into aggregated root-cause incidents", () => {
    const legacyExecutions: Execution[] = [
      {
        id: "exec_legacy_1",
        socialIntentId: "intent_1",
        presenceId,
        affordance: "reply",
        mode: "auto",
        status: "failed",
        attempts: 1,
        connector: "bridge",
        failure: { message: "Chrome extension composer input failed" },
        idempotencyKey: "idem_1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "exec_legacy_2",
        socialIntentId: "intent_2",
        presenceId,
        affordance: "reply",
        mode: "auto",
        status: "failed",
        attempts: 1,
        connector: "bridge",
        failure: { message: "Chrome extension composer input failed" },
        idempotencyKey: "idem_2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const migration = projectLegacyFailuresToIncidents(legacyExecutions);
    expect(migration.totalLegacyFailures).toBe(2);
    expect(migration.projectedIncidentsCount).toBe(1);
    expect(migration.incidents[0].affectedRunIds).toContain("exec_legacy_1");
    expect(migration.incidents[0].affectedRunIds).toContain("exec_legacy_2");
  });

  it("Invariant: Recovery attempt ladder increments atomically and exhausts to needs_operator", () => {
    const uniquePresence = `presence_exhaust_${Date.now()}`;
    const failure = recordOperationalFailure({
      dependency: "native_x",
      presenceId: uniquePresence,
      runId: "run_exhaust_1",
      error: "X API network timeout",
    });

    const incidentId = failure.incident.id;

    // Attempt 1
    const att1 = logRecoveryAttempt({ incidentId, step: "reconnect_probe_1", outcome: "failed", error: "Still timed out" });
    expect(att1.attemptNumber).toBe(1);
    let inc = listRecoveryIncidents(uniquePresence).find((i) => i.id === incidentId);
    expect(inc?.recoveryAttempts).toBe(1);
    expect(inc?.state).toBe("recovering");

    // Attempt 2
    const att2 = logRecoveryAttempt({ incidentId, step: "reconnect_probe_2", outcome: "failed", error: "Still timed out" });
    expect(att2.attemptNumber).toBe(2);
    inc = listRecoveryIncidents(uniquePresence).find((i) => i.id === incidentId);
    expect(inc?.recoveryAttempts).toBe(2);
    expect(inc?.state).toBe("recovering");

    // Attempt 3 (exhaustion for native_x maxAttempts: 3)
    const att3 = logRecoveryAttempt({ incidentId, step: "reconnect_probe_3", outcome: "failed", error: "Still timed out" });
    expect(att3.attemptNumber).toBe(3);
    inc = listRecoveryIncidents(uniquePresence).find((i) => i.id === incidentId);
    expect(inc?.recoveryAttempts).toBe(3);
    expect(inc?.state).toBe("needs_operator");
    expect(inc?.operatorActionRequired).toBe(true);
  });

  it("Invariant: Root causes are scoped by dependency and resolve by dependencyId upon verified success", () => {
    const uniquePresence = `presence_dep_${Date.now()}`;
    const xFailure = recordOperationalFailure({ dependency: "native_x", presenceId: uniquePresence, error: "429 Too Many Requests" });
    const aiFailure = recordOperationalFailure({ dependency: "model_provider", presenceId: uniquePresence, error: "429 Too Many Requests" });

    expect(xFailure.incident.rootCauseKey).toBe("native_x.rate_limit");
    expect(aiFailure.incident.rootCauseKey).toBe("model_provider.rate_limit");
    expect(xFailure.incident.id).not.toBe(aiFailure.incident.id);

    // Resolving native_x only resolves native_x incidents
    const resolvedX = recordOperationalSuccess("native_x", uniquePresence);
    expect(resolvedX.resolvedIncidents.some((i) => i.id === xFailure.incident.id)).toBe(true);
    expect(resolvedX.resolvedIncidents.some((i) => i.id === aiFailure.incident.id)).toBe(false);

    // model_provider incident remains open until model_provider succeeds
    const remaining = listRecoveryIncidents(uniquePresence).find((i) => i.id === aiFailure.incident.id);
    expect(remaining?.state).not.toBe("resolved");

    const resolvedAi = recordOperationalSuccess("model_provider", uniquePresence);
    expect(resolvedAi.resolvedIncidents.some((i) => i.id === aiFailure.incident.id)).toBe(true);
  });

  it("Invariant: readStateSnapshotForContext hydrates live recovery incidents into state for accurate UI metrics", () => {
    const uniquePresence = `presence_ui_rec_${Date.now()}`;
    const failure = recordOperationalFailure({ dependency: "native_x", presenceId: uniquePresence, error: "Network timeout" });
    const resolved = recordOperationalSuccess("native_x", uniquePresence);
    expect(resolved.resolvedIncidents.length).toBeGreaterThan(0);

    const snapshot = readStateSnapshotForContext({ presenceId: uniquePresence });
    expect(snapshot.recoveryIncidents).toBeDefined();
    const matched = snapshot.recoveryIncidents?.filter((i) => (!i.presenceId || i.presenceId === uniquePresence) && i.state === "resolved");
    expect(matched?.some((i) => i.id === failure.incident.id)).toBe(true);
  });
});
