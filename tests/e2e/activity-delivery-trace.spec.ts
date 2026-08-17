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
    body.presence.environment = "live";
    const listedPresence = body.presences?.find((item: { id: string }) => item.id === presenceId);
    if (listedPresence) listedPresence.environment = "live";
    body.socialIntents.push({ id: intentId, agentId: body.agent.id, presenceId, affordance: "x.reply", target: { type: "x.post", id: "legacy-source-post" }, priority: 1, validity: {}, state: "active", formedAt: now, updatedAt: now });
    body.executions.push({ id: executionId, socialIntentId: intentId, presenceId, affordance: "x.reply", mode: "auto", status: "failed", attempts: 1, connector: "native", idempotencyKey: executionId, target: { type: "x.post", id: "legacy-source-post" }, failure: { message: "X rejected this action: You can only reply where you are mentioned or are the author.", retryable: false }, createdAt: now, updatedAt: now, environment: "live" });
    body.mirrorObjects.push({ id: sourceObjectId, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "legacy-source-post" }, objectType: "post", author: { displayName: "Jahan", handle: "jahan" }, content: { text: "A post the Presence considered." }, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live" });
    body.events.unshift({ id: "legacy-delivery-event", type: "execution", title: "X delivery failed", detail: "X rejected this action. No external artifact was counted.", time: now, tone: "warning", presenceId, executionId, intentId, sourceObjectId });
    body.events.unshift({ id: "legacy-pulse-event", type: "system", title: "Pulse completed", detail: "Genny chose a contextual reply, but X rejected delivery; no external reply is counted.", time: now, tone: "positive", presenceId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const queue = page.locator("[data-testid=execution-queue-summary]");
  await expect(queue).toContainText("1 need attention");
  await expect(queue).toContainText("1 previous action was not delivered");
  await expect(queue).toContainText("Latest:");
  const pulse = page.locator(".event-row").filter({ hasText: "Pulse completed" }).first();
  await expect(pulse).toContainText("View details");
  await pulse.click();
  await expect(page.locator(".activity-event-detail-panel").filter({ hasText: "Selected Reply" })).toBeVisible();
  await expect(page.locator(".activity-event-detail-panel").filter({ hasText: "failed · auto" })).toBeVisible();
  await expect(pulse.locator(".event-icon")).toHaveClass(/tone-warning/);
});

test("Activity shows every public attempt triggered by the latest Pulse", async ({ page }) => {
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
    const now = new Date().toISOString();
    const latestInvocationId = "pulse:latest-check";
    const priorInvocationId = "pulse:prior-check";
    body.presence.environment = "live";
    const listedPresence = body.presences?.find((item: { id: string }) => item.id === presenceId);
    if (listedPresence) listedPresence.environment = "live";
    const addAttempt = (suffix: string, invocationId: string, text: string, status: "succeeded" | "failed") => {
      const intentId = `attempt-intent-${suffix}`;
      const executionId = `attempt-execution-${suffix}`;
      body.socialIntents.push({ id: intentId, agentId, presenceId, affordance: "x.reply", target: { type: "x.post", id: `source-${suffix}` }, priority: 1, validity: {}, state: "active", formedAt: now, updatedAt: now, environment: "live" });
      body.executions.push({ id: executionId, socialIntentId: intentId, presenceId, affordance: "x.reply", mode: "auto", status, attempts: 1, connector: "native", idempotencyKey: executionId, target: { type: "x.post", id: `source-${suffix}` }, publication: { id: `publication-${suffix}`, format: "x.reply", payload: { text }, assetIds: [], links: [], publicExpression: { text }, createdAt: now, environment: "live", invocationId }, failure: status === "failed" ? { message: "X rejected this action.", retryable: false } : undefined, createdAt: now, updatedAt: now, executedAt: now, environment: "live", invocationId });
    };
    addAttempt("old", priorInvocationId, "Older check reply that must stay out of this result.", "succeeded");
    addAttempt("one", latestInvocationId, "Latest check reply one.", "succeeded");
    addAttempt("two", latestInvocationId, "Latest check reply two.", "failed");
    body.events.unshift({ id: "latest-pulse-event", type: "system", title: "Pulse completed", detail: "The latest check attempted two public replies.", time: now, tone: "warning", presenceId, invocationId: latestInvocationId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const attempts = page.locator('section[aria-label="Recent public posts and replies"]');
  await expect(attempts).toContainText("What this check triggered");
  await expect(attempts).toContainText("2 actions");
  await expect(attempts).toContainText("Latest check reply one.");
  await expect(attempts).toContainText("Latest check reply two.");
  await expect(attempts).not.toContainText("Older check reply that must stay out of this result.");
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
    body.assignments.push({ id: "pipeline-next-assignment", agentId, presenceId, channelId: "x", environment: "live", instruction: "Surface one grounded founder question about AI agents and identify the most useful next step.", deliverable: { type: "original_publication", quantity: 1, quantityMode: "exact" }, schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" }, executionPolicy: { usePresenceEnvelope: true }, status: "accepted", progress: { required: 1, verified: 0 }, rejectedCandidates: 0, systemFailures: 0, createdAt: now, updatedAt: now });
    const heartbeat = new Date(Date.now() - 10_000).toISOString();
    body.bridges.push({ id: "pipeline-bridge", presenceId, channelId: "x", name: "OpenPresence X Bridge", kind: "bridge", state: "online", adapterStatus: "connected", lastHeartbeatAt: heartbeat, lastSeenAt: heartbeat, capabilities: { inbound: true, reconcile: true, affordances: ["reply", "follow"], formats: ["x.reply", "x.post"], metrics: [] }, createdAt: now, updatedAt: now });
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
      body.executions.push({ id: executionId, socialIntentId: intentId, presenceId, affordance: `x.${record.action}`, mode: "auto", status: "queued", attempts: 0, connector: "bridge", bridgeId: "pipeline-bridge", idempotencyKey: executionId, target: { type: "x.post", id: objectId }, createdAt: now, updatedAt: now, environment: "live" });
      body.mirrorObjects.push({ id: objectId, bridgeId: "native:pipeline", presenceId, channelId: "x", externalRef: { type: "x.post", id: objectId }, objectType: "post", author: { displayName: record.author.slice(1), handle: record.author }, content: { text: record.text }, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live" });
      body.events.unshift({ id: `pipeline-event-${record.suffix}`, type: "decision", title: "Action selected", detail: `Genny selected a ${record.action} for ${record.author}.`, time: now, tone: "positive", presenceId, intentId, executionId, decisionId, sourceObjectId: objectId });
    }
    body.events.unshift({ id: "pipeline-unrelated-event", type: "memory", title: "Unrelated memory", detail: "This event should not appear in a scoped pipeline view.", time: now, tone: "neutral", presenceId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const nextAssignment = page.locator(".activity-status-block").filter({ hasText: "Next assignment" });
  await expect(nextAssignment).toContainText("Assignment");
  await expect(nextAssignment).toContainText("Tuesday at 08:00");
  await expect(nextAssignment).toContainText("Instruction");
  await expect(nextAssignment).toContainText("Surface one grounded founder question about AI agents and identify the most useful next step.");
  await expect(nextAssignment).toContainText("This is not a drafted post or a warning.");
  await expect(page.locator(".execution-send-timing")).toContainText("Next send attempt in");
  await expect(page.locator(".execution-send-timing")).toContainText("Chrome extension checks the queue");
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

test("Activity shows the actual publication metrics behind a performance event", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const presenceId = body.presence.id;
    const sourceObjectId = "publication-evidence-source";
    const now = new Date().toISOString();
    body.mirrorObjects.push({ id: sourceObjectId, bridgeId: "native:evidence", presenceId, channelId: "x", externalRef: { type: "x.post", id: "evidence-post" }, objectType: "post", author: { displayName: "Boardy", handle: "boardyai" }, content: { text: "A verified publication with measurable performance." }, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live" });
    body.publicationMetricSnapshots.unshift({ id: "publication-evidence-snapshot", presenceId, mirrorObjectId: sourceObjectId, observedAt: now, publicationAgeSeconds: 7200, impressions: 2400, likes: 37, replies: 8, reposts: 4, quotes: 2, source: "native", observationStatus: "observed", baseline: { comparableCount: 5, confidence: "medium", relative: { impressions: 1.4 } } });
    body.events.unshift({ id: "publication-evidence-event", type: "learning", title: "Publication performance observed", detail: "Performance evidence for a verified X publication is available for Growth review.", time: now, tone: "positive", presenceId, sourceObjectId });
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const event = page.locator(".event-row").filter({ hasText: "Publication performance observed" }).first();
  await event.click();
  const detail = page.locator(".activity-event-detail-panel").filter({ hasText: "Measured evidence" });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".activity-performance-metrics")).toContainText("2,400");
  await expect(detail.locator(".activity-performance-metrics")).toContainText("37");
  await expect(detail.locator(".activity-performance-metrics")).toContainText("8");
  await expect(detail.locator(".activity-performance-metrics")).toContainText("4");
  await expect(detail.locator(".activity-performance-metrics")).toContainText("2");
  await expect(detail).toContainText("Native X");
  await expect(detail).toContainText("2h old");
  await expect(detail).toContainText("5 similar publications");
  await expect(detail).toContainText("+40% impressions vs baseline");
});
