import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readChannelSecret, readProviderSecret, readState, writeState } from "../lib/db";
import { readRecentXPosts, readXPostsByIds } from "../lib/x";
import { applyOperation, createAgent, derivePublicHistory, recordNativeMirror, recordPublicFooting } from "../lib/runtime";
import { generateAgentReply } from "../lib/ai";
import { POST } from "../app/api/x/manage/route";
import { POST as statePost } from "../app/api/state/route";
import { GET as ollamaModelsGet } from "../app/api/ollama/models/route";

beforeEach(() => {
  process.env.OPENPRESENCE_X_API_MOCK = "1";
  delete process.env.OPENPRESENCE_AI_MOCK;
  const state = createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
  state.presence!.environment = "live";
  state.presence!.connectionMode = "native";
  state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "live" as const, connectionMode: "native" as const } : item);
  writeState({ ...state, nativeConnections: [] });
});

describe("native X connection", () => {
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

  it("turns exhausted X credits into an actionable error", async () => {
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "credits depleted" }), { status: 402, headers: { "content-type": "application/json" } })));
    const request = new Request("http://localhost/api/x/manage", {
      method: "POST",
      body: JSON.stringify({ action: "test", presenceId: readState().presence?.id, credentials: { apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" } }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("no API credits remaining");
    vi.unstubAllGlobals();
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

  it("runs the Publishing Initiative Assignment without a Calendar slot and counts only verified Mirror evidence", async () => {
    const presenceId = readState().presence!.id;
    const save = await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    let state = (await save.json()).state;
    state = recordPublicFooting(state, presenceId!, { postsPublished: 1, recentPostIds: ["prior-post"], observedAt: new Date().toISOString() });
    process.env.OPENPRESENCE_AI_MOCK = "1";
    state = applyOperation(state, { type: "setPresence", patch: { execution: { ...state.presence!.execution, post: "auto" }, publishingInitiative: { ...state.presence!.publishingInitiative, mode: "pace", target: { count: 1, period: "day" }, timezone: "UTC" } } });
    writeState(state);

    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "prior-post", text: "A prior public contribution", created_at: "2026-08-14T12:00:00.000Z", conversation_id: "prior-post" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "mock-post-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runAttentionWorker" }), headers: { "content-type": "application/json" } }));
    const delivered = await response.json();
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "post", text: "I am here to make complicated AI systems feel more understandable. What are you trying to build?", rationale: "A concise first contribution invites a concrete conversation." }) } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "wakePresence", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.presence.context.publicFooting.postsPublished).toBe(0);
    expect(body.events.some((event: { title: string }) => event.title === "Considering first public move")).toBe(true);
    expect(body.socialIntents[0].affordance).toBe("x.post");
    expect(body.executions[0].status).toBe("blocked");
    expect(body.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1]?.body)).toContain("publicFooting");
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1]?.body)).toContain("postsPublished");
    vi.unstubAllGlobals();
  });

  it("does not lose a substantive inbound reply when observation and pulse overlap", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { execution: { reply: "auto" } } }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "post-1", text: "Jenny's first post", created_at: "2026-08-13T01:00:00.000Z", conversation_id: "post-1" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "mention-1", text: "@jenny_ai I'm building an AI product for founders. What are you interested in discussing?", created_at: "2026-08-13T01:01:00.000Z", author_id: "user-1", conversation_id: "post-1", referenced_tweets: [{ type: "replied_to", id: "post-1" }] }], includes: { users: [{ id: "user-1", username: "builder" }] } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "reply", text: "I care about thoughtful AI products, durable relationships, and the ideas that help people build with more clarity. What are you working on?", rationale: "The mention contains an open question worth answering." }) } }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "reply-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runPulse", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.events.some((event: { title: string }) => event.title === "Worth responding to")).toBe(true);
    expect(body.executions[0].affordance).toBe("x.reply");
    expect(body.executions[0].status).toBe("blocked");
    expect(body.executions[0].failure.code).toBe("LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME");
    expect(body.presence.context.publicFooting.judgedInboundIds).toContain("mention-1");
    expect(body.events.find((event: { title: string }) => event.title === "Pulse completed")).toMatchObject({
      intentId: body.executions[0].socialIntentId,
      executionId: body.executions[0].id,
    });
    const cognitionRequest = JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body);
    expect(cognitionRequest).toContain("Jenny's first post");
    expect(cognitionRequest).toContain("Thread context (complete)");
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "own-post-1", text: "Jenny's existing public footing", created_at: "2026-08-15T11:00:00.000Z", author_id: "mock-x-user", conversation_id: "own-post-1" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "runPulse", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.executions).toHaveLength(0);
    expect(body.events.some((event: { title: string }) => event.title === "Worth responding to")).toBe(false);
    expect(body.presence.context.publicFooting.recentInboundIds).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("nudges cognition after automatic observation and replies to the focal mention with full ancestry", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { execution: { reply: "auto" } } }), headers: { "content-type": "application/json" } }));
    process.env.OPENPRESENCE_X_API_MOCK = "0";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "mention-1", text: "@jenny_ai What do you think?", created_at: "2026-08-15T12:00:00.000Z", author_id: "user-1", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "parent-1" }] }], includes: { users: [{ id: "user-1", username: "builder", name: "Builder" }] } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "parent-1", text: "The immediate public claim", created_at: "2026-08-15T11:59:00.000Z", author_id: "user-2", conversation_id: "root-1", referenced_tweets: [{ type: "replied_to", id: "root-1" }] }], includes: { tweets: [{ id: "root-1", text: "The root idea that gives this exchange meaning", created_at: "2026-08-15T11:58:00.000Z", author_id: "user-3", conversation_id: "root-1" }], users: [{ id: "user-2", username: "author", name: "Author" }, { id: "user-3", username: "originator", name: "Originator" }] } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "reply", text: "The root claim is the interesting part here; the immediate reply makes the tradeoff clearer. What would you test next?", rationale: "The full ancestry supports one specific continuation." }) } }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "reply-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "syncNativeX", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.events.some((event: { title: string }) => event.title === "New mention received")).toBe(true);
    expect(body.events.some((event: { title: string }) => event.title === "Evaluating observed context")).toBe(true);
    expect(body.events.some((event: { title: string }) => event.title === "Worth responding to")).toBe(true);
    expect(body.presence.context.publicFooting.judgedInboundIds).toContain("mention-1");
    expect(body.executions[0].target).toEqual({ type: "x.post", id: "mention-1" });
    const cognitionRequest = JSON.stringify(fetchMock.mock.calls[3]?.[1]?.body);
    expect(cognitionRequest).toContain("The root idea that gives this exchange meaning");
    expect(cognitionRequest).toContain("The immediate public claim");
    expect(cognitionRequest).toContain("@jenny_ai What do you think?");
    expect(cognitionRequest).toContain("Thread context (complete)");
    expect(fetchMock.mock.calls[4]).toBeUndefined();
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
});
