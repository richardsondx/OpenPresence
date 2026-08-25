import { NextResponse } from "next/server";
import { readPublicXPostByUrl, xPostIdFromUrl } from "@/lib/x";
import { fetchPublicUrl, publicUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

const decode = (value: string) => value
  .replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'")
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim();

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
  const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"));
  return decode(forward?.[1] ?? reverse?.[1] ?? "") || undefined;
}

function proxiedImageUrl(request: Request, rawImage: string | undefined, base: URL) {
  if (!rawImage) return undefined;
  try {
    const image = new URL(rawImage, base);
    if (!["http:", "https:"].includes(image.protocol)) return undefined;
    const proxy = new URL("/api/link-preview/image", request.url);
    proxy.searchParams.set("url", image.toString());
    return proxy.toString();
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("url")?.trim();
    if (!raw) return NextResponse.json({ error: "A URL is required." }, { status: 400 });
    const url = await publicUrl(raw);
    if (xPostIdFromUrl(url.toString())) {
      const post = await readPublicXPostByUrl(url.toString());
      return NextResponse.json({ url: `https://x.com/i/status/${post.id}`, site: "X", title: post.authorName ? `${post.authorName}${post.authorUsername ? ` (@${post.authorUsername})` : ""}` : "Post on X", description: post.text, image: proxiedImageUrl(request, post.media?.[0]?.url, url) });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const fetched = await fetchPublicUrl(url.toString(), { signal: controller.signal, headers: { Accept: "text/html", "User-Agent": "OpenPresence-LinkPreview/1.0" } });
      const response = fetched.response;
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("This link does not expose a preview.");
      const html = (await response.text()).slice(0, 1_000_000);
      const title = meta(html, "og:title") ?? meta(html, "twitter:title") ?? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const description = meta(html, "og:description") ?? meta(html, "twitter:description") ?? meta(html, "description");
      const image = meta(html, "og:image") ?? meta(html, "twitter:image");
      return NextResponse.json({ url: fetched.url.toString(), site: meta(html, "og:site_name") ?? fetched.url.hostname.replace(/^www\./, ""), title: title || fetched.url.hostname, description, image: proxiedImageUrl(request, image, fetched.url) });
    } finally { clearTimeout(timer); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview unavailable." }, { status: 422 });
  }
}
