import { NextResponse } from "next/server";
import { bridgeFromRequest, outcomeInput, reportOutcome } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 }); return NextResponse.json({ outcome: reportOutcome(bridge, outcomeInput.parse(await request.json())).outcome }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Outcome could not be recorded." }, { status: 400 }); }
}
