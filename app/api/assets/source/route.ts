import { NextResponse } from "next/server";
import { z } from "zod";
import { readStateForContext, WorkspaceConflictError, writeState } from "@/lib/db";
import { applyAssetLibraryOperation } from "@/lib/asset-library";
import { scanAssetSourceNow, startAssetSourceWatcher } from "@/lib/asset-library-worker";
import { assertRuntimeScope, createRuntimeScope } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connectAssetSource"), location: z.string().trim().min(1).max(2000), analysisPolicy: z.enum(["index-only", "analyze-new", "analyze-existing-and-new"]) }),
  z.object({ type: z.literal("rescanAssetSource"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("pauseAssetSource"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("resumeAssetSource"), sourceId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  try {
    const parsed = requestSchema.parse(await request.json());
    const state = readStateForContext(token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
    const next = applyAssetLibraryOperation(state, parsed);
    writeState(next);
    if (parsed.type === "connectAssetSource") {
      const source = next.librarySources[0];
      if (!source) throw new Error("The Asset Source could not be created.");
      startAssetSourceWatcher(scope.agentId, source.id, source.location);
      const result = await scanAssetSourceNow(scope.agentId, source.id);
      return NextResponse.json({ sourceId: source.id, ...result });
    }
    const source = next.librarySources.find((item) => item.id === parsed.sourceId);
    if (!source) throw new Error("That Asset Source does not belong to the active Agent.");
    if (parsed.type === "rescanAssetSource" || parsed.type === "resumeAssetSource") {
      startAssetSourceWatcher(scope.agentId, source.id, source.location);
      const result = await scanAssetSourceNow(scope.agentId, source.id);
      return NextResponse.json({ sourceId: source.id, ...result });
    }
    return NextResponse.json({ sourceId: source.id, status: source.status });
  } catch (error) {
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: "The Asset Source changed while this operation was being stored. Retry." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Asset Source operation failed." }, { status: 400 });
  }
}
