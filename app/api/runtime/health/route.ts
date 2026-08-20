import { NextResponse } from "next/server";
import { recordProcessHeartbeat } from "@/lib/db";
import { readOperationalHealth } from "@/lib/operational-context";
import { runOperationalSweep } from "@/lib/temporal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
  const sweep = runOperationalSweep();
  recordProcessHeartbeat("runtime", "runtime", { staleRuns: sweep.staleRunsDetected.length, dispatchedWakes: sweep.dispatchedWakes.length });
  return NextResponse.json({ ...readOperationalHealth(presenceId), scheduler: sweep });
}
