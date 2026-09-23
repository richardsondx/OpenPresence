import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Tasks projects Agent-owned work with supervisory controls", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  const base = await request.get("/api/state").then(response => response.json());
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence.id, environment: "sandbox", createdBy: "agent", origin: "publishing_initiative", title: "Teach one useful idea", instruction: "Teach one useful idea about persistent agents.", schedule: { day: "Tuesday", time: "08:00", executionWindow: "08:00–11:00" } } });
  expect(created.ok()).toBeTruthy();
  const task = (await created.json()).assignments.find((item: { title: string }) => item.title === "Teach one useful idea");
  await page.goto(`/schedule?agentId=${base.agent.id}&presenceId=${base.presence.id}&assignmentId=${task.id}`);
  await expect(page.getByText("publishing rhythm", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Create plan", { exact: true })).toHaveCount(0);
  const details = page.getByRole("complementary", { name: "Assignment details" });
  await expect(details.getByText("Tell Jenny something about this", { exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Edit Assignment", exact: true })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Activate Assignment", exact: true })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Run in Playground", exact: true })).toHaveCount(0);
  await details.getByLabel("Tell Jenny something about this").fill("Focus this on developers and never use generic motivational visuals.");
  await details.getByRole("button", { name: "Send guidance", exact: true }).click();
  await expect.poll(async () => {
    const state = await request.get("/api/state").then(response => response.json());
    return state.assignments.find((item: { id: string }) => item.id === task.id)?.instruction ?? "";
  }).toContain("generic motivational visuals");
  await page.reload();
  await expect(details.getByLabel("Tell Jenny something about this")).toHaveValue("");
  await details.getByText("Timing & details", { exact: true }).click();
  await details.getByText("More about this", { exact: true }).click();
  await expect(details.getByText("generic motivational visuals", { exact: false }).first()).toBeVisible();
});

test("the simple list keeps incomplete work visible and completed work quiet", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  await expect(page.getByRole("heading", { name: "Chat with Jenny" })).toBeAttached();
  const base = await request.get("/api/state").then(response => response.json());
  const samples = [
    { title: "Find a useful founder conversation", status: "active", message: undefined },
    { title: "Share a lesson about agent memory", status: "needs_operator", message: "Choose which example you want to share." },
    { title: "Test a new posting approach", status: "expired_incomplete", message: "The posting window ended before a result was verified." },
    { title: "Follow up with the design community", status: "paused", message: undefined },
    { title: "Share the launch story", status: "completed", message: undefined },
    { title: "Prepare a customer story", status: "draft", message: undefined },
  ];
  for (const sample of samples) {
    const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence.id, environment: "sandbox", title: sample.title, instruction: sample.title } });
    expect(created.ok()).toBeTruthy();
  }
  // Presentation fixture only: no claim of execution or verified delivery.
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const state = await response.json();
    for (const item of state.assignments ?? []) {
      const sample = samples.find(candidate => candidate.title === item.title);
      if (sample) Object.assign(item, { status: sample.status, lastOutcome: sample.message ? { class: "blocked", message: sample.message, at: new Date().toISOString() } : undefined });
      if (item.title === "Prepare a customer story") item.preflight = { ...item.preflight, status: "needs_input", semanticSummary: "Choose a customer example before I start." };
    }
    await route.fulfill({ response, json: state });
  });
  await page.goto(`/schedule?agentId=${base.agent.id}&presenceId=${base.presence.id}`);
  const attention = page.getByRole("region", { name: "Tasks needing attention" });
  await expect(attention.getByRole("button")).toHaveCount(2);
  await expect(attention).toContainText("Choose which example you want to share.");
  await expect(attention).toContainText("Choose a customer example before I start.");
  await page.locator(".task-ended > summary").click();
  await expect(page.locator(".task-ended")).toContainText("The posting window ended before a result was verified.");
  const progress = page.getByRole("region", { name: "Tasks in progress" });
  await expect(progress.getByRole("button")).toHaveCount(2);
  await expect(progress).toContainText("Paused.");
  await expect(page.getByRole("group", { name: "Assignment type filter" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Scheduled responsibility filter" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open task: Share the launch story", exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tasks-list.png"), fullPage: true });
  await attention.getByRole("button", { name: /Share a lesson/ }).click();
  const details = page.getByRole("complementary", { name: "Assignment details" });
  await expect(details.getByLabel("Tell Jenny something about this")).toBeVisible();
  await expect(details.locator(".task-detail-update")).toContainText("Choose which example");
  await expect(details.locator(".assignment-inspector-meta")).not.toBeVisible();
  await details.getByText("Timing & details", { exact: true }).click();
  await expect(details.locator(".assignment-inspector-meta")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await page.locator(".task-completed > summary").click();
  await expect(page.getByRole("button", { name: "Open task: Share the launch story", exact: true })).toBeVisible();
  await page.reload();
  await expect(attention.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Open task: Share the launch story", exact: true })).not.toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
