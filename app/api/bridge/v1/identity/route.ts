import { NextResponse } from "next/server";
import { bridgeFromRequest, identityInput, reportBridgeIdentity } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    return NextResponse.json(reportBridgeIdentity(bridge, identityInput.parse(await request.json())));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bridge identity could not be recorded." }, { status: 400 });
  }
}
