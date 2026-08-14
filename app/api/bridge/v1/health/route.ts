import { NextResponse } from "next/server";
import { bridgeFromRequest } from "@/lib/bridge";
import { bridgeAdapterStatus } from "@/lib/bridge-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
  return NextResponse.json({ bridge: { id: bridge.id, state: bridge.state, adapterStatus: bridgeAdapterStatus(bridge), lastHeartbeatAt: bridge.lastHeartbeatAt, lastSeenAt: bridge.lastSeenAt, lastSyncAt: bridge.lastSyncAt, coverage: bridge.coverage, capabilities: bridge.capabilities } });
}
