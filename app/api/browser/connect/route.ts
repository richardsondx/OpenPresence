import { NextResponse } from "next/server";
import { z } from "zod";
import { createBridgeWithKey } from "@/lib/bridge";
import { chromeBrowserBridgeCapabilities } from "@/lib/bridge-contract";
import { getBrowserBody, issueBridgeExecutorKey, readState, upsertBrowserBody, writeState } from "@/lib/db";
import { stateForContext } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const input = z.object({ presenceId: z.string().min(1), executorId: z.string().trim().min(1).max(160) });
const channelDomains: Record<string, string> = {
  x: "https://x.com/home",
  linkedin: "https://www.linkedin.com/feed/",
  substack: "https://substack.com/home",
};

export async function POST(request: Request) {
  try {
    const parsed = input.parse(await request.json());
    const url = new URL(request.url);
    const state = stateForContext(readState(), {
      agentId: request.headers.get("x-openpresence-agent-id") ?? url.searchParams.get("agentId"),
      presenceId: request.headers.get("x-openpresence-presence-id") ?? parsed.presenceId,
    });
    const presence = state.presences.find((item) => item.id === parsed.presenceId);
    if (!presence || state.presence?.id !== presence.id) return NextResponse.json({ error: "Select this Presence in OpenPresence before opening Chrome." }, { status: 409 });
    if (!presence.browserAccess?.enabled) return NextResponse.json({ error: "Chrome hands are disabled for this Presence." }, { status: 403 });

    const capabilities = chromeBrowserBridgeCapabilities();
    const existing = state.bridges.find((bridge) => bridge.presenceId === presence.id && bridge.kind === "bridge" && bridge.state !== "offline");
    const result = existing
      ? { state, key: issueBridgeExecutorKey(existing.id, parsed.executorId) }
      : createBridgeWithKey(state, { type: "createBridge", input: { presenceId: presence.id, name: `OpenPresence Chrome · ${presence.name}`, kind: "bridge", capabilities } });
    if (existing) {
      const renewed = result.state.bridges.find((bridge) => bridge.id === existing.id);
      if (renewed) {
        renewed.capabilities = capabilities;
        renewed.state = "online";
        renewed.adapterStatus = "waiting";
        renewed.credentialRevokedAt = undefined;
        writeState(result.state);
      }
    }
    if (!result.key || !result.state.bridges.some((bridge) => bridge.presenceId === presence.id)) return NextResponse.json({ error: "The Chrome bridge could not be prepared." }, { status: 500 });
    const browserBody = getBrowserBody(presence.id);
    if (browserBody?.mode === "managed") {
      browserBody.state = "healthy";
      browserBody.lastHealthyAt = new Date().toISOString();
      browserBody.updatedAt = new Date().toISOString();
      upsertBrowserBody(browserBody);
    }
    return NextResponse.json({
      version: 1,
      executorId: parsed.executorId,
      bridgeId: result.state.bridges.find((bridge) => bridge.presenceId === presence.id && bridge.kind === "bridge")?.id,
      bridgeKey: result.key,
      presence: { id: presence.id, name: presence.name, handle: presence.handle, channel: presence.channel, accent: presence.accent, domain: channelDomains[presence.channel] ?? undefined },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chrome bridge could not be prepared." }, { status: 400 });
  }
}
