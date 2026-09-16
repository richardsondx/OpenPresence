import { saveNativeXCredentials, upsertNativeXConnection } from "../lib/x";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAgentReply, isAiRateLimitError, promptFor } from "../lib/ai";
import { dispatchAutonomyWorker, executeAutonomyRun, queueAutonomyRun } from "../lib/autonomy-worker";
import { getOperationalRun, readStateSnapshotForContext, resolvedDbPath, saveProviderSecret, upsertOperationalRun, writeState } from "../lib/db";
import { parseOperatorChatStep } from "../lib/operator-chat-harness";
import { recentChatItems } from "../lib/operator-chat-history";
import { createOperatorNudge, linkOperatorChatAssignment, recordOperatorConversationMessage, settleNudgeFromAssignment, startQueuedNudge } from "../lib/operator-chat";
import { applyOperation, createAgent, normalizeState, startPlaygroundSession } from "../lib/runtime";
import { repairMissingOperatorNudgeWakes, recoverInterruptedOperatorChat, queuedLiveAssignmentRunsWithoutWorkers } from "../lib/temporal";

function fixture(content = "What should we focus on next?") {
  let state = createAgent({ name: "Chat Test", description: "Useful social judgment", mode: "agent", handle: "@chat_test", accent: "#777777" });
  state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
  const connection = state.providerConnections.find((item) => item.provider === "openai")!;
  saveProviderSecret(connection.id, "test-chat-key");
  state = applyOperation(state, { type: "setModel", provider: "openai", model: "test-model", quality: "low", vision: false });
  state = recordOperatorConversationMessage(state, { presenceId: state.presence!.id, content, clientRequestId: "test-turn" });
  writeState(state, { force: true });
  const message = (state.operatorConversations ?? []).flatMap((item) => item.messages).find((item) => item.clientRequestId === "test-turn")!;
  return { state, message, presenceId: state.presence!.id };
}
const modelResponse = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

describe("private operator Chat harness", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("normalizes flattened bounded assignment windows from model output", () => {
    const parsed = parseOperatorChatStep(JSON.stringify({
      kind: "assignment",
      title: "Test a template",
      startsAt: "2026-09-16T05:00:00-04:00",
      deadlineAt: "2026-09-16T05:45:00-04:00",
      instruction: "Prepare a private draft and leave it ready for review.",
      strategyTemplateId: "growth-hypothesis:example",
    }));
    expect(parsed).toMatchObject({ kind: "assignment", timeframe: { startsAt: "2026-09-16T05:00:00-04:00", deadline: "2026-09-16T05:45:00-04:00" }, strategyTemplateId: "growth-hypothesis:example" });
  });

  it("records supervisory turns on the active Sandbox causal clock", () => {
    const original = fixture("How are we doing?");
    const state = startPlaygroundSession(original.state, original.presenceId, "fresh");
    const session = state.playgroundSessions.find((item) => item.presenceId === original.presenceId)!;
    const next = recordOperatorConversationMessage(state, { presenceId: original.presenceId, content: "Can we push harder?", clientRequestId: "causal-supervision-turn" });
    const message = next.operatorConversations!.flatMap((item) => item.messages).find((item) => item.clientRequestId === "causal-supervision-turn");
    expect(message?.causalTime).toEqual({ clock: "sandbox", at: session.virtualNow, sessionId: session.id });
  });

  it("continues a promise-only answer into actual research before completing, and persists choices", async () => {
    const original = fixture("Find a current startup participation format and draft two options. Do not publish.");
    const steps = [
      { kind: "answer", text: "I’ll look for a useful approach." },
      { kind: "search_knowledge", query: "startup participation" },
      { kind: "answer", text: "Two private approaches are ready.", choices: [{ label: "Showcase", content: "Draft the showcase option; do not publish." }, { label: "Lessons", content: "Draft the lessons option; do not publish." }] },
    ];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (steps.length === 2) expect(String(init?.body)).toContain("Completion checkpoint");
      return modelResponse(steps.shift());
    });
    vi.stubGlobal("fetch", fetchMock);
    const run = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } }).run;
    await executeAutonomyRun(run.id);
    const saved = readStateSnapshotForContext({ presenceId: original.presenceId });
    const replies = saved.operatorConversations!.flatMap(item => item.messages).filter(item => item.replyToMessageId === original.message.id);
    expect(replies.some(item => item.role === "system" && item.content.includes("search_knowledge"))).toBe(true);
    expect(replies.filter(item => item.role === "presence")).toEqual([expect.objectContaining({ content: "Two private approaches are ready.", choices: expect.arrayContaining([expect.objectContaining({ label: "Showcase" })]) })]);
    expect(saved.executions).toHaveLength(0);
    expect(saved.assignments).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not report success when the model exhausts its tool budget", async () => {
    const original = fixture("Investigate the current runtime.");
    vi.stubGlobal("fetch", vi.fn(async () => modelResponse({ kind: "runtime_status" })));
    const run = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } }).run;
    await executeAutonomyRun(run.id);
    expect(getOperationalRun(run.id)?.state).toBe("failed");
    const messages = readStateSnapshotForContext({ presenceId: original.presenceId }).operatorConversations!.flatMap(item => item.messages);
    expect(messages.some(item => item.replyToMessageId === original.message.id && item.role === "presence")).toBe(false);
    expect(messages.some(item => item.content.includes("work limit"))).toBe(true);
  });

  it("uses a multi-tool turn to execute once and returns verified delivery evidence to cognition", async () => {
    const original = fixture("Publish one short post about testing a prototype.");
    let state = applyOperation(original.state, { type: "setPresence", patch: { connectionMode: "sandbox", status: "live", execution: { post: "auto" } } });
    state = startPlaygroundSession(state, original.presenceId, "fresh");
    writeState(state);
    const action = { kind: "social_action", action: "post", text: "Watch one person try the prototype before adding another feature." };
    const steps = [{ kind: "runtime_status" }, { kind: "search_knowledge", query: "prototype" }, { kind: "search_assets", query: "prototype" }, action, action];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const step = steps.shift();
      if (step) return modelResponse(step);
      expect(String(init?.body)).toContain('verified');
      expect(String(init?.body)).toContain('succeeded');
      const request = JSON.parse(String(init?.body));
      expect(request.messages.at(-1).content).toContain("Runtime tool result");
      expect(JSON.stringify(request.messages)).toContain("succeeded");
      expect(request.messages.at(-2).role).toBe("assistant");
      return modelResponse({ kind: "answer", text: "The Sandbox post is verified." });
    });
    vi.stubGlobal("fetch", fetchMock);
    const run = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } }).run;
    await executeAutonomyRun(run.id);
    const saved = readStateSnapshotForContext({ presenceId: original.presenceId });
    expect(getOperationalRun(run.id)?.state).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(saved.executions).toHaveLength(1);
    expect(saved.outcomes.filter((item) => item.status === "succeeded")).toHaveLength(1);
    expect(saved.operatorConversations!.flatMap((item) => item.messages)).toContainEqual(expect.objectContaining({ content: "The Sandbox post is verified.", replyToMessageId: original.message.id }));
  });

  it("feeds checks back as tool turns and does not repeat identical external probes", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const original = fixture("Check my connection now, read-only.");
    const state = upsertNativeXConnection(original.state, { presenceId: original.presenceId, id: "harness-check", account: { id: "chat-account", username: "chat_test", name: "Chat Test" }, access: "read-write" });
    saveNativeXCredentials("harness-check", { apiKey: "test", apiSecret: "test", accessToken: "test", accessTokenSecret: "test" });
    writeState(state);
    let modelCalls = 0;
    let externalReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("api.openai.com")) {
        modelCalls += 1;
        if (modelCalls <= 2) return modelResponse({ kind: "check_connection" });
        expect(JSON.parse(String(init?.body)).messages.at(-1).content).toContain("Runtime tool result");
        return modelResponse({ kind: "answer", text: "The read-only check passed." });
      }
      externalReads += 1;
      return new Response(JSON.stringify({ data: String(url).includes("/users/me") ? { id: "chat-account", username: "chat_test", name: "Chat Test" } : [] }), { status: 200 });
    }));
    const run = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } }).run;
    await executeAutonomyRun(run.id);
    expect(getOperationalRun(run.id)?.state).toBe("succeeded");
    expect(modelCalls).toBe(4);
    expect(externalReads).toBe(2);
  });

  it("turns an operator's fixed-it message into a fresh check and retry of the existing Assignment", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "1");
    const original = fixture("I fixed the X issue. Check it again and continue the blocked public work.");
    original.state.presences[0]!.environment = "live";
    if (original.state.presence?.id === original.presenceId) original.state.presence.environment = "live";
    let state = upsertNativeXConnection(original.state, { presenceId: original.presenceId, id: "chat-recovery", account: { id: "chat-account", username: "chat_test", name: "Chat Test" }, access: "read-write" });
    saveNativeXCredentials("chat-recovery", { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_token", accessTokenSecret: "test_token_secret" });
    state = applyOperation(state, { type: "createAssignment", presenceId: original.presenceId, environment: "live", instruction: "Publish one useful post about the prototype." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state.assignments[0]!.status = "needs_operator";
    state.assignments[0]!.work = { ...(state.assignments[0]!.work ?? { phase: "blocked", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "X reports no API credits." };
    state.assignments[0]!.lastOutcome = { class: "delivery_failed", message: "X reports no API credits.", at: new Date().toISOString() };
    writeState(state);
    let modelCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (!String(url).includes("api.openai.com")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      modelCalls += 1;
      if (modelCalls === 1) return modelResponse({ kind: "runtime_status" });
      if (modelCalls === 2 || modelCalls === 3) return modelResponse({ kind: "retry_assignment", assignmentId: assignment.id });
      expect(String(init?.body)).toContain("Fresh X reads passed");
      return modelResponse({ kind: "answer", text: "I checked the saved X account and recent posts, then queued the existing public responsibility. The read-only check did not prove billing or write access, so I’ll let the normal worker verify that on the real retry." });
    });
    vi.stubGlobal("fetch", fetchMock);
    const run = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } }).run;
    await executeAutonomyRun(run.id);
    const saved = readStateSnapshotForContext({ presenceId: original.presenceId });
    const messages = saved.operatorConversations!.flatMap((item) => item.messages);
    const receipt = messages.find((item) => item.role === "system" && item.replyToMessageId === original.message.id && item.content.includes('"tool":"retry_assignment"'));
    expect(getOperationalRun(run.id)?.state).toBe("succeeded");
    expect(modelCalls).toBe(5);
    expect(receipt?.content).toContain('"status":"queued"');
    expect(saved.assignments.find((item) => item.id === assignment.id)).toMatchObject({ id: assignment.id, status: "working" });
    expect(saved.assignments).toHaveLength(1);
    expect(saved.assignmentRuns?.filter((item) => item.assignmentId === assignment.id)).toHaveLength(1);
    expect(queuedLiveAssignmentRunsWithoutWorkers(saved)).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId: assignment.id })]));
    expect(saved.executions).toHaveLength(0);
    expect(messages).toContainEqual(expect.objectContaining({ role: "presence", replyToMessageId: original.message.id, content: expect.stringContaining("queued the existing public responsibility") }));
  });

  it("recovers a stranded Chat turn without escalating an unrelated public incident", () => {
    const { presenceId, message } = fixture("Continue after a worker restart");
    const run = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } }).run;
    const now = new Date();
    run.state = "running";
    run.stage = "operator_chat.generating";
    run.lastProgressAt = new Date(now.getTime() - 95000).toISOString();
    run.lastHeartbeatAt = now.toISOString();
    run.leaseOwner = "stopped-worker";
    run.leaseExpiresAt = new Date(now.getTime() + 10000).toISOString();
    upsertOperationalRun(run);
    recoverInterruptedOperatorChat(run, now);
    upsertOperationalRun(run);
    expect(getOperationalRun(run.id)).toMatchObject({ state: "queued", stage: "operator_chat.queued", recoveryCount: 1 });
    expect(getOperationalRun(run.id)?.leaseOwner).toBeUndefined();
    const exhausted = getOperationalRun(run.id)!;
    exhausted.recoveryCount = 2;
    exhausted.state = "running";
    exhausted.stage = "operator_chat.generating";
    exhausted.lastProgressAt = run.lastProgressAt;
    exhausted.leaseOwner = "stopped-again";
    upsertOperationalRun(exhausted);
    recoverInterruptedOperatorChat(exhausted, now);
    upsertOperationalRun(exhausted);
    expect(getOperationalRun(run.id)).toMatchObject({ state: "failed", stage: "operator_chat.failed", recoveryCount: 3 });
  });

  it("keeps the newest scoped Chat records when the durable ledger grows past its bound", () => {
    const records = [
      { id: "old-presence", presenceId: "other", updatedAt: "2026-09-06T12:10:00.000Z" },
      { id: "old-1", presenceId: "active", updatedAt: "2026-09-06T12:11:00.000Z" },
      { id: "old-2", presenceId: "active", updatedAt: "2026-09-06T12:12:00.000Z" },
      { id: "old-3", presenceId: "active", updatedAt: "2026-09-06T12:13:00.000Z" },
      { id: "newest", presenceId: "active", updatedAt: "2026-09-06T12:14:00.000Z" },
    ];
    expect(recentChatItems(records, "active", 2).map((item) => item.id)).toEqual(["newest", "old-3"]);
    expect(recentChatItems(records, "active", 4).every((item) => item.presenceId === "active")).toBe(true);
  });

  it("keeps private shared context out of public nudge wake and claim paths", () => {
    const { state, presenceId } = fixture("Read https://x.com/example/status/1234567890123456789 privately");
    const created = createOperatorNudge(state, {
      presenceId,
      content: "Read https://x.com/example/status/1234567890123456789 privately",
      privateConversation: true,
    });
    expect(created.nudge.privateConversation).toBe(true);
    expect(repairMissingOperatorNudgeWakes(created.state)).toBe(0);
    expect(startQueuedNudge(created.state, presenceId, { id: "private_episode" } as never).nudge).toBeUndefined();
    expect(created.state.operatorNudges?.[0]).toMatchObject({ status: "acknowledged", privateConversation: true });
  });

  it("keeps a selected library asset reference and its grounded preview on private Chat turns", () => {
    const { state, presenceId } = fixture("What does this image show?");
    const timestamp = new Date().toISOString();
    const assetId = "library-chat-asset";
    state.assets.push({
      id: assetId,
      agentId: state.agent!.id,
      sourceId: "uploaded-source",
      type: "image",
      dataUrl: "data:image/png;base64,AAAA",
      mimeType: "image/png",
      status: "ready",
      provenance: { origin: "operator_upload", sourceUrl: "https://cdn.example.test/chart.png", importedAt: timestamp },
      perception: { observation: "A line chart with a rising trend.", likelyMeaning: "The measured value increased over time.", uncertainty: ["low"] },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const beforeAssetCount = state.assets.length;
    const created = createOperatorNudge(state, {
      presenceId,
      content: "What does this image show?",
      privateConversation: true,
      attachments: [{ name: "trend.png", kind: "image", existingAssetId: assetId }],
    });
    const message = created.state.operatorConversations?.flatMap((item) => item.messages).find((item) => item.id === created.nudge.messageId);
    expect(message?.attachments?.[0]).toMatchObject({
      existingAssetId: assetId,
      name: "trend.png",
      dataUrl: "data:image/png;base64,AAAA",
      sourceUrl: "https://cdn.example.test/chart.png",
      perception: {
        observation: "A line chart with a rising trend.",
        interpretation: "The measured value increased over time.",
        uncertainty: "low",
      },
    });
    expect(created.nudge.attachmentIds).toHaveLength(1);
    expect(created.state.assets).toHaveLength(beforeAssetCount);
  });

  it("rejects a stale or cross-Presence library asset before private cognition", () => {
    const { state, presenceId } = fixture("Use the selected image privately");
    state.assets.push({
      id: "other-presence-asset",
      agentId: state.agent!.id,
      sourceId: "uploaded-source",
      accessScope: { mode: "selected_presences", presenceIds: ["another-presence"] },
      type: "image",
      status: "ready",
      provenance: { origin: "operator_upload", importedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(() => createOperatorNudge(state, {
      presenceId,
      content: "Use the selected image privately",
      privateConversation: true,
      attachments: [{ name: "private.png", kind: "image", existingAssetId: "other-presence-asset" }],
    })).toThrow("That media is no longer available to this Presence.");
  });

  it("links a plain Chat assignment to its turn and returns one eventual outcome receipt", () => {
    const { state, presenceId, message } = fixture("Please publish one thoughtful post about launch feedback");
    const withAssignment = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "sandbox",
      instruction: "Publish one thoughtful post about launch feedback.",
    });
    const assignment = withAssignment.assignments[0];
    const conversation = (withAssignment.operatorConversations ?? []).find((item) => item.messages.some((item) => item.id === message.id))!;
    const linked = linkOperatorChatAssignment(withAssignment, conversation.id, message.id, assignment.id);
    expect(linked.assignments.find((item) => item.id === assignment.id)?.createdBy).toBe("agent");
    const linkedMessage = linked.operatorConversations?.find((item) => item.id === conversation.id)?.messages.find((item) => item.id === message.id);
    expect(linkedMessage?.nudgeId).toBeTruthy();
    expect(linked.operatorNudges?.find((item) => item.id === linkedMessage?.nudgeId)).toMatchObject({ assignmentId: assignment.id, status: "assignment_created" });
    const settled = settleNudgeFromAssignment(linked, assignment.id, "deferred", "The post did not warrant a public response.");
    const settledAgain = settleNudgeFromAssignment(settled, assignment.id, "deferred", "The post did not warrant a public response.");
    const messages = settledAgain.operatorConversations?.find((item) => item.id === conversation.id)?.messages ?? [];
    expect(messages.filter((item) => item.nudgeId === linkedMessage?.nudgeId && item.milestone === "decision")).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({ role: "presence", milestone: "decision", content: "The post did not warrant a public response." });
  });

  it("lets cognition answer intent-bearing questions despite channel failure and persists a turn-linked response", async () => {
    const { presenceId, message } = fixture();
    const fetchMock = vi.fn(async () => modelResponse({ kind: "answer", text: "Let's compare two topics with the audience we want to reach." }));
    vi.stubGlobal("fetch", fetchMock);
    const queued = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    await executeAutonomyRun(queued.run.id);
    const saved = readStateSnapshotForContext({ presenceId });
    expect((saved.operatorConversations ?? []).flatMap((item) => item.messages)).toContainEqual(expect.objectContaining({ role: "presence", replyToMessageId: message.id, content: "Let's compare two topics with the audience we want to reach." }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getOperationalRun(queued.run.id)?.state).toBe("succeeded");
    expect(saved.executions).toHaveLength(0);
  });

  it("does not persist a late Chat answer after the operator cancels the run", async () => {
    const { presenceId, message } = fixture("Stop this turn while it is thinking");
    let releaseModel!: () => void;
    let modelStarted!: () => void;
    const modelGate = new Promise<void>((resolve) => { releaseModel = resolve; });
    const started = new Promise<void>((resolve) => { modelStarted = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      modelStarted();
      await modelGate;
      return modelResponse({ kind: "answer", text: "This late answer must not be saved." });
    }));
    const queued = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    const worker = executeAutonomyRun(queued.run.id);
    await started;
    const cancelled = getOperationalRun(queued.run.id)!;
    cancelled.state = "cancelled";
    cancelled.stage = "operator_chat.cancelled";
    upsertOperationalRun(cancelled);
    releaseModel();
    await worker;
    const saved = readStateSnapshotForContext({ presenceId });
    const messages = (saved.operatorConversations ?? []).flatMap((item) => item.messages);
    expect(messages).not.toContainEqual(expect.objectContaining({ content: "This late answer must not be saved." }));
    expect(getOperationalRun(queued.run.id)?.state).toBe("cancelled");
  });

  it("keeps later Chat turns queued while the earlier turn waits for provider recovery", async () => {
    const { state, presenceId, message } = fixture("First turn waits for capacity");
    const next = recordOperatorConversationMessage(state, { presenceId, content: "Second turn", clientRequestId: "second-waiting-turn" });
    writeState(next);
    const secondMessage = next.operatorConversations!.flatMap((item) => item.messages).find((item) => item.clientRequestId === "second-waiting-turn")!;
    const first = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } }).run;
    first.state = "waiting";
    first.createdAt = new Date(Date.now() - 1000).toISOString();
    first.stage = "waiting.provider_quota";
    upsertOperationalRun(first);
    const second = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: secondMessage.id } }).run;
    const fetchMock = vi.fn(async () => modelResponse({ kind: "answer", text: "Second answer" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await dispatchAutonomyWorker(second.id)).toBeNull();
    expect(getOperationalRun(second.id)?.state).toBe("queued");
    expect(fetchMock).not.toHaveBeenCalled();
    first.state = "cancelled";
    upsertOperationalRun(first);
    await dispatchAutonomyWorker(second.id);
    expect(getOperationalRun(second.id)?.state).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes the earlier answer in a queued follow-up's context, but never includes future turns", async () => {
    const { state, presenceId, message } = fixture("First question");
    let next = recordOperatorConversationMessage(state, { presenceId, content: "Follow-up question", clientRequestId: "followup" });
    const followup = next.operatorConversations!.flatMap((item) => item.messages).find((item) => item.clientRequestId === "followup")!;
    next = recordOperatorConversationMessage(next, { presenceId, content: "Future instruction", clientRequestId: "future" });
    next = recordOperatorConversationMessage(next, { presenceId, role: "presence", replyToMessageId: message.id, content: "Earlier answer arrived after follow-up was queued" });
    writeState(next);
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain("Earlier answer arrived after follow-up was queued");
      expect(body).not.toContain("Future instruction");
      return modelResponse({ kind: "answer", text: "Answer with the preceding turn in context" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const run = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: followup.id } }).run;
    await executeAutonomyRun(run.id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getOperationalRun(run.id)?.state).toBe("succeeded");
  });

  it("merges concurrent same-Presence Chat answers without losing either turn", async () => {
    const { state, presenceId, message: firstMessage } = fixture("First turn must keep its context");
    const withSecond = recordOperatorConversationMessage(state, { presenceId, content: "Second turn must survive", clientRequestId: "second-turn" });
    writeState(withSecond, { force: true });
    const secondMessage = (withSecond.operatorConversations ?? []).flatMap((item) => item.messages).find((item) => item.clientRequestId === "second-turn")!;
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstCall = new Promise<void>((resolve) => { firstStarted = resolve; });
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      const prompt = request.messages?.at(-1)?.content ?? "";
      if (prompt.includes("Completion checkpoint")) return modelResponse({ kind: "answer", text: prompt.includes("First answer") ? "First answer" : "Second answer" });
      if (prompt.includes("First turn must keep its context")) {
        firstStarted();
        await firstGate;
        return modelResponse({ kind: "answer", text: "First answer" });
      }
      return modelResponse({ kind: "answer", text: "Second answer" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const firstRun = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: firstMessage.id } });
    const secondRun = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: secondMessage.id } });
    const firstWorker = executeAutonomyRun(firstRun.run.id);
    await firstCall;
    const secondWorker = executeAutonomyRun(secondRun.run.id);
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    releaseFirst();
    await Promise.all([firstWorker, secondWorker]);
    const saved = readStateSnapshotForContext({ presenceId });
    const messages = (saved.operatorConversations ?? []).flatMap((item) => item.messages);
    expect(messages).toContainEqual(expect.objectContaining({ role: "presence", replyToMessageId: firstMessage.id, content: "First answer" }));
    expect(messages).toContainEqual(expect.objectContaining({ role: "presence", replyToMessageId: secondMessage.id, content: "Second answer" }));
  });

  it("returns tool failures to the model and continues the private conversation without public execution", async () => {
    const { presenceId, message } = fixture("Read https://x.com/example/status/1234567890123456789 and help me draft a response, don't post it.");
    let modelCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (!String(url).includes("api.openai.com")) return new Response("Unavailable", { status: 429 });
      modelCalls += 1;
      if (modelCalls === 1) return modelResponse({ kind: "inspect_post", url: "https://x.com/example/status/1234567890123456789" });
      expect(String(init?.body)).toContain("failures");
      return modelResponse({ kind: "answer", text: "I couldn't read that post. Paste its text and we can still work on the draft here." });
    });
    vi.stubGlobal("fetch", fetchMock);
    const queued = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    await executeAutonomyRun(queued.run.id);
    const saved = readStateSnapshotForContext({ presenceId });
    expect(modelCalls).toBe(3);
    expect(getOperationalRun(queued.run.id)?.state).toBe("succeeded");
    expect((saved.operatorConversations ?? []).flatMap((item) => item.messages).at(-1)?.content).toContain("still work on the draft");
    expect(saved.executions).toHaveLength(0);
    expect(saved.assignments).toHaveLength(0);
  });

  it("saves a private watch, feeds back its receipt, and does not replay a completed turn", async () => {
    const { presenceId, message } = fixture("Keep an eye on @example for useful launch updates");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => modelResponse(++calls === 1 ? { kind: "watch", query: "@example", purpose: "Useful launch updates" } : { kind: "answer", text: "I'll keep an eye on @example's launches." })));
    const queued = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    await executeAutonomyRun(queued.run.id);
    const replay = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    await executeAutonomyRun(replay.run.id);
    const saved = readStateSnapshotForContext({ presenceId });
    expect(saved.watches.filter((item) => item.query === "@example")).toHaveLength(1);
    expect((saved.operatorConversations ?? []).flatMap((item) => item.messages).filter((item) => item.role === "presence" && item.replyToMessageId === message.id)).toHaveLength(1);
    expect(calls).toBe(3);
  });

  it("keeps new turns when a cold worker read encounters an older active Agent snapshot", () => {
    const { state, presenceId } = fixture("First saved turn");
    writeState(state, { force: true, persistActiveWorkspace: true });
    const newer = recordOperatorConversationMessage(readStateSnapshotForContext({ presenceId }), { presenceId, content: "Newer turn must survive", clientRequestId: "newer-turn" });
    writeState(newer);
    const connection = new Database(resolvedDbPath);
    connection.prepare("UPDATE app_state SET updated_at = ? WHERE id = 1").run(`cold-read-${Date.now()}`);
    connection.close();
    const cold = readStateSnapshotForContext({ agentId: state.agent!.id, presenceId });
    expect((cold.operatorConversations ?? []).flatMap((item) => item.messages).some((item) => item.clientRequestId === "newer-turn")).toBe(true);
  });

  it("creates a bounded responsibility without pretending a paused Presence delivered it", async () => {
    const { state, presenceId, message } = fixture("Please publish one thoughtful post about useful launch feedback");
    state.presence!.status = "paused";
    state.presences.find((item) => item.id === presenceId)!.status = "paused";
    writeState(state, { force: true });
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => modelResponse(++calls === 1 ? { kind: "assignment", instruction: "Publish one thoughtful post about useful launch feedback, with review before delivery." } : { kind: "answer", text: "The responsibility is saved. Public activity is paused, so nothing has been published." })));
    const queued = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: message.id } });
    await executeAutonomyRun(queued.run.id);
    const saved = readStateSnapshotForContext({ presenceId });
    expect(saved.assignments).toHaveLength(1);
    expect(saved.presence!.status).toBe("paused");
    expect(saved.executions).toHaveLength(0);
    expect(getOperationalRun(queued.run.id)?.state).toBe("succeeded");
  });

  it("keeps a private Chat responsibility executable without reviving the legacy planning-only workflow", async () => {
    const original = fixture("Create the private Task now and leave it ready for review. Do not publish anything.");
    original.state.presence!.environment = "live";
    original.state.presences.find((item) => item.id === original.presenceId)!.environment = "live";
    writeState(original.state, { force: true });
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const deadline = new Date(Date.now() + 45 * 60_000).toISOString();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => modelResponse(++calls === 1
      ? {
        kind: "assignment",
        title: "Private planning Task",
        timeframe: { startsAt, deadline },
        instruction: "Create a private, bounded one-time Task. Do not publish, reply, quote, like, repost, follow, attach media, or perform any public action. Stop immediately after the Task is saved. This is a planning task only and remains ready for review.",
      }
      : { kind: "answer", text: "The private Task is saved and ready for review. Nothing was published." })));

    const queued = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } });
    await executeAutonomyRun(queued.run.id);

    const saved = readStateSnapshotForContext({ presenceId: original.presenceId });
    const assignment = saved.assignments[0];
    expect(assignment).toMatchObject({ status: "active", planningOnly: false, title: "Private planning Task", description: expect.any(String), timeframe: { startsAt: expect.any(String), deadline: expect.any(String), }, createdBy: "agent" });
    expect(assignment.nextDueAt).toBe(startsAt);
    expect(saved.assignmentRuns?.filter((run) => run.assignmentId === assignment.id)).toHaveLength(0);
    expect(saved.executions).toHaveLength(0);
    const messages = (saved.operatorConversations ?? []).flatMap((item) => item.messages).filter((item) => item.replyToMessageId === original.message.id);
    const receipt = messages.find((item) => item.role === "system");
    expect(receipt ? JSON.parse(receipt.content) : undefined).toMatchObject({ assignmentId: assignment.id, status: "active", planningOnly: false, delivered: false });
    expect(messages.filter((item) => item.role === "presence")).toHaveLength(1);
    expect(messages.at(-1)?.content).toContain("saved and ready for review");
  });

  it("persists an Agent-created Chat responsibility with the template under test", async () => {
    const original = fixture("Use a saved template to prepare one private growth draft. Do not publish.");
    const prepared = normalizeState(original.state);
    const template = prepared.growthHypotheses?.find((item) => item.template?.source === "bundled");
    expect(template).toBeTruthy();
    writeState(prepared, { force: true });
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => modelResponse(++calls === 1
      ? { kind: "assignment", title: "Test saved growth format", instruction: `Prepare one private draft using ${template!.template!.title}. Do not publish.`, strategyTemplateId: template!.id }
      : { kind: "answer", text: "The Agent-planned draft is saved and ready for review. Nothing was published." })));
    const queued = queueAutonomyRun(original.presenceId, "operator_chat", { metadata: { operatorMessageId: original.message.id } });
    await executeAutonomyRun(queued.run.id);
    const saved = readStateSnapshotForContext({ presenceId: original.presenceId });
    expect(saved.assignments).toContainEqual(expect.objectContaining({ createdBy: "agent", strategyTemplateId: template!.id }));
    expect(saved.executions).toHaveLength(0);
    expect(getOperationalRun(queued.run.id)?.state).toBe("succeeded");
  });

  it("distinguishes model billing exhaustion from retryable model throttling", async () => {
    const { state } = fixture();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 })));
    const billing = await generateAgentReply(state, "Hi", undefined, { operatorConversation: true }).catch((error: unknown) => error);
    expect(billing).toMatchObject({ code: "quota_exhausted" });
    expect(isAiRateLimitError(billing)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "Too many requests" } }), { status: 429, headers: { "retry-after": "30" } })));
    const throttle = await generateAgentReply(state, "Hi", undefined, { operatorConversation: true }).catch((error: unknown) => error);
    expect(throttle).toMatchObject({ code: "rate_limited", retryAfterMs: 30_000 });
  });

  it("rejects undeclared tools and keeps unrelated Presence telemetry out of cognition", () => {
    expect(parseOperatorChatStep("Here is a private draft we can refine together.")).toEqual({ kind: "answer", text: "Here is a private draft we can refine together." });
    expect(() => parseOperatorChatStep('{"kind":"publish","text":"hello"}')).toThrow();
    expect(() => parseOperatorChatStep('{"kind":"watch","query":"a","purpose":"b","permissionOverride":true}')).toThrow();
    const { state } = fixture();
    state.events.unshift({ id: "private-other", type: "system", title: "OTHER_PRESENCE_SECRET", detail: "Do not retrieve", tone: "quiet", time: new Date().toISOString(), presenceId: "other" });
    expect(promptFor(state, undefined, "What next?", { operatorConversation: true }).system).not.toContain("OTHER_PRESENCE_SECRET");
  });
});
