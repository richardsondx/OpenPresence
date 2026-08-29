import { afterEach, describe, expect, it, vi } from "vitest";
import * as x from "../lib/x";
import { deliverNativeExecutions } from "../lib/native-execution-delivery";
import { createAgent, formXActionIntent, formXReplyIntent } from "../lib/runtime";
import type { NativeChannelConnection } from "../lib/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.env.OPENPRESENCE_TEST_MODE = "1";
});

describe("Autonomous native execution delivery", () => {
  it("claims the native handoff for a queued auto action instead of leaving it to expire", async () => {
    const targetId = `post_delivery_test_${Date.now()}_${Math.random()}`;
    let state = createAgent({ name: "Delivery Test", description: "Test", audience: "Testers", mode: "agent", handle: "@delivery_test", accent: "#777777" });
    const presence = {
      ...state.presence!,
      id: "presence_delivery_test",
      status: "live" as const,
      channel: "x" as const,
      environment: "live" as const,
      execution: { ...state.presence!.execution, like: "auto" as const },
    };
    const connection: NativeChannelConnection = {
      id: "native_delivery_test",
      presenceId: presence.id,
      channelId: "x",
      kind: "x",
      status: "connected",
      access: "read-write",
      account: { id: "account_delivery_test", username: "delivery_test", name: "Delivery Test" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = [{
      id: "mirror_delivery_test",
      bridgeId: "native_delivery_test",
      presenceId: presence.id,
      channelId: "x",
      externalRef: { type: "x.post", id: targetId },
      objectType: "post",
      language: "en",
      content: { text: "A useful English post", language: "en" },
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
    } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: targetId } });

    const queued = state.executions[0]!;
    expect(queued.status).toBe("queued");
    expect(queued.connector).toBe("native");

    // Simulate the legacy failure mode: two queued records represent the
    // same public action but carry unrelated intent IDs/legacy keys.
    state.executions.unshift({ ...queued, id: "legacy-duplicate", socialIntentId: "legacy-duplicate-intent", idempotencyKey: "legacy:duplicate", createdAt: new Date(Date.now() + 1).toISOString() });

    const credentials = { apiKey: "key", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" };
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue(credentials);
    vi.spyOn(x, "likeXPost").mockResolvedValue({ type: "x.like", id: "like_delivery_test" });
    process.env.OPENPRESENCE_TEST_MODE = "0";

    const delivered = await deliverNativeExecutions(state, new Set([queued.id, "legacy-duplicate"]));
    const execution = delivered.executions.find((item) => item.id === queued.id)!;

    expect(execution.status).toBe("succeeded");
    expect(execution.externalRef).toEqual({ type: "x.like", id: "like_delivery_test" });
    expect(delivered.outcomes.some((outcome) => outcome.executionId === queued.id && outcome.status === "succeeded")).toBe(true);
    expect(delivered.executions.find((item) => item.id === "legacy-duplicate")?.status).toBe("cancelled");
    expect(x.likeXPost).toHaveBeenCalledTimes(1);
  });

  it("allows only one Native write when concurrent stale workers generated different replies to one target", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    const targetId = `native-reply-race-${Date.now()}-${Math.random()}`;
    let state = createAgent({ name: "Delivery Race", description: "Test", audience: "Testers", mode: "agent", handle: "@delivery_race", accent: "#777777" });
    const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, reply: "auto" as const } };
    const connection: NativeChannelConnection = {
      id: `native-race-${Date.now()}`,
      presenceId: presence.id,
      channelId: "x",
      kind: "x",
      status: "connected",
      access: "read-write",
      account: { id: "race-account", username: "delivery_race", name: "Delivery Race" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.presence = presence;
    state.presences = [presence];
    state.nativeConnections = [connection];
    state.mirrorObjects = [{ id: `mirror-${targetId}`, bridgeId: connection.id, presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: targetId }, objectType: "post", language: "en", content: { text: "What do you think?", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: false, environment: "live" } as never];
    state = formXReplyIntent(state, "First worker wording.", targetId);
    state = formXReplyIntent(state, "Second worker wording.", targetId);
    const [second, first] = state.executions;

    vi.spyOn(x, "readNativeXCredentials").mockReturnValue({ apiKey: "key", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" });
    vi.spyOn(x, "publishSealedXPost").mockResolvedValue({ type: "x.reply", id: "only-one-public-reply" });
    const clone = () => JSON.parse(JSON.stringify(state));
    const [firstResult, secondResult] = await Promise.all([
      deliverNativeExecutions(clone(), new Set([first!.id])),
      deliverNativeExecutions(clone(), new Set([second!.id])),
    ]);

    expect([vi.mocked(x.publishSealedXPost).mock.calls.length, firstResult.executions.find((execution) => execution.id === first!.id)?.status, firstResult.executions.find((execution) => execution.id === first!.id)?.failure?.code, secondResult.executions.find((execution) => execution.id === second!.id)?.status, secondResult.executions.find((execution) => execution.id === second!.id)?.failure?.code]).toEqual([1, "succeeded", undefined, "cancelled", "DUPLICATE_EXECUTION"]);
    const statuses = [
      firstResult.executions.find((execution) => execution.id === first!.id)?.status,
      secondResult.executions.find((execution) => execution.id === second!.id)?.status,
    ];
    expect(statuses).toContain("succeeded");
    expect(statuses).toContain("cancelled");
  });
});
