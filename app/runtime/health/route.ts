import { NextResponse } from "next/server";
import { readStateReadToken } from "@/lib/db";
import { readOperationalHealth } from "@/lib/operational-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
    const cacheControl = "no-store";
    const earlyEtag = `"runtime-health:${readStateReadToken()}:${presenceId ?? ""}"`;
    if (request.headers.get("if-none-match") === earlyEtag) {
      return new Response(null, { status: 304, headers: { ETag: earlyEtag, "Cache-Control": cacheControl } });
    }
    const health = readOperationalHealth(presenceId);
    const etag = `"runtime-health:${readStateReadToken()}:${presenceId ?? ""}"`;
    return NextResponse.json({ ok: true, ...health, scheduler: { mode: "background" } }, { headers: { ETag: etag, "Cache-Control": cacheControl } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Runtime health probe failed" }, { status: 503 });
  }
}
