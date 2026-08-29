import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Jenny" })).toBeVisible();
}

async function openAddPresence(page: import("@playwright/test").Page) {
  const host = test.info().project.name === "mobile"
    ? page.locator(".mobile-presence-switcher")
    : page.locator(".sidebar");
  await host.getByRole("button", { name: /Switch Presence, currently/ }).click();
  await page.getByRole("menu", { name: "Your Presences" }).getByRole("menuitem", { name: "Add a Presence", exact: true }).click();
}

test("Presence is selected from one dropdown and changes the active Presence", async ({ page }) => {
  await createAgent(page);
  await expect(page.locator(".presence-tree")).toHaveCount(0);
  await openAddPresence(page);
  const dialog = page.getByRole("dialog", { name: "Add a Presence" });
  await dialog.getByLabel("New Presence handle").fill("@second_jenny");
  await dialog.getByRole("button", { name: "Add Presence", exact: true }).click();
  const presenceSwitcher = test.info().project.name === "mobile"
    ? page.locator(".mobile-presence-switcher").getByRole("button", { name: "Switch Presence, currently @second_jenny" })
    : page.locator(".sidebar").getByRole("button", { name: "Switch Presence, currently @second_jenny" });
  await presenceSwitcher.click();
  await expect(page.getByRole("menu", { name: "Your Presences" })).toBeVisible();
  await page.getByRole("menu", { name: "Your Presences" }).getByRole("menuitem", { name: /@jenny_ai/ }).click();
  const activePresence = test.info().project.name === "mobile"
    ? page.locator(".mobile-presence-switcher").getByRole("button", { name: "Switch Presence, currently @jenny_ai" })
    : page.locator(".sidebar").getByRole("button", { name: "Switch Presence, currently @jenny_ai" });
  await expect(activePresence).toBeVisible();
  await expect(activePresence.locator(".channel-badge")).toHaveAttribute("title", "X");
  await expect(activePresence.locator(".channel-badge .presence-logo svg")).toHaveCount(1);
  await expect(activePresence.locator("span:nth-child(2) small")).toContainText("Agent-owned");
  const rootGeometry = await activePresence.evaluate((node) => ({
    width: node.scrollWidth,
    clientWidth: node.clientWidth,
    hasLogo: Boolean(node.querySelector(".presence-logo")),
  }));
  expect(rootGeometry.width).toBeLessThanOrEqual(rootGeometry.clientWidth);
  expect(rootGeometry.hasLogo).toBe(true);
  await activePresence.click();
  await expect(page.getByRole("button", { name: "Presence settings", exact: true })).toHaveCount(0);
  const settingsLink = test.info().project.name === "mobile"
    ? page.locator(".mobile-nav").getByRole("button", { name: "Settings", exact: true })
    : page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true });
  await settingsLink.click();
  await expect(page.getByRole("heading", { name: "Presence settings", exact: true })).toBeVisible();
});

test("Activity keeps the newly selected Presence context after switching", async ({ page, request }) => {
  await createAgent(page);
  const initial = await request.get("/api/state").then((response) => response.json());
  const firstPresence = initial.presence;
  const created = await request.post("/api/state", { data: { type: "createPresence", input: { channel: "x", name: "Genny on X", handle: "@example_agent", mode: "agent", accent: "#4F7CAC" } } });
  expect(created.ok()).toBeTruthy();
  const createdState = await created.json();
  const secondPresence = createdState.presence;

  await page.goto(`/activity?agentId=${initial.activeAgentId}&presenceId=${firstPresence.id}`);
  await expect(page.getByRole("heading", { name: `${firstPresence.name} at a glance`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`Switch Presence, currently ${firstPresence.handle}`) }).click();
  await page.getByRole("menuitem", { name: `Select Presence ${secondPresence.name} (${secondPresence.handle})` }).click();

  await expect(page.getByRole("button", { name: `Switch Presence, currently ${secondPresence.handle}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${secondPresence.name} at a glance`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`presenceId=${secondPresence.id}`));
});

test("Presence dropdown keeps cross-channel Presences visible while Feed scope changes", async ({ page, request }) => {
  await createAgent(page);
  const created = await request.post("/api/state", { data: { type: "createPresence", input: { channel: "linkedin", name: "Jenny LinkedIn", handle: "@jenny_linkedin", mode: "agent", accent: "#4F7CAC" } } });
  expect(created.ok()).toBeTruthy();

  await page.reload();
  const host = test.info().project.name === "mobile" ? page.locator(".mobile-presence-switcher") : page.locator(".sidebar");
  await host.getByRole("button", { name: /Switch Presence, currently/ }).click();
  const menu = page.getByRole("menu", { name: "Your Presences" });
  await expect(menu.getByRole("menuitem", { name: /@jenny_ai/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /@jenny_linkedin/ })).toBeVisible();
});

test("Agent is an account-style selector in the sidebar footer", async ({ page }) => {
  await createAgent(page);
  const footer = page.locator(".sidebar-footer");
  const agentContainer = test.info().project.name === "mobile"
    ? page.locator(".mobile-agent-switcher")
    : footer;
  const agentSwitcher = agentContainer.getByRole("button", { name: "Switch agent, currently Jenny" });
  await expect(agentSwitcher).toBeVisible();
  await expect(page.locator(".sidebar > .agent-switcher-wrap")).toHaveCount(0);
  await agentSwitcher.click();
  await expect(page.getByRole("menu", { name: "Your Agents" })).toBeVisible();
});

test("Growth waits for the full workspace when opened from compact Activity state", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await createAgent(page);

  const navigation = test.info().project.name === "mobile"
    ? page.locator(".mobile-nav")
    : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Growth", exact: true }).click();

  await expect(page).toHaveURL(/\/growth/);
  await expect(page.getByRole("heading", { name: "Growth", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
