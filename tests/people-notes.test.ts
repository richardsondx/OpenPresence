import { describe, expect, it } from "vitest";
import { addSandboxEvent, applyOperation, createAgent, deliverSandboxExecution, formSandboxIntent, startPlaygroundSession } from "../lib/runtime";
import { cognitionSafeDMInstructionsForObject, cognitionSafeDMInstructionsProjection, cognitionSafePeopleNoteProjection, readPeopleNote } from "../lib/people-notes";

describe("Presence-scoped People Notes and private-message guidance", () => {
  it("scopes People Notes to the active Presence and person", () => {
    let state = createAgent({ name: "Jenny", description: "A social agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const presence = state.presence!;
    state = applyOperation(state, { type: "rememberPerson", presenceId: presence.id, channel: "x", externalActorId: "maya", displayName: "Maya", handle: "maya" });
    const person = state.people[0]!;
    state = applyOperation(state, { type: "updatePeopleNote", presenceId: presence.id, personId: person.id, markdown: "Interested in careful agent memory.", source: "operator" });
    expect(readPeopleNote(state, presence.id, person.id)).toMatchObject({ markdown: "Interested in careful agent memory.", revision: 1 });
    expect(cognitionSafePeopleNoteProjection(state, presence, person.id)?.markdown).toContain("careful agent memory");
    expect(cognitionSafePeopleNoteProjection(state, presence, "other-person")).toBeUndefined();
    expect(cognitionSafePeopleNoteProjection(state, { ...presence, id: "other-presence" }, person.id)).toBeUndefined();
  });

  it("persists operator-authored private-message guidance without creating a Brain change", () => {
    let state = createAgent({ name: "Jenny", description: "A social agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const presence = state.presence!;
    state = applyOperation(state, { type: "setPresenceDMInstructions", presenceId: presence.id, condition: "When they provide a profile link", instructions: "Reply with the approved next-step URL. Be honest about whether work has completed.", source: "operator" });
    const projection = cognitionSafeDMInstructionsProjection(state.presence!);
    expect(projection).toMatchObject({ when: "private_message_arrives", condition: "When they provide a profile link", instructions: "Reply with the approved next-step URL. Be honest about whether work has completed." });
    expect(state.files.filter((file) => file.protected).map((file) => file.content)).not.toContain(expect.stringContaining("approved next-step URL"));
    state = applyOperation(state, { type: "setPresenceDMInstructions", presenceId: presence.id, instructions: "", source: "operator" });
    expect(cognitionSafeDMInstructionsProjection(state.presence!)).toBeUndefined();
  });

  it("projects private-message guidance only for a direct-message object", () => {
    let state = createAgent({ name: "Jenny", description: "A social agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const presence = state.presence!;
    state = applyOperation(state, { type: "setPresenceDMInstructions", presenceId: presence.id, instructions: "Use the private hook for this turn.", source: "operator" });
    const base = { id: "object", bridgeId: "bridge", presenceId: presence.id, channelId: "x" as const, externalRef: { type: "x.message", id: "object" }, objectType: "message", author: { displayName: "Maya" }, content: { text: "Hello" }, observedAt: new Date().toISOString(), visibility: "direct-message" as const, shareability: "presence-only" as const, environment: "sandbox" as const };
    expect(cognitionSafeDMInstructionsForObject(state.presence!, base)?.instructions).toContain("private hook");
    expect(cognitionSafeDMInstructionsForObject(state.presence!, { ...base, objectType: "post", visibility: "public" })).toBeUndefined();
  });

  it("keeps DM guidance isolated between Presences", () => {
    let state = createAgent({ name: "Jenny", description: "A social agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    const firstPresence = state.presence!;
    state = applyOperation(state, { type: "setPresenceDMInstructions", presenceId: firstPresence.id, instructions: "Use the first Presence hook.", source: "operator" });
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", name: "Jenny Builds", handle: "@jenny-builds", mode: "agent", accent: "#4F7CAC" } });
    const secondPresence = state.presence!;
    expect(cognitionSafeDMInstructionsProjection(state.presences.find((item) => item.id === firstPresence.id)!)).toMatchObject({ instructions: "Use the first Presence hook." });
    expect(cognitionSafeDMInstructionsProjection(secondPresence)).toBeUndefined();
  });

  it("keeps a simulated private reply private and addressed to the sender", () => {
    let state = applyOperation(createAgent({ name: "Jenny", description: "A social agent", mode: "agent", handle: "@jenny", accent: "#D68754" }), { type: "setPresence", patch: { connectionMode: "sandbox", execution: { message: "auto" } } });
    state = startPlaygroundSession(state, state.presence!.id);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "message", actorName: "Maya", actorHandle: "maya", content: "Please send me the next step." });
    const inbound = state.mirrorObjects[0]!;
    expect(inbound.visibility).toBe("direct-message");
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "message", text: "Here is the next step.", target: inbound.author!.externalRef });
    const execution = state.executions[0]!;
    const delivered = deliverSandboxExecution(state, execution.id);
    const reply = delivered.mirrorObjects.find((item) => item.originExecutionId === execution.id)!;
    expect(reply.visibility).toBe("direct-message");
    expect(reply.parentExternalRef).toEqual(inbound.author!.externalRef);
  });
});
