import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { readState, resolvedDbPath, upsertOperationalRun, writeState } from "../lib/db";
import { createAgent, initialState } from "../lib/runtime";
import type { OperationalRun } from "../lib/types";

describe("operational-run compatibility projection", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("keeps operational runs in the indexed ledger instead of app_state", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const run: OperationalRun = {
      id: "operational-run-projection-test",
      presenceId: state.presence!.id,
      kind: "attention",
      state: "queued",
      stage: "looking",
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      recoveryCount: 0,
    };
    upsertOperationalRun(run);
    state.operationalRuns = [run];
    writeState(state);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    expect((JSON.parse(raw.payload) as Record<string, unknown>).operationalRuns).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM operational_runs_idx WHERE id = ?").get(run.id)).toMatchObject({ count: 1 });
    database.close();

    expect(readState().operationalRuns).toEqual(expect.arrayContaining([expect.objectContaining({ id: run.id, state: "queued" })]));
  });
});
