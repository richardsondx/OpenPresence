import { beforeEach, describe, expect, it, vi } from "vitest";
import { readChannelSecret, readProviderSecret, readState, writeState } from "../lib/db";
import { applyOperation, createAgent } from "../lib/runtime";
import { generateAgentReply } from "../lib/ai";
import { POST } from "../app/api/x/manage/route";
import { POST as statePost } from "../app/api/state/route";
import { GET as ollamaModelsGet } from "../app/api/ollama/models/route";

beforeEach(() => {
  process.env.OPENPRESENCE_X_API_MOCK = "1";
  delete process.env.OPENPRESENCE_AI_MOCK;
  writeState({ ...createAgent({ name: "Jenny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }), nativeConnections: [] });
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
    expect(requestBody.model).toBe("gpt-4o");
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe("Bearer provider-secret-test");
    vi.unstubAllGlobals();
  });

  it("keeps live Presence changes ahead of stale chat history", async () => {
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { mode: "ghost" } }), headers: { "content-type": "application/json" } }));
    const changed = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { mode: "agent" } }), headers: { "content-type": "application/json" } }));
    const changedBody = await changed.json();
    expect(changedBody.messages.at(-1).content).toContain("now Agent-owned");

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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "1", username: "jenny_ai", name: "Jenny" } }), { status: 200, headers: { "content-type": "application/json" } }));
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
    vi.unstubAllGlobals();
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
    const presenceId = readState().presence?.id;
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
    expect(completed.executions[0].status).toBe("succeeded");
    expect(completed.outcomes[0].evidence[0].id).toBe("mock-post-1");
  });

  it("lets a first wake observe X, ask the Agent for a first move, and use the native execution path", async () => {
    const presenceId = readState().presence?.id;
    await POST(new Request("http://localhost/api/x/manage", { method: "POST", body: JSON.stringify({ action: "save", presenceId, credentials: { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_access", accessTokenSecret: "test_access_secret" } }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "configureProvider", provider: "openai", label: "OpenAI workspace", secret: "provider-secret-test", hasSecret: true }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" }), headers: { "content-type": "application/json" } }));
    await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "setPresence", patch: { status: "paused" } }), headers: { "content-type": "application/json" } }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], includes: { users: [] } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "I am here to make complicated AI systems feel more understandable. What are you trying to build?" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "wakePresence", presenceId }), headers: { "content-type": "application/json" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.presence.context.publicFooting.postsPublished).toBe(0);
    expect(body.events.some((event: { title: string }) => event.title === "Considering first public move")).toBe(true);
    expect(body.socialIntents[0].affordance).toBe("x.post");
    expect(body.executions[0].status).toBe("succeeded");
    expect(body.executions[0].externalRef).toEqual({ type: "x.post", id: "mock-post-1" });
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).toContain("publicFooting");
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).toContain("postsPublished");
    vi.unstubAllGlobals();
  });

  it("keeps a connected account truthful when X rejects a real write", async () => {
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
    expect(body.nativeConnections[0].status).toBe("needs-attention");
    expect(body.nativeConnections[0].healthMessage).toContain("appropriate permissions");
    expect(body.executions[0].status).toBe("failed");
    expect(body.outcomes[0].status).toBe("failed");
    expect(body.executions[0].externalRef).toBeUndefined();
    expect(body.events.some((event: { title: string; detail: string }) => event.title === "X delivery failed" && event.detail.includes("No external artifact"))).toBe(true);
    expect((await save.json()).state.nativeConnections[0].status).toBe("connected");
    vi.unstubAllGlobals();
  });
});
