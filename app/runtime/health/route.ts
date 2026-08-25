import { NextResponse } from "next/server";
import { readOperationalHealth } from "@/lib/operational-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
    return NextResponse.json({ ok: true, ...readOperationalHealth(presenceId), scheduler: { mode: "background" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Runtime health probe failed" }, { status: 503 });
  }
}
