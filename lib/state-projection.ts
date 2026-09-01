import type { AssignmentPursuitWindow, OpenPresenceState } from "./types";
import { randomUUID } from "node:crypto";

/** Expire hard-deadline pursuit windows without cloning ordinary read state. */
export function expireElapsedPursuitWindows(source: OpenPresenceState) {
  const now = Date.now();
  const expiredIds = new Set((source.assignmentPursuitWindows ?? [])
    .filter((window: AssignmentPursuitWindow) => ["active", "paused"].includes(window.status) && new Date(window.deadlineAt).getTime() <= now)
    .map((window) => window.id));
  if (!expiredIds.size) return { state: source, changed: false };

  const next = structuredClone(source) as OpenPresenceState;
  const timestamp = new Date(now).toISOString();
  const continuations: AssignmentPursuitWindow[] = [];
  for (const window of next.assignmentPursuitWindows ?? []) {
    if (!expiredIds.has(window.id)) continue;
    const previousPauseReason = window.pauseReason;
    window.status = "expired";
    window.pauseReason = "The increased-effort window reached its deadline.";
    window.nextRunAt = undefined;
    window.updatedAt = timestamp;
    if (window.purpose === "promotion_burst" && window.requiredVerifiedPromotionalActions && window.sourcePostId) {
      const wasOperatorStopped = previousPauseReason?.toLowerCase().includes("operator") || previousPauseReason?.toLowerCase().includes("stopped");
      if (!wasOperatorStopped) {
        const continuationDeadline = new Date(now + 4 * 60 * 60_000).toISOString();
        continuations.push({
          ...window,
          id: `assignment-pursuit-${randomUUID()}`,
          startsAt: timestamp,
          deadlineAt: continuationDeadline,
          continuationOf: window.id,
          status: "active",
          pauseReason: undefined,
          consideredCandidateKeys: [],
          nextRunAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }
  if (continuations.length) next.assignmentPursuitWindows = [...continuations, ...(next.assignmentPursuitWindows ?? [])];
  return { state: next, changed: true };
}
