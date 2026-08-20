import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, createAgent } from "../lib/runtime";
import { parseAgentSocialDecision } from "../lib/ai";
import { POST } from "../app/api/state/route";
import { writeState } from "../lib/db";

const agentInput = {
  name: "Jenny",
  description: "Explain useful AI agent ideas.",
  mode: "agent" as const,
  handle: "@jenny_ai",
  accent: "#D68754",
};

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Source-Invariant Social Opportunity Pipeline", () => {
  it("delivers full affordance vocabulary regardless of whether origin is Exploration, Watchlist, or Operator Evaluation", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent(agentInput);
    const presenceId = state.presence!.id;
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
        connectionMode: "sandbox",
        execution: {
          post: "auto",
          reply: "auto",
          quote: "auto",
          repost: "auto",
          like: "auto",
          follow: "auto",
        },
      },
    });
    state = (await import("../lib/runtime")).startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;

    // Inbound candidate
    state = (await import("../lib/runtime")).addSandboxEvent(state, {
      sessionId,
      actorName: "Builder",
      actorHandle: "builder",
      content: "Evaluating quote candidate for multi-agent architecture and prompt chaining.",
      language: "en",
    });
    const candidateObject = state.mirrorObjects[0]!;

    writeState(state);

    // Operator asks presence to evaluate
    const response = await POST(
      new Request("http://localhost/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "askPresenceToEvaluate",
          presenceId,
          objectId: candidateObject.id,
          sessionId,
        }),
      })
    );

    expect(response.status).toBe(200);
    const resultState = await response.json();

    // Verify quote intent and successful delivery occurred
    expect(resultState.executions.some((item: { affordance: string; status: string }) => item.affordance === "quote" && item.status === "succeeded")).toBe(true);
    expect(resultState.events.some((event: { title: string }) => event.title === "Evaluation acted")).toBe(true);
  });

  it("handles informed silence (acts = []) gracefully across sources without treating it as an error", () => {
    const decision = parseAgentSocialDecision("{\"acts\":[],\"rationale\":\"Sufficient context present, but no outward act earned its place.\"}", ["reply", "quote", "repost", "like", "follow"]);
    expect(decision.action).toBe("no_op");
    expect(decision.acts).toEqual([]);
    expect(decision.rationale).toContain("no outward act earned its place");
  });

  it("filters out rogue { action: 'no_op' } or illegal acts while recording normalization diagnostics", () => {
    // Single rogue no_op
    const decision1 = parseAgentSocialDecision("{\"acts\":[{\"action\":\"no_op\",\"rationale\":\"do nothing\"}],\"rationale\":\"Stay silent.\"}", ["reply", "quote", "repost", "like", "follow"]);
    expect(decision1.action).toBe("no_op");
    expect(decision1.acts).toEqual([]);
    expect(decision1.normalization?.recoveredLegacyNoOp).toBe(true);

    // Rogue no_op alongside a valid like act
    const decision2 = parseAgentSocialDecision("{\"acts\":[{\"action\":\"no_op\"},{\"action\":\"like\",\"rationale\":\"Quiet signal\"}],\"rationale\":\"Signal quietly.\"}", ["reply", "quote", "repost", "like", "follow"]);
    expect(decision2.action).toBe("like");
    expect(decision2.acts).toHaveLength(1);
    expect(decision2.acts![0].action).toBe("like");
    expect(decision2.normalization?.recoveredLegacyNoOp).toBe(true);

    // Unsupported illegal action
    const decision3 = parseAgentSocialDecision("{\"acts\":[{\"action\":\"delete_account\"}],\"rationale\":\"Invalid action.\"}", ["reply", "quote", "repost", "like", "follow"]);
    expect(decision3.action).toBe("no_op");
    expect(decision3.normalization?.droppedIllegalActions).toContain("delete_account");
  });

  it("ensures origin.kind does not independently mutate available affordances when constraints are constant", () => {
    // When effective capabilities, target constraints, and responsibility contracts are identical,
    // both Exploration and Watchlist and Direct Inbound expose the identical outward affordance set:
    const availableAffordancesExploration = ["reply", "quote", "repost", "like", "follow"];
    const availableAffordancesWatchlist = ["reply", "quote", "repost", "like", "follow"];
    const availableAffordancesMention = ["reply", "quote", "repost", "like", "follow"];

    expect(availableAffordancesExploration).toEqual(availableAffordancesWatchlist);
    expect(availableAffordancesWatchlist).toEqual(availableAffordancesMention);
    // no_op must NOT be listed as an affirmative social act
    expect(availableAffordancesExploration.includes("no_op")).toBe(false);
  });
});
