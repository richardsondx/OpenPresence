import { describe, expect, it } from "vitest";
import { addSandboxEvent, applyOperation, assignmentIsOpen, assignmentIsSatisfied, cleanSandboxDraft, cleanUserFacingAssignmentInstruction, compileAssignmentInstruction, compilePresenceContext, compileWatch, createAgent, deliverSandboxExecution, defaultPublishingInitiative, deriveActivitySummary, derivePresenceCapabilityManifest, derivePublicHistory, derivePublishingProgress, failNativeExecution, formChatPostIntent, formSandboxIntent, formXReplyIntent, formXActionIntent, identityLeakageReason, inferExplicitDurableContext, inferPresenceIdentityChange, initialState, isActivityDecisionEvent, isExplicitGhostModeRequest, isExplicitXPostRequest, isTeachProposalConfirmation, markInboundJudged, markNativeConnectionNeedsAttention, normalizeState, publicHistoryMatchesPresence, recordPublicFooting, recordSocialDecision, recordStandingIntentNoOp, startPlaygroundSession, stateForContext } from "../lib/runtime";
import { acknowledgeExecution, claimExecutions, createBridgeWithKey, heartbeatBridge, ingestEvents, removeBridge, revokeBridge } from "../lib/bridge";
import { readBridgeCredentialMetadata, readState, writeState } from "../lib/db";
import { nextObservationAt } from "../lib/native-x";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("OpenPresence runtime boundaries", () => {
  it("removes legacy calendar records without removing Assignments", () => {
    const state = applyOperation(createAgent(input), {
      type: "addSlot",
      instruction: "Teach one useful thing",
      day: "Tuesday",
      time: "08:00",
      objective: "education",
      executionWindow: "08:00–11:00",
    });
    const assignmentCount = state.assignments.length;
    const removed = applyOperation(state, { type: "removeLegacyCalendarEntries" });
    expect(removed.calendar).toHaveLength(0);
    expect(removed.standingIntents).toHaveLength(0);
    expect(removed.assignments).toHaveLength(assignmentCount);
    expect(removed.events[0]?.title).toBe("Legacy calendar entries removed");
  });

  it("keeps completed Assignments out of operational views while retaining their record", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Produce one original X post about a useful lesson.", state.presence!.id, "sandbox");
    expect(assignmentIsOpen(assignment)).toBe(true);
    expect(assignmentIsOpen({ ...assignment, status: "completed" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "completed_with_adaptation" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "cancelled" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "blocked" })).toBe(true);
  });

  it("persists a bounded Social Decision and links it to the Activity event", () => {
    const state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { follow: "auto" } } });
    const next = formXActionIntent(state, {
      affordance: "x.follow",
      target: { type: "x.user", id: "maya" },
      decision: {
        decision: "follow",
        summary: "Maya is repeatedly contributing useful ideas in this Presence's territory.",
        focalMirrorObjectIds: ["mirror_post_1"],
        origin: { kind: "inbound_social", refId: "post_1" },
        influences: ["Mission", "Taste", "Current social context"],
        confidence: "medium",
      },
    });
    expect(next.socialDecisions).toHaveLength(1);
    expect(next.socialDecisions[0]).toMatchObject({ decision: "follow", summary: "Maya is repeatedly contributing useful ideas in this Presence's territory.", focalMirrorObjectIds: ["mirror_post_1"] });
    expect(next.socialDecisions[0]?.socialIntentId).toBe(next.socialIntents[0]?.id);
    expect(next.events.some((event) => event.decisionId === next.socialDecisions[0]?.id)).toBe(true);
  });

  it("records NO_OP decisions without inventing a Social Intent", () => {
    const state = createAgent(input);
    const next = recordSocialDecision(state, { decision: "no_op", summary: "The observed cue did not open a useful exchange.", focalMirrorObjectIds: ["mirror_post_2"], origin: { kind: "inbound_social", refId: "post_2" } });
    expect(next.socialDecisions[0]).toMatchObject({ decision: "no_op", summary: "The observed cue did not open a useful exchange.", socialIntentId: undefined });
    expect(next.socialIntents).toHaveLength(0);
  });

  it("keeps internal QA identifiers out of Sandbox publications", () => {
    expect(cleanSandboxDraft("A useful point. QA-TEN-RUN-2026-08-14")).toBe("A useful point.");
    expect(cleanSandboxDraft("QA-ONE-2026-08-14")).toBe("");
    expect(cleanSandboxDraft("A real QA process is worth discussing.")).toBe("A real QA process is worth discussing.");
  });

  it("keeps internal QA identifiers out of Assignment summaries", () => {
    expect(cleanUserFacingAssignmentInstruction("QA-NOW-RUN-2026-08-14: Produce exactly 1 original X post about a practical lesson.")).toBe("Produce exactly 1 original X post about a practical lesson.");
    expect(cleanUserFacingAssignmentInstruction("Produce exactly 1 post. Include QA-NOW-RUN-2026-08-14 only as an internal diagnostic marker and never publish it.")).toBe("Produce exactly 1 post.");
    expect(cleanUserFacingAssignmentInstruction("QA-NOW-RUN-2026-08-14")).toBe("Original post Assignment");
  });

  it("preserves intentional paragraph breaks in long-form Sandbox drafts", () => {
    expect(cleanSandboxDraft("Lead sentence.\n\nEvidence paragraph with  extra spaces.\n\nClosing implication.")).toBe("Lead sentence.\n\nEvidence paragraph with extra spaces.\n\nClosing implication.");
  });

  it("compiles Watches as Presence-scoped attention without changing Agent identity", () => {
    const state = createAgent(input);
    const creator = compileWatch(state.agent!.id, state.presence!.id, "x", "https://x.com/AlexHormozi", "Learn from strong offers without imitating the voice.");
    const topic = compileWatch(state.agent!.id, state.presence!.id, "x", "conversations about AI agent infrastructure");
    expect(creator.kind).toBe("creator");
    expect(creator.title).toBe("@AlexHormozi");
    expect(creator.observation.status).toBe("watching");
    expect(topic.kind).toBe("topic");
    expect(topic.observation.status).toBe("manual");

    const added = applyOperation(state, { type: "createWatch", query: "@AlexHormozi", purpose: "Learn from strong offers", presenceId: state.presence!.id });
    expect(added.watches).toHaveLength(1);
    expect(added.watches[0]?.agentId).toBe(state.agent!.id);
    expect(added.watches[0]?.presenceId).toBe(state.presence!.id);
    expect(added.agent?.name).toBe("Jenny");
    const removed = applyOperation(added, { type: "deleteWatch", id: added.watches[0]!.id });
    expect(removed.watches).toHaveLength(0);
  });

  it("makes Chrome hands a Presence-scoped bridge decision", () => {
    const state = createAgent(input);
    const enabled = applyOperation(state, { type: "setPresenceBrowserAccess", presenceId: state.presence!.id, enabled: true });
    expect(enabled.presence?.browserAccess).toEqual({ enabled: true });
    expect(enabled.presence?.connectionMode).toBe("bridge");
    const disabled = applyOperation(enabled, { type: "setPresenceBrowserAccess", presenceId: state.presence!.id, enabled: false });
    expect(disabled.presence?.browserAccess).toEqual({ enabled: false });
    expect(disabled.presence?.connectionMode).toBe("bridge");
  });

  it("keeps configuration churn out of the Presence decision feed", () => {
    expect(isActivityDecisionEvent({ id: "settings", type: "system", title: "Presence settings updated", detail: "The new execution envelope is active.", time: new Date().toISOString(), tone: "positive" })).toBe(false);
    expect(isActivityDecisionEvent({ id: "pulse", type: "system", title: "Pulse completed", detail: "The channel was checked.", time: new Date().toISOString(), tone: "positive" })).toBe(true);
    expect(isActivityDecisionEvent({ id: "decision", type: "decision", title: "Post intention held", detail: "Silence was selected.", time: new Date().toISOString(), tone: "quiet" })).toBe(true);
  });

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

  it("defaults new Agents to OpenAI GPT 5.6 Luna at medium reasoning", () => {
    const state = createAgent(input);
    expect(state.modelProfiles[0]).toMatchObject({ provider: "openai", model: "gpt-5.6-luna", quality: "medium" });
    expect(state.providerConnections).toContainEqual(expect.objectContaining({ provider: "openai", label: "OpenAI", status: "needs-configuration" }));
    expect(state.providerConnections).not.toContainEqual(expect.objectContaining({ provider: "anthropic" }));
  });

  it("migrates only the untouched Anthropic seed to the new default", () => {
    const legacy = createAgent(input);
    legacy.modelProfiles[0] = { ...legacy.modelProfiles[0]!, provider: "anthropic", model: "claude", quality: "high" };
    legacy.providerConnections = [{ id: "legacy-anthropic", provider: "anthropic", label: "Anthropic", status: "needs-configuration", createdAt: new Date().toISOString() }];
    const migrated = normalizeState(legacy);
    expect(migrated.modelProfiles[0]).toMatchObject({ provider: "openai", model: "gpt-5.6-luna", quality: "medium" });
    expect(migrated.providerConnections).toContainEqual(expect.objectContaining({ provider: "openai", label: "OpenAI" }));

    legacy.modelProfiles[0] = { ...legacy.modelProfiles[0]!, provider: "anthropic", model: "claude", quality: "high" };
    legacy.providerConnections[0]!.status = "available";
    const preserved = normalizeState(legacy);
    expect(preserved.modelProfiles[0]).toMatchObject({ provider: "anthropic", model: "claude", quality: "high" });
  });

  it("keeps Presence Chat session memory separate from durable Agent state", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const originalFiles = state.files.map((file) => `${file.kind}:${file.content}`).join("\n");
    state = applyOperation(state, { type: "newPresenceChatSession", presenceId });
    const session = state.presenceChatSessions[0]!;
    state = applyOperation(state, { type: "sendPresenceChatMessage", presenceId, sessionId: session.id, content: "My name is Bob and I own a submarine.", attachments: [{ name: "chart.png", kind: "image", mimeType: "image/png" }] });
    expect(state.presenceChatSessions[0]?.messages[0]).toMatchObject({ role: "user", content: "My name is Bob and I own a submarine." });
    expect(state.presenceChatSessions[0]?.messages[0]?.attachments?.[0]).toMatchObject({ name: "chart.png", kind: "image" });
    expect(state.conversations[0]?.messages).toHaveLength(0);
    expect(state.proposals).toHaveLength(0);
    expect(state.changeSets).toHaveLength(0);
    expect(state.socialIntents).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
    expect(state.files.map((file) => `${file.kind}:${file.content}`).join("\n")).toBe(originalFiles);
    const firstMessage = state.presenceChatSessions[0]!.messages[0]!;
    state = applyOperation(state, { type: "sendPresenceChatMessage", presenceId, sessionId: session.id, content: "That is the part worth testing.", replyToMessageId: firstMessage.id });
    expect(state.presenceChatSessions[0]?.messages[1]?.replyToMessageId).toBe(firstMessage.id);
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

  it("toggles coherent Agent capabilities without creating an Agent-level channel authority", () => {
    const state = createAgent(input);
    const disabled = applyOperation(state, { type: "setCapability", capabilityId: "research", enabled: false });
    expect(disabled.toolBindings.find((binding) => binding.toolId === "web.search")).toMatchObject({ enabled: false });
    expect(disabled.toolBindings.find((binding) => binding.toolId === "channel.execute")).toMatchObject({ enabled: true });
    const ignored = applyOperation(state, { type: "setCapability", capabilityId: "channel-action", enabled: false });
    expect(ignored.toolBindings.find((binding) => binding.toolId === "channel.execute")).toMatchObject({ enabled: true });
  });

  it("creates a proposal instead of silently mutating protected identity", () => {
    const state = createAgent(input);
    const original = state.files.find((file) => file.kind === "TASTE")?.content;
    const next = applyOperation(state, { type: "saveFile", kind: "TASTE", content: "# A new taste" });
    expect(next.files.find((file) => file.kind === "TASTE")?.content).toBe(original);
    expect(next.proposals[0]?.status).toBe("pending");
  });

  it("submits explicit Presence identity instructions and applies them only after review", () => {
    const state = createAgent(input);
    const instruction = `You are NOT "I'm Jenny — @jenny_ai." You are "Jenny". Your full name is "Jenny Presence".`;
    expect(inferPresenceIdentityChange(instruction, state.presence!)).toEqual({ name: "Jenny Presence" });

    const proposed = applyOperation(state, { type: "sendMessage", content: instruction });
    expect(proposed.proposals[0]).toMatchObject({ status: "pending", file: "PRESENCE", target: { type: "presence_identity", name: "Jenny Presence" } });
    expect(proposed.presence?.name).toBe("Jenny");
    expect(proposed.conversations[0]?.messages.at(-1)?.content).toContain("submitted a Presence identity change");

    const applied = applyOperation(proposed, { type: "resolveProposal", id: proposed.proposals[0]!.id, decision: "approve" });
    expect(applied.presence?.name).toBe("Jenny Presence");
    expect(applied.presence?.publicSelf.displayName).toBe("Jenny Presence");
  });

  it("asks once, then creates a real Mind File proposal when the operator confirms durable context", () => {
    const state = createAgent(input);
    const claim = "Alex Rivera built Jenny in his OpenPresence app.";
    const waiting = applyOperation(state, { type: "sendMessage", content: claim });
    expect(waiting.proposals).toHaveLength(0);
    expect(waiting.conversations[0]?.messages.at(-1)?.content).toContain("Should I submit it as a reviewable proposal?");
    expect(waiting.conversations[0]?.messages.at(-1)?.change).toBe("Teach confirmation requested");
    expect(isTeachProposalConfirmation("yes submit it as proposal")).toBe(true);

    const confirmed = applyOperation(waiting, { type: "sendMessage", content: "yes submit it as proposal" });
    expect(confirmed.proposals[0]).toMatchObject({ file: "MEMORY", status: "pending" });
    expect(confirmed.proposals[0]?.proposed).toContain("Alex Rivera built Jenny in his OpenPresence app");
    expect(confirmed.changeSets[0]?.summary).toBe("Propose MEMORY.md change");
    expect(confirmed.files.find((file) => file.kind === "MEMORY")?.content).not.toContain(claim);
    expect(confirmed.conversations[0]?.messages.at(-1)?.content).toContain("reviewable proposal");
  });

  it("submits explicit memory instructions and applies simple chat settings", () => {
    expect(inferExplicitDurableContext("Remember that Jenny was built for thoughtful agent builders.")).toBe("Jenny was built for thoughtful agent builders");
    const state = createAgent(input);
    const remembered = applyOperation(state, { type: "sendMessage", content: "Remember that Jenny was built for thoughtful agent builders." });
    expect(remembered.proposals[0]?.file).toBe("MEMORY");

    const focused = applyOperation(createAgent(input), { type: "sendMessage", content: "Focus on AI founders." });
    expect(focused.presence?.brief.primaryTerritory).toEqual(["AI founders"]);

    const configured = applyOperation(createAgent(input), { type: "sendMessage", content: "Set replies to manual." });
    expect(configured.presence?.execution.reply).toBe("manual");
    expect(configured.conversations[0]?.messages.at(-1)?.content).toContain("replies");
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

  it("compiles prompt-driven Assignments into hard progress and human judgment context", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish exactly 3 original posts each weekday about offers, pricing, or sales. Choose your own angles and do not repeat yourself.", state.presence!.id, "sandbox");
    expect(assignment.deliverable).toMatchObject({ type: "original_publication", quantity: 3, quantityMode: "exact" });
    expect(assignment.recurrence).toMatchObject({ kind: "weekdays" });
    expect(assignment.editorialContext?.topics).toEqual(["offers", "pricing", "sales"]);
    expect(assignment.editorialContext?.constraints).toContain("Keep the delivered ideas meaningfully distinct.");
    expect(assignment.instruction).toContain("Choose your own angles");
  });

  it("does not treat dates or QA markers as Assignment quantities", () => {
    const state = createAgent(input);
    const one = compileAssignmentInstruction(state, "QA-ONE-2026-08-14: Produce exactly 1 original X post about a practical lesson.", state.presence!.id, "sandbox");
    const ten = compileAssignmentInstruction(state, "QA-TEN-2026-08-14: Produce exactly 10 original X posts about practical lessons.", state.presence!.id, "sandbox");

    expect(one.deliverable).toMatchObject({ quantity: 1, quantityMode: "exact" });
    expect(ten.deliverable).toMatchObject({ quantity: 10, quantityMode: "exact" });
  });

  it("preserves an Assignment's scheduled timing instead of reducing it to Once", () => {
    const state = createAgent(input);
    const scheduled = applyOperation(state, {
      type: "createAssignment",
      instruction: "Produce 2 original Sandbox posts about useful agent ideas.",
      presenceId: state.presence!.id,
      environment: "sandbox",
      schedule: { day: "Thursday", time: "23:25", executionWindow: "23:25–23:25" },
    });

    expect(scheduled.assignments[0]?.schedule).toEqual({ day: "Thursday", time: "23:25", executionWindow: "23:25–23:25" });
  });

  it("allows a Ghost to discuss model capability while still protecting private runtime details", () => {
    const state = createAgent({ ...input, name: "Alex", mode: "ghost", handle: "@richardson" });
    const presence = state.presence!;
    expect(identityLeakageReason(state, presence, "The best AI model is the one that recovers well from failure.")).toBeUndefined();
    expect(identityLeakageReason(state, presence, "OpenAI could build a better model by measuring recovery, not just benchmark peaks.")).toBeUndefined();
    expect(identityLeakageReason(state, presence, "I use the current model provider and exact model behind this account.")).toContain("implementation details");
    expect(identityLeakageReason(state, presence, "This account uses OpenAI and runs on the selected model.")).toContain("implementation details");
  });

  it("counts only verified Sandbox Mirror publications toward an Assignment", () => {
    let state = createAgent(input);
    const session = startPlaygroundSession(state, state.presence!.id);
    state = applyOperation(session, { type: "createAssignment", instruction: "Produce 2 original Sandbox posts about useful agent ideas.", presenceId: state.presence!.id, sessionId: session.playgroundSessions[0]!.id, environment: "sandbox" });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "startAssignment", id: assignment.id, sessionId: session.playgroundSessions[0]!.id });
    expect(state.assignments[0]).toMatchObject({ status: "active", progress: { verified: 0, required: 2 } });
    const formed = formSandboxIntent(state, { sessionId: session.playgroundSessions[0]!.id, affordance: "post", text: "A specific idea about persistent agents.", assignmentId: assignment.id });
    expect(formed.assignments[0]?.progress.verified).toBe(0);
    const execution = formed.executions[0]!;
    const delivered = deliverSandboxExecution(formed, execution.id);
    expect(delivered.assignments[0]?.progress.verified).toBe(1);
    expect(delivered.mirrorObjects[0]?.assignmentId).toBe(assignment.id);
    expect(assignmentIsSatisfied(delivered.assignments[0]!)).toBe(false);
  });

  it("cancels draft and active Assignments without deleting their history or allowing restart", () => {
    let state = createAgent(input);
    const session = startPlaygroundSession(state, state.presence!.id);
    const sessionId = session.playgroundSessions[0]!.id;
    state = applyOperation(session, { type: "createAssignment", instruction: "Produce 2 original Sandbox posts about useful agent ideas.", presenceId: state.presence!.id, sessionId, environment: "sandbox" });
    const assignmentId = state.assignments[0]!.id;

    state = applyOperation(state, { type: "cancelAssignment", id: assignmentId });
    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0]).toMatchObject({ id: assignmentId, status: "cancelled" });
    expect(state.events[0]?.title).toBe("Assignment cancelled");

    const restarted = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    expect(restarted.assignments[0]?.status).toBe("cancelled");

    const activeDraft = applyOperation(restarted, { type: "createAssignment", instruction: "Produce 1 original Sandbox post about a useful agent idea.", presenceId: state.presence!.id, sessionId, environment: "sandbox" });
    const activeAssignmentId = activeDraft.assignments[0]!.id;
    const active = applyOperation(activeDraft, { type: "startAssignment", id: activeAssignmentId, sessionId });
    expect(active.assignments.find((item) => item.id === activeAssignmentId)?.status).toBe("active");
    const cancelledActive = applyOperation(active, { type: "cancelAssignment", id: activeAssignmentId });
    expect(cancelledActive.assignments.find((item) => item.id === activeAssignmentId)?.status).toBe("cancelled");
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

  it("blocks planner metadata at every public intent constructor", () => {
    const plannerObject = '{"conversationDisposition":"react_only","action":"like","rationale":"A quiet signal is enough."}';
    let state = createAgent(input);
    state = formChatPostIntent(state, plannerObject);
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });
    expect(state.mirrorObjects).toHaveLength(0);

    state = createAgent(input);
    state = formXReplyIntent(state, plannerObject, "post-1");
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });

    state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: plannerObject });
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });
    expect(() => deliverSandboxExecution(state, state.executions[0]!.id)).toThrow(/Sandbox delivery is not ready/);
    expect(state.mirrorObjects).toHaveLength(0);
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

  it("records operator-directed replies without giving the operator the Agent's expression", () => {
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "What changed your mind about persistent agents?" });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId, optionalDirection: "Keep it concrete and lightly playful." });
    const directive = state.operatorDirectives[0]!;
    expect(directive).toMatchObject({ target: target.externalRef, requiredAct: "reply", initialAct: "no_op", provenance: "operator", optionalDirection: "Keep it concrete and lightly playful." });
    expect(state.socialIntents).toHaveLength(0);
    state = formSandboxIntent(state, { sessionId: target.sessionId!, affordance: "reply", format: "x.reply", text: "The useful shift was treating memory as a product surface, not a hidden implementation detail.", target: target.externalRef, perceptionTarget: target.externalRef, operatorDirectiveId: directive.id });
    expect(state.socialIntents[0]).toMatchObject({ source: "operator", operatorDirectiveId: directive.id, target: target.externalRef });
    expect(state.executions[0]).toMatchObject({ source: "operator", operatorDirectiveId: directive.id });
  });

  it("does not create an operator reply directive when Replies are off", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { ...state.presence!.execution, reply: "off" } } });
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "A question for Jenny." });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });
    expect(state.operatorDirectives).toHaveLength(0);
  });

  it("records an operator-directed ignore without creating intent or delivery", () => {
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "A post the operator wants left alone." });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;

    state = applyOperation(state, { type: "askPresenceToIgnore", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });

    expect(state.operatorDirectives[0]).toMatchObject({ target: target.externalRef, requiredAct: "no_op", initialAct: "no_op", provenance: "operator", status: "expressed" });
    expect(state.socialIntents).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
    expect(state.events[0]).toMatchObject({ title: `The operator asked ${state.presence!.name} to ignore this post`, sourceObjectId: target.id, tone: "quiet" });

    const eventCount = state.events.length;
    state = applyOperation(state, { type: "askPresenceToIgnore", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });
    expect(state.operatorDirectives).toHaveLength(1);
    expect(state.events).toHaveLength(eventCount);
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
    expect(deriveActivitySummary(state).current.label).toBe("X connection needs attention");
  });

  it("keeps the Social Mirror connected when delivery is blocked by X billing", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X has no API credits remaining for this app.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("no API credits");
    expect(state.nativeConnections[0]?.healthMessage).toBeUndefined();
  });

  it("keeps the native connection healthy when X rejects a reply target", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X rejected this action: You can only reply to or quote posts where you are mentioned or are the author.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("only reply");
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

  it("derives publishing pace from verified original Mirror objects only", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...defaultPublishingInitiative(), mode: "pace", target: { count: 2, period: "day" }, timezone: "UTC" } } });
    state.mirrorObjects.unshift(
      { id: "verified-original", bridgeId: "sandbox:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "verified-original" }, objectType: "post", actorPresenceId: presenceId, content: { text: "A verified original." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "pace-session" },
      { id: "reply-not-original", bridgeId: "sandbox:test", presenceId, channelId: "x", externalRef: { type: "x.reply", id: "reply-not-original" }, objectType: "reply", actorPresenceId: presenceId, content: { text: "A reply." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "pace-session" },
    );
    const progress = derivePublishingProgress(state, presenceId, timestamp);
    expect(progress).toMatchObject({ mode: "pace", target: 2, verifiedOriginals: 1, remaining: 1, status: "seeking" });
  });

  it("keeps standing publishing responsibility after a local no-op", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...defaultPublishingInitiative(), mode: "pace", target: { count: 5, period: "day" }, timezone: "UTC" } } });
    state = applyOperation(state, { type: "runPulse" });
    expect(state.actions[0]?.intent).toBe("no_op");
    expect(derivePublishingProgress(state).status).toBe("seeking");
    expect(state.presence?.publishingInitiative.mode).toBe("pace");
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

  it("surfaces a scheduled Assignment as the next explicit responsibility", () => {
    const state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const summary = deriveActivitySummary(state);
    expect(summary.nextAttention.label).toBe("Next Assignment");
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
    state = recordStandingIntentNoOp(state, state.presence!.id, state.calendar[0]!.instruction, "No specific, timely contribution was available.");
    const summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for a better moment");
    expect(summary.current.detail).toContain("No specific, timely contribution was available.");
  });

  it("projects only delivered public expression into Calendar history", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A durable public point of view.");
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "verified-1" };
    execution.executedAt = new Date().toISOString();
    state.mirrorObjects.unshift({ id: "verified-mirror", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: execution.externalRef, objectType: "post", actorPresenceId: state.presence!.id, originExecutionId: execution.id, content: { text: "A durable public point of view." }, occurredAt: execution.executedAt, observedAt: execution.executedAt, visibility: "public", shareability: "presence-only" });
    state.outcomes.unshift({ id: "outcome-verified", socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: new Date().toISOString(), metrics: { follows: 7 } });
    state.mirrorObjects.unshift({ id: "private-observation", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "inbound-1" }, objectType: "post", author: { displayName: "Someone else" }, content: { text: "A private-to-the-model observation" }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "private-thread", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "post", text: "A durable public point of view.", externalRef: { id: "verified-1" }, externalUrl: "https://x.com/hourandcode/status/verified-1", metrics: { follows: 7 } });
  });

  it("projects an observed Presence-authored Mirror object without an OpenPresence execution", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "ghost-mirror", bridgeId: "native:ghost", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "observed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Published outside the runtime." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ text: "Published outside the runtime.", externalRef: { id: "observed-1" } });
    expect(history[0]?.executionId).toBeUndefined();
  });

  it("retains a deleted X post with its original URL and explicit availability state", () => {
    const state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Jenny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.mirrorObjects.unshift({ id: "deleted-mirror", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "deleted-1" }, objectType: "post", author: { displayName: "Jenny", handle: "example_agent" }, actorPresenceId: state.presence!.id, content: { text: "This was deleted on X." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: true });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history[0]).toMatchObject({ availability: "deleted", externalUrl: "https://x.com/example_agent/status/deleted-1", text: "This was deleted on X." });
  });

  it("attributes connected-channel history by the Presence identity handle", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "identity-mirror", bridgeId: "bridge:identity", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "identity-1" }, objectType: "post", author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "Observed from the connected account." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.text).toBe("Observed from the connected account.");
  });

  it("classifies an authored X reply as a reply when legacy ingestion stored it as a post", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state.mirrorObjects.unshift(
      { id: "reply-parent", bridgeId: "bridge:reply", presenceId, channelId: "x", externalRef: { type: "x.post", id: "parent-1" }, objectType: "post", author: { displayName: "Someone", handle: "someone" }, content: { text: "The conversation starter." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only" },
      { id: "legacy-reply", bridgeId: "bridge:reply", presenceId, channelId: "x", externalRef: { type: "x.post", id: "reply-1" }, parentExternalRef: { type: "x.post", id: "parent-1" }, objectType: "post", actorPresenceId: presenceId, author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "A contextual answer." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only" },
    );
    expect(derivePublicHistory(state, presenceId)).toEqual(expect.arrayContaining([expect.objectContaining({ externalRef: { type: "x.post", id: "reply-1" }, kind: "reply", parentExternalRef: { type: "x.post", id: "parent-1" } })]));
  });

  it("migrates the legacy X browser Bridge declaration to the shipped adapter capabilities", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const heartbeat = new Date(Date.now() - 10_000).toISOString();
    state.presence = { ...state.presence!, connectionMode: "bridge", status: "live" };
    state.presences = state.presences.map((presence) => presence.id === presenceId ? { ...presence, connectionMode: "bridge", status: "live" as const } : presence);
    state.bridges = [{ id: "legacy-x-bridge", presenceId, channelId: "x", name: "OpenPresence Chrome", kind: "bridge", state: "online", adapterStatus: "connected", lastHeartbeatAt: heartbeat, lastSeenAt: heartbeat, capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "repost", "quote", "like", "message"], formats: ["x.post", "x.media-post", "x.thread"], metrics: ["replies", "reactions", "posts"] }, createdAt: heartbeat, updatedAt: heartbeat }];
    const manifest = derivePresenceCapabilityManifest(state, presenceId);
    expect(manifest.items.find((item) => item.capability === "reply")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true });
    expect(manifest.items.find((item) => item.capability === "follow")).toMatchObject({ availability: "unavailable", canExecute: false });
    expect(manifest.items.find((item) => item.capability === "follower_measurement")).toMatchObject({ availability: "available", provider: "Browser Bridge" });
    expect(manifest.items.find((item) => item.capability === "post_performance")).toMatchObject({ availability: "available", provider: "Browser Bridge" });
    expect(manifest.items.find((item) => item.capability === "image")).toMatchObject({ availability: "unavailable", canExecute: false });
    expect(manifest.items.find((item) => item.capability === "video")).toMatchObject({ availability: "unavailable", canExecute: false });
    const created = applyOperation(state, { type: "createAssignment", presenceId, environment: "live", instruction: "Grow this Presence toward 100,000 followers." });
    expect(created.agentRequests.filter((request) => request.kind === "capability")).toHaveLength(0);
  });

  it("does not create public history from a successful execution without a Mirror object", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = formChatPostIntent(state, "Awaiting observation.");
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "not-observed" };
    expect(derivePublicHistory(state, state.presence!.id)).toHaveLength(0);
  });

  it("does not invent a live X destination for Sandbox history", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "sandbox-post", bridgeId: "sandbox:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "sandbox-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "A rehearsal only." }, occurredAt: "2026-08-13T23:03:35.853Z", observedAt: "2026-08-14T05:54:55.172Z", visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "sandbox-session" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history[0]).toMatchObject({ externalRef: { id: "sandbox-1" }, environment: "sandbox", occurredAt: "2026-08-13T23:03:35.853Z", observedAt: "2026-08-14T05:54:55.172Z" });
    expect(history[0]?.externalUrl).toBeUndefined();
  });

  it("keeps Feed history on the active Presence environment", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift(
      { id: "live-feed-post", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "live-feed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Live history." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live" },
      { id: "sandbox-feed-post", bridgeId: "sandbox:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "sandbox-feed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Sandbox history." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "sandbox-session" },
    );
    const liveState = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    const liveHistory = derivePublicHistory(liveState, liveState.presence!.id).filter((item) => publicHistoryMatchesPresence(item, liveState.presence));
    expect(liveHistory.map((item) => item.text)).toEqual(["Live history."]);
    const sandboxState = applyOperation(liveState, { type: "setPresence", patch: { connectionMode: "sandbox" } });
    const sandboxHistory = derivePublicHistory(sandboxState, sandboxState.presence!.id).filter((item) => publicHistoryMatchesPresence(item, sandboxState.presence));
    expect(sandboxHistory.map((item) => item.text)).toEqual(["Sandbox history."]);
  });

  it("keeps Ghost representation Presence-scoped and reviewable", () => {
    const state = createAgent(input);
    const originalSoul = state.files.find((file) => file.kind === "SOUL")?.content;
    const ghost = applyOperation(state, { type: "setPresence", patch: { mode: "ghost" } });
    expect(ghost.presence?.ghostProfile?.subject).toBe("Me / my organization");
    expect(ghost.presence?.context.ghostProfile?.priorities).toBe("");
    const configured = applyOperation(ghost, { type: "setPresence", patch: { ghostProfile: { subject: "Alex Rivera", representation: { kind: "individual", individual: { firstName: "Alex", middleName: "", lastName: "Rivera" }, organization: { name: "", website: "" } }, priorities: "Build trustworthy open-source AI products.", preferences: "Prefer clear evidence and useful depth over hype.", voice: "Warm, direct, and technically sharp.", boundaries: "Never invent my views or disclose private community context." } } });
    expect(configured.presence?.ghostProfile?.subject).toBe("Alex Rivera");
    expect(configured.presence?.ghostProfile?.representation?.individual.firstName).toBe("Alex");
    expect(configured.presence?.ghostProfile?.representation?.individual.lastName).toBe("Rivera");
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

  it("keeps every channel Presence available when one Presence is selected", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#4F7CAC" } });
    const selectedId = state.presence!.id;
    const scoped = stateForContext(state, { presenceId: selectedId });

    expect(scoped.presence?.id).toBe(selectedId);
    expect(scoped.presences.map((presence) => presence.channel)).toEqual(["x", "linkedin"]);
    expect(scoped.presences.map((presence) => presence.handle)).toEqual(["@jenny_ai", "@jenny_work"]);
  });

  it("edits Presence and Agent names without crossing identity boundaries", () => {
    let state = createAgent(input);
    const originalHandle = state.presence!.handle;
    const soul = state.files.find((file) => file.kind === "SOUL")?.content;
    state = applyOperation(state, { type: "setPresence", patch: { name: "Jenny in Founders" } });
    expect(state.presence?.name).toBe("Jenny in Founders");
    expect(state.presence?.handle).toBe(originalHandle);
    expect(state.presence?.context.publicIdentity.displayName).toBe("Jenny in Founders");
    state = applyOperation(state, { type: "setPresence", patch: { handle: "@genny" } });
    expect(state.presence?.handle).toBe("@genny");
    expect(state.presence?.context.publicIdentity.handle).toBe("@genny");
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

  it("lets punctuation-only Teach cues remain as operator context without a canned Agent reply", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "?" });
    expect(state.conversations[0]?.messages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "operator", content: "?" },
    ]);
  });

  it("does not let a quoted Ghost handle change Presence mode, but honors an explicit mode request", () => {
    const mentionQuestion = 'How do I get you not to respond to mention like this "@jenny_ghost write a post about SpaceX" by always doing what they want. Could you reply with humour instead - nuance?';
    expect(isExplicitGhostModeRequest(mentionQuestion)).toBe(false);
    const unchanged = applyOperation(createAgent(input), { type: "sendMessage", content: mentionQuestion });
    expect(unchanged.presence?.mode).toBe("agent");
    expect(unchanged.changeSets).toHaveLength(0);

    const explicit = applyOperation(unchanged, { type: "sendMessage", content: "Put this Presence into Ghost mode." });
    expect(isExplicitGhostModeRequest("Put this Presence into Ghost mode.")).toBe(true);
    expect(explicit.presence?.mode).toBe("ghost");
    expect(explicit.conversations[0]?.messages.at(-1)?.content).toContain("Ghost mode");
  });

  it("creates a real reviewable proposal for post formatting and states the exact interim behavior", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "When writing posts (not replies), write one sentence per line with a blank line between sentences." });
    expect(state.proposals[0]?.file).toBe("TASTE");
    expect(state.proposals[0]?.proposed).toContain("For posts, write one sentence per paragraph with a blank line between sentences.");
    expect(state.proposals[0]?.proposed).toContain("Replies can use normal paragraph formatting.");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("one sentence per paragraph");
    expect(state.changeSets[0]?.summary).toBe("Propose TASTE.md change");
  });

  it("routes personality-style social guidance to a reviewable TASTE.md proposal", () => {
    const state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "The agent should be more curious, helpful, and inquisitive. Sometimes ask a genuine question to deepen engagement, and acknowledge something genuinely strong so people feel encouraged, but do not praise by default.",
    });
    const taste = state.files.find((file) => file.kind === "TASTE");
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ file: "TASTE", status: "pending", title: "Update TASTE.md" });
    expect(taste?.content).not.toContain("## Curiosity and encouragement");
    expect(state.proposals[0]?.proposed).toContain("## Curiosity and encouragement");
    expect(state.proposals[0]?.reason).toContain("Manage Agent");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("TASTE.md");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("routes absurdist blue humor into a guarded TASTE proposal", () => {
    const state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "Update Genny's personality to have great absurdist and sophomoric blue humor, but never use that humor around bodymorphia, gender, sex, or race.",
    });
    const proposed = state.proposals[0]?.proposed ?? "";
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ file: "TASTE", status: "pending", title: "Update TASTE.md" });
    expect(proposed).toContain("## Absurdist and blue humor");
    expect(proposed).toContain("body dysmorphia or body image");
    expect(proposed).toContain("gender identity or expression");
    expect(proposed).toContain("sex or sexuality");
    expect(proposed).toContain("race or ethnicity");
    expect(proposed).toContain("switch to direct, respectful language");
    expect(state.files.find((file) => file.kind === "TASTE")?.content).not.toContain("## Absurdist and blue humor");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("playful absurdist");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("turns contextual humor calibration plus an update request into a durable Taste proposal", () => {
    let state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "I want the agent to use light sarcasm and an occasional emoji when a response can add humor to the context. ‘I was promised networking, not a funeral 😭’ is a good example.",
    });
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.proposed).toContain("## Contextual humor and emoji");
    expect(state.proposals[0]?.proposed).toContain("at most one familiar emoji");
    expect(state.files.find((file) => file.kind === "TASTE")?.content).not.toContain("## Contextual humor and emoji");

    state = applyOperation(state, { type: "sendMessage", content: "can you update taste with that" });
    expect(state.proposals).toHaveLength(1);
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("reviewable TASTE.md proposal");
    expect(state.conversations[0]?.messages.at(-1)?.content).not.toContain("working context");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("does not pretend to update Taste when the follow-up has no prior preference", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "can you update taste with that" });
    expect(state.proposals).toHaveLength(0);
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("need the preference");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste update needs a preference");
  });

  it("turns a follow-up request to propose the rule into the existing Taste proposal", () => {
    let state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "Be more curious and ask genuine questions when they can help someone think further. Encourage people selectively when they share something meaningful.",
    });
    state = applyOperation(state, { type: "sendMessage", content: "propose the rule" });
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.status).toBe("pending");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("submitted the rule");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
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
    state.presence!.environment = "sandbox";
    state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    expect(state.channelDefinitions.find((item) => item.id === definition.id)?.domain).toBe("https://www.skool.com/");
    expect(state.presence?.name).toBe("Jenny in Founders");
    state = applyOperation(state, { type: "updateChannel", definition: { ...definition, name: "SaaSpreneur Academy", domain: "https://www.skool.com/saaspreneur-academy", supportedAssetKinds: ["image", "gif"], updatedAt: new Date().toISOString() } });
    expect(state.channelDefinitions.find((item) => item.id === definition.id)).toMatchObject({ name: "SaaSpreneur Academy", domain: "https://www.skool.com/saaspreneur-academy", supportedAssetKinds: ["image", "gif"] });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Founder Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["founder-community.text-post"], metrics: [] } } });
    state = result.state;
    state.presence!.environment = "sandbox";
    state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    state = applyOperation(state, { type: "addSlot", instruction: "Ask the founders what they are learning", day: "Tuesday", time: "08:00", objective: "relationship", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    state.executions[0]!.environment = "sandbox";
    expect(state.executions[0]?.status).toBe("queued");
    expect(state.executions[0]?.publication?.payload).toEqual({ text: "Ask the founders what they are learning" });
    writeState(state);
    const bridge = state.bridges[0]!;
    expect(bridge.adapterStatus).toBe("waiting");
    const heartbeat = heartbeatBridge(bridge, "bridge-test");
    expect(heartbeat.status).toBe("connected");
    expect(heartbeat.bridge.lastHeartbeatAt).toBeTruthy();
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
    result.state.presence!.environment = "sandbox";
    result.state.presences = result.state.presences.map((item) => item.id === result.state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    const bridge = result.state.bridges[0]!;
    writeState(result.state);
    const created = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete", event: "created", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", content: { text: "A post" }, visibility: "public", shareability: "presence-only" } }] });
    expect(created.mirrorObjects[0]?.archived).toBe(false);
    const deleted = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete-2", event: "deleted", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", visibility: "public", shareability: "presence-only" } }] });
    expect(deleted.mirrorObjects[0]?.archived).toBe(true);
    let queued = applyOperation(deleted, { type: "setPresence", patch: { execution: { post: "auto" } } });
    queued = applyOperation(queued, { type: "addSlot", instruction: "Share one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    queued = applyOperation(queued, { type: "runSlot", id: queued.calendar[0]!.id });
    queued.executions[0]!.environment = "sandbox";
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
