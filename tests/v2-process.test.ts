import { afterEach, beforeEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

let dir: string, child: ChildProcess | undefined, client: Client | undefined;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "openpresence-v2-process-")); });
afterEach(async () => { await client?.close(); child?.kill("SIGTERM"); rmSync(dir, { recursive: true, force: true }); child = undefined; client = undefined; });
const testEnv = () => ({ ...process.env, OPENPRESENCE_V2_TENANT: "process-test", OPENPRESENCE_V2_DB_PATH: join(dir, "social.sqlite"), OPENPRESENCE_V2_DATA_DIR: join(dir, "auth") });

it("starts the real stdio script and returns clean protocol responses", async () => {
  client = new Client({ name: "process-test", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["node_modules/tsx/dist/cli.mjs", "scripts/v2-mcp.ts"], env: testEnv(), stderr: "pipe" });
  await client.connect(transport);
  expect((await client.listTools()).tools).toHaveLength(12);
  const result = await client.callTool({ name: "get_social_workspace", arguments: {} });
  expect(result.isError).not.toBe(true); expect(result.structuredContent).toHaveProperty("verificationMarker");
}, 15000);

it("starts the dedicated HTTP script, excludes the legacy app and serves authenticated MCP", async () => {
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const token = "process-test-disposable-token-000000000000000";
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/v2-http.ts"], { env: { ...testEnv(), OPENPRESENCE_V2_PORT: String(port), OPENPRESENCE_V2_PUBLIC_URL: origin, OPENPRESENCE_V2_GRANTS: JSON.stringify([{ token, tenantId: "process-test" }]) }, stdio: "pipe" });
  let started = false;
  for (let retry = 0; retry < 100; retry++) {
    try { const response = await fetch(`${origin}/.well-known/oauth-authorization-server`); if (response.status === 200) { started = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(started).toBe(true);
  expect((await fetch(`${origin}/api/state`)).status).toBe(404);
  expect((await fetch(`${origin}/api/v2/mcp`)).status).toBe(401);
  client = new Client({ name: "http-process-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/api/v2/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  expect((await client.listTools()).tools).toHaveLength(12);
  const result = await client.callTool({ name: "get_social_workspace", arguments: {} });
  expect(result.structuredContent).toHaveProperty("requestMarker");
}, 15000);
