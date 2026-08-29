---
name: openpresence-performance
description: Diagnose and improve OpenPresence performance and runtime reliability across the UI, API, workers, SQLite, connectors, and browser flows, using measured before-and-after evidence while preserving truthful social outcomes.
---

# OpenPresence performance improvement

Use this skill when OpenPresence is slow, timing out, consuming excessive CPU or memory, doing duplicate work, appearing stuck, reporting misleading health, or failing to complete autonomous work reliably. It is an implementation skill: diagnose first, then repair one highest-impact coherent slice and verify it.

This skill is specific to OpenPresence. Read [`AGENTS.md`](../../../AGENTS.md), the relevant sections of [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md), and the focused performance contract in [`references/performance-contract.md`](references/performance-contract.md) before changing code. Read current audit reports and source paths only as evidence to validate against the current repository, never as a substitute for a fresh baseline.

## Operating contract

- Work local-first and remain production-aware. Preserve unrelated dirty-worktree changes; do not commit, deploy, or reset user work unless explicitly asked.
- Cover the full path when relevant: UI → API → runtime orchestration → provider/model work → SQLite/persistence → connector/browser → verified Social Mirror outcome.
- Audit broadly, rank by operator impact and systemic leverage, then implement one ranked improvement slice per invocation. A slice may span multiple files or layers when they share one root cause.
- Fix directly related correctness defects, including stale activity, false health, duplicate wakes, orphaned runs, silent expiry, incomplete terminal states, or misleading usage, because responsive software that lies is not an improvement.
- Prefer the smallest coherent change. Schema/process refactors, normalized read models, worker isolation, scheduler ownership changes, and component decomposition are allowed when measurement justifies them and migration safety is preserved.
- Use Sandbox, mocks, fixtures, read-only probes, and synthetic data by default. Never perform a live publish, reply, like, repost, quote, follow, message, or browser write without explicit action-time confirmation.
- Stop and ask the operator when verification depends on missing credentials, stale browser state, unavailable external services, service limits, or another external intervention. Do not wait indefinitely or claim an unverified success.
- Stop and request explicit approval before destructive data operations, irreversible migrations, deleting persisted state, or replacing a persistence boundary without a reversible path.

## Required workflow

### 1. Establish the current truth

Inspect the repository, running processes, relevant routes/workers, database shape, existing telemetry, and dirty-worktree state. Identify the affected scope: Agent, Presence, Channel, Mirror, cognition, intent, execution, delivery, outcome, or runtime.

For the Live/autonomy canary, measure enough of the same run to connect:

```text
wake → observe → select social moments → judge → Social Intent
→ Execution → Delivery → verification → settled Activity state
```

Capture reproducible baseline values where applicable:

- operator-visible latency and time-to-settled state;
- response size and server-side work;
- CPU, RSS/heap, event-loop pressure, process count, and restart behavior;
- SQLite query timing, write volume, database/WAL growth, lock contention, and serialization size;
- provider/model calls, channel reads/writes, hydrations, retries, and budget consumption;
- run, episode, intent, execution, delivery, health, and verified-outcome transitions.

Do not treat a draft, model response, queued execution, attempted delivery, or local-only success as a verified outcome.

### 2. Form and rank the diagnosis

Trace the bottleneck to a root cause rather than optimizing a symptom. Separate:

- UI rendering and payload cost;
- request/event-loop contention;
- scheduler ownership and duplicate work;
- provider/model or connector latency;
- persistence, query, serialization, and lock amplification;
- resource/budget enforcement;
- delivery readiness and terminal-state truthfulness.

Rank findings using this order unless the user specifies otherwise:

1. user-visible hangs, timeouts, crashes, or runaway resource use;
2. failures that make autonomy or health appear to work when it does not;
3. duplicate or unbounded work that amplifies every wake;
4. repeated latency/resource regressions on the primary canary;
5. localized maintainability or quality-gate debt that blocks safe improvement.

Record the selected slice and the next ranked items before implementation so one run does not expand into an unbounded rewrite.

### 3. Implement safely

Keep the Agent/Presence hierarchy and the separation between cognition, Social Intent, Execution, Delivery, and Outcome intact. Performance work must not:

- force publication or turn a valid `NO_OP` into an action;
- weaken Taste, privacy, language policy, execution authority, or channel semantics;
- hide delivery failures as silence, health, completion, or success;
- make a Presence change Agent-wide identity, memory, or model state;
- move connector queues, retries, rate limits, or implementation prose into Agent cognition.

Prefer bounded, change-sensitive, idempotent, and server-computed work. Use additive/backward-compatible migrations, explicit compatibility adapters, small transactions, indexed read paths, durable idempotency keys, and isolated worker/process boundaries where they address the measured cause. Preserve a rollback or compatibility path for persisted data.

Add focused instrumentation or reusable benchmark helpers only when they materially improve diagnosis, regression protection, or future iteration. Keep telemetry correlated to the logical wake/run, invocation, episode, candidate, stage, and outcome.

### 4. Verify the slice

Run fast focused checks while iterating, then attempt repository-level gates before declaring completion:

- typecheck;
- lint;
- relevant unit/integration tests;
- relevant Playwright E2E tests;
- Sandbox autonomy-flow tests;
- the same baseline measurements after the change.

Compare before and after using repeated samples where practical. A fix is complete only when it improves the stated target without introducing a truthfulness, privacy, authority, compatibility, or verified-outcome regression. Distinguish pre-existing failures from failures introduced by the slice; never report a green gate that was not actually run and passed.

### 5. Hand off and stop

Provide a concise evidence handoff containing:

1. root cause and affected subsystem;
2. baseline versus post-change measurements;
3. files and behavior changed;
4. focused and repository gates run, including failures;
5. remaining risks, unverified external gates, and the next ranked improvements.

Stop after the verified slice. If the target is not met, report the evidence and continue only when another change remains part of the same root-cause slice. If blocked, state the exact intervention required.

## Verification invariants

Use [`references/performance-contract.md`](references/performance-contract.md) for the OpenPresence-specific invariants and regression scenarios. When a failure is primarily an autonomous behavior gap rather than a performance bottleneck, apply the existing `autonomous-behavior-debugger` skill alongside this one; do not use performance work to force an action that the Agent did not choose.
