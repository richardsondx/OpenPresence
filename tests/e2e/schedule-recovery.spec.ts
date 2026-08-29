import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("today keeps current work visible and a Schedule decision is actionable in place", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByLabel("Presence handle").fill("@example_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const now = new Date();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = weekdays[now.getDay()]!;
  const anotherDay = weekdays[(now.getDay() + 6) % 7]!;
  const todayButtonLabel = `Show ${today.slice(0, 3)} scheduled items`;

  await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Resolve the operator decision without losing the responsibility.",
      schedule: { day: anotherDay, time: "13:00", executionWindow: "13:00–16:00" },
    },
  });
  await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Research the current builder conversation.",
    },
  });

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/state") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    const blocked = body.assignments.find((assignment: { instruction: string }) => assignment.instruction.startsWith("Resolve the operator decision"));
    const working = body.assignments.find((assignment: { instruction: string }) => assignment.instruction.startsWith("Research the current builder"));
    const timestamp = new Date().toISOString();

    Object.assign(blocked, {
      status: "needs_operator",
      title: "Resolve the operator decision",
      lastOutcome: { class: "delivery_failed", message: "A genuine operator decision is required.", at: timestamp },
      work: { phase: "blocked", attempts: 1, maxAttempts: 4, storiesResearched: 0, blockedReason: "A genuine operator decision is required." },
      updatedAt: timestamp,
    });
    Object.assign(working, {
      status: "working",
      schedule: undefined,
      work: { phase: "researching", attempts: 1, maxAttempts: 4, storiesResearched: 0 },
      updatedAt: timestamp,
    });
    body.assignmentRuns = [
      ...(body.assignmentRuns ?? []),
      {
        id: "assignment-run:current-unscheduled",
        assignmentId: working.id,
        agentId: working.agentId,
        presenceId,
        sessionId: "live:schedule-recovery",
        status: "researching",
        currentStage: "researching",
        attempts: 1,
        maxAttempts: 4,
        rejectedCandidates: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/runtime/health**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        now: new Date().toISOString(),
        status: "needs_you",
        summary: "Assignment “Resolve the operator decision” needs you. Retry or close it here, or open Schedule for details.",
        operatorAction: { kind: "schedule", label: "Open Schedule" },
        presenceId,
        counts: { activeIncidents: 0, recoveringIncidents: 0, waitingIncidents: 0, needsOperatorIncidents: 0, orphanRecoveringRuns: 0 },
        dependencyHealth: [],
        incidents: [],
        activeRuns: [],
        dueWakeCount: 0,
        heartbeats: [],
      }),
    });
  });

  await page.reload();
  await page.getByRole("button", { name: "Operating health: Needs You", exact: true }).click();
  const health = page.getByRole("region", { name: "Operating Health & Incident Overview" });
  await expect(health.getByRole("button", { name: "Retry Assignment", exact: true })).toBeVisible();
  await expect(health.getByRole("button", { name: "Close Assignment", exact: true })).toBeVisible();
  await health.getByRole("button", { name: "Open details", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Assignment details" })).toContainText("Resolve the operator decision");
  await expect(page.getByRole("complementary", { name: "Assignment details" }).getByRole("button", { name: "Retry Assignment", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Assignment details" }).getByRole("button", { name: "Close Assignment", exact: true })).toBeVisible();

  await page.getByRole("button", { name: todayButtonLabel, exact: true }).click();
  const schedule = page.getByRole("region", { name: "Schedule list" });
  await expect(schedule.getByText("Research the current builder conversation.", { exact: true })).toBeVisible();
  await expect(schedule.getByText("Resolve the operator decision without losing the responsibility.", { exact: true })).toBeVisible();
});

test("Week keeps unscheduled open Assignments visible without inventing timing", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByLabel("Presence handle").fill("@example_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const instruction = "Keep an eye out for a genuinely useful builder conversation.";
  const created = await request.post("/api/state", {
    data: { type: "createAssignment", presenceId, environment: "live", instruction },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto(`/schedule?agentId=${base.agent.id}&presenceId=${presenceId}`);
  await expect(page.getByRole("heading", { name: "Scheduled responsibilities", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();

  const week = page.getByRole("region", { name: /Weekly schedule/ });
  await expect(week.getByRole("heading", { name: "Ongoing and unscheduled responsibilities", exact: true })).toBeVisible();
  await expect(week.getByText(instruction, { exact: true })).toBeVisible();
  await expect(week.getByRole("heading", { name: "Nothing shown on this calendar", exact: true })).toHaveCount(0);
});
