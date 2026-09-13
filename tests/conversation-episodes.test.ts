import { describe, expect, it } from "vitest";
import { applyConversationDisposition, conversationDispositionForAction, createConversationEpisode, loopRiskForEpisode, settleConversationClosure, shouldEvaluateConversationObject, updateConversationEpisodeFromMirror } from "../lib/conversation-episodes";
import { initialState } from "../lib/runtime";
import type { MirrorObject } from "../lib/types";

function mirror(id: string, actorPresenceId: string | undefined, text: string, parentExternalRef?: MirrorObject["externalRef"], occurredAt = "2026-08-15T12:00:00.000Z"): MirrorObject {
  return {
    id, bridgeId: "sandbox:test", presenceId: "presence-1", channelId: "x", externalRef: { type: "x.post", id }, parentExternalRef,
    conversationExternalRef: "root-1", objectType: actorPresenceId ? "reply" : "post", author: { externalRef: { type: "x.user", id: actorPresenceId ? "agent" : "person-1" }, displayName: actorPresenceId ? "Genny" : "Boardy" },
    content: { text }, occurredAt, observedAt: occurredAt, visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "session-1", actorPresenceId,
  };
}

describe("Conversation Episodes", () => {
  it("keeps one Presence-centric branch together and separates unrelated roots", () => {
    const state = initialState();
    state.presences = [{ id: "presence-1", channel: "x", name: "Genny", handle: "@genny", mode: "agent", status: "live", accent: "#000", capabilities: [], execution: {}, executionEnvelope: { presenceId: "presence-1", affordances: {}, pacingProfile: "recommended", accountProtection: "guidance" }, context: {} as never, brief: {} as never, publicSelf: {} as never, mediaPerceptionPolicy: "use-judgment", languagePolicy: { prohibited: [], avoid: [] }, pacing: "recommended", attentionIntervalMinutes: 5, quietHours: { enabled: false, start: "22:00", end: "07:00" }, publishingInitiative: { mode: "adaptive", timezone: "UTC", createdAt: "2026-08-15T12:00:00.000Z", updatedAt: "2026-08-15T12:00:00.000Z" }, accountHealth: "healthy", environment: "sandbox", connectionMode: "sandbox" }];
    state.presence = state.presences[0]!;
    const external = mirror("external-1", undefined, "Here is the useful question.");
    const agent = mirror("agent-1", "presence-1", "A specific answer.", external.externalRef);
    const followUp = mirror("external-2", undefined, "One more question.", agent.externalRef);
    const unrelated = { ...mirror("external-3", undefined, "Separate conversation."), conversationExternalRef: "root-2", parentExternalRef: undefined };
    state.mirrorObjects = [external, agent, followUp, unrelated];
    const first = createConversationEpisode(state, external);
    state.conversationEpisodes.push(first);
    updateConversationEpisodeFromMirror(state, agent);
    const same = updateConversationEpisodeFromMirror(state, followUp)!;
    expect(same.id).toBe(first.id);
    expect(same.agentTurnCount).toBe(1);
    expect(same.externalTurnCount).toBe(2);
    const other = updateConversationEpisodeFromMirror(state, unrelated)!;
    expect(other.id).not.toBe(first.id);
  });

  it("does not claim verified closure before the public act exists", () => {
    const state = initialState();
    const object = mirror("external-1", undefined, "Thanks!");
    state.mirrorObjects = [object];
    const episode = createConversationEpisode(state, object);
    state.conversationEpisodes.push(episode);
    applyConversationDisposition(state, episode.id, "close_with_reply", "One final useful answer is appropriate.", "intent-1");
    expect(episode.status).toBe("closing");
    settleConversationClosure(state, episode.id, "failed", "Delivery failed");
    expect(episode.status).toBe("cooling");
    expect(episode.closedAt).toBeUndefined();
    settleConversationClosure(state, episode.id, "verified");
    expect(episode.status).toBe("closed");
    expect(episode.closedAt).toBeDefined();
  });

  it("keeps an explicitly continuing exchange eligible after reply verification", () => {
    const state = initialState();
    const object = mirror("external-continue", undefined, "A question worth answering.");
    state.mirrorObjects = [object];
    const episode = createConversationEpisode(state, object);
    state.conversationEpisodes.push(episode);
    applyConversationDisposition(state, episode.id, "continue", "There is still a useful opening.", "intent-continue");
    settleConversationClosure(state, episode.id, "verified", "The reply was observed.");
    expect(episode.status).toBe("active");
    expect(episode.closedAt).toBeUndefined();
  });

  it("keeps generic acknowledgments closed while allowing substantive reopening", () => {
    const state = initialState();
    const first = mirror("external-1", undefined, "A real question.");
    const agent = mirror("agent-1", "presence-1", "A real answer.", first.externalRef);
    const generic = mirror("external-2", undefined, "Absolutely.", agent.externalRef);
    const substantive = mirror("external-3", undefined, "Actually, how does this work across Presences?", agent.externalRef);
    state.mirrorObjects = [first, agent, generic, substantive];
    const episode = createConversationEpisode(state, first);
    state.conversationEpisodes.push(episode);
    updateConversationEpisodeFromMirror(state, agent);
    applyConversationDisposition(state, episode.id, "close_silently", "Nothing meaningful remains unresolved.");
    expect(shouldEvaluateConversationObject(state, generic)).toMatchObject({ eligible: false });
    expect(shouldEvaluateConversationObject(state, substantive)).toMatchObject({ eligible: true, episode });
  });

  it("treats rapid reciprocal volume as a reconsideration gate, not an automatic stop", () => {
    const state = initialState();
    const first = mirror("external-1", undefined, "Question");
    const agent1 = mirror("agent-1", "presence-1", "Answer", first.externalRef);
    const external2 = mirror("external-2", undefined, "New evidence", agent1.externalRef);
    const agent2 = mirror("agent-2", "presence-1", "Another answer", external2.externalRef);
    const external3 = mirror("external-3", undefined, "One more detail", agent2.externalRef);
    state.mirrorObjects = [first, agent1, external2, agent2, external3];
    const episode = createConversationEpisode(state, first);
    state.conversationEpisodes.push(episode);
    for (const object of [agent1, external2, agent2]) updateConversationEpisodeFromMirror(state, object);
    expect(loopRiskForEpisode(state, episode, external3, new Date("2026-08-15T12:01:00.000Z").getTime())).toBe(true);
  });

  it("maps acts to dispositions without turning NO_OP into a failure", () => {
    expect(conversationDispositionForAction("no_op")).toBe("close_silently");
    expect(conversationDispositionForAction("like")).toBe("react_only");
    expect(conversationDispositionForAction("reply")).toBe("continue");
    expect(conversationDispositionForAction("reply", "defer")).toBe("defer");
  });
});
