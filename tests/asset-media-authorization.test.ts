import { describe, expect, it } from "vitest";
import { GET } from "../app/api/assets/[id]/route";
import { GET as bridgeAssetGet } from "../app/api/bridge/v1/assets/[id]/route";
import { createAgent, createRuntimeScope } from "../lib/runtime";
import { issueRuntimeScopeCookie } from "../lib/runtime-scope";
import { readState, writeBridgeIdentity, writeState } from "../lib/db";
import { createBridgeWithKey, reportBridgeIdentity } from "../lib/bridge";
import { putAssetBytes } from "../lib/asset-store";
import type { Asset } from "../lib/types";

describe("scoped Asset media authorization", () => {
  it("does not accept forged headers or query parameters without a server-issued scope", async () => {
    const response = await GET(new Request("http://localhost/api/assets/private?agentId=another-agent", { headers: { "x-openpresence-agent-id": "another-agent", "x-openpresence-presence-id": "another-presence" } }), { params: Promise.resolve({ id: "private" }) });
    expect(response.status).toBe(401);
  });

  it("denies an Asset owned by another Agent even with a valid current scope", async () => {
    const state = createAgent({ name: "Jenny", description: "Visual Agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state.assets.push({ id: "macro-private", agentId: "macro-agent", type: "image", status: "ready", storage: { storeKey: "sha256/macro", mimeType: "image/png", byteSize: 1, exactHash: "macro" }, provenance: { origin: "operator_upload", importedAt: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    writeState(state);
    const current = readState();
    const cookie = issueRuntimeScopeCookie(createRuntimeScope(current, { presenceId: current.presence!.id }));
    const response = await GET(new Request("http://localhost/api/assets/macro-private", { headers: { cookie: `openpresence-runtime-scope=${cookie}` } }), { params: Promise.resolve({ id: "macro-private" }) });
    expect(response.status).toBe(404);
  });

  it("serves an eligible immutable image through the authenticated Bridge route", async () => {
    const state = createAgent({ name: "Genny", description: "Visual Agent", mode: "agent", handle: "@genny", accent: "#D68754" });
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const storage = await putAssetBytes(bytes, { mimeType: "image/png", suggestedName: "genny.png" });
    state.assets.push({
      id: "genny-image",
      agentId: state.agent!.id,
      presenceId: state.presence!.id,
      type: "image",
      mediaKind: "image",
      status: "ready",
      storage,
      mimeType: storage.mimeType,
      perception: { observation: "A small visual test asset.", uncertainty: [] },
      rights: { status: "unknown" },
      provenance: { origin: "operator_upload", importedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeState(state);
    const bridge = createBridgeWithKey(state, {
      type: "createBridge",
      input: {
        presenceId: state.presence!.id,
        name: "Genny Chrome",
        kind: "bridge",
        capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [], assetKinds: ["image"] },
      },
    });
    const executorId = "genny-image-test-executor";
    reportBridgeIdentity(bridge.bridge!, { executorId, username: "genny" });
    const response = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-sha256")).toBe(storage.exactHash);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const unverified = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: `Bearer ${bridge.key}` } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(unverified.status).toBe(409);
    const wrongExecutor = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": "another-executor" } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(wrongExecutor.status).toBe(409);
    const wrongBridge = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: "Bearer definitely-not-a-bridge-key", "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(wrongBridge.status).toBe(401);

    const latest = readState();
    latest.assets.push(
      { id: "foreign-image", agentId: "other-agent", type: "image", status: "ready", storage, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as Asset,
      { id: "observed-image", agentId: latest.agent!.id, presenceId: latest.presence!.id, type: "image", status: "observed", storage, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as Asset,
      { id: "tampered-image", agentId: latest.agent!.id, presenceId: latest.presence!.id, type: "image", status: "ready", storage: { ...storage, exactHash: "0".repeat(64) }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as Asset,
    );
    writeState(latest);
    const foreign = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/foreign-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "foreign-image" }) });
    expect(foreign.status).toBe(404);
    const observed = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/observed-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "observed-image" }) });
    expect(observed.status).toBe(409);
    const tampered = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/tampered-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "tampered-image" }) });
    expect(tampered.status).toBe(409);
    writeBridgeIdentity({ bridgeId: bridge.bridge!.id, executorId, username: "another-account", status: "verified", observedAt: new Date().toISOString() });
    const mismatched = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(mismatched.status).toBe(409);
    writeBridgeIdentity({ bridgeId: bridge.bridge!.id, executorId, username: "genny", status: "verified", observedAt: new Date(Date.now() - 31 * 60_000).toISOString() });
    const stale = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/genny-image", { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId } }), { params: Promise.resolve({ id: "genny-image" }) });
    expect(stale.status).toBe(409);
  });

  it("fails closed for an unauthenticated Bridge asset request", async () => {
    const response = await bridgeAssetGet(new Request("http://localhost/api/bridge/v1/assets/private"), { params: Promise.resolve({ id: "private" }) });
    expect(response.status).toBe(401);
  });
});
