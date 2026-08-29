import type { Asset } from "./types";

/**
 * The library keeps the original bytes, but the perception worker needs to
 * know whether those bytes are a still image, an animated image, or a video.
 * This module is deliberately dependency-free so the same detection rules can
 * be used by the browser picker, the upload route, and the folder worker.
 */
export type LibraryVisualAssetType = Extract<Asset["type"], "image" | "gif" | "video">;

export interface DetectedLibraryMedia {
  assetType: LibraryVisualAssetType;
  mediaKind: Extract<Asset["mediaKind"], "image" | "gif" | "video">;
  mimeType: string;
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  dib: "image/bmp",
  ico: "image/x-icon",
  cur: "image/x-icon",
  psd: "image/vnd.adobe.photoshop",
  psb: "image/vnd.adobe.photoshop",
  dng: "image/x-adobe-dng",
  cr2: "image/x-canon-cr2",
  cr3: "image/x-canon-cr3",
  nef: "image/x-nikon-nef",
  nrw: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  rw2: "image/x-panasonic-rw2",
  orf: "image/x-olympus-orf",
  raf: "image/x-fuji-raf",
  pef: "image/x-pentax-pef",
  srw: "image/x-samsung-srw",
  "3fr": "image/x-hasselblad-3fr",
  jxl: "image/jxl",
  jp2: "image/jp2",
  j2k: "image/jp2",
  jpf: "image/jp2",
  jpx: "image/jp2",
  svg: "image/svg+xml",
  svgz: "image/svg+xml",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  mpe: "video/mpeg",
  m2v: "video/mpeg",
  threegp: "video/3gpp",
  "3gp": "video/3gpp",
  ogv: "video/ogg",
  flv: "video/x-flv",
};

const SUPPORTED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME_TYPES));

function normalizedMimeType(value: string | undefined) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function extensionFor(fileName: string) {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".svg.gz")) return "svgz";
  return lower.split(".").pop() ?? "";
}

function mimeTypeFromExtension(fileName: string) {
  return EXTENSION_MIME_TYPES[extensionFor(fileName)];
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function sniffMimeType(bytes: Uint8Array | undefined) {
  if (!bytes || bytes.length < 4) return undefined;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "II*\u0000" || ascii(bytes, 0, 4) === "MM\u0000*") return "image/tiff";
  if (ascii(bytes, 0, 2) === "BM") return "image/bmp";
  if (ascii(bytes, 0, 12) === "\u0000\u0000\u0000\u000cjP  \r\n\u0087\n") return "image/jp2";

  const header = ascii(bytes, 0, Math.min(bytes.length, 512)).trimStart().toLowerCase();
  if (header.startsWith("<svg") || header.startsWith("<?xml") && header.includes("<svg")) return "image/svg+xml";

  // ISO base media files store their format brand at byte 8. This covers
  // MP4/MOV and HEIF-family still images without trusting a misleading suffix.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brands = ascii(bytes, 8, Math.min(24, Math.max(0, bytes.length - 8))).toLowerCase();
    if (["avif", "avis"].some((brand) => brands.includes(brand))) return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some((brand) => brands.includes(brand))) return "image/heic";
    if (["qt  ", "isom", "iso2", "mp41", "mp42", "avc1", "dash", "m4v "].some((brand) => brands.includes(brand))) return "video/mp4";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "AVI ") return "video/x-msvideo";
  if (ascii(bytes, 0, 4) === "\u001aE\u00df\u00a3") return "video/x-matroska";
  return undefined;
}

function assetTypeForMime(mimeType: string): LibraryVisualAssetType | undefined {
  if (mimeType === "image/gif") return "gif";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return undefined;
}

export function isSupportedLibraryMedia(mimeType: string | undefined) {
  const normalized = normalizedMimeType(mimeType);
  return SUPPORTED_MIME_TYPES.has(normalized);
}

export function detectLibraryMedia(fileName: string, suppliedMimeType?: string, bytes?: Uint8Array): DetectedLibraryMedia | undefined {
  const sniffed = sniffMimeType(bytes);
  const supplied = normalizedMimeType(suppliedMimeType);
  const byExtension = mimeTypeFromExtension(fileName);
  const mimeType = [sniffed, supplied, byExtension].find((candidate) => candidate && SUPPORTED_MIME_TYPES.has(candidate));
  if (!mimeType) return undefined;
  const assetType = assetTypeForMime(mimeType);
  if (!assetType) return undefined;
  return { assetType, mediaKind: assetType, mimeType };
}

export const supportedLibraryMediaLabel = "PNG, JPEG, WebP, GIF, TIFF, AVIF, HEIC/HEIF, SVG, PSD, camera RAW, and common video formats";
