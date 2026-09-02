import { recordOperationalFailure } from "./incident-engine";
import { duplicatePublicOutcomeEvidence } from "./duplicate-public-outcome";
import { publicActionDeliveryScope, reservePublicActionDelivery, updatePublicActionDelivery } from "./db";
import { isTestRuntime } from "./test-runtime";
import type { Execution, OpenPresenceState } from "./types";

const cancellableStatuses = new Set<Execution["status"]>([
  "awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued",
]);

/**
 * Compare independently observed world outcomes, not generated text. If two
 * authored replies exist under one parent, the Agent must notice, quarantine
 * that target, and surface a channel-safety incident.
 */
export function detectDuplicatePublicOutcomes(source: OpenPresenceState, presenceId: string): OpenPresenceState {
  const state = source;
  for (const { targetRef: target, replies: objects } of duplicatePublicOutcomeEvidence(state, presenceId)) {
    const targetKey = `${target.type}:${target.id}`;
    const matchingExecutions = state.executions.filter((execution) => execution.presenceId === presenceId
      && execution.environment !== "sandbox"
      && ["reply", "x.reply"].includes(execution.affordance)
      && execution.target?.type === target.type
      && execution.target?.id === target.id);

    // Ensure even a workspace upgraded after the incident receives a durable
    // quarantine slot. Prefer the execution tied to an observed public object.
    const observedOwner = matchingExecutions.find((execution) => objects.some((object) => object.externalRef.id === execution.externalRef?.id)) ?? matchingExecutions[0];
    if (observedOwner) {
      const reservation = reservePublicActionDelivery(observedOwner);
      if (reservation.acquired) updatePublicActionDelivery(observedOwner.id, "verified", observedOwner.externalRef);
    }

    for (const execution of matchingExecutions) {
      if (!cancellableStatuses.has(execution.status)) continue;
      execution.status = "cancelled";
      execution.failure = { code: "DUPLICATE_PUBLIC_OUTCOME", message: `Multiple authored replies were observed for ${targetKey}. Further delivery to this target is quarantined.`, retryable: false };
      execution.reviewReason = "Duplicate public outcomes were observed for this target.";
      execution.updatedAt = new Date().toISOString();
    }

    const eventMarker = `Duplicate public replies detected:${targetKey}`;
    if (!state.events.some((event) => event.title === "Duplicate public replies detected" && event.detail.includes(targetKey))) {
      state.events.unshift({
        id: `evt_duplicate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "system",
        title: "Duplicate public replies detected",
        detail: `${objects.length} authored replies were observed for ${targetKey}. OpenPresence quarantined further delivery to this target. Review the public thread and account standing; it will not retry automatically.`,
        time: new Date().toISOString(),
        tone: "warning",
        presenceId,
        sourceObjectId: objects[0]?.id,
      });
      if (!isTestRuntime()) recordOperationalFailure({ dependency: "runtime", presenceId, error: `Duplicate public outcome: multiple verified public replies (${objects.length}) for ${targetKey}. ${eventMarker}` });
    }
  }
  return state;
}

/** Catch the invariant break at verification time, before the next Mirror poll. */
export function detectDuplicateVerifiedExecutionOutcomes(source: OpenPresenceState, executionId: string): OpenPresenceState {
  const state = source;
  const verified = state.executions.find((execution) => execution.id === executionId && execution.status === "succeeded" && execution.target);
  if (!verified?.target || verified.environment === "sandbox") return state;
  const sameTarget = state.executions.filter((execution) => execution.status === "succeeded"
    && execution.id !== verified.id
    && execution.externalRef
    && sameDeliveryScope(execution, verified)
    && (execution.externalRef.type !== verified.externalRef?.type || execution.externalRef.id !== verified.externalRef?.id));
  if (!sameTarget.length) return state;

  const targetKey = `${verified.target.type}:${verified.target.id}`;
  if (!state.events.some((event) => event.title === "Duplicate public replies detected" && event.detail.includes(targetKey))) {
    state.events.unshift({
      id: `evt_duplicate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "system",
      title: "Duplicate public replies detected",
      detail: `${sameTarget.length + 1} verified public actions exist for ${targetKey}. OpenPresence quarantined further delivery to this target immediately. Review the public thread and account standing; it will not retry automatically.`,
      time: new Date().toISOString(),
      tone: "warning",
      presenceId: verified.presenceId,
      executionId: verified.id,
    });
    if (!isTestRuntime()) recordOperationalFailure({ dependency: "runtime", presenceId: verified.presenceId, runId: verified.runId, invocationId: verified.invocationId, error: `Duplicate public outcome: multiple verified public replies (${sameTarget.length + 1}) for ${targetKey}.` });
  }
  for (const execution of state.executions) {
    if (execution.id === verified.id || !cancellableStatuses.has(execution.status) || !sameDeliveryScope(execution, verified)) continue;
    execution.status = "cancelled";
    execution.failure = { code: "DUPLICATE_PUBLIC_OUTCOME", message: `Multiple verified public actions exist for ${targetKey}. Further delivery is quarantined.`, retryable: false };
    execution.updatedAt = new Date().toISOString();
  }
  return state;
}

export function sameDeliveryScope(left: Execution, right: Execution) {
  return publicActionDeliveryScope(left) === publicActionDeliveryScope(right);
}
