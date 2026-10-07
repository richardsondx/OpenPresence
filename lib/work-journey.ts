import type { LiveEvent, OpenPresenceState, OperatorConversationMessage } from "./types";
import { chatToolReceipt, recordValue, toolActivitySummary } from "./chat-activity-presentation";

export type WorkJourneyStatus = "working" | "waiting" | "needs_you" | "failed" | "completed" | "recorded";
export interface WorkJourneyStep {
  id: string;
  title: string;
  detail: string;
  time: string;
  status: WorkJourneyStatus;
  kind: "request" | "update" | "tool" | "event";
  input?: unknown;
  output?: unknown;
  lineage?: Record<string, string>;
}
export interface WorkJourney {
  id: string;
  title: string;
  summary: string;
  status: WorkJourneyStatus;
  label: string;
  time: string;
  kind: "chat" | "assignment" | "attention" | "activity" | "notice";
  steps: WorkJourneyStep[];
  events: LiveEvent[];
}
const labels: Record<WorkJourneyStatus, string> = {
  working: "Working", waiting: "Waiting", needs_you: "Needs you", failed: "Couldn’t finish", completed: "Completed", recorded: "Recorded",
};
const lineageKeys = ["runId", "executionId", "invocationId", "attentionEpisodeId", "sourceTemporalEventId", "intentId", "decisionId", "outcomeId"] as const;
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const day = (value: string | Date) => new Date(value).toLocaleDateString("en-CA");
const concise = (value: string) => value.trim().split("\n")[0].slice(0, 100);
/** Tool receipts are already operator-scoped, but credentials and byte payloads
 * do not belong in an inspector. Bound nested data without hiding failures. */
function inspectable(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[Nested result omitted]";
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/.test(value)) return "[Media bytes omitted]";
    return value.length > 8000 ? `${value.slice(0, 8000)}\n[Result truncated]` : value;
  }
  if (Array.isArray(value)) return [...value.slice(0, 50).map((item) => inspectable(item, depth + 1)), ...(value.length > 50 ? [`[${value.length - 50} more items omitted]`] : [])];
  const record = recordValue(value);
  if (record) return Object.fromEntries(Object.entries(record).slice(0, 50).map(([key, item]) => [key, /(?:password|secret|credential|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|^token$|dataUrl|base64|bytes)/i.test(key) ? "[Private value omitted]" : inspectable(item, depth + 1)]));
  return value;
}
const chronological = <T extends { time: string }>(items: T[]) => items.sort((a, b) => a.time.localeCompare(b.time));

function durableStatus(status: string | undefined): WorkJourneyStatus {
  if (["completed", "completed_with_adaptation", "succeeded", "resolved"].includes(status ?? "")) return "completed";
  if (["failed", "expired_incomplete", "verification-closed"].includes(status ?? "")) return "failed";
  if (["needs_operator", "blocked", "awaiting-review", "awaiting_review"].includes(status ?? "")) return "needs_you";
  if (["waiting", "delivery_pending", "awaiting_execution", "awaiting-connector", "awaiting-manual", "verification-pending", "approved", "draft", "paused", "held_paused"].includes(status ?? "")) return "waiting";
  if (["acknowledged", "queued", "running", "researching", "selecting", "writing", "delivering", "working", "active", "planning", "accepted", "recovering", "claimed", "executing"].includes(status ?? "")) return "working";
  return "recorded";
}
function eventLineage(event: LiveEvent) {
  return Object.fromEntries(lineageKeys.flatMap((key) => event[key] ? [[key, event[key]!]] : []));
}
function eventStatus(state: OpenPresenceState, event: LiveEvent): WorkJourneyStatus {
  const execution = (state.executions ?? []).find((item) => item.id === event.executionId);
  if (execution) {
    if (execution.status === "succeeded") return (state.outcomes ?? []).some((outcome) => outcome.executionId === execution.id && outcome.status === "succeeded") ? "completed" : "waiting";
    return durableStatus(execution.status);
  }
  const outcome = (state.outcomes ?? []).find((item) => item.id === event.outcomeId);
  if (outcome) return outcome.status === "succeeded" ? "completed" : outcome.status === "failed" ? "failed" : "waiting";
  // Titles and positive tones are prose, not proof of completion.
  return event.tone === "warning" ? "needs_you" : "recorded";
}
function eventStep(state: OpenPresenceState, event: LiveEvent): WorkJourneyStep {
  // A later successful execution cannot rewrite a prior failure/attempt.
  const outcome = (state.outcomes ?? []).find((item) => item.id === event.outcomeId);
  const status: WorkJourneyStatus = event.tone === "warning" ? "needs_you" : outcome ? outcome.status === "succeeded" ? "completed" : outcome.status === "failed" ? "failed" : "waiting" : "recorded";
  return { id: event.id, title: event.title, detail: event.detail, time: event.time, kind: "event", status, lineage: eventLineage(event) };
}
function receiptStatus(receipt: Record<string, unknown>): WorkJourneyStatus {
  const presentation = toolActivitySummary(receipt);
  if (receipt.tool === "assignment" && !presentation.failed) {
    if (receipt.planningOnly === true && receipt.readyForReview === true) return "completed";
    return durableStatus(text(receipt.status));
  }
  if (["Needs your help", "Needs review", "Choose another image"].includes(presentation.status)) return "needs_you";
  if (presentation.failed) return "failed";
  if (["Ready to send", "Awaiting verification", "Retry queued"].includes(presentation.status)) return "waiting";
  if (presentation.status === "Sending") return "working";
  if (["Verified", "Finished", "Passed", "Saved"].includes(presentation.status)) return "completed";
  return "recorded";
}
function messageStep(message: OperatorConversationMessage): WorkJourneyStep {
  const receipt = chatToolReceipt(message);
  if (receipt) {
    const presentation = toolActivitySummary(receipt);
    const input = Object.fromEntries(Object.entries(receipt).filter(([key]) => !["tool", "result", "error", "failure", "delivered"].includes(key)));
    return {
      id: message.id, title: presentation.title, detail: [presentation.summary, presentation.limit].filter(Boolean).join("\n\n"),
      time: message.timestamp, kind: "tool", status: receiptStatus(receipt),
      input: Object.keys(input).length ? inspectable(input) : undefined,
      output: inspectable(receipt.result !== undefined && (receipt.failure || receipt.error) ? { result: receipt.result, failure: receipt.failure, error: receipt.error } : receipt.result ?? receipt.failure ?? receipt.error ?? receipt),
      lineage: { tool: String(receipt.tool), ...(message.replyToMessageId ? { replyToMessageId: message.replyToMessageId } : {}) },
    };
  }
  return { id: message.id, title: message.role === "operator" ? "Your request" : message.milestone === "acknowledgment" ? "Work accepted" : message.milestone === "failure" ? "Work interrupted" : "Agent update", detail: message.content, time: message.timestamp, kind: message.role === "operator" ? "request" : "update", status: message.milestone === "failure" ? "failed" : message.role === "operator" || message.milestone === "acknowledgment" ? "working" : "recorded" };
}
function finalise(journey: Omit<WorkJourney, "label" | "time">): WorkJourney {
  const steps = chronological(journey.steps);
  return { ...journey, steps, label: labels[journey.status], time: steps.at(-1)?.time ?? "" };
}

/** Read model only: receipt and run ledgers remain the source of truth. No
 * invented tool calls, specialists, or completion inferred from prose. */
export function projectWorkJourneys(state: OpenPresenceState, presenceId: string, now = new Date()): WorkJourney[] {
  const agentId = state.activeAgentId ?? state.agent?.id;
  const scopedEvents = (state.events ?? []).filter((event) => event.presenceId === presenceId);
  const usedEvents = new Set<string>();
  const representedAssignments = new Set<string>();
  const journeys: WorkJourney[] = [];
  for (const conversation of state.operatorConversations ?? []) {
    if (conversation.presenceId !== presenceId || agentId && conversation.agentId !== agentId) continue;
    const ordered = [...conversation.messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const turns = ordered.filter((message) => message.role === "operator");
    for (let index = 0; index < turns.length; index++) {
      const request = turns[index];
      const nextRequest = turns[index + 1];
      const messages = ordered.filter((message) => message.id === request.id || message.replyToMessageId === request.id || !message.replyToMessageId && message.role !== "operator" && message.timestamp >= request.timestamp && (!nextRequest || message.timestamp < nextRequest.timestamp));
      const nudge = (state.operatorNudges ?? []).find((item) => item.presenceId === presenceId && item.messageId === request.id);
      const assignmentIds = new Set(messages.flatMap((message) => {
        const receipt = chatToolReceipt(message);
        return [message.assignmentId, text(receipt?.assignmentId), text(recordValue(receipt?.result)?.assignmentId)].filter((id): id is string => Boolean(id));
      }));
      if (nudge?.assignmentId) assignmentIds.add(nudge.assignmentId);
      const assignments = (state.assignments ?? []).filter((assignment) => assignment.presenceId === presenceId && assignmentIds.has(assignment.id));
      assignments.forEach((assignment) => representedAssignments.add(assignment.id));
      const executionIds = new Set(messages.flatMap((message) => {
        const receipt = chatToolReceipt(message);
        const results = Array.isArray(receipt?.result) ? receipt.result : receipt?.result ? [receipt.result] : [];
        return results.flatMap((result) => { const id = text(recordValue(result)?.executionId); return id ? [id] : []; });
      }));
      const executions = (state.executions ?? []).filter((execution) => execution.presenceId === presenceId && (executionIds.has(execution.id) || assignmentIds.has(execution.assignmentId ?? "")));
      const assignmentRuns = (state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId && assignmentIds.has(run.assignmentId));
      const linked = scopedEvents.filter((event) => (nudge?.attentionEpisodeIds ?? []).includes(event.attentionEpisodeId ?? "") || assignmentRuns.some((run) => event.runId === run.id) || executionIds.has(event.executionId ?? "") || assignments.some((assignment) => event.sourceObjectId === assignment.id) || executions.some((execution) => event.executionId === execution.id));
      linked.forEach((event) => usedEvents.add(event.id));
      const steps: WorkJourneyStep[] = [...messages.map(messageStep), ...assignments.map((assignment) => ({ id: `assignment:${assignment.id}:state`, title: "Task status", detail: assignment.description ?? `Recorded task status: ${assignment.status.replaceAll("_", " ")}.`, time: assignment.updatedAt ?? assignment.createdAt, status: durableStatus(assignment.status), kind: "update" as const, lineage: { assignmentId: assignment.id } })), ...assignmentRuns.map((run) => ({ id: run.id, title: `Attempt ${run.attempts}`, detail: run.lastError ?? `Recorded stage: ${run.currentStage ?? run.status}`, time: run.lastProgressAt ?? run.updatedAt, status: durableStatus(run.status), kind: "update" as const, lineage: { runId: run.id, assignmentId: run.assignmentId } })), ...linked.map((event) => eventStep(state, event))];
      const answer = [...messages].reverse().find((message) => message.role === "presence" && message.milestone !== "acknowledgment");
      let status: WorkJourneyStatus = nudge ? durableStatus(nudge.status) : answer ? answer.milestone === "failure" ? "failed" : "completed" : "working";
      if (assignments.length) {
        const statuses = assignments.map((assignment) => durableStatus(assignment.status));
        status = statuses.includes("needs_you") ? "needs_you" : statuses.includes("working") ? "working" : statuses.includes("waiting") ? "waiting" : statuses.includes("failed") ? "failed" : statuses.every((item) => item === "completed") ? "completed" : "recorded";
      } else if (executions.length) {
        const statuses = executions.map((execution) => execution.status === "succeeded" ? (state.outcomes ?? []).some((outcome) => outcome.executionId === execution.id && outcome.status === "succeeded") ? "completed" : "waiting" : durableStatus(execution.status));
        status = statuses.includes("needs_you") ? "needs_you" : statuses.includes("working") ? "working" : statuses.includes("waiting") ? "waiting" : statuses.includes("failed") ? "failed" : statuses.every((item) => item === "completed") ? "completed" : "recorded";
      } else if (assignmentIds.size) {
        // A bounded response can omit an older Assignment; its receipt is
        // still evidence of delegation, never evidence that the work ended.
        const statuses = messages.flatMap((message) => {
          const receipt = chatToolReceipt(message);
          if (receipt?.tool !== "assignment") return [];
          const result = recordValue(receipt.result);
          const recorded = text(result?.status) ?? text(receipt.status);
          // A successful creation call proves a handoff, not a completed task.
          return [recorded ? durableStatus(recorded) : "waiting" as WorkJourneyStatus];
        });
        if (!statuses.length) statuses.push("waiting");
        status = statuses.includes("needs_you") ? "needs_you" : statuses.includes("working") ? "working" : statuses.includes("failed") ? "failed" : statuses.includes("waiting") ? "waiting" : statuses.every((item) => item === "completed") ? "completed" : "recorded";
      } else {
        const runIds = new Set(linked.flatMap((event) => event.runId ? [event.runId] : []));
        const latestRun = (state.operationalRuns ?? []).filter((run) => run.presenceId === presenceId && (runIds.has(run.id) || run.metadata?.operatorMessageId === request.id)).sort((a, b) => (b.lastProgressAt ?? b.createdAt).localeCompare(a.lastProgressAt ?? a.createdAt))[0];
        if (latestRun) status = durableStatus(latestRun.state);
        else if (!answer && steps.some((step) => step.status === "failed")) status = "failed";
      }
      journeys.push(finalise({ id: `chat:${conversation.id}:${request.id}`, title: concise(assignments[0]?.title ?? request.content), summary: assignmentIds.size && status !== "completed" ? `${labels[status]}. ${chronological(steps).filter((step) => step.kind !== "request" && step.id !== answer?.id).at(-1)?.detail ?? assignments[0]?.description ?? assignments[0]?.instruction ?? "The delegated work has no newer outcome recorded."}` : answer?.content ?? nudge?.resultSummary ?? steps.at(-1)?.detail ?? request.content, kind: assignments.length ? "assignment" : "chat", status, steps, events: linked }));
    }
  }
  for (const assignment of state.assignments ?? []) {
    if (assignment.presenceId !== presenceId || representedAssignments.has(assignment.id) || agentId && assignment.agentId !== agentId) continue;
    const runs = (state.assignmentRuns ?? []).filter((run) => run.presenceId === presenceId && run.assignmentId === assignment.id);
    const linked = scopedEvents.filter((event) => event.sourceObjectId === assignment.id || runs.some((run) => run.id === event.runId));
    linked.forEach((event) => usedEvents.add(event.id));
    const steps: WorkJourneyStep[] = [{ id: `assignment:${assignment.id}:request`, title: "Task created", detail: assignment.instruction, time: assignment.createdAt, status: "recorded", kind: "request" }, { id: `assignment:${assignment.id}:state`, title: "Task status", detail: assignment.description ?? `Recorded task status: ${assignment.status.replaceAll("_", " ")}.`, time: assignment.updatedAt ?? assignment.createdAt, status: durableStatus(assignment.status), kind: "update", lineage: { assignmentId: assignment.id } }, ...runs.map((run) => ({ id: run.id, title: `Attempt ${run.attempts}`, detail: run.lastError ?? `Recorded stage: ${run.currentStage ?? run.status}`, time: run.lastProgressAt ?? run.updatedAt, status: durableStatus(run.status), kind: "update" as const, lineage: { runId: run.id, assignmentId: assignment.id } })), ...linked.map((event) => eventStep(state, event))];
    journeys.push(finalise({ id: `assignment:${assignment.id}`, title: concise(assignment.title ?? assignment.instruction), summary: assignment.description ?? steps.at(-1)?.detail ?? assignment.instruction, status: durableStatus(assignment.status), kind: "assignment", steps, events: linked }));
  }
  for (const episode of state.attentionEpisodes ?? []) {
    if (episode.presenceId !== presenceId || agentId && episode.agentId !== agentId) continue;
    const linked = scopedEvents.filter((event) => !usedEvents.has(event.id) && (event.attentionEpisodeId === episode.id || (episode.runIds ?? []).includes(event.runId ?? "")));
    linked.forEach((event) => usedEvents.add(event.id));
    const steps: WorkJourneyStep[] = [...(episode.steps ?? []).map((step) => ({ id: step.id, title: step.label, detail: step.detail ?? "No additional detail was recorded.", time: step.completedAt ?? step.startedAt ?? episode.updatedAt, status: step.status === "active" ? "working" as const : step.status === "pending" ? "waiting" as const : durableStatus(step.status), kind: "update" as const, lineage: { attentionEpisodeId: episode.id } })), ...linked.map((event) => eventStep(state, event))];
    if (!steps.length) steps.push({ id: episode.id, title: "Attention pass", detail: episode.summary ?? episode.lastError ?? "A bounded attention pass was recorded.", time: episode.updatedAt, status: durableStatus(episode.status), kind: "update" });
    journeys.push(finalise({ id: `attention:${episode.id}`, title: "Reviewing social activity", summary: episode.summary ?? episode.lastError ?? steps.at(-1)?.detail ?? "", status: durableStatus(episode.status), kind: "attention", steps, events: linked }));
  }
  // Union only strong causal references. A session/source ID can span many
  // unrelated requests and is never sufficient to merge their histories.
  const remaining = scopedEvents.filter((event) => !usedEvents.has(event.id));
  const groups: LiveEvent[][] = [];
  const referenceGroup = new Map<string, LiveEvent[]>();
  for (const event of remaining) {
    const refs = lineageKeys.flatMap((key) => event[key] ? [`${key}:${event[key]}`] : []);
    const matches = [...new Set(refs.map((ref) => referenceGroup.get(ref)).filter((group): group is LiveEvent[] => Boolean(group)))];
    const group = matches.shift() ?? [];
    if (!groups.includes(group)) groups.push(group);
    for (const other of matches) {
      group.push(...other);
      groups.splice(groups.indexOf(other), 1);
      for (const [ref, old] of referenceGroup) if (old === other) referenceGroup.set(ref, group);
    }
    group.push(event);
    refs.forEach((ref) => referenceGroup.set(ref, group));
  }
  const notices = new Map<string, WorkJourney>();
  for (const group of groups) {
    chronological(group);
    const latest = group.at(-1)!;
    const repetitiveNotice = group.length === 1 && ["Browser observation delayed", "Exploration degraded"].includes(latest.title);
    if (repetitiveNotice) {
      const key = `${day(latest.time)}:${latest.title}`;
      const existing = notices.get(key);
      if (existing) { existing.steps.push(eventStep(state, latest)); existing.events.push(latest); continue; }
      notices.set(key, finalise({ id: `notice:${key}`, title: latest.title, summary: latest.detail, status: eventStatus(state, latest), kind: "notice", steps: [eventStep(state, latest)], events: group }));
    } else journeys.push(finalise({ id: `activity:${group[0].id}`, title: group[0].title, summary: latest.detail, status: eventStatus(state, latest), kind: "activity", steps: group.map((event) => eventStep(state, event)), events: group }));
  }
  for (const notice of notices.values()) journeys.push(finalise({ ...notice, summary: `${notice.steps.length} recorded attempt${notice.steps.length === 1 ? "" : "s"}. ${chronological(notice.steps).at(-1)?.detail ?? ""}` }));
  return journeys.filter((journey) => journey.steps.some((step) => day(step.time) === day(now)))
    .sort((a, b) => b.time.localeCompare(a.time));
}
