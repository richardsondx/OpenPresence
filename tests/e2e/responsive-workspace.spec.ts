import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Chat with Jenny" })).toBeAttached();
});

function navigation(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: (page.viewportSize()?.width ?? 1440) < 768 ? "Mobile navigation" : "Desktop navigation" });
}

test("five destinations preserve Agent scope and Tasks remain a supervisory projection", async ({ page }) => {
  const nav = navigation(page);
  await expect(nav.getByRole("button")).toHaveText(["Chat", "Tasks", "People", "Growth", "Artifacts"]);
  for (const [name, route] of [["Tasks", "/schedule"], ["People", "/people"], ["Growth", "/growth"], ["Artifacts", "/artifacts"], ["Chat", "/chat"]]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(route + "(?:\\?|$)"));
    await expect(page.getByRole("button", { name: "About Jenny" })).toBeVisible();
    await expect(nav.getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await nav.getByRole("button", { name: "Growth", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Chat", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set a growth goal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm and create", exact: true })).toHaveCount(0);
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to Chat", exact: true })).toBeVisible();
  await expect(page.getByLabel("Edit Assignment instruction")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Jenny will add work here when Chat or her autonomous plan calls for it/i)).toBeVisible();
});

test("chat remains usable with media picker, durable messages, and reload", async ({ page }) => {
  const compose = page.getByLabel("Message Jenny", { exact: true });
  await compose.fill("Keep this conversation private. What can you help me with?");
  await page.getByRole("button", { name: "Attach media or files" }).click();
  await expect(page.getByRole("dialog", { name: "Add an image" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload an image" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your uploaded images" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(compose).toHaveValue("Keep this conversation private. What can you help me with?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-operator")).toContainText("Keep this conversation private.");
  await expect(page.locator(".operator-chat-message.is-presence").last()).toBeVisible({ timeout: 60000 });
  await page.reload();
  await expect(page.locator(".operator-chat-message.is-operator")).toContainText("Keep this conversation private.");
  const composerBounds = await page.locator(".operator-chat-composer").boundingBox();
  expect(composerBounds).not.toBeNull();
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    const dock = await navigation(page).boundingBox();
    expect(composerBounds!.y + composerBounds!.height).toBeLessThanOrEqual(dock!.y);
    expect(dock!.y - composerBounds!.y - composerBounds!.height).toBeLessThan(40);
  }
});

test("Agent menu retains setup and testing without competing daily tabs", async ({ page }) => {
  if ((page.viewportSize()?.width ?? 1440) < 768) await page.getByRole("button", { name: "Switch agent or open settings" }).click();
  await page.getByRole("button", { name: "Agent menu", exact: true }).click();
  await expect(page.getByRole("menuitem").filter({ hasText: "Knowledge" })).toHaveCount(0);
  await page.getByRole("menuitem").filter({ hasText: "Test agent" }).click();
  await expect(page).toHaveURL(/\/rehearsal/);
  await expect(navigation(page).getByRole("button", { name: "Chat", exact: true })).toBeVisible();
});

test("existing media survives send and reload, and Agent details stay compact", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await navigation(page).getByRole("button", { name: "Artifacts", exact: true }).click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Media", exact: true })).toBeVisible();
  await page.getByLabel("Upload assets", { exact: true }).setInputFiles("docs/social-post-assets/agent-and-presence.png");
  await expect(page.locator(".asset-card")).toHaveCount(1, { timeout: 60000 });
  await page.reload();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Close media details" })).toHaveCount(0);
  await navigation(page).getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Attach media or files" }).click();
  await page.locator(".chat-media-grid button").first().click();
  await page.getByLabel("Message Jenny", { exact: true }).fill("Describe this image in this private conversation.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence").last()).toBeVisible({ timeout: 60000 });
  await page.reload();
  const receipt = page.locator(".chat-media-receipts img").first();
  await expect(receipt).toBeVisible();
  await expect.poll(() => receipt.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const query = new URL(page.url()).search;
  const snapshot = await (await request.get(`/api/state${query}`)).json();
  const messages = snapshot.operatorConversations.flatMap((conversation: { messages: unknown[] }) => conversation.messages);
  expect(messages.some((message: { attachments?: { existingAssetId?: string }[] }) => message.attachments?.some(attachment => attachment.existingAssetId === snapshot.assets[0].id))).toBe(true);
  expect(snapshot.assets).toHaveLength(1);
  await page.getByRole("button", { name: "Open context sidebar" }).click();
  const inspector = page.getByRole("complementary", { name: "Activity inspector" });
  await expect(inspector.getByRole("navigation", { name: "Agent details" }).getByRole("button")).toHaveText(["Activity", "About"]);
  await inspector.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "About inspector" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "About inspector" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
