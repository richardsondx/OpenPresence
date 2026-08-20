import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAgentSocialDecision } from "../lib/ai";
import { applyOperation, createAgent, formXActionIntent } from "../lib/runtime";

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Composable Multi-Act Decisions and Discrete Intent Formation", () => {
  it("parses multi-act decision bundles and extracts all discrete actions", () => {
    const raw = JSON.stringify({
      acts: [
        { action: "like", rationale: "Quiet appreciation." },
        { action: "quote", text: "Adding the critical distinction.", rationale: "Brings distinct territory perspective." },
        { action: "follow", rationale: "Relevant author." }
      ],
      conversationDisposition: "react_only",
      rationale: "Like, quote with distinction, and follow."
    });
    const decision = parseAgentSocialDecision(raw, ["like", "quote", "follow", "reply", "no_op"]);
    expect(decision.action).toBe("like");
    expect(decision.acts).toHaveLength(3);
    expect(decision.acts?.map(a => a.action)).toEqual(["like", "quote", "follow"]);
    expect(decision.conversationDisposition).toBe("react_only");
  });

  it("forms distinct SocialIntents for each act in a multi-act opportunity without duplicate side-effects", () => {
    let state = createAgent({
      name: "Jenny",
      description: "Explain AI agents.",
      mode: "agent",
      handle: "@jenny_ai",
      accent: "#D68754",
    });
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
        execution: {
          like: "auto",
          quote: "auto",
          follow: "auto",
        }
      }
    });
    const presenceId = state.presence!.id;
    const targetRef = { type: "x.post" as const, id: "post-123" };
    const authorRef = { type: "x.user" as const, id: "author-456" };

    // Form like intent
    state = formXActionIntent(state, {
      affordance: "x.like",
      target: targetRef,
    });
    // Form quote intent
    state = formXActionIntent(state, {
      affordance: "x.quote",
      target: targetRef,
      text: "The hard part is maintaining coherence.",
    });
    // Form follow intent
    state = formXActionIntent(state, {
      affordance: "x.follow",
      target: authorRef,
    });

    expect(state.socialIntents).toHaveLength(3);
    expect(state.socialIntents.map(i => i.affordance)).toEqual(["x.follow", "x.quote", "x.like"]);
    expect(state.executions).toHaveLength(3);
  });
});
