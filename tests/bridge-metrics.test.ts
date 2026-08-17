import { describe, expect, it } from "vitest";
import { createBridgeWithKey, reportMetrics } from "../lib/bridge";
import { createAgent } from "../lib/runtime";
import { writeState } from "../lib/db";
import type { MirrorObject } from "../lib/types";

describe("Bridge Growth metrics", () => {
  it("persists audience and publication evidence reported by a connected Bridge", () => {
    const source = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = source.presence!.id;
    const created = createBridgeWithKey(source, { type: "createBridge", input: { presenceId, name: "Genny Chrome", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: ["followers", "public_metrics"] } } });
    const bridge = created.bridge!;
    const mirror: MirrorObject = { id: "mirror-growth-1", bridgeId: bridge.id, presenceId, channelId: "x", externalRef: { type: "x.post", id: "post-growth-1" }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: "A useful observation." }, occurredAt: "2026-08-17T00:00:00.000Z", observedAt: "2026-08-17T00:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", trust: "untrusted_world_content" };
    writeState({ ...created.state, mirrorObjects: [mirror] });

    const next = reportMetrics(bridge, {
      audience: { followers: 1_234, following: 321, observedAt: "2026-08-17T01:00:00.000Z" },
      publications: [{ externalRef: mirror.externalRef, publicationAgeSeconds: 3_600, metrics: { impressions: 4_567, likes: 89 } }],
    });

    expect(next.audienceSnapshots[0]).toMatchObject({ presenceId, followers: 1_234, following: 321, source: "bridge", observationStatus: "observed" });
    expect(next.publicationMetricSnapshots[0]).toMatchObject({ presenceId, mirrorObjectId: mirror.id, impressions: 4_567, likes: 89, source: "bridge", observationStatus: "observed" });

    const repeated = reportMetrics(bridge, {
      audience: { followers: 1_234, following: 321, observedAt: "2026-08-17T01:00:20.000Z" },
      publications: [],
    });
    expect(repeated.audienceSnapshots).toHaveLength(1);
  });
});
