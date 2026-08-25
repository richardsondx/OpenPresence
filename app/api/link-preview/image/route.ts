import { NextResponse } from "next/server";
import { fetchPublicUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("url")?.trim();
    if (!raw) return NextResponse.json({ error: "An image URL is required." }, { status: 400 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const { response } = await fetchPublicUrl(raw, { signal: controller.signal, headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.9", "User-Agent": "OpenPresence-LinkPreview/1.0" } });
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      const contentLength = Number(response.headers.get("content-length"));
      if (!response.ok || !contentType?.startsWith("image/") || Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "The preview image is unavailable." }, { status: 422 });
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The preview image is too large." }, { status: 422 });
      return new NextResponse(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" } });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview image unavailable." }, { status: 422 });
  }
}
