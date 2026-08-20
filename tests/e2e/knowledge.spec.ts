import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("operator can manage a flat Agent Knowledge document library", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Jenny" })).toBeVisible();

  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Knowledge", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
  await expect(page.getByText("Collections", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add document", exact: true }).first().click();
  await page.getByLabel("Knowledge document name").fill("Launch checklist.md");
  await page.getByLabel("Knowledge document content").fill("# Launch\n\nReview the owner and evidence before publishing.");
  await page.locator("form.knowledge-add-document-panel").getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByLabel("Name for Launch checklist.md")).toHaveValue("Launch checklist.md");
  await expect(page.getByLabel("Content for Launch checklist.md")).toHaveValue("# Launch\n\nReview the owner and evidence before publishing.");

  await page.getByLabel("Name for Launch checklist.md").fill("Launch checklist v2.md");
  await page.getByLabel("Content for Launch checklist.md").fill("# Launch\n\nReview the owner and evidence before publishing.\n\n- Confirm owner");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await (test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar")).getByRole("button", { name: "Knowledge", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
  await expect(page.getByLabel("Name for Launch checklist v2.md")).toHaveValue("Launch checklist v2.md");
  await expect(page.getByLabel("Content for Launch checklist v2.md")).toHaveValue("# Launch\n\nReview the owner and evidence before publishing.\n\n- Confirm owner");
  await expect(page.getByText(/History · 2 versions/)).toBeVisible();

  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Presence settings", exact: true })).toBeVisible();
  const access = page.getByLabel("Knowledge access");
  await expect(access).toHaveValue("none");
  await access.selectOption("internal");
  await expect(access).toHaveValue("internal");
  expect(browserErrors).toEqual([]);
});
