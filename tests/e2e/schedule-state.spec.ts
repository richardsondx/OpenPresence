import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Schedule creates a simple one-time Assignment with clear controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  const schedule = page.getByRole("region", { name: "Schedule list" });
  await expect(page.getByText("publishing rhythm", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Create plan", { exact: true })).toHaveCount(0);

  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await expect(page.getByText("Optional asset preferences", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Assignment Asset Collection")).toBeHidden();
  await page.getByText("Optional asset preferences", { exact: true }).click();
  await expect(page.getByLabel("Assignment Asset Collection")).toBeVisible();
  await page.getByLabel("What should Jenny accomplish?").fill("Teach one useful idea about persistent agents.");
  await page.getByLabel("Assignment date").fill(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date()));
  await page.getByRole("textbox", { name: "Time" }).fill("08:00");
  await expect(page.getByText("Objective", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Flexible", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create assignment", exact: true }).click();
  await expect(schedule.getByText("You · Operator assignment", { exact: true })).toBeVisible();
  const row = schedule.getByRole("button", { name: /Open one-time Assignment Teach one useful idea/ });
  await expect(row).toContainText("One-time");
  await row.click();
  const details = page.getByRole("complementary", { name: "Assignment details" });
  await expect(details.getByRole("button", { name: "Edit Assignment", exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Work now", exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Cancel Assignment", exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Activate Assignment", exact: true })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Run in Playground", exact: true })).toHaveCount(0);
});
