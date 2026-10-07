import { describe, expect, it } from "vitest";
import { promptFor } from "../lib/ai";
import { operatorChatHarnessInstructions } from "../lib/operator-chat-harness";
import { createAgent } from "../lib/runtime";

describe("operator Chat control transport", () => {
  it("keeps tool transport distinct from human style and old narrative promises", () => {
    const state = createAgent({ name: "Control proof", description: "Useful social judgment", mode: "agent", handle: "@control_proof", accent: "#777" });
    const prompt = promptFor(state, undefined, "Find two sources and read both.", {
      operatorConversation: true,
      operatorHarness: operatorChatHarnessInstructions,
      operatorHistory: [{ role: "operator", content: "Please investigate." }, { role: "presence", content: "I'll get started on that now." }, { role: "system", content: "Earlier request failed." }],
      operatorToolHistory: [{ request: '{"kind":"search_web","query":"prototype testing"}', result: '{"tool":"search_web","result":{"sources":[{"url":"https://example.org"}]}}' }],
    });
    expect(prompt.system).toContain("OPERATOR CHAT CONTROL TURN");
    expect(prompt.system).toContain("apply only inside answer.text");
    expect(prompt.system).toContain("CONTROL TRANSPORT PRECEDENCE");
    expect(prompt.system).not.toContain("Answer the direct point first, then take the smallest warranted tool/runtime action");
    expect(prompt.messages[1]).toEqual({ role: "assistant", content: JSON.stringify({ kind: "answer", text: "I'll get started on that now." }) });
    expect(prompt.messages[2].content).toContain("Historical runtime evidence from an earlier turn");
    expect(prompt.messages.at(-1)?.content).toContain("source reading requires read_web receipts");
    expect(prompt.messages.at(-1)?.content).toContain("Return exactly one JSON step object now");
  });

  it("keeps legacy private and social replies human-readable without a harness", () => {
    const state = createAgent({ name: "Voice proof", description: "Useful social judgment", mode: "agent", handle: "@voice_proof", accent: "#777" });
    const history = [{ role: "presence" as const, content: "I am here." }];
    const prompt = promptFor(state, undefined, "How are you?", { operatorConversation: true, operatorHistory: history });
    expect(prompt.system).not.toContain("OPERATOR CHAT CONTROL TURN");
    expect(prompt.messages).toEqual([{ role: "assistant", content: "I am here." }, { role: "user", content: "How are you?" }]);
    expect(promptFor(state, undefined, "An observed social post.", { social: true, presence: state.presence! }).system).not.toContain("OPERATOR CHAT CONTROL TURN");
  });
});
