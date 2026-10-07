import crypto from "node:crypto";
import { dispatchAutonomyWorker } from "../lib/autonomy-worker";

async function attentionResult(response: Response) {
  const body = await response.json();
  if (!body.receiptOnly) return body;
  expect(body.accepted).toBe(true);
  if (body.runId) await dispatchAutonomyWorker(body.runId);
  return readState();
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readChannelSecret, readProviderSecret, readState, shouldRecordNativeOperationalFailure, writeState } from "../lib/db";
import { deleteXPost, findVerifiedXQuote, findVerifiedXReply, matchesXQuote, matchesXReply, mergeXCredentials, normalizeXText, readRecentXMentions, readRecentXPosts, readXPostsByIds } from "../lib/x";
import { applyOperation, createAgent, derivePublicHistory, failNativeExecution, formXActionIntent, recordNativeMirror, recordPublicFooting, settleCapabilityTrialNoOpportunity } from "../lib/runtime";
import { hydrateNativeXThreadContext } from "../lib/native-x";
import { xCreditsExhausted } from "../lib/x-credits";
import { generateAgentReply } from "../lib/ai";
import { POST } from "../app/api/x/manage/route";
import { POST as statePost } from "../app/api/state/route";
import { WorkspaceConflictError } from "../lib/db";
import { GET as ollamaModelsGet } from "../app/api/ollama/models/route";
import { recordOperationalFailure } from "../lib/incident-engine";
import { readOperationalHealth } from "../lib/operational-context";

beforeEach(() => {
  process.env.OPENPRESENCE_X_API_MOCK = "1";
  delete process.env.OPENPRESENCE_AI_MOCK;
  const state = applyOperation(createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }), { type: "setPresence", patch: { execution: { post: "auto", reply: "auto" } } });
  state.presence!.environment = "live";
  state.presence!.connectionMode = "native";
  state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "live" as const, connectionMode: "native" as const } : item);
  writeState({ ...state, nativeConnections: [] });
});

describe("native X connection", () => {
  it("keeps an inbound candidate unjudged when its model re-expression fails", async () => {
    const presenceId = readState().presence!.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI", secret: "test-provider", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", provider: "openai", model: "gpt-5.6-luna" }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    let modelCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("api.openai.com")) {
        modelCalls += 1;
        return modelCalls === 1
          ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "reply", text: "The useful bit is the tradeoff. What would you test next?", rationale: "Answer the question." }) } }] }), { status: 200 })
          : new Response(JSON.stringify({ error: { message: "provider unavailable" } }), { status: 503 });
      }
      return new Response(JSON.stringify({ data: String(url).includes("/users/")
        ? [{ id: "own-footing", text: "Existing post", author_id: "mock-x-user", created_at: new Date().toISOString() }]
        : [{ id: "repair-failure-target", text: "@jenny_ai How should I test this tradeoff?", lang: "en", author_id: "builder-1", created_at: new Date().toISOString() }], includes: { users: [{ id: "builder-1", username: "builder", name: "Builder" }] } }), { status: 200 });
    }));
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    expect(response.ok).toBe(false);
    expect(modelCalls).toBeGreaterThan(1);
    const persisted = readState();
    expect(persisted.presence?.context.publicFooting?.judgedInboundIds ?? []).not.toContain("repair-failure-target");
    expect(persisted.socialDecisions.filter((decision) => decision.origin?.refId === "repair-failure-target")).toEqual([]);
    expect(persisted.executions).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("reads direct replies to the Presence's posts, including media-only GIF replies", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "gif-reply-1",
        text: "",
        lang: "zxx",
        created_at: "2026-08-25T12:00:00.000Z",
        author_id: "person-1",
        conversation_id: "post-1",
        referenced_tweets: [{ type: "replied_to", id: "post-1" }],
        attachments: { media_keys: ["media-gif-1"] },
      }],
      includes: {
        users: [{ id: "person-1", username: "richardsondx", name: "Alex" }],
        media: [{ media_key: "media-gif-1", type: "animated_gif", preview_image_url: "https://pbs.twimg.com/tweet_video_thumb/gif-reply-1.jpg" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const replies = await readRecentXMentions({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, "account-1", "example_agent");
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/2/tweets/search/recent?");
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("to%3Aexample_agent");
      expect(replies[0]).toMatchObject({ id: "gif-reply-1", text: "", parentId: "post-1", media: [{ type: "animated_gif", previewImageUrl: "https://pbs.twimg.com/tweet_video_thumb/gif-reply-1.jpg" }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the newest known mention as an X delta cursor", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await readRecentXMentions({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, "account-1", "example_agent", 25, { sinceId: "2092177859288666350" });
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("since_id=2092177859288666350");
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("max_results=25");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves encrypted credentials when edit fields are left blank", () => {
    expect(mergeXCredentials({ apiKey: "saved-key", apiSecret: "saved-secret", bearerToken: "saved-bearer" }, { apiKey: "" })).toEqual({ apiKey: "saved-key", apiSecret: "saved-secret", bearerToken: "saved-bearer" });
    expect(mergeXCredentials({ apiKey: "saved-key", apiSecret: "saved-secret", bearerToken: "saved-bearer" }, { bearerToken: "replacement" })).toEqual({ apiKey: "saved-key", apiSecret: "saved-secret", bearerToken: "replacement" });
  });

  it("does not classify workspace revision contention as a native X outage", () => {
    const conflict = new WorkspaceConflictError("agent-test", 4, 5);
    expect(shouldRecordNativeOperationalFailure(conflict)).toBe(false);
    expect(shouldRecordNativeOperationalFailure(new Error("X returned 503"))).toBe(true);
  });

  it("closes the linked Assignment when a bounded trial finds no opportunity", () => {
    const state = applyOperation(readState(), { type: "createCapabilityTrial", capability: "repost", environment: "sandbox", executionMode: "auto" });
    const trial = state.capabilityTrials[0]!;
    trial.status = "active";
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId)!;
    assignment.status = "active";
    const settled = settleCapabilityTrialNoOpportunity(state, trial.id, "No bounded candidate earned amplification.");
    expect(settled.capabilityTrials[0]).toMatchObject({ status: "completed", result: "INCONCLUSIVE_NO_OPPORTUNITY" });
    expect(settled.assignments.find((item) => item.id === trial.assignmentId)).toMatchObject({ status: "expired_incomplete", lastOutcome: { class: "incomplete" } });
  });

  it("resolves a friendly Ollama model name to an installed tag", async () => {
    let state = readState();
    state = applyOperation(state, { type: "configureProvider", provider: "ollama", label: "Ollama local", endpoint: "http://localhost:11434" });
    state = applyOperation(state, { type: "setModel", model: "qwen2.5", provider: "ollama", quality: "local" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b-instruct" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: "Ollama answered locally." } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const reply = await generateAgentReply(state, "Hello from the local runtime.");
    expect(reply).toBe("Ollama answered locally.");
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).model).toBe("qwen2.5:7b-instruct");
    vi.unstubAllGlobals();
  });

  it("discovers the installed Ollama completion catalog for Brain", async () => {
    const configure = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "ollama", label: "Ollama local", endpoint: "http://localhost:11434" }), headers: { "content-type": "application/json" } }));
    const connectionId = (await configure.json()).providerConnections.find((connection: { provider: string }) => connection.provider === "ollama").id;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "qwen3-vl:8b", capabilities: ["completion", "vision"] }, { name: "x/flux2-klein:4b", capabilities: ["image"] }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const response = await ollamaModelsGet(new Request(`http://localhost/api/ollama/models?connectionId=${connectionId}`));
    expect(response.status).toBe(200);
    expect((await response.json()).models.map((model: { name: string }) => model.name)).toEqual(["qwen3-vl:8b"]);
    vi.unstubAllGlobals();
  });

  it("uses the selected provider for chat instead of a canned reply", async () => {
    const configure = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    expect(configure.status).toBe(200);
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "A provider-generated answer for this conversation." } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "What should I focus on?" }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages.at(-1).content).toBe("A provider-generated answer for this conversation.");
    expect(body.messages.at(-1).content).not.toContain("I heard you");
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(requestBody.model).toBe("gpt-5.6-luna");
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe("Bearer provider-secret-test");
    vi.unstubAllGlobals();
  });

  it("keeps live Presence changes out of unsolicited chat history", async () => {
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { mode: "ghost" } }), headers: { "content-type": "application/json" } }));
    const changed = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { mode: "agent" } }), headers: { "content-type": "application/json" } }));
    const changedBody = await changed.json();
    expect(changedBody.messages).toHaveLength(0);

    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "You are Agent-owned now." } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "What mode are you in right now?" }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(requestBody.messages[0].content).toContain("AUTHORITATIVE LIVE STATE");
    expect(requestBody.messages[0].content).toContain('"mode": "agent"');
    expect(requestBody.messages[0].content).toContain('"modeLabel": "Agent-owned"');
    vi.unstubAllGlobals();
  });

  it("preserves the exact Teach acknowledgement for a recognized writing preference", async () => {
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "When writing posts (not replies), write one sentence per line with a blank line between sentences." }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages.at(-1).content).toContain("one sentence per paragraph");
    expect(body.messages.at(-1).content).toContain("Replies can stay normally formatted");
    expect(body.proposals[0].file).toBe("TASTE");
  });

  it("explains provider setup instead of pretending to answer", async () => {
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "Hello" }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages.at(-1).content).toContain("not connected");
    expect(body.messages.at(-1).content).not.toContain("I heard you");
  });

  it("does not auto-run a due live Assignment through a stale browser Bridge", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = readState();
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "bridge", execution: { ...state.presence!.execution, post: "auto" } } });
    state.presence!.environment = "live";
    state.presence!.browserAccess = { enabled: true };
    state.presences = state.presences.map((item) => item.id === presenceId ? { ...item, environment: "live" as const, browserAccess: { enabled: true } } : item);
    state = applyOperation(state, { type: "createBridge", input: { presenceId, name: "Signed-in X browser", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply"], formats: ["text"], metrics: [], assetKinds: [] } } });
    const bridge = state.bridges[0]!;
    bridge.state = "online";
    bridge.lastSeenAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const now = new Date();
    const dueMinutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - 1);
    const dueTime = `${String(Math.floor(dueMinutes / 60)).padStart(2, "0")}:${String(dueMinutes % 60).padStart(2, "0")}`;
    state = applyOperation(state, { type: "createAssignment", presenceId, environment: "live", instruction: "Share one useful lesson about persistent agents.", schedule: { day: now.toLocaleDateString("en-US", { weekday: "long" }), time: dueTime, executionWindow: `${dueTime}–23:59` }, delegationPolicy: "keep_moving" });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await attentionResult(response);
    const updated = body.assignments.find((item: { id: string }) => item.id === assignment.id);
    expect(response.status).toBe(200);
    expect(updated.lastEvaluatedAt).toBeUndefined();
    expect(body.events[0]?.title).not.toBe("Assignment attention started");
  });

  it("tests and saves read-write credentials without returning the secret", async () => {
    const request = new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId: readState().presence?.id, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.access).toBe("read-write");
    expect(body.state.nativeConnections[0].account.username).toBe("jenny_ai");
    expect(body.state.nativeConnections[0].observation).toMatchObject({ status: "up-to-date", ownPostCount: 0, mentionCount: 0, conversationCount: 0 });
    expect(JSON.stringify(body.state)).not.toContain("test_secret");
    expect(readChannelSecret(body.state.nativeConnections[0].id)).toMatchObject({ apiKey: "test_api", apiSecret: "test_secret" });
  });

  it("rejects read-write credentials authenticated as a different X account", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "wrong-account", username: "not_genny", name: "Wrong account" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const presenceId = readState().presence?.id;
    const response = await POST(new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" } }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("ACCOUNT_MISMATCH");
    expect(readState().nativeConnections).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("retains a deleted X post in verified public history after targeted reconciliation", async () => {
    const presenceId = readState().presence!.id;
    const save = await POST(new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }),
      headers: { "content-type": "application/json" },
    }));
    const saved = await save.json();
    const connectionId = saved.state.nativeConnections[0].id;
    let seeded = readState();
    seeded = recordNativeMirror(seeded, { connectionId, presenceId, own: true, post: { id: "deleted-post", text: "This was deleted on X.", createdAt: new Date(Date.now() + 1_000).toISOString(), authorId: "mock-x-user", authorUsername: "jenny_ai", authorName: "Jenny" } });
    seeded = recordPublicFooting(seeded, presenceId, { postsPublished: 1, recentPostIds: ["deleted-post"], recentInboundIds: [], observedAt: new Date().toISOString() });
    writeState(seeded);

    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const currentPostAt = new Date(Date.now() + 2_000).toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "current-post", text: "Still public", created_at: currentPostAt, author_id: "mock-x-user" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mirrorObjects.find((item: { externalRef: { id: string } }) => item.externalRef.id === "deleted-post").archived).toBe(true);
    expect(derivePublicHistory(body, presenceId)).toEqual(expect.arrayContaining([expect.objectContaining({ externalRef: expect.objectContaining({ id: "deleted-post" }), availability: "deleted", externalUrl: "https://x.com/jenny_ai/status/deleted-post" })]));
    expect(readState().mirrorEvents.some((item) => item.event === "deleted" && item.externalRef.id === "deleted-post")).toBe(true);
    expect(body.events.some((item: { detail?: string }) => item.detail?.includes("reconciled 1 deleted post"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("checks missing own posts even when deletion is the only mirror change", async () => {
    const presenceId = readState().presence!.id;
    const save = await POST(new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }),
      headers: { "content-type": "application/json" },
    }));
    const connectionId = (await save.json()).state.nativeConnections[0].id;
    let seeded = readState();
    seeded = recordNativeMirror(seeded, { connectionId, presenceId, own: true, post: { id: "deleted-post", text: "This was deleted on X.", createdAt: "2026-08-15T11:00:00.000Z", authorId: "mock-x-user", authorUsername: "jenny_ai", authorName: "Jenny" } });
    seeded = recordNativeMirror(seeded, { connectionId, presenceId, own: true, post: { id: "still-live", text: "This is still public.", createdAt: "2026-08-16T11:00:00.000Z", authorId: "mock-x-user", authorUsername: "jenny_ai", authorName: "Jenny" } });
    const liveMirror = seeded.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === "still-live");
    expect(liveMirror).toBeDefined();
    seeded = applyOperation(seeded, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: liveMirror!.id, publicationAgeSeconds: 3600, metrics: { impressions: 1 } });
    seeded = recordPublicFooting(seeded, presenceId, { postsPublished: 2, recentPostIds: ["still-live", "deleted-post"], recentInboundIds: [], observedAt: new Date().toISOString() });
    writeState(seeded);

    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "still-live", text: "This is still public.", created_at: "2026-08-16T11:00:00.000Z", author_id: "mock-x-user" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.mirrorObjects.find((item: { externalRef: { id: string } }) => item.externalRef.id === "deleted-post").archived).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/2/tweets?ids=deleted-post"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stores provider secrets in the encrypted vault instead of app state", async () => {
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    const connectionId = body.providerConnections.find((item: { provider: string }) => item.provider === "openai").id;
    expect(JSON.stringify(body)).not.toContain("provider-secret-test");
    expect(readProviderSecret(connectionId)).toBe("provider-secret-test");
  });

  it("supports explicit read-only access with an app Bearer Token", async () => {
    const request = new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId: readState().presence?.id, credentials: { apiKey: "test_api", apiSecret: "test_secret", bearerToken: "test_bearer" } }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect((await response.json()).result.access).toBe("read");
  });

  it("tests real OAuth requests with an OAuth 1.0a signature", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "1", username: "jenny_ai", name: "Jenny", profile_image_url: "https://pbs.twimg.com/profile_images/jenny.jpg" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "test", presenceId: readState().presence?.id, credentials: { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" } }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const authorization = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(authorization.Authorization).toMatch(/^OAuth /);
    expect(authorization.Authorization).toContain("oauth_signature=");
    expect((await response.json()).result.account.profileImageUrl).toBe("https://pbs.twimg.com/profile_images/jenny.jpg");
    vi.unstubAllGlobals();
  });

  it("signs X observation query parameters exactly once", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.setSystemTime(new Date(1700000000000));
    vi.spyOn(crypto, "randomBytes").mockImplementation((() => Buffer.from("nonce")) as typeof crypto.randomBytes);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const credentials = { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" };
    const query = { "tweet.fields": "created_at,conversation_id,referenced_tweets,attachments,lang", expansions: "author_id,attachments.media_keys,referenced_tweets.id", "user.fields": "name,username,profile_image_url", "media.fields": "type,url,preview_image_url,alt_text", max_results: "10" };
    await readRecentXPosts(credentials, "account-1", 10);

    const authorization = (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization;
    const encoded = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const oauth = {
      oauth_consumer_key: "api",
      oauth_nonce: "6e6f6e6365",
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: "1700000000",
      oauth_token: "token",
      oauth_version: "1.0",
    };
    const pairs = Object.entries({ ...query, ...oauth }).map(([key, value]) => [encoded(key), encoded(value)] as const);
    pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    const parameterString = pairs.map(([key, value]) => `${key}=${value}`).join("&");
    const base = ["GET", encoded("https://api.x.com/2/users/account-1/tweets"), encoded(parameterString)].join("&");
    const signature = crypto.createHmac("sha1", `${encoded("secret")}&${encoded("token-secret")}`).update(base).digest("base64");
    expect(authorization).toContain(`oauth_signature="${encoded(signature)}"`);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.com/2/users/account-1/tweets?tweet.fields=created_at%2Cconversation_id%2Creferenced_tweets%2Cattachments%2Clang&expansions=author_id%2Cattachments.media_keys%2Creferenced_tweets.id&user.fields=name%2Cusername%2Cprofile_image_url&media.fields=type%2Curl%2Cpreview_image_url%2Calt_text&max_results=10");
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hydrates X post fields, authors, quoted references, and media expansions", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "mention-1", text: "@jenny_ai thoughts?", author_id: "user-1", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "parent-1" }, { type: "quoted", id: "quote-1" }], attachments: { media_keys: ["media-1"] } }],
      includes: {
        tweets: [{ id: "parent-1", text: "The earlier public claim", author_id: "user-2", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "root-1" }] }, { id: "quote-1", text: "Quoted evidence" }],
        users: [{ id: "user-1", username: "builder", name: "Builder", profile_image_url: "https://pbs.twimg.com/profile_images/builder.jpg" }, { id: "user-2", username: "author", name: "Author" }],
        media: [{ media_key: "media-1", type: "photo", url: "https://pbs.twimg.com/media/example.jpg", alt_text: "A useful chart" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const posts = await readXPostsByIds({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, ["mention-1"]);
    const mention = posts.find((post) => post.id === "mention-1");
    const parent = posts.find((post) => post.id === "parent-1");
    expect(mention).toMatchObject({ conversationId: "root-1", parentId: "parent-1", authorUsername: "builder", authorAvatarUrl: "https://pbs.twimg.com/profile_images/builder.jpg" });
    expect(mention?.referencedPosts).toEqual([{ type: "replied_to", id: "parent-1" }, { type: "quoted", id: "quote-1" }]);
    expect(mention?.media?.[0]).toMatchObject({ type: "photo", url: "https://pbs.twimg.com/media/example.jpg", altText: "A useful chart" });
    expect(parent?.text).toBe("The earlier public claim");
    vi.unstubAllGlobals();
  });

  it("requires the X API to confirm an own post disappeared after deletion", async () => {
    const priorTestMode = process.env.OPENPRESENCE_TEST_MODE;
    const priorXMock = process.env.OPENPRESENCE_X_API_MOCK;
    process.env.OPENPRESENCE_TEST_MODE = "0";
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { deleted: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: undefined }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(deleteXPost({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, "post-to-delete")).resolves.toEqual({ type: "x.post", id: "post-to-delete" });
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/2/tweets?ids=post-to-delete");
    } finally {
      if (priorTestMode === undefined) delete process.env.OPENPRESENCE_TEST_MODE;
      else process.env.OPENPRESENCE_TEST_MODE = priorTestMode;
      if (priorXMock === undefined) delete process.env.OPENPRESENCE_X_API_MOCK;
      else process.env.OPENPRESENCE_X_API_MOCK = priorXMock;
      vi.unstubAllGlobals();
    }
  });

  it("persists X thread identity and media as normalized Mirror evidence", () => {
    const state = createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const next = recordNativeMirror(state, {
      connectionId: "connection-1",
      presenceId: state.presence!.id,
      post: {
        id: "mention-1",
        text: "@jenny_ai thoughts?",
        authorAvatarUrl: "https://pbs.twimg.com/profile_images/builder.jpg",
        conversationId: "root-1",
        parentId: "parent-1",
        referencedPosts: [{ type: "replied_to", id: "parent-1" }, { type: "quoted", id: "quote-1" }],
        media: [{ mediaKey: "media-1", type: "photo", url: "https://pbs.twimg.com/media/example.jpg" }],
      },
    });
    const mirror = next.mirrorObjects[0]!;
    expect(mirror.conversationExternalRef).toBe("root-1");
    expect(mirror.parentExternalRef).toEqual({ type: "x.post", id: "parent-1" });
    expect(mirror.referencedExternalRefs).toEqual([{ type: "x.post", id: "parent-1" }, { type: "x.post", id: "quote-1" }]);
    expect(mirror.assetRefs).toHaveLength(1);
    expect(mirror.objectType).toBe("post");
    expect(next.assets[0]?.provenance.sourceUrl).toBe("https://pbs.twimg.com/media/example.jpg");
    expect(mirror.environment).toBe("live");
    expect(mirror.author?.avatarUrl).toBe("https://pbs.twimg.com/profile_images/builder.jpg");
  });

  it("preserves native X replies and repairs legacy post classifications", () => {
    const state = createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const reply = { id: "reply-1", text: "A contextual answer", conversationId: "root-1", parentId: "parent-1", authorUsername: "jenny_ai" };
    const recorded = recordNativeMirror(state, { connectionId: "connection-1", presenceId: state.presence!.id, own: true, post: reply });
    const replyMirror = recorded.mirrorObjects.find((item) => item.externalRef.id === reply.id)!;

    expect(replyMirror.objectType).toBe("reply");
    expect(derivePublicHistory(recorded, state.presence!.id)[0]).toMatchObject({ kind: "reply", parentExternalRef: { type: "x.post", id: "parent-1" } });

    const legacy = { ...recorded, mirrorObjects: recorded.mirrorObjects.map((item) => item.externalRef.id === reply.id ? { ...item, objectType: "post" } : item) };
    const repaired = recordNativeMirror(legacy, { connectionId: "connection-1", presenceId: state.presence!.id, post: reply });
    expect(repaired.mirrorObjects.find((item) => item.externalRef.id === reply.id)?.objectType).toBe("reply");
  });

  it.each([
    { status: 402, body: { title: "credits depleted" }, expected: "credits depleted" },
    { status: 403, body: { detail: "Your monthly spend cap has been reached." }, expected: "Your monthly spend cap has been reached." },
  ])("turns exhausted X credits or spend caps into an actionable error ($status)", async ({ status, body, expected }) => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));
    const request = new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "test", presenceId: readState().presence?.id, credentials: { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" } }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(expected);
    vi.unstubAllGlobals();
  });

  it("rechecks model provider credits from the Needs You incident and clears only that incident", async () => {
    const presenceId = readState().presence!.id;
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const { incident } = recordOperationalFailure({ dependency: "model_provider", presenceId, error: "credits depleted" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "recheckModelProvider", presenceId, incidentId: incident.id }), headers: { "content-type": "application/json" } }));
      expect(response.status).toBe(200);
      expect(readOperationalHealth(presenceId).incidents.find((item) => item.id === incident.id)).toBeUndefined();
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).messages).toContainEqual({ role: "user", content: "Reply with exactly OK." });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rechecks an X-backed credits incident and clears the generic runtime card", async () => {
    const presenceId = readState().presence!.id;
    const saved = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    expect(saved.status).toBe(200);
    const { incident } = recordOperationalFailure({ dependency: "runtime", presenceId, error: "X has no API credits remaining. Add credits or choose an API plan to continue." });
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId, manual: true, incidentId: incident.id }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    expect(readOperationalHealth(presenceId).incidents.find((item) => item.id === incident.id)).toBeUndefined();
  });

  it("rechecks a recovered local runtime incident without hiding active work", async () => {
    const presenceId = readState().presence!.id;
    const { incident } = recordOperationalFailure({ dependency: "runtime", presenceId, error: new WorkspaceConflictError("agent-test", 4, 5) });
    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "recheckRuntime", presenceId, incidentId: incident.id }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    expect(readOperationalHealth(presenceId).incidents.find((item) => item.id === incident.id)).toBeUndefined();
    expect(readState().events[0]?.title).toBe("Runtime rechecked");
  });

  it("disconnects the Presence and removes its protected secret", async () => {
    const presenceId = readState().presence!.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", bearerToken: "test_bearer" } }), headers: { "content-type": "application/json" } }));
    const connectionId = (await save.json()).state.nativeConnections[0].id;
    const response = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "disconnect", presenceId }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).state.nativeConnections).toHaveLength(0);
    expect(readChannelSecret(connectionId)).toBeUndefined();
  });

  it("delivers a native X post through the execution ledger", async () => {
    const presenceId = readState().presence?.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await save.json()).state;
    state = applyOperation(state, { type: "addSlot", instruction: "Share one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    writeState(state);
    const execution = state.executions[0]!;
    expect(execution.connector).toBe("native");
    expect(execution.status).toBe("queued");
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "executeIntent", id: state.socialIntents[0]!.id }), headers: { "content-type": "application/json" } }));
    const completed = await response.json();
    expect(response.status).toBe(200);
    expect(completed.executions[0].status).toBe("blocked");
    expect(completed.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(completed.outcomes).toHaveLength(0);
  });

  it("keeps a public-route native retry in backoff until cancellation fences it", async () => {
    const presenceId = readState().presence!.id;
    const saved = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await saved.json()).state;
    state = applyOperation(state, { type: "setPresence", patch: { execution: { ...state.presence!.execution, like: "auto" } } });
    state.mirrorObjects = [{ id: "public-route-retry-target", bridgeId: state.nativeConnections[0].id, presenceId, channelId: "x", externalRef: { type: "x.post", id: "public-route-retry-post" }, objectType: "post", language: "en", content: { text: "A public route retry target", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "public-route-retry-post" } });
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "Temporary native failure.");
    writeState(state);
    const like = vi.spyOn(await import("../lib/x"), "likeXPost").mockResolvedValue({ type: "x.like", id: "must-not-be-created" });

    const retried = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "retryExecution", id: executionId }), headers: { "content-type": "application/json" } }));
    expect(retried.status).toBe(200);
    const queued = (await retried.json()).executions.find((item: { id: string }) => item.id === executionId);
    expect(queued).toMatchObject({ status: "queued", retryAt: expect.any(String) });
    expect(new Date(queued.retryAt).getTime()).toBeGreaterThan(Date.now());
    expect(like).not.toHaveBeenCalled();

    const cancelled = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "cancelExecution", id: executionId }), headers: { "content-type": "application/json" } }));
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).executions.find((item: { id: string }) => item.id === executionId)).toMatchObject({ status: "cancelled" });
    expect(like).not.toHaveBeenCalled();
  });

  it("runs the Publishing Initiative Assignment without a Calendar slot and counts only verified Mirror evidence", async () => {
    const presenceId = readState().presence!.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await save.json()).state;
    state = recordPublicFooting(state, presenceId!, { postsPublished: 1, recentPostIds: ["prior-post"], observedAt: new Date().toISOString() });
    process.env.OPENPRESENCE_AI_MOCK = "1";
    state = applyOperation(state, { type: "setPresence", patch: { execution: { ...state.presence!.execution, post: "auto" }, publishingInitiative: { ...state.presence!.publishingInitiative, mode: "pace", target: { count: 2, period: "day" }, timezone: "UTC" } } });
    writeState(state);

    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const priorPostAt = new Date(Date.now() + 1_000).toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "prior-post", text: "A prior public contribution", created_at: priorPostAt, conversation_id: "prior-post" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "mock-post-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const delivered = await attentionResult(response);
    expect(response.status).toBe(200);
    const assignmentId = delivered.presence.publishingInitiative.assignmentId;
    const execution = delivered.executions.find((item: { id: string; assignmentId?: string }) => item.assignmentId === assignmentId);
    expect(execution).toMatchObject({ assignmentId, affordance: "x.post", status: "blocked" });
    if (!execution) throw new Error("The autonomous publishing execution was not created.");
    expect(delivered.assignments.find((item: { id: string }) => item.id === assignmentId).progress.verified).toBe(0);

    const verified = recordNativeMirror(delivered, { connectionId: delivered.nativeConnections[0].id, presenceId, own: true, post: { id: "mock-post-1", text: "A durable agent earns trust by showing the path from observation to judgment to action, not by hiding the uncertain parts." } });
    expect(verified.assignments.find((item: { id: string }) => item.id === assignmentId)).toMatchObject({ progress: { verified: 0 } });
    expect(verified.mirrorObjects.find((item: { externalRef: { id: string } }) => item.externalRef.id === "mock-post-1")?.originExecutionId).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("reconciles an exact observed own reply after its delivery acknowledgement was lost", () => {
    const state = createAgent({ name: "Reconcile Reply", description: "Test", audience: "Builders", mode: "agent", handle: "@reconcile_reply", accent: "#777777" });
    const presenceId = state.presence!.id;
    const createdAt = "2026-08-25T20:12:52.000Z";
    state.socialIntents.unshift({ id: "intent_lost_ack", agentId: state.agent!.id, presenceId, affordance: "x.reply", target: { type: "x.post", id: "parent-post" }, publicationId: "publication_lost_ack", priority: 60, validity: {}, state: "active", formedAt: createdAt, updatedAt: createdAt });
    state.executions.unshift({ id: "execution_lost_ack", socialIntentId: "intent_lost_ack", presenceId, affordance: "x.reply", mode: "auto", status: "blocked", attempts: 0, connector: "native", target: { type: "x.post", id: "parent-post" }, idempotencyKey: "lost-ack", publication: { id: "publication_lost_ack", format: "x.reply", payload: { text: "A truthful exact reply." }, assetIds: [], links: [], createdAt, environment: "live" }, createdAt, updatedAt: createdAt, failure: { code: "MISSING_PERMIT", message: "Acknowledgement was lost.", retryable: false } });
    state.actions.unshift({ id: "action_lost_ack", intent: "reply", target: "parent-post", summary: "A truthful exact reply.", status: "failed", reason: "Acknowledgement was lost.", createdAt, socialIntentId: "intent_lost_ack", executionId: "execution_lost_ack" });

    const reconciled = recordNativeMirror(state, { connectionId: "native-reconcile", presenceId, own: true, post: { id: "public-reply", parentId: "parent-post", text: "@someone A truthful exact reply.", createdAt: "2026-08-25T20:16:16.000Z", authorUsername: "reconcile_reply" } });
    expect(reconciled.executions[0]).toMatchObject({ id: "execution_lost_ack", status: "succeeded", externalRef: { type: "x.reply", id: "public-reply" } });
    expect(reconciled.outcomes.some((outcome) => outcome.executionId === "execution_lost_ack" && outcome.evidence?.some((evidence) => evidence.id === "public-reply"))).toBe(true);
    expect(reconciled.actions[0]).toMatchObject({ status: "executed" });
    expect(reconciled.mirrorObjects.find((object) => object.externalRef.id === "public-reply")?.originExecutionId).toBe("execution_lost_ack");
  });

  it("evaluates a Calendar intention with the Agent before native X delivery", async () => {
    const presenceId = readState().presence?.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await save.json()).state;
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const added = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "addSlot", instruction: "Share one timely lesson for founders", day: "Wednesday", time: "21:00", objective: "education", executionWindow: "21:00–22:00", presenceId }), headers: { "content-type": "application/json" } }));
    state = await added.json();
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "post", text: "A useful lesson for founders, grounded in what I am learning about persistent AI: make the next decision easier for the person who has to live with it.", rationale: "It connects the standing instruction to a specific lesson for the audience." }) } }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "calendar-post-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runSlot", id: state.calendar[0]!.id, scheduled: true }), headers: { "content-type": "application/json" } }));
    const evaluated = await response.json();
    expect(response.status).toBe(200);
    expect(evaluated.calendar[0].lastEvaluatedAt).toBeTruthy();
    expect(evaluated.socialIntents[0].standingIntentId).toBe(evaluated.calendar[0].standingIntentId);
    expect(evaluated.executions[0].status).toBe("blocked");
    expect(evaluated.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(evaluated.outcomes).toHaveLength(0);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).messages.at(-1).content).toContain("Share one timely lesson for founders");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("records the Agent's reason when a Calendar intention chooses no-op", async () => {
    const presenceId = readState().presence?.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await save.json()).state;
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "no_op", text: "", rationale: "The current context offers no specific, timely contribution that would earn a standalone post." }) } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const added = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "addSlot", instruction: "Share one useful lesson for founders", day: "Wednesday", time: "21:00", objective: "education", executionWindow: "21:00–22:00", presenceId }), headers: { "content-type": "application/json" } }));
    state = await added.json();
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runSlot", id: state.calendar[0]!.id, scheduled: true }), headers: { "content-type": "application/json" } }));
    const evaluated = await response.json();
    expect(response.status).toBe(200);
    expect(evaluated.calendar[0].lastEvaluatedAt).toBeTruthy();
    expect(evaluated.actions[0]).toMatchObject({ intent: "no_op", status: "skipped", reason: "The current context offers no specific, timely contribution that would earn a standalone post." });
    expect(evaluated.events[0]).toMatchObject({ title: "Standing intention held" });
    expect(evaluated.events[0].detail).toContain("Reason: The current context offers no specific, timely contribution that would earn a standalone post.");
    expect(evaluated.executions).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("lets a first wake observe X, ask the Agent for a first move, and use the native execution path", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { status: "paused" } }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (url.includes("/chat/completions")) {
        const prompt = JSON.stringify(requestBody.messages ?? []);
        const content = prompt.includes("working plan") || prompt.includes("Publishing Planner")
          ? JSON.stringify({ horizonStart: new Date().toISOString(), horizonEnd: new Date(Date.now() + 86_400_000).toISOString(), expectedOriginals: { min: 0, max: 1 }, windows: [], currentWork: [], nextReassessmentAt: new Date(Date.now() + 3_600_000).toISOString(), rationaleSummary: "First wake can wait for a grounded opening." })
          : JSON.stringify({ acts: [{ action: "post", text: "I am here to make complicated AI systems feel more understandable. What are you trying to build?", rationale: "A concise first contribution invites a concrete conversation.", noStrategyReason: "Exploring a novel introduction before there is performance evidence to reuse." }], rationale: "A concise first contribution invites a concrete conversation." });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/users/")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("search/recent")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "wakePresence", presenceId }), headers: { "content-type": "application/json" } }));
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await attentionResult(response);
    expect(response.status).toBe(200);
    expect(body.presence.context.publicFooting.postsPublished).toBe(0);
    expect(body.events.some((event: { title: string }) => event.title === "Considering first public move")).toBe(true);
    expect(body.socialIntents[0].affordance).toBe("x.post");
    expect(body.executions[0].status).toBe("blocked");
    expect(body.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(body.events.some((event: { title: string; detail?: string }) => event.title === "Autonomous launch decision" && event.detail?.includes("socialStrategy"))
      || Boolean(body.socialDecisions[0]?.socialStrategy)).toBe(true);
    expect(body.socialDecisions[0]?.socialStrategy?.retrievalRunId).toBeTruthy();
    const cognitionCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/chat/completions"));
    expect(JSON.stringify(cognitionCall?.[1]?.body)).toContain("publicFooting");
    expect(JSON.stringify(cognitionCall?.[1]?.body)).toContain("postsPublished");
    vi.unstubAllGlobals();
  });

  it("does not lose a substantive inbound reply when observation and pulse overlap", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { execution: { reply: "auto" } } }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        const messages = (JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>).messages;
        const isPlan = Array.isArray(messages) && messages.some((message) => message && typeof message === "object" && String((message as Record<string, unknown>).content ?? "").includes("Create a bounded working plan"));
        const content = isPlan
          ? JSON.stringify({ horizonStart: new Date().toISOString(), horizonEnd: new Date(Date.now() + 86_400_000).toISOString(), expectedOriginals: { min: 0, max: 1 }, windows: [], currentWork: [], nextReassessmentAt: new Date(Date.now() + 3_600_000).toISOString(), rationaleSummary: "Keep the social response focused on the inbound conversation." })
          : JSON.stringify({ acts: [{ action: "reply", text: "I care about thoughtful AI products, durable relationships, and the ideas that help people build with more clarity. What are you working on?", rationale: "The mention contains an open question worth answering.", noStrategyReason: "No supplied strategy pattern fits this direct conversational question." }], conversationDisposition: "continue", rationale: "The mention contains an open question worth answering." });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/users/")) return new Response(JSON.stringify({ data: [{ id: "post-1", text: "Jenny's first post", lang: "en", created_at: "2026-08-13T01:00:00.000Z", conversation_id: "post-1" }] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("search/recent")) return new Response(JSON.stringify({ data: [{ id: "mention-1", text: "@jenny_ai I'm building an AI product for founders. What are you interested in discussing?", lang: "en", created_at: "2026-08-13T01:01:00.000Z", author_id: "user-1", conversation_id: "post-1", referenced_tweets: [{ type: "replied_to", id: "post-1" }] }], includes: { users: [{ id: "user-1", username: "builder" }] } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: { id: "reply-1" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runPulse", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await attentionResult(response);
    expect(response.status).toBe(200);
    expect(body.events.some((event: { title: string }) => event.title === "A reply intention was formed")).toBe(true);
    expect(body.executions[0].affordance).toBe("x.reply");
    expect(body.executions[0].status).toBe("blocked");
    expect(body.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(body.socialDecisions.some((decision: { origin?: { refId?: string }; decision?: string }) => decision.origin?.refId === "mention-1" && decision.decision === "reply")).toBe(true);
    const cognitionCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/chat/completions") && String((call[1] as RequestInit | undefined)?.body).includes("Evaluate the current X world"));
    const cognitionRequest = JSON.stringify(cognitionCall?.[1]?.body);
    expect(cognitionRequest).toContain("Jenny's first post");
    vi.unstubAllGlobals();
  });

  it("does not treat unrelated Social Mirror search evidence as an inbound mention", async () => {
    const presenceId = readState().presence?.id;
    if (!presenceId) throw new Error("The test Presence was not created.");
    const saved = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    const connected = (await saved.json()).state;
    const mirrorEvidence = recordNativeMirror(connected, {
      connectionId: connected.nativeConnections[0].id,
      presenceId,
      post: { id: "search-evidence-1", text: "A public post found through an unrelated search.", authorId: "other-user", authorUsername: "other_user", authorName: "Other User", conversationId: "search-evidence-1" },
    });
    writeState(mirrorEvidence);
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/users/")) return new Response(JSON.stringify({ data: [{ id: "own-post-1", text: "Jenny's existing public footing", created_at: "2026-08-15T11:00:00.000Z", author_id: "mock-x-user", conversation_id: "own-post-1" }] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runPulse", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await attentionResult(response);
    expect(response.status).toBe(200);
    expect(body.executions).toHaveLength(0);
    expect(body.events.some((event: { title: string }) => event.title === "Worth responding to")).toBe(false);
    expect(body.presence.context.publicFooting.recentInboundIds).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("nudges cognition after automatic observation and replies to the focal mention with full ancestry", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { execution: { reply: "auto" } } }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/chat/completions")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "reply", text: "The root claim matters here; the immediate reply makes the tradeoff clearer. What would you test next?", rationale: "The full ancestry supports one specific continuation." }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/users/")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("search/recent")) return new Response(JSON.stringify({ data: [{ id: "mention-1", text: "@jenny_ai What do you think?", lang: "en", created_at: "2026-08-15T12:00:00.000Z", author_id: "user-1", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "parent-1" }] }], includes: { users: [{ id: "user-1", username: "builder", name: "Builder" }] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("ids=parent-1")) return new Response(JSON.stringify({ data: [{ id: "parent-1", text: "The immediate public claim", lang: "en", created_at: "2026-08-15T11:59:00.000Z", author_id: "user-2", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "root-1" }] }], includes: { tweets: [{ id: "root-1", text: "The root idea that gives this exchange meaning", lang: "en", created_at: "2026-08-15T11:58:00.000Z", author_id: "user-3", conversation_id: "root-1" }], users: [{ id: "user-2", username: "author", name: "Author" }, { id: "user-3", username: "originator", name: "Originator" }] } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: { id: "reply-1" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.events.some((event: { title: string }) => event.title === "New mention received")).toBe(true);
    expect(body.events.some((event: { title: string }) => event.title === "Evaluating observed context")).toBe(true);
    expect(body.events.some((event: { title: string }) => event.title === "Worth responding to")).toBe(true);
    expect(body.presence.context.publicFooting.judgedInboundIds).toContain("mention-1");
    expect(body.executions[0].target).toEqual({ type: "x.post", id: "mention-1" });
    const cognitionCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/chat/completions"));
    const cognitionRequest = JSON.stringify(cognitionCall?.[1]?.body);
    expect(cognitionRequest).toContain("The root idea that gives this exchange meaning");
    expect(cognitionRequest).toContain("The immediate public claim");
    expect(cognitionRequest).toContain("@jenny_ai What do you think?");
    expect(cognitionRequest).toContain("Thread context (complete)");
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("/2/tweets") && (call[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("makes a manual credit check reach X even when the prior credit error paused the Presence", async () => {
    const presenceId = readState().presence!.id;
    const saved = await POST(new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }),
      headers: { "content-type": "application/json" },
    }));
    const savedState = (await saved.json()).state;
    const stale = {
      ...savedState,
      presence: { ...savedState.presence, status: "paused" },
      presences: savedState.presences.map((item: { id: string }) => item.id === presenceId ? { ...item, status: "paused" } : item),
      nativeConnections: savedState.nativeConnections.map((item: { presenceId: string; kind: string }) => item.presenceId === presenceId && item.kind === "x"
        ? { ...item, deliveryError: "X has no API credits remaining for this app.", observation: { status: "error", error: "X has no API credits remaining for this app." } }
        : item),
    };
    writeState(stale);
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "mock-x-user", username: "jenny_ai", name: "Jenny" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "syncNativeX", presenceId, manual: true }),
      headers: { "content-type": "application/json" },
    }));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    const connection = body.nativeConnections.find((item: { presenceId: string; kind: string }) => item.presenceId === presenceId && item.kind === "x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connection.observation.status).toBe("stale");
    expect(xCreditsExhausted(connection)).toBe(false);
    expect(body.presence.status).toBe("live");
    expect(body.events.some((event: { title: string }) => event.title === "X connection restored")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("blocks live writing before a test runtime can contact X", async () => {
    const presenceId = readState().presence?.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "A real post candidate from Jenny." } }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden", detail: "Your client app is not configured with the appropriate permissions." }), { status: 403, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "Introduce this Presence on X." }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.nativeConnections[0].status).toBe("connected");
    expect(body.executions[0].status).toBe("blocked");
    expect(body.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(body.outcomes).toHaveLength(0);
    expect(body.executions[0].externalRef).toBeUndefined();
    expect(body.events.some((event: { title: string }) => event.title === "Live publication blocked")).toBe(true);
    expect((await save.json()).state.nativeConnections[0].status).toBe("connected");
    vi.unstubAllGlobals();
  });

  it("blocks the leaked planner object in the generic Chat-to-X path", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    const leakedPlannerObject = '{"conversationDisposition":"react_only","action":"like","rationale":"Self-contained playful continuation; a quiet signal preserves the joke without competing for the last word."}';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: leakedPlannerObject } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "sendMessage", content: "Introduce this Presence on X." }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });
    expect(body.executions[0].externalRef).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("matches a Chrome-submitted reply only when X confirms the exact author, parent, and text", () => {
    const post = {
      id: "reply-1",
      text: "I'm voting for cats as test authors, not judges.",
      authorId: "genny-id",
      authorUsername: "example_agent",
      authorName: "Genny",
      parentId: "boardy-post-1",
    };
    expect(normalizeXText("  I’m   voting for cats as test authors, not judges.  ")).toBe(post.text);
    expect(matchesXReply(post, { targetId: "boardy-post-1", text: "I’m voting for cats as test authors, not judges.", handle: "@example_agent" })).toBe(true);
    expect(matchesXReply(post, { targetId: "other-post", text: post.text, handle: "@example_agent" })).toBe(false);
    expect(matchesXReply(post, { targetId: "boardy-post-1", text: post.text, handle: "@another-account" })).toBe(false);
    expect(matchesXReply(post, { targetId: "boardy-post-1", text: "A different reply", handle: "@example_agent" })).toBe(false);
    expect(matchesXReply({ ...post, text: "@boardyai I'm voting for cats as test authors, not judges." }, { targetId: "boardy-post-1", text: post.text, handle: "@example_agent" })).toBe(true);
  });

  it("matches and finds a Chrome-submitted quote only by exact author, text, and quoted target", async () => {
    const post = { id: "quote-1", text: "The missing constraint is accountability.", authorUsername: "example_agent", referencedPosts: [{ type: "quoted" as const, id: "target-1" }] };
    expect(matchesXQuote(post, { targetId: "target-1", text: post.text, handle: "@example_agent" })).toBe(true);
    expect(matchesXQuote(post, { targetId: "target-2", text: post.text, handle: "@example_agent" })).toBe(false);

    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "quote-from-search", text: post.text, author_id: "genny-id", referenced_tweets: [{ type: "quoted", id: "target-1" }] }],
      includes: { users: [{ id: "genny-id", username: "example_agent", name: "Genny" }] },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await findVerifiedXQuote({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, { targetId: "target-1", text: post.text, handle: "@example_agent" });
    expect(result?.id).toBe("quote-from-search");
    vi.unstubAllGlobals();
  });

  it("can verify through recent search when the browser did not expose a candidate id", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "reply-from-search", text: "The verified reply.", author_id: "genny-id", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "target-1" }] }],
      includes: { users: [{ id: "genny-id", username: "example_agent", name: "Genny" }] },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await findVerifiedXReply({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, { targetId: "target-1", text: "The verified reply.", handle: "@example_agent" });
    expect(result?.id).toBe("reply-from-search");
    vi.unstubAllGlobals();
  });

  it("verifies a reply at any thread depth instead of assuming the target is the thread root", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "nested-reply", text: "@martin_casado The verified reply.", author_id: "genny-id", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "target-1" }] }],
      includes: { users: [{ id: "genny-id", username: "example_agent", name: "Genny" }] },
    }), { status: 200, headers: { "content-type": "application/json" }}));
    vi.stubGlobal("fetch", fetchMock);
    const result = await findVerifiedXReply({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, { targetId: "target-1", text: "The verified reply.", handle: "@example_agent" });
    expect(result?.id).toBe("nested-reply");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("from%3Aexample_agent");
    vi.unstubAllGlobals();
  });

  it("skips hydration network calls and hydration usage tracking for standalone posts without parentExternalRef", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const state = createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state.nativeConnections = [{
      id: "conn-1",
      presenceId: state.presence!.id,
      kind: "x",
      status: "connected",
      channelId: "x",
      access: "read-write",
      account: { id: "user-1", username: "jenny_ai", name: "Jenny" },
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }];
    const standaloneMirror = {
      id: "mirror-standalone",
      bridgeId: "native:conn-1",
      presenceId: state.presence!.id,
      channelId: "x" as const,
      externalRef: { type: "x.post", id: "standalone-1" },
      objectType: "post",
      occurredAt: "2026-08-20T00:00:00.000Z",
      observedAt: "2026-08-20T00:00:00.000Z",
      visibility: "public" as const,
      shareability: "presence-only" as const,
      environment: "live" as const,
      source: "native" as const,
      trust: "untrusted_world_content" as const,
    };
    state.mirrorObjects = [standaloneMirror];

    const next = await hydrateNativeXThreadContext(state, state.presence!.id, standaloneMirror);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(next.resourceUsageEvents.filter((event) => event.category === "hydration")).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
