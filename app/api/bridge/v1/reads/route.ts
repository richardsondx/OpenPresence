import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { bridgeFromRequest } from "@/lib/bridge";
import { bridgeReadyForExpectedAccount } from "@/lib/bridge-contract";
import { getOperationalRun, listOperationalRuns, readStateForBridge, upsertOperationalRun } from "@/lib/db";
import type { JsonValue } from "@/lib/types";

export const dynamic = "force-dynamic";
const input = z.object({ action: z.enum(["claim", "renew", "complete"]).optional(), id: z.string().optional(), leaseToken: z.string().min(16).max(128).optional(), username: z.string().optional(), error: z.string().max(1000).optional(), posts: z.array(z.object({ id: z.string().regex(/^\d+$/), text: z.string().max(30000), authorUsername: z.string().optional(), authorName: z.string().optional(), language: z.string().optional() })).max(30).optional() });
const readLeaseMs = 12_000;

function leaseTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function failPendingRead(run: ReturnType<typeof getOperationalRun> & {}, error: string) {
  const metadata: Record<string, JsonValue> = { ...run.metadata };
  delete metadata.readLeaseTokenHash;
  const failed = { ...run, state: "failed" as const, lastErrorCode: error, lastProgressAt: new Date().toISOString(), metadata };
  delete failed.leaseOwner;
  delete failed.leaseExpiresAt;
  upsertOperationalRun(failed);
}

export async function POST(request: Request) {
  try {
    const bridge = bridgeFromRequest(request);
    if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
    const body = input.parse(await request.json());
    const action = body.action ?? (body.id ? "complete" : "claim");

    if (action === "claim") {
      const now = Date.now();
      const pending = listOperationalRuns(bridge.presenceId, ["waiting"]).find((item) => item.stage === "browser.read"
        && item.metadata?.bridgeId === bridge.id
        && Date.parse(item.deadlineAt ?? "") > now
        && (!item.leaseOwner || !item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) <= now));
      // Idle polling must not hydrate the full workspace every three seconds.
      if (!pending) return NextResponse.json({ read: null });
      const state = readStateForBridge(bridge.id);
      const presence = state.presences.find((item) => item.id === bridge.presenceId);
      if (!presence || presence.browserAccess?.enabled !== true || presence.environment === "sandbox" || !bridgeReadyForExpectedAccount(bridge, presence.handle)) {
        const actual = bridge.accountIdentity?.username?.replace(/^@/, "").trim().toLowerCase();
        const expected = presence?.handle.replace(/^@/, "").trim().toLowerCase();
        const error = actual && expected && actual !== expected
          ? `The controlled browser is signed in as @${actual}, but this Presence expects @${expected}. Switch the X tab and verify the account before retrying.`
          : presence?.browserAccess?.enabled !== true
            ? "Browser access is not enabled for this Presence."
            : presence?.environment === "sandbox"
              ? "The signed-in browser cannot be used from the Sandbox."
              : "The browser account is not verified and ready for this Presence.";
        failPendingRead(pending, error);
        return NextResponse.json({ error }, { status: 409 });
      }
      const leaseToken = randomUUID();
      const nowIso = new Date(now).toISOString();
      upsertOperationalRun({ ...pending,
        leaseOwner: bridge.id,
        leaseExpiresAt: new Date(now + readLeaseMs).toISOString(),
        attemptCount: pending.attemptCount + 1,
        recoveryCount: pending.leaseOwner ? pending.recoveryCount + 1 : pending.recoveryCount,
        lastHeartbeatAt: nowIso,
        lastProgressAt: nowIso,
        metadata: { ...pending.metadata, readLeaseTokenHash: leaseTokenHash(leaseToken) },
      });
      return NextResponse.json({ read: { id: pending.id, url: pending.metadata?.url, expectedHandle: presence.handle, deadlineAt: pending.deadlineAt, leaseToken } });
    }

    if (!body.id) return NextResponse.json({ error: "The browser read ID is required." }, { status: 400 });
    if (!body.leaseToken) return NextResponse.json({ error: "The browser read lease is missing or expired." }, { status: 409 });
    const run = getOperationalRun(body.id);
    const tokenMatches = run?.metadata?.readLeaseTokenHash === leaseTokenHash(body.leaseToken);
    if (!run || run.presenceId !== bridge.presenceId || run.metadata?.bridgeId !== bridge.id || run.stage !== "browser.read" || run.state !== "waiting" || !tokenMatches || Date.parse(run.deadlineAt ?? "") <= Date.now()) {
      return NextResponse.json({ error: "This browser read lease is no longer active." }, { status: 409 });
    }

    if (action === "renew") {
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      upsertOperationalRun({ ...run, leaseExpiresAt: new Date(now + readLeaseMs).toISOString(), lastHeartbeatAt: nowIso, lastProgressAt: nowIso });
      return NextResponse.json({ ok: true, deadlineAt: run.deadlineAt });
    }

    const state = readStateForBridge(bridge.id);
    const presence = state.presences.find((item) => item.id === bridge.presenceId);
    if (!presence || presence.browserAccess?.enabled !== true || presence.environment === "sandbox" || !bridgeReadyForExpectedAccount(bridge, presence.handle)) return NextResponse.json({ error: "The browser account is not verified and ready for this Presence." }, { status: 409 });
    {
      const identityMatches = body.username?.replace(/^@/, "").toLowerCase() === presence.handle.replace(/^@/, "").toLowerCase();
      const error = body.error || (!identityMatches ? "The browser account changed during the read." : undefined);
      const metadata: Record<string, JsonValue> = { ...run.metadata, posts: error ? [] : body.posts ?? [] };
      delete metadata.readLeaseTokenHash;
      const completed = { ...run, state: error ? "failed" as const : "succeeded" as const, lastErrorCode: error, lastProgressAt: new Date().toISOString(), metadata };
      delete completed.leaseOwner;
      delete completed.leaseExpiresAt;
      upsertOperationalRun(completed);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Browser read failed." }, { status: 400 });
  }
}
