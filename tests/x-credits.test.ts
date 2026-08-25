import { describe, expect, it } from "vitest";
import { xCreditsBillingUrl, xCreditsExhausted } from "@/lib/x-credits";

describe("X credit alert helpers", () => {
  it("detects persisted X credit exhaustion without matching unrelated failures", () => {
    expect(xCreditsExhausted({ deliveryError: "X has no API credits remaining for this app." })).toBe(true);
    expect(xCreditsExhausted({ healthMessage: "credits depleted" })).toBe(true);
    expect(xCreditsExhausted({ observation: { error: "X API credits depleted" } })).toBe(true);
    expect(xCreditsExhausted({ healthMessage: "X temporarily rate-limited this app." })).toBe(false);
  });

  it("deep-links to account billing when an account id is known", () => {
    expect(xCreditsBillingUrl("2087642272024154112")).toBe("https://console.x.com/accounts/2087642272024154112/billing/credits");
    expect(xCreditsBillingUrl()).toBe("https://console.x.com/");
  });
});
