import { NextResponse } from "next/server";
import { readState } from "@/lib/db";
import { stateForContext } from "@/lib/runtime";
import type { Presence } from "@/lib/types";

export const dynamic = "force-dynamic";

const channelDomains: Record<string, string> = {
  x: "https://x.com/home",
  linkedin: "https://www.linkedin.com/feed/",
  substack: "https://substack.com/home",
};

function contextFromRequest(request: Request) {
  const url = new URL(request.url);
  return {
    agentId: request.headers.get("x-openpresence-agent-id") ?? url.searchParams.get("agentId"),
    presenceId: request.headers.get("x-openpresence-presence-id") ?? url.searchParams.get("presenceId"),
  };
}

function safePresence(presence: Presence) {
  return {
    id: presence.id,
    name: presence.name,
    handle: presence.handle,
    channel: presence.channel,
    accent: presence.accent,
    environment: presence.environment ?? "live",
    connectionMode: presence.connectionMode ?? (presence.channel === "x" ? "native" : "bridge"),
    browserAccess: { enabled: presence.browserAccess?.enabled === true },
    domain: channelDomains[presence.channel] ?? undefined,
  };
}

export async function GET(request: Request) {
  const state = stateForContext(readState(), contextFromRequest(request));
  const enabled = state.presences.filter((presence) => presence.browserAccess?.enabled === true).map(safePresence);
  const selected = state.presence && state.presence.browserAccess?.enabled === true ? safePresence(state.presence) : undefined;
  return NextResponse.json({ version: 1, appOrigin: new URL(request.url).origin, activePresenceId: state.activePresenceId, selected, presences: enabled });
}
