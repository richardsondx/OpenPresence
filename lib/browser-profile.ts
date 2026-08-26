import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Return the persistent browser state directory owned by one Presence. */
export function getPresenceProfileDir(presenceId: string): string {
  const baseDir = process.env.OPENPRESENCE_DATA_DIR
    ? path.join(process.env.OPENPRESENCE_DATA_DIR, "browser-profiles")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "OpenPresence", "browser-profiles")
      : path.join(process.cwd(), "data", "browser-profiles");
  const profileDir = path.join(baseDir, presenceId);
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}
