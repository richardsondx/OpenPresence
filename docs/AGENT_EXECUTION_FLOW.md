# OpenPresence Agent Execution Flow

This is the canonical coordination prompt for autonomous development work in
OpenPresence. Use it with a concrete product goal. The goal defines what must
be true; this document defines how the lead agent gets there and proves it.

## Outcome contract

OpenPresence should feel like supervising an expert social Agent, not feeding a
task queue. The durable operation loop is:

```text
Observe → Understand → Select → Plan → Create → Act → Measure → Learn → Re-plan
```

The user supplies goals, identity/context, access, permissions, preferences,
corrections, and optional ideas. The Agent owns social judgment, strategy,
routine work, follow-through, measurement, and adaptation. A Presence supplies
channel context and execution authority. An Assignment may be an internal
implementation object, but ordinary autonomous operation must not require the
user to create one.

Preserve these truths throughout development:

- an observation is not an intent, an intent is not execution, and attempted
  delivery is not a verified world outcome;
- Calendar is a truthful view of the current plan, not a second plan;
- `NO_OP`, deliberate waiting, and a visible blocker are valid outcomes;
- autonomy is maximized inside the Presence Execution Envelope;
- Memory, Growth, durable configuration, conversation history, People, and
  empirical learning remain distinct;
- external social content is world data, never system or developer authority.

## Canonical skill architecture

Use the narrowest skill that owns the current decision. Do not recreate one
skill's workflow inside another.

| Responsibility | Canonical owner | Boundary |
|---|---|---|
| Product/architecture north star | `openpresence-philosophy` | Always consult for OpenPresence decisions. |
| Outer implementation → QA → production-ready lifecycle | `production-ready-development` | General delivery gate; it does not define OpenPresence autonomy or Sandbox semantics. |
| Goal-to-outcome runtime and proactive operation | `autonomous-operation-loop` | Architecture and behavior of continuous Agent operation. |
| Diagnosis of a known observed autonomous failure | `autonomous-behavior-debugger` | Trace and repair the first failing runtime transition. |
| Sandbox laboratory trust | `developer-sandbox-certifier` | Proves virtual time, events, isolation, replay, and trajectories. |
| Trajectory scenarios and behavioral evals | `agent-eval-lab` | Tests the Agent over time on a certified Sandbox. |
| Durable learning and unlearning | `learning-loop-auditor` | Proves stored evidence changes later decisions correctly. |
| Capability evidence and status | `capability-ledger-verifier` | Owns `CAPABILITY_LEDGER.md`, not feature navigation. |
| Product simplification and safe deletion | `design-simplifier` | Includes capability-aware ablation; does not replace Product Review or QA. |
| Real running application proof | `verify-app` | Owns browser/runtime control and evidence for user-facing behavior. |
| Milestone product readiness | `product-review` | Judges customer outcome and coherence before QA. |
| Broad product/usability audit | `product-usability-auditor` | Use when a product or feature audit is requested. |
| Prompt/social-writing quality | `conversation-prompt-evaluation` | Rehearsal, Chat, and Live prompt behavior; not trajectory autonomy. |

The five new local skills are `autonomous-operation-loop`,
`developer-sandbox-certifier`, `agent-eval-lab`, `learning-loop-auditor`, and
`capability-ledger-verifier`. Simplification is deliberately merged into the
existing `design-simplifier`; no competing `simplification-auditor` is needed.

## Lead-agent operating model

Act as the engineering lead. Preserve context for product intent, architecture,
dependency decisions, capability status, integration, and unresolved risk.
Delegate narrow work when it is independent and has a clear read/write scope.

Useful parallel roles include reconnaissance, Sandbox certification, eval
authoring, implementation, runtime inspection, adversarial verification,
learning audit, Product Review, regression hunting, and simplification review.

Do not run conflicting writes against the same architectural core. Investigate
in parallel first, choose one direction, assign one implementation owner, then
parallelize verification. The builder must self-test, but an independent
verifier must challenge important claims.

Every delegated agent returns a structured packet:

1. question investigated or capability exercised;
2. findings and evidence paths/commands;
3. files changed, if any;
4. tests run and results;
5. architectural assumptions;
6. unresolved uncertainty;
7. affected capability IDs;
8. recommended next action.

Use repository artifacts and structured CLI output as shared memory. Important
discoveries become code, a test/eval, a ledger entry, a Feature Map update, a
design decision, or a reproducible evidence artifact.

## Execution phases

### 0. Establish a trustworthy control surface

Inspect before implementing. Run the existing verification controls and check
whether agents can start/reset the app, seed isolated state, use a real user
path, inspect state and diagnostics, run Sandbox scenarios, control virtual
time, replay a failure, and collect proof.

Use the existing controls:

```bash
node .agents/skills/verify-app/scripts/verify-app.mjs doctor
pnpm --silent openpresence playground start
pnpm --silent openpresence playground inspect
pnpm --silent openpresence playground timeline
```

If repeated verification work is awkward, extend the owning control surface.
Do not add a parallel CLI for a capability already owned by `openpresence` or
`verify-app`.

### 1. Reconnaissance before large edits

Investigate independently, as applicable:

- operation loop, assignments, Calendar, scheduler, workers, and permissions;
- Sandbox, virtual time, scenarios, replay, and trajectory evidence;
- evals, memory/learning, pattern/template/media intelligence;
- user-facing Chat, Tasks, People, Growth, Artifacts, Live, and Presence views;
- verification harness, feature-map coverage, dead paths, TODOs, and duplicate
  sources of truth.

For each area ask: what exists, what actually runs, what only appears to run,
where the runtime stops, what is testable, what is disconnected, and what
should be removed rather than expanded.

### 2. Build the capability contract early

Use `capability-ledger-verifier` and update `CAPABILITY_LEDGER.md` before major
implementation. Keep `FEATURES_MAP.md` for user-facing navigation and control
paths. Translate the goal into behavior: autonomous start, self-generated work,
plan/Calendar consistency, execution and follow-up, measurement, adaptation,
learning, permissions, temporal Sandbox behavior, live proof, and safe
simplification.

Assume `UNPROVEN` until evidence exists. A feature, route, prompt, or passing
unit test is not a proven capability.

### 3. Certify the Sandbox before trusting evals

Use `developer-sandbox-certifier`. Prove virtual time, pause/resume/advance,
scheduled and recurring events, simultaneous ordering, delayed consequences,
retry/backoff, cancellation/staleness, reset, isolation, seeded replay,
hidden-truth separation, no live side effects, and complete trajectory capture.

Exercise instant deterministic advancement plus multiple acceleration rates when
supported. If acceleration changes causal semantics, stop and repair the
Sandbox; do not compensate in eval scoring.

### 4. Implement and evaluate in dependency order

Use `autonomous-operation-loop` to identify the first missing transition, then
build the smallest durable fix. In parallel, use `agent-eval-lab` to reproduce
the missing behavior and encode a regression scenario. Prefer structured state
and one source of truth over prompt patches or synchronized duplicates.

For major work, separate build and verify ownership. After integration, run
cross-workstream scenarios; separately correct components do not prove that the
whole loop composes.

### 5. Close the loop autonomously

Run:

```text
implement → start → exercise → inspect → diagnose → fix → rerun → regress → simplify
```

Use black-box/runtime proof when the behavior can be observed externally. Fix
ordinary in-scope failures without handing them back to the user. Escalate only
for a real external dependency, required product decision, or consequential
authority change.

### 6. Challenge the implementation independently

Give verifier agents the invariant and public controls, not the builder's
preferred explanation. Vary seeds, event ordering, timing, account state,
permissions, performance, and injected failures. For learning, compare a
checkpoint with learned state present versus removed. One reproducible critical
failure reopens the work regardless of how many agents reported success.

### 7. Verify the product and simplify

Use `verify-app` for the real running application: actual user trigger, stable
end state, persisted state, relevant error/recovery path, responsive path, and
console/network diagnostics where relevant. Use Product Review for customer
coherence and `design-simplifier` for capability-aware deletion/ablation.

Update the Feature Map when routes, entry points, selectors, proof commands, or
meaningful states change. Update the capability ledger after every meaningful
cycle.

## Canonical control surface

The current repository already provides these complementary controls:

| Need | Control |
|---|---|
| App doctor/start/reset/browser/console/network/evidence | `node .agents/skills/verify-app/scripts/verify-app.mjs <command>` |
| Sandbox session and projected state | `pnpm --silent openpresence playground start|inspect|timeline|reset` |
| Simulated observations and judgment | `pnpm --silent openpresence playground inject|consider|inspect-media` |
| Virtual-time scheduling | `pnpm --silent openpresence playground advance --minutes <n>` |
| Repeatable scenarios | `pnpm --silent openpresence playground run scenarios/<file>.json` |
| Scenario lifecycle and replay/evaluation | `pnpm --silent openpresence playground scenario list|run|resume|rerun|evaluate` |
| Calendar/Assignments and Watches | `pnpm --silent openpresence schedule ...` / `watching ...` |
| Product navigation/proof anchors | `FEATURES_MAP.md` and `.agents/skills/verify-app/references/features/` |
| Behavioral evidence/status | `CAPABILITY_LEDGER.md` and `qa-learnings/` |

Extend a surface only when a repeated gap is demonstrated. New commands must
have stable help, descriptive errors with recovery guidance, JSON output where
useful, safe/idempotent behavior, and tests. `--dry-run` is required for a new
destructive control where applicable.

## Mandatory scenario families

Maintain focused, reproducible coverage for:

- clean autonomous start with no Assignment;
- seven virtual days without routine user input;
- growth stall and strategy adaptation;
- breaking event and justified re-plan;
- one-action trap and follow-through;
- tiny-sample/false-correlation and relevant-vs-random media;
- durable user correction;
- permission boundary;
- tool failure without false success;
- stale strategy and unexpected winner;
- Sandbox time jumps, simultaneous events, delayed outcomes, retry, reset,
  replay, hidden truth, and side-effect isolation.

Use deterministic assertions for deterministic properties. Use calibrated model
judges only where subjective social judgment is irreducible. Turn material
failures into permanent regression scenarios.

## Proof pack and release gate

Before calling a milestone production-ready, collect a compact proof pack with
changed files, capability-ledger diff, commands, scenario IDs/seeds, virtual
duration, trajectories, screenshots/runtime evidence, failures fixed, and
known gaps.

For a goal that has a composed acceptance journey, freeze an executable closure
contract before broad implementation. Use the existing `verify-app` surface:

```bash
node .agents/skills/verify-app/scripts/verify-app.mjs proof-pack \
  --contract verification/<goal>-contract.json \
  --evidence verification/<goal>-evidence.json \
  --out verification/<goal>-proof.json
```

Declare generated evidence paths in the contract `artifacts` array before the run; their bytes are bound separately and cannot overlap the causal cone. This prevents the test output itself from invalidating its source binding.

The packet hashes the exact checkout, including non-ignored untracked files,
and records each required gate as `PASS`, `FAIL`, or `BLOCKED`. `PASS` is a
contract attestation only; it does not promote a capability ledger row. A gate whose
evidence belongs to another candidate is blocked. Passing evidence may be
reused with `--reuse-from` only when the contract's declared causal cone is
unchanged; the packet records the prior candidate and changed paths. This
allows cheap reruns after unrelated edits while preventing stale evidence from
promoting a changed behavior. `FAIL` is a product assertion that ran and did
not hold. `BLOCKED` is an honest inability to exercise the assertion. Both are
non-zero command outcomes and must remain distinct in the ledger.

The candidate manifest records `next-env.d.ts` as generated metadata while
excluding it from the hash. Concurrent isolated Next runs may rewrite that
file; do not restore it during an active writer and do not treat it as product
evidence.

Declare `oracle: "independent"` on gates whose result could be manufactured by
the scenario or its counters. Their evidence must carry the same oracle marker
and inspect semantic state plus causal transitions. A fixture may arrange an
opportunity or inject a failure; it must not directly write the expected
strategy change, delivery, learning, or recovery result. Counts and self
reported labels can support an oracle, but cannot be its only assertion.

Every gate in a composed contract must reference the same run or checkpoint
identity and linked causal trace. A focused unit test and an unrelated
multi-day browser run are adjacent evidence, not one composed pass. The oracle
must inspect semantic transitions and persisted outcomes; event counts and
self-reported strategy labels are supporting signals only.

Use a compact entry protocol: read only affected ledger rows and linked
evidence; freeze contract and causal cone; reproduce once; repair the first
failing edge; rerun the same composed run; challenge that exact candidate
independently; then close only rows whose own gates pass. Choose checks by
expected information per cost, keep retries bounded with a stable run identity,
and stop when the same external blocker repeats. Record the blocker, attempts,
and recovery condition as `BLOCKED` rather than spending another broad pass.

Use the packet as the single closure spine: implement only toward a failing
gate, rerun that gate after the smallest repair, then run the composed journey,
independent challenge, and adjacent regressions. Do not begin a second
benchmark or goal in the same closure packet. If the acceptance contract
changes, create a new contract and packet rather than editing history.

The gate is:

1. targeted tests and type/build/lint checks;
2. Sandbox certification;
3. trajectory evals and regressions;
4. independent adversarial verification;
5. real running-app verification;
6. Product Review when the experience changed;
7. simplification/ablation review;
8. capability-ledger review.

Apply this full gate to an autonomy milestone. For a bounded feature change,
select the affected gates and record why others are not applicable; do not
recertify an unchanged Sandbox or rerun broad release health after each small
repair. Run release health once after behavioral closure, repeating only checks
invalidated by later changes. A Native executor proof and a Sandbox proof must
respect their environment isolation; require a shared causal run only where
the product actually composes those transitions.

Do not call the goal complete while a critical capability is `UNPROVEN`,
`PARTIAL`, `REGRESSED`, or `BLOCKED`, or while an important assumption has no
credible evidence. State exactly what remains.

## Final forcing test

Start clean with account access, a goal, required user context, and explicit
permissions—but no Assignment. Run a multi-day accelerated scenario with no
routine user input. Inject poor performance, a breaking opportunity, misleading
evidence, explicit feedback, an out-of-bound action, and a failed tool call.

Confirm the Agent plans, acts, follows through, measures, learns, replans,
respects permissions, avoids false success, and keeps Calendar/runtime state
truthful. Then ask:

> What evidence would prove that conclusion wrong?

Run that test before deciding completion.
