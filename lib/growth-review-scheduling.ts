import { deriveGrowthEvidenceSnapshot } from "./runtime";
import type { Assignment, GrowthReviewKind, OpenPresenceState } from "./types";

export type AutonomousGrowthReviewNeed = {
  assignment: Assignment;
  kind: GrowthReviewKind;
  reason: string;
  evidenceWatermark: number;
};

/** Keep Agenda eligibility and headless execution on the same decision. */
export function autonomousGrowthReviewNeed(source: OpenPresenceState, presenceId: string, now = new Date(), options?: { sandboxSessionId?: string }): AutonomousGrowthReviewNeed | undefined {
  const presence = source.presences.find((item) => item.id === presenceId) ?? source.presence;
  const activeSandboxSessions = source.playgroundSessions.filter(session => session.presenceId === presenceId && session.status === "active");
  const assignment = source.assignments.find((item) => item.presenceId === presenceId
    && (options?.sandboxSessionId
      ? item.environment === "sandbox" && (item.sessionId === options.sandboxSessionId || !item.sessionId && activeSandboxSessions.length === 1 && activeSandboxSessions[0].id === options.sandboxSessionId)
      : item.environment !== "sandbox")
    && (item.successEvidence?.kind === "metric_threshold" || item.origin === "publishing_initiative")
    && item.plan
    && !["cancelled", "completed"].includes(item.status)
    && ["active", "working", "awaiting_execution", "accepted", "planning"].includes(item.status));
  if (!presence || !assignment?.plan) return undefined;

  const nowMs = now.getTime();
  const strategicDue = Boolean(assignment.plan.nextStrategicReviewAt && Date.parse(assignment.plan.nextStrategicReviewAt) <= nowMs);
  const weeklyDue = Boolean(assignment.plan.nextWeeklyReviewAt && Date.parse(assignment.plan.nextWeeklyReviewAt) <= nowMs);
  const snapshot = deriveGrowthEvidenceSnapshot(source, presenceId, options?.sandboxSessionId ? { sandboxSessionId: options.sandboxSessionId } : undefined);
  const lastReview = (source.growthReviews ?? [])
    .filter((review) => review.presenceId === presenceId && review.assignmentId === assignment.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  // The persisted watermark is Presence-wide and may have been produced by a
  // previous Growth responsibility. A newly activated responsibility still
  // needs an initial review of evidence observed after it began, even when
  // that old watermark is numerically ahead of the current seven-day window.
  const assignmentCreatedAt = Date.parse(assignment.createdAt);
  const evidenceSinceAssignment = [
    ...source.audienceSnapshots.filter((item) => item.presenceId === presenceId && (options?.sandboxSessionId ? item.environment === "sandbox" && item.sessionId === options.sandboxSessionId : item.environment !== "sandbox")).map((item) => item.observedAt),
    ...source.publicationMetricSnapshots.filter((item) => {
      if (item.presenceId !== presenceId) return false;
      const publication = source.mirrorObjects.find((mirror) => mirror.id === item.mirrorObjectId);
      return options?.sandboxSessionId ? publication?.environment === "sandbox" && publication.sessionId === options.sandboxSessionId : publication?.environment !== "sandbox";
    }).map((item) => item.observedAt),
    ...source.mirrorObjects.filter((item) => item.presenceId === presenceId && (options?.sandboxSessionId ? item.environment === "sandbox" && item.sessionId === options.sandboxSessionId : item.environment !== "sandbox")).map((item) => item.occurredAt ?? item.observedAt),
  ].some((observedAt) => Number.isFinite(assignmentCreatedAt) && Date.parse(observedAt) >= assignmentCreatedAt);
  const hasNewEvidence = snapshot.watermark > (presence.lastTriagedEvidenceWatermark ?? 0)
    || (!lastReview && evidenceSinceAssignment);
  const reviewOldEnough = !lastReview || nowMs - Date.parse(lastReview.createdAt) >= 12 * 60 * 60_000;

  if (strategicDue) return { assignment, kind: "strategic", reason: "The strategic Growth review checkpoint is due.", evidenceWatermark: snapshot.watermark };
  if (weeklyDue) return { assignment, kind: "weekly", reason: "The weekly Growth review checkpoint is due.", evidenceWatermark: snapshot.watermark };
  if (hasNewEvidence && reviewOldEnough) return { assignment, kind: "event_driven", reason: "Fresh verified Growth evidence has not yet been reviewed.", evidenceWatermark: snapshot.watermark };
  return undefined;
}
