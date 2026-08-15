import { describe, expect, it, vi } from "vitest";
import { normalizeAssetCandidates, materializeCandidate, TavilyAssetDiscoveryProvider } from "@/lib/asset-discovery";
import { fetchPublicAsset, putAssetBytes, readAssetBytes } from "@/lib/asset-store";
import { duplicateContext, epistemicState, usageFor } from "@/lib/asset-intelligence";
import type { Asset, AssetUsage } from "@/lib/types";

describe("Asset Intelligence Runtime", () => {
  it("round-trips immutable local bytes with exact and visual identity", async () => {
    const stored = await putAssetBytes(Buffer.from("asset-ledger-test"), { mimeType: "image/png" });
    expect(stored.exactHash).toHaveLength(64);
    expect(stored.storeKey).toContain(stored.exactHash);
    expect(await readAssetBytes(stored.storeKey)).toEqual(Buffer.from("asset-ledger-test"));
  });

  it("normalizes provider candidates without making provider relevance a trust decision", () => {
    const candidates = normalizeAssetCandidates("rates chart", "test-provider", [{ url: "https://example.com/source", image_url: "https://cdn.example.com/chart.png", title: "Rates chart", score: 0.91 }]);
    expect(candidates[0]).toMatchObject({ provider: "test-provider", mediaUrl: "https://cdn.example.com/chart.png", sourcePageUrl: "https://example.com/source", relevance: 0.91, searchMetadataSemanticHint: "chart" });
    expect(candidates[0]?.semanticKind).toBeUndefined();
  });

  it("marks search thumbnails as leads instead of publication media", () => {
    const candidates = normalizeAssetCandidates("macro chart", "tavily", [{ url: "https://example.com/story", image_url: "https://ts2.mm.bing.net/th?id=thumbnail", title: "Macro chart" }]);
    expect(candidates[0]).toMatchObject({ isThumbnail: true, searchMetadataSemanticHint: "chart" });
    expect(candidates[0]?.semanticKind).toBeUndefined();
  });

  it("keeps page URLs separate from direct-image URLs so source pages can yield original figures", () => {
    const pageOnly = normalizeAssetCandidates("macro chart", "tavily", [{ url: "https://publisher.example/report", title: "Macro report" }]);
    const directImage = normalizeAssetCandidates("macro chart", "tavily", [{ url: "https://cdn.example/chart.png", title: "Macro chart" }]);
    expect(pageOnly[0]).toMatchObject({ sourcePageUrl: "https://publisher.example/report" });
    expect(pageOnly[0]?.mediaUrl).toBeUndefined();
    expect(directImage[0]).toMatchObject({ mediaUrl: "https://cdn.example/chart.png" });
    expect(directImage[0]?.sourcePageUrl).toBeUndefined();
  });

  it("uses Tavily only as a normalized discovery adapter", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(request.include_images).toBe(true);
      expect(request.include_image_descriptions).toBe(true);
      return new Response(JSON.stringify({ images: [{ url: "https://cdn.example/chart.png", description: "A chart" }], results: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      const candidates = await new TavilyAssetDiscoveryProvider("test-key").searchAssets({ query: "inflation chart", limit: 3 });
      expect(candidates[0]).toMatchObject({ provider: "tavily", mediaUrl: "https://cdn.example/chart.png" });
    } finally { globalThis.fetch = original; }
  });

  it("fails with a bounded timeout when Tavily does not respond", async () => {
    vi.useFakeTimers();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")), { once: true });
    })) as typeof fetch;
    try {
      const pending = expect(new TavilyAssetDiscoveryProvider("test-key").searchAssets({ query: "slow chart", limit: 1 })).rejects.toThrow("timed out after 25 seconds");
      await vi.advanceTimersByTimeAsync(25_000);
      await pending;
    } finally {
      globalThis.fetch = original;
      vi.useRealTimers();
    }
  });

  it("extracts original page figures when Tavily returns a page result without an image URL", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).includes("api.tavily.com")) return new Response(JSON.stringify({ results: [{ url: "https://publisher.example/report", title: "Official report" }], images: [] }), { status: 200 });
      void init;
      return new Response('<html><body><figure><img src="https://cdn.publisher.example/report-chart.png" /><figcaption>Official chart</figcaption></figure></body></html>', { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    try {
      const candidates = await new TavilyAssetDiscoveryProvider("test-key").searchAssets({ query: "macro chart", limit: 3 });
      expect(candidates[0]).toMatchObject({ mediaUrl: "https://cdn.publisher.example/report-chart.png", sourcePageUrl: "https://publisher.example/report" });
    } finally { globalThis.fetch = original; }
  });

  it("decodes HTML image URLs and skips page chrome before materialization", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("api.tavily.com")) return new Response(JSON.stringify({ results: [{ url: "https://publisher.example/report", title: "Official report" }], images: [] }), { status: 200 });
      return new Response('<html><body><img src="https://cdn.publisher.example/icon-us-flag.svg" /><figure><img src="https://cdn.publisher.example/report-chart.png?h=2016&amp;w=3217" alt="Official chart" /><figcaption>Official chart</figcaption></figure></body></html>', { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    try {
      const candidates = await new TavilyAssetDiscoveryProvider("test-key").searchAssets({ query: "macro chart", limit: 3 });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ mediaUrl: "https://cdn.publisher.example/report-chart.png?h=2016&w=3217", title: "Official chart" });
    } finally { globalThis.fetch = original; }
  });

  it("persists fetched media and provenance without asserting factual grounding", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(Buffer.from("remote-image"), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;
    try {
      const result = await materializeCandidate({ id: "candidate", query: "topic", name: "Source chart", mediaUrl: "https://cdn.example.com/chart.png", sourcePageUrl: "https://publisher.example/chart", publisher: "Publisher", provider: "test" }, { agentId: "agent", presenceId: "presence", environment: "sandbox" });
      expect(result.asset.storage?.exactHash).toHaveLength(64);
      expect(result.asset.provenance.origin).toBe("discovered");
      expect(result.asset.provenance.sourceIdentityStatus).toBe("unknown");
      expect(result.sourceEvidence?.assetIds).toContain(result.asset.id);
      expect(result.asset.rights?.status).toBe("unknown");
    } finally { globalThis.fetch = original; }
  });

  it("rejects a redirect into a private network destination", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/internal" } })) as typeof fetch;
    try { await expect(fetchPublicAsset("https://public.example/image.png")).rejects.toThrow("private"); }
    finally { globalThis.fetch = original; }
  });

  it("keeps intentional fiction distinct from unsupported factual evidence", () => {
    expect(epistemicState("satire")).toEqual({ expressionMode: "satire", groundingStatus: "not_required", factuality: "intentionally_fictional" });
    expect(epistemicState("factual", "unsupported")).toEqual({ expressionMode: "factual", groundingStatus: "unsupported", factuality: "intended_factual" });
  });

  it("returns bounded usage history for deliberate reuse decisions", () => {
    const usages: AssetUsage[] = [
      { id: "u1", assetId: "a1", agentId: "agent", presenceId: "p1", publicationId: "pub1", channelId: "x", environment: "sandbox", usageType: "new", publishedAt: "2026-08-14T10:00:00.000Z" },
      { id: "u2", assetId: "a1", agentId: "agent", presenceId: "p1", publicationId: "pub2", channelId: "x", environment: "sandbox", usageType: "repurpose", reuseReason: "new_data", publishedAt: "2026-08-14T11:00:00.000Z" },
    ];
    const asset = { id: "a1", presenceId: "p1" } as Asset;
    expect(usageFor(usages, "a1")).toHaveLength(2);
    expect(duplicateContext(asset, usages)).toMatchObject({ exactUseCount: 2, samePresence: true, lastUsedAt: "2026-08-14T11:00:00.000Z" });
  });
});
