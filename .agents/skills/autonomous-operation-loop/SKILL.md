---
name: autonomous-operation-loop
description: Design or repair OpenPresence runtime behavior so an Agent owns an outcome and continuously observes, plans, acts, measures, learns, and replans without routine user babysitting. Use for autonomy, proactive work, assignments, scheduling, follow-through, goal progress, or re-planning; use autonomous-behavior-debugger when a specific observed behavior already has a reproducible failure.
---

# Autonomous Operation Loop

Use the OpenPresence model: the User supplies goals, identity/context, boundaries,
access, preferences, and corrections; the Agent owns social judgment and the
path to the outcome; the Presence supplies channel context and authority.

The durable loop is:

```text
Observe → Understand → Select → Plan → Create → Act → Measure → Learn → Re-plan
```

Do not reduce autonomous operation to `user assignment → execution → stop`.

## Invariants

- A goal plus access, context, and permissions can start useful work without a
  user-authored Assignment.
- Missing user-specific information may be requested; social-media expertise,
  strategy, cadence, routine follow-up, and measurement belong to the Agent.
- The current plan, scheduled work, runtime execution, and user-visible
  Calendar are one coherent source of truth or projections of one source.
- New observations, failures, results, permission changes, and breaking events
  can make work obsolete and trigger justified re-planning.
- An action, draft, queued job, or attempted delivery is not a verified outcome.
  Keep follow-up and measurement alive when the owned outcome requires them.
- Silence and `NO_OP` remain valid judgments. Idle is only acceptable when the
  goal is satisfied, work is intentionally waiting, or a real blocker exists.
- Autonomy operates inside the Presence Execution Envelope; permissions are not
  a reason to approve every routine action or to bypass boundaries.

## Workflow

1. Read the relevant philosophy sections and identify the affected User,
   Agent, Presence, Channel, Mirror, cognition, intent, execution, delivery,
   outcome, memory, or UX boundary.
2. Trace the real path from goal or observation through durable state,
   scheduling, execution, verified outcome, measurement, and the next decision.
3. Establish the first failing or missing transition with a reproducible
   scenario or runtime evidence before changing architecture or prompts.
4. Prefer a durable structured-state or control-loop repair over another
   special-case prompt, button, task type, or competing scheduler.
5. Add or strengthen a trajectory-level regression scenario before or with the
   fix where practical.
6. Verify Sandbox behavior with the OpenPresence CLI, then verify user-facing
   behavior through `verify-app` when the change crosses the live UI.
7. Update `CAPABILITY_LEDGER.md` with evidence, status, and the next unproven
   capability.

## Failure probes

Try to reproduce: work remaining while the Agent is idle; unnecessary user
questions; one action treated as outcome completion; stale Calendar work still
executing; runtime and Calendar divergence; failed delivery shown as success;
repeated failed tactics; invisible plan mutations; permission bypass; and user
corrections lost after the current conversation.

If a failure is observed, hand the focused diagnosis to
`autonomous-behavior-debugger`; do not duplicate its full behavior-chain
procedure here.

## Evidence bar

Code presence and a passing unit test are not proof of autonomous operation.
Use a persisted trajectory, deterministic state assertion, replay/fork
comparison, or real-app flow. Record virtual duration, scenario/seed, relevant
state transitions, and any limitation in the capability ledger.
