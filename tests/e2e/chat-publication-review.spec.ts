import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { chatPublicationReviewFixture } from "../fixtures/chat-publication-review";
import type { OpenPresenceState } from "../../lib/types";

const fixtureFiles = new Set<string>();

function storeFixtureImages(fixture: OpenPresenceState) {
  mkdirSync("data/assets", { recursive: true });
  for (const asset of fixture.assets) {
    if (!asset.storage?.storeKey || !asset.dataUrl) continue;
    const file = `data/assets/${asset.storage.storeKey}`;
    writeFileSync(file, Buffer.from(asset.dataUrl.split(",")[1], "base64"), { flag: "wx" });
    fixtureFiles.add(file);
  }
}

test.afterEach(() => {
  for (const file of fixtureFiles) unlinkSync(file);
  fixtureFiles.clear();
});

// Inject only a pending-review stimulus into a declared isolated database.
// Approval, permission recording, delivery and conversation follow-through
// must run through the actual app and public operation, not the fixture.
test("pending media review is visible once and approval continues the same publication", async ({ page, request }, testInfo) => {
  const dbPath = process.env.OPENPRESENCE_E2E_DB_PATH;
  expect(dbPath).toBeTruthy();
  expect(dbPath).not.toMatch(/\/data\/openpresence/);
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBe(true);
  const fixture = chatPublicationReviewFixture();
  storeFixtureImages(fixture);
  const timestamp = new Date().toISOString();
  const db = new Database(realpathSync(dbPath!));
  try {
    db.prepare("UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(fixture), timestamp);
    db.prepare("INSERT OR REPLACE INTO agent_workspaces(agent_id,payload,updated_at) VALUES(?,?,?)").run(fixture.agent!.id, JSON.stringify(fixture), timestamp);
  } finally { db.close(); }
  const executionId = fixture.executions[0].id;
  await page.goto(`/chat?agentId=${fixture.agent!.id}&presenceId=${fixture.presence!.id}`);
  const review = page.getByTestId("operator-chat-publication-review");
  await expect(review).toHaveCount(1);
  await expect(review).toBeVisible();
  expect(await review.evaluate(node => Boolean(node.closest("details")))).toBe(false);
  await expect(review.getByText("Review post", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Approve publication", exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Open Review", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="operator-chat-tool"] > summary').filter({ hasText: "Needs review" })).toHaveCount(0);
  // Clicking the static heading cannot conceal the pending decision.
  await review.getByText("Review post", { exact: true }).click();
  await expect(review.getByRole("button", { name: "Approve publication", exact: true })).toBeVisible();
  await expect(review.getByRole("img")).toBeVisible();
  await expect.poll(() => review.getByRole("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await expect(review.locator("blockquote")).not.toBeEmpty();
  await expect(page.getByText("Background X read", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("review-visible.png"), fullPage: true });
  await page.reload();
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Approve publication", exact: true }).click();
  await expect(review).toHaveCount(0);
  const saved = page.getByTestId("operator-chat-publication-preview");
  await expect(saved).toHaveCount(1);
  await expect(saved.getByRole("img")).toBeVisible();
  await expect.poll(() => saved.getByRole("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await expect(saved.getByRole("button", { name: "Approve publication", exact: true })).toHaveCount(0);
  await expect.poll(async () => {
    const state = await (await request.get(`/api/state?agentId=${fixture.agent!.id}`)).json();
    const execution = state.executions.find((item: { id: string }) => item.id === executionId);
    return { count: state.executions.filter((item: { id: string }) => item.id === executionId).length, status: execution?.status, outcomes: state.outcomes.filter((item: { executionId: string; status: string }) => item.executionId === executionId && item.status === "succeeded").length };
  }).toEqual({ count: 1, status: "succeeded", outcomes: 1 });
  await expect(page.locator(".operator-chat-message.is-presence").last()).toContainText(/rehearsal|sandbox|simulat/i);
  await expect(page.locator(".operator-chat-message.is-presence").last()).not.toContainText(/awaiting review|needs review/i);
  await page.reload();
  await expect(review).toHaveCount(0);
  await expect(saved).toHaveCount(1);
  await expect.poll(() => saved.getByRole("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await expect(page.locator(".operator-chat-message.is-presence").last()).toContainText(/rehearsal|sandbox|simulat/i);
  await page.screenshot({ path: testInfo.outputPath("review-approved-outcome.png"), fullPage: true });
  const duplicate = await request.post("/api/state", { data: { type: "approveExecution", id: executionId } });
  expect(duplicate.ok()).toBe(true);
  const after = await duplicate.json();
  expect(after.outcomes.filter((item: { executionId: string }) => item.executionId === executionId)).toHaveLength(1);
});

test("failed image publication keeps one decoded preview visible through reload", async ({ page, request }, testInfo) => {
  const dbPath = process.env.OPENPRESENCE_E2E_DB_PATH;
  expect(dbPath).toBeTruthy();
  expect(dbPath).not.toMatch(/\/data\/openpresence/);
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBe(true);
  const fixture = chatPublicationReviewFixture();
  fixture.executions[0].status = "failed";
  fixture.executions[0].failure = { code: "BROWSER_CONNECTOR_UNAVAILABLE", message: "Image retrieval stopped before submission", retryable: false };
  fixture.assets[0].provenance.origin = "generated";
  const conversation = fixture.operatorConversations![0];
  const receipt = conversation.messages.find((message: { role: string; content: string }) => message.role === "system" && message.content.includes('"social_action"'));
  if (!receipt) throw new Error("Synthetic review receipt is missing.");
  conversation.messages.push({ ...receipt, id: "duplicate-preview-receipt" });
  storeFixtureImages(fixture);
  const db = new Database(realpathSync(dbPath!));
  try {
    for (const table of ["executions", "social_intents", "outcomes", "publications", "asset_usages"]) db.prepare(`DELETE FROM ${table} WHERE agent_id = ?`).run(fixture.agent!.id);
    db.prepare("UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(fixture), new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO agent_workspaces(agent_id,payload,updated_at) VALUES(?,?,?)").run(fixture.agent!.id, JSON.stringify(fixture), new Date().toISOString());
  } finally { db.close(); }
  await page.goto(`/chat?agentId=${fixture.agent!.id}&presenceId=${fixture.presence!.id}`);
  const preview = page.getByTestId("operator-chat-publication-preview");
  await expect(preview).toHaveCount(1);
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(node => Boolean(node.closest("details")))).toBe(false);
  await expect.poll(() => preview.getByRole("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await expect(preview).toContainText("Not completed");
  await expect(preview.getByRole("button", { name: "Approve publication", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(preview).toHaveCount(1);
  await expect.poll(() => preview.getByRole("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  const state = await (await request.get(`/api/state?agentId=${fixture.agent!.id}`)).json();
  expect(state.executions.filter((item: { id: string }) => item.id === fixture.executions[0].id)).toHaveLength(1);
  expect(state.outcomes.filter((item: { executionId: string }) => item.executionId === fixture.executions[0].id)).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("failed-image-preview.png"), fullPage: true });
});

test("Chat image picker excludes published media before selection", async ({ page, request }, testInfo) => {
  const dbPath = process.env.OPENPRESENCE_E2E_DB_PATH;
  expect(dbPath).toBeTruthy();
  expect(dbPath).not.toMatch(/\/data\/openpresence/);
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBe(true);
  const fixture = chatPublicationReviewFixture();
  fixture.presence!.environment = "live";
  fixture.presences.forEach((presence) => { presence.environment = "live"; });
  fixture.executions = [];
  fixture.socialIntents = [];
  fixture.outcomes = [];
  const fresh = fixture.assets[0];
  fresh.environment = "live";
  fresh.provenance.origin = "operator_upload";
  fresh.description = "Fresh unused image";
  fresh.reusePermission = "ready_to_use";
  const used = { ...fresh, id: "used-picker-image", description: "Previously published image", storage: undefined, storagePath: undefined, checksum: "different-visual" };
  fixture.assets.push(used);
  fixture.assetUsages = [{ id: "picker-prior-use", assetId: used.id, agentId: fixture.agent!.id, presenceId: fixture.presence!.id, publicationId: "prior-picker-publication", socialIntentId: "prior-picker-intent", channelId: "x", environment: "live", usageType: "new", publishedAt: new Date().toISOString() }];
  storeFixtureImages(fixture);
  const db = new Database(realpathSync(dbPath!));
  try {
    db.prepare("UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(fixture), new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO agent_workspaces(agent_id,payload,updated_at) VALUES(?,?,?)").run(fixture.agent!.id, JSON.stringify(fixture), new Date().toISOString());
    for (const table of ["executions", "social_intents", "outcomes", "publications", "asset_usages"]) db.prepare(`DELETE FROM ${table} WHERE agent_id = ?`).run(fixture.agent!.id);
    for (const usage of fixture.assetUsages) db.prepare("INSERT OR REPLACE INTO asset_usages(id,agent_id,parent_id,payload,updated_at) VALUES(?,?,?,?,?)").run(usage.id, usage.agentId, usage.assetId, JSON.stringify(usage), new Date().toISOString());
  } finally { db.close(); }
  await page.goto(`/chat?agentId=${fixture.agent!.id}&presenceId=${fixture.presence!.id}`);
  await page.getByRole("button", { name: "Attach media or files", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add an image" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /Fresh unused image/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Previously published image/ })).toHaveCount(0);
  await expect.poll(() => picker.locator("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  await page.screenshot({ path: testInfo.outputPath("unused-image-picker.png"), fullPage: true });
  await picker.getByRole("button", { name: /Fresh unused image/ }).click();
  await expect(page.locator(".operator-chat-attachments")).toContainText("Fresh unused image");
  const state = await (await request.get(`/api/state?agentId=${fixture.agent!.id}`)).json();
  expect(state.executions).toHaveLength(0);
});
