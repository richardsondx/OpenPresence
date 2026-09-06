import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAgentReply, isAiRateLimitError, promptFor } from "../lib/ai";
import { executeAutonomyRun, queueAutonomyRun } from "../lib/autonomy-worker";
import { getOperationalRun, readStateSnapshotForContext, resolvedDbPath, saveProviderSecret, writeState } from "../lib/db";
import { parseOperatorChatStep } from "../lib/operator-chat-harness";
import { recentChatItems } from "../lib/operator-chat-history";
import { createOperatorNudge, linkOperatorChatAssignment, recordOperatorConversationMessage, settleNudgeFromAssignment, startQueuedNudge } from "../lib/operator-chat";
import { applyOperation, createAgent } from "../lib/runtime";
import { repairMissingOperatorNudgeWakes } from "../lib/temporal";

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
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getOperationalRun(queued.run.id)?.state).toBe("succeeded");
    expect(saved.executions).toHaveLength(0);
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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
    expect(modelCalls).toBe(2);
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
    expect(calls).toBe(2);
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
