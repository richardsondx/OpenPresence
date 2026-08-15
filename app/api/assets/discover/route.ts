import { NextResponse } from "next/server";
import { TavilyAssetDiscoveryProvider } from "@/lib/asset-discovery";
import { readProviderSecret, readState } from "@/lib/db";
import { stateForContext } from "@/lib/runtime";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { query?: string; semanticKind?: "chart" | "photo" | "illustration" | "meme" | "diagram" | "clip" | "generated" | "other"; limit?: number };
  if (!body.query?.trim()) return NextResponse.json({ error: "A discovery query is required." }, { status: 400 });
  try {
    const state = stateForContext(readState(), {
      agentId: request.headers.get("x-openpresence-agent-id"),
      presenceId: request.headers.get("x-openpresence-presence-id"),
    });
    const connection = state.assetProviderConnections.find((item) => item.provider === "tavily" && item.status === "available");
    if (!connection) return NextResponse.json({ error: "Connect Tavily in Manage Agent → Provider access before discovering assets." }, { status: 503 });
    const secret = readProviderSecret(connection.id);
    const candidates = await new TavilyAssetDiscoveryProvider(secret).searchAssets({ query: body.query.trim(), semanticKind: body.semanticKind, limit: body.limit });
    return NextResponse.json({ provider: "tavily", candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset discovery failed." }, { status: 503 });
  }
}
