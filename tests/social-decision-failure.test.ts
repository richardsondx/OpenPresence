import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRuntimeError, generateAgentSocialDecision, parseAgentSocialDecision } from "../lib/ai";
import { applyOperation, createAgent } from "../lib/runtime";
import { saveProviderSecret } from "../lib/db";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("social decision failures are not chosen silence", () => {
  it.each(["", "The answer was truncated", "{}", '{"acts":null}', '{"acts":[null]}', '{"acts":[{}]}', '{"action":"reply","text":""}', '{"acts":[{"action":"message","text":"hello"}]}'])
    ("rejects invalid runtime response %s", (raw) => {
      expect(() => parseAgentSocialDecision(raw, ["reply", "like", "no_op"], { strict: true })).toThrow(AiRuntimeError);
    });

  it.each(["NO_OP", '{"acts":[],"rationale":"The exchange is complete."}', '{"action":"no_op","rationale":"Empty engagement bait."}'])
    ("preserves explicit silence %s", (raw) => {
      expect(parseAgentSocialDecision(raw, ["reply", "no_op"], { strict: true }).action).toBe("no_op");
    });

  it("propagates a malformed provider decision through real cognition instead of returning no_op", async () => {
    let state = createAgent({ name: "Decision QA", description: "Discuss reliable social agents.", mode: "agent", handle: "@decision_qa", accent: "#D68754" });
    state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
    const connection = state.providerConnections.find((item) => item.provider === "openai")!;
    saveProviderSecret(connection.id, "synthetic-test-secret");
    state = applyOperation(state, { type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "low" });
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"rationale":"provider forgot the decision"}' } }] }), { status: 200 })));
    await expect(generateAgentSocialDecision(state, "A person asks how durable work resumes after a crash.", ["reply", "no_op"]))
      .rejects.toMatchObject({ code: "invalid_response" });
    expect(state.socialDecisions).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
  });
});
