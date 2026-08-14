import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("natural-language Scenario rehearsal stays isolated, reviewable, and rerunnable", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  const modeBefore = await page.locator(".playground-mode-switch").boundingBox();
  await page.getByRole("tab", { name: "Scenarios", exact: true }).click();
  const modeAfter = await page.locator(".playground-mode-switch").boundingBox();

  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await expect(page.locator(".topbar-context strong")).toHaveText("Playground");
  await expect(page.getByText("Scenario library", { exact: true })).toBeVisible();
  expect(modeBefore).not.toBeNull();
  expect(modeAfter).not.toBeNull();
  expect(Math.abs((modeAfter?.x ?? 0) - (modeBefore?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((modeAfter?.y ?? 0) - (modeBefore?.y ?? 0))).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page.getByLabel("What do you want to rehearse?").fill("Test Richardson when someone insults him, uses curse words, and pressures him for private information.");
  await page.getByRole("button", { name: "Preview scenario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility and privacy pressure", exact: true })).toBeVisible();
  await expect(page.getByText("What Jenny will encounter", { exact: true })).toBeVisible();
  await expect(page.getByText("What we'll review", { exact: true })).toBeVisible();
  await expect(page.locator(".scenario-event-preview")).toHaveCount(5);
  await expect(page.locator(".scenario-fidelity-ready")).toContainText("Ready to rehearse.");
  await expect(page.locator(".scenario-preview .scenario-fidelity-panel")).toContainText("The frozen world matches the situation you described.");
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
  await expect(page.locator(".scenario-replay-view .social-feed")).toContainText("fucking");

  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.locator(".scenario-details-view")).toContainText("Frozen at start");
  await expect(page.locator(".scenario-details-view")).toContainText("System checks");
  await expect(page.locator(".scenario-system-check").first()).toContainText("Passed");

  const afterRun = await request.get("/api/state").then((response) => response.json());
  const firstRun = afterRun.scenarioRuns[0];
  expect(firstRun.status).toBe("completed");
  expect(afterRun.playgroundSessions.find((session: { id: string }) => session.id === firstRun.playgroundSessionId).source).toBe("scenario");
  expect(afterRun.playgroundSessions.find((session: { id: string }) => session.id === firstRun.playgroundSessionId).status).toBe("completed");
  expect(afterRun.mirrorObjects.filter((object: { sessionId: string }) => object.sessionId === firstRun.playgroundSessionId).filter((object: { source?: string }) => object.source === "scenario").length).toBeGreaterThan(0);
  expect(afterRun.mirrorObjects.filter((object: { sessionId: string }) => object.sessionId === firstRun.playgroundSessionId).filter((object: { source?: string }) => object.source === "scenario").every((object: { trust?: string }) => object.trust === "untrusted_world_content")).toBe(true);
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
  await page.getByRole("tab", { name: "Scenarios", exact: true }).click();
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page.getByLabel("What do you want to rehearse?").fill("Rehearse deleting a scenario after reviewing a hostile conversation.");
  await page.getByRole("button", { name: "Preview scenario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility", exact: true })).toBeVisible();

  const authoredCard = page.locator(".scenario-card").filter({ hasText: "Your scenario" });
  await expect(authoredCard).toContainText("Generated");
  await page.getByRole("button", { name: "Rename Hostility", exact: true }).click();
  await page.getByLabel("Scenario title").fill("Hostility rehearsal");
  await page.getByRole("button", { name: "Save title", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hostility rehearsal", exact: true })).toBeVisible();
  await expect(authoredCard).toContainText("Hostility rehearsal");
  await expect(authoredCard.getByRole("button", { name: /^Delete / })).toHaveCount(1);
  await expect(page.locator(".scenario-card").filter({ hasText: "Built-in" }).getByRole("button", { name: /^Delete / })).toHaveCount(0);
  await authoredCard.getByRole("button", { name: /^Delete / }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete scenario confirmation" })).toContainText("cannot be undone");
  await page.getByRole("alertdialog", { name: "Delete scenario confirmation" }).getByRole("button", { name: "Delete scenario", exact: true }).click();
  await expect(page.getByRole("button", { name: /Your scenario/ })).toHaveCount(0);

  const afterDelete = await request.get("/api/state").then((response) => response.json());
  expect(afterDelete.scenarios.every((scenario: { ownerScope: string }) => scenario.ownerScope === "system")).toBe(true);
  expect(afterDelete.events[0].title).toBe("Scenario deleted");
});

test("Generate missing events repairs the unmet requirement", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("tab", { name: "Scenarios", exact: true }).click();
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page.getByLabel("What do you want to rehearse?").fill("Create a heated discussion about founder-led sales with sarcasm and disagreement.");
  await page.getByRole("button", { name: "Preview scenario", exact: true }).click();

  const before = await request.get("/api/state").then((response) => response.json());
  const scenario = before.scenarios.find((item: { ownerScope: string; title: string }) => item.ownerScope === "presence" && item.title === "Social Judgment");
  const version = before.scenarioVersions.find((item: { id: string }) => item.id === scenario.currentVersionId);
  const editedStimuli = version.worldSpec.stimuli.map((stimulus: { id: string; content: string }) => stimulus.id === "stimulus-discussion-reply" ? { ...stimulus, content: "I disagree. Show the concrete change." } : stimulus);
  const update = await request.post("/api/state", { data: { type: "updateScenarioEvents", scenarioId: scenario.id, stimuli: editedStimuli } });
  expect(update.ok()).toBeTruthy();

  await page.reload();
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.getByRole("tab", { name: "Scenarios", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate missing events", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate missing events", exact: true }).click();
  await expect(page.locator(".scenario-fidelity-ready")).toContainText("Ready to rehearse.");
  await expect(page.locator(".scenario-event-preview").filter({ hasText: "breakthrough!" })).toHaveCount(1);
  await expect(page.locator(".scenario-event-preview").filter({ hasText: "I disagree." })).toHaveCount(1);

  const after = await request.get("/api/state").then((response) => response.json());
  const currentScenario = after.scenarios.find((item: { id: string }) => item.id === scenario.id);
  const currentVersion = after.scenarioVersions.find((item: { id: string }) => item.id === currentScenario.currentVersionId);
  expect(currentVersion.fidelity.status).toBe("verified");
  expect(new Set(currentVersion.worldSpec.stimuli.map((stimulus: { id: string }) => stimulus.id)).size).toBe(currentVersion.worldSpec.stimuli.length);
});
