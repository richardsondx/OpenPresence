import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34" }]) }));

import { GET as getPreview } from "@/app/api/link-preview/route";
import { GET as getImage } from "@/app/api/link-preview/image/route";

describe("Chat link previews", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("normalizes relative metadata images behind the same-origin image proxy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<meta property=\"og:title\" content=\"Example\"><meta property=\"og:image\" content=\"/images/hero.png\">", { status: 200, headers: { "content-type": "text/html" } })));

    const response = await getPreview(new Request("http://localhost/api/link-preview?url=https%3A%2F%2Fexample.com%2Fstory"));
    const body = await response.json() as { image?: string };

    expect(response.status).toBe(200);
    expect(body.image).toBe("http://localhost/api/link-preview/image?url=https%3A%2F%2Fexample.com%2Fimages%2Fhero.png");
  });

  it("serves a fetched image with its media type and cache headers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png", "content-length": "3" } })));

    const response = await getImage(new Request("http://localhost/api/link-preview/image?url=https%3A%2F%2Fexample.com%2Fhero.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
