import type { AssignmentPursuitWindow, OpenPresenceState } from "./types";

/** Expire hard-deadline pursuit windows without cloning ordinary read state. */
export function expireElapsedPursuitWindows(source: OpenPresenceState) {
  const now = Date.now();
  const expiredIds = new Set((source.assignmentPursuitWindows ?? [])
    .filter((window: AssignmentPursuitWindow) => ["active", "paused"].includes(window.status) && new Date(window.deadlineAt).getTime() <= now)
    .map((window) => window.id));
  if (!expiredIds.size) return { state: source, changed: false };

  const next = structuredClone(source) as OpenPresenceState;
  const timestamp = new Date(now).toISOString();
  for (const window of next.assignmentPursuitWindows ?? []) {
    if (!expiredIds.has(window.id)) continue;
    window.status = "expired";
    window.pauseReason = "The increased-effort window reached its deadline.";
    window.nextRunAt = undefined;
    window.updatedAt = timestamp;
  }
  return { state: next, changed: true };
}
