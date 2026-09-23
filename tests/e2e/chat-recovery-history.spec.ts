import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { realpathSync } from "node:fs";

// An injected dependency incident is the stimulus, not a fabricated successful recovery.
// The app owns projection, chronology, rendering, and reload persistence.
test("failure remains in scrollable Chat history after resolution and reload", async ({ page, request }, testInfo) => {
  const dbPath = process.env.OPENPRESENCE_E2E_DB_PATH;
  test.skip(!dbPath, "Requires an explicit isolated fixture database.");
  expect(dbPath).not.toMatch(/\/data\/openpresence/);
  await request.post("/api/state", { data: { type: "reset" } });
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/state" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  await expect(page.getByRole("heading", { name: "Chat with Genny" })).toBeAttached();
  const state = await (await created).json();
  await page.goto(`/chat?agentId=${state.agent.id}&presenceId=${state.presence.id}`);
  const composer = page.getByLabel("Message Genny", { exact: true });
  await composer.fill("Hello before the connection problem.");
  await composer.press("Enter");
  await expect(page.locator(".operator-chat-history").getByText("Hello before the connection problem.", { exact: true })).toBeVisible();
  const incident = { id: `test-durable-recovery-${state.presence.id}`, presenceId: state.presence.id, rootCauseKey: "model_provider.auth_expired", dependencyId: `dh_model_provider_${state.presence.id}`, state: "needs_operator", openedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recoveryAttempts: 1, affectedRunIds: [], safeSummary: "The model connection needs a fresh sign-in.", operatorActionRequired: true, requiresAuth: true };
  // Match the server's canonical path: macOS /var aliases /private/var.
  // Opening SQLite through both names can detach the live WAL on close.
  const db = new Database(realpathSync(dbPath!));
  const save = () => db.prepare("INSERT OR REPLACE INTO recovery_incidents_live (id, root_cause_key, dependency_id, presence_id, state, recovery_attempts, safe_summary, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(incident.id, incident.rootCauseKey, incident.dependencyId, incident.presenceId, incident.state, 1, incident.safeSummary, JSON.stringify(incident), new Date().toISOString());
  try {
    save();
    await page.reload();
    const event = page.getByTestId("operator-chat-recovery-event").filter({ hasText: incident.safeSummary });
    await expect(event).toBeVisible();
    expect(await event.evaluate((node) => Boolean(node.closest(".operator-chat-history")))).toBe(true);
    await composer.fill("Keep this draft while I read the history.");
    await expect(composer).toHaveValue("Keep this draft while I read the history.");
    incident.state = "resolved";
    incident.operatorActionRequired = false;
    save();
    await page.reload();
    await expect(event).toContainText("Recovered");
    await expect(event).toContainText(incident.safeSummary);
    await expect(event.getByRole("button", { name: "Check again" })).toHaveCount(0);
    const order = await page.locator(".operator-chat-history article").allTextContents();
    expect(order.findIndex((text) => text.includes("Hello before"))).toBeLessThan(order.findIndex((text) => text.includes(incident.safeSummary)));
    await page.screenshot({ path: testInfo.outputPath("durable-recovery-history.png"), fullPage: true });
  } finally { db.close(); }
});
