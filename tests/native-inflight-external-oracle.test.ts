import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverNativeExecutions } from "../lib/native-execution-delivery";
import * as db from "../lib/db";
import { applyOperation, createAgent, formXActionIntent } from "../lib/runtime";
import type { NativeChannelConnection, OpenPresenceState } from "../lib/types";
import * as x from "../lib/x";

describe("native in-flight barrier with an external side-effect oracle", () => {
  let oracle: Server | undefined;

  afterEach(async () => {
    oracle?.close();
    oracle = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("records one external request and never retries after mid-flight revocation", async () => {
    let requestCount = 0;
    let requestSeen: (() => void) | undefined;
    const requestArrived = new Promise<void>((resolve) => { requestSeen = resolve; });
    oracle = createServer((request, response) => {
      if (request.method === "POST") {
        requestCount += 1;
        requestSeen?.();
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { id: "oracle-receipt-1" } }));
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    const address = oracle.address();
    if (!address || typeof address === "string") throw new Error("Oracle did not bind to a TCP port.");

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${address.port}`);

    let state = createAgent({ name: "Native Oracle", description: "Test", audience: "Builders", mode: "agent", handle: "@native_oracle", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "oracle-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "oracle-account", username: "native_oracle", name: "Native Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: "oracle-target", bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "oracle-target-post" }, objectType: "post", content: { text: "An externally observed target", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "oracle-target-post" } });
    const execution = state.executions[0]!;
    const initial = JSON.parse(JSON.stringify(state)) as OpenPresenceState;
    const revoked = JSON.parse(JSON.stringify(state)) as OpenPresenceState;
    const revokedPresence = { ...presence, execution: { ...presence.execution, like: "off" as const } };
    revoked.presence = revokedPresence;
    revoked.presences = [revokedPresence];
    let revokeAfterHandoff = false;
    vi.spyOn(db, "readStateSnapshotForContext").mockImplementation(() => revokeAfterHandoff ? revoked : initial);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });

    const delivery = deliverNativeExecutions(state, new Set([execution.id]));
    await requestArrived;
    revokeAfterHandoff = true;
    const delivered = await delivery;
    const result = delivered.executions.find((item) => item.id === execution.id)!;

    expect(requestCount).toBe(1);
    expect(result).toMatchObject({ status: "succeeded", externalRef: { type: "x.like", id: "oracle-target-post" } });
    expect(delivered.outcomes.filter((item) => item.executionId === execution.id)).toHaveLength(1);
    expect(delivered.events.some((item) => item.title === "Native action completed during permission change")).toBe(true);
    expect(result.failure).toBeUndefined();
    expect((await deliverNativeExecutions(delivered, new Set([execution.id]))).executions.find((item) => item.id === execution.id)?.status).toBe("succeeded");
    expect(requestCount).toBe(1);
  });

  it("records zero external requests when cancellation happens during native retry backoff", async () => {
    let requestCount = 0;
    oracle = createServer((request, response) => {
      if (request.method === "POST") requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { id: "oracle-backoff-receipt" } }));
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);

    let state = createAgent({ name: "Backoff Oracle", description: "Test", audience: "Builders", mode: "agent", handle: "@backoff_oracle", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "backoff-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "backoff-account", username: "backoff_oracle", name: "Backoff Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: "backoff-target", bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "backoff-target-post" }, objectType: "post", author: { displayName: "Target", handle: "target" }, content: { text: "A target held in retry backoff" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "backoff-target-post" } });
    const execution = state.executions[0]!;
    execution.status = "queued";
    execution.retryAt = new Date(Date.now() + 60_000).toISOString();

    const beforeCancel = await deliverNativeExecutions(state, new Set([execution.id]));
    expect(requestCount).toBe(0);
    expect(beforeCancel.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "queued", retryAt: execution.retryAt });

    const cancelled = applyOperation(beforeCancel, { type: "cancelExecution", id: execution.id });
    expect(cancelled.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled" });
    const afterCancel = await deliverNativeExecutions(cancelled, new Set([execution.id]));
    expect(afterCancel.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled" });
    expect(requestCount).toBe(0);
  });
});
