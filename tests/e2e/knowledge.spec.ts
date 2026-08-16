import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("operator can create Agent Knowledge and bind it to a Presence", async ({ page }) => {
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
  await page.getByLabel("Collection name").fill("Launch sources");
  await page.getByRole("button", { name: "Create collection", exact: true }).click();
  await expect(page.getByText("Launch sources", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Knowledge item title").fill("Launch checklist");
  await page.getByLabel("Knowledge content").fill("# Launch\n\nReview the owner and evidence before publishing.");
  await page.getByRole("button", { name: "Add Knowledge item", exact: true }).click();
  await expect(page.getByText("Launch checklist", { exact: true })).toBeVisible();
  await expect(page.getByText(/Current v1/)).toBeVisible();

  await (test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar")).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Presence settings", exact: true })).toBeVisible();
  const access = page.getByLabel("Knowledge access for Launch sources");
  await expect(access).toHaveValue("none");
  await access.selectOption("internal");
  await expect(access).toHaveValue("internal");
  expect(browserErrors).toEqual([]);
});
