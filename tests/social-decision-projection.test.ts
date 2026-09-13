import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { readState, resolvedDbPath, writeState } from "../lib/db";
import { createAgent, initialState, recordSocialDecision } from "../lib/runtime";

describe("social-decision compatibility projection", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("keeps decision history queryable after removing the app_state copy", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const next = recordSocialDecision(state, {
      presenceId: state.presence!.id,
      decision: "reply",
      summary: "A concrete reply earned its place.",
      confidence: "high",
    });
    writeState(next);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    expect((JSON.parse(raw.payload) as Record<string, unknown>).socialDecisions).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM social_decisions WHERE id = ?").get(next.socialDecisions[0]!.id)).toMatchObject({ count: 1 });
    database.close();

    expect(readState().socialDecisions).toEqual(expect.arrayContaining([expect.objectContaining({ id: next.socialDecisions[0]!.id, decision: "reply" })]));
  });
});
