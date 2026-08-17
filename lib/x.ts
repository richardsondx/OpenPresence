import crypto from "node:crypto";
import type { Asset, EntityRef, ExecutionPermit, NativeChannelConnection, OpenPresenceState, PublicExpression } from "./types";
import { deleteChannelSecret, readChannelSecret, saveChannelSecret } from "./db";
import { readAssetBytes } from "./asset-store";
import { consumeExecutionPermit, PublicationSecurityError } from "./publication-security";
import { assertLiveWriteRuntimeAllowed, isXMockEnabled } from "./test-runtime";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  bearerToken?: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

export interface XAccount { id: string; username: string; name: string; profileImageUrl?: string; followers?: number; following?: number; }
interface XAccountResponse { id: string; username: string; name: string; profile_image_url?: string; public_metrics?: { followers_count?: number; following_count?: number; } }
export interface XReferencedPost { type: "replied_to" | "quoted" | "retweeted"; id: string; }
export interface XMediaAttachment { mediaKey: string; type: "photo" | "video" | "animated_gif"; url?: string; previewImageUrl?: string; altText?: string; }
export interface XRecentPost {
  id: string;
  text: string;
  language?: string;
  createdAt?: string;
  authorId?: string;
  authorUsername?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  conversationId?: string;
  parentId?: string;
  referencedPosts?: XReferencedPost[];
  media?: XMediaAttachment[];
}

const apiBase = () => (process.env.OPENPRESENCE_X_API_BASE_URL ?? "https://api.x.com").replace(/\/$/, "");
const uploadBase = () => (process.env.OPENPRESENCE_X_UPLOAD_BASE_URL ?? "https://upload.twitter.com").replace(/\/$/, "");
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const normalizeHandle = (handle: string) => handle.trim().replace(/^@/, "");

export function oauthHeader(method: string, url: string, credentials: XCredentials, query: Record<string, string> = {}, bodyParams: Record<string, string> = {}) {
  if (!credentials.accessToken || !credentials.accessTokenSecret) throw new Error("User access token and user access token secret are required for X write access.");
  const requestUrl = new URL(url);
  const baseUrl = `${requestUrl.origin}${requestUrl.pathname}`;
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  // OAuth 1.0a signs the query parameters once, separately from the base URL.
  // Callers pass the query explicitly so the same canonical values are used
  // for both the request URL and the signature. Never sign a URL containing
  // its query string as the OAuth base URL; doing so makes X reject reads with
  // a misleading invalid-credentials response.
  const signedQuery = Object.keys(query).length
    ? Object.entries(query)
    : [...requestUrl.searchParams.entries()];
  const pairs = [...signedQuery, ...Object.entries(bodyParams), ...Object.entries(oauth)].map(([key, value]) => [encode(key), encode(value)] as const);
  pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const parameterString = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  const base = [method.toUpperCase(), encode(baseUrl), encode(parameterString)].join("&");
  const signingKey = `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  oauth.oauth_signature = signature;
  return `OAuth ${Object.entries(oauth).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

function apiError(status: number, body: unknown) {
  const structuredErrors = typeof body === "object" && body && "errors" in body && Array.isArray(body.errors)
    ? body.errors.flatMap((item) => typeof item === "object" && item && "detail" in item && typeof item.detail === "string" ? [item.detail] : []).join("; ")
    : "";
  const providerMessage = structuredErrors || (typeof body === "object" && body && "detail" in body && typeof body.detail === "string"
    ? body.detail
    : typeof body === "object" && body && "title" in body && typeof body.title === "string"
      ? body.title
      : `X API request failed (${status}).`);
  const normalized = providerMessage.toLowerCase();
  if (normalized.includes("credits depleted") || normalized.includes("credit balance")) {
    return new Error("X has no API credits remaining for this app. Open the X Developer Console, check Billing and usage, add credits or choose a plan with API access, then try again.");
  }
  if (status === 401) return new Error("X rejected these credentials. Check that the API key, secret, and token values came from the same app, then regenerate them if needed.");
  if (status === 403) {
    const detail = providerMessage.toLowerCase() === "forbidden" || providerMessage.toLowerCase() === "access denied"
      ? "Check your app permissions and regenerate the Access Token and Secret with read and write access."
      : providerMessage;
    return new Error(`X rejected this action: ${detail}`);
  }
  if (status === 429) return new Error("X temporarily rate-limited this app. Wait and try the connection again.");
  return new Error(providerMessage);
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { Accept: "application/json", ...init.headers } });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw apiError(response.status, body);
  return body as T;
}

async function requestUpload(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${uploadBase()}${path}`, { ...init, headers: { Accept: "application/json", ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response.status, body);
  return body as Record<string, unknown>;
}

async function assetBytes(asset: Asset) {
  if (asset.dataUrl) {
    const match = asset.dataUrl.match(/^data:[^;,]+;base64,([\s\S]+)$/);
    if (!match) throw new Error(`Asset ${asset.id} is not a base64 data URL.`);
    return Buffer.from(match[1]!, "base64");
  }
  if (asset.storagePath) return readAssetBytes(asset.storagePath);
  throw new Error(`Asset ${asset.id} has no stored media bytes.`);
}

async function uploadXMedia(credentials: XCredentials, asset: Asset): Promise<string> {
  const bytes = await assetBytes(asset);
  const mimeType = asset.mimeType ?? asset.storage?.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
  const isVideo = asset.type === "video" || mimeType.startsWith("video/");
  const url = `${uploadBase()}/1.1/media/upload.json`;
  if (!isVideo) {
    const form = new FormData();
    form.append("media", new Blob([bytes], { type: mimeType }), asset.description ?? `${asset.id}.${mimeType.split("/")[1] ?? "bin"}`);
    const body = await requestUpload("/1.1/media/upload.json", { method: "POST", headers: { Authorization: oauthHeader("POST", url, credentials) }, body: form });
    const mediaId = typeof body.media_id_string === "string" ? body.media_id_string : typeof body.media_id === "number" ? String(body.media_id) : undefined;
    if (!mediaId) throw new Error("X accepted the media upload without returning a media ID.");
    return mediaId;
  }
  const initParams = { command: "INIT", total_bytes: String(bytes.byteLength), media_type: mimeType, media_category: "tweet_video" };
  const init = await requestUpload("/1.1/media/upload.json", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: oauthHeader("POST", url, credentials, {}, initParams) }, body: new URLSearchParams(initParams) });
  const mediaId = typeof init.media_id_string === "string" ? init.media_id_string : typeof init.media_id === "number" ? String(init.media_id) : undefined;
  if (!mediaId) throw new Error("X did not return a media ID for video upload initialization.");
  const chunkSize = 4 * 1024 * 1024;
  for (let segmentIndex = 0; segmentIndex * chunkSize < bytes.byteLength; segmentIndex += 1) {
    const form = new FormData();
    const chunk = bytes.subarray(segmentIndex * chunkSize, Math.min(bytes.byteLength, (segmentIndex + 1) * chunkSize));
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(segmentIndex));
    form.append("media", new Blob([chunk], { type: mimeType }), asset.description ?? `${asset.id}.part`);
    await requestUpload("/1.1/media/upload.json", { method: "POST", headers: { Authorization: oauthHeader("POST", url, credentials, {}, { command: "APPEND", media_id: mediaId, segment_index: String(segmentIndex) }) }, body: form });
  }
  const finalizeParams = { command: "FINALIZE", media_id: mediaId };
  await requestUpload("/1.1/media/upload.json", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: oauthHeader("POST", url, credentials, {}, finalizeParams) }, body: new URLSearchParams(finalizeParams) });
  return mediaId;
}

function readAuthHeader(method: string, url: string, credentials: XCredentials, query: Record<string, string> = {}) {
  return credentials.accessToken && credentials.accessTokenSecret
    ? oauthHeader(method, url, credentials, query)
    : credentials.bearerToken
      ? `Bearer ${credentials.bearerToken}`
      : (() => { throw new Error("X read access requires a Bearer Token or User Access Token pair."); })();
}

function mockAccount(credentials: XCredentials, handle: string): XAccount | undefined {
  if (!isXMockEnabled()) return undefined;
  if (!credentials.apiKey.startsWith("test_") || !credentials.apiSecret.startsWith("test_")) return undefined;
  return { id: "mock-x-user", username: normalizeHandle(handle) || "openpresence_test", name: "OpenPresence Test" };
}

function normalizeAccount(account: XAccountResponse): XAccount {
  return { id: account.id, username: account.username, name: account.name, profileImageUrl: account.profile_image_url, followers: account.public_metrics?.followers_count, following: account.public_metrics?.following_count };
}

export interface XAudienceSnapshot { followers: number; following?: number; observedAt: string; }
export interface XPublicationMetrics { id: string; createdAt?: string; impressions?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; }

export async function testXCredentials(credentials: XCredentials, presenceHandle: string) {
  const mocked = mockAccount(credentials, presenceHandle);
  if (mocked) return { account: mocked, access: credentials.accessToken && credentials.accessTokenSecret ? "read-write" as const : "read" as const };

  if (credentials.accessToken && credentials.accessTokenSecret) {
    const url = `${apiBase()}/2/users/me`;
    const response = await requestJson<{ data?: XAccountResponse }>("/2/users/me?user.fields=name,username,profile_image_url,public_metrics", {
      method: "GET",
      headers: { Authorization: oauthHeader("GET", url, credentials, { "user.fields": "name,username,profile_image_url,public_metrics" }) },
    });
    if (!response.data) throw new Error("X authenticated-user response did not include an account.");
    return { account: normalizeAccount(response.data), access: "read-write" as const };
  }
  if (!credentials.bearerToken) throw new Error("Add a Bearer Token for read access, or add User Access Token and User Access Token Secret for read + write access.");
  const username = normalizeHandle(presenceHandle);
  if (!username) throw new Error("This X Presence needs a handle before it can test read access.");
  const response = await requestJson<{ data?: XAccountResponse }>(`/2/users/by/username/${encode(username)}?user.fields=name,username,profile_image_url,public_metrics`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.bearerToken}` },
  });
  if (!response.data) throw new Error("X public account lookup did not include an account.");
  return { account: normalizeAccount(response.data), access: "read" as const };
}

export async function readXAudienceSnapshot(credentials: XCredentials, accountId: string): Promise<XAudienceSnapshot | undefined> {
  if (isXMockEnabled() && credentials.apiKey.startsWith("test_")) return undefined;
  const query = { "user.fields": "public_metrics" };
  const queryString = new URLSearchParams(query).toString();
  const url = `${apiBase()}/2/users/${encode(accountId)}?${queryString}`;
  const response = await requestJson<{ data?: XAccountResponse }>(`/2/users/${encode(accountId)}?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, query) },
  });
  const metrics = response.data?.public_metrics;
  if (typeof metrics?.followers_count !== "number") return undefined;
  return { followers: metrics.followers_count, following: metrics.following_count, observedAt: new Date().toISOString() };
}

export async function publishSealedXPost(credentials: XCredentials, expression: PublicExpression, permit: ExecutionPermit, replyTo?: string, assets: Asset[] = [], quoteTweetId?: string): Promise<EntityRef> {
  assertLiveWriteRuntimeAllowed();
  const execution = { id: permit.executionId, socialIntentId: expression.socialIntentId, presenceId: expression.presenceId, affordance: permit.affordance, mode: "auto" as const, status: "queued" as const, attempts: 0, connector: "native" as const, idempotencyKey: permit.executionId, environment: "live" as const, publication: { id: expression.id, format: `${expression.channel}.${expression.affordance}`, payload: { text: expression.text }, assetIds: expression.mediaIds, links: [], publicExpression: expression, createdAt: expression.createdAt, environment: "live" as const }, permit, createdAt: expression.createdAt, updatedAt: expression.createdAt };
  try { consumeExecutionPermit(execution, expression); } catch (error) { throw error instanceof PublicationSecurityError ? error : new PublicationSecurityError("INVALID_PERMIT", "Live X write rejected."); }
  const url = `${apiBase()}/2/tweets`;
  const mediaIds = expression.mediaIds.length
    ? await Promise.all(expression.mediaIds.map((assetId) => {
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) throw new Error(`The live publication references missing asset ${assetId}.`);
      return uploadXMedia(credentials, asset);
    }))
    : [];
  const body: Record<string, unknown> = { text: expression.text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  if (quoteTweetId) body.quote_tweet_id = quoteTweetId;
  if (mediaIds.length) body.media = { media_ids: mediaIds };
  const response = await requestJson<{ data?: { id: string } }>("/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: oauthHeader("POST", url, credentials) },
    body: JSON.stringify(body),
  });
  if (!response.data?.id) throw new Error("X accepted the request without returning a post ID.");
  return { type: "x.post", id: response.data.id };
}

async function postXAction(credentials: XCredentials, path: string, body: Record<string, string>, resultType: string, resultId: string): Promise<EntityRef> {
  assertLiveWriteRuntimeAllowed();
  const url = `${apiBase()}${path}`;
  const response = await requestJson<{ data?: Record<string, unknown> }>(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: oauthHeader("POST", url, credentials) }, body: JSON.stringify(body) });
  if (!response.data) throw new Error(`X accepted ${resultType} without returning a verified result.`);
  return { type: resultType, id: resultId };
}

export function likeXPost(credentials: XCredentials, userId: string, postId: string) {
  return postXAction(credentials, `/2/users/${encode(userId)}/likes`, { tweet_id: postId }, "x.like", postId);
}

export function repostXPost(credentials: XCredentials, userId: string, postId: string) {
  return postXAction(credentials, `/2/users/${encode(userId)}/retweets`, { tweet_id: postId }, "x.repost", postId);
}

export function followXUser(credentials: XCredentials, userId: string, targetUserId: string) {
  return postXAction(credentials, `/2/users/${encode(userId)}/following`, { target_user_id: targetUserId }, "x.follow", targetUserId);
}

export async function readRecentXPosts(credentials: XCredentials, accountId: string, maxResults = 100): Promise<XRecentPost[]> {
  if (isXMockEnabled() && credentials.apiKey.startsWith("test_")) return [];
  const query = { "tweet.fields": "created_at,conversation_id,referenced_tweets,attachments,lang", expansions: "author_id,attachments.media_keys,referenced_tweets.id", "user.fields": "name,username,profile_image_url", "media.fields": "type,url,preview_image_url,alt_text", max_results: String(Math.min(100, Math.max(5, maxResults))) };
  const queryString = new URLSearchParams(query).toString();
  const url = `${apiBase()}/2/users/${encode(accountId)}/tweets?${queryString}`;
  const response = await requestJson<XPostResponse>(`/2/users/${encode(accountId)}/tweets?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, query) },
  });
  return parseXPosts(response);
}

export async function readRecentXMentions(credentials: XCredentials, accountId: string, maxResults = 100): Promise<XRecentPost[]> {
  if (isXMockEnabled() && credentials.apiKey.startsWith("test_")) return [];
  const query = { expansions: "author_id,attachments.media_keys,referenced_tweets.id", "tweet.fields": "created_at,conversation_id,referenced_tweets,attachments,lang", "user.fields": "name,username,profile_image_url", "media.fields": "type,url,preview_image_url,alt_text", max_results: String(Math.min(100, Math.max(5, maxResults))) };
  const queryString = new URLSearchParams(query).toString();
  const url = `${apiBase()}/2/users/${encode(accountId)}/mentions?${queryString}`;
  const response = await requestJson<XPostResponse>(`/2/users/${encode(accountId)}/mentions?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, query) },
  });
  return parseXPosts(response);
}

/** Search recent public X posts for an Exploration. The query is compiled by OpenPresence before it reaches X. */
export async function searchRecentXPosts(credentials: XCredentials, query: string, maxResults = 25): Promise<XRecentPost[]> {
  const clean = query.trim().slice(0, 512);
  if (!clean) return [];
  if (isXMockEnabled() && credentials.apiKey.startsWith("test_")) return [];
  const searchQuery = /(?:^|\s)-is:retweet(?:\s|$)/i.test(clean) ? clean : `${clean} -is:retweet`;
  const params = {
    query: searchQuery,
    "tweet.fields": "created_at,conversation_id,author_id,lang",
    expansions: "author_id",
    "user.fields": "name,username,profile_image_url",
    max_results: String(Math.min(100, Math.max(10, maxResults))),
  };
  const queryString = new URLSearchParams(params).toString();
  const url = `${apiBase()}/2/tweets/search/recent?${queryString}`;
  const response = await requestJson<XPostResponse>(`/2/tweets/search/recent?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, params) },
  });
  return parseXPosts(response);
}

interface XPostRecord {
    id?: string;
    text?: string;
    lang?: string;
    created_at?: string;
    author_id?: string;
    conversation_id?: string;
    referenced_tweets?: Array<{ type?: string; id?: string }>;
    attachments?: { media_keys?: string[] };
    public_metrics?: { impression_count?: number; like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number };
}

interface XPostResponse {
  data?: XPostRecord[];
  includes?: {
    users?: Array<{ id?: string; username?: string; name?: string; profile_image_url?: string }>;
    media?: Array<{ media_key?: string; type?: string; url?: string; preview_image_url?: string; alt_text?: string }>;
  };
}

function parseXPosts(response: XPostResponse): XRecentPost[] {
  const users = new Map((response.includes?.users ?? []).filter((user) => user.id).map((user) => [user.id!, user]));
  const media = new Map((response.includes?.media ?? []).filter((item) => item.media_key).map((item) => [item.media_key!, item]));
  return (response.data ?? []).flatMap((item) => {
    if (typeof item.id !== "string" || typeof item.text !== "string") return [];
    return [{
      id: item.id,
      text: item.text,
      language: item.lang,
      createdAt: item.created_at,
      authorId: item.author_id,
      authorUsername: item.author_id ? users.get(item.author_id)?.username : undefined,
      authorName: item.author_id ? users.get(item.author_id)?.name : undefined,
      authorAvatarUrl: item.author_id ? users.get(item.author_id)?.profile_image_url : undefined,
      conversationId: item.conversation_id,
      parentId: item.referenced_tweets?.find((reference) => reference.type === "replied_to")?.id,
      referencedPosts: item.referenced_tweets?.filter((reference): reference is XReferencedPost => ["replied_to", "quoted", "retweeted"].includes(reference.type ?? "") && typeof reference.id === "string").map((reference) => ({ type: reference.type as XReferencedPost["type"], id: reference.id })),
      media: (item.attachments?.media_keys ?? []).flatMap((key) => {
        const attached = media.get(key);
        if (!attached || !["photo", "video", "animated_gif"].includes(attached.type ?? "")) return [];
        return [{ mediaKey: key, type: attached.type as XMediaAttachment["type"], url: attached.url, previewImageUrl: attached.preview_image_url, altText: attached.alt_text }];
      }),
    }];
  });
}

/** Fetch specific posts and any referenced posts X expands alongside them. */
export async function readXPostsByIds(credentials: XCredentials, ids: string[]): Promise<XRecentPost[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!uniqueIds.length) return [];
  if (isXMockEnabled() && credentials.apiKey.startsWith("test_")) return [];
  const query = {
    ids: uniqueIds.join(","),
    "tweet.fields": "created_at,conversation_id,referenced_tweets,attachments,lang",
    expansions: "author_id,attachments.media_keys,referenced_tweets.id",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "type,url,preview_image_url,alt_text",
  };
  const queryString = new URLSearchParams(query).toString();
  const url = `${apiBase()}/2/tweets?${queryString}`;
  const response = await requestJson<XPostResponse & { includes?: XPostResponse["includes"] }>(`/2/tweets?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, query) },
  });
  return parseXPosts({ data: [...(response.data ?? []), ...((response as XPostResponse).includes as { tweets?: NonNullable<XPostResponse["data"]> } | undefined)?.tweets ?? []], includes: response.includes });
}

export async function readXPublicationMetrics(credentials: XCredentials, ids: string[]): Promise<XPublicationMetrics[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!uniqueIds.length || (isXMockEnabled() && credentials.apiKey.startsWith("test_"))) return [];
  const query = { ids: uniqueIds.join(","), "tweet.fields": "created_at,public_metrics" };
  const queryString = new URLSearchParams(query).toString();
  const url = `${apiBase()}/2/tweets?${queryString}`;
  const response = await requestJson<{ data?: XPostRecord[] }>(`/2/tweets?${queryString}`, {
    method: "GET",
    headers: { Authorization: readAuthHeader("GET", url, credentials, query) },
  });
  return (response.data ?? []).flatMap((post) => post.id && post.public_metrics ? [{ id: post.id, createdAt: post.created_at, impressions: post.public_metrics.impression_count, likes: post.public_metrics.like_count, replies: post.public_metrics.reply_count, reposts: post.public_metrics.retweet_count, quotes: post.public_metrics.quote_count }] : []);
}

export function nativeXFor(state: OpenPresenceState, presenceId: string) {
  return state.nativeConnections.find((connection) => connection.presenceId === presenceId && connection.channelId === "x" && connection.status === "connected");
}

export function upsertNativeXConnection(source: OpenPresenceState, input: { presenceId: string; id: string; account: XAccount; access: "read" | "read-write" }): OpenPresenceState {
  const state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const timestamp = new Date().toISOString();
  const existing = state.nativeConnections.find((connection) => connection.presenceId === input.presenceId && connection.kind === "x");
  const connection: NativeChannelConnection = { id: existing?.id ?? input.id, presenceId: input.presenceId, channelId: "x", kind: "x", status: "connected", access: input.access, account: input.account, observation: existing?.observation, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
  state.nativeConnections = [connection, ...state.nativeConnections.filter((item) => item.id !== connection.id && item.presenceId !== input.presenceId)];
  return state;
}

export function disconnectNativeX(source: OpenPresenceState, presenceId: string) {
  const state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const connection = state.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x");
  if (connection) deleteChannelSecret(connection.id);
  state.nativeConnections = state.nativeConnections.filter((item) => item.presenceId !== presenceId || item.kind !== "x");
  return state;
}

export function saveNativeXCredentials(connectionId: string, credentials: XCredentials) {
  saveChannelSecret(connectionId, credentials);
}

export function readNativeXCredentials(connectionId: string): XCredentials | undefined {
  return readChannelSecret(connectionId) as XCredentials | undefined;
}

export { deleteChannelSecret };
