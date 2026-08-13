import { describe, expect, it } from "vitest";
import { addSandboxEvent, applyOperation, compilePresenceContext, createAgent, deriveActivitySummary, derivePublicHistory, failNativeExecution, formChatPostIntent, formXReplyIntent, initialState, isExplicitXPostRequest, markInboundJudged, markNativeConnectionNeedsAttention, normalizeState, recordPublicFooting, recordStandingIntentNoOp, startPlaygroundSession } from "../lib/runtime";
import { acknowledgeExecution, claimExecutions, createBridgeWithKey, ingestEvents, removeBridge, revokeBridge } from "../lib/bridge";
import { readBridgeCredentialMetadata, readState, writeState } from "../lib/db";
import { nextObservationAt } from "../lib/native-x";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("OpenPresence runtime boundaries", () => {
  it("removes legacy unsolicited Presence messages without touching real chat turns", () => {
    const state = createAgent(input);
    const conversation = state.conversations[0]!;
    conversation.messages.push(
      { id: "state_legacy", role: "agent", content: "I noticed the Presence settings changed.", timestamp: new Date().toISOString(), change: "Presence state updated" },
      { id: "operator_real", role: "operator", content: "Keep the voice direct.", timestamp: new Date().toISOString() },
      { id: "agent_real", role: "agent", content: "I will.", timestamp: new Date().toISOString() },
    );

    const normalized = normalizeState(state);
    expect(normalized.conversations[0]?.messages.map((message) => message.id)).toEqual(["operator_real", "agent_real"]);
  });

  it("creates an agent and a distinct Presence with human-readable meaning files", () => {
    const state = createAgent(input);
    expect(state.onboarded).toBe(true);
    expect(state.agent?.id).not.toBe(state.presence?.id);
    expect(state.files.map((file) => file.kind)).toEqual(["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "GROWTH", "PULSE", "PRESENCE"]);
    expect(state.files.find((file) => file.kind === "TASTE")?.protected).toBe(true);
  });

  it("seeds the default Brain with concrete, natural social voice judgment", () => {
    const brain = createAgent(input).files.find((file) => file.kind === "BRAIN")?.content ?? "";
    expect(brain).toContain("Start from the specific object in front of me.");
    expect(brain).toContain("Do not open with automatic praise, canned agreement");
    expect(brain).toContain("For replies, answer the exact sentence in front of me.");
    expect(brain).toContain("often 8 to 35 words");
    expect(brain).toContain("Avoid filler frames such as \"I agree\"");
    expect(brain).toContain("Voice is craft, not taste");
    expect(brain).toContain("Emoji are seasoning, not grammar.");
    expect(brain).toContain("never invent a network match");
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

  it("can bind media inspection to a specialized model without changing the Agent brain", () => {
    const state = createAgent(input);
    const brain = state.modelProfiles[0]!;
    const next = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "ollama", model: "qwen3-vl:8b", connectionId: "local-ollama" });
    expect(next.modelProfiles[0]?.model).toBe(brain.model);
    expect(next.toolBindings.find((binding) => binding.toolId === "asset.inspect")).toMatchObject({ provider: "ollama", model: "qwen3-vl:8b", connectionId: "local-ollama" });
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

  it("turns an explicit Chat publication request into a native X execution", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    expect(isExplicitXPostRequest("Introduce this Presence on X and invite conversation.")).toBe(true);
    state = formChatPostIntent(state, "I am Jenny, learning to become a useful presence for thoughtful builders. What are you learning right now?");
    expect(state.socialIntents[0]?.affordance).toBe("x.post");
    expect(state.executions[0]?.connector).toBe("native");
    expect(state.executions[0]?.status).toBe("queued");
    expect(state.actions[0]?.executionId).toBe(state.executions[0]?.id);
    expect(state.outcomes).toHaveLength(0);
  });

  it("keeps public footing in Presence context and anchors replies to the observed post", () => {
    let state = createAgent(input);
    state = recordPublicFooting(state, state.presence!.id, { postsPublished: 0, recentPostIds: [], recentInboundIds: ["mention-1"], observedAt: new Date().toISOString() });
    expect(state.presence?.context.publicFooting?.postsPublished).toBe(0);
    expect(compilePresenceContext(state.presence!).publicFooting?.recentInboundIds).toEqual(["mention-1"]);
    state = formXReplyIntent(state, "That is exactly the kind of question I want to explore.", "post-1");
    expect(state.socialIntents[0]?.target).toEqual({ type: "x.post", id: "post-1" });
    expect(state.executions[0]?.target).toEqual({ type: "x.post", id: "post-1" });
  });

  it("keeps observed inbound messages separate from messages already judged", () => {
    let state = createAgent(input);
    state = recordPublicFooting(state, state.presence!.id, { postsPublished: 1, recentPostIds: ["post-1"], recentInboundIds: ["new-mention", "old-mention"], observedAt: new Date().toISOString() });
    state = markInboundJudged(state, state.presence!.id, "old-mention");
    expect(state.presence?.context.publicFooting?.recentInboundIds).toEqual(["new-mention", "old-mention"]);
    expect(state.presence?.context.publicFooting?.judgedInboundIds).toEqual(["old-mention"]);
    expect(state.presence?.context.publicFooting?.judgedInboundIds).not.toContain("new-mention");
  });

  it("gives each Presence its own brief without changing the Agent meaning files", () => {
    let state = createAgent(input);
    const originalFiles = Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]));
    const firstId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, purpose: "Become a recognizable voice among founders.", primaryTerritory: ["Persistent agents", "Agent memory"] } } });
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny-builds", mode: "agent", accent: "#D68754" } });
    const secondId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, purpose: "Help product teams make AI understandable.", primaryTerritory: ["Product design", "AI teams"] } } });
    expect(state.presences.find((item) => item.id === firstId)?.brief.primaryTerritory).toEqual(["Persistent agents", "Agent memory"]);
    expect(state.presences.find((item) => item.id === secondId)?.brief.primaryTerritory).toEqual(["Product design", "AI teams"]);
    expect(Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(originalFiles);
  });

  it("keeps Presence boundaries in judgment context without hiding Social Mirror objects", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, boundaries: ["Partisan politics"] } } });
    const session = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(session, { sessionId: session.playgroundSessions[0]!.id, actionId: "post", actorName: "Maya", content: "A political claim that this Presence should understand before deciding whether to engage." });
    expect(state.mirrorObjects.some((item) => item.content?.text?.includes("political claim"))).toBe(true);
    expect(compilePresenceContext(state.presence!).brief.boundaries).toEqual(["Partisan politics"]);
  });

  it("compiles only the active Presence Brief and keeps Ghost specialization local", () => {
    let state = createAgent(input);
    const firstId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, primaryTerritory: ["Persistent agents"] } } });
    state = applyOperation(state, { type: "createPresence", input: { channel: "x", handle: "@jenny-ghost", mode: "ghost", accent: "#D68754" } });
    const ghostId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, primaryTerritory: ["Alex's public work"] } } });
    expect(compilePresenceContext(state.presences.find((item) => item.id === firstId)!).brief.primaryTerritory).toEqual(["Persistent agents"]);
    expect(compilePresenceContext(state.presences.find((item) => item.id === ghostId)!).brief.primaryTerritory).toEqual(["Alex's public work"]);
    expect(state.presences.find((item) => item.id === ghostId)?.mode).toBe("ghost");
  });

  it("persists Presence Brief changes from typed conversation without rewriting protected meaning", () => {
    let state = createAgent(input);
    const originalFiles = Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]));
    state = applyOperation(state, { type: "sendMessage", content: "Make this account mostly about persistent agents." });
    state = applyOperation(state, { type: "sendMessage", content: "Founders and agent builders are the audience." });
    state = applyOperation(state, { type: "sendMessage", content: "Don’t get involved in culture-war arguments here." });
    state = applyOperation(state, { type: "sendMessage", content: "Technical AI infrastructure is adjacent, but not the main thing." });
    expect(state.presence?.brief.primaryTerritory).toEqual(["persistent agents"]);
    expect(state.presence?.brief.audience).toBe("Founders and agent builders");
    expect(state.presence?.brief.boundaries).toContain("culture-war arguments");
    expect(state.presence?.brief.adjacentTerritory).toContain("Technical AI infrastructure");
    expect(state.files.find((file) => file.kind === "PRESENCE")?.content).toContain("Presence brief");
    expect(state.changeSets.filter((item) => item.summary.includes("Presence Brief"))).toHaveLength(4);
    expect(Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(originalFiles);
  });

  it("records a native delivery failure without inventing an external outcome", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A useful first point of view.");
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "X rejected this action: write permission unavailable.");
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X rejected this action: write permission unavailable.");
    expect(state.executions[0]?.status).toBe("failed");
    expect(state.executions[0]?.externalRef).toBeUndefined();
    expect(state.outcomes[0]?.status).toBe("failed");
    expect(state.nativeConnections[0]?.status).toBe("needs-attention");
    expect(deriveActivitySummary(state).current.label).toBe("X delivery failed");
  });

  it("keeps the Social Mirror connected when delivery is blocked by X billing", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X has no API credits remaining for this app.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("no API credits");
    expect(state.nativeConnections[0]?.healthMessage).toBeUndefined();
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

  it("scopes Activity summary to the Presence environment", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state.events.unshift({ id: "sandbox-pulse", type: "system", title: "Pulse completed", detail: "Sandbox pulse", time: new Date().toISOString(), tone: "positive", presenceId: state.presence!.id, sessionId: session.id });
    expect(deriveActivitySummary(state).lastPulseAt).toBeDefined();

    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    expect(deriveActivitySummary(state).lastPulseAt).toBeUndefined();
  });

  it("persists custom rhythm and quiet hours without changing execution permissions", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } } });
    expect(state.presence).toMatchObject({ pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } });
    expect(state.presence?.execution.post).toBe("auto");
    expect(deriveActivitySummary(state).rhythm.quietHours).toBe("22:00–07:00");
  });

  it("moves automatic observation past an overnight quiet-hours window", () => {
    const state = createAgent(input);
    const next = nextObservationAt({ ...state.presence!, pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } }, new Date(2026, 7, 13, 21, 50).getTime());
    const nextDate = new Date(next);
    expect(nextDate.getHours()).toBe(7);
    expect(nextDate.getMinutes()).toBe(0);
  });

  it("treats a successfully reconciled empty Mirror as up to date", () => {
    const state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read", account: { id: "account-1", username: "jenny_ai", name: "Jenny" }, observation: { status: "up-to-date", lastObservedAt: new Date().toISOString(), nextObservationAt: new Date(Date.now() + 300_000).toISOString(), ownPostCount: 0, mentionCount: 0, conversationCount: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Watching X");
    expect(summary.nextAttention.label).toBe("Next X observation");
    expect(summary.rhythm.attention).toBe("Every 5 min");
  });

  it("does not let an old delivery mask a newer Mirror observation", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read", account: { id: "account-1", username: "jenny_ai", name: "Jenny" }, observation: { status: "up-to-date", lastObservedAt: new Date().toISOString(), nextObservationAt: new Date(Date.now() + 300_000).toISOString(), ownPostCount: 1, mentionCount: 0, conversationCount: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A useful point of view.");
    state.executions[0]!.status = "succeeded";
    state.executions[0]!.updatedAt = new Date(Date.now() - 60_000).toISOString();
    state.events.unshift({ id: "mirror-now", type: "system", title: "Social Mirror updated", detail: "Observed 1 public post and 0 inbound mentions.", time: new Date().toISOString(), tone: "positive", presenceId: state.presence!.id });
    expect(deriveActivitySummary(state).current.label).toBe("Watching X");
  });

  it("surfaces a standing intent as the next explicit consideration", () => {
    const state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const summary = deriveActivitySummary(state);
    expect(summary.nextAttention.label).toBe("Next standing intent");
    expect(summary.nextAttention.detail).toContain("Tuesday at 08:00");
    expect(summary.nextIntent.label).toContain("Teach one useful thing");
  });

  it("reopens a Calendar slot when its schedule moves after an evaluation", () => {
    let state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Wednesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state.calendar[0]!.lastEvaluatedAt = new Date().toISOString();
    state = applyOperation(state, { type: "editSlot", id: state.calendar[0]!.id, instruction: "Teach one useful thing", day: "Wednesday", time: "09:00", objective: "education", executionWindow: "09:00–10:00" });
    expect(state.calendar[0]!.lastEvaluatedAt).toBeUndefined();
    expect(state.standingIntents[0]!.trigger.config.time).toBe("09:00");
    expect(state.standingIntents[0]!.executionWindow).toEqual({ startsAt: "09:00", endsAt: "10:00" });
  });

  it("shows a Calendar no-op as the current truth instead of an older delivery", () => {
    let state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Wednesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = recordStandingIntentNoOp(state, state.presence!.id, state.calendar[0]!.instruction);
    const summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for a better moment");
    expect(summary.current.detail).toContain("schedule grants permission");
  });

  it("projects only verified public expression into Calendar history", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A durable public point of view.");
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "verified-1" };
    execution.executedAt = new Date().toISOString();
    state.outcomes.unshift({ id: "outcome-verified", socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: new Date().toISOString(), metrics: { follows: 7 } });
    state.mirrorObjects.unshift({ id: "private-observation", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "inbound-1" }, objectType: "post", author: { displayName: "Someone else" }, content: { text: "A private-to-the-model observation" }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "private-thread", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "post", text: "A durable public point of view.", externalRef: { id: "verified-1" }, externalUrl: "https://x.com/hourandcode/status/verified-1", metrics: { follows: 7 } });
  });

  it("does not invent a live X destination for Sandbox history", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "sandbox-post", bridgeId: "sandbox:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "sandbox-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "A rehearsal only." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "sandbox-session" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history[0]).toMatchObject({ externalRef: { id: "sandbox-1" }, environment: "sandbox" });
    expect(history[0]?.externalUrl).toBeUndefined();
  });

  it("keeps Ghost representation Presence-scoped and reviewable", () => {
    const state = createAgent(input);
    const originalSoul = state.files.find((file) => file.kind === "SOUL")?.content;
    const ghost = applyOperation(state, { type: "setPresence", patch: { mode: "ghost" } });
    expect(ghost.presence?.ghostProfile?.subject).toBe("Me / my organization");
    expect(ghost.presence?.context.ghostProfile?.priorities).toBe("");
    const configured = applyOperation(ghost, { type: "setPresence", patch: { ghostProfile: { subject: "Alex Rivera", priorities: "Build trustworthy open-source AI products.", preferences: "Prefer clear evidence and useful depth over hype.", voice: "Warm, direct, and technically sharp.", boundaries: "Never invent my views or disclose private community context." } } });
    expect(configured.presence?.ghostProfile?.subject).toBe("Alex Rivera");
    expect(configured.presence?.context.ghostProfile?.boundaries).toContain("private community");
    expect(configured.files.find((file) => file.kind === "SOUL")?.content).toBe(originalSoul);
    const agentOwned = applyOperation(configured, { type: "setPresence", patch: { mode: "agent" } });
    expect(agentOwned.presence?.context.ghostProfile).toBeUndefined();
    expect(agentOwned.presence?.ghostProfile?.subject).toBe("Alex Rivera");
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

  it("edits Presence and Agent names without crossing identity boundaries", () => {
    let state = createAgent(input);
    const originalHandle = state.presence!.handle;
    const soul = state.files.find((file) => file.kind === "SOUL")?.content;
    state = applyOperation(state, { type: "setPresence", patch: { name: "Jenny in Founders" } });
    expect(state.presence?.name).toBe("Jenny in Founders");
    expect(state.presence?.handle).toBe(originalHandle);
    expect(state.presence?.context.publicIdentity.displayName).toBe("Jenny in Founders");
    state = applyOperation(state, { type: "renameAgent", name: "Juno" });
    expect(state.agent?.name).toBe("Juno");
    expect(state.agents[0]?.name).toBe("Juno");
    expect(state.presence?.name).toBe("Jenny in Founders");
    expect(state.files.find((file) => file.kind === "SOUL")?.content).toBe(soul);
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

  it("creates an enabled skill and configures providers without allowing connection renames", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createSkill", name: "Founder brief", description: "Turn research into a founder brief." });
    expect(state.skills.some((skill) => skill.name === "Founder brief")).toBe(true);
    expect(state.agentSkills.some((binding) => binding.enabled && binding.skillId === state.skills.at(-1)?.id)).toBe(true);
    const skillId = state.skills.at(-1)!.id;
    state = applyOperation(state, { type: "editSkill", id: skillId, name: "Founder brief", description: "Turn research into a concise, evidence-backed founder brief." });
    expect(state.skills.find((skill) => skill.id === skillId)?.description).toBe("Turn research into a concise, evidence-backed founder brief.");
    expect(state.agentSkills.find((binding) => binding.skillId === skillId)?.enabled).toBe(true);
    state = applyOperation(state, { type: "configureProvider", provider: "ollama", label: "Ollama local", endpoint: "http://localhost:11434" });
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.label).toBe("Ollama");
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.status).toBe("local");
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.endpoint).toBe("http://localhost:11434");
    state = applyOperation(state, { type: "configureProvider", provider: "openrouter", label: "My renamed router", hasSecret: true, secret: "not-stored-by-runtime" });
    expect(state.providerConnections.find((connection) => connection.provider === "openrouter")).toMatchObject({ label: "OpenRouter", status: "available", secretConfigured: true });
    state = applyOperation(state, { type: "configureProvider", provider: "openrouter", label: "Another attempted rename" });
    expect(state.providerConnections.find((connection) => connection.provider === "openrouter")?.label).toBe("OpenRouter");
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
    const definition = { id: "founder-community", name: "Founder Community", icon: "community", domain: "https://www.skool.com/", entities: [{ id: "member", label: "Member" }, { id: "post", label: "Post" }], affordances: [{ id: "post", label: "Posts", description: "Publish a post." }], formats: [{ id: "founder-community.text-post", label: "Text post", description: "A text post.", channel: "founder-community" }], relationships: [], metrics: [], privacyDefaults: { visibility: "private-community" as const, shareability: "presence-only" as const }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    let state = createAgent(input);
    state = applyOperation(state, { type: "createPresence", input: { channel: definition.id, handle: "Jenny in Founders", mode: "agent", accent: "#D68754", channelDefinition: definition } });
    expect(state.channelDefinitions.find((item) => item.id === definition.id)?.domain).toBe("https://www.skool.com/");
    expect(state.presence?.name).toBe("Jenny in Founders");
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
