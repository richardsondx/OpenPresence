import { describe, expect, it } from "vitest";
import { unsupportedChatContinuationPromise } from "../lib/chat-tool-recovery";
const receipt = (value: unknown) => ({ content: JSON.stringify(value) });
describe("Chat continuation evidence guard", () => {
  it.each([
    "Starting the search now.", "I'll find two public sources. Just a moment!", "Searching now.", "Let me search for that.", "Let me initiate that search now.", "I am going to research this.", "I'm about to read that source.", "I need to use the search tool again to find two public sources specifically about usability testing prototypes with real users. Let me initiate that search now.", "I plan to investigate this.", "I will monitor this for you.",
  ])("rejects unsupported terminal work intent: %s", (text) => expect(unsupportedChatContinuationPromise(text, [])).toBe(true));
  it("a read receipt is not a durable future responsibility", () => {
    expect(unsupportedChatContinuationPromise("I'll continue researching.", [receipt({ tool: "read_web", result: { route: "browser", content: "Evidence" } })])).toBe(true);
  });
  it.each(["failed", "cancelled", "completed"])("does not let %s assignments justify future-work claims", (status) => {
    expect(unsupportedChatContinuationPromise("I'll continue researching.", [receipt({ tool: "assignment", assignmentId: "task", status })])).toBe(true);
  });
  it("an active durable responsibility supports truthful future work", () => {
    expect(unsupportedChatContinuationPromise("I'll continue researching.", [receipt({ tool: "assignment", assignmentId: "task", status: "active", planningOnly: false })])).toBe(false);
  });
  it("planning-only and failed receipts cannot justify future work", () => {
    expect(unsupportedChatContinuationPromise("I'll continue researching.", [receipt({ tool: "assignment", assignmentId: "task", status: "draft", planningOnly: true })])).toBe(true);
    expect(unsupportedChatContinuationPromise("I'll continue researching.", [receipt({ tool: "assignment", assignmentId: "task", status: "active", error: "not persisted" })])).toBe(true);
  });
  it("permits grounded completed summaries and useful blockers", () => {
    expect(unsupportedChatContinuationPromise("I read the source. It describes three concrete methods.", [])).toBe(false);
    expect(unsupportedChatContinuationPromise("Sign in to the expected X account so this saved request can continue.", [])).toBe(false);
  });
  it("does not mistake requested quoted draft copy for runtime work", () => {
    expect(unsupportedChatContinuationPromise('Draft: “I will research how builders test prototypes.”', [], "Draft a short message to the research team.")).toBe(false);
    expect(unsupportedChatContinuationPromise('Draft:\n> I will research how builders test prototypes.', [], "Write a short message.")).toBe(false);
    expect(unsupportedChatContinuationPromise('Draft: “I will research this.” I will search for sources now.', [], "Draft a short message.")).toBe(true);
  });
});
