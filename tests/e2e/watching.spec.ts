import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Watching lets a Presence review and persist a creator Watch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Watching", exact: true })).toBeVisible();
  await expect(page.getByText("Give Jenny better eyes on the social world.")).toBeVisible();

  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("What should this Presence watch?").fill("https://x.com/AlexHormozi");
  await expect(page.getByText("Here's what Jenny will watch")).toBeVisible();
  await expect(page.getByText("Creator", { exact: true })).toBeVisible();
  await page.getByLabel("Why should this Presence watch this?").fill("Learn from strong offers without imitating the voice.");
  await page.getByRole("button", { name: "Start watching", exact: true }).click();

  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await expect(page.locator(".watch-status")).toHaveText(/Active watch/);
  await expect(page.getByText("Waiting for first observation", { exact: true })).toBeVisible();
  await expect(page.getByText("This Watch is active. No action is needed yet; Jenny will show signals here when the connected source supplies them.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Performance baseline|Not started/, { exact: false })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove @AlexHormozi", exact: true }).click();
  await expect(page.getByText("Give Jenny better eyes on the social world.")).toBeVisible();
});

test("Watching keeps topic and opportunity inputs as attention, not commands", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: "Add watch", exact: true }).click();
  await page.getByLabel("What should this Presence watch?").fill("conversations involving AI agents, introductions, and founder problems");
  await expect(page.getByText("Opportunity", { exact: true })).toBeVisible();
  await expect(page.getByText("Notice relevant material", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start watching", exact: true }).click();
  await expect(page.getByText("Manual source", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for source material", { exact: true })).toBeVisible();
  await expect(page.getByText("No observations yet", { exact: true })).toBeVisible();
});
