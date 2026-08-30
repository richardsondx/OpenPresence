import { describe, expect, it } from "vitest";
import { GET as stateGet } from "../app/api/state/route";
import { readStateReadToken, readStateVersion } from "../lib/db";

describe("state read projections", () => {
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
});
