import type { OpenPresenceState } from "./types";

export interface ChatRecoveryEntry {
  id: string;
  timestamp: string;
  summary: string;
  title: string;
  needsOperator: boolean;
}

/** Render durable evidence in place; resolution never deletes the original failure. */
export function chatRecoveryHistory(state: OpenPresenceState, presenceId: string): ChatRecoveryEntry[] {
  const incidents = (state.recoveryIncidents ?? []).filter((item) => item.presenceId === presenceId);
  const visibleIncidents = incidents.filter((item) => item.operatorActionRequired || !(
    /Stage ["']browser\.read["']/i.test(item.safeSummary)
    || item.affectedRunIds.some((id) => (state.operationalRuns ?? []).some((run) => run.id === id && run.kind === "observation" && run.metadata?.browserRead === true))
  ));
  const entries: ChatRecoveryEntry[] = visibleIncidents.map((item) => ({
    id: `incident:${item.id}`, timestamp: item.openedAt, summary: item.safeSummary,
    title: item.state === "resolved" ? "Recovered" : item.operatorActionRequired ? "A task needs your attention" : "Recovering automatically",
    needsOperator: item.state !== "resolved" && item.operatorActionRequired,
  }));
  for (const run of state.assignmentRuns ?? []) {
    if (run.presenceId !== presenceId || !run.lastError || incidents.some((item) => item.affectedRunIds.includes(run.id))) continue;
    const assignment = state.assignments.find((item) => item.id === run.assignmentId);
    const latestRun = !(state.assignmentRuns ?? []).some((other) => other.assignmentId === run.assignmentId && other.createdAt > run.createdAt);
    const needsOperator = latestRun && Boolean(assignment && ["blocked", "needs_operator"].includes(assignment.status));
    entries.push({ id: `recovery:${run.id}`, timestamp: run.completedAt ?? run.updatedAt, summary: run.lastError,
      title: needsOperator ? "A task needs your attention" : run.status === "deferred" && assignment?.status === "active" ? "I’ll try again automatically" : "Earlier attempt did not finish", needsOperator });
  }
  // Routine connector reads belong in Activity and the active turn's progress,
  // not persistent supervisory interruptions. Actionable connection incidents
  // above retain the user's recovery request and historical failure evidence.
  for (const event of state.events ?? []) {
    if (event.presenceId !== presenceId || !["Browser fallback learned", "Browser route learned"].includes(event.title)) continue;
    entries.push({ id: event.id, timestamp: event.time, title: "Browser route learned", summary: event.detail, needsOperator: false });
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
