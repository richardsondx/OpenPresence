import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "openpresence clean clone ")));
  fixtures.push(root);
  mkdirSync(path.join(root, "scripts"));
  for (const script of ["openpresence-server.mjs", "openpresence-runtime-config.mjs"]) {
    copyFileSync(path.resolve("scripts", script), path.join(root, "scripts", script));
  }
  const nextPath = path.join(root, "node_modules/next/dist/bin");
  mkdirSync(nextPath, { recursive: true });
  // Capture only routing settings. Generated credentials never leave the child.
  writeFileSync(path.join(nextPath, "next"), `
    const fs = require("node:fs");
    fs.writeFileSync("startup.json", JSON.stringify({
      dbPath: process.env.OPENPRESENCE_DB_PATH,
      distDir: process.env.OPENPRESENCE_NEXT_DIST_DIR,
      mode: process.argv[2],
    }));
  `);
  return root;
}

function run(root: string, mode = "dev", env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [path.join(root, "scripts/openpresence-server.mjs"), mode], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: mode === "start" ? "production" : "development",
      OPENPRESENCE_DISABLE_SCHEDULER: "1",
      OPENPRESENCE_SERVER_RSS_LIMIT_MB: "0",
      ...env,
    },
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("clean-clone server startup", () => {
  it("requires explicit initialization without creating a blank workspace", () => {
    const root = fixture();
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENPRESENCE_ALLOW_DATABASE_INIT=1");
    expect(existsSync(path.join(root, "data"))).toBe(false);
    expect(existsSync(path.join(root, "startup.json"))).toBe(false);
  });

  it("initializes an absent data directory in a checkout with spaces", () => {
    const root = fixture();
    const result = run(root, "dev", { OPENPRESENCE_ALLOW_DATABASE_INIT: "1" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, "startup.json"), "utf8"))).toEqual({
      dbPath: path.join(root, "data/openpresence-main.db"),
      distDir: ".next-3015",
      mode: "dev",
    });
    expect(readFileSync(path.join(root, "data/.secret-key")).length).toBe(32);
    expect(existsSync(path.join(root, "data/openpresence-main.db.server-lock"))).toBe(false);
  });

  it("starts production from the default next build directory", () => {
    const root = fixture();
    const result = run(root, "start", { OPENPRESENCE_ALLOW_DATABASE_INIT: "1" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, "startup.json"), "utf8"))).toMatchObject({
      distDir: ".next", mode: "start",
    });
  });

  it("preserves an explicitly selected build directory", () => {
    const root = fixture();
    const result = run(root, "start", {
      OPENPRESENCE_ALLOW_DATABASE_INIT: "1",
      OPENPRESENCE_NEXT_DIST_DIR: ".next-custom",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, "startup.json"), "utf8"))).toMatchObject({
      distDir: ".next-custom",
    });
  });
});
