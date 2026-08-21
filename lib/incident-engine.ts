import {
  getDependencyHealth,
  getOpenRecoveryIncident,
  getRecoveryIncident,
  listRecoveryAttempts,
  listRecoveryIncidents,
  recordRecoveryAttempt,
  upsertDependencyHealth,
  upsertOperationalRun,
  upsertRecoveryIncident,
  getOperationalRun,
} from "./db";
import type {
  DependencyHealth,
  DependencyHealthKind,
  RecoveryAttempt,
  RecoveryIncident,
} from "./types";
import { scheduleProviderResetWake } from "./temporal";

// ============================================================================
// Recovery Budgets & Configuration
// ============================================================================

export const RECOVERY_BUDGETS: Record<
  DependencyHealthKind,
  {
    maxAttempts: number;
    cooldownSeconds: number;
  }
> = {
  runtime: { maxAttempts: 3, cooldownSeconds: 60 },
  native_x: { maxAttempts: 3, cooldownSeconds: 300 },
  managed_browser: { maxAttempts: 3, cooldownSeconds: 300 },
  user_attached_bridge: { maxAttempts: 3, cooldownSeconds: 300 },
  model_provider: { maxAttempts: 3, cooldownSeconds: 120 },
  database: { maxAttempts: 2, cooldownSeconds: 60 },
};

// ============================================================================
// Root Cause Classification
// ============================================================================

export interface RootCauseClassification {
  rootCauseKey: string;
  safeSummary: string;
  retryable: boolean;
  requiresOperator: boolean;
  requiresAuth: boolean;
}

export function classifyFailureRootCause(
  error: string | Error,
  dependency: DependencyHealthKind,
): RootCauseClassification {
  const msg = typeof error === "string" ? error : error.message || "";
  const lower = msg.toLowerCase();

  // Authentication & Session expiry
  if (/auth|unauthorized|session expired|login required|credentials revoked|token expired/i.test(lower)) {
    return {
      rootCauseKey: dependency === "managed_browser" ? "browser.auth_expired" : `${dependency}.auth_expired`,
      safeSummary: "Authentication session expired or invalid. Interactive sign-in required.",
      retryable: false,
      requiresOperator: true,
      requiresAuth: true,
    };
  }

  // Rate limits / 429
  if (/rate limit|429|too many requests|quota/i.test(lower)) {
    return {
      rootCauseKey: `${dependency}.rate_limit`,
      safeSummary: `${dependency === "native_x" ? "X API" : dependency === "model_provider" ? "AI Model Provider" : "Provider"} request rate limit reached. Waiting for quota reset.`,
      retryable: true,
      requiresOperator: false,
      requiresAuth: false,
    };
  }

  // Browser composer & DOM failures
  if (/composer|input failed|dom|selector|could not find element|not attached/i.test(lower)) {
    return {
      rootCauseKey: "browser.composer_unavailable",
      safeSummary: "Browser composer interaction failed or element detached.",
      retryable: true,
      requiresOperator: false,
      requiresAuth: false,
    };
  }

  // Connection & Bridge disconnect
  if (/connection refused|disconnected|econnrefused|relay closed|target closed|browser disconnected/i.test(lower)) {
    return {
      rootCauseKey: dependency === "user_attached_bridge" ? "bridge.disconnected" : `${dependency}.connection_lost`,
      safeSummary: "Connection dropped or browser controller disconnected.",
      retryable: true,
      requiresOperator: false,
      requiresAuth: false,
    };
  }

  // Duplicate content
  if (/duplicate content|duplicate.*tweet/i.test(lower)) {
    return {
      rootCauseKey: `${dependency}.duplicate_content`,
      safeSummary: "Action rejected as duplicate public content.",
      retryable: false,
      requiresOperator: false,
      requiresAuth: false,
    };
  }

  if (dependency === "runtime" && /unresponsive|heartbeat|timeout/i.test(lower)) {
    return {
      rootCauseKey: "runtime.unresponsive",
      safeSummary: "The OpenPresence runtime stopped making progress and is being restarted.",
      retryable: true,
      requiresOperator: false,
      requiresAuth: false,
    };
  }

  // Generic fallback
  return {
    rootCauseKey: `${dependency}.transient_error`,
    safeSummary: `Transient error encountered: ${msg.slice(0, 100)}`,
    retryable: true,
    requiresOperator: false,
    requiresAuth: false,
  };
}

// ============================================================================
// Incident Management & Recovery Ladder
// ============================================================================

export function recordOperationalFailure(input: {
  dependency: DependencyHealthKind;
  presenceId?: string;
  runId?: string;
  invocationId?: string;
  error: string | Error;
  resetAt?: string;
}): {
  incident: RecoveryIncident;
  isNewIncident: boolean;
  circuitOpen: boolean;
} {
  const nowIso = new Date().toISOString();
  const classification = classifyFailureRootCause(input.error, input.dependency);
  const budget = RECOVERY_BUDGETS[input.dependency] ?? RECOVERY_BUDGETS.runtime;

  // 1. Get or initialize dependency health
  let health = getDependencyHealth(input.dependency, input.presenceId);
  if (!health) {
    health = {
      id: `dh_${input.dependency}_${input.presenceId ?? "global"}`,
      presenceId: input.presenceId,
      dependency: input.dependency,
      state: "healthy",
      consecutiveFailures: 0,
      updatedAt: nowIso,
    };
  }

  health.consecutiveFailures += 1;
  health.lastFailureAt = nowIso;

  // 2. Correlate with existing open incident or create new
  let incident = getOpenRecoveryIncident(classification.rootCauseKey, input.presenceId);
  let isNewIncident = false;

  if (!incident) {
    isNewIncident = true;
    incident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      rootCauseKey: classification.rootCauseKey,
      dependencyId: health.id,
      presenceId: input.presenceId,
      state: classification.requiresOperator ? "needs_operator" : "recovering",
      openedAt: nowIso,
      lastObservedAt: nowIso,
      affectedRunIds: input.runId ? [input.runId] : [],
      recoveryAttempts: 0,
      safeSummary: classification.safeSummary,
      operatorActionRequired: classification.requiresOperator,
      requiresAuth: classification.requiresAuth,
      runId: input.runId,
      invocationId: input.invocationId,
      updatedAt: nowIso,
    };
  } else {
    incident.lastObservedAt = nowIso;
    if (input.runId && !incident.affectedRunIds.includes(input.runId)) {
      incident.affectedRunIds.push(input.runId);
    }
  }

  // 3. Check recovery budget & circuit breakers
  let circuitOpen = false;
  let quotaWaiting = false;
  if (classification.requiresOperator) {
    health.state = "requires_operator";
    incident.state = "needs_operator";
  } else if (classification.rootCauseKey.endsWith(".rate_limit") || classification.rootCauseKey === "provider.rate_limit") {
    quotaWaiting = true;
    const resetAt = input.resetAt ?? new Date(Date.now() + 15 * 60_000).toISOString();
    health.state = "waiting";
    health.circuitUntil = resetAt;
    incident.state = "waiting";
    incident.nextAttemptAt = resetAt;
    if (input.runId) scheduleProviderResetWake(input.runId, resetAt, input.presenceId, { incidentId: incident.id });
  } else if (incident.recoveryAttempts >= budget.maxAttempts) {
    // Exhaustion is a human boundary, not an invitation to retry forever.
    circuitOpen = true;
    health.state = "requires_operator";
    incident.state = "needs_operator";
    incident.operatorActionRequired = true;
    incident.nextAttemptAt = undefined;
  } else {
    health.state = "recovering";
    incident.state = "recovering";
  }

  health.currentIncidentId = incident.id;
  upsertDependencyHealth(health);
  upsertRecoveryIncident(incident);

  // Link affected operational run if provided
  if (input.runId) {
    const run = getOperationalRun(input.runId);
    if (run) {
      run.incidentId = incident.id;
      run.state = classification.requiresOperator || circuitOpen ? "needs_operator" : quotaWaiting ? "waiting" : "recovering";
      run.stage = `incident_${classification.rootCauseKey}`;
      run.lastProgressAt = nowIso;
      upsertOperationalRun(run);
    }
  }

  return { incident, isNewIncident, circuitOpen };
}

export function recordOperationalSuccess(
  dependency: DependencyHealthKind,
  presenceId?: string,
): {
  health: DependencyHealth;
  resolvedIncidents: RecoveryIncident[];
} {
  const nowIso = new Date().toISOString();
  let health = getDependencyHealth(dependency, presenceId);

  if (!health) {
    health = {
      id: `dh_${dependency}_${presenceId ?? "global"}`,
      presenceId,
      dependency,
      state: "healthy",
      consecutiveFailures: 0,
      lastHealthyAt: nowIso,
      updatedAt: nowIso,
    };
  } else {
    health.state = "healthy";
    health.consecutiveFailures = 0;
    health.lastHealthyAt = nowIso;
    delete health.circuitUntil;
    delete health.currentIncidentId;
    health.updatedAt = nowIso;
  }

  upsertDependencyHealth(health);

  // Resolve all open/recovering incidents for this dependency & presence
  const openIncidents = listRecoveryIncidents(presenceId).filter(
    (item) => item.state !== "resolved" && (
      item.dependencyId === health?.id ||
      item.dependencyId?.includes(dependency) ||
      item.rootCauseKey.startsWith(`${dependency}.`) ||
      (dependency === "managed_browser" && item.rootCauseKey.startsWith("browser.")) ||
      (dependency === "user_attached_bridge" && item.rootCauseKey.startsWith("bridge."))
    )
  );

  const resolvedIncidents: RecoveryIncident[] = [];
  for (const candidate of openIncidents) {
    candidate.state = "resolved";
    candidate.resolvedAt = nowIso;
    candidate.updatedAt = nowIso;
    candidate.operatorActionRequired = false;
    delete candidate.nextAttemptAt;
    upsertRecoveryIncident(candidate);
    resolvedIncidents.push(candidate);
  }

  return { health, resolvedIncidents };
}

export function logRecoveryAttempt(input: {
  incidentId: string;
  step: string;
  outcome: "succeeded" | "failed" | "deferred";
  error?: string;
  runId?: string;
  invocationId?: string;
}): RecoveryAttempt {
  const attempts = listRecoveryAttempts(input.incidentId);
  const attemptNumber = attempts.length + 1;
  const attempt: RecoveryAttempt = {
    id: `att_${input.incidentId}_${attemptNumber}`,
    incidentId: input.incidentId,
    attemptNumber,
    step: input.step,
    outcome: input.outcome,
    error: input.error,
    runId: input.runId,
    invocationId: input.invocationId,
    timestamp: new Date().toISOString(),
  };
  recordRecoveryAttempt(attempt);

  // Atomically update the incident recovery attempt count and advance state/health
  const incident = getRecoveryIncident(input.incidentId);
  if (incident) {
    incident.recoveryAttempts = attemptNumber;
    incident.lastObservedAt = attempt.timestamp;
    incident.currentRecoveryStep = input.step;
    incident.updatedAt = attempt.timestamp;
    if (input.runId && !incident.affectedRunIds.includes(input.runId)) {
      incident.affectedRunIds.push(input.runId);
    }

    const dependencyKind = (incident.dependencyId?.replace(/^dh_/, "").split("_")[0] ?? "runtime") as DependencyHealthKind;
    const health = getDependencyHealth(dependencyKind, incident.presenceId);
    const budget = RECOVERY_BUDGETS[dependencyKind] ?? RECOVERY_BUDGETS.runtime;

    if (input.outcome === "succeeded") {
      incident.state = "resolved";
      incident.resolvedAt = attempt.timestamp;
      incident.operatorActionRequired = false;
      delete incident.nextAttemptAt;
      if (health) {
        health.state = "healthy";
        health.consecutiveFailures = 0;
        health.lastHealthyAt = attempt.timestamp;
        delete health.currentIncidentId;
        health.updatedAt = attempt.timestamp;
        upsertDependencyHealth(health);
      }
    } else if (incident.recoveryAttempts >= budget.maxAttempts) {
      incident.state = "needs_operator";
      incident.operatorActionRequired = true;
      delete incident.nextAttemptAt;
      if (health) {
        health.state = "requires_operator";
        health.updatedAt = attempt.timestamp;
        upsertDependencyHealth(health);
      }
    } else if (input.outcome === "failed") {
      incident.state = "recovering";
      const cooldownSec = budget.cooldownSeconds * Math.pow(1.5, attemptNumber - 1);
      incident.nextAttemptAt = new Date(Date.now() + cooldownSec * 1000).toISOString();
      if (health) {
        health.state = "recovering";
        health.updatedAt = attempt.timestamp;
        upsertDependencyHealth(health);
      }
    }
    upsertRecoveryIncident(incident);
  }

  return attempt;
}
