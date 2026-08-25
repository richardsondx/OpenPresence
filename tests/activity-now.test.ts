import { describe, expect, it } from "vitest";
import { deriveActivityNow } from "../lib/activity-now";
import { createOperatorNudge, recordNudgeAssignmentHandoff, releasePausedNudges, settleNudgeForEpisode, settleNudgeFromAssignment, startQueuedNudge } from "../lib/operator-chat";
import { operatorConversationActionEvents } from "../lib/operator-chat-projection";
import { createAgent, formXActionIntent } from "../lib/runtime";
import { repairMissingAssignmentWakes, repairMissingOperatorNudgeWakes } from "../lib/temporal";
import { listScheduledWakes, upsertOperationalRun } from "../lib/db";
import type { OperationalRun } from "../lib/types";

describe("truthful Activity right-now projection", () => {
  const fixture = () => createAgent({ name: "Now Test", description: "Test", audience: "Testers", mode: "agent", handle: "@now_test", accent: "#777777" });
  it("does not present an inactive Assignment as current work", () => {
    const state = fixture();
    const presence = state.presence!;
    state.assignments.unshift({ id: "stale_assignment", presenceId: presence.id, status: "active", title: "Old umbrella goal" } as never);
    expect(deriveActivityNow(state, presence.id).state).toBe("resting");
  });

  it("does not present an exhausted umbrella Assignment as stuck work", () => {
    const state = fixture();
    const presence = state.presence!;
    state.assignments.unshift({ id: "exhausted_assignment", presenceId: presence.id, status: "working", nextDueAt: "2020-01-01T00:00:00.000Z", work: { phase: "researching", attempts: 12, maxAttempts: 12, storiesResearched: 16 } } as never);
    const projection = deriveActivityNow(state, presence.id);
    expect(projection.state).toBe("resting");
    expect(projection.title).toBe("Resting between attention passes");
  });

  it("shows a running checkpoint and marks an overdue heartbeat stuck", () => {
    const state = fixture();
    const presence = state.presence!;
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    state.operationalRuns = [{ id: "run", runId: "run", presenceId: presence.id, kind: "attention", state: "running", stage: "discovery.triage", createdAt: old, startedAt: old, lastProgressAt: old, lastHeartbeatAt: old, eligibleAt: old, attemptCount: 1, recoveryCount: 0 } as OperationalRun];
    const projection = deriveActivityNow(state, presence.id);
    expect(projection.state).toBe("stuck");
    expect(projection.detail).toContain("No meaningful progress");
  });

  it("shows Assignment stages while a worker is active and does not call delivery waiting work", () => {
    const state = fixture();
    const presence = state.presence!;
    const timestamp = new Date().toISOString();
    state.assignmentRuns = [{ id: "assignment_run", assignmentId: "assignment", agentId: state.agent!.id, presenceId: presence.id, sessionId: `live:${presence.id}`, status: "selecting", currentStage: "candidate_review", attempts: 2, maxAttempts: 4, rejectedCandidates: 0, startedAt: timestamp, lastProgressAt: timestamp, createdAt: timestamp, updatedAt: timestamp }];
    const active = deriveActivityNow(state, presence.id);
    expect(active.state).toBe("working");
    expect(active.detail).toContain("Attempt 2 of 4");
    expect(active.steps.find((step) => step.status === "active")?.label).toBe("Judging the candidates");
    state.assignmentRuns[0].status = "delivery_pending";
    const waiting = deriveActivityNow(state, presence.id);
    expect(waiting.state).toBe("resting");
    expect(waiting.title).toBe("Waiting for delivery confirmation");
    expect(waiting.detail).toContain("no worker is running");
  });

  it("does not call an Attention run waiting on delivery active work", () => {
    const state = fixture();
    const presence = state.presence!;
    const timestamp = new Date().toISOString();
    state.operationalRuns = [{ id: "waiting_attention", runId: "waiting_attention", presenceId: presence.id, kind: "attention", state: "waiting", stage: "delivering", createdAt: timestamp, startedAt: timestamp, lastProgressAt: timestamp, eligibleAt: timestamp, attemptCount: 1, recoveryCount: 0 } as OperationalRun];
    const projection = deriveActivityNow(state, presence.id);
    expect(projection.state).toBe("resting");
    expect(projection.title).toBe("Waiting for authorized delivery");
    expect(projection.detail).toContain("No cognition worker is running");
  });

  it("detects overdue Assignment work without misrouting it through generic Attention", () => {
    const state = fixture();
    const presence = state.presence!;
    state.assignments.unshift({ id: `overdue_${Date.now()}_${Math.random()}`, presenceId: presence.id, status: "active", nextDueAt: "2020-01-01T00:00:00.000Z" } as never);
    expect(repairMissingAssignmentWakes(state)).toBe(1);
    expect(listScheduledWakes(presence.id).some((wake) => ((wake.payload as { triggers?: string[] })?.triggers ?? []).includes("assignment_due"))).toBe(false);
  });

  it("does not present a due scheduler row as the next future wake", () => {
    const state = fixture();
    const presence = state.presence!;
    const now = new Date("2026-08-25T20:00:00.000Z");
    state.scheduledWakes = [{
      id: "wake_being_dispatched",
      presenceId: presence.id,
      wakeAt: "2026-08-25T19:59:59.000Z",
      state: "pending",
      reason: "inbound_event",
      payload: { triggers: ["inbound_event"] },
      createdAt: "2026-08-25T19:59:58.000Z",
      updatedAt: "2026-08-25T19:59:58.000Z",
    } as never];
    const projection = deriveActivityNow(state, presence.id, now);
    expect(projection.state).toBe("resting");
    expect(projection.nextWakeAt).toBeUndefined();
    expect(projection.nextWakePurpose).toBeUndefined();
  });
});

describe("operator nudges while paused", () => {
  it("delivers a message but holds it until an explicit Wake", () => {
    const state = createAgent({ name: "Nudge Test", description: "Test", audience: "Testers", mode: "agent", handle: "@nudge_test", accent: "#777777" });
    const presence = state.presence!;
    presence.status = "paused";
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "Please consider https://x.com/example/status/1" });
    expect(created.nudge.status).toBe("held_paused");
    expect(repairMissingOperatorNudgeWakes(created.state)).toBe(0);
    expect(created.state.operatorConversations?.[0]?.messages.at(-1)?.role).toBe("system");
    const released = releasePausedNudges(created.state, presence.id);
    expect(released.operatorNudges?.[0]?.status).toBe("queued");
  });

  it("repairs one lost wake for a queued nudge while live", () => {
    const state = createAgent({ name: "Live Nudge", description: "Test", audience: "Testers", mode: "agent", handle: "@live_nudge", accent: "#777777" });
    const presence = state.presence!;
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "Please consider this." });
    expect(created.nudge.status).toBe("acknowledged");
    expect(created.nudge.acknowledgedAt).toBeTruthy();
    expect(created.state.operatorConversations?.[0]?.messages).toHaveLength(1);
    expect(created.state.operatorConversations?.[0]?.messages[0]?.role).toBe("operator");
    expect(repairMissingOperatorNudgeWakes(created.state)).toBe(1);
    expect(repairMissingOperatorNudgeWakes(created.state)).toBe(0);
    expect(listScheduledWakes(presence.id).filter((wake) => wake.state === "pending" && ((wake.payload as { triggers?: string[] })?.triggers ?? []).includes("operator_nudge"))).toHaveLength(1);
  });

  it("repairs a queued nudge even while an older delivery awaits verification", () => {
    const state = createAgent({ name: "Delivery Continuity", description: "Test", audience: "Testers", mode: "agent", handle: "@delivery_continuity", accent: "#777777" });
    const presence = state.presence!;
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "Please consider this next." });
    const timestamp = new Date().toISOString();
    upsertOperationalRun({ id: `waiting_${presence.id}`, runId: `waiting_${presence.id}`, presenceId: presence.id, kind: "attention", state: "waiting", stage: "delivering", createdAt: timestamp, startedAt: timestamp, lastProgressAt: timestamp, eligibleAt: timestamp, attemptCount: 1, recoveryCount: 0 });
    expect(repairMissingOperatorNudgeWakes(created.state)).toBe(1);
    expect(listScheduledWakes(presence.id).some((wake) => wake.state === "pending" && ((wake.payload as { triggers?: string[] })?.triggers ?? []).includes("operator_nudge"))).toBe(true);
  });

  it("acknowledges receipt immediately and reports active consideration separately", () => {
    const state = createAgent({ name: "Live Chat", description: "Test", audience: "Testers", mode: "agent", handle: "@live_chat", accent: "#777777" });
    const presence = state.presence!;
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "Please consider https://x.com/example/status/123" });
    const episodeId = "attention_chat_ack";
    const episode = { id: episodeId, presenceId: presence.id } as never;
    const first = startQueuedNudge(created.state, presence.id, episode);
    expect(first.nudge?.status).toBe("working");
    expect(first.nudge?.acknowledgedAt).toBeTruthy();
    expect(first.state.operatorConversations?.[0]?.messages).toHaveLength(1);
    expect(first.state.operatorConversations?.[0]?.messages[0]?.role).toBe("operator");

    const settled = settleNudgeForEpisode(first.state, episodeId, "The post makes a concrete claim worth remembering, but does not need a public response.");
    const presenceMessages = settled.operatorConversations?.[0]?.messages.filter((message) => message.role === "presence") ?? [];
    expect(presenceMessages).toHaveLength(1);
    expect(presenceMessages[0]).toMatchObject({ milestone: "decision", content: "The post makes a concrete claim worth remembering, but does not need a public response." });
  });

  it("projects operator-linked executions as truthful chronological action events", () => {
    const state = createAgent({ name: "Genny", description: "Test", audience: "Testers", mode: "agent", handle: "@genny", accent: "#777777" });
    const presence = state.presence!;
    presence.execution.follow = "auto";
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "You should follow https://x.com/tibo" });
    const episodeId = "attention_chat_follow";
    const started = startQueuedNudge(created.state, presence.id, { id: episodeId, presenceId: presence.id } as never);
    started.state.mirrorObjects.unshift({ id: "mirror_tibo", presenceId: presence.id, externalRef: { type: "x.post", id: "post_tibo" }, author: { externalRef: { type: "x.user", id: "user_tibo" }, displayName: "Tibo", handle: "tibo" } } as never);
    const withIntent = formXActionIntent(started.state, { affordance: "x.follow", target: { type: "x.user", id: "user_tibo" }, attentionEpisodeId: episodeId, decision: { decision: "follow", origin: { kind: "operator", refId: created.nudge.id }, focalMirrorObjectIds: ["mirror_tibo"] } });
    const pending = operatorConversationActionEvents(withIntent, presence.id);
    expect(pending[0]).toMatchObject({ nudgeId: created.nudge.id, title: "Following @tibo on X", status: "queued", sourceUrl: "https://x.com/tibo" });

    // Sharing an attention pass is not enough to attribute an autonomous act
    // to this conversation. Only explicit operator-origin lineage may appear.
    const unrelatedIntent = {
      ...withIntent.socialIntents[0]!,
      id: "intent_unrelated_discovery",
      origin: { kind: "self_directed_discovery", refId: "plan_discovery" },
    } as typeof withIntent.socialIntents[number];
    const unrelatedExecution = {
      ...withIntent.executions[0]!,
      id: "execution_unrelated_discovery",
      socialIntentId: unrelatedIntent.id,
    } as typeof withIntent.executions[number];
    withIntent.socialIntents.unshift(unrelatedIntent);
    withIntent.executions.unshift(unrelatedExecution);
    expect(operatorConversationActionEvents(withIntent, presence.id)).toHaveLength(1);

    const operatorExecution = withIntent.executions.find((execution) => execution.socialIntentId !== unrelatedIntent.id)!;
    operatorExecution.status = "succeeded";
    operatorExecution.executedAt = new Date().toISOString();
    const verified = operatorConversationActionEvents(withIntent, presence.id);
    expect(verified[0]).toMatchObject({ title: "Genny followed @tibo on X", status: "verified", statusLabel: "Verified" });
  });

  it("keeps an Assignment handoff and its eventual result in the private conversation", () => {
    const state = createAgent({ name: "Live Assignment Chat", description: "Test", audience: "Testers", mode: "agent", handle: "@live_assignment_chat", accent: "#777777" });
    const presence = state.presence!;
    const created = createOperatorNudge(state, { presenceId: presence.id, content: "Respond to https://x.com/example/status/123" });
    created.nudge.assignmentId = "assignment_chat_1";
    created.nudge.status = "assignment_created";
    const handedOff = recordNudgeAssignmentHandoff(created.state, created.nudge.id, "Required Assignment queued. Its result will return to this conversation.");
    const settled = settleNudgeFromAssignment(handedOff, "assignment_chat_1", "deferred", "The post did not warrant a public response.");
    const messages = settled.operatorConversations?.[0]?.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({ role: "system", milestone: "assignment" });
    expect(messages[2]).toMatchObject({ role: "presence", milestone: "decision", content: "The post did not warrant a public response." });
    expect(settled.operatorNudges?.[0]).toMatchObject({ status: "resolved", resultSummary: "The post did not warrant a public response." });
  });
});
