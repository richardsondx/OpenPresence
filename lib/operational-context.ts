import { getBrowserBody, getDueScheduledWakes, getProcessHeartbeats, listDependencyHealth, listOperationalRuns, listRecoveryIncidents } from "./db";
import type { OperationalHealthSnapshot } from "./types";

export interface CompiledOperationalContext {
  now: string;
  overallStatus: "healthy" | "recovering" | "waiting" | "needs_you";
  nativeStatus: string;
  browserStatus: string;
  activeIncidentsCount: number;
  waitingRunsCount: number;
  recoveringRunsCount: number;
  summary: string;
}

export function readOperationalHealth(presenceId?: string, now = new Date()): OperationalHealthSnapshot {
  const dependencyHealth = listDependencyHealth(presenceId);
  const incidents = listRecoveryIncidents(presenceId).filter((incident) => incident.state !== "resolved");
  const activeRuns = listOperationalRuns(presenceId, ["queued", "running", "waiting", "recovering", "delivery_uncertain", "reconciling", "blocked", "needs_operator"]);
  const needsYou = incidents.some((incident) => incident.state === "needs_operator" || incident.operatorActionRequired);
  const recovering = incidents.some((incident) => incident.state === "recovering" || incident.state === "open") || activeRuns.some((run) => run.state === "recovering" || run.state === "reconciling");
  const waiting = activeRuns.some((run) => run.state === "waiting") || incidents.some((incident) => incident.state === "waiting") || dependencyHealth.some((health) => health.state === "waiting");
  const status: OperationalHealthSnapshot["status"] = needsYou ? "needs_you" : recovering ? "recovering" : waiting ? "waiting" : "healthy";
  const summary = status === "healthy"
    ? "Genny is live and all required runtime capabilities are healthy."
    : status === "recovering"
      ? "OpenPresence is repairing the required body automatically. No action needed."
      : status === "waiting"
        ? "Genny is waiting for a known time or provider reset. It will resume automatically."
        : "Human action is required before this responsibility can continue.";

  return {
    now: now.toISOString(),
    status,
    summary,
    presenceId,
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
    browserBody: presenceId ? getBrowserBody(presenceId) : undefined,
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
  const browserHealth = healthList.find((h) => h.dependency === "managed_browser");

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

  const browserStatus = browserHealth?.state === "circuit_open"
    ? `Cooldown active (retries ${browserHealth.circuitUntil ?? "soon"})`
    : browserHealth?.state === "recovering"
      ? "Self-recovery in progress"
      : browserHealth?.state ?? "Healthy";

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
    browserStatus,
    activeIncidentsCount: incidents.length,
    waitingRunsCount: waitingRuns.length,
    recoveringRunsCount: recoveringRuns.length,
    summary,
  };
}
