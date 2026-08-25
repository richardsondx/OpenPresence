import { NextResponse } from "next/server";
import { bridgeFromRequest, closeChromeVerification, closeVerificationInput } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    const { id } = await context.params;
    const result = closeChromeVerification(bridge, id, closeVerificationInput.parse(await request.json()));
    return NextResponse.json({ execution: result.execution, closed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "X delivery verification could not be closed." }, { status: 400 });
  }
}
