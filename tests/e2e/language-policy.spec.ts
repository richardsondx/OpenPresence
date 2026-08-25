import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Manage Agent keeps language after capabilities with section separators", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: /Manage Agent/ }).click();
  await expect(page.getByRole("heading", { name: "Manage Agent" })).toBeVisible();

  const layout = await page.locator(".brain-page").evaluate((root) => {
    const sections = Array.from(root.querySelectorAll<HTMLElement>(":scope > .brain-page-section"));
    const capabilities = root.querySelector<HTMLElement>(".tools-card");
    const language = root.querySelector<HTMLElement>(".language-policy-card");
    if (!capabilities || !language) throw new Error("Manage Agent layout nodes are missing.");
    return {
      languageBelowCapabilities: language.getBoundingClientRect().top >= capabilities.getBoundingClientRect().bottom,
      sectionStyles: sections.map((section) => {
        const styles = getComputedStyle(section);
        return {
          borderTop: styles.borderTopStyle,
          marginTop: styles.marginTop,
          paddingTop: styles.paddingTop,
        };
      }),
    };
  });

  expect(layout.languageBelowCapabilities).toBe(true);
  expect(layout.sectionStyles.length).toBeGreaterThan(0);
  expect(layout.sectionStyles.every((section) => section.borderTop === "solid")).toBe(true);
  expect(layout.sectionStyles.every((section) => section.marginTop === "24px")).toBe(true);
  expect(layout.sectionStyles.every((section) => section.paddingTop === "26px")).toBe(true);
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
  await expect(page.locator(".language-policy-save-status")).toHaveText("Language policy saved.");

  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Language & phrasing here" })).toBeVisible();
  await expect(page.getByLabel("Presence language", { exact: true })).toHaveValue("en");
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
  expect(state.presence.language).toBe("en");
  expect(state.presence.context.language).toBe("en");
});
