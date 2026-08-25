const STAGE_EXPECTED_MS = [120_000, 120_000, 60_000, 60_000] as const;

export interface ActivityProgressEstimate {
  percent: number;
  timingLabel: string;
  elapsedLabel: string;
  overdue: boolean;
}

function parseTime(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s elapsed` : `${seconds}s elapsed`;
}

/**
 * Gives Activity a visibly moving, deliberately approximate ETA. Durable stage
 * changes provide the real milestones; elapsed time may only move the bar
 * within the current milestone and can never imply a verified outcome.
 */
export function estimateActivityProgress(input: {
  stageIndex: number;
  startedAt?: string;
  stageStartedAt?: string;
  now: number;
  completed?: boolean;
}): ActivityProgressEstimate {
  if (input.completed) {
    return { percent: 100, timingLabel: "Complete", elapsedLabel: formatElapsed(input.now - parseTime(input.startedAt, input.now)), overdue: false };
  }

  const stageIndex = Math.min(3, Math.max(0, Math.floor(input.stageIndex)));
  const startedAt = parseTime(input.startedAt, input.now);
  const stageStartedAt = Math.max(startedAt, parseTime(input.stageStartedAt, startedAt));
  const totalElapsedMs = Math.max(0, input.now - startedAt);
  const stageElapsedMs = Math.max(0, input.now - stageStartedAt);
  const expectedStageMs = STAGE_EXPECTED_MS[stageIndex];
  const overdue = stageElapsedMs > expectedStageMs;
  const withinStage = Math.min(0.88, stageElapsedMs / expectedStageMs * 0.88);
  const percent = Math.round((stageIndex + withinStage) * 25);

  if (overdue) {
    return {
      percent,
      timingLabel: "Taking longer than usual",
      elapsedLabel: formatElapsed(totalElapsedMs),
      overdue,
    };
  }

  const futureMs = STAGE_EXPECTED_MS.slice(stageIndex + 1).reduce((sum, duration) => sum + duration, 0);
  const remainingMs = Math.max(0, expectedStageMs - stageElapsedMs) + futureMs;
  const upperMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const lowerMinutes = Math.max(1, Math.ceil(upperMinutes * 0.65));
  const timingLabel = upperMinutes <= 1
    ? "Estimated under 1 min remaining"
    : lowerMinutes === upperMinutes
      ? `Estimated about ${upperMinutes} min remaining`
      : `Estimated ${lowerMinutes}–${upperMinutes} min remaining`;

  return { percent, timingLabel, elapsedLabel: formatElapsed(totalElapsedMs), overdue };
}
