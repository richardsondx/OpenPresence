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

test("Activity pipeline cards reveal the exact selected and preparing actions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const presenceId = body.presence.id;
    const agentId = body.agent.id;
    body.presence.environment = "live";
    const listedPresence = body.presences?.find((item: { id: string }) => item.id === presenceId);
    if (listedPresence) listedPresence.environment = "live";
    const now = new Date().toISOString();
    const records = [
      { suffix: "one", author: "@boardyai", text: "A post about reliable agents.", action: "reply" },
      { suffix: "two", author: "@builder", text: "A post about durable workflows.", action: "follow" },
    ];
    for (const record of records) {
      const intentId = `pipeline-intent-${record.suffix}`;
      const executionId = `pipeline-execution-${record.suffix}`;
      const decisionId = `pipeline-decision-${record.suffix}`;
      const objectId = `pipeline-object-${record.suffix}`;
      body.socialIntents.push({ id: intentId, agentId, presenceId, affordance: `x.${record.action}`, target: { type: "x.post", id: objectId }, priority: 1, validity: {}, state: "active", formedAt: now, updatedAt: now, environment: "live" });
      body.socialDecisions.push({ id: decisionId, agentId, presenceId, environment: "live", focalMirrorObjectIds: [objectId], decision: record.action, summary: `Selected ${record.action} because it adds useful context.`, influences: ["Mission", "Current social context"], confidence: "high", socialIntentId: intentId, createdAt: now });
      body.executions.push({ id: executionId, socialIntentId: intentId, presenceId, affordance: `x.${record.action}`, mode: "auto", status: "queued", attempts: 0, connector: "native", idempotencyKey: executionId, target: { type: "x.post", id: objectId }, createdAt: now, updatedAt: now, environment: "live" });
      body.mirrorObjects.push({ id: objectId, bridgeId: "native:pipeline", presenceId, channelId: "x", externalRef: { type: "x.post", id: objectId }, objectType: "post", author: { displayName: record.author.slice(1), handle: record.author }, content: { text: record.text }, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live" });
      body.events.unshift({ id: `pipeline-event-${record.suffix}`, type: "decision", title: "Action selected", detail: `Genny selected a ${record.action} for ${record.author}.`, time: now, tone: "positive", presenceId, intentId, executionId, decisionId, sourceObjectId: objectId });
    }
    body.events.unshift({ id: "pipeline-unrelated-event", type: "memory", title: "Unrelated memory", detail: "This event should not appear in a scoped pipeline view.", time: now, tone: "neutral", presenceId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("button", { name: /2 selected/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /2 selected/ }).first().click();
  await expect(page.getByRole("heading", { name: "Selected decisions" })).toBeVisible();
  const selectedPanel = page.locator(".activity-focus-panel");
  await expect(selectedPanel).toContainText("2 decisions from this check");
  await expect(selectedPanel).toContainText("@boardyai");
  await expect(selectedPanel).toContainText("@builder");
  await expect(selectedPanel.locator(".activity-state-chip")).toHaveCount(2);
  await expect(page.getByText("This event should not appear in a scoped pipeline view.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /2 preparing/ }).first().click();
  await expect(page.getByRole("heading", { name: "Actions being prepared" })).toBeVisible();
  const preparingPanel = page.locator(".activity-focus-panel");
  await expect(preparingPanel).toContainText("2 actions from this check");
  await expect(preparingPanel.locator(".activity-state-chip")).toHaveCount(2);
  await expect(preparingPanel).toContainText("Preparing");
  await expect(page.getByText("This event should not appear in a scoped pipeline view.", { exact: true })).toHaveCount(0);
});
