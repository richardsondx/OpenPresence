import type { Assignment, OpenPresenceState } from "./types";

/**
 * Adopt the server's bounded Activity read model instead of merging it into
 * a previously loaded full workspace. This keeps route changes from
 * retaining private Agent history in the live Activity tree.
 */
export function mergeActivityProjection(previous: OpenPresenceState, projection: OpenPresenceState): OpenPresenceState {
  void previous;
  return { ...projection } as OpenPresenceState;
}

/**
 * Keep Activity's Assignment cards operationally useful without shipping the
 * full Schedule readiness contract on every heartbeat. Schedule requests
 * still return the canonical Assignment with its complete history.
 */
export function compactActivityAssignment(assignment: Assignment, includeLatestResearch: boolean): Assignment {
  const compact = { ...assignment };
  delete compact.preflight;
  compact.planHistory = [];
  compact.attemptHistory = [];
  compact.storyResearch = includeLatestResearch
    ? assignment.storyResearch?.slice(-1).map((research) => ({
        ...research,
        // Activity only renders how many sources were supplied. Retain that
        // count while omitting titles, URLs, publishers, and excerpts.
        sources: research.sources.map(() => ({})),
      }))
    : [];
  return compact;
}
