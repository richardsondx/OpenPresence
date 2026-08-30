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

function schedulerTelemetry(request: Request) {
  const header = request.headers.get("x-openpresence-scheduler-telemetry");
  if (!header) return undefined;
  try {
    const parsed = JSON.parse(header) as { heapUsedMb?: unknown; rssMb?: unknown };
    const heapUsedMb = typeof parsed.heapUsedMb === "number" && Number.isFinite(parsed.heapUsedMb) && parsed.heapUsedMb >= 0 ? Math.round(parsed.heapUsedMb) : undefined;
    const rssMb = typeof parsed.rssMb === "number" && Number.isFinite(parsed.rssMb) && parsed.rssMb >= 0 ? Math.round(parsed.rssMb) : undefined;
    return heapUsedMb === undefined && rssMb === undefined ? undefined : { heapUsedMb, rssMb };
  } catch {
    return undefined;
  }
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
    const runtimeTelemetry = {
      staleRuns: sweep.staleRunsDetected.length,
      dispatchedWakes: sweep.dispatchedWakes.length,
      sweepDurationMs: durationMs,
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
    const reportedSchedulerTelemetry = schedulerTelemetry(request);
    recordProcessHeartbeat("scheduler", "scheduler", {
      staleRuns: runtimeTelemetry.staleRuns,
      dispatchedWakes: runtimeTelemetry.dispatchedWakes,
      sweepDurationMs: runtimeTelemetry.sweepDurationMs,
      ...(reportedSchedulerTelemetry ?? runtimeTelemetry),
    });
    recordProcessHeartbeat("runtime", "runtime", runtimeTelemetry);
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
