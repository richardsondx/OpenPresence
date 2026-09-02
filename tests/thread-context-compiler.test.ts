import { describe, expect, it } from "vitest";
import { compileThreadContext } from "@/lib/thread-context-compiler";
import { cloneState, createAgent } from "@/lib/runtime";
import type { Assignment, OperatorConversation, OperatorThread } from "@/lib/types";

const thread: OperatorThread = {
  id: "thread:operator-1",
  agentId: "agent-1",
  title: "Main thread",
  scope: { kind: "presence", presenceId: "presence-1" },
  originThreadId: null,
  communicationThreadId: "operator-1",
  status: "active",
  messageIds: [],
  assignmentIds: ["assignment-1"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const conversation: OperatorConversation = {
  id: "operator-1",
  agentId: "agent-1",
  presenceId: "presence-1",
  title: "Main thread",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  messages: [{ id: "m-1", role: "operator", content: "A very long note ".repeat(200), timestamp: "2026-09-01T00:01:00.000Z" }],
};

const assignment = { id: "assignment-1", title: "Publish the useful idea", status: "active", instruction: "Publish the useful idea", progress: { verified: 0, required: 1 } } as Assignment;

describe("ThreadContextCompiler", () => {
  it("normalizes existing operator conversations into Agent-first thread records", () => {
    const state = createAgent({ name: "Genny", description: "A useful Agent", mode: "agent", handle: "@genny", accent: "#d68754" });
    const presenceId = state.presence!.id;
    const conversationId = "operator-conversation-1";
    state.operatorConversations = [{
      id: conversationId,
      agentId: state.agent!.id,
      presenceId,
      title: "Private conversation",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:01:00.000Z",
      messages: [],
    }];

    const normalized = cloneState(state);
    expect(normalized.operatorThreads).toHaveLength(1);
    expect(normalized.operatorThreads?.[0]).toMatchObject({
      communicationThreadId: conversationId,
      originThreadId: null,
      scope: { kind: "presence", presenceId },
    });
  });

  it("keeps context bounded and preserves unknown provenance as null", () => {
    const result = compileThreadContext(thread, conversation, [assignment], { maxCharsPerMessage: 100 });
    expect(thread.originThreadId).toBeNull();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.length).toBe(100);
    expect(result.assignments[0]).toMatchObject({ id: "assignment-1", completion: "0/1 verified" });
  });
});
