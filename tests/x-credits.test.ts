import { describe, expect, it } from "vitest";
import { isXCreditsError, xCreditsAlertAppliesToView, xCreditsBillingUrl, xCreditsExhausted } from "@/lib/x-credits";
import { nativeConnectionCanWrite } from "@/lib/execution-readiness";

describe("X credit alert helpers", () => {
  it.each([
    "X rejected this action: Your monthly spend cap has been reached.",
    "UsageCapExceeded: Monthly product cap exceeded",
  ])("keeps a persisted billing block out of the native write routes: %s", (message) => {
    expect(isXCreditsError(message)).toBe(true);
    expect(nativeConnectionCanWrite({
      id: "native_billing", presenceId: "presence_billing", channelId: "x", kind: "x",
      status: "connected", access: "read-write", deliveryError: message,
      createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z",
    })).toBe(false);
  });

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

  it("keeps the public-channel alert out of private conversation surfaces", () => {
    expect(xCreditsAlertAppliesToView("live")).toBe(true);
    expect(xCreditsAlertAppliesToView("review")).toBe(true);
    expect(xCreditsAlertAppliesToView("chat")).toBe(false);
    expect(xCreditsAlertAppliesToView("teach")).toBe(false);
    expect(xCreditsAlertAppliesToView("rehearsal")).toBe(false);
    expect(xCreditsAlertAppliesToView("playground")).toBe(false);
  });

  it("recognizes the health summary used for exhausted X API credits", () => {
    expect(isXCreditsError("X API credits are exhausted. The verified Chrome Bridge remains available for continuity.")).toBe(true);
    expect(isXCreditsError("A public delivery decision needs you.")).toBe(false);
  });
});
