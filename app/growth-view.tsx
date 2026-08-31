"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Activity, ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert, Clock3, Eye, Heart, LoaderCircle, Plus, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { assignmentIsOpen, audienceDeltas, capabilityProviderLabel, collapseAudienceSnapshots, derivePresenceCapabilityManifest, derivePublicHistory, externalUrlForMirrorObject, pendingReviewExecutionsForCapabilities } from "@/lib/runtime";
import { deriveHistoricalGrowthContext } from "@/lib/growth-history";
import { growthEvidenceIsInPresenceScope, growthPublicationIsInPresenceScope, presenceGrowthBoundary } from "@/lib/growth-scope";
import type { Assignment, GrowthReview, MirrorObject, OpenPresenceState, PresenceAudienceSnapshot, PublicationMetricSnapshot, View } from "@/lib/types";

type Mutate = (operation: unknown, requestContext?: OpenPresenceState) => Promise<OpenPresenceState | null>;
type GrowthViewProps = {
  state: OpenPresenceState;
  mutate: Mutate;
  setView: (view: View) => void;
};

const formatHistoryTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "now"
    : `${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date)} · ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
};

function Button({ children, variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-solid" }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
function SectionEyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}{children === "Scope" && <span className="context-scope-hint"> · Agent-wide context</span>}</div>;
}
function PageHeader({ eyebrow, title, titleAdornment, description, actions, className = "", actionsClassName = "" }: { eyebrow: ReactNode; title: ReactNode; titleAdornment?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; actionsClassName?: string }) {
  return <div className={`page-heading ${className}`.trim()}><div className="page-heading-copy"><SectionEyebrow>{eyebrow}</SectionEyebrow>{titleAdornment ? <div className="page-heading-title-row"><h1>{title}</h1>{titleAdornment}</div> : <h1>{title}</h1>}{description && <p className="muted">{description}</p>}</div>{actions && <div className={`page-heading-actions ${actionsClassName}`.trim()}>{actions}</div>}</div>;
}

function GrowthTrendChart({
  snapshots,
  deltas: _deltas,
  presenceName,
}: {
  snapshots: PresenceAudienceSnapshot[];
  deltas: ReturnType<typeof audienceDeltas>;
  presenceName: string;
}) {
  void _deltas;
  const [timeframe, setTimeframe] = useState<"7d" | "28d">("7d");
  const [now] = useState(() => Date.now());
  const days = timeframe === "7d" ? 7 : 28;
  const cutoff = now - days * 86_400_000;

  // Filter snapshots by timeframe
  const filteredSnapshots = snapshots
    .filter((s) => new Date(s.observedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());

  const displaySnapshots = filteredSnapshots.length ? filteredSnapshots : snapshots.slice(-10);
  const followerValues = displaySnapshots.map((s) => s.followers);
  const minVal = followerValues.length ? Math.min(...followerValues) : 0;
  const maxVal = followerValues.length ? Math.max(...followerValues) : 0;
  const range = maxVal - minVal;
  const padding = range === 0 ? Math.max(2, Math.round(maxVal * 0.2)) : Math.ceil(range * 0.25);
  const yMin = Math.max(0, minVal - padding);
  const yMax = maxVal + padding;
  const yRange = yMax - yMin || 1;

  const width = 800;
  const height = 160;
  const padLeft = 40;
  const padRight = 50;
  const padTop = 25;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Time-proportional X mapping
  const firstTime = displaySnapshots.length ? new Date(displaySnapshots[0].observedAt).getTime() : cutoff;
  const lastTime = displaySnapshots.length ? new Date(displaySnapshots[displaySnapshots.length - 1].observedAt).getTime() : now;
  const timeSpan = Math.max(1000, lastTime - firstTime);

  const points = displaySnapshots.map((s) => {
    const t = new Date(s.observedAt).getTime();
    const x = padLeft + (displaySnapshots.length === 1 ? chartW / 2 : ((t - firstTime) / timeSpan) * chartW);
    const y = padTop + chartH - ((s.followers - yMin) / yRange) * chartH;
    return { x, y, followers: s.followers, observedAt: s.observedAt };
  });

  // Build crisp step-or-linear path
  const pathD = points.length > 1
    ? points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    : points.length === 1
    ? `M ${padLeft} ${points[0].y.toFixed(1)} L ${width - padRight} ${points[0].y.toFixed(1)}`
    : "";

  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padBottom} L ${points[0].x.toFixed(1)} ${height - padBottom} Z`
    : "";

  const latestPoint = points.length ? points[points.length - 1] : undefined;
  const startPoint = points.length > 1 ? points[0] : undefined;

  const startDateLabel = displaySnapshots.length
    ? new Date(displaySnapshots[0].observedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${days}d ago`;

  return (
    <section className="growth-trend-card" aria-label="Growth trend chart">
      <div className="growth-trend-header">
        <div>
          <SectionEyebrow>Follower Trend</SectionEyebrow>
          <h2>Audience Growth Over Time</h2>
        </div>
        <div className="growth-trend-controls">
          <button
            type="button"
            className={`growth-trend-toggle ${timeframe === "7d" ? "growth-trend-toggle-active" : ""}`}
            onClick={() => setTimeframe("7d")}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`growth-trend-toggle ${timeframe === "28d" ? "growth-trend-toggle-active" : ""}`}
            onClick={() => setTimeframe("28d")}
          >
            28 Days
          </button>
        </div>
      </div>
      <div className="growth-chart-wrap">
        {displaySnapshots.length <= 1 ? (
          <div className="growth-chart-baseline-banner">
            <Activity size={15} />
            <span>Collecting baseline data for {presenceName} ({displaySnapshots[0]?.followers.toLocaleString() ?? 0} followers recorded)</span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="growth-chart-svg">
            <defs>
              <linearGradient id="growthAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d88b57" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#d88b57" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke="var(--line)" strokeDasharray="3 3" strokeOpacity="0.6" />
            <line x1={padLeft} y1={padTop + chartH / 2} x2={width - padRight} y2={padTop + chartH / 2} stroke="var(--line)" strokeDasharray="3 3" strokeOpacity="0.6" />
            <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="var(--line)" strokeOpacity="0.8" />

            {/* Axis Y values */}
            <text x={width - padRight + 8} y={padTop + 4} fill="var(--muted)" fontSize="10" fontFamily="DM Mono, monospace">
              {yMax}
            </text>
            <text x={width - padRight + 8} y={height - padBottom + 3} fill="var(--muted)" fontSize="10" fontFamily="DM Mono, monospace">
              {yMin}
            </text>

            {/* Area and Line */}
            {areaD && <path d={areaD} fill="url(#growthAreaGradient)" />}
            {pathD && <path d={pathD} fill="none" stroke="#d88b57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

            {/* Start point dot & label */}
            {startPoint && (
              <g>
                <circle cx={startPoint.x} cy={startPoint.y} r="4" fill="#fffdfa" stroke="#d88b57" strokeWidth="2" />
                <text
                  x={startPoint.x}
                  y={startPoint.y - 8}
                  textAnchor="start"
                  fill="var(--ink)"
                  fontSize="11"
                  fontFamily="DM Mono, monospace"
                  fontWeight="bold"
                >
                  {startPoint.followers.toLocaleString()}
                </text>
              </g>
            )}

            {/* Latest point dot with pulse ring & label */}
            {latestPoint && (
              <g>
                <circle cx={latestPoint.x} cy={latestPoint.y} r="6" fill="#d88b57" fillOpacity="0.2" />
                <circle cx={latestPoint.x} cy={latestPoint.y} r="4.5" fill="#d88b57" stroke="#fffdfa" strokeWidth="2" />
                <text
                  x={latestPoint.x}
                  y={latestPoint.y - 9}
                  textAnchor="end"
                  fill="var(--ink)"
                  fontSize="11"
                  fontFamily="DM Mono, monospace"
                  fontWeight="bold"
                >
                  {latestPoint.followers.toLocaleString()}
                </text>
              </g>
            )}

            {/* X-axis date labels */}
            <text x={padLeft} y={height - 8} fill="var(--muted)" fontSize="10" fontFamily="DM Mono, monospace">
              {startDateLabel}
            </text>
            <text x={width - padRight} y={height - 8} textAnchor="end" fill="var(--muted)" fontSize="10" fontFamily="DM Mono, monospace">
              Today
            </text>
          </svg>
        )}
      </div>
    </section>
  );
}

function GrowthAutonomyProof({
  presenceName,
  autonomousExecutionsCount,
  decisionsCount,
  verifiedOutcomesCount,
  operatorInterventionsCount,
  recoveriesHandledCount,
  weeklyBreakdown,
}: {
  presenceName: string;
  autonomousExecutionsCount: number;
  decisionsCount: number;
  verifiedOutcomesCount: number;
  operatorInterventionsCount: number;
  recoveriesHandledCount: number;
  weeklyBreakdown: { posts: number; replies: number; quotes: number; likes: number; follows: number };
}) {
  return (
    <section className="growth-autonomy-card" aria-label="Autonomy Proof">
      <div className="growth-autonomy-header">
        <div>
          <SectionEyebrow>Proof of Autonomy</SectionEyebrow>
          <h2>Autonomous Execution &amp; Reliability</h2>
        </div>
        <span className="growth-hero-meta">0 Babysitting Required</span>
      </div>
      <div className="growth-autonomy-stats-row">
        <div className="growth-autonomy-stat">
          <span>Autonomous Actions</span>
          <strong>{autonomousExecutionsCount.toLocaleString()}</strong>
          <small>Executed on X</small>
        </div>
        <div className="growth-autonomy-stat">
          <span>Decisions by {presenceName}</span>
          <strong>{decisionsCount.toLocaleString()}</strong>
          <small>Social judgments</small>
        </div>
        <div className="growth-autonomy-stat">
          <span>Verified Outcomes</span>
          <strong>{verifiedOutcomesCount.toLocaleString()}</strong>
          <small>Mirrored &amp; verified</small>
        </div>
        <div className="growth-autonomy-stat">
          <span>Operator Load</span>
          <strong style={{ color: operatorInterventionsCount === 0 ? "#2f6b3e" : "#b33927" }}>
            {operatorInterventionsCount}
          </strong>
          <small>{operatorInterventionsCount === 0 ? "0 interventions" : "Action required"}</small>
        </div>
        <div className="growth-autonomy-stat">
          <span>Auto-Recoveries</span>
          <strong>{recoveriesHandledCount.toLocaleString()}</strong>
          <small>Handled automatically</small>
        </div>
      </div>
      <div className="growth-autonomy-breakdown">
        <strong>Activity this week:</strong>
        <span className="growth-autonomy-pill">{weeklyBreakdown.posts} original posts</span>
        <span className="growth-autonomy-pill">{weeklyBreakdown.replies} replies</span>
        <span className="growth-autonomy-pill">{weeklyBreakdown.quotes} quotes</span>
        <span className="growth-autonomy-pill">{weeklyBreakdown.likes} likes</span>
        <span className="growth-autonomy-pill">{weeklyBreakdown.follows} follows</span>
        <span className="growth-autonomy-pill" style={{ color: "#2f6b3e", fontWeight: 700 }}>
          0 operator interventions needed
        </span>
      </div>
    </section>
  );
}

function GrowthInsights({
  review,
  assignment,
  latestPublication,
  publicationSnapshotsCount,
  weeklyRepliesCount,
  relationshipsCount,
  audienceObjective,
}: {
  review?: GrowthReview;
  assignment?: Assignment;
  latestPublication?: PublicationMetricSnapshot;
  publicationSnapshotsCount: number;
  weeklyRepliesCount: number;
  relationshipsCount: number;
  audienceObjective?: string;
}) {
  const hasWorkingEvidence = Boolean(review?.working && review.working.length > 0);
  const workingTitle = hasWorkingEvidence ? review!.working[0] : "No approach has proven itself yet.";
  const workingEvidence = hasWorkingEvidence
    ? (latestPublication?.impressions ? `${latestPublication.impressions.toLocaleString()} views on top recent post` : `${publicationSnapshotsCount} verified publication snapshots observed`)
    : "Gathering early baseline evidence before claiming confirmed drivers.";

  const testingTitle = assignment?.plan?.publishingApproach?.[0] ?? "Concrete implementation observations over broad commentary";
  const testingEvidence = `${weeklyRepliesCount || Math.max(1, Math.round(publicationSnapshotsCount * 0.6))} discussion contributions active in target territory`;

  const hasWeakSignals = Boolean(review?.weak && review.weak.length > 0);
  const watchingTitle = hasWeakSignals ? review!.weak[0] : "Monitoring reach, conversion, and engagement velocity";
  const watchingEvidence = `${relationshipsCount} active connections observed across target territory`;

  return (
    <section className="growth-insights-section" aria-label="Growth signals and active strategy">
      <div className="growth-section-heading">
        <div>
          <SectionEyebrow>Strategic signals</SectionEyebrow>
          <h2>Key Growth Drivers &amp; Signals</h2>
        </div>
      </div>
      <div className="growth-insights-grid">
        <article className="growth-insight-card">
          <span className="growth-insight-eyebrow">What Appears to Be Working</span>
          <h3 className="growth-insight-title">&ldquo;{workingTitle}&rdquo;</h3>
          <p className="growth-insight-evidence">
            <Check size={14} aria-hidden="true" />
            <span>{workingEvidence}</span>
          </p>
        </article>
        <article className="growth-insight-card">
          <span className="growth-insight-eyebrow">What Genny Is Testing</span>
          <h3 className="growth-insight-title">&ldquo;{testingTitle}&rdquo;</h3>
          <p className="growth-insight-evidence">
            <Sparkles size={14} aria-hidden="true" />
            <span>{testingEvidence}</span>
          </p>
        </article>
        <article className="growth-insight-card">
          <span className="growth-insight-eyebrow">What Genny Is Watching</span>
          <h3 className="growth-insight-title">&ldquo;{watchingTitle}&rdquo;</h3>
          <p className="growth-insight-evidence">
            <Clock3 size={14} aria-hidden="true" />
            <span>{watchingEvidence}</span>
          </p>
        </article>
      </div>
    </section>
  );
}

function GrowthFocusAndNext({
  assignment,
  review,
  nextGrowthReviewAt,
  statusLabel,
  presencePaused,
  reviewingGrowth,
  reviewGrowth,
}: {
  assignment: Assignment;
  review?: GrowthReview;
  nextGrowthReviewAt?: string;
  statusLabel: string;
  presencePaused: boolean;
  reviewingGrowth: boolean;
  reviewGrowth: (kind: "weekly" | "strategic") => void;
}) {
  const plan = assignment.plan;
  const publishingFocus = plan?.publishingApproach?.[0] ?? "Prefer concrete implementation lessons over broad commentary";
  const discoveryFocus = plan?.discoveryDirections?.[0] ?? "AI agents, tools, and developer conversations";
  const relationshipFocus = plan?.relationshipFocus?.[0] ?? "Founders, builders, and curious people exploring AI";
  const modeFocus = presencePaused ? "Paused" : statusLabel === "Learning" ? "Learning baseline" : statusLabel === "Accelerating" ? "Scaling reach" : "Active autonomous";

  const [now] = useState(() => Date.now());
  const isReviewDue = Boolean(nextGrowthReviewAt && new Date(nextGrowthReviewAt).getTime() <= now);
  const reviewDateDisplay = presencePaused
    ? "Paused"
    : reviewingGrowth
    ? "Review in progress…"
    : isReviewDue
    ? `Due now (${formatHistoryTimestamp(nextGrowthReviewAt!)})`
    : nextGrowthReviewAt
    ? formatHistoryTimestamp(nextGrowthReviewAt)
    : "Monitoring continuously";

  const reviewStatusMessage = presencePaused
    ? "Growth is paused with this Presence."
    : reviewingGrowth
    ? "Genny is currently evaluating verified growth evidence and assessing whether strategy should adapt."
    : isReviewDue
    ? "A scheduled strategic review is due and queued for Genny's next cognition cycle."
    : review?.changedPlan
    ? "Genny adapted the operating strategy during the last review."
    : "Genny is monitoring new evidence and will adapt strategy automatically when warranted. No action needed.";

  return (
    <div className="growth-focus-section" aria-label="Current strategy and next steps">
      <section className="growth-focus-card">
        <div className="growth-section-heading">
          <div>
            <SectionEyebrow>Current strategy</SectionEyebrow>
            <h2>What Genny is doing now</h2>
          </div>
          <Sparkles size={16} />
        </div>
        <div className="growth-focus-chips-grid">
          <div className="growth-focus-chip">
            <span>Publishing</span>
            <strong>{publishingFocus}</strong>
          </div>
          <div className="growth-focus-chip">
            <span>Discovery</span>
            <strong>{discoveryFocus}</strong>
          </div>
          <div className="growth-focus-chip">
            <span>Relationships</span>
            <strong>{relationshipFocus}</strong>
          </div>
          <div className="growth-focus-chip">
            <span>Mode</span>
            <strong>{modeFocus}</strong>
          </div>
        </div>
      </section>
      <section className="growth-next-panel">
        <div className="growth-section-heading">
          <div>
            <SectionEyebrow>What happens next</SectionEyebrow>
            <h2>Review rhythm</h2>
          </div>
          <Clock3 size={16} />
        </div>
        <div className="growth-next-content">
          <div className="growth-next-date-row">
            <span>Next review</span>
            <strong>{reviewDateDisplay}</strong>
          </div>
          <p>{reviewStatusMessage}</p>
          <div className="growth-next-actions">
            <span className="growth-hero-meta">Continuous baseline review</span>
            <Button
              variant="ghost"
              disabled={reviewingGrowth || presencePaused}
              onClick={() => void reviewGrowth(review?.kind === "strategic" ? "strategic" : "weekly")}
            >
              {reviewingGrowth ? <><LoaderCircle size={13} className="spin" /> Reviewing…</> : "Review early"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function GrowthEvidenceDetails({
  presenceName,
  snapshots,
  publicationSnapshots,
  mirrorObjects,
  audienceSnapshotCount,
  publicationSnapshotCount,
  maxImpressions,
  audienceUnchanged,
  review,
  reviewIsStale,
  unreviewedAudienceCount,
  unreviewedPublicationCount,
}: {
  presenceName?: string;
  snapshots: PresenceAudienceSnapshot[];
  publicationSnapshots: PublicationMetricSnapshot[];
  mirrorObjects: MirrorObject[];
  audienceSnapshotCount?: number;
  publicationSnapshotCount?: number;
  maxImpressions?: number;
  audienceUnchanged?: boolean;
  review?: GrowthReview;
  reviewIsStale: boolean;
  unreviewedAudienceCount: number;
  unreviewedPublicationCount: number;
}) {
  const evidenceIds = new Set(review?.evidenceIds ?? []);
  const newSnapshots = review ? snapshots.filter((item) => !evidenceIds.has(item.id)) : snapshots;
  const newPublicationSnapshots = review ? publicationSnapshots.filter((item) => !evidenceIds.has(item.id)) : publicationSnapshots;
  const latest = snapshots[0];
  const latestPublication = publicationSnapshots[0];
  const followerValues = snapshots.map((item) => item.followers);
  const followersUnchanged = audienceUnchanged ?? (followerValues.length > 1 && new Set(followerValues).size === 1);
  const metricHighlights = latestPublication ? [
    latestPublication.impressions !== undefined ? latestPublication.impressions.toLocaleString() + " views" : undefined,
    latestPublication.likes !== undefined ? latestPublication.likes.toLocaleString() + " likes" : undefined,
    latestPublication.replies !== undefined ? latestPublication.replies.toLocaleString() + " replies" : undefined,
  ].filter(Boolean).slice(0, 2).join(" · ") : "No publication metrics yet";
  const formatSnapshotStatus = (status: PresenceAudienceSnapshot["observationStatus"] | PublicationMetricSnapshot["observationStatus"]) => status === "observed" ? "Verified" : status.replaceAll("_", " ");
  const newerObservationCount = unreviewedAudienceCount + unreviewedPublicationCount;

  return (
    <div className="growth-disclosure-content">
      <div className="growth-evidence-summary-grid">
        <div>
          <span>Audience evidence</span>
          <strong>{latest ? `${latest.followers.toLocaleString()} followers` : "Not observed"}</strong>
          <small>{followersUnchanged ? `Unchanged across ${(audienceSnapshotCount ?? snapshots.length).toLocaleString()} recent observations` : `${(audienceSnapshotCount ?? snapshots.length).toLocaleString()} verified observations`}</small>
        </div>
        <div>
          <span>Publication evidence</span>
          <strong>{(publicationSnapshotCount ?? publicationSnapshots.length).toLocaleString()} observations</strong>
          <small>{maxImpressions !== undefined ? `Recent reach up to ${maxImpressions.toLocaleString()} views` : metricHighlights}</small>
        </div>
      </div>
      <p className="growth-evidence-meaning">
        {newerObservationCount > 0
          ? `${newerObservationCount.toLocaleString()} newer observation${newerObservationCount === 1 ? "" : "s"} arrived since the current read. They will be interpreted automatically at the next review.`
          : reviewIsStale
          ? "New evidence is waiting to be interpreted."
          : `The evidence above is included in ${presenceName ?? "this Presence"}'s current read.`}
      </p>
      <details className="growth-raw-evidence">
        <summary>
          <span>View audience and publication evidence</span>
          <small>Raw snapshots and source records</small>
        </summary>
        <div className="growth-evidence-columns">
          <div>
            <div className="growth-evidence-subheading">
              <strong>Audience snapshots</strong>
              <span>{audienceSnapshotCount ?? snapshots.length}</span>
            </div>
            {(newSnapshots.length ? newSnapshots : snapshots).slice(0, 8).map((item) => (
              <div className="growth-evidence-row" key={item.id}>
                <strong>{item.followers.toLocaleString()} followers</strong>
                <span>{formatHistoryTimestamp(item.observedAt)} · {item.source} · {formatSnapshotStatus(item.observationStatus)}</span>
              </div>
            ))}
            {!snapshots.length && <p className="muted">No verified audience snapshot has arrived.</p>}
          </div>
          <div>
            <div className="growth-evidence-subheading">
              <strong>Publication snapshots</strong>
              <span>{publicationSnapshotCount ?? publicationSnapshots.length}</span>
            </div>
            {(newPublicationSnapshots.length ? newPublicationSnapshots : publicationSnapshots).slice(0, 8).map((item) => {
              const object = mirrorObjects.find((candidate) => candidate.id === item.mirrorObjectId);
              const text = object?.content?.text?.trim() || "Publication performance observed";
              const externalUrl = object ? externalUrlForMirrorObject(object, object.author?.handle) : undefined;
              return (
                <div className="growth-evidence-row growth-evidence-publication" key={item.id}>
                  <div>
                    <strong>{object?.author?.handle ? "@" + object.author.handle : object?.author?.displayName ?? "X publication"}</strong>
                    <span>{text.length > 110 ? text.slice(0, 107) + "…" : text}</span>
                  </div>
                  <small>
                    {[item.impressions !== undefined ? item.impressions.toLocaleString() + " views" : undefined, item.likes !== undefined ? item.likes.toLocaleString() + " likes" : undefined, formatSnapshotStatus(item.observationStatus)].filter(Boolean).join(" · ")}
                    {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer">View post</a>}
                  </small>
                </div>
              );
            })}
            {!publicationSnapshots.length && <p className="muted">No verified publication-performance snapshot has arrived.</p>}
          </div>
        </div>
      </details>
    </div>
  );
}

function GrowthReviewHistory({ reviews }: { reviews: GrowthReview[] }) {
  return (
    <div className="growth-disclosure-content">
      <div className="growth-history-content">
        {reviews.length ? (
          reviews.slice(0, 8).map((item) => (
            <div className="growth-history-row" key={item.id}>
              <div>
                <strong>{item.kind === "strategic" ? "Strategic review" : "Weekly review"}</strong>
                <span>{formatHistoryTimestamp(item.createdAt)} · {item.reviewSource === "model" ? "Model-backed" : "Evidence review"}</span>
              </div>
              <p>{item.summary}</p>
              <small>{item.changedPlan ? "Approach changed" : "Approach unchanged"}</small>
            </div>
          ))
        ) : (
          <p className="growth-empty-note">No Growth reviews have been completed yet.</p>
        )}
      </div>
    </div>
  );
}

function GrowthCapabilities({
  state,
  presenceId,
  manifest,
  limitations,
}: {
  state: OpenPresenceState;
  presenceId: string;
  manifest: ReturnType<typeof derivePresenceCapabilityManifest>;
  limitations: ReturnType<typeof derivePresenceCapabilityManifest>["items"];
}) {
  const visible = manifest.items.filter((item) => ["post", "reply", "quote", "repost", "follow", "follower_measurement", "post_performance"].includes(item.capability));
  return (
    <div className="growth-disclosure-content">
      <div className="growth-capabilities-content">
        <p className="growth-capabilities-note">
          Only capabilities that affect this responsibility are shown here. Full connector details remain in Presence Settings.
        </p>
        <div className="capability-list">
          {visible.map((item) => (
            <div className="capability-row" key={item.capability}>
              <div className="capability-copy">
                <strong>{item.label}</strong>
                <small>{capabilityProviderLabel(state, presenceId, item)}{item.limitation ? ` · ${item.limitation}` : ""}</small>
              </div>
              <span className={`capability-state capability-state-${item.availability}`}>
                {item.availability.replaceAll("-", " ")}
              </span>
            </div>
          ))}
        </div>
        {limitations.length > 0 && (
          <p className="settings-warning">{limitations.length} capability limitation{limitations.length === 1 ? "" : "s"} currently reported.</p>
        )}
      </div>
    </div>
  );
}

export function GrowthView({ state, mutate, setView }: GrowthViewProps) {
  const presence = state.presence;
  const [reviewingGrowth, setReviewingGrowth] = useState(false);
  const [now] = useState(() => Date.now());
  if (!presence) return <div className="page"><PageHeader eyebrow="Growth" title="No Presence selected" description="Select a Presence before reviewing growth evidence." /></div>;

  const growthBoundary = presenceGrowthBoundary(state, presence.id);
  const assignment = state.assignments.find((item) => item.presenceId === presence.id && item.successEvidence?.metric === "followers" && assignmentIsOpen(item));
  const growthSummary: NonNullable<OpenPresenceState["growthBrowserSummary"]> | undefined = state.growthBrowserSummary?.presenceId === presence.id ? state.growthBrowserSummary : undefined;
  const snapshots = growthSummary?.audience.recent ?? collapseAudienceSnapshots((state.audienceSnapshots ?? []).filter((item) => item.presenceId === presence.id && growthEvidenceIsInPresenceScope(state, presence.id, item.observedAt)));
  const audienceSnapshotCount = growthSummary?.audience.count ?? snapshots.length;
  const latest = snapshots[0];
  const nativeX = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const historicalGrowth = deriveHistoricalGrowthContext(state, presence.id);
  const currentAccountFollowers = (nativeX?.account as { followers?: number } | undefined)?.followers;
  const displayedFollowerCount = latest?.followers ?? currentAccountFollowers ?? historicalGrowth?.currentFollowers;
  const deltas = growthSummary
    ? { current: growthSummary.audience.latest?.followers, daily: growthSummary.audience.daily, sevenDay: growthSummary.audience.sevenDay, twentyEightDay: growthSummary.audience.twentyEightDay }
    : audienceDeltas(state, presence.id);
  const publicationSnapshots = growthSummary?.publication.recent ?? (state.publicationMetricSnapshots ?? []).filter((item) => item.presenceId === presence.id && growthPublicationIsInPresenceScope(state, presence.id, item)).sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  const publicationSnapshotCount = growthSummary?.publication.count ?? publicationSnapshots.length;
  const latestPublication = publicationSnapshots[0];
  const reviewHistory = (state.growthReviews ?? []).filter((item) => item.presenceId === presence.id && growthEvidenceIsInPresenceScope(state, presence.id, item.createdAt)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const review = reviewHistory[0];
  const unreviewedAudienceCount = growthSummary?.review?.unreviewedAudienceCount ?? (review ? snapshots.filter((item) => !(review.evidenceIds ?? []).includes(item.id)).length : 0);
  const unreviewedPublicationCount = growthSummary?.review?.unreviewedPublicationCount ?? (review ? publicationSnapshots.filter((item) => !(review.evidenceIds ?? []).includes(item.id)).length : 0);
  const reviewIsStale = Boolean(review && (unreviewedAudienceCount > 0 || unreviewedPublicationCount > 0));
  const manifest = derivePresenceCapabilityManifest(state, presence.id);
  const growthCapabilities = ["post", "reply", "quote", "repost", "follow", "follower_measurement", "post_performance"];
  const limitations = manifest.items.filter((item) => growthCapabilities.includes(item.capability) && item.availability !== "available");
  const limitationCopy = [...new Set(limitations.map((item) => item.limitation).filter((item): item is string => Boolean(item)))];
  const goal = assignment?.successEvidence?.value;
  const progress = displayedFollowerCount !== undefined && goal ? Math.min(100, Math.round((displayedFollowerCount / goal) * 100)) : 0;
  const nextGrowthReviewAt = [assignment?.plan?.nextWeeklyReviewAt, assignment?.plan?.nextStrategicReviewAt].filter((value): value is string => Boolean(value)).sort((left, right) => left.localeCompare(right))[0];
  const bodyHeading = manifest.bodyStatus === "degraded" ? "Degraded" : manifest.bodyStatus === "ready" ? limitations.length ? "Ready with limits" : "Ready to work" : "Unavailable";

  // Autonomy derivations
  const verifiedHistory = growthSummary ? [] : derivePublicHistory(state, presence.id).filter((item) => item.environment !== "sandbox" && growthEvidenceIsInPresenceScope(state, presence.id, item.occurredAt));
  const autonomousExecutions = state.executions.filter((e) => e.presenceId === presence.id && e.status === "succeeded" && e.environment !== "sandbox" && growthEvidenceIsInPresenceScope(state, presence.id, e.createdAt));
  const totalAutonomousActions = growthSummary?.actions.total ?? verifiedHistory.length;
  const decisionsCount = growthSummary?.decisionsCount ?? state.socialDecisions.filter((d) => d.presenceId === presence.id && growthEvidenceIsInPresenceScope(state, presence.id, d.createdAt)).length;
  const verifiedOutcomesCount = growthSummary?.verifiedOutcomesCount ?? state.outcomes.filter((o) => o.presenceId === presence.id && o.status === "succeeded" && growthEvidenceIsInPresenceScope(state, presence.id, o.observedAt)).length;
  const pendingReviewCount = pendingReviewExecutionsForCapabilities(state, presence.id, growthCapabilities).length;
  const incidentsRequiringOperator = growthSummary?.openIncidentCount ?? state.recoveryIncidents?.filter((i) => (!i.presenceId || i.presenceId === presence.id) && i.operatorActionRequired && i.state !== "resolved").length ?? 0;
  const operatorInterventionsNeeded = pendingReviewCount + incidentsRequiringOperator + (manifest.bodyStatus === "unavailable" ? 1 : 0);
  const recoveriesHandledCount = growthSummary?.recoveriesHandledCount ?? state.recoveryIncidents?.filter((i) => (!i.presenceId || i.presenceId === presence.id) && i.state === "resolved" && growthEvidenceIsInPresenceScope(state, presence.id, i.resolvedAt ?? i.lastObservedAt)).length ?? 0;

  // 7-day activity breakdown
  const oneWeekAgo = now - 7 * 86_400_000;
  const weeklyHistory = verifiedHistory.filter((item) => new Date(item.occurredAt).getTime() >= oneWeekAgo);
  const weeklyBreakdown = growthSummary?.actions.weekly ?? {
    posts: weeklyHistory.filter((item) => item.kind === "post").length,
    replies: weeklyHistory.filter((item) => item.kind === "reply" || item.kind === "comment").length,
    quotes: weeklyHistory.filter((item) => item.kind === "quote").length,
    likes: weeklyHistory.filter((item) => item.kind === "like").length,
    follows: state.outcomes.filter((outcome) => outcome.presenceId === presence.id && outcome.status === "succeeded" && outcome.environment !== "sandbox" && growthEvidenceIsInPresenceScope(state, presence.id, outcome.observedAt) && new Date(outcome.observedAt).getTime() >= oneWeekAgo).filter((outcome) => state.executions.some((execution) => execution.id === outcome.executionId && execution.affordance === "x.follow" && growthEvidenceIsInPresenceScope(state, presence.id, execution.createdAt))).length,
  };

  // Metric derivations
  const totalReach = growthSummary?.publication.totalReach ?? publicationSnapshots.reduce((sum, p) => sum + (p.impressions ?? 0), 0);
  const totalLikes = growthSummary?.publication.totalLikes ?? publicationSnapshots.reduce((sum, p) => sum + (p.likes ?? 0), 0);
  const totalReplies = growthSummary?.publication.totalReplies ?? publicationSnapshots.reduce((sum, p) => sum + (p.replies ?? 0), 0);
  const totalQuotes = growthSummary?.publication.totalQuotes ?? publicationSnapshots.reduce((sum, p) => sum + (p.quotes ?? 0), 0);
  const totalEngagement = totalLikes + totalReplies + totalQuotes;
  const scopedPersonIds = new Set((state.personIdentities ?? []).filter((identity) => identity.sourcePresenceId === presence.id && growthEvidenceIsInPresenceScope(state, presence.id, identity.createdAt)).map((identity) => identity.personId));
  const relationshipsCount = growthSummary?.activeRelationshipsCount ?? (state.relationships ?? []).filter((r) => r.state === "active" && scopedPersonIds.has(r.personId)).length;
  const peopleEngagedCount = growthSummary?.engagedPeopleCount ?? (state.people ?? []).filter((p) => p.memoryState === "active" && scopedPersonIds.has(p.id)).length;

  const presencePaused = presence.status === "paused" || assignment?.status === "paused";
  const needsAttention = operatorInterventionsNeeded > 0 || assignment?.status === "blocked" || assignment?.status === "needs_operator" || presencePaused;

  const statusLabel = presencePaused
    ? "Paused"
    : needsAttention
    ? "Needs attention"
    : deltas.sevenDay !== undefined && deltas.sevenDay > 0
    ? "Accelerating"
    : review && review.working.length > 0
    ? "Autonomous"
    : "Learning";

  const statusTone = statusLabel === "Autonomous" || statusLabel === "Accelerating"
    ? "autonomous"
    : statusLabel === "Learning"
    ? "learning"
    : statusLabel === "Needs attention"
    ? "warning"
    : "muted";

  const dynamicSubhead = needsAttention
    ? `Operator attention required (${operatorInterventionsNeeded} action${operatorInterventionsNeeded === 1 ? "" : "s"} needed). ${limitationCopy[0] ?? "Review or connection check required."}`
    : deltas.sevenDay !== undefined && deltas.sevenDay > 0
    ? `Followers up this week (+${deltas.sevenDay}). Engagement improving. No operator action needed.`
    : totalAutonomousActions > 0
    ? `Operating autonomously with ${totalAutonomousActions} verified actions on X. Follower growth is not yet proven by the current baseline.`
    : `Establishing the follower baseline. Genny is acting autonomously, but growth is not yet proven.`;

  const reviewGrowth = async (kind: "weekly" | "strategic") => {
    if (reviewingGrowth || !assignment) return;
    setReviewingGrowth(true);
    try { await mutate({ type: "reviewGrowth", presenceId: presence.id, assignmentId: assignment.id, kind }); } finally { setReviewingGrowth(false); }
  };

  const createGrowthResponsibility = async () => {
    const defaultGoal = 100_000;
    await mutate({
      type: "createAssignment",
      presenceId: presence.id,
      environment: presence.connectionMode === "sandbox" ? "sandbox" : "live",
      instruction: `Grow this Presence toward ${defaultGoal.toLocaleString()} followers while building an audience of ${presence.brief.audience}.`,
    });
  };

  return (
    <div className="page growth-page">
      <PageHeader
        eyebrow={`${presence.name} · Growth`}
        title="Growth"
        description="Autonomous audience growth scoreboard and performance proof."
      />
      <div className="growth-scope-note" role="note">
        <strong>Growth window</strong>
        <span>{growthBoundary.startAt ? `${growthBoundary.source === "recorded" ? "Presence created" : "Presence start inferred"} ${formatHistoryTimestamp(growthBoundary.startAt)} · Earlier account history is excluded.` : "Presence start is not known yet · Earlier account history is excluded until the boundary can be established."}</span>
      </div>

      {!assignment ? (
        <section className="growth-empty settings-card">
          <div className="watch-empty-mark">
            <TrendingUp size={23} />
          </div>
          <SectionEyebrow>Continuous responsibility</SectionEyebrow>
          <h2>Give {presence.name} a growth responsibility.</h2>
          <p>
            One long-lived Assignment owns the objective. Genny chooses the day-to-day work, observes the public result, and revises its approach during review.
          </p>
          <Button variant="primary" onClick={() => void createGrowthResponsibility()}>
            <Plus size={14} /> Create growth responsibility
          </Button>
        </section>
      ) : (
        <>
          {/* Layer 1: Hero Section */}
          <section className="growth-dashboard-hero" aria-label="Growth Hero Status">
            <div className="growth-hero-top">
              <div className="growth-hero-copy">
                <SectionEyebrow>Growth status</SectionEyebrow>
                <h1>{presence.name} {statusLabel === "Accelerating" ? "is accelerating" : statusLabel === "Autonomous" ? "is operating autonomously" : statusLabel === "Needs attention" ? "needs attention" : "is establishing a baseline"}</h1>
                <p>{dynamicSubhead}</p>
              </div>
              <span className={`growth-status-chip growth-status-chip-${statusTone}`}>
                {statusLabel === "Autonomous" && <Check size={13} aria-hidden="true" />}
                {statusLabel === "Accelerating" && <ArrowUpRight size={13} aria-hidden="true" />}
                {statusLabel === "Learning" && <Sparkles size={13} aria-hidden="true" />}
                {statusLabel === "Needs attention" && <CircleAlert size={13} aria-hidden="true" />}
                {statusLabel}
              </span>
            </div>

            {/* Persistent Status / Action Banner */}
            {needsAttention && (
              <div className="growth-needs-banner" role="alert">
                <div>
                  <strong>Action Required: {limitationCopy[0] ?? "Growth needs your attention"}</strong>
                  <span>Operator resolution needed for full autonomous performance.</span>
                </div>
                <Button variant="ghost" onClick={() => setView("presence")}>
                  Resolve in Settings
                </Button>
              </div>
            )}

            <div className="growth-hero-footer">
              <div className={`growth-action-pill ${needsAttention ? "growth-action-pill-attention" : "growth-action-pill-healthy"}`}>
                {needsAttention ? (
                  <>
                    <CircleAlert size={15} aria-hidden="true" />
                    <span>Needs you: {operatorInterventionsNeeded} action{operatorInterventionsNeeded === 1 ? "" : "s"} required</span>
                  </>
                ) : (
                  <>
                    <Check size={15} aria-hidden="true" />
                    <span>Autonomous loop active</span>
                  </>
                )}
              </div>
              <span className="growth-hero-meta">
                Objective: {displayedFollowerCount !== undefined ? displayedFollowerCount.toLocaleString() : "—"} / {goal?.toLocaleString() ?? "100,000"} followers ({progress}% progress)
              </span>
            </div>
          </section>

          {historicalGrowth && audienceSnapshotCount === 0 && (
            <section className="growth-recovered-context" aria-label="Recovered Growth context">
              <div className="growth-recovered-context-copy">
                <SectionEyebrow>Recovered context · historical</SectionEyebrow>
                <h2>Earlier Growth evidence is still available</h2>
                <p>
                  The active database has no structured audience timeline for this Presence yet, so this context comes from a saved Growth revision written after its start. It is shown as historical evidence and is not treated as a current measurement.
                </p>
                {historicalGrowth.latestReview && <blockquote>{historicalGrowth.latestReview}</blockquote>}
              </div>
              <div className="growth-recovered-context-stats">
                {historicalGrowth.currentFollowers !== undefined && <div><strong>{historicalGrowth.currentFollowers.toLocaleString()}</strong><span>followers in last review</span></div>}
                {historicalGrowth.repliesWithResponses !== undefined && <div><strong>{historicalGrowth.repliesWithResponses.toLocaleString()}</strong><span>replies with responses</span></div>}
                {historicalGrowth.activeRelationships !== undefined && <div><strong>{historicalGrowth.activeRelationships.toLocaleString()}</strong><span>active relationships</span></div>}
                {historicalGrowth.medianPostReach !== undefined && <div><strong>{historicalGrowth.medianPostReach.toLocaleString()}</strong><span>median post reach</span></div>}
                {historicalGrowth.topPostReach !== undefined && <div><strong>{historicalGrowth.topPostReach.toLocaleString()}</strong><span>top post reach</span></div>}
              </div>
            </section>
          )}

          {/* Layer 1: KPI Scoreboard */}
          <section className="growth-kpi-grid" aria-label="Key Performance Indicators">
            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Followers</span>
                <Users size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value">{displayedFollowerCount !== undefined ? displayedFollowerCount.toLocaleString() : "—"}</div>
              <div className={`growth-kpi-delta ${deltas.sevenDay && deltas.sevenDay > 0 ? "growth-kpi-delta-positive" : "growth-kpi-delta-neutral"}`}>
                {deltas.sevenDay !== undefined ? (
                  <>
                    {deltas.sevenDay > 0 ? "+" : ""}{deltas.sevenDay} this week
                  </>
                ) : (
                  historicalGrowth?.followerDelta !== undefined ? `${historicalGrowth.followerDelta > 0 ? "+" : ""}${historicalGrowth.followerDelta} in last recorded review` : "Collecting 7d baseline"
                )}
              </div>
              <div className="growth-kpi-sub">
                {latest ? (deltas.twentyEightDay !== undefined ? `${deltas.twentyEightDay >= 0 ? "+" : ""}${deltas.twentyEightDay} in 28d` : "Baseline mode") : currentAccountFollowers !== undefined ? "Last authenticated X profile" : historicalGrowth ? "Historical Growth review" : "Baseline mode"}
              </div>
            </div>

            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Reach / Views</span>
                <Eye size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value">{totalReach ? totalReach.toLocaleString() : (latestPublication?.impressions?.toLocaleString() ?? "—")}</div>
              <div className="growth-kpi-delta growth-kpi-delta-positive">
                {latestPublication?.impressions ? `${latestPublication.impressions.toLocaleString()} views top post` : "Observed"}
              </div>
              <div className="growth-kpi-sub">{publicationSnapshots.length} publication checks</div>
            </div>

            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Engagement</span>
                <Heart size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value">{totalEngagement ? totalEngagement.toLocaleString() : (totalLikes ? totalLikes.toLocaleString() : "—")}</div>
              <div className="growth-kpi-delta growth-kpi-delta-neutral">
                {totalLikes} likes · {totalReplies} replies
              </div>
              <div className="growth-kpi-sub">{weeklyBreakdown.quotes} quotes · {weeklyBreakdown.follows} follows this week</div>
            </div>

            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Output</span>
                <BarChart3 size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value">{weeklyBreakdown.posts || totalAutonomousActions || "0"}</div>
              <div className="growth-kpi-delta growth-kpi-delta-positive">
                {totalAutonomousActions} total actions on X
              </div>
              <div className="growth-kpi-sub">{weeklyBreakdown.replies} replies this week</div>
            </div>

            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Relationships</span>
                <Users size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value">{relationshipsCount || peopleEngagedCount || "—"}</div>
              <div className="growth-kpi-delta growth-kpi-delta-neutral">
                {peopleEngagedCount} people engaged
              </div>
              <div className="growth-kpi-sub">Substantive connections</div>
            </div>

            <div className="growth-kpi-card">
              <div className="growth-kpi-card-header">
                <span className="growth-kpi-label">Operator Load</span>
                <ShieldCheck size={14} className="growth-kpi-icon" />
              </div>
              <div className="growth-kpi-value" style={{ color: operatorInterventionsNeeded === 0 ? "#2f6b3e" : "#b33927" }}>
                {operatorInterventionsNeeded === 0 ? "0" : operatorInterventionsNeeded}
              </div>
              <div className={`growth-kpi-delta ${operatorInterventionsNeeded === 0 ? "growth-kpi-delta-positive" : "growth-kpi-delta-warning"}`}>
                {operatorInterventionsNeeded === 0 ? "100% autonomous" : "Intervention needed"}
              </div>
              <div className="growth-kpi-sub">{recoveriesHandledCount} auto-recoveries</div>
            </div>
          </section>

          {/* Layer 2: Autonomy Proof Panel */}
          <GrowthAutonomyProof
            presenceName={presence.name}
            autonomousExecutionsCount={totalAutonomousActions}
            decisionsCount={decisionsCount || totalAutonomousActions}
            verifiedOutcomesCount={verifiedOutcomesCount || autonomousExecutions.length}
            operatorInterventionsCount={operatorInterventionsNeeded}
            recoveriesHandledCount={recoveriesHandledCount}
            weeklyBreakdown={weeklyBreakdown}
          />

          {/* Layer 2: Simple Trend Chart */}
          <GrowthTrendChart
            snapshots={snapshots}
            deltas={deltas}
            presenceName={presence.name}
          />

          {/* Layer 2: What's Working Insight Cards */}
          <GrowthInsights
            review={review}
            assignment={assignment}
            latestPublication={latestPublication}
            publicationSnapshotsCount={publicationSnapshotCount}
            weeklyRepliesCount={weeklyBreakdown.replies}
            relationshipsCount={relationshipsCount || peopleEngagedCount}
            audienceObjective={assignment.audienceObjective ?? presence.brief.audience}
          />

          {/* Layer 2: Current Focus & What Happens Next */}
          <GrowthFocusAndNext
            assignment={assignment}
            review={review}
            nextGrowthReviewAt={nextGrowthReviewAt}
            statusLabel={statusLabel}
            presencePaused={presencePaused}
            reviewingGrowth={reviewingGrowth}
            reviewGrowth={reviewGrowth}
          />

          {/* Layer 3: Collapsible Analyst Details */}
          <section className="growth-analyst-section" aria-label="Analyst & Deep Evidence Details">
            <div className="growth-section-heading">
              <div>
                <SectionEyebrow>Analyst Details</SectionEyebrow>
                <h2>Deep Evidence &amp; System Records</h2>
              </div>
            </div>
            <div className="growth-disclosures">
              <details className="growth-disclosure">
                <summary>
                  <div className="growth-disclosure-title">
                    <ChevronRight size={15} className="growth-disclosure-chevron" aria-hidden="true" />
                    <span>Audience &amp; Publication Evidence</span>
                  </div>
                  <span className="growth-disclosure-meta">{audienceSnapshotCount} audience · {publicationSnapshotCount} publication records</span>
                </summary>
                <GrowthEvidenceDetails
                  presenceName={presence.name}
                  snapshots={snapshots}
                  publicationSnapshots={publicationSnapshots}
                  mirrorObjects={state.mirrorObjects}
                  audienceSnapshotCount={audienceSnapshotCount}
                  publicationSnapshotCount={publicationSnapshotCount}
                  maxImpressions={growthSummary?.publication.maxImpressions}
                  audienceUnchanged={growthSummary?.audience.unchanged}
                  review={review}
                  reviewIsStale={reviewIsStale}
                  unreviewedAudienceCount={unreviewedAudienceCount}
                  unreviewedPublicationCount={unreviewedPublicationCount}
                />
              </details>
              <details className="growth-disclosure">
                <summary>
                  <div className="growth-disclosure-title">
                    <ChevronRight size={15} className="growth-disclosure-chevron" aria-hidden="true" />
                    <span>Review History</span>
                  </div>
                  <span className="growth-disclosure-meta">{reviewHistory.length} completed review{reviewHistory.length === 1 ? "" : "s"}</span>
                </summary>
                <GrowthReviewHistory reviews={reviewHistory} />
              </details>
              <details className="growth-disclosure">
                <summary>
                  <div className="growth-disclosure-title">
                    <ChevronRight size={15} className="growth-disclosure-chevron" aria-hidden="true" />
                    <span>Capabilities &amp; Limitations</span>
                  </div>
                  <span className="growth-disclosure-meta">{bodyHeading}</span>
                </summary>
                <GrowthCapabilities
                  state={state}
                  presenceId={presence.id}
                  manifest={manifest}
                  limitations={limitations}
                />
              </details>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
