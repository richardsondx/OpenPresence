import { NextResponse } from "next/server";
import { readBridgeHealthForPresence } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const presenceId = new URL(request.url).searchParams.get("presenceId")?.trim();
  if (!presenceId) return NextResponse.json({ error: "A Presence is required." }, { status: 400 });
  return NextResponse.json({ bridges: readBridgeHealthForPresence(presenceId) }, { headers: { "Cache-Control": "no-store" } });
}
