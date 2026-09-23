import { expect, test } from "@playwright/test";

test("Calendar is only a dated calendar, with week navigation and task details", async ({ page, request }, testInfo) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  await expect(page.getByRole("heading", { name: "Chat with Jenny" })).toBeAttached();
  const base = await request.get("/api/state").then(r => r.json());
  const timezone = base.presence.publishingInitiative.timezone || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const now = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  const future = new Date(now);
  future.setUTCDate(future.getUTCDate() + 7);
  const futureDate = future.toISOString().slice(0, 10);
  const past = new Date(now);
  past.setUTCDate(past.getUTCDate() - 7);
  const pastDate = past.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const samples = [
    { title: "Find useful conversations", schedule: { day: "Monday", time: "09:00", executionWindow: "09:00–10:00" } },
    { title: "Share the launch next week", schedule: { date: futureDate, day: future.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }), time: "11:00", executionWindow: "11:00–12:00" } },
    { title: "Keep an eye out for ideas" },
    { title: "Review the community response", timeframe: { startsAt: `${today}T15:00:00Z`, deadline: `${today}T17:00:00Z` } },
    { title: "A previous launch", schedule: { date: pastDate, day: past.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }), time: "11:00", executionWindow: "11:00–12:00" } },
  ];
  for (const sample of samples) expect((await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence.id, environment: "sandbox", instruction: sample.title, ...sample } })).ok()).toBeTruthy();
  // Exercise historical completion and deadline-only projection without claiming delivery.
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const state = await response.json();
    for (const task of state.assignments ?? []) {
      if (task.title === "Find useful conversations") task.recurrence = { kind: "daily" };
      if (task.title === "A previous launch") task.status = "completed";
      if (task.title === "Review the community response") task.timeframe = { deadline: `${today}T17:00:00Z` };
    }
    await route.fulfill({ response, json: state });
  });
  await page.goto(`/schedule?agentId=${base.agent.id}&presenceId=${base.presence.id}`);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const calendar = page.getByRole("region", { name: "Weekly calendar" });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".task-calendar-event").filter({ hasText: "Find useful conversations" })).toHaveCount(7);
  await expect(page.getByRole("region", { name: "Tasks list" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Tasks without a fixed start time" })).toHaveCount(0);
  await expect(page.getByText("Upcoming opportunities", { exact: false })).toHaveCount(0);
  await expect(calendar.getByText("Keep an eye out for ideas", { exact: true })).toHaveCount(0);
  await expect(calendar.getByText("Share the launch next week", { exact: true })).toHaveCount(0);
  await expect(calendar.getByRole("button", { name: /Open task: Review the community response/ })).toBeVisible();
  const dueTime = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(`${today}T17:00:00Z`));
  await expect(calendar.getByText(`Due ${dueTime}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("calendar.png"), fullPage: true });
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const futureTask = calendar.getByRole("button", { name: /Open task: Share the launch next week/ });
  await expect(futureTask).toBeVisible();
  await futureTask.click();
  await expect(page.getByRole("complementary", { name: "Assignment details" })).toContainText("Share the launch next week");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(futureTask).toHaveCount(0);
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(calendar.getByRole("button", { name: /Open task: A previous launch/ })).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(calendar.locator('[aria-current="date"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("button", { name: /Open task: Keep an eye out for ideas/ })).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
