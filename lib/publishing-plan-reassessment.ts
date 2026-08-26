import { generatePublishingPlan } from "./ai";
import { recordPublishingPlanFailure, recordRuntimeEvent, replacePublishingPlan } from "./runtime";
import type { OpenPresenceState } from "./types";

export async function reassessPublishingPlan(
  source: OpenPresenceState,
  presenceId: string,
  guard?: { expectedPlanId?: string; expectedRevision?: number },
) {
  const target = source.presences.find((presence) => presence.id === presenceId) ?? source.presence;
  if (!target || target.publishingInitiative.mode === "off") return source;
  const environment = target.environment === "sandbox" ? "sandbox" : "live";
  const prior = source.publishingPlans.find((item) => item.presenceId === target.id && item.environment === environment && item.status === "active");
  if (guard?.expectedPlanId !== undefined || guard?.expectedRevision !== undefined) {
    if (!prior || (guard.expectedPlanId && prior.id !== guard.expectedPlanId) || (guard.expectedRevision !== undefined && prior.revision !== guard.expectedRevision)) return source;
  }

  try {
    const draft = await generatePublishingPlan(source);
    let next = replacePublishingPlan(source, {
      presenceId: target.id,
      draft,
      modelProvider: source.modelProfiles.find((profile) => profile.agentId === source.agent?.id)?.provider,
      modelId: source.modelProfiles.find((profile) => profile.agentId === source.agent?.id)?.model,
      expectedPlanId: guard?.expectedPlanId,
      expectedRevision: guard?.expectedRevision,
    });
    const updatedPlan = next.publishingPlans.find((item) => item.presenceId === target.id && item.environment === environment && item.status === "active");
    const nextTimeLabel = updatedPlan?.nextReassessmentAt ? new Date(updatedPlan.nextReassessmentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "later";
    const windowCount = updatedPlan?.windows?.length ?? 0;
    const summary = windowCount === 0
      ? `${target.name} completed a plan reassessment · resting with 0 publication windows · next review at ${nextTimeLabel}.`
      : `${target.name} updated its publishing plan (Revision ${updatedPlan?.revision}) · ${windowCount} consideration window${windowCount === 1 ? "" : "s"} · next review at ${nextTimeLabel}.`;
    next = recordRuntimeEvent(next, target.id, "Plan reassessed", summary, "positive");
    return next;
  } catch (error) {
    return recordPublishingPlanFailure(source, target.id, error instanceof Error ? error.message : "The Publishing Planner was unavailable.");
  }
}
