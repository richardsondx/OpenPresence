import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Operator setup only. Never prints a key or touches the standalone Agent DB.
const destination = path.resolve(".env.v2.local");
if (existsSync(destination)) { console.error(".env.v2.local already exists. Preserving your configuration; edit it locally to change the connection."); process.exitCode = 1; }
else {
  const dir = path.resolve("data/v2");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const grant = { token: randomBytes(32).toString("base64url"), tenantId: "my-social-workspace", scopes: ["social:read", "social:write"], expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  writeFileSync(destination, [
    "# Private local development configuration. Never share this file or paste its key into agent chat.",
    `OPENPRESENCE_V2_DB_PATH=${JSON.stringify(path.join(dir, "social.sqlite"))}`,
    `OPENPRESENCE_V2_DATA_DIR=${JSON.stringify(dir)}`,
    `OPENPRESENCE_V2_TENANT=${grant.tenantId}`,
    "OPENPRESENCE_V2_PORT=8789",
    `OPENPRESENCE_V2_GRANTS='${JSON.stringify([grant])}'`,
    "# Set this to your dedicated service's public HTTPS origin before connecting a cloud agent.",
    "# OPENPRESENCE_V2_PUBLIC_URL=https://your-controlled-test-origin.example",
    "",
  ].join("\n"), { mode: 0o600, flag: "wx" });
  console.log("Created private .env.v2.local and an isolated V2 workspace configuration. Connection key expires in seven days; it was not printed.");
  console.log("Start the dedicated service with pnpm v2:http. For Muse, configure a deliberate HTTPS endpoint, set OPENPRESENCE_V2_PUBLIC_URL, and follow docs/v2-connection.md.");
}
