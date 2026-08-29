import crypto from "node:crypto";
import type { RuntimeScope } from "./types";

const COOKIE_NAME = "openpresence-runtime-scope";
const TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  return process.env.OPENPRESENCE_RUNTIME_SCOPE_SECRET?.trim()
    || crypto.createHash("sha256").update(`${process.cwd()}:openpresence-runtime-scope`).digest("hex");
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function runtimeScopeCookieName() { return COOKIE_NAME; }

export function issueRuntimeScopeCookie(scope: RuntimeScope, issuedAt = Date.now()) {
  const payload = encode({ agentId: scope.agentId, presenceId: scope.presenceId, environment: scope.environment, issuedAt, expiresAt: issuedAt + TTL_MS });
  return `${payload}.${signature(payload)}`;
}

export function readRuntimeScopeCookie(cookieHeader: string | null): { agentId: string; presenceId?: string; environment: RuntimeScope["environment"] } | undefined {
  const raw = cookieHeader?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!raw) return undefined;
  const [payload, receivedSignature] = raw.split(".");
  if (!payload || !receivedSignature) return undefined;
  const expectedSignature = Buffer.from(signature(payload));
  const actualSignature = Buffer.from(receivedSignature);
  if (expectedSignature.length !== actualSignature.length || !crypto.timingSafeEqual(expectedSignature, actualSignature)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { agentId?: unknown; presenceId?: unknown; environment?: unknown; expiresAt?: unknown };
    if (typeof value.agentId !== "string" || !value.agentId || (typeof value.expiresAt !== "number" || value.expiresAt < Date.now())) return undefined;
    const environment = value.environment === "sandbox" ? "sandbox" : "live";
    return { agentId: value.agentId, presenceId: typeof value.presenceId === "string" ? value.presenceId : undefined, environment };
  } catch { return undefined; }
}

export function setRuntimeScopeCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, scope: RuntimeScope) {
  response.cookies.set(COOKIE_NAME, issueRuntimeScopeCookie(scope), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: Math.floor(TTL_MS / 1000) });
}
