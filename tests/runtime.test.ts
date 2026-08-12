import { describe, expect, it } from "vitest";
import { applyOperation, compilePresenceContext, createAgent, deriveActivitySummary, initialState } from "../lib/runtime";
import { acknowledgeExecution, claimExecutions, createBridgeWithKey, ingestEvents, removeBridge, revokeBridge } from "../lib/bridge";
import { readBridgeCredentialMetadata, readState, writeState } from "../lib/db";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("OpenPresence runtime boundaries", () => {
  it("creates an agent and a distinct Presence with human-readable meaning files", () => {
    const state = createAgent(input);
    expect(state.onboarded).toBe(true);
    expect(state.agent?.id).not.toBe(state.presence?.id);
    expect(state.files.map((file) => file.kind)).toEqual(["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "GROWTH", "PULSE", "PRESENCE"]);
    expect(state.files.find((file) => file.kind === "TASTE")?.protected).toBe(true);
  });

  it("seeds the Agent with the named mechanical tool bindings", () => {
    const state = createAgent(input);
    expect(state.toolBindings.map((binding) => binding.toolId)).toEqual([
      "web.search",
      "asset.inspect",
      "chart.render",
      "channel.execute",
    ]);
    expect(state.toolBindings.every((binding) => binding.agentId === state.agent?.id)).toBe(true);
  });

  it("creates a proposal instead of silently mutating protected identity", () => {
    const state = createAgent(input);
    const original = state.files.find((file) => file.kind === "TASTE")?.content;
    const next = applyOperation(state, { type: "saveFile", kind: "TASTE", content: "# A new taste" });
    expect(next.files.find((file) => file.kind === "TASTE")?.content).toBe(original);
    expect(next.proposals[0]?.status).toBe("pending");
  });

  it("allows curated learning files to update directly", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "saveFile", kind: "GROWTH", content: "# GROWTH.md\n\nA useful finding." });
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("A useful finding");
    expect(next.proposals).toHaveLength(0);
  });

  it("keeps intention, execution, and no-op outcome visible separately", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "runPulse" });
    expect(state.actions[0]?.intent).toBe("no_op");
    expect(state.actions[0]?.status).toBe("skipped");
    expect(state.metrics.opportunitiesIgnored).toBe(36);
    expect(state.events.some((item) => item.title === "Silence was the right action")).toBe(true);
  });

  it("pauses the Presence deterministically", () => {
    const state = createAgent(input);
    const paused = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    const before = paused.events.length;
    const afterPulse = applyOperation(paused, { type: "runPulse" });
    expect(afterPulse.events.length).toBe(before);
    expect(afterPulse.presence?.status).toBe("paused");
  });

  it("wakes a paused Presence and immediately runs its first attention cycle", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    const beforeActions = state.actions.length;
    const awake = applyOperation(state, { type: "wakePresence" });
    expect(awake.presence?.status).toBe("live");
    expect(awake.actions.length).toBe(beforeActions + 1);
    expect(awake.events.some((item) => item.title === "Jenny woke up")).toBe(true);
    expect(awake.events.some((item) => item.title === "Pulse completed")).toBe(true);
    expect(awake.actions[0]?.intent).toBe("no_op");
    expect(awake.metrics.opportunitiesIgnored).toBe(36);
  });

  it("derives truthful now, next, and rhythm state for Activity", () => {
    let state = createAgent(input);
    let summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for the next meaningful event");
    expect(summary.nextAttention.label).toBe("On demand");
    expect(summary.nextAttention.detail).toContain("No automatic scan");
    expect(summary.rhythm.publishing).toBe("Auto");
    expect(summary.rhythm.replies).toBe("Review");
    expect(summary.lastPulseAt).toBeUndefined();

    state = applyOperation(state, { type: "runPulse" });
    summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for a better moment");
    expect(summary.lastPulseAt).toBeDefined();

    state = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Asleep");
    expect(summary.nextAttention.label).toBe("After waking");
    expect(summary.rhythm.attention).toBe("Asleep");
  });

  it("surfaces a standing intent as the next explicit consideration", () => {
    const state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const summary = deriveActivitySummary(state);
    expect(summary.nextAttention.label).toBe("Next standing intent");
    expect(summary.nextAttention.detail).toContain("Tuesday at 08:00");
    expect(summary.nextIntent.label).toContain("Teach one useful thing");
  });

  it("keeps Ghost representation Presence-scoped and reviewable", () => {
    const state = createAgent(input);
    const originalSoul = state.files.find((file) => file.kind === "SOUL")?.content;
    const ghost = applyOperation(state, { type: "setPresence", patch: { mode: "ghost" } });
    expect(ghost.presence?.ghostProfile?.subject).toBe("Me / my organization");
    expect(ghost.presence?.context.ghostProfile?.priorities).toBe("");
    const configured = applyOperation(ghost, { type: "setPresence", patch: { ghostProfile: { subject: "Richardson Dackam", priorities: "Build trustworthy open-source AI products.", preferences: "Prefer clear evidence and useful depth over hype.", voice: "Warm, direct, and technically sharp.", boundaries: "Never invent my views or disclose private community context." } } });
    expect(configured.presence?.ghostProfile?.subject).toBe("Richardson Dackam");
    expect(configured.presence?.context.ghostProfile?.boundaries).toContain("private community");
    expect(configured.files.find((file) => file.kind === "SOUL")?.content).toBe(originalSoul);
    const agentOwned = applyOperation(configured, { type: "setPresence", patch: { mode: "agent" } });
    expect(agentOwned.presence?.context.ghostProfile).toBeUndefined();
    expect(agentOwned.presence?.ghostProfile?.subject).toBe("Richardson Dackam");
  });

  it("starts cleanly without an agent", () => {
    expect(initialState().onboarded).toBe(false);
  });

  it("keeps multiple Presences separate and derives native capabilities", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#D68754" } });
    expect(next.presences).toHaveLength(2);
    expect(next.presence?.channel).toBe("linkedin");
    expect(next.presence?.capabilities.map((item) => item.id)).toContain("connect");
    expect(next.presence?.capabilities.map((item) => item.id)).not.toContain("quote");
  });

  it("scopes Pulse activity to the requested Presence", () => {
    let state = createAgent(input);
    const firstPresence = state.presence!.id;
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#D68754" } });
    const secondPresence = state.presence!.id;
    const beforePulse = state.events.length;
    state = applyOperation(state, { type: "runPulse", presenceId: firstPresence });
    expect(state.events[0]?.presenceId).toBe(firstPresence);
    expect(state.events.slice(0, state.events.length - beforePulse).some((item) => item.presenceId === secondPresence)).toBe(false);
  });

  it("persists the agent-level model selection", () => {
    const state = applyOperation(createAgent(input), { type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" });
    expect(state.modelProfiles[0]?.model).toBe("gpt-5.6-luna");
    expect(state.modelProfiles[0]?.provider).toBe("openai");
    expect(state.modelProfiles[0]?.quality).toBe("high");
  });

  it("edits a calendar intent without changing its Presence", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const slot = state.calendar[0]!;
    const edited = applyOperation(state, { type: "editSlot", id: slot.id, instruction: "Teach one edited useful thing", day: "Wednesday", time: "09:00", objective: "relationship", executionWindow: "09:00–12:00" });
    expect(edited.calendar[0]?.instruction).toBe("Teach one edited useful thing");
    expect(edited.calendar[0]?.presence).toBe(slot.presence);
    expect(edited.standingIntents[0]?.trigger.config.day).toBe("Wednesday");
  });

  it("creates an enabled skill and configures a provider without storing a secret", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createSkill", name: "Founder brief", description: "Turn research into a founder brief." });
    expect(state.skills.some((skill) => skill.name === "Founder brief")).toBe(true);
    expect(state.agentSkills.some((binding) => binding.enabled && binding.skillId === state.skills.at(-1)?.id)).toBe(true);
    const skillId = state.skills.at(-1)!.id;
    state = applyOperation(state, { type: "editSkill", id: skillId, name: "Founder brief", description: "Turn research into a concise, evidence-backed founder brief." });
    expect(state.skills.find((skill) => skill.id === skillId)?.description).toBe("Turn research into a concise, evidence-backed founder brief.");
    expect(state.agentSkills.find((binding) => binding.skillId === skillId)?.enabled).toBe(true);
    state = applyOperation(state, { type: "configureProvider", provider: "ollama", label: "Ollama local", endpoint: "http://localhost:11434" });
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.status).toBe("local");
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.endpoint).toBe("http://localhost:11434");
  });

  it("switches between isolated Agent workspaces", () => {
    let state = createAgent(input);
    const jennyId = state.agent!.id;
    state = applyOperation(state, { type: "sendMessage", content: "Jenny-only note" });
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "Research carefully.", audience: "researchers", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    expect(state.agent?.name).toBe("Atlas");
    expect(state.agents.map((agent) => agent.name)).toEqual(["Jenny", "Atlas"]);
    expect(state.messages).toHaveLength(0);
    state = applyOperation(state, { type: "selectAgent", id: jennyId });
    expect(state.agent?.name).toBe("Jenny");
    expect(state.messages[0]?.content).toBe("Jenny-only note");
    expect(state.presence?.handle).toBe("@jenny_ai");
  });

  it("stores a Standing Intent instruction and expires evaluated social decisions", () => {
    const state = createAgent(input);
    const scheduled = applyOperation(state, { type: "addSlot", instruction: "Teach the audience one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    expect(scheduled.calendar[0]?.instruction).toBe("Teach the audience one useful thing");
    const evaluated = applyOperation(scheduled, { type: "runSlot", id: scheduled.calendar[0]!.id });
    expect(evaluated.actions[0]?.expiresAt).toBeTruthy();
    expect(evaluated.events[0]?.detail).toContain("expires in 45 minutes");
  });

  it("keeps chat transcripts bounded by explicit conversations", () => {
    let state = createAgent(input);
    const first = state.activeConversationId!;
    state = applyOperation(state, { type: "sendMessage", content: "First thread", conversationId: first });
    state = applyOperation(state, { type: "newConversation" });
    expect(state.conversations).toHaveLength(2);
    expect(state.conversations.find((item) => item.id === first)?.messages).toHaveLength(2);
    expect(state.messages).toHaveLength(0);
    state = applyOperation(state, { type: "selectConversation", id: first });
    expect(state.messages[0]?.content).toBe("First thread");
  });

  it("keeps operator embodiment out of the cognition-safe PresenceContext", () => {
    const state = createAgent(input);
    const context = compilePresenceContext(state.presence!);
    const serialized = JSON.stringify(context);
    expect(context.publicIdentity.mode).toBe("agent");
    expect(context.availableAffordances).toContain("post");
    expect(serialized).not.toMatch(/approval|queue|retry|rate.?limit|api.?key|connection.?health|transport/i);
    expect(serialized).not.toContain("executionEnvelope");
  });

  it("records ChangeSet provenance without making it current state", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "saveFile", kind: "TASTE", content: "# revised taste" });
    expect(next.changeSets[0]?.summary).toContain("Propose TASTE.md change");
    expect(next.files.find((file) => file.kind === "TASTE")?.content).not.toBe("# revised taste");
    expect(next.proposals[0]?.changeSetId).toBe(next.changeSets[0]?.id);
  });

  it("keeps review Execution separate from Social Intent until approval", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
    state = applyOperation(state, { type: "addSlot", instruction: "Explain one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    expect(state.socialIntents[0]?.state).toBe("active");
    expect(state.executions[0]?.status).toBe("awaiting-review");
    const before = state.outcomes.length;
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.outcomes).toHaveLength(before);
    state = applyOperation(state, { type: "approveExecution", id: state.executions[0]!.id });
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.executions[0]?.status).toBe("succeeded");
    expect(state.outcomes).toHaveLength(before + 1);
  });

  it("cannot execute an expired Social Intent", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
    state = applyOperation(state, { type: "addSlot", instruction: "Explain one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    state.socialIntents[0]!.validity.expiresAt = new Date(Date.now() - 1).toISOString();
    state = applyOperation(state, { type: "approveExecution", id: state.executions[0]!.id });
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.socialIntents[0]?.state).toBe("expired");
    expect(state.executions[0]?.status).toBe("expired");
    expect(state.outcomes).toHaveLength(0);
  });

  it("supports a custom channel with a Bridge-backed outbox", () => {
    const definition = { id: "founder-community", name: "Founder Community", entities: [{ id: "member", label: "Member" }, { id: "post", label: "Post" }], affordances: [{ id: "post", label: "Posts", description: "Publish a post." }], formats: [{ id: "founder-community.text-post", label: "Text post", description: "A text post.", channel: "founder-community" }], relationships: [], metrics: [], privacyDefaults: { visibility: "private-community" as const, shareability: "presence-only" as const }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    let state = createAgent(input);
    state = applyOperation(state, { type: "createPresence", input: { channel: definition.id, handle: "Jenny in Founders", mode: "agent", accent: "#D68754", channelDefinition: definition } });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Founder Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["founder-community.text-post"], metrics: [] } } });
    state = result.state;
    state = applyOperation(state, { type: "addSlot", instruction: "Ask the founders what they are learning", day: "Tuesday", time: "08:00", objective: "relationship", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    expect(state.executions[0]?.status).toBe("queued");
    expect(state.executions[0]?.publication?.payload).toEqual({ text: "Ask the founders what they are learning" });
    writeState(state);
    const bridge = state.bridges[0]!;
    const ingested = ingestEvents(bridge, { events: [{ sourceEventId: "evt-1", event: "created", object: { externalRef: { type: "post", id: "28381" }, objectType: "post", author: { displayName: "Maya" }, content: { text: "How are people handling memory?" }, visibility: "private-community", shareability: "presence-only" } }] });
    expect(ingested.mirrorObjects[0]?.externalRef.id).toBe("28381");
    const claimed = claimExecutions(bridge, { executorId: "bridge-test", limit: 1 });
    expect(claimed.executions[0]?.status).toBe("claimed");
    const acknowledged = acknowledgeExecution(bridge, claimed.executions[0]!.id, { executorId: "bridge-test", externalRef: { type: "post", id: "comment-1" } });
    expect(acknowledged.execution.status).toBe("succeeded");
    expect(readState().outcomes[0]?.executionId).toBe(acknowledged.execution.id);
  });

  it("archives deleted Mirror objects and rejects conflicting acknowledgements", () => {
    const state = createAgent(input);
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Founder Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: [], metrics: [] } } });
    const bridge = result.state.bridges[0]!;
    writeState(result.state);
    const created = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete", event: "created", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", content: { text: "A post" }, visibility: "public", shareability: "presence-only" } }] });
    expect(created.mirrorObjects[0]?.archived).toBe(false);
    const deleted = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete-2", event: "deleted", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", visibility: "public", shareability: "presence-only" } }] });
    expect(deleted.mirrorObjects[0]?.archived).toBe(true);
    let queued = applyOperation(deleted, { type: "setPresence", patch: { execution: { post: "auto" } } });
    queued = applyOperation(queued, { type: "addSlot", instruction: "Share one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    queued = applyOperation(queued, { type: "runSlot", id: queued.calendar[0]!.id });
    writeState(queued);
    const claimed = claimExecutions(bridge, { executorId: "bridge-test", limit: 1 });
    const ack = acknowledgeExecution(bridge, claimed.executions[0]!.id, { executorId: "bridge-test", externalRef: { type: "post", id: "external-1" } });
    expect(() => acknowledgeExecution(bridge, ack.execution.id, { executorId: "bridge-test", externalRef: { type: "comment", id: "external-1" } })).toThrow(/different external reference/);
  });

  it("shows safe revoked Bridge credential metadata and removes the revoked Bridge", () => {
    const state = createAgent(input);
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Revoked Community Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: [], metrics: [] } } });
    const bridgeId = result.bridge!.id;
    const revoked = revokeBridge(result.state, bridgeId);
    const revokedBridge = revoked.bridges.find((bridge) => bridge.id === bridgeId)!;
    expect(revokedBridge.state).toBe("offline");
    expect(revokedBridge.keyPrefix).toBe(result.bridge!.keyPrefix);
    expect(revokedBridge.credentialRevokedAt).toBeTruthy();
    expect(readBridgeCredentialMetadata(bridgeId)?.credentialRevokedAt).toBeTruthy();
    expect(JSON.stringify(revoked)).not.toContain(result.key!);

    const removed = removeBridge(revoked, bridgeId);
    expect(removed.bridges.some((bridge) => bridge.id === bridgeId)).toBe(false);
    expect(removed.bridgeSync.some((sync) => sync.bridgeId === bridgeId)).toBe(false);
    expect(removed.events[0]?.title).toBe("Bridge removed");
    expect(readBridgeCredentialMetadata(bridgeId)).toBeUndefined();
  });
});
