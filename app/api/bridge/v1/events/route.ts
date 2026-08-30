import { NextResponse } from "next/server";
import { bridgeFromRequest, eventsInput, ingestEvents } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    ingestEvents(bridge, eventsInput.parse(await request.json()));
    return NextResponse.json({ ok: true });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Events could not be ingested." }, { status: 400 }); }
}
