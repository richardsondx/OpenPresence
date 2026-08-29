import { expect, test } from "@playwright/test";

test("Chat shows the Presence thinking while a response is being prepared", async ({ page, request }) => {
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
  await expect(page.getByTestId("operator-chat-thinking")).toBeVisible();
  await expect(page.getByTestId("operator-chat-thinking")).toContainText("Genny is thinking");
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
