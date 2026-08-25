import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Watching opens on Explorations and places it first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  await expect(page.locator('[role="tab"]').first()).toContainText("Explorations");
  await expect(page.getByRole("tab", { name: /Explorations/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Watchlist/ })).toHaveAttribute("aria-selected", "false");
});

test("Watching lets a Presence review and persist a creator Watch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Watching", exact: true })).toBeVisible();
  await expect(page.getByText("Give Jenny a reason to look around.")).toBeVisible();

  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
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
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove @AlexHormozi", exact: true }).click();
  await expect(page.getByText("No known things yet.")).toBeVisible();
});

test("Watching keeps topic and opportunity inputs as attention, not commands", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
  await page.getByLabel("What should this Presence watch?").fill("conversations involving AI agents, introductions, and founder problems");
  await expect(page.getByText("Opportunity", { exact: true })).toBeVisible();
  await expect(page.getByText("Notice relevant material", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start watching", exact: true }).click();
  await expect(page.getByText("Manual source", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for source material", { exact: true })).toBeVisible();
  await expect(page.getByText("This Watch is saved, but it needs connected or manually supplied material before Jenny can notice anything.", { exact: true })).toBeVisible();
});

test("Watching keeps autonomous attention out of the explicit attention list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  await expect(page.getByText("Genny's own attention", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run attention test", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Tests/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Manage .*'s attention/ })).toBeVisible();
});

test("Attention & Rhythm exposes concrete resource presets without social quotas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: /Manage .*'s attention/ }).click();

  await expect(page.getByRole("heading", { name: "How actively should Jenny look around?", exact: true })).toBeVisible();
  await expect(page.getByText("~60 X reads · ~40 model calls", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Qualified follows per day")).toHaveCount(0);
  await page.getByRole("button", { name: /Curious/ }).click();
  await expect(page.getByText("~150 X reads · ~90 model calls", { exact: true })).toBeVisible();
});

test("Attention settings expose safe resume and audit-preserving reset controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: /Manage .*'s attention/ }).click();
  await page.getByText("Advanced limits Most people can use the presets.", { exact: true }).click();

  await expect(page.getByRole("button", { name: "Resume autonomy now", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset today’s autonomy budget", exact: true })).toBeVisible();
  await expect(page.getByText(/Reset starts a new active usage epoch while preserving the audit history/)).toBeVisible();
});
