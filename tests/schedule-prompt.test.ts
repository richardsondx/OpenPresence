import { describe, expect, it } from "vitest";
import { analyzeSchedulePrompt } from "../lib/schedule-prompt";
import { applyOperation, createAgent, scheduledAssignmentIsDue } from "../lib/runtime";

describe("prompt-driven schedules", () => {
  it("turns a broad count into independent scheduled responsibilities", () => {
    const state = createAgent({ name: "Schedule test", description: "A useful social Presence", mode: "agent", handle: "@schedule_test", accent: "#777777" });
    const proposal = analyzeSchedulePrompt(state, "Create 8 worthwhile daily interactions with founders, hiring managers, engineering leaders, recruiters, and developers.");

    expect(proposal.drafts).toHaveLength(1);
    expect(proposal.drafts[0]?.schedule.time).toBe("08:00");
    expect(proposal.drafts.every((draft) => draft.instruction.length < 300)).toBe(true);
    expect(proposal.drafts.every((draft) => draft.instruction !== proposal.prompt)).toBe(true);
    expect(proposal.previews.every((draft) => draft.preflight)).toBe(true);
    expect(proposal.drafts[0]?.schedule.day).toBe("Daily");
    expect(proposal.summary).toBe("One daily Assignment for 8 worthwhile interactions focused on founders, hiring managers, engineering leaders, recruiters, and developers.");
    expect(proposal.drafts[0]?.instruction).toContain("Each day, find 8 worthwhile interactions");
    expect(proposal.previews[0]?.deliverable).toMatchObject({ quantity: 8 });
    expect(proposal.previews[0]?.recurrence?.kind).toBe("daily");
    expect(proposal.drafts[0]?.instruction).toContain("worthwhile relationship-building");
  });

  it("persists the reviewed proposal as one atomic operation", () => {
    const state = createAgent({ name: "Schedule test", description: "A useful social Presence", mode: "agent", handle: "@schedule_test", accent: "#777777" });
    const proposal = analyzeSchedulePrompt(state, "Plan 3 daily conversations with thoughtful builders.");
    const next = applyOperation(state, { type: "confirmSchedulePrompt", promptId: proposal.id, presenceId: proposal.presenceId, drafts: proposal.drafts });

    expect(next.assignments).toHaveLength(1);
    expect(next.assignments.every((assignment) => assignment.origin === "schedule" && assignment.schedule)).toBe(true);
    expect(next.assignments[0]?.progress.required).toBe(3);
    expect(next.assignments[0]?.recurrence?.kind).toBe("daily");
    expect(next.assignments.map((assignment) => assignment.instruction)).not.toContain(proposal.prompt);
    expect(next.events[0]?.title).toBe("Schedule created from prompt");
    expect(next.events.filter((event) => event.title === "Schedule created from prompt")).toHaveLength(1);
  });

  it("represents daily intent across every weekday in one recurring responsibility", () => {
    const state = createAgent({ name: "Schedule test", description: "A useful social Presence", mode: "agent", handle: "@schedule_test", accent: "#777777" });
    const proposal = analyzeSchedulePrompt(state, "Create 1 worthwhile daily interaction with a builder.");
    const assignment = applyOperation(state, { type: "confirmSchedulePrompt", promptId: proposal.id, presenceId: proposal.presenceId, drafts: proposal.drafts }).assignments[0]!;
    expect(assignment.recurrence?.kind).toBe("daily");
    expect(assignment.schedule?.day).toBe("Daily");
    expect(scheduledAssignmentIsDue(assignment, new Date("2026-08-27T14:00:00.000Z"))).toBe(true);
  });

  it("turns a linked post promotion request into one adaptive, capability-aware responsibility", () => {
    const state = createAgent({ name: "Schedule test", description: "A useful social Presence", mode: "agent", handle: "@schedule_test", accent: "#777777" });
    const proposal = analyzeSchedulePrompt(state, "Help this post reach people who genuinely care: https://x.com/example/status/123456789");

    expect(proposal.drafts).toHaveLength(1);
    expect(proposal.drafts[0]?.schedule?.day).toBe("Daily");
    expect(proposal.drafts[0]?.instruction).toContain("https://x.com/example/status/123456789");
    expect(proposal.previews[0]?.deliverable?.type).toBe("meaningful_engagement");
    expect(proposal.previews[0]?.plan?.capabilitiesConsidered).toBeDefined();
    expect(proposal.assumptions.some((item) => /no fixed interaction quota/i.test(item))).toBe(true);
    expect(proposal.drafts[0]?.instruction).not.toMatch(/find \d+ worthwhile interactions/i);

    const next = applyOperation(state, { type: "confirmSchedulePrompt", promptId: proposal.id, presenceId: proposal.presenceId, drafts: proposal.drafts });
    expect(next.assignments[0]?.deliverable.type).toBe("meaningful_engagement");
    expect(next.assignments[0]?.plan?.capabilitiesConsidered).toBeDefined();
    expect(next.assignments[0]?.plan?.stopConditions).toContain("Stop when no relevant conversation earns a useful contribution.");
  });
});
