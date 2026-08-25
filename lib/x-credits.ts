import type { NativeChannelConnection } from "./types";

export const X_CREDITS_PATTERN = /no api credits|credits depleted|credit balance|credits remaining|billing and usage|quota exhausted/i;

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
