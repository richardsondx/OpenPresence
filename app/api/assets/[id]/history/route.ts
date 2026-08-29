import { NextResponse } from "next/server";
import { readStateForContext } from "@/lib/db";
import { assetHistory } from "@/lib/asset-library";
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
    const history = assetHistory(state, id, scope.presenceId);
    return history ? NextResponse.json(history) : NextResponse.json({ error: "Asset history not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset history could not be read." }, { status: 403 });
  }
}
