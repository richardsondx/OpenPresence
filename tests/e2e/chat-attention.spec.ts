import { expect, test } from "@playwright/test";

type HealthMode = "blocked" | "healthy";

type HealthFixture = {
  presenceId: string;
  incidentId: string;
  mode: HealthMode;
};

type StateAssignment = {
  instruction?: string;
  [key: string]: unknown;
};

async function createAgent(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, name = "Genny") {
  await page.goto("/");
  await page.getByLabel("Agent name").fill(name);
  await page.getByLabel("Presence handle").fill("@example_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: `Chat with ${name}` })).toBeAttached();
  const state = await request.get("/api/state").then((response) => response.json());
  return { agentId: state.agent.id as string, presenceId: state.presence.id as string };
}

function healthPayload(fixture: HealthFixture) {
  const now = new Date().toISOString();
  if (fixture.mode === "healthy") {
    return {
      now,
      status: "healthy",
      summary: "The Presence can continue public work.",
      operatorAction: null,
      presenceId: fixture.presenceId,
      counts: { activeIncidents: 0, recoveringIncidents: 0, waitingIncidents: 0, needsOperatorIncidents: 0, orphanRecoveringRuns: 0 },
      dependencyHealth: [],
      incidents: [],
      activeRuns: [],
      dueWakeCount: 0,
      heartbeats: [],
    };
  }
  return {
    now,
    status: "needs_you",
    summary: "X API credits are exhausted. Public X work is waiting for your decision.",
    operatorAction: { kind: "settings", label: "Review Settings" },
    presenceId: fixture.presenceId,
    counts: { activeIncidents: 1, recoveringIncidents: 0, waitingIncidents: 0, needsOperatorIncidents: 1, orphanRecoveringRuns: 0 },
    dependencyHealth: [],
    incidents: [{
      id: fixture.incidentId,
      rootCauseKey: "runtime.native_x_credits_exhausted",
      state: "needs_operator",
      safeSummary: "X API credits are exhausted.",
      affectedRunIds: ["run-x-credit-blocked"],
      recoveryAttempts: 1,
      operatorActionRequired: true,
      requiresAuth: false,
      lastObservedAt: now,
    }],
    activeRuns: [],
    dueWakeCount: 0,
    heartbeats: [],
  };
}

async function installHealthFixture(page: import("@playwright/test").Page, fixture: HealthFixture) {
  await page.route("**/api/runtime/health**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(healthPayload(fixture)) });
  });
}

async function installBlockedTaskFixture(page: import("@playwright/test").Page, instruction: string, health?: HealthFixture) {
  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/state") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json() as { assignments?: StateAssignment[] } & Record<string, unknown>;
    const assignment = body.assignments?.find((item) => item.instruction === instruction);
    if (assignment) {
      const timestamp = new Date().toISOString();
      Object.assign(assignment, {
        status: health?.mode === "healthy" ? "completed" : "needs_operator",
        title: "Publish the launch note to X",
        lastOutcome: { class: "delivery_failed", message: "X API credits are exhausted.", at: timestamp },
        work: { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0, blockedReason: "X API credits are exhausted." },
        updatedAt: timestamp,
      });
    }
    await route.fulfill({ response, json: body });
  });
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

test("blocked X task explains the recovery, preserves composer context, and checks through the chat outbox", async ({ page, request }) => {
  const identity = await createAgent(page, request);
  const fixture: HealthFixture = { presenceId: identity.presenceId, incidentId: "incident-x-credits-v1", mode: "blocked" };
  const instruction = "Publish the launch note when the public X route is available.";
  const created = await request.post("/api/state", {
    data: { type: "createAssignment", presenceId: fixture.presenceId, environment: "live", instruction },
  });
  expect(created.ok()).toBeTruthy();
  await installBlockedTaskFixture(page, instruction);
  await installHealthFixture(page, fixture);

  const sendBodies: Array<Record<string, unknown>> = [];
  page.on("request", (requestEvent) => {
    if (requestEvent.method() !== "POST" || new URL(requestEvent.url()).pathname !== "/api/state") return;
    const body = requestEvent.postDataJSON() as Record<string, unknown> | null;
    if (body?.type === "sendPresenceNudge") sendBodies.push(body);
  });

  await page.goto(`/chat?agentId=${identity.agentId}&presenceId=${identity.presenceId}`);
  const history = page.locator(".operator-chat-history");
  const notice = history.getByTestId("operator-chat-needs-you");
  await expect(notice).toBeVisible();
  await expect(notice.getByText("X access needs a recheck", { exact: true })).toBeVisible();
  await page.screenshot({ path: "qa-learnings/chat-attention-2026-09-13/desktop.png" });
  await expect(notice.getByText("Task details", { exact: true })).toBeVisible();
  await notice.getByText("Task details", { exact: true }).click();
  await expect(notice).toContainText("Publish the launch note");
  await expect(notice).toContainText("X API credits are exhausted.");
  await expect(notice.getByRole("link", { name: "X Developer Console", exact: true })).toHaveAttribute("href", "https://console.x.com/");
  await expect(notice.getByRole("link", { name: /Settings/i })).toHaveCount(0);
  // The task is authoritative if the advisory health projection lags behind it.
  fixture.mode = "healthy";
  await page.reload();
  await expect(notice).toBeVisible();
  await expect(notice.getByText("X access needs a recheck", { exact: true })).toBeVisible();

  const composer = page.getByLabel("Message Genny", { exact: true });
  await page.getByRole("button", { name: "Attach media or files", exact: true }).click();
  await page.getByRole("button", { name: "Upload an image", exact: true }).click();
  await page.locator('input[aria-label="Upload an image"]').setInputFiles({ name: "recovery-context.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByText("recovery-context.png", { exact: true })).toBeVisible();
  await composer.fill("Keep this draft while I check credits.");

  await notice.getByRole("button", { name: "Check again", exact: true }).click();
  await expect.poll(() => sendBodies.length).toBeGreaterThan(0);
  expect(sendBodies[0]).toMatchObject({ type: "sendPresenceNudge", clientRequestId: expect.any(String) });
  expect(String(sendBodies[0]?.content ?? "")).toMatch(/credit|X/i);
  await expect.poll(async () => {
    const saved = await request.get(`/api/state?projection=chat&presenceId=${identity.presenceId}`).then((response) => response.json());
    return saved.operatorConversations?.flatMap((conversation: { messages: Array<{ clientRequestId?: string }> }) => conversation.messages).some((message: { clientRequestId?: string }) => message.clientRequestId === sendBodies[0]?.clientRequestId);
  }).toBe(true);
  await expect(composer).toHaveValue("Keep this draft while I check credits.");
  await expect(page.getByText("recovery-context.png", { exact: true })).toBeVisible();
});

test("Not now survives diagnostic churn, new work resurfaces, and resolved health removes the card", async ({ page, request }) => {
  const identity = await createAgent(page, request);
  const fixture: HealthFixture = { presenceId: identity.presenceId, incidentId: "incident-x-credits-v1", mode: "blocked" };
  const instruction = "Publish the launch note when the public X route is available.";
  const created = await request.post("/api/state", {
    data: { type: "createAssignment", presenceId: fixture.presenceId, environment: "live", instruction },
  });
  expect(created.ok()).toBeTruthy();
  await installBlockedTaskFixture(page, instruction, fixture);
  await installHealthFixture(page, fixture);
  await page.goto(`/chat?agentId=${identity.agentId}&presenceId=${identity.presenceId}`);

  const notice = page.getByTestId("operator-chat-needs-you");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show paused work", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show paused work", exact: true })).toBeVisible();

  fixture.incidentId = "incident-x-credits-v2";
  await page.reload();
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);
  const newInstruction = "Publish a different follow-up only when access recovers.";
  expect((await request.post("/api/state", { data: { type: "createAssignment", presenceId: fixture.presenceId, environment: "live", instruction: newInstruction } })).ok()).toBeTruthy();
  await installBlockedTaskFixture(page, newInstruction, fixture);
  await page.reload();
  await expect(page.getByTestId("operator-chat-needs-you")).toBeVisible();

  fixture.mode = "healthy";
  await page.reload();
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);
});

test("pure X-credit health notices stay out of private Chat without a blocked task", async ({ page, request }) => {
  const identity = await createAgent(page, request);
  const fixture: HealthFixture = { presenceId: identity.presenceId, incidentId: "incident-x-credits-only", mode: "blocked" };
  await installHealthFixture(page, fixture);
  await page.goto(`/chat?agentId=${identity.agentId}&presenceId=${identity.presenceId}`);
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);
});

test("blocked-work card fits a narrow Chat viewport without horizontal overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const identity = await createAgent(page, request);
  const fixture: HealthFixture = { presenceId: identity.presenceId, incidentId: "incident-x-credits-mobile", mode: "blocked" };
  const instruction = "Publish the launch note when the public X route is available.";
  const created = await request.post("/api/state", {
    data: { type: "createAssignment", presenceId: fixture.presenceId, environment: "live", instruction },
  });
  expect(created.ok()).toBeTruthy();
  await installBlockedTaskFixture(page, instruction);
  await installHealthFixture(page, fixture);
  await page.goto(`/chat?agentId=${identity.agentId}&presenceId=${identity.presenceId}`);
  const notice = page.getByTestId("operator-chat-needs-you");
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await notice.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "qa-learnings/chat-attention-2026-09-13/mobile.png" });
});
