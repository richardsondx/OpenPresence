import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1024, height: 720 }, isMobile: false });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "@jenny_ai is live." })).toBeVisible();
}

async function inspectCompactPage(page: import("@playwright/test").Page, view: "Chat" | "Live" | "Calendar" | "Brain" | "Presence settings") {
  if (view === "Presence settings") {
    await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  } else {
    const label = view === "Brain" ? "Manage Agent" : view;
    await page.getByRole("button", { name: view === "Brain" ? /^Manage Agent/ : label, exact: view !== "Brain" }).click();
  }
  const metrics = await page.evaluate(() => {
    const heading = document.querySelector(".page-heading")?.getBoundingClientRect();
    const content = document.querySelector(".workspace-content")?.getBoundingClientRect();
    return { headingHeight: heading?.height ?? 0, headingBottom: heading?.bottom ?? 0, contentTop: content?.top ?? 0, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(metrics.overflow, `${view} must not create horizontal scroll`).toBe(false);
  expect(metrics.headingHeight, `${view} header should stay compact`).toBeLessThan(150);
  expect(metrics.headingBottom - metrics.contentTop, `${view} header rhythm should preserve focus`).toBeLessThan(190);
}

test("small desktop keeps each page task above the fold", async ({ page }) => {
  await createAgent(page);
  for (const view of ["Chat", "Live", "Calendar", "Brain", "Presence settings"] as const) await inspectCompactPage(page, view);

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Add intent" }).click();
  await expect(page.getByRole("button", { name: "Save standing intent" })).toBeVisible();

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("button", { name: "New conversation", exact: true })).toHaveCount(0);
  const contextSidebar = page.getByRole("complementary", { name: "Context & Changes sidebar" });
  await expect(contextSidebar).toBeVisible();
  await page.getByRole("button", { name: "Hide context sidebar" }).click();
  await expect(contextSidebar).toHaveCount(0);
  await page.getByRole("button", { name: "Show context sidebar" }).click();
  await expect(contextSidebar).toBeVisible();
  await expect(page.getByLabel("Message your Presence")).toBeVisible();
});
