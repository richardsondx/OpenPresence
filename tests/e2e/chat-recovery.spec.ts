import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Recovery Agent");
  await page.getByRole("button", { name: /Create Agent \+ Presence|Meet my Agent/ }).click();
  await page.goto("/chat");
});

test("an interrupted send keeps the turn and next draft, then retries once after reload", async ({ page, request }) => {
  const sentKeys: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let fail = true;
  await page.route("**/api/state", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (body.type !== "sendPresenceNudge") return route.continue();
    sentKeys.push(body.clientRequestId);
    if (fail) { await hold; return route.abort("failed"); }
    return route.continue();
  });
  const composer = page.getByLabel("Message Recovery Agent");
  await composer.fill("are you struggling");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending message", exact: true })).toBeVisible();
  await expect(page.getByTestId("operator-chat-outbox")).toHaveCount(0);
  await expect(page.getByTestId("operator-chat-thinking")).toHaveCount(0);
  await composer.fill("did you post recently?");
  release();
  await expect(page.getByRole("button", { name: "Retry send" })).toBeVisible();
  await expect(page.getByText("are you struggling", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("did you post recently?");
  await page.reload();
  await expect(page.getByText("are you struggling", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry send" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry send" }).click();
  await expect(page.getByRole("button", { name: "Retry send" })).toHaveCount(0);
  await expect(page.locator(".operator-chat-message.is-presence")).not.toHaveCount(0);
  const state = await (await request.get("/api/state?projection=chat")).json();
  const messages = state.operatorConversations.flatMap((conversation: { messages: unknown[] }) => conversation.messages);
  expect(messages.filter((message: { clientRequestId?: string }) => message.clientRequestId === sentKeys[0])).toHaveLength(1);
  expect(sentKeys).toEqual([sentKeys[0], sentKeys[0]]);
  await page.reload();
  await expect(page.getByText("are you struggling", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("recovered-turn.png"), fullPage: true });
});

test("a lost response reconciles the saved turn without a second send", async ({ page, request }) => {
  let sends = 0;
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON().type === "sendPresenceNudge") {
      sends += 1;
      await route.fetch(); // Commit through the real API, then lose its response.
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByLabel("Message Recovery Agent").fill("Please answer privately: what should we focus on?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry send" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("openpresence.chat-outbox.v1:")).length)).toBe(0);
  const state = await (await request.get("/api/state?projection=chat")).json();
  expect(state.operatorConversations.flatMap((item: { messages: { role: string }[] }) => item.messages).filter((item: { role: string }) => item.role === "operator")).toHaveLength(1);
  expect(sends).toBe(1);
});

test("a sendable first turn never renders the queue panel", async ({ page }) => {
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON().type === "sendPresenceNudge") {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return route.continue();
  });
  const composer = page.getByLabel("Message Recovery Agent");
  await composer.fill("Send immediately");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("operator-chat-outbox")).toHaveCount(0);
});

test("an unconfirmed first turn prevents later turns overtaking it", async ({ page, request }) => {
  let fail = true;
  const sends: string[] = [];
  await page.route("**/api/state", async (route) => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().type !== "sendPresenceNudge") return route.continue();
    sends.push(route.request().postDataJSON().content);
    return fail ? route.abort("failed") : route.continue();
  });
  const composer = page.getByLabel("Message Recovery Agent");
  await composer.fill("First private turn");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry send" })).toBeVisible();
  await composer.fill("Second private turn");
  await composer.press("Enter");
  await expect(page.getByTestId("operator-chat-outbox")).toContainText("2 queued");
  await expect(page.getByTestId("operator-chat-queued-message-2")).toContainText("Queued · not sent yet");
  await expect(page.getByTestId("operator-chat-queued-message-1")).toContainText("Not sent · retry needed");
  const queuedBackground = await page.getByTestId("operator-chat-queued-message-1").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(sends).toEqual(["First private turn"]);
  await page.reload();
  await expect(page.getByTestId("operator-chat-outbox")).toContainText("2 queued");
  await expect(page.getByTestId("operator-chat-queued-message-1")).toContainText("First private turn");
  await expect(page.getByTestId("operator-chat-queued-message-2")).toContainText("Second private turn");
  fail = false;
  await page.getByRole("button", { name: "Retry send" }).click();
  await expect.poll(async () => {
    const state = await (await request.get("/api/state?projection=chat")).json();
    return state.operatorConversations.flatMap((item: { messages: { role: string; content: string }[] }) => item.messages).filter((item: { role: string }) => item.role === "operator").map((item: { content: string }) => item.content);
  }).toEqual(["First private turn", "Second private turn"]);
  await expect(page.getByTestId("operator-chat-outbox")).toHaveCount(0);
  const sentMessage = page.locator(".operator-chat-message.is-operator").filter({ hasText: "First private turn" }).last();
  await expect(sentMessage).toBeVisible();
  const sentBackground = await sentMessage.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(sentBackground).not.toBe(queuedBackground);
  expect(sends).toEqual(["First private turn", "First private turn", "Second private turn"]);
});

test("selecting the current Agent from Schedule changes the URL and refreshes Chat", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Recovery Agent avatar X channel Recovery Agent/ }).click();
  await expect(page).toHaveURL(/\/chat\?/);
  await page.getByLabel("Message Recovery Agent").fill("Keep this navigation check private.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence")).not.toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  await expect(page.getByText("Keep this navigation check private.", { exact: true })).toBeVisible();
});
