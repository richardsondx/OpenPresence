import { NextResponse } from "next/server";
import { recordProcessHeartbeat } from "@/lib/db";
import { readOperationalHealth } from "@/lib/operational-context";
import { runOperationalSweep } from "@/lib/temporal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
    const sweep = runOperationalSweep();
    recordProcessHeartbeat("runtime", "runtime", { staleRuns: sweep.staleRunsDetected.length, dispatchedWakes: sweep.dispatchedWakes.length });
    return NextResponse.json({ ok: true, ...readOperationalHealth(presenceId), scheduler: sweep });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Runtime health probe failed" }, { status: 503 });
  }
}
