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

test("blocked X billing stays in delivery evidence and does not interrupt Chat", async ({ page, request }) => {
  const identity = await createAgent(page, request);
  const fixture: HealthFixture = { presenceId: identity.presenceId, incidentId: "incident-x-credits-v1", mode: "blocked" };
  const instruction = "Publish the launch note when the public X route is available.";
  const created = await request.post("/api/state", {
    data: { type: "createAssignment", presenceId: fixture.presenceId, environment: "live", instruction },
  });
  expect(created.ok()).toBeTruthy();
  await installBlockedTaskFixture(page, instruction);
  await installHealthFixture(page, fixture);

  await page.goto(`/chat?agentId=${identity.agentId}&presenceId=${identity.presenceId}`);
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);

  const composer = page.getByLabel("Message Genny", { exact: true });
  await page.getByRole("button", { name: "Attach media or files", exact: true }).click();
  await page.getByRole("button", { name: "Upload an image", exact: true }).click();
  await page.locator('input[aria-label="Upload an image"]').setInputFiles({ name: "recovery-context.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByText("recovery-context.png", { exact: true })).toBeVisible();
  await composer.fill("Keep this draft while I check credits.");
  await expect(composer).toHaveValue("Keep this draft while I check credits.");
  await expect(page.getByText("recovery-context.png", { exact: true })).toBeVisible();
});

test("X billing does not resurface a paused-work reminder during diagnostic churn", async ({ page, request }) => {
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
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("operator-chat-needs-you")).toHaveCount(0);

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

test("billing evidence does not add a narrow Chat interruption", async ({ page, request }) => {
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
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "qa-learnings/chat-attention-2026-09-13/mobile.png" });
});
