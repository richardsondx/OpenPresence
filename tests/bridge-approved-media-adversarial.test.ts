import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/bridge/v1/assets/[id]/route";
import { applyOperation, createAgent } from "../lib/runtime";
import { createBridgeWithKey } from "../lib/bridge";
import { writeBridgeIdentity, writeState } from "../lib/db";
import { putAssetBytes } from "../lib/asset-store";
import { createPublicExpressionCandidate, sealExecutionForDelivery } from "../lib/publication-security";
import type { Execution, OpenPresenceState } from "../lib/types";

let fixtureIndex = 0;
async function fixture() {
  const assetId = `approved-image-${++fixtureIndex}`;
  // Only build/seal an isolated authorization artifact; never invoke a writer.
  vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
  const source = createAgent({ name: "Media adversary", description: "Visual ideas", mode: "agent", handle: "@media", accent: "#777" });
  const bridge = createBridgeWithKey(source, { type: "createBridge", input: { presenceId: source.presence!.id, name: "Media Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [], assetKinds: ["image"] } } });
  const state = bridge.state;
  const executorId = "approved-media-executor";
  writeBridgeIdentity({ bridgeId: bridge.bridge!.id, executorId, username: "media", status: "verified", observedAt: new Date().toISOString() });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const storage = await putAssetBytes(bytes, { mimeType: "image/png", suggestedName: "approved.png" });
  const timestamp = new Date().toISOString();
  state.assets = [{ id: assetId, agentId: state.agent!.id, presenceId: state.presence!.id, type: "image", status: "ready", retention: "preserved", reusePermission: "needs_approval", metadataReview: { status: "open" }, rights: { status: "unknown" }, storage, provenance: { origin: "operator_upload", importedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp }];
  const expression = createPublicExpressionCandidate({ state, presence: { ...state.presence!, environment: "live" }, affordance: "x.post", text: "One useful visual idea.", source: "operator_manual", socialIntentId: "approved-intent", mediaIds: [assetId] });
  const execution: Execution = { id: "approved-execution", socialIntentId: "approved-intent", presenceId: state.presence!.id, bridgeId: bridge.bridge!.id, affordance: "x.post", mode: "review", status: "claimed", attempts: 1, connector: "bridge", source: "operator", environment: "live", idempotencyKey: "approved-media-isolated", lease: { executorId, claimedAt: timestamp, expiresAt: new Date(Date.now() + 120_000).toISOString() }, publication: { id: "approved-publication", format: "x.post", payload: { text: expression.text }, assetIds: [assetId], links: [], publicExpression: expression, operatorAssetApproval: { assetIds: [assetId], at: timestamp, reason: "Exact expression and image approved" }, createdAt: timestamp, environment: "live" }, createdAt: timestamp, updatedAt: timestamp };
  sealExecutionForDelivery(execution);
  state.executions = [execution];
  return { state, bridge, executorId, bytes, assetId };
}

describe("independent Bridge approved media challenge", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  const cases: Array<[string, (state: OpenPresenceState, headers: Record<string, string>) => void]> = [
    ["missing execution", (_state, headers) => { delete headers["x-openpresence-execution-id"]; }],
    ["guessed execution", (_state, headers) => { headers["x-openpresence-execution-id"] = "guessed"; }],
    ["unclaimed action", state => { state.executions[0]!.status = "approved"; }],
    ["canceled action", state => { state.executions[0]!.status = "cancelled"; }],
    ["foreign Bridge", state => { state.executions[0]!.bridgeId = "foreign-bridge"; }],
    ["foreign Presence", state => { state.executions[0]!.presenceId = "foreign-presence"; }],
    ["Sandbox branch", state => { state.executions[0]!.environment = "sandbox"; state.executions[0]!.sessionId = "foreign-session"; }],
    ["wrong executor lease", state => { state.executions[0]!.lease!.executorId = "foreign-executor"; }],
    ["expired lease", state => { state.executions[0]!.lease!.expiresAt = new Date(Date.now() - 1_000).toISOString(); }],
    ["invalid lease deadline", state => { state.executions[0]!.lease!.expiresAt = "not-a-date"; }],
    ["missing permit", state => { delete state.executions[0]!.permit; }],
    ["mutated sealed media", state => { state.executions[0]!.publication!.publicExpression!.mediaIds = []; }],
    ["missing exact media approval", state => { delete state.executions[0]!.publication!.operatorAssetApproval; }],
    ["approval for another image", state => { state.executions[0]!.publication!.operatorAssetApproval!.assetIds = ["another-image"]; }],
    ["restricted rights", state => { state.assets[0]!.rights = { status: "restricted" }; }],
    ["foreign Agent asset", state => { state.assets[0]!.agentId = "foreign-agent"; }],
  ];

  it("retrieves exact approved unknown-rights bytes only for a live sealed claim", async () => {
    const { state, bridge, executorId, bytes, assetId } = await fixture();
    writeState(state);
    const response = await GET(new Request(`http://localhost/api/bridge/v1/assets/${assetId}`, { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId, "x-openpresence-execution-id": "approved-execution" } }), { params: Promise.resolve({ id: assetId }) });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(cases)("rejects %s before serving any image bytes", async (_name, mutate) => {
    const { state, bridge, executorId, assetId } = await fixture();
    const headers = { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId, "x-openpresence-execution-id": "approved-execution" };
    mutate(state, headers);
    writeState(state);
    const response = await GET(new Request(`http://localhost/api/bridge/v1/assets/${assetId}`, { headers }), { params: Promise.resolve({ id: assetId }) });
    expect([401, 404, 409]).toContain(response.status);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  const retryCases: Array<[string, (state: OpenPresenceState) => void]> = [
    ["expired intent", state => { state.socialIntents[0]!.validity.expiresAt = new Date(Date.now() - 1_000).toISOString(); }],
    ["withdrawn intent", state => { state.socialIntents[0]!.state = "withdrawn"; }],
    ["public outcome", state => { const execution = state.executions[0]!; state.outcomes.push({ id: "public-outcome", executionId: execution.id, socialIntentId: execution.socialIntentId, presenceId: execution.presenceId, environment: "live", status: "unknown", observedAt: execution.updatedAt, metrics: {} }); }],
    ["public reference", state => { state.executions[0]!.externalRef = { type: "x.post", id: "existing-public-post" }; }],
    ["executed timestamp", state => { state.executions[0]!.executedAt = new Date().toISOString(); }],
    ["mutated words", state => { state.executions[0]!.publication!.payload = { text: "Different unapproved words" }; }],
    ["mutated sealed media", state => { state.executions[0]!.publication!.publicExpression!.mediaIds = ["another-image"]; }],
    ["missing exact approval", state => { delete state.executions[0]!.publication!.operatorAssetApproval; }],
    ["another image approval", state => { state.executions[0]!.publication!.operatorAssetApproval!.assetIds = ["another-image"]; }],
    ["mutated approved bytes", state => { state.assets[0]!.storage!.exactHash = "0".repeat(64); }],
    ["foreign asset owner", state => { state.assets[0]!.agentId = "foreign-agent"; }],
    ["invalid signature", state => { state.executions[0]!.permit!.signature = "invalid"; }],
  ];

  function failedForRetry(state: OpenPresenceState) {
    state.executions[0]!.status = "awaiting-review";
    Object.assign(state, applyOperation(state, { type: "approveExecution", id: state.executions[0]!.id }));
    const execution = state.executions[0]!;
    execution.status = "failed";
    execution.lease = undefined;
    execution.failure = { code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "The installed adapter returned no image", retryable: false };
    state.socialIntents = [{ id: execution.socialIntentId, agentId: state.agent!.id, presenceId: execution.presenceId, affordance: "x.post", state: "active", priority: 50, validity: { expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, environment: "live", source: "operator", formedAt: execution.createdAt, updatedAt: execution.updatedAt }];
    return execution;
  }

  it("allows an exact signed pre-write retry after the short delivery permit expires without granting expired delivery authority", async () => {
    const { state } = await fixture();
    const execution = failedForRetry(state);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 240_000);
    const retried = applyOperation(state, { type: "retryExecution", id: execution.id });
    expect(retried.executions[0]).toMatchObject({ id: execution.id, status: "queued", publication: { assetIds: [state.assets[0]!.id] } });
    expect(retried.executions[0]!.permit).toBeUndefined();
    expect(retried.executions[0]!.publication!.publicExpression!.safetyStatus).toBe("candidate");
    expect(retried.outcomes).toHaveLength(0);
  });

  it("requires fresh review of a legacy approval without a stored image hash", async () => {
    const { state } = await fixture();
    const execution = failedForRetry(state);
    delete execution.publication!.operatorAssetApproval!.assetHashes;
    const retried = applyOperation(state, { type: "retryExecution", id: execution.id });
    expect(retried.executions[0]).toMatchObject({ id: execution.id, status: "awaiting-review", attempts: execution.attempts });
    expect(retried.executions).toHaveLength(1);
    expect(retried.outcomes).toHaveLength(0);
  });

  it.each(retryCases)("refuses explicit image retry with %s", async (_name, mutate) => {
    const { state } = await fixture();
    const execution = failedForRetry(state);
    mutate(state);
    const retried = applyOperation(state, { type: "retryExecution", id: execution.id });
    expect(retried.executions[0]).toMatchObject({ id: execution.id, status: "failed" });
    expect(retried.executions).toHaveLength(1);
    expect(retried.socialIntents).toHaveLength(1);
  });
});
