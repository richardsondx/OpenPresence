import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Calendar Week mode visualizes Assignment timing without pretending to show posts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Teach one useful idea about persistent agents.");
  await page.getByLabel("Day").selectOption("Tuesday");
  await page.getByRole("textbox", { name: "Time" }).fill("08:00");
  await page.getByLabel("Objective", { exact: true }).selectOption("education");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Weekly schedule" })).toBeVisible();
  await expect(page.getByText("When Jenny can notice and act")).toBeVisible();
  await expect(page.getByText("Tue", { exact: true }).last()).toBeVisible();
  const assignmentCard = page.getByRole("button", { name: /Open Assignment Teach one useful idea.*Tuesday at 08:00/ });
  await expect(assignmentCard).toBeVisible();
  await expect(assignmentCard).not.toHaveClass(/processing/);
  await expect(assignmentCard).toContainText("Not started");
  await expect(page.locator(".week-calendar-toolbar").getByText("shape when", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What Jenny may work on/ })).toBeVisible();
});

test("Calendar Week marks only today’s occurrence of a recurring Assignment as processing", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const instruction = "Each day, review one worthwhile builder conversation.";
  const created = await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction,
      schedule: { day: "Daily", time: "08:00", executionWindow: "08:00–11:00" },
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
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const cards = page.locator(".compact-calendar-item-assignment").filter({ hasText: instruction });
  await expect(cards).toHaveCount(7);
  await expect(page.locator(".compact-calendar-item-assignment.is-processing").filter({ hasText: instruction })).toHaveCount(1);
  await expect(page.locator(".compact-calendar-processing-pill").filter({ hasText: "Processing" })).toHaveCount(1);
});
