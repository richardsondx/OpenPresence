import { describe, expect, it } from "vitest";
import { recordChatExecutionProgress } from "../lib/chat-execution-progress";
import { applyOperation, createAgent, formChatPostIntent } from "../lib/runtime";

function pending() {
  let state = createAgent({ name: "Approval test", description: "Useful ideas", mode: "agent", handle: "@approval", accent: "#777" });
  state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
  state = formChatPostIntent(state, "A useful idea.");
  const execution = state.executions[0]!;
  execution.environment = "live";
  execution.connector = "bridge";
  execution.bridgeId = "bridge-test";
  state.operatorConversations = [{ id: "chat", agentId: state.agent!.id, presenceId: state.presence!.id, title: "Approval", createdAt: execution.createdAt, updatedAt: execution.updatedAt, messages: [{ id: "request", role: "operator", content: "Post a useful idea", timestamp: execution.createdAt }, ...["first", "second"].map(id => ({ id, role: "system" as const, content: JSON.stringify({ tool: "social_action", executionIds: [execution.id], result: [{ executionId: execution.id, status: "awaiting-review" }] }), replyToMessageId: "request", timestamp: execution.createdAt }))] }];
  return state;
}

describe("Chat approval follow-through", () => {
  it("records one grounded queue acknowledgement in the owning turn without changing historical receipts", () => {
    const before = pending();
    let next = applyOperation(structuredClone(before), { type: "approveExecution", id: before.executions[0]!.id });
    next = applyOperation(next, { type: "executeIntent", id: before.executions[0]!.socialIntentId });
    recordChatExecutionProgress(next, before);
    const messages = next.operatorConversations![0]!.messages;
    expect(messages.filter(message => message.role === "presence")).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({ replyToMessageId: "request", content: expect.stringContaining("Waiting for the authorized browser") });
    expect(next.executions[0]!.reviewReason).toBeUndefined();
    expect(messages[1]!.content).toBe(before.operatorConversations![0]!.messages[1]!.content);
    recordChatExecutionProgress(next, before);
    recordChatExecutionProgress(next, structuredClone(next));
    expect(messages.filter(message => message.role === "presence")).toHaveLength(1);
  });

  it("requires scoped successful outcome evidence and survives a persisted-state round trip", () => {
    const before = pending();
    before.executions[0]!.status = "queued";
    const next = structuredClone(before);
    next.executions[0]!.status = "succeeded";
    next.executions[0]!.externalRef = { type: "x.post", id: "123" };
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.filter(message => message.role === "presence")).toHaveLength(0);
    next.outcomes.push({ id: "verified", socialIntentId: next.executions[0]!.socialIntentId, executionId: next.executions[0]!.id, presenceId: next.presence!.id, environment: "live", status: "succeeded", observedAt: next.executions[0]!.updatedAt, metrics: {} });
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.at(-1)?.content).toContain("completed and verified");
    const restored = JSON.parse(JSON.stringify(next));
    recordChatExecutionProgress(restored, before);
    expect(restored.operatorConversations[0].messages.filter((message: { role: string }) => message.role === "presence")).toHaveLength(1);
  });

  it("tracks transitions even when a worker writes the same object again", () => {
    const state = pending();
    recordChatExecutionProgress(state);
    state.executions[0]!.status = "queued";
    recordChatExecutionProgress(state, state);
    expect(state.operatorConversations![0]!.messages.at(-1)?.content).toContain("approved");
    state.executions[0]!.status = "verification-pending";
    recordChatExecutionProgress(state, state);
    expect(state.operatorConversations![0]!.messages.at(-1)?.content).toContain("awaiting delivery verification");
  });

  it("keeps approved-image retrieval failures concise without exposing asset IDs", () => {
    const before = pending();
    before.executions[0]!.status = "queued";
    const next = structuredClone(before);
    next.executions[0]!.status = "failed";
    next.executions[0]!.failure = { code: "UNSUPPORTED_ASSET", message: "The authorized Asset internal-asset-uuid could not be retrieved." };
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.at(-1)?.content).toContain("the post wasn’t sent");
    expect(next.operatorConversations![0]!.messages.at(-1)?.content).not.toContain("internal-asset-uuid");
    expect(next.operatorConversations![0]!.messages.at(-1)?.content).not.toContain("Reload");
  });

  it("uses communication time and repairs an older backdated note without duplicating it", () => {
    const before = pending();
    before.executions[0]!.updatedAt = "2026-10-01T05:58:00.000Z";
    before.operatorConversations![0]!.messages.push({ id: "old-final", role: "presence", replyToMessageId: "request", timestamp: "2026-10-01T05:59:00.000Z", content: "The action awaits review." });
    const next = structuredClone(before);
    next.executions[0]!.status = "queued";
    const observedAt = "2026-10-01T06:20:00.000Z";
    recordChatExecutionProgress(next, before, observedAt);
    const notice = next.operatorConversations![0]!.messages.at(-1)!;
    expect(notice.timestamp).toBe(observedAt);
    expect(next.executions[0]!.updatedAt).toBe(before.executions[0]!.updatedAt);
    notice.timestamp = before.executions[0]!.updatedAt;
    recordChatExecutionProgress(next, structuredClone(next), "2026-10-01T06:21:00.000Z");
    expect(notice.timestamp).toBe("2026-10-01T06:21:00.000Z");
    recordChatExecutionProgress(next, structuredClone(next), "2026-10-01T06:22:00.000Z");
    expect(notice.timestamp).toBe("2026-10-01T06:21:00.000Z");
    expect(next.operatorConversations![0]!.messages.filter(message => message.id === notice.id)).toHaveLength(1);
  });

  it("does not emit notices for old state, foreign Presence or foreign Agent conversations", () => {
    const before = pending();
    const next = structuredClone(before);
    next.executions[0]!.status = "queued";
    recordChatExecutionProgress(next);
    expect(next.operatorConversations![0]!.messages.filter(message => message.role === "presence")).toHaveLength(0);
    next.operatorConversations![0]!.presenceId = "other";
    recordChatExecutionProgress(next, before);
    next.operatorConversations![0]!.presenceId = next.presence!.id;
    next.operatorConversations![0]!.agentId = "other";
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.filter(message => message.role === "presence")).toHaveLength(0);
  });
  it("asks once for renewed image review after explicit legacy retry in the same saved turn", () => {
    const before = pending(); before.executions[0]!.status = "failed";
    const next = structuredClone(before); next.executions[0]!.status = "awaiting-review"; next.executions[0]!.reviewReason = "Review this saved post and image once more. Fresh approval is required.";
    recordChatExecutionProgress(next, before); recordChatExecutionProgress(next, structuredClone(next));
    const replies = next.operatorConversations![0]!.messages.filter(message => message.role === "presence");
    expect(replies).toHaveLength(1); expect(replies[0]).toMatchObject({ replyToMessageId: "request", content: expect.stringContaining("Review this saved post and image once more") }); expect(replies[0]?.content).toContain("hasn’t been sent");
  });

});
