import { describe, expect, it } from "vitest";
import { unsupportedChatCompletionClaim } from "../lib/chat-tool-recovery";
const receipt = (value: unknown) => ({ content: JSON.stringify(value) });

describe("Chat completed-work receipt boundaries", () => {
  it("requires a verified delivery outcome rather than a queued attempt", () => {
    expect(unsupportedChatCompletionClaim("I published your post.", [receipt({ tool: "social_action", result: { status: "queued", verified: false } })])).toBeTruthy();
    expect(unsupportedChatCompletionClaim("I published your post.", [receipt({ tool: "social_action", result: { environment: "live", status: "succeeded", verified: true, outcomes: [{ status: "succeeded" }] } })])).toBeUndefined();
    const rehearsal = receipt({ tool: "social_action", result: { environment: "sandbox", status: "succeeded", verified: true, outcomes: [{ status: "succeeded" }] } });
    expect(unsupportedChatCompletionClaim("I published your post.", [rehearsal])).toBeTruthy();
    expect(unsupportedChatCompletionClaim("I published your post in the Sandbox rehearsal.", [rehearsal])).toBeUndefined();
    expect(unsupportedChatCompletionClaim("I published your post.", [receipt({ tool: "social_action", result: { status: "succeeded", verified: true, outcomes: [] } })])).toBeTruthy();
  });
  it("counts distinct source-text receipts and excludes browser search leads", () => {
    const search = receipt({ tool: "search_web", result: { route: "browser", sources: [{ url: "https://a.example", content: "Search snippet" }] } });
    const read = (url: string) => receipt({ tool: "read_web", result: { url, content: "Bounded source text" } });
    expect(unsupportedChatCompletionClaim("I read the sources.", [search])).toBeTruthy();
    expect(unsupportedChatCompletionClaim("I researched two sources.", [read("https://a.example"), read("https://b.example")])).toBeUndefined();
    expect(unsupportedChatCompletionClaim("I researched two sources.", [read("https://a.example"), read("https://a.example")])).toBeTruthy();
    expect(unsupportedChatCompletionClaim("I read the source.", [receipt({ tool: "read_web", error: "disconnected", result: { url: "https://a.example", content: "Partial" } })])).toBeTruthy();
  });
  it("accepts actual saved responsibility receipts and rejects private proposals", () => {
    expect(unsupportedChatCompletionClaim("I scheduled your task.", [receipt({ tool: "assignment", assignmentId: "saved", status: "active" })])).toBeUndefined();
    expect(unsupportedChatCompletionClaim("I scheduled your task.", [receipt({ tool: "assignment", assignmentId: "saved", status: "draft", planningOnly: true })])).toBeTruthy();
  });
  it("preserves requested draft quotations while checking the outside narration", () => {
    expect(unsupportedChatCompletionClaim('Draft: “I researched three sources and scheduled your post.”', [], "Draft a short example message.")).toBeUndefined();
    expect(unsupportedChatCompletionClaim('Draft: “I researched three sources.” I published your post.', [], "Draft a short message.")).toBeTruthy();
  });
});
