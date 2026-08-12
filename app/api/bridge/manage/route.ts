import { NextResponse } from "next/server";
import { z } from "zod";
import { createBridgeWithKey, rotateBridgeKey, revokeBridge } from "@/lib/bridge";
import { readState } from "@/lib/db";

export const dynamic = "force-dynamic";
const capabilities = z.object({ inbound: z.boolean(), reconcile: z.boolean(), affordances: z.array(z.string().min(1)).max(100), formats: z.array(z.string()).max(100), metrics: z.array(z.string()).max(100) });
const input = z.discriminatedUnion("action", [z.object({ action: z.literal("create"), presenceId: z.string().min(1), name: z.string().trim().min(1).max(120), kind: z.enum(["bridge", "manual", "native", "simulated"]), capabilities }), z.object({ action: z.literal("rotate"), bridgeId: z.string().min(1) }), z.object({ action: z.literal("revoke"), bridgeId: z.string().min(1) })]);

export async function POST(request: Request) {
  try {
    const parsed = input.parse(await request.json());
    if (parsed.action === "create") { const result = createBridgeWithKey(readState(), { type: "createBridge", input: parsed }); return NextResponse.json({ state: result.state, bridge: result.bridge, key: result.key }); }
    if (parsed.action === "rotate") { const result = rotateBridgeKey(readState(), parsed.bridgeId); return NextResponse.json({ state: result.state, key: result.key }); }
    return NextResponse.json({ state: revokeBridge(readState(), parsed.bridgeId) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Bridge change could not be saved." }, { status: 400 }); }
}
