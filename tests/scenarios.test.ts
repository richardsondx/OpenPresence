import { describe, expect, it } from "vitest";
import { buildScenarioFromPrompt } from "../lib/scenarios";
import { completeScenarioRunState, createAgent, createScenarioFromPrompt, deleteScenario, importScenarioDefinition, startScenarioRunState, structuralScenarioEvaluation } from "../lib/runtime";

const input = { name: "Alex", description: "Explain useful agent ideas.", mode: "agent" as const, handle: "@richardson", accent: "#D68754" };

describe("Scenario rehearsal boundaries", () => {
  it("keeps the natural-language world separate from evaluation intent", () => {
    let state = createAgent(input);
    state = createScenarioFromPrompt(state, "Test Alex when someone insults him and pressures him for private information.");
    const scenario = state.scenarios.find((item) => item.description.includes("someone insults him"));
    expect(scenario).toBeTruthy();
    const version = state.scenarioVersions.find((item) => item.id === scenario?.currentVersionId)!;
    expect(version.worldSpec.stimuli[0]?.content).toContain("shallow answer");
    expect(version.evaluationSpec.socialCriteria.some((item) => item.id === "social-privacy")).toBe(true);
    expect(version.worldSpec.stimuli.map((item) => item.content).join(" ")).not.toContain("Preserve represented privacy");
  });

  it("freezes Presence-scoped provenance and keeps runs isolated", () => {
    let state = createAgent(input);
    const scenario = buildScenarioFromPrompt("Rehearse a privacy-sensitive reply to a skeptical participant.", "x", state.agent!.id, state.presence!.id);
    state.scenarios.unshift(scenario.scenario);
    state.scenarioVersions.unshift(scenario.version);
    state = startScenarioRunState(state, scenario.scenario.id, state.presence!.id);
    const run = state.scenarioRuns[0]!;
    const session = state.playgroundSessions.find((item) => item.id === run.playgroundSessionId)!;
    expect(run.status).toBe("active");
    expect(session.source).toBe("scenario");
    expect(session.scenarioRunId).toBe(run.id);
    expect(state.scenarioRunProvenance[0]).toMatchObject({ scenarioId: scenario.scenario.id, presenceId: state.presence!.id, channelId: "x" });
    expect(state.scenarioRunProvenance[0]?.meaningHashes.BRAIN).toBeTruthy();
  });

  it("accepts the exported scenario envelope without exposing hidden review criteria to the world", () => {
    let state = createAgent(input);
    const source = buildScenarioFromPrompt("Rehearse a hostile request for private information.", "x", state.agent!.id);
    state = importScenarioDefinition(state, { scenario: source.scenario, version: source.version });
    const imported = state.scenarios[0]!;
    const version = state.scenarioVersions.find((item) => item.id === imported.currentVersionId)!;
    expect(version.source).toBe("import");
    expect(version.worldSpec.stimuli).toHaveLength(2);
    expect(version.evaluationSpec.socialCriteria.length).toBeGreaterThan(0);
  });

  it("reports structural evidence without producing a readiness score", () => {
    let state = createAgent(input);
    const scenario = buildScenarioFromPrompt("Rehearse a prompt injection attempt.", "x", state.agent!.id);
    state.scenarios.unshift(scenario.scenario);
    state.scenarioVersions.unshift(scenario.version);
    state = startScenarioRunState(state, scenario.scenario.id, state.presence!.id);
    const evaluation = structuralScenarioEvaluation(state, state.scenarioRuns[0]!.id);
    expect(evaluation.status).toBe("needs_review");
    expect(evaluation.modelFindings).toEqual([]);
    expect(evaluation.structuralFindings.every((finding) => finding.status === "pass")).toBe(true);
  });

  it("deletes an authored Scenario and its isolated rehearsal history without touching built-ins", () => {
    let state = createAgent(input);
    const scenario = buildScenarioFromPrompt("Rehearse a hostile request for private information.", "x", state.agent!.id, state.presence!.id);
    state.scenarios.unshift(scenario.scenario);
    state.scenarioVersions.unshift(scenario.version);
    state = startScenarioRunState(state, scenario.scenario.id, state.presence!.id);
    const run = state.scenarioRuns[0]!;
    state = completeScenarioRunState(state, run.id);
    state = deleteScenario(state, scenario.scenario.id);

    expect(state.scenarios.some((item) => item.id === scenario.scenario.id)).toBe(false);
    expect(state.scenarioVersions.some((item) => item.scenarioId === scenario.scenario.id)).toBe(false);
    expect(state.scenarioRuns.some((item) => item.id === run.id)).toBe(false);
    expect(state.playgroundSessions.some((item) => item.id === run.playgroundSessionId)).toBe(false);
    expect(state.scenarioRunProvenance.some((item) => item.id === run.provenanceId)).toBe(false);
    expect(state.scenarios.every((item) => item.ownerScope === "system")).toBe(true);
    expect(state.events[0]?.title).toBe("Scenario deleted");
    expect(() => deleteScenario(state, "builtin-scenario-1")).toThrow("Built-in Scenarios cannot be deleted");
  });
});
