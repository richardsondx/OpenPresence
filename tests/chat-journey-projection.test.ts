import { describe, expect, it } from "vitest";
import { GET } from "../app/api/state/route";
import { writeState } from "../lib/db";
import { createAgent } from "../lib/runtime";
import type { OpenPresenceState } from "../lib/types";

describe("bounded Chat work history", () => {
  it("retains the request owning recent receipts beyond the message window", async () => {
    const state = createAgent({ name: "Journey projection", description: "Scoped evidence", mode: "agent", handle: "@journey", accent: "#777777" });
    const timestamp = new Date().toISOString();
    state.operatorConversations = [{ id: "long-chat", agentId: state.agent!.id, presenceId: state.presence!.id, title: "Main", createdAt: timestamp, updatedAt: timestamp, messages: [
      { id: "parent", role: "operator", content: "Research this topic", timestamp },
      ...Array.from({ length: 110 }, (_, index) => ({ id: `receipt-${index}`, role: "system" as const, replyToMessageId: "parent", content: JSON.stringify({ tool: "read_web", result: { title: `Source ${index}` } }), timestamp })),
    ] }];
    writeState(state, { force: true });
    const response = await GET(new Request("http://localhost/api/state?projection=chat"));
    expect(response.status).toBe(200);
    const projected = await response.json() as OpenPresenceState;
    const messages = projected.operatorConversations![0].messages;
    expect(messages).toHaveLength(101);
    expect(messages[0]).toMatchObject({ id: "parent", role: "operator" });
    expect(messages.at(-1)?.id).toBe("receipt-109");
  });
});
