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
  upsertRecoveryIncident,
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
import { compileOperationalContext, readOperationalHealth } from "../lib/operational-context";
import { reconsiderAffectedRuns } from "../lib/recovery-reconsideration";
import {
  calculateStaleAt,
  closeStaleBridgeExecutions,
  evaluateOperationalRunProgress,
  reconcileOrphanedWaitingRuns,
  isLiveTemporalPresence,
  runOperationalSweep,
  scheduleRetryWake,
  scheduleWake,
} from "../lib/temporal";
import { settleAutonomyInitializationFailure } from "../lib/autonomy-worker";
import { initialState } from "../lib/runtime";
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

  it("keeps Sandbox Presences out of the live temporal scheduler", () => {
    expect(isLiveTemporalPresence({ status: "live", environment: "live" })).toBe(true);
    expect(isLiveTemporalPresence({ status: "live", environment: "sandbox" })).toBe(false);
    expect(isLiveTemporalPresence({ status: "paused", environment: "live" })).toBe(false);
  });

  it("fences a second worker invocation even when it targets the same run in the same process", () => {
    const runId = `run_lease_fence_${Date.now()}_${Math.random()}`;
    upsertOperationalRun({ id: runId, presenceId, kind: "attention", state: "queued", stage: "queued", createdAt: new Date().toISOString(), attemptCount: 0, recoveryCount: 0 });
    expect(claimOperationalRunLease(runId, `${runId}:invocation-a`)).toBe(true);
    expect(claimOperationalRunLease(runId, `${runId}:invocation-b`)).toBe(false);
    expect(releaseOperationalRunLease(runId, `${runId}:invocation-a`)).toBe(true);
    expect(claimOperationalRunLease(runId, `${runId}:invocation-b`)).toBe(true);
    expect(releaseOperationalRunLease(runId, `${runId}:invocation-b`)).toBe(true);
  });

  it("releases a run when its pre-work attention receipt cannot be persisted", () => {
    const runId = `run_initialization_failure_${Date.now()}_${Math.random()}`;
    const workerOwner = `${runId}:worker`;
    upsertOperationalRun({ id: runId, presenceId, kind: "attention", state: "running", stage: "looking", createdAt: new Date().toISOString(), attemptCount: 1, recoveryCount: 0, leaseOwner: workerOwner, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });

    settleAutonomyInitializationFailure(runId, workerOwner, new Error("workspace changed while saving attention receipt"));

    const recovered = getOperationalRun(runId);
    expect(recovered).toMatchObject({ state: "recovering", stage: "failed_initialization" });
    expect(recovered).not.toHaveProperty("leaseOwner");
    expect(recovered).not.toHaveProperty("leaseExpiresAt");
  });

  it("closes stale waiting runs only when no pending execution evidence remains", () => {
    const now = new Date("2026-08-30T16:00:00.000Z");
    const orphanId = `run_orphaned_wait_${Date.now()}_${Math.random()}`;
    const pendingId = `run_pending_wait_${Date.now()}_${Math.random()}`;
    const staleAt = new Date(now.getTime() - 10 * 60_000).toISOString();
    upsertOperationalRun({ id: orphanId, presenceId, kind: "attention", state: "waiting", stage: "delivering", createdAt: staleAt, lastProgressAt: staleAt, attemptCount: 1, recoveryCount: 0, result: { disposition: "waiting_delivery", summary: "waiting", selectedActionCount: 1, pendingExecutionCount: 1, failedExecutionCount: 0, verifiedOutcomeCount: 0 } });
    upsertOperationalRun({ id: pendingId, presenceId, kind: "attention", state: "waiting", stage: "delivering", createdAt: staleAt, lastProgressAt: staleAt, attemptCount: 1, recoveryCount: 0, result: { disposition: "waiting_delivery", summary: "waiting", selectedActionCount: 1, pendingExecutionCount: 1, failedExecutionCount: 0, verifiedOutcomeCount: 0 } });
    const source = initialState();
    source.executions = [{ id: "execution-still-pending", presenceId, runId: pendingId, status: "queued" }] as never;

    expect(reconcileOrphanedWaitingRuns(source, now, presenceId)).toBe(1);
    expect(getOperationalRun(orphanId)).toMatchObject({ state: "failed", stage: "recovered_orphaned_wait", lastErrorCode: "STALE_WAITING_RUN" });
    expect(getOperationalRun(pendingId)?.state).toBe("waiting");
  });

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

  it("Invariant: an unclaimed Bridge action closes truthfully instead of holding attention forever", () => {
    const now = new Date("2026-08-25T06:20:00.000Z");
    const staleHeartbeat = new Date(now.getTime() - 3 * 60_000).toISOString();
    const source = initialState();
    source.presence = { ...source.presence!, id: presenceId, status: "live" as const, channel: "x" as const };
    source.presences = [source.presence];
    source.bridges = [{
      id: "bridge_stale_delivery",
      presenceId,
      channelId: "x",
      name: "Stale Chrome Bridge",
      kind: "bridge",
      state: "online",
      adapterStatus: "connected",
      lastHeartbeatAt: staleHeartbeat,
      accountIdentity: { username: "example_agent", status: "verified", observedAt: staleHeartbeat },
      capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] },
      createdAt: staleHeartbeat,
      updatedAt: staleHeartbeat,
    }];
    source.socialIntents = [{ id: "intent_stale_delivery", presenceId, affordance: "x.reply", state: "ready", createdAt: staleHeartbeat, updatedAt: staleHeartbeat } as never];
    source.executions = [{
      id: "execution_stale_delivery",
      socialIntentId: "intent_stale_delivery",
      presenceId,
      affordance: "x.reply",
      mode: "auto",
      status: "queued",
      attempts: 0,
      bridgeId: "bridge_stale_delivery",
      connector: "bridge",
      idempotencyKey: "stale-delivery-key",
      createdAt: staleHeartbeat,
      updatedAt: staleHeartbeat,
    }];

    expect(closeStaleBridgeExecutions(source, now)).toBe(1);
    expect(source.executions[0].status).toBe("failed");
    expect(source.executions[0].failure).toMatchObject({ code: "BRIDGE_NOT_CHECKED_IN", retryable: true });
    expect(source.executions[0].failure?.message).toContain("no external write was attempted");
    expect(source.executions[0].externalRef).toBeUndefined();
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

  it("Invariant: deterministic model configuration failures stop retrying and require one actionable setup step", () => {
    const classification = classifyFailureRootCause(
      "Openai is selected but no API key is stored. Open Brain → Provider access and save the key.",
      "model_provider",
    );
    expect(classification.rootCauseKey).toBe("model_provider.credentials_missing");
    expect(classification.retryable).toBe(false);
    expect(classification.requiresOperator).toBe(true);
  });

  it("treats SQLite corruption as a database boundary instead of a recoverable runtime outage", () => {
    const uniquePresence = `presence_database_corruption_${Date.now()}`;
    const classification = classifyFailureRootCause("database disk image is malformed", "runtime");
    expect(classification).toMatchObject({
      rootCauseKey: "database.corruption",
      retryable: false,
      requiresOperator: true,
    });

    const { incident } = recordOperationalFailure({
      dependency: "runtime",
      presenceId: uniquePresence,
      runId: "run_database_corruption",
      error: "database disk image is malformed",
    });
    expect(incident).toMatchObject({
      rootCauseKey: "database.corruption",
      dependencyId: `dh_database_${uniquePresence}`,
      state: "needs_operator",
      operatorActionRequired: true,
    });
    expect(readOperationalHealth(uniquePresence).status).toBe("needs_you");
  });

  it("retires a pre-start database incident after the verified recovery is open", () => {
    const uniquePresence = `presence_database_recovered_${Date.now()}`;
    const { incident } = recordOperationalFailure({
      dependency: "runtime",
      presenceId: uniquePresence,
      runId: "run_database_recovered",
      error: "database disk image is malformed",
    });
    incident.openedAt = "2000-01-01T00:00:00.000Z";
    upsertRecoveryIncident(incident);

    const health = readOperationalHealth(uniquePresence);

    expect(health.incidents.find((item) => item.id === incident.id)).toBeUndefined();
    expect(health.counts.activeIncidents).toBe(0);
  });

  it("Invariant: an existing recovery incident escalates immediately when credits become operator-blocked", () => {
    const uniquePresence = `presence_credit_escalation_${Date.now()}`;
    const first = recordOperationalFailure({ dependency: "runtime", presenceId: uniquePresence, runId: "run_credit_1", error: "X has no API credits remaining. Add credits or choose an API plan to continue." });
    first.incident.state = "recovering";
    first.incident.operatorActionRequired = false;
    first.incident.nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
    upsertRecoveryIncident(first.incident);

    const second = recordOperationalFailure({ dependency: "runtime", presenceId: uniquePresence, runId: "run_credit_2", error: "X has no API credits remaining. Add credits or choose an API plan to continue." });
    expect(second.incident.id).toBe(first.incident.id);
    expect(second.incident.state).toBe("needs_operator");
    expect(second.incident.operatorActionRequired).toBe(true);
    expect(second.incident.nextAttemptAt).toBeUndefined();
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
