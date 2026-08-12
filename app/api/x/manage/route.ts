import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readState, writeState } from "@/lib/db";
import { disconnectNativeX, saveNativeXCredentials, testXCredentials, upsertNativeXConnection } from "@/lib/x";

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
    const state = readState();
    const presence = state.presences.find((item) => item.id === parsed.presenceId);
    if (!presence || presence.channel !== "x") throw new Error("An X credential can only be attached to an X Presence.");
    if (parsed.action === "disconnect") {
      const next = disconnectNativeX(state, parsed.presenceId);
      writeState(next);
      return NextResponse.json({ state: next });
    }
    const cleanCredentials = Object.fromEntries(Object.entries(parsed.credentials).filter(([, value]) => value)) as typeof parsed.credentials;
    const result = await testXCredentials(cleanCredentials, presence.handle);
    if (parsed.action === "test") return NextResponse.json({ result });
    const existing = state.nativeConnections.find((item) => item.presenceId === parsed.presenceId && item.kind === "x");
    const connectionId = existing?.id ?? `native_x_${crypto.randomUUID()}`;
    saveNativeXCredentials(connectionId, cleanCredentials);
    const next = upsertNativeXConnection(state, { presenceId: parsed.presenceId, id: connectionId, ...result });
    writeState(next);
    return NextResponse.json({ state: next, result });
  } catch (error) {
    console.warn("X connection change rejected", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "X connection could not be completed." }, { status: 400 });
  }
}
