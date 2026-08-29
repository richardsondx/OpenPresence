import { NextResponse } from "next/server";
import { readStateForContext } from "@/lib/db";
import { readEligibleAsset } from "@/lib/asset-library";
import { assertRuntimeScope, createRuntimeScope } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  try {
    const state = readStateForContext(token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
    const { id } = await context.params;
    const asset = readEligibleAsset(state, id, scope.presenceId);
    return asset ? NextResponse.json(asset) : NextResponse.json({ error: "Asset not found in the active Agent/Presence scope." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset metadata could not be read." }, { status: 403 });
  }
}
