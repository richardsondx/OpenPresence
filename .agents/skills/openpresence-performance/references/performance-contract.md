# OpenPresence performance contract

This reference is loaded when planning measurements, selecting regressions, or deciding whether a runtime optimization is honest. It describes invariants, not fixed implementation choices. Current audits are historical evidence and must be rechecked against the current worktree.

## Product boundary

OpenPresence is a persistent social Presence system. Performance work is successful when it helps the operator use the product responsively and helps the Agent notice, judge, express, and learn reliably without losing identity.

Preserve these boundaries:

```text
User → Agent → Presence → Channel/Mirror

observe → judge → Social Intent → Execution → Delivery → verified Outcome
```

The runtime owns clocks, continuity, retries, resource limits, and connector recovery. The Agent owns social judgment. Intent is not delivery, delivery is not outcome, and a queued or attempted action is not proof that anything happened in the world.

## Performance invariants

### One logical wake

One due Presence wake has one durable logical run and one bounded provider-read set, even if a browser is open, a worker is running, or multiple scheduler entry points are active. A durable wake/run idempotency key is preferred over transient in-process locks.

### Bounded, attributable work

Every run receives an explicit budget envelope for its work origin and category, such as inbound observation, self-directed discovery, metrics, hydration, model judgment, or delivery. No entry point may bypass the envelope, and exhaustion is a typed terminal result rather than silent continuation.

### Change-sensitive observation

Observation should use cursors, deltas, checkpoints, or equivalent change detection where the Channel supports them. Repeated zero-delta cycles must back off or reduce expensive work. Cheap inbound responsibility may be sampled more frequently than audience metrics, publication metrics, or deletion audits.

### Truthful terminality

An attention episode cannot remain `running` without a live leased run and meaningful progress. Crash recovery, lease expiry, restart, and state conflicts must produce a terminal or explicitly recoverable state. Activity must not show current work from an orphaned historical episode.

### Delivery readiness

Capabilities are available for planning only when their effective route is ready. Bridge-dependent work requires fresh liveness, verified identity, and a claimable execution path. Repeated same-cause expiry should become visible incident/recovery state and prevent unbounded new work until the route is repaired.

### Verified outcomes

Every selected social act reaches either a verified world outcome or an explicit terminal failure before its intent expires. Native, Bridge, manual, and simulated paths remain distinguishable. No provider response, queued record, or UI counter may be presented as a verified social outcome without the applicable Mirror evidence.

### Idempotent persistence

Replaying unchanged observation data must not create new object-change events. Observation checkpoints are distinct from object-change provenance. Stable external references plus content/relationship hashes should be used where appropriate. Ordinary pulse stages should not rewrite an unbounded full-workspace snapshot.

### Compact read models

Operator-facing Activity, health, and summary reads should be server-computed, bounded, and scoped to their view. Daily aggregates must be complete and authoritative even when raw event history exceeds the display window. UI code should not download megabytes of raw state to calculate basic totals.

### Independent social acts

Disabling or failing one act, such as replies, must not silently disable independently authorized likes, reposts, quotes, follows, or messages. Each act earns its place through Taste and authority, and a valid `NO_OP` remains valid.

### Concurrency-safe responsibility

Concurrent wakes cannot overshoot an Assignment or publishing target. Assignments complete only with their requested deliverable, explicit report, necessary operator decision, genuine blocker, or explicit failure—not because a candidate was rejected or because the system ran out of time.

### Safe identity and privacy

Performance optimizations must not broaden model context or serialize a full Presence object into cognition. Filter private context before Presence eligibility and model context. Never trade away Agent identity, Memory, Taste, language policy, or execution authority for a benchmark result.

## Regression scenarios

At minimum, add or run scenarios relevant to the changed slice:

1. temporal scheduler, external worker, and mounted UI together still create one logical wake;
2. ten consecutive zero-delta observations back off and avoid refetching the same large windows and metrics;
3. the configured hard budget produces no over-budget provider call across manual, scheduled, recovery, and trial entry points;
4. Activity totals match authoritative SQL aggregates while raw events exceed the display projection limit;
5. crash, restart, lease expiry, and optimistic-conflict recovery leave no orphaned running episode;
6. stale/unverified Bridge state removes dependent capabilities from planning and makes health non-green when those capabilities are required;
7. selected reply, like, repost, quote, and follow acts each reach verified success or explicit terminal failure in the owning bounded run;
8. unchanged reconciliation replay creates zero additional Mirror object-change events;
9. disabling replies does not disable other independently authorized acts;
10. concurrent wakes cannot exceed an Assignment or daily publishing target;
11. a deliberate `NO_OP` is not overturned by a forced-publication retry;
12. the Live/autonomy canary improves latency/resource measurements without changing the meaning of Activity, health, delivery, or verified outcomes.

## Historical starting signals

The repository has documented prior evidence of:

- competing scheduler ownership;
- stale/unverified Bridge execution while health remained green;
- fixed-window observation and budget/enforcement drift;
- repeated Mirror update amplification;
- large compatibility snapshot writes and oversized Activity reads;
- orphaned attention episodes;
- duplicate cognition implementations;
- global typecheck/lint drift.

These are investigation hypotheses, not automatic diagnoses. Measure current behavior before changing them. The primary historical sources are [`docs/OpenPresence_Runtime_Performance_and_Social_Action_Audit_2026-08-24.md`](../../../docs/OpenPresence_Runtime_Performance_and_Social_Action_Audit_2026-08-24.md) and [`docs/OpenPresence_Autonomy_Debug_Report_2026-08-25.md`](../../../docs/OpenPresence_Autonomy_Debug_Report_2026-08-25.md).
