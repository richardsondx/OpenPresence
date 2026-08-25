import { NextResponse } from "next/server";
import { bridgeFromRequest } from "@/lib/bridge";
import { bridgeAdapterStatus, bridgeExecutionStatus } from "@/lib/bridge-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
  return NextResponse.json({ bridge: { id: bridge.id, state: bridge.state, adapterStatus: bridgeAdapterStatus(bridge), executionStatus: bridgeExecutionStatus(bridge), identityStatus: bridge.accountIdentity?.status ?? "unknown", executionBlocker: bridge.accountIdentity?.message ?? (bridge.accountIdentity?.status === "verified" ? undefined : "The controlled browser heartbeat is live, but its signed-in account has not been verified for this Presence."), accountIdentity: bridge.accountIdentity, lastHeartbeatAt: bridge.lastHeartbeatAt, lastSeenAt: bridge.lastSeenAt, lastSyncAt: bridge.lastSyncAt, coverage: bridge.coverage, capabilities: bridge.capabilities } });
}
