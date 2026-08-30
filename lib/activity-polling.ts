import type { OpenPresenceState } from "./types";

const activeRunStates = new Set(["queued", "running", "recovering", "delivery_uncertain", "reconciling"]);
const activeRunKinds = new Set(["attention", "observation", "discovery", "operator_chat"]);
const activeNudgeStatuses = new Set(["queued", "working"]);

/**
 * Activity is an observation surface, not a provider execution loop. Poll
 * quickly while durable work is active so a completed mention becomes
 * visible promptly, then back off when the Presence is resting to bound
 * database, serialization, and browser work.
 */
export function activityRefreshIntervalMs(state: Pick<OpenPresenceState, "activePresenceId" | "presence" | "operationalRuns" | "operatorNudges">) {
  const presenceId = state.presence?.id ?? state.activePresenceId;
  const activeWork = Boolean(presenceId) && (state.operationalRuns ?? []).some((run) =>
    run.presenceId === presenceId && activeRunKinds.has(run.kind) && activeRunStates.has(run.state),
  );
  const activeNudge = Boolean(presenceId) && (state.operatorNudges ?? []).some((nudge) =>
    nudge.presenceId === presenceId && activeNudgeStatuses.has(nudge.status),
  );
  return activeWork || activeNudge ? 2_000 : 10_000;
}
