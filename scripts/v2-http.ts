import { createServer } from "node:http";
import { handleV2McpRequest } from "../lib/v2/mcp";
import { approveAuthorization, beginAuthorization, issueToken, oauthMetadata, protectedResourceMetadata, registerClient, revokeToken } from "../lib/v2/oauth";
import { v2PublicOrigin } from "../lib/v2/auth";

// Dedicated process: a tunnel to this port exposes only V2, never the legacy app.
const port = Number(process.env.OPENPRESENCE_V2_PORT ?? "8789");
const bind = process.env.OPENPRESENCE_V2_BIND ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid OPENPRESENCE_V2_PORT");
if (!process.env.OPENPRESENCE_V2_GRANTS) throw new Error("Configure scoped OPENPRESENCE_V2_GRANTS before starting the HTTP server");
const publicOrigin = process.env.OPENPRESENCE_V2_PUBLIC_URL ? v2PublicOrigin() : `http://127.0.0.1:${port}`;
const allowedHosts = [new URL(publicOrigin).host, `127.0.0.1:${port}`, `localhost:${port}`];
const server = createServer(async (incoming, outgoing) => {
  try {
    if (!allowedHosts.includes(incoming.headers.host ?? "")) { outgoing.writeHead(403); outgoing.end("Host not allowed"); return; }
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 1024 * 1024) { outgoing.writeHead(413); outgoing.end("Request too large"); return; }
      chunks.push(Buffer.from(chunk));
    }
    const method = incoming.method ?? "GET";
    const url = new URL(incoming.url ?? "/", publicOrigin);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(url, { method, headers, ...(method !== "GET" && method !== "HEAD" ? { body: Buffer.concat(chunks).toString("utf8") } : {}) });
    let response: Response;
    if (url.pathname === "/api/v2/mcp") response = await handleV2McpRequest(request);
    else if (url.pathname === "/.well-known/oauth-authorization-server" && method === "GET") response = oauthMetadata(request);
    else if (["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/v2/mcp"].includes(url.pathname) && method === "GET") response = protectedResourceMetadata(request);
    else if (url.pathname === "/api/v2/oauth/register" && method === "POST") response = await registerClient(request);
    else if (url.pathname === "/api/v2/oauth/authorize" && method === "GET") response = beginAuthorization(request);
    else if (url.pathname === "/api/v2/oauth/authorize" && method === "POST") response = await approveAuthorization(request);
    else if (url.pathname === "/api/v2/oauth/token" && method === "POST") response = await issueToken(request);
    else if (url.pathname === "/api/v2/oauth/revoke" && method === "POST") response = await revokeToken(request);
    else response = Response.json({ error: "Not found" }, { status: 404 });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "OpenPresence could not complete the request" }));
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(port, bind, () => console.error(`OpenPresence V2 dedicated endpoint listening on ${bind}:${port}; resource ${publicOrigin}/api/v2/mcp`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
