import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { resolvedDbPath } from "../lib/db";

describe("SQLite autonomy hot-path indexes", () => {
  it("keeps attention and wake lookups indexed by their filters and ordering", () => {
    const database = new Database(resolvedDbPath, { readonly: true });
    try {
      const indexes = (table: string) => new Set(
        (database.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((row) => row.name),
      );
      expect([...indexes("operational_runs_idx")]).toEqual(expect.arrayContaining([
        "operational_runs_presence_updated_idx",
        "operational_runs_state_updated_idx",
      ]));
      expect([...indexes("scheduled_wakes_idx")]).toEqual(expect.arrayContaining([
        "scheduled_wakes_state_time_idx",
        "scheduled_wakes_presence_created_idx",
      ]));

      const presenceId = (database.prepare("SELECT presence_id FROM operational_runs_idx WHERE presence_id IS NOT NULL LIMIT 1").get() as { presence_id?: string } | undefined)?.presence_id ?? "missing";
      const duePlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM scheduled_wakes_idx WHERE state = 'pending' AND wake_at <= ? ORDER BY wake_at ASC").all(new Date().toISOString()) as Array<{ detail: string }>;
      const presencePlan = database.prepare("EXPLAIN QUERY PLAN SELECT payload FROM operational_runs_idx WHERE presence_id = ? ORDER BY updated_at DESC").all(presenceId) as Array<{ detail: string }>;
      expect(duePlan.some((row) => row.detail.includes("scheduled_wakes_state_time_idx"))).toBe(true);
      expect(presencePlan.some((row) => row.detail.includes("operational_runs_presence_updated_idx"))).toBe(true);
    } finally {
      database.close();
    }
  });
});
