---
name: developer-sandbox-certifier
description: Certify the OpenPresence developer Sandbox as trustworthy laboratory infrastructure for accelerated autonomous-agent testing. Use for virtual time, event ordering, delayed outcomes, retries, reset, isolation, seeded replay, hidden truth, checkpoints, or trajectory capture; do not use this skill to judge the Agent's social quality.
---

# Developer Sandbox Certifier

The Sandbox is the world used by evals. If it lies, downstream scores are
meaningless. Audit the existing `openpresence` CLI and runtime first; extend
existing controls rather than creating a second simulator or throwaway script.

## Required certification surface

Using the existing Sandbox CLI where possible, prove:

- virtual time can be inspected, paused/resumed, advanced, and accelerated;
- scheduled, recurring, simultaneous, cancelled, stale, and injected events
  follow defined causal ordering;
- delayed outcomes appear only after their causes and retries/backoff use
  virtual time without duplicating side effects;
- reset creates an isolated run and does not rewrite Agent meaning or leak
  another Presence/session;
- seeded setup and replay reproduce inputs, world state, ordering, and enough
  trajectory to diagnose a failure (LLM prose need not be byte-identical);
- hidden simulator truth is unavailable until an allowed observation exposes it;
- Sandbox cannot reach live connectors, production data, or real external writes;
- trajectory output includes virtual time, observations, decisions/intents,
  executions, outcomes, plan mutations, events, and permission decisions.

The current control surface is normally:

```text
pnpm --silent openpresence playground start
pnpm --silent openpresence playground inspect
pnpm --silent openpresence playground inject ...
pnpm --silent openpresence playground advance --minutes <n>
pnpm --silent openpresence playground timeline
pnpm --silent openpresence playground reset
pnpm --silent openpresence playground run scenarios/<file>.json
pnpm --silent openpresence playground scenario run <id>
```

Use `verify-app` only for real running-app control. It owns browser/runtime
inspection; this skill owns Sandbox trustworthiness.

## Certification scenarios

Run at least: future scheduling, clock jump, simultaneous events, delayed
consequence, recoverable failure/retry, breaking event and re-plan, reset,
seeded replay, hidden-truth leak, side-effect isolation, and a multi-day
accelerated horizon. Compare instant deterministic advancement with at least
two accelerated rates when the runtime supports them.

Do not certify based on API existence, a green unit test alone, or a desired
outcome encoded directly into the Agent's context. If time mixes wall-clock and
virtual time, causes arrive after outcomes, reset leaks, replay cannot diagnose,
or the trajectory is incomplete, status is `PARTIAL` or `FAILED`.

## Output

Write a concise report with:

```text
# Sandbox Certification
Status: CERTIFIED | PARTIAL | FAILED
Critical failures:
Temporal/event evidence:
Isolation/reset/replay evidence:
Missing coverage:
Required fixes:
```

Attach command output or durable artifacts and update the affected entries in
`CAPABILITY_LEDGER.md`. A certified Sandbox is a prerequisite for trusting
trajectory evals, not proof that the Agent itself is correct.
