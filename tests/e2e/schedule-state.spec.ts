import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Schedule combines Agent-owned and operator Assignments with persistent controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "◇ Jenny's plan", exact: true })).toBeVisible();
  const schedule = page.getByRole("region", { name: "Schedule list" });
  await expect(page.getByRole("region", { name: "Agent publishing plan" })).toHaveCount(0);
  await expect(schedule.getByText("Jenny · Agent-owned", { exact: true }).first()).toBeVisible();
  await schedule.getByRole("button", { name: /Open Assignment/ }).first().click();
  const details = page.getByRole("complementary", { name: "Assignment details" });
  await details.getByRole("button", { name: "Pause Jenny's assignment", exact: true }).click();
  await expect(details.getByText("paused", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Resume Jenny's assignment", exact: true }).click();
  await details.getByRole("button", { name: "Close Assignment details", exact: true }).click();

  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Teach one useful idea about persistent agents.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await page.getByRole("button", { name: "Activate Assignment", exact: true }).click();
  await expect(schedule.getByText("You · Operator assignment", { exact: true })).toBeVisible();

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
