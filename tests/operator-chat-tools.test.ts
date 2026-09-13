import { afterEach, describe, expect, it, vi } from "vitest";
import { executeChatRuntimeTool, deliverChatSandboxActions, chatExecutionReceipt } from "../lib/operator-chat-tools";
import { applyOperation, createAgent, startPlaygroundSession, addSandboxEvent } from "../lib/runtime";
import { saveNativeXCredentials, upsertNativeXConnection } from "../lib/x";

function fixture() {
  return createAgent({ name: "Tool Test", description: "Useful social judgment", mode: "agent", handle: "@tool_test", accent: "#777777" });
}
function connected() {
  let state = fixture();
  const presenceId = state.presence!.id;
  state = upsertNativeXConnection(state, { presenceId, id: "chat-native-test", account: { id: "account1", username: "tool_test", name: "Tool Test" }, access: "read-write" });
  saveNativeXCredentials("chat-native-test", { apiKey: "test-api", apiSecret: "test-secret", accessToken: "test-token", accessTokenSecret: "test-token-secret" });
  state.nativeConnections[0].deliveryError = "CreditsDepleted: old failure";
  return { state, presenceId };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Chat runtime tools", () => {
  it("actually probes X despite stale credit errors, without waking or publishing", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const initial = connected();
    const state = applyOperation(initial.state, { type: "setPresence", patch: { status: "paused" } });
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify({ data: String(url).includes("/users/me") ? { id: "account1", username: "tool_test", name: "Tool Test" } : [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeChatRuntimeTool(state, initial.presenceId, { kind: "check_connection" }, "check-run");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result).toMatchObject({ status: "passed", publicationTested: false });
    expect(result.state.presence?.status).toBe("paused");
    expect(result.state.executions).toEqual(state.executions);
    expect(result.state.nativeConnections[0].deliveryError).toBeUndefined();
    expect(JSON.stringify(result.result)).not.toContain("test-token");
  });
  it("returns the fresh provider failure instead of claiming a successful check", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const { state, presenceId } = connected();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ title: "CreditsDepleted", detail: "Current account has no credits" }), { status: 402 })));
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "check_connection" }, "failed-check");
    expect(result.result).toMatchObject({ status: "failed", publicationTested: false, error: expect.stringContaining("credits") });
    expect(result.state.executions).toHaveLength(0);
  });
  it("rejects credentials for another account before reading its timeline", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const { state, presenceId } = connected();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "other", username: "other", name: "Other" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "check_connection" }, "identity-check");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({ status: "failed", error: expect.stringContaining("ACCOUNT_MISMATCH") });
  });
  it.each(["post", "reply", "quote", "like", "repost", "follow"] as const)("forms and verifies a sandbox %s through the existing execution path", async (action) => {
    let state = applyOperation(fixture(), { type: "setPresence", patch: { connectionMode: "sandbox", status: "live", execution: { [action]: "auto" } } });
    const presenceId = state.presence!.id;
    state = startPlaygroundSession(state, presenceId, "fresh");
    const session = state.playgroundSessions[0];
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Builder", actorHandle: "@builder", content: "Shipping a small prototype teaches us where people hesitate." });
    const object = state.mirrorObjects[0];
    const targetId = action === "post" ? undefined : action === "follow" ? object.author?.externalRef?.id : object.externalRef.id;
    expect(action === "post" || targetId).toBeTruthy();
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "social_action", action, targetId, text: ["post", "reply", "quote"].includes(action) ? "One useful test: watch where someone pauses before their first click." : undefined }, "social-run");
    expect(result.deliveryExecutionIds).toHaveLength(1);
    const delivered = deliverChatSandboxActions(result.state, result.deliveryExecutionIds);
    expect(chatExecutionReceipt(delivered, presenceId, result.deliveryExecutionIds[0])).toMatchObject({ status: "succeeded", verified: true, environment: "sandbox" });
  });
  it("makes searched posts available as scoped action evidence", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const { state, presenceId } = connected();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "found-post", text: "A concrete observation", author_id: "found-author", lang: "en" }], includes: { users: [{ id: "found-author", username: "builder", name: "Builder" }] } }), { status: 200 })));
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "search_posts", query: "prototype" }, "search-run");
    expect(result.state.mirrorObjects).toContainEqual(expect.objectContaining({ presenceId, externalRef: { type: "x.post", id: "found-post" } }));
    expect(result.state.executions).toHaveLength(0);
  });
  it("respects disabled tool bindings and rejects fabricated action targets", async () => {
    const state = fixture();
    state.toolBindings = state.toolBindings.map((item) => item.toolId === "asset.inspect" ? { ...item, enabled: false } : item);
    await expect(executeChatRuntimeTool(state, state.presence!.id, { kind: "search_assets", query: "private" }, "disabled-run")).rejects.toThrow("disabled");
    await expect(executeChatRuntimeTool(state, state.presence!.id, { kind: "social_action", action: "like", targetId: "invented-target" }, "unknown-target-run")).rejects.toThrow("observed target");
  });
  it("keeps review-required posts awaiting review", async () => {
    let state = applyOperation(fixture(), { type: "setPresence", patch: { connectionMode: "sandbox", status: "live", execution: { post: "review" } } });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const result = await executeChatRuntimeTool(state, state.presence!.id, { kind: "social_action", action: "post", text: "A small prototype makes the next question easier to see." }, "review-run");
    const delivered = deliverChatSandboxActions(result.state, result.deliveryExecutionIds);
    expect(delivered.executions[0].status).toBe("awaiting-review");
    expect(delivered.outcomes).toHaveLength(0);
  });
});
