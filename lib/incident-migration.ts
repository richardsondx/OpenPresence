import { getOpenRecoveryIncident, upsertRecoveryIncident } from "./db";
import { classifyFailureRootCause } from "./incident-engine";
import type { Execution, RecoveryIncident } from "./types";

export interface MigrationResult {
  totalLegacyFailures: number;
  projectedIncidentsCount: number;
  incidents: RecoveryIncident[];
}

/**
 * Perform one-way projection of legacy execution failures into root-cause RecoveryIncidents.
 * 
 * Philosophy: Supersession is not deletion. Historical execution rows remain immutable.
 */
export function projectLegacyFailuresToIncidents(
  executions: Execution[],
  now = new Date(),
): MigrationResult {
  const failedExecutions = executions.filter(
    (e) => e.status === "failed" || (e.failure && !e.failure.reviewDisposition),
  );

  const incidentMap = new Map<string, RecoveryIncident>();
  const nowIso = now.toISOString();

  for (const exec of failedExecutions) {
    const errorMsg = exec.failure?.message || "Execution failed";
    const dependency = exec.connector === "bridge" ? "managed_browser" : "native_x";
    const classification = classifyFailureRootCause(errorMsg, dependency);

    const key = `${classification.rootCauseKey}:${exec.presenceId}`;
    let incident = incidentMap.get(key) ?? getOpenRecoveryIncident(classification.rootCauseKey, exec.presenceId);

    if (!incident) {
      incident = {
        id: `inc_migrated_${classification.rootCauseKey.replace(/[^a-z0-9]+/gi, "_")}_${exec.presenceId}`,
        rootCauseKey: classification.rootCauseKey,
        dependencyId: `dh_${dependency}_${exec.presenceId}`,
        presenceId: exec.presenceId,
        state: "open",
        openedAt: exec.createdAt || nowIso,
        lastObservedAt: exec.updatedAt || nowIso,
        affectedRunIds: [exec.id],
        recoveryAttempts: exec.attempts || 1,
        safeSummary: classification.safeSummary,
        operatorActionRequired: classification.requiresOperator,
        requiresAuth: classification.requiresAuth,
        updatedAt: nowIso,
      };
      incidentMap.set(key, incident);
    } else {
      if (!incident.affectedRunIds.includes(exec.id)) {
        incident.affectedRunIds.push(exec.id);
      }
      if (exec.createdAt && exec.createdAt < incident.openedAt) {
        incident.openedAt = exec.createdAt;
      }
      if (exec.updatedAt && exec.updatedAt > incident.lastObservedAt) {
        incident.lastObservedAt = exec.updatedAt;
      }
    }
    incidentMap.set(key, incident);
  }

  const projectedIncidents = Array.from(incidentMap.values());
  for (const incident of projectedIncidents) {
    upsertRecoveryIncident(incident);
  }

  return {
    totalLegacyFailures: failedExecutions.length,
    projectedIncidentsCount: projectedIncidents.length,
    incidents: projectedIncidents,
  };
}
