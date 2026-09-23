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
  const entries: ChatRecoveryEntry[] = incidents.map((item) => ({
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
  for (const run of state.operationalRuns ?? []) {
    if (run.presenceId !== presenceId || run.stage !== "browser.read") continue;
    entries.push({ id: run.id, timestamp: run.createdAt, title: "Trying the browser", needsOperator: false,
      summary: run.state === "succeeded" ? "I used the signed-in browser to read X. No public action was taken." : run.state === "failed" ? run.lastErrorCode ?? "The browser read did not finish." : "The X API isn’t available for this read, so I’m checking through the signed-in browser." });
  }
  for (const event of state.events ?? []) {
    if (event.presenceId !== presenceId || event.title !== "Browser fallback learned") continue;
    entries.push({ id: event.id, timestamp: event.time, title: "Trying the browser", summary: event.detail, needsOperator: false });
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
