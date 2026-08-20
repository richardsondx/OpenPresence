import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "../lib/runtime";
import { createPublicExpressionCandidate, sealExecutionForDelivery, verifyExecutionPermit } from "../lib/publication-security";
import type { Execution } from "../lib/types";
import { publishSealedXPost } from "../lib/x";

function liveExecution(state: ReturnType<typeof createAgent>, source: "agent" | "operator" = "agent", text = "A bounded public expression.") {
  const presence = { ...state.presence!, environment: "live" as const, connectionMode: "native" as const };
  const intentId = "intent-security-test";
  const expression = createPublicExpressionCandidate({ state, presence, affordance: "x.post", text, source: source === "operator" ? "operator_manual" : "agent_model", socialIntentId: intentId });
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

  it("rejects planner-shaped JSON before a live permit can be issued", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    const state = createAgent({ name: "Ada", description: "A production agent", mode: "agent", handle: "@ada", accent: "#D68754" });
    const plannerObject = '{"conversationDisposition":"react_only","action":"like","rationale":"A quiet signal is enough."}';
    expect(() => sealExecutionForDelivery(liveExecution(state, "agent", plannerObject))).toThrow(/PUBLIC_TEXT_INTERNAL_MARKER/);
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

  it("Negative Bypass: blocks unsealed raw Quote or Reply from reaching live connector", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    const state = createAgent({ name: "Ada", description: "A production agent", mode: "agent", handle: "@ada", accent: "#D68754" });

    // 1. Raw unsealed execution with NO PublicExpression attached
    const unsealedExecution: Execution = {
      id: "raw-execution-bypass",
      socialIntentId: "intent-bypass",
      presenceId: state.presence!.id,
      affordance: "x.quote",
      mode: "auto",
      status: "queued",
      attempts: 0,
      connector: "native",
      idempotencyKey: "bypass-test",
      environment: "live",
      source: "agent",
      publication: { id: "pub-raw", format: "x.quote", payload: { text: "Arbitrary unsealed quote text." }, assetIds: [], links: [], createdAt: new Date().toISOString(), environment: "live" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Attempting to verify or seal an execution without PublicExpression fails
    expect(() => verifyExecutionPermit(unsealedExecution)).toThrow(/MISSING_PERMIT|MISSING_PUBLIC_EXPRESSION/);
    expect(() => sealExecutionForDelivery(unsealedExecution)).toThrow(/INVALID_PROVENANCE/);

    // 2. Tampered execution where payload was altered after permit creation
    const validExecution = liveExecution(state, "agent", "Valid quote text.");
    validExecution.affordance = "x.quote";
    const sealed = sealExecutionForDelivery(validExecution);
    // Tamper with payload
    validExecution.publication!.publicExpression!.text = "Tampered text injected post-sealing.";
    expect(() => verifyExecutionPermit(validExecution)).toThrow(/PAYLOAD_MUTATION/);
  });
});
