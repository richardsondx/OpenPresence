import type { Assignment, OpenPresenceState } from "./types";

/** Private evidence projection. No credentials, other Presences, or public tools. */
export function assignmentInspectionEvidence(state: OpenPresenceState, assignment: Assignment) {
  const presenceId = assignment.presenceId;
  return {
    observedAt: new Date().toISOString(),
    scope: "Persisted OpenPresence observations only; this is not a fresh X or billing probe.",
    assignments: state.assignments.filter((item) => item.presenceId === presenceId && item.id !== assignment.id)
      .map(({ id, status, progress, lastOutcome }) => ({ id, status, progress, lastOutcome })),
    verifiedExecutions: state.executions.filter((item) => item.presenceId === presenceId && item.status === "succeeded"
      && state.outcomes.some((outcome) => outcome.executionId === item.id && outcome.status === "succeeded"))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
      .map(({ id, affordance, updatedAt }) => ({ id, affordance, updatedAt })),
    failures: state.executions.filter((item) => item.presenceId === presenceId && item.failure)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
      .map(({ id, status, failure, updatedAt }) => ({ id, status, message: failure?.message, updatedAt })),
    incidents: (state.recoveryIncidents ?? []).filter((item) => item.presenceId === presenceId && item.state !== "resolved")
      .map(({ rootCauseKey, state, safeSummary, lastObservedAt }) => ({ rootCauseKey, state, safeSummary, lastObservedAt })),
  };
}

export function persistAssignmentReport(state: OpenPresenceState, assignment: Assignment, report: string) {
  const at = new Date().toISOString();
  assignment.status = "completed";
  assignment.completionReport = report;
  assignment.progress = { required: 1, verified: 1 };
  assignment.work = { ...(assignment.work ?? { attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "completed", blockedReason: undefined };
  assignment.lastOutcome = { class: "assignment_completed", message: "The private report was saved. No public action was taken.", at };
  assignment.updatedAt = at;
  return state;
}
