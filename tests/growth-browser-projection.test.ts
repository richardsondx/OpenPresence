import { describe, expect, it } from "vitest";
import { GET as stateGet } from "../app/api/state/route";
import { derivePublicHistory, createAgent } from "../lib/runtime";
import { growthBrowserProjection } from "../lib/growth-browser-projection";

describe("Growth browser projection", () => {
  it("compacts Growth history without losing public-activity truth", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    const observedAt = new Date().toISOString();
    state.assets = Array.from({ length: 50 }, (_, index) => ({ id: `asset-${index}`, title: `Asset ${index}` })) as never;
    state.resourceUsageEvents = Array.from({ length: 50 }, (_, index) => ({ id: `usage-${index}`, createdAt: observedAt, usage: { requests: index } })) as never;
    state.publicationMetricSnapshots = [{
      id: "metric-1", presenceId, mirrorObjectId: "mirror-1", observedAt, publicationAgeSeconds: 60,
      impressions: 12, source: "native", observationStatus: "observed",
      baseline: { comparableCount: 20, confidence: "high", relative: { impressions: 1.4 } },
    }];
    state.mirrorObjects = [{
      id: "mirror-1", bridgeId: "bridge", presenceId, channelId: "x", externalRef: { type: "x.post", id: "post-1" },
      objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: "A useful public update" },
      occurredAt: observedAt, observedAt, visibility: "public", shareability: "public", actorPresenceId: presenceId,
    }] as never;

    const projection = growthBrowserProjection(state, presenceId);
    const history = derivePublicHistory(projection, presenceId, { normalized: true });

    expect(projection.responseProjection).toBe("growth");
    expect(projection.assets).toEqual([]);
    expect(projection.resourceUsageEvents).toEqual([]);
    expect(projection.attentionEpisodes).toEqual([]);
    expect(projection.socialIntents).toEqual([]);
    expect(projection.files).toEqual([]);
    expect(projection.publicationMetricSnapshots[0]?.baseline).toBeUndefined();
    expect(projection.growthBrowserSummary?.publication.count).toBe(1);
    expect(projection.growthBrowserSummary?.publication.totalReach).toBe(12);
    expect(projection.mirrorObjects[0]).toMatchObject({ visibility: "public", actorPresenceId: presenceId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: "mirror-1", kind: "post" });
  });

  it("keeps the canonical Growth response under the browser payload budget", async () => {
    const response = await stateGet(new Request("http://localhost/api/state?projection=growth&agentId=agent_example_2&presenceId=presence_example_19"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("growth");
    expect(body.attentionEpisodes).toEqual([]);
    expect(body.socialIntents).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(1_300_000);
  });
});
