import { callV2Tool, V2_TOOL_DEFINITIONS } from "../lib/v2/service";
import { V2_SKILL } from "../lib/v2/skill";

async function main() {
const [name, rawArgs = "{}"] = process.argv.slice(2);
const tenantId = process.env.OPENPRESENCE_V2_TENANT;
try {
  if (name === "tools") console.log(JSON.stringify(V2_TOOL_DEFINITIONS));
  else if (name === "skill") console.log(V2_SKILL);
  else {
    if (!tenantId || !/^[a-zA-Z0-9_-]{1,80}$/.test(tenantId)) throw new Error("Set OPENPRESENCE_V2_TENANT to an isolated workspace ID");
    if (!name) throw new Error("Usage: tsx scripts/v2-cli.ts <tool|tools|skill> '[JSON arguments]'");
    console.log(JSON.stringify(await callV2Tool(tenantId, name, JSON.parse(rawArgs))));
  }
} catch (error) { console.error(error instanceof Error ? error.message : "Request failed"); process.exitCode = 1; }
}
void main();
