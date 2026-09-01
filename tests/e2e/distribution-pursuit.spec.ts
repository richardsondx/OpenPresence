import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("scales an active distribution push in Activity and persists the new capacity", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();

  const created = await request.get("/api/state");
  const state = await created.json();
  const presenceId = state.presence.id as string;
  const assignmentResponse = await request.post("/api/state", {
    data: {
      type: "createAssignment",
      presenceId,
      environment: "live",
      instruction: "Help https://x.com/source_author/status/2093472969037099455 reach people who genuinely care.",
    },
  });
  expect(assignmentResponse.ok()).toBeTruthy();
  const assignmentState = await assignmentResponse.json();
  const assignmentId = assignmentState.assignments.find((item: { environment?: string }) => item.environment === "live").id as string;
  expect((await request.post("/api/state", { data: { type: "activateAssignment", id: assignmentId } })).ok()).toBeTruthy();

  const deadlineAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const started = await request.post("/api/state", {
    data: {
      type: "startAssignmentPursuit",
      assignmentId,
      presenceId,
      deadlineAt,
      maxVerifiedActions: 40,
      resourceBudget: { maxChannelReads: 200, maxHydrations: 80, maxModelCalls: 160, maxVisionCalls: 30 },
    },
  });
  expect(started.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const card = page.getByRole("region", { name: /Distribution push progress/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("verified outcomes", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Scale distribution push effort")).toHaveValue("balanced");

  await card.getByLabel("Scale distribution push effort").selectOption("expanded");
  await expect(card.getByText("0 / 90", { exact: true })).toBeVisible();
  await expect(card.getByTestId("distribution-push-latest-result")).toBeVisible();

  const persisted = await request.get("/api/state");
  const persistedState = await persisted.json();
  const pursuit = persistedState.assignmentPursuitWindows.find((item: { assignmentId: string }) => item.assignmentId === assignmentId);
  expect(pursuit).toMatchObject({ maxVerifiedActions: 90, resourceBudget: { maxChannelReads: 500, maxModelCalls: 360 } });
  expect(persistedState.assignmentRuns.some((run: { pursuitWindowId?: string }) => run.pursuitWindowId === pursuit.id)).toBeTruthy();

  await page.reload();
  const reloadedCard = page.getByRole("region", { name: /Distribution push progress/ });
  await expect(reloadedCard.getByLabel("Scale distribution push effort")).toHaveValue("expanded");
  await expect(reloadedCard.getByTestId("distribution-push-latest-result")).toBeVisible();
});

test("renders an OwnTheHype burst as 40 verified promotional actions", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const state = await (await request.get("/api/state")).json();
  const presenceId = state.presence.id as string;
  const sourceUrl = "https://x.com/example_builder/status/2093472969037099455";
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId, environment: "live", instruction: `Promote OwnTheHype from ${sourceUrl} in relevant X conversations.` } });
  expect(created.ok()).toBeTruthy();
  const createdState = await created.json();
  const assignmentId = createdState.assignments.find((item: { environment?: string }) => item.environment === "live").id as string;
  expect((await request.post("/api/state", { data: { type: "activateAssignment", id: assignmentId } })).ok()).toBeTruthy();
  const started = await request.post("/api/state", { data: { type: "startAssignmentPursuit", assignmentId, presenceId, deadlineAt: new Date(Date.now() + 30 * 60_000).toISOString(), maxVerifiedActions: 40, purpose: "promotion_burst", sourcePostId: "2093472969037099455", sourcePostUrl: sourceUrl, requiredVerifiedPromotionalActions: 40, actionCaps: { post: 40, reply: 20, quote: 10, repost: 15, like: 60, follow: 10 } } });
  expect(started.ok()).toBeTruthy();
  await page.goto(`/activity?agentId=${state.agent.id}&presenceId=${presenceId}`);
  const card = page.getByRole("region", { name: /OwnTheHype promotion burst progress/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("0 / 40 verified", { exact: true })).toBeVisible();
  await expect(card.getByText("likes/follows · auxiliary", { exact: true })).toBeVisible();
  await expect(card.getByText(sourceUrl, { exact: true })).toBeVisible();
  await expect(card.getByText(/Verified public promotional actions only/)).toBeVisible();
});
