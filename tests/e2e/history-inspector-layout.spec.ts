import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("Feed details keep long social expressions inside the mobile viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.locator(".feed-item").first().click();
  await expect(page.getByText("Post details", { exact: true })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const inspector = document.querySelector<HTMLElement>(".history-inspector");
    if (!inspector) throw new Error("History inspector is missing");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      inspectorRight: inspector.getBoundingClientRect().right,
      inspectorScrollWidth: inspector.scrollWidth,
      inspectorClientWidth: inspector.clientWidth,
    };
  });

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.inspectorRight).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.inspectorScrollWidth).toBeLessThanOrEqual(geometry.inspectorClientWidth + 1);
});
