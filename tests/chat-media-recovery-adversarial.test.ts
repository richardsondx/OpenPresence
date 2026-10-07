import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAutonomyRun, queueAutonomyRun } from "../lib/autonomy-worker";
import { getOperationalRun, readStateSnapshotForContext, saveProviderSecret, writeState } from "../lib/db";
import { recordOperatorConversationMessage } from "../lib/operator-chat";
import { applyOperation, createAgent } from "../lib/runtime";

describe("independent same-turn media recovery", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("recovers an old used image inside the same Chat work without duplicate intent or approval transfer", async () => {
    let state = createAgent({ name: "Media recovery", description: "Useful visual social ideas", mode: "agent", handle: "@media_recovery", accent: "#777777" });
    state = applyOperation(state, { type: "configureProvider", provider: "openai", label: "OpenAI", hasSecret: true });
    saveProviderSecret(state.providerConnections.find(item => item.provider === "openai")!.id, "isolated-model-key");
    state = applyOperation(state, { type: "setModel", provider: "openai", model: "test-model", quality: "low", vision: false });
    state.presence!.environment = "live";
    state.presence!.status = "live";
    state.presence!.execution.post = "review";
    state.presences = state.presences.map(item => item.id === state.presence!.id ? state.presence! : item);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state.assets = ["used-image", "unused-image"].map(id => ({ id, agentId: state.agent!.id, presenceId, type: "image" as const, status: "ready" as const, retention: "preserved" as const, metadataReview: { status: "resolved" as const }, perception: { observation: "A diagram of a prototype feedback loop.", uncertainty: ["low"] }, description: "Prototype feedback diagram", provenance: { origin: "operator_upload", importedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp }));
    state.assetUsages.push({ id: "prior-use", assetId: "used-image", agentId: state.agent!.id, presenceId, publicationId: "old-publication", socialIntentId: "old-intent", channelId: "x", environment: "live", usageType: "new", publishedAt: timestamp });
    state.publications.push({ id: "old-publication", format: "x.post", payload: { text: "Old approved words" }, assetIds: ["used-image"], links: [], operatorAssetApproval: { assetIds: ["used-image"], reason: "Prior action only", at: timestamp }, createdAt: timestamp, environment: "live" });
    state = recordOperatorConversationMessage(state, { presenceId, content: "Post a new useful idea about prototype feedback with an image.", clientRequestId: "media-recovery-turn" });
    const operatorMessage = state.operatorConversations!.flatMap(item => item.messages).find(item => item.clientRequestId === "media-recovery-turn")!;
    writeState(state, { force: true });
    const fresh = { kind: "social_action", action: "post", text: "Watch one person test the prototype, then use the feedback to choose the next improvement.", assetIds: ["unused-image"] };
    const steps = [
      { kind: "social_action", action: "post", text: "A new useful prototype idea.", assetIds: ["used-image"] },
      { kind: "search_assets", query: "prototype" },
      { kind: "inspect_asset", assetId: "unused-image", question: "What existing evidence supports this diagram?" },
      fresh,
      fresh,
    ];
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(steps.shift() ?? { kind: "answer", text: "The fresh image and proposed post are ready for your review. Nothing has been published." }) } }] }), { status: 200 });
    }));
    const run = queueAutonomyRun(presenceId, "operator_chat", { metadata: { operatorMessageId: operatorMessage.id } }).run;
    await executeAutonomyRun(run.id);
    const saved = readStateSnapshotForContext({ presenceId });
    expect(getOperationalRun(run.id)?.state).toBe("succeeded");
    expect(saved.executions).toHaveLength(1);
    expect(saved.socialIntents).toHaveLength(1);
    expect(saved.executions[0]).toMatchObject({ status: "awaiting-review", attempts: 0, publication: { assetIds: ["unused-image"] } });
    expect(saved.executions[0]!.publication!.operatorAssetApproval).toBeUndefined();
    expect(saved.outcomes).toHaveLength(0);
    const messages = saved.operatorConversations!.flatMap(item => item.messages).filter(item => item.replyToMessageId === operatorMessage.id);
    const receipts = messages.filter(item => item.role === "system").map(item => JSON.parse(item.content));
    expect(receipts[0]).toMatchObject({ tool: "social_action", executionIds: [], result: { status: "media-unavailable", requiresUserAction: false, rejectedAssetIds: ["used-image"] } });
    expect(receipts[0].result.alternatives.map((item: { assetId: string }) => item.assetId)).toEqual(["unused-image"]);
    expect(bodies[1]).toContain("media-unavailable");
    expect(bodies[1]).toContain("Continue the same request");
    expect(receipts.some(item => item.tool === "inspect_asset" && item.result.assetId === "unused-image")).toBe(true);
    expect(messages.filter(item => item.role === "presence")).toHaveLength(1);
    expect(saved.publications.find(item => item.id === "old-publication")!.operatorAssetApproval!.assetIds).toEqual(["used-image"]);
  });
});
