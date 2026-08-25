import type { OpenPresenceState } from "./types";

export interface HistoricalGrowthContext {
  sourceChangeSetId: string;
  sourceAt: string;
  currentFollowers?: number;
  followerDelta?: number;
  repliesWithResponses?: number;
  activeRelationships?: number;
  medianPostReach?: number;
  topPostReach?: number;
  latestReview?: string;
}

function numberAfter(pattern: RegExp, text: string) {
  const match = text.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Recover historical Growth context without presenting it as a current
 * measurement. Older revisions are durable provenance when the structured
 * audience snapshot collection is unavailable or was not migrated.
 */
export function deriveHistoricalGrowthContext(state: OpenPresenceState): HistoricalGrowthContext | undefined {
  const revision = [...(state.changeSets ?? [])]
    .filter((changeSet) => changeSet.operations.some((operation) => operation.path === "agentFiles.GROWTH" && typeof operation.after === "string"))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const content = revision?.operations.find((operation) => operation.path === "agentFiles.GROWTH" && typeof operation.after === "string")?.after;
  if (!revision || typeof content !== "string") return undefined;

  const latestReview = content.match(/## Latest review\s+([\s\S]*?)(?:\n\n_Next |$)/i)?.[1]?.trim();
  return {
    sourceChangeSetId: revision.id,
    sourceAt: revision.createdAt,
    currentFollowers: numberAfter(/current(?:Followers| followers?)\s*(?:of|:|remained at)\s*(\d+)/i, content)
      ?? numberAfter(/## Current progress\s+[^\n]*?(\d[\d,]*)\s+followers?/i, content),
    followerDelta: numberAfter(/follower delta\s*(?:was|of|=)\s*(-?\d[\d,]*)/i, content),
    repliesWithResponses: numberAfter(/(\d[\d,]*)\s+replies received responses/i, content),
    activeRelationships: numberAfter(/(\d[\d,]*)\s+active relationships/i, content),
    medianPostReach: numberAfter(/median post reach of\s*(\d[\d,]*)/i, content),
    topPostReach: numberAfter(/top post reach of\s*(\d[\d,]*)/i, content),
    latestReview,
  };
}
