import { describe, expect, it } from "vitest";
import { deriveHistoricalGrowthContext } from "@/lib/growth-history";
import { presenceGrowthBoundary } from "@/lib/growth-scope";
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

  it("uses the recorded Presence creation time before connection artifacts", () => {
    const state = {
      presence: { id: "presence-1", createdAt: "2026-08-20T00:00:00.000Z" },
      sandboxEnvironments: [{ presenceId: "presence-1", createdAt: "2026-08-01T00:00:00.000Z" }],
      nativeConnections: [{ presenceId: "presence-1", createdAt: "2026-08-22T00:00:00.000Z" }],
    } as unknown as OpenPresenceState;

    expect(presenceGrowthBoundary(state, "presence-1")).toEqual({ startAt: "2026-08-20T00:00:00.000Z", source: "recorded" });
  });

  it("infers a conservative legacy boundary from a Presence-owned artifact", () => {
    const state = {
      presence: { id: "presence-1" },
      events: [{ presenceId: "presence-1", title: "LinkedIn Presence added", time: "2026-08-02T00:00:00.000Z" }],
      sandboxEnvironments: [{ presenceId: "presence-1", createdAt: "2026-08-01T00:00:00.000Z" }],
      nativeConnections: [{ presenceId: "presence-1", createdAt: "2026-08-22T00:00:00.000Z" }],
    } as unknown as OpenPresenceState;

    expect(presenceGrowthBoundary(state, "presence-1")).toEqual({ startAt: "2026-08-01T00:00:00.000Z", source: "sandbox-environment" });
  });

  it("does not recover a Growth revision written before the selected Presence existed", () => {
    const state = {
      presence: { id: "presence-1", createdAt: "2026-08-20T00:00:00.000Z" },
      changeSets: [
        {
          id: "before-presence",
          agentId: "agent-1",
          summary: "Older account Growth revision",
          createdAt: "2026-08-19T00:00:00.000Z",
          operations: [{ path: "agentFiles.GROWTH", action: "update", after: "## Current progress\n\n999 followers." }],
        },
        {
          id: "after-presence",
          agentId: "agent-1",
          summary: "Presence Growth revision",
          createdAt: "2026-08-21T00:00:00.000Z",
          operations: [{ path: "agentFiles.GROWTH", action: "update", after: "## Current progress\n\n12 followers." }],
        },
        {
          id: "other-presence",
          agentId: "agent-1",
          presenceId: "presence-2",
          summary: "Another Presence Growth revision",
          createdAt: "2026-08-22T00:00:00.000Z",
          operations: [{ path: "agentFiles.GROWTH", action: "update", after: "## Current progress\n\n999 followers." }],
        },
      ],
    } as unknown as OpenPresenceState;

    expect(deriveHistoricalGrowthContext(state, "presence-1")).toMatchObject({ sourceChangeSetId: "after-presence", currentFollowers: 12 });
  });
});
