import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

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
      environment: "sandbox",
      instruction: "Resolve the operator decision without losing the responsibility.",
      schedule: { day: anotherDay, time: "13:00", executionWindow: "13:00–16:00" },
    },
  });
  await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "sandbox",
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
  const notice = page.getByTestId("operator-chat-needs-you");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(1);
  await expect(notice.locator("xpath=ancestor::*[contains(@class, 'operator-chat-history')]")).toHaveCount(1);
  await notice.getByText("Task details", { exact: true }).click();
  await expect(notice).toContainText("Resolve the operator decision");

  await page.goto(`/schedule?agentId=${base.agent.id}&presenceId=${presenceId}`);
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Open .*Assignment Resolve the operator decision without losing the responsibility\./ }).click();
  await expect(page.getByRole("complementary", { name: "Assignment details" })).toContainText("Resolve the operator decision");
  await expect(page.getByRole("complementary", { name: "Assignment details" }).getByRole("button", { name: "Retry attempt", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Assignment details" }).getByRole("button", { name: "Close Assignment", exact: true })).toBeVisible();

  await page.getByRole("button", { name: todayButtonLabel, exact: true }).click();
  const schedule = page.getByRole("region", { name: "Schedule list" });
  await expect(schedule.getByText("Resolve the operator decision", { exact: true })).toBeVisible();
});

test("health alert opens the Needs You queue instead of sending the operator to general settings", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByLabel("Presence handle").fill("@example_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const targetId = "2099988877766655544";
  const observedAt = new Date().toISOString();
  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.mirrorObjects = [
      { id: "duplicate-target", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: targetId }, objectType: "post", author: { displayName: "Builder", handle: "builder" }, content: { text: "What should reliable social agents do after an uncertain write?" }, observedAt, visibility: "public", shareability: "presence-only", environment: "live" },
      { id: "duplicate-reply-1", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.reply", id: "2099988877766655545" }, parentExternalRef: { type: "x.post", id: targetId }, objectType: "reply", actorPresenceId: presenceId, author: { displayName: "Genny", handle: "example_agent" }, content: { text: "Reconcile the world outcome before retrying." }, observedAt, visibility: "public", shareability: "presence-only", environment: "live" },
      { id: "duplicate-reply-2", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.reply", id: "2099988877766655546" }, parentExternalRef: { type: "x.post", id: targetId }, objectType: "reply", actorPresenceId: presenceId, author: { displayName: "Genny", handle: "example_agent" }, content: { text: "Confirm external reality first; never retry blindly." }, observedAt, visibility: "public", shareability: "presence-only", environment: "live" },
      ...(body.mirrorObjects ?? []),
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
        summary: "A public delivery decision needs you.",
        operatorAction: { kind: "settings", label: "Review Settings" },
        presenceId,
        counts: { activeIncidents: 1, recoveringIncidents: 0, waitingIncidents: 0, needsOperatorIncidents: 1, orphanRecoveringRuns: 0 },
        dependencyHealth: [],
        incidents: [{
          id: "incident-duplicate-public-outcome",
          rootCauseKey: "runtime.duplicate_public_outcome",
          state: "needs_operator",
          safeSummary: "Multiple public actions were observed for the same target.",
          affectedRunIds: [],
          recoveryAttempts: 0,
          operatorActionRequired: true,
          requiresAuth: false,
          lastObservedAt: new Date().toISOString(),
        }],
        activeRuns: [],
        dueWakeCount: 0,
        heartbeats: [],
      }),
    });
  });

  await page.goto(`/chat?agentId=${base.agent.id}&presenceId=${presenceId}`);
  const notice = page.getByTestId("operator-chat-needs-you");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Review decision", exact: true }).click();
  const queue = page.getByTestId("needs-you-queue");
  await expect(queue).toBeVisible();
  await expect(queue.getByRole("heading", { name: "Needs You", exact: true })).toBeVisible();
  await expect(queue).toContainText("Multiple replies were observed to Builder (@builder).");
  const evidence = queue.getByTestId("duplicate-public-outcome-evidence");
  await expect(evidence).toContainText("What should reliable social agents do after an uncertain write?");
  await expect(evidence).toContainText("Reconcile the world outcome before retrying.");
  await expect(evidence).toContainText("Confirm external reality first; never retry blindly.");
  await expect(evidence.getByRole("link", { name: "Open thread on X", exact: false })).toHaveAttribute("href", `https://x.com/builder/status/${targetId}`);
  await expect(queue.getByRole("button", { name: "I reviewed the affected thread · resume", exact: true })).toBeVisible();
  await queue.getByRole("button", { name: "I reviewed the affected thread · resume", exact: true }).click();
  await expect(queue.getByRole("alertdialog", { name: "Resume delivery confirmation", exact: true })).toBeVisible();
  await expect(queue.getByRole("alertdialog", { name: "Resume delivery confirmation", exact: true })).toContainText("Builder (@builder)");
  await expect(queue.getByRole("button", { name: "Resume normal delivery", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/review");
  await expect(page.getByRole("heading", { name: "Presence settings", exact: true })).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("private Chat ignores X-credit-only health alerts for unrelated requests", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByLabel("Presence handle").fill("@example_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const base = await request.get("/api/state").then((response) => response.json());
  const presenceId = base.presence.id as string;
  const created = await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Keep the public responsibility available while I ask a private question.",
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.route("**/api/runtime/health**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        now: new Date().toISOString(),
        status: "needs_you",
        summary: "X API credits are exhausted. The verified Chrome Bridge remains available for continuity; add credits to restore Native X reads.",
        operatorAction: { kind: "settings", label: "Review Settings" },
        presenceId,
        counts: { activeIncidents: 1, recoveringIncidents: 0, waitingIncidents: 0, needsOperatorIncidents: 1, orphanRecoveringRuns: 0 },
        dependencyHealth: [],
        incidents: [{
          id: "incident-x-credits-exhausted",
          rootCauseKey: "runtime.native_x_credits_exhausted",
          state: "needs_operator",
          safeSummary: "X API credits are exhausted.",
          affectedRunIds: [],
          recoveryAttempts: 0,
          operatorActionRequired: true,
          requiresAuth: false,
          lastObservedAt: new Date().toISOString(),
        }],
        activeRuns: [],
        dueWakeCount: 0,
        heartbeats: [],
      }),
    });
  });

  await page.goto(`/chat?agentId=${base.agent.id}&presenceId=${presenceId}`);
  const notice = page.getByTestId("operator-chat-needs-you");
  await expect(notice).toHaveCount(0);

  await page.getByLabel("Message Genny").fill("What should we focus on for the next team meeting?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-operator p").filter({ hasText: /^What should we focus on for the next team meeting\?$/ })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
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
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();

  const week = page.getByRole("region", { name: "Tasks without a fixed start time" });
  await expect(week.getByRole("heading", { name: "No fixed start time", exact: true })).toBeVisible();
  await expect(week.getByText(instruction, { exact: true })).toBeVisible();
  await expect(week.getByRole("heading", { name: "Nothing shown on this calendar", exact: true })).toHaveCount(0);
});
