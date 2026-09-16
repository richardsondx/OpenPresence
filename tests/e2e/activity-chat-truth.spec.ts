import { expect, test } from "@playwright/test";

test("Activity is truthful and paused Chat queues without waking", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/activity");

  await expect(page.getByTestId("right-now-status")).toBeVisible();
  await expect(page.getByTestId("right-now-status")).not.toContainText("Waiting to choose");
  await expect(page.getByRole("button", { name: /Look now|Look again next/ })).toBeVisible();
  await expect(page.getByText("Bring into view", { exact: true })).toHaveCount(0);
  await expect(page.getByText("View observed context", { exact: true })).toHaveCount(0);

  const snapshot = await (await request.get("/api/state")).json();
  const presenceId = snapshot.presence.id as string;
  expect((await request.post("/api/state", { data: { type: "setPresence", patch: { status: "paused" } }, headers: { "x-openpresence-presence-id": presenceId } })).ok()).toBeTruthy();

  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Main" })).toBeVisible();
  await expect(page.getByText(/messages will be delivered and held/i)).toBeVisible();
  await page.getByPlaceholder("Message Genny…").fill("Please consider https://x.com/example/status/123");
  await page.getByRole("button", { name: "Queue message" }).click();
  await expect(page.getByText("Saved · waiting for Wake")).toBeVisible();

  const after = await (await request.get("/api/state")).json();
  expect(after.operatorNudges[0].status).toBe("held_paused");
  expect(after.presence.status).toBe("paused");
  await expect(page.getByRole("button", { name: "Rehearsal", exact: true })).toBeVisible();
});

test("live Chat gives shared context a clear receipt before model judgment", async ({ page, request }) => {
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
  await expect(page.getByText(/I’m checking the post you shared now/i)).toBeVisible();
  await expect(page.getByText("Example post", { exact: true })).toBeVisible();
  await expect(page.getByText(/Delivered · waiting for Genny/i)).toHaveCount(0);
  await expect(page.getByText(/taking a closer look|use my own judgment/i)).toHaveCount(0);
  await expect(page.getByText("QUEUED", { exact: true })).toHaveCount(0);

  await composer.fill("One\nTwo\nThree\nFour");
  const expandedHeight = await composer.evaluate((node) => node.getBoundingClientRect().height);
  expect(initialHeight).toBeLessThanOrEqual(42);
  expect(expandedHeight).toBeGreaterThan(initialHeight);
});

test("live Chat answers an ordinary question without turning it into post planning", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await page.getByPlaceholder("Message Genny…").fill("What do you think about our growth right now?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("What do you think about our growth right now?", { exact: true })).toBeVisible();
  await expect(page.getByText(/I’m treating growth as a direction, not a quota\./i)).toBeVisible();
  const after = await (await request.get("/api/state")).json();
  expect(after.operatorNudges ?? []).toHaveLength(0);
  expect(after.operatorConversations?.[0]?.messages.at(-1)?.role).toBe("presence");
});

test("Chat shows a compact browser activity receipt only during active browser delivery", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const presenceId = body.presence.id;
    const now = new Date().toISOString();
    body.operationalRuns = [{ id: "chat-browser-run", presenceId, kind: "operator_chat", state: "running", stage: "operator_chat.delivery", attemptCount: 1, recoveryCount: 0, createdAt: now, lastProgressAt: now }];
    body.executions = [{ id: "chat-browser-execution", socialIntentId: "chat-browser-intent", presenceId, affordance: "x.reply", mode: "auto", status: "executing", attempts: 1, connector: "bridge", bridgeId: "chat-browser-bridge", runId: "chat-browser-run", idempotencyKey: "chat-browser-execution", createdAt: now, updatedAt: now, environment: "live" }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/chat");
  const receipt = page.getByTestId("operator-chat-browser-activity");
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Using Chrome and the browser");
  await receipt.locator("summary").click();
  await expect(receipt).toContainText("Authorized browser capability");
  await expect(receipt).toContainText("Sending reply through Chrome");
});

test("live Chat turns an explicit publication direction into durable public-action work", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Poko");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await page.getByPlaceholder("Message Poko…").fill("Introduce yourself to the world. You just woke up for the first time. Make your first tweet");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Required Assignment queued. Its result will return to this conversation.", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const after = await (await request.get("/api/state")).json();
    return {
      nudges: after.operatorNudges?.length ?? 0,
      linkedAssignments: after.operatorNudges?.filter((nudge: { assignmentId?: string }) => Boolean(nudge.assignmentId)).length ?? 0,
      assignmentPosts: after.assignments?.filter((assignment: { deliverable?: { type?: string } }) => assignment.deliverable?.type === "original_publication").length ?? 0,
    };
  }).toEqual({ nudges: 1, linkedAssignments: 1, assignmentPosts: 1 });
});

test("Chat retries converge on one operator turn", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const snapshot = await (await request.get("/api/state")).json();
  const presenceId = snapshot.presence.id as string;
  const clientRequestId = "browser-retry-operator-turn";
  const body = { type: "sendPresenceNudge", presenceId, content: "What did you do recently?", clientRequestId };
  const responses = await Promise.all([
    request.post("/api/state", { data: body }),
    request.post("/api/state", { data: body }),
  ]);
  expect(responses.every((response) => response.ok())).toBe(true);
  const after = await (await request.get("/api/state")).json();
  const messages = after.operatorConversations?.[0]?.messages.filter((message: { clientRequestId?: string }) => message.clientRequestId === clientRequestId) ?? [];
  expect(messages).toHaveLength(1);
  expect(after.operatorNudges ?? []).toHaveLength(0);
});

test("Chat can turn an explicit person-watch request into a Watch", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");

  await page.getByPlaceholder("Message Genny…").fill("Keep watching @builder_one");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/I’m with you|keep an eye on @builder_one/i).last()).toBeVisible();

  const after = await (await request.get("/api/state")).json();
  expect(after.watches.some((watch: { query: string }) => watch.query === "@builder_one")).toBe(true);
  expect(after.operatorNudges ?? []).toHaveLength(0);
});

test("Chat removes its context sidebar while conversation geometry stays stable", async ({ page, request }) => {
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
      aside: (() => {
        const node = document.querySelector<HTMLElement>(".chat-context-sidebar");
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height), bottom: Math.round(box.bottom) };
      })(),
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

  expect(chat.heading.left).toBe(teach.heading.left);
  expect(chat.layout.left).toBe(teach.layout.left);
  expect(chat.layout.width).toBe(teach.layout.width);
  expect(chat.thread.width).toBe(chat.layout.width);
  expect(chat.aside).toBeNull();
  expect(rehearsal.aside).toBeNull();
  expect(chat.documentScrolls).toBe(false);
  expect(rehearsal.documentScrolls).toBe(false);
});
