import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("operator can configure Agent and Presence language boundaries", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("button", { name: /Manage Agent/ })).toBeVisible();

  await page.getByRole("button", { name: /Manage Agent/ }).click();
  await expect(page.getByRole("heading", { name: "Language & phrasing" })).toBeVisible();
  await page.getByLabel("Agent language preferences to avoid").fill("great");
  await page.getByLabel("Agent prohibited language").fill("secret");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/state") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Save language policy" }).click(),
  ]);

  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Language & phrasing here" })).toBeVisible();
  const sectionLayout = await page.locator(".presence-language-policy-card").evaluate((section) => {
    const publicSelf = document.querySelector<HTMLElement>(".public-self-card");
    const button = section.querySelector<HTMLElement>("button");
    if (!publicSelf || !button) throw new Error("Presence language layout nodes are missing.");
    const sectionBox = section.getBoundingClientRect();
    const publicSelfBox = publicSelf.getBoundingClientRect();
    return {
      belowPublicSelf: sectionBox.top >= publicSelfBox.bottom,
      borderTop: getComputedStyle(section).borderTopStyle,
      paddingTop: getComputedStyle(section).paddingTop,
      buttonMarginTop: getComputedStyle(button.parentElement!).marginTop,
    };
  });
  expect(sectionLayout.belowPublicSelf).toBe(true);
  expect(sectionLayout.borderTop).toBe("solid");
  expect(sectionLayout.paddingTop).toBe("26px");
  expect(sectionLayout.buttonMarginTop).toBe("20px");
  await expect(page.locator(".language-inherited-rules")).toContainText("secret");
  await page.getByLabel("Presence prohibited language").fill("vendor");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/state") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Save Presence language" }).click(),
  ]);

  const response = await request.get("/api/state");
  const state = await response.json();
  expect(state.agent.languagePolicy).toEqual({ avoid: ["great"], prohibited: ["secret"] });
  expect(state.presence.languagePolicy).toEqual({ avoid: [], prohibited: ["vendor"] });
});
