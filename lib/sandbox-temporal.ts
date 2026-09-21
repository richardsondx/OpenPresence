/**
 * A small, deterministic temporal kernel for Sandbox work.
 *
 * This module deliberately has no persistence, timers, wall-clock reads, or
 * connector knowledge. A runtime can adopt it later by keeping one kernel per
 * isolated Playground world, translating its snapshot to/from durable session
 * state, and treating trajectory records as evidence rather than as a second
 * product state store. The adapter should dispatch the kernel's ordered events
 * into the existing observation -> intent -> execution -> outcome path.
 */

export type TemporalTime = number | Date | string;

export type TemporalEventStatus = "pending" | "fired" | "cancelled" | "stale";
export type TemporalOutcomeStatus = "scheduled" | "recorded" | "cancelled" | "stale";
export type TemporalRetryStatus = "pending" | "attempting" | "succeeded" | "exhausted" | "cancelled";

export interface TemporalRecurrence {
  intervalMs: number;
  /** Total occurrences, including the first occurrence. */
  count?: number;
  /** No occurrence is scheduled at or after this time. */
  until?: TemporalTime;
}

export interface TemporalFenceToken {
  key: string;
  generation: number;
}

export interface TemporalAcceleration {
  factor: number;
  mode: "manual" | "accelerated";
  /** The latest real duration supplied to tick(), when applicable. */
  realElapsedMs?: number;
  /** The corresponding virtual duration applied by tick(), when applicable. */
  virtualElapsedMs?: number;
  updatedAt: number;
}

export interface TemporalEvent {
  id: string;
  rootId: string;
  type: string;
  at: number;
  /** The initial offset used to derive this occurrence, if one was supplied. */
  offsetMs?: number;
  priority: number;
  sequence: number;
  occurrence: number;
  status: TemporalEventStatus;
  payload?: unknown;
  recurrence?: TemporalRecurrence;
  fence?: TemporalFenceToken;
  causeEventId?: string;
  /** Stable registry key required when a handler must survive snapshot replay. */
  handlerId?: string;
  /** Stable replay key; executable handlers are supplied by the rehydrator. */
  handlerKey?: string;
}

export interface TemporalOutcome {
  id: string;
  causeEventId?: string;
  eventId: string;
  value?: unknown;
  status: TemporalOutcomeStatus;
  scheduledAt: number;
  recordedAt?: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier?: number;
  maxDelayMs?: number;
}

export interface TemporalRetry {
  id: string;
  operationId: string;
  attempt: number;
  policy: RetryPolicy;
  status: TemporalRetryStatus;
  eventId?: string;
  /** Fence for every pending event in this retry's operation lineage. */
  fence?: TemporalFenceToken;
  lastError?: unknown;
  payload?: unknown;
}

export interface TemporalTrajectoryRecord {
  sequence: number;
  time: number;
  kind: string;
  eventId?: string;
  data?: unknown;
}

/**
 * Typed lineage retained inside the single durable Sandbox trajectory.
 * `parentIds` remains the stable compatibility representation; `parentTypes`
 * makes the causal edge meaningful to an independent verifier without having
 * to infer semantics from an ID prefix or a neighboring domain collection.
 */
export type TemporalCausalParentType =
  | "temporal_event"
  | "mirror_object"
  | "publication_metric"
  | "publishing_plan"
  | "assignment"
  | "social_intent"
  | "execution"
  | "outcome"
  | "operator_directive"
  | "unknown";

export interface TemporalCausalParents {
  parentIds: string[];
  parentTypes: Record<string, TemporalCausalParentType>;
}

export interface SandboxTemporalBounds {
  /** Maximum event occurrences ever scheduled by this kernel. */
  maxEvents: number;
  /** Maximum events processed by one advance/tick call. */
  maxEventsPerAdvance: number;
  /** Maximum virtual duration accepted by one advance/tick call. */
  maxAdvanceMs: number;
  /** Maximum retained trajectory records. */
  maxTrajectoryRecords: number;
  /** Maximum retained checkpoints. */
  maxCheckpoints: number;
}

export interface SandboxTemporalOptions {
  startAt?: TemporalTime;
  paused?: boolean;
  accelerationFactor?: number;
  bounds?: Partial<SandboxTemporalBounds>;
}

export interface TemporalEventInput {
  id?: string;
  type: string;
  at?: TemporalTime;
  offsetMs?: number;
  priority?: number;
  payload?: unknown;
  recurrence?: TemporalRecurrence;
  fence?: TemporalFenceToken;
  causeEventId?: string;
  handler?: TemporalEventHandler;
  handlerId?: string;
  handlerKey?: string;
}

export interface TemporalOutcomeInput {
  id?: string;
  causeEventId?: string;
  at?: TemporalTime;
  offsetMs?: number;
  value?: unknown;
}

export interface TemporalRetryInput {
  id?: string;
  operationId: string;
  attempt?: number;
  at?: TemporalTime;
  offsetMs?: number;
  policy: RetryPolicy;
  payload?: unknown;
}

export interface SandboxTemporalSnapshot {
  version: 1;
  now: number;
  paused: boolean;
  acceleration: TemporalAcceleration;
  events: TemporalEvent[];
  outcomes: TemporalOutcome[];
  /** Deferred values are runtime-only truth and never appear on a scheduled outcome. */
  deferredOutcomeValues?: Record<string, unknown>;
  retries: TemporalRetry[];
  fences: Record<string, number>;
  trajectory: TemporalTrajectoryRecord[];
  nextSequence: number;
  nextEventNumber: number;
  nextOutcomeNumber: number;
  nextRetryNumber: number;
  nextTrajectoryNumber: number;
  nextCheckpointNumber?: number;
  /** Fractional virtual milliseconds carried between accelerated ticks. */
  accelerationRemainderMs?: number;
  bounds: SandboxTemporalBounds;
  /** Persisted immutable branch points; omitted by nested checkpoint snapshots. */
  checkpoints?: TemporalCheckpoint[];
}

export interface TemporalHandlerContext {
  readonly now: number;
  readonly event: Readonly<TemporalEvent>;
  readonly currentFence: (key: string) => TemporalFenceToken | undefined;
}

export type TemporalEffect =
  | { type: "schedule"; event: TemporalEventInput }
  | { type: "outcome"; outcome: TemporalOutcomeInput }
  | { type: "retry"; retry: TemporalRetryInput }
  | { type: "cancel"; eventId: string; reason?: string }
  | { type: "record"; kind: string; data?: unknown };

export type TemporalEventHandler = (
  event: Readonly<TemporalEvent>,
  context: TemporalHandlerContext,
) => TemporalEffect[] | void;

export interface AdvanceOptions {
  onEvent?: TemporalEventHandler;
}

export interface AdvanceResult {
  from: number;
  to: number;
  processed: TemporalEvent[];
  trajectory: TemporalTrajectoryRecord[];
}

export interface TemporalCheckpoint {
  id: string;
  label?: string;
  createdAt: number;
  snapshot: SandboxTemporalSnapshot;
}

export class TemporalBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalBoundsError";
  }
}

export class TemporalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalValidationError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BOUNDS: SandboxTemporalBounds = {
  maxEvents: 10_000,
  maxEventsPerAdvance: 10_000,
  maxAdvanceMs: 365 * DAY_MS,
  maxTrajectoryRecords: 50_000,
  maxCheckpoints: 32,
};

function clone<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function timeMs(value: TemporalTime | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const result = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : value;
  if (!Number.isFinite(result) || !Number.isInteger(result)) {
    throw new TemporalValidationError("Temporal timestamps must be finite integer milliseconds.");
  }
  return result;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TemporalValidationError(`${name} must be a non-negative integer.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new TemporalValidationError(`${name} must be a positive integer.`);
  }
  return value;
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TemporalValidationError(`${name} must be a positive number.`);
  }
  return value;
}

function validateBounds(input: Partial<SandboxTemporalBounds> | undefined): SandboxTemporalBounds {
  const bounds = { ...DEFAULT_BOUNDS, ...(input ?? {}) };
  positiveInteger(bounds.maxEvents, "bounds.maxEvents");
  positiveInteger(bounds.maxEventsPerAdvance, "bounds.maxEventsPerAdvance");
  positiveInteger(bounds.maxAdvanceMs, "bounds.maxAdvanceMs");
  positiveInteger(bounds.maxTrajectoryRecords, "bounds.maxTrajectoryRecords");
  positiveInteger(bounds.maxCheckpoints, "bounds.maxCheckpoints");
  return bounds;
}

function validateOffset(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return nonNegativeInteger(value, "offsetMs");
}

function validateRecurrence(input: TemporalRecurrence | undefined): TemporalRecurrence | undefined {
  if (!input) return undefined;
  positiveInteger(input.intervalMs, "recurrence.intervalMs");
  if (input.count !== undefined) positiveInteger(input.count, "recurrence.count");
  const recurrence = { intervalMs: input.intervalMs, count: input.count, until: input.until === undefined ? undefined : timeMs(input.until, 0) };
  if (recurrence.count === undefined && recurrence.until === undefined) {
    throw new TemporalValidationError("A recurrence must have a finite count or until boundary.");
  }
  return recurrence;
}

function validatePolicy(policy: RetryPolicy): RetryPolicy {
  positiveInteger(policy.maxAttempts, "policy.maxAttempts");
  nonNegativeInteger(policy.initialDelayMs, "policy.initialDelayMs");
  if (policy.multiplier !== undefined) positiveNumber(policy.multiplier, "policy.multiplier");
  if (policy.maxDelayMs !== undefined) nonNegativeInteger(policy.maxDelayMs, "policy.maxDelayMs");
  return { ...policy };
}

/** Deterministic exponential backoff; no random jitter is permitted here. */
export function nextRetryDelayMs(policy: RetryPolicy, attempt: number): number {
  const checked = validatePolicy(policy);
  positiveInteger(attempt, "attempt");
  const multiplier = checked.multiplier ?? 2;
  const raw = checked.initialDelayMs * Math.pow(multiplier, attempt - 1);
  const bounded = checked.maxDelayMs === undefined ? raw : Math.min(raw, checked.maxDelayMs);
  if (!Number.isSafeInteger(bounded) || bounded < 0) {
    throw new TemporalValidationError("Retry backoff exceeds safe integer milliseconds.");
  }
  return bounded;
}

function sameLineage(event: TemporalEvent, id: string): boolean {
  return event.id === id || event.rootId === id;
}

function retryFenceKey(retryId: string) {
  return `retry:${retryId}`;
}

function temporalCausalData(data: unknown, parentIds: string[]) {
  const parents = [...new Set(parentIds.filter((value) => typeof value === "string" && value.length > 0))];
  return {
    ...(data && typeof data === "object" && !Array.isArray(data) ? data : { value: data }),
    causal: {
      parentIds: parents,
      parentTypes: Object.fromEntries(parents.map((parentId) => [parentId, "temporal_event"])),
    },
  };
}

export class SandboxTemporalKernel {
  private nowValue: number;
  private pausedValue: boolean;
  private accelerationValue: TemporalAcceleration;
  private readonly boundsValue: SandboxTemporalBounds;
  private eventsValue: TemporalEvent[] = [];
  private outcomesValue: TemporalOutcome[] = [];
  private deferredOutcomeValues = new Map<string, unknown>();
  private retriesValue: TemporalRetry[] = [];
  private fencesValue = new Map<string, number>();
  private trajectoryValue: TemporalTrajectoryRecord[] = [];
  private handlers = new Map<string, TemporalEventHandler>();
  private checkpointsValue = new Map<string, TemporalCheckpoint>();
  private sequenceValue = 0;
  private eventNumberValue = 0;
  private outcomeNumberValue = 0;
  private retryNumberValue = 0;
  private trajectoryNumberValue = 0;
  private checkpointNumberValue = 0;
  private accelerationRemainderMsValue = 0;

  constructor(options: SandboxTemporalOptions = {}) {
    this.nowValue = timeMs(options.startAt, 0);
    this.boundsValue = validateBounds(options.bounds);
    const factor = options.accelerationFactor ?? 1;
    positiveNumber(factor, "accelerationFactor");
    this.pausedValue = options.paused ?? false;
    this.accelerationValue = { factor, mode: factor === 1 ? "manual" : "accelerated", updatedAt: this.nowValue };
    this.addTrajectory("kernel_created", { paused: this.pausedValue, accelerationFactor: factor });
  }

  static fromSnapshot(snapshot: SandboxTemporalSnapshot, handlers?: Record<string, TemporalEventHandler>): SandboxTemporalKernel {
    if (snapshot.version !== 1) throw new TemporalValidationError(`Unsupported temporal snapshot version: ${snapshot.version}.`);
    const kernel = new SandboxTemporalKernel({ startAt: snapshot.now, paused: snapshot.paused, accelerationFactor: snapshot.acceleration.factor, bounds: snapshot.bounds });
    kernel.nowValue = snapshot.now;
    kernel.pausedValue = snapshot.paused;
    kernel.accelerationValue = clone(snapshot.acceleration);
    kernel.accelerationRemainderMsValue = snapshot.accelerationRemainderMs ?? 0;
    kernel.eventsValue = clone(snapshot.events);
    kernel.outcomesValue = clone(snapshot.outcomes);
    kernel.deferredOutcomeValues = new Map(Object.entries(snapshot.deferredOutcomeValues ?? {}));
    kernel.retriesValue = clone(snapshot.retries);
    kernel.fencesValue = new Map(Object.entries(snapshot.fences));
    kernel.trajectoryValue = clone(snapshot.trajectory);
    kernel.checkpointsValue = new Map((snapshot.checkpoints ?? []).map((checkpoint) => [checkpoint.id, clone(checkpoint)]));
    kernel.checkpointNumberValue = Math.max(0, ...(snapshot.checkpoints ?? []).map((checkpoint) => Number(checkpoint.id.match(/^checkpoint-(\d+)$/)?.[1] ?? 0)));
    kernel.sequenceValue = snapshot.nextSequence;
    kernel.eventNumberValue = snapshot.nextEventNumber;
    kernel.outcomeNumberValue = snapshot.nextOutcomeNumber;
    kernel.retryNumberValue = snapshot.nextRetryNumber;
    kernel.trajectoryNumberValue = snapshot.nextTrajectoryNumber;
    kernel.checkpointNumberValue = snapshot.nextCheckpointNumber ?? 0;
    kernel.handlers = new Map(Object.entries(handlers ?? {}));
    for (const event of kernel.eventsValue) {
      const stableHandler = event.handlerKey ? kernel.handlers.get(event.handlerKey) : event.handlerId ? kernel.handlers.get(event.handlerId) : undefined;
      if (stableHandler && !kernel.handlers.has(event.id)) kernel.handlers.set(event.id, stableHandler);
      if (event.status === "pending" && (event.handlerId || event.handlerKey) && !kernel.handlers.has(event.id)) throw new TemporalValidationError(`Snapshot requires replay handler ${event.handlerKey ?? event.handlerId}.`);
    }
    kernel.checkpointNumberValue = Math.max(0, ...(snapshot.checkpoints ?? []).map((checkpoint) => Number(checkpoint.id.match(/^checkpoint-(\d+)$/)?.[1] ?? 0)));
    return kernel;
  }

  get now(): number { return this.nowValue; }
  get paused(): boolean { return this.pausedValue; }
  get acceleration(): TemporalAcceleration { return clone(this.accelerationValue); }
  get bounds(): SandboxTemporalBounds { return clone(this.boundsValue); }
  get events(): TemporalEvent[] { return clone(this.eventsValue); }
  get outcomes(): TemporalOutcome[] { return clone(this.outcomesValue); }
  get retries(): TemporalRetry[] { return clone(this.retriesValue); }
  get trajectory(): TemporalTrajectoryRecord[] { return clone(this.trajectoryValue); }

  private snapshotWithoutCheckpoints(): SandboxTemporalSnapshot {
    return {
      version: 1,
      now: this.nowValue,
      paused: this.pausedValue,
      acceleration: clone(this.accelerationValue),
      events: clone(this.eventsValue),
      outcomes: clone(this.outcomesValue),
      deferredOutcomeValues: Object.fromEntries(this.deferredOutcomeValues.entries()),
      retries: clone(this.retriesValue),
      fences: Object.fromEntries(this.fencesValue.entries()),
      trajectory: clone(this.trajectoryValue),
      nextSequence: this.sequenceValue,
      nextEventNumber: this.eventNumberValue,
      nextOutcomeNumber: this.outcomeNumberValue,
      nextRetryNumber: this.retryNumberValue,
      nextTrajectoryNumber: this.trajectoryNumberValue,
      nextCheckpointNumber: this.checkpointNumberValue,
      accelerationRemainderMs: this.accelerationRemainderMsValue,
      bounds: clone(this.boundsValue),
    };
  }

  snapshot(): SandboxTemporalSnapshot {
    const snapshot = this.snapshotWithoutCheckpoints();
    snapshot.checkpoints = [...this.checkpointsValue.values()].map((checkpoint) => clone(checkpoint));
    return snapshot;
  }

  pause(reason = "paused by caller"): this {
    if (!this.pausedValue) {
      this.pausedValue = true;
      this.addTrajectory("paused", { reason });
    }
    return this;
  }

  resume(reason = "resumed by caller"): this {
    if (this.pausedValue) {
      this.pausedValue = false;
      this.addTrajectory("resumed", { reason });
    }
    return this;
  }

  setAcceleration(factor: number, _mode: TemporalAcceleration["mode"] = factor === 1 ? "manual" : "accelerated"): this {
    positiveNumber(factor, "accelerationFactor");
    void _mode; // Retain the API parameter while deriving truthful metadata below.
    // Mode describes the factor, so never persist contradictory metadata when
    // a caller supplies the wrong label (for example, 2x + "manual").
    const normalizedMode = factor === 1 ? "manual" : "accelerated";
    this.accelerationValue = { ...this.accelerationValue, factor, mode: normalizedMode, updatedAt: this.nowValue };
    this.addTrajectory("acceleration_changed", { factor, mode: normalizedMode });
    return this;
  }

  /** Apply real elapsed time through the explicit acceleration factor. */
  tick(realElapsedMs: number, options: AdvanceOptions = {}): AdvanceResult {
    nonNegativeInteger(realElapsedMs, "realElapsedMs");
    const exactVirtualElapsedMs = this.pausedValue ? 0 : realElapsedMs * this.accelerationValue.factor + this.accelerationRemainderMsValue;
    const virtualElapsedMs = Math.floor(exactVirtualElapsedMs);
    this.accelerationRemainderMsValue = this.pausedValue ? 0 : exactVirtualElapsedMs - virtualElapsedMs;
    if (!Number.isSafeInteger(virtualElapsedMs)) throw new TemporalValidationError("Accelerated duration exceeds safe integer milliseconds.");
    this.accelerationValue = { ...this.accelerationValue, realElapsedMs, virtualElapsedMs, updatedAt: this.nowValue };
    return this.advanceBy(virtualElapsedMs, options);
  }

  schedule(input: TemporalEventInput): TemporalEvent { return this.scheduleEvent(input); }

  scheduleEvent(input: TemporalEventInput): TemporalEvent {
    if (!input.type.trim()) throw new TemporalValidationError("Event type cannot be empty.");
    if (input.at !== undefined && input.offsetMs !== undefined) throw new TemporalValidationError("Use at or offsetMs, not both.");
    const offsetMs = validateOffset(input.offsetMs);
    const at = input.at === undefined ? this.nowValue + (offsetMs ?? 0) : timeMs(input.at, this.nowValue);
    this.assertFutureOrCurrent(at);
    const recurrence = validateRecurrence(input.recurrence);
    if (recurrence?.until !== undefined && timeMs(recurrence.until, at) <= at) throw new TemporalValidationError("recurrence.until must be after the first occurrence.");
    if (recurrence?.count !== undefined && recurrence.count > this.boundsValue.maxEvents - this.eventsValue.length) {
      throw new TemporalBoundsError("Finite recurrence exceeds the configured event bound.");
    }
    if (input.fence && (!input.fence.key || !Number.isInteger(input.fence.generation) || input.fence.generation <= 0)) {
      throw new TemporalValidationError("A fence token must have a key and positive generation.");
    }
    const id = input.id ?? `event-${++this.eventNumberValue}`;
    if (this.eventsValue.some((event) => event.id === id)) throw new TemporalValidationError(`Event id already exists: ${id}.`);
    const event: TemporalEvent = {
      id,
      rootId: id,
      type: input.type,
      at,
      ...(offsetMs === undefined ? {} : { offsetMs }),
      priority: input.priority ?? 0,
      sequence: ++this.sequenceValue,
      occurrence: 1,
      status: "pending",
      ...(input.payload === undefined ? {} : { payload: clone(input.payload) }),
      ...(recurrence === undefined ? {} : { recurrence: clone(recurrence) }),
      ...(input.fence === undefined ? {} : { fence: clone(input.fence) }),
      ...(input.causeEventId === undefined ? {} : { causeEventId: input.causeEventId }),
      ...(input.handlerId === undefined && !input.handler ? {} : { handlerId: input.handlerId ?? id }),
      ...(input.handlerKey === undefined ? {} : { handlerKey: input.handlerKey }),
    };
    this.assertEventBudget();
    this.eventsValue.push(event);
    if (input.handler) {
      this.handlers.set(id, input.handler);
      if (input.handlerId) this.handlers.set(input.handlerId, input.handler);
    }
    this.addTrajectory("event_scheduled", { type: event.type, at: event.at, occurrence: event.occurrence }, id);
    return clone(event);
  }

  scheduleOutcome(input: TemporalOutcomeInput): TemporalOutcome {
    if (input.at !== undefined && input.offsetMs !== undefined) throw new TemporalValidationError("Use at or offsetMs, not both.");
    const offsetMs = validateOffset(input.offsetMs);
    const at = input.at === undefined ? this.nowValue + (offsetMs ?? 0) : timeMs(input.at, this.nowValue);
    this.assertFutureOrCurrent(at);
    if (input.causeEventId) {
      const cause = this.eventsValue.find((event) => event.id === input.causeEventId || event.rootId === input.causeEventId);
      if (!cause) throw new TemporalValidationError(`Outcome cause event does not exist: ${input.causeEventId}.`);
      if (at < cause.at) throw new TemporalValidationError("A delayed outcome cannot precede its cause event.");
    }
    const id = input.id ?? `outcome-${++this.outcomeNumberValue}`;
    if (this.outcomesValue.some((outcome) => outcome.id === id)) throw new TemporalValidationError(`Outcome id already exists: ${id}.`);
    const event = this.scheduleEvent({ type: "outcome", at, payload: { outcomeId: id }, causeEventId: input.causeEventId });
    const outcome: TemporalOutcome = {
      id,
      causeEventId: input.causeEventId,
      eventId: event.id,
      status: "scheduled",
      scheduledAt: this.nowValue,
    };
    if (input.value !== undefined) this.deferredOutcomeValues.set(id, clone(input.value));
    this.outcomesValue.push(outcome);
    this.addTrajectory("outcome_scheduled", { causeEventId: input.causeEventId, at, outcomeId: id }, event.id);
    return clone(outcome);
  }

  /** Alias that reads naturally at an integration boundary. */
  scheduleDelayedOutcome(input: TemporalOutcomeInput): TemporalOutcome { return this.scheduleOutcome(input); }

  startRetry(input: Omit<TemporalRetryInput, "attempt">): TemporalRetry {
    return this.scheduleRetry({ ...input, attempt: 1 });
  }

  scheduleRetry(input: TemporalRetryInput): TemporalRetry {
    const policy = validatePolicy(input.policy);
    const attempt = input.attempt ?? 1;
    positiveInteger(attempt, "attempt");
    if (attempt > policy.maxAttempts) throw new TemporalValidationError("attempt cannot exceed policy.maxAttempts.");
    if (input.at !== undefined && input.offsetMs !== undefined) throw new TemporalValidationError("Use at or offsetMs, not both.");
    const delay = input.at === undefined && input.offsetMs === undefined ? nextRetryDelayMs(policy, attempt) : undefined;
    const id = input.id ?? `retry-${++this.retryNumberValue}`;
    const existing = input.id ? this.retriesValue.find((item) => item.id === input.id) : undefined;
    const fence = existing?.fence ?? this.issueFence(retryFenceKey(id));
    const event = this.scheduleEvent({
      id: input.id ? `${input.id}:attempt:${attempt}` : undefined,
      type: "retry",
      ...(input.at === undefined ? { offsetMs: input.offsetMs ?? delay } : { at: input.at }),
      payload: { operationId: input.operationId, attempt },
      fence,
    });
    const retry: TemporalRetry = existing ?? { id, operationId: input.operationId, attempt, policy, status: "pending", eventId: event.id, fence };
    retry.operationId = input.operationId;
    retry.attempt = attempt;
    retry.policy = policy;
    retry.status = "pending";
    retry.eventId = event.id;
    retry.fence = fence;
    if (input.payload !== undefined) retry.payload = clone(input.payload);
    if (!existing) this.retriesValue.push(retry);
    this.addTrajectory("retry_scheduled", temporalCausalData({ operationId: input.operationId, attempt, delayMs: delay, retryId: id }, [event.id]), event.id);
    return clone(retry);
  }

  failRetry(operationId: string, error: unknown, retryId?: string): TemporalRetry | undefined {
    const retry = this.retriesValue
      .filter((item) => item.operationId === operationId && (retryId === undefined || item.id === retryId) && ["pending", "attempting"].includes(item.status))
      .sort((a, b) => b.attempt - a.attempt)[0];
    if (!retry) return undefined;
    retry.lastError = clone(error);
    const failedEventId = retry.eventId;
    // Invalidate the complete operation lineage before changing its terminal
    // state or scheduling the next attempt. This covers duplicate/persisted
    // events whose IDs are older than the retry record's current eventId.
    retry.fence = this.issueFence(retryFenceKey(retry.id));
    this.cancelPendingRetryEvents(retry.operationId, "retry transition superseded this event");
    if (retry.attempt >= retry.policy.maxAttempts) {
      retry.status = "exhausted";
      this.addTrajectory("retry_exhausted", temporalCausalData({ operationId, attempt: retry.attempt, error: clone(error) }, failedEventId ? [failedEventId] : []), failedEventId);
      return clone(retry);
    }
    const next = this.scheduleRetry({ id: retry.id, operationId, attempt: retry.attempt + 1, policy: retry.policy, payload: retry.payload });
    retry.status = "pending";
    retry.eventId = next.eventId;
    this.addTrajectory("retry_failed", temporalCausalData({ operationId, attempt: retry.attempt, error: clone(error) }, [failedEventId, next.eventId].filter((value): value is string => Boolean(value))), failedEventId);
    return clone(next);
  }

  recordRetryFailure(operationId: string, error: unknown, retryId?: string): TemporalRetry | undefined { return this.failRetry(operationId, error, retryId); }

  succeedRetry(operationId: string, retryId?: string): TemporalRetry | undefined {
    const retry = this.retriesValue.find((item) => item.operationId === operationId && item.id === (retryId ?? item.id) && !["succeeded", "exhausted", "cancelled"].includes(item.status));
    if (!retry) return undefined;
    retry.fence = this.issueFence(retryFenceKey(retry.id));
    this.cancelPendingRetryEvents(retry.operationId, "retry succeeded");
    retry.status = "succeeded";
    this.addTrajectory("retry_succeeded", temporalCausalData({ operationId, attempt: retry.attempt }, retry.eventId ? [retry.eventId] : []), retry.eventId);
    return clone(retry);
  }

  cancelRetry(operationId: string, reason = "retry cancelled"): number {
    let count = 0;
    for (const retry of this.retriesValue.filter((item) => item.operationId === operationId && !["succeeded", "exhausted", "cancelled"].includes(item.status))) {
      retry.fence = this.issueFence(retryFenceKey(retry.id));
      retry.status = "cancelled";
      count += this.cancelPendingRetryEvents(retry.operationId, reason);
    }
    return count;
  }

  private cancelPendingRetryEvents(operationId: string, reason: string): number {
    const ids = this.eventsValue
      .filter((event) => event.status === "pending" && event.type === "retry" && typeof event.payload === "object" && event.payload !== null && "operationId" in event.payload && (event.payload as { operationId?: unknown }).operationId === operationId)
      .map((event) => event.id);
    return ids.reduce((count, id) => count + this.cancelEvent(id, reason), 0);
  }

  cancelEvent(id: string, reason = "cancelled by caller"): number {
    let count = 0;
    for (const event of this.eventsValue) {
      if (!sameLineage(event, id) || event.status !== "pending") continue;
      event.status = "cancelled";
      count += 1;
      this.addTrajectory("event_cancelled", temporalCausalData({ reason }, [event.id]), event.id);
      const outcome = this.outcomesValue.find((item) => item.eventId === event.id && item.status === "scheduled");
      if (outcome) {
        outcome.status = "cancelled";
        this.addTrajectory("outcome_cancelled", temporalCausalData({ outcomeId: outcome.id, reason }, [event.id]), event.id);
      }
    }
    return count;
  }

  issueFence(key: string): TemporalFenceToken {
    if (!key.trim()) throw new TemporalValidationError("Fence key cannot be empty.");
    const generation = (this.fencesValue.get(key) ?? 0) + 1;
    this.fencesValue.set(key, generation);
    const token = { key, generation };
    this.addTrajectory("fence_issued", token);
    return token;
  }

  invalidateFence(key: string): TemporalFenceToken { return this.issueFence(key); }

  currentFence(key: string): TemporalFenceToken | undefined {
    const generation = this.fencesValue.get(key);
    return generation === undefined ? undefined : { key, generation };
  }

  isFenceStale(token: TemporalFenceToken): boolean { return this.fencesValue.get(token.key) !== token.generation; }

  checkpoint(label?: string): TemporalCheckpoint {
    if (this.checkpointsValue.size >= this.boundsValue.maxCheckpoints) throw new TemporalBoundsError("Checkpoint bound exceeded.");
    do { this.checkpointNumberValue += 1; } while (this.checkpointsValue.has(`checkpoint-${this.checkpointNumberValue}`));
    const id = `checkpoint-${this.checkpointNumberValue}`;
    const checkpoint: TemporalCheckpoint = { id, ...(label === undefined ? {} : { label }), createdAt: this.nowValue, snapshot: this.snapshotWithoutCheckpoints() };
    this.checkpointsValue.set(id, clone(checkpoint));
    this.addTrajectory("checkpoint_created", { checkpointId: id, label });
    return clone(checkpoint);
  }

  restoreCheckpoint(id: string): this {
    const checkpoint = this.checkpointsValue.get(id);
    if (!checkpoint) throw new TemporalValidationError(`Unknown checkpoint: ${id}.`);
    // A checkpoint is an executable branch point, not just serialized clock
    // state. Rehydrate the same stable handler registry used by fork() so a
    // restored branch can continue firing pending events.
    const restored = SandboxTemporalKernel.fromSnapshot(checkpoint.snapshot, Object.fromEntries(this.handlers.entries()));
    this.copyFrom(restored);
    this.addTrajectory("checkpoint_restored", { checkpointId: id });
    return this;
  }

  fork(checkpointId?: string): SandboxTemporalKernel {
    const source = checkpointId ? this.checkpointsValue.get(checkpointId)?.snapshot : this.snapshot();
    if (!source) throw new TemporalValidationError(`Unknown checkpoint: ${checkpointId}.`);
    const child = SandboxTemporalKernel.fromSnapshot(source, Object.fromEntries(this.handlers.entries()));
    child.addTrajectory("fork_created", { checkpointId, parentNow: this.nowValue });
    return child;
  }

  recordTrajectory(kind: string, data?: unknown, at = this.nowValue): TemporalTrajectoryRecord {
    return this.addTrajectory(kind, data, undefined, at);
  }

  recordObservation(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("observation", data, at); }
  recordDecision(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("decision", data, at); }
  recordIntent(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("intent", data, at); }
  recordExecution(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("execution", data, at); }
  recordPermissionDecision(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("permission_decision", data, at); }
  recordPlanMutation(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("plan_mutation", data, at); }
  recordResult(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("result", data, at); }
  recordOutcome(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("outcome", data, at); }
  recordLearning(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("learning", data, at); }
  recordReplan(data?: unknown, at = this.nowValue): TemporalTrajectoryRecord { return this.recordTrajectory("replan", data, at); }

  advanceBy(deltaMs: number, options: AdvanceOptions = {}): AdvanceResult {
    nonNegativeInteger(deltaMs, "deltaMs");
    if (deltaMs > this.boundsValue.maxAdvanceMs) throw new TemporalBoundsError("Advance exceeds the configured virtual-time bound.");
    const from = this.nowValue;
    if (this.pausedValue) return { from, to: from, processed: [], trajectory: [] };
    const to = from + deltaMs;
    if (!Number.isSafeInteger(to)) throw new TemporalValidationError("Virtual time exceeds safe integer milliseconds.");
    const beforeTrajectory = this.trajectoryNumberValue;
    this.nowValue = to;
    const processed: TemporalEvent[] = [];
    while (true) {
      const event = this.nextDueEvent(to);
      if (!event) break;
      if (processed.length >= this.boundsValue.maxEventsPerAdvance) throw new TemporalBoundsError("Per-advance event bound exceeded.");
      this.processEvent(event, options.onEvent, processed);
    }
    // Record the enclosing advance after its event-local records. This keeps
    // append order and virtual time order aligned for black-box trajectory
    // reconstruction; event handlers still observe their exact event time.
    if (deltaMs > 0) this.addTrajectory("time_advanced", { from, to, deltaMs }, undefined, to);
    return { from, to, processed: clone(processed), trajectory: clone(this.trajectoryValue.slice(beforeTrajectory)) };
  }

  advanceTo(target: TemporalTime, options: AdvanceOptions = {}): AdvanceResult {
    const targetMs = timeMs(target, this.nowValue);
    if (targetMs < this.nowValue) throw new TemporalValidationError("Virtual time is monotonic; cannot move backwards.");
    return this.advanceBy(targetMs - this.nowValue, options);
  }

  private processEvent(event: TemporalEvent, onEvent: TemporalEventHandler | undefined, processed: TemporalEvent[]): void {
    const batchTarget = this.nowValue;
    this.nowValue = event.at;
    try {
      if (event.status !== "pending") return;
      if (event.fence && this.isFenceStale(event.fence)) {
        event.status = "stale";
        this.addTrajectory("event_stale", { fence: event.fence }, event.id);
        processed.push(clone(event));
        return;
      }
      if (event.type === "retry" && this.retryEventIsStale(event)) {
        event.status = "stale";
        this.addTrajectory("retry_event_stale", temporalCausalData({ operationId: this.retryOperationId(event), attempt: this.retryAttempt(event) }, [event.id]), event.id);
        processed.push(clone(event));
        return;
      }
      event.status = "fired";
      processed.push(clone(event));
      this.addTrajectory("event_fired", { type: event.type, occurrence: event.occurrence }, event.id);
      if (event.type === "outcome") this.recordScheduledOutcome(event);
      if (event.type === "retry") this.markRetryAttempt(event);
      const handler = this.handlers.get(event.id) ?? this.handlers.get(event.rootId) ?? this.handlers.get(event.handlerId ?? "") ?? (event.handlerKey ? this.handlers.get(event.handlerKey) : undefined);
      const effects = [handler, onEvent].filter(Boolean).flatMap((callback) => callback!(clone(event), { now: this.nowValue, event: clone(event), currentFence: (key) => this.currentFence(key) }) ?? []);
      for (const effect of effects) this.applyEffect(effect);
      this.scheduleNextOccurrence(event);
    } finally {
      this.nowValue = batchTarget;
    }
  }

  private retryOperationId(event: TemporalEvent): string | undefined {
    if (!event.payload || typeof event.payload !== "object" || !("operationId" in event.payload)) return undefined;
    const operationId = (event.payload as { operationId?: unknown }).operationId;
    return typeof operationId === "string" ? operationId : undefined;
  }

  private retryAttempt(event: TemporalEvent): number | undefined {
    if (!event.payload || typeof event.payload !== "object" || !("attempt" in event.payload)) return undefined;
    const attempt = (event.payload as { attempt?: unknown }).attempt;
    return typeof attempt === "number" ? attempt : undefined;
  }

  private retryEventIsStale(event: TemporalEvent): boolean {
    const operationId = this.retryOperationId(event);
    if (!operationId) return false;
    const retry = this.retriesValue.find((item) => item.operationId === operationId);
    if (!retry) return false;
    return ["succeeded", "exhausted", "cancelled"].includes(retry.status)
      || retry.eventId !== event.id
      || retry.attempt !== this.retryAttempt(event);
  }

  private recordScheduledOutcome(event: TemporalEvent): void {
    const outcomeId = typeof event.payload === "object" && event.payload !== null && "outcomeId" in event.payload ? String((event.payload as { outcomeId: unknown }).outcomeId) : undefined;
    const outcome = this.outcomesValue.find((item) => item.id === outcomeId && item.eventId === event.id);
    if (!outcome || outcome.status !== "scheduled") return;
    if (outcome.causeEventId) {
      const cause = this.eventsValue.find((item) => item.id === outcome.causeEventId);
      if (!cause || cause.status !== "fired") {
        outcome.status = "stale";
        this.addTrajectory("outcome_stale", { outcomeId: outcome.id, causeEventId: outcome.causeEventId }, event.id);
        return;
      }
    }
    outcome.status = "recorded";
    if (this.deferredOutcomeValues.has(outcome.id)) {
      outcome.value = clone(this.deferredOutcomeValues.get(outcome.id));
      this.deferredOutcomeValues.delete(outcome.id);
    }
    outcome.recordedAt = event.at;
    this.addTrajectory("outcome_recorded", { outcomeId: outcome.id, causeEventId: outcome.causeEventId, value: clone(outcome.value) }, event.id);
  }

  private markRetryAttempt(event: TemporalEvent): void {
    const payload = event.payload as { operationId?: string; attempt?: number } | undefined;
    const retry = this.retriesValue.find((item) => item.eventId === event.id || (payload?.operationId === item.operationId && item.attempt === payload.attempt));
    if (!retry) return;
    retry.status = "attempting";
    retry.attempt = payload?.attempt ?? retry.attempt;
    this.addTrajectory("retry_attempted", temporalCausalData({ operationId: retry.operationId, attempt: retry.attempt }, [event.id]), event.id);
  }

  private scheduleNextOccurrence(event: TemporalEvent): void {
    if (event.status !== "fired") return;
    const recurrence = event.recurrence;
    if (!recurrence) return;
    const nextOccurrence = event.occurrence + 1;
    if (recurrence.count !== undefined && nextOccurrence > recurrence.count) return;
    const at = event.at + recurrence.intervalMs;
    if (recurrence.until !== undefined && at >= timeMs(recurrence.until, event.at)) return;
    const next: TemporalEvent = {
      ...clone(event),
      id: `${event.rootId}#${nextOccurrence}`,
      at,
      sequence: ++this.sequenceValue,
      occurrence: nextOccurrence,
      status: "pending",
    };
    this.assertEventBudget();
    this.eventsValue.push(next);
    const handler = this.handlers.get(event.id) ?? this.handlers.get(event.rootId) ?? (event.handlerKey ? this.handlers.get(event.handlerKey) : undefined);
    if (handler) this.handlers.set(next.id, handler);
    this.addTrajectory("event_scheduled", { type: next.type, at: next.at, occurrence: next.occurrence, recurringFrom: event.id }, next.id);
  }

  private applyEffect(effect: TemporalEffect): void {
    if (effect.type === "schedule") this.scheduleEvent(effect.event);
    else if (effect.type === "outcome") this.scheduleOutcome(effect.outcome);
    else if (effect.type === "retry") this.scheduleRetry(effect.retry);
    else if (effect.type === "cancel") this.cancelEvent(effect.eventId, effect.reason);
    else this.recordTrajectory(effect.kind, effect.data);
  }

  private nextDueEvent(target: number): TemporalEvent | undefined {
    return this.eventsValue.filter((event) => event.status === "pending" && event.at <= target).sort((a, b) => a.at - b.at || a.priority - b.priority || a.sequence - b.sequence)[0];
  }

  private assertFutureOrCurrent(at: number): void {
    if (at < this.nowValue) throw new TemporalValidationError("Cannot schedule an event in the past.");
    if (!Number.isSafeInteger(at)) throw new TemporalValidationError("Event time exceeds safe integer milliseconds.");
  }

  private assertEventBudget(): void {
    if (this.eventsValue.length >= this.boundsValue.maxEvents) throw new TemporalBoundsError("Event bound exceeded.");
  }

  private addTrajectory(kind: string, data?: unknown, eventId?: string, at = this.nowValue): TemporalTrajectoryRecord {
    if (at < this.nowValue) throw new TemporalValidationError("Trajectory time cannot move backwards.");
    if (this.trajectoryValue.length >= this.boundsValue.maxTrajectoryRecords) throw new TemporalBoundsError("Trajectory bound exceeded.");
    // Runtime adapters can dispatch an event-local effect after a later
    // record was already persisted by another layer. Keep the evidence stream
    // chronologically ordered while retaining the precise scheduled/factual
    // timestamp in the record payload.
    const traceAt = Math.max(at, this.trajectoryValue.at(-1)?.time ?? at);
    const record: TemporalTrajectoryRecord = { sequence: ++this.trajectoryNumberValue, time: traceAt, kind, ...(eventId === undefined ? {} : { eventId }), ...(data === undefined ? {} : { data: clone(data) }) };
    this.trajectoryValue.push(record);
    return clone(record);
  }

  private copyFrom(other: SandboxTemporalKernel): void {
    this.nowValue = other.nowValue;
    this.pausedValue = other.pausedValue;
    this.accelerationValue = clone(other.accelerationValue);
    this.eventsValue = clone(other.eventsValue);
    this.outcomesValue = clone(other.outcomesValue);
    this.deferredOutcomeValues = new Map(other.deferredOutcomeValues);
    this.retriesValue = clone(other.retriesValue);
    this.fencesValue = new Map(other.fencesValue);
    this.trajectoryValue = clone(other.trajectoryValue);
    this.sequenceValue = other.sequenceValue;
    this.eventNumberValue = other.eventNumberValue;
    this.outcomeNumberValue = other.outcomeNumberValue;
    this.retryNumberValue = other.retryNumberValue;
    this.trajectoryNumberValue = other.trajectoryNumberValue;
    this.checkpointsValue = new Map([...other.checkpointsValue.entries()].map(([id, checkpoint]) => [id, clone(checkpoint)]));
    this.checkpointNumberValue = other.checkpointNumberValue;
  }
}

export function createSandboxTemporalKernel(options: SandboxTemporalOptions = {}): SandboxTemporalKernel {
  return new SandboxTemporalKernel(options);
}

/** Short alias for adapters that treat the kernel as the Sandbox clock. */
export const createSandboxTemporal = createSandboxTemporalKernel;
