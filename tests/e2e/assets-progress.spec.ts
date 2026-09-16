import { expect, test } from "@playwright/test";

test("folder import shows file progress and completes with rendered assets", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();

  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/?view=assets");
  await expect(page.getByRole("heading", { name: "Asset library", exact: true })).toBeVisible();

  const folderInput = page.getByLabel("Choose a folder of assets");
  await folderInput.setInputFiles("scenarios/fixtures");
  await expect(page.getByText("5 assets ready to add", { exact: true })).toBeVisible();

  await page.route("**/api/assets/import", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.getByRole("button", { name: "Add folder", exact: true }).click();
  const progress = page.getByTestId("asset-import-progress");
  await expect(progress).toBeVisible();
  await expect(progress).toContainText(/files uploaded|files analyzed|Import complete/);
  await page.screenshot({ path: test.info().outputPath("assets-progress-uploading.png"), fullPage: false });
  await expect(progress).toContainText("Import complete", { timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath("assets-progress-complete.png"), fullPage: false });
  await expect(page.locator(".asset-card")).toHaveCount(5);
  await expect(page.locator(".asset-card img")).toHaveCount(4);
  await expect(page.locator(".asset-card video")).toHaveCount(1);
  await expect.poll(async () => page.locator(".asset-card img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByText("Used 0×", { exact: false }).first()).toBeVisible();
});
