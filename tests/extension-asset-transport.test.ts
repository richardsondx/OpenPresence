import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createServer, type Server } from "node:http";
import { webcrypto } from "node:crypto";
import { File } from "node:buffer";
import sharp from "sharp";
import { GET as assetGet } from "../app/api/bridge/v1/assets/[id]/route";
import { applyOperation, createAgent } from "../lib/runtime";
import { claimExecutions, createBridgeWithKey, failExecution, heartbeatBridge, reportBridgeIdentity } from "../lib/bridge";
import { readState, writeBridgeIdentity, writeState } from "../lib/db";
import { putAssetBytes } from "../lib/asset-store";
import { createPublicExpressionCandidate, sealExecutionForDelivery } from "../lib/publication-security";
import type { Execution } from "../lib/types";

let server: Server | undefined;
afterEach(async () => { vi.unstubAllEnvs(); if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } });

async function fixture() {
  vi.stubEnv("OPENPRESENCE_TEST_MODE", "0"); vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
  const created = createAgent({ name: "Transport QA", description: "Useful images", mode: "agent", handle: "@transport", accent: "#777777" });
  const bridge = createBridgeWithKey(created, { type: "createBridge", input: { presenceId: created.presence!.id, name: "OpenPresence Chrome · Transport QA", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.media-post"], metrics: [], assetKinds: ["image"] } } });
  const state = bridge.state;
  const executorId = "openpresence-chrome-transport-qa";
  writeBridgeIdentity({ bridgeId: bridge.bridge!.id, executorId, username: "transport", status: "verified", observedAt: new Date().toISOString() });
  const pixels = Buffer.alloc(900 * 865 * 3); for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 73 + (i >>> 8)) % 256;
  const bytes = await sharp(pixels, { raw: { width: 900, height: 865, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const storage = await putAssetBytes(bytes, { mimeType: "image/png", suggestedName: "transport.png" });
  const at = new Date().toISOString();
  state.assets = [{ id: "transport-image", agentId: state.agent!.id, presenceId: state.presence!.id, type: "image", status: "ready", retention: "preserved", metadataReview: { status: "open" }, reusePermission: "needs_approval", storage, provenance: { origin: "operator_upload", importedAt: at }, createdAt: at, updatedAt: at }];
  const expression = createPublicExpressionCandidate({ state, presence: state.presence!, affordance: "x.post", text: "An approved visual note.", source: "operator_manual", socialIntentId: "transport-intent", mediaIds: ["transport-image"] });
  expression.environment = "live";
  const execution: Execution = { id: "transport-execution", socialIntentId: "transport-intent", presenceId: state.presence!.id, bridgeId: bridge.bridge!.id, connector: "bridge", source: "operator", affordance: "x.post", mode: "review", status: "claimed", attempts: 1, idempotencyKey: "transport-exact", environment: "live", lease: { executorId, claimedAt: at, expiresAt: new Date(Date.now() + 120_000).toISOString() }, publication: { id: "transport-publication", format: "x.media-post", payload: { text: expression.text }, assetIds: ["transport-image"], links: [], publicExpression: expression, operatorAssetApproval: { assetIds: ["transport-image"], assetHashes: { "transport-image": storage.exactHash }, at, reason: "Exact image and expression reviewed" }, createdAt: at }, createdAt: at, updatedAt: at };
  state.socialIntents = [{ id: "transport-intent", agentId: state.agent!.id, presenceId: state.presence!.id, affordance: "x.post", priority: 1, state: "active", validity: { expiresAt: new Date(Date.now() + 600_000).toISOString() }, formedAt: at, updatedAt: at }];
  sealExecutionForDelivery(execution);
  execution.browserClaim = { executorId, claimedAt: at, permitNonce: execution.permit!.nonce, assetHashes: { "transport-image": storage.exactHash! } };
  state.executions = [execution]; writeState(state);
  return { state, bridge, executorId, bytes, execution };
}

function background(origin: string) {
  let listener: ((message: unknown, sender: unknown, respond: (response: unknown) => void) => boolean) | undefined;
  const noEvent = { addListener: () => undefined };
  const chrome = { runtime: { onMessage: { addListener: (fn: typeof listener) => { listener = fn; } }, onInstalled: noEvent, onStartup: noEvent }, storage: { session: { get: async () => ({ openpresenceConfig: { appOrigin: origin } }), set: async () => undefined }, local: { get: async () => ({}), set: async () => undefined, remove: async () => undefined } }, tabs: { query: async () => [], sendMessage: vi.fn(async (_id: number, _message: unknown) => undefined as unknown), reload: vi.fn(async () => undefined), get: async () => ({ status: "complete" }), onRemoved: noEvent, onUpdated: noEvent, onActivated: noEvent }, alarms: { clear: async () => true, create: async () => undefined, onAlarm: noEvent }, action: { setBadgeText: async () => undefined, setBadgeBackgroundColor: async () => undefined } };
  const context = vm.createContext({ chrome, fetch, setTimeout, clearTimeout, btoa, atob, Uint8Array, crypto: webcrypto, console });
  vm.runInContext(`${readFileSync("extension/background.js", "utf8")}\nglobalThis.transportTest = { sessions, ensureAdapterProtocol };`, context);
  return { context, chrome, listener: () => listener!, api: context.transportTest };
}

describe("production extension asset transport composition", () => {
  it("automatically recovers the same exact unexpired approved action once after a fresh adapter probe", async () => {
    const { bridge, executorId, execution } = await fixture();
    const enabled = readState();
    enabled.presence!.status = "live"; enabled.presence!.environment = "live"; enabled.presence!.browserAccess = { enabled: true };
    enabled.presences = [enabled.presence!]; writeState(enabled);
    failExecution(bridge.bridge!, execution.id, { executorId, code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "Missing transport handler", retryable: false });
    const probe = { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post"] } };
    heartbeatBridge(bridge.bridge!, executorId, probe);
    expect(readState().executions[0]).toMatchObject({ id: execution.id, status: "queued", attempts: 1 });
    expect(readState().events.find(item => item.executionId === execution.id && item.title === "Image delivery recovering")?.detail).toContain("no new operator request");
    heartbeatBridge(bridge.bridge!, executorId, probe);
    expect(readState().executions).toHaveLength(1);
    expect(readState().outcomes).toHaveLength(0);
    const claimed = claimExecutions(bridge.bridge!, { executorId, limit: 1, mediaProtocol: 2 }).executions[0]!;
    expect(claimed.attempts).toBe(2);
    failExecution(bridge.bridge!, execution.id, { executorId, code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "Still missing", retryable: false });
    heartbeatBridge(bridge.bridge!, executorId, probe);
    expect(readState().executions[0]).toMatchObject({ id: execution.id, status: "failed", attempts: 2 });
  });
  it.each(["other executor", "changed bytes"])("does not automatically retry a transfer failure with %s", async mutation => {
    const { bridge, executorId, execution } = await fixture();
    const enabled = readState(); enabled.presence!.status = "live"; enabled.presence!.environment = "live"; enabled.presence!.browserAccess = { enabled: true }; enabled.presences = [enabled.presence!]; writeState(enabled);
    failExecution(bridge.bridge!, execution.id, { executorId, code: "ASSET_UPLOAD_FAILED", message: "Pre-submit attachment failed", retryable: true });
    const changed = readState();
    if (mutation === "changed bytes") { changed.assets[0]!.storage!.exactHash = "a".repeat(64); writeState(changed); }
    const recoveringExecutor = mutation === "other executor" ? "openpresence-chrome-other" : executorId;
    if (recoveringExecutor !== executorId) reportBridgeIdentity(bridge.bridge!, { executorId: recoveringExecutor, username: "transport" });
    heartbeatBridge(bridge.bridge!, recoveringExecutor, { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post"] } });
    expect(readState().executions[0]).toMatchObject({ id: execution.id, status: "failed", attempts: 1 });
    expect(readState().outcomes).toHaveLength(0);
  });
  it("composes content script, background listener, real HTTP and authenticated immutable bytes without any public writer", async () => {
    const { state, bridge, executorId, bytes, execution } = await fixture();
    const requests: Array<{ executionId: string | null; executorId: string | null }> = [];
    server = createServer(async (request, response) => {
      const headers = new Headers(); for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(key, value);
      requests.push({ executionId: headers.get("x-openpresence-execution-id"), executorId: headers.get("x-openpresence-executor-id") });
      const result = await assetGet(new Request(`http://localhost${request.url}`, { headers }), { params: Promise.resolve({ id: "transport-image" }) });
      response.statusCode = result.status; result.headers.forEach((value, key) => response.setHeader(key, value)); response.end(Buffer.from(await result.arrayBuffer()));
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    const runtime = background(origin);
    runtime.api.sessions.set(state.presence!.id, { presence: state.presence, bridgeId: bridge.bridge!.id, bridgeKey: bridge.key, executorId, tabId: 77, windowId: 1 });
    const window = { File, chrome: { runtime: { id: "transport-installed-extension", sendMessage: (message: unknown) => new Promise(resolve => runtime.listener()(message, { tab: { id: 77, windowId: 1 } }, resolve)) } } };
    new Function("window", readFileSync("extension/execution.js", "utf8"))(window);
    const assets = await (window as typeof window & { OpenPresenceExecution: { assetsForExecution: (execution: Execution) => Promise<Array<{ file: File }>> } }).OpenPresenceExecution.assetsForExecution(execution);
    expect(bytes.length).toBeGreaterThan(2_300_000);
    expect(Buffer.from(await assets[0]!.file.arrayBuffer())).toEqual(bytes);
    expect(requests).toEqual([{ executionId: execution.id, executorId }]);
    expect(readState().executions[0]?.status).toBe("claimed"); expect(readState().outcomes).toHaveLength(0);
  });

  it("refreshes an idle stale content adapter once and proves protocol recovery before claiming", async () => {
    const runtime = background("http://unused.invalid");
    let probes = 0;
    runtime.chrome.tabs.sendMessage.mockImplementation(async (_id, message) => (message as { type: string }).type === "OPENPRESENCE_ADAPTER_CAPABILITIES" ? (++probes === 1 ? undefined : { mediaProtocol: 2 }) : undefined);
    const session = { presence: { id: "presence", name: "QA", handle: "@qa" }, tabId: 77 };
    expect(await runtime.api.ensureAdapterProtocol(session)).toBe(true);
    expect(runtime.chrome.tabs.reload).toHaveBeenCalledTimes(1);
    expect(session).toMatchObject({ mediaProtocol: 2 });
    expect(await runtime.api.ensureAdapterProtocol(session)).toBe(true);
    expect(runtime.chrome.tabs.reload).toHaveBeenCalledTimes(1);
  });

  it("holds legacy shipped Chrome image work before an attempt and resumes the exact approved action only with current protocol", async () => {
    const { bridge, executorId, execution } = await fixture();
    const queuedState = readState(); const queued = queuedState.executions[0]!; queued.status = "queued"; queued.attempts = 0; queued.lease = undefined; queued.permit = undefined; queued.publication!.publicExpression!.safetyStatus = "candidate"; queued.publication!.publicExpression!.payloadHash = undefined; writeState(queuedState);
    const held = claimExecutions(bridge.bridge!, { executorId, limit: 1 });
    expect(held.executions).toHaveLength(0);
    expect(readState().executions[0]).toMatchObject({ id: execution.id, status: "awaiting-connector", attempts: 0, failure: { code: "BROWSER_CONNECTOR_UPDATE_REQUIRED" } });
    heartbeatBridge(bridge.bridge!, executorId, { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post"] } });
    const claimed = claimExecutions(bridge.bridge!, { executorId, limit: 1, mediaProtocol: 2 });
    expect(claimed.executions).toHaveLength(1); expect(claimed.executions[0]).toMatchObject({ id: execution.id, status: "claimed", attempts: 1 }); expect(readState().outcomes).toHaveLength(0);
  });

  it("preserves an erased legacy retrieval receipt while classifying missing connector evidence accurately", async () => {
    const { bridge, executorId, execution } = await fixture();
    const result = failExecution(bridge.bridge!, execution.id, { executorId, code: "UNSUPPORTED_ASSET", message: "The authorized Asset transport-image could not be retrieved.", retryable: false });
    expect(result.execution.failure).toMatchObject({ code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "The authorized Asset transport-image could not be retrieved." });
    expect(result.state.trajectoryEvents?.at(-1)?.payload).toMatchObject({ reportedCode: "UNSUPPORTED_ASSET", code: "BROWSER_CONNECTOR_UNAVAILABLE" });
    expect(result.execution.status).toBe("failed"); expect(result.state.outcomes).toHaveLength(0);
  });
  it("allows an explicit exact prewrite retry while rejecting changed approval, bytes, payload and uncertain outcomes", async () => {
    const { bridge, executorId, execution } = await fixture();
    const failed = failExecution(bridge.bridge!, execution.id, { executorId, code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "Reload the extension", retryable: false }).state;
    expect(applyOperation(structuredClone(failed), { type: "retryExecution", id: execution.id }).executions[0]).toMatchObject({ status: "queued", attempts: 1 });
    const legacy = structuredClone(failed); delete legacy.executions[0]!.publication!.operatorAssetApproval!.assetHashes;
    const legacyRetry = applyOperation(legacy, { type: "retryExecution", id: execution.id });
    expect(legacyRetry.executions[0]).toMatchObject({ id: execution.id, status: "awaiting-review", attempts: 1 }); expect(legacyRetry.executions[0]?.reviewReason).toContain("fresh approval"); expect(legacyRetry.socialIntents).toHaveLength(1);
    for (const mutate of [
      (state: typeof failed) => { state.executions[0]!.publication!.operatorAssetApproval = undefined; },
      (state: typeof failed) => { state.assets[0]!.storage!.exactHash = "changed"; },
      (state: typeof failed) => { state.executions[0]!.publication!.payload = { text: "changed" }; },
      (state: typeof failed) => { state.executions[0]!.status = "verification-pending"; },
      (state: typeof failed) => { state.socialIntents[0]!.validity.expiresAt = new Date(0).toISOString(); },
      (state: typeof failed) => { state.outcomes.push({ id: "uncertain", socialIntentId: "transport-intent", executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: new Date().toISOString(), metrics: {} }); },
    ]) { const candidate = structuredClone(failed); mutate(candidate); expect(applyOperation(candidate, { type: "retryExecution", id: execution.id }).executions[0]?.status).not.toBe("queued"); }
  });

  it("rejects image hash replacement after a snapshot approval at the actual byte endpoint", async () => {
    const { bridge, executorId, execution } = await fixture();
    const changed = readState(); changed.assets[0]!.storage!.exactHash = "replacement"; writeState(changed);
    const result = await assetGet(new Request("http://localhost/api/bridge/v1/assets/transport-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId, "x-openpresence-execution-id": execution.id } }), { params: Promise.resolve({ id: "transport-image" }) });
    expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ error: "The selected image changed after approval and needs fresh review." });
  });

});
