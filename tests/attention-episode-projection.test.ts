import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createAttentionEpisode, updateAttentionEpisode } from "../lib/attention-episodes";
import { readStateSnapshot, resolvedDbPath, writeState } from "../lib/db";
import { createAgent, initialState } from "../lib/runtime";

describe("attention episode compatibility projection", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("round-trips attention episodes through the normalized ledger after removing app_state copy", () => {
    const base = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const created = createAttentionEpisode(base, { presenceId: base.presence!.id, source: "operator" });
    writeState(created.state);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    const rawState = JSON.parse(raw.payload) as Record<string, unknown>;
    expect(rawState.attentionEpisodes).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM attention_episodes WHERE id = ?").get(created.episode.id)).toMatchObject({ count: 1 });
    database.prepare("UPDATE app_state SET updated_at = ? WHERE id = 1").run(new Date(Date.now() + 1_000).toISOString());
    database.close();

    const reopened = readStateSnapshot();
    expect(reopened.attentionEpisodes?.find((item) => item.id === created.episode.id)).toMatchObject({ id: created.episode.id, status: "running" });

    const updated = updateAttentionEpisode(reopened, created.episode.id, { stage: "choosing" });
    writeState(updated);
    const updatedDatabase = new Database(resolvedDbPath);
    const updatedRow = updatedDatabase.prepare("SELECT payload FROM attention_episodes WHERE id = ?").get(created.episode.id) as { payload: string };
    expect(JSON.parse(updatedRow.payload)).toMatchObject({ id: created.episode.id, stage: "choosing" });
    updatedDatabase.close();
  });
});
