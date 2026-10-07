import type { ActivityNowProjection, AttentionStep, OpenPresenceState, OperationalRun, ScheduledWake } from "./types";
import { assignmentPursuitVerifiedCounts } from "./runtime";

const ACTIVE_RUN_STATES = new Set<OperationalRun["state"]>(["queued", "running", "recovering", "delivery_uncertain", "reconciling"]);
const STAGE_EXPECTATIONS_MS: Record<string, number> = {
  queued: 30_000,
  observing: 120_000,
  "native.observe": 120_000,
  "runtime.pulse": 90_000,
  "discovery.search": 120_000,
  "discovery.triage": 120_000,
  "discovery.decide": 180_000,
  delivering: 180_000,
  verifying: 300_000,
};

const latest = <T>(items: T[], at: (item: T) => string | undefined) => [...items].sort((a, b) => (at(b) ?? "").localeCompare(at(a) ?? ""))[0];

function pursuitResourceUsage(state: OpenPresenceState, pursuit: NonNullable<OpenPresenceState["assignmentPursuitWindows"]>[number], now: Date) {
  const start = new Date(pursuit.startsAt).getTime();
  const end = Math.min(new Date(pursuit.deadlineAt).getTime(), now.getTime());
  const events = state.resourceUsageEvents.filter((event) => event.presenceId === pursuit.presenceId
    && event.attentionSource === "assignment"
    && event.originId === pursuit.assignmentId
    && new Date(event.createdAt).getTime() >= start
    && new Date(event.createdAt).getTime() <= end);
  const count = (category: string) => events
    .filter((event) => event.category === category)
    .reduce((total, event) => total + (event.usage.requests ?? 1), 0);
  return {
    channelReads: count("channel_read"),
    modelCalls: count("model"),
    hydrations: count("hydration"),
    visionCalls: count("vision"),
  };
}

function pursuitCapacityReason(state: OpenPresenceState, pursuit: NonNullable<OpenPresenceState["assignmentPursuitWindows"]>[number], now: Date) {
  const usage = pursuitResourceUsage(state, pursuit, now);
  const limits: Array<[string, number | undefined, number]> = [
    ["channel reads", pursuit.resourceBudget?.maxChannelReads, usage.channelReads],
    ["hydrations", pursuit.resourceBudget?.maxHydrations, usage.hydrations],
    ["vision calls", pursuit.resourceBudget?.maxVisionCalls, usage.visionCalls],
  ];
  const reached = limits.find(([, limit, current]) => limit !== undefined && current >= limit);
  return reached ? `${reached[0]} budget reached (${reached[2]} / ${reached[1]}).` : undefined;
}

function assignmentSteps(run: NonNullable<OpenPresenceState["assignmentRuns"]>[number]): AttentionStep[] {
  const at = run.lastProgressAt ?? run.updatedAt;
  const statusIndex = ({ queued: 0, researching: 1, selecting: 2, writing: 3, delivering: 4 } as Record<string, number>)[run.status] ?? 0;
  const definitions: Array<{ kind: AttentionStep["kind"]; label: string }> = [
    { kind: "queued", label: "Assignment run queued" },
    { kind: "searching", label: "Researching source evidence" },
    { kind: "judging", label: "Judging the candidates" },
    { kind: "acting", label: "Writing the expression" },
    { kind: "verifying", label: "Delivering and verifying" },
  ];
  return definitions.map((definition, index) => ({
    id: `${run.id}:${definition.kind}`,
    kind: definition.kind,
    status: index < statusIndex ? "completed" : index === statusIndex ? "active" : "pending",
    label: definition.label,
    startedAt: index <= statusIndex ? at : undefined,
    completedAt: index < statusIndex ? at : undefined,
  }));
}

function wakePurpose(wake?: ScheduledWake) {
  if (!wake) return undefined;
  if (wake.kind === "verification") return "Confirm delivery";
  const payload = wake.payload as { triggers?: string[]; scope?: string } | undefined;
  const triggers = payload?.triggers ?? [];
  if (triggers.includes("inbound_event")) return "Review new social activity";
  if (triggers.includes("operator_nudge")) return "Consider your latest note";
  if (triggers.includes("assignment_due") || payload?.scope === "assignment") return "Advance due work";
  if (payload?.scope === "broad" || triggers.includes("self_directed")) return "Look for something worth acting on";
  return "Refresh mentions and conversations";
}

function runTitle(stage: string) {
  if (stage === "queued") return "Getting ready to look";
  if (stage === "observing" || stage === "native.observe") return "Checking what changed";
  if (stage === "runtime.pulse") return "Reviewing new conversations";
  if (stage === "discovery.search") return "Searching for worthwhile signals";
  if (stage === "discovery.triage") return "Narrowing the candidates";
  if (stage === "discovery.decide" || stage === "choosing") return "Judging what deserves a response";
  if (stage === "delivering") return "Sending the chosen action";
  if (stage === "verifying") return "Verifying what happened";
  return "Working through the current attention pass";
}

function runDetail(run: OperationalRun, steps: AttentionStep[]) {
  const active = steps.find((step) => step.status === "active");
  if (active?.current !== undefined && active.total) return `${active.label} · ${active.current} of ${active.total}`;
  if (active?.detail) return active.detail;
  const trigger = run.attention?.triggers.includes("operator_nudge") ? "your note" : run.attention?.triggers.includes("inbound_event") ? "new social activity" : "the live social world";
  return `A bounded pass is actively working through ${trigger}.`;
}

function truthfulAttentionSteps(state: OpenPresenceState, episode?: NonNullable<OpenPresenceState["attentionEpisodes"]>[number]) {
  const steps = episode?.steps ?? [];
  if (!episode) return steps;
  const executions = state.executions.filter((execution) => execution.attentionEpisodeId === episode.id || episode.executionIds.includes(execution.id));
  const reachedDelivery = executions.some((execution) => ["succeeded", "claimed", "executing", "verification-pending"].includes(execution.status));
  if (reachedDelivery) return steps;
  return steps
    .filter((step) => step.kind !== "verifying")
    .map((step) => step.label === "Delivery attempted"
      ? { ...step, label: "No delivery attempted", detail: "No selected action reached the channel, so nothing was sent." }
      : step);
}

export function deriveActivityNow(state: OpenPresenceState, presenceId: string, now = new Date()): ActivityNowProjection {
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const runs = (state.operationalRuns ?? []).filter((run) => run.presenceId === presenceId);
  const activeRun = latest(runs.filter((run) => run.kind !== "verification" && ACTIVE_RUN_STATES.has(run.state)), (run) => run.lastProgressAt ?? run.startedAt ?? run.createdAt);
  const waitingAttentionRun = latest(runs.filter((run) => run.kind === "attention" && run.state === "waiting"), (run) => run.lastProgressAt ?? run.startedAt ?? run.createdAt);
  const activeAssignmentRun = latest((state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId && ["researching", "selecting", "writing", "delivering"].includes(run.status)), (run) => run.lastProgressAt ?? run.updatedAt);
  const queuedAssignmentRun = latest((state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId && run.status === "queued"), (run) => run.updatedAt);
  const pendingDeliveryRun = latest((state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId
    && run.status === "delivery_pending"
    // A legacy AssignmentRun can outlive its execution after verification is
    // closed. Do not present that empty projection as current waiting work;
    // the durable execution status is the authority for delivery continuity.
    && (() => {
      const executions = state.executions.filter((execution) => execution.presenceId === presenceId
        && execution.assignmentId === run.assignmentId
        && (execution.runId === run.id || (!execution.runId && execution.createdAt >= (run.startedAt ?? run.createdAt))));
      return executions.length === 0 || executions.some((execution) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending", "succeeded"].includes(execution.status));
    })()), (run) => run.updatedAt);
  const activePursuit = (state.assignmentPursuitWindows ?? []).find((pursuit) => pursuit.presenceId === presenceId
    && pursuit.status === "active"
    && new Date(pursuit.startsAt).getTime() <= now.getTime()
    && new Date(pursuit.deadlineAt).getTime() > now.getTime());
  const pausedPursuit = latest((state.assignmentPursuitWindows ?? []).filter((pursuit) => pursuit.presenceId === presenceId
    && pursuit.status === "paused"
    && new Date(pursuit.deadlineAt).getTime() > now.getTime()
    && new Date(pursuit.updatedAt ?? pursuit.createdAt).getTime() <= now.getTime()), (pursuit) => pursuit.updatedAt ?? pursuit.createdAt);
  const pursuitRun = activePursuit
    ? latest((state.assignmentRuns ?? []).filter((run) => run.pursuitWindowId === activePursuit.id && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status)), (run) => run.lastProgressAt ?? run.updatedAt)
    : undefined;
  const activeEpisode = activeRun?.attentionEpisodeId ? state.attentionEpisodes?.find((episode) => episode.id === activeRun.attentionEpisodeId) : undefined;
  const pendingWake = [...(state.scheduledWakes ?? [])]
    // A due wake is dispatch work, not a future promise to the operator. During
    // the scheduler's claim/settle window it can still be visible as pending;
    // projecting that row produced the frozen-looking "Next wake just now"
    // message even though the header's next normal pulse was minutes away.
    .filter((wake) => wake.presenceId === presenceId
      && wake.state === "pending"
      && new Date(wake.wakeAt).getTime() > now.getTime())
    .sort((a, b) => a.wakeAt.localeCompare(b.wakeAt))[0];
  const footing = presence?.context.publicFooting;
  const judged = new Set(footing?.judgedInboundIds ?? []);
  const pendingInboundCount = (footing?.recentInboundIds ?? []).filter((id) => !judged.has(id)).length;
  const pendingNudges = (state.operatorNudges ?? []).filter((nudge) => nudge.presenceId === presenceId && ["queued", "acknowledged", "working", "held_paused"].includes(nudge.status));
  const overdueAssignment = state.assignments.find((assignment) => assignment.presenceId === presenceId
    && ["accepted", "planning", "active", "working", "awaiting_execution"].includes(assignment.status)
    && !(assignment.work?.maxAttempts && assignment.work.attempts >= assignment.work.maxAttempts)
    && assignment.nextDueAt && new Date(assignment.nextDueAt).getTime() <= now.getTime());
  const steps = truthfulAttentionSteps(state, activeEpisode);

  if (presence?.status === "paused") return {
    presenceId,
    state: "paused",
    title: "Paused by you",
    detail: pendingInboundCount || pendingNudges.length ? `${pendingInboundCount} social item${pendingInboundCount === 1 ? "" : "s"} and ${pendingNudges.length} note${pendingNudges.length === 1 ? "" : "s"} will wait until you wake this Presence.` : "Nothing will run until you wake this Presence.",
    steps: [],
    pendingInboundCount,
    pendingNudgeCount: pendingNudges.length,
  };

  if (activeRun) {
    if (activeRun.state === "queued") {
      const blockingIncident = (state.recoveryIncidents ?? []).find((incident) =>
        incident.state === "needs_operator"
        && incident.operatorActionRequired
        && incident.rootCauseKey !== "runtime.duplicate_public_outcome"
        && (!incident.presenceId || incident.presenceId === presenceId));
      return {
        presenceId,
        state: blockingIncident ? "paused" : "recovering",
        title: blockingIncident ? "Attention pass waiting for your review" : "Attention pass queued to resume",
        detail: blockingIncident
          ? `${blockingIncident.safeSummary} No cognition worker is running; the queued pass will resume after the blocking issue is resolved.`
          : "No cognition worker is running yet. The durable recovery is queued and will resume automatically.",
        since: activeRun.startedAt ?? activeRun.createdAt,
        nextWakeAt: pendingWake?.wakeAt,
        nextWakePurpose: wakePurpose(pendingWake),
        activeRunId: activeRun.id,
        activeEpisodeId: activeEpisode?.id,
        steps,
        pendingInboundCount,
        pendingNudgeCount: pendingNudges.length,
      };
    }
    const progressAt = activeRun.lastHeartbeatAt ?? activeRun.lastProgressAt ?? activeRun.startedAt ?? activeRun.createdAt;
    const age = Math.max(0, now.getTime() - new Date(progressAt).getTime());
    const expected = STAGE_EXPECTATIONS_MS[activeRun.stage] ?? 120_000;
    const stuck = activeRun.state !== "recovering" && age > expected;
    const recovering = activeRun.state === "recovering" || activeRun.state === "reconciling";
    return {
      presenceId,
      state: stuck ? "stuck" : recovering ? "recovering" : "working",
      title: stuck ? `Stuck while ${runTitle(activeRun.stage).toLowerCase()}` : recovering ? "Recovering the current work" : runTitle(activeRun.stage),
      detail: stuck ? `No meaningful progress has been recorded for ${Math.max(1, Math.floor(age / 1000))} seconds.` : recovering ? "OpenPresence is repairing the runtime before reconsidering the responsibility." : runDetail(activeRun, steps),
      since: activeRun.startedAt ?? activeRun.createdAt,
      nextWakeAt: pendingWake?.wakeAt,
      nextWakePurpose: wakePurpose(pendingWake),
      activeRunId: activeRun.id,
      activeEpisodeId: activeEpisode?.id,
      steps,
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
      staleForMs: stuck ? age : undefined,
    };
  }

  // A burst is a separate operator-requested execution window. Do not let an
  // old Attention verification run win the headline while the burst is still
  // active. Between bounded passes this is intentionally a distinct state:
  // the worker is not running at this exact millisecond, but the push is.
  if (activePursuit) {
    const capacityReason = pursuitCapacityReason(state, activePursuit, now);
    const verified = assignmentPursuitVerifiedCounts(state, activePursuit, now.getTime()).verified;
    if (capacityReason) return {
      presenceId,
      state: "paused",
      title: "Burst paused at capacity",
      detail: `The burst used its bounded resource envelope: ${capacityReason} Only ${verified} public action${verified === 1 ? " is" : "s are"} verified; no further pass will be inferred from the exhausted budget.`,
      since: activePursuit.createdAt,
      activeAssignmentId: activePursuit.assignmentId,
      nextWakePurpose: "Resume after the resource envelope is changed",
      steps: [],
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
    };
    if (pursuitRun) {
      const progressAt = pursuitRun.heartbeatAt ?? pursuitRun.lastProgressAt ?? pursuitRun.startedAt ?? pursuitRun.createdAt;
      const age = Math.max(0, now.getTime() - new Date(progressAt).getTime());
      const expected = pursuitRun.status === "researching" || pursuitRun.status === "selecting" ? 180_000 : 300_000;
      const stuck = age > expected;
      const title = pursuitRun.status === "writing" ? "Burst is writing an expression" : pursuitRun.status === "delivering" || pursuitRun.status === "delivery_pending" ? "Burst is delivering an action" : "Burst is scanning for an opportunity";
      return {
        presenceId,
        state: stuck ? "stuck" : "working",
        title: stuck ? `Stuck while ${title.toLowerCase()}` : title,
        detail: stuck ? `No meaningful burst progress has been recorded for ${Math.max(1, Math.floor(age / 1000))} seconds.` : `Pass ${pursuitRun.attempts} is working through the burst window.`,
        since: pursuitRun.startedAt ?? pursuitRun.createdAt,
        activeAssignmentId: activePursuit.assignmentId,
        steps: assignmentSteps(pursuitRun),
        pendingInboundCount,
        pendingNudgeCount: pendingNudges.length,
        staleForMs: stuck ? age : undefined,
      };
    }
    const nextPass = activePursuit.nextRunAt && new Date(activePursuit.nextRunAt).getTime() > now.getTime() ? activePursuit.nextRunAt : undefined;
    return {
      presenceId,
      state: nextPass ? "bursting" : "stuck",
      title: nextPass ? "Burst is active · next pass scheduled" : "Burst is due but not running",
      detail: nextPass ? "The burst is between bounded scan passes; the next pass will continue looking for a qualified opportunity." : "The burst window is active, but its next pass is overdue and no AssignmentRun is present.",
      since: activePursuit.createdAt,
      nextWakeAt: nextPass,
      nextWakePurpose: "Continue the burst scan",
      activeAssignmentId: activePursuit.assignmentId,
      steps: [],
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
    };
  }

  // A burst that was durably paused must remain the headline until its
  // operator-visible reason is understood. Otherwise an unrelated stale
  // Attention verification run can make a completed/paused burst look like
  // the current work is merely "at rest".
  if (pausedPursuit) {
    const verified = assignmentPursuitVerifiedCounts(state, pausedPursuit, now.getTime()).verified;
    const reason = pausedPursuit.pauseReason ?? "The burst is paused and will not schedule another pass.";
    return {
      presenceId,
      state: "paused",
      title: reason.includes("budget reached") ? "Burst paused at capacity" : "Burst paused",
      detail: `${reason} Only ${verified} public action${verified === 1 ? " is" : "s are"} verified; no further pass will be inferred until the burst is resumed or closed.`,
      since: pausedPursuit.createdAt,
      activeAssignmentId: pausedPursuit.assignmentId,
      nextWakePurpose: "Resume or close the burst",
      steps: [],
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
    };
  }

  if (waitingAttentionRun) {
    // A non-retryable verification result is still intentionally ambiguous,
    // but it is paused on an operator/provider dependency rather than
    // silently looking like an abandoned worker.
    const waitingExecutions = state.executions.filter((execution) =>
      execution.presenceId === presenceId
      && (execution.attentionEpisodeId === waitingAttentionRun.attentionEpisodeId || execution.runId === waitingAttentionRun.id || !execution.attentionEpisodeId && !execution.runId)
      && execution.status === "verification-pending",
    );
    const verificationPaused = waitingExecutions.some((execution) => execution.failure?.retryable === false);
    const waitingEpisode = waitingAttentionRun.attentionEpisodeId
      ? state.attentionEpisodes?.find((episode) => episode.id === waitingAttentionRun.attentionEpisodeId)
      : undefined;
    const waitingSteps = truthfulAttentionSteps(state, waitingEpisode);
    const waitingEpisodeExecutions = waitingEpisode
      ? state.executions.filter((execution) => execution.attentionEpisodeId === waitingEpisode.id || waitingEpisode.executionIds.includes(execution.id) || execution.runId === waitingAttentionRun.id)
      : state.executions.filter((execution) => execution.presenceId === presenceId && (!execution.attentionEpisodeId && !execution.runId || execution.runId === waitingAttentionRun.id));
    const deliveryReached = waitingEpisodeExecutions.some((execution) => ["succeeded", "claimed", "executing", "verification-pending"].includes(execution.status));
    const deliveryWaiting = waitingEpisodeExecutions.filter((execution) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"].includes(execution.status)).length;
    const waitingForConfirmation = waitingAttentionRun.stage === "verifying" && (deliveryReached || waitingExecutions.length > 0);
    const waitingForAuthorizedDelivery = waitingAttentionRun.stage === "delivering" || deliveryWaiting > 0;
    return {
      presenceId,
      state: "resting",
      title: waitingForConfirmation ? "Waiting for X verification" : waitingForAuthorizedDelivery ? "Waiting for authorized delivery" : "Waiting for the attention pass to settle",
      detail: verificationPaused
        ? "X verification is paused until the authorized verification route is available. Review the runtime notice to continue."
        : waitingForConfirmation
          ? "A selected action reached the delivery boundary and is waiting for a verified outcome."
          : waitingForAuthorizedDelivery
            ? `${deliveryWaiting || "The selected action"} ${deliveryWaiting === 1 ? "is" : deliveryWaiting ? "selected actions are" : "is"} waiting for an authorized delivery route. No cognition worker is running.`
            : "The attention pass is waiting on durable delivery state; no new public action is being inferred from the incomplete record.",
      since: waitingAttentionRun.startedAt ?? waitingAttentionRun.createdAt,
      nextWakeAt: pendingWake?.wakeAt,
      nextWakePurpose: wakePurpose(pendingWake),
      activeRunId: waitingAttentionRun.id,
      activeEpisodeId: waitingAttentionRun.attentionEpisodeId,
      steps: waitingSteps,
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
    };
  }

  if (activeAssignmentRun) {
    const progressAt = activeAssignmentRun.heartbeatAt ?? activeAssignmentRun.lastProgressAt ?? activeAssignmentRun.startedAt ?? activeAssignmentRun.createdAt;
    const age = Math.max(0, now.getTime() - new Date(progressAt).getTime());
    const expected = activeAssignmentRun.status === "researching" ? 180_000 : activeAssignmentRun.status === "selecting" ? 180_000 : 300_000;
    const stuck = age > expected;
    const title = activeAssignmentRun.status === "writing" ? "Writing the current expression" : activeAssignmentRun.status === "delivering" ? "Delivering the current expression" : activeAssignmentRun.status === "selecting" ? "Judging Assignment candidates" : "Researching the current Assignment";
    return {
      presenceId,
      state: stuck ? "stuck" : "working",
      title: stuck ? `Stuck while ${title.toLowerCase()}` : title,
      detail: stuck ? `No meaningful Assignment progress has been recorded for ${Math.max(1, Math.floor(age / 1000))} seconds.` : `Attempt ${activeAssignmentRun.attempts} of ${activeAssignmentRun.maxAttempts} · ${activeAssignmentRun.status.replaceAll("_", " ")}.`,
      since: activeAssignmentRun.startedAt ?? activeAssignmentRun.createdAt,
      activeAssignmentId: activeAssignmentRun.assignmentId,
      nextWakeAt: pendingWake?.wakeAt,
      nextWakePurpose: wakePurpose(pendingWake),
      steps: assignmentSteps(activeAssignmentRun),
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
      staleForMs: stuck ? age : undefined,
    };
  }

  if (queuedAssignmentRun) return {
    presenceId,
    state: "recovering",
    title: "Assignment queued to resume",
    detail: "The durable AssignmentRun exists but has not started working yet.",
    since: queuedAssignmentRun.createdAt,
    activeAssignmentId: queuedAssignmentRun.assignmentId,
    steps: assignmentSteps(queuedAssignmentRun),
    pendingInboundCount,
    pendingNudgeCount: pendingNudges.length,
  };

  if (pendingDeliveryRun) return {
    presenceId,
    state: "resting",
    title: "Waiting for authorized delivery or X verification",
    detail: "Cognition is finished and no worker is running. The result is waiting on its authorized delivery or verification route.",
    since: pendingDeliveryRun.startedAt ?? pendingDeliveryRun.createdAt,
    activeAssignmentId: pendingDeliveryRun.assignmentId,
    nextWakeAt: pendingWake?.wakeAt,
    nextWakePurpose: wakePurpose(pendingWake),
    steps: assignmentSteps({ ...pendingDeliveryRun, status: "delivering" }),
    pendingInboundCount,
    pendingNudgeCount: pendingNudges.length,
  };

  if (overdueAssignment) {
    const hasRepairWake = Boolean(pendingWake && ((pendingWake.payload as { triggers?: string[] } | undefined)?.triggers ?? []).includes("assignment_due"));
    return {
      presenceId,
      state: hasRepairWake ? "recovering" : "stuck",
      title: hasRepairWake ? "Recovering overdue Assignment work" : "Overdue Assignment has no worker",
      detail: hasRepairWake ? "A durable wake has been repaired and the responsibility is queued to resume." : "The responsibility is overdue, but no active run or durable wake exists.",
      activeAssignmentId: overdueAssignment.id,
      nextWakeAt: pendingWake?.wakeAt,
      nextWakePurpose: "Advance due work",
      steps: [],
      pendingInboundCount,
      pendingNudgeCount: pendingNudges.length,
    };
  }

  return {
    presenceId,
    state: "resting",
    title: "Resting between attention passes",
    detail: "Nothing is running right now. That is expected.",
    nextWakeAt: pendingWake?.wakeAt,
    nextWakePurpose: wakePurpose(pendingWake),
    steps: [],
    pendingInboundCount,
    pendingNudgeCount: pendingNudges.length,
  };
}
