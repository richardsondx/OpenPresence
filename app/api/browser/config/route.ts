import { NextResponse } from "next/server";
import { readBrowserPresenceConfig } from "@/lib/db";
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
  const context = contextFromRequest(request);
  const config = readBrowserPresenceConfig(context);
  const enabled = config.presences.filter((presence) => (presence.browserAccess as { enabled?: boolean } | undefined)?.enabled === true).map((presence) => safePresence(presence as unknown as Presence));
  // Match the previous scoped-state contract: an explicit Presence in the
  // request wins over the workspace's active Presence. Without this, a
  // second Presence can silently receive the wrong browser session config.
  const selectedId = context.presenceId ?? config.activePresenceId;
  const selectedRaw = config.presences.find((presence) => presence.id === selectedId);
  const selected = selectedRaw && (selectedRaw.browserAccess as { enabled?: boolean } | undefined)?.enabled === true ? safePresence(selectedRaw as unknown as Presence) : undefined;
  return NextResponse.json({ version: 1, appOrigin: new URL(request.url).origin, activePresenceId: selectedId, selected, presences: enabled });
}
