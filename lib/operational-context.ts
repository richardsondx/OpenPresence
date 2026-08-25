import { getDependencyHealth, getDueScheduledWakes, getOperationalRun, getProcessHeartbeats, listDependencyHealth, listOperationalRuns, listRecoveryIncidents, readBridgeHealthForPresence, readChannelSecret, readRuntimeHealthProjection, upsertDependencyHealth, upsertOperationalRun, upsertRecoveryIncident } from "./db";
import type { Bridge, OperationalHealthSnapshot } from "./types";
import { xCreditsExhausted } from "./x-credits";
import { bridgeExecutionStatus, bridgeIdentityReady } from "./bridge-contract";
import { requestAttention } from "./attention-coordinator";

export interface CompiledOperationalContext {
  now: string;
  overallStatus: "healthy" | "recovering" | "waiting" | "needs_you";
  nativeStatus: string;
  activeIncidentsCount: number;
  waitingRunsCount: number;
  recoveringRunsCount: number;
  summary: string;
}

/**
 * Repair only records produced by the old retry loop. This is intentionally
 * narrow: a real provider outage or an uncertain delivery remains visible and
 * follows the normal recovery ladder.
 */
function normalizeLegacyRuntimeIncidents(presenceId?: string) {
  const now = new Date().toISOString();
  for (const run of listOperationalRuns(presenceId, ["needs_operator"])) {
    if (!run.stage.startsWith("stale_recovery_") || !["observation", "discovery", "attention"].includes(run.kind)) continue;
    run.state = "cancelled";
    run.stage = "superseded_by_recovery_fix";
    run.blockedReason = "The old recursive stale-recovery loop was retired; a fresh bounded run will be scheduled.";
    delete run.leaseOwner;
    delete run.leaseExpiresAt;
    upsertOperationalRun(run);
  }
  for (const incident of listRecoveryIncidents(presenceId)) {
    if (incident.state === "resolved") continue;

    // Older incident rows can carry the operator boundary but retain a stale
    // recoverable state/attempt timestamp. Normalize that contradiction before
    // compiling health so the UI cannot report an exhausted provider as an
    // endlessly recovering autonomous run.
    if (incident.operatorActionRequired && incident.state !== "needs_operator") {
      incident.state = "needs_operator";
      delete incident.nextAttemptAt;
      incident.updatedAt = now;
      upsertRecoveryIncident(incident);
    }

    if (incident.rootCauseKey === "model_provider.transient_error" && /no api key|api key is stored|not connected|provider access/i.test(incident.safeSummary)) {
      incident.rootCauseKey = "model_provider.credentials_missing";
      incident.state = "needs_operator";
      incident.safeSummary = "The selected AI provider is not configured. Open Brain → Provider access and save a valid key or choose a connected local model.";
      incident.operatorActionRequired = true;
      incident.requiresAuth = true;
      incident.updatedAt = now;
      upsertRecoveryIncident(incident);
      const health = getDependencyHealth("model_provider", incident.presenceId);
      if (health) {
        health.state = "requires_operator";
        health.currentIncidentId = incident.id;
        health.updatedAt = now;
        upsertDependencyHealth(health);
      }
      continue;
    }

    if (incident.rootCauseKey !== "runtime.transient_error" || !incident.currentRecoveryStep?.startsWith("recover_stale_run_")) continue;
    const affectedRuns = incident.affectedRunIds.map((runId) => getOperationalRun(runId)).filter((run): run is NonNullable<typeof run> => Boolean(run));
    const legacyRuns = affectedRuns.filter((run) => run.stage.startsWith("stale_recovery_") && ["recovering", "needs_operator", "blocked"].includes(run.state));
    for (const run of legacyRuns) {
      run.state = "cancelled";
      run.stage = "superseded_by_recovery_fix";
      run.blockedReason = "The old recursive stale-recovery loop was retired; a fresh bounded run will be scheduled.";
      delete run.leaseOwner;
      delete run.leaseExpiresAt;
      upsertOperationalRun(run);
    }
    if (legacyRuns.length && affectedRuns.every((run) => ["cancelled", "succeeded", "failed"].includes(run.state) || legacyRuns.includes(run))) {
      incident.state = "resolved";
      incident.operatorActionRequired = false;
      incident.resolvedAt = now;
      incident.updatedAt = now;
      delete incident.nextAttemptAt;
      upsertRecoveryIncident(incident);
      const health = getDependencyHealth("runtime", incident.presenceId);
      if (health?.currentIncidentId === incident.id) {
        health.state = "healthy";
        health.consecutiveFailures = 0;
        health.lastHealthyAt = now;
        delete health.currentIncidentId;
        health.updatedAt = now;
        upsertDependencyHealth(health);
      }
    }
  }

  // A prior local process could retry the old observation watchdog without
  // inheriting the launcher-provided secret key, exhausting the recovery
  // budget even though the native credential itself is valid. Treat only that
  // recognizable legacy watchdog shape as superseded: verify the encrypted
  // credential is readable, retire the poisoned run, resolve the historical
  // incident, and let the durable temporal scheduler make one fresh attempt.
  const runtimeState = readRuntimeHealthProjection(presenceId);
  for (const incident of listRecoveryIncidents(presenceId)) {
    if (incident.state !== "needs_operator" || incident.rootCauseKey !== "native_x.transient_error" || !/woken_from_observation|expected duration/i.test(incident.safeSummary)) continue;
    const targetPresenceId = incident.presenceId ?? presenceId;
    if (!targetPresenceId) continue;
    const connection = runtimeState.nativeConnections.find((item) => item.presenceId === targetPresenceId && item.kind === "x");
    if (!connection) continue;
    try {
      if (!readChannelSecret(connection.id)) continue;
    } catch {
      continue;
    }
    const affectedRuns = incident.affectedRunIds.map((runId) => getOperationalRun(runId)).filter((run): run is NonNullable<typeof run> => Boolean(run));
    const legacyRuns = affectedRuns.filter((run) => run.kind === "observation" && (
      run.state === "needs_operator"
      || (run.state === "cancelled" && run.stage === "superseded_by_recovery_fix")
    ));
    if (!legacyRuns.length) continue;
    for (const run of legacyRuns) {
      run.state = "cancelled";
      run.stage = "superseded_by_recovery_fix";
      run.blockedReason = "A prior watchdog retry used an incomplete local runtime environment; the readable native credential is now being retried by the durable scheduler.";
      delete run.leaseOwner;
      delete run.leaseExpiresAt;
      upsertOperationalRun(run);
    }
    incident.state = "resolved";
    incident.resolvedAt = now;
    incident.operatorActionRequired = false;
    incident.requiresAuth = false;
    delete incident.nextAttemptAt;
    incident.updatedAt = now;
    upsertRecoveryIncident(incident);
    const health = getDependencyHealth("native_x", targetPresenceId);
    if (health?.currentIncidentId === incident.id || health?.state === "requires_operator") {
      health.state = "healthy";
      health.consecutiveFailures = 0;
      health.lastHealthyAt = now;
      delete health.currentIncidentId;
      health.updatedAt = now;
      upsertDependencyHealth(health);
    }
    requestAttention(targetPresenceId, "recovery", now, "recovery");
  }
}

export function readOperationalHealth(presenceId?: string, now = new Date()): OperationalHealthSnapshot {
  normalizeLegacyRuntimeIncidents(presenceId);
  const dependencyHealth = listDependencyHealth(presenceId);
  const incidents = listRecoveryIncidents(presenceId).filter((incident) => incident.state !== "resolved");
  let activeRuns = listOperationalRuns(presenceId, ["queued", "running", "waiting", "recovering", "delivery_uncertain", "reconciling", "blocked", "needs_operator"]);
  let creditsExhaustedState = false;
  let assignmentNeedsOperator = false;
  let assignmentNeedsOperatorSummary: string | undefined;
  let bridgeDeliveryWaiting = false;
  let bridgeIdentityWaiting = false;
  let enabledCapabilityUnavailable = false;
  let bridgeContinuityAvailable = false;
  try {
    const state = readRuntimeHealthProjection(presenceId);
    const presence = presenceId ? state.presences.find((p) => p.id === presenceId) : state.presences[0];
    const nativeConn = presence ? state.nativeConnections.find((c) => c.presenceId === presence.id && (c.kind === "x" || c.channelId === "x")) : undefined;
    creditsExhaustedState = Boolean(presence?.channel === "x" && presence?.environment !== "sandbox" && xCreditsExhausted(nativeConn));
    const blockedAssignment = state.assignments.find((assignment) =>
      (!presenceId || assignment.presenceId === presenceId) &&
      ["needs_operator", "blocked"].includes(assignment.status) &&
      Boolean(assignment.lastOutcome),
    );
    assignmentNeedsOperator = Boolean(blockedAssignment);
    if (blockedAssignment) assignmentNeedsOperatorSummary = `Assignment “${blockedAssignment.title}” needs you: ${blockedAssignment.lastOutcome?.message ?? blockedAssignment.work?.blockedReason ?? "it cannot continue automatically"} Open Schedule to revise, retry, or close it.`;
    const pendingStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
    const bridges = presenceId ? readBridgeHealthForPresence(presenceId) : [];
    // `bridges` already contains the indexed configuration plus live health;
    // do not rehydrate the complete compatibility snapshot inside every
    // browser health poll just to recover the same capabilities.
    const configuredBridges: Bridge[] = bridges as Bridge[];
    bridgeContinuityAvailable = presence?.channel === "x" && bridges.some((bridge) => bridgeExecutionStatus(bridge as Bridge) === "connected" && bridgeIdentityReady(bridge as Bridge));
    if (bridgeContinuityAvailable && creditsExhaustedState) creditsExhaustedState = false;
    // Native X quota exhaustion is a dependency incident, not a reason to
    // fence the whole Presence when its verified Chrome Bridge can continue
    // observing and delivering social work. Retire only the stale Native
    // responsibility; keep the incident visible as a Native limitation.
    if (bridgeContinuityAvailable) {
      const nativeQuotaIncidentIds = new Set(incidents.filter((incident) => /credits_exhausted|quota/i.test(incident.rootCauseKey)).map((incident) => incident.id));
      for (const run of activeRuns) {
        if (run.state !== "needs_operator" || !run.incidentId || !nativeQuotaIncidentIds.has(run.incidentId)) continue;
        run.state = "cancelled";
        run.stage = "superseded_by_bridge_continuity";
        run.blockedReason = "Native X quota is unavailable, but the verified Chrome Bridge remains an authorized continuity route.";
        run.lastProgressAt = now.toISOString();
        delete run.leaseOwner;
        delete run.leaseExpiresAt;
        upsertOperationalRun(run);
      }
      activeRuns = activeRuns.filter((run) => run.stage !== "superseded_by_bridge_continuity");
    }
    const waitingBridgeIds = new Set(bridges.filter((bridge) => bridgeExecutionStatus(bridge as Bridge) !== "connected").map((bridge) => bridge.id));
    const identityWaitingBridgeIds = new Set(bridges.filter((bridge) => bridgeExecutionStatus(bridge as Bridge) === "waiting" && !bridgeIdentityReady(bridge as Bridge)).map((bridge) => bridge.id));
    bridgeIdentityWaiting = state.executions.some((execution) =>
      (!presenceId || execution.presenceId === presenceId) &&
      Boolean(execution.bridgeId && identityWaitingBridgeIds.has(execution.bridgeId)) &&
      pendingStatuses.has(execution.status),
    );
    bridgeDeliveryWaiting = state.executions.some((execution) =>
      (!presenceId || execution.presenceId === presenceId) &&
      Boolean(execution.bridgeId && (waitingBridgeIds.has(execution.bridgeId) || identityWaitingBridgeIds.has(execution.bridgeId))) &&
      pendingStatuses.has(execution.status),
    );
    if (presence) {
      const bridgeReady = bridges.some((bridge) => bridgeExecutionStatus(bridge as Bridge) === "connected");
      const nativeReady = Boolean(nativeConn && nativeConn.status === "connected" && nativeConn.access === "read-write" && nativeConn.account?.username?.replace(/^@/, "").toLowerCase() === presence.handle.replace(/^@/, "").toLowerCase());
      enabledCapabilityUnavailable = Object.entries(presence.execution).some(([capability, mode]) => {
        // `review` is an operator-gated mode, not an autonomous capability.
        // It must not degrade the Presence merely because the channel has no
        // background route for an action the Agent is not authorized to send.
        if (mode === "off" || mode === "review") return false;
        const nativeSupports = presence.channel === "x" && ["post", "reply", "like", "repost", "quote", "follow"].includes(capability);
        const bridgeSupports = configuredBridges.some((bridge) => bridge.capabilities.affordances.some((item) => item === capability || item === `${presence.channel}.${capability}`));
        return !(nativeSupports && nativeReady) && !(bridgeSupports && bridgeReady);
      });
    }
  } catch {
    // Database or state read failure is handled by normal health reporting
  }
  const bridgeContinuityIncident = incidents.filter((incident) => /credits_exhausted|quota/i.test(incident.rootCauseKey));
  const actionableIncidents = incidents.filter((incident) => !(bridgeContinuityAvailable && bridgeContinuityIncident.some((alternate) => alternate.id === incident.id)));
  const needsYou = creditsExhaustedState || assignmentNeedsOperator || bridgeDeliveryWaiting || actionableIncidents.some((incident) => incident.state === "needs_operator" || incident.operatorActionRequired);
  const recovering = incidents.some((incident) => incident.state === "recovering" || incident.state === "open") || activeRuns.some((run) => run.state === "recovering" || run.state === "reconciling");
  const waiting = activeRuns.some((run) => run.state === "waiting") || incidents.some((incident) => incident.state === "waiting") || dependencyHealth.some((health) => health.state === "waiting");
  const status: OperationalHealthSnapshot["status"] = needsYou ? "needs_you" : recovering ? "recovering" : waiting ? "waiting" : enabledCapabilityUnavailable ? "degraded" : "healthy";
  const operatorAction: OperationalHealthSnapshot["operatorAction"] = status !== "needs_you"
    ? undefined
    : assignmentNeedsOperator && !creditsExhaustedState
      ? { kind: "schedule", label: "Open Schedule" }
      : { kind: "settings", label: "Review Settings" };
  const summary = creditsExhaustedState
    ? "X API credits are exhausted. The verified Chrome Bridge remains available for continuity; add credits to restore Native X reads."
    : assignmentNeedsOperator
      ? assignmentNeedsOperatorSummary ?? "An Assignment needs operator review before it can continue. Open Schedule for the specific reason and available actions."
      : bridgeDeliveryWaiting
        ? bridgeIdentityWaiting
          ? "Chrome is connected, but the signed-in account has not been verified yet. Delivery is paused safely until identity verification completes."
          : "A delivery is waiting for the authorized browser connector to check in."
    : status === "healthy"
      ? "Genny is live and all required runtime capabilities are healthy."
      : status === "degraded"
        ? "Genny is live, but at least one enabled capability has no currently verified execution route."
      : status === "recovering"
        ? "OpenPresence is repairing the required body automatically. No action needed."
        : status === "waiting"
          ? "Genny is waiting for a known time or provider reset. It will resume automatically."
          : "Human action is required before this responsibility can continue.";

  const activeIncidentIds = new Set(incidents.map((i) => i.id));
  const recoveringIncidents = incidents.filter((i) => i.state === "recovering" || i.state === "open").length;
  const waitingIncidents = incidents.filter((i) => i.state === "waiting").length;
  const needsOperatorIncidents = incidents.filter((i) => i.state === "needs_operator" || i.operatorActionRequired).length;
  const orphanRecoveringRuns = activeRuns.filter((r) => (r.state === "recovering" || r.state === "reconciling") && (!r.incidentId || !activeIncidentIds.has(r.incidentId))).length;

  const counts: OperationalHealthSnapshot["counts"] = {
    activeIncidents: incidents.length,
    recoveringIncidents,
    waitingIncidents,
    needsOperatorIncidents,
    orphanRecoveringRuns,
  };

  return {
    now: now.toISOString(),
    status,
    summary,
    operatorAction,
    presenceId,
    counts,
    dependencyHealth,
    incidents: incidents.map((incident) => ({
      id: incident.id,
      rootCauseKey: incident.rootCauseKey,
      state: incident.state,
      safeSummary: incident.safeSummary,
      affectedRunIds: incident.affectedRunIds,
      recoveryAttempts: incident.recoveryAttempts,
      nextAttemptAt: incident.nextAttemptAt,
      currentRecoveryStep: incident.currentRecoveryStep,
      operatorActionRequired: incident.operatorActionRequired,
      requiresAuth: incident.requiresAuth,
      lastObservedAt: incident.lastObservedAt,
    })),
    activeRuns: activeRuns.map((run) => ({
      id: run.id,
      kind: run.kind,
      state: run.state,
      stage: run.stage,
      lastProgressAt: run.lastProgressAt,
      nextWakeAt: run.nextWakeAt,
      expiresAt: run.expiresAt,
      blockedReason: run.blockedReason,
      incidentId: run.incidentId,
    })),
    dueWakeCount: getDueScheduledWakes(now.toISOString()).length,

    heartbeats: getProcessHeartbeats(),
  };
}

/**
 * Compile bounded operational context for Genny's planning cognition.
 * 
 * Philosophy: Give Genny operational awareness of time and capability reality
 * without leaking raw DevOps logs or asking Genny to act as an SRE.
 */
export function compileOperationalContext(
  presenceId?: string,
  now = new Date(),
): CompiledOperationalContext {
  const healthList = listDependencyHealth(presenceId);
  const incidents = listRecoveryIncidents(presenceId, "recovering");
  const openIncidents = listRecoveryIncidents(presenceId);
  const needsOperator = openIncidents.some((i) => i.state === "needs_operator");
  const waitingRuns = listOperationalRuns(presenceId, ["waiting"]);
  const recoveringRuns = listOperationalRuns(presenceId, ["recovering"]);

  const nativeHealth = healthList.find((h) => h.dependency === "native_x");


  let overallStatus: CompiledOperationalContext["overallStatus"] = "healthy";
  if (needsOperator) {
    overallStatus = "needs_you";
  } else if (incidents.length > 0 || recoveringRuns.length > 0) {
    overallStatus = "recovering";
  } else if (waitingRuns.length > 0) {
    overallStatus = "waiting";
  }

  const nativeStatus = nativeHealth?.state === "waiting"
    ? `Waiting on quota (resumes ${nativeHealth.circuitUntil ?? "soon"})`
    : nativeHealth?.state ?? "Healthy";

  const summary = overallStatus === "healthy"
    ? "All operational channels and bodies are healthy."
    : overallStatus === "recovering"
      ? `Automated self-recovery is active (${incidents.length} incidents being repaired). No operator action needed.`
      : overallStatus === "waiting"
        ? `Operational pacing/quota wait active (${waitingRuns.length} actions waiting for scheduled window).`
        : "Action required: Human sign-in or decision needed to restore full capability.";

  return {
    now: now.toISOString(),
    overallStatus,
    nativeStatus,
    activeIncidentsCount: incidents.length,
    waitingRunsCount: waitingRuns.length,
    recoveringRunsCount: recoveringRuns.length,
    summary,
  };
}
