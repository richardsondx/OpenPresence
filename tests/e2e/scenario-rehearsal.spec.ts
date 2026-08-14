import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("natural-language Scenario rehearsal stays isolated, reviewable, and rerunnable", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Scenarios", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Scenarios", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page.getByLabel("What do you want to rehearse?").fill("Test Alex when someone insults him and pressures him for private information.");
  await page.getByRole("button", { name: "Preview scenario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility and privacy pressure", exact: true })).toBeVisible();
  await expect(page.getByText("What will happen", { exact: true })).toBeVisible();
  await expect(page.getByText("What we'll review", { exact: true })).toBeVisible();
  await expect(page.locator(".scenario-boundary")).toContainText("Agent receives only the world situation");

  const beforeRun = await request.get("/api/state").then((response) => response.json());
  const filesBefore = beforeRun.files.filter((file: { kind: string }) => ["MEMORY", "GROWTH"].includes(file.kind)).map((file: { kind: string; revision: number; content: string }) => `${file.kind}:${file.revision}:${file.content}`);
  const createdScenario = beforeRun.scenarios.find((scenario: { source?: string; description: string }) => scenario.description.includes("someone insults him"));
  const createdVersion = beforeRun.scenarioVersions.find((version: { scenarioId: string }) => version.scenarioId === createdScenario.id);
  const imported = await request.post("/api/state", { data: { type: "importScenario", payload: { scenario: createdScenario, version: createdVersion } } });
  expect(imported.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Start isolated Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility and privacy pressure", exact: true })).toBeVisible();
  await expect(page.locator(".scenario-run-detail")).toContainText("Sandbox");
  await expect(page.getByRole("tab", { name: "Replay", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".scenario-replay-view")).toContainText("What Jenny experienced");
  await expect(page.locator(".scenario-replay-view .social-feed")).toBeVisible();

  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.locator(".scenario-details-view")).toContainText("Frozen at start");
  await expect(page.locator(".scenario-details-view")).toContainText("System checks");
  await expect(page.locator(".scenario-system-check").first()).toContainText("Passed");

  const afterRun = await request.get("/api/state").then((response) => response.json());
  const firstRun = afterRun.scenarioRuns[0];
  expect(firstRun.status).toBe("completed");
  expect(afterRun.playgroundSessions.find((session: { id: string }) => session.id === firstRun.playgroundSessionId).source).toBe("scenario");
  expect(afterRun.playgroundSessions.find((session: { id: string }) => session.id === firstRun.playgroundSessionId).status).toBe("completed");
  expect(afterRun.scenarioRunProvenance[0].presenceContextHash).toBeTruthy();
  expect(afterRun.scenarioEvaluations[0].structuralFindings.every((finding: { status: string }) => finding.status === "pass")).toBe(true);
  expect(afterRun.files.filter((file: { kind: string }) => ["MEMORY", "GROWTH"].includes(file.kind)).map((file: { kind: string; revision: number; content: string }) => `${file.kind}:${file.revision}:${file.content}`)).toEqual(filesBefore);

  await page.getByRole("button", { name: "Review Run", exact: true }).click();
  await expect(page.locator(".scenario-review-view")).toContainText("How Jenny handled it");
  const reviewed = await request.get("/api/state").then((response) => response.json());
  expect(reviewed.scenarioEvaluations[0].reviewer.promptVersion).toBe("run-reviewer-v1");

  await page.getByRole("button", { name: "Run again", exact: true }).click();
  const rerunState = await request.get("/api/state").then((response) => response.json());
  expect(rerunState.scenarioRuns.length).toBe(2);
  expect(rerunState.scenarioRuns[0].id).not.toBe(rerunState.scenarioRuns[1].id);
  expect(rerunState.scenarioRuns[0].playgroundSessionId).not.toBe(rerunState.scenarioRuns[1].playgroundSessionId);
  expect(rerunState.scenarioRuns[1].status).toBe("completed");
});

test("authored Scenarios can be deleted with their rehearsal history", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("button", { name: "Scenarios", exact: true }).click();
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page.getByLabel("What do you want to rehearse?").fill("Rehearse deleting a scenario after reviewing a hostile conversation.");
  await page.getByRole("button", { name: "Preview scenario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete scenario", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete scenario confirmation" })).toContainText("cannot be undone");
  await page.getByRole("alertdialog", { name: "Delete scenario confirmation" }).getByRole("button", { name: "Delete scenario", exact: true }).click();
  await expect(page.getByRole("button", { name: /Your scenario/ })).toHaveCount(0);

  const afterDelete = await request.get("/api/state").then((response) => response.json());
  expect(afterDelete.scenarios.every((scenario: { ownerScope: string }) => scenario.ownerScope === "system")).toBe(true);
  expect(afterDelete.events[0].title).toBe("Scenario deleted");
});
