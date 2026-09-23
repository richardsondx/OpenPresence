import type {
  EntityRef,
  Execution,
  JsonValue,
  OpenPresenceState,
  OperationLifecycleStatus,
  OperationRecord,
  OperationVerificationEvidence,
  TrajectoryActor,
  TrajectoryEvent,
} from "./types";

export interface TrajectoryTransitionInput {
  eventType: string;
  actor?: TrajectoryActor;
  status?: OperationLifecycleStatus;
  parentEventId?: string;
  causedByEventId?: string;
  supersedesEventId?: string;
  evidenceRefs?: EntityRef[];
  inputHashes?: Record<string, string>;
  verification?: OperationVerificationEvidence;
  payload?: Record<string, unknown>;
}

export interface ExecutionTransitionResult {
  event: TrajectoryEvent;
  operation: OperationRecord;
}

function isOperationRecord(value: unknown): value is OperationRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OperationRecord>;
  return typeof candidate.operationId === "string"
    && typeof candidate.presenceId === "string"
    && typeof candidate.actionKind === "string"
    && typeof candidate.intentVersion === "number"
    && typeof candidate.canonicalPayloadHash === "string"
    && typeof candidate.idempotencyKey === "string"
    && typeof candidate.status === "string"
    && typeof candidate.attemptNo === "number"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string";
}

/** Rebuild the derived operation projection using only append-only trajectory events. */
export function rebuildOperationRecordsFromTrajectory(events: TrajectoryEvent[]): OperationRecord[] {
  const latest = new Map<string, OperationRecord>();
  for (const event of [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.sequenceNo - right.sequenceNo)) {
    const projection = event.payload?.operationProjection;
    if (event.operationId && isOperationRecord(projection)) latest.set(event.operationId, projection);
  }
  return [...latest.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item) ?? null);
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = jsonValue(item);
      if (normalized !== undefined) output[key] = normalized;
    }
    return output;
  }
  return String(value);
}

function jsonRecord(value: Record<string, unknown> | undefined): Record<string, JsonValue> | undefined {
  if (!value) return undefined;
  const output: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = jsonValue(item);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

/** Stable, small hash for payload identity and paired replay assertions. */
export function canonicalPayloadHash(value: unknown): string {
  const canonical = (input: unknown): string => {
    if (input === null || typeof input === "string" || typeof input === "number" || typeof input === "boolean") return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
    if (typeof input === "object") return `{${Object.entries(input as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    return JSON.stringify(String(input));
  };
  let hash = 2166136261;
  for (const character of canonical(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function nextSequence(events: TrajectoryEvent[], streamId: string) {
  return events.reduce((highest, item) => item.streamId === streamId ? Math.max(highest, item.sequenceNo) : highest, 0) + 1;
}

/** Append-only trajectory evidence. The derived operation projection never replaces this history. */
export function appendTrajectoryEvent(state: OpenPresenceState, input: Omit<TrajectoryEvent, "id" | "sequenceNo"> & { id?: string }): TrajectoryEvent {
  const events = state.trajectoryEvents ?? (state.trajectoryEvents = []);
  const sequenceNo = nextSequence(events, input.streamId);
  const event: TrajectoryEvent = {
    ...input,
    id: input.id ?? `trajectory:${input.streamId}:${sequenceNo}`,
    sequenceNo,
  };
  events.push(event);
  return event;
}

export function operationStatusForExecution(execution: Pick<Execution, "status">, verification?: OperationVerificationEvidence): OperationLifecycleStatus {
  if (verification?.status === "failed") return "VERIFICATION_FAILED";
  if (verification?.rung === "outcome" && verification.status === "passed") return "OUTCOME_MEASURED";
  if (verification?.rung === "mirror" && verification.status === "passed") return "EXTERNAL_VERIFIED";
  switch (execution.status) {
    case "awaiting-review":
    case "awaiting-manual": return "AWAITING_APPROVAL";
    case "awaiting-connector": return "TOOL_UNAVAILABLE";
    case "approved": return "AUTHORIZED";
    case "queued": return "QUEUED";
    case "claimed":
    case "executing": return "DISPATCHING";
    case "verification-pending": return "EXTERNAL_STATE_UNKNOWN";
    case "verification-closed": return "MANUAL_REVIEW";
    case "succeeded": return "EXTERNAL_VERIFIED";
    case "blocked": return "POLICY_DENIED";
    case "cancelled": return "CANCELLED";
    case "expired": return "FAILED_TERMINAL";
    case "failed": return "FAILED_TERMINAL";
    default: return "INTENT_PROPOSED";
  }
}

function operationForExecution(state: OpenPresenceState, execution: Execution, status: OperationLifecycleStatus, now: string): OperationRecord {
  const operationId = execution.operationId ?? execution.id;
  const existing = (state.operationRecords ?? []).find((item) => item.operationId === operationId);
  const triggerId = execution.invocationId ?? execution.runId ?? execution.attentionEpisodeId;
  const operation: OperationRecord = {
    ...(existing ?? {
      id: `operation:${operationId}`,
      operationId,
      createdAt: execution.createdAt,
      attemptNo: execution.attempts,
      intentVersion: execution.intentVersion ?? 1,
      actionKind: execution.affordance,
      canonicalPayloadHash: execution.canonicalPayloadHash ?? canonicalPayloadHash({ affordance: execution.affordance, target: execution.target, publication: execution.publication }),
      idempotencyKey: execution.idempotencyKey,
      presenceId: execution.presenceId,
      goalId: execution.assignmentId,
      triggerId,
      target: execution.target,
    }),
    executionId: execution.id,
    socialIntentId: execution.socialIntentId,
    agentId: state.agent?.id,
    presenceId: execution.presenceId,
    goalId: execution.assignmentId ?? existing?.goalId,
    triggerId: triggerId ?? existing?.triggerId,
    target: execution.target ?? existing?.target,
    sessionId: execution.sessionId,
    actionKind: execution.affordance,
    intentVersion: execution.intentVersion ?? existing?.intentVersion ?? 1,
    canonicalPayloadHash: execution.canonicalPayloadHash ?? existing?.canonicalPayloadHash ?? canonicalPayloadHash({ affordance: execution.affordance, target: execution.target, publication: execution.publication }),
    idempotencyKey: execution.idempotencyKey,
    status,
    attemptNo: execution.attempts,
    lease: execution.lease ? { owner: execution.lease.executorId, claimedAt: execution.lease.claimedAt, expiresAt: execution.lease.expiresAt } : undefined,
    providerRequestId: execution.providerRequestId ?? existing?.providerRequestId,
    remoteObjectId: execution.externalRef?.id ?? existing?.remoteObjectId,
    retryAt: execution.retryAt,
    verification: existing?.verification ? [...existing.verification] : undefined,
    evidenceRefs: existing?.evidenceRefs,
    updatedAt: now,
  };
  if (state.operationRecords) state.operationRecords = [operation, ...state.operationRecords.filter((item) => item.operationId !== operationId)];
  else state.operationRecords = [operation];
  return operation;
}

/** Record a single execution transition and keep its stable operation projection current. */
export function recordExecutionTransition(state: OpenPresenceState, execution: Execution, input: TrajectoryTransitionInput): ExecutionTransitionResult {
  const now = execution.updatedAt || new Date().toISOString();
  execution.operationId = execution.operationId ?? execution.id;
  execution.intentVersion = execution.intentVersion ?? 1;
  execution.canonicalPayloadHash = execution.canonicalPayloadHash ?? canonicalPayloadHash({ affordance: execution.affordance, target: execution.target, publication: execution.publication });
  const status = input.status ?? operationStatusForExecution(execution, input.verification);
  const operation = operationForExecution(state, execution, status, now);
  if (input.verification) {
    const verification = [...(operation.verification ?? []).filter((item) => item.rung !== input.verification?.rung), input.verification];
    operation.verification = verification;
    execution.verification = verification;
    state.operationRecords = (state.operationRecords ?? []).map((item) => item.operationId === operation.operationId ? operation : item);
  }
  if (input.evidenceRefs?.length) {
    const evidence = [...(operation.evidenceRefs ?? [])];
    for (const ref of input.evidenceRefs) if (!evidence.some((item) => item.type === ref.type && item.id === ref.id)) evidence.push(ref);
    operation.evidenceRefs = evidence;
    state.operationRecords = (state.operationRecords ?? []).map((item) => item.operationId === operation.operationId ? operation : item);
  }
  const streamId = execution.sessionId ? `sandbox:${execution.sessionId}` : `presence:${execution.presenceId}`;
  const priorEvent = [...(state.trajectoryEvents ?? [])].reverse().find((item) => item.streamId === streamId && item.operationId === operation.operationId);
  const event = appendTrajectoryEvent(state, {
    streamId,
    eventType: input.eventType,
    parentEventId: input.parentEventId ?? priorEvent?.id,
    causedByEventId: input.causedByEventId ?? priorEvent?.id,
    supersedesEventId: input.supersedesEventId,
    goalId: execution.assignmentId,
    triggerId: execution.invocationId ?? execution.runId ?? execution.attentionEpisodeId,
    operationId: operation.operationId,
    presenceId: execution.presenceId,
    sessionId: execution.sessionId,
    sandboxSessionId: execution.sessionId,
    actor: input.actor ?? "worker",
    occurredAt: now,
    evidenceRefs: input.evidenceRefs,
    inputHashes: input.inputHashes,
    payload: jsonRecord({
      executionId: execution.id,
      socialIntentId: execution.socialIntentId,
      affordance: execution.affordance,
      status,
      operationProjection: operation,
      ...input.payload,
    }),
  });
  return { event, operation };
}

export function recordNoOpTrajectory(state: OpenPresenceState, input: { presenceId: string; sessionId?: string; triggerId?: string; reason: string; parentEventId?: string; at?: string }) {
  return appendTrajectoryEvent(state, {
    streamId: input.sessionId ? `sandbox:${input.sessionId}` : `presence:${input.presenceId}`,
    eventType: "no_op.recorded",
    parentEventId: input.parentEventId,
    triggerId: input.triggerId,
    presenceId: input.presenceId,
    sessionId: input.sessionId,
    sandboxSessionId: input.sessionId,
    actor: "agent",
    occurredAt: input.at ?? new Date().toISOString(),
    payload: { reason: input.reason, status: "NO_OP" },
  });
}
