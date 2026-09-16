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
import { isXCreditsError } from "./x-credits";

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

  // SQLite corruption is not a transient runtime outage. Retrying workers
  // against a malformed canonical database only deepens the ambiguity and can
  // leave external delivery records stranded between states.
  if (/database disk image is malformed|malformed database schema|file is not a database|database corruption/i.test(lower)) {
    return {
      rootCauseKey: "database.corruption",
      safeSummary: "The canonical OpenPresence database is corrupt. Stop live delivery and recover the database before resuming this burst.",
      retryable: false,
      requiresOperator: true,
      requiresAuth: false,
    };
  }

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

  // A missing provider credential is deterministic configuration state, not a
  // transient outage. Retrying it on every attention wake burns budget and
  // makes the Presence appear stalled instead of giving the operator one
  // actionable boundary.
  if (dependency === "model_provider" && /no api key|api key is stored|not connected|needs-configuration|no model is selected|provider access/i.test(lower)) {
    return {
      rootCauseKey: "model_provider.credentials_missing",
      safeSummary: "The selected AI provider is not configured. Open Brain → Provider access and save a valid key or choose a connected local model.",
      retryable: false,
      requiresOperator: true,
      requiresAuth: true,
    };
  }

  // Credits / Billing exhaustion
  if (isXCreditsError(msg)) {
    const xBilling = dependency === "native_x" || dependency === "runtime" && /\bX\b|twitter/i.test(msg);
    return {
      rootCauseKey: `${dependency}.credits_exhausted`,
      safeSummary: `${xBilling ? "X API" : dependency === "model_provider" ? "AI model provider" : "Provider"} billing is blocking access. Review available credits and spending limits to restore it.`,
      retryable: false,
      requiresOperator: true,
      requiresAuth: false,
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
  if (/duplicate public outcome|multiple verified public (?:replies|actions)|duplicate delivery detected/i.test(lower)) {
    return {
      rootCauseKey: "runtime.duplicate_public_outcome",
      safeSummary: "Multiple public actions were observed from this Presence for the same target. Delivery to that target is quarantined; review the public thread and channel standing before resuming.",
      retryable: false,
      requiresOperator: true,
      requiresAuth: false,
    };
  }

  if (/duplicate content|duplicate.*tweet|already said that/i.test(lower)) {
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

  if (dependency === "runtime" && /OPENPRESENCE_SECRET_KEY|secure credential storage|storing channel credentials/i.test(msg)) {
    return {
      rootCauseKey: "runtime.transient_error",
      safeSummary: "Secure local credential storage was unavailable to the previous server process. Restart OpenPresence through its normal launcher; no Bridge is required.",
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
  const effectiveDependency: DependencyHealthKind = classification.rootCauseKey === "database.corruption" ? "database" : input.dependency;
  const budget = RECOVERY_BUDGETS[effectiveDependency] ?? RECOVERY_BUDGETS.runtime;

  // 1. Get or initialize dependency health
  let health = getDependencyHealth(effectiveDependency, input.presenceId);
  if (!health) {
    health = {
      id: `dh_${effectiveDependency}_${input.presenceId ?? "global"}`,
      presenceId: input.presenceId,
      dependency: effectiveDependency,
      state: "healthy",
      consecutiveFailures: 0,
      updatedAt: nowIso,
    };
  }

  const bridgeWindowStartedAt = typeof health.metadata?.failureWindowStartedAt === "string" ? health.metadata.failureWindowStartedAt : undefined;
  if (input.dependency === "user_attached_bridge" && (!bridgeWindowStartedAt || Date.now() - new Date(bridgeWindowStartedAt).getTime() > 15 * 60_000)) {
    health.consecutiveFailures = 0;
    health.metadata = { ...(health.metadata ?? {}), failureWindowStartedAt: nowIso };
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
    incident.safeSummary = classification.safeSummary;
    if (input.runId && !incident.affectedRunIds.includes(input.runId)) {
      incident.affectedRunIds.push(input.runId);
    }
    // An existing incident may have been opened as recoverable and later
    // receive a provider response that requires operator action (for example
    // exhausted credits). Preserve the strongest current boundary instead of
    // leaving the incident in `recovering` with a stale retry timestamp.
    if (classification.requiresOperator) {
      incident.state = "needs_operator";
      incident.operatorActionRequired = true;
      incident.requiresAuth = classification.requiresAuth;
      delete incident.nextAttemptAt;
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
  } else if (input.dependency === "user_attached_bridge" && health.consecutiveFailures >= 3) {
    circuitOpen = true;
    const retryAt = new Date(Date.now() + 15 * 60_000).toISOString();
    health.state = "circuit_open";
    health.circuitUntil = retryAt;
    incident.state = "waiting";
    incident.nextAttemptAt = retryAt;
    incident.safeSummary = "The browser delivery route failed to claim or complete three equivalent actions within 15 minutes. New work for that route is paused until fresh liveness and verified identity are observed.";
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
      run.state = classification.requiresOperator ? "needs_operator" : circuitOpen || quotaWaiting ? "waiting" : "recovering";
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

  // Some incidents describe a world/safety invariant rather than dependency
  // liveness. A later successful runtime call cannot prove that the operator
  // reviewed duplicate public outcomes, so those incidents only close through
  // the explicit resolveOperationalIncident boundary.
  const matchingIncidents = listRecoveryIncidents(presenceId).filter(
    (item) => item.state !== "resolved" && (
      item.dependencyId === health?.id ||
      item.dependencyId?.includes(dependency) ||
      item.rootCauseKey.startsWith(`${dependency}.`) ||
      (dependency === "managed_browser" && item.rootCauseKey.startsWith("browser.")) ||
      (dependency === "user_attached_bridge" && item.rootCauseKey.startsWith("bridge."))
    )
  );
  const explicitResolutionIncidents = matchingIncidents.filter((item) => item.rootCauseKey === "runtime.duplicate_public_outcome");
  const openIncidents = matchingIncidents.filter((item) => !explicitResolutionIncidents.includes(item));

  if (!health) {
    health = {
      id: `dh_${dependency}_${presenceId ?? "global"}`,
      presenceId,
      dependency,
      state: explicitResolutionIncidents.length ? "requires_operator" : "healthy",
      consecutiveFailures: 0,
      lastHealthyAt: explicitResolutionIncidents.length ? undefined : nowIso,
      currentIncidentId: explicitResolutionIncidents[0]?.id,
      updatedAt: nowIso,
    };
  } else {
    if (explicitResolutionIncidents.length) {
      health.state = "requires_operator";
      health.currentIncidentId = explicitResolutionIncidents[0]!.id;
    } else {
      health.state = "healthy";
      health.consecutiveFailures = 0;
      health.lastHealthyAt = nowIso;
      delete health.circuitUntil;
      delete health.currentIncidentId;
    }
    health.updatedAt = nowIso;
  }

  upsertDependencyHealth(health);

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

/**
 * Resolve one operator-visible incident after an explicit, successful
 * recheck. This is intentionally narrower than recordOperationalSuccess:
 * provider checks can prove the requested incident is healthy without
 * hiding an unrelated incident for the same Presence.
 */
export function resolveOperationalIncident(incidentId: string): RecoveryIncident | undefined {
  const incident = getRecoveryIncident(incidentId);
  if (!incident || incident.state === "resolved") return incident;

  const nowIso = new Date().toISOString();
  incident.state = "resolved";
  incident.resolvedAt = nowIso;
  incident.updatedAt = nowIso;
  incident.operatorActionRequired = false;
  delete incident.nextAttemptAt;
  upsertRecoveryIncident(incident);

  const dependencyKind = (incident.dependencyId?.replace(/^dh_/, "").split("_")[0] ?? "runtime") as DependencyHealthKind;
  const health = getDependencyHealth(dependencyKind, incident.presenceId);
  if (health?.currentIncidentId === incident.id) {
    health.state = "healthy";
    health.consecutiveFailures = 0;
    health.lastHealthyAt = nowIso;
    delete health.currentIncidentId;
    delete health.circuitUntil;
    health.updatedAt = nowIso;
    upsertDependencyHealth(health);
  }
  return incident;
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
