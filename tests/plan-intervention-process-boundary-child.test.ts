import { expect, test } from "vitest";
import { readStateSnapshot, writeState } from "../lib/db";
import { applyOperation, createAgent, replacePublishingPlan, startPlaygroundSession } from "../lib/runtime";
import { POST as statePost } from "../app/api/state/route";

test(`plan intervention process phase ${process.env.PLAN_INTERVENTION_PHASE ?? "unknown"}`, async () => {
  const phase = process.env.PLAN_INTERVENTION_PHASE;
  if (!phase) return;
  if (phase === "A") {
    let state = createAgent({ name: "Plan Boundary Agent", description: "Prove Agent-owned work survives supervision and restart", audience: "builders", mode: "agent", handle: "@plan_boundary_agent", accent: "#aa7744" });
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "sandbox", execution: { post: "auto" }, publishingInitiative: { ...state.presence!.publishingInitiative, mode: "pace", target: { count: 2, period: "week" } } } });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    const startAt = new Date(Date.parse(session.virtualNow) + 60_000).toISOString();
    state = replacePublishingPlan(state, {
      presenceId: state.presence!.id,
      environment: "sandbox",
      draft: {
        horizonStart: session.virtualNow,
        horizonEnd: new Date(Date.parse(session.virtualNow) + 86_400_000).toISOString(),
        expectedOriginals: { min: 1, max: 1 },
        windows: [
          { startAt, endAt: new Date(Date.parse(startAt) + 60_000).toISOString(), purpose: "originate", summary: "Make one grounded contribution.", desiredContribution: { min: 1, max: 1 } },
          { startAt: new Date(Date.parse(startAt) + 120_000).toISOString(), endAt: new Date(Date.parse(startAt) + 180_000).toISOString(), purpose: "originate", summary: "Keep the next useful contribution ready.", desiredContribution: { min: 1, max: 1 } },
        ],
        rationaleSummary: "A bounded Agent-owned publishing responsibility.",
      },
    });
    const assignment = state.assignments.find((item) => item.origin === "publishing_initiative" && item.sessionId === session.id)!;
    expect(assignment).toBeTruthy();
    state = applyOperation(state, { type: "planIntervention", assignmentId: assignment.id, action: "constrain", note: "Use only inspected, grounded evidence.", instruction: "Produce exactly 1 original publication about reliable agent decisions. Use only inspected, grounded evidence." });
    writeState(state, { force: true });
    const cancelResponse = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "planIntervention", assignmentId: assignment.id, action: "cancel", note: "Cancel the first planned contribution." }) }));
    expect(cancelResponse.status).toBe(200);
    const saved = await cancelResponse.json();
    writeState(saved, { force: true });
    const savedAssignment = saved.assignments.find((item) => item.id === assignment.id)!;
    expect(savedAssignment).toMatchObject({ createdBy: "agent", status: "active" });
    expect(savedAssignment.planningOnly).not.toBe(true);
    expect(savedAssignment.instruction).toContain("inspected, grounded evidence");
    expect(savedAssignment.status).toBe("active");
    expect(saved.presence.publishingInitiative.mode).toBe("pace");
    expect(saved.publishingPlans.filter((item: { status: string }) => item.status === "active")).toHaveLength(1);
    expect(saved.publishingPlans.some((item: { status: string; constraints?: string[] }) => item.status === "active" && item.constraints?.some((constraint) => constraint.includes("Make one grounded contribution")))).toBe(true);
    console.log(`PLAN_INTERVENTION_PHASE_RESULT ${JSON.stringify({ phase, assignmentId: savedAssignment.id, createdBy: savedAssignment.createdBy, status: savedAssignment.status, instructionIncludesConstraint: savedAssignment.instruction.includes("inspected, grounded evidence"), supervisedCancelPreservedResponsibility: true })}`);
    return;
  }

  expect(phase).toBe("B");
  const before = readStateSnapshot();
  const assignment = before.assignments[0]!;
  const session = before.playgroundSessions.find((item) => item.id === assignment.sessionId)!;
  expect(assignment.createdBy).toBe("agent");
  expect(assignment.planningOnly).not.toBe(true);
  expect(assignment.instruction).toContain("inspected, grounded evidence");
  const response = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "advanceSandboxTime", sessionId: session.id, minutes: 4 }) }));
  expect(response.status).toBe(200);
  const after = await response.json();
  const publishingIntentIds = new Set(after.socialIntents.filter((item: { origin?: { kind?: string; planId?: string } }) => item.origin?.kind === "publishing_initiative").map((item: { id: string }) => item.id));
  const executionCount = after.executions.filter((item: { assignmentId?: string; socialIntentId?: string }) => item.assignmentId === assignment.id || (item.socialIntentId && publishingIntentIds.has(item.socialIntentId))).length;
  expect(executionCount).toBe(1);
  expect(after.assignments.find((item: { id: string }) => item.id === assignment.id)?.instruction).toContain("inspected, grounded evidence");
  expect(after.assignments.find((item: { id: string }) => item.id === assignment.id)?.createdBy).toBe("agent");
  expect(after.events.some((item: { title: string }) => item.title === "Agent plan changed")).toBe(true);
  writeState(after, { force: true });
  console.log(`PLAN_INTERVENTION_PHASE_RESULT ${JSON.stringify({ phase, assignmentId: assignment.id, instructionIncludesConstraint: true, executionCount, userActivationRequired: false })}`);
});
