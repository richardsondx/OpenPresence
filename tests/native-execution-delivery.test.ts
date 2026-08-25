import { afterEach, describe, expect, it, vi } from "vitest";
import * as x from "../lib/x";
import { deliverNativeExecutions } from "../lib/native-execution-delivery";
import { createAgent, formXActionIntent } from "../lib/runtime";
import type { NativeChannelConnection } from "../lib/types";

afterEach(() => {
  vi.restoreAllMocks();
  process.env.OPENPRESENCE_TEST_MODE = "1";
});

describe("Autonomous native execution delivery", () => {
  it("claims the native handoff for a queued auto action instead of leaving it to expire", async () => {
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
      externalRef: { type: "x.post", id: "post_delivery_test" },
      objectType: "post",
      language: "en",
      content: { text: "A useful English post", language: "en" },
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
    } as never];
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "post_delivery_test" } });

    const queued = state.executions[0]!;
    expect(queued.status).toBe("queued");
    expect(queued.connector).toBe("native");

    const credentials = { apiKey: "key", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" };
    vi.spyOn(x, "readNativeXCredentials").mockReturnValue(credentials);
    vi.spyOn(x, "likeXPost").mockResolvedValue({ type: "x.like", id: "like_delivery_test" });
    process.env.OPENPRESENCE_TEST_MODE = "0";

    const delivered = await deliverNativeExecutions(state, new Set([queued.id]));
    const execution = delivered.executions.find((item) => item.id === queued.id)!;

    expect(execution.status).toBe("succeeded");
    expect(execution.externalRef).toEqual({ type: "x.like", id: "like_delivery_test" });
    expect(delivered.outcomes.some((outcome) => outcome.executionId === queued.id && outcome.status === "succeeded")).toBe(true);
  });
});
