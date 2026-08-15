import { NextResponse } from "next/server";
import { materializeCandidate } from "@/lib/asset-discovery";
import { readState, WorkspaceConflictError, writeState } from "@/lib/db";
import { stateForContext } from "@/lib/runtime";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { candidate?: Parameters<typeof materializeCandidate>[0]; presenceId?: string; sessionId?: string };
  if (!body.candidate?.mediaUrl) return NextResponse.json({ error: "A candidate with a media URL is required." }, { status: 400 });
  const state = stateForContext(readState(), {
    agentId: request.headers.get("x-openpresence-agent-id"),
    presenceId: request.headers.get("x-openpresence-presence-id"),
  });
  const revision = request.headers.get("x-openpresence-workspace-revision");
  if (revision && /^\d+$/.test(revision)) state.workspaceRevision = Number(revision);
  if (!state.agent?.id) return NextResponse.json({ error: "Create an Agent before storing an asset." }, { status: 409 });
  try {
    const presenceId = body.presenceId ?? state.presence?.id;
    if (presenceId && !state.presences.some((presence) => presence.id === presenceId)) throw new Error("That Presence does not belong to the requested Agent workspace.");
    const session = body.sessionId ? state.playgroundSessions.find((item) => item.id === body.sessionId) : undefined;
    if (body.sessionId && !session) throw new Error("That Playground session does not belong to the requested Agent workspace.");
    if (session && presenceId && session.presenceId !== presenceId) throw new Error("The asset and Playground session do not share the same durable scope.");
    const result = await materializeCandidate(body.candidate, { agentId: state.agent.id, presenceId, sessionId: body.sessionId, environment: "sandbox" });
    const next = { ...state, assets: [result.asset, ...state.assets], sourceEvidence: result.sourceEvidence ? [result.sourceEvidence, ...state.sourceEvidence] : state.sourceEvidence };
    writeState(next);
    return NextResponse.json({ asset: result.asset, sourceEvidence: result.sourceEvidence });
  } catch (error) {
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message, conflict: true, state: stateForContext(readState(), { agentId: request.headers.get("x-openpresence-agent-id"), presenceId: request.headers.get("x-openpresence-presence-id") }) }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset fetch failed." }, { status: 422 });
  }
}
