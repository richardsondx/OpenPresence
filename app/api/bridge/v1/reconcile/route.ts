import { NextResponse } from "next/server";
import { bridgeFromRequest, reconcileBridge, reconcileInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 }); return NextResponse.json({ ok: true, state: reconcileBridge(bridge, reconcileInput.parse(await request.json())) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Mirror reconciliation failed." }, { status: 400 }); }
}
