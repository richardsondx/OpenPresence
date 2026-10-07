import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createV2McpServer } from "../lib/v2/mcp";
import { V2_SCOPES } from "../lib/v2/auth";

async function main() {
const tenantId = process.env.OPENPRESENCE_V2_TENANT;
if (!tenantId || !/^[a-zA-Z0-9_-]{1,80}$/.test(tenantId)) {
  console.error("Set OPENPRESENCE_V2_TENANT to the isolated local workspace ID.");
  process.exit(1);
}
const server = createV2McpServer({ tenantId, scopes: V2_SCOPES, grantHash: "local-stdio" });
await server.connect(new StdioServerTransport());
}
void main().catch(() => { console.error("Could not start OpenPresence V2 stdio server"); process.exitCode = 1; });
