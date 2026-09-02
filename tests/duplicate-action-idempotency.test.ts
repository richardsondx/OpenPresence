import { describe, expect, it } from "vitest";
import { reservePublicActionDelivery } from "../lib/db";
import { duplicatePublicOutcomeEvidence } from "../lib/duplicate-public-outcome";
import { detectDuplicatePublicOutcomes, detectDuplicateVerifiedExecutionOutcomes } from "../lib/public-action-safety";
import { cloneState, createAgent, formChatPostIntent, formXActionIntent, formXReplyIntent } from "../lib/runtime";

function fixture() {
  const state = createAgent({ name: "Idempotency Agent", description: "Test", audience: "Testers", mode: "agent", handle: "@idempotency_agent", accent: "#777777" });
  const presence = state.presence!;
  presence.execution.post = "auto";
  presence.execution.reply = "auto";
  presence.execution.like = "auto";
  state.presences = [presence];
  return state;
}

describe("public action idempotency", () => {
  it("does not form another reply when the Social Mirror already proves one was authored", () => {
    let state = fixture();
    const presence = { ...state.presence!, status: "live" as const, environment: "live" as const, execution: { ...state.presence!.execution, reply: "auto" as const } };
    state.presence = presence;
    state.presences = [presence];
    const observedAt = new Date().toISOString();
    state.mirrorObjects = [
      { id: "target-post", bridgeId: "native:test", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "already-replied-to" }, objectType: "post", author: { displayName: "Builder", handle: "builder" }, content: { text: "A post worth answering" }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false },
      { id: "observed-own-reply", bridgeId: "native:test", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "already-replied" }, parentExternalRef: { type: "x.post", id: "already-replied-to" }, objectType: "reply", actorPresenceId: presence.id, author: { displayName: presence.name, handle: presence.handle }, content: { text: "The reply that already exists." }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false },
    ] as never;

    state = formXReplyIntent(state, "A second reply must never be formed.", "already-replied-to");

    expect(state.socialIntents).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
  });

  it("collapses repeated observations of one external reply before recovery evaluates outcomes", () => {
    const state = fixture();
    const presence = state.presence!;
    const observedAt = new Date().toISOString();
    state.mirrorObjects = [
      { id: "newest-observation", bridgeId: "native:test", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "same-reply" }, parentExternalRef: { type: "x.post", id: "same-target" }, objectType: "reply", actorPresenceId: presence.id, author: { displayName: presence.name, handle: presence.handle }, content: { text: "The same reply" }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false },
      { id: "older-observation", bridgeId: "native:test", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "same-reply" }, parentExternalRef: { type: "x.post", id: "same-target" }, objectType: "reply", actorPresenceId: presence.id, author: { displayName: presence.name, handle: presence.handle }, content: { text: "The same reply" }, observedAt: new Date(Date.parse(observedAt) - 60_000).toISOString(), visibility: "public", shareability: "presence-only", environment: "live", archived: false },
    ] as never;

    const normalized = cloneState(state);

    expect(normalized.mirrorObjects.filter((object) => object.externalRef.id === "same-reply")).toHaveLength(1);
    expect(duplicatePublicOutcomeEvidence(normalized, presence.id)).toEqual([]);
  });

  it("does not create two executions for a retried reply", () => {
    let state = fixture();
    state = formXReplyIntent(state, "A useful reply that should be sent once.", "post-retry");
    state = formXReplyIntent(state, "A useful reply that should be sent once.", "post-retry");
    expect(state.socialIntents).toHaveLength(1);
    expect(state.executions).toHaveLength(1);
  });

  it("allows distinct expressions in the same conversation while blocking an exact retry", () => {
    let state = fixture();
    state = formXReplyIntent(state, "The first useful reply.", "post-conversation");
    state = formXReplyIntent(state, "A different useful reply.", "post-conversation");
    state = formXReplyIntent(state, "The first useful reply.", "post-conversation");
    expect(state.socialIntents).toHaveLength(2);
    expect(state.executions).toHaveLength(2);
  });

  it("does not create two executions for a retried reaction or post", () => {
    let state = fixture();
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "post-like" } });
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "post-like" } });
    state = formChatPostIntent(state, "The same original post should not be published twice.");
    state = formChatPostIntent(state, "The same original post should not be published twice.");
    expect(state.executions).toHaveLength(2);
    expect(state.executions.filter((item) => item.affordance === "x.like")).toHaveLength(1);
    expect(state.executions.filter((item) => item.affordance === "x.post")).toHaveLength(1);
  });

  it("atomically gives different reply text for one target only one delivery slot", () => {
    const targetId = `post-race-${Date.now()}-${Math.random()}`;
    let state = fixture();
    state = formXReplyIntent(state, "First independently generated reply.", targetId);
    state = formXReplyIntent(state, "Second independently generated reply.", targetId);
    const [second, first] = state.executions;

    const claims = [reservePublicActionDelivery(first!), reservePublicActionDelivery(second!)];
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
    expect(claims[1]?.slot.executionId).toBe(first?.id);
  });

  it("notices duplicate world outcomes, cancels more work, and surfaces a safety event", () => {
    const targetId = `post-observed-duplicate-${Date.now()}-${Math.random()}`;
    let state = fixture();
    state.presence!.environment = "live";
    state.presence!.connectionMode = "bridge";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live", connectionMode: "bridge" } : presence);
    state = formXReplyIntent(state, "A queued third reply must be stopped.", targetId);
    const presenceId = state.presence!.id;
    const observedAt = new Date().toISOString();
    state.mirrorObjects.unshift(
      { id: "observed-target", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: targetId }, objectType: "post", author: { displayName: "Builder", handle: "builder" }, content: { text: "What should reliable social agents do after an uncertain write?" }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false } as never,
      { id: "observed-duplicate-1", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "reply-1" }, parentExternalRef: { type: "x.post", id: targetId }, objectType: "reply", actorPresenceId: presenceId, author: { displayName: "Agent" }, content: { text: "First public reply." }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false } as never,
      { id: "observed-duplicate-2", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "reply-2" }, parentExternalRef: { type: "x.post", id: targetId }, objectType: "reply", actorPresenceId: presenceId, author: { displayName: "Agent" }, content: { text: "Second public reply." }, observedAt, visibility: "public", shareability: "presence-only", environment: "live", archived: false } as never,
    );

    state = detectDuplicatePublicOutcomes(state, presenceId);
    expect(duplicatePublicOutcomeEvidence(state, presenceId)).toMatchObject([{
      target: { id: "observed-target", author: { displayName: "Builder", handle: "builder" } },
      replies: [{ id: "observed-duplicate-1" }, { id: "observed-duplicate-2" }],
    }]);
    expect(state.executions.find((execution) => execution.target?.id === targetId)?.status).toBe("cancelled");
    expect(state.events[0]).toMatchObject({ title: "Duplicate public replies detected", tone: "warning" });
  });

  it("notices a second verified execution immediately without waiting for Mirror polling", () => {
    const targetId = `post-immediate-duplicate-${Date.now()}-${Math.random()}`;
    let state = fixture();
    state.presence!.environment = "live";
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, environment: "live" } : presence);
    state = formXReplyIntent(state, "First verified wording.", targetId);
    state = formXReplyIntent(state, "Second verified wording.", targetId);
    const [second, first] = state.executions;
    Object.assign(first!, { status: "succeeded", externalRef: { type: "x.reply", id: "verified-reply-1" } });
    Object.assign(second!, { status: "succeeded", externalRef: { type: "x.reply", id: "verified-reply-2" } });

    state = detectDuplicateVerifiedExecutionOutcomes(state, second!.id);
    expect(state.events[0]).toMatchObject({ title: "Duplicate public replies detected", executionId: second!.id, tone: "warning" });
  });
});
