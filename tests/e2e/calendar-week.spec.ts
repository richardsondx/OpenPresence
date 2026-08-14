import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Calendar Week mode visualizes intent timing without pretending to show posts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Add intent", exact: true }).click();
  await page.getByLabel("What should Jenny do?").fill("Teach one useful idea about persistent agents.");
  await page.getByLabel("Day").selectOption("Tuesday");
  await page.getByRole("textbox", { name: "Time" }).fill("08:00");
  await page.getByLabel("Objective", { exact: true }).selectOption("education");
  await page.getByRole("button", { name: "Save standing intent", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Weekly intent schedule" })).toBeVisible();
  await expect(page.getByText("When Jenny is meant to pay attention")).toBeVisible();
  await expect(page.getByText("Tue")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Teach one useful idea.*Tuesday at 08:00/ })).toBeVisible();
  await expect(page.getByText("Nothing here is a promised post.")).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Standing intentions" })).toBeVisible();
});
