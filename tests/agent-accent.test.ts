import { describe, expect, it } from "vitest";
import { applyOperation, createAgent } from "../lib/runtime";

describe("Agent accent colors", () => {
  it("updates an inactive Agent without changing the active workspace", () => {
    let state = createAgent({ name: "Jenny", description: "A careful social Agent.", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const jennyId = state.agent!.id;
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "A research Agent.", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });

    const changed = applyOperation(state, { type: "setAgentAccent", agentId: jennyId, accent: "#5B9A75" });

    expect(changed.agent?.name).toBe("Atlas");
    expect(changed.agent?.accent).toBe("#7A8FD8");
    expect(changed.agents.find((agent) => agent.id === jennyId)?.accent).toBe("#5B9A75");
    const jennyWorkspace = changed.agentWorkspaces.find((workspace) => workspace.agent?.id === jennyId);
    expect(jennyWorkspace?.agent?.accent).toBe("#5B9A75");
    expect(jennyWorkspace?.presences.every((presence) => presence.accent === "#5B9A75")).toBe(true);
  });

  it("updates the active Agent accent when selected", () => {
    let state = createAgent({ name: "Jenny", description: "A careful social Agent.", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state = applyOperation(state, { type: "setPresence", patch: { avatarLook: "pirate" } });
    const changed = applyOperation(state, { type: "setAgentAccent", agentId: state.agent!.id, accent: "#4F7CAC" });

    expect(changed.agent?.accent).toBe("#4F7CAC");
    expect(changed.agents.find((agent) => agent.id === state.agent!.id)?.accent).toBe("#4F7CAC");
    expect(changed.presences.every((presence) => presence.accent === "#4F7CAC")).toBe(true);
    expect(changed.presence?.avatarLook).toBe("pirate");
  });

  it("keeps newly created Presences on the Agent accent", () => {
    let state = createAgent({ name: "Jenny", description: "A careful social Agent.", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state = applyOperation(state, { type: "setAgentAccent", agentId: state.agent!.id, accent: "#5B9A75" });
    const changed = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny-builds", mode: "agent", accent: "#C96B45" } });

    expect(changed.presence?.accent).toBe("#5B9A75");
  });
});
