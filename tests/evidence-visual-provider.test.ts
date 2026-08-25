import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceVisualAssetDiscoveryProvider } from "@/lib/asset-discovery";

describe("EvidenceVisual asset discovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps source-linked local chart records into inspectable candidates", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      results: [{
        id: "asset_fred_unrate",
        title: "Unemployment Rate",
        publisher: "Federal Reserve Bank of St. Louis · FRED",
        sourceUrl: "https://fred.stlouisfed.org/series/UNRATE",
        visualUrl: "https://fred.stlouisfed.org/series/UNRATE",
        sourceAssetUrl: "https://fred.stlouisfed.org/series/UNRATE",
        description: "Native FRED chart with machine-readable observations.",
        type: "Chart",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await new EvidenceVisualAssetDiscoveryProvider("http://127.0.0.1:8787").searchAssets({ query: "unemployment rate", limit: 3 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "evidence_asset_fred_unrate",
      provider: "evidence-visual",
      semanticKind: "chart",
      sourcePageUrl: "https://fred.stlouisfed.org/series/UNRATE",
      mediaUrl: "http://127.0.0.1:8787/v1/assets/asset_fred_unrate/content",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/v1/search", expect.objectContaining({ method: "POST" }));
  });
});
