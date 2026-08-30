import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(process.cwd(), "scripts/compact-openpresence-db.mjs");

function createFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "openpresence-compact-test-"));
  const databasePath = path.join(directory, "workspace.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE retained_records (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE mirror_events (id TEXT PRIMARY KEY, parent_id TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO app_state VALUES (1, '{"activeAgentId":"agent-test","events":[]}', '2026-08-30T00:00:00.000Z');
    INSERT INTO retained_records VALUES (1, 'retained');
    INSERT INTO mirror_events VALUES ('mirror-1', 'bridge-1', '{"sourceEventId":"source-1"}', '2026-08-30T00:00:00.000Z');
    INSERT INTO mirror_events VALUES ('mirror-2', 'bridge-1', '{"sourceEventId":"source-1"}', '2026-08-30T00:01:00.000Z');
  `);
  database.close();
  // Make the source non-contiguous so VACUUM has observable work to do.
  const filler = new Database(databasePath);
  const insert = filler.prepare("INSERT INTO retained_records (id, payload) VALUES (?, ?)");
  filler.transaction(() => {
    for (let id = 2; id <= 2000; id += 1) insert.run(id, `${id}`.padStart(100, "0"));
  })();
  filler.prepare("DELETE FROM retained_records WHERE id % 2 = 0").run();
  filler.close();
  return { directory, databasePath };
}

describe("SQLite compaction utility", () => {
  it("validates a candidate without replacing the source unless confirmed", () => {
    const fixture = createFixture();
    const candidatePath = path.join(fixture.directory, "candidate.db");
    const beforePayload = readFileSync(fixture.databasePath, "binary");
    const dryRun = execFileSync(process.execPath, [scriptPath, "--db", fixture.databasePath, "--output", candidatePath], { encoding: "utf8" });

    expect(dryRun).toContain("Candidate validated only; canonical database was not changed.");
    expect(readFileSync(fixture.databasePath, "binary")).toBe(beforePayload);
    const candidate = new Database(candidatePath, { readonly: true });
    expect(candidate.pragma("quick_check", { simple: true })).toBe("ok");
    candidate.close();
    expect(readdirSync(fixture.directory).some((name) => name.startsWith("workspace.db.precompact-"))).toBe(true);
  });

  it("requires confirmation before installing a validated candidate", () => {
    const fixture = createFixture();
    const candidatePath = path.join(fixture.directory, "candidate.db");
    const result = execFileSync(process.execPath, [scriptPath, "--db", fixture.databasePath, "--output", candidatePath, "--confirm"], { encoding: "utf8" });
    const installed = new Database(fixture.databasePath, { readonly: true });

    expect(result).toContain("Installed compact database");
    expect(installed.pragma("quick_check", { simple: true })).toBe("ok");
    expect((installed.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string }).payload).toContain("agent-test");
    installed.close();
    expect(readdirSync(fixture.directory).some((name) => name.startsWith("workspace.db.precompact-"))).toBe(true);
  });

  it("deduplicates mirror history only when explicitly requested", () => {
    const fixture = createFixture();
    const candidatePath = path.join(fixture.directory, "deduplicated.db");
    const result = execFileSync(process.execPath, [scriptPath, "--db", fixture.databasePath, "--output", candidatePath, "--dedupe-mirror-events"], { encoding: "utf8" });
    const candidate = new Database(candidatePath, { readonly: true });

    expect(result).toContain('"deduplicatedMirrorEvents": 1');
    expect((candidate.prepare("SELECT COUNT(*) AS count FROM mirror_events").get() as { count: number }).count).toBe(1);
    expect((candidate.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string }).payload).toContain("agent-test");
    expect(candidate.pragma("integrity_check", { simple: true })).toBe("ok");
    candidate.close();
  });

  it("rejects a database with an active server lock", () => {
    const fixture = createFixture();
    writeFileSync(`${fixture.databasePath}.server-lock`, JSON.stringify({ pid: process.pid, port: 3015 }));

    try {
      execFileSync(process.execPath, [scriptPath, "--db", fixture.databasePath], { encoding: "utf8", stdio: "pipe" });
      throw new Error("compaction unexpectedly succeeded");
    } catch (error) {
      expect(String(error)).toMatch(/server lock|served by PID/);
    }
  });
});
