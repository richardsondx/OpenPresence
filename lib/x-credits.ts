import type { NativeChannelConnection, View } from "./types";

export const X_CREDITS_PATTERN = /no api credits|api credits(?: are)? exhausted|credits depleted|credit balance|credits remaining|billing and usage|quota exhausted|(?:monthly\s+)?(?:spend|spending|product)\s+cap\b[^.\n]*(?:reached|exceeded)|usagecapexceeded/i;

export const X_API_CONSOLE_URL = "https://console.x.com/";

// These failures describe the X API credential/app boundary, not the signed-in
// browser session. When a verified browser body exists, it is a valid
// continuity route for public work while the operator repairs the API.
export const X_NATIVE_CREDENTIAL_PATTERN = /rejected (?:these )?credentials|api key|api secret|access token|token values|invalid credentials|credential(?:s)? .*expired|token .*expired|authentication failed/i;

export function isXCreditsError(error?: string | Error | null) {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error.message || "";
  return X_CREDITS_PATTERN.test(msg);
}

export function xCreditsExhausted(connection?: Pick<NativeChannelConnection, "healthMessage" | "deliveryError"> & { observation?: { error?: string } } | null) {
  if (!connection) return false;
  return X_CREDITS_PATTERN.test(`${connection.healthMessage ?? ""} ${connection.deliveryError ?? ""} ${connection.observation?.error ?? ""}`);
}

export function xNativeWriteUnavailable(connection?: Pick<NativeChannelConnection, "healthMessage" | "deliveryError"> & { observation?: { error?: string } } | null) {
  if (!connection) return false;
  const message = `${connection.healthMessage ?? ""} ${connection.deliveryError ?? ""} ${connection.observation?.error ?? ""}`;
  return X_CREDITS_PATTERN.test(message) || X_NATIVE_CREDENTIAL_PATTERN.test(message) || /check your app permissions|client is not permitted|not enrolled|unsupported authentication/i.test(message);
}

export function xCreditsBillingUrl(accountId?: string) {
  return accountId
    ? `https://console.x.com/accounts/${encodeURIComponent(accountId)}/billing/credits`
    : X_API_CONSOLE_URL;
}

/**
 * X credit exhaustion is a public-channel delivery/observation boundary.
 * Keep it out of private cognition and rehearsal surfaces, where showing the
 * alert falsely suggests that ordinary in-app conversation needs X access.
 */
export function xCreditsAlertAppliesToView(view: View) {
  return new Set<View>(["live", "review", "feed", "growth", "analytics", "schedule", "calendar", "work", "brain", "presence", "usage"]).has(view);
}
