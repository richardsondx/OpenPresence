import { NextResponse } from "next/server";
import { readStateForContext } from "@/lib/db";
import { authorizeAssetSelection } from "@/lib/asset-library";
import { assertRuntimeScope, createRuntimeScope } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  try {
    const state = readStateForContext(token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { collectionId?: unknown };
    const collectionId = typeof body.collectionId === "string" ? body.collectionId : undefined;
    authorizeAssetSelection(state, [id], { presenceId: scope.presenceId, collectionId, requireReady: true });
    return NextResponse.json({ assetId: id, selected: true, agentId: scope.agentId, presenceId: scope.presenceId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset selection was rejected." }, { status: 403 });
  }
}
