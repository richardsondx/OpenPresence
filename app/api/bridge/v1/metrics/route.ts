import { NextResponse } from "next/server";
import { bridgeFromRequest, metricsInput, reportMetrics } from "@/lib/bridge";

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    return NextResponse.json({ ok: true, state: reportMetrics(bridge, metricsInput.parse(await request.json())) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bridge metrics report failed." }, { status: 400 });
  }
}
