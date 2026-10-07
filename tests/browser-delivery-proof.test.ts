import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "../lib/runtime";
import { createPublicExpressionCandidate, sealExecutionForDelivery } from "../lib/publication-security";
import { verifyBrowserDeliveryProof, type BrowserDeliveryProof, type BrowserDeliveryProofContext } from "../lib/browser-delivery-proof";
import type { Bridge, Execution } from "../lib/types";

function fixture(action = "x.post", media = true) {
  vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
  const now = Date.parse("2026-10-01T14:00:10Z");
  vi.useFakeTimers(); vi.setSystemTime(now - 10000);
  const state = createAgent({ name: "Proof challenge", description: "Ideas", mode: "agent", handle: "@proof", accent: "#777" });
  const presence = { ...state.presence!, environment: "live" as const };
  const assetIds = media ? ["image"] : [];
  const hash = "a".repeat(64);
  const expression = createPublicExpressionCandidate({ state, presence, affordance: action, text: "A precise public idea.", mediaIds: assetIds, source: "operator_manual", socialIntentId: "intent" });
  const execution: Execution = { id: "execution", socialIntentId: "intent", presenceId: presence.id, bridgeId: "bridge", connector: "bridge", source: "operator", environment: "live", affordance: action, mode: "review", status: "claimed", attempts: 1, idempotencyKey: "one", target: action !== "x.post" ? { type: "x.post", id: "111" } : undefined,
    lease: { executorId: "executor", claimedAt: new Date(now - 9000).toISOString(), expiresAt: new Date(now + 60000).toISOString() },
    publication: { id: "publication", format: action, payload: { text: expression.text }, publicExpression: expression, assetIds, links: [], operatorAssetApproval: { assetIds, assetHashes: { image: hash }, reason: "Exact image", at: new Date(now - 10000).toISOString() }, createdAt: new Date(now - 10000).toISOString() }, createdAt: new Date(now - 10000).toISOString(), updatedAt: new Date(now - 10000).toISOString() };
  sealExecutionForDelivery(execution);
  vi.setSystemTime(now);
  const bridge: Bridge = { id: "bridge", presenceId: presence.id, channelId: "x", name: "Chrome", kind: "bridge", state: "online", capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "quote"], formats: ["x.post"], metrics: [], assetKinds: ["image"] }, createdAt: execution.createdAt, updatedAt: execution.updatedAt };
  const proof: BrowserDeliveryProof = { version: 1, source: "x_website_response", readback: true, executionId: execution.id, bridgeId: bridge.id, presenceId: presence.id, executorId: "executor", permitNonce: execution.permit!.nonce, observedAt: new Date(now - 1000).toISOString(), createdPostId: "222",
    post: { externalRef: { type: "x.post", id: "222" }, permalink: "https://x.com/proof/status/222", authorHandle: "@proof", text: expression.text, createdAt: new Date(now - 3000).toISOString(), mediaIds: media ? ["platform-image"] : [], parentId: action === "x.reply" ? "111" : undefined, quotedTargetId: action === "x.quote" ? "111" : undefined },
    uploads: media ? [{ assetId: "image", sha256: hash, platformMediaId: "platform-image", executionId: execution.id, permitNonce: execution.permit!.nonce, uploadedAt: new Date(now - 5000).toISOString() }] : [] };
  const context: BrowserDeliveryProofContext = { execution, bridge, executorId: "executor", expectedHandle: "@proof", identity: { username: "proof", status: "verified", observedAt: new Date(now - 500).toISOString() }, claimedAt: execution.lease!.claimedAt, assetHashes: { image: hash }, currentAssetHashes: { image: hash }, now };
  return { proof, context };
}

describe("website delivery proof boundary", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it.each(["x.post", "x.reply", "x.quote"])("proves exact %s text, target, bytes and independently read-back media", action => {
    const { proof, context } = fixture(action);
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(true);
  });
  it("verifies text-only original with the new contract", () => {
    const { proof, context } = fixture("x.post", false);
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(true);
  });
  it("accepts trusted auto-authorized media snapshot without forcing human approval", () => {
    const { proof, context } = fixture(); delete context.execution.publication!.operatorAssetApproval;
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(true);
  });
  it("accepts exact live session scope", () => {
    const { proof, context } = fixture(); context.execution.sessionId = `live:${context.execution.presenceId}`;
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(true);
  });
  const challenges: Array<[string, (proof: BrowserDeliveryProof, context: BrowserDeliveryProofContext) => void]> = [
    ["wrong author", proof => { proof.post.authorHandle = "another"; }],
    ["stale identity", (_proof, context) => { context.identity!.observedAt = "2026-09-30T14:00:00Z"; }],
    ["wrong signed-in account", (_proof, context) => { context.identity!.username = "another"; }],
    ["unknown identity", (_proof, context) => { context.identity!.status = "unknown"; }],
    ["future identity", (_proof, context) => { context.identity!.observedAt = "2026-10-02T14:00:00Z"; }],
    ["old identical post", proof => { proof.post.createdAt = "2026-09-30T14:00:00Z"; }],
    ["changed public text", proof => { proof.post.text += " changed"; }],
    ["changed sealed text", (_proof, context) => { context.execution.publication!.publicExpression!.text += " changed"; }],
    ["wrong permalink host", proof => { proof.post.permalink = "https://x.com.evil.test/proof/status/222"; }],
    ["wrong permalink account", proof => { proof.post.permalink = "https://x.com/another/status/222"; }],
    ["wrong permalink object", proof => { proof.post.permalink = "https://x.com/proof/status/333"; }],
    ["http permalink", proof => { proof.post.permalink = "http://x.com/proof/status/222"; }],
    ["CreateTweet only", proof => { Object.assign(proof, { readback: false }); }],
    ["readback different from CreateTweet", proof => { proof.createdPostId = "333"; }],
    ["remote ID replay", (_proof, context) => { context.previouslyAttributedPostIds = ["222"]; }],
    ["receipt from another execution", proof => { proof.executionId = "another"; }],
    ["receipt from another executor", proof => { proof.executorId = "another"; }],
    ["receipt from another Presence", proof => { proof.presenceId = "another"; }],
    ["receipt from another Bridge", proof => { proof.bridgeId = "another"; }],
    ["receipt from another nonce", proof => { proof.permitNonce = "another"; }],
    ["wrong executor lease", (_proof, context) => { context.execution.lease!.executorId = "another"; }],
    ["unsigned permit", (_proof, context) => { context.execution.permit!.signature = "invalid"; }],
    ["Sandbox receipt", (_proof, context) => { context.execution.environment = "sandbox"; }],
    ["prewrite failed action", (_proof, context) => { context.execution.status = "failed"; context.execution.failure = { code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "No write" }; }],
    ["foreign session", (_proof, context) => { context.execution.sessionId = "sandbox:other"; }],
    ["changed intent scope", (_proof, context) => { context.execution.socialIntentId = "another"; }],
    ["changed mutable payload", (_proof, context) => { context.execution.publication!.payload = { text: "another" }; }],
    ["canceled action", (_proof, context) => { context.execution.status = "cancelled"; }],
    ["stale observation", proof => { proof.observedAt = "2026-09-30T14:00:00Z"; }],
    ["future observation", proof => { proof.observedAt = "2026-10-02T14:00:00Z"; }],
    ["count only media proof", proof => { proof.uploads = []; }],
    ["same media count different identity", proof => { proof.post.mediaIds = ["another-platform-image"]; }],
    ["upload from another execution", proof => { proof.uploads[0].executionId = "another"; }],
    ["upload from another nonce", proof => { proof.uploads[0].permitNonce = "another"; }],
    ["different actual uploaded bytes", proof => { proof.uploads[0].sha256 = "b".repeat(64); }],
    ["replaced canonical image", (_proof, context) => { context.assetHashes.image = "b".repeat(64); }],
    ["missing approved hash", (_proof, context) => { delete context.execution.publication!.operatorAssetApproval!.assetHashes; }],
    ["replaced current image", (_proof, context) => { context.currentAssetHashes.image = "b".repeat(64); }],
    ["upload predates claim", proof => { proof.uploads[0].uploadedAt = "2026-09-30T14:00:00Z"; }],
    ["unexpected original parent", proof => { proof.post.parentId = "111"; }],
    ["unexpected original quote", proof => { proof.post.quotedTargetId = "111"; }],
  ];
  it.each(challenges)("rejects %s", (_name, mutate) => {
    const { proof, context } = fixture(); mutate(proof, context);
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(false);
  });
  it.each(["x.reply", "x.quote"])("rejects wrong %s target", action => {
    const { proof, context } = fixture(action);
    if (action === "x.reply") proof.post.parentId = "other"; else proof.post.quotedTargetId = "other";
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(false);
  });
  it("allows late read-back after a short permit expires without renewing write authority", () => {
    const { proof, context } = fixture();
    const before = structuredClone(context.execution);
    vi.setSystemTime(Date.parse(context.execution.permit!.expiresAt) + 1000);
    context.now = Date.now(); proof.observedAt = new Date().toISOString(); context.identity!.observedAt = proof.observedAt;
    expect(verifyBrowserDeliveryProof(proof, context).verified).toBe(true);
    expect(context.execution).toEqual(before);
  });
});
