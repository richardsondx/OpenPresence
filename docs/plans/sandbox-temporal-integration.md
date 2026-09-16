# Sandbox temporal integration recommendation

## Decision

The current Playground bridge is safe to preserve as a compatibility layer, but it is not yet a complete persisted deterministic temporal system. The bounded temporal repair now restores the kernel from the persisted session snapshot, dispatches ordered calendar events through the existing route, and temporarily exposes each event's virtual timestamp to the existing Sandbox cognition/delivery helpers. It also fences and cancels superseded retry lineages. This remains intentionally short of a second scheduler or a new temporal architecture.

## Exact findings

- `lib/sandbox-temporal.ts:1-9` defines the kernel as an in-memory deterministic core with no persistence, timers, wall-clock reads, or connector calls.
- `lib/sandbox-temporal.ts:145-160` persists a snapshot containing virtual time, pause/acceleration state, events, outcomes, retries, fences, trajectory records, counters, bounds, and the checkpoint registry.
- `lib/sandbox-temporal.ts` now serializes immutable kernel checkpoint branch points in the session snapshot, so a rehydrated kernel can restore or fork by checkpoint ID. Checkpoints still contain only temporal-kernel state, not the complete isolated Playground world, and the `checkpoint_created` record remains appended after the checkpoint snapshot is captured.
- `lib/runtime.ts:3145-3157` creates a `SandboxTemporalKernel` when a Playground session starts and stores `temporalSnapshot` on `PlaygroundSession`.
- `lib/runtime.ts:3274-3322` restores the snapshot, schedules deterministic calendar event IDs, advances the kernel, and writes the resulting snapshot back to the session. The legacy `virtualNow` and `virtualTimeMode` fields remain authoritative compatibility fields at the session boundary.
- `app/api/state/route.ts:4649-4663` translates processed `calendar_attention` kernel events into existing calendar evaluation and Agent-cycle behavior. The kernel orders the event; the route still owns the existing stateful side effects. This is the correct containment boundary for now because the kernel itself must not call live connectors.
- `app/api/state/route.ts:4661-4700` temporarily sets the persisted compatibility session clock to each processed event's timestamp while dispatching the existing Agent cycle, then restores the final bulk-advance clock. Calendar evaluation timestamps use the same event-local value.
- `lib/sandbox-temporal.ts` attaches operation fences to retry events, cancels every pending event in the operation lineage during superseding or terminal transitions, and marks older retry events stale before invoking handlers.
- `lib/runtime.ts:3217-3271` still inserts Playground observations directly as Mirror objects. They are not kernel events and do not receive temporal trajectory records or kernel causality links.
- `lib/runtime.ts` schedules frozen Scenario stimuli as stable `scenario-stimulus:<run>:<stimulus>` events at the run's virtual origin plus `offsetMinutes`. `app/api/state/route.ts` dispatches fired Scenario events through the existing async Sandbox boundary, preserving event-local virtual timestamps, `nextStimulusIndex` resume semantics, and the temporal-event ID on the resulting world object, observation event, and social decision. Evaluation criteria remain outside the untrusted stimulus payload.
- `lib/db.ts:1167-1180,2303-2462` persists the normalized workspace state, so the current `PlaygroundSession.temporalSnapshot` survives the normal state round-trip. That is persistence of a mutable snapshot, not an append-only temporal ledger; the ordinary `events` projection is not equivalent to a causal trajectory store.
- `temporalKernelForSession()` falls back to a new kernel when the snapshot is missing or its `now` does not match `virtualNow` (`lib/runtime.ts:3274-3280`). This protects compatibility but can silently discard queued events and trajectory history. A production integration should make migration/reset explicit and fail closed on malformed or conflicting persisted state.
- `lib/temporal.ts` is the operational/live scheduler using wall-clock time and SQLite wakes. It should remain separate from the Playground virtual-time kernel.

## What is proven by the isolated test

`tests/sandbox-temporal-integration.test.ts` verifies the smallest safe bridge:

1. A new Playground session receives a temporal snapshot.
2. A deterministic queued event survives the session-shaped JSON persistence boundary.
3. Advancing time fires the event, advances `virtualNow`, sets manual mode, and persists the fired event plus trajectory record.
4. Rehydrating the kernel from the persisted snapshot preserves virtual time.
5. Reset creates a fresh temporal world while preserving the existing active/realtime/world-revision reset contract.

The focused Scenario temporal test also verifies stable event IDs, persisted payload boundaries, causal event timestamps, and ordered pending-event replay. The integration test additionally verifies checkpoint persistence and temporal-kernel fork after JSON/process rehydration; it deliberately does not claim full-world fork semantics. `tests/sandbox-multi-rate-trajectory.test.ts` now verifies a persisted seven-day full-runtime replay at coarse (24-hour) and fine (6-hour) advance rates, including daily autonomous wakes, the calendar day-boundary path, a delayed measurement, and bounded retry exhaustion. Retry failure is opt-in synthetic Sandbox input; live connector failures remain owned by the live delivery/recovery path.

## Minimal production integration when the edit boundary is opened

Add a small Sandbox-only adapter around the kernel (a separate `lib/sandbox-temporal-adapter.ts` is preferable to expanding the live scheduler) with a persisted envelope such as:

```ts
type SandboxTemporalEnvelope = {
  schemaVersion: number;
  sessionId: string;
  presenceId: string;
  worldRevision: number;
  seed: string;
  kernelSnapshot: SandboxTemporalSnapshot;
  checkpoints: Array<{
    id: string;
    label: string;
    createdAt: number;
    kernelSnapshot: SandboxTemporalSnapshot;
    worldState: OpenPresenceState;
  }>;
  forkOf?: { sessionId: string; checkpointId: string };
};
```

The adapter should:

- use a stable event-type handler registry, never serialized function callbacks;
- create a checkpoint only at a state transaction boundary and capture both kernel state and the complete isolated Playground world (Mirror objects, perceptions, intents, executions, outcomes, evidence, and trace references);
- restore/fork from immutable persisted parent evidence, with a new session/world revision and explicit lineage;
- retain causal links from fired Scenario events through the resulting world observations, decisions, executions, and outcomes;
- append trajectory records durably without allowing a bounded in-memory snapshot to overwrite prior evidence; keep one product-of-record state path rather than introducing a parallel Feature Map or verification CLI;
- preserve legacy `virtualNow`/`virtualTimeMode` during migration, but reject malformed or conflicting temporal state explicitly instead of silently dropping the queue;
- keep all Sandbox execution behind the existing non-live connector boundary and retain the route’s existing Agent-cycle side-effect translation until each event type has a proven adapter.

Only after that adapter exists should the system run the required multi-rate multi-day/7-day replay, pause/resume, retry/backoff, cancellation/staleness, reset/isolation, hidden-truth, and independent-verifier checks. The capability ledger should remain PARTIAL/UNPROVEN for checkpoint/fork and full persisted trajectory claims until those checks pass.

## Recommendation

Accept the current bridge and Scenario adapter as a bounded integration step: it persists and deterministically rehydrates the kernel snapshot, schedules Scenario offsets, and preserves existing Playground behavior. Do not certify it as complete persisted checkpoint/trajectory/fork semantics. The next production change should be the persisted envelope plus full-world checkpoint/fork adapter and an append-only causal trace that includes Scenario stimulus lineage. Do not modify the live `lib/temporal.ts` scheduler for this work.
