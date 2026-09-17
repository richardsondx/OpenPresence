import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("Agent inspector shows today's work, opens evidence, and keeps Needs you separate", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const initial = await (await request.get("/api/state")).json();
  const presenceId = initial.presence.id as string;
  const now = new Date().toISOString();
  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.events = [
      { id: "today-run", type: "execution", title: "Reviewed the morning feed", detail: "Inspected 4 new posts and chose one useful next step.", time: now, tone: "positive", presenceId, runId: "run-today" },
      { id: "today-tool", type: "system", title: "Searched the connected channel", detail: "Loaded the latest feed for the current attention pass.", time: now, tone: "neutral", presenceId, runId: "run-today" },
    ];
    await route.fulfill({ response, json: body });
  });
  await page.reload();

  await page.getByRole("button", { name: /Open context sidebar|About Jenny/ }).first().click();
  const inspector = page.getByRole("complementary", { name: "Today inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  await expect(inspector.getByRole("button", { name: "Needs you" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "About" })).toBeVisible();
  await expect(inspector.getByText("Reviewed the morning feed", { exact: true })).toBeVisible();
  await expect(inspector.locator(".inspector-view-nav button span")).toHaveCount(0);

  await inspector.getByRole("button", { name: "Reviewed the morning feed", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Reviewed the morning feed" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Summary", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Searched the connected channel", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close activity details" }).click();
  await expect(dialog).toHaveCount(0);

  await inspector.getByRole("button", { name: "Needs you" }).click();
  await expect(page.getByRole("complementary", { name: "Needs you inspector" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Needs you inspector" }).getByRole("button", { name: "Needs you" })).toHaveAttribute("aria-pressed", "true");
});
