import { describe, expect, it } from "vitest";
import { applyOperation, compileAssignmentInstruction, createAgent, normalizeState } from "../lib/runtime";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("canonical Assignment domain", () => {
  it("compiles one clear completion contract without exposing Consider vs Assign", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish one useful lesson about persistent agents Tuesday morning.", state.presence!.id, "sandbox", undefined, { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" });
    expect(assignment.deliverable.type).toBe("original_publication");
    expect(assignment.preflight).toMatchObject({ status: "ready", contract: { successEvidence: expect.stringContaining("confirmed") } });
  });

  it("persists the Schedule objective for List and Week projections", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "createAssignment", instruction: "Teach one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "sandbox", objective: "education", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    expect(next.assignments[0]?.objective).toBe("education");
  });

  it("turns evaluation-only language into a report deliverable", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Evaluate whether we should respond to this controversy Friday morning.", state.presence!.id, "sandbox", undefined, { day: "Friday", time: "09:00", executionWindow: "09:00–12:00" });
    expect(assignment.deliverable.type).toBe("decision_report");
    expect(assignment.preflight?.semanticSummary).toContain("does not require a public response");
  });

  it("keeps materially unclear work in preflight instead of activating it", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAssignment", instruction: "Think about our pricing announcement Friday.", presenceId: state.presence!.id, environment: "sandbox" });
    const assignment = state.assignments[0]!;
    expect(assignment.preflight?.status).toBe("needs_input");
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    expect(state.assignments[0]?.status).toBe("draft");
  });

  it("rechecks live authority before activation", () => {
    let state = createAgent(input);
    state.presence!.execution.post = "off";
    state.presences[0]!.execution.post = "off";
    state = applyOperation(state, { type: "createAssignment", instruction: "Publish one useful lesson about persistent agents.", presenceId: state.presence!.id, environment: "live", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } });
    const assignment = state.assignments[0]!;
    expect(assignment.preflight?.status).toBe("blocked");
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    expect(state.assignments[0]?.status).toBe("draft");
  });

  it("keeps quantity language distinct and accepts legacy aliases", () => {
    const state = createAgent(input);
    expect(compileAssignmentInstruction(state, "up to 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "at_most", period: "day" });
    expect(compileAssignmentInstruction(state, "aim for 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "target", period: "day" });
    expect(compileAssignmentInstruction(state, "at least 5 original posts per day").quantityPolicy).toMatchObject({ quantity: 5, mode: "at_least", period: "day" });
    expect(compileAssignmentInstruction(state, "exactly 5 original posts").quantityPolicy).toMatchObject({ quantity: 5, mode: "exact" });

    const { quantityPolicy: _legacyPolicy, ...legacyBase } = compileAssignmentInstruction(state, "Produce one post");
    const legacy = { ...legacyBase, deliverable: { type: "original_publication", quantity: 5, quantityMode: "maximum" as const } };
    expect(normalizeState({ ...state, assignments: [legacy] }).assignments[0]?.quantityPolicy).toMatchObject({ quantity: 5, mode: "at_most" });
  });

  it("materializes one linked Publishing Initiative Assignment and updates it in place", () => {
    let state = createAgent(input);
    const presence = state.presence!;
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...presence.publishingInitiative, mode: "pace", target: { count: 5, period: "day" } } } });
    const first = state.assignments.find((item) => item.origin === "publishing_initiative");
    expect(first).toMatchObject({ origin: "publishing_initiative", activation: { type: "continuous" }, deliverable: { type: "original_publication", quantity: 5, quantityMode: "target" }, quantityPolicy: { quantity: 5, mode: "target", period: "day" } });
    expect(state.presence?.publishingInitiative.assignmentId).toBe(first?.id);

    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const updated = state.assignments.find((item) => item.id === first?.id);
    expect(state.assignments.filter((item) => item.origin === "publishing_initiative")).toHaveLength(1);
    expect(updated).toMatchObject({ deliverable: { type: "maintain_original_presence" }, quantityPolicy: { quantity: "agent_planned" } });

    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "off" } } });
    expect(state.presence?.publishingInitiative.assignmentId).toBeUndefined();
    expect(state.assignments.find((item) => item.id === first?.id)?.status).toBe("paused");
  });

  it("compiles autonomous Exploration engagement into the same Assignment primitive", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createExploration", presenceId, brief: "Find founders struggling with persistent agent memory." });
    const exploration = state.explorations[0]!;
    state = applyOperation(state, { type: "setExplorationEngagement", id: exploration.id, mode: "opportunistic" });
    const assignment = state.assignments.find((item) => item.id === state.explorations[0]?.engagement?.assignmentId);
    expect(assignment).toMatchObject({ origin: "exploration", activation: { type: "attention_source", sourceIds: [exploration.id] }, deliverable: { type: "meaningful_engagement" }, quantityPolicy: { quantity: "agent_planned" } });
    expect(state.explorations[0]?.engagement?.mode).toBe("opportunistic");
  });
});
