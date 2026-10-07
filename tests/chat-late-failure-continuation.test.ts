import { afterEach, describe, expect, it, vi } from "vitest";
import { chatExecutionContinuationCandidates, recordChatExecutionProgress } from "../lib/chat-execution-progress";
import { executeAutonomyRun, queueAutonomyRun } from "../lib/autonomy-worker";
import { getOperationalRun, readStateSnapshotForContext, saveProviderSecret, upsertOperationalRun, writeState } from "../lib/db";
import { recordOperatorConversationMessage } from "../lib/operator-chat";
import { applyOperation, createAgent } from "../lib/runtime";
import type { Execution } from "../lib/types";

function fixture() {
  let state = createAgent({ name: "Late failure", description: "Useful ideas", mode: "agent", handle: "@late", accent: "#777" });
  state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
  saveProviderSecret(state.providerConnections.find(item => item.provider === "openai")!.id, "isolated-key");
  state = applyOperation(state, { type: "setModel", provider: "openai", model: "test-model", quality: "low", vision: false });
  state.presence!.environment = "live"; state.presences = [state.presence!];
  state = recordOperatorConversationMessage(state, { presenceId: state.presence!.id, content: "Post this exact useful image and text.", clientRequestId: "late-turn" });
  const conversation = state.operatorConversations![0]; const message = conversation.messages.find(item => item.clientRequestId === "late-turn")!;
  writeState(state, { force: true });
  const run = queueAutonomyRun(state.presence!.id, "operator_chat", { metadata: { operatorMessageId: message.id, chatSteps: 4 } }).run;
  run.state = "succeeded"; run.stage = "completed"; upsertOperationalRun(run);
  const at = new Date().toISOString();
  const execution: Execution = { id: "late-action", runId: run.id, presenceId: state.presence!.id, environment: "live", socialIntentId: "late-intent", status: "queued", connector: "bridge", affordance: "x.post", mode: "review", attempts: 1, idempotencyKey: "same-late-action", publication: { id: "late-publication", format: "x.post", payload: { text: "Exact words" }, assetIds: ["exact-image"], links: [], operatorAssetApproval: { assetIds: ["exact-image"], assetHashes: { "exact-image": "a".repeat(64) }, at, reason: "Exact existing authority" }, createdAt: at }, createdAt: at, updatedAt: at };
  state.executions = [execution]; state.operationalRuns = [run];
  conversation.messages.push({ id: "late-tool", role: "system", replyToMessageId: message.id, timestamp: at, content: JSON.stringify({ tool: "social_action", result: [{ executionId: execution.id, status: "queued" }] }) }, { id: "earlier-answer", role: "presence", replyToMessageId: message.id, timestamp: at, content: "The approved post is waiting for delivery." });
  recordChatExecutionProgress(state);
  execution.status = "failed"; execution.failure = { code: "ASSET_UPLOAD_FAILED", message: "Could not confirm every image preview before submission.", retryable: true };
  recordChatExecutionProgress(state);
  return { state, run, message, conversation, execution };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("durable late delivery failure cognition", () => {
  it("records actual failure and resumes the same worker once without duplicate intent or approval transfer", async () => {
    const { state, run, message, execution } = fixture();
    const authority = structuredClone(execution.publication!.operatorAssetApproval);
    writeState(state, { force: true });
    const reloaded = readStateSnapshotForContext({ presenceId: state.presence!.id }); reloaded.operationalRuns = [getOperationalRun(run.id)!];
    const candidates = chatExecutionContinuationCandidates(reloaded);
    expect(candidates).toHaveLength(1); expect(candidates[0].id).toBe(run.id);
    upsertOperationalRun(candidates[0]);
    const steps = [{ kind: "answer", text: "X rejected the image attachment." }, { kind: "social_action", action: "post", text: "Replacement words", assetIds: [] }, { kind: "retry_assignment", assignmentId: "foreign-responsibility" }, { kind: "plan_intervention", assignmentId: "foreign-responsibility", action: "resume", note: "Wrong scope" }, { kind: "inspect_execution", executionId: execution.id }];
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(steps.shift() ?? { kind: "answer", text: "The browser could not confirm the image previews. Your approved image and text remain saved; no verified publication exists." }) } }] }), { status: 200 });
    }));
    await executeAutonomyRun(run.id);
    expect(bodies.length).toBeGreaterThanOrEqual(6); expect(bodies[1]).toContain("No observed platform rejection alert"); expect(bodies[0]).toContain("delivery_failure"); expect(bodies[0]).toContain(execution.failure!.message);
    const saved = readStateSnapshotForContext({ presenceId: state.presence!.id });
    expect(saved.operatorConversations![0].messages.filter(item => item.role === "system").some(item => { try { return ["retry_assignment", "plan_intervention"].includes(JSON.parse(item.content).tool); } catch { return false; } })).toBe(false);
    expect(saved.executions).toHaveLength(1); expect(saved.executions[0].publication!.operatorAssetApproval).toEqual(authority); expect(saved.outcomes).toHaveLength(0);
    expect(saved.operatorConversations![0].messages.some(item => item.role === "presence" && item.id !== "earlier-answer" && !item.id.startsWith("execution-progress:") && item.replyToMessageId === message.id)).toBe(true);
    saved.operationalRuns = [getOperationalRun(run.id)!]; expect(chatExecutionContinuationCandidates(saved)).toEqual([]);
    expect(Number(getOperationalRun(run.id)!.metadata!.chatSteps)).toBeGreaterThan(4);
  });
  it("does not resume after two unchanged connector failures even before cognition observed the first", () => {
    const { state, execution } = fixture();
    execution.status = "queued"; recordChatExecutionProgress(state);
    execution.attempts = 2; execution.status = "failed"; recordChatExecutionProgress(state);
    expect(chatExecutionContinuationCandidates(state)).toEqual([]);
  });
  it.each(["cancelled", "newer-turn", "uncertain", "outcome", "budget", "foreign-presence", "second-unchanged"])("does not resume %s", challenge => {
    const { state, run, execution, conversation } = fixture();
    if (challenge === "cancelled") run.state = "cancelled";
    if (challenge === "newer-turn") conversation.messages.push({ id: "newer", role: "operator", content: "Stop", timestamp: new Date().toISOString() });
    if (challenge === "uncertain") execution.status = "verification-pending";
    if (challenge === "outcome") execution.externalRef = { type: "x.post", id: "111" };
    if (challenge === "budget") run.metadata!.chatSteps = 48;
    if (challenge === "foreign-presence") execution.presenceId = "foreign";
    if (challenge === "second-unchanged") run.metadata!.deliveryFailureFingerprints = [JSON.stringify({ code: execution.failure!.code, message: execution.failure!.message })];
    expect(chatExecutionContinuationCandidates(state)).toEqual([]);
  });
});
