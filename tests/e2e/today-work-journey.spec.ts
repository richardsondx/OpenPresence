import { expect, test } from "@playwright/test";
import type { OpenPresenceState, OperatorConversation } from "../../lib/types";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});

test("Today opens a durable chat journey and preserves it after reload", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Journey Agent");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  const content = "What should we pay attention to today?";
  await page.getByLabel("Message Journey Agent").fill(content);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence").first()).toBeVisible();
  const saved = await (await request.get("/api/state")).json() as OpenPresenceState;
  expect(saved.operatorConversations?.some(c => c.messages.some(m => m.content === content))).toBe(true);
  await page.getByRole("button", { name: /Open context sidebar|About Journey Agent/ }).first().click();
  const inspector = page.getByRole("complementary", { name: "Today inspector" });
  await inspector.getByRole("button", { name: new RegExp(content.replace("?", "\\?")) }).click();
  const dialog = page.getByRole("dialog", { name: content });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Your request/ }).click();
  await expect(dialog.getByRole("region", { name: "Selected work step" })).toContainText(content);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(inspector).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Open context sidebar|About Journey Agent/ }).first().click();
  await expect(page.getByRole("complementary", { name: "Today inspector" }).getByRole("button", { name: new RegExp(content.replace("?", "\\?")) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("today-persisted.png"), fullPage: true });
});

test("journey discloses failed and successful tool receipts without marking pending delegated work complete", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Evidence Agent");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  const saved = await (await request.get("/api/state")).json() as OpenPresenceState;
  const now = new Date().toISOString();
  const later = (seconds: number) => new Date(Date.parse(now) + seconds * 1000).toISOString();
  const conversation: OperatorConversation = {
    id: "journey-fixture", agentId: saved.agent!.id, presenceId: saved.presence!.id, title: "Main", createdAt: now, updatedAt: later(3), messages: [
      { id: "request-fixture", role: "operator", content: "Find evidence for my next post", timestamp: now },
      { id: "failed-fixture", role: "system", replyToMessageId: "request-fixture", timestamp: later(1), content: JSON.stringify({ tool: "search_web", query: "grid financing", error: "Search source did not respond" }) },
      { id: "read-fixture", role: "system", replyToMessageId: "request-fixture", timestamp: later(2), content: JSON.stringify({ tool: "read_web", url: "https://example.org/evidence", result: { title: "Grid study", content: "Inspected source text", token: "must-not-render" } }) },
      { id: "delegate-fixture", role: "system", replyToMessageId: "request-fixture", timestamp: later(3), content: JSON.stringify({ tool: "assignment", assignmentId: "work-fixture", result: { assignmentId: "work-fixture", status: "queued" } }) },
      { id: "answer-fixture", role: "presence", replyToMessageId: "request-fixture", timestamp: later(4), content: "I found a source. I’m preparing the post." },
    ],
  };
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    body.operatorConversations = [conversation];
    body.assignments = [{ id: "work-fixture", agentId: saved.agent!.id, presenceId: saved.presence!.id, title: "Prepare a sourced post", instruction: "Find evidence and prepare the post", status: "working", createdAt: now, updatedAt: later(4), attemptHistory: [], planHistory: [] }];
    body.events = [];
    body.assignmentRuns = [];
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await page.getByRole("button", { name: /Open context sidebar|About Evidence Agent/ }).first().click();
  const inspector = page.getByRole("complementary", { name: "Today inspector" });
  await inspector.getByRole("button", { name: /Prepare a sourced post/ }).click();
  const dialog = page.getByRole("dialog", { name: "Prepare a sourced post" });
  await expect(dialog.locator(".inspector-detail-status")).toHaveText("Working");
  await dialog.getByRole("button", { name: /Searched the web/ }).first().click();
  await expect(dialog.getByRole("region", { name: "Selected work step" })).toContainText("Search source did not respond");
  await expect(dialog.getByRole("region", { name: "Selected work step" })).toContainText("grid financing");
  await dialog.getByRole("button", { name: /Read web page/ }).click();
  const evidence = dialog.getByRole("region", { name: "Selected work step" });
  await expect(evidence).toContainText("Inspected source text");
  await expect(evidence).toContainText("https://example.org/evidence");
  await expect(evidence).not.toContainText("must-not-render");
  await page.screenshot({ path: testInfo.outputPath("today-tool-result.png"), fullPage: true });
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(inspector).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("follow-up stays writable while a send is in flight and both turns persist in order", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Follow-up Agent");
  await page.getByRole("button", { name: "Meet my Agent" }).click();
  const composer = page.getByLabel("Message Follow-up Agent");
  await expect(composer).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route("**/api/state**", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.type === "sendPresenceNudge" && first) {
      first = false;
      await held;
    }
    await route.continue();
  });
  try {
    await composer.fill("First, tell me what you need to know.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sending message", exact: true })).toBeVisible();
    await expect(composer).toBeEnabled();
    await composer.fill("Also keep the wording simple.");
    await page.getByRole("button", { name: "Queue message", exact: true }).click();
    await expect(page.getByText("Also keep the wording simple.", { exact: true })).toBeVisible();
  } finally { release(); }
  await expect.poll(async () => {
    const saved = await (await request.get("/api/state?projection=chat")).json() as OpenPresenceState;
    return saved.operatorConversations?.flatMap(c => c.messages.filter(m => m.role === "operator").map(m => m.content));
  }).toEqual(["First, tell me what you need to know.", "Also keep the wording simple."]);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(page.getByText("Also keep the wording simple.", { exact: true })).toBeVisible();
});
