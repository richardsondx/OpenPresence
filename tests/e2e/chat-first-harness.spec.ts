import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});

test("Chat is the default Agent workspace and the single main chat survives reload", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("heading", { name: "Chat with Jenny", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Chat with Jenny", exact: true })).toBeVisible();
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

test("an explicit ownership request becomes a recurring Agent-owned goal", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const requestText = "Take ownership of an ongoing daily publishing responsibility about useful agent decisions. Research current opportunities, choose the work, and keep going without asking me to create individual tasks.";
  await page.getByLabel("Message Jenny").fill(requestText);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Assignment queued", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const snapshot = await (await request.get("/api/state")).json();
    const assignment = snapshot.assignments?.find((item: { instruction?: string }) => item.instruction?.includes(requestText));
    return assignment ? {
      activation: assignment.activation?.type,
      recurrence: assignment.recurrence?.kind,
      createdBy: assignment.createdBy,
      status: assignment.status,
      environment: assignment.environment,
      executionCount: snapshot.executions?.length ?? 0,
    } : null;
  }).toEqual({ activation: "continuous", recurrence: "daily", createdBy: "agent", status: "active", environment: "sandbox", executionCount: 0 });

  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("region", { name: "Goals" })).toContainText("Agent-owned goal");
  await page.reload();
  await expect(page.getByRole("region", { name: "Goals" })).toContainText("Agent-owned goal");
  await expect(page.getByText("Sandbox · no public delivery", { exact: true })).toBeVisible();
});

test("Context sidebar owns its view controls and the workspace theme toggles", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await expect(page.getByRole("button", { name: "Open context sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Calendar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open context sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Activity inspector" })).toBeVisible();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "About inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("button", { name: "All tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  await page.getByRole("navigation", { name: mobile ? "Mobile navigation" : "Desktop navigation" }).getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chat with Jenny", exact: true })).toBeAttached();
  await expect(page.getByRole("combobox", { name: "Chat mode" })).toHaveCount(0);
  await expect(page.locator(".operator-chat-composer .lucide-arrow-up")).toBeVisible();
  if (mobile) await page.getByRole("button", { name: "Switch agent or open settings" }).click();

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
