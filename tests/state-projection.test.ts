import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { GET as healthGet } from "../app/runtime/health/route";
import { GET as stateGet } from "../app/api/state/route";
import { readStateReadToken, readStateVersion, writeState } from "../lib/db";
import { createAgent, initialState } from "../lib/runtime";
import { expireElapsedPursuitWindows } from "../lib/state-projection";
import { browserWorkspaceProjection, growthWorkspaceProjection } from "../lib/state-browser-projection";

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

  it("bounds full browser history while retaining current target mirrors", () => {
    const state = initialState();
    state.mirrorObjects = Array.from({ length: 700 }, (_, index) => ({
      id: `mirror-${index}`,
      presenceId: "presence",
      externalRef: { type: "post", id: `external-${index}` },
      observedAt: new Date(index).toISOString(),
    })) as never;
    state.assignments = [{
      id: "assignment-current",
      target: { mirrorObjectId: "mirror-0" },
    }] as never;
    state.events = Array.from({ length: 700 }, (_, index) => ({
      id: `event-${index}`,
      occurredAt: new Date(index).toISOString(),
    })) as never;
    state.resourceUsageEvents = Array.from({ length: 700 }, (_, index) => ({
      id: `usage-${index}`,
      occurredAt: new Date(index).toISOString(),
    })) as never;

    const projection = browserWorkspaceProjection(state);

    expect(projection).not.toBe(state);
    expect(projection.mirrorObjects).toHaveLength(600);
    expect(projection.mirrorObjects.some((item) => item.id === "mirror-0")).toBe(true);
    expect(projection.events).toHaveLength(500);
    expect(projection.resourceUsageEvents).toHaveLength(500);
    expect(projection.mirrorEvents).toHaveLength(0);
    expect(projection.agentWorkspaces).toHaveLength(0);
  });

  it("bounds linked social history while retaining in-flight execution records", () => {
    const state = initialState();
    state.executions = Array.from({ length: 300 }, (_, index) => ({
      id: `execution-${index}`,
      socialIntentId: `intent-${index}`,
      presenceId: "presence",
      affordance: "x.reply",
      mode: "manual",
      status: index === 299 ? "executing" : "succeeded",
      attempts: 1,
      idempotencyKey: `key-${index}`,
      createdAt: new Date(index).toISOString(),
      updatedAt: new Date(index).toISOString(),
    })) as never;
    state.socialIntents = Array.from({ length: 400 }, (_, index) => ({
      id: `intent-${index}`,
      agentId: "agent",
      presenceId: "presence",
      affordance: "x.reply",
      priority: 1,
      validity: {},
      state: index === 299 ? "active" : "withdrawn",
      formedAt: new Date(index).toISOString(),
      updatedAt: new Date(index).toISOString(),
    })) as never;
    state.socialDecisions = Array.from({ length: 400 }, (_, index) => ({
      id: `decision-${index}`,
      agentId: "agent",
      presenceId: "presence",
      environment: "sandbox",
      focalMirrorObjectIds: [],
      decision: "reply",
      summary: `Decision ${index}`,
      influences: [],
      socialIntentId: `intent-${index}`,
      createdAt: new Date(index).toISOString(),
    })) as never;
    state.actions = Array.from({ length: 400 }, (_, index) => ({
      id: `action-${index}`,
      intent: "reply",
      summary: `Action ${index}`,
      status: "executed",
      reason: "test",
      createdAt: new Date(index).toISOString(),
      executionId: `execution-${index}`,
      socialIntentId: `intent-${index}`,
    })) as never;

    const projection = browserWorkspaceProjection(state);

    expect(projection.executions).toHaveLength(120);
    expect(projection.executions.some((execution) => execution.id === "execution-299")).toBe(true);
    expect(projection.socialIntents.length).toBeLessThanOrEqual(240);
    expect(projection.socialIntents.some((intent) => intent.id === "intent-299")).toBe(true);
    expect(projection.socialDecisions.length).toBeLessThanOrEqual(240);
    expect(projection.socialDecisions.some((decision) => decision.socialIntentId === "intent-299")).toBe(true);
    expect(projection.actions.length).toBeLessThanOrEqual(240);
    expect(projection.actions.some((action) => action.executionId === "execution-299")).toBe(true);
  });

  it("keeps complete selected-Presence Growth evidence outside the generic browser cap", () => {
    const state = createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
    const presenceId = state.presence!.id;
    state.audienceSnapshots = Array.from({ length: 301 }, (_, index) => ({
      id: `audience-${index}`, presenceId, channel: "x", followers: index, source: "native",
      observationStatus: "observed", observedAt: new Date(index).toISOString(),
    }));
    state.publicationMetricSnapshots = Array.from({ length: 501 }, (_, index) => ({
      id: `publication-metric-${index}`, presenceId, mirrorObjectId: `mirror-${index}`,
      observedAt: new Date(index).toISOString(), publicationAgeSeconds: 3600,
      impressions: index, source: "native", observationStatus: "observed",
    }));
    state.mirrorObjects = Array.from({ length: 501 }, (_, index) => ({
      id: `mirror-${index}`, presenceId, externalRef: { type: "x.post", id: `post-${index}` },
      observedAt: new Date(index).toISOString(), occurredAt: new Date(index).toISOString(),
    })) as never;

    const projection = growthWorkspaceProjection(state, presenceId);

    expect(projection.responseProjection).toBe("growth");
    expect(projection.audienceSnapshots).toHaveLength(301);
    expect(projection.publicationMetricSnapshots).toHaveLength(501);
    expect(projection.mirrorObjects).toHaveLength(501);
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
    expect(body.assignmentRuns).toBeInstanceOf(Array);
    expect(body.proposals).toBeInstanceOf(Array);
    expect(JSON.stringify(body).length).toBeLessThan(600_000);
  });

  it("keeps non-selected Presence configuration out of the Activity read model", async () => {
    writeState(createAgent({ name: "Projection Agent", description: "Exercise a populated Activity projection.", mode: "agent", handle: "@projection_agent", accent: "#777777" }));
    const response = await stateGet(new Request("http://localhost/api/state?projection=activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responseProjection).toBe("activity");
    expect(body.presence).toBeTruthy();
    expect(body.files).toBeUndefined();
    expect(body.publishingPlans).toBeInstanceOf(Array);
    expect(body.publishingPlans.length).toBeLessThanOrEqual(4);
    for (const run of body.operationalRuns) {
      if (["queued", "running", "recovering", "delivery_uncertain", "reconciling", "blocked", "needs_operator"].includes(run.state)) continue;
      expect(run.attention).toBeUndefined();
      expect(run.result).toBeUndefined();
    }
    for (const mirror of body.mirrorObjects) {
      expect(mirror.assetRefs).toBeUndefined();
      expect(mirror.sourceEventId).toBeUndefined();
      expect(mirror.bridgeId).toBeUndefined();
      expect(mirror.trust).toBeUndefined();
      expect(mirror.shareability).toBeUndefined();
    }
    expect(body.events.every((event: { detail: string }) => event.detail.length <= 360)).toBe(true);
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

  it("compresses large state responses when the client supports gzip", async () => {
    const response = await stateGet(new Request("http://localhost/api/state?read=gzip", {
      headers: { "accept-encoding": "gzip" },
    }));
    const encoded = Buffer.from(await response.arrayBuffer());
    const decoded = gunzipSync(encoded).toString("utf8");
    const body = JSON.parse(decoded);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(body.responseProjection).toBe("full");
    expect(encoded.length).toBeLessThan(Buffer.byteLength(decoded) * 0.5);
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
