import { expect, test } from "@playwright/test";

test("Activity is truthful and paused Chat queues without waking", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await expect(page.getByTestId("right-now-status")).toBeVisible();
  await expect(page.getByTestId("right-now-status")).not.toContainText("Waiting to choose");
  await expect(page.getByRole("button", { name: /Look now|Look again next/ })).toBeVisible();
  await expect(page.getByText("Bring into view", { exact: true })).toHaveCount(0);
  await expect(page.getByText("View observed context", { exact: true })).toHaveCount(0);

  const snapshot = await (await request.get("/api/state")).json();
  const presenceId = snapshot.presence.id as string;
  expect((await request.post("/api/state", { data: { type: "setPresence", patch: { status: "paused" } }, headers: { "x-openpresence-presence-id": presenceId } })).ok()).toBeTruthy();

  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Chat with Genny" })).toBeVisible();
  await expect(page.getByText(/messages will be delivered and held/i)).toBeVisible();
  await page.getByPlaceholder("Message Genny…").fill("Please consider https://x.com/example/status/123");
  await page.getByRole("button", { name: "Queue message" }).click();
  await expect(page.getByText("Saved · waiting for Wake")).toBeVisible();

  const after = await (await request.get("/api/state")).json();
  expect(after.operatorNudges[0].status).toBe("held_paused");
  expect(after.presence.status).toBe("paused");
  await expect(page.getByRole("button", { name: "Rehearsal", exact: true })).toBeVisible();
});

test("live Chat does not invent a Presence reply before model judgment", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.route("**/api/link-preview?**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ url: "https://x.com/example/status/123", siteName: "X", title: "Example post", description: "A compact preview of the shared post." }),
  }));
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  const composer = page.getByPlaceholder("Message Genny…");
  const initialHeight = await composer.evaluate((node) => node.getBoundingClientRect().height);
  await composer.fill("Please consider https://x.com/example/status/123");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Got it.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Example post", { exact: true })).toBeVisible();
  await expect(page.getByText(/Delivered · waiting for Genny/i)).toHaveCount(0);
  await expect(page.getByText(/taking a closer look|use my own judgment/i)).toHaveCount(0);
  await expect(page.getByText("QUEUED", { exact: true })).toHaveCount(0);

  await composer.fill("One\nTwo\nThree\nFour");
  const expandedHeight = await composer.evaluate((node) => node.getBoundingClientRect().height);
  expect(initialHeight).toBeLessThanOrEqual(42);
  expect(expandedHeight).toBeGreaterThan(initialHeight);
});

test("Chat and Rehearsal share Teach's conversation workspace geometry", async ({ page, request }) => {
  test.skip(test.info().project.name === "mobile", "Mobile conversation layout is covered by the responsive viewport suite.");
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const geometry = async () => page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing layout node: ${selector}`);
      const box = node.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height), bottom: Math.round(box.bottom) };
    };
    return {
      heading: rect(".page-heading"),
      layout: rect(".chat-layout"),
      thread: rect(".chat-thread"),
      composer: rect(".chat-composer"),
      aside: rect(".chat-context-sidebar"),
      documentScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    };
  });

  await page.locator(".sidebar").getByRole("button", { name: "Teach", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Teach the Agent through conversation." })).toBeVisible();
  const teach = await geometry();

  await page.locator(".sidebar").getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Chat with/ })).toBeVisible();
  const chat = await geometry();

  await page.locator(".sidebar").getByRole("button", { name: "Rehearsal", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Rehearse with/ })).toBeVisible();
  const rehearsal = await geometry();

  for (const candidate of [chat, rehearsal]) {
    expect(candidate.heading).toEqual(teach.heading);
    expect(candidate.layout).toEqual(teach.layout);
    expect(candidate.thread).toEqual(teach.thread);
    expect(candidate.composer.left).toBe(teach.composer.left);
    expect(candidate.composer.width).toBe(teach.composer.width);
    expect(Math.abs(candidate.composer.bottom - teach.composer.bottom)).toBeLessThanOrEqual(1);
    expect(candidate.aside).toEqual(teach.aside);
    expect(candidate.documentScrolls).toBe(false);
  }
  expect(chat.composer.height).toBeLessThan(teach.composer.height);
  expect(rehearsal.composer.height).toBe(teach.composer.height);
});
