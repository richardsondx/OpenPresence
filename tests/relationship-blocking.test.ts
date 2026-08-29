import { describe, expect, it } from "vitest";
import {
  clearPersonBlockFromExecution,
  applyOperation,
  createAgent,
  derivePresenceCapabilityManifest,
  formXActionIntent,
  formXReplyIntent,
  isPersonBlockingError,
  recordPersonBlockedFromExecution,
  targetIsBlockedByPerson,
} from "../lib/runtime";

function stateWithObservedPerson() {
  const state = createAgent({ name: "Boundary Test", description: "Test", audience: "Testers", mode: "agent", handle: "@boundary_test", accent: "#777777" });
  const presence = {
    ...state.presence!,
    status: "live" as const,
    channel: "x" as const,
    environment: "live" as const,
    execution: { ...state.presence!.execution, reply: "auto" as const, like: "auto" as const, follow: "auto" as const },
  };
  state.presence = presence;
  state.presences = [presence];
  state.mirrorObjects = [{
    id: "mirror_blocked_post",
    bridgeId: "bridge_boundary_test",
    presenceId: presence.id,
    channelId: "x",
    externalRef: { type: "x.post", id: "blocked_post" },
    objectType: "post",
    author: { externalRef: { type: "x.user", id: "person_123" }, displayName: "Boundary Person", handle: "boundaryperson" },
    language: "en",
    content: { text: "A public post", language: "en" },
    observedAt: new Date().toISOString(),
    visibility: "public",
    shareability: "presence-only",
    archived: false,
    environment: "live",
  } as never];
  const observedAt = new Date().toISOString();
  state.people.push({ id: "person_boundary", agentId: state.agent!.id, displayName: "Boundary Person", memoryState: "active", createdAt: observedAt, updatedAt: observedAt } as never);
  state.personIdentities.push({ id: "identity_boundary", personId: "person_boundary", channel: "x", externalActorId: "person_123", sourcePresenceId: presence.id, sourceEnvironment: "live", displayName: "Boundary Person", handle: "boundaryperson", createdAt: observedAt, updatedAt: observedAt } as never);
  state.relationships.push({ id: "relationship_boundary", agentId: state.agent!.id, personId: "person_boundary", state: "active", createdAt: observedAt, updatedAt: observedAt } as never);
  return state;
}

describe("blocked-person relationship learning", () => {
  it("recognizes only explicit blocking evidence", () => {
    expect(isPersonBlockingError("This author has blocked you, so you can't perform this action")).toBe(true);
    expect(isPersonBlockingError("Forbidden", "TARGET_BLOCKED_PRESENCE")).toBe(true);
    expect(isPersonBlockingError("Forbidden: this request is not permitted", "HTTP_403")).toBe(false);
  });

  it("persists the boundary, cancels pending work, and suppresses automatic candidates", () => {
    let state = stateWithObservedPerson();
    state = formXReplyIntent(state, "A useful reply", "blocked_post");
    const person = state.people.find((item) => item.displayName === "Boundary Person")!;
    const observedAt = new Date().toISOString();
    state.relationshipPolicies.push({ id: "policy_boundary", agentId: state.agent!.id, presenceId: state.presence!.id, personId: person.id, learning: "selective", engagement: "maintain_relationship", createdAt: observedAt, updatedAt: observedAt });
    state.watches.push({ id: "watch_boundary", agentId: state.agent!.id, presenceId: state.presence!.id, channel: "x", kind: "creator", title: "Boundary person", query: "@boundaryperson", target: { personId: person.id, channel: "x", externalActorId: "person_123", handle: "boundaryperson", identityStatus: "verified" }, state: "active", observation: { status: "watching", source: "automatic", observedCount: 1, baseline: "ready" }, createdAt: observedAt, updatedAt: observedAt });
    state.watchSignals.push({ id: "signal_boundary", watchId: "watch_boundary", personId: person.id, presenceId: state.presence!.id, mirrorObjectId: "mirror_blocked_post", signalType: "new_content", disposition: "pending", createdAt: observedAt, updatedAt: observedAt });
    state = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "blocked_post" } });
    const failedExecutionId = state.executions.find((item) => item.affordance === "x.reply")!.id;
    const pendingLikeId = state.executions.find((item) => item.affordance === "x.like")!.id;

    state = recordPersonBlockedFromExecution(state, failedExecutionId, "This author has blocked you, so you can't perform this action", "browser_delivery");

    const identity = state.personIdentities.find((item) => item.externalActorId === "person_123");
    expect(identity?.contactability?.status).toBe("blocked_by_person");
    expect(identity?.sourcePresenceId).toBe(state.presence!.id);
    expect(state.executions.find((item) => item.id === pendingLikeId)?.status).toBe("cancelled");
    expect(targetIsBlockedByPerson(state, state.presence!.id, { type: "x.post", id: "blocked_post" })).toBe(true);
    expect(state.relationshipFacts.some((fact) => fact.statement === "This person has blocked this Presence on X." && fact.visibility === `presence:${state.presence!.id}`)).toBe(true);
    const autobiographicalEvent = state.autobiographicalEvents.find((event) => event.kind === "relationship_boundary" && event.counterpartyPersonId === identity?.personId);
    expect(autobiographicalEvent).toMatchObject({ agentId: state.agent!.id, presenceId: state.presence!.id, facts: { boundary: "blocked", reasonKnown: false, channel: "x" } });
    expect(autobiographicalEvent?.evidenceRefs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "social_intent", id: expect.any(String) })]));
    expect(autobiographicalEvent?.facts).not.toHaveProperty("emotionalAngles");
    expect(state.relationshipPolicies.find((policy) => policy.id === "policy_boundary")?.engagement).toBe("observe_only");
    expect(state.watches.find((watch) => watch.id === "watch_boundary")?.state).toBe("paused");
    expect(state.watchSignals.find((signal) => signal.id === "signal_boundary")?.disposition).toBe("dismissed");
    expect(state.events[0]).toMatchObject({ type: "memory", title: `${state.presence!.name} noticed a relationship boundary` });
    const blockedCapabilities = derivePresenceCapabilityManifest(state, state.presence!.id, { target: { type: "x.post", id: "blocked_post" } });
    expect(blockedCapabilities.items.filter((item) => ["reply", "like", "repost", "quote", "follow"].includes(item.capability)).every((item) => !item.canExecute)).toBe(true);

    const executionCount = state.executions.length;
    state = formXReplyIntent(state, "Do not form this", "blocked_post");
    state = formXActionIntent(state, { affordance: "x.follow", target: { type: "x.user", id: "person_123" } });
    expect(state.executions).toHaveLength(executionCount);
    const watchCount = state.watches.length;
    state = applyOperation(state, { type: "createWatch", presenceId: state.presence!.id, query: "@boundaryperson", purpose: "Try to monitor this blocked person." });
    expect(state.watches).toHaveLength(watchCount);
    expect(state.events[0]).toMatchObject({ title: "Watch not added" });
  });

  it("permits an explicit operator recheck and clears the boundary only after verification", () => {
    let state = stateWithObservedPerson();
    state = formXReplyIntent(state, "Initial reply", "blocked_post");
    const firstExecutionId = state.executions[0]!.id;
    state = recordPersonBlockedFromExecution(state, firstExecutionId, "The author has blocked you", "browser_delivery");

    state = formXReplyIntent(state, "Operator-requested recheck", "blocked_post", "directive_recheck");
    const recheck = state.executions.find((item) => item.operatorDirectiveId === "directive_recheck");
    expect(recheck).toBeDefined();

    state = clearPersonBlockFromExecution(state, recheck!.id);
    const identity = state.personIdentities.find((item) => item.externalActorId === "person_123");
    expect(identity?.contactability?.status).toBe("available");
    expect(targetIsBlockedByPerson(state, state.presence!.id, { type: "x.user", id: "person_123" })).toBe(false);
    expect(state.relationshipFacts.find((fact) => fact.statement === "This person has blocked this Presence on X.")?.validTo).toBeTruthy();
    expect(state.autobiographicalEvents[0]).toMatchObject({ kind: "relationship_boundary", facts: { boundary: "available", priorBoundary: "blocked" } });
  });
});
