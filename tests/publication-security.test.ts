import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "../lib/runtime";
import { createPublicExpressionCandidate, sealExecutionForDelivery, verifyExecutionPermit } from "../lib/publication-security";
import type { Execution } from "../lib/types";
import { publishSealedXPost } from "../lib/x";

function liveExecution(state: ReturnType<typeof createAgent>, source: "agent" | "operator" = "agent") {
  const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const };
  const intentId = "intent-security-test";
  const expression = createPublicExpressionCandidate({ state, presence, affordance: "x.post", text: "A bounded public expression.", source: source === "operator" ? "operator_manual" : "agent_model", socialIntentId: intentId });
  return {
    id: "execution-security-test",
    socialIntentId: intentId,
    presenceId: presence.id,
    affordance: "x.post",
    mode: "auto",
    status: "queued",
    attempts: 0,
    connector: "native",
    idempotencyKey: "security-test",
    environment: "live",
    source,
    publication: { id: "publication-security-test", format: "x.post", payload: { text: expression.text }, assetIds: [], links: [], publicExpression: expression, createdAt: expression.createdAt, environment: "live" },
    createdAt: expression.createdAt,
    updatedAt: expression.createdAt,
  } as Execution;
}

describe("publication security boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses every live permit from test or AI-mock runtime", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    const state = createAgent({ name: "Ada", description: "A test agent", mode: "agent", handle: "@ada", accent: "#D68754" });
    expect(() => sealExecutionForDelivery(liveExecution(state))).toThrow(/LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME/);
  });

  it("requires real public-expression provenance and seals an immutable payload", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    const state = createAgent({ name: "Ada", description: "A production agent", mode: "agent", handle: "@ada", accent: "#D68754" });
    const execution = liveExecution(state);
    const sealed = sealExecutionForDelivery(execution);
    expect(sealed.expression.safetyStatus).toBe("sealed");
    expect(sealed.expression.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(execution.permit).toEqual(sealed.permit);
    expect(verifyExecutionPermit(execution)).toEqual(sealed.permit);
    execution.publication!.publicExpression!.text = "runtime secret";
    expect(() => verifyExecutionPermit(execution)).toThrow(/PAYLOAD_MUTATION/);
  });

  it("rejects operational or planner artifacts even in a production process", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    const state = createAgent({ name: "Ada", description: "A production agent", mode: "agent", handle: "@ada", accent: "#D68754" });
    const execution = liveExecution(state);
    execution.publication!.publicExpression!.provenance.artifactKind = "operational";
    expect(() => sealExecutionForDelivery(execution)).toThrow(/INVALID_PROVENANCE/);
  });

  it("lets the writer consume a permit once and never accepts raw text", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    const state = createAgent({ name: "Ada", description: "A production agent", mode: "agent", handle: "@ada", accent: "#D68754" });
    const execution = liveExecution(state);
    const sealed = sealExecutionForDelivery(execution);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "post-1" } }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(publishSealedXPost({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, sealed.expression, sealed.permit)).resolves.toEqual({ type: "x.post", id: "post-1" });
    await expect(publishSealedXPost({ apiKey: "api", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" }, sealed.expression, sealed.permit)).rejects.toThrow(/REPLAYED_PERMIT/);
  });
});
