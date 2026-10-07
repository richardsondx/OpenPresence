import { afterEach, describe, expect, it } from "vitest";
import { readStateSnapshot, writeState } from "../lib/db";
import { recordChatExecutionProgress } from "../lib/chat-execution-progress";
import { applyOperation, createAgent, formChatPostIntent, initialState } from "../lib/runtime";
import { authorizeAssetSelection } from "../lib/asset-library";

function fixture() {
  let state = createAgent({ name: "Approval adversary", description: "Useful social ideas", mode: "agent", handle: "@approval", accent: "#777" });
  state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
  state = formChatPostIntent(state, "One useful idea.");
  const execution = state.executions[0]!;
  execution.environment = "live";
  execution.connector = "bridge";
  execution.bridgeId = "isolated-not-connected";
  state.operatorConversations = [{ id: "adversarial-chat", agentId: state.agent!.id, presenceId: state.presence!.id, title: "Approval", createdAt: execution.createdAt, updatedAt: execution.updatedAt, messages: [{ id: "request", role: "operator", content: "Post one useful idea", timestamp: execution.createdAt }, { id: "receipt", role: "system", content: JSON.stringify({ tool: "social_action", executionIds: [execution.id], result: [{ executionId: execution.id, status: "awaiting-review" }] }), replyToMessageId: "request", timestamp: execution.createdAt }] }];
  return state;
}

describe("independent approval challenge", () => {
  afterEach(() => writeState(initialState()));

  it("does not broaden media readiness or standing authority and a repeated approval preserves the action", () => {
    const before = fixture();
    const execution = before.executions[0]!;
    const timestamp = execution.createdAt;
    before.assets = [{ id: "exact-image", agentId: before.agent!.id, type: "image", status: "ready", retention: "preserved", reusePermission: "needs_approval", metadataReview: { status: "open" }, provenance: { origin: "operator_upload", importedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp }];
    execution.publication!.assetIds = ["exact-image"];
    const assetBefore = structuredClone(before.assets);
    const envelope = structuredClone(before.presence!.execution);
    const approved = applyOperation(before, { type: "approveExecution", id: execution.id });
    const again = applyOperation(approved, { type: "approveExecution", id: execution.id });
    expect(again.assets).toEqual(assetBefore);
    expect(again.presence!.execution).toEqual(envelope);
    expect(again.executions).toHaveLength(1);
    expect(again.executions[0]!.idempotencyKey).toBe(execution.idempotencyKey);
    expect(again.executions[0]!.publication!.operatorAssetApproval?.assetIds).toEqual(["exact-image"]);
    expect(() => authorizeAssetSelection(again, ["exact-image"], { presenceId: again.presence!.id })).toThrow(/explicit reuse approval/);
    again.assets[0]!.rights = { status: "restricted" };
    expect(() => authorizeAssetSelection(again, ["exact-image"], { presenceId: again.presence!.id, allowReviewable: true })).toThrow(/restricted/);
  });

  it("persists a later verification notice when outcome arrives after status across actual DB writes", () => {
    const state = fixture();
    writeState(state);
    let current = readStateSnapshot();
    current = applyOperation(current, { type: "approveExecution", id: current.executions[0]!.id });
    writeState(current);
    current = readStateSnapshot();
    current.executions[0]!.status = "succeeded";
    writeState(current);
    current = readStateSnapshot();
    expect(current.operatorConversations![0]!.messages.filter(message => message.milestone === "verified")).toHaveLength(0);
    const execution = current.executions[0]!;
    current.outcomes.push({ id: "delayed-outcome", executionId: execution.id, socialIntentId: execution.socialIntentId, presenceId: execution.presenceId, environment: execution.environment, sessionId: execution.sessionId, status: "succeeded", observedAt: execution.updatedAt, metrics: {} });
    writeState(current);
    current = readStateSnapshot();
    expect(current.operatorConversations![0]!.messages.filter(message => message.milestone === "verified")).toHaveLength(1);
    writeState(current);
    expect(readStateSnapshot().operatorConversations![0]!.messages.filter(message => message.milestone === "verified")).toHaveLength(1);
  });

  it.each(["cancelled", "failed", "verification-pending"] as const)("keeps %s honest without declaring publication", status => {
    const before = fixture();
    const next = structuredClone(before);
    next.executions[0]!.status = status;
    next.executions[0]!.failure = status === "failed" ? { message: "Disconnected browser", retryable: true } : undefined;
    recordChatExecutionProgress(next, before);
    const notices = next.operatorConversations![0]!.messages.filter(message => message.role === "presence");
    expect(notices).toHaveLength(1);
    expect(notices[0]!.content).not.toContain("completed and verified");
    expect(notices[0]!.milestone).not.toBe("verified");
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.filter(message => message.role === "presence")).toHaveLength(1);
  });

  it("rejects a successful outcome whose intent disagrees even when other identifiers match", () => {
    const before = fixture();
    const next = structuredClone(before);
    const execution = next.executions[0]!;
    execution.status = "succeeded";
    next.outcomes.push({ id: "malformed", executionId: execution.id, socialIntentId: "other-intent", presenceId: execution.presenceId, environment: execution.environment, status: "succeeded", observedAt: execution.updatedAt, metrics: {} });
    recordChatExecutionProgress(next, before);
    expect(next.operatorConversations![0]!.messages.filter(message => message.milestone === "verified")).toHaveLength(0);
  });
});
