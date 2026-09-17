import { expect, test, vi } from "vitest";
import { readStateSnapshot, writeState } from "../lib/db";
import { generateAgentSocialDecision } from "../lib/ai";
import { compileSocialStrategyContext } from "../lib/social-strategy";
import { applyOperation, createAgent, recordOperatorPreference } from "../lib/runtime";

test(`Chat feedback process phase ${process.env.CHAT_FEEDBACK_PHASE ?? "unknown"}`, async () => {
  const phase = process.env.CHAT_FEEDBACK_PHASE;
  if (phase === "A") {
    let state = createAgent({ name: "Process Boundary Agent", description: "Prove durable supervisory feedback", audience: "builders", mode: "agent", handle: "@process_boundary_agent", accent: "#aa7744" });
    state = applyOperation(state, { type: "setPresence", patch: { environment: "sandbox", connectionMode: "sandbox" } });
    state = recordOperatorPreference(state, { presenceId: state.presence!.id, note: "Do not use screenshots unless their contents have been inspected and grounded.", reasons: ["format"], scopeHint: "presence" });
    writeState(state, { force: true });
    const saved = readStateSnapshot();
    expect(saved.preferenceEvidence).toHaveLength(1);
    expect(saved.executions).toHaveLength(0);
    console.log(`CHAT_FEEDBACK_PHASE_RESULT ${JSON.stringify({ phase, presenceId: saved.presence?.id, preferenceId: saved.preferenceEvidence[0]?.id, executionCount: saved.executions.length })}`);
    return;
  }

  expect(phase).toBe("B");
  const state = readStateSnapshot();
  const presence = state.presence!;
  const preference = state.preferenceEvidence.find((item) => item.source === "operator_explicit" && item.presenceId === presence.id);
  expect(preference).toMatchObject({ scopeHint: "presence", reaction: "does_not_fit", note: expect.stringContaining("inspected and grounded") });
  const strategy = compileSocialStrategyContext(state, presence, { invocation: "future autonomous decision", objective: "choose a relevant visual for a grounded technical post", availableActions: ["post", "reply"], format: "x.reply" });
  expect(strategy.prompt).toContain("inspected and grounded");
  const baselineState = structuredClone(state);
  baselineState.preferenceEvidence = baselineState.preferenceEvidence.filter((item) => item.id !== preference?.id);
  const baselineStrategy = compileSocialStrategyContext(baselineState, baselineState.presence!, { invocation: "future autonomous decision", objective: "choose a relevant visual for a grounded technical post", availableActions: ["post", "reply"], format: "x.reply" });
  expect(baselineStrategy.prompt).not.toContain("inspected and grounded");

  // Exercise the provider boundary with identical future inputs. The tiny
  // deterministic provider fixture stands in for model judgment; the
  // protected assertion is that only the persisted correction changes the
  // decision input and resulting act.
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
  const withCorrection = await generateAgentSocialDecision(state, "Consider an original publication for the current simulated world.", ["post", "no_op"], { presence, strategyContext: strategy, socialInput: "A technical post with a possible screenshot." });
  const withoutCorrection = await generateAgentSocialDecision(baselineState, "Consider an original publication for the current simulated world.", ["post", "no_op"], { presence: baselineState.presence!, strategyContext: baselineStrategy, socialInput: "A technical post with a possible screenshot." });
  expect(withCorrection.acts).toHaveLength(0);
  expect(withoutCorrection.acts?.[0]?.action).toBe("post");
  expect(JSON.stringify(withCorrection.acts)).not.toBe(JSON.stringify(withoutCorrection.acts));
  expect(state.executions).toHaveLength(0);
  expect(state.preferenceEvidence.filter((item) => item.presenceId !== presence.id)).toHaveLength(0);
  console.log(`CHAT_FEEDBACK_PHASE_RESULT ${JSON.stringify({ phase, presenceId: presence.id, preferenceId: preference?.id, strategyContextIncludesCorrection: strategy.prompt.includes("inspected and grounded"), laterDecisionChanged: JSON.stringify(withCorrection.acts) !== JSON.stringify(withoutCorrection.acts), executionCount: state.executions.length })}`);
});
