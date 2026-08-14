import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
}

test("Schedule sends post exploration to Playground", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await expect(page.getByRole("button", { name: "Let Jenny choose", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Give an Assignment", exact: true })).toBeVisible();
});

test("Playground Assignments use the Sandbox session without requiring a Sandbox Presence route", async ({ page, request }) => {
  await createAgent(page);
  const presenceUpdate = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(presenceUpdate.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await page.getByRole("button", { name: "Give an Assignment", exact: true }).click();
  await page.getByLabel("Assignment instruction").fill("Produce 2 original X posts about useful agent ideas. Choose your own angles and do not repeat yourself.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start rehearsal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Sandbox Presence" })).toHaveCount(0);
});
