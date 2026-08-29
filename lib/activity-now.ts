import type { ActivityNowProjection, AttentionStep, OpenPresenceState, OperationalRun, ScheduledWake } from "./types";

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

function assignmentSteps(run: NonNullable<OpenPresenceState["assignmentRuns"]>[number]): AttentionStep[] {
  const at = run.lastProgressAt ?? run.updatedAt;
  const statusIndex = ({ queued: 0, researching: 1, selecting: 2, writing: 3, delivering: 4 } as Record<string, number>)[run.status] ?? 0;
  const definitions: Array<{ kind: AttentionStep["kind"]; label: string }> = [
    { kind: "queued", label: "Assignment run queued" },
    { kind: "searching", label: "Researching source evidence" },
    { kind: "judging", label: "Judging the candidates" },
    { kind: "acting", label: "Writing the expression" },
    { kind: "verifying", label: "Delivering and confirming" },
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
  if (stage === "verifying") return "Confirming what happened";
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
  const pendingDeliveryRun = latest((state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId && run.status === "delivery_pending"), (run) => run.updatedAt);
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

  if (waitingAttentionRun) {
    // A non-retryable verification result is still intentionally ambiguous,
    // but it is paused on an operator/provider dependency rather than
    // silently looking like an abandoned worker.
    const waitingExecutions = state.executions.filter((execution) =>
      execution.presenceId === presenceId
      && execution.attentionEpisodeId === waitingAttentionRun.attentionEpisodeId
      && execution.status === "verification-pending",
    );
    const verificationPaused = waitingExecutions.some((execution) => execution.failure?.retryable === false);
    const waitingEpisode = waitingAttentionRun.attentionEpisodeId
      ? state.attentionEpisodes?.find((episode) => episode.id === waitingAttentionRun.attentionEpisodeId)
      : undefined;
    const waitingSteps = truthfulAttentionSteps(state, waitingEpisode);
    const waitingEpisodeExecutions = waitingEpisode
      ? state.executions.filter((execution) => execution.attentionEpisodeId === waitingEpisode.id || waitingEpisode.executionIds.includes(execution.id))
      : [];
    const deliveryReached = waitingEpisodeExecutions.some((execution) => ["succeeded", "claimed", "executing", "verification-pending"].includes(execution.status));
    const deliveryWaiting = waitingEpisodeExecutions.filter((execution) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued"].includes(execution.status)).length;
    return {
      presenceId,
      state: "resting",
      title: deliveryReached && waitingAttentionRun.stage === "verifying" ? "Waiting for confirmation" : deliveryWaiting ? "Waiting for authorized delivery" : "No delivery was attempted",
      detail: verificationPaused
        ? "Confirmation is paused until the authorized verification route is available. Review the runtime notice to continue."
        : deliveryWaiting
          ? `${deliveryWaiting} selected action${deliveryWaiting === 1 ? " is" : "s are"} still waiting for an authorized delivery route. Nothing has reached the channel yet.`
          : "The social world did not produce a selected action that reached delivery. Nothing was sent.",
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
    title: "Waiting for delivery confirmation",
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
