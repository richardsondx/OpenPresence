import { describe, expect, it } from "vitest";
import { compileThreadContext } from "@/lib/thread-context-compiler";
import { applyOperation, cloneState, createAgent } from "@/lib/runtime";
import { createOperatorNudge, recordOperatorConversationMessage } from "@/lib/operator-chat";
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

  it("persists Main and the conversation lifecycle without touching Agent identity", () => {
    const state = createAgent({ name: "Genny", description: "A useful Agent", mode: "agent", handle: "@genny", accent: "#d68754" });
    const presenceId = state.presence!.id;
    expect(state.operatorThreads?.[0]).toMatchObject({ title: "Main", status: "active" });
    const created = applyOperation(state, { type: "createOperatorThread", presenceId });
    const thread = created.operatorThreads?.find((item) => item.title === "New conversation");
    expect(thread).toBeDefined();
    const messaged = recordOperatorConversationMessage(created, { presenceId, threadId: thread!.id, content: "Promote the launch to builders" });
    const updated = cloneState(messaged);
    expect(updated.agent?.id).toBe(state.agent?.id);
    expect(updated.operatorConversations?.find((item) => item.threadId === thread!.id)?.messages[0].content).toBe("Promote the launch to builders");
    expect(updated.operatorThreads?.find((item) => item.id === thread!.id)?.title).toBe("Promote the launch to builders");
    const renamed = applyOperation(updated, { type: "renameOperatorThread", threadId: thread!.id, title: "Launch positioning" });
    expect(renamed.operatorThreads?.find((item) => item.id === thread!.id)?.title).toBe("Launch positioning");
    const archived = applyOperation(renamed, { type: "archiveOperatorThread", threadId: thread!.id });
    expect(archived.operatorThreads?.find((item) => item.id === thread!.id)?.status).toBe("archived");
    expect(archived.operatorThreads?.find((item) => item.title === "Main")?.status).toBe("active");
  });

  it("keeps an implicit Chat send on Main when legacy named conversations exist", () => {
    const state = createAgent({ name: "Genny", description: "A useful Agent", mode: "agent", handle: "@genny", accent: "#d68754" });
    const presenceId = state.presence!.id;
    state.operatorConversations = [{
      id: "legacy-project-conversation",
      agentId: state.agent!.id,
      presenceId,
      title: "First message became a work title",
      threadId: "thread:legacy-project",
      scope: { kind: "presence", presenceId },
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      messages: [],
    }];
    const result = createOperatorNudge(state, { presenceId, threadId: `thread:${presenceId}`, content: "What are you working on?", clientRequestId: "client-1" });
    expect(result.state.operatorConversations?.[0]).toMatchObject({ title: "Main", threadId: `thread:${presenceId}` });
    expect(result.state.operatorConversations?.[0]?.messages[0]?.content).toBe("What are you working on?");
    expect(result.state.operatorConversations?.some((item) => item.title === "First message became a work title")).toBe(true);
  });
});
