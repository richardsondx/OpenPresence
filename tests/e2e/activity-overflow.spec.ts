import { expect, test } from "@playwright/test";

test("Activity stays within the viewport at responsive widths", async ({ page, request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny at a glance" })).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".activity-page")).toBeVisible();

  const widths = [1512, 1280, 1100, 1024, 960, 900, 840, 768, 720, 680, 600, 480];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const overflowing = [...document.querySelectorAll<HTMLElement>("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { className: element.className, left: rect.left, right: rect.right };
        })
        .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1);
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, overflowing };
    });
    expect(metrics.scrollWidth, `Activity overflows at ${width}px`).toBeLessThanOrEqual(metrics.innerWidth);
  }
});
