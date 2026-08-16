import { beforeEach, describe, expect, it } from "vitest";
import { writeState } from "../lib/db";
import { POST as statePost } from "../app/api/state/route";
import { applyOperation, createAgent, derivePublicHistory, derivePublishingPlanProjection, normalizeState, replacePublishingPlan, startPlaygroundSession } from "../lib/runtime";

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
    const inbound = await stateOperation({ type: "addSandboxEvent", sessionId: fixture.sessionId, actionId: "post", actorName: "Maya Chen", content: "The best reply leaves the next person with a sharper thought, not a longer thread." });
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
});
