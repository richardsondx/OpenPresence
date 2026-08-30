import { describe, expect, it } from "vitest";
import { compactActivityAssignment } from "../lib/activity-projection";
import type { Assignment } from "../lib/types";

describe("bounded Activity Assignment projection", () => {
  const assignment = (): Assignment => ({
    id: "assignment-1",
    agentId: "agent-1",
    presenceId: "presence-1",
    channelId: "x",
    environment: "live",
    instruction: "Find one useful conversation.",
    deliverable: { type: "meaningful_engagement" },
    executionPolicy: { usePresenceEnvelope: true },
    status: "working",
    progress: { required: 1, verified: 0 },
    rejectedCandidates: 0,
    systemFailures: 0,
    preflight: {
      status: "ready",
      delegationPolicy: "agent_decides",
      semanticSummary: "A complete readiness contract.",
      contract: { deliverable: "one conversation", successEvidence: "a verified outcome", agentDecides: ["whether to act"], assumptions: [] },
      checks: [{ label: "Channel", status: "pass", detail: "Available." }],
      issues: [],
      reviewedAt: new Date().toISOString(),
      reviewedRevision: 1,
    },
    storyResearch: [
      { query: "first", resultCount: 2, sources: [{ title: "old", url: "https://example.com/old", excerpt: "large evidence" }], at: "2026-08-29T00:00:00.000Z" },
      { query: "latest", resultCount: 8, sources: [{ title: "one" }, { title: "two" }], at: "2026-08-30T00:00:00.000Z" },
    ],
    planHistory: [{ summary: "old plan" } as never],
    attemptHistory: [{ id: "attempt", attempt: 1, phase: "candidate_review", outcome: "action_no_op", message: "old", at: "2026-08-29T00:00:00.000Z" }],
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  });

  it("keeps only the latest research count and removes schedule-only detail", () => {
    const original = assignment();
    const compact = compactActivityAssignment(original, true);

    expect(compact).not.toBe(original);
    expect(compact.preflight).toBeUndefined();
    expect(compact.planHistory).toEqual([]);
    expect(compact.attemptHistory).toEqual([]);
    expect(compact.storyResearch).toHaveLength(1);
    expect(compact.storyResearch?.[0]).toMatchObject({ query: "latest", resultCount: 8 });
    expect(compact.storyResearch?.[0]?.sources).toHaveLength(2);
    expect(compact.storyResearch?.[0]?.sources[0]).toEqual({});
    expect(original.preflight).toBeDefined();
    expect(original.storyResearch).toHaveLength(2);
  });

  it("omits research history for non-active cards", () => {
    expect(compactActivityAssignment(assignment(), false).storyResearch).toEqual([]);
  });
});
