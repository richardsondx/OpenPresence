import fs from "node:fs";
import process from "node:process";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.OPENPRESENCE_BASE_URL || "http://localhost:3015").replace(/\/$/, "");
const bridgeKey = process.env.OPENPRESENCE_BRIDGE_KEY;
const executorId = process.env.BRIDGE_EXECUTOR_ID || "x-browser-bridge";
const discoveryUrl = process.env.X_BROWSER_DISCOVERY_URL || "https://x.com/home";
const expectedHandle = (process.env.X_EXPECTED_HANDLE || "").replace(/^@/, "").toLowerCase();
const pollMs = Number(process.env.BRIDGE_POLL_MS || 5_000);
const observeMs = Number(process.env.X_BROWSER_OBSERVE_MS || 30_000);
const profileDir = process.env.X_BROWSER_PROFILE_DIR;
const cdpUrl = process.env.X_BROWSER_CDP_URL;

if (!bridgeKey) throw new Error("OPENPRESENCE_BRIDGE_KEY is required.");
if (!cdpUrl && !profileDir) throw new Error("Set X_BROWSER_CDP_URL or X_BROWSER_PROFILE_DIR.");
if (profileDir) fs.mkdirSync(profileDir, { recursive: true });

const headers = { authorization: `Bearer ${bridgeKey}`, "content-type": "application/json" };

async function request(path, body, method = "POST") {
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${parsed.error || text.slice(0, 240)}`);
  return parsed;
}

async function heartbeat() {
  await request("/api/bridge/v1/heartbeat", { executorId });
}

function firstStatusId(hrefs, excludedId) {
  for (const href of hrefs) {
    const match = href?.match(/\/status\/(\d+)/);
    if (match && match[1] !== excludedId) return match[1];
  }
  return undefined;
}

async function visible(locator) {
  try { return await locator.isVisible(); } catch { return false; }
}

async function signedIn(page) {
  if (await page.getByText(/log in|sign up/i).first().isVisible().catch(() => false)) return false;
  if (!expectedHandle) return true;
  const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  return body.includes(`@${expectedHandle}`) || body.includes(expectedHandle);
}

async function observeX(page) {
  await page.goto(discoveryUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
  await page.waitForTimeout(1_500);
  const articles = page.locator('article[data-testid="tweet"], article');
  const count = Math.min(await articles.count(), 40);
  const objects = [];
  for (let index = 0; index < count; index += 1) {
    const article = articles.nth(index);
    const hrefs = await article.locator('a[href*="/status/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))).catch(() => []);
    const id = firstStatusId(hrefs, undefined);
    const text = (await article.innerText().catch(() => "")).trim();
    if (!id || text.length < 3) continue;
    const authorHandle = await article.locator('[data-testid="User-Name"] a').first().getAttribute("href").catch(() => undefined);
    objects.push({
      externalRef: { type: "x.post", id },
      objectType: "post",
      author: { displayName: authorHandle ? authorHandle.replace(/^\//, "@") : "X user", handle: authorHandle?.replace(/^\//, "") },
      content: { text },
      occurredAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
    });
  }
  if (objects.length) {
    await request("/api/bridge/v1/events", { events: objects.map((object) => ({ sourceEventId: `x-browser:${object.externalRef.id}`, event: "created", object })) });
  }
  return objects.length;
}

async function publicationText(execution) {
  const expression = execution.publication?.publicExpression?.text;
  if (typeof expression === "string" && expression.trim()) return expression.trim();
  const payload = execution.publication?.payload;
  if (payload && typeof payload === "object" && typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
  throw new Error("The claimed execution did not contain a public text expression.");
}

async function clickFirstVisible(locators) {
  for (const locator of locators) {
    if (await visible(locator)) { await locator.click(); return true; }
  }
  return false;
}

async function fillReply(page, targetId, text) {
  await page.goto(`https://x.com/i/web/status/${targetId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
  await page.waitForTimeout(1_000);
  const targetArticle = page.locator('article').filter({ has: page.locator(`a[href*="/status/${targetId}"]`) }).first();
  const opened = await clickFirstVisible([
    targetArticle.getByTestId("reply"),
    targetArticle.getByRole("button", { name: /reply/i }).first(),
  ]);
  if (!opened) throw new Error("The target post did not expose a direct Reply control.");
  const composer = page.locator('[data-testid="tweetTextarea_0"]').last();
  const fallbackComposer = page.getByRole("textbox", { name: /post text/i }).last();
  if (!(await clickFirstVisible([composer, fallbackComposer]))) throw new Error("X did not open a reply composer.");
  await (await visible(composer) ? composer : fallbackComposer).fill(text);
  const submitted = await clickFirstVisible([
    page.locator('[data-testid="tweetButtonInline"]').last(),
    page.getByRole("button", { name: "Reply", exact: true }).last(),
  ]);
  if (!submitted) throw new Error("X did not expose the direct Reply submit control.");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(750);
    const matching = page.locator("article").filter({ hasText: text.slice(0, Math.min(80, text.length)) });
    if (await matching.count()) {
      const hrefs = await matching.last().locator('a[href*="/status/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))).catch(() => []);
      const id = firstStatusId(hrefs, targetId);
      if (id) return id;
    }
  }
  throw new Error("The reply control was submitted, but the new X post could not be verified in the thread.");
}

async function deliver(page, execution) {
  const text = await publicationText(execution);
  if (execution.affordance === "x.reply") {
    if (execution.target?.type !== "x.post") throw new Error("An X reply execution is missing its x.post target.");
    const id = await fillReply(page, execution.target.id, text);
    return { type: "x.post", id };
  }
  throw new Error(`The X Browser Bridge currently supports direct x.reply delivery only, not ${execution.affordance}.`);
}

async function fail(execution, error) {
  await request(`/api/bridge/v1/executions/${execution.id}/fail`, { executorId, code: "BROWSER_DELIVERY_FAILED", message: error instanceof Error ? error.message : String(error), retryable: false });
}

async function main() {
  const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : undefined;
  const context = browser?.contexts()[0] ?? await chromium.launchPersistentContext(profileDir, { headless: false });
  const page = context.pages()[0] ?? await context.newPage();
  let lastObservation = 0;
  let lastHeartbeat = 0;
  console.log(`X Browser Bridge ${executorId} connected. OpenPresence: ${baseUrl}`);
  while (true) {
    const now = Date.now();
    if (now - lastHeartbeat >= 45_000) { await heartbeat(); lastHeartbeat = now; }
    if (now - lastObservation >= observeMs) {
      try { const count = await observeX(page); if (count) console.log(`Observed ${count} X post(s).`); }
      catch (error) { console.warn(error instanceof Error ? error.message : String(error)); }
      lastObservation = Date.now();
    }
    const result = await request("/api/bridge/v1/executions/claim", { executorId, limit: 5 });
    for (const execution of result.executions ?? []) {
      try {
        const externalRef = await deliver(page, execution);
        await request(`/api/bridge/v1/executions/${execution.id}/ack`, { executorId, externalRef, observedAt: new Date().toISOString() });
        console.log(`Verified ${execution.affordance} ${externalRef.type}:${externalRef.id}.`);
      } catch (error) {
        console.warn(`Execution ${execution.id} failed:`, error instanceof Error ? error.message : String(error));
        await fail(execution, error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
