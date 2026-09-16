import { expect, it } from "vitest";
import { createAgent } from "../lib/runtime";
import { parseAgentSocialDecision, validateSocialStrategySelection } from "../lib/ai";
import { compileSocialStrategyContext, strategyUseFromDecision } from "../lib/social-strategy";

it("requires model-owned selection or explicit abstention without inventing strategy provenance", () => {
  const state = createAgent({ name: "Strategy", description: "Builder", mode: "agent", handle: "@strategy", accent: "#123456" });
  const context = compileSocialStrategyContext(state, state.presence!, { invocation: "test", objective: "Find useful conversations and share a source", availableActions: ["reply", "quote", "original_post"] });
  expect(context.retrievalRun.consideredPatterns.length).toBeGreaterThan(1);
  const parse = (extra: object) => parseAgentSocialDecision(JSON.stringify({ acts: [{ action: "quote", text: "A grounded observation", ...extra }], rationale: "Useful source" }), ["quote"], { strict: true });
  expect(() => validateSocialStrategySelection(parse({}), context)).toThrow(/strategyId/);
  expect(() => validateSocialStrategySelection(parse({ strategyId: "invented" }), context)).toThrow(/strategyId/);
  expect(() => validateSocialStrategySelection(parse({ noStrategyReason: "A simple factual correction needs no supplied format." }), context)).not.toThrow();
  const pattern = context.retrievalRun.consideredPatterns[0];
  const selected = parse({ strategyId: pattern.id, mechanismId: "unrelated" });
  expect(() => validateSocialStrategySelection(selected, context)).not.toThrow();
  expect(strategyUseFromDecision(context.retrievalRun, selected.acts)?.selectedByAct[0]).toMatchObject({ patternId: pattern.id, mechanismId: undefined });
  expect(strategyUseFromDecision(context.retrievalRun, parse({}).acts)?.selectedByAct[0].reason).toBe("Strategy selection not recorded.");
});
