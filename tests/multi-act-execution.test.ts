import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAgentSocialDecision } from "../lib/ai";
import { applyOperation, createAgent, formXActionIntent } from "../lib/runtime";
import { filterAutonomousSocialActs, runBridgeInboundAttentionPass, runObservedAttentionPass, watchRelationshipGuidance } from "../lib/autonomy-worker";
import type { OpenPresenceState } from "../lib/types";

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

  it("enforces conversation dispositions before autonomous acts become intents", () => {
    const acts = [
      { action: "reply", text: "One more useful thought.", rationale: "Advances the exchange." },
      { action: "like", text: "", rationale: "Quiet warmth." },
    ];
    expect(filterAutonomousSocialActs(acts, "close_silently")).toEqual([]);
    expect(filterAutonomousSocialActs(acts, "defer")).toEqual([]);
    expect(filterAutonomousSocialActs(acts, "react_only")).toEqual([{ action: "like", text: "", rationale: "Quiet warmth." }]);
    expect(filterAutonomousSocialActs(acts, "close_with_reply")).toEqual(acts);
  });

  it("turns the Watch purpose into bounded relationship, humor, participant, and share-vs-quote guidance", () => {
    const guidance = watchRelationshipGuidance("Make him feel good, use humor, involve the people in the conversation, and quote or repost when it fits.");
    expect(guidance).toContain("genuinely welcomed");
    expect(guidance).toContain("light humor");
    expect(guidance).toContain("supplied handles");
    expect(guidance).toContain("Build the exchange one worthwhile turn at a time");
    expect(guidance).toContain("Repost when the original is worth passing");
    expect(guidance).toContain("quote when distinct framing adds value");
    expect(guidance).toContain("never act merely to increase activity");
  });

  it("judges Watch Signals after narrow scheduled observation without entering discovery", async () => {
    const state = createAgent({ name: "Jenny", description: "Explain AI agents.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const observed: OpenPresenceState = { ...state, watchSignals: [{ id: "watch-signal-1", watchId: "watch-1", presenceId: state.presence!.id, mirrorObjectId: "mirror-1", signalType: "new_content", disposition: "pending", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" }] };
    const calls: string[] = [];

    const result = await runObservedAttentionPass(state.presence!.id, { runId: "run-watch-scope" }, {
      observe: async () => {
        calls.push("observe");
        return observed;
      },
      judgeWatches: async (next) => {
        calls.push("judge-watches");
        return { ...next, watchSignals: next.watchSignals.map((signal) => ({ ...signal, disposition: "considered" as const })) };
      },
    });

    expect(calls).toEqual(["observe", "judge-watches"]);
    expect(result.watchSignals[0]?.disposition).toBe("considered");
  });

  it("judges a Bridge-delivered inbound event from the persisted Mirror without a native reread", async () => {
    const state = createAgent({ name: "Jenny", description: "Explain AI agents.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const calls: string[] = [];
    let pulseOptions: { skipThreadHydration?: boolean } | undefined;
    const result = await runBridgeInboundAttentionPass(state.presence!.id, { runId: "run-bridge-inbound" }, {
      readState: () => { calls.push("read-mirror"); return state; },
      pulse: async (_presenceId, options, observed) => { calls.push("pulse"); pulseOptions = options; return observed ?? state; },
      judgeWatches: async (observed) => { calls.push("judge-watches"); return observed; },
    });

    expect(calls).toEqual(["read-mirror", "pulse", "judge-watches"]);
    expect(pulseOptions?.skipThreadHydration).toBe(true);
    expect(result).toBe(state);
  });
});
