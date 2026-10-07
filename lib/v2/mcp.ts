import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { callV2Tool, V2_TOOL_DEFINITIONS, V2Error } from "./service";
import { V2_CONVERSATION_GUIDANCE, V2_SKILL, V2_SKILL_URI, V2_SKILL_VERSION } from "./skill";
import { configuredGrant, isReadTool, v2PublicOrigin, type V2Grant } from "./auth";
import { oauthGrant } from "./oauth";

export function createV2McpServer(grant: V2Grant) {
  const canPersistSocialState = grant.scopes.includes("social:write");
  const connectionAuthority = { scopes: [...grant.scopes], canPersistSocialState, publicExecution: false };
  const server = new Server({ name: "openpresence", version: "2.0.0" }, { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: `${V2_CONVERSATION_GUIDANCE}\nOpenPresence supplies social intelligence. Retrieve ${V2_SKILL_URI} before social growth work. Authorized scopes for this connection: ${grant.scopes.join(", ") || "none"}. ${canPersistSocialState ? "This connection can persist confirmed social state through its discovered write tools." : "This connection is read-only and cannot persist social profile, voice, feedback, activity, results, experiments, or host task records. Do not promise to save or remember changes through OpenPresence. Explain that write access is needed and keep any interim plan in the host conversation."} The host retains reasoning, scheduling, account connections, approvals, and public execution. OpenPresence never authorizes or performs public execution.` });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: V2_TOOL_DEFINITIONS.filter(tool => grant.scopes.includes(isReadTool(tool.name) ? "social:read" : "social:write")) }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const name = request.params.name;
    if (!V2_TOOL_DEFINITIONS.some(tool => tool.name === name)) throw new McpError(ErrorCode.InvalidParams, "Unknown OpenPresence tool");
    if (!grant.scopes.includes(isReadTool(name) ? "social:read" : "social:write")) throw new McpError(ErrorCode.InvalidParams, "Connection lacks permission for this tool");
    try {
      const result = await callV2Tool(grant.tenantId, name, request.params.arguments ?? {});
      // Deliver real pixels as MCP image blocks, rather than burying base64 in text.
      const clean = { ...JSON.parse(JSON.stringify(result)), connectionAuthority } as Record<string, unknown>;
      const images: { type: "image"; data: string; mimeType: string }[] = [];
      if (name === "find_visual_evidence" && Array.isArray(clean.candidates)) {
        for (const candidate of clean.candidates) {
          if (candidate.image && typeof candidate.image.data === "string" && typeof candidate.image.mimeType === "string") {
            images.push({ type: "image", data: candidate.image.data, mimeType: candidate.image.mimeType });
            candidate.imageContentIndex = images.length;
            delete candidate.image;
          }
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(clean) }, ...images], structuredContent: clean };
    } catch (error) {
      const code = error instanceof V2Error ? error.code : "INTERNAL_ERROR";
      const message = error instanceof V2Error ? error.message : "OpenPresence could not complete this request";
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message } }) }] };
    }
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: V2_SKILL_URI, name: "OpenPresence social operating skill", description: `Social growth operating guidance, version ${V2_SKILL_VERSION}`, mimeType: "text/markdown" }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    if (request.params.uri !== V2_SKILL_URI) throw new McpError(ErrorCode.InvalidParams, "Unknown resource");
    return { contents: [{ uri: V2_SKILL_URI, mimeType: "text/markdown", text: V2_SKILL }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "social-growth", description: "Start an audience-growth objective using OpenPresence", arguments: [{ name: "goal", description: "The user's social objective", required: false }] }] }));
  server.setRequestHandler(GetPromptRequestSchema, async request => {
    if (request.params.name !== "social-growth") throw new McpError(ErrorCode.InvalidParams, "Unknown prompt");
    return { description: "OpenPresence social growth onboarding", messages: [{ role: "user" as const, content: { type: "text" as const, text: `${V2_SKILL}\n\nUser goal: ${request.params.arguments?.goal ?? "Help me build an audience in my niche."}` } }] };
  });
  return server;
}

export async function handleV2McpRequest(request: Request) {
  let origin: string;
  try { origin = v2PublicOrigin(request); } catch { return Response.json({ error: "V2 public URL must use HTTPS" }, { status: 503 }); }
  const browserOrigin = request.headers.get("origin");
  const allowedOrigins = [origin, ...(process.env.OPENPRESENCE_V2_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)];
  if (browserOrigin && !allowedOrigins.includes(browserOrigin)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const grant = token ? configuredGrant(token) ?? oauthGrant(token, request) : undefined;
  if (!grant) return Response.json({ error: "An authorized OpenPresence connection is required" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v2/mcp"`, "Cache-Control": "no-store" } });
  if (request.method !== "POST") return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "This stateless endpoint accepts POST; no notification stream or session to delete" } }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  const server = createV2McpServer(grant);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 1024 * 1024 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally { await server.close(); }
}
