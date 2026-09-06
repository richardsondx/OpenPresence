import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});

test("Chat is the default Agent workspace and the single main chat survives reload", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  await expect(page.getByText("Projects", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New project/i })).toHaveCount(0);
  await expect(page.getByText("New conversation", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Start a private thread", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Conversation as configuration", { exact: true })).toHaveCount(0);

  await page.getByPlaceholder("Message Jenny…").fill("What are you working on?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-operator p").filter({ hasText: /^What are you working on\?$/ })).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await (await request.get("/api/state?projection=chat")).json();
    return snapshot.operatorConversations?.some((conversation: { title?: string; messages?: Array<{ content: string }> }) => conversation.title === "Main" && conversation.messages?.some((message) => message.content === "What are you working on?"));
  }).toBe(true);
  const threadUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(threadUrl);
  await expect(page.locator(".operator-chat-message.is-operator p").filter({ hasText: /^What are you working on\?$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
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
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);
  await expect(page.getByText("Needs You", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Open full calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Chat", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to Chat", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?/);
  await expect(page.getByRole("textbox", { name: /Message/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Chat mode" })).toHaveValue("chat");
  await expect(page.getByRole("option", { name: "Chat", exact: true })).toBeAttached();
  await expect(page.getByRole("option", { name: "Config", exact: true })).toBeAttached();
  await page.getByRole("combobox", { name: "Chat mode" }).selectOption("teach");
  await expect(page).toHaveURL(/\/teach/);
  await expect(page.getByRole("heading", { name: "Teach the Agent through conversation.", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Chat mode" }).selectOption("chat");
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  await expect(page.locator(".operator-chat-composer .lucide-arrow-up")).toBeVisible();
  await expect(page.getByText("Enter to send", { exact: false })).toHaveCount(0);

  const shell = page.locator("main.app-shell");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(shell).toHaveClass(/theme-dark/);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(shell).toHaveClass(/theme-light/);
});

test("Collapsed Agent rail keeps its controls and avatars inside the rail", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "The collapsed rail is a desktop-only interaction; mobile keeps the Agent strip expanded.");
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/assets");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(page.locator(".portfolio-agent-copy")).toBeHidden();

  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return null;
    const sidebarRect = sidebar.getBoundingClientRect();
    const visibleChildren = Array.from(sidebar.querySelectorAll<HTMLElement>("*"))
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    return {
      sidebarRight: sidebarRect.right,
      furthestChildRight: Math.max(...visibleChildren.map((element) => element.getBoundingClientRect().right)),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.furthestChildRight, "collapsed rail content must not overflow its boundary").toBeLessThanOrEqual(geometry!.sidebarRight + 1);
  expect(geometry!.documentWidth, "collapsed rail must not create horizontal page overflow").toBeLessThanOrEqual(geometry!.viewportWidth);
});
