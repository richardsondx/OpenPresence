import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Tasks projects Agent-owned work with supervisory controls", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
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
});
