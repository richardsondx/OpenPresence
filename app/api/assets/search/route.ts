import { NextResponse } from "next/server";
import { readStateForContext } from "@/lib/db";
import { searchEligibleAssets } from "@/lib/asset-library";
import { assertRuntimeScope, createRuntimeScope } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function GET(request: Request) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  try {
    const state = readStateForContext(token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
    const url = new URL(request.url);
    const collectionId = url.searchParams.get("collectionId") || undefined;
    return NextResponse.json({ results: searchEligibleAssets(state, url.searchParams.get("q") ?? "", { presenceId: scope.presenceId, collectionId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Asset Library could not be searched." }, { status: 403 });
  }
}
