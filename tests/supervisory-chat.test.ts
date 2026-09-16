import { describe, expect, it } from "vitest";
import { buildSupervisoryChatPrompt, supervisoryChatGuidance, formatSupervisoryChatState, projectSupervisoryChatState } from "../lib/supervisory-chat";
import { operatorChatHarnessInstructions, parseOperatorChatStep } from "../lib/operator-chat-harness";
import { createAgent } from "../lib/runtime";

describe("supervisory Chat contract", () => {
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
    expect(parseOperatorChatStep(JSON.stringify({ kind: "inspect_post", url: "https://x.com/example/status/123" }))).toEqual({ kind: "inspect_post", url: "https://x.com/example/status/123" });
    expect(parseOperatorChatStep(JSON.stringify({ kind: "social_action", action: "like", targetId: "post-123" }))).toEqual({ kind: "social_action", action: "like", targetId: "post-123" });
  });
});
