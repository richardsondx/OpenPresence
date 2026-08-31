import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent, initialState } from "../lib/runtime";
import { readStateSnapshot, resolvedDbPath, writeState } from "../lib/db";

describe("mirror-object compatibility projection", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("keeps mutable mirror objects readable while removing them from app_state", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const mirrorId = "mirror-projection-test";
    const mirror = {
      id: mirrorId,
      bridgeId: "bridge-projection-test",
      presenceId: state.presence!.id,
      channelId: "x",
      externalRef: { type: "x.post", id: "post-projection-test" },
      objectType: "post",
      content: { text: "A durable projection test." },
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      environment: "live",
    } as never;
    state.mirrorObjects = [mirror];
    writeState(state);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    const rawState = JSON.parse(raw.payload) as Record<string, unknown>;
    expect(rawState.mirrorObjects).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM mirror_objects WHERE id = ?").get(mirrorId)).toMatchObject({ count: 1 });
    database.close();

    const reopened = readStateSnapshot();
    expect(reopened.mirrorObjects).toEqual([expect.objectContaining({ id: mirrorId })]);
  });
});
