import { describe, expect, it, vi } from "vitest";
import { writeState } from "../lib/db";
import { claimExecutions, createBridgeWithKey } from "../lib/bridge";
import * as x from "../lib/x";
import { deliverNativeExecutions } from "../lib/native-execution-delivery";
import { GET as stateGet, POST as statePost } from "../app/api/state/route";
import { addSandboxEvent, advanceSandboxTime, advanceSandboxTimeWithTemporalEvents, applyOperation, beginOriginalPostRehearsal, completeOriginalPostRehearsal, confirmAutoMode, createAgent, deliverSandboxExecution, expireSandboxIntents, formSandboxIntent, recordPreferenceEvidence, resetPlaygroundSession, startPlaygroundSession, syncPlaygroundTime } from "../lib/runtime";
import type { OpenPresenceState } from "../lib/types";
import { SandboxTemporalKernel } from "../lib/sandbox-temporal";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Sandbox and Playground boundaries", () => {
  it("isolates every Playground world by Presence while keeping the Agent mind shared", () => {
    let state = createAgent(input);
    const agentId = state.agent!.id;
    const firstPresenceId = state.presence!.id;
    const sharedMind = state.files.filter((file) => ["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "SKILLS"].includes(file.kind)).map((file) => `${file.kind}:${file.content}`).join("\n");
    state = startPlaygroundSession(state, firstPresenceId);
    const firstSession = state.playgroundSessions.find((session) => session.presenceId === firstPresenceId)!;
    state = addSandboxEvent(state, { sessionId: firstSession.id, actionId: "post", actorName: "X audience", actorHandle: "@x_audience", content: "X-only rehearsal context." });

    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", name: "Jenny LinkedIn", handle: "@jenny_linkedin", mode: "agent", accent: "#4F7CAC" } });
    const secondPresenceId = state.presence!.id;
    state = startPlaygroundSession(state, secondPresenceId);
    const secondSession = state.playgroundSessions.find((session) => session.presenceId === secondPresenceId)!;

    expect(secondSession.id).not.toBe(firstSession.id);
    expect(secondSession.environmentId).not.toBe(firstSession.environmentId);
    expect(secondSession.channelId).toBe("linkedin");
    expect(state.mirrorObjects.filter((object) => object.sessionId === secondSession.id)).toHaveLength(0);
    expect(state.sandboxActors.filter((actor) => actor.sessionId === secondSession.id)).toHaveLength(0);
    expect(state.agent?.id).toBe(agentId);
    expect(state.files.filter((file) => ["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "SKILLS"].includes(file.kind)).map((file) => `${file.kind}:${file.content}`).join("\n")).toBe(sharedMind);

  });

  it("creates a persistent simulated environment for a new Presence", () => {
    const state = createAgent(input);
    expect(state.presence?.environment).toBe("sandbox");
    expect(state.sandboxEnvironments).toHaveLength(1);
    expect(state.sandboxEnvironments[0]?.connectorId).toContain("sandbox-connector");
  });

  it("does not expose deferred Sandbox truth through the state response", async () => {
    let state = startPlaygroundSession(createAgent(input), undefined, "replay", "hidden-truth-response");
    const session = state.playgroundSessions[0]!;
    const kernel = SandboxTemporalKernel.fromSnapshot(session.temporalSnapshot!);
    const cause = kernel.scheduleEvent({ id: "hidden-response-cause", type: "world_cause", offsetMs: 60_000 });
    kernel.scheduleDelayedOutcome({ id: "hidden-response-outcome", causeEventId: cause.id, offsetMs: 120_000, value: { canary: "SECRET" } });
    session.temporalSnapshot = kernel.snapshot();
    writeState(state);
    const response = await stateGet(new Request("http://localhost/api/state", { method: "GET" }));
    const exposed = await response.json() as OpenPresenceState;
    const exposedSession = exposed.playgroundSessions.find((item) => item.id === session.id)!;
    expect(response.status).toBe(200);
    expect(exposedSession.temporalSnapshot?.deferredOutcomeValues).toBeUndefined();
    expect(JSON.stringify(exposed)).not.toContain("SECRET");
  });

  it("rejects a live Assignment attached to a Playground session", () => {
    const state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    expect(() => applyOperation(state, { type: "createAssignment", presenceId: session.presenceId, sessionId: session.id, environment: "live", instruction: "Probe a live escape." })).toThrow(/Playground session can only own Sandbox Assignments/);
  });

  it("persists ordered temporal calendar events through a multi-day advance", () => {
    const state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    const tomorrow = new Date(Date.parse(session.virtualNow) + 24 * 60 * 60 * 1000);
    const day = tomorrow.toLocaleDateString("en-US", { weekday: "long" });
    state.calendar = [{ id: "calendar-temporal-proof", label: "Daily attention", instruction: "Consider one useful original idea.", day, time: "00:01", objective: "usefulness", presence: session.presenceId, mode: "auto", enabled: true, executionWindow: "day" }];

    const advanced = advanceSandboxTimeWithTemporalEvents(state, session.id, 7 * 24 * 60);
    const updated = advanced.state.playgroundSessions.find((item) => item.id === session.id)!;
    const temporalEvents = advanced.processed.filter((event) => event.type === "calendar_attention");

    expect(temporalEvents).toHaveLength(1);
    expect(temporalEvents[0]!.at).toBeLessThanOrEqual(Date.parse(updated.virtualNow));
    expect(updated.temporalSnapshot?.now).toBe(Date.parse(updated.virtualNow));
    expect(updated.temporalSnapshot?.trajectory.some((record) => record.kind === "event_scheduled")).toBe(true);
    expect(updated.temporalSnapshot?.trajectory.some((record) => record.kind === "event_fired")).toBe(true);
  });

  it("runs a due Growth Review from the persisted Sandbox clock", async () => {
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    let state = createAgent(input);
    state = applyOperation(state, {
      type: "createAssignment",
      presenceId: state.presence!.id,
      environment: "sandbox",
      instruction: "Grow this Presence toward 100 followers while building an audience of AI builders.",
    });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "activateAssignment", id: assignment.id });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    const dueAt = new Date(Date.parse(session.virtualNow) - 1_000).toISOString();
    const persistedAssignment = state.assignments.find((item) => item.id === assignment.id)!;
    persistedAssignment.plan = { ...persistedAssignment.plan!, nextWeeklyReviewAt: dueAt, nextStrategicReviewAt: dueAt };
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "advanceSandboxTime", sessionId: session.id, minutes: 1 }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    const next = await response.json() as OpenPresenceState;
    const review = next.growthReviews.find((item) => item.assignmentId === assignment.id);
    const updatedSession = next.playgroundSessions.find((item) => item.id === session.id)!;
    expect(review).toMatchObject({ assignmentId: assignment.id, kind: "strategic" });
    expect(Date.parse(review!.periodEnd)).toBeGreaterThanOrEqual(Date.parse(updatedSession.virtualNow));
    expect(Date.parse(next.assignments.find((item) => item.id === assignment.id)!.plan!.nextStrategicReviewAt!)).toBeGreaterThan(Date.parse(review!.periodEnd));
  });

  it("dispatches persisted calendar events at their event-local virtual time", async () => {
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, {
      sessionId: session.id,
      actionId: "post",
      actorName: "Maya Chen",
      content: "The next human message is more interesting when it leaves the conversation somewhere to go.",
    });

    const firstAt = new Date(Date.parse(session.virtualNow));
    firstAt.setDate(firstAt.getDate() + 1);
    firstAt.setHours(0, 1, 0, 0);
    const secondAt = new Date(firstAt.getTime() + 24 * 60 * 60 * 1000);
    const firstDay = firstAt.toLocaleDateString("en-US", { weekday: "long" });
    const secondDay = secondAt.toLocaleDateString("en-US", { weekday: "long" });
    state.calendar = [
      { id: "calendar-local-time-1", label: "First attention", instruction: "Consider the conversation", day: firstDay, time: "00:01", objective: "usefulness", presence: session.presenceId, mode: "auto", enabled: true, executionWindow: "day" },
      { id: "calendar-local-time-2", label: "Second attention", instruction: "Consider the conversation again", day: secondDay, time: "00:01", objective: "usefulness", presence: session.presenceId, mode: "auto", enabled: true, executionWindow: "day" },
    ];
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "advanceSandboxTime", sessionId: session.id, minutes: 2 * 24 * 60 }),
      headers: { "content-type": "application/json" },
    }));
    const next = await response.json();
    const reply = next.mirrorObjects.find((item: { sessionId?: string; actorPresenceId?: string; objectType?: string }) => item.sessionId === session.id && item.actorPresenceId === session.presenceId && item.objectType === "reply");

    expect(response.status).toBe(200);
    expect(next.playgroundSessions.find((item: { id: string }) => item.id === session.id)?.virtualNow).toBe(new Date(Date.parse(session.virtualNow) + 2 * 24 * 60 * 60 * 1000).toISOString());
    expect(reply?.occurredAt).toBe(firstAt.toISOString());
    expect(next.calendar.find((item: { id: string }) => item.id === "calendar-local-time-1")?.lastEvaluatedAt).toBe(firstAt.toISOString());
    expect(next.events.filter((item: { sessionId?: string; title?: string }) => item.sessionId === session.id && item.title === "Calendar attention started")).toHaveLength(2);
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

  it("keeps the persisted Sandbox trajectory causally reconstructable", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A concrete thing worth answering." });
    const target = state.mirrorObjects.find((item) => item.sessionId === session.id)!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "The useful detail is in the tradeoff.", target: target.externalRef });
    const execution = state.executions[0]!;
    const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId)!;
    state = deliverSandboxExecution(state, execution.id);

    const kinds = state.playgroundSessions.find((item) => item.id === session.id)!.temporalSnapshot!.trajectory.map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["observation", "decision", "intent", "permission_decision", "execution", "result", "outcome"]));
    const trajectory = state.playgroundSessions.find((item) => item.id === session.id)!.temporalSnapshot!.trajectory;
    expect(trajectory.find((item) => item.kind === "observation")?.data).toMatchObject({ mirrorObjectId: target.id, environment: "sandbox" });
    expect(trajectory.find((item) => item.kind === "outcome")?.data).toMatchObject({ executionId: execution.id, status: "succeeded" });
    expect(trajectory.find((item) => item.kind === "decision")?.data).toMatchObject({ causal: { parentIds: [target.id] } });
    expect(trajectory.find((item) => item.kind === "intent")?.data).toMatchObject({ causal: { parentIds: [target.id] } });
    expect(trajectory.find((item) => item.kind === "execution")?.data).toMatchObject({ causal: { parentIds: [intent.id] } });
    expect(trajectory.find((item) => item.kind === "result")?.data).toMatchObject({ causal: { parentIds: [execution.id] } });
    expect(trajectory.find((item) => item.kind === "outcome")?.data).toMatchObject({ causal: { parentIds: [execution.id, intent.id] } });
  });

  it("does not let a real Bridge claim or native writer consume Sandbox work", async () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const bridgeResult = createBridgeWithKey(state, { type: "createBridge", input: { presenceId, name: "Sandbox isolation probe", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] } } });
    state = bridgeResult.state;
    state = startPlaygroundSession(state, presenceId);
    const session = state.playgroundSessions[0]!;
    state = applyOperation(state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "This stays simulated." });
    const sandboxExecution = state.executions[0]!;
    // Deliberately corrupt only transport metadata to exercise the production
    // boundary, not the normal Sandbox constructor path.
    sandboxExecution.bridgeId = bridgeResult.bridge!.id;
    sandboxExecution.connector = "native";
    writeState(state);
    const claimed = claimExecutions(bridgeResult.bridge!, { executorId: "isolation-probe", limit: 10 });
    expect(claimed.executions).toHaveLength(0);
    expect(claimed.state.executions.find((item) => item.id === sandboxExecution.id)?.status).toBe("queued");

    const publish = vi.spyOn(x, "publishSealedXPost");
    const nativeAttempt = await deliverNativeExecutions(state, new Set([sandboxExecution.id]));
    expect(publish).not.toHaveBeenCalled();
    expect(nativeAttempt.executions.find((item) => item.id === sandboxExecution.id)?.status).toBe("queued");
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

  it("removes one Sandbox feed object without removing the rest of the rehearsal", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "Keep this post visible." });
    const post = state.mirrorObjects[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "reply", actorName: "Jenny", content: "Remove only this reply.", targetExternalRef: post.externalRef });
    const reply = state.mirrorObjects.find((item) => item.objectType === "reply")!;

    state = applyOperation(state, { type: "removeSandboxObject", sessionId: session.id, objectId: reply.id });
    expect(state.mirrorObjects.map((item) => item.id)).toEqual([post.id]);
    expect(state.events[0]?.title).toBe("Sandbox item removed");

    state = applyOperation(state, { type: "removeSandboxObject", sessionId: session.id, objectId: post.id });
    expect(state.mirrorObjects).toHaveLength(0);
  });

  it("can load replay history without triggering social cognition", async () => {
    const state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({
        type: "addSandboxEvent",
        sessionId: session.id,
        actionId: "post",
        actorName: "Historical author",
        content: "A parent post loaded as public replay context.",
        observeOnly: true,
      }),
      headers: { "content-type": "application/json" },
    }));
    const next = await response.json();

    expect(response.status).toBe(200);
    expect(next.mirrorObjects.filter((item: { sessionId: string }) => item.sessionId === session.id)).toHaveLength(1);
    expect(next.socialIntents.filter((item: { sessionId: string }) => item.sessionId === session.id)).toHaveLength(0);
    expect(next.events.some((event: { title: string; sessionId?: string }) => event.sessionId === session.id && event.title === "Social plan formed")).toBe(false);
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

  it("blocks an unsupported leading mention while preserving the observed participant", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", actorHandle: "@maya", content: "A post worth replying to." });
    const post = state.mirrorObjects.find((item) => item.sessionId === session.id)!;

    const blocked = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "@benswerd I have a useful distinction.", target: post.externalRef });
    expect(blocked.executions[0]).toMatchObject({ status: "blocked", failure: { code: "UNSUPPORTED_LEADING_MENTION" } });
    expect(blocked.executions[0]?.failure?.message).toContain("@benswerd");

    const grounded = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "@maya I have a useful distinction.", target: post.externalRef });
    expect(grounded.executions[0]).toMatchObject({ status: "queued" });
  });

  it("blocks a near-copy that turns another person's statement into the Presence's voice", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Micky", actorHandle: "@Rasmic", content: "@benswerd hmm you gave me reason to opensource it... give me a couple days and will do it" });
    const post = state.mirrorObjects.find((item) => item.sessionId === session.id)!;

    const result = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "@benswerd Hmm, you’ve given me a reason to open-source it… give me a couple of days and I’ll do it.", target: post.externalRef });
    expect(result.executions[0]).toMatchObject({ status: "blocked", failure: { code: "SOURCE_EXPRESSION_ECHO" } });
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
    let state = startPlaygroundSession(applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } }));
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

  it("blocks Assignment wording from becoming the public opening", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = applyOperation(state, {
      type: "createAssignment",
      presenceId: state.presence!.id,
      sessionId: session.id,
      environment: "sandbox",
      instruction: "Notice one useful pattern in founder conversations. Produce exactly 1 original X post.",
    });
    const assignment = state.assignments[0]!;
    state = formSandboxIntent(state, {
      sessionId: session.id,
      affordance: "post",
      assignmentId: assignment.id,
      text: "A useful pattern in founder conversations: memory compounds product judgment.",
    });

    expect(state.executions[0]).toMatchObject({
      status: "blocked",
      failure: { code: "ASSIGNMENT_TEXT_LEAKAGE" },
    });
    expect(state.events[0]?.title).toBe("Public text boundary blocked");
  });

  it("delivers a Sandbox execution idempotently and carries publication assets into the Mirror", () => {
    let state = startPlaygroundSession(applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } }));
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, {
      sessionId: session.id,
      affordance: "post",
      text: "A post with an evidence trail.",
      assets: [
        { name: "evidence chart", kind: "chart", mimeType: "image/svg+xml", dataUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E" },
        { name: "reference", kind: "link", sourceUrl: "https://openpresence.ai" },
      ],
    });
    const execution = state.executions[0]!;
    state = deliverSandboxExecution(state, execution.id);
    const once = state;
    state = deliverSandboxExecution(state, execution.id);
    expect(state.mirrorObjects.filter((item) => item.originExecutionId === execution.id)).toHaveLength(1);
    expect(state.outcomes.filter((item) => item.executionId === execution.id)).toHaveLength(1);
    expect(state.assignments).toEqual(once.assignments);
    expect(state.mirrorObjects[0]?.assetRefs?.map((ref) => ref.kind)).toEqual(["chart", "link"]);
    expect(state.publications[0]?.assetIds).toHaveLength(2);
  });

  it("reuses an eligible Asset-library item by exact id and records Sandbox usage", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    const libraryAsset = {
      id: "library-visual-1",
      agentId: state.agent!.id,
      sourceId: "asset-source-1",
      type: "image" as const,
      semanticKind: "diagram" as const,
      dataUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      status: "ready" as const,
      perception: { observation: "A diagram of an agent decision loop.", likelyMeaning: "Shows observation, judgment, action, and outcome.", uncertainty: [] },
      rights: { status: "unknown" as const },
      provenance: { origin: "operator_upload", importedAt: new Date().toISOString() },
      visibility: "private-community" as const,
      shareability: "agent-wide" as const,
      environment: "sandbox" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies OpenPresenceState["assets"][number];
    state.assets.unshift(libraryAsset);

    state = formSandboxIntent(state, {
      sessionId: session.id,
      affordance: "post",
      text: "A durable agent earns trust by showing the path from observation to outcome.",
      assets: [{ name: "Decision loop", kind: "image", existingAssetId: libraryAsset.id }],
    });
    const execution = state.executions[0]!;
    state = deliverSandboxExecution(state, execution.id);

    expect(state.executions[0]?.status).toBe("succeeded");
    expect(state.publications[0]?.assetIds).toEqual([libraryAsset.id]);
    expect(state.mirrorObjects[0]?.assetRefs?.[0]?.assetId).toBe(libraryAsset.id);
    expect(state.assetUsages[0]).toMatchObject({ assetId: libraryAsset.id, environment: "sandbox", publicationId: state.publications[0]?.id });
  });

  it("lets autonomous Sandbox cognition select the listed library item instead of inventing media", async () => {
    vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
    vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    const assetId = "library-autonomous-1";
    state.assets.unshift({
      id: assetId,
      agentId: state.agent!.id,
      sourceId: "asset-source-autonomous",
      type: "image",
      semanticKind: "diagram",
      dataUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      status: "ready",
      perception: { observation: "A diagram showing the agent feedback loop.", likelyMeaning: "The loop connects judgment to verified outcomes.", uncertainty: [] },
      rights: { status: "unknown" },
      provenance: { origin: "operator_upload", importedAt: new Date().toISOString() },
      visibility: "private-community",
      shareability: "agent-wide",
      environment: "sandbox",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeState(state);

    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "runSandboxPulse", sessionId: session.id }),
      headers: { "content-type": "application/json" },
    }));
    const next = await response.json();
    expect(response.status).toBe(200);
    expect(next.executions[0]).toMatchObject({ status: "succeeded", environment: "sandbox" });
    expect(next.publications[0]?.assetIds).toEqual([assetId]);
    expect(next.assetUsages[0]).toMatchObject({ assetId, environment: "sandbox" });
    expect(next.mirrorObjects.find((item: { originExecutionId?: string }) => item.originExecutionId === next.executions[0].id)?.assetRefs?.[0]?.assetId).toBe(assetId);
  });

  it("does not silently republish an exact asset as a new original", () => {
    let state = startPlaygroundSession(applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } }));
    const session = state.playgroundSessions[0]!;
    const asset = { name: "same visual", kind: "gif" as const, mimeType: "image/gif", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "First publication.", assets: [asset] });
    state = deliverSandboxExecution(state, state.executions[0]!.id);
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "Second publication.", assets: [asset] });
    expect(state.executions[0]?.status).toBe("blocked");
    expect(state.executions[0]?.failure?.code).toBe("DUPLICATE_ASSET_CANDIDATE");
    expect(state.assetUsages).toHaveLength(1);
  });

  it("allows reuse when the planner records why it is intentional", () => {
    let state = startPlaygroundSession(applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } }));
    const session = state.playgroundSessions[0]!;
    const asset = { name: "same visual", kind: "gif" as const, mimeType: "image/gif", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "First publication.", assets: [asset] });
    state = deliverSandboxExecution(state, state.executions[0]!.id);
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A follow-up with updated context.", assets: [asset], assetReuse: { usageType: "repurpose", reason: "follow_up" } });
    expect(state.executions[0]?.status).toBe("queued");
    state = deliverSandboxExecution(state, state.executions[0]!.id);
    expect(state.assetUsages[0]?.usageType).toBe("repurpose");
    expect(state.assetUsages[0]?.reuseReason).toBe("follow_up");
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
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "A question that deserves a careful answer.", language: "en" });
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
    state = addSandboxEvent(state, { sessionId: session.id, kind: "post", actorName: "Maya Chen", content: "A question for the Presence.", language: "en" });
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
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A post worth passing along.", language: "en" });
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
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } });
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

  it("does not allow virtual time rollback", () => {
    const state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    expect(() => advanceSandboxTime(state, session.id, -1)).toThrow(/only move forward/i);
  });

  it("refreshes the default Playground clock on load but preserves manual virtual time", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-14T16:00:00.000Z"));
      let state = startPlaygroundSession(createAgent(input));
      const session = state.playgroundSessions[0]!;
      session.virtualNow = "2026-08-13T23:33:43.590Z";
      delete session.virtualTimeMode;

      state = syncPlaygroundTime(state, session.id);
      expect(state.playgroundSessions[0]?.virtualNow).toBe("2026-08-14T16:00:00.000Z");
      expect(state.playgroundSessions[0]?.virtualTimeMode).toBe("realtime");

      state = advanceSandboxTime(state, session.id, 60);
      const manuallyAdvanced = state.playgroundSessions[0]?.virtualNow;
      vi.setSystemTime(new Date("2026-08-14T18:00:00.000Z"));
      state = syncPlaygroundTime(state, session.id);
      expect(state.playgroundSessions[0]?.virtualNow).toBe(manuallyAdvanced);
      expect(state.playgroundSessions[0]?.virtualTimeMode).toBe("manual");

      state = resetPlaygroundSession(state, session.id);
      expect(state.playgroundSessions[0]?.virtualNow).toBe("2026-08-14T18:00:00.000Z");
      expect(state.playgroundSessions[0]?.virtualTimeMode).toBe("realtime");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps media posture on the Presence boundary", () => {
    const agentState = createAgent(input);
    expect(agentState.presence?.mediaPerceptionPolicy).toBe("use-judgment");
    const ghostState = createAgent({ ...input, mode: "ghost" as const });
    expect(ghostState.presence?.mediaPerceptionPolicy).toBe("review-uncertain");
    const updated = applyOperation(agentState, { type: "setPresence", patch: { mediaPerceptionPolicy: "always-review" } });
    expect(updated.presence?.mediaPerceptionPolicy).toBe("always-review");
  });

  it("records original-post rehearsal provenance and preference evidence without mutating identity", () => {
    const originalTaste = createAgent(input).files.find((file) => file.kind === "TASTE")?.content;
    let state = startPlaygroundSession(applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { post: "auto" } } }));
    const session = state.playgroundSessions[0]!;
    state = beginOriginalPostRehearsal(state, { sessionId: session.id, inspiration: "A concrete note about durable memory." });
    const attempt = state.originalPostRehearsals[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "Memory should preserve decisions, not every transcript.", rehearsalAttemptId: attempt.id });
    const execution = state.executions[0]!;
    state = deliverSandboxExecution(state, execution.id);
    state = completeOriginalPostRehearsal(state, attempt.id);
    const completed = state.originalPostRehearsals[0]!;
    expect(completed.result).toBe("published");
    expect(completed.publicationId).toBeDefined();
    expect(state.mirrorObjects[0]?.originExecutionId).toBe(execution.id);
    expect(state.mirrorObjects[0]?.content?.text).not.toContain("durable memory");

    state = recordPreferenceEvidence(state, { sessionId: session.id, attemptId: attempt.id, reaction: "does_not_fit", reasons: ["too_generic"], note: "Prefer a more concrete mechanism." });
    expect(state.preferenceEvidence[0]).toMatchObject({ reaction: "does_not_fit", reasons: ["too_generic"], scopeHint: "agent", environment: "sandbox" });
    expect(state.files.find((file) => file.kind === "TASTE")?.content).toBe(originalTaste);
    expect(state.events[0]?.title).toBe("Preference evidence saved");
  });

  it("keeps a no-op rehearsal calibratable as good silence", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state = beginOriginalPostRehearsal(state, { sessionId: session.id });
    const attempt = state.originalPostRehearsals[0]!;
    state = completeOriginalPostRehearsal(state, attempt.id);
    expect(state.originalPostRehearsals[0]?.result).toBe("no_op");
    expect(state.events[0]?.detail).toContain("chose silence in this context");
    state = recordPreferenceEvidence(state, { sessionId: session.id, attemptId: attempt.id, reaction: "good_silence" });
    expect(state.preferenceEvidence[0]?.subjectRef).toEqual({ type: "decision", id: attempt.id });
    expect(state.preferenceEvidence[0]?.source).toBe("playground_no_op");
  });

});
