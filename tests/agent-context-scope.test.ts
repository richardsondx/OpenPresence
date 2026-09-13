import { describe, expect, it } from "vitest";
import { readStateForBridge, readStateForContext, readStateSnapshotForContext, readStateViewForContext, presenceContextConflict, writeState } from "../lib/db";
import { createBridgeWithKey } from "../lib/bridge";
import { applyOperation, createAgent, initialState, normalizeState } from "../lib/runtime";

describe("Agent/Presence context scope", () => {
  it("rejects a stale Agent resolving the canonical active Presence", () => {
    const canonical = { activeAgentId: "agent_genny", activePresenceId: "presence_genny" } as const;

    expect(presenceContextConflict(canonical, { agentId: "agent_jenny", presenceId: "presence_genny" })).toBe(true);
    expect(presenceContextConflict(canonical, { agentId: "agent_genny", presenceId: "presence_genny" })).toBe(false);
    expect(presenceContextConflict(canonical, { agentId: "agent_jenny", presenceId: "presence_jenny" })).toBe(false);
  });

  it("repairs legacy records that carry the wrong Agent ID for a Presence", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const presenceId = state.presence!.id;
    state.operatorNudges = [{
      id: "legacy-nudge",
      agentId: "agent_old_copy",
      presenceId,
      conversationId: "conversation-1",
      messageId: "message-1",
      content: "Inspect this post.",
      status: "resolved",
      sourceUrls: [],
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attentionEpisodeIds: [],
    }];

    const normalized = normalizeState(state);
    expect(normalized.operatorNudges?.[0]?.agentId).toBe(state.agent!.id);
  });

  it("rejects stale scope on mutable, snapshot, and hot read paths", () => {
    const state = createAgent({ name: "Genny", description: "A test Presence", mode: "agent", handle: "@genny", accent: "#D68754" });
    writeState(state);
    const context = { agentId: "agent_stale", presenceId: state.presence!.id };
    try {
      expect(() => readStateForContext(context)).toThrow(/Refusing the stale Agent/);
      expect(() => readStateSnapshotForContext(context)).toThrow(/Refusing the stale Agent/);
      expect(() => readStateViewForContext(context)).toThrow(/Refusing the stale Agent/);
    } finally {
      writeState(initialState());
    }
  });

  it("prefers a durable Agent workspace over a same-name legacy Presence", () => {
    let state = createAgent({ name: "Jenny", description: "A test Presence", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const jennyPresence = state.presence!;
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "A second Agent", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    const jennyId = state.agents.find((agent) => agent.name === "Jenny")!.id;
    state.presences = [{ ...state.presence!, id: "presence_legacy_jenny", name: "Jenny", handle: "@jenny" }];

    const selected = applyOperation(state, { type: "selectAgent", id: jennyId });
    expect(selected.presence?.id).toBe(jennyPresence.id);
  });

  it("resolves an unqualified Presence read to its unique inactive Agent owner", () => {
    let state = createAgent({ name: "Jenny", description: "A test Presence", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const jennyPresenceId = state.presence!.id;
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "A second Agent", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    writeState(state);
    try {
      const scoped = readStateSnapshotForContext({ presenceId: jennyPresenceId });
      expect(scoped.agent?.name).toBe("Jenny");
      expect(scoped.presence?.id).toBe(jennyPresenceId);
    } finally {
      writeState(initialState());
    }
  });

  it("fails closed when durable workspaces claim one Presence for multiple Agents", () => {
    let state = createAgent({ name: "Jenny", description: "A test Presence", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "A second Agent", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    const jennyId = state.agents.find((agent) => agent.name === "Jenny")!.id;
    const jennyWorkspace = state.agentWorkspaces.find((workspace) => workspace.agent?.id === jennyId)!;
    jennyWorkspace.presence = state.presence!;
    jennyWorkspace.presences = [state.presence!];
    writeState(state, { persistAgentWorkspaces: true });
    try {
      expect(() => readStateSnapshotForContext({ agentId: jennyId, presenceId: state.presence!.id })).toThrow(/no single owner can be proven/);
    } finally {
      writeState(initialState());
    }
  });

  it("fails closed before a Bridge can claim work under an ambiguous Presence", () => {
    let state = createAgent({ name: "Jenny", description: "A test Presence", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "A second Agent", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Atlas Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = bridgeResult.state;
    const jennyId = state.agents.find((agent) => agent.name === "Jenny")!.id;
    const jennyWorkspace = state.agentWorkspaces.find((workspace) => workspace.agent?.id === jennyId)!;
    jennyWorkspace.presence = state.presence!;
    jennyWorkspace.presences = [state.presence!];
    writeState(state, { persistAgentWorkspaces: true });
    try {
      expect(() => readStateForBridge(bridgeResult.bridge!.id)).toThrow(/no single owner can be proven/);
    } finally {
      writeState(initialState());
    }
  });
});
