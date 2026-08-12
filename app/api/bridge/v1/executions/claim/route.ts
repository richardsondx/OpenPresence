import { NextResponse } from "next/server";
import { bridgeFromRequest, claimExecutions, claimInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 }); const result = claimExecutions(bridge, claimInput.parse(await request.json())); return NextResponse.json({ executions: result.executions }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Executions could not be claimed." }, { status: 400 }); }
}
