import { describe, expect, it } from "vitest";
import { deriveHistoricalGrowthContext } from "@/lib/growth-history";
import type { OpenPresenceState } from "@/lib/types";

describe("historical Growth context", () => {
  it("recovers prior review metrics without treating them as live snapshots", () => {
    const state = {
      changeSets: [{
        id: "changeset-growth",
        agentId: "agent-1",
        summary: "Update GROWTH.md from evidence review",
        createdAt: "2026-08-21T16:36:52.822Z",
        operations: [{
          path: "agentFiles.GROWTH",
          action: "update",
          after: "## Current progress\n\n3 followers.\n\n## What appears to be working\n\n89 replies received responses.\n\n15 active relationships.\n\n## Latest review\n\nCurrent followers remained at 3, follower delta was 0, median post reach of 8, and top post reach of 79.\n\n_Next weekly review: 8/28/2026._",
        }],
      }],
    } as unknown as OpenPresenceState;

    expect(deriveHistoricalGrowthContext(state)).toMatchObject({
      sourceChangeSetId: "changeset-growth",
      currentFollowers: 3,
      followerDelta: 0,
      repliesWithResponses: 89,
      activeRelationships: 15,
      medianPostReach: 8,
      topPostReach: 79,
    });
  });
});
