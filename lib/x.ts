import crypto from "node:crypto";
import type { EntityRef, NativeChannelConnection, OpenPresenceState } from "./types";
import { deleteChannelSecret, readChannelSecret, saveChannelSecret } from "./db";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  bearerToken?: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

export interface XAccount { id: string; username: string; name: string; }

const apiBase = () => (process.env.OPENPRESENCE_X_API_BASE_URL ?? "https://api.x.com").replace(/\/$/, "");
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const normalizeHandle = (handle: string) => handle.trim().replace(/^@/, "");

function oauthHeader(method: string, url: string, credentials: XCredentials, query: Record<string, string> = {}) {
  if (!credentials.accessToken || !credentials.accessTokenSecret) throw new Error("User access token and user access token secret are required for X write access.");
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const pairs = Object.entries({ ...query, ...oauth }).flatMap(([key, value]) => [[encode(key), encode(value)] as const]);
  pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const parameterString = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  const base = [method.toUpperCase(), encode(url), encode(parameterString)].join("&");
  const signingKey = `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  oauth.oauth_signature = signature;
  return `OAuth ${Object.entries(oauth).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

function apiError(status: number, body: unknown) {
  const providerMessage = typeof body === "object" && body && "detail" in body && typeof body.detail === "string"
    ? body.detail
    : typeof body === "object" && body && "title" in body && typeof body.title === "string"
      ? body.title
      : `X API request failed (${status}).`;
  const normalized = providerMessage.toLowerCase();
  if (normalized.includes("credits depleted") || normalized.includes("credit balance")) {
    return new Error("X has no API credits remaining for this app. Open the X Developer Console, check Billing and usage, add credits or choose a plan with API access, then try again.");
  }
  if (status === 401) return new Error("X rejected these credentials. Check that the API key, secret, and token values came from the same app, then regenerate them if needed.");
  if (status === 403) return new Error("X rejected this action. Check your app permissions and regenerate the Access Token and Secret with read and write access.");
  if (status === 429) return new Error("X temporarily rate-limited this app. Wait and try the connection again.");
  return new Error(providerMessage);
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { Accept: "application/json", ...init.headers } });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw apiError(response.status, body);
  return body as T;
}

function mockAccount(credentials: XCredentials, handle: string): XAccount | undefined {
  if (process.env.OPENPRESENCE_X_API_MOCK !== "1") return undefined;
  if (!credentials.apiKey.startsWith("test_") || !credentials.apiSecret.startsWith("test_")) return undefined;
  return { id: "mock-x-user", username: normalizeHandle(handle) || "openpresence_test", name: "OpenPresence Test" };
}

export async function testXCredentials(credentials: XCredentials, presenceHandle: string) {
  const mocked = mockAccount(credentials, presenceHandle);
  if (mocked) return { account: mocked, access: credentials.accessToken && credentials.accessTokenSecret ? "read-write" as const : "read" as const };

  if (credentials.accessToken && credentials.accessTokenSecret) {
    const url = `${apiBase()}/2/users/me`;
    const response = await requestJson<{ data?: XAccount }>("/2/users/me?user.fields=name,username", {
      method: "GET",
      headers: { Authorization: oauthHeader("GET", url, credentials, { "user.fields": "name,username" }) },
    });
    if (!response.data) throw new Error("X authenticated-user response did not include an account.");
    return { account: response.data, access: "read-write" as const };
  }
  if (!credentials.bearerToken) throw new Error("Add a Bearer Token for read access, or add User Access Token and User Access Token Secret for read + write access.");
  const username = normalizeHandle(presenceHandle);
  if (!username) throw new Error("This X Presence needs a handle before it can test read access.");
  const response = await requestJson<{ data?: XAccount }>(`/2/users/by/username/${encode(username)}?user.fields=name,username`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.bearerToken}` },
  });
  if (!response.data) throw new Error("X public account lookup did not include an account.");
  return { account: response.data, access: "read" as const };
}

export async function publishXPost(credentials: XCredentials, text: string, replyTo?: string): Promise<EntityRef> {
  if (process.env.OPENPRESENCE_X_API_MOCK === "1" && credentials.apiKey.startsWith("test_") && credentials.accessToken) return { type: "x.post", id: "mock-post-1" };
  const url = `${apiBase()}/2/tweets`;
  const body = replyTo ? { text, reply: { in_reply_to_tweet_id: replyTo } } : { text };
  const response = await requestJson<{ data?: { id: string } }>("/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: oauthHeader("POST", url, credentials) },
    body: JSON.stringify(body),
  });
  if (!response.data?.id) throw new Error("X accepted the request without returning a post ID.");
  return { type: "x.post", id: response.data.id };
}

export function nativeXFor(state: OpenPresenceState, presenceId: string) {
  return state.nativeConnections.find((connection) => connection.presenceId === presenceId && connection.channelId === "x" && connection.status === "connected");
}

export function upsertNativeXConnection(source: OpenPresenceState, input: { presenceId: string; id: string; account: XAccount; access: "read" | "read-write" }): OpenPresenceState {
  const state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const timestamp = new Date().toISOString();
  const existing = state.nativeConnections.find((connection) => connection.presenceId === input.presenceId && connection.kind === "x");
  const connection: NativeChannelConnection = { id: existing?.id ?? input.id, presenceId: input.presenceId, channelId: "x", kind: "x", status: "connected", access: input.access, account: input.account, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
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
