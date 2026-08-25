import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Schedule keeps the Agent plan visible and shows live Assignment work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  const plan = page.getByRole("region", { name: "Agent publishing plan" });
  await expect(plan).toBeVisible();
  await expect(page.getByText(/current plan/i).first()).toBeVisible();
  await expect(plan.getByRole("button", { name: "Expand plan", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Schedule list" }).getByText("Publishing window", { exact: true })).toHaveCount(0);

  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Teach one useful idea about persistent agents.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await page.getByRole("button", { name: "Activate Assignment", exact: true }).click();

  await page.route("**/api/state", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postData()?.includes('"type":"runLiveAssignment"')) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Work now", exact: true }).click({ noWaitAfter: true });
  await expect(page.getByRole("status").filter({ hasText: "is working on a scheduled item" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Assignment Teach one useful idea/ })).toContainText("Working now");
});
