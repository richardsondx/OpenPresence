import crypto from "node:crypto";
import { fetchPublicAsset, fetchPublicAssetPreview, isPublicHttpUrl } from "./asset-store";
import { inferAssetSemanticKind } from "./visual-fit";
import type { Asset, AssetCandidate, AssetDiscoveryProvider, AssetSemanticKind, SourceEvidence } from "./types";

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }

function publisherFromUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const host = new URL(value).hostname.replace(/^www\./i, "");
    return host || undefined;
  } catch { return undefined; }
}

function likelyThumbnail(value: string) {
  try {
    const url = new URL(value);
    const haystack = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    return /(?:bing\.com|googleusercontent\.com|tavily|thumbnail|thumb|sprite|avatar|logo|favicon|icon|flag|og[-_]?image)/.test(haystack);
  } catch { return true; }
}

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function likelyMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(?:png|jpe?g|webp|gif|svg|avif)(?:$|[?#])/i.test(url.pathname) || /(?:^|\/)(?:image|media|asset|download)(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}

async function pageMediaCandidates(sourcePageUrl: string, query: string, provider: string) {
  if (!isPublicHttpUrl(sourcePageUrl)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(sourcePageUrl, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return undefined;
    const html = (await response.text()).slice(0, 3_000_000);
    const pageCandidates: AssetCandidate[] = [];
    const blocks = [...html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)].map((match) => match[1] ?? "");
    const contexts = blocks.length ? blocks : [...html.matchAll(/<(?:img|source)\b[^>]*>/gi)].map((match) => match[0] ?? "");
    for (const context of contexts) {
      const img = context.match(/<(?:img|source)\b[^>]*(?:src|data-src|data-original|srcset)=["']([^"']+)["'][^>]*>/i);
      const rawUrl = img?.[1] ? decodeHtmlAttribute(img[1]).split(",")[0]?.trim().split(/\s+/)[0] : undefined;
      if (!rawUrl) continue;
      const mediaUrl = new URL(rawUrl, sourcePageUrl).toString();
      if (!isPublicHttpUrl(mediaUrl) || likelyThumbnail(mediaUrl)) continue;
      const captionMatch = context.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
      const labelMatch = context.match(/\b(?:alt|title)=["']([^"']+)["']/i);
      const caption = decodeHtmlAttribute(captionMatch?.[1] ?? labelMatch?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      pageCandidates.push({ id: `page_${crypto.randomUUID()}`, query, name: caption || "Source page figure", mediaUrl, sourcePageUrl, title: caption || undefined, description: caption || undefined, publisher: publisherFromUrl(sourcePageUrl), provider, pageContext: "figure", isHeroImage: false, isThumbnail: false, searchMetadataSemanticHint: inferAssetSemanticKind({ name: caption || "", title: caption, description: caption, sourcePageUrl }) });
    }
    return pageCandidates;
  } catch { return undefined; }
  finally { clearTimeout(timer); }
}

export function normalizeAssetCandidates(query: string, provider: string, raw: unknown): AssetCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const directMediaUrl = text(record.image_url) ?? text(record.imageUrl);
    const rawUrl = text(record.url);
    const mediaUrl = directMediaUrl ?? (rawUrl && likelyMediaUrl(rawUrl) ? rawUrl : undefined);
    const sourcePageUrl = text(record.source_url) ?? text(record.sourcePageUrl) ?? (rawUrl && !likelyMediaUrl(rawUrl) ? rawUrl : undefined);
    if (!mediaUrl && !sourcePageUrl) return [];
    const candidate: AssetCandidate = { id: `candidate_${crypto.createHash("sha256").update(`${provider}:${query}:${index}:${mediaUrl ?? sourcePageUrl}`).digest("hex").slice(0, 16)}`, query, name: text(record.title) ?? `Candidate ${index + 1}`, mediaUrl, sourcePageUrl, title: text(record.title), description: text(record.content) ?? text(record.description), publisher: text(record.publisher) ?? text(record.source) ?? publisherFromUrl(sourcePageUrl), author: text(record.author), publishedAt: text(record.published_at) ?? text(record.publishedAt), provider, relevance: typeof record.score === "number" ? record.score : undefined, isThumbnail: mediaUrl ? likelyThumbnail(mediaUrl) : undefined };
    candidate.searchMetadataSemanticHint = inferAssetSemanticKind(candidate);
    return [candidate];
  });
}

export class TavilyAssetDiscoveryProvider implements AssetDiscoveryProvider {
  readonly id = "tavily";
  private static readonly REQUEST_TIMEOUT_MS = 25_000;
  constructor(private readonly apiKey?: string) {}

  async searchAssets(request: { query: string; semanticKind?: AssetSemanticKind; limit?: number }) {
    if (!this.apiKey) throw new Error("Tavily asset discovery is not connected. Add the key in Manage Agent → Provider access.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TavilyAssetDiscoveryProvider.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: this.apiKey, query: request.query, max_results: Math.min(request.limit ?? 8, 20), include_images: true, include_image_descriptions: true }), signal: controller.signal });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(`Tavily discovery failed with HTTP ${response.status}.`);
      const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
      const results = normalizeAssetCandidates(request.query, this.id, record.results);
      const enrichedResults = await Promise.all(results.map(async (candidate) => {
        if (!candidate.sourcePageUrl || (candidate.mediaUrl && !candidate.isThumbnail)) return candidate;
        const pageCandidates = await pageMediaCandidates(candidate.sourcePageUrl, request.query, this.id);
        return pageCandidates?.[0] ?? { ...candidate, mediaUrl: undefined };
      }));
      const images = Array.isArray(record.images) ? normalizeAssetCandidates(request.query, this.id, record.images) : [];
      const figureCandidates = (await Promise.all(enrichedResults.filter((candidate) => candidate.isThumbnail && candidate.sourcePageUrl).map((candidate) => pageMediaCandidates(candidate.sourcePageUrl!, request.query, this.id)))).flatMap((items) => items ?? []);
      return [...figureCandidates, ...images.filter((candidate) => !candidate.isThumbnail), ...enrichedResults.filter((candidate) => !candidate.isThumbnail)].slice(0, request.limit ?? 8);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`Tavily discovery timed out after ${TavilyAssetDiscoveryProvider.REQUEST_TIMEOUT_MS / 1000} seconds.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function materializeCandidate(candidate: AssetCandidate, input: { agentId: string; presenceId?: string; sessionId?: string; environment?: "sandbox" | "live"; origin?: Asset["provenance"]["origin"]; semanticKind?: AssetSemanticKind }): Promise<{ asset: Asset; sourceEvidence?: SourceEvidence }> {
  if (!candidate.mediaUrl) throw new Error("The candidate has no media URL to fetch.");
  const stored = await fetchPublicAsset(candidate.mediaUrl);
  const retrievedAt = new Date().toISOString();
  const sourceEvidence: SourceEvidence | undefined = candidate.sourcePageUrl ? { id: `source_${crypto.randomUUID()}`, canonicalUrl: candidate.sourcePageUrl, publisher: candidate.publisher, author: candidate.author, publishedAt: candidate.publishedAt, retrievedAt, acquisitionProvider: candidate.provider, title: candidate.title, excerpt: candidate.description, assetIds: [], assetPublisher: candidate.assetPublisher ?? candidate.publisher, underlyingDataSource: candidate.underlyingDataSource, lineage: { assetUrl: candidate.mediaUrl, sourcePageUrl: candidate.sourcePageUrl, dataSourceUrl: candidate.underlyingDataSource, relationship: candidate.underlyingDataSource ? "secondary_visualization" : "unknown" } } : undefined;
  const asset: Asset = { id: `asset_${crypto.randomUUID()}`, agentId: input.agentId, presenceId: input.presenceId, sessionId: input.sessionId, type: stored.mimeType === "image/gif" ? "gif" : stored.mimeType.startsWith("video/") ? "video" : "image", mediaKind: stored.mimeType === "image/gif" ? "gif" : stored.mimeType.startsWith("video/") ? "video" : "image", semanticKind: input.semanticKind, storage: stored, status: "ready", nature: "observed", rights: { status: "unknown" }, provenance: { origin: input.origin ?? "discovered", sourceUrl: candidate.mediaUrl, sourcePageUrl: candidate.sourcePageUrl, canonicalSourcePage: candidate.sourcePageUrl, publisher: candidate.assetPublisher ?? candidate.publisher, author: candidate.author, publishedAt: candidate.publishedAt, retrievedAt, acquisitionProvider: candidate.provider, importedAt: retrievedAt, sourceIdentityStatus: candidate.sourcePageUrl ? "unknown" : "unknown" }, description: candidate.title ?? candidate.name, visibility: "public", shareability: "presence-only", environment: input.environment ?? "sandbox", createdAt: retrievedAt, updatedAt: retrievedAt };
  if (sourceEvidence) sourceEvidence.assetIds.push(asset.id);
  return { asset, sourceEvidence };
}

export async function previewCandidate(candidate: AssetCandidate, input: { agentId: string; presenceId?: string; sessionId?: string; environment?: "sandbox" | "live"; origin?: Asset["provenance"]["origin"]; semanticKind?: AssetSemanticKind }): Promise<{ asset: Asset }> {
  if (!candidate.mediaUrl) throw new Error("The candidate has no media URL to fetch.");
  const stored = await fetchPublicAssetPreview(candidate.mediaUrl);
  const retrievedAt = new Date().toISOString();
  const asset: Asset = { id: `asset_${crypto.randomUUID()}`, agentId: input.agentId, presenceId: input.presenceId, sessionId: input.sessionId, type: stored.mimeType === "image/gif" ? "gif" : stored.mimeType.startsWith("video/") ? "video" : "image", mediaKind: stored.mimeType === "image/gif" ? "gif" : stored.mimeType.startsWith("video/") ? "video" : "image", semanticKind: input.semanticKind, storage: stored, status: "ready", nature: "observed", rights: { status: "unknown" }, provenance: { origin: input.origin ?? "discovered", sourceUrl: candidate.mediaUrl, sourcePageUrl: candidate.sourcePageUrl, canonicalSourcePage: candidate.sourcePageUrl, publisher: candidate.assetPublisher ?? candidate.publisher, author: candidate.author, publishedAt: candidate.publishedAt, retrievedAt, acquisitionProvider: candidate.provider, importedAt: retrievedAt, sourceIdentityStatus: "unknown" }, description: candidate.title ?? candidate.name, visibility: "public", shareability: "presence-only", environment: input.environment ?? "sandbox", createdAt: retrievedAt, updatedAt: retrievedAt };
  return { asset };
}
