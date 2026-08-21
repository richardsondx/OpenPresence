import { NextResponse } from "next/server";
import {
  listOperationalRuns,
  listRecoveryIncidents,
  listRecoveryAttempts,
  listScheduledWakes,
  readState,
} from "@/lib/db";
import type { OperationalRun, RecoveryIncident, RecoveryAttempt, SocialDecision, Execution, Outcome, MirrorObject, ResourceUsageEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export type AuditFacet = "run" | "decision" | "execution" | "recovery" | "mirror" | "wake";

export interface CorrelatedAuditRecordDTO {
  id: string;
  runId?: string;
  invocationId?: string;
  timestamp: string;
  stage: string;
  title: string;
  status: string;
  facets: AuditFacet[];
  traceCompleteness: "full" | "partial" | "orphan";

  focalCandidate?: {
    id: string;
    authorHandle?: string;
    authorName?: string;
    textSnippet?: string;
    channelId: string;
  };
  candidateSummary?: {
    evaluatedCount: number;
    promisingCount: number;
    sampleCandidates?: Array<{ id: string; author?: string; textSnippet?: string }>;
  };
  modelTelemetry?: {
    provider: string;
    model?: string;
    totalTokens?: number;
    requests?: number;
    category?: string;
  };
  decisions?: Array<{
    id: string;
    decision: string;
    summary: string;
    acts?: Array<{ decision: string; text?: string; rationale?: string }>;
    confidence?: string;
    focalMirrorObjectIds?: string[];
  }>;
  executions?: Array<{
    id: string;
    affordance: string;
    route: string;
    status: string;
    mode: string;
    reviewReason?: string;
    socialIntentId?: string;
    publicationTextSnippet?: string;
  }>;
  outcome?: {
    id: string;
    status: string;
    metrics?: Record<string, number>;
  };
  incident?: {
    id: string;
    rootCauseKey: string;
    state: string;
    safeSummary: string;
    recoveryAttempts: number;
    nextAttemptAt?: string;
    requiresAuth?: boolean;
    operatorActionRequired?: boolean;
  };
  recoveryAttempts?: Array<{
    id: string;
    attemptNumber: number;
    step: string;
    outcome: string;
    safeError?: string;
    timestamp: string;
  }>;

  error?: {
    code?: string;
    safeSummary: string;
  };
  displayMetadata?: Record<string, string | number | boolean | null | string[]>;
}

function sanitizeSafeError(error?: string | { code?: string; message?: string } | Error): { code?: string; safeSummary: string } | undefined {
  if (!error) return undefined;
  if (typeof error === "string") {
    const safeSummary = error.replace(/(bearer\s+[a-zA-Z0-9_\-\.]+)|(api[_\-]?key\s*[:=]\s*[^\s]+)/gi, "[REDACTED]").slice(0, 200);
    return { safeSummary };
  }
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const rawMsg = "message" in error && typeof error.message === "string" ? error.message : String(error);
  const safeSummary = rawMsg.replace(/(bearer\s+[a-zA-Z0-9_\-\.]+)|(api[_\-]?key\s*[:=]\s*[^\s]+)/gi, "[REDACTED]").slice(0, 200);
  return { code, safeSummary };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const presenceId = searchParams.get("presenceId") ?? undefined;
  const facetFilter = searchParams.get("facet") as AuditFacet | "all" | null;
  const since = searchParams.get("since") ?? undefined;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  const sinceTime = since ? new Date(since).getTime() : 0;

  const state = readState();
  const runs = listOperationalRuns(presenceId);
  const allIncidents = listRecoveryIncidents(presenceId);
  const mirrorObjects = state.mirrorObjects.filter((m) => !presenceId || m.presenceId === presenceId);
  const mirrorById = new Map<string, MirrorObject>(mirrorObjects.map((m) => [m.id, m]));
  const decisions = state.socialDecisions.filter((d) => !presenceId || d.presenceId === presenceId);
  const executions = state.executions.filter((e) => !presenceId || e.presenceId === presenceId);
  const outcomes = state.outcomes.filter((o) => !presenceId || o.presenceId === presenceId);
  const usageEvents = state.resourceUsageEvents.filter((u) => !presenceId || u.presenceId === presenceId);

  // Correlation used to scan every decision/execution/usage collection for
  // every run. That made the forensic surface progressively slower as the
  // workspace grew. Build lookup indexes once so a ledger refresh is linear in
  // the records it actually needs to project.
  const decisionsByRun = new Map<string, SocialDecision[]>();
  const decisionsByInvocation = new Map<string, SocialDecision[]>();
  const executionsByRun = new Map<string, Execution[]>();
  const executionsByInvocation = new Map<string, Execution[]>();
  const executionsByIntent = new Map<string, Execution[]>();
  const usageByRun = new Map<string, ResourceUsageEvent>();
  const usageByInvocation = new Map<string, ResourceUsageEvent>();
  const outcomesByExecution = new Map<string, Outcome>();
  const outcomesByIntent = new Map<string, Outcome>();
  const append = <T>(map: Map<string, T[]>, key: string | undefined, value: T) => {
    if (!key) return;
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
  };
  for (const decision of decisions) {
    append(decisionsByRun, decision.plannerRunId, decision);
    append(decisionsByRun, decision.runId, decision);
    append(decisionsByInvocation, decision.invocationId, decision);
  }
  for (const execution of executions) {
    append(executionsByRun, execution.runId, execution);
    append(executionsByInvocation, execution.invocationId, execution);
    append(executionsByIntent, execution.socialIntentId, execution);
  }
  for (const usage of usageEvents) {
    if (usage.runId) usageByRun.set(usage.runId, usage);
    if (usage.invocationId) usageByInvocation.set(usage.invocationId, usage);
  }
  for (const outcome of outcomes) {
    if (outcome.executionId) outcomesByExecution.set(outcome.executionId, outcome);
    if (outcome.socialIntentId) outcomesByIntent.set(outcome.socialIntentId, outcome);
  }

  const coveredRunIds = new Set<string>();
  const coveredDecisionIds = new Set<string>();
  const coveredExecutionIds = new Set<string>();
  const coveredIncidentIds = new Set<string>();

  const records: CorrelatedAuditRecordDTO[] = [];

  // 1. Correlate from Operational Runs
  for (const run of runs) {
    coveredRunIds.add(run.id);

    // Correlate Decisions
    const matchedDecisions = [...new Map([
      ...(decisionsByRun.get(run.id) ?? []),
      ...(run.invocationId ? decisionsByInvocation.get(run.invocationId) ?? [] : []),
    ].map((item) => [item.id, item])).values()];
    for (const d of matchedDecisions) coveredDecisionIds.add(d.id);

    // Correlate Executions
    const matchedExecutions = [...new Map([
      ...(executionsByRun.get(run.id) ?? []),
      ...(run.executionId ? executions.filter((item) => item.id === run.executionId) : []),
      ...(run.invocationId ? executionsByInvocation.get(run.invocationId) ?? [] : []),
      ...matchedDecisions.flatMap((d) => d.socialIntentId ? executionsByIntent.get(d.socialIntentId) ?? [] : []),
    ].map((item) => [item.id, item])).values()];
    for (const e of matchedExecutions) coveredExecutionIds.add(e.id);

    // Correlate Model Telemetry
    const matchedUsage = usageByRun.get(run.id) ?? (run.invocationId ? usageByInvocation.get(run.invocationId) : undefined);

    // Correlate Outcome
    const matchedOutcome = matchedExecutions.map((e) => outcomesByExecution.get(e.id)).find(Boolean)
      ?? matchedDecisions.map((d) => d.socialIntentId ? outcomesByIntent.get(d.socialIntentId) : undefined).find(Boolean);

    // Correlate Incident
    let matchedIncident: RecoveryIncident | undefined;
    if (run.incidentId) {
      matchedIncident = allIncidents.find((i) => i.id === run.incidentId);
    }
    if (!matchedIncident) {
      matchedIncident = allIncidents.find((i) => i.affectedRunIds.includes(run.id) || (run.runId && i.runId === run.runId));
    }
    if (matchedIncident) coveredIncidentIds.add(matchedIncident.id);

    // Correlate Focal Candidate
    let focalCandidate: CorrelatedAuditRecordDTO["focalCandidate"];
    const focalObjectId = matchedDecisions[0]?.focalMirrorObjectIds?.[0] ?? (run.sourceRef?.startsWith("mirror:") ? run.sourceRef.slice("mirror:".length) : undefined);
    if (focalObjectId && mirrorById.has(focalObjectId)) {
      const obj = mirrorById.get(focalObjectId)!;
      focalCandidate = {
        id: obj.id,
        authorHandle: obj.author?.handle ? `@${obj.author.handle}` : obj.author?.displayName,
        authorName: obj.author?.displayName,
        textSnippet: obj.content?.text ? obj.content.text.slice(0, 100) : undefined,
        channelId: obj.channelId ?? "x",
      };
    }

    // Correlate Recovery Attempts
    const recoveryAttempts = matchedIncident ? listRecoveryAttempts(matchedIncident.id) : [];

    // Derive Facets
    const facets: AuditFacet[] = ["run"];
    if (matchedDecisions.length) facets.push("decision");
    if (matchedExecutions.length) facets.push("execution");
    if (matchedIncident || recoveryAttempts.length) facets.push("recovery");
    if (focalCandidate) facets.push("mirror");

    const traceCompleteness: CorrelatedAuditRecordDTO["traceCompleteness"] =
      matchedDecisions.length > 0 || matchedExecutions.length > 0 || matchedIncident !== undefined ? "full" : "partial";

    const timestamp = run.lastProgressAt ?? run.startedAt ?? run.createdAt;
    if (sinceTime && new Date(timestamp).getTime() < sinceTime) continue;

    const error = sanitizeSafeError(run.lastErrorCode ?? run.blockedReason);

    records.push({
      id: `audit:run:${run.id}`,
      runId: run.id,
      invocationId: run.invocationId,
      timestamp,
      stage: run.stage,
      title: `${run.kind.toUpperCase()} Run · ${run.stage}`,
      status: run.state,
      facets,
      traceCompleteness,
      focalCandidate,
      modelTelemetry: matchedUsage ? {
        provider: matchedUsage.provider,
        model: matchedUsage.model,
        totalTokens: matchedUsage.usage.totalTokens ?? (matchedUsage.usage.inputTokens ?? 0) + (matchedUsage.usage.outputTokens ?? 0),
        requests: matchedUsage.usage.requests ?? 1,
        category: matchedUsage.category,
      } : undefined,
      decisions: matchedDecisions.map((d) => ({
        id: d.id,
        decision: d.decision,
        summary: d.summary,
        acts: d.acts,
        confidence: d.confidence,
        focalMirrorObjectIds: d.focalMirrorObjectIds,
      })),
      executions: matchedExecutions.map((e) => {
        const connector = e.connector ?? (e.bridgeId ? "bridge" : "unassigned");
        const route = e.bridgeId ? `chrome_bridge:${e.bridgeId}` : connector === "native" ? "native_x" : "simulated";
        const pubText = e.publication && typeof e.publication.payload === "object" && e.publication.payload && "text" in e.publication.payload && typeof e.publication.payload.text === "string"
          ? e.publication.payload.text.slice(0, 120)
          : undefined;
        return {
          id: e.id,
          affordance: e.affordance,
          route,
          status: e.status,
          mode: e.mode,
          reviewReason: e.reviewReason,
          socialIntentId: e.socialIntentId,
          publicationTextSnippet: pubText,
        };
      }),
      outcome: matchedOutcome ? {
        id: matchedOutcome.id,
        status: matchedOutcome.status,
        metrics: matchedOutcome.metrics,
      } : undefined,
      incident: matchedIncident ? {
        id: matchedIncident.id,
        rootCauseKey: matchedIncident.rootCauseKey,
        state: matchedIncident.state,
        safeSummary: matchedIncident.safeSummary,
        recoveryAttempts: matchedIncident.recoveryAttempts,
        nextAttemptAt: matchedIncident.nextAttemptAt,
        requiresAuth: matchedIncident.requiresAuth,
        operatorActionRequired: matchedIncident.operatorActionRequired,
      } : undefined,
      recoveryAttempts: recoveryAttempts.map((att) => ({
        id: att.id,
        attemptNumber: att.attemptNumber,
        step: att.step,
        outcome: att.outcome,
        safeError: sanitizeSafeError(att.error)?.safeSummary,
        timestamp: att.timestamp,
      })),
      error,
      displayMetadata: {
        kind: run.kind,
        attemptCount: run.attemptCount,
        recoveryCount: run.recoveryCount,
        leaseOwner: run.leaseOwner ?? null,
      },
    });
  }

  // 2. Project Standalone / Active Incidents (Guarantees exact identity parity with Health Incidents)
  for (const inc of allIncidents) {
    if (coveredIncidentIds.has(inc.id)) continue;
    coveredIncidentIds.add(inc.id);

    const attempts = listRecoveryAttempts(inc.id);
    const timestamp = inc.lastObservedAt ?? inc.openedAt;
    if (sinceTime && new Date(timestamp).getTime() < sinceTime) continue;

    const error = sanitizeSafeError(inc.safeSummary);

    records.push({
      id: `audit:inc:${inc.id}`,
      runId: inc.runId ?? inc.affectedRunIds?.[0],
      invocationId: inc.invocationId,
      timestamp,
      stage: `incident_${inc.rootCauseKey}`,
      title: `Recovery Incident · ${inc.rootCauseKey}`,
      status: inc.state,
      facets: ["recovery"],
      traceCompleteness: inc.affectedRunIds.length > 0 || inc.runId ? "partial" : "orphan",
      incident: {
        id: inc.id,
        rootCauseKey: inc.rootCauseKey,
        state: inc.state,
        safeSummary: inc.safeSummary,
        recoveryAttempts: inc.recoveryAttempts,
        nextAttemptAt: inc.nextAttemptAt,
        requiresAuth: inc.requiresAuth,
        operatorActionRequired: inc.operatorActionRequired,
      },
      recoveryAttempts: attempts.map((att) => ({
        id: att.id,
        attemptNumber: att.attemptNumber,
        step: att.step,
        outcome: att.outcome,
        safeError: sanitizeSafeError(att.error)?.safeSummary,
        timestamp: att.timestamp,
      })),
      error,
      displayMetadata: {
        rootCauseKey: inc.rootCauseKey,
        dependencyId: inc.dependencyId,
        operatorActionRequired: inc.operatorActionRequired,
        requiresAuth: inc.requiresAuth ?? false,
      },
    });
  }

  // 3. Project Standalone Social Decisions not linked to an operational run
  for (const d of decisions) {
    if (coveredDecisionIds.has(d.id)) continue;
    coveredDecisionIds.add(d.id);

    const timestamp = d.createdAt;
    if (sinceTime && new Date(timestamp).getTime() < sinceTime) continue;

    let focalCandidate: CorrelatedAuditRecordDTO["focalCandidate"];
    const focalObjectId = d.focalMirrorObjectIds?.[0];
    if (focalObjectId && mirrorById.has(focalObjectId)) {
      const obj = mirrorById.get(focalObjectId)!;
      focalCandidate = {
        id: obj.id,
        authorHandle: obj.author?.handle ? `@${obj.author.handle}` : obj.author?.displayName,
        authorName: obj.author?.displayName,
        textSnippet: obj.content?.text ? obj.content.text.slice(0, 100) : undefined,
        channelId: obj.channelId ?? "x",
      };
    }

    const facets: AuditFacet[] = ["decision"];
    if (focalCandidate) facets.push("mirror");

    records.push({
      id: `audit:dec:${d.id}`,
      runId: d.plannerRunId ?? d.runId,
      invocationId: d.invocationId,
      timestamp,
      stage: "decision",
      title: `Social Decision · ${d.decision}`,
      status: d.decision,
      facets,
      traceCompleteness: d.plannerRunId || d.runId ? "partial" : "orphan",
      focalCandidate,
      decisions: [{
        id: d.id,
        decision: d.decision,
        summary: d.summary,
        acts: d.acts,
        confidence: d.confidence,
        focalMirrorObjectIds: d.focalMirrorObjectIds,
      }],
      displayMetadata: {
        decision: d.decision,
        confidence: d.confidence ?? "medium",
        influences: d.influences,
      },
    });
  }

  // 4. Project Standalone Executions not linked to an operational run
  for (const e of executions) {
    if (coveredExecutionIds.has(e.id)) continue;
    coveredExecutionIds.add(e.id);

    const timestamp = e.updatedAt ?? e.executedAt ?? e.createdAt;
    if (sinceTime && new Date(timestamp).getTime() < sinceTime) continue;

    const connector = e.connector ?? (e.bridgeId ? "bridge" : "unassigned");
    const route = e.bridgeId ? `chrome_bridge:${e.bridgeId}` : connector === "native" ? "native_x" : "simulated";
    const pubText = e.publication && typeof e.publication.payload === "object" && e.publication.payload && "text" in e.publication.payload && typeof e.publication.payload.text === "string"
      ? e.publication.payload.text.slice(0, 120)
      : undefined;

    records.push({
      id: `audit:exe:${e.id}`,
      runId: e.runId,
      invocationId: e.invocationId,
      timestamp,
      stage: "execution",
      title: `Execution · ${e.affordance} -> ${e.status}`,
      status: e.status,
      facets: ["execution"],
      traceCompleteness: e.runId ? "partial" : "orphan",
      executions: [{
        id: e.id,
        affordance: e.affordance,
        route,
        status: e.status,
        mode: e.mode,
        reviewReason: e.reviewReason,
        socialIntentId: e.socialIntentId,
        publicationTextSnippet: pubText,
      }],
      error: sanitizeSafeError(e.failure),
      displayMetadata: {
        affordance: e.affordance,
        mode: e.mode,
        status: e.status,
        attempts: e.attempts,
      },
    });
  }

  // 5. Standalone Scheduled Wakes
  if (facetFilter === "wake" || facetFilter === "all" || !facetFilter) {
    const wakes = listScheduledWakes(presenceId);
    for (const wake of wakes) {
      if (presenceId && wake.presenceId !== presenceId) continue;
      const timestamp = wake.createdAt;
      if (sinceTime && new Date(timestamp).getTime() < sinceTime) continue;

      records.push({
        id: `audit:wake:${wake.id}`,
        timestamp,
        stage: `scheduled_${wake.kind}`,
        title: `Scheduled Wake · ${wake.kind}`,
        status: wake.state,
        facets: ["wake"],
        traceCompleteness: "partial",
        displayMetadata: {
          kind: wake.kind,
          wakeAt: wake.wakeAt,
          state: wake.state,
          targetId: wake.targetId ?? null,
        },
      });
    }
  }

  // Sort descending by timestamp
  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter by requested facet if specified
  const filteredRecords = facetFilter && facetFilter !== "all"
    ? records.filter((r) => r.facets.includes(facetFilter))
    : records;

  const totalRecords = filteredRecords.length;
  const start = (page - 1) * pageSize;
  return NextResponse.json({
    presenceId,
    timestamp: new Date().toISOString(),
    totalRecords,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(totalRecords / pageSize)),
    records: filteredRecords.slice(start, start + pageSize),
  });
}
