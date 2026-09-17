import { expect, test } from "@playwright/test";

function torontoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function torontoWeekday() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long" }).format(new Date());
}

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Calendar Week mode visualizes dated Agent-owned Assignment timing", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page).toHaveURL(/chat/);
  await page.goto("/schedule");
  const base = await request.get("/api/state").then(response => response.json());
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence.id, environment: "sandbox", createdBy: "agent", origin: "publishing_initiative", title: "Teach one useful idea", instruction: "Teach one useful idea about persistent agents.", schedule: { date: torontoDate(), day: torontoWeekday(), time: "08:00", executionWindow: "08:00–11:00" } } });
  expect(created.ok()).toBeTruthy();
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByText("Objective", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Flexible", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Weekly schedule" })).toBeVisible();
  await expect(page.getByText("When Jenny can notice and act")).toBeVisible();
  const assignmentCard = page.getByRole("button", { name: /Open one-time Assignment Teach one useful idea.*at 08:00/ });
  await expect(assignmentCard).toBeVisible();
  await expect(assignmentCard).not.toHaveClass(/processing/);
  await expect(assignmentCard).toContainText("Not started");
  await expect(page.locator(".week-calendar-toolbar").getByText("One-time assignments appear on their date", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What needs to happen" })).toBeVisible();
});

test("Calendar Week marks the current occurrence of a weekly Assignment as processing", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const instruction = "Review one worthwhile builder conversation every week.";
  const created = await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction,
      schedule: { day: torontoWeekday(), time: "08:00", executionWindow: "08:00–08:00" },
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdState = await created.json();
  const assignment = createdState.assignments.find((item: { instruction: string }) => item.instruction === instruction);
  expect(assignment).toBeDefined();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/state") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    const current = body.assignments.find((item: { id: string }) => item.id === assignment.id);
    const timestamp = new Date().toISOString();
    Object.assign(current, { status: "working", work: { ...(current.work ?? {}), phase: "candidate_review" }, updatedAt: timestamp });
    body.assignmentRuns = [{
      id: "assignment-run:recurring-processing",
      assignmentId: assignment.id,
      agentId: base.agent.id,
      presenceId,
      sessionId: "live:recurring-processing",
      status: "selecting",
      currentStage: "selecting",
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const cards = page.locator(".compact-calendar-item-assignment").filter({ hasText: instruction });
  await expect(cards).toHaveCount(1);
  await expect(page.locator(".compact-calendar-item-assignment.is-processing").filter({ hasText: instruction })).toHaveCount(1);
  await expect(page.locator(".compact-calendar-processing-pill").filter({ hasText: "Processing" })).toHaveCount(1);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Calendar keeps a verified weekly outcome visible as Done today", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const instruction = "Publish one verified lesson about persistent agents every week.";
  const created = await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "sandbox",
      instruction,
      schedule: { day: torontoWeekday(), time: "08:00", executionWindow: "08:00–08:00" },
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdState = await created.json();
  const assignment = createdState.assignments.find((item: { instruction: string }) => item.instruction === instruction);
  expect(assignment).toBeDefined();

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/state") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    const timestamp = new Date().toISOString();
    const current = body.assignments.find((item: { id: string }) => item.id === assignment.id);
    Object.assign(current, { status: "active", progress: { required: 1, verified: 1 }, updatedAt: timestamp });
    body.executions = [{ id: "execution:verified-schedule", assignmentId: assignment.id, socialIntentId: "intent:verified-schedule", presenceId, affordance: "x.post", mode: "manual", status: "succeeded", attempts: 1, idempotencyKey: "verified-schedule", createdAt: timestamp, updatedAt: timestamp }];
    body.outcomes = [{ id: "outcome:verified-schedule", socialIntentId: "intent:verified-schedule", executionId: "execution:verified-schedule", presenceId, status: "succeeded", observedAt: timestamp, metrics: {} }];
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const card = page.locator(".compact-calendar-item-assignment").filter({ hasText: instruction }).first();
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/is-completed-today/);
  await expect(card).toContainText("Done today");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Calendar does not render unscheduled on-demand work as a scheduled window", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const instruction = "Handle this on-demand request from chat.";
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId, environment: "sandbox", instruction } });
  expect(created.ok()).toBeTruthy();

  await page.goto("/schedule");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Flexible assignment windows" })).toHaveCount(0);
  await expect(page.getByText(instruction, { exact: true })).toHaveCount(0);
});
