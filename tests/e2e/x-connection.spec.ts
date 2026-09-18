import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Jenny at a glance" })).toBeVisible();
}

async function openAgentSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Agent menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /Agent settings/i }).click();
  await page.getByRole("tab", { name: "Presence & Autonomy", exact: true }).click();
  await page.getByRole("button", { name: /Channel & Access/ }).click();
}

test("Activity keeps disconnected environment truth visible beside the pulse controls", async ({ page, request }) => {
  await createAgent(page);
  const changed = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "bridge" } } });
  expect(changed.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("activity-environment-state")).toHaveText("Live · disconnected");
});

test("Activity shows truthful next-check state for a connected Chrome extension", async ({ page, request }) => {
  await createAgent(page);
  const changed = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "bridge" } } });
  expect(changed.ok()).toBeTruthy();
  const current = await (await request.get("/api/state")).json();
  const presenceId = current.presence.id;
  const bridgeResponse = await request.post("/api/bridge/manage", {
    data: {
      action: "create",
      presenceId,
      name: "Countdown Bridge",
      kind: "bridge",
      capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: ["followers"] },
    },
  });
  expect(bridgeResponse.ok()).toBeTruthy();
  const bridge = await bridgeResponse.json();
  const heartbeat = await request.post("/api/bridge/v1/heartbeat", { headers: { Authorization: `Bearer ${bridge.key}` }, data: { executorId: "countdown-test" } });
  expect(heartbeat.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".next-check-countdown")).toHaveText(/Next check in \d{2}:\d{2}|Next check due now|Next check not scheduled/);
});

test("Chrome settings show one current route and collapse disconnected extension history", async ({ page, request }) => {
  await createAgent(page);
  const current = await (await request.get("/api/state")).json();
  const presenceId = current.presence.id;
  const liveRoute = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "bridge" } } });
  expect(liveRoute.ok()).toBeTruthy();
  const capabilities = { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: ["followers", "public_metrics"] };
  const oldBridgeResponse = await request.post("/api/bridge/manage", { data: { action: "create", presenceId, name: "Old Chrome Bridge", kind: "bridge", capabilities } });
  expect(oldBridgeResponse.ok()).toBeTruthy();
  const oldBridge = await oldBridgeResponse.json();
  const revoked = await request.post("/api/bridge/manage", { data: { action: "revoke", bridgeId: oldBridge.bridge.id } });
  expect(revoked.ok()).toBeTruthy();
  const currentBridgeResponse = await request.post("/api/bridge/manage", { data: { action: "create", presenceId, name: "Current Chrome Bridge", kind: "bridge", capabilities } });
  expect(currentBridgeResponse.ok()).toBeTruthy();

  await page.reload();
  await openAgentSettings(page);
  await expect(page.locator(".active-bridge-unified")).toContainText("Current Chrome Bridge");
  await expect(page.locator(".active-bridge-unified")).toContainText("waiting for adapter");
  await expect(page.locator(".bridge-history-details")).toContainText("History (1 removed)");
  await expect(page.locator(".bridge-history-details")).not.toHaveAttribute("open", "");
  await expect(page.locator(".bridge-history-details").getByText("Old Chrome Bridge · Disconnected", { exact: true })).toBeHidden();

  await page.locator(".bridge-history-details summary").click();
  await expect(page.locator(".bridge-history-details").getByText("Old Chrome Bridge · Disconnected", { exact: true })).toBeVisible();
  await expect(page.locator(".bridge-history-details")).toContainText("Disconnected");
});

test("operator connects an X Presence through the official API", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await createAgent(page);
  await openAgentSettings(page);
  await page.getByRole("group", { name: "Destination route" }).getByRole("button", { name: /^X Live/ }).click();
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toBeVisible();
  const fieldWidths = await page.locator(".x-credential-field input").evaluateAll((inputs) => inputs.map((input) => Math.round(input.getBoundingClientRect().width)));
  expect(new Set(fieldWidths).size).toBe(1);
  await expect(page.getByText("Official X API")).toBeVisible();

  await page.getByLabel("X API Key", { exact: true }).fill("test_api");
  await page.getByLabel("X API Key Secret", { exact: true }).fill("test_secret");
  await page.getByLabel("X User Access Token", { exact: true }).fill("test_access");
  await page.getByLabel("X User Access Token Secret", { exact: true }).fill("test_access_secret");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.locator(".connection-result")).toContainText("Connected to @jenny_ai · Read + write");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();
  await expect(page.getByText(/Preferred route for official API actions/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Destination route" }).getByRole("button", { name: /Bridge Live/ })).toHaveCount(1);

  await page.reload();
  await openAgentSettings(page);
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();
  await expect(page.getByText("Encrypted credentials on server", { exact: false })).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByTestId("activity-environment-state")).toHaveText("Live · connected");
  await expect(page.locator(".next-check-countdown")).toHaveText(/Next check in \d{2}:\d{2}|Next check due now/);
  await expect(page.getByRole("heading", { name: "No public activity yet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("native X connection delivers an approved Presence action", async ({ page }) => {
  test.skip(true, "Legacy user-created Assignment flow is intentionally removed; native delivery remains covered by the runtime verifier.");
  await createAgent(page);
  await openAgentSettings(page);
  await page.getByRole("group", { name: "Destination route" }).getByRole("button", { name: /^X Live/ }).click();
  await page.getByLabel("X API Key", { exact: true }).fill("test_api");
  await page.getByLabel("X API Key Secret", { exact: true }).fill("test_secret");
  await page.getByLabel("X User Access Token", { exact: true }).fill("test_access");
  await page.getByLabel("X User Access Token Secret", { exact: true }).fill("test_access_secret");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("heading", { name: "Connected to @jenny_ai" })).toBeVisible();

  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Share one useful idea about persistent agents.");
  await page.getByLabel("Assignment date").fill(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date()));
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("09:45");
  await page.getByRole("button", { name: "Create assignment", exact: true }).click();
  await expect(page.getByText("post is available through the Presence execution envelope.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Work now", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run in Playground", exact: true })).toHaveCount(0);
});
