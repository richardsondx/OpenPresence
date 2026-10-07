import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverNativeExecutions } from "../lib/native-execution-delivery";
import * as db from "../lib/db";
import { applyOperation, createAgent, formXActionIntent } from "../lib/runtime";
import type { NativeChannelConnection, OpenPresenceState } from "../lib/types";
import * as x from "../lib/x";
import { POST as statePost } from "../app/api/state/route";

describe("native in-flight barrier with an external side-effect oracle", () => {
  let oracle: Server | undefined;

  afterEach(async () => {
    oracle?.close();
    oracle = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("records one external request and never retries after mid-flight revocation", async () => {
    let requestCount = 0;
    let requestSeen: (() => void) | undefined;
    let releaseResponse: (() => void) | undefined;
    const responseReleased = new Promise<void>((resolve) => { releaseResponse = resolve; });
    const requestArrived = new Promise<void>((resolve) => { requestSeen = resolve; });
    oracle = createServer((request, response) => {
      if (request.method === "POST") {
        requestCount += 1;
        requestSeen?.();
      }
      void responseReleased.then(() => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: { id: "oracle-receipt-1" } }));
      });
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
    releaseResponse?.();
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

  it("permits a due retry control but no request after cancellation crosses the backoff deadline", async () => {
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

    const durableSnapshot = vi.spyOn(db, "readStateSnapshotForContext").mockReturnValue(state);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });

    // Positive control: a due retry crosses the real connector boundary.
    // Without this control, a future retryAt would make the negative oracle
    // assertion vacuous even if cancellation failed to fence delivery.
    const due = JSON.parse(JSON.stringify(state)) as OpenPresenceState;
    const dueExecution = due.executions.find((item) => item.id === execution.id)!;
    dueExecution.retryAt = new Date(Date.now() - 1).toISOString();
    durableSnapshot.mockReturnValue(due);
    const dueResult = await deliverNativeExecutions(due, new Set([dueExecution.id]));
    expect(dueResult.executions.find((item) => item.id === dueExecution.id)?.status).toBe("succeeded");
    expect(requestCount).toBe(1);

    durableSnapshot.mockReturnValue(state);
    const beforeCancel = await deliverNativeExecutions(state, new Set([execution.id]));
    expect(requestCount).toBe(1);
    expect(beforeCancel.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "queued", retryAt: execution.retryAt });

    const cancelled = applyOperation(beforeCancel, { type: "cancelExecution", id: execution.id });
    expect(cancelled.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled" });
    durableSnapshot.mockReturnValue(cancelled);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(execution.retryAt!) + 1);
    const afterCancel = await deliverNativeExecutions(cancelled, new Set([execution.id]));
    expect(afterCancel.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled" });
    expect(requestCount).toBe(1); // Only the uncancelled control reached the HTTP oracle.
  });

  it("composes public retry and cancellation with persisted state and the real native HTTP boundary", async () => {
    const requests: string[] = [];
    oracle = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const target = String(JSON.parse(body).tweet_id);
        const previousAttempts = requests.filter((item) => item === target).length;
        requests.push(target);
        response.setHeader("content-type", "application/json");
        response.statusCode = previousAttempts === 0 ? 503 : 200;
        response.end(JSON.stringify(previousAttempts === 0 ? { error: "Temporary oracle failure" } : { data: { liked: true } }));
      });
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });
    let state = createAgent({ name: "Public Native Oracle", description: "Control-plane boundary proof", mode: "agent", handle: "@public_oracle", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "public-oracle-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "public-oracle-account", username: "public_oracle", name: "Public Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    for (const target of ["due-control", "cancelled-target"]) {
      state.mirrorObjects.push({ id: `mirror-${target}`, bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: target }, objectType: "post", content: { text: `Observed ${target}`, language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never);
      state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: target } });
    }
    const ids = new Set(state.executions.map((item) => item.id));
    for (const executionId of ids) {
      // Restore the available-connector precondition between independent
      // transient failures; each failed receipt still comes from real HTTP.
      state.nativeConnections = [{ ...connection }];
      db.writeState(state);
      state = await deliverNativeExecutions(db.readState(), new Set([executionId]));
    }
    expect(state.executions.every((item) => item.status === "failed")).toBe(true);
    expect(requests).toHaveLength(2);
    state.nativeConnections = [{ ...connection }];
      db.writeState(state);
    const operation = async (value: object) => {
      const response = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }));
      expect(response.status).toBe(200);
      return await response.json() as OpenPresenceState;
    };
    for (const executionId of ids) await operation({ type: "retryExecution", id: executionId });
    const queued = db.readState();
    expect(queued.executions.every((item) => item.status === "queued" && Date.parse(item.retryAt!) > Date.now())).toBe(true);
    expect(requests).toHaveLength(2);
    const cancelledId = queued.executions.find((item) => item.target?.id === "cancelled-target")!.id;
    await operation({ type: "cancelExecution", id: cancelledId });
    expect(db.readState().executions.find((item) => item.id === cancelledId)?.status).toBe("cancelled");
    // Reuse the worker's pre-cancel snapshot after the public cancellation.
    // Move only that stale copy past its retry deadline so the negative oracle
    // proves the durable terminal status, rather than retryAt backoff.
    const staleQueued = JSON.parse(JSON.stringify(queued)) as OpenPresenceState;
    const staleCancelled = staleQueued.executions.find((item) => item.id === cancelledId)!;
    staleCancelled.retryAt = new Date(Date.now() - 1).toISOString();
    const staleCancelledResult = await deliverNativeExecutions(staleQueued, new Set([cancelledId]));
    expect(staleCancelledResult.executions.find((item) => item.id === cancelledId)).toMatchObject({ status: "cancelled" });
    expect(requests).toHaveLength(2);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Math.max(...queued.executions.map((item) => Date.parse(item.retryAt!))) + 1);
    const delivered = await deliverNativeExecutions(db.readState(), ids);
    db.writeState(delivered);
    const persisted = db.readState();
    expect(persisted.executions.find((item) => item.target?.id === "due-control")?.status).toBe("succeeded");
    expect(persisted.executions.find((item) => item.id === cancelledId)?.status).toBe("cancelled");
    expect(requests.filter((item) => item === "due-control")).toHaveLength(2);
    expect(requests.filter((item) => item === "cancelled-target")).toHaveLength(1);
    expect(persisted.outcomes.filter((item) => item.status === "succeeded")).toHaveLength(1);
    await deliverNativeExecutions(persisted, ids);
    expect(requests).toHaveLength(3);
    console.info("[native-public-oracle]", JSON.stringify({
      requests,
      executions: persisted.executions.map((item) => ({ id: item.id, target: item.target?.id, status: item.status, attempts: item.attempts })),
      succeededOutcomes: persisted.outcomes.filter((item) => item.status === "succeeded").map((item) => ({ id: item.id, executionId: item.executionId })),
      databaseMocked: false, connectorMocked: false, credentials: "fixture", clock: "after both retry deadlines",
    }));
  });

  it.each([
    { initialStatus: "queued" as const, revocation: "off" as const, expectedCode: "EXECUTION_REVOKED" },
    { initialStatus: "queued" as const, revocation: "paused" as const, expectedCode: "PRESENCE_PAUSED" },
    { initialStatus: "queued" as const, revocation: "review" as const, expectedCode: undefined },
    { initialStatus: "approved" as const, revocation: "off" as const, expectedCode: "EXECUTION_REVOKED" },
    { initialStatus: "approved" as const, revocation: "paused" as const, expectedCode: "PRESENCE_PAUSED" },
    { initialStatus: "approved" as const, revocation: "review" as const, expectedCode: undefined },
  ])("fences a public $initialStatus execution before native handoff when the Presence envelope is $revocation", async ({ initialStatus, revocation, expectedCode }) => {
    let requestCount = 0;
    oracle = createServer((request, response) => {
      if (request.method === "POST") requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { id: "should-not-be-reached" } }));
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });

    let state = createAgent({ name: "Public Permission Oracle", description: "Envelope boundary proof", mode: "agent", handle: `@permission_${initialStatus}`, accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: `permission-${initialStatus}-connection`, presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: `permission-${initialStatus}-account`, username: `permission_${initialStatus}`, name: "Permission Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = ["target", "authorized-control"].map((kind) => ({ id: `permission-${initialStatus}-${revocation}-${kind}-mirror`, bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: `permission-${initialStatus}-${revocation}-${kind}` }, objectType: "post", content: { text: `Permission ${kind}`, language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never));
    // Form the target against the exact mirrored external id, then create an
    // independent authorized control that must cross the same real oracle.
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: `permission-${initialStatus}-${revocation}-target` } });
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: `permission-${initialStatus}-${revocation}-authorized-control` } });
    const execution = state.executions.find((item) => item.target?.id === `permission-${initialStatus}-${revocation}-target`)!;
    const authorized = state.executions.find((item) => item.target?.id === `permission-${initialStatus}-${revocation}-authorized-control`)!;
    if (initialStatus === "approved") execution.status = "approved";
    if (initialStatus === "approved") authorized.status = "approved";
    db.writeState(state);

    const authorizedResult = await deliverNativeExecutions(state, new Set([authorized.id]));
    expect(requestCount).toBe(1);
    expect(authorizedResult.executions.find((item) => item.id === authorized.id)?.status).toBe("succeeded");

    const revokedResponse = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "setPresence", patch: revocation === "paused" ? { status: "paused" } : { execution: { like: revocation } } }) }));
    expect(revokedResponse.status).toBe(200);
    const revoked = db.readState();
    expect(revocation === "paused" ? revoked.presence?.status : revoked.presence?.execution.like).toBe(revocation === "paused" ? "paused" : revocation);
    // Keep the pre-revocation object as the worker's stale source. The
    // delivery function must consult the durable snapshot before handoff.
    const delivered = await deliverNativeExecutions(state, new Set([execution.id]));
    const result = delivered.executions.find((item) => item.id === execution.id)!;
    const approvedReview = initialStatus === "approved" && revocation === "review";
    expect(requestCount).toBe(approvedReview ? 2 : 1);
    expect(result.status).toBe(approvedReview ? "succeeded" : revocation === "review" ? "awaiting-review" : "cancelled");
    if (expectedCode) expect(result.failure?.code).toBe(expectedCode);
    expect(delivered.outcomes.filter((item) => item.executionId === execution.id && item.status === "succeeded")).toHaveLength(approvedReview ? 1 : 0);
    expect(() => db.writeState(delivered)).toThrow(db.WorkspaceConflictError);
    const stillRevoked = db.readState();
    expect(revocation === "paused" ? stillRevoked.presence?.status : stillRevoked.presence?.execution.like).toBe(revocation);
  });

  it("fails closed when a stale native execution's Presence is absent from durable state", async () => {
    let requestCount = 0;
    oracle = createServer((request, response) => {
      if (request.method === "POST") requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { id: "should-not-be-reached" } }));
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });
    let state = createAgent({ name: "Missing Presence Oracle", description: "Fail closed proof", mode: "agent", handle: "@missing_presence", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "missing-presence-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "missing-presence-account", username: "missing_presence", name: "Missing Presence" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: "missing-presence-mirror", bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "missing-presence-target" }, objectType: "post", content: { text: "Missing Presence target" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "missing-presence-target" } });
    const execution = state.executions[0]!;
    db.writeState({ ...state, presence: null, presences: [] });
    const delivered = await deliverNativeExecutions(state, new Set([execution.id]));
    expect(requestCount).toBe(0);
    expect(delivered.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled", failure: { code: "PRESENCE_AUTHORITY_UNAVAILABLE" } });
  });

  it("requires durable native connector authority before handoff", async () => {
    let requestCount = 0;
    oracle = createServer((request, response) => {
      if (request.method === "POST") requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { liked: true } }));
    });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });

    let state = createAgent({ name: "Durable Connector Oracle", description: "Connection authority proof", mode: "agent", handle: "@durable_connector", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "durable-connector", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "durable-account", username: "durable_connector", name: "Durable Connector" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = ["authorized-target", "revoked-target"].map((id) => ({ id: `mirror-${id}`, bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", content: { text: id, language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never));
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "authorized-target" } });
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "revoked-target" } });
    const authorized = state.executions[0]!;
    const revoked = state.executions[1]!;
    const durableSnapshot = vi.spyOn(db, "readStateSnapshotForContext").mockReturnValue(state);

    const authorizedResult = await deliverNativeExecutions(state, new Set([authorized.id]));
    expect(authorizedResult.executions.find((item) => item.id === authorized.id)?.status).toBe("succeeded");
    expect(requestCount).toBe(1);

    durableSnapshot.mockReturnValue({ ...state, nativeConnections: [] });
    const revokedResult = await deliverNativeExecutions(state, new Set([revoked.id]));
    expect(revokedResult.executions.find((item) => item.id === revoked.id)).toMatchObject({ status: "cancelled", failure: { code: "NATIVE_CONNECTION_AUTHORITY_UNAVAILABLE" } });
    expect(requestCount).toBe(1);
  });

  it("allows a newer public approval over an awaiting-review durable candidate", async () => {
    let requestCount = 0;
    oracle = createServer((request, response) => { if (request.method === "POST") requestCount += 1; response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: { liked: true } })); });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });
    let state = createAgent({ name: "Approval Oracle", description: "Approval transition proof", mode: "agent", handle: "@approval_oracle", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "review" as const } };
    const connection: NativeChannelConnection = { id: "approval-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "approval-account", username: "approval_oracle", name: "Approval Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence; state.presences = [presence]; state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: "approval-mirror", bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "approval-target" }, objectType: "post", content: { text: "Approval target", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "approval-target" } });
    const execution = state.executions[0]!;
    execution.status = "awaiting-review";
    execution.mode = "review";
    db.writeState(state);
    const approvedResponse = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "approveExecution", id: execution.id }) }));
    expect(approvedResponse.status).toBe(200);
    const approved = await approvedResponse.json() as OpenPresenceState;
    expect(approved.executions.find((item) => item.id === execution.id)?.status).toBe("succeeded");
    const executeResponse = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "executeIntent", id: execution.socialIntentId }) }));
    expect(executeResponse.status).toBe(200);
    expect(db.readState().executions.find((item) => item.id === execution.id)?.status).toBe("succeeded");
    expect(requestCount).toBe(1);
  });

  it("preserves a durable success receipt when a stale worker re-enters", async () => {
    let requestCount = 0;
    oracle = createServer((request, response) => { if (request.method === "POST") requestCount += 1; response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: { liked: true } })); });
    await new Promise<void>((resolve) => oracle!.listen(0, "127.0.0.1", () => resolve()));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_X_API_BASE_URL", `http://127.0.0.1:${(oracle.address() as import("node:net").AddressInfo).port}`);
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "oracle-key", apiSecret: "oracle-secret", accessToken: "oracle-token", accessTokenSecret: "oracle-token-secret" });
    let state = createAgent({ name: "Receipt Oracle", description: "Receipt preservation proof", mode: "agent", handle: "@receipt_oracle", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const connection: NativeChannelConnection = { id: "receipt-connection", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "receipt-account", username: "receipt_oracle", name: "Receipt Oracle" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presence = presence; state.presences = [presence]; state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: "receipt-mirror", bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "receipt-target" }, objectType: "post", content: { text: "Receipt target", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "receipt-target" } });
    const execution = state.executions[0]!;
    const durable = JSON.parse(JSON.stringify(state)) as OpenPresenceState;
    const durableExecution = durable.executions[0]!;
    durableExecution.status = "succeeded";
    durableExecution.externalRef = { type: "x.like", id: "receipt-target" };
    execution.failure = { code: "OLD_FAILURE", message: "Obsolete stale failure", retryable: true };
    execution.retryAt = new Date(Date.now() - 1000).toISOString();
    db.writeState(durable);
    const delivered = await deliverNativeExecutions(state, new Set([execution.id]));
    expect(delivered.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "succeeded", externalRef: { id: "receipt-target" } });
    expect(delivered.executions.find((item) => item.id === execution.id)?.failure).toBeUndefined();
    expect(delivered.executions.find((item) => item.id === execution.id)?.retryAt).toBeUndefined();
    expect(requestCount).toBe(0);
  });
});
