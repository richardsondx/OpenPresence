import { describe, expect, it } from "vitest";
import { addSandboxEvent, advanceSandboxTime, applyOperation, createAgent, deliverSandboxExecution, formSandboxIntent, resetPlaygroundSession, startPlaygroundSession } from "../lib/runtime";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Sandbox and Playground boundaries", () => {
  it("creates a persistent simulated environment for a new Presence", () => {
    const state = createAgent(input);
    expect(state.presence?.environment).toBe("sandbox");
    expect(state.sandboxEnvironments).toHaveLength(1);
    expect(state.sandboxEnvironments[0]?.connectorId).toContain("sandbox-connector");
  });

  it("keeps Sandbox, native X, and Bridge as one mutually exclusive route", () => {
    let state = createAgent(input);
    expect(state.presence?.connectionMode).toBe("sandbox");
    expect(state.presence?.environment).toBe("sandbox");

    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    expect(state.presence?.connectionMode).toBe("native");
    expect(state.presence?.environment).toBe("live");

    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "bridge" } });
    expect(state.presence?.connectionMode).toBe("bridge");
    expect(state.presence?.environment).toBe("live");

    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "sandbox" } });
    expect(state.presence?.connectionMode).toBe("sandbox");
    expect(state.presence?.environment).toBe("sandbox");
  });

  it("keeps Sandbox rehearsal available while the Presence route is live", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;

    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A thought worth rehearsing." });

    expect(state.presence?.connectionMode).toBe("native");
    expect(state.executions[0]?.environment).toBe("sandbox");
    expect(state.executions[0]?.connector).toBe("simulated");
  });

  it("normalizes inbound social activity through the Social Mirror", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", actorHandle: "@maya", content: "What are you learning about agents?" });
    const object = state.mirrorObjects.find((item) => item.sessionId === session.id);
    expect(object?.environment).toBe("sandbox");
    expect(object?.bridgeId).toBe(`sandbox:${session.environmentId}`);
    expect(object?.externalRef.type).toBe("x.post");
    expect(state.mirrorEvents[0]?.sessionId).toBe(session.id);
  });

  it("records X relationships through channel-native actions and reusable actors", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", actorHandle: "@maya", content: "A post worth replying to." });
    const post = state.mirrorObjects.find((item) => item.sessionId === session.id)!;
    const actor = state.sandboxActors.find((item) => item.sessionId === session.id)!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "reply", actorId: actor.id, content: "A reply with a real target.", targetExternalRef: post.externalRef });
    const reply = state.mirrorObjects.find((item) => item.simulationActionId === "reply");
    expect(state.sandboxActors).toHaveLength(1);
    expect(reply?.objectType).toBe("reply");
    expect(reply?.parentExternalRef).toEqual(post.externalRef);
    expect(reply?.externalRef.type).toBe("x.reply");
  });

  it("delivers only simulated executions and leaves a visible simulated object", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A useful first thought about building agents." });
    const execution = state.executions[0]!;
    expect(execution.connector).toBe("simulated");
    expect(execution.bridgeId).toContain("sandbox:");
    state = deliverSandboxExecution(state, execution.id);
    expect(state.executions[0]?.status).toBe("succeeded");
    expect(state.executions[0]?.externalRef?.id).toMatch(/^sandbox-/);
    expect(state.mirrorObjects[0]?.actorPresenceId).toBe(state.presence?.id);
    expect(state.nativeConnections).toHaveLength(0);
  });

  it("keeps review-mode replies pending instead of silently delivering them", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "A thoughtful question." });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "That is worth exploring.", target: state.mirrorObjects[0]?.externalRef });
    expect(state.executions[0]?.status).toBe("awaiting-review");
    expect(state.mirrorObjects.filter((item) => item.actorPresenceId === state.presence?.id)).toHaveLength(0);
  });

  it("advances virtual time and resets only the selected simulated session", () => {
    const original = createAgent(input);
    const filesBefore = original.files.map((file) => file.content);
    let state = startPlaygroundSession(original);
    const session = state.playgroundSessions[0]!;
    const before = session.virtualNow;
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "Hello from the simulated world." });
    state = advanceSandboxTime(state, session.id, 60);
    expect(new Date(state.playgroundSessions[0]!.virtualNow).getTime()).toBeGreaterThan(new Date(before).getTime());
    state = resetPlaygroundSession(state, session.id);
    expect(state.playgroundSessions).toHaveLength(1);
    expect(state.playgroundSessions[0]?.id).toBe(session.id);
    expect(state.playgroundSessions[0]?.status).toBe("active");
    expect(state.mirrorObjects).toHaveLength(0);
    expect(state.sandboxActors).toHaveLength(0);
    expect(state.files.map((file) => file.content)).toEqual(filesBefore);
  });
});
