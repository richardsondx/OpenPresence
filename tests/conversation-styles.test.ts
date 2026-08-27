import { describe, expect, it } from "vitest";
import { BUILTIN_CONVERSATION_STYLES, DEFAULT_CONVERSATION_STYLE_ID, compileConversationStylePrompt, normalizeImportedConversationStyle, resolveConversationStyle } from "../lib/conversation-styles";
import { applyOperation, createAgent } from "../lib/runtime";
import { promptFor } from "../lib/ai";

describe("conversation styles", () => {
  it("ships the curated voices and Kairos as the default", () => {
    expect(BUILTIN_CONVERSATION_STYLES).toHaveLength(10);
    expect(BUILTIN_CONVERSATION_STYLES.map((style) => style.name)).toEqual(expect.arrayContaining(["Kairos", "Eunoia", "Kinesis", "Krisis", "Symmachia", "Tharsos", "Phronesis", "Aletheia", "Episteme", "Praxis"]));
    const state = createAgent({ name: "Genny", description: "A social agent", audience: "builders", mode: "agent", handle: "@genny", accent: "#d68754" });
    expect(resolveConversationStyle(state, state.presence?.id).id).toBe(DEFAULT_CONVERSATION_STYLE_ID);
  });

  it("compiles expression guidance without treating it as Knowledge", () => {
    const prompt = compileConversationStylePrompt(BUILTIN_CONVERSATION_STYLES[0]!);
    expect(prompt).toContain("ACTIVE CONVERSATIONAL STYLE: Kairos");
    expect(prompt).toContain("This controls expression only");
    expect(prompt).not.toContain("STYLEPRINT.md");
  });

  it("injects the resolved style into the social prompt path", () => {
    const state = createAgent({ name: "Genny", description: "A social agent", audience: "builders", mode: "agent", handle: "@genny", accent: "#d68754" });
    state.presence!.conversationStyleId = "eunoia";
    state.presences[0]!.conversationStyleId = "eunoia";
    const prompt = promptFor(state, undefined, "I finally got the job!!", { social: true, presence: state.presence!, socialHistory: [{ role: "user", content: "I finally got the job!!" }] });
    expect(prompt.system).toContain("ACTIVE CONVERSATIONAL STYLE: Eunoia");
    expect(prompt.system).not.toContain("STYLEPRINT AND BOUND MEANING EVIDENCE");
    expect(prompt.system).not.toContain("KNOWLEDGE EVIDENCE");
  });

  it("normalizes a custom StylePrint and binds it to a Presence", () => {
    const custom = normalizeImportedConversationStyle({ schema: "taste.conversation_style.v1", name: "My Voice", description: "Warm and direct", style: { corePrinciple: "Say the useful thing clearly.", replyMoves: ["acknowledge", "add one thought"] } });
    expect(custom.source).toBe("custom");
    const state = createAgent({ name: "Genny", description: "A social agent", audience: "builders", mode: "agent", handle: "@genny", accent: "#d68754" });
    const presenceId = state.presence!.id;
    const saved = applyOperation(state, { type: "saveConversationStyle", presenceId, style: custom });
    expect(saved.presence?.conversationStyleId).toBe(custom.id);
    expect(resolveConversationStyle(saved, presenceId).name).toBe("My Voice");
  });
});
