import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createAgent, initialState } from "../lib/runtime";
import { readStateSnapshot, readUsageWorkspaces, resolvedDbPath, writeState } from "../lib/db";

describe("high-volume compatibility projections", () => {
  afterEach(() => {
    writeState(initialState());
  });

  it("keeps append-only histories readable after removing them from app_state", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    state.resourceUsageEvents = [{ id: "usage-projection-test", agentId: state.agent!.id, presenceId: state.presence!.id, invocationId: "invocation-projection-test", originKind: "inbound_social", category: "channel_read", provider: "x", usage: { requests: 1 }, createdAt: new Date().toISOString() }];
    state.publicationMetricSnapshots = [{ id: "metric-projection-test", presenceId: state.presence!.id, mirrorObjectId: "mirror-projection-test", observedAt: new Date().toISOString(), publicationAgeSeconds: 60, source: "native", observationStatus: "observed" }] as never;
    writeState(state);

    const database = new Database(resolvedDbPath);
    const raw = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    const rawState = JSON.parse(raw.payload) as Record<string, unknown>;
    expect(rawState.resourceUsageEvents).toBeUndefined();
    expect(rawState.publicationMetricSnapshots).toBeUndefined();
    database.prepare("UPDATE app_state SET updated_at = ? WHERE id = 1").run(new Date(Date.now() + 1_000).toISOString());
    database.close();

    const reopened = readStateSnapshot();
    expect(reopened.resourceUsageEvents[0]?.id).toBe("usage-projection-test");
    expect(reopened.publicationMetricSnapshots[0]?.id).toBe("metric-projection-test");
    expect(readUsageWorkspaces().some((workspace) => workspace.resourceUsageEvents.some((event) => event.id === "usage-projection-test"))).toBe(true);
  });
});
