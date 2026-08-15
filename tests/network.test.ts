import { describe, expect, it } from "vitest";
import { networkSearchInstruction, searchNetwork, searchSandboxNetwork } from "../lib/network";
import { relationshipProjection } from "../lib/network-memory";
import type { SandboxActor } from "../lib/types";
import { addSandboxEvent, applyOperation, createAgent, deliverSandboxExecution, formSandboxIntent, recordSandboxNetworkSearch, startPlaygroundSession } from "../lib/runtime";

const actors: SandboxActor[] = [
  {
    id: "actor-vet",
    sessionId: "session-1",
    displayName: "Avery Cole",
    handle: "@averysec",
    role: "community",
    profile: {
      bio: "Former military veteran now doing security engineering",
      location: "Detroit, Michigan",
      roles: ["security engineer"],
      skills: ["security", "incident response"],
      introductionPermission: "ask-first",
    },
    createdAt: "2026-08-13T12:00:00.000Z",
  },
  {
    id: "actor-unrelated",
    sessionId: "session-1",
    displayName: "Maya Chen",
    role: "audience",
    profile: { bio: "Product researcher", location: "Toronto, Ontario", introductionPermission: "not-available" },
    createdAt: "2026-08-13T12:00:00.000Z",
  },
];

describe("sandbox network search", () => {
  it("returns evidence-bearing candidates and preserves introduction consent", () => {
    const result = searchSandboxNetwork(actors, "session-1", "Former military veterans near Detroit who do security");
    expect(result.status).toBe("matches");
    expect(result.candidates[0]).toMatchObject({ actorId: "actor-vet", displayName: "Avery Cole", permission: "ask-first" });
    expect(result.candidates[0]?.evidence.join(" ")).toContain("Detroit, Michigan");
    expect(networkSearchInstruction(result)).toContain("ask before introducing");
    expect(networkSearchInstruction(result)).toContain("security engineer");
  });

  it("does not turn an unverified request into a fabricated match", () => {
    const result = searchSandboxNetwork(actors, "session-1", "Former astronaut near Mars");
    expect(result.status).toBe("no-match");
    expect(result.candidates).toHaveLength(0);
    expect(networkSearchInstruction(result)).toContain("Do not imply that a person was found");
  });

  it("keeps one sandbox directory isolated from another", () => {
    const result = searchSandboxNetwork(actors, "other-session", "Detroit security");
    expect(result.status).toBe("no-match");
  });

  it("persists profile evidence when a simulated actor is seeded", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, {
      sessionId: session.id,
      actionId: "post",
      actorName: "Avery Cole",
      profile: actors[0]!.profile,
      content: "I work in security engineering in Detroit.",
    });
    expect(state.sandboxActors[0]?.profile).toEqual(actors[0]?.profile);
  });

  it("keeps search retrieval separate from memory and introductions", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { message: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Avery Cole", actorHandle: "@averysec", profile: actors[0]!.profile, content: "I work in security engineering in Detroit." });
    const result = searchSandboxNetwork(state.sandboxActors, session.id, "Former military veterans near Detroit who do security");
    state = recordSandboxNetworkSearch(state, { sessionId: session.id, presenceId: session.presenceId, result });
    expect(state.networkSearches[0]?.status).toBe("matches");
    expect(state.networkIntroductions).toHaveLength(0);
    expect(state.people).toHaveLength(0);
    expect(state.relationships).toHaveLength(0);
  });

  it("returns provider-neutral candidates without creating durable records", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Avery Cole", profile: actors[0]!.profile, content: "Security engineering in Detroit." });
    const result = searchNetwork(state, state.presence!, { query: "Detroit security engineer", scope: "presence", sessionId: session.id });
    expect(result.candidates[0]).toMatchObject({ displayName: "Avery Cole", relationshipStatus: "observed", candidateSource: "sandbox-directory" });
    expect(result.candidates[0]?.personId).toBeUndefined();
    expect(state.people).toHaveLength(0);
  });

  it("requires both parties to consent before an introduction is complete", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const presenceId = state.presence!.id;
    state = applyOperation(state, { type: "createIntroductionRecord", presenceId, requesterActorId: "requester", candidateActorId: "candidate" });
    const record = state.introductionRecords[0]!;
    expect(record.state).toBe("offered");
    state = applyOperation(state, { type: "respondIntroductionConsent", id: record.id, party: "requester", consent: true });
    expect(state.introductionRecords[0]?.state).toBe("candidate_contact_pending");
    expect(state.introductionRecords[0]?.candidateConsent).toBe("unknown");
    state = applyOperation(state, { type: "respondIntroductionConsent", id: record.id, party: "candidate", consent: true });
    expect(state.introductionRecords[0]?.state).toBe("introduced");
  });

  it("curates only meaningful replied-to evidence, preserves provenance, and honors forget", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Avery Cole", actorHandle: "@averysec", profile: actors[0]!.profile, content: "I work in security engineering in Detroit and help teams recover from incidents." });
    const inbound = state.mirrorObjects[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", target: inbound.externalRef, text: "That incident-response experience sounds useful for the teams building calmer operational systems." });
    const execution = state.executions[0]!;
    state = deliverSandboxExecution(state, execution.id);
    expect(state.people[0]?.displayName).toBe("Avery Cole");
    expect(state.relationships[0]?.lastMeaningfulInteractionAt).toBeDefined();
    expect(state.relationshipFacts[0]).toMatchObject({ epistemicKind: "stated_by_person", provenanceRefs: [{ kind: "mirror_object", id: inbound.id }] });
    const relationshipId = state.relationships[0]!.id;
    state = applyOperation(state, { type: "forgetRelationship", relationshipId });
    expect(state.people[0]?.memoryState).toBe("forgotten");
    const forgotten = state.relationshipFacts.length;
    state = deliverSandboxExecution(state, execution.id);
    expect(state.relationshipFacts).toHaveLength(forgotten);
  });

  it("keeps Presence-only corrections out of recipient-shareable context", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = applyOperation(state, { type: "rememberPerson", presenceId: state.presence!.id, externalActorId: "maya-1", displayName: "Maya Chen" });
    const relationshipId = state.relationships[0]!.id;
    state = applyOperation(state, { type: "correctRelationshipFact", relationshipId, statement: "Maya prefers product research conversations." });
    expect(relationshipProjection(state, state.people[0]!.id, state.presence!.id)?.facts).toHaveLength(1);
    expect(relationshipProjection(state, state.people[0]!.id, state.presence!.id, true)?.facts).toHaveLength(0);
  });
});
