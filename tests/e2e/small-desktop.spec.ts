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
  await expect(page.getByRole("heading", { name: "Jenny at a glance" })).toBeVisible();
}

async function inspectCompactPage(page: import("@playwright/test").Page, view: "Chat" | "Activity" | "Watching" | "Feed" | "Schedule" | "Playground" | "Teach" | "Brain" | "Presence settings") {
  if (view === "Presence settings") {
    await page.locator(".sidebar").getByRole("button", { name: "Channels", exact: true }).click();
  } else if (view === "Feed" || view === "Schedule" || view === "Teach") {
    const paths = { Feed: "/feed", Schedule: "/schedule", Teach: "/teach" } as const;
    await page.goto(paths[view]);
  } else {
    const label = view === "Brain" ? "Manage Agent" : view;
    await page.locator(".sidebar").getByRole("button", { name: view === "Brain" ? /^Manage Agent/ : label, exact: view !== "Brain" }).click();
  }
  const metrics = await page.evaluate(() => {
    const heading = document.querySelector(".page-heading, .watching-header, .playground-toolbar")?.getBoundingClientRect();
    const content = document.querySelector(".workspace-content")?.getBoundingClientRect();
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    return { headingHeight: heading?.height ?? 0, headingBottom: heading?.bottom ?? 0, contentTop: content?.top ?? 0, contentLeft: content?.left ?? 0, contentRight: content?.right ?? 0, workspaceLeft: workspace?.left ?? 0, workspaceRight: workspace?.right ?? 0, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(metrics.overflow, `${view} must not create horizontal scroll`).toBe(false);
  expect(Math.abs(metrics.contentLeft - metrics.workspaceLeft), `${view} content should use the workspace width`).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.contentRight - metrics.workspaceRight), `${view} content should use the workspace width`).toBeLessThanOrEqual(1);
  expect(metrics.headingHeight, `${view} header should stay compact`).toBeLessThan(150);
  expect(metrics.headingBottom - metrics.contentTop, `${view} header rhythm should preserve focus`).toBeLessThan(190);
}

test("small desktop keeps each page task above the fold", async ({ page }) => {
  await createAgent(page);
  for (const view of ["Chat", "Activity", "Watching", "Feed", "Schedule", "Playground", "Teach", "Brain", "Presence settings"] as const) await inspectCompactPage(page, view);

  await page.goto("/schedule");
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review responsibility" })).toBeVisible();

  await page.locator(".sidebar").getByRole("button", { name: "Channels", exact: true }).click();
  const settingsScroll = await page.evaluate(() => ({
    documentScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    workspaceOverflow: getComputedStyle(document.querySelector(".workspace")!).overflow,
  }));
  expect(settingsScroll.documentScrolls).toBe(true);
  expect(settingsScroll.workspaceOverflow).toBe("visible");

  await page.goto("/teach");
  const contextSidebar = page.getByRole("complementary", { name: "Context & Changes sidebar" });
  await expect(contextSidebar).toBeVisible();
  await page.getByRole("button", { name: "Hide context sidebar" }).click();
  await expect(contextSidebar).toHaveCount(0);
  await page.getByRole("button", { name: "Show context sidebar" }).click();
  await expect(contextSidebar).toBeVisible();
  await expect(page.getByLabel("Message your Presence")).toBeVisible();
});
