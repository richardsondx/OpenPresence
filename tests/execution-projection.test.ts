import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { readStateSnapshot, resolvedDbPath, writeState } from "../lib/db";
import { createAgent, initialState } from "../lib/runtime";

describe("execution compatibility projection", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("round-trips delivery records through the normalized ledger after removing app_state copy", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const execution = {
      id: "execution-projection-test",
      socialIntentId: "intent-projection-test",
      presenceId: state.presence!.id,
      affordance: "x.reply",
      mode: "manual",
      status: "queued",
      attempts: 0,
      idempotencyKey: "execution-projection-idempotency",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never;
    state.executions = [execution];
    writeState(state);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    const rawState = JSON.parse(raw.payload) as Record<string, unknown>;
    expect(rawState.executions).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM executions WHERE id = ?").get(execution.id)).toMatchObject({ count: 1 });
    database.prepare("UPDATE app_state SET updated_at = ? WHERE id = 1").run(new Date(Date.now() + 1_000).toISOString());
    database.close();

    const reopened = readStateSnapshot();
    expect(reopened.executions.find((item) => item.id === execution.id)).toMatchObject({ id: execution.id, status: "queued" });
  });
});
