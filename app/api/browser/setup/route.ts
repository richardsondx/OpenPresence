import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * This endpoint has been removed. The Managed Browser path was consolidated
 * into the Chrome Extension path. Browser setup is now handled by the
 * Chrome Extension panel in the Presence Access section.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Managed Browser setup has been removed. Use the Chrome Extension instead." },
    { status: 410 },
  );
}
