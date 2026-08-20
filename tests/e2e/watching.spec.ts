import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Watching opens on Explorations and places it first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  await expect(page.locator('[role="tab"]').first()).toContainText("Explorations");
  await expect(page.getByRole("tab", { name: /Explorations/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Watchlist/ })).toHaveAttribute("aria-selected", "false");
});

test("Watching lets a Presence review and persist a creator Watch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Watching", exact: true })).toBeVisible();
  await expect(page.getByText("Give Jenny a reason to look around.")).toBeVisible();

  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
  await page.getByLabel("What should this Presence watch?").fill("https://x.com/AlexHormozi");
  await expect(page.getByText("Here's what Jenny will watch")).toBeVisible();
  await expect(page.getByText("Creator", { exact: true })).toBeVisible();
  await page.getByLabel("Why should this Presence watch this?").fill("Learn from strong offers without imitating the voice.");
  await page.getByRole("button", { name: "Start watching", exact: true }).click();

  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await expect(page.locator(".watch-status")).toHaveText(/Active watch/);
  await expect(page.getByText("Waiting for first observation", { exact: true })).toBeVisible();
  await expect(page.getByText("This Watch is active. No action is needed yet; Jenny will show signals here when the connected source supplies them.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Performance baseline|Not started/, { exact: false })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove @AlexHormozi", exact: true }).click();
  await expect(page.getByText("No known things yet.")).toBeVisible();
});

test("Watching keeps topic and opportunity inputs as attention, not commands", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
  await page.getByLabel("What should this Presence watch?").fill("conversations involving AI agents, introductions, and founder problems");
  await expect(page.getByText("Opportunity", { exact: true })).toBeVisible();
  await expect(page.getByText("Notice relevant material", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start watching", exact: true }).click();
  await expect(page.getByText("Manual source", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for source material", { exact: true })).toBeVisible();
  await expect(page.getByText("This Watch is saved, but it needs connected or manually supplied material before Jenny can notice anything.", { exact: true })).toBeVisible();
});

test("Agent-authored attention card stays expanded", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  const card = page.getByRole("region", { name: /own attention/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("Current directions")).toBeVisible();
  await expect(card.getByRole("button", { name: "Run attention test" })).toBeVisible();
  await expect(card.getByRole("button", { name: /Expand|Minimize/ })).toHaveCount(0);
});

test("Watching proves Like, Repost, and Quote through the attention-test timeline", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const stateResponse = await request.get("/api/state");
  const state = await stateResponse.json();
  const presenceId = state.presence.id;
  const configured = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "sandbox", execution: { like: "auto", repost: "auto", quote: "auto" } }, presenceId } });
  expect(configured.ok()).toBeTruthy();
  const started = await request.post("/api/state", { data: { type: "startPlayground", presenceId, source: "fresh" } });
  expect(started.ok()).toBeTruthy();
  const session = (await started.json()).playgroundSessions[0];
  for (const [actorName, actorHandle, content] of [
    ["Quote author", "@quote_author", "attention-test-quote: a surprising detail worth adding to."],
    ["Repost author", "@repost_author", "attention-test-repost: a clear standalone point worth passing along."],
    ["Like author", "@like_author", "attention-test-like: a useful idea that earns a quiet signal."],
  ] as const) {
    const added = await request.post("/api/state", { data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName, actorHandle, content } });
    expect(added.ok()).toBeTruthy();
  }
  await page.reload();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: "Run attention test", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Run attention test" })).toBeVisible();
  await expect(page.getByText(/Genny will inspect the available X context and decide whether to Like, Repost, Quote, or stay silent\./)).toBeVisible();
  await expect(page.getByText("Dry run / Sandbox", { exact: true })).toBeVisible();
  await expect(page.getByText("Real public X action", { exact: true })).toBeVisible();

  for (const action of ["Like", "Repost", "Quote"] as const) {
    if (action !== "Like") {
      await page.getByRole("button", { name: "Close attention test" }).click();
      await page.getByRole("button", { name: "Run attention test", exact: true }).click();
    }
    await page.getByLabel("I understand the selected execution mode and want to run this test.").check();
    await page.getByRole("button", { name: "Wake Genny in Sandbox", exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`${action} verified`) })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Genny chose ${action}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Agent-selected target", { exact: true })).toBeVisible();
    await expect(page.getByText("Recorded in Social Mirror", { exact: true })).toBeVisible();
    await expect(page.getByText("Visible in Feed and Calendar", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Feed record" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Calendar record" })).toBeVisible();
    if (action === "Quote") await expect(page.getByText("Agent-authored quote", { exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Close attention test" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Attention test history" })).toContainText("3 recorded");
});
