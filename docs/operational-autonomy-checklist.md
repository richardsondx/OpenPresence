# Operational Autonomy Checklist

Verified against the implementation on 2026-08-20.

## Phase Status

- [x] Phase 0: Operational axioms are present in both philosophy documents.
- [x] Phase 1: Operational run, wake, dependency, incident, heartbeat, and browser-body persistence exists; leases and due-wake claims are atomic; the Node temporal engine starts at runtime boot.
- [x] Phase 2: Root-cause classification, incident aggregation, immutable recovery-attempt logs, bounded recovery budgets, cooldown/waiting, and `Needs You` escalation exist.
- [x] Phase 3: The X API and signed-in browser are peer execution tools; route preferences and known API health are honored per action, and provider 429s create durable reset wakes that the browser cannot bypass.
- [x] Phase 4: Uncertain writes use normalized payload, parent, media, Presence, and time-window fingerprints before retry; ambiguous writes remain isolated or escalate.
- [x] Phase 5-6: Managed persistent browser profiles and the ten-step recovery ladder exist, including identity validation and post-recovery reconsideration.
- [x] Phase 7: Headed browser setup, expected-identity verification, and profile sealing are exposed through Settings APIs.
- [x] Phase 8: Runtime health is probed at `/runtime/health`; the supervisor restarts an unresponsive runtime and an example launchd plist is included.
- [x] Phase 9: Recovery reconsideration re-queues only still-relevant work and distinguishes expired and superseded runs.
- [x] Phase 10: Bounded operational context is available to cognition without raw infrastructure logs.
- [x] Phase 11-12: Global health indicator, persisted health API, truthful recovering/waiting Current Focus states, incident cards, technical history disclosure, and Browser Body settings are wired.
- [x] Phase 13: Legacy failed executions can be projected one-way into aggregated incidents without mutating history.
- [ ] Phase 14: Full chaos/endurance proof is not complete. Tier A structural coverage exists; Tier B browser/runtime crash simulation and Tier C multi-hour duplicate/loss endurance still require an environment-backed runner.

## Visual Acceptance Coverage

- [x] Healthy system state.
- [x] Browser recovering state with affected action count and no-action-needed copy.
- [x] Quota waiting state and no-browser-evasion invariant.
- [x] Runtime recovery state in Current Focus.
- [x] Uncertain delivery vocabulary and no-blind-retry path in runtime.
- [x] Aggregated incident card backed by persisted incident data.
- [x] Reconsideration counts returned by the recovery subsystem.
- [x] Sacred `Needs You` boundary for authentication and exhausted recovery.
- [x] Managed Browser setup, expected identity, persistent profile, and seal flow.

## Remaining Proof Work

- [ ] Run Playwright visual captures for the nine acceptance states against seeded operational fixtures.
- [ ] Add a real browser-crash fixture that exercises the managed-browser ladder through the supervisor.
- [ ] Add a killed-runtime fixture that proves lease reclamation and wake recovery after restart.
- [ ] Add an endurance runner that asserts zero duplicate external writes and zero lost assignments over a multi-hour window.
