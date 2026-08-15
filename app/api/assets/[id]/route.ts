import { NextResponse } from "next/server";
import { readStateForAsset } from "@/lib/db";
import { readAssetBytes } from "@/lib/asset-store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const asset = readStateForAsset(id).assets.find((item) => item.id === id);
  if (!asset?.storage?.storeKey) return NextResponse.json({ error: "Stored asset not found." }, { status: 404 });
  try {
    const bytes = await readAssetBytes(asset.storage.storeKey);
    return new NextResponse(bytes as BodyInit, { headers: { "Content-Type": asset.storage.mimeType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Sha256": asset.storage.exactHash } });
  } catch {
    return NextResponse.json({ error: "Stored asset is unavailable." }, { status: 404 });
  }
}
