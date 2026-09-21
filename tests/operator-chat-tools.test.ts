import { afterEach, describe, expect, it, vi } from "vitest";
import { executeChatRuntimeTool, deliverChatSandboxActions, chatExecutionReceipt } from "../lib/operator-chat-tools";
import { queueOperatorAssignmentRetry } from "../lib/assignment-recovery";
import { applyOperation, createAgent, startPlaygroundSession, addSandboxEvent } from "../lib/runtime";
import { saveNativeXCredentials, upsertNativeXConnection } from "../lib/x";
import { materializeOperatorChatAttachments } from "../lib/operator-chat";

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
  it("returns the Agent-scoped recorded usage ledger without probing or mutating X", async () => {
    const initial = fixture();
    const presenceId = initial.presence!.id;
    initial.resourceUsageEvents = [
      { id: "usage-chat-model", agentId: initial.agent!.id, presenceId, invocationId: "usage-chat-model", originKind: "assignment", category: "model", provider: "openai", usage: { inputTokens: 2_000, outputTokens: 500, totalTokens: 2_500, requests: 1 }, createdAt: "2026-08-18T19:22:37.728Z" },
      { id: "usage-chat-read", agentId: initial.agent!.id, presenceId, invocationId: "usage-chat-read", originKind: "operator", category: "channel_read", action: "x.search", provider: "x", usage: { requests: 2 }, createdAt: "2026-08-18T19:22:37.728Z" },
    ];
    const result = await executeChatRuntimeTool(initial, presenceId, { kind: "usage_summary", range: "all" }, "usage-run");
    expect(result.result).toMatchObject({ totalTokens: 2_500, modelCalls: 1, apiRequests: 2, xReads: 2, xWrites: 0, authority: expect.stringContaining("Recorded local runtime") });
    expect(result.state).toBe(initial);
  });

  it("actually probes X despite stale credit errors, without waking or publishing", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "0");
    const initial = connected();
    initial.state.nativeConnections[0].deliveryError = "X API credits are exhausted.";
    saveNativeXCredentials("chat-native-test", { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_token", accessTokenSecret: "test_token_secret" });
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
  it("rechecks X reads, preserves the incident boundary, and queues the same blocked Assignment", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "1");
    const initial = connected();
    saveNativeXCredentials("chat-native-test", { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_token", accessTokenSecret: "test_token_secret" });
    initial.state.presences[0]!.environment = "live";
    if (initial.state.presence?.id === initial.presenceId) initial.state.presence.environment = "live";
    let state = applyOperation(initial.state, { type: "createAssignment", presenceId: initial.presenceId, environment: "live", instruction: "Publish one useful post about the prototype." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state.assignments[0]!.status = "needs_operator";
    state.assignments[0]!.work = { ...(state.assignments[0]!.work ?? { phase: "blocked", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "blocked", blockedReason: "X reports no API credits." };
    state.assignments[0]!.lastOutcome = { class: "delivery_failed", message: "X reports no API credits.", at: new Date().toISOString() };
    const result = await executeChatRuntimeTool(state, initial.presenceId, { kind: "retry_assignment", assignmentId: assignment.id }, "recovery-chat");
    expect(result.result).toMatchObject({ status: "queued", assignmentId: assignment.id, publicationTested: false, billingVerified: false, freshCheck: { status: "passed" } });
    expect(result.state.assignments).toHaveLength(state.assignments.length);
    expect(result.state.assignments.find((item) => item.id === assignment.id)?.status).toBe("working");
    expect(result.state.assignments.find((item) => item.id === assignment.id)?.lastOutcome).toBeUndefined();
    expect(result.state.assignmentRuns).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId: assignment.id, status: "queued", sessionId: `live:${initial.presenceId}` })]));
    expect(result.state.executions).toHaveLength(0);
    expect(result.result).toMatchObject({ note: expect.stringContaining("does not prove write access or X billing") });
  });
  it("queues an active Assignment whose last delivery was blocked by X billing", async () => {
    vi.stubEnv("OPENPRESENCE_X_API_MOCK", "1");
    const initial = connected();
    saveNativeXCredentials("chat-native-test", { apiKey: "test_api", apiSecret: "test_secret", accessToken: "test_token", accessTokenSecret: "test_token_secret" });
    initial.state.presences[0]!.environment = "live";
    if (initial.state.presence?.id === initial.presenceId) initial.state.presence.environment = "live";
    let state = applyOperation(initial.state, { type: "createAssignment", presenceId: initial.presenceId, environment: "live", instruction: "Publish one useful post." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state.assignments[0]!.status = "active";
    state.assignments[0]!.lastOutcome = { class: "delivery_failed", message: "X has no API credits remaining for this app.", at: new Date().toISOString() };
    const result = await executeChatRuntimeTool(state, initial.presenceId, { kind: "retry_assignment", assignmentId: assignment.id }, "active-billing-recovery");
    expect(result.result).toMatchObject({ status: "queued", assignmentId: assignment.id });
    expect(result.state.assignments.find((item) => item.id === assignment.id)?.status).toBe("working");
    expect(result.state.assignmentRuns).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId: assignment.id, status: "queued" })]));
  });
  it("fails closed when a blocked Assignment still has unresolved delivery", () => {
    const initial = connected();
    initial.state.presences[0]!.environment = "live";
    if (initial.state.presence?.id === initial.presenceId) initial.state.presence.environment = "live";
    let state = applyOperation(initial.state, { type: "createAssignment", presenceId: initial.presenceId, environment: "live", instruction: "Publish one useful post about the prototype." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state.assignments[0]!.status = "blocked";
    state.executions.push({ id: "uncertain", assignmentId: assignment.id, presenceId: initial.presenceId, affordance: "x.post", mode: "auto", status: "verification-pending", attempts: 1, connector: "native", idempotencyKey: "uncertain", environment: "live", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
    expect(() => queueOperatorAssignmentRetry(state, assignment.id, initial.presenceId)).toThrow("unresolved delivery");
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

  it("materializes a raw operator upload into a scoped durable Asset", async () => {
    const { state, presenceId } = connected();
    const result = await materializeOperatorChatAttachments(state, presenceId, [{
      name: "operator-upload.png",
      kind: "image",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    }]);
    const attachment = result.attachments[0];
    const asset = result.state.assets.find((item) => item.id === attachment.existingAssetId);
    expect(attachment).toMatchObject({ name: "operator-upload.png", existingAssetId: expect.any(String) });
    expect(attachment.dataUrl).toBeUndefined();
    expect(asset).toMatchObject({
      agentId: state.agent!.id,
      presenceId,
      status: "queued",
      accessScope: { mode: "selected_presences", presenceIds: [presenceId] },
      provenance: { origin: "operator_upload" },
    });
    expect(asset?.storage?.exactHash).toBeTruthy();
    expect(result.newAssetIds).toContain(asset?.id);
  });

  it("presents an existing scoped artifact without publishing or copying raw bytes into Chat", async () => {
    const initial = fixture();
    const presenceId = initial.presence!.id;
    const timestamp = new Date().toISOString();
    initial.assets.push({
      id: "artifact-to-present",
      agentId: initial.agent!.id,
      presenceId,
      accessScope: { mode: "selected_presences", presenceIds: [presenceId] },
      type: "image",
      dataUrl: "data:image/png;base64,AAAA",
      mimeType: "image/png",
      status: "ready",
      perception: { observation: "A small generated test image.", uncertainty: ["low"] },
      rights: { status: "unknown" },
      retention: "preserved",
      reusePermission: "ready_to_use",
      provenance: { origin: "operator_upload", importedAt: timestamp },
      createdAt: timestamp,
      updatedAt: timestamp,
    } as never);

    const result = await executeChatRuntimeTool(initial, presenceId, { kind: "present_asset", assetId: "artifact-to-present" }, "present-run");
    expect(result.result).toMatchObject({ status: "presented", assetId: "artifact-to-present", attachment: { existingAssetId: "artifact-to-present", kind: "image" } });
    expect(JSON.stringify(result.result)).not.toContain("data:image/png");
    expect(result.state.executions).toHaveLength(0);
  });

  it("lets an explicit operator post use attached media before background metadata review finishes", async () => {
    const initial = connected();
    const state = applyOperation(initial.state, { type: "setPresence", patch: { connectionMode: "native", status: "live", execution: { post: "auto" } } });
    const materialized = await materializeOperatorChatAttachments(state, initial.presenceId, [{
      name: "operator-upload.png",
      kind: "image",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    }]);
    const assetId = materialized.attachments[0]?.existingAssetId;
    expect(assetId).toBeTruthy();
    const result = await executeChatRuntimeTool(materialized.state, initial.presenceId, {
      kind: "social_action",
      action: "post",
      text: "A small visual note from our own work.",
      assetIds: ["operator-upload-wrapper"],
    }, "operator-media-run", { operatorAttachments: materialized.attachments.map((item) => ({ id: "operator-upload-wrapper", ...item })) });
    const execution = result.state.executions[0];
    expect(result.deliveryExecutionIds).toHaveLength(1);
    expect(execution?.status).toBe("queued");
    expect(execution?.publication?.assetIds).toEqual([assetId]);
    expect(execution?.publication?.operatorOverride?.reason).toContain("operator supplied this media");
  });

  it("resolves private attachment wrappers before forming a Sandbox Social Intent", async () => {
    let state = applyOperation(fixture(), { type: "setPresence", patch: { connectionMode: "sandbox", status: "live", execution: { post: "auto" } } });
    const presenceId = state.presence!.id;
    state = startPlaygroundSession(state, presenceId, "fresh");
    const assetId = "durable-operator-asset";
    const timestamp = new Date().toISOString();
    state.assets.push({
      id: assetId,
      agentId: state.agent!.id,
      accessScope: { mode: "selected_presences", presenceIds: [presenceId] },
      type: "image",
      dataUrl: "data:image/png;base64,AAAA",
      mimeType: "image/png",
      status: "ready",
      perception: { observation: "A small uploaded image.", likelyMeaning: "Operator-provided context.", uncertainty: ["low"] },
      rights: { status: "unknown" },
      retention: "preserved",
      reusePermission: "ready_to_use",
      provenance: { origin: "operator_upload", importedAt: timestamp },
      createdAt: timestamp,
      updatedAt: timestamp,
    } as never);
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "social_action", action: "post", text: "A grounded update.", assetIds: ["operator_attachment_1"] }, "wrapper-run", {
      operatorAttachments: [{ id: "operator_attachment_1", name: "operator-upload.png", kind: "image", existingAssetId: assetId }],
    });
    expect(result.deliveryExecutionIds).toHaveLength(1);
    expect(result.state.executions[0]?.publication?.assetIds).toEqual([assetId]);
    expect(result.state.executions[0]?.publication?.assetIds).not.toContain("operator_attachment_1");
  });

  it("rejects an unresolved attachment wrapper before creating any public execution", async () => {
    let state = applyOperation(fixture(), { type: "setPresence", patch: { connectionMode: "sandbox", status: "live", execution: { post: "auto" } } });
    const presenceId = state.presence!.id;
    state = startPlaygroundSession(state, presenceId, "fresh");
    await expect(executeChatRuntimeTool(state, presenceId, { kind: "social_action", action: "post", text: "Do not publish this.", assetIds: ["operator_attachment_missing"] }, "missing-wrapper", { operatorAttachments: [] })).rejects.toThrow("not prepared as a durable Asset");
    expect(state.executions).toHaveLength(0);
    expect(state.socialIntents).toHaveLength(0);
  });
});
