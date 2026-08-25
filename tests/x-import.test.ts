import { describe, expect, it, vi } from "vitest";
import { readPublicXPostByUrl, xPostIdFromUrl } from "../lib/x";
import { createAgent, recordImportedXMirror } from "../lib/runtime";

describe("operator-supplied X posts", () => {
  it("extracts post IDs only from X status URLs", () => {
    expect(xPostIdFromUrl("https://x.com/boardyai/status/2089200546477420956")).toBe("2089200546477420956");
    expect(xPostIdFromUrl("https://twitter.com/boardyai/status/2089200546477420956?ref=share")).toBe("2089200546477420956");
    expect(xPostIdFromUrl("https://example.com/boardyai/status/2089200546477420956")).toBeUndefined();
  });

  it("turns public X oEmbed into Social Mirror-ready post evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      author_name: "Boardy",
      author_url: "https://x.com/boardyai",
      html: "<blockquote><p lang=\"en\">i&#39;m an AI. Humble me.</p>&mdash; Boardy (@boardyai) <a>August 17, 2026</a></blockquote>",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(readPublicXPostByUrl("https://x.com/boardyai/status/2089200546477420956")).resolves.toMatchObject({
      id: "2089200546477420956",
      text: "i'm an AI. Humble me.",
      authorName: "Boardy",
      authorUsername: "boardyai",
    });
  });

  it("keeps public X image media when the native API is not connected", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).includes("publish.x.com")) {
        return new Response(JSON.stringify({ author_name: "Reads with Ravi", author_url: "https://x.com/readswithravi", html: "<blockquote><p lang=\"zxx\"><a href=\"https://t.co/image\">pic.twitter.com/image</a></p><a>August 16, 2026</a></blockquote>" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response('<meta property="og:image" content="https://pbs.twimg.com/media/HQlf-c1XcAAhsQP?format=webp&amp;name=small"><img src="https://pbs.twimg.com/profile_images/avatar.jpg">', { status: 200, headers: { "content-type": "text/html" } });
    }));
    await expect(readPublicXPostByUrl("https://x.com/readswithravi/status/2089076729654767825")).resolves.toMatchObject({
      media: [{ type: "photo", url: "https://pbs.twimg.com/media/HQlf-c1XcAAhsQP?format=webp&name=small" }],
    });
  });

  it("records public target cards for provider lineage reconciliation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).includes("publish.x.com")) {
        return new Response(JSON.stringify({
          author_name: "Genny",
          author_url: "https://x.com/example_agent",
          html: "<blockquote><p lang=\"en\">A useful quote.</p><a>August 25, 2026</a></blockquote>",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response('<div data-href="/boardyai/status/2089431100980682909"></div><div data-href="/example_agent/status/2092177859288666350"></div>', { status: 200, headers: { "content-type": "text/html" } });
    }));
    await expect(readPublicXPostByUrl("https://x.com/example_agent/status/2092177859288666350")).resolves.toMatchObject({
      publicTargetIds: ["2089431100980682909"],
    });
  });

  it("keeps an imported post scoped to the Presence and marks its origin honestly", () => {
    const state = createAgent({ name: "Jenny", description: "A useful X Presence.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const presenceId = state.presence!.id;
    const next = recordImportedXMirror(state, { connectionId: "unused", presenceId, post: { id: "2089200546477420956", text: "i'm an AI. Humble me.", authorName: "Boardy", authorUsername: "boardyai" } });
    expect(next.mirrorObjects[0]).toMatchObject({ presenceId, source: "manual", sourceEventId: "manual-x:2089200546477420956", trust: "untrusted_world_content" });
    expect(next.mirrorEvents[0]).toMatchObject({ presenceId, bridgeId: "manual-x:2089200546477420956" });
  });
});
