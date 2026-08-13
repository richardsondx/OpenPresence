import { describe, expect, it } from "vitest";
import { writeState } from "../lib/db";
import { POST as statePost } from "../app/api/state/route";
import { addSandboxEvent, advanceSandboxTime, applyOperation, confirmAutoMode, createAgent, deliverSandboxExecution, expireSandboxIntents, formSandboxIntent, resetPlaygroundSession, startPlaygroundSession } from "../lib/runtime";

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
    expect(state.events.find((item) => item.title === "Sandbox event observed")?.sourceObjectId).toBe(object?.id);
  });

  it("keeps targeted Sandbox decision lineage on the observed target", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A post with a precise target." });
    const post = state.mirrorObjects.find((item) => item.simulationActionId === "post")!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "A grounded response.", target: post.externalRef });
    const intentEvent = state.events.find((item) => item.title === "Social Intent formed");
    expect(intentEvent?.sourceObjectId).toBe(post.id);
  });

  it("stores raw simulated media separately and records truthful insufficient perception", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "Look at this.", assets: [{ name: "meme.png", kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" }] });
    const object = state.mirrorObjects[0]!;
    const asset = state.assets[0]!;
    const perception = state.perceptions[0]!;
    expect(object.assetRefs).toEqual([{ assetId: asset.id, kind: "image", role: "primary" }]);
    expect(asset.environment).toBe("sandbox");
    expect(asset.sessionId).toBe(session.id);
    expect(perception.result.uncertainty).toBe("insufficient");
    expect(perception.result.observation).toContain("not been successfully interpreted");
    const blocked = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "I can see this.", target: object.externalRef });
    expect(blocked.executions).toHaveLength(0);
    expect(blocked.events[0]?.title).toBe("Media needs inspection");
  });

  it("keeps uncertain media actions as real review executions", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { mediaPerceptionPolicy: "review-uncertain", execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "The image needs a careful read.", assets: [{ name: "evidence.png", kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" }] });
    const object = state.mirrorObjects[0]!;
    const perception = state.perceptions[0]!;
    state.perceptions[0] = { ...perception, level: "inspect", result: { ...perception.result, observation: "A low-contrast evidence image was inspected.", uncertainty: "medium" } };

    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "The image leaves one important detail unresolved.", target: object.externalRef });

    expect(state.socialIntents[0]?.state).toBe("active");
    expect(state.executions[0]?.status).toBe("awaiting-review");
    expect(state.executions[0]?.reviewReason).toContain("media remains uncertain");
    expect(state.events[0]?.title).toBe("Media action needs review");
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

  it("requires a stable confirmation set before enabling Auto for pending replies", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "A question that deserves a careful answer." });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "A grounded response.", target: state.mirrorObjects[0]?.externalRef });
    const execution = state.executions[0]!;

    expect(() => confirmAutoMode(state, state.presence!.id, ["reply"], [])).toThrow("pending review actions changed");

    const confirmed = confirmAutoMode(state, state.presence!.id, ["reply"], [execution.id]);
    expect(confirmed.presence?.execution.reply).toBe("auto");
    expect(confirmed.executions[0]?.status).toBe("queued");
    expect(confirmed.events.some((event) => event.title === "Approved for execution")).toBe(true);
  });

  it("delivers an approved Sandbox review through the state API exactly once", async () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "An approved rehearsal post." });
    const intent = state.socialIntents[0]!;
    const execution = state.executions[0]!;
    writeState(state);

    const approve = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "approveExecution", id: execution.id }), headers: { "content-type": "application/json" } }));
    expect(approve.status).toBe(200);
    expect((await approve.json()).executions.find((item: { id: string }) => item.id === execution.id)?.status).toBe("approved");

    const execute = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "executeIntent", id: intent.id }), headers: { "content-type": "application/json" } }));
    const delivered = await execute.json();
    expect(execute.status).toBe(200);
    expect(delivered.executions.find((item: { id: string }) => item.id === execution.id)?.status).toBe("succeeded");
    expect(delivered.mirrorObjects.filter((item: { originExecutionId?: string }) => item.originExecutionId === execution.id)).toHaveLength(1);
    expect(delivered.outcomes.filter((item: { executionId?: string }) => item.executionId === execution.id)).toHaveLength(1);
  });

  it("confirms and delivers every pending Sandbox reply in one state transition", async () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "A question for the Presence." });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "A useful answer from Jenny.", target: state.mirrorObjects[0]?.externalRef });
    const execution = state.executions[0]!;
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "confirmAutoMode", presenceId: state.presence!.id, capabilities: ["reply"], executionIds: [execution.id] }), headers: { "content-type": "application/json" } }));
    const confirmed = await response.json();
    expect(response.status).toBe(200);
    expect(confirmed.presence.execution.reply).toBe("auto");
    expect(confirmed.executions.find((item: { id: string }) => item.id === execution.id)?.status).toBe("succeeded");
    expect(confirmed.mirrorObjects.filter((item: { originExecutionId?: string }) => item.originExecutionId === execution.id)).toHaveLength(1);
  });

  it("keeps off affordances truthful and can deliver empty-text signals", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A post worth passing along." });
    const target = state.mirrorObjects[0]!.externalRef;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "repost", text: "", target });
    expect(state.executions).toHaveLength(0);
    expect(state.socialIntents[0]?.state).toBe("withdrawn");
    expect(state.events[0]?.title).toBe("Affordance is off");

    state = applyOperation(state, { type: "setPresence", patch: { execution: { repost: "auto" } } });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "repost", text: "", target });
    const execution = state.executions[0]!;
    expect(execution.status).toBe("queued");
    state = deliverSandboxExecution(state, execution.id);
    expect(state.mirrorObjects[0]?.objectType).toBe("repost");
    expect(state.mirrorObjects[0]?.content?.text).toBeUndefined();
  });

  it("accepts chart evidence as a first-class Sandbox asset", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Owen", content: "The chart needs its denominator.", assets: [{ name: "chart.png", kind: "chart", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" }] });
    expect(state.assets[0]?.type).toBe("chart");
    expect(state.mirrorObjects[0]?.assetRefs?.[0]?.kind).toBe("chart");
  });

  it("keeps chart evidence supported for persisted X definitions without media metadata", () => {
    let state = createAgent(input);
    state.channelDefinitions = state.channelDefinitions.map((definition) => definition.id === "x" ? { ...definition, supportedAssetKinds: undefined } : definition);
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Owen", content: "The denominator is the point.", assets: [{ name: "chart.png", kind: "chart", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" }] });
    expect(state.mirrorObjects[0]?.assetRefs?.[0]?.kind).toBe("chart");
  });

  it("expires pending Sandbox intentions when virtual time passes their useful window", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A question worth answering." });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "A timely answer.", target: state.mirrorObjects[0]?.externalRef });
    const intentId = state.socialIntents[0]!.id;
    expect(state.executions[0]?.status).toBe("awaiting-review");
    state = advanceSandboxTime(state, session.id, 61);
    state = expireSandboxIntents(state, session.id);
    expect(state.socialIntents.find((item) => item.id === intentId)?.state).toBe("expired");
    expect(state.executions[0]?.status).toBe("expired");
    expect(state.events[0]?.title).toBe("Sandbox intention expired");
  });

  it("does not let simulated delivery become Presence-level public footing", () => {
    let state = createAgent(input);
    state = startPlaygroundSession(state);
    const first = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: first.id, affordance: "post", text: "A simulated point of view." });
    state = deliverSandboxExecution(state, state.executions[0]!.id);
    expect(state.presence?.context.publicFooting).toBeUndefined();
    state = startPlaygroundSession(state);
    const second = state.playgroundSessions[0]!;
    expect(second.judgedObjectIds).toEqual([]);
    expect(state.mirrorObjects.filter((item) => item.sessionId === second.id)).toHaveLength(0);
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
    expect(state.assets).toHaveLength(0);
    expect(state.perceptions).toHaveLength(0);
    expect(state.files.map((file) => file.content)).toEqual(filesBefore);
  });

  it("keeps media posture on the Presence boundary", () => {
    const agentState = createAgent(input);
    expect(agentState.presence?.mediaPerceptionPolicy).toBe("use-judgment");
    const ghostState = createAgent({ ...input, mode: "ghost" as const });
    expect(ghostState.presence?.mediaPerceptionPolicy).toBe("review-uncertain");
    const updated = applyOperation(agentState, { type: "setPresence", patch: { mediaPerceptionPolicy: "always-review" } });
    expect(updated.presence?.mediaPerceptionPolicy).toBe("always-review");
  });
});
