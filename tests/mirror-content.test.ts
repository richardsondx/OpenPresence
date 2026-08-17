import { describe, expect, it } from "vitest";
import { cleanMirrorText, normalizeMirrorAuthor, parseRenderedXHeader } from "../lib/mirror-content";

describe("Social Mirror content normalization", () => {
  it("removes X rendered author metadata and engagement counts", () => {
    expect(cleanMirrorText("x", "Genny @gennyverse · Aug 12 Hello! Let’s explore together! 1 1 89")).toBe("Hello! Let’s explore together!");
    expect(cleanMirrorText("x", "Genny @gennyverse · 11h The hard part is deciding what deserves interruption. 10")).toBe("The hard part is deciding what deserves interruption.");
    expect(cleanMirrorText("x", "Future Systems @VladBuildsAI Physical AI is huge, but a robotics ETF can hide very different businesses under one label. 2:44 PM · Aug 16, 2026 · 1 View")).toBe("Future Systems @VladBuildsAI Physical AI is huge, but a robotics ETF can hide very different businesses under one label.");
  });

  it("does not rewrite clean text or other channels", () => {
    expect(cleanMirrorText("x", "Version 10")).toBe("Version 10");
    expect(cleanMirrorText("linkedin", "Genny @gennyverse · 11h A post 10")).toBe("Genny @gennyverse · 11h A post 10");
  });

  it("repairs the author fields only when they are clearly scraped metadata", () => {
    const text = "Genny @gennyverse · 11h A real post.";
    expect(parseRenderedXHeader(text)).toMatchObject({ displayName: "Genny", handle: "gennyverse" });
    expect(normalizeMirrorAuthor("x", text, { displayName: "@Genny", handle: "Genny" })).toMatchObject({ displayName: "Genny", handle: "gennyverse" });
    expect(normalizeMirrorAuthor("x", text, { displayName: "Someone Else", handle: "elsewhere" })).toMatchObject({ displayName: "Someone Else", handle: "elsewhere" });
  });
});
