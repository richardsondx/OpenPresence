import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.join(process.cwd(), "data", "assets");
const MAX_BYTES = 25 * 1024 * 1024;

export interface StoredAsset { storeKey: string; mimeType: string; byteSize: number; exactHash: string; perceptualHash?: string; }

async function visualHash(bytes: Buffer, mimeType: string) {
  if (!mimeType.startsWith("image/")) return undefined;
  try {
    const pixels = await sharp(bytes).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
    const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
    return Array.from(pixels, (value) => value >= average ? "1" : "0").join("");
  } catch { return undefined; }
}

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Asset data must be a base64 data URL.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Asset exceeds the local media size limit.");
  return { mimeType: match[1]!, bytes };
}

export async function putAssetBytes(bytes: Buffer, input: { mimeType: string; suggestedName?: string }): Promise<StoredAsset> {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Asset exceeds the local media size limit.");
  const exactHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const extension = input.mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  const storeKey = `${exactHash}.${safeKey(extension)}`;
  await fs.mkdir(root, { recursive: true });
  const filePath = path.join(root, storeKey);
  try { await fs.access(filePath); } catch { await fs.writeFile(filePath, bytes, { flag: "wx" }); }
  return { storeKey, mimeType: input.mimeType, byteSize: bytes.byteLength, exactHash, perceptualHash: await visualHash(bytes, input.mimeType) };
}

export async function putDataUrl(dataUrl: string, suggestedName?: string) {
  const decoded = decodeDataUrl(dataUrl);
  return putAssetBytes(decoded.bytes, { mimeType: decoded.mimeType, suggestedName });
}

export async function readAssetBytes(storeKey: string) {
  const normalized = path.basename(storeKey);
  if (normalized !== storeKey) throw new Error("Invalid asset store key.");
  return fs.readFile(path.join(root, normalized));
}

export function assetStoreRoot() { return root; }

export function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "0.0.0.0" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.startsWith("169.254.")) return false;
    return true;
  } catch { return false; }
}

export async function fetchPublicAsset(url: string) {
  if (!isPublicHttpUrl(url)) throw new Error("Only public HTTP(S) asset URLs may be fetched.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let currentUrl = url;
    let response: Response | undefined;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      response = await fetch(currentUrl, { redirect: "manual", signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Asset source returned a redirect without a destination.");
      currentUrl = new URL(location, currentUrl).toString();
      if (!isPublicHttpUrl(currentUrl)) throw new Error("Asset source redirected to a private or unsupported destination.");
      if (redirect === 3) throw new Error("Asset source exceeded the redirect limit.");
    }
    if (!response) throw new Error("Asset source did not respond.");
    if (!response.ok) throw new Error(`Asset source returned HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) throw new Error("Asset source exceeds the local media size limit.");
    const bytes = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    return putAssetBytes(bytes, { mimeType });
  } finally { clearTimeout(timer); }
}
