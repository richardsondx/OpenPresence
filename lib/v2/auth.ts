import { createHash, timingSafeEqual } from "node:crypto";

export type V2Grant = { tenantId: string; scopes: string[]; grantHash: string };
export const V2_SCOPES = ["social:read", "social:write"];
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

// Explicit grants only. Never infer a tenant from caller-controlled tool arguments.
export function configuredGrant(token: string): V2Grant | undefined {
  let rows: unknown;
  try { rows = JSON.parse(process.env.OPENPRESENCE_V2_GRANTS ?? "[]"); } catch { return undefined; }
  if (!Array.isArray(rows) || token.length < 32) return undefined;
  const digest = hashToken(token);
  for (const row of rows) {
    if (!row || typeof row.token !== "string" || row.token.length < 32 || typeof row.tenantId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.tenantId)) continue;
    if (row.expiresAt && (!Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= Date.now())) continue;
    if (timingSafeEqual(Buffer.from(hashToken(row.token)), Buffer.from(digest))) {
      const scopes = Array.isArray(row.scopes) ? row.scopes.filter((scope: unknown) => typeof scope === "string" && V2_SCOPES.includes(scope)) : V2_SCOPES;
      return { tenantId: row.tenantId, scopes, grantHash: digest };
    }
  }
  return undefined;
}

export function grantStillActive(grantHash: string): boolean {
  return !!activeConfiguredGrant(grantHash);
}
export function activeConfiguredGrant(grantHash: string): V2Grant | undefined {
  let rows: unknown;
  try { rows = JSON.parse(process.env.OPENPRESENCE_V2_GRANTS ?? "[]"); } catch { return undefined; }
  if (!Array.isArray(rows)) return undefined;
  for (const row of rows) if (row && typeof row.token === "string" && hashToken(row.token) === grantHash) return configuredGrant(row.token);
  return undefined;
}

export function v2PublicOrigin(request?: Request): string {
  const configured = process.env.OPENPRESENCE_V2_PUBLIC_URL;
  const url = new URL(configured ?? request?.url ?? "http://localhost:3015");
  if (!configured && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Configure OPENPRESENCE_V2_PUBLIC_URL for remote connections");
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("V2 remote connections require HTTPS");
  return url.origin;
}

export function v2ResourceUrl(request?: Request) { return `${v2PublicOrigin(request)}/api/v2/mcp`; }
export function isReadTool(name: string) { return !["update_social_profile", "record_social_activity", "record_social_feedback", "register_social_experiment", "review_social_results", "record_host_plan"].includes(name); }
