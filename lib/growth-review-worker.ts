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
export async function runModelGrowthReview(source: OpenPresenceState, assignment: Assignment, kind: GrowthReviewKind, options?: { reviewAt?: Date; sandboxSessionId?: string }) {
  const presence = source.presences.find((item) => item.id === assignment.presenceId);
  if (!presence) return source;
  const sandboxSessionId = options?.sandboxSessionId;
  if (assignment.environment === "sandbox" && !sandboxSessionId) throw new Error("A rehearsal Growth review requires its exact Sandbox session.");
  const activeSessions = source.playgroundSessions.filter(session => session.presenceId === presence.id && session.status === "active");
  if (sandboxSessionId && (assignment.environment !== "sandbox" || assignment.sessionId && assignment.sessionId !== sandboxSessionId
    || !activeSessions.some(session => session.id === sandboxSessionId)
    || !assignment.sessionId && activeSessions.length !== 1)) {
    throw new Error("This Growth responsibility does not belong to the requested active Sandbox session.");
  }
  // Legacy responsibilities created before their first rehearsal starts can
  // acquire that single session. Multiple active forks require explicit ownership.
  if (sandboxSessionId && !assignment.sessionId) {
    assignment.sessionId = sandboxSessionId;
    const persisted = source.assignments.find(item => item.id === assignment.id);
    if (persisted) persisted.sessionId = sandboxSessionId;
  }

  ensureGrowthEvidenceRecords(source, presence.id);
  const snapshot = deriveGrowthEvidenceSnapshot(source, presence.id, options?.sandboxSessionId ? { sandboxSessionId: options.sandboxSessionId } : undefined);
  const evidence = {
    strategyEvidence: source.growthEvidenceRecords?.filter((item) => item.presenceId === presence.id && item.agentId === assignment.agentId
      && (sandboxSessionId ? item.sandboxSessionId === sandboxSessionId : !item.sandboxSessionId)).slice(0, 80),
    hypotheses: source.growthHypotheses?.filter((item) => item.originatingPresenceId === presence.id && item.agentId === assignment.agentId
      && (sandboxSessionId ? item.sandboxSessionId === sandboxSessionId : !item.sandboxSessionId)),
    evidenceSnapshot: snapshot,
    capabilities: derivePresenceCapabilityManifest(source, presence.id).items,
  };

  try {
    const decision = await generateGrowthReview(source, assignment, kind, evidence);
    return applyOperation(source, { type: "reviewGrowth", presenceId: presence.id, assignmentId: assignment.id, kind, modelDecision: decision, ...(options?.reviewAt ? { reviewAt: options.reviewAt.toISOString() } : {}), ...(options?.sandboxSessionId ? { sandboxSessionId: options.sandboxSessionId } : {}) });
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
