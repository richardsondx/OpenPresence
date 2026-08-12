import { NextResponse } from "next/server";
import { bridgeFromRequest, failExecution, failInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const bridge = bridgeFromRequest(request); if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 }); const { id } = await context.params; const result = failExecution(bridge, id, failInput.parse(await request.json())); return NextResponse.json({ execution: result.execution }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Execution failure could not be recorded." }, { status: 400 }); }
}
