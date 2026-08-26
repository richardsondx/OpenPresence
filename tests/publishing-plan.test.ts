import { beforeEach, describe, expect, it } from "vitest";
import { readState, writeState } from "../lib/db";
import { dispatchAutonomyWorker, queueAutonomyRun } from "../lib/autonomy-worker";
import { POST as statePost } from "../app/api/state/route";
import { applyOperation, compileAgendaWork, createAgent, derivePublicHistory, derivePublishingPlanProjection, normalizeState, recordPublishingPlanFailure, replacePublishingPlan, startPlaygroundSession } from "../lib/runtime";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

beforeEach(() => {
  process.env.OPENPRESENCE_AI_MOCK = "1";
});

async function stateOperation(body: Record<string, unknown>) {
  const response = await statePost(new Request("http://localhost/api/state", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));
  expect(response.status).toBe(200);
  return response.json();
}

function planWindow(sessionNow: string, summary: string) {
  const start = new Date(new Date(sessionNow).getTime() + 60_000);
  const end = new Date(start.getTime() + 60_000);
  return {
    horizonStart: new Date(new Date(sessionNow).getTime() - 60_000).toISOString(),
    horizonEnd: new Date(new Date(sessionNow).getTime() + 86_400_000).toISOString(),
    expectedOriginals: { min: 1, max: 1 },
    windows: [{ startAt: start.toISOString(), endAt: end.toISOString(), purpose: "originate" as const, summary, desiredContribution: { min: 1, max: 1 } }],
    currentWork: [{ status: "exploring" as const, summary: "Look for a specific contribution." }],
  };
}

function publishingFixture(summary: string, execution: "auto" | "review" = "auto") {
  let state = createAgent(input);
  state = applyOperation(state, { type: "setPresence", patch: { execution: { post: execution, reply: "auto" }, publishingInitiative: { ...state.presence!.publishingInitiative, mode: "pace", target: { count: 1, period: "day" } } } });
  state = startPlaygroundSession(state);
  const session = state.playgroundSessions[0]!;
  state = replacePublishingPlan(state, { presenceId: state.presence!.id, draft: planWindow(session.virtualNow, summary) });
  writeState(state);
  return { state, sessionId: session.id, planId: state.publishingPlans[0]!.id, planRevision: state.publishingPlans[0]!.revision };
}

describe("Publishing Plan", () => {
  it("persists a Presence-scoped plan without turning windows into posts", () => {
    let state = createAgent(input);
    const presence = state.presence!;
    presence.publishingInitiative = { ...presence.publishingInitiative, mode: "pace", target: { count: 3, period: "day" } };
    const now = new Date();
    const draft = {
      horizonStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      horizonEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
      expectedOriginals: { min: 2, max: 4 },
      windows: [{ startAt: new Date(now.getTime() + 60_000).toISOString(), endAt: new Date(now.getTime() + 3_600_000).toISOString(), purpose: "originate" as const, summary: "Look for one worthwhile original opportunity.", desiredContribution: { min: 1, max: 2 } }],
      currentWork: [{ status: "exploring" as const, summary: "Explore a grounded idea." }],
    };
    state = replacePublishingPlan(state, { presenceId: presence.id, draft });

    expect(state.publishingPlans).toHaveLength(1);
    expect(state.publishingPlans[0]).toMatchObject({ presenceId: presence.id, environment: "sandbox", initiativeMode: "pace", operatorTarget: { quantity: 3, period: "day" }, verifiedOriginals: 0, revision: 1 });
    expect(state.publishingPlans[0]?.windows[0]?.summary).toContain("worthwhile");
    expect(state.publications).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
  });

  it("supersedes prior revisions and never projects a plan into another Presence", () => {
    let state = createAgent(input);
    const firstPresenceId = state.presence!.id;
    const second = { id: "presence-second", channel: "x" as const, name: "Second", handle: "@second", mode: "agent" as const, accent: "#777" };
    const secondPresence = {
      ...state.presence!,
      ...second,
      context: {
        ...state.presence!.context,
        presenceId: second.id,
        publicIdentity: { ...state.presence!.context.publicIdentity, displayName: second.name, handle: second.handle },
        publishingInitiative: { ...state.presence!.publishingInitiative },
      },
    };
    state = { ...state, presences: [...state.presences, secondPresence], presence: state.presence };
    const baseDraft = { horizonStart: new Date().toISOString(), horizonEnd: new Date(Date.now() + 86_400_000).toISOString(), windows: [], rationaleSummary: "A bounded plan." };
    state = replacePublishingPlan(state, { presenceId: firstPresenceId, draft: baseDraft });
    state = replacePublishingPlan(state, { presenceId: firstPresenceId, draft: { ...baseDraft, rationaleSummary: "A revised plan." } });

    expect(state.publishingPlans.filter((plan) => plan.presenceId === firstPresenceId && plan.status === "superseded")).toHaveLength(1);
    expect(derivePublishingPlanProjection(state, second.id)).toBeUndefined();
    expect(normalizeState(state).publishingPlans).toHaveLength(2);
  });

  it("keeps an active plan ahead of a newer stale blocked planning attempt", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    const presence = state.presence!;
    const activeDraft = planWindow(new Date().toISOString(), "Continue the current useful thread.");
    state = replacePublishingPlan(state, { presenceId: presence.id, environment: "live", draft: activeDraft });
    const activePlan = state.publishingPlans[0]!;
    state.publishingPlans.unshift({
      ...activePlan,
      id: "publishing-plan-stale-blocked",
      status: "blocked",
      revision: activePlan.revision + 1,
      rationaleSummary: "Openai is selected but no API key is stored.",
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    });

    const projected = derivePublishingPlanProjection(state, presence.id);

    expect(projected).toMatchObject({ id: activePlan.id, status: "active" });
    expect(projected?.rationaleSummary).toBe(activePlan.rationaleSummary);
  });

  it("keeps the last usable plan active when a successor planner attempt fails", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    state = replacePublishingPlan(state, { presenceId: presence.id, environment: "live", draft: { horizonStart: new Date(Date.now() - 86_400_000).toISOString(), horizonEnd: new Date(Date.now() + 86_400_000).toISOString(), windows: [], rationaleSummary: "A usable plan." } });

    const failed = recordPublishingPlanFailure(state, presence.id, "The planner provider was temporarily unavailable.");

    expect(failed.publishingPlans[0]).toMatchObject({ status: "active", rationaleSummary: "A usable plan." });
    expect(new Date(failed.publishingPlans[0]!.nextReassessmentAt!).getTime()).toBeGreaterThan(Date.now());
    expect(failed.events[0]).toMatchObject({ title: "Publishing plan unavailable" });
  });

  it("wakes a due window and proves original publication through Mirror and Feed", async () => {
    const fixture = publishingFixture("Look for one worthwhile original opportunity.");
    const next = await stateOperation({ type: "advanceSandboxTime", sessionId: fixture.sessionId, minutes: 2 });
    const plan = next.publishingPlans.find((item: { id: string }) => item.id === fixture.planId);
    const intent = next.socialIntents.find((item: { origin?: { kind?: string; planId?: string; planWindowId?: string } }) => item.origin?.kind === "publishing_initiative");
    const execution = intent ? next.executions.find((item: { socialIntentId: string }) => item.socialIntentId === intent.id) : undefined;
    const mirror = execution ? next.mirrorObjects.find((item: { originExecutionId?: string }) => item.originExecutionId === execution.id) : undefined;
    const history = derivePublicHistory(next, next.presence.id);
    const stages = new Set(plan.workHistory.map((item: { stage: string }) => item.stage));

    expect(intent).toMatchObject({ origin: { kind: "publishing_initiative", planId: fixture.planId, planRevision: fixture.planRevision } });
    expect(intent.origin.planWindowId).toBe(plan.windows[0].id);
    expect(execution).toMatchObject({ affordance: "post", status: "succeeded" });
    expect(execution).not.toHaveProperty("target");
    expect(mirror).toMatchObject({ objectType: "post", originExecutionId: execution.id });
    expect(mirror).not.toHaveProperty("parentExternalRef");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "post", origin: { kind: "publishing_initiative", planId: fixture.planId, planRevision: fixture.planRevision, planWindowId: plan.windows[0].id } });
    expect(plan.verifiedOriginals).toBe(1);
    expect(stages).toEqual(new Set(["eligible", "claimed", "agenda", "considered", "original_selected", "intent_formed", "delivery_succeeded", "mirror_verified", "progress_incremented"]));
  });

  it("keeps a NO_OP honest and leaves the responsibility active for a later window", async () => {
    const fixture = publishingFixture("A mediocre opportunity that should be rejected.");
    const next = await stateOperation({ type: "advanceSandboxTime", sessionId: fixture.sessionId, minutes: 2 });
    const plan = next.publishingPlans.find((item: { id: string }) => item.id === fixture.planId);
    expect(next.socialIntents.filter((item: { origin?: { kind?: string } }) => item.origin?.kind === "publishing_initiative")).toHaveLength(0);
    expect(next.mirrorObjects.filter((item: { actorPresenceId?: string }) => item.actorPresenceId === next.presence.id)).toHaveLength(0);
    expect(plan.windows[0]).toMatchObject({ status: "completed", outcome: "candidate_rejected" });
    expect(plan.nextAttentionAt).toBeDefined();
    expect(plan.workHistory[0].stage).toBe("candidate_rejected");
    expect(plan.status).toBe("active");
  });

  it("does not count an inbound reply as Publishing Initiative progress", async () => {
    const fixture = publishingFixture("Look for one worthwhile original opportunity.");
    const inbound = await stateOperation({ type: "addSandboxEvent", sessionId: fixture.sessionId, actionId: "post", actorName: "Maya Chen", content: "The best reply leaves the next person with a sharper thought, not a longer thread.", language: "en" });
    const replyIntent = inbound.socialIntents.find((item: { affordance: string }) => item.affordance === "reply");
    const replyExecution = replyIntent ? inbound.executions.find((item: { socialIntentId: string }) => item.socialIntentId === replyIntent.id) : undefined;
    const replyMirror = replyExecution ? inbound.mirrorObjects.find((item: { originExecutionId?: string }) => item.originExecutionId === replyExecution.id) : undefined;
    const plan = inbound.publishingPlans.find((item: { id: string }) => item.id === fixture.planId);

    expect(replyIntent).toMatchObject({ origin: { kind: "inbound_social" }, target: { type: "x.post" } });
    expect(replyExecution).toMatchObject({ affordance: "reply", status: "succeeded" });
    expect(replyMirror).toMatchObject({ objectType: "reply", parentExternalRef: replyExecution.target });
    expect(derivePublicHistory(inbound, inbound.presence.id)[0]).toMatchObject({ kind: "reply", origin: { kind: "inbound_social" } });
    expect(plan.verifiedOriginals).toBe(0);
    expect(plan.workHistory).toHaveLength(0);

    const legacyMisclassified = { ...inbound, mirrorObjects: inbound.mirrorObjects.map((item: { objectType: string }) => item.objectType === "reply" ? { ...item, objectType: "post" } : item) };
    expect(derivePublishingPlanProjection(legacyMisclassified, inbound.presence.id, inbound.playgroundSessions[0]!.virtualNow)?.verifiedOriginals).toBe(0);
  });

  it("records review as a waiting state without claiming verified progress", async () => {
    const fixture = publishingFixture("Look for one worthwhile original opportunity.", "review");
    const next = await stateOperation({ type: "advanceSandboxTime", sessionId: fixture.sessionId, minutes: 2 });
    const plan = next.publishingPlans.find((item: { id: string }) => item.id === fixture.planId);
    const execution = next.executions.find((item: { affordance: string }) => item.affordance === "post");
    expect(execution?.status).toBe("awaiting-review");
    expect(next.mirrorObjects.filter((item: { actorPresenceId?: string }) => item.actorPresenceId === next.presence.id)).toHaveLength(0);
    expect(plan.verifiedOriginals).toBe(0);
    expect(plan.workHistory.some((item: { stage: string }) => item.stage === "awaiting_review")).toBe(true);
  });

  it("emits a reassess_plan step in Agenda when nextReassessmentAt is due and rolls forward autonomously", async () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    const pastTime = new Date(Date.now() - 3_600_000).toISOString();
    const draft = {
      horizonStart: new Date(Date.now() - 86_400_000).toISOString(),
      horizonEnd: pastTime,
      windows: [],
      nextReassessmentAt: pastTime,
      rationaleSummary: "Prior plan has concluded.",
    };
    state = replacePublishingPlan(state, { presenceId: presence.id, draft });
    expect(state.publishingPlans).toHaveLength(1);
    const initialPlanId = state.publishingPlans[0]!.id;

    const agenda = compileAgendaWork(state, presence.id);
    const reassessItem = agenda.workItems.find((item) => item.source === "publishing" && item.step === "reassess_plan");
    expect(reassessItem).toBeDefined();
    expect(reassessItem).toMatchObject({
      source: "publishing",
      workKind: "publishing_step",
      step: "reassess_plan",
      planRef: initialPlanId,
      planRevision: 1,
      statusLabel: "Reassessment due",
    });

    writeState(state);
    await stateOperation({ type: "wakePresence", presenceId: presence.id });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterWake = readState();
    const activePlan = afterWake.publishingPlans.find((item: { status: string }) => item.status === "active");
    const supersededPlan = afterWake.publishingPlans.find((item: { id: string }) => item.id === initialPlanId);

    expect(activePlan).toBeDefined();
    expect(activePlan.revision).toBe(2);
    expect(supersededPlan).toMatchObject({
      id: initialPlanId,
      status: "superseded",
      supersededBy: activePlan.id,
    });
    expect(supersededPlan.supersededAt).toBeDefined();
  });

  it("reassesses a due plan in the durable native Attention worker", async () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    state = replacePublishingPlan(state, {
      presenceId: presence.id,
      environment: "live",
      draft: {
        horizonStart: new Date(Date.now() - 86_400_000).toISOString(),
        horizonEnd: new Date(Date.now() - 3_600_000).toISOString(),
        nextReassessmentAt: new Date(Date.now() - 3_600_000).toISOString(),
        windows: [],
        rationaleSummary: "Prior plan has concluded.",
      },
    });
    const initialPlan = state.publishingPlans[0]!;
    writeState(state);

    const queued = queueAutonomyRun(presence.id, "attention", { metadata: { source: "scheduler" } });
    await dispatchAutonomyWorker(queued.run.id);
    const after = readState();
    const activePlan = after.publishingPlans.find((item) => item.status === "active");
    const supersededPlan = after.publishingPlans.find((item) => item.id === initialPlan.id);

    expect(activePlan).toMatchObject({ revision: 2, status: "active" });
    expect(supersededPlan).toMatchObject({ status: "superseded", supersededBy: activePlan!.id });
  });

  it("guarantees atomic compare-and-swap idempotency under concurrent reassessment calls", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    const draft1 = {
      horizonStart: new Date().toISOString(),
      horizonEnd: new Date(Date.now() + 86_400_000).toISOString(),
      windows: [],
      rationaleSummary: "Base plan.",
    };
    state = replacePublishingPlan(state, { presenceId: presence.id, draft: draft1 });
    const planP1 = state.publishingPlans[0]!;
    expect(planP1.revision).toBe(1);

    // Call 1 with correct expectedPlanId and expectedRevision -> succeeds
    const draft2 = { ...draft1, rationaleSummary: "Successor revision 2." };
    const next1 = replacePublishingPlan(state, {
      presenceId: presence.id,
      draft: draft2,
      expectedPlanId: planP1.id,
      expectedRevision: planP1.revision,
    });
    const planP2 = next1.publishingPlans.find((p) => p.status === "active")!;
    expect(planP2.revision).toBe(2);
    expect(planP2.id).not.toBe(planP1.id);

    // Call 2 racing with stale expectedRevision (still expecting planP1 / revision 1) -> must safely NO-OP
    const next2 = replacePublishingPlan(next1, {
      presenceId: presence.id,
      draft: { ...draft1, rationaleSummary: "Stale racing revision." },
      expectedPlanId: planP1.id,
      expectedRevision: planP1.revision,
    });
    // State remains unchanged; no duplicate revision created
    expect(next2.publishingPlans.filter((p) => p.status === "active")).toHaveLength(1);
    expect(next2.publishingPlans.find((p) => p.status === "active")!.id).toBe(planP2.id);
  });

  it("recovers from a missing plan by emitting create_plan step in Agenda", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    state.publishingPlans = []; // Simulate missing plan edge case

    const agenda = compileAgendaWork(state, presence.id);
    const createItem = agenda.workItems.find((item) => item.source === "publishing" && item.step === "create_plan");
    expect(createItem).toBeDefined();
    expect(createItem).toMatchObject({
      source: "publishing",
      workKind: "publishing_step",
      step: "create_plan",
      statusLabel: "Plan needed",
    });
  });

  it("preserves an intentional rest state when windows complete early before nextReassessmentAt", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    const futureReassessment = new Date(Date.now() + 6 * 3_600_000).toISOString();
    const draft = {
      horizonStart: new Date(Date.now() - 3_600_000).toISOString(),
      horizonEnd: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      windows: [
        { startAt: new Date(Date.now() - 3_600_000).toISOString(), endAt: new Date(Date.now() - 1_800_000).toISOString(), purpose: "originate" as const, summary: "Completed window.", desiredContribution: { min: 1, max: 1 } },
      ],
      nextReassessmentAt: futureReassessment,
      rationaleSummary: "Work complete for the morning; resting until afternoon review.",
    };
    state = replacePublishingPlan(state, { presenceId: presence.id, draft });

    // In Agenda, no reassess_plan or create_plan is due because nextReassessmentAt is in the future
    const agenda = compileAgendaWork(state, presence.id);
    const reassessItem = agenda.workItems.find((item) => item.source === "publishing" && (item.step === "reassess_plan" || item.step === "create_plan"));
    expect(reassessItem).toBeUndefined();
  });

  it("balances overdue reassessment urgency against active conversation turns in Agenda", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native", publishingInitiative: { ...state.presence!.publishingInitiative, mode: "adaptive" } } });
    const presence = state.presence!;
    const overdueTime = new Date(Date.now() - 4 * 3_600_000).toISOString();
    const draft = {
      horizonStart: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      horizonEnd: overdueTime,
      windows: [],
      nextReassessmentAt: overdueTime,
      rationaleSummary: "Overdue plan.",
    };
    state = replacePublishingPlan(state, { presenceId: presence.id, draft });

    // Add an active conversation episode
    state = {
      ...state,
      conversationEpisodes: [
        {
          id: "ep_1",
          presenceId: presence.id,
          channel: "x",
          counterpartyActorId: "actor_1",
          counterpartyHandle: "@maya",
          status: "active",
          rootMirrorObjectId: "m_1",
          branchAnchorMirrorObjectId: "m_1",
          lastExternalObjectId: "ext_1",
          exchangeCount: 2,
          lastMeaningfulDevelopment: "Maya asked a clarifying question.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      mirrorObjects: [
        {
          id: "m_1",
          presenceId: presence.id,
          channelId: "x",
          environment: "live",
          objectType: "reply",
          externalRef: { type: "x.post", id: "ext_1" },
          author: { displayName: "Maya", handle: "@maya" },
          content: { text: "What do you think about agent memory persistence?" },
          visibility: "public",
          observedAt: new Date().toISOString(),
        },
      ],
    };

    const agenda = compileAgendaWork(state, presence.id);
    const conversationItem = agenda.workItems.find((item) => item.source === "conversation");
    const reassessItem = agenda.workItems.find((item) => item.source === "publishing" && item.step === "reassess_plan");

    expect(conversationItem).toBeDefined();
    expect(reassessItem).toBeDefined();
    // Both items enter Agenda with appropriate priority scores without starvation
    expect(conversationItem!.urgencyScore).toBeGreaterThan(400);
    expect(reassessItem!.urgencyScore).toBeGreaterThan(800);
  });
});
