import { describe, expect, it } from "vitest";
import { GET as healthGet } from "../app/runtime/health/route";
import { GET as stateGet } from "../app/api/state/route";
import { readStateReadToken, readStateVersion } from "../lib/db";
import { initialState } from "../lib/runtime";
import { expireElapsedPursuitWindows } from "../lib/state-projection";

describe("state read projections", () => {
  it("does not clone the workspace when no pursuit window has expired", () => {
    const state = initialState();
    state.assignmentPursuitWindows = [{
      id: "pursuit-future",
      assignmentId: "assignment",
      presenceId: "presence",
      status: "active",
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    }] as never;

    const result = expireElapsedPursuitWindows(state);

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it("clones only when an active or paused pursuit window has expired", () => {
    const state = initialState();
    state.assignmentPursuitWindows = [{
      id: "pursuit-expired",
      assignmentId: "assignment",
      presenceId: "presence",
      status: "paused",
      deadlineAt: new Date(Date.now() - 60_000).toISOString(),
    }] as never;

    const result = expireElapsedPursuitWindows(state);

    expect(result.changed).toBe(true);
    expect(result.state).not.toBe(state);
    expect(result.state.assignmentPursuitWindows?.[0]?.status).toBe("expired");
  });

  it("keeps operator chat reads bounded and excludes full workspace stores", async () => {
    const response = await stateGet(new Request("http://localhost/api/state?projection=chat"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("chat");
    expect(body.agentWorkspaces).toBeUndefined();
    expect(body.mirrorEvents).toBeUndefined();
    expect(body.operatorConversations).toBeInstanceOf(Array);
    expect(JSON.stringify(body).length).toBeLessThan(600_000);
  });

  it("keeps non-selected Presence configuration out of the Activity read model", async () => {
    const response = await stateGet(new Request("http://localhost/api/state?projection=activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("activity");
    expect(body.presence).toBeTruthy();
    for (const presence of body.presences) {
      if (presence.id === body.presence.id) continue;
      expect(presence.brief).toBeUndefined();
      expect(presence.execution).toBeUndefined();
      expect(presence.context).toBeUndefined();
    }
  });

  it("short-circuits an unchanged chat poll with its ETag", async () => {
    const first = await stateGet(new Request("http://localhost/api/state?projection=chat"));
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await stateGet(new Request("http://localhost/api/state?projection=chat", { headers: { "if-none-match": etag! } }));

    expect(second.status).toBe(304);
  });

  it("keeps unrelated operational clocks out of the Chat cache token", () => {
    const chatToken = readStateReadToken("chat");
    const fullToken = readStateReadToken();

    expect(chatToken.startsWith(`${readStateVersion()}:`)).toBe(true);
    expect(chatToken).not.toBe(fullToken);
  });

  it("short-circuits an unchanged runtime health poll with its ETag", async () => {
    const first = await healthGet(new Request("http://localhost/runtime/health?presenceId=presence_genny"));
    const etag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(etag).toBeTruthy();

    const second = await healthGet(new Request("http://localhost/runtime/health?presenceId=presence_genny", { headers: { "if-none-match": etag! } }));

    expect(second.status).toBe(304);
  });
});
