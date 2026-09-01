#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const sourceHash = crypto.createHash("sha256").update(repoRoot).digest("hex").slice(0, 10);

const routes = {
  activity: "/activity",
  live: "/activity",
  chat: "/chat",
  teach: "/teach",
  rehearsal: "/rehearsal",
  watching: "/watching",
  people: "/people",
  channels: "/settings",
  settings: "/settings",
  presence: "/settings",
  playground: "/playground",
  analytics: "/analytics",
  knowledge: "/knowledge",
  assets: "/assets",
  growth: "/growth",
  schedule: "/schedule",
  calendar: "/schedule",
  usage: "/usage",
  agent: "/agent",
  brain: "/agent",
  "manage-agent": "/agent",
  feed: "/feed",
};

const HELP = `verify-app — deterministic OpenPresence runtime verification harness

Usage:
  verify-app <command> [options]

Runtime:
  doctor                         Check ownership, dependencies, app health, and runtime identity
  info                           Print resolved runtime paths and current app status
  start                          Start an isolated test-mode OpenPresence server
  restart                        Stop and start the isolated server
  stop                           Stop only the server owned by this harness
  cleanup [--confirm]            Remove only this harness runtime directory

Browser inspection and control:
  open <surface|/path>            Navigate to a product surface
  route                          Print the current URL and route
  snapshot [--selector <css>]    Capture DOM, labels, route, and visible text
  screenshot [--path <file>]     Capture a PNG evidence artifact
  click --role <role> --name <n> Semantic click (also: aria-click, semantic-click)
  type --label <label> --text <t> Fill a labelled control (also placeholder/testid/css)
  press --key <key>               Press a keyboard key on a located control
  select --label <label> --value <v> Select a native option
  submit --role button --name <n> Submit through the visible UI
  upload --label <label> --path <file> Upload through a visible file input
  wait-for --text <t>             Wait for an observable condition
  wait-settle                      Wait for the app's current page to settle
  assert --text <t>               Assert a visible product state

Observability and state:
  state [--projection <name>]     Read the server's current persisted projection
  console                        Read captured browser console events
  errors                         Read captured page/network errors
  network-log                    Read captured request/response events
  network-summary                Summarize captured network events
  logs [--lines <n>]              Read isolated server logs
  perf-metrics [--runs <n>]       Measure repeatable navigation timing metrics

Fixtures and maintenance:
  reset-session                    Reset isolated test state through /api/state
  seed-state --scenario <file>    Run an existing sandbox scenario through the product CLI
  maintenance                     Check feature-map links and harness prerequisites

Common options:
  --url <url>                    Attach to an explicitly selected app URL
  --port <port>                  Override the derived isolated port when starting
  --headed                       Show the browser window
  --timeout <ms>                 Override an observable wait timeout
  --dry-run                      Show a destructive operation without changing state
  --confirm                      Confirm cleanup of this harness-owned runtime
  --json                         Explicitly request JSON (the default)
`;

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [name, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[name] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = true;
    }
  }
  return { positionals, options };
}

function numberOption(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = Number(options[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
  return value;
}

function config(options = {}) {
  const port = String(options.port ?? process.env.OPENPRESENCE_VERIFY_PORT ?? (3300 + (parseInt(sourceHash.slice(0, 4), 16) % 600)));
  const runtimeDir = path.resolve(process.env.OPENPRESENCE_VERIFY_DIR ?? path.join(os.tmpdir(), `openpresence-verify-${sourceHash}`));
  const requestedUrl = options.url ?? process.env.OPENPRESENCE_VERIFY_URL ?? process.env.OPENPRESENCE_URL;
  const url = requestedUrl ? String(requestedUrl).replace(/\/$/, "") : `http://127.0.0.1:${port}`;
  return {
    repoRoot,
    identity: `openpresence-${sourceHash}`,
    port,
    url,
    attached: Boolean(requestedUrl),
    runtimeDir,
    dbPath: path.join(runtimeDir, "openpresence.sqlite"),
    nextDistDir: path.join(runtimeDir, "next-dist"),
    browserDir: path.join(runtimeDir, "browser-profile"),
    evidenceDir: path.join(runtimeDir, "evidence"),
    serverLog: path.join(runtimeDir, "server.log"),
    eventLog: path.join(runtimeDir, "browser-events.ndjson"),
    pidPath: path.join(runtimeDir, "server.pid.json"),
    routePath: path.join(runtimeDir, "browser-route.json"),
  };
}

async function ensureRuntime(runtime) {
  await fsp.mkdir(runtime.runtimeDir, { recursive: true });
  await fsp.mkdir(runtime.evidenceDir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fsp.readFile(filePath, "utf8")); } catch { return fallback; }
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

async function requestJson(runtime, requestPath, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${runtime.url}${requestPath}`, { ...init, signal: controller.signal, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) throw new Error(`${requestPath} returned HTTP ${response.status}: ${typeof body === "string" ? body : body?.error ?? "request failed"}`);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function appStatus(runtime) {
  const status = { reachable: false, state: undefined, health: undefined, error: undefined };
  try {
    status.state = (await requestJson(runtime, "/api/state?read=verify-app")).body;
    status.health = (await requestJson(runtime, "/api/runtime/health")).body;
    status.reachable = true;
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }
  return status;
}

async function waitForApp(runtime, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    const status = await appStatus(runtime);
    if (status.reachable) return status;
    lastError = status.error ?? lastError;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`OpenPresence did not become ready at ${runtime.url}: ${lastError}`);
}

function startEnvironment(runtime) {
  return {
    ...process.env,
    OPENPRESENCE_PORT: runtime.port,
    OPENPRESENCE_DB_PATH: runtime.dbPath,
    OPENPRESENCE_NEXT_DIST_DIR: runtime.nextDistDir,
    OPENPRESENCE_TEST_MODE: "1",
    OPENPRESENCE_ALLOW_DATABASE_INIT: "1",
    OPENPRESENCE_AI_MOCK: "1",
    OPENPRESENCE_X_API_MOCK: "1",
    OPENPRESENCE_DISABLE_SCHEDULER: "1",
    OPENPRESENCE_DEFAULT_AGENT_NAME: "Jenny",
  };
}

async function readPid(runtime) {
  const value = await readJson(runtime.pidPath, undefined);
  return Number.isInteger(value?.pid) ? value : undefined;
}

async function start(runtime) {
  await ensureRuntime(runtime);
  const existing = await readPid(runtime);
  if (existing && processAlive(existing.pid)) {
    const status = await appStatus(runtime);
    if (status.reachable) return { ok: true, command: "start", reused: true, runtime, status };
    throw new Error(`Harness PID ${existing.pid} is alive but ${runtime.url} is not healthy. Inspect ${runtime.serverLog} before continuing.`);
  }
  await fsp.rm(runtime.nextDistDir, { recursive: true, force: true });
  // The launcher intentionally refuses an absent explicit database path. An
  // empty file is safe in test mode; the app initializes its schema in place.
  if (!fs.existsSync(runtime.dbPath)) await fsp.writeFile(runtime.dbPath, "", "utf8");
  const logFd = fs.openSync(runtime.serverLog, "a");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, ["dev"], {
    cwd: repoRoot,
    env: startEnvironment(runtime),
    detached: process.platform !== "win32",
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  await writeJson(runtime.pidPath, { pid: child.pid, startedAt: new Date().toISOString(), url: runtime.url, dbPath: runtime.dbPath, identity: runtime.identity });
  try {
    const status = await waitForApp(runtime);
    return { ok: true, command: "start", reused: false, runtime, status };
  } catch (error) {
    if (child.pid && processAlive(child.pid)) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    }
    throw error;
  }
}

async function stop(runtime) {
  const record = await readPid(runtime);
  if (!record || !processAlive(record.pid)) {
    await fsp.rm(runtime.pidPath, { force: true });
    return { ok: true, command: "stop", stopped: false, runtime };
  }
  try { process.kill(-record.pid, "SIGTERM"); } catch { try { process.kill(record.pid, "SIGTERM"); } catch { /* already gone */ } }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && processAlive(record.pid)) await new Promise((resolve) => setTimeout(resolve, 200));
  if (processAlive(record.pid)) throw new Error(`Could not stop harness PID ${record.pid}; inspect ${runtime.serverLog}.`);
  await fsp.rm(runtime.pidPath, { force: true });
  return { ok: true, command: "stop", stopped: true, runtime };
}

async function doctor(runtime) {
  const packageExists = fs.existsSync(packageJsonPath);
  const nodeModulesExists = fs.existsSync(path.join(repoRoot, "node_modules"));
  const record = await readPid(runtime);
  const status = await appStatus(runtime);
  const ownedProcess = Boolean(record && processAlive(record.pid));
  const result = {
    ok: packageExists && nodeModulesExists && status.reachable && (!runtime.attached || Boolean(process.env.OPENPRESENCE_VERIFY_ALLOW_EXTERNAL)),
    command: "doctor",
    identity: runtime.identity,
    repoRoot,
    attached: runtime.attached,
    ownership: { pid: record?.pid ?? null, processAlive: ownedProcess, serverLog: runtime.serverLog },
    runtime: { url: runtime.url, port: runtime.port, dbPath: runtime.dbPath, nextDistDir: runtime.nextDistDir, browserDir: runtime.browserDir, evidenceDir: runtime.evidenceDir },
    prerequisites: { packageJson: packageExists, nodeModules: nodeModulesExists, node: process.version },
    app: { reachable: status.reachable, workspaceRevision: status.state?.workspaceRevision ?? null, responseProjection: status.state?.responseProjection ?? null, scheduler: status.health?.scheduler ?? null, error: status.error ?? null },
    notes: runtime.attached && !process.env.OPENPRESENCE_VERIFY_ALLOW_EXTERNAL ? ["This URL was supplied externally; use the harness-owned server or set OPENPRESENCE_VERIFY_ALLOW_EXTERNAL=1 explicitly."] : [],
  };
  if (!result.ok) throw Object.assign(new Error("verify-app doctor found an unsafe or unhealthy verification target."), { result });
  return result;
}

async function info(runtime) {
  const record = await readPid(runtime);
  const status = await appStatus(runtime);
  return { ok: true, command: "info", identity: runtime.identity, runtime, ownership: { pid: record?.pid ?? null, processAlive: Boolean(record && processAlive(record.pid)) }, app: { reachable: status.reachable, workspaceRevision: status.state?.workspaceRevision ?? null, responseProjection: status.state?.responseProjection ?? null, error: status.error ?? null } };
}

async function currentRoute(runtime) {
  const saved = await readJson(runtime.routePath, { route: "/" });
  return typeof saved?.route === "string" ? saved.route : "/";
}

async function saveRoute(runtime, url) {
  const parsed = new URL(url);
  const route = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  await writeJson(runtime.routePath, { route, updatedAt: new Date().toISOString() });
  return route;
}

function destination(value) {
  if (!value) throw new Error("Missing destination. Use a surface name or /path.");
  const key = String(value).toLowerCase();
  if (routes[key]) return routes[key];
  if (value.startsWith("/")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  throw new Error(`Unknown surface '${value}'. Known surfaces: ${Object.keys(routes).join(", ")}.`);
}

function getLocator(page, options, defaultRole = "button") {
  if (options.selector || options.css) return page.locator(options.selector ?? options.css);
  if (options.testid) return page.getByTestId(String(options.testid));
  if (options.label) return page.getByLabel(String(options.label), { exact: options.exact === true });
  if (options.placeholder) return page.getByPlaceholder(String(options.placeholder), { exact: options.exact === true });
  if (options.role || options.name) return page.getByRole(String(options.role ?? defaultRole), { name: String(options.name ?? ""), exact: options.exact === true });
  if (options.text) return page.getByText(String(options.text), { exact: options.exact === true });
  throw new Error("Locate the control with --role/--name, --label, --placeholder, --testid, --text, or --selector.");
}

async function collectEvents(runtime, events) {
  if (!events.length) return;
  await fsp.appendFile(runtime.eventLog, events.map((event) => `${JSON.stringify({ ...event, harnessIdentity: runtime.identity, capturedAt: new Date().toISOString() })}\n`).join(""));
}

async function withPage(runtime, options, operation) {
  await ensureRuntime(runtime);
  const headed = options.headed === true;
  const context = await chromium.launchPersistentContext(runtime.browserDir, { headless: !headed, viewport: { width: 1440, height: 1000 } });
  const page = context.pages()[0] ?? await context.newPage();
  const events = [];
  page.on("console", (message) => events.push({ kind: "console", level: message.type(), text: message.text(), url: page.url() }));
  page.on("pageerror", (error) => events.push({ kind: "pageerror", level: "error", text: error.message, url: page.url() }));
  page.on("requestfailed", (request) => events.push({ kind: "requestfailed", level: "error", method: request.method(), url: request.url(), text: request.failure()?.errorText ?? "request failed" }));
  page.on("response", (response) => { if (response.status() >= 400) events.push({ kind: "response", level: "error", status: response.status(), method: response.request().method(), url: response.url() }); });
  try {
    const savedRoute = await currentRoute(runtime);
    if (options.navigate !== false) {
      const target = options.route ?? savedRoute;
      await page.goto(target.startsWith("http") ? target : `${runtime.url}${target}`, { waitUntil: "domcontentloaded", timeout: numberOption(options, "timeout", 30_000) });
      await waitForSettle(page, options);
    }
    const result = await operation(page);
    await saveRoute(runtime, page.url());
    await collectEvents(runtime, events);
    return result;
  } finally {
    await context.close();
  }
}

async function waitForSettle(page, options = {}) {
  const timeout = numberOption(options, "timeout", 30_000);
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);
  await page.waitForFunction(() => document.readyState === "complete", undefined, { timeout }).catch(() => undefined);
  await page.locator("main").first().waitFor({ state: "visible", timeout }).catch(() => undefined);
  await page.getByText(/Waking (your )?Presence…/, { exact: false }).waitFor({ state: "hidden", timeout }).catch(() => undefined);
}

async function domSnapshot(page, selector) {
  return page.evaluate((requestedSelector) => {
    const root = requestedSelector ? document.querySelector(requestedSelector) : document.body;
    if (!root) return { missingSelector: requestedSelector };
    const elements = Array.from(root.querySelectorAll("button,a,input,textarea,select,[role],[aria-label],[data-testid],h1,h2,h3"))
      .slice(0, 400)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role"),
        label: node.getAttribute("aria-label"),
        testid: node.getAttribute("data-testid"),
        text: (node.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 240),
        value: "value" in node ? String(node.value ?? "").slice(0, 240) : undefined,
        disabled: "disabled" in node ? Boolean(node.disabled) : undefined,
      }));
    return { title: document.title, bodyText: (root.innerText ?? "").slice(0, 20_000), elements };
  }, selector);
}

async function browserSnapshot(runtime, options) {
  return withPage(runtime, options, async (page) => ({ ok: true, command: "snapshot", url: page.url(), snapshot: await domSnapshot(page, options.selector) }));
}

async function browserOpen(runtime, options, value) {
  const route = destination(value);
  return withPage(runtime, { ...options, route }, async (page) => ({ ok: true, command: "open", route: await saveRoute(runtime, page.url()), title: await page.title(), heading: await page.locator("h1,h2").first().textContent().catch(() => null) }));
}

async function browserAction(runtime, options, command) {
  return withPage(runtime, options, async (page) => {
    const locatorOptions = command === "type" ? { ...options, text: undefined } : options;
    const locator = getLocator(page, locatorOptions, command === "submit" ? "button" : "button");
    const expectedMutation = command === "submit" || (command === "click" || command === "aria-click" || command === "semantic-click")
      && /create|save|send|queue|add|submit|confirm|review|run|pause|resume|remove|delete|connect|enable|disable|start|reset|approve|rehearse/i.test(String(options.name ?? options.label ?? options.text ?? ""));
    const mutationResponse = expectedMutation
      ? page.waitForResponse((response) => response.url().includes("/api/state") && response.request().method() === "POST", { timeout: numberOption(options, "timeout", 30_000) }).catch(() => undefined)
      : undefined;
    if (command === "click" || command === "aria-click" || command === "semantic-click") await locator.click();
    else if (command === "type") await locator.fill(String(options.text ?? options.value ?? options.content ?? ""));
    else if (command === "press") await locator.press(String(options.key ?? options.value ?? "Enter"));
    else if (command === "select") await locator.selectOption(String(options.value));
    else if (command === "submit") await locator.click();
    else if (command === "upload") await locator.setInputFiles(path.resolve(String(options.path)));
    else throw new Error(`Unsupported browser action: ${command}`);
    if (mutationResponse) await mutationResponse;
    await waitForSettle(page, options);
    return { ok: true, command, url: page.url(), locator: { selector: options.selector ?? options.css, role: options.role, name: options.name, label: options.label, text: options.text }, visibleText: (await page.locator("body").innerText()).slice(0, 8_000) };
  });
}

async function browserWait(runtime, options) {
  return withPage(runtime, options, async (page) => {
    const timeout = numberOption(options, "timeout", 30_000);
    if (options.url) await page.waitForURL((url) => url.toString().includes(String(options.url)), { timeout });
    else if (options.text) await page.getByText(String(options.text), { exact: options.exact === true }).waitFor({ state: options.hidden ? "hidden" : "visible", timeout });
    else await getLocator(page, options).waitFor({ state: options.hidden ? "hidden" : "visible", timeout });
    return { ok: true, command: "wait-for", url: page.url(), condition: { url: options.url, text: options.text, selector: options.selector, role: options.role, name: options.name, hidden: options.hidden === true } };
  });
}

async function browserAssert(runtime, options) {
  return withPage(runtime, options, async (page) => {
    const assertions = [];
    if (options.url) {
      const actual = page.url();
      if (!actual.includes(String(options.url))) throw new Error(`URL assertion failed: expected '${actual}' to include '${options.url}'.`);
      assertions.push({ kind: "url", value: actual });
    }
    if (options.text || options["not-text"]) {
      const body = await page.locator("body").innerText();
      if (options.text && !body.includes(String(options.text))) throw new Error(`Text assertion failed: page does not contain '${options.text}'.`);
      if (options["not-text"] && body.includes(String(options["not-text"])) ) throw new Error(`Negative text assertion failed: page contains '${options["not-text"]}'.`);
      assertions.push({ kind: "body-text", contains: options.text ?? null, excludes: options["not-text"] ?? null });
    }
    if (options.selector || options.css || options.label || options.placeholder || options.testid || options.role || options.name) {
      const locator = getLocator(page, options);
      const count = await locator.count();
      const expectedCount = options.count === undefined ? 1 : Number(options.count);
      if (count !== expectedCount) throw new Error(`Locator assertion failed: expected ${expectedCount} match(es), found ${count}.`);
      if (options.visible !== false && count > 0 && !(await locator.first().isVisible())) throw new Error("Locator assertion failed: first match is not visible.");
      if (options.attribute) {
        const actual = await locator.first().getAttribute(String(options.attribute));
        if (actual !== String(options.value ?? "")) throw new Error(`Attribute assertion failed: ${options.attribute}='${actual}', expected '${options.value}'.`);
      }
      assertions.push({ kind: "locator", count, selector: options.selector ?? options.css, role: options.role, name: options.name, label: options.label });
    }
    if (!assertions.length) throw new Error("Provide --url, --text, --not-text, or a locator to assert.");
    return { ok: true, command: "assert", url: page.url(), assertions };
  });
}

async function screenshot(runtime, options) {
  return withPage(runtime, options, async (page) => {
    const requested = options.path ? path.resolve(String(options.path)) : path.join(runtime.evidenceDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${(await saveRoute(runtime, page.url())).replace(/[^a-z0-9]+/gi, "-") || "home"}.png`);
    await fsp.mkdir(path.dirname(requested), { recursive: true });
    await page.screenshot({ path: requested, fullPage: options["full-page"] === true });
    return { ok: true, command: "screenshot", path: requested, url: page.url(), fullPage: options["full-page"] === true };
  });
}

async function readLines(filePath, lines) {
  try {
    const contents = await fsp.readFile(filePath, "utf8");
    return contents.split(/\r?\n/).filter(Boolean).slice(-lines);
  } catch { return []; }
}

async function readEvents(runtime, filter) {
  const lines = await readLines(runtime.eventLog, 2_000);
  const events = lines.flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  return filter ? events.filter(filter) : events;
}

async function perfMetrics(runtime, options) {
  const runs = Math.max(1, Math.floor(numberOption(options, "runs", 3)));
  const route = options.route ?? await currentRoute(runtime);
  const metrics = await withPage(runtime, { ...options, route }, async (page) => {
    const values = [];
    for (let index = 0; index < runs; index += 1) {
      await page.goto(route.startsWith("http") ? route : `${runtime.url}${route}`, { waitUntil: "load", timeout: numberOption(options, "timeout", 30_000) });
      await waitForSettle(page, options);
      values.push(await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
        return { url: location.href, domContentLoaded: navigation?.domContentLoadedEventEnd ?? null, loadEventEnd: navigation?.loadEventEnd ?? null, responseEnd: navigation?.responseEnd ?? null, firstPaint: paints["first-paint"] ?? null, firstContentfulPaint: paints["first-contentful-paint"] ?? null };
      }));
    }
    return values;
  });
  return { ok: true, command: "perf-metrics", route, runs, metrics };
}

async function resetSession(runtime) {
  if (runtime.attached) throw new Error("reset-session is restricted to a harness-owned isolated runtime. Start verify-app first or omit --url.");
  const result = await requestJson(runtime, "/api/state", { method: "POST", body: JSON.stringify({ type: "reset" }) });
  await writeJson(runtime.routePath, { route: "/", updatedAt: new Date().toISOString() });
  return { ok: true, command: "reset-session", workspaceRevision: result.body?.workspaceRevision ?? null, activeAgentId: result.body?.activeAgentId ?? null, activePresenceId: result.body?.activePresenceId ?? null };
}

async function seedState(runtime, options) {
  const scenario = options.scenario;
  if (!scenario) throw new Error("seed-state requires --scenario <file>.");
  const scenarioPath = path.resolve(String(scenario));
  if (!fs.existsSync(scenarioPath)) throw new Error(`Scenario file does not exist: ${scenarioPath}`);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const { stdout, stderr } = await execFileAsync(pnpm, ["--silent", "openpresence", "playground", "run", scenarioPath, "--url", runtime.url], { cwd: repoRoot, env: startEnvironment(runtime), maxBuffer: 10 * 1024 * 1024 });
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { parsed = { raw: stdout.trim() }; }
  return { ok: true, command: "seed-state", scenario: scenarioPath, result: parsed, stderr: stderr.trim() || undefined };
}

async function maintenance(runtime) {
  const featureRoot = path.join(scriptDir, "../references/features");
  const readme = path.join(featureRoot, "README.md");
  const content = await fsp.readFile(readme, "utf8");
  const links = [...content.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]).filter((value) => !value.startsWith("http"));
  const missing = links.filter((link) => !fs.existsSync(path.join(featureRoot, link)));
  const scriptExecutable = (await fsp.stat(path.join(scriptDir, "verify-app.mjs"))).mode & 0o111;
  const result = { ok: missing.length === 0 && Boolean(scriptExecutable), command: "maintenance", featureMap: { readme, linkedFiles: links, missing }, harness: { scriptExecutable: Boolean(scriptExecutable), runtimeDir: runtime.runtimeDir } };
  if (!result.ok) throw Object.assign(new Error("verify-app maintenance found drift."), { result });
  return result;
}

async function cleanup(runtime, options) {
  const exists = fs.existsSync(runtime.runtimeDir);
  const result = { ok: true, command: "cleanup", dryRun: options["dry-run"] === true || options.confirm !== true, runtimeDir: runtime.runtimeDir, exists };
  if (result.dryRun || !exists) return result;
  await stop(runtime);
  await fsp.rm(runtime.runtimeDir, { recursive: true, force: true });
  return { ...result, dryRun: false, removed: true };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const command = positionals[0] ?? "help";
  if (command === "help" || command === "--help" || options.help) {
    process.stdout.write(HELP);
    return;
  }
  const runtime = config(options);
  let result;
  if (command === "doctor") result = await doctor(runtime);
  else if (command === "info") result = await info(runtime);
  else if (command === "start") result = await start(runtime);
  else if (command === "restart") { await stop(runtime); result = await start(runtime); result.command = "restart"; }
  else if (command === "stop") result = await stop(runtime);
  else if (command === "cleanup") result = await cleanup(runtime, options);
  else if (command === "open") result = await browserOpen(runtime, options, positionals[1]);
  else if (command === "route") result = { ok: true, command: "route", route: await currentRoute(runtime), url: runtime.url };
  else if (command === "snapshot") result = await browserSnapshot(runtime, options);
  else if (command === "screenshot") result = await screenshot(runtime, options);
  else if (["click", "aria-click", "semantic-click", "type", "press", "select", "submit", "upload"].includes(command)) result = await browserAction(runtime, options, command);
  else if (command === "wait-for") result = await browserWait(runtime, options);
  else if (command === "wait-settle") result = await withPage(runtime, options, async (page) => { await waitForSettle(page, options); return { ok: true, command, url: page.url() }; });
  else if (command === "assert") result = await browserAssert(runtime, options);
  else if (command === "state") result = { ok: true, command: "state", projection: options.projection ?? "full", ...(await requestJson(runtime, `/api/state${options.projection ? `?projection=${encodeURIComponent(options.projection)}` : "?read=verify-app"}`)).body };
  else if (command === "console") result = { ok: true, command, events: await readEvents(runtime, (event) => event.kind === "console") };
  else if (command === "errors") result = { ok: true, command, events: await readEvents(runtime, (event) => event.level === "error" || event.kind === "pageerror" || event.kind === "requestfailed") };
  else if (command === "network-log") result = { ok: true, command, events: await readEvents(runtime, (event) => ["requestfailed", "response"].includes(event.kind)) };
  else if (command === "network-summary") {
    const events = await readEvents(runtime, (event) => ["requestfailed", "response"].includes(event.kind));
    const byStatus = Object.fromEntries(Object.entries(Object.groupBy(events, (event) => String(event.status ?? event.kind))).map(([key, items]) => [key, items.length]));
    result = { ok: true, command, total: events.length, byStatus };
  }
  else if (command === "logs") result = { ok: true, command, path: runtime.serverLog, lines: await readLines(runtime.serverLog, Math.floor(numberOption(options, "lines", 120))) };
  else if (command === "perf-metrics") result = await perfMetrics(runtime, options);
  else if (command === "reset-session") result = await resetSession(runtime);
  else if (command === "seed-state") result = await seedState(runtime, options);
  else if (command === "maintenance") result = await maintenance(runtime);
  else throw new Error(`Unknown command '${command}'. Run verify-app help.`);
  output(result);
}

main().catch((error) => {
  const failure = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (error?.result) failure.result = error.result;
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
});
