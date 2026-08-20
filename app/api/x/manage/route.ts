import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readState, WorkspaceConflictError, writeState } from "@/lib/db";
import { disconnectNativeX, normalizeHandle, saveNativeXCredentials, testXCredentials, upsertNativeXConnection } from "@/lib/x";
import { reconcileNativeX } from "@/lib/native-x";
import { stateForContext } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const credentials = z.object({
  apiKey: z.string().trim().min(1).max(500),
  apiSecret: z.string().trim().min(1).max(500),
  bearerToken: z.string().trim().max(2000).optional().or(z.literal("")),
  accessToken: z.string().trim().max(2000).optional().or(z.literal("")),
  accessTokenSecret: z.string().trim().max(2000).optional().or(z.literal("")),
}).superRefine((value, context) => {
  const hasAccessToken = Boolean(value.accessToken);
  const hasAccessTokenSecret = Boolean(value.accessTokenSecret);
  if (hasAccessToken !== hasAccessTokenSecret) context.addIssue({ code: z.ZodIssueCode.custom, path: [hasAccessToken ? "accessTokenSecret" : "accessToken"], message: "Provide both user access token fields for write access." });
  if (!value.bearerToken && !hasAccessToken) context.addIssue({ code: z.ZodIssueCode.custom, path: ["bearerToken"], message: "Add a Bearer Token for read access, or user access tokens for read + write access." });
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), presenceId: z.string().min(1), credentials }),
  z.object({ action: z.literal("save"), presenceId: z.string().min(1), credentials }),
  z.object({ action: z.literal("disconnect"), presenceId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const parsed = input.parse(await request.json());
    const context = {
      agentId: request.headers.get("x-openpresence-agent-id"),
      presenceId: request.headers.get("x-openpresence-presence-id"),
    };
    const state = stateForContext(readState(), context);
    const revision = request.headers.get("x-openpresence-workspace-revision");
    if (revision && /^\d+$/.test(revision)) state.workspaceRevision = Number(revision);
    const presence = state.presences.find((item) => item.id === parsed.presenceId);
    if (!presence || presence.channel !== "x") throw new Error("An X credential can only be attached to an X Presence.");
    if (parsed.action === "disconnect") {
      const next = disconnectNativeX(state, parsed.presenceId);
      writeState(next);
      return NextResponse.json({ state: next });
    }
    const cleanCredentials = Object.fromEntries(Object.entries(parsed.credentials).filter(([, value]) => value)) as typeof parsed.credentials;
    const result = await testXCredentials(cleanCredentials, presence.handle);
    if (result.access === "read-write" && normalizeHandle(result.account.username) !== normalizeHandle(presence.handle)) {
      throw new Error(`ACCOUNT_MISMATCH: X authenticated @${result.account.username}, but this Presence expects @${normalizeHandle(presence.handle)}. Credentials were not saved.`);
    }
    if (parsed.action === "test") return NextResponse.json({ result });
    const existing = state.nativeConnections.find((item) => item.presenceId === parsed.presenceId && item.kind === "x");
    const connectionId = existing?.id ?? `native_x_${crypto.randomUUID()}`;
    saveNativeXCredentials(connectionId, cleanCredentials);
    const connected = upsertNativeXConnection(state, { presenceId: parsed.presenceId, id: connectionId, ...result });
    const next = await reconcileNativeX(connected, parsed.presenceId);
    writeState(next);
    return NextResponse.json({ state: next, result });
  } catch (error) {
    console.warn("X connection change rejected", error instanceof Error ? error.message : error);
    const message = error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "X connection could not be completed.";
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message, conflict: true, state: stateForContext(readState(), { agentId: request.headers.get("x-openpresence-agent-id"), presenceId: request.headers.get("x-openpresence-presence-id") }) }, { status: error.status });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
