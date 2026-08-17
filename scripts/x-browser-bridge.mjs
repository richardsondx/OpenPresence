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

function parseHumanMetric(raw) {
  const match = String(raw || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)([KMB])?/i);
  if (!match) return undefined;
  const multiplier = match[2]?.toUpperCase() === "K" ? 1_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "B" ? 1_000_000_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function metricFromLabels(labels, name) {
  const pattern = new RegExp(`([\\d,.]+(?:[KMB])?)\\s+${name}`, "i");
  for (const label of labels) {
    const match = String(label).match(pattern);
    const value = parseHumanMetric(match?.[1]);
    if (value !== undefined) return value;
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
  const objects = [];
  for (const url of [discoveryUrl, "https://x.com/notifications/mentions"]) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
    await page.waitForTimeout(1_500);
    const articles = page.locator('article[data-testid="tweet"], article');
    const count = Math.min(await articles.count(), 40);
    for (let index = 0; index < count; index += 1) {
      const article = articles.nth(index);
      const hrefs = await article.locator('a[href*="/status/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))).catch(() => []);
      const id = firstStatusId(hrefs, undefined);
      const text = (await article.innerText().catch(() => "")).trim();
      if (!id || text.length < 3 || objects.some((item) => item.externalRef.id === id)) continue;
      const authorHandle = await article.locator('[data-testid="User-Name"] a').first().getAttribute("href").catch(() => undefined);
      const handle = authorHandle?.replace(/^\//, "");
      objects.push({
        externalRef: { type: "x.post", id },
        objectType: "post",
        author: { externalRef: handle ? { type: "x.user", id: handle } : undefined, displayName: handle ? `@${handle}` : "X user", handle },
        content: { text },
        occurredAt: new Date().toISOString(),
        visibility: "public",
        shareability: "presence-only",
      });
    }
  }
  if (objects.length) {
    await request("/api/bridge/v1/events", { events: objects.map((object) => ({ sourceEventId: `x-browser:${object.externalRef.id}`, event: "created", object })) });
  }
  return objects.length;
}

async function reportXMetrics(page) {
  if (!expectedHandle) return;
  await page.goto(`https://x.com/${encodeURIComponent(expectedHandle)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle}.`);
  await page.waitForTimeout(1_000);
  const followerText = await page.locator(`a[href*="/${expectedHandle}/followers"]`).first().innerText().catch(() => "");
  const followingText = await page.locator(`a[href*="/${expectedHandle}/following"]`).first().innerText().catch(() => "");
  const followers = parseHumanMetric(followerText);
  const following = parseHumanMetric(followingText);
  const publications = [];
  const articles = page.locator('article[data-testid="tweet"], article');
  const count = Math.min(await articles.count(), 40);
  for (let index = 0; index < count; index += 1) {
    const article = articles.nth(index);
    const hrefs = await article.locator('a[href*="/status/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))).catch(() => []);
    const id = firstStatusId(hrefs, undefined);
    if (!id) continue;
    const labels = await article.locator('button,[role="button"]').evaluateAll((buttons) => buttons.flatMap((button) => [button.getAttribute("aria-label"), button.textContent]).filter(Boolean)).catch(() => []);
    const metrics = {
      impressions: metricFromLabels(labels, "(?:views|impressions)"),
      likes: metricFromLabels(labels, "likes?"),
      replies: metricFromLabels(labels, "(?:reply|replies)"),
      reposts: metricFromLabels(labels, "(?:reposts?|retweets?)"),
      quotes: metricFromLabels(labels, "quotes?"),
    };
    const observed = Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== undefined));
    const time = await article.locator("time").first().getAttribute("datetime").catch(() => undefined);
    if (!Object.keys(observed).length) continue;
    publications.push({ externalRef: { type: "x.post", id }, publicationAgeSeconds: time ? Math.max(0, Math.floor((Date.now() - new Date(time).getTime()) / 1000)) : 0, metrics: observed });
  }
  if (followers === undefined && following === undefined && !publications.length) return;
  await request("/api/bridge/v1/metrics", { audience: followers === undefined ? undefined : { followers, following, observedAt: new Date().toISOString() }, publications });
}

async function publicationText(execution) {
  const expression = execution.publication?.publicExpression?.text;
  if (typeof expression === "string" && expression.trim()) return expression.trim();
  const payload = execution.publication?.payload;
  if (payload && typeof payload === "object" && typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
  throw new Error("The claimed execution did not contain a public text expression.");
}

async function publicationAssets(execution) {
  const ids = execution.publication?.assetIds ?? [];
  return Promise.all(ids.map(async (id, index) => {
    const response = await fetch(`${baseUrl}/api/assets/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${bridgeKey}` } });
    if (!response.ok) throw new Error(`Asset ${id} could not be retrieved for browser delivery.`);
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    return { name: `${id}-${index}`, mimeType, buffer: Buffer.from(await response.arrayBuffer()) };
  }));
}

async function attachAssets(page, assets) {
  if (!assets.length) return;
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count())) throw new Error("X did not expose a media upload control.");
  await fileInput.setInputFiles(assets);
}

async function clickFirstVisible(locators) {
  for (const locator of locators) {
    if (await visible(locator)) { await locator.click(); return true; }
  }
  return false;
}

async function fillReply(page, targetId, text, assets = []) {
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
  await attachAssets(page, assets);
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

async function fillComposer(page, text, assets = []) {
  const composer = page.locator('[data-testid="tweetTextarea_0"]').last();
  const fallbackComposer = page.getByRole("textbox", { name: /post text/i }).last();
  const target = await visible(composer) ? composer : fallbackComposer;
  if (!(await visible(target))) throw new Error("X did not expose a post composer.");
  await target.fill(text);
  await attachAssets(page, assets);
  const submitted = await clickFirstVisible([
    page.locator('[data-testid="tweetButtonInline"]').last(),
    page.locator('[data-testid="tweetButton"]').last(),
    page.getByRole("button", { name: /post/i }).last(),
  ]);
  if (!submitted) throw new Error("X did not expose the post submit control.");
}

async function findCreatedPostId(page, text, excludedId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(750);
    const matching = page.locator("article").filter({ hasText: text.slice(0, Math.min(80, text.length)) });
    if (await matching.count()) {
      const hrefs = await matching.last().locator('a[href*="/status/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))).catch(() => []);
      const id = firstStatusId(hrefs, excludedId);
      if (id) return id;
    }
  }
  throw new Error("X accepted the action, but the resulting post could not be verified.");
}

async function openTargetPost(page, targetId) {
  await page.goto(`https://x.com/i/web/status/${targetId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
  await page.waitForTimeout(1_000);
  const targetArticle = page.locator('article').filter({ has: page.locator(`a[href*="/status/${targetId}"]`) }).first();
  if (!(await visible(targetArticle))) throw new Error("X did not expose the target post.");
  return targetArticle;
}

async function clickPostControl(page, targetId, testId, label) {
  const article = await openTargetPost(page, targetId);
  const control = article.getByTestId(testId);
  if (!(await clickFirstVisible([control, article.getByRole("button", { name: new RegExp(label, "i") }).first()]))) throw new Error(`The target post did not expose a ${label} control.`);
  return article;
}

async function deliverOriginalPost(page, text, assets) {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
  await page.waitForTimeout(1_000);
  await clickFirstVisible([page.locator('[data-testid="tweetTextarea_0"]').first(), page.getByRole("textbox", { name: /post text/i }).first()]);
  await fillComposer(page, text, assets);
  return findCreatedPostId(page, text);
}

async function deliverLike(page, targetId) {
  const article = await clickPostControl(page, targetId, "like", "like");
  const control = article.getByTestId("unlike");
  if (!(await visible(control))) throw new Error("X did not verify the post as liked.");
  return targetId;
}

async function deliverRepost(page, targetId) {
  const article = await clickPostControl(page, targetId, "retweet", "repost");
  const menuItem = page.getByRole("menuitem", { name: /repost/i }).first();
  if (await visible(menuItem)) await menuItem.click();
  else if (await visible(page.getByText(/^Repost$/i).last())) await page.getByText(/^Repost$/i).last().click();
  await page.waitForTimeout(750);
  if (!(await visible(article.getByTestId("unretweet")))) throw new Error("X did not verify the post as reposted.");
  return targetId;
}

async function deliverQuote(page, targetId, text, assets) {
  const article = await openTargetPost(page, targetId);
  if (!(await clickFirstVisible([article.getByTestId("retweet"), article.getByRole("button", { name: /repost/i }).first()]))) throw new Error("The target post did not expose a repost control for quoting.");
  const quote = page.getByRole("menuitem", { name: /quote/i }).first();
  if (await visible(quote)) await quote.click();
  else if (await visible(page.getByText(/quote/i).last())) await page.getByText(/quote/i).last().click();
  await page.waitForTimeout(750);
  await fillComposer(page, text, assets);
  return findCreatedPostId(page, text, targetId);
}

async function deliverFollow(page, targetId) {
  const targetUrl = /^\d+$/.test(targetId) ? `https://x.com/i/user/${targetId}` : `https://x.com/${targetId.replace(/^@/, "")}`;
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!(await signedIn(page))) throw new Error(`The X browser session is not signed in as @${expectedHandle || "the expected account"}.`);
  await page.waitForTimeout(1_000);
  const follow = page.getByRole("button", { name: /^follow$/i }).first();
  if (!(await clickFirstVisible([follow]))) throw new Error("X did not expose a Follow control for the target user.");
  await page.waitForTimeout(750);
  if (!(await visible(page.getByRole("button", { name: /following/i }).first()))) throw new Error("X did not verify the relationship as Following.");
  return targetId;
}

async function deliver(page, execution) {
  const text = execution.publication ? await publicationText(execution) : "";
  const assets = await publicationAssets(execution);
  if (execution.affordance === "x.post") {
    const id = await deliverOriginalPost(page, text, assets);
    return { type: "x.post", id };
  }
  if (execution.affordance === "x.reply") {
    if (execution.target?.type !== "x.post") throw new Error("An X reply execution is missing its x.post target.");
    const id = await fillReply(page, execution.target.id, text, assets);
    return { type: "x.post", id };
  }
  if (execution.affordance === "x.like" || execution.affordance === "x.repost" || execution.affordance === "x.quote") {
    if (execution.target?.type !== "x.post") throw new Error(`${execution.affordance} is missing its x.post target.`);
    const id = execution.affordance === "x.like" ? await deliverLike(page, execution.target.id) : execution.affordance === "x.repost" ? await deliverRepost(page, execution.target.id) : await deliverQuote(page, execution.target.id, text, assets);
    return { type: execution.affordance, id };
  }
  if (execution.affordance === "x.follow") {
    if (execution.target?.type !== "x.user") throw new Error("An X follow execution is missing its x.user target.");
    return { type: "x.follow", id: await deliverFollow(page, execution.target.id) };
  }
  throw new Error(`The X Browser Bridge does not support ${execution.affordance}.`);
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
      try { await reportXMetrics(page); console.log("Reported X audience and publication metrics."); }
      catch (error) { console.warn("X metrics unavailable:", error instanceof Error ? error.message : String(error)); }
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
