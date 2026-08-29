import { NextResponse } from "next/server";
import { readState } from "@/lib/db";
import { readAssetBytes } from "@/lib/asset-store";
import { assetIsEligibleForPresence } from "@/lib/asset-library";
import { assertRuntimeScope, createRuntimeScope, stateForContext } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  let state;
  try {
    const stored = readState();
    state = stateForContext(stored, token);
    const scope = createRuntimeScope(state, { presenceId: token.presenceId });
    assertRuntimeScope(state, scope);
  } catch {
    return NextResponse.json({ error: "The RuntimeScope is stale or invalid." }, { status: 403 });
  }
  const asset = state.assets.find((item) => item.id === id);
  if (!asset || !assetIsEligibleForPresence(state, asset, state.presence?.id)) return NextResponse.json({ error: "Stored asset not found." }, { status: 404 });
  if (!asset?.storage?.storeKey) return NextResponse.json({ error: "Stored asset not found." }, { status: 404 });
  try {
    const bytes = await readAssetBytes(asset.storage.storeKey);
    return new NextResponse(bytes as BodyInit, { headers: { "Content-Type": asset.storage.mimeType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Sha256": asset.storage.exactHash } });
  } catch {
    return NextResponse.json({ error: "Stored asset is unavailable." }, { status: 404 });
  }
}
