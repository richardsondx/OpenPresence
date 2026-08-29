import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
}

async function openPostingRehearsal(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
}

test("Schedule sends post exploration to Playground", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Try a post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await openPostingRehearsal(page);
  await expect(page.getByRole("button", { name: /Let Jenny choose/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Give an Assignment/ })).toBeVisible();
});

test("Agent publishing work shares the Schedule with Assignments", async ({ page, request }) => {
  await createAgent(page);
  const initial = await request.get("/api/state").then((response) => response.json());
  const presence = initial.presence;
  const updated = await request.post("/api/state", { data: { type: "setPresence", patch: { execution: { post: "auto" }, publishingInitiative: { ...presence.publishingInitiative, mode: "pace", target: { count: 1, period: "day" } } } } });
  expect(updated.ok()).toBeTruthy();
  const replanned = await request.post("/api/state", { data: { type: "replanPublishing", presenceId: presence.id } });
  expect(replanned.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("region", { name: "Calendar layers", exact: true })).toContainText("Plan active");
  await expect(page.getByRole("region", { name: "Agent publishing plan" })).toHaveCount(0);
  const schedule = page.getByRole("region", { name: "Schedule list" });
  await expect(schedule.getByText("Jenny · Agent-owned", { exact: true }).first()).toBeVisible();
  await expect(schedule.getByRole("button", { name: /Open Assignment/ }).first()).toBeVisible();
  await expect(page.getByText("You and Jenny share this schedule", { exact: false })).toBeVisible();
});

test("switching Presence switches Playground world and rehearsal history", async ({ page, request }) => {
  await createAgent(page);
  const initial = await request.get("/api/state");
  const initialState = await initial.json();
  const xPresence = initialState.presence;
  const xSessionResponse = await request.post("/api/state", { data: { type: "startPlayground", presenceId: xPresence.id, source: "fresh" } });
  expect(xSessionResponse.ok()).toBeTruthy();
  const xSessionState = await xSessionResponse.json();
  const xSession = xSessionState.playgroundSessions.find((session: { presenceId: string; status: string }) => session.presenceId === xPresence.id && session.status === "active");
  const inbound = await request.post("/api/state", {
    headers: {
      "x-openpresence-agent-id": xSessionState.activeAgentId,
      "x-openpresence-presence-id": xPresence.id,
      "x-openpresence-workspace-revision": String(xSessionState.workspaceRevision),
    },
    data: { type: "addSandboxEvent", sessionId: xSession.id, actionId: "post", actorName: "X-only audience", actorHandle: "@x_only", content: "X-only presence marker." },
  });
  expect(inbound.ok()).toBeTruthy();
  const created = await request.post("/api/state", { data: { type: "createPresence", input: { channel: "linkedin", name: "Jenny LinkedIn", handle: "@jenny_linkedin", mode: "agent", accent: "#4F7CAC" } } });
  expect(created.ok()).toBeTruthy();
  const linkedInState = await created.json();
  const linkedInPresence = linkedInState.presence;

  await page.reload();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  const linkedInPresenceSwitcher = page.locator(".mobile-presence-switcher button.presence-root");
  if (await linkedInPresenceSwitcher.isVisible()) await linkedInPresenceSwitcher.click();
  else await page.locator(".sidebar button.presence-root").click();
  await page.getByRole("menuitem", { name: `Select Presence ${linkedInPresence.name} (${linkedInPresence.handle})` }).click();
  await expect(page.getByRole("heading", { name: "What Jenny LinkedIn can see", exact: true })).toBeVisible();
  await expect(page.locator(".playground-world")).toContainText("simulated LinkedIn");
  await expect(page.locator(".playground-world")).not.toContainText("X-only presence marker.");
  await expect(page.getByText("Presence rehearsal", { exact: true })).toBeVisible();

  const mobilePresenceSwitcher = page.locator(".mobile-presence-switcher button.presence-root");
  if (await mobilePresenceSwitcher.isVisible()) await mobilePresenceSwitcher.click();
  else await page.locator(".sidebar button.presence-root").click();
  await page.getByRole("menuitem", { name: `Select Presence ${xPresence.name} (${xPresence.handle})` }).click();
  await expect(page.getByRole("heading", { name: `What ${xPresence.name} can see`, exact: true })).toBeVisible();
  await expect(page.locator(".playground-world")).toContainText("X-only presence marker.");
  await expect(page.locator(".playground-world")).not.toContainText("simulated LinkedIn");
  expect(linkedInPresence.id).not.toBe(xPresence.id);
});

test("Playground Assignments use the Sandbox session without requiring a Sandbox Presence route", async ({ page, request }) => {
  await createAgent(page);
  const presenceUpdate = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(presenceUpdate.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await openPostingRehearsal(page);
  await page.getByRole("button", { name: /Give an Assignment/ }).click();
  await page.getByLabel("Assignment instruction").fill("Produce 2 original X posts about useful agent ideas. Choose your own angles and do not repeat yourself.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  const review = page.locator(".assignment-review");
  await expect(review.getByText("Agent decides how", { exact: true })).toBeVisible();
  await expect(review).toContainText("Topics · thesis · evidence · format · wording · timing strategy");
  await expect(review).not.toContainText("Jenny decides");
  await expect(page.getByRole("button", { name: "Start rehearsal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Sandbox Presence" })).toHaveCount(0);
});

test("Playground Assignment exposes a clear cancel action", async ({ page, request }) => {
  await createAgent(page);
  const stateRes = await request.get("/api/state").then((r) => r.json());
  const presenceId = stateRes.presence.id;
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId, instruction: "Produce exactly 10 original X posts about useful agent ideas. Choose distinct angles and do not repeat yourself." } });
  expect(created.ok()).toBeTruthy();
  const createdState = await created.json();
  const assignmentId = createdState.assignments[0].id;
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(page.locator(".playground-assignment-mention")).toBeVisible();
  await page.locator(".playground-assignment-mention").hover();
  await expect(page.locator(".playground-mention-popover")).toBeVisible();
  await page.locator(".playground-assignment-mention").click();
  await expect(page.locator(".assignment-progress-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel Assignment", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel Assignment", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Assignment cancelled" })).toBeVisible();
  await expect(page.locator(".assignment-progress-panel")).toHaveCount(0);
  const afterCancel = await request.get("/api/state").then((response) => response.json());
  expect(afterCancel.assignments.find((item: { id: string }) => item.id === assignmentId)?.status).toBe("cancelled");
});

test("Playground Assignment produces distinct posts and renders the requested media set", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await openPostingRehearsal(page);
  await page.getByRole("button", { name: /Give an Assignment/ }).click();
  await page.getByLabel("Assignment instruction").fill("Produce exactly 5 original X posts about useful AI-agent decisions. Choose distinct angles, do not repeat yourself, and include one image, chart, gif, link, and video across the set.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toContainText("5 / 5 published", { timeout: 30000 });

  const cards = page.locator(".social-card.agent-authored");
  await expect(cards).toHaveCount(5);
  const texts = await cards.locator("p").allTextContents();
  expect(new Set(texts.map((text) => text.trim())).size).toBe(5);

  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(5);
  await expect(page.locator('.feed-item-assets img[alt*="image rehearsal asset"]')).toHaveCount(1);
  await expect(page.locator('.feed-item-assets img[alt*="chart rehearsal asset"]')).toHaveCount(1);
  await expect(page.locator('.feed-item-assets img[alt*="gif rehearsal asset"]')).toHaveCount(1);
  await expect(page.locator('.feed-item-assets video[aria-label="Published video"]')).toHaveCount(1);
  await expect(page.locator(".social-link-asset")).toContainText("openpresence.ai");
});

test("Schedule removes a cancelled Assignment from the active viewpoint", async ({ page, request }) => {
  await createAgent(page);
  const created = await request.post("/api/state", { data: { type: "createAssignment", instruction: "Produce 3 original X posts about useful agent ideas." } });
  expect(created.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();

  const assignmentRow = page.locator(".schedule-assignment-row").filter({ hasText: "Produce 3 original X posts about useful agent ideas." });
  await expect(assignmentRow).toContainText("not started");
  await expect(assignmentRow.getByRole("button", { name: "Open details", exact: true })).toBeVisible();
  await expect(assignmentRow.getByText("ASSIGN", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await assignmentRow.getByRole("button", { name: "Open details", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Assignment details" });
  await expect(inspector).toContainText("0 / 3 verified");
  await inspector.getByRole("button", { name: "Cancel Assignment", exact: true }).click();
  await expect(page.locator(".schedule-assignment-row").filter({ hasText: "Produce 3 original X posts about useful agent ideas." })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Assignment details" })).toHaveCount(0);
});

test("Playground completes a 10-publication Assignment without recycling candidates", async ({ page, request }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await openPostingRehearsal(page);
  await page.getByRole("button", { name: /Give an Assignment/ }).click();
  await page.getByLabel("Assignment instruction").fill("Produce exactly 10 original X posts for founders. Choose distinct angles and do not repeat yourself.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toContainText("10 / 10 published", { timeout: 30000 });
  const cards = page.locator(".social-card.agent-authored");
  await expect(cards).toHaveCount(10);
  const texts = await cards.locator("p").allTextContents();
  expect(new Set(texts.map((text) => text.trim())).size).toBe(10);
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(10);
  const state = await request.get("/api/state").then((response) => response.json());
  const latestObserved = state.mirrorObjects
    .filter((item: { environment?: string; actorPresenceId?: string; objectType: string }) => item.environment === "sandbox" && item.actorPresenceId && item.objectType === "post")
    .sort((left: { observedAt: string }, right: { observedAt: string }) => right.observedAt.localeCompare(left.observedAt))[0];
  await expect(page.locator(".feed-item").first().locator("time")).toHaveAttribute("dateTime", latestObserved.observedAt);
  await expect(page.locator(".feed-item").first().locator("time")).toHaveAttribute("title", /Observed in Sandbox/);
});

test("Sandbox Assignment instructions never leak internal QA markers into Feed", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await openPostingRehearsal(page);
  await page.getByRole("button", { name: /Give an Assignment/ }).click();
  await page.getByLabel("Assignment instruction").fill("Produce exactly 1 original X post about a useful agent decision. Include QA-TEN-RUN-2026-08-14 only as an internal diagnostic marker and never publish it.");
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();
  await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
  await expect(page.locator(".assignment-progress-panel")).toContainText("1 / 1 published", { timeout: 30000 });
  await expect(page.locator(".assignment-progress-panel")).not.toContainText("QA-TEN-RUN-2026-08-14");
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(1);
  await expect(page.locator(".feed-item")).not.toContainText("QA-TEN-RUN-2026-08-14");
  await page.locator(".feed-item").first().click();
  const postInspector = page.getByRole("complementary", { name: "Post details" });
  await expect(postInspector).toBeVisible();
  await expect(postInspector.getByRole("button", { name: "Copy internal post ID" })).toBeVisible();
});

test("Schedule preserves an Assignment's exact timing", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?", { exact: true }).fill("Produce 1 original X post about a useful AI-agent decision.");
  await page.getByLabel("Day", { exact: true }).selectOption({ label: "Thursday" });
  await page.getByLabel("Time", { exact: true }).fill("23:35");
  await page.getByRole("button", { name: /Assignment window/ }).click();
  await page.getByRole("radio", { name: /Exact time/ }).check();
  await page.getByRole("button", { name: "Review assignment", exact: true }).click();

  await page.getByRole("button", { name: "List", exact: true }).click();
  const assignmentRow = page.locator(".schedule-assignment-row").filter({ hasText: "Produce 1 original X post about a useful AI-agent decision." });
  await expect(assignmentRow).toContainText("Thursday at 23:35 · exact time · 0 / 1 verified · not started");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".week-assignment")).toHaveCount(1);
  await expect(page.locator(".week-assignment")).toContainText("0 / 1 · Not started");
  await expect(page.locator(".week-assignment")).toHaveAttribute("aria-label", /Open Assignment.*Thursday at 23:35/);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await assignmentRow.getByRole("button", { name: "Open details", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Assignment details" });
  await expect(inspector).toContainText("Thursday at 23:35");
  await expect(inspector.getByRole("button", { name: "Cancel Assignment", exact: true })).toBeVisible();
});

test("Playground renders discreet assignment mentions and supports minimizing", async ({ page, request }) => {
  await createAgent(page);
  const stateRes = await request.get("/api/state").then((r) => r.json());
  const presenceId = stateRes.presence.id;
  await request.post("/api/state", { data: { type: "createAssignment", environment: "live", presenceId, instruction: "Produce 3 live X posts." } });
  await request.post("/api/state", { data: { type: "createAssignment", environment: "sandbox", presenceId, instruction: "Produce 2 sandbox X posts." } });
  await page.getByRole("button", { name: "Playground", exact: true }).click();

  await expect(page.locator(".playground-live-mention")).toBeVisible();
  await expect(page.locator(".playground-assignment-mention")).toBeVisible();
  await expect(page.locator(".assignment-scope-notice")).toHaveCount(0);

  await page.locator(".playground-live-mention").hover();
  await expect(page.locator(".playground-mention-popover")).toBeVisible();
  await page.locator(".playground-live-mention").click();
  await expect(page.locator(".playground-live-menu")).toBeVisible();
  await page.locator(".playground-live-menu").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".playground-live-mention")).toHaveCount(0);

  await page.locator(".playground-assignment-mention").click();
  await expect(page.locator(".assignment-progress-panel")).toBeVisible();
  await page.getByRole("button", { name: "Minimize" }).click();
  await expect(page.locator(".assignment-progress-panel")).toHaveCount(0);
  await expect(page.locator(".playground-assignment-mention")).toBeVisible();
});
