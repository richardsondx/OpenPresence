import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { configuredGrant, activeConfiguredGrant, hashToken, V2_SCOPES, v2PublicOrigin, v2ResourceUrl, type V2Grant } from "./auth";

const opaque = () => randomBytes(32).toString("base64url");
function db() {
  const dir = process.env.OPENPRESENCE_V2_DATA_DIR ?? join(process.cwd(), "data", "v2");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "auth.sqlite");
  const database = new Database(path);
  chmodSync(path, 0o600);
  database.pragma("journal_mode = WAL");
  database.exec(`CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, redirects TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_pending (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_codes (hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_tokens (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);`);
  const now = Date.now();
  for (const table of ["oauth_pending", "oauth_codes", "oauth_tokens"]) database.prepare(`DELETE FROM ${table} WHERE expires < ?`).run(now);
  return database;
}
function withDb<T>(fn: (database: Database.Database) => T) { const database = db(); try { return fn(database); } finally { database.close(); } }
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
function failure(error: string, description: string, status = 400) { return json({ error, error_description: description }, status); }
async function boundedText(request: Request): Promise<string | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return undefined;
  const reader = request.body?.getReader(); if (!reader) return "";
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 16384) { await reader.cancel(); return undefined; } chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function currentGrant(saved: V2Grant): V2Grant | undefined {
  const current = activeConfiguredGrant(saved.grantHash);
  if (!current || current.tenantId !== saved.tenantId) return undefined;
  return { ...saved, scopes: saved.scopes.filter(scope => current.scopes.includes(scope)) };
}
type Authorization = { clientId: string; redirectUri: string; state?: string; challenge: string; resource: string; scopes: string[] };
type TokenPayload = { clientId: string; resource: string; grant: V2Grant };
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function oauthMetadata(request: Request) {
  const origin = v2PublicOrigin(request);
  return json({ issuer: origin, authorization_endpoint: `${origin}/api/v2/oauth/authorize`, token_endpoint: `${origin}/api/v2/oauth/token`, registration_endpoint: `${origin}/api/v2/oauth/register`, revocation_endpoint: `${origin}/api/v2/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], scopes_supported: V2_SCOPES });
}
export function protectedResourceMetadata(request: Request) {
  return json({ resource: v2ResourceUrl(request), authorization_servers: [v2PublicOrigin(request)], bearer_methods_supported: ["header"], scopes_supported: V2_SCOPES, resource_name: "OpenPresence social intelligence" });
}
export async function registerClient(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return failure("invalid_client_metadata", "Request too large", 413);
  let body;
  try { const text = await boundedText(request); if (text === undefined) return failure("invalid_client_metadata", "Request too large", 413); body = JSON.parse(text); } catch { return failure("invalid_client_metadata", "Expected JSON"); }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") return failure("invalid_client_metadata", "Only public clients with PKCE are supported");
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 10) return failure("invalid_redirect_uri", "Register 1–10 redirect URIs");
  const redirects: string[] = [];
  for (const uri of body.redirect_uris) {
    try { const url = new URL(uri); if (url.hash || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error(); redirects.push(url.href); } catch { return failure("invalid_redirect_uri", "Redirects must be HTTPS or local loopback HTTP"); }
  }
  const clientId = opaque();
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "Personal AI agent";
  const inserted = withDb(database => {
    if ((database.prepare("SELECT COUNT(*) AS count FROM oauth_clients").get() as { count: number }).count >= 1000) return false;
    database.prepare("INSERT INTO oauth_clients VALUES (?, ?, ?)").run(clientId, JSON.stringify(redirects), name); return true;
  });
  if (!inserted) return failure("temporarily_unavailable", "Client registration capacity reached", 503);
  return json({ client_id: clientId, client_name: name, redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201);
}

export function beginAuthorization(request: Request) {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id") ?? "";
  const client = withDb(database => database.prepare("SELECT * FROM oauth_clients WHERE id = ?").get(clientId)) as { redirects: string; name: string } | undefined;
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!client || !JSON.parse(client.redirects).includes(redirectUri)) return failure("invalid_request", "Unknown client or unregistered redirect URI");
  const challenge = params.get("code_challenge") ?? "";
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return failure("invalid_request", "Authorization code with S256 PKCE required");
  const resource = params.get("resource") ?? v2ResourceUrl(request);
  if (resource !== v2ResourceUrl(request)) return failure("invalid_target", "Unknown resource");
  const scopes = (params.get("scope") ?? V2_SCOPES.join(" ")).split(" ").filter(Boolean);
  if (!scopes.length || scopes.some(scope => !V2_SCOPES.includes(scope))) return failure("invalid_scope", "Unsupported scope");
  const id = opaque(), csrf = opaque();
  const payload: Authorization = { clientId, redirectUri, state: params.get("state") ?? undefined, challenge, resource, scopes };
  const inserted = withDb(database => {
    if ((database.prepare("SELECT COUNT(*) AS count FROM oauth_pending").get() as { count: number }).count >= 1000) return false;
    database.prepare("INSERT INTO oauth_pending VALUES (?, ?, ?, ?)").run(id, hashToken(csrf), JSON.stringify(payload), Date.now() + 600000); return true;
  });
  if (!inserted) return failure("temporarily_unavailable", "Authorization capacity reached", 503);
  // Chromium applies form-action to redirect destinations as well as the POST.
  // This origin comes only from the validated, exactly registered redirect URI.
  const callbackOrigin = new URL(redirectUri).origin;
  const secure = v2PublicOrigin(request).startsWith("https:") ? "; Secure" : "";
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect OpenPresence</title><body><main><h1>Connect OpenPresence</h1><p>${esc(client.name)} requests access to your social workspace.</p><p>Requested permissions: ${esc(scopes.join(", "))}.</p><p>Enter the connection key configured by your OpenPresence operator. This key selects your workspace; it is never shared with the agent.</p><form method="post" action="/api/v2/oauth/authorize"><input type="hidden" name="request_id" value="${id}"><label>Connection key <input name="connection_key" type="password" required autocomplete="off"></label><button type="submit">Authorize connection</button></form><p>Close this page to decline.</p></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": `op_v2_consent=${csrf}; HttpOnly; SameSite=Lax; Path=/api/v2/oauth/authorize; Max-Age=600${secure}`, "Content-Security-Policy": `default-src 'none'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`, "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff" } });
}

export async function approveAuthorization(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== v2PublicOrigin(request)) return failure("access_denied", "Invalid consent origin", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return failure("invalid_request", "Request too large", 413);
  const text = await boundedText(request); if (text === undefined) return failure("invalid_request", "Request too large", 413);
  const form = new URLSearchParams(text);
  const id = form.get("request_id") ?? "";
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)op_v2_consent=([^;]+)/)?.[1] ?? "";
  const grant = configuredGrant(form.get("connection_key") ?? "");
  if (!grant) return failure("access_denied", "Invalid or expired connection key", 403);
  const code = opaque();
  const result = withDb(database => database.transaction(() => {
    const pending = database.prepare("SELECT * FROM oauth_pending WHERE id = ?").get(id) as { csrf: string; payload: string } | undefined;
    if (!pending || hashToken(cookie) !== pending.csrf) return undefined;
    const payload = JSON.parse(pending.payload) as Authorization;
    if (payload.scopes.some(scope => !grant.scopes.includes(scope))) return undefined;
    database.prepare("DELETE FROM oauth_pending WHERE id = ?").run(id);
    database.prepare("INSERT INTO oauth_codes VALUES (?, ?, ?)").run(hashToken(code), JSON.stringify({ ...payload, grant: { ...grant, scopes: payload.scopes } }), Date.now() + 60000);
    return payload;
  })());
  if (!result) return failure("access_denied", "Consent expired or permissions unavailable", 403);
  const redirect = new URL(result.redirectUri); redirect.searchParams.set("code", code); if (result.state !== undefined) redirect.searchParams.set("state", result.state);
  return new Response(null, { status: 303, headers: { Location: redirect.href, "Cache-Control": "no-store", "Set-Cookie": "op_v2_consent=; HttpOnly; SameSite=Lax; Path=/api/v2/oauth/authorize; Max-Age=0" } });
}

export async function issueToken(request: Request) {
  const text = await boundedText(request); if (text === undefined) return failure("invalid_request", "Request too large", 413);
  const form = new URLSearchParams(text);
  const kind = form.get("grant_type");
  if (kind !== "authorization_code" && kind !== "refresh_token") return failure("unsupported_grant_type", "Unsupported grant type");
  const credential = kind === "authorization_code" ? form.get("code") : form.get("refresh_token");
  if (!credential) return failure("invalid_grant", "Missing credential");
  const access = opaque(), refresh = opaque();
  const result = withDb(database => database.transaction(() => {
    const table = kind === "authorization_code" ? "oauth_codes" : "oauth_tokens";
    const row = database.prepare(`SELECT * FROM ${table} WHERE hash = ?`).get(hashToken(credential)) as { payload: string; kind?: string } | undefined;
    if (!row || (kind === "refresh_token" && row.kind !== "refresh")) return undefined;
    const payload = JSON.parse(row.payload) as TokenPayload & Authorization;
    const grant = currentGrant(payload.grant);
    if (payload.clientId !== form.get("client_id") || !grant) return undefined;
    if (form.get("resource") && form.get("resource") !== payload.resource) return undefined;
    if (kind === "authorization_code") {
      const verifier = form.get("code_verifier") ?? "";
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || payload.redirectUri !== form.get("redirect_uri") || createHash("sha256").update(verifier).digest("base64url") !== payload.challenge) return undefined;
    }
    database.prepare(`DELETE FROM ${table} WHERE hash = ?`).run(hashToken(credential));
    const tokens: TokenPayload = { clientId: payload.clientId, resource: payload.resource, grant };
    database.prepare("INSERT INTO oauth_tokens VALUES (?, ?, ?, ?)").run(hashToken(access), "access", JSON.stringify(tokens), Date.now() + 3600000);
    database.prepare("INSERT INTO oauth_tokens VALUES (?, ?, ?, ?)").run(hashToken(refresh), "refresh", JSON.stringify(tokens), Date.now() + 30 * 86400000);
    return tokens;
  })());
  if (!result) return failure("invalid_grant", "Invalid, expired, revoked, or already used credential");
  return json({ access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: result.grant.scopes.join(" ") });
}

export function oauthGrant(token: string, request: Request): V2Grant | undefined {
  const row = withDb(database => database.prepare("SELECT payload FROM oauth_tokens WHERE hash = ? AND kind = 'access'").get(hashToken(token))) as { payload: string } | undefined;
  if (!row) return undefined;
  const payload = JSON.parse(row.payload) as TokenPayload;
  return payload.resource === v2ResourceUrl(request) ? currentGrant(payload.grant) : undefined;
}
export async function revokeToken(request: Request) {
  const text = await boundedText(request); if (text === undefined) return failure("invalid_request", "Request too large", 413);
  const form = new URLSearchParams(text), token = form.get("token");
  if (token) withDb(database => {
    const row = database.prepare("SELECT payload FROM oauth_tokens WHERE hash = ?").get(hashToken(token)) as { payload: string } | undefined;
    if (row && (JSON.parse(row.payload) as TokenPayload).clientId === form.get("client_id")) {
      // Revoke the originating client grant, including paired refresh/access tokens.
      const payload = JSON.parse(row.payload) as TokenPayload;
      for (const candidate of database.prepare("SELECT hash, payload FROM oauth_tokens").all() as { hash: string; payload: string }[]) {
        const other = JSON.parse(candidate.payload) as TokenPayload;
        if (other.clientId === payload.clientId && other.grant.grantHash === payload.grant.grantHash) database.prepare("DELETE FROM oauth_tokens WHERE hash = ?").run(candidate.hash);
      }
    }
  });
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
