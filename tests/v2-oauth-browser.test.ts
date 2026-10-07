import { expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";

it.each([false, true])("completes real browser OAuth consent with cross-origin callback=%s", async (crossOrigin) => {
  const dir = mkdtempSync(join(tmpdir(), "v2-browser-consent-"));
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`, key = "browser-disposable-connection-key-0000000000";
  const callbackServer = createHttpServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Agent callback</title><p>Callback received.</p>"); });
  await new Promise<void>(resolve => callbackServer.listen(0, "127.0.0.1", resolve));
  const callbackOrigin = crossOrigin ? `http://127.0.0.1:${(callbackServer.address() as { port: number }).port}` : origin;
  const redirectUri = `${callbackOrigin}/callback`;
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/v2-http.ts"], { env: { ...process.env, OPENPRESENCE_V2_DB_PATH: join(dir, "social.sqlite"), OPENPRESENCE_V2_DATA_DIR: join(dir, "auth"), OPENPRESENCE_V2_PORT: String(port), OPENPRESENCE_V2_PUBLIC_URL: origin, OPENPRESENCE_V2_GRANTS: JSON.stringify([{ token: key, tenantId: "browser-test" }]) }, stdio: "pipe" });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    let started = false;
    for (let retry = 0; retry < 100; retry++) {
      try { if ((await fetch(`${origin}/.well-known/oauth-authorization-server`)).status === 200) { started = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(started).toBe(true);
    const response = await fetch(`${origin}/api/v2/oauth/register`, { method: "POST", body: JSON.stringify({ client_name: "Browser test agent", redirect_uris: [redirectUri] }) });
    const { client_id: clientId } = await response.json();
    const verifier = "c".repeat(64);
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"), scope: "social:read", state: "browser-state" });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`${origin}/api/v2/oauth/authorize?${params}`);
    await expect(page.getByRole("heading", { name: "Connect OpenPresence" }).isVisible()).resolves.toBe(true);
    expect(await page.getByText("Requested permissions: social:read.").isVisible()).toBe(true);
    await page.screenshot({ path: "/tmp/openpresence-v2-oauth-consent.png" });
    await page.getByLabel("Connection key").fill(key);
    const [consent] = await Promise.all([page.waitForResponse(response => response.url().includes("/api/v2/oauth/authorize") && response.request().method() === "POST", { timeout: 5000 }), page.getByRole("button", { name: "Authorize connection" }).click()]);
    expect(consent.status(), await consent.text().catch(() => "No body on redirect")).toBe(303);
    await page.waitForURL(url => url.pathname === "/callback" && url.searchParams.has("code"), { timeout: 5000 });
    const callback = new URL(page.url()); expect(callback.origin).toBe(callbackOrigin); expect(callback.searchParams.get("state")).toBe("browser-state");
    const token = await fetch(`${origin}/api/v2/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: callback.searchParams.get("code")!, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }) });
    expect(token.status).toBe(200);
    const tokens = await token.json(); expect(tokens.scope).toBe("social:read");
    const discovery = await fetch(`${origin}/api/v2/mcp`, { method: "POST", headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(discovery.status).toBe(200); const tools = await discovery.json();
    expect(tools.result.tools.some((tool: { name: string }) => tool.name === "update_social_profile")).toBe(false);
  } finally { await browser?.close(); child.kill("SIGTERM"); await new Promise<void>(resolve => callbackServer.close(() => resolve())); rmSync(dir, { recursive: true, force: true }); }
}, 20000);
