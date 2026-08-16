import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();
}

test("operator connects an X Presence through the official API", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await createAgent(page);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".channel-mode-options").getByRole("button", { name: /^X/ }).click();
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toBeVisible();
  const fieldWidths = await page.locator(".x-credential-field input").evaluateAll((inputs) => inputs.map((input) => Math.round(input.getBoundingClientRect().width)));
  expect(new Set(fieldWidths).size).toBe(1);
  await expect(page.getByText("X Developer Console")).toBeVisible();

  await page.getByLabel("X API Key", { exact: true }).fill("test_api");
  await page.getByLabel("X API Key Secret", { exact: true }).fill("test_secret");
  await page.getByLabel("X User Access Token", { exact: true }).fill("test_access");
  await page.getByLabel("X User Access Token Secret", { exact: true }).fill("test_access_secret");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status")).toContainText("Connected to @jenny_ai · Read + write");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();
  await expect(page.getByText(/Official X API authentication is configured with read \+ write credentials/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Connect this Presence through Bridge/ })).toHaveCount(0);

  await page.reload();
  const freshNavigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await freshNavigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();
  await expect(page.getByText("Credentials are encrypted on this server and never returned to the browser.")).toBeVisible();
  await freshNavigation.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".mirror-panel").getByRole("heading", { name: "Up to date" })).toBeVisible();
  await expect(page.locator(".mirror-panel")).toContainText("0 posts");
  await expect(page.locator(".mirror-panel")).not.toContainText("waiting for observations");
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("native X connection delivers an approved Presence action", async ({ page }) => {
  await createAgent(page);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".channel-mode-options").getByRole("button", { name: /^X/ }).click();
  await page.getByLabel("X API Key", { exact: true }).fill("test_api");
  await page.getByLabel("X API Key Secret", { exact: true }).fill("test_secret");
  await page.getByLabel("X User Access Token", { exact: true }).fill("test_access");
  await page.getByLabel("X User Access Token Secret", { exact: true }).fill("test_access_secret");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();

  await navigation.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Share one useful idea about persistent agents.");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("post is available through the Presence execution envelope.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate Assignment" }).click();
  await expect(page.getByRole("button", { name: "Run in Playground" })).toBeVisible();
});
