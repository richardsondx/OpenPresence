import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleV2McpRequest } from "../lib/v2/mcp";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import sharp from "sharp";
import { V2_CONVERSATION_GUIDANCE, V2_SKILL_VERSION } from "../lib/v2/skill";

const key = "transport-test-not-a-real-key-00000000000000";
const origin = "https://openpresence.example";
const oldEnv = { ...process.env };
let dir: string;
let clients: Client[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openpresence-v2-mcp-")); clients = [];
  process.env.OPENPRESENCE_V2_DATA_DIR = dir;
  process.env.OPENPRESENCE_V2_DB_PATH = join(dir, "social.sqlite");
  process.env.OPENPRESENCE_V2_PUBLIC_URL = origin;
  process.env.OPENPRESENCE_V2_GRANTS = JSON.stringify([{ token: key, tenantId: "tenant-a" }, { token: `${key}b`, tenantId: "tenant-b" }, { token: `${key}r`, tenantId: "tenant-a", scopes: ["social:read"] }]);
  delete process.env.EVIDENCE_VISUAL_URL;
});
afterEach(async () => {
  for (const client of clients) await client.close();
  rmSync(dir, { recursive: true, force: true });
  for (const name of ["OPENPRESENCE_V2_DATA_DIR", "OPENPRESENCE_V2_DB_PATH", "OPENPRESENCE_V2_PUBLIC_URL", "OPENPRESENCE_V2_GRANTS", "EVIDENCE_VISUAL_URL"]) {
    if (oldEnv[name] === undefined) delete process.env[name]; else process.env[name] = oldEnv[name];
  }
});
async function connect(token = key) {
  const client = new Client({ name: "openpresence-test", version: "1.0" }); clients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/api/v2/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init) => handleV2McpRequest(new Request(input, init)),
  });
  await client.connect(transport); return client;
}

describe("V2 real SDK transport and domain service", () => {
  it("initializes, discovers tools, retrieves skill and prompts, and receives fresh markers", async () => {
    const client = await connect();
    const tools = await client.listTools(); expect(tools.tools.length).toBe(12);
    const resources = await client.listResources(); expect(resources.resources).toHaveLength(1);
    const skill = await client.readResource({ uri: resources.resources[0].uri });
    expect(skill.contents[0]).toHaveProperty("text");
    expect(JSON.stringify(skill.contents)).toContain(V2_SKILL_VERSION);
    expect(JSON.stringify(skill.contents)).toContain("Onboarding is a conversation, not a five-field form");
    expect(client.getInstructions()).toContain(V2_CONVERSATION_GUIDANCE);
    const prompts = await client.listPrompts(); expect(prompts.prompts[0].name).toBe("social-growth");
    const prompt = await client.getPrompt({ name: "social-growth", arguments: { goal: "Grow a niche audience" } });
    expect(prompt.messages).toHaveLength(1);
    const first = await client.callTool({ name: "get_social_workspace", arguments: {} });
    const second = await client.callTool({ name: "get_social_workspace", arguments: {} });
    expect(first.isError).not.toBe(true); expect(first.structuredContent).toBeDefined();
    expect((first.structuredContent as Record<string, unknown>).connectionAuthority).toEqual({ scopes: ["social:read", "social:write"], canPersistSocialState: true, publicExecution: false });
    expect(client.getInstructions()).toContain("Authorized scopes for this connection: social:read, social:write");
    expect(JSON.stringify(first.structuredContent)).not.toBe(JSON.stringify(second.structuredContent));
  });
  it("persists confirmed voice across clients and isolates tenants", async () => {
    const client = await connect();
    const write = await client.callTool({ name: "update_social_profile", arguments: { expectedRevision: 0, requestId: "voice-request-0001", userConfirmed: true, provenance: "User approved this voice", changes: { niche: "Industrial heat", voice: { description: "Technical and restrained", examples: [], avoid: [], never: [] } } } });
    expect(write.isError).not.toBe(true);
    const reconnect = await connect();
    const persisted = await reconnect.callTool({ name: "get_social_workspace", arguments: {} });
    expect(JSON.stringify(persisted.structuredContent)).toContain("Technical and restrained");
    const other = await connect(`${key}b`);
    const isolated = await other.callTool({ name: "get_social_workspace", arguments: {} });
    expect(JSON.stringify(isolated.structuredContent)).not.toContain("Technical and restrained");
  });
  it("returns tool errors for invalid arguments and excludes write tools from read grants", async () => {
    const read = await connect(`${key}r`);
    const tools = await read.listTools(); expect(tools.tools.some(tool => tool.name === "update_social_profile")).toBe(false);
    const workspace = await read.callTool({ name: "get_social_workspace", arguments: {} });
    const plan = await read.callTool({ name: "prepare_growth_plan", arguments: {} });
    for (const result of [workspace, plan]) {
      expect((result.structuredContent as Record<string, unknown>).connectionAuthority).toEqual({ scopes: ["social:read"], canPersistSocialState: false, publicExecution: false });
      const content = result.content as { text?: string }[];
      expect(JSON.parse(content[0].text!).connectionAuthority.canPersistSocialState).toBe(false);
    }
    expect(read.getInstructions()).toContain("read-only and cannot persist");
    await expect(read.callTool({ name: "update_social_profile", arguments: {} })).rejects.toThrow("permission");
    const invalid = await read.callTool({ name: "prepare_social_action", arguments: { channel: "invalid" } });
    expect(invalid.isError).toBe(true); expect(JSON.stringify(invalid.content)).toContain("INVALID_ARGUMENT");
    await expect(read.callTool({ name: "imaginary", arguments: {} })).rejects.toThrow("Unknown");
  });
  it("rejects unauthenticated access, hostile origins and malformed protocol", async () => {
    const unauthenticated = await handleV2McpRequest(new Request(`${origin}/api/v2/mcp`, { method: "POST", body: "{}" }));
    expect(unauthenticated.status).toBe(401); expect(unauthenticated.headers.get("www-authenticate")).toContain("resource_metadata");
    const hostile = await handleV2McpRequest(new Request(`${origin}/api/v2/mcp`, { method: "POST", headers: { authorization: `Bearer ${key}`, origin: "https://hostile.example" } }));
    expect(hostile.status).toBe(403);
    const malformed = await handleV2McpRequest(new Request(`${origin}/api/v2/mcp`, { method: "POST", headers: { authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "invalid" }));
    expect(malformed.status).toBe(400);
  });
  it("delivers actual visual pixels as MCP images with matching candidate references", async () => {
    const pixels = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    const provider = createServer((request, response) => {
      if (request.url === "/v1/search") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ results: [{ id: "real-pixels", sourceUrl: "https://publisher.example/chart", title: "Original chart" }] })); }
      else { response.setHeader("Content-Type", "image/png"); response.end(pixels); }
    });
    await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
    process.env.EVIDENCE_VISUAL_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
    try {
      const client = await connect();
      const result = await client.callTool({ name: "find_visual_evidence", arguments: { claim: "Chart could support this point", query: "chart" } });
      const content = result.content as { type: string; data?: string; text?: string }[];
      expect(content[1].type).toBe("image"); expect(content[1].data).toBe(pixels.toString("base64"));
      expect(content[0].text).not.toContain(pixels.toString("base64"));
      const structured = result.structuredContent as { candidates: { image?: unknown; imageContentIndex: number }[] };
      const candidate = structured.candidates[0];
      expect(candidate.image).toBeUndefined(); expect(candidate.imageContentIndex).toBe(1);
    } finally { await new Promise<void>(resolve => provider.close(() => resolve())); }
  });
});
