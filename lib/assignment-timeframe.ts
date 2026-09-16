import type { Assignment, Execution, OpenPresenceState } from "./types";

/** Absolute instants keep a chat work window independent of server timezone. */
type WindowedAssignment = Pick<Assignment, "timeframe"> & Partial<Pick<Assignment, "createdAt" | "instruction" | "quantityPolicy">>;

function localDateParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as { year?: number; month?: number; day?: number };
}

function timezoneOffsetMs(value: Date, timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/^GMT([+-])(\d{2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "+" ? 1 : -1) * minutes * 60_000;
}

function legacyTodayWindow(assignment: WindowedAssignment, timezone: string) {
  if (!/\btoday\b|first post of the day/i.test(assignment.instruction ?? "") || !assignment.createdAt) return undefined;
  const parts = localDateParts(assignment.createdAt, timezone);
  if (![parts.year, parts.month, parts.day].every(Number.isFinite)) return undefined;
  const localMidnightAfter = new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day! + 1));
  const deadline = new Date(localMidnightAfter.getTime() - timezoneOffsetMs(localMidnightAfter, timezone) - 1).toISOString();
  return { startsAt: assignment.createdAt, deadline };
}

/**
 * Return the durable window, including the compatibility interpretation for
 * older relative-day Assignments that predate explicit timeframes. The
 * interpretation is anchored to creation's calendar day; retries never extend it.
 */
export function assignmentEffectiveWindow(assignment: WindowedAssignment, timezone = assignment.quantityPolicy?.timezone ?? "America/Toronto") {
  if (assignment.timeframe?.startsAt || assignment.timeframe?.deadline) return assignment.timeframe;
  return legacyTodayWindow(assignment, timezone);
}

export function assignmentWindowState(assignment: WindowedAssignment, nowMs = Date.now()): "open" | "upcoming" | "ended" {
  const window = assignmentEffectiveWindow(assignment);
  const start = Date.parse(window?.startsAt ?? "");
  const end = Date.parse(window?.deadline ?? "");
  if (Number.isFinite(end) && nowMs >= end) return "ended";
  if (Number.isFinite(start) && nowMs < start) return "upcoming";
  return "open";
}

export function assertAssignmentWindowOpen(assignment: WindowedAssignment, nowMs = Date.now()) {
  const state = assignmentWindowState(assignment, nowMs);
  if (state !== "open") throw new Error(state === "ended" ? "The task’s time window has ended." : "The task’s start time has not arrived.");
}

export const pendingAssignmentExecutionStatuses = new Set<Execution["status"]>([
  "awaiting-review", "approved", "awaiting-manual", "awaiting-connector",
  "queued", "claimed", "executing", "verification-pending",
]);

export function assignmentHasPendingDelivery(state: OpenPresenceState, assignmentId: string) {
  return state.executions.some((execution) => execution.assignmentId === assignmentId && pendingAssignmentExecutionStatuses.has(execution.status));
}

/** Retain run and outcome evidence; never expire a delivery still being reconciled. */
export function expireAssignmentWindows(state: import("./types").OpenPresenceState, nowMs = Date.now()): number {
  let changed = 0;
  for (const assignment of state.assignments) {
    if (["completed", "completed_with_adaptation", "cancelled", "expired_incomplete", "blocked", "needs_operator", "paused", "failed"].includes(assignment.status) || assignmentWindowState(assignment, nowMs) !== "ended") continue;
    // A closed window forbids new actions; it does not erase an execution that
    // may already have crossed the connector boundary. Let reconciliation
    // settle every pending state before terminal expiry.
    if (assignmentHasPendingDelivery(state, assignment.id)) continue;
    if ((state.assignmentRuns ?? []).some((run) => run.assignmentId === assignment.id && ["queued", "researching", "selecting", "writing", "delivering", "delivery_pending"].includes(run.status))) continue;
    assignment.status = "expired_incomplete";
    assignment.nextDueAt = undefined;
    assignment.updatedAt = new Date(nowMs).toISOString();
    assignment.lastOutcome = { class: "incomplete", message: `The time window ended with ${assignment.progress.verified} confirmed results. See work history for attempts and any failures.`, at: assignment.updatedAt };
    changed++;
  }
  return changed;
}
