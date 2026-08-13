import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("Calendar is verified history and Schedule remains future intent", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await expect(page.getByText("Verified public history", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No verified public expression yet" })).toBeVisible();

  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".history-month-grid")).toBeVisible();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator(".history-day-timeline")).toBeVisible();

  await page.getByRole("button", { name: "Schedule", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add intent", exact: true })).toBeVisible();
  await expect(page.getByText("Words come later, from the moment.", { exact: false })).toBeVisible();
});

test("Calendar explains why a Sandbox expression has no live X destination", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".history-card").first()).toBeVisible();
  await page.locator(".history-card").first().click();
  await expect(page.getByText("Sandbox rehearsal only. This expression has no live X URL.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on X" })).toHaveCount(0);
});

test("Calendar keeps a late-day publication card footer visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".history-card").first()).toBeVisible();
  const geometry = await page.locator(".history-week").evaluate((week) => {
    const card = week.querySelector<HTMLElement>(".history-card");
    const proof = week.querySelector<HTMLElement>(".history-card-proof");
    if (!card || !proof) throw new Error("Calendar publication card is missing its proof footer");
    return { cardBottom: card.getBoundingClientRect().bottom, proofBottom: proof.getBoundingClientRect().bottom, weekBottom: week.getBoundingClientRect().bottom };
  });
  expect(geometry.proofBottom).toBeLessThanOrEqual(geometry.weekBottom);
  expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.weekBottom);
});

test("Calendar inspector can browse stacked publications", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.locator(".social-card")).toHaveCount(2);

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".history-card")).toHaveCount(2);
  await page.locator(".history-card").last().click();
  await expect(page.getByText("Post details", { exact: true })).toBeVisible();
  await expect(page.getByText("Post 2 of 2", { exact: true })).toBeVisible();
  const secondText = await page.locator(".history-inspector-text").innerText();

  await page.getByRole("button", { name: "Previous post" }).click();
  await expect(page.getByText("Post 1 of 2", { exact: true })).toBeVisible();
  await expect(page.locator(".history-inspector-text")).not.toHaveText(secondText);
  await expect(page.getByRole("button", { name: "Previous post" })).toBeDisabled();
  await page.getByRole("button", { name: "Next post" }).click();
  await expect(page.getByText("Post 2 of 2", { exact: true })).toBeVisible();
});
