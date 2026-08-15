import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("Tavily is configured from Manage Agent without exposing the key in state", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: /^Manage Agent/ }).click();
  await expect(page.getByRole("heading", { name: "Manage Agent" })).toBeVisible();
  await expect(page.getByText("Tavily asset discovery", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Tavily API key").fill("tvly-test-interface-key");
  await page.getByRole("button", { name: "Save Tavily key", exact: true }).click();

  await expect(page.getByText("Connected · key stored securely", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update key", exact: true })).toBeVisible();
  const response = await request.get("/api/state");
  const state = await response.json();
  expect(JSON.stringify(state)).not.toContain("tvly-test-interface-key");
  expect(state.assetProviderConnections).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "tavily", secretConfigured: true, status: "available" })]));
});
