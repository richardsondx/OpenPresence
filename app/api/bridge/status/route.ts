import { NextResponse } from "next/server";
import { readBridgeHealthForPresence, readRuntimeHealthProjection } from "@/lib/db";
import { bridgeAdapterStatus, bridgeExecutionStatus } from "@/lib/bridge-contract";
import type { Bridge } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const presenceId = new URL(request.url).searchParams.get("presenceId")?.trim();
  if (!presenceId) return NextResponse.json({ error: "A Presence is required." }, { status: 400 });
  const pendingStatuses = new Set(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"]);
  const executions = readRuntimeHealthProjection(presenceId).executions;
  const bridges = readBridgeHealthForPresence(presenceId).map((bridge) => {
    const fullBridge = bridge as Bridge;
    const status = bridgeAdapterStatus(fullBridge);
    return {
      ...bridge,
      adapterStatus: status,
      executionStatus: bridgeExecutionStatus(fullBridge),
      identityStatus: fullBridge.accountIdentity?.status ?? "unknown",
      executionBlocker: fullBridge.accountIdentity?.status === "mismatch"
        ? fullBridge.accountIdentity.message
        : fullBridge.accountIdentity?.status === "verified"
          ? undefined
          : "The controlled browser heartbeat is live, but its signed-in account has not been verified for this Presence.",
      queue: (() => {
        const pending = executions
          .filter((execution) => execution.bridgeId === fullBridge.id && pendingStatuses.has(execution.status))
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const oldestQueuedAt = pending[0]?.createdAt;
        const stalled = Boolean(oldestQueuedAt && Date.now() - new Date(oldestQueuedAt).getTime() > 120_000);
        return {
          pendingCount: pending.length,
          oldestQueuedAt,
          stalled,
          summary: stalled
            ? status === "connected"
              ? "The browser connector is online, but this queued action has not reached a claim yet."
              : "The browser connector is not currently checking in; queued actions remain unclaimed."
            : pending.length
              ? "The browser connector has durable work to claim."
              : undefined,
        };
      })(),
      ...(status === "connected" ? {} : { state: status === "stale" ? "degraded" : "offline" }),
    };
  });
  return NextResponse.json({ bridges }, { headers: { "Cache-Control": "no-store" } });
}
