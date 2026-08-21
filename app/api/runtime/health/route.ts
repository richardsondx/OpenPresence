import { NextResponse } from "next/server";
import { recordProcessHeartbeat } from "@/lib/db";
import { recordOperationalSuccess } from "@/lib/incident-engine";
import { readOperationalHealth } from "@/lib/operational-context";
import { runOperationalSweep } from "@/lib/temporal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
  const sweep = runOperationalSweep();
  recordProcessHeartbeat("runtime", "runtime", { staleRuns: sweep.staleRunsDetected.length, dispatchedWakes: sweep.dispatchedWakes.length });
  const before = readOperationalHealth(presenceId);
  // Older builds incorrectly recorded optimistic-concurrency conflicts as a
  // native X outage. Migrate only that exact false-positive incident; genuine
  // connector failures must continue through the normal recovery ladder.
  if (before.incidents.some((incident) => incident.rootCauseKey === "native_x.transient_error" && incident.safeSummary.includes("workspace changed in another tab or worker"))) {
    recordOperationalSuccess("native_x", presenceId);
  }
  return NextResponse.json({ ...readOperationalHealth(presenceId), scheduler: sweep });
}
