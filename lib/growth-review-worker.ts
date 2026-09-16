import { generateGrowthReview } from "./ai";
import {
  applyOperation,
  deriveGrowthEvidenceSnapshot,
  derivePresenceCapabilityManifest,
  openAgentRequest,
  recordRuntimeEvent,
} from "./runtime";
import { ensureGrowthEvidenceRecords } from "./social-strategy";
import type { Assignment, GrowthReviewKind, OpenPresenceState } from "./types";

/** Run the model-backed Growth role from a headless worker or an API action. */
export async function runModelGrowthReview(source: OpenPresenceState, assignment: Assignment, kind: GrowthReviewKind, options?: { reviewAt?: Date }) {
  const presence = source.presences.find((item) => item.id === assignment.presenceId) ?? source.presence;
  if (!presence) return source;

  ensureGrowthEvidenceRecords(source, presence.id);
  const snapshot = deriveGrowthEvidenceSnapshot(source, presence.id);
  const evidence = {
    strategyEvidence: source.growthEvidenceRecords?.filter((item) => item.presenceId === presence.id).slice(0, 80),
    hypotheses: source.growthHypotheses?.filter((item) => item.originatingPresenceId === presence.id),
    evidenceSnapshot: snapshot,
    capabilities: derivePresenceCapabilityManifest(source, presence.id).items,
  };

  try {
    const decision = await generateGrowthReview(source, assignment, kind, evidence);
    return applyOperation(source, { type: "reviewGrowth", presenceId: presence.id, assignmentId: assignment.id, kind, modelDecision: decision, ...(options?.reviewAt ? { reviewAt: options.reviewAt.toISOString() } : {}) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The selected model could not complete the Growth Review.";
    openAgentRequest(source, {
      presenceId: presence.id,
      assignmentId: assignment.id,
      kind: "growth_review",
      importance: "blocking",
      title: "Growth Review needs a model runtime",
      need: "Connect the selected model so the Agent can evaluate evidence and revise growth tactics autonomously.",
      why: detail,
      currentWorkaround: "The prior plan remains active; no adaptive review is claimed until a model-backed review succeeds.",
      dedupeKey: `${presence.id}:${assignment.id}:growth-review`,
    });
    const currentAssignment = source.assignments.find((item) => item.id === assignment.id);
    if (currentAssignment?.plan) {
      const retryAt = new Date(Date.now() + 60 * 60_000).toISOString();
      currentAssignment.plan = { ...currentAssignment.plan, ...(kind === "strategic" ? { nextStrategicReviewAt: retryAt } : { nextWeeklyReviewAt: retryAt }), updatedAt: new Date().toISOString() };
    }
    return recordRuntimeEvent(source, presence.id, "Growth Review unavailable", detail, "warning", { sourceObjectId: assignment.id });
  }
}
