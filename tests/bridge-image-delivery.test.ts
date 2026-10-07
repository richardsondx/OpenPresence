import crypto from "node:crypto";
import sharp from "sharp";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as approve } from "../app/api/state/route";
import { POST as claim } from "../app/api/bridge/v1/executions/claim/route";
import { GET as assetGet } from "../app/api/bridge/v1/assets/[id]/route";
import { createAgent } from "../lib/runtime";
import { createBridgeWithKey, heartbeatBridge, reportBridgeIdentity } from "../lib/bridge";
import { readState, writeBridgeIdentity, writeState } from "../lib/db";
import { putAssetBytes } from "../lib/asset-store";
import { createPublicExpressionCandidate } from "../lib/publication-security";
import type { Execution } from "../lib/types";

describe("composed image delivery into a declared simulated X composer", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("approves, claims protocol 2, retrieves exact bytes and attaches them without any public submission", async () => {
    // Real route/permit/byte transport, simulated page. No provider or X writer is invoked.
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "0");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "0");
    let state = createAgent({ name: "Composed image", description: "Visual ideas", mode: "agent", handle: "@composed", accent: "#777777" });
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presence!.browserAccess = { enabled: true };
    state.presence!.execution.post = "review";
    state.presences = [state.presence!];
    const bridge = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [], assetKinds: ["image"] } } });
    const executorId = "openpresence-chrome-composed-image";
    heartbeatBridge(bridge.bridge!, executorId);
    reportBridgeIdentity(bridge.bridge!, { executorId, username: "composed" });
    state = readState();
    const pixels = Buffer.alloc(900 * 865 * 3);
    let noise = 0x12345678;
    for (let index = 0; index < pixels.length; index++) { noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5; pixels[index] = noise & 0xff; }
    const bytes = await sharp(pixels, { raw: { width: 900, height: 865, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(bytes.length).toBeGreaterThan(2_300_000);
    expect(bytes.length).toBeLessThan(2_500_000);
    const storage = await putAssetBytes(bytes, { mimeType: "image/png", suggestedName: "composed.png" });
    const timestamp = new Date().toISOString();
    const assetId = "composed-approved-image";
    state.assets = [{ id: assetId, agentId: state.agent!.id, presenceId: state.presence!.id, type: "image", status: "ready", retention: "preserved", reusePermission: "needs_approval", metadataReview: { status: "open" }, rights: { status: "unknown" }, storage, provenance: { origin: "operator_upload", importedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp }];
    const expression = createPublicExpressionCandidate({ state, presence: state.presence!, affordance: "x.post", text: "A useful visual idea.", source: "operator_manual", socialIntentId: "composed-intent", mediaIds: [assetId] });
    const execution: Execution = { id: "composed-execution", socialIntentId: "composed-intent", presenceId: state.presence!.id, bridgeId: bridge.bridge!.id, affordance: "x.post", mode: "review", status: "awaiting-review", attempts: 0, connector: "bridge", source: "operator", environment: "live", idempotencyKey: "composed-image-only", publication: { id: "composed-publication", format: "x.post", payload: { text: expression.text }, assetIds: [assetId], links: [], publicExpression: expression, createdAt: timestamp, environment: "live" }, createdAt: timestamp, updatedAt: timestamp };
    state.executions = [execution];
    state.socialIntents = [{ id: execution.socialIntentId, agentId: state.agent!.id, presenceId: execution.presenceId, affordance: "x.post", publicationId: execution.publication!.id, state: "active", priority: 50, validity: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, environment: "live", source: "operator", formedAt: timestamp, updatedAt: timestamp }];
    state.publications = [execution.publication!];
    writeState(state);
    const approvalRequest = () => new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "approveExecution", id: execution.id }) });
    expect((await approve(approvalRequest())).status).toBe(200);
    expect(readState().executions[0]!.status).toBe("queued");
    expect((await approve(approvalRequest())).status).toBe(200);
    const claimRequest = (mediaProtocol?: number) => new Request("http://localhost/api/bridge/v1/executions/claim", { method: "POST", headers: { authorization: `Bearer ${bridge.key}`, "content-type": "application/json" }, body: JSON.stringify({ executorId, limit: 1, ...(mediaProtocol ? { mediaProtocol } : {}) }) });
    const approvedPayload = structuredClone(readState().executions[0]!.publication);
    const held = await (await claim(claimRequest())).json();
    expect(held.executions).toHaveLength(0);
    expect(readState().executions[0]).toMatchObject({ status: "awaiting-connector", attempts: 0, failure: { code: "BROWSER_CONNECTOR_UPDATE_REQUIRED" } });
    writeBridgeIdentity({ bridgeId: bridge.bridge!.id, executorId, username: "wrong-account", status: "verified", observedAt: new Date().toISOString() });
    const wrongAccount = await (await claim(claimRequest(2))).json();
    expect(wrongAccount.executions).toHaveLength(0);
    expect(readState().executions[0]!.attempts).toBe(0);
    expect(readState().executions[0]!.publication!.payload).toEqual(approvedPayload!.payload);
    reportBridgeIdentity(readState().bridges.find(item => item.id === bridge.bridge!.id)!, { executorId, username: "composed" });
    heartbeatBridge(bridge.bridge!, executorId, { version: "0.1.2", protocolVersion: 2, probed: true, capabilities: { channelRead: true, mediaUpload: true, verification: true, affordances: ["post"] } });
    const claimed = await (await claim(claimRequest(2))).json() as { executions: Execution[] };
    expect(claimed.executions).toHaveLength(1);
    expect(claimed.executions[0]!.id).toBe(execution.id);
    expect(claimed.executions[0]!.publication!.operatorAssetApproval!.assetIds).toEqual([assetId]);
    expect((await (await claim(claimRequest(2))).json()).executions).toHaveLength(0);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const requests: Array<{ assetId: string; executionId: string }> = [];
      await page.exposeFunction("approvedAssetTransport", async (message: { assetId: string; executionId: string }) => {
        requests.push(message);
        const response = await assetGet(new Request(`http://localhost/api/bridge/v1/assets/${message.assetId}`, { headers: { authorization: `Bearer ${bridge.key}`, "x-openpresence-executor-id": executorId, "x-openpresence-execution-id": message.executionId } }), { params: Promise.resolve({ id: message.assetId }) });
        expect(response.status).toBe(200);
        return { ok: true, asset: { assetId: message.assetId, mimeType: response.headers.get("content-type"), name: "composed.png", data: Buffer.from(await response.arrayBuffer()).toString("base64") } };
      });
      await page.route("https://x.com/**", route => route.fulfill({ contentType: "text/html", body: '<section role="dialog"><div data-testid="tweetTextarea_0" contenteditable="true"></div><input type="file" accept="image/*"><div id="previews"></div><button data-testid="tweetButton" disabled aria-disabled="true">Simulated submit</button></section>' }));
      await page.goto("https://x.com/declared-fixture");
      await page.evaluate(`(() => {
        window.__submitCount = 0;
        Object.defineProperty(window, 'chrome', { configurable: true, value: { runtime: { id: 'declared-test-extension', sendMessage: message => window.approvedAssetTransport(message) } } });
        document.querySelector('button').onclick = () => window.__submitCount++;
        document.querySelector('input').onchange = () => {
          document.querySelector('#previews').innerHTML = '<img data-testid="mediaPreview" alt="Simulated accepted image"><button aria-label="Remove media">Remove</button>';
          const button = document.querySelector('[data-testid="tweetButton"]');
          button.disabled = false; button.setAttribute('aria-disabled', 'false');
        };
      })()`);
      await page.addScriptTag({ path: "extension/execution.js" });
      await page.addScriptTag({ path: "extension/composer.js" });
      const unavailable = await page.evaluate(async approvedExecution => {
        const runtime = window as typeof window & { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } }; OpenPresenceExecution: { assetsForExecution(execution: unknown): Promise<unknown> } };
        const original = runtime.chrome.runtime.sendMessage;
        runtime.chrome.runtime.sendMessage = async () => ({ ok: false });
        try { await runtime.OpenPresenceExecution.assetsForExecution(approvedExecution); return undefined; }
        catch (error) { return { code: (error as Error & { code?: string }).code, message: (error as Error).message }; }
        finally { runtime.chrome.runtime.sendMessage = original; }
      }, claimed.executions[0]! as unknown);
      expect(unavailable).toMatchObject({ code: "BROWSER_CONNECTOR_UNAVAILABLE", message: expect.stringContaining("Reload the OpenPresence extension") });
      const result = await page.evaluate(async (approvedExecution) => {
        const runtime = window as typeof window & { OpenPresenceExecution: { protocolVersion: number; assetsForExecution(execution: unknown): Promise<Array<{ file: File }>> }; OpenPresenceComposer: { attachFiles(input: { composer: Element; files: File[] }): Promise<boolean> }; __submitCount: number };
        const assets = await runtime.OpenPresenceExecution.assetsForExecution(approvedExecution);
        const attached = await runtime.OpenPresenceComposer.attachFiles({ composer: document.querySelector('[contenteditable="true"]')!, files: assets.map(item => item.file) });
        const files = Array.from(document.querySelector('input')!.files!);
        return { protocol: runtime.OpenPresenceExecution.protocolVersion, attached, fileBytes: Array.from(new Uint8Array(await files[0]!.arrayBuffer())), count: files.length, submitCount: runtime.__submitCount };
      }, claimed.executions[0]! as unknown);
      expect(result).toMatchObject({ protocol: 2, attached: true, count: 1, submitCount: 0 });
      expect(crypto.createHash("sha256").update(Buffer.from(result.fileBytes)).digest("hex")).toBe(storage.exactHash);
      expect(requests).toEqual([{ type: "OPENPRESENCE_FETCH_ASSET", assetId, executionId: execution.id }]);
      expect(readState().executions).toHaveLength(1);
      expect(readState().socialIntents).toHaveLength(1);
      expect(readState().outcomes).toHaveLength(0);
      expect(readState().assets[0]!.metadataReview!.status).toBe("open");
    } finally { await browser.close(); }
  }, 30_000);
});
