import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { configuredGrant } from "../lib/v2/auth";
import { registerClient, beginAuthorization, approveAuthorization, issueToken, oauthGrant, revokeToken } from "../lib/v2/oauth";

const key = "v2-test-connection-key-not-real-000000000000";
const origin = "https://openpresence.example";
let dir: string;
const previous = { grants: process.env.OPENPRESENCE_V2_GRANTS, dir: process.env.OPENPRESENCE_V2_DATA_DIR, origin: process.env.OPENPRESENCE_V2_PUBLIC_URL };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openpresence-v2-auth-"));
  process.env.OPENPRESENCE_V2_DATA_DIR = dir;
  process.env.OPENPRESENCE_V2_PUBLIC_URL = origin;
  process.env.OPENPRESENCE_V2_GRANTS = JSON.stringify([{ token: key, tenantId: "isolated", scopes: ["social:read", "social:write"] }]);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [name, value] of [["OPENPRESENCE_V2_GRANTS", previous.grants], ["OPENPRESENCE_V2_DATA_DIR", previous.dir], ["OPENPRESENCE_V2_PUBLIC_URL", previous.origin]]) {
    if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
  }
});
const formRequest = (path: string, values: Record<string, string>, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(values) });
async function authorize() {
  const response = await registerClient(new Request(`${origin}/api/v2/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: ["https://host.example/callback"], client_name: "Test host" }) }));
  expect(response.status).toBe(201);
  const { client_id: clientId } = await response.json();
  const verifier = "a".repeat(64), challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: "https://host.example/callback", response_type: "code", code_challenge_method: "S256", code_challenge: challenge, state: "original-state", scope: "social:read", resource: `${origin}/api/v2/mcp` });
  const page = beginAuthorization(new Request(`${origin}/api/v2/oauth/authorize?${params}`));
  expect(page.status).toBe(200);
  const cookie = page.headers.get("set-cookie")!.split(";")[0];
  const requestId = (await page.text()).match(/name="request_id" value="([^"]+)"/)![1];
  const result = await approveAuthorization(formRequest("/api/v2/oauth/authorize", { request_id: requestId, connection_key: key }, { cookie, origin }));
  expect(result.status).toBe(303);
  const callback = new URL(result.headers.get("location")!);
  expect(callback.searchParams.get("state")).toBe("original-state");
  return { clientId, verifier, code: callback.searchParams.get("code")! };
}

describe("V2 scoped authorization", () => {
  it("requires explicit strong grants and respects expiry", () => {
    expect(configuredGrant("wrong")).toBeUndefined();
    expect(configuredGrant(key)?.tenantId).toBe("isolated");
    process.env.OPENPRESENCE_V2_GRANTS = JSON.stringify([{ token: key, tenantId: "isolated", expiresAt: "2000-01-01" }]);
    expect(configuredGrant(key)).toBeUndefined();
  });
  it("rejects unsafe redirects and missing PKCE", async () => {
    const result = await registerClient(new Request(`${origin}/api/v2/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: ["http://remote.example/callback"] }) }));
    expect(result.status).toBe(400);
    expect(beginAuthorization(new Request(`${origin}/api/v2/oauth/authorize?client_id=unknown`)).status).toBe(400);
  });
  it("issues bound tokens, rejects code replay, rotates refresh and revokes access", async () => {
    const auth = await authorize();
    const fields = { grant_type: "authorization_code", client_id: auth.clientId, code: auth.code, code_verifier: auth.verifier, redirect_uri: "https://host.example/callback", resource: `${origin}/api/v2/mcp` };
    const response = await issueToken(formRequest("/api/v2/oauth/token", fields));
    expect(response.status).toBe(200);
    const tokens = await response.json();
    const grant = oauthGrant(tokens.access_token, new Request(`${origin}/api/v2/mcp`));
    expect(grant?.tenantId).toBe("isolated"); expect(grant?.scopes).toEqual(["social:read"]);
    expect((await issueToken(formRequest("/api/v2/oauth/token", fields))).status).toBe(400);
    const refreshFields = { grant_type: "refresh_token", client_id: auth.clientId, refresh_token: tokens.refresh_token };
    const refreshed = await issueToken(formRequest("/api/v2/oauth/token", refreshFields));
    expect(refreshed.status).toBe(200);
    expect((await issueToken(formRequest("/api/v2/oauth/token", refreshFields))).status).toBe(400);
    const next = await refreshed.json();
    await revokeToken(formRequest("/api/v2/oauth/revoke", { client_id: auth.clientId, token: next.refresh_token }));
    expect(oauthGrant(next.access_token, new Request(`${origin}/api/v2/mcp`))).toBeUndefined();
    expect(oauthGrant(tokens.access_token, new Request(`${origin}/api/v2/mcp`))).toBeUndefined();
  });
  it("does not redeem wrong PKCE or consent without browser origin", async () => {
    const auth = await authorize();
    expect((await issueToken(formRequest("/api/v2/oauth/token", { grant_type: "authorization_code", client_id: auth.clientId, code: auth.code, code_verifier: "b".repeat(64), redirect_uri: "https://host.example/callback" }))).status).toBe(400);
    expect((await approveAuthorization(formRequest("/api/v2/oauth/authorize", { request_id: "missing", connection_key: key }))).status).toBe(403);
  });
  it("revokes issued access when the underlying grant is removed", async () => {
    const auth = await authorize();
    const response = await issueToken(formRequest("/api/v2/oauth/token", { grant_type: "authorization_code", client_id: auth.clientId, code: auth.code, code_verifier: auth.verifier, redirect_uri: "https://host.example/callback" }));
    const tokens = await response.json();
    process.env.OPENPRESENCE_V2_GRANTS = "[]";
    expect(oauthGrant(tokens.access_token, new Request(`${origin}/api/v2/mcp`))).toBeUndefined();
  });
  it("does not carry OAuth identity across operator tenant remapping", async () => {
    const auth = await authorize();
    const response = await issueToken(formRequest("/api/v2/oauth/token", { grant_type: "authorization_code", client_id: auth.clientId, code: auth.code, code_verifier: auth.verifier, redirect_uri: "https://host.example/callback" }));
    const tokens = await response.json();
    process.env.OPENPRESENCE_V2_GRANTS = JSON.stringify([{ token: key, tenantId: "different-tenant", scopes: ["social:read"] }]);
    expect(oauthGrant(tokens.access_token, new Request(`${origin}/api/v2/mcp`))).toBeUndefined();
  });
});
