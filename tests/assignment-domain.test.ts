import { describe, expect, it } from "vitest";
import { applyOperation, compileAssignmentInstruction, createAgent, normalizeState } from "../lib/runtime";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("canonical Assignment domain", () => {
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
