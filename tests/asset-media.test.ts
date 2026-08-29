import { describe, expect, it } from "vitest";
import { detectLibraryMedia, isSupportedLibraryMedia } from "../lib/asset-media";

describe("Asset Library visual media detection", () => {
  it("recognizes common still-image formats from their filename", () => {
    expect(detectLibraryMedia("photo.heic")).toMatchObject({ assetType: "image", mediaKind: "image", mimeType: "image/heic" });
    expect(detectLibraryMedia("scan.tiff")).toMatchObject({ assetType: "image", mimeType: "image/tiff" });
    expect(detectLibraryMedia("illustration.svg")).toMatchObject({ assetType: "image", mimeType: "image/svg+xml" });
    expect(detectLibraryMedia("camera.avif")).toMatchObject({ assetType: "image", mimeType: "image/avif" });
    expect(detectLibraryMedia("camera.cr3")).toMatchObject({ assetType: "image", mimeType: "image/x-canon-cr3" });
    expect(detectLibraryMedia("design.psd")).toMatchObject({ assetType: "image", mimeType: "image/vnd.adobe.photoshop" });
  });

  it("classifies animated images and videos for the vision normalizer", () => {
    expect(detectLibraryMedia("animation.gif")).toMatchObject({ assetType: "gif", mediaKind: "gif", mimeType: "image/gif" });
    expect(detectLibraryMedia("recording.mov")).toMatchObject({ assetType: "video", mediaKind: "video", mimeType: "video/quicktime" });
    expect(detectLibraryMedia("clip.webm")).toMatchObject({ assetType: "video", mimeType: "video/webm" });
  });

  it("uses file signatures when a browser or source omits a useful MIME type", () => {
    expect(detectLibraryMedia("unknown.bin", "application/octet-stream", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toMatchObject({ assetType: "image", mimeType: "image/png" });
    expect(detectLibraryMedia("unknown.bin", "", Buffer.from("GIF89a"))).toMatchObject({ assetType: "gif", mimeType: "image/gif" });
    expect(detectLibraryMedia("unknown.bin", "", Buffer.from("RIFFxxxxWEBP"))).toMatchObject({ assetType: "image", mimeType: "image/webp" });
  });

  it("does not turn non-visual files into visual Assets", () => {
    expect(detectLibraryMedia("notes.txt", "text/plain")).toBeUndefined();
    expect(detectLibraryMedia("data.csv", "text/csv")).toBeUndefined();
    expect(isSupportedLibraryMedia("image/heic")).toBe(true);
    expect(isSupportedLibraryMedia("application/pdf")).toBe(false);
  });
});
