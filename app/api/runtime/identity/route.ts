import { NextResponse } from "next/server";
import { readRuntimeIdentityProjection } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runtimeIdentity: { ...readRuntimeIdentityProjection(), runtimeProfile: process.env.OPENPRESENCE_PROFILE?.trim() || null } }, { headers: { "Cache-Control": "no-store" } });
}
