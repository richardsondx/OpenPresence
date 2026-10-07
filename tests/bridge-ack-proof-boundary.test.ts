import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as verifyRoute } from "../app/api/bridge/v1/executions/[id]/verify/route";
import { POST } from "../app/api/bridge/v1/executions/[id]/ack/route";
import { createBridgeWithKey, heartbeatBridge, reportBridgeIdentity } from "../lib/bridge";
import { createAgent } from "../lib/runtime";
import { createPublicExpressionCandidate, sealExecutionForDelivery } from "../lib/publication-security";
import { readState, writeState } from "../lib/db";
import type { Execution } from "../lib/types";

afterEach(() => vi.unstubAllEnvs());
describe("raw acknowledgement cannot substitute for public world proof", () => {
  it.each(["x.post", "x.reply", "x.quote", "x.delete"])("rejects raw live Chrome %s ack without counting or mutating the claim", async affordance => {
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0"); vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    const source = createAgent({ name: "Ack adversary", description: "Evidence", mode: "agent", handle: "@ackqa", accent: "#777777" });
    source.presence!.environment = "live"; source.presences = [source.presence!];
    const result = createBridgeWithKey(source, { type: "createBridge", input: { presenceId: source.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "quote", "delete"], formats: ["x.post"], metrics: [] } } });
    const executorId = "openpresence-chrome-ackqa";
    reportBridgeIdentity(result.bridge!, { executorId, username: "ackqa" });
    heartbeatBridge(result.bridge!, executorId, { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post", "reply", "quote", "delete"] } });
    const state = readState(); const at = new Date().toISOString();
    const expression = createPublicExpressionCandidate({ state, presence: state.presence!, affordance, text: "One exact authorized expression.", source: "operator_manual", socialIntentId: "ack-intent", mediaIds: [] });
    const execution: Execution = { id: "raw-ack-execution", socialIntentId: "ack-intent", presenceId: state.presence!.id, bridgeId: result.bridge!.id, connector: "bridge", environment: "live", source: "operator", affordance, mode: "review", status: "claimed", attempts: 1, idempotencyKey: "raw-ack", lease: { executorId, claimedAt: at, expiresAt: new Date(Date.now()+60000).toISOString() }, target: affordance === "x.post" ? undefined : { type: "x.post", id: "111" }, publication: { id: "raw-ack-publication", format: affordance, payload: { text: expression.text }, publicExpression: expression, assetIds: [], links: [], createdAt: at }, createdAt: at, updatedAt: at };
    sealExecutionForDelivery(execution); state.executions = [execution]; writeState(state);
    const request = new Request("http://localhost/api/bridge/v1/executions/raw-ack-execution/ack", { method: "POST", headers: { authorization: `Bearer ${result.key}`, "content-type": "application/json" }, body: JSON.stringify({ executorId, externalRef: { type: affordance === "x.reply" ? "x.reply" : "x.post", id: "999" } }) });
    const response = await POST(request, { params: Promise.resolve({ id: execution.id }) });
    expect(response.status).toBe(400);
    expect(readState().outcomes).toHaveLength(0);
    expect(readState().executions[0]).toMatchObject({ id: execution.id, status: "claimed", attempts: 1, lease: { executorId } });
    if (affordance === "x.post") {
      // A strict text DOM receipt still must not report verification when the
      // completion boundary refuses the currently signed-in account.
      reportBridgeIdentity(result.bridge!, { executorId, username: "another" });
      const verification = await verifyRoute(new Request("http://localhost/api/bridge/v1/executions/raw-ack-execution/verify", { method: "POST", headers: { authorization: `Bearer ${result.key}`, "content-type": "application/json" }, body: JSON.stringify({ executorId, domProof: { externalRef: { type: "x.post", id: "999" }, permalink: "https://x.com/ackqa/status/999", authorHandle: "ackqa", text: expression.text, mediaCount: 0 } }) }), { params: Promise.resolve({ id: execution.id }) });
      expect(verification.status).toBe(200);
      expect(await verification.json()).toMatchObject({ verified: false });
      expect(readState().outcomes).toHaveLength(0);
    }
  });
});
