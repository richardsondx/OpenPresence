import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeFromRequest } from "@/lib/bridge";
import { bridgeExecutionStatus } from "@/lib/bridge-contract";
import { getOperationalRun, listOperationalRuns, readStateForBridge, upsertOperationalRun } from "@/lib/db";

export const dynamic = "force-dynamic";
const input = z.object({ id: z.string().optional(), username: z.string().optional(), error: z.string().max(1000).optional(), posts: z.array(z.object({ id: z.string().regex(/^\d+$/), text: z.string().max(30000), authorUsername: z.string().optional(), authorName: z.string().optional(), language: z.string().optional() })).max(30).optional() });

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    const body = input.parse(await request.json());
    const pending = !body.id ? listOperationalRuns(bridge.presenceId, ["waiting"]).find((item) => item.stage === "browser.read" && item.metadata?.bridgeId === bridge.id && !item.leaseOwner && Date.parse(item.deadlineAt ?? "") > Date.now()) : undefined;
    // Idle polling must not hydrate the full workspace every three seconds.
    if (!body.id && !pending) return NextResponse.json({ read: null });
    const state = readStateForBridge(bridge.id);
    const presence = state.presences.find((item) => item.id === bridge.presenceId);
    if (!presence || presence.browserAccess?.enabled === false || presence.environment === "sandbox" || bridgeExecutionStatus(bridge) !== "connected") return NextResponse.json({ error: "The browser account is not ready." }, { status: 409 });
    if (body.id) {
      const run = getOperationalRun(body.id);
      if (!run || run.presenceId !== bridge.presenceId || run.metadata?.bridgeId !== bridge.id || run.stage !== "browser.read" || run.state !== "waiting" || Date.parse(run.deadlineAt ?? "") <= Date.now()) return NextResponse.json({ error: "This browser read is no longer active." }, { status: 409 });
      const identityMatches = body.username?.replace(/^@/, "").toLowerCase() === presence.handle.replace(/^@/, "").toLowerCase();
      const error = body.error || (!identityMatches ? "The browser account changed during the read." : undefined);
      upsertOperationalRun({ ...run, state: error ? "failed" : "succeeded", lastErrorCode: error, lastProgressAt: new Date().toISOString(), metadata: { ...run.metadata, posts: error ? [] : body.posts ?? [] } });
      return NextResponse.json({ ok: true });
    }
    const run = pending;
    if (!run) return NextResponse.json({ read: null });
    upsertOperationalRun({ ...run, leaseOwner: bridge.id, attemptCount: 1, lastProgressAt: new Date().toISOString() });
    return NextResponse.json({ read: { id: run.id, url: run.metadata?.url, expectedHandle: presence.handle } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Browser read failed." }, { status: 400 });
  }
}
