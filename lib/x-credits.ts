import type { NativeChannelConnection, View } from "./types";

export const X_CREDITS_PATTERN = /no api credits|api credits(?: are)? exhausted|credits depleted|credit balance|credits remaining|billing and usage|quota exhausted/i;

export const X_API_CONSOLE_URL = "https://console.x.com/";

export function isXCreditsError(error?: string | Error | null) {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error.message || "";
  return X_CREDITS_PATTERN.test(msg);
}

export function xCreditsExhausted(connection?: Pick<NativeChannelConnection, "healthMessage" | "deliveryError"> & { observation?: { error?: string } } | null) {
  if (!connection) return false;
  return X_CREDITS_PATTERN.test(`${connection.healthMessage ?? ""} ${connection.deliveryError ?? ""} ${connection.observation?.error ?? ""}`);
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
