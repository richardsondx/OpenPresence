import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});

test("Chat is the default Agent workspace and a new thread survives reload", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await expect(page).toHaveURL(/\/chat/);
  if (test.info().project.name === "chromium") await expect(page.getByText("Active channel", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Main", exact: true })).toBeVisible();
  if (test.info().project.name === "chromium") await expect(page.getByText("Presence context", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(page).toHaveURL(/threadId=/);
  await page.getByPlaceholder("Message Jenny…").fill("What are you working on?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-operator p").filter({ hasText: /^What are you working on\?$/ })).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await (await request.get("/api/state?projection=chat")).json();
    return snapshot.operatorConversations?.some((conversation: { title?: string; messages?: Array<{ content: string }> }) => conversation.title === "What are you working on?" && conversation.messages?.some((message) => message.content === "What are you working on?"));
  }).toBe(true);
  const threadUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(threadUrl);
  await expect(page.locator(".operator-chat-message.is-operator p").filter({ hasText: /^What are you working on\?$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What are you working on?" })).toBeVisible();
});

test("Chat keeps durable responsibilities quiet until work is actually active", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const base = await request.get("/api/state").then((response) => response.json());
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence.id, environment: "sandbox", instruction: "Find one useful builder conversation.", schedule: { day: "Daily", time: "08:00", executionWindow: "08:00–11:00" } } });
  expect(created.ok()).toBeTruthy();

  await page.goto("/chat");
  await expect(page.getByTestId("operator-approach")).toHaveCount(0);
  await expect(page.getByTestId("operator-work-events")).toHaveCount(0);
  await expect(page.getByTestId("operator-working-line")).toHaveCount(0);
});

test("Context sidebar owns its view controls and the workspace theme toggles", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await expect(page.getByRole("button", { name: "Open context sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Calendar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open context sidebar" }).click();
  await expect(page.getByRole("complementary", { name: /Attention inspector/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Show Calendar" }).click();
  await expect(page.getByRole("complementary", { name: /Calendar inspector/ })).toBeVisible();

  const shell = page.locator("main.app-shell");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(shell).toHaveClass(/theme-dark/);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(shell).toHaveClass(/theme-light/);
});
