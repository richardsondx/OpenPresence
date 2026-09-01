import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("navigation survives a partial Activity state response", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny at a glance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice before you connect.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Practice in Sandbox", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice one safe moment.", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Practice one safe moment." }).getByRole("button", { name: "Check now", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Review", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/\/review(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Needs You", exact: true })).toBeVisible();

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let responseWasDegraded = false;
  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/state") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    if (response.status() !== 200 || !response.headers()["content-type"]?.includes("application/json")) return route.fulfill({ response });
    const body = await response.json();
    if (!responseWasDegraded && body.responseProjection === "activity") {
      delete body.playgroundSessions;
      responseWasDegraded = true;
    }
    await route.fulfill({ response, json: body });
  });

  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Jenny at a glance", exact: true })).toBeVisible();
  await expect.poll(() => responseWasDegraded).toBe(true);

  for (const [path, heading] of [["/settings", "How this Presence acts"], ["/growth", "Growth"], ["/people", "People"], ["/activity", "Jenny at a glance"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred", { exact: false })).toHaveCount(0);
  }

  expect(pageErrors).toEqual([]);
});
