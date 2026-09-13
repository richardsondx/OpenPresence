import { expect, test } from "@playwright/test";

test("Chat distinguishes sending from confirmed agent work", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await page.route("**/api/state", async (route) => {
    const requestData = route.request().postDataJSON() as { type?: string } | null;
    if (route.request().method() === "POST" && requestData?.type === "sendPresenceNudge") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });

  await page.goto("/chat");
  await page.getByPlaceholder("Message Genny…").fill("What should we pay attention to today?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sending…", { exact: true })).toBeVisible();
  await expect(page.getByTestId("operator-chat-thinking")).toHaveCount(0);
});

test("Chat makes an accepted action visibly distinct from a missing reply", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Poko");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await page.getByPlaceholder("Message Poko…").fill("Actually make the tweet");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Required Assignment queued. Its result will return to this conversation.", { exact: true })).toBeVisible();
});

test("Chat keeps the composer usable and queues later turns behind the first", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Queue Agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  let delayedFirstSend = true;
  await page.route("**/api/state", async (route) => {
    const requestData = route.request().postDataJSON() as { type?: string } | null;
    if (route.request().method() === "POST" && requestData?.type === "sendPresenceNudge" && delayedFirstSend) {
      delayedFirstSend = false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });

  await page.goto("/chat");
  const composer = page.getByLabel("Message Queue Agent");
  await composer.fill("First turn stays first.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("First turn stays first.", { exact: true })).toBeVisible();
  await expect(page.getByText("Sending…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sending message", exact: true })).toBeVisible();

  await expect(composer).toBeEnabled();
  await composer.fill("Second turn waits behind it.");
  await expect(page.getByRole("button", { name: "Queue message", exact: true })).toBeEnabled();
  await expect(page.getByTestId("operator-chat-queue-status")).toContainText("you can keep typing");
  await page.getByRole("button", { name: "Queue message", exact: true }).click();
  await expect(page.getByText("Second turn waits behind it.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("operator-chat-queue-status")).toContainText("you can keep typing");
});
