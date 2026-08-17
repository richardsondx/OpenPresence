import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Activity explains a legacy failed Pulse from its adjacent delivery event", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const presenceId = body.presence.id;
    const intentId = "legacy-trace-intent";
    const executionId = "legacy-trace-execution";
    const sourceObjectId = "legacy-trace-source";
    const now = new Date().toISOString();
    body.socialIntents.push({ id: intentId, agentId: body.agent.id, presenceId, affordance: "x.reply", target: { type: "x.post", id: "legacy-source-post" }, priority: 1, validity: {}, state: "active", formedAt: now, updatedAt: now });
    body.executions.push({ id: executionId, socialIntentId: intentId, presenceId, affordance: "x.reply", mode: "auto", status: "failed", attempts: 1, connector: "native", idempotencyKey: executionId, target: { type: "x.post", id: "legacy-source-post" }, failure: { message: "X rejected this action: You can only reply where you are mentioned or are the author.", retryable: false }, createdAt: now, updatedAt: now });
    body.mirrorObjects.push({ id: sourceObjectId, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "legacy-source-post" }, objectType: "post", author: { displayName: "Jahan", handle: "jahan" }, content: { text: "A post the Presence considered." }, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live" });
    body.events.unshift({ id: "legacy-delivery-event", type: "execution", title: "X delivery failed", detail: "X rejected this action. No external artifact was counted.", time: now, tone: "warning", presenceId, executionId, intentId, sourceObjectId });
    body.events.unshift({ id: "legacy-pulse-event", type: "system", title: "Pulse completed", detail: "Genny chose a contextual reply, but X rejected delivery; no external reply is counted.", time: now, tone: "positive", presenceId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const pulse = page.locator(".event-row").filter({ hasText: "Pulse completed" }).first();
  await expect(pulse).toContainText("View details");
  await pulse.click();
  await expect(page.locator(".activity-event-detail-panel").filter({ hasText: "Selected Reply" })).toBeVisible();
  await expect(page.locator(".activity-event-detail-panel").filter({ hasText: "failed · auto" })).toBeVisible();
  await expect(pulse.locator(".event-icon")).toHaveClass(/tone-warning/);
});
