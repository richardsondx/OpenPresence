import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recordProcessHeartbeat } from "@/lib/db";
import { runOperationalSweep } from "@/lib/temporal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schedulerTokenHeader = "x-openpresence-scheduler-token";

function hasSchedulerAuthority(request: Request): boolean {
  const expected = process.env.OPENPRESENCE_SCHEDULER_TOKEN?.trim();
  const received = request.headers.get(schedulerTokenHeader)?.trim();
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function responseHeaders() {
  return { "Cache-Control": "no-store" };
}

/**
 * The dev launcher owns this endpoint through a separate, lightweight process.
 * Production uses instrumentation.ts instead, so there is still exactly one
 * temporal owner per served workspace.
 */
export async function POST(request: Request) {
  if (!hasSchedulerAuthority(request)) {
    return NextResponse.json({ error: "Scheduler authentication failed." }, { status: 401, headers: responseHeaders() });
  }

  const startedAt = Date.now();
  try {
    const sweep = runOperationalSweep();
    const durationMs = Date.now() - startedAt;
    const telemetry = {
      staleRuns: sweep.staleRunsDetected.length,
      dispatchedWakes: sweep.dispatchedWakes.length,
      sweepDurationMs: durationMs,
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
    recordProcessHeartbeat("scheduler", "scheduler", telemetry);
    recordProcessHeartbeat("runtime", "runtime", telemetry);
    return NextResponse.json({
      ok: true,
      reclaimedLeases: sweep.reclaimedLeases,
      staleRuns: sweep.staleRunsDetected.length,
      dispatchedWakes: sweep.dispatchedWakes.length,
      closedOrphanedWaitingRuns: sweep.closedOrphanedWaitingRuns,
      timestamp: sweep.timestamp,
      durationMs,
    }, { headers: responseHeaders() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      error: process.env.NODE_ENV === "production" ? "Scheduler sweep failed." : detail,
    }, { status: 503, headers: responseHeaders() });
  }
}
