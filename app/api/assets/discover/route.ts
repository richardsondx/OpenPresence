import { NextResponse } from "next/server";
import { EvidenceVisualAssetDiscoveryProvider, TavilyAssetDiscoveryProvider } from "@/lib/asset-discovery";
import { readProviderSecret, readStateForContext } from "@/lib/db";
import { assertRuntimeScope, createRuntimeScope } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function POST(request: Request) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { query?: string; semanticKind?: "chart" | "photo" | "illustration" | "meme" | "diagram" | "clip" | "generated" | "other"; limit?: number };
  if (!body.query?.trim()) return NextResponse.json({ error: "A discovery query is required." }, { status: 400 });
  try {
    const state = readStateForContext(token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
    const evidenceConnection = state.assetProviderConnections.find((item) => item.provider === "evidence-visual" && item.status === "available");
    const tavilyConnection = state.assetProviderConnections.find((item) => item.provider === "tavily" && item.status === "available");
    if (evidenceConnection || process.env.EVIDENCE_VISUAL_URL || process.env.NODE_ENV !== "test") {
      const candidates = await new EvidenceVisualAssetDiscoveryProvider(evidenceConnection?.endpoint || process.env.EVIDENCE_VISUAL_URL).searchAssets({ query: body.query.trim(), semanticKind: body.semanticKind, limit: body.limit });
      return NextResponse.json({ provider: "evidence-visual", candidates });
    }
    if (!tavilyConnection) return NextResponse.json({ error: "Connect EvidenceVisual or Tavily in Manage Agent → Provider access before discovering assets." }, { status: 503 });
    const secret = readProviderSecret(tavilyConnection.id);
    const candidates = await new TavilyAssetDiscoveryProvider(secret).searchAssets({ query: body.query.trim(), semanticKind: body.semanticKind, limit: body.limit });
    return NextResponse.json({ provider: "tavily", candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset discovery failed." }, { status: 503 });
  }
}
