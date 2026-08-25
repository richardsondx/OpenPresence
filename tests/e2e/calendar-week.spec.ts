import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Calendar Week mode visualizes Assignment timing without pretending to show posts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Teach one useful idea about persistent agents.");
  await page.getByLabel("Day").selectOption("Tuesday");
  await page.getByRole("textbox", { name: "Time" }).fill("08:00");
  await page.getByLabel("Objective", { exact: true }).selectOption("education");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Weekly schedule" })).toBeVisible();
  await expect(page.getByText("When Jenny can notice and act")).toBeVisible();
  await expect(page.getByText("Tue", { exact: true }).last()).toBeVisible();
  const assignmentCard = page.getByRole("button", { name: /Open Assignment Teach one useful idea.*Tuesday at 08:00/ });
  await expect(assignmentCard).toBeVisible();
  await expect(assignmentCard).not.toHaveClass(/processing/);
  await expect(assignmentCard).toContainText("Not started");
  await expect(page.locator(".week-calendar-toolbar").getByText("shape when", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What Jenny may work on/ })).toBeVisible();
});
