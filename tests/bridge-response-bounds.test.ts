import { describe, expect, it } from "vitest";
import { POST as eventsPost } from "../app/api/bridge/v1/events/route";
import { POST as metricsPost } from "../app/api/bridge/v1/metrics/route";
import { POST as reconcilePost } from "../app/api/bridge/v1/reconcile/route";
import { createBridgeWithKey } from "../lib/bridge";
import { createAgent } from "../lib/runtime";

function bridgeRequest(path: string, key: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createTestBridge() {
  const source = createAgent({ name: "Genny", description: "A test Presence.", audience: "builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
  const created = createBridgeWithKey(source, {
    type: "createBridge",
    input: {
      presenceId: source.presence!.id,
      name: "Genny Chrome",
      kind: "bridge",
      capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: ["followers"] },
    },
  });
  return { key: created.key!, presenceId: source.presence!.id };
}

describe("Bridge acknowledgement responses", () => {
  it("keeps event ingestion responses bounded", async () => {
    const { key } = createTestBridge();
    const response = await eventsPost(bridgeRequest("/api/bridge/v1/events", key, {
      events: [{ sourceEventId: "bounded-event", event: "created", object: { externalRef: { type: "x.post", id: "bounded-post" }, objectType: "post", content: { text: "A bounded response test." }, visibility: "public", shareability: "presence-only" } }],
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text.length).toBeLessThan(100);
  });

  it("keeps reconciliation and metrics responses bounded", async () => {
    const { key } = createTestBridge();
    const reconcileResponse = await reconcilePost(bridgeRequest("/api/bridge/v1/reconcile", key, { objects: [] }));
    const metricsResponse = await metricsPost(bridgeRequest("/api/bridge/v1/metrics", key, { audience: { followers: 10 }, publications: [] }));
    const [reconcileText, metricsText] = await Promise.all([reconcileResponse.text(), metricsResponse.text()]);

    expect(reconcileResponse.status).toBe(200);
    expect(metricsResponse.status).toBe(200);
    expect(JSON.parse(reconcileText)).toEqual({ ok: true });
    expect(JSON.parse(metricsText)).toEqual({ ok: true });
    expect(Math.max(reconcileText.length, metricsText.length)).toBeLessThan(100);
  });
});
