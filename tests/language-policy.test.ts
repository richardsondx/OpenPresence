import { describe, expect, it } from "vitest";
import { containsLiteral, effectiveLanguagePolicy, mergeLanguagePolicies, validateLanguage } from "../lib/language-policy";
import { applyOperation, completeNativeExecution, createAgent, deliverSandboxExecution, formChatPostIntent, formSandboxIntent, startPlaygroundSession } from "../lib/runtime";

const input = { name: "Jenny", description: "A useful social Agent.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Language & phrasing policy", () => {
  it("matches normalized literal phrases with lexical boundaries and exact punctuation", () => {
    expect(containsLiteral("A  BAD\r\nphrase.", "bad phrase")).toBe(true);
    expect(containsLiteral("badly phrased", "bad")).toBe(false);
    expect(containsLiteral("say bad phrase!", "bad phrase.")).toBe(false);
    expect(containsLiteral("BAD phrase", "bad phrase")).toBe(true);
  });

  it("merges Agent and Presence rules additively while deduplicating", () => {
    const merged = mergeLanguagePolicies(
      { avoid: ["Great"], prohibited: ["secret"] },
      { avoid: [" great ", "maybe"], prohibited: ["SECRET", "vendor"] },
    );
    expect(merged).toEqual({ avoid: ["Great", "maybe"], prohibited: ["secret", "vendor"] });
    const state = createAgent(input);
    const next = applyOperation(applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: ["great"], prohibited: ["secret"] } }), {
      type: "setPresenceLanguagePolicy",
      policy: { avoid: ["warm"], prohibited: ["vendor"] },
    });
    expect(effectiveLanguagePolicy(next.agent, next.presence)).toEqual({ avoid: ["great", "warm"], prohibited: ["secret", "vendor"] });
  });

  it("keeps Avoid advisory while Never use is deterministic and blocking", () => {
    const result = validateLanguage("A great note about the vendor.", { avoid: ["great"], prohibited: ["vendor"] });
    expect(result.avoided).toEqual(["great"]);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([{ literal: "vendor", kind: "prohibited" }]);
  });

  it("keeps Social Intent chosen while blocking Sandbox execution and Mirror delivery", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresenceLanguagePolicy", policy: { avoid: [], prohibited: ["vendor"] } });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A useful vendor note." });
    const execution = state.executions[0]!;
    expect(state.socialIntents[0]?.state).toBe("active");
    expect(execution.status).toBe("blocked");
    expect(execution.failure?.code).toBe("LANGUAGE_POLICY_VIOLATION");
    expect(state.mirrorObjects).toHaveLength(0);
  });

  it("rechecks the current policy immediately before Sandbox delivery", () => {
    let state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A clean note." });
    const execution = state.executions[0]!;
    expect(execution.status).toBe("queued");
    state = applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: [], prohibited: ["clean"] } });
    const checked = deliverSandboxExecution(state, execution.id);
    expect(checked.executions[0]?.status).toBe("blocked");
    expect(checked.mirrorObjects).toHaveLength(0);
  });

  it("blocks a native completion recheck and permits only an explicit operator override", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: [], prohibited: ["secret"] } });
    state.presence = { ...state.presence!, connectionMode: "native" };
    state.presences = state.presences.map((item) => item.id === state.presence?.id ? state.presence! : item);
    state = formChatPostIntent(state, "A secret operator-authored post.", undefined, "operator");
    const execution = state.executions[0]!;
    execution.connector = "native";
    execution.status = "queued";
    const blocked = completeNativeExecution(state, execution.id, { type: "x.post", id: "never-created" });
    expect(blocked.executions[0]?.status).toBe("blocked");
    expect(blocked.executions[0]?.source).toBe("operator");
    const overridden = applyOperation(blocked, { type: "overrideLanguagePolicy", id: execution.id });
    expect(overridden.executions[0]?.status).toBe("queued");
    expect(overridden.executions[0]?.failure).toBeUndefined();
  });
});
