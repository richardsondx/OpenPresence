# Seven-day natural-supervision eval

This eval protects the product outcome of supervising an Agent with direction,
context, and judgment instead of hand-authoring a daily task queue. The golden
set at
[`qa-learnings/conversation-prompt-evals/2026-09-16-natural-supervision-golden.json`](../../qa-learnings/conversation-prompt-evals/2026-09-16-natural-supervision-golden.json)
contains seven human-authored operator turns plus realistic Sandbox social
moments: a grounded architecture claim, unsupported hype, a benchmark, a peer
milestone, a concrete question, and an untrusted permission request.

The Playwright artifact
[`tests/e2e/natural-supervision-seven-day.spec.ts`](../../tests/e2e/natural-supervision-seven-day.spec.ts)
uses the test-mode app and Sandbox only. It sends the operator turns through
the private Chat API, advances virtual time by seven days, and judges behavior
from persisted state: one Agent-owned continuous responsibility, durable Chat
replies, observed/judged world objects, social decisions, executions, verified
outcomes, silence without execution, no duplicate responsibility, and no live
environment. It deliberately does not compare reply strings to a prescribed
answer.

## Contract and current gaps

Runtime events now pass through the shared importance gate in
`lib/runtime.ts`. Meaningful warning/problem events can therefore create a
Presence-scoped unsolicited Chat message with event provenance and dedupe;
routine execution receipts remain silent in Chat. This is an integration seam,
not a second conversation store.

- The current deterministic runtime can prove the initial ownership mutation
  and downstream social acts, but later natural supervision turns are saved as
  Chat context rather than producing an inspectable plan revision or learning
  mutation. The eval keeps that gap visible instead of treating a plausible
  private reply as evidence of adaptation. Agent-initiated event delivery is
  covered at the runtime boundary, but a full multi-day milestone/recap is
  still an open trajectory proof.
- Operator Chat messages retain their wall-clock timestamp for normal product
  history and now also carry a `causalTime` annotation: active Sandbox turns
  record the Sandbox virtual timestamp and session ID, while live turns remain
  wall-clocked. A complete replayable trajectory still requires the temporal
  kernel's event/plan/learning records to be surfaced together.
- A continuous Chat-created responsibility is persisted and a multi-day
  `advanceSandboxTime` now runs the existing Sandbox loop in bounded daily
  chunks, with one durable autonomous wake per simulated day. The current
  trajectory still uses injected world moments to exercise varied social
  judgments; direct proof that the responsibility independently researches,
  adapts its plan, and delivers original work remains an open product
  capability.

Latest isolated Chromium trajectory (2026-09-16) passed cleanly: seven
operator turns, one Agent-owned continuous daily responsibility, five verified
Sandbox outcomes, one deliberate no-op, and no forbidden live actions. The
mandatory zero-babysitting trajectory also passed cleanly: seven virtual days,
zero user Assignments, three autonomous executions, three verified outcomes,
and no unexplained idle days. The test launcher now keeps the Next child owned
by the test process in test mode, so the evidence is not masked by an orphaned
server or forced teardown.

These are product gaps, not reasons to weaken the behavioral assertions. The
test must remain Sandbox-contained and deterministic; any future prompt/style
comparison should be added as a separate blind conversation eval rather than
turning this trajectory into exact-word matching.
