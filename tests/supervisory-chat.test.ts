import { describe, expect, it } from "vitest";
import { buildSupervisoryChatPrompt, supervisoryChatGuidance, formatSupervisoryChatState, projectSupervisoryChatState, operatorProgressRecapReply } from "../lib/supervisory-chat";
import { operatorChatHarnessInstructions, parseOperatorChatStep } from "../lib/operator-chat-harness";
import { createAgent } from "../lib/runtime";

describe("supervisory Chat contract", () => {
  it("keeps failed attempts, recovery, and verified progress available for a follow-up", () => {
    const state = createAgent({ name: "Genny", description: "Useful judgment", mode: "agent", handle: "@genny", accent: "#777777" });
    const presenceId = state.presence!.id;
    state.assignments = [
      { id: "continuing", presenceId, title: "Study relevant founders", status: "working", progress: { verified: 1, required: 3 }, updatedAt: "2026-10-01T12:00:00Z" },
      { id: "finished", presenceId, title: "Review launch post", status: "completed", progress: { verified: 1, required: 1 }, updatedAt: "2026-10-01T11:00:00Z", lastOutcome: { status: "completed", message: "Reviewed the launch post." } },
      { id: "private-other", presenceId: "other", title: "Never expose", status: "working", progress: { verified: 0 }, updatedAt: "2026-10-01T13:00:00Z" },
    ] as never;
    // Storage order is deliberately different from causal recency.
    state.assignmentRuns = [
      { id: "first-attempt", assignmentId: "continuing", presenceId, status: "failed", updatedAt: "2026-10-01T10:00:00Z" },
      { id: "retry", assignmentId: "continuing", presenceId, status: "researching", recoveryOf: "first-attempt", currentStage: "researching", lastProgressAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", leaseOwner: "private-worker" },
      { id: "wrong-scope", assignmentId: "continuing", presenceId: "other", status: "published", updatedAt: "2026-10-01T13:00:00Z" },
    ] as never;
    const projected = projectSupervisoryChatState(state, presenceId);
    expect(projected.runtime.recentWork.map((item) => item.assignmentId)).toEqual(["continuing", "finished"]);
    expect(projected.runtime.recentWork[0]).toMatchObject({ status: "working", verified: 1, required: 3, latestRun: { id: "retry", status: "researching", recoveryOf: "first-attempt" } });
    expect(projected.runtime.recentWork[1].lastOutcome?.message).toBe("Reviewed the launch post.");
    expect(JSON.stringify(projected)).not.toMatch(/Never expose|wrong-scope|private-worker/);
  });
  it("grounds a weekly recap in scoped verified outcomes rather than transcript promises", () => {
    const state = createAgent({ name: "Recap", description: "Useful judgment", mode: "agent", handle: "@recap", accent: "#777777" });
    const presenceId = state.presence!.id;
    state.executions = [
      { id: "live", presenceId, status: "succeeded", environment: "live" },
      { id: "rehearsal", presenceId, status: "succeeded", environment: "sandbox" },
      { id: "pending", presenceId, status: "verification-pending", environment: "live" },
      { id: "other", presenceId: "other-presence", status: "succeeded", environment: "live" },
      { id: "old", presenceId, status: "succeeded", environment: "live" },
    ] as never;
    state.outcomes = [
      { id: "live-outcome", executionId: "live", presenceId, status: "succeeded", environment: "live", observedAt: "2026-10-01T09:00:00Z" },
      { id: "duplicate", executionId: "live", presenceId, status: "succeeded", environment: "live", observedAt: "2026-10-01T09:00:00Z" },
      { id: "rehearsal-outcome", executionId: "rehearsal", presenceId, status: "succeeded", sessionId: "recap-session", observedAt: "2026-10-07T09:00:00Z" },
      { id: "pending-outcome", executionId: "pending", presenceId, status: "succeeded", environment: "live", observedAt: "2026-10-01T09:00:00Z" },
      { id: "other-outcome", executionId: "other", presenceId: "other-presence", status: "succeeded", environment: "live", observedAt: "2026-10-01T09:00:00Z" },
      { id: "old-outcome", executionId: "old", presenceId, status: "succeeded", environment: "live", observedAt: "2026-09-01T09:00:00Z" },
    ] as never;
    state.playgroundSessions = [{ id: "recap-session", presenceId, status: "active", virtualNow: "2026-10-08T09:00:00Z" }] as never;
    const recap = operatorProgressRecapReply(state, presenceId, "How’d we do this week?", new Date("2026-10-01T10:00:00Z"));
    expect(recap).toContain("1 verified live outcome and 1 verified rehearsal outcome");
    expect(recap).toContain("can’t claim they improved growth");
    expect(operatorProgressRecapReply(state, presenceId, "Draft a recap to publish this week")).toBeUndefined();
  });
  it("projects Growth, Calendar, and runtime facts for only the selected Presence", () => {
    const state = createAgent({ name: "Genny", description: "Useful social judgment", mode: "agent", handle: "@genny", accent: "#777777" });
    const presenceId = state.presence!.id;
    const otherPresenceId = "presence-other";
    state.calendar = [
      { id: "calendar-selected", label: "Review launch signal", instruction: "Review the launch signal", day: "Monday", time: "09:00", objective: "Find a useful signal", presence: presenceId, mode: "auto", enabled: true, executionWindow: "day" },
      { id: "calendar-other", label: "Other Presence", instruction: "Do not include", day: "Monday", time: "10:00", objective: "Other objective", presence: otherPresenceId, mode: "auto", enabled: true, executionWindow: "day" },
    ];
    state.growthProfile = {
      presenceId,
      audience: "Thoughtful founders",
      primaryTerritory: ["Agent systems"],
      adjacentTerritory: [],
      qualifiedOutcome: "Useful return conversations",
      relationshipFocus: [],
      activeApproach: ["Proof-led notes"],
      reusableFormats: [],
      mediaApproach: "Text first",
      exclusions: [],
      evidenceRefs: [],
      confidence: "low",
      updatedAt: "2026-09-16T12:00:00.000Z",
    };
    state.publishingPlans = [{
      id: "plan-selected",
      agentId: state.agent!.id,
      presenceId,
      environment: "sandbox",
      initiativeMode: "pace",
      horizonStart: "2026-09-16T00:00:00.000Z",
      horizonEnd: "2026-09-23T00:00:00.000Z",
      timezone: "America/Toronto",
      status: "active",
      verifiedOriginals: 1,
      expectedOriginals: { min: 0, max: 2 },
      windows: [],
      currentWork: [{ id: "work", status: "researching", summary: "Check the launch signal", createdAt: "2026-09-16T10:00:00.000Z", updatedAt: "2026-09-16T11:00:00.000Z" }],
      evidenceSummary: ["One verified Sandbox outcome"],
      createdAt: "2026-09-16T10:00:00.000Z",
      updatedAt: "2026-09-16T11:00:00.000Z",
      revision: 1,
    }];
    state.growthHypotheses = [{
      id: "hypothesis-selected",
      agentId: state.agent!.id,
      originatingPresenceId: presenceId,
      scope: "presence",
      statement: "Specific proof earns better return conversations.",
      status: "testing",
      confidence: "low",
      patternIds: [],
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      derivedFrom: [],
      reviewHistory: [],
      createdAt: "2026-09-16T10:00:00.000Z",
      updatedAt: "2026-09-16T10:00:00.000Z",
    }];
    state.assignments = [{
      id: "assignment-selected",
      agentId: state.agent!.id,
      presenceId,
      channelId: "x",
      environment: "sandbox",
      title: "Review the launch signal",
      instruction: "Review the launch signal and decide whether it earns a useful response.",
      deliverable: { type: "decision_report" },
      executionPolicy: { usePresenceEnvelope: true },
      status: "working",
      progress: { required: 1, verified: 0 },
      rejectedCandidates: 0,
      systemFailures: 0,
      createdAt: "2026-09-16T10:00:00.000Z",
      updatedAt: "2026-09-16T10:00:00.000Z",
    } as never];

    const projected = projectSupervisoryChatState(state, presenceId, "2026-09-16T12:00:00.000Z");
    expect(projected.presence.id).toBe(presenceId);
    expect(projected.growth.profile?.qualifiedOutcome).toBe("Useful return conversations");
    expect(projected.growth.activePlan?.currentWork).toEqual([{ status: "researching", summary: "Check the launch signal" }]);
    expect(projected.growth.activeHypotheses).toEqual([{ id: "hypothesis-selected", status: "testing", confidence: "low", statement: "Specific proof earns better return conversations." }]);
    expect(projected.calendar).toHaveLength(1);
    expect(projected.runtime.activeAssignments[0]?.label).toBe("Review the launch signal");
    expect(JSON.stringify(projected)).not.toContain("calendar-other");
    expect(formatSupervisoryChatState(projected)).toContain("Growth evidence is descriptive");
    expect(buildSupervisoryChatPrompt(state, presenceId, "What should happen next?", "2026-09-16T12:00:00.000Z")).toContain("Specific proof earns better return conversations.");
  });

  it("makes an evidence drop actionable without turning it into durable work", () => {
    expect(supervisoryChatGuidance).toContain("Links and pasted posts are evidence drops");
    expect(supervisoryChatGuidance).toContain("Do not require the operator to create a manual Assignment");
    expect(supervisoryChatGuidance).toContain("inspect or search it");
    expect(supervisoryChatGuidance).toContain("Social Intent → Execution Envelope");
    expect(supervisoryChatGuidance).toContain("Meaning-file precedence remains in force");

    expect(operatorChatHarnessInstructions).toContain("Keep private supervisory replies short, direct, and action-first");
    expect(operatorChatHarnessInstructions).toContain("you may still form the requested action with that exact asset ID");
    expect(operatorChatHarnessInstructions).toContain("do not claim X rejects the image");
    expect(parseOperatorChatStep(JSON.stringify({ kind: "inspect_post", url: "https://x.com/example/status/123" }))).toEqual({ kind: "inspect_post", url: "https://x.com/example/status/123" });
    expect(parseOperatorChatStep(JSON.stringify({ kind: "social_action", action: "like", targetId: "post-123" }))).toEqual({ kind: "social_action", action: "like", targetId: "post-123" });
  });
});
