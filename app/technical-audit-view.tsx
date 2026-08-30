"use client";

import { Fragment, useEffect, useState } from "react";
import { RotateCcw, Terminal } from "lucide-react";
import type { AttentionEpisode } from "@/lib/types";

export interface CorrelatedAuditRecordDTO {
  id: string;
  runId?: string;
  invocationId?: string;
  attentionEpisodeId?: string;
  attentionEpisode?: Pick<AttentionEpisode, "id" | "status" | "stage" | "startedAt" | "updatedAt" | "summary" | "fetchedCount" | "newCount" | "changedCount" | "knownCount" | "consideredCount" | "closeAttentionCount" | "noOpCount" | "actionCounts" | "verifiedOutcomeCount" | "pendingExecutionCount" | "failedExecutionCount" | "resourceUsage">;
  timestamp: string;
  stage: string;
  title: string;
  status: string;
  facets: Array<"run" | "decision" | "execution" | "recovery" | "mirror" | "wake">;
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

function formatAuditTimestamp(iso: string) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function TechnicalAuditView({ presenceId }: { presenceId?: string }) {
  const [records, setRecords] = useState<CorrelatedAuditRecordDTO[]>([]);
  const [attentionEpisodes, setAttentionEpisodes] = useState<NonNullable<CorrelatedAuditRecordDTO["attentionEpisode"]>[]>([]);
  const [filter, setFilter] = useState<"all" | "decision" | "execution" | "recovery" | "mirror" | "run" | "wake">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSuccessTime, setLastSuccessTime] = useState<number | null>(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (presenceId) queryParams.set("presenceId", presenceId);
        if (filter !== "all") queryParams.set("facet", filter);
        queryParams.set("page", String(page));
        queryParams.set("pageSize", "50");
        const url = `/api/runtime/log?${queryParams.toString()}`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          setRecords(data.records ?? []);
          setAttentionEpisodes((data.attentionEpisodes ?? []).filter(Boolean));
          setPageCount(Math.max(1, data.pageCount ?? 1));
          setTotalRecords(data.totalRecords ?? data.records?.length ?? 0);
          setLastSuccessTime(Date.now());
          setIsInterrupted(false);
        } else if (active) {
          setIsInterrupted(true);
        }
      } catch {
        if (active) setIsInterrupted(true);
      } finally {
        if (active) {
          setLoading(false);
          timerId = setTimeout(() => void load(), 4000);
        }
      }
    };
    void load();
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [presenceId, filter, page, refreshIndex]);

  const filtered = records.filter((r) => {
    if (filter !== "all" && !r.facets.includes(filter)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchRunId = r.runId ? r.runId.toLowerCase().includes(q) : false;
      const matchInvocationId = r.invocationId ? r.invocationId.toLowerCase().includes(q) : false;
      const matchEpisodeId = r.attentionEpisodeId ? r.attentionEpisodeId.toLowerCase().includes(q) : false;
      const matchStatus = r.status.toLowerCase().includes(q);
      const matchCandidate = r.focalCandidate?.textSnippet ? r.focalCandidate.textSnippet.toLowerCase().includes(q) : false;
      const matchCandidateAuthor = r.focalCandidate?.authorHandle ? r.focalCandidate.authorHandle.toLowerCase().includes(q) : false;
      const matchDecisions = r.decisions ? r.decisions.some((d) => d.summary.toLowerCase().includes(q) || d.decision.toLowerCase().includes(q)) : false;
      const matchExecutions = r.executions ? r.executions.some((e) => e.affordance.toLowerCase().includes(q) || e.route.toLowerCase().includes(q)) : false;
      const matchError = r.error ? r.error.safeSummary.toLowerCase().includes(q) : false;
      return matchTitle || matchRunId || matchInvocationId || matchEpisodeId || matchStatus || matchCandidate || matchCandidateAuthor || matchDecisions || matchExecutions || matchError;
    }
    return true;
  });

  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s === "succeeded" || s === "verified" || s === "healthy" || s === "passed") return "status-succeeded";
    if (s === "failed" || s === "blocked" || s === "needs_operator") return "status-failed";
    if (s === "recovering" || s === "waiting" || s === "running" || s === "queued" || s === "syncing") return "status-recovering";
    return "";
  };

  const secondsAgo = lastSuccessTime ? Math.max(0, Math.floor((nowTick - lastSuccessTime) / 1000)) : null;
  const liveStatusText = isInterrupted
    ? `Connection interrupted · last updated ${secondsAgo ?? "?"}s ago`
    : secondsAgo === null || secondsAgo < 2
      ? "Live · updated just now"
      : `Live · updated ${secondsAgo}s ago`;

  return (
    <section className="technical-audit-view" aria-label="Technical Forensic Audit Ledger">
      <div className="technical-audit-header">
        <div className="technical-audit-titles">
          <h3><Terminal size={16} /> Technical Audit</h3>
          <p>Correlated runtime trace telemetry: candidate triage, model decisions, execution routing, verification, and recovery ladder.</p>
        </div>

        <div className="technical-audit-toolbar">
          <div className={`audit-live-status ${isInterrupted ? "is-interrupted" : ""}`}>
            <span className="live-pulse-dot" />
            <span>{liveStatusText}</span>
          </div>

          <div className="technical-audit-search">
            <input
              type="text"
              placeholder="Search run, candidate, decision, error..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="technical-audit-filter-pills" role="tablist" aria-label="Audit facets">
            {(
              [
                { id: "all", label: "All Activity" },
                { id: "decision", label: "Decisions" },
                { id: "execution", label: "Executions" },
                { id: "recovery", label: "Recovery" },
                { id: "mirror", label: "Mirror" },
                { id: "run", label: "Runs" },
                { id: "wake", label: "Wakes" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`audit-pill ${filter === item.id ? "is-active" : ""}`}
                onClick={() => { setFilter(item.id); setPage(1); }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="audit-refresh-btn"
            onClick={() => setRefreshIndex((i) => i + 1)}
            title="Refresh technical ledger"
          >
            <RotateCcw size={11} /> Refresh
          </button>
        </div>
      </div>

      {attentionEpisodes.length > 0 && (
        <section className="technical-audit-episodes" aria-label="Attention Episodes">
          <div className="technical-audit-episodes-heading">
            <div>
              <h4>Attention Episodes</h4>
              <p>One coherent look → judgment → action → confirmation. Expand the raw trace below when you need implementation detail.</p>
            </div>
            <span>{attentionEpisodes.length} episode{attentionEpisodes.length === 1 ? "" : "s"}</span>
          </div>
          <div className="technical-audit-episodes-grid">
            {attentionEpisodes.slice(0, 12).map((episode) => {
              const episodeRecords = filtered.filter((record) => record.attentionEpisodeId === episode.id);
              const actionTotal = Object.values(episode.actionCounts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);
              const derivedSummary = `${episode.fetchedCount} fetched · ${episode.newCount} new · ${episode.consideredCount} considered · ${actionTotal} action${actionTotal === 1 ? "" : "s"} selected · ${episode.verifiedOutcomeCount} verified`;
              return (
                <button key={episode.id} type="button" className="technical-audit-episode-card" onClick={() => setSearchQuery(episode.id)}>
                  <span className="technical-audit-episode-topline"><strong>{episode.stage}</strong><em>{episode.status}</em></span>
                  <strong>{derivedSummary}</strong>
                  <span>{episode.newCount} new · {episode.changedCount} changed · {episode.verifiedOutcomeCount} verified · {episodeRecords.length} raw trace{episodeRecords.length === 1 ? "" : "s"}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="technical-audit-ledger">
        <div className="technical-audit-head-row">
          <div>Timestamp</div>
          <div>Facets</div>
          <div>Run / Action Details</div>
          <div>Trace Link</div>
          <div style={{ textAlign: "right" }}>Status</div>
        </div>

        {loading && records.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading correlated audit ledger...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>No log records match the current filter.</div>
        ) : (
          <div className="technical-audit-body">
            {filtered.map((record) => {
              const isExpanded = expandedId === record.id;
              const previewText = record.focalCandidate?.textSnippet
                ? `Context: “${record.focalCandidate.textSnippet}”`
                : record.decisions?.[0]?.summary
                  ? record.decisions[0].summary
                  : record.executions?.[0]?.publicationTextSnippet
                    ? `Act text: “${record.executions[0].publicationTextSnippet}”`
                    : record.incident?.safeSummary
                      ? record.incident.safeSummary
                      : record.stage;

              return (
                <Fragment key={record.id}>
                  <div
                    className={`technical-audit-row ${isExpanded ? "is-expanded" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : record.id); }}
                  >
                    <div className="audit-cell-time" title={record.timestamp}>
                      {formatAuditTimestamp(record.timestamp)}
                    </div>

                    <div className="audit-cell-facets">
                      {record.facets.map((f) => (
                        <span key={f} className={`audit-facet-badge facet-${f}`}>
                          {f}
                        </span>
                      ))}
                    </div>

                    <div className="audit-cell-main">
                      <div className="audit-main-title" title={record.title}>
                        {record.title}
                        {record.focalCandidate?.authorHandle && (
                          <span style={{ color: "var(--muted)", fontWeight: "normal", marginLeft: "6px" }}>
                            from {record.focalCandidate.authorHandle}
                          </span>
                        )}
                      </div>
                      <div className="audit-main-preview" title={previewText}>
                        {previewText}
                      </div>
                    </div>

                    <div className="audit-cell-trace">
                      <span className={`audit-trace-badge trace-${record.traceCompleteness}`}>
                        {record.traceCompleteness === "full" ? "Full Trace" : record.traceCompleteness === "partial" ? "Partial" : "Uncorrelated"}
                      </span>
                    </div>

                    <div className="audit-cell-status">
                      <span className={`audit-status-badge ${getStatusClass(record.status)}`}>
                        {record.status}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="technical-audit-detail-panel">
                      <div className="audit-detail-grid">
                        <div className="audit-detail-topline">
                          <div className="audit-detail-topline-left">
                            <strong>{record.title}</strong>
                            {record.runId && <code>run:{record.runId}</code>}
                            {record.invocationId && <code>inv:{record.invocationId}</code>}
                          </div>
                          <div>
                            <span style={{ color: "#94a3b8", marginRight: "8px" }}>{record.timestamp}</span>
                            <span className={`audit-status-badge ${getStatusClass(record.status)}`}>{record.status}</span>
                          </div>
                        </div>

                        {record.focalCandidate && (
                          <div className="audit-detail-section">
                            <div className="audit-detail-section-title">Focal Candidate Mirror Context</div>
                            <div style={{ color: "#e2e8f0" }}>
                              <strong>{record.focalCandidate.authorName || record.focalCandidate.authorHandle}</strong> ({record.focalCandidate.authorHandle})
                            </div>
                            {record.focalCandidate.textSnippet && (
                              <div style={{ color: "#cbd5e1", fontStyle: "italic" }}>
                                “{record.focalCandidate.textSnippet}”
                              </div>
                            )}
                          </div>
                        )}

                        {record.decisions && record.decisions.length > 0 && (
                          <div className="audit-detail-section">
                            <div className="audit-detail-section-title">Cognition Decisions & Selected Acts</div>
                            {record.decisions.map((d) => (
                              <div key={d.id} style={{ display: "grid", gap: "4px" }}>
                                <div style={{ color: "#e2e8f0" }}>
                                  <strong>Decision:</strong> {d.decision} {d.confidence && <span>(Confidence: {d.confidence})</span>}
                                </div>
                                <div style={{ color: "#cbd5e1" }}>{d.summary}</div>
                                {d.acts && d.acts.length > 0 && (
                                  <div style={{ display: "grid", gap: "3px", paddingLeft: "10px", borderLeft: "2px solid rgba(255,255,255,0.1)" }}>
                                    {d.acts.map((act, i) => (
                                      <div key={i} style={{ color: "#a5f3fc" }}>
                                        ↳ <strong>{act.decision}</strong>: {act.text ? `“${act.text}”` : "[quiet act]"} {act.rationale && <span style={{ color: "#94a3b8" }}>— {act.rationale}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {record.executions && record.executions.length > 0 && (
                          <div className="audit-detail-section">
                            <div className="audit-detail-section-title">Executions & Delivery Route</div>
                            {record.executions.map((e) => (
                              <div key={e.id} style={{ display: "grid", gap: "2px" }}>
                                <div style={{ color: "#e2e8f0" }}>
                                  <strong>{e.affordance}</strong> → Route: <code>{e.route}</code> · Status: <span className={`audit-status-badge ${getStatusClass(e.status)}`}>{e.status}</span>
                                </div>
                                {e.publicationTextSnippet && (
                                  <div style={{ color: "#86efac", fontStyle: "italic" }}>
                                    “{e.publicationTextSnippet}”
                                  </div>
                                )}
                                {e.reviewReason && (
                                  <div style={{ color: "#fde047" }}>
                                    Review boundary: {e.reviewReason}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {record.modelTelemetry && (
                          <div className="audit-detail-section">
                            <div className="audit-detail-section-title">Model Telemetry & Token Budget</div>
                            <div style={{ color: "#cbd5e1" }}>
                              Provider: <code>{record.modelTelemetry.provider}</code> · Model: <code>{record.modelTelemetry.model ?? "not reported"}</code> · Tokens: <strong>{record.modelTelemetry.totalTokens ?? "not reported"}</strong> · Requests: {record.modelTelemetry.requests ?? 1}
                            </div>
                          </div>
                        )}

                        {record.incident && (
                          <div className="audit-detail-section" style={{ borderColor: "rgba(249, 115, 22, 0.3)", background: "rgba(249, 115, 22, 0.05)" }}>
                            <div className="audit-detail-section-title" style={{ color: "#fdba74" }}>Recovery Incident & Escalation Ladder</div>
                            <div style={{ color: "#fed7aa" }}>
                              Root Cause: <code>{record.incident.rootCauseKey}</code> · Attempts: <strong>{record.incident.recoveryAttempts}</strong> · State: <span className={`audit-status-badge ${getStatusClass(record.incident.state)}`}>{record.incident.state}</span>
                            </div>
                            <div style={{ color: "#e2e8f0" }}>{record.incident.safeSummary}</div>
                            {record.incident.nextAttemptAt && (
                              <div style={{ color: "#cbd5e1" }}>
                                Next backoff attempt scheduled at: {new Date(record.incident.nextAttemptAt).toLocaleTimeString()}
                              </div>
                            )}
                            {record.recoveryAttempts && record.recoveryAttempts.length > 0 && (
                              <div style={{ display: "grid", gap: "3px", marginTop: "4px", paddingLeft: "10px", borderLeft: "2px solid rgba(249,115,22,0.3)" }}>
                                {record.recoveryAttempts.map((att) => (
                                  <div key={att.id} style={{ color: "#fed7aa" }}>
                                    Step #{att.attemptNumber} [<code>{att.step}</code>] → {att.outcome} {att.safeError && <span style={{ color: "#fca5a5" }}>({att.safeError})</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {record.error && (
                          <div className="audit-detail-error-box">
                            <strong>Sanitized Runtime Diagnostic:</strong> {record.error.code ? `[${record.error.code}] ` : ""}{record.error.safeSummary}
                          </div>
                        )}

                        {record.displayMetadata && Object.keys(record.displayMetadata).length > 0 && (
                          <div>
                            <pre className="audit-detail-json">
                              {JSON.stringify(record.displayMetadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
        {totalRecords > 0 && (
          <nav className="activity-pagination" aria-label="Technical audit pages">
            <span className="activity-pagination-count">Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, totalRecords)} of {totalRecords}</span>
            <div className="activity-pagination-controls">
              <button type="button" className="activity-pagination-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Newer</button>
              <span aria-live="polite">Page {page} of {pageCount}</span>
              <button type="button" className="activity-pagination-button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Older</button>
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}
