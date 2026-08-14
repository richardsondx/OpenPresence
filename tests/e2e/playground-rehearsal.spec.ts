import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
}

test("Schedule sends post exploration to Playground", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await expect(page.getByRole("button", { name: /Let Jenny choose/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Give an Assignment/ })).toBeVisible();
});

test("Playground Assignments use the Sandbox session without requiring a Sandbox Presence route", async ({ page, request }) => {
  await createAgent(page);
  const presenceUpdate = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(presenceUpdate.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await page.getByRole("button", { name: /Give an Assignment/ }).click();
  await page.getByLabel("Assignment instruction").fill("Produce 2 original X posts about useful agent ideas. Choose your own angles and do not repeat yourself.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  const review = page.locator(".assignment-review");
  await expect(review.getByText("Agent decides how", { exact: true })).toBeVisible();
  await expect(review).toContainText("Topics · thesis · evidence · format · wording · timing strategy");
  await expect(review).not.toContainText("Jenny decides");
  await expect(page.getByRole("button", { name: "Start rehearsal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Sandbox Presence" })).toHaveCount(0);
});

test("Schedule can cancel a draft Assignment and keeps its cancelled history", async ({ page, request }) => {
  await createAgent(page);
  const created = await request.post("/api/state", { data: { type: "createAssignment", instruction: "Produce 3 original X posts about useful agent ideas." } });
  expect(created.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  const assignmentRow = page.locator(".schedule-assignment-row").filter({ hasText: "Produce 3 original X posts about useful agent ideas." });
  await expect(assignmentRow).toContainText("draft");
  await expect(assignmentRow.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(assignmentRow.getByText("ASSIGN", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await assignmentRow.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(assignmentRow).toContainText("cancelled");
  await expect(assignmentRow.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
});

test("Schedule preserves an Assignment's exact timing", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Add intent", exact: true }).click();
  await page.getByRole("radio", { name: /Assign Jenny is responsible/ }).check();
  await page.getByLabel("What should Jenny do?", { exact: true }).fill("Produce 1 original X post about a useful AI-agent decision.");
  await page.getByLabel("Day", { exact: true }).selectOption({ label: "Thursday" });
  await page.getByLabel("Time", { exact: true }).fill("23:35");
  await page.getByRole("button", { name: /Timing options/ }).click();
  await page.getByRole("radio", { name: /Exact time/ }).check();
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();

  const assignmentRow = page.locator(".schedule-assignment-row").filter({ hasText: "Produce 1 original X post about a useful AI-agent decision." });
  await expect(assignmentRow).toContainText("Thursday at 23:35 · exact time · 0 / 1 verified · draft");
});
