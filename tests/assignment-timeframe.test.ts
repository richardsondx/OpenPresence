import { describe, expect, it } from "vitest";
import { assignmentWindowState, expireAssignmentWindows, assertAssignmentWindowOpen } from "../lib/assignment-timeframe";
import { applyOperation, createAgent } from "../lib/runtime";
import { parseOperatorChatStep } from "../lib/operator-chat-harness";

describe("interpreted task timing", () => {
  const timeframe = { startsAt: "2026-09-13T12:15:00-04:00", deadline: "2026-09-13T13:00:00-04:00" };
  it("preserves title and absolute window through creation", () => {
    const step = parseOperatorChatStep(JSON.stringify({ kind: "assignment", title: "Quote up to 3 useful posts", instruction: "Publish up to 3 quote posts about AI agents.", timeframe }));
    if (step.kind !== "assignment") throw new Error("Wrong tool");
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: step.instruction, title: step.title, timeframe: step.timeframe });
    const task = next.assignments[0];
    expect(task.title).toBe("Quote up to 3 useful posts");
    expect(task.timeframe).toEqual({ startsAt: "2026-09-13T16:15:00.000Z", deadline: "2026-09-13T17:00:00.000Z" });
    expect(assignmentWindowState(task, Date.parse("2026-09-13T16:14:59Z"))).toBe("upcoming");
    expect(assignmentWindowState(task, Date.parse("2026-09-13T16:30:00Z"))).toBe("open");
    expect(assignmentWindowState(task, Date.parse("2026-09-13T17:00:00Z"))).toBe("ended");
  });
  it("expires missed windows and blocks late actions without removing history", () => {
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: "Publish up to 3 quote posts", timeframe });
    const task = next.assignments[0];
    task.status = "active";
    task.progress.verified = 1;
    expect(expireAssignmentWindows(next, Date.parse("2026-09-13T17:01:00Z"))).toBe(1);
    expect(task.status).toBe("expired_incomplete");
    expect(task.progress.verified).toBe(1);
    expect(task.nextDueAt).toBeUndefined();
    expect(() => assertAssignmentWindowOpen(task, Date.parse("2026-09-13T17:01:00Z"))).toThrow("ended");
    expect(expireAssignmentWindows(next, Date.parse("2026-09-13T17:02:00Z"))).toBe(0);
  });
  it("anchors legacy today requests to the creation calendar day", () => {
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful post today" });
    const task = next.assignments[0];
    task.createdAt = "2026-09-13T23:45:00-04:00";
    expect(assignmentWindowState(task, Date.parse("2026-09-14T03:45:00.001Z"))).toBe("open");
    expect(assignmentWindowState(task, Date.parse("2026-09-14T04:00:00Z"))).toBe("ended");
  });
  it("does not expire a closed assignment while delivery is unresolved", () => {
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: "Publish up to 3 quote posts", timeframe });
    const task = next.assignments[0];
    task.status = "active";
    next.executions.push({ assignmentId: task.id, presenceId: task.presenceId, status: "verification-pending" } as never);
    expect(expireAssignmentWindows(next, Date.parse("2026-09-13T17:01:00Z"))).toBe(0);
    expect(task.status).toBe("active");
  });
  it("does not overwrite a blocked outcome during deadline cleanup", () => {
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: "Publish one post", timeframe });
    const task = next.assignments[0];
    task.status = "blocked";
    task.lastOutcome = { class: "evaluation_failed", message: "Model unavailable", at: task.updatedAt };
    expect(expireAssignmentWindows(next, Date.parse("2026-09-13T17:01:00Z"))).toBe(0);
    expect(task.status).toBe("blocked");
    expect(task.lastOutcome?.message).toBe("Model unavailable");
  });
  it("rejects reversed windows", () => {
    const state = createAgent({ name: "Timing", handle: "@timing", description: "Test", mode: "agent", accent: "#777777" });
    expect(() => applyOperation(state, { type: "createAssignment", instruction: "Publish a post", timeframe: { startsAt: timeframe.deadline, deadline: timeframe.startsAt } })).toThrow("end time after");
  });
  it("keeps a follower target continuous with metric evidence", () => {
    const state = createAgent({ name: "Growth", handle: "@growth", description: "Test", mode: "agent", accent: "#777777" });
    const next = applyOperation(state, { type: "createAssignment", instruction: "Grow this Presence toward 100,000 followers while building an audience of founders." });
    expect(next.assignments[0].activation?.type).toBe("continuous");
    expect(next.assignments[0].successEvidence).toMatchObject({ kind: "metric_threshold", value: 100000 });
  });
  it.each(["expired_incomplete", "failed"] as const)("prepares a new %s attempt without losing progress or sending", (status) => {
    const base = createAgent({ name: "Retry", handle: "@retry", description: "Test", mode: "agent", accent: "#777777" });
    const state = applyOperation(base, { type: "createAssignment", instruction: "Publish up to 3 quote posts" });
    const task = state.assignments[0];
    task.status = status;
    task.progress.verified = 1;
    const window = { startsAt: new Date().toISOString(), deadline: new Date(Date.now() + 3600000).toISOString() };
    const next = applyOperation(state, { type: "updateAssignment", id: task.id, instruction: task.instruction, timeframe: window });
    expect(next.assignments[0].status).toBe("draft");
    expect(next.assignments[0].progress.verified).toBe(1);
    expect(next.executions).toEqual(state.executions);
    task.status = status;
    state.executions.push({ assignmentId: task.id, status: "verification-pending" } as never);
    expect(() => applyOperation(state, { type: "updateAssignment", id: task.id, instruction: task.instruction, timeframe: window })).toThrow("unresolved delivery");
  });

});
