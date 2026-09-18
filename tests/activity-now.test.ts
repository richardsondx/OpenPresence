import { describe, expect, it } from "vitest";
import { deriveActivityNow } from "../lib/activity-now";
import { activityRefreshIntervalMs } from "../lib/activity-polling";
import { createOperatorNudge, directWatchQuery, isBurstStatusQuestion, operatorBurstStatusReply, operatorNudgeReceipt, operatorRequestsWatch, recordOperatorConversationMessage, recordNudgeAssignmentHandoff, releasePausedNudges, settleNudgeForEpisode, settleNudgeFromAssignment, startQueuedNudge } from "../lib/operator-chat";
import { operatorConversationActionEvents } from "../lib/operator-chat-projection";
import { applyOperation, createAgent, formXActionIntent, initialState } from "../lib/runtime";
import { deferQueuedAssignmentRunsOutsideWindow } from "../lib/assignment-recovery";
import { closeNonRetryableVerificationExecutions, dueLiveAssignmentsWithoutWorkers, pauseExhaustedAssignmentPursuits, queuedLiveAssignmentRunsWithoutWorkers, repairMissingAssignmentWakes, repairMissingOperatorNudgeWakes, repairPendingBridgeVerificationWakes } from "../lib/temporal";
import { listScheduledWakes, readState, readStateVersion, upsertOperationalRun, writeState } from "../lib/db";
import { POST as statePost } from "../app/api/state/route";
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

  it("only exposes one due live Assignment per Presence to the scheduler", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date();
    const base = {
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "live" as const,
      status: "active" as const,
      deliverable: { type: "original_publication" as const },
      progress: { required: 1, verified: 0 },
      work: { phase: "candidate_review" as const, attempts: 0, maxAttempts: 4, storiesResearched: 0 },
      schedule: { day: now.toLocaleDateString("en-US", { weekday: "long" }), time: "00:00", executionWindow: "00:00–23:59" },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    state.assignments = [{ ...base, id: "due:first" }, { ...base, id: "due:second" }] as never;

    expect(dueLiveAssignmentsWithoutWorkers(state, now).map((assignment) => assignment.id)).toEqual(["due:first"]);
  });

  it("rediscovers a queued live AssignmentRun after a process or fetch loss", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-09-08T23:30:00.000Z");
    const assignment = {
      id: "queued-assignment",
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "live" as const,
      status: "working" as const,
      deliverable: { type: "original_publication" as const },
      progress: { required: 1, verified: 0 },
      work: { phase: "researching" as const, attempts: 1, maxAttempts: 4, storiesResearched: 0 },
      schedule: { day: "Monday", time: "08:00", executionWindow: "08:00–11:00" },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    state.assignments = [assignment] as never;
    state.assignmentRuns = [{
      id: "queued-run",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: presence.id,
      sessionId: `live:${presence.id}`,
      status: "queued",
      currentStage: "researching",
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }];

    expect(queuedLiveAssignmentRunsWithoutWorkers(state).map((run) => run.id)).toEqual(["queued-run"]);
  });

  it("does not rediscover queued rows after responsibility is paused or terminal", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const statuses = ["paused", "completed", "cancelled"] as const;
    state.assignments = statuses.map((status, index) => ({
      id: `stale-assignment-${status}`,
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "live" as const,
      status,
      deliverable: { type: "original_publication" as const },
      progress: { required: 1, verified: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() + index).toISOString(),
    })) as never;
    state.assignmentRuns = statuses.map((status) => ({
      id: `stale-run-${status}`,
      assignmentId: `stale-assignment-${status}`,
      agentId: state.agent!.id,
      presenceId: presence.id,
      sessionId: `live:${presence.id}`,
      status: "queued" as const,
      currentStage: "candidate_review" as const,
      attempts: 0,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    expect(queuedLiveAssignmentRunsWithoutWorkers(state)).toEqual([]);
  });

  it("acknowledges an internal wake selected before an Assignment was cancelled", async () => {
    let state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state = applyOperation(state, { type: "createAssignment", presenceId: presence.id, environment: "live", instruction: "Publish one useful original note." });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "cancelAssignment", id: assignment.id });
    state.assignmentRuns = [{
      id: "cancelled-after-selection",
      assignmentId: assignment.id,
      agentId: state.agent!.id,
      presenceId: presence.id,
      sessionId: `live:${presence.id}`,
      status: "queued",
      currentStage: "researching",
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    writeState(state);
    const beforeVersion = readStateVersion();
    try {
      const response = await statePost(new Request("http://localhost/api/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-openpresence-internal-dispatch": "assignment" },
        body: JSON.stringify({ type: "runLiveAssignment", assignmentId: assignment.id, presenceId: presence.id }),
      }));
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ accepted: true, assignmentId: assignment.id, paused: true });
      expect(readStateVersion()).toBe(beforeVersion);
      expect(readState().assignmentRuns?.[0]?.status).toBe("queued");
    } finally {
      writeState(initialState());
    }
  });

  it("settles a queued scheduled run after its window closes", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const assignment = {
      id: "closed-assignment",
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "live" as const,
      status: "working" as const,
      deliverable: { type: "original_publication" as const },
      progress: { required: 1, verified: 0 },
      work: { phase: "researching" as const, attempts: 1, maxAttempts: 4, storiesResearched: 0 },
      schedule: { day: "Monday", time: "08:00", executionWindow: "08:00–11:00" },
      createdAt: "2026-09-07T08:00:00.000Z",
      updatedAt: "2026-09-07T08:00:00.000Z",
    };
    state.assignments = [assignment] as never;
    state.assignmentRuns = [{
      id: "closed-run",
      assignmentId: assignment.id,
      agentId: assignment.agentId,
      presenceId: presence.id,
      sessionId: `live:${presence.id}`,
      status: "queued",
      currentStage: "researching",
      attempts: 1,
      maxAttempts: 4,
      rejectedCandidates: 0,
      createdAt: "2026-09-08T12:05:26.088Z",
      updatedAt: "2026-09-08T12:05:26.088Z",
    }];

    const settled = deferQueuedAssignmentRunsOutsideWindow(state, assignment.id, presence.id, Date.parse("2026-09-08T23:30:00.000Z"));
    expect(settled.deferredRunIds).toEqual(["closed-run"]);
    expect(settled.state.assignmentRuns?.[0]).toMatchObject({ status: "deferred", currentStage: "candidate_review" });
    expect(settled.state.assignments[0]).toMatchObject({ status: "active", work: { phase: "candidate_review" } });
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

  it("shows a queued recovery as durable waiting work instead of active or stuck cognition", () => {
    const state = fixture();
    const presence = state.presence!;
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    state.operationalRuns = [{ id: "queued-recovery", runId: "queued-recovery", presenceId: presence.id, kind: "attention", state: "queued", stage: "recovery_retry_attention", createdAt: old, startedAt: old, lastProgressAt: old, eligibleAt: old, attemptCount: 1, recoveryCount: 0 } as OperationalRun];

    const projection = deriveActivityNow(state, presence.id);

    expect(projection.state).toBe("recovering");
    expect(projection.title).toBe("Attention pass queued to resume");
    expect(projection.detail).toContain("No cognition worker is running");
    expect(projection.staleForMs).toBeUndefined();
  });

  it("shows a queued recovery as waiting for review when a Presence-wide operator gate exists", () => {
    const state = fixture();
    const presence = state.presence!;
    const timestamp = new Date().toISOString();
    state.operationalRuns = [{ id: "queued-provider-recovery", runId: "queued-provider-recovery", presenceId: presence.id, kind: "attention", state: "queued", stage: "recovery_retry_attention", createdAt: timestamp, lastProgressAt: timestamp, eligibleAt: timestamp, attemptCount: 1, recoveryCount: 0 } as OperationalRun];
    state.recoveryIncidents = [{ id: "provider-review", rootCauseKey: "model_provider.credentials_missing", dependencyId: "provider", presenceId: presence.id, state: "needs_operator", openedAt: timestamp, lastObservedAt: timestamp, affectedRunIds: [], recoveryAttempts: 0, safeSummary: "The selected AI provider is not configured.", operatorActionRequired: true, updatedAt: timestamp }];

    const projection = deriveActivityNow(state, presence.id);

    expect(projection.state).toBe("paused");
    expect(projection.title).toBe("Attention pass waiting for your review");
    expect(projection.detail).toContain("No cognition worker is running");
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
    expect(waiting.title).toBe("Waiting for authorized delivery or X verification");
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

  it("shows X verification as a durable waiting state and repairs its verification wake", () => {
    const state = fixture();
    const presence = state.presence!;
    const timestamp = new Date().toISOString();
    const executionId = `verification_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    state.operationalRuns = [{ id: "waiting_confirmation", runId: "waiting_confirmation", presenceId: presence.id, kind: "attention", state: "waiting", stage: "verifying", createdAt: timestamp, startedAt: timestamp, lastProgressAt: timestamp, attemptCount: 1, recoveryCount: 0 } as OperationalRun];
    state.executions.unshift({ id: executionId, presenceId: presence.id, connector: "bridge", bridgeId: "bridge_for_verification", status: "verification-pending", failure: { retryable: true }, createdAt: timestamp, updatedAt: timestamp } as never);

    expect(repairPendingBridgeVerificationWakes(state, new Date(timestamp))).toBe(1);
    expect(repairPendingBridgeVerificationWakes(state, new Date(timestamp))).toBe(0);
    state.scheduledWakes = listScheduledWakes(presence.id);
    const projection = deriveActivityNow(state, presence.id, new Date(timestamp));
    expect(projection.title).toBe("Waiting for X verification");
    expect(projection.nextWakePurpose).toBe("Confirm delivery");
    expect(listScheduledWakes(presence.id).some((wake) => wake.id === `wake_verification_${executionId}` && wake.kind === "verification")).toBe(true);
  });

  it("closes non-retryable verification outcomes instead of leaving them in-flight", () => {
    const state = fixture();
    const presence = state.presence!;
    state.executions.unshift({
      id: "stale-verification",
      presenceId: presence.id,
      affordance: "x.reply",
      mode: "auto",
      connector: "bridge",
      status: "verification-pending",
      failure: { code: "X_API_CREDITS_EXHAUSTED", message: "X verification is paused.", retryable: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
    const execution = state.executions[0]!;
    expect(closeNonRetryableVerificationExecutions(state)).toBe(1);
    expect(state.executions.find((item) => item.id === execution.id)?.status).toBe("verification-closed");
    expect(state.executions.find((item) => item.id === execution.id)?.externalRef).toBeUndefined();
  });

  it("detects overdue Assignment work without misrouting it through generic Attention", () => {
    const state = fixture();
    const presence = state.presence!;
    state.assignments.unshift({ id: `overdue_${Date.now()}_${Math.random()}`, presenceId: presence.id, status: "active", nextDueAt: "2020-01-01T00:00:00.000Z" } as never);
    expect(repairMissingAssignmentWakes(state)).toBe(1);
    expect(listScheduledWakes(presence.id).some((wake) => ((wake.payload as { triggers?: string[] })?.triggers ?? []).includes("assignment_due"))).toBe(false);
  });

  it("does not reopen a scheduled promotion after its execution window closes", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date(2026, 7, 30, 19, 0, 0);
    state.assignments.unshift({
      id: "closed-scheduled-promotion",
      agentId: state.agent!.id,
      presenceId: presence.id,
      environment: "live",
      status: "active",
      deliverable: { type: "meaningful_engagement" },
      schedule: { day: "Sunday", time: "08:00", executionWindow: "08:00–18:00" },
      nextDueAt: new Date(now.getTime() - 60_000).toISOString(),
      progress: { required: 0, verified: 1 },
      work: { phase: "candidate_review", attempts: 42, maxAttempts: 0, storiesResearched: 40 },
      lastOutcome: { class: "action_no_op", message: "No earned source action in the last pass.", at: new Date(now.getTime() - 60_000).toISOString() },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } as never);
    state.assignmentPursuitWindows = [{ id: "expired-promotion-window", assignmentId: "closed-scheduled-promotion", agentId: state.agent!.id, presenceId: presence.id, startsAt: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(), deadlineAt: new Date(now.getTime() - 60 * 60_000).toISOString(), maxVerifiedActions: 40, status: "expired", createdAt: now.toISOString(), updatedAt: now.toISOString() }];

    expect(dueLiveAssignmentsWithoutWorkers(state, now)).toEqual([]);
  });

  it("keeps an active burst moving after the parent Assignment is completed", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    state.assignments.unshift({
      id: "completed_distribution_assignment",
      agentId: state.agent!.id,
      presenceId: presence.id,
      channelId: "x",
      environment: "live",
      status: "completed",
      deliverable: { type: "meaningful_engagement" },
      progress: { required: 1, verified: 1 },
      work: { phase: "completed", attempts: 4, maxAttempts: 4, storiesResearched: 1 },
      lastOutcome: { class: "assignment_completed", message: "The normal daily deliverable is complete.", at: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
    state.assignmentPursuitWindows = [{
      id: "active_burst",
      assignmentId: "completed_distribution_assignment",
      agentId: state.agent!.id,
      presenceId: presence.id,
      startsAt: "2026-08-29T00:00:00.000Z",
      deadlineAt: "2099-08-29T00:00:00.000Z",
      maxVerifiedActions: 10,
      status: "active",
      nextRunAt: "2026-08-29T00:00:00.000Z",
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    }];

    expect(dueLiveAssignmentsWithoutWorkers(state, new Date("2026-08-29T01:00:00.000Z")).map((item) => item.id)).toEqual(["completed_distribution_assignment"]);
  });

  it("retries a burst after the worker exhausts recovery without reopening other blocks", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "recoverable_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "blocked", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, work: { phase: "blocked", attempts: 4, maxAttempts: 4, storiesResearched: 1, blockedReason: "The Assignment worker stopped reporting progress and exhausted its recovery attempts." }, lastOutcome: { class: "incomplete", message: "The Assignment worker stopped reporting progress and exhausted its recovery attempts.", at: now.toISOString() }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "recoverable_burst", assignmentId: "recoverable_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, status: "active", nextRunAt: "2026-08-29T01:00:00.000Z", createdAt: now.toISOString(), updatedAt: now.toISOString() }];

    expect(dueLiveAssignmentsWithoutWorkers(state, now).map((item) => item.id)).toEqual(["recoverable_burst_assignment"]);
  });

  it("keeps a burst visible above stale confirmation work between scan passes", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "burst_assignment", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "active", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "burst", assignmentId: "burst_assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, status: "active", nextRunAt: "2026-08-29T01:01:00.000Z", createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    state.operationalRuns = [{ id: "stale_confirmation", runId: "stale_confirmation", presenceId: presence.id, kind: "attention", state: "waiting", stage: "verifying", createdAt: now.toISOString(), startedAt: now.toISOString(), lastProgressAt: now.toISOString(), attemptCount: 1, recoveryCount: 0 } as OperationalRun];
    state.executions = [{ id: "old_pending", assignmentId: "old_assignment", presenceId: presence.id, status: "verification-pending", failure: { retryable: false }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never];

    const projection = deriveActivityNow(state, presence.id, now);
    expect(projection.state).toBe("bursting");
    expect(projection.title).toContain("Burst is active");
    expect(projection.title).not.toBe("Waiting for X verification");
  });

  it("keeps a burst active when only its model-call budget is exhausted", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "budgeted_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "active", instruction: "Find a worthwhile conversation to engage with.", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "budgeted_burst", assignmentId: "budgeted_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, resourceBudget: { maxModelCalls: 1 }, status: "active", nextRunAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    state.resourceUsageEvents = [{ id: "model_budget", agentId: state.agent!.id, presenceId: presence.id, invocationId: "run", originKind: "assignment", originId: "budgeted_burst_assignment", attentionSource: "assignment", category: "model", provider: "openai", usage: { requests: 1 }, createdAt: now.toISOString() }];

    expect(pauseExhaustedAssignmentPursuits(state, now)).toBe(0);
    expect(state.assignmentPursuitWindows[0]).toMatchObject({ status: "active", nextRunAt: now.toISOString() });
  });

  it("still pauses a burst when a hard delivery resource is exhausted", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "hard_budget_assignment", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "active", instruction: "Find a worthwhile conversation to engage with.", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "hard_budget_burst", assignmentId: "hard_budget_assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, resourceBudget: { maxChannelReads: 1 }, status: "active", nextRunAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    state.resourceUsageEvents = [{ id: "read_budget", agentId: state.agent!.id, presenceId: presence.id, invocationId: "run", originKind: "assignment", originId: "hard_budget_assignment", attentionSource: "assignment", category: "channel_read", provider: "x", usage: { requests: 1 }, createdAt: now.toISOString() }];

    expect(pauseExhaustedAssignmentPursuits(state, now)).toBe(1);
    expect(state.assignmentPursuitWindows[0]).toMatchObject({ status: "paused", nextRunAt: undefined, pauseReason: "maxChannelReads budget reached (1 / 1)." });
  });

  it("does not redispatch an exhausted burst before its pause is persisted", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "due_exhausted_burst", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "active", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "due_exhausted", assignmentId: "due_exhausted_burst", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, resourceBudget: { maxModelCalls: 1 }, status: "active", nextRunAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    state.resourceUsageEvents = [{ id: "model_budget", agentId: state.agent!.id, presenceId: presence.id, invocationId: "run", originKind: "assignment", originId: "due_exhausted_burst", attentionSource: "assignment", category: "model", provider: "openai", usage: { requests: 1 }, createdAt: now.toISOString() }];

    expect(dueLiveAssignmentsWithoutWorkers(state, now)).toEqual([]);
  });

  it("does not run the parent Assignment behind a capacity-paused burst", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, status: "live" as const };
    state.presence = presence;
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const now = new Date("2026-08-29T01:00:00.000Z");
    state.assignments.unshift({ id: "paused_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, environment: "live", status: "active", nextDueAt: "2026-08-29T00:59:00.000Z", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() } as never);
    state.assignmentPursuitWindows = [{ id: "paused_burst", assignmentId: "paused_burst_assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: "2026-08-29T00:00:00.000Z", deadlineAt: "2026-08-29T02:00:00.000Z", maxVerifiedActions: 10, resourceBudget: { maxModelCalls: 1 }, status: "paused", pauseReason: "maxModelCalls budget reached (1 / 1).", createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    expect(dueLiveAssignmentsWithoutWorkers(state, now)).toEqual([]);
  });

  it("does not present an expired capacity pause as current Activity work", () => {
    const state = fixture();
    const presence = state.presence!;
    const now = new Date("2026-08-30T12:00:00.000Z");
    state.assignmentPursuitWindows = [{
      id: "expired_paused_burst",
      assignmentId: "expired_paused_assignment",
      agentId: state.agent!.id,
      presenceId: presence.id,
      startsAt: "2026-08-28T00:00:00.000Z",
      deadlineAt: "2026-08-29T04:00:00.000Z",
      maxVerifiedActions: 40,
      resourceBudget: { maxModelCalls: 40 },
      status: "paused",
      pauseReason: "maxModelCalls budget reached (40 / 40).",
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-29T03:00:00.000Z",
    }];

    const projection = deriveActivityNow(state, presence.id, now);
    expect(projection.state).toBe("resting");
    expect(projection.title).toBe("Resting between attention passes");
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

describe("bounded Activity polling", () => {
  const fixture = () => createAgent({ name: "Polling Test", description: "Test", audience: "Testers", mode: "agent", handle: "@polling_test", accent: "#777777" });

  it("polls faster while an attention run is active", () => {
    const state = fixture();
    const presence = state.presence!;
    state.operationalRuns = [{
      id: "active-attention",
      runId: "active-attention",
      presenceId: presence.id,
      kind: "attention",
      state: "running",
      stage: "runtime.pulse",
      createdAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
      eligibleAt: new Date().toISOString(),
      attemptCount: 1,
      recoveryCount: 0,
    } as OperationalRun];
    expect(activityRefreshIntervalMs(state)).toBe(2_000);
  });

  it("backs off when no durable work or nudge is active", () => {
    expect(activityRefreshIntervalMs(fixture())).toBe(10_000);
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
    const messages = created.state.operatorConversations?.[0]?.messages ?? [];
    expect(messages.filter((message) => message.role === "operator")).toHaveLength(1);
    expect(messages.at(-1)?.role).toBe("operator");
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
    const firstMessages = first.state.operatorConversations?.[0]?.messages ?? [];
    expect(firstMessages.filter((message) => message.role === "operator")).toHaveLength(1);
    expect(firstMessages.at(-1)?.role).toBe("operator");

    const settled = settleNudgeForEpisode(first.state, episodeId, "The post makes a concrete claim worth remembering, but does not need a public response.");
    const presenceMessages = settled.operatorConversations?.[0]?.messages.filter((message) => message.role === "presence" && message.milestone === "decision") ?? [];
    expect(presenceMessages).toHaveLength(1);
    expect(presenceMessages[0]).toMatchObject({ content: "The post makes a concrete claim worth remembering, but does not need a public response." });
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
    expect(messages.filter((message) => message.milestone === "assignment")).toHaveLength(1);
    expect(messages.find((message) => message.milestone === "assignment")).toMatchObject({ role: "system" });
    expect(messages.at(-1)).toMatchObject({ role: "presence", milestone: "decision", content: "The post did not warrant a public response." });
    expect(settled.operatorNudges?.[0]).toMatchObject({ status: "resolved", resultSummary: "The post did not warrant a public response." });
  });
});

describe("natural operator conversation", () => {
  it("describes shared context without claiming a judgment before inspection", () => {
    expect(operatorNudgeReceipt("https://x.com/example/status/123 What do you think about this?")).toContain("I’m checking the post you shared now.");
    expect(operatorNudgeReceipt("Please review this image")).toContain("I’m looking at what you shared now.");
  });

  it("recognizes burst timing questions without treating them as start commands", () => {
    expect(isBurstStatusQuestion("Did you start that campaign yet?")).toBe(true);
    expect(isBurstStatusQuestion("When are you starting the burst?")).toBe(true);
    expect(isBurstStatusQuestion("Can you start the burst tonight?")).toBe(false);
  });

  it("answers burst status from durable state and separates pending from verified work", () => {
    const state = createAgent({ name: "Burst Status", description: "Test", audience: "Testers", mode: "agent", handle: "@burst_status", accent: "#777777" });
    const presence = state.presence!;
    const startedAt = "2026-08-28T22:00:00.000Z";
    const deadlineAt = "2026-08-29T03:59:59.999Z";
    state.assignmentPursuitWindows = [{ id: "burst", assignmentId: "assignment", agentId: state.agent!.id, presenceId: presence.id, startsAt: startedAt, deadlineAt, maxVerifiedActions: 10, status: "active", updatedAt: startedAt, createdAt: startedAt }];
    state.assignmentRuns = [{ id: "run", assignmentId: "assignment", agentId: state.agent!.id, presenceId: presence.id, sessionId: `live:${presence.id}`, pursuitWindowId: "burst", status: "delivery_pending", currentStage: "publishing", attempts: 1, maxAttempts: 4, rejectedCandidates: 0, startedAt, updatedAt: startedAt, createdAt: startedAt }];
    state.executions = [{ id: "pending", assignmentId: "assignment", presenceId: presence.id, affordance: "x.reply", mode: "auto", status: "verification-pending", attempts: 1, idempotencyKey: "pending", createdAt: startedAt, updatedAt: startedAt } as never];

    const reply = operatorBurstStatusReply(state, presence.id, new Date("2026-08-28T23:00:00.000Z"));
    expect(reply).toContain("It’s active now");
    expect(reply).toContain("0 verified actions");
    expect(reply).toContain("awaiting authorized delivery or X verification");
    expect(reply).not.toContain("Assignment instruction");
  });

  it("records a normal question without creating a nudge or attention wake", () => {
    const state = createAgent({ name: "Conversational Agent", description: "Stay useful.", audience: "Builders", mode: "agent", handle: "@conversational_agent", accent: "#777777" });
    const withOperator = recordOperatorConversationMessage(state, { presenceId: state.presence!.id, content: "What did you do recently?" });
    const withReply = recordOperatorConversationMessage(withOperator, { presenceId: state.presence!.id, content: "I was reviewing the latest signal.", role: "presence" });
    expect(withReply.operatorNudges ?? []).toHaveLength(0);
    expect(withReply.operatorConversations?.[0]?.messages.slice(-2).map((message) => message.role)).toEqual(["operator", "presence"]);
  });

  it("treats a retried operator send as the same private turn", () => {
    const state = createAgent({ name: "Retry-safe Agent", description: "Test", audience: "Testers", mode: "agent", handle: "@retry_safe", accent: "#777777" });
    const first = createOperatorNudge(state, { presenceId: state.presence!.id, content: "Please inspect this post.", clientRequestId: "client-send-1" });
    const second = createOperatorNudge(first.state, { presenceId: state.presence!.id, content: "Please inspect this post.", clientRequestId: "client-send-1" });
    expect(second.duplicate).toBe(true);
    expect(second.nudge.id).toBe(first.nudge.id);
    expect(second.state.operatorNudges).toHaveLength(1);
    expect(second.state.operatorConversations?.[0]?.messages.filter((message) => message.role === "operator")).toHaveLength(1);
  });

  it("deduplicates a retried normal operator conversation turn", () => {
    const state = createAgent({ name: "Conversation Retry", description: "Test", audience: "Testers", mode: "agent", handle: "@conversation_retry", accent: "#777777" });
    const first = recordOperatorConversationMessage(state, { presenceId: state.presence!.id, content: "What did you do?", clientRequestId: "client-chat-1" });
    const second = recordOperatorConversationMessage(first, { presenceId: state.presence!.id, content: "What did you do?", clientRequestId: "client-chat-1" });
    expect(second.operatorConversations?.[0]?.messages.filter((message) => message.role === "operator")).toHaveLength(1);
  });

  it("recognizes an explicit person-watch request for the private watch tool", () => {
    expect(operatorRequestsWatch("Just came across this guy, we should start watching him")).toBe(true);
    expect(directWatchQuery("Keep watching @builder_one")).toBe("builder_one");
    expect(directWatchQuery("I like this post")).toBeUndefined();
  });
});
