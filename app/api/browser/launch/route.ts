import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrowserBody, readState } from "@/lib/db";
import { stateForContext } from "@/lib/runtime";
import { launchPresenceChrome } from "@/lib/presence-browser-launcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const input = z.object({ presenceId: z.string().trim().min(1).max(160) });

export async function POST(request: Request) {
  try {
    const parsed = input.parse(await request.json());
    const url = new URL(request.url);
    const agentId = request.headers.get("x-openpresence-agent-id")?.trim() || url.searchParams.get("agentId") || undefined;
    const state = stateForContext(readState(), {
      agentId,
      presenceId: request.headers.get("x-openpresence-presence-id")?.trim() || parsed.presenceId,
    });
    const presence = state.presences.find((candidate) => candidate.id === parsed.presenceId);
    if (!presence || state.presence?.id !== presence.id) return NextResponse.json({ error: "Select this Presence before opening its dedicated browser." }, { status: 409 });
    if (!presence.browserAccess?.enabled) return NextResponse.json({ error: "Enable Chrome hands for this Presence first." }, { status: 403 });

    const result = launchPresenceChrome({
      presenceId: presence.id,
      expectedIdentity: presence.handle,
      agentId: state.agent?.id,
      baseUrl: url.origin,
    });
    return NextResponse.json({ ok: true, result, browserBody: getBrowserBody(presence.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The dedicated Chrome browser could not be opened." }, { status: 400 });
  }
}
