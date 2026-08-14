import { NextResponse } from "next/server";
import { bridgeFromRequest, heartbeatBridge, heartbeatInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    const input = heartbeatInput.parse(await request.json());
    const result = heartbeatBridge(bridge, input.executorId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bridge heartbeat failed." }, { status: 400 });
  }
}
