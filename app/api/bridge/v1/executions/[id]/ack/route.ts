import { NextResponse } from "next/server";
import { acknowledgeExecution, ackInput, bridgeFromRequest } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 }); const { id } = await context.params; const result = acknowledgeExecution(bridge, id, ackInput.parse(await request.json())); return NextResponse.json({ execution: result.execution }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Execution acknowledgement failed." }, { status: 400 }); }
}
