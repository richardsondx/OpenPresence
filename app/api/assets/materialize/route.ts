import { NextResponse } from "next/server";
import { materializeCandidate } from "@/lib/asset-discovery";
import { readStateForContext, WorkspaceConflictError, writeState } from "@/lib/db";
import { assertRuntimeScope, createRuntimeScope, stateForContext } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function POST(request: Request) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { candidate?: Parameters<typeof materializeCandidate>[0]; sessionId?: string };
  if (!body.candidate?.mediaUrl) return NextResponse.json({ error: "A candidate with a media URL is required." }, { status: 400 });
  const stored = readStateForContext(token);
  const state = stateForContext(stored, token);
  if (!state.agent?.id) return NextResponse.json({ error: "Create an Agent before storing an asset." }, { status: 409 });
  try {
    const scope = createRuntimeScope(state, { presenceId: token.presenceId, sessionId: body.sessionId });
    assertRuntimeScope(state, scope);
    const result = await materializeCandidate(body.candidate, { agentId: scope.agentId, presenceId: scope.presenceId, sessionId: scope.playgroundSessionId, environment: "sandbox" });
    const next = { ...state, assets: [result.asset, ...state.assets], sourceEvidence: result.sourceEvidence ? [result.sourceEvidence, ...state.sourceEvidence] : state.sourceEvidence };
    writeState(next);
    return NextResponse.json({ asset: result.asset, sourceEvidence: result.sourceEvidence });
  } catch (error) {
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message, conflict: true, state: stateForContext(readStateForContext(token), token) }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset fetch failed." }, { status: 422 });
  }
}
