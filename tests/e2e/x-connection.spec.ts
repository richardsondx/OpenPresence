import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "@jenny_ai is live." })).toBeVisible();
}

test("operator connects an X Presence through the official API", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await createAgent(page);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
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
  await expect(page.getByText("Official X API access is read + write.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add a Bridge alternative" })).toBeVisible();

  await page.reload();
  const freshNavigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await freshNavigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();
  await expect(page.getByText("Credentials are encrypted on this server and never returned to the browser.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("native X connection delivers an approved Presence action", async ({ page }) => {
  await createAgent(page);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("X API Key", { exact: true }).fill("test_api");
  await page.getByLabel("X API Key Secret", { exact: true }).fill("test_secret");
  await page.getByLabel("X User Access Token", { exact: true }).fill("test_access");
  await page.getByLabel("X User Access Token Secret", { exact: true }).fill("test_access_secret");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();

  await navigation.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Share one useful idea about persistent agents.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  await navigation.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".event-title").filter({ hasText: "Published on X" })).toBeVisible();
  await expect(page.locator(".execution-ledger").getByRole("heading", { name: "Action completed" })).toBeVisible();
});
