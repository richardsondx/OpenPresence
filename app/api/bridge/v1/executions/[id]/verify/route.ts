import { NextResponse } from "next/server";
import { bridgeFromRequest, verifyChromeExecution, verifyInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    const { id } = await context.params;
    const result = await verifyChromeExecution(bridge, id, verifyInput.parse(await request.json()));
    return NextResponse.json({ execution: result.execution, verified: result.verified });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "X delivery verification failed." }, { status: 400 });
  }
}
