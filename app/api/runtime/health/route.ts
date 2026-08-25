import { NextResponse } from "next/server";
import { recordOperationalSuccess } from "@/lib/incident-engine";
import { readOperationalHealth } from "@/lib/operational-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const presenceId = new URL(request.url).searchParams.get("presenceId") ?? undefined;
  const before = readOperationalHealth(presenceId);
  // Older builds incorrectly recorded optimistic-concurrency conflicts as a
  // native X outage. Migrate only that exact false-positive incident; genuine
  // connector failures must continue through the normal recovery ladder.
  if (before.incidents.some((incident) => incident.rootCauseKey === "native_x.transient_error" && incident.safeSummary.includes("workspace changed in another tab or worker"))) {
    recordOperationalSuccess("native_x", presenceId);
  }
  return NextResponse.json({ ...readOperationalHealth(presenceId), scheduler: { mode: "background" } }, { headers: { "Cache-Control": "no-store" } });
}
