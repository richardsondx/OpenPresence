import { describe, expect, it } from "vitest";
import { readStateForAgent, writeState } from "../lib/db";
import { applyOperation, createAgent, initialState } from "../lib/runtime";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("independent Agent browser contexts", () => {
  it("keeps concurrent Agent workspace writes isolated", () => {
    let state = createAgent(input);
    const jennyId = state.agent!.id;
    state = applyOperation(state, {
      type: "createAdditionalAgent",
      input: { name: "Atlas", description: "Research carefully.", audience: "researchers", mode: "agent", handle: "@atlas", accent: "#7A8FD8" },
    });
    const atlasId = state.agent!.id;
    writeState(state);

    const jennyTab = readStateForAgent(jennyId);
    const atlasTab = readStateForAgent(atlasId);
    writeState(applyOperation(jennyTab, { type: "sendMessage", content: "Jenny-only tab work" }));
    writeState(applyOperation(atlasTab, { type: "sendMessage", content: "Atlas-only tab work" }));

    expect(readStateForAgent(jennyId).agent?.name).toBe("Jenny");
    expect(readStateForAgent(jennyId).messages.some((message) => message.content === "Jenny-only tab work")).toBe(true);
    expect(readStateForAgent(jennyId).messages.some((message) => message.content === "Atlas-only tab work")).toBe(false);
    expect(readStateForAgent(atlasId).agent?.name).toBe("Atlas");
    expect(readStateForAgent(atlasId).messages.some((message) => message.content === "Atlas-only tab work")).toBe(true);
    expect(readStateForAgent(atlasId).messages.some((message) => message.content === "Jenny-only tab work")).toBe(false);

    writeState(initialState());
  });
});
