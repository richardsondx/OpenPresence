import type { NativeChannelConnection } from "./types";

const X_CREDITS_PATTERN = /no api credits|credits depleted|credit balance|credits remaining|billing and usage|quota exhausted/i;

export const X_API_CONSOLE_URL = "https://console.x.com/";

export function xCreditsExhausted(connection?: Pick<NativeChannelConnection, "healthMessage" | "deliveryError"> | null) {
  if (!connection) return false;
  return X_CREDITS_PATTERN.test(`${connection.healthMessage ?? ""} ${connection.deliveryError ?? ""}`);
}

export function xCreditsBillingUrl(accountId?: string) {
  return accountId
    ? `https://console.x.com/accounts/${encodeURIComponent(accountId)}/billing/credits`
    : X_API_CONSOLE_URL;
}
