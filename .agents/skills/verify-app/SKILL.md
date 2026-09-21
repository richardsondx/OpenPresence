---
name: verify-app
description: Verify OpenPresence engineering changes against the real running application using realistic user paths, semantic Playwright interaction, persisted state, diagnostics, and objective evidence. Use for feature validation, bug reproduction, targeted regression, UI behavior, performance checks, and proving work is complete; do not use as a generic test-writing checklist.
---

# Verify App

Use this skill after changing OpenPresence behavior, UI, runtime orchestration, persistence, connectors, or performance. It is a verification layer that composes with normal engineering work.

## Product boundary

OpenPresence is a persistent Agent with one or more Presences. Preserve the separation between observed world, Social Intent, Execution, Delivery, and verified Outcome. Consult the canonical [OpenPresence philosophy](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md) when the affected behavior is cross-cutting or its scope is unclear. A UI success state, queued execution, draft, or API response is not automatically a world outcome.

Read [features/README.md](references/features/README.md) first, then read only the feature files matching the diff and realistic regression surface. Update the map in the same change when routes, entry points, selectors, flags, or proof requirements drift.

## Required verification loop

1. Determine the direct behavior, adjacent regression surface, persistence implications, and relevant feature-map files from the request and diff.
2. Run `node .agents/skills/verify-app/scripts/verify-app.mjs doctor`. Use the harness-owned isolated runtime by default. `doctor` must pass before product claims are made; it reports the checkout identity, URL, port, SQLite path, Next dist directory, browser profile, PID, and workspace revision.
3. Run proportionate static checks: targeted Vitest/Playwright tests, typecheck, lint, build, or the relevant subset. Do not replace product verification with a test result.
4. Start or restart the fresh runtime with `start`/`restart`, then exercise the actual user path through the browser. Prefer semantic `--role`/`--name`, `--label`, `--placeholder`, and `--testid` locators. Use `open`, `click`, `type`, `press`, `select`, `submit`, `upload`, `wait-for`, and `assert`.
5. Reach a stable observable end state and inspect side effects with `snapshot`, `state --projection <name>`, `route`, `errors`, `network-summary`, or a second UI read. Test only materially related success, cancel, error, empty/loading, disabled, reload, alternate-entry, or responsive paths.
6. Capture evidence with `screenshot`, `snapshot`, state output, logs, or performance metrics. Evidence is written under the isolated runtime's `evidence/` directory unless an explicit path is supplied.
7. If verification fails, classify it as implementation, harness, stale environment, test data, external dependency, or unsupported path. Fix the appropriate layer and repeat. Do not weaken an assertion or silently skip a failure. Preserve `FAIL` for a demonstrated unmet contract and `BLOCKED` for a concrete inability to exercise it. Repair failures within the task scope; never turn a failed product gate into a blocker merely because another attempt would be expensive.

## Compact entry protocol

Read only the affected ledger rows and linked evidence, then freeze the
contract and causal cone. Reproduce once, repair the first failing edge, rerun
the same composed run, and give that exact candidate and trace to an
independent challenger. Close rows on their own gates; do not reread unrelated
history. Choose checks by expected information per cost, keep retries bounded
with a stable run identity, and stop when the same external blocker repeats.
Record the blocker, attempts, and recovery condition as `BLOCKED` instead of
spending another broad pass.

Before an expensive trajectory, check whether its public stimuli can exercise the
required transition: two observations of different patterns cannot prove repeated
support for one pattern. State the expected causal edge and a diagnostic outcome
for both success and failure. After a failed run, inspect that first missing edge;
change one justified variable before rerunning. Do not repeat the same long run
hoping for a different result or force a model choice to satisfy the assertion.

For retained-versus-removed learning, use one checkpoint, equal world inputs and
clock, and record preexisting pending work separately from newly chosen work.
An imported API route does not start the application’s background worker.
For autonomous-worker claims, use the running isolated app and observe the
actual dispatch/eligibility transition; a past `nextDueAt` or successful pulse
response is not proof that cognition ran.

Require at least one post-fork decision ID absent from the checkpoint, with
model invocation evidence when claiming a real-model run. Identical inherited
IDs mean the forward-choice gate was unexercised. Compare attributed decisions,
not cumulative snapshot counts. An unchanged choice
is `not_demonstrated`, not a broken harness by default. Deterministic projections
and real-model forward choices are separate evidence claims.

Finish outstanding adversarial probes before broad release checks; a still-open
probe means the candidate is not frozen. A full suite passing while a challenger
is investigating is a checkpoint, not closure.

Before capturing the final candidate, pause overlapping writers and declare all
run-produced artifacts. Produce the before manifest, run, and after check in one
orchestration when practical. If source changes, retain the mismatch and rerun
only the affected gate; do not relabel an old run with the new candidate hash.
Inspect compact summaries and selected JSON fields; never print a full proof
manifest or multi-megabyte state merely to retrieve its verdict.

Prefer `--compact` for lifecycle, maintenance, and proof-pack commands. Read
selected fields from the retained artifact when needed; use full browser snapshots
when their accessibility content is necessary to choose the next interaction.

Typical isolated setup:

```bash
node .agents/skills/verify-app/scripts/verify-app.mjs start --compact
node .agents/skills/verify-app/scripts/verify-app.mjs doctor --compact
node .agents/skills/verify-app/scripts/verify-app.mjs reset-session
node .agents/skills/verify-app/scripts/verify-app.mjs open activity
node .agents/skills/verify-app/scripts/verify-app.mjs snapshot
```

The harness uses test mode, deterministic AI/X mocks, a derived port, a fresh SQLite file, a unique Next development directory, and a persistent Playwright profile derived from this checkout. It never points reset operations at the canonical workspace. An explicitly supplied external URL is rejected by `doctor` unless `OPENPRESENCE_VERIFY_ALLOW_EXTERNAL=1` is deliberately set; never use that override for a claim that requires ownership or freshness.

For a bounded real-provider or background-worker proof, explicitly start/restart
with `OPENPRESENCE_VERIFY_REAL_MODEL=1` and/or
`OPENPRESENCE_VERIFY_SCHEDULER=1`. Defaults remain deterministic and scheduler-off.
The runtime/PID metadata records these modes, and `start` refuses reuse with a
different mode. Test mode and the mocked X connector remain enabled, so real
model cognition does not authorize live channel delivery. Configure credentials
through the public provider operation in the isolated database; never include
secrets in proof artifacts.

## Evidence bar

Reject these as insufficient on their own: app launch, page render, a passing test, source inspection, component existence, HTTP 200, an unrelated screenshot, or directly calling an internal handler instead of exercising the user trigger.

For every claim, record:

- the requested user-observable behavior;
- the real trigger and entry point used;
- the stable end state observed;
- important persistence, network, file, database, or world side effects;
- the evidence artifact path;
- relevant paths that were not verified and why.

Instrumentation may inspect state after the user flow executes. It must not bypass the production boundary being verified. A skeptical engineer should be able to answer “yes, this demonstrates the requested behavior actually works.”

For conversational claims, read the retained replies and compare their claims
with the actual durable changes. Nonempty text, reply counts, and absence of
implementation jargon cannot prove grounded follow-through. A reply denying work
that was just created is a failure even if every state-count assertion passes.

For a composed claim, all gates must point to the same run or checkpoint and
share its candidate and trace identity. Passing a unit test plus an unrelated
seven-day run is adjacent evidence, not composed proof. The trace must link
the trigger, decision, execution, outcome, and any learning or replan event;
event counts and self-reported labels cannot substitute for those semantic
links.

## Harness command guide

The executable surface is `scripts/verify-app.mjs`; run it from any directory in this checkout.

- Lifecycle/safety: `doctor`, `info`, `start`, `restart`, `stop`, `cleanup --dry-run`, `cleanup --confirm`.
- Browser: `open <surface>`, `route`, `snapshot`, `screenshot`, `click`/`aria-click`, `type`, `press`, `select`, `submit`, `upload`, `wait-for`, `wait-settle`, `assert`.
- Observability: `state --projection activity|chat|schedule|playground|...`, `console`, `errors`, `network-log`, `network-summary`, `logs`, `perf-metrics --runs 3`.
- Fixtures: `reset-session` for isolated state; `seed-state --scenario scenarios/<file>.json` to use the existing sandbox CLI through the running server. Sandbox state is rehearsal, not live delivery.
- Closure: `proof-pack --contract <file> [--evidence <file>] [--reuse-from <packet>] [--out <file>]` binds a compact contract attestation to the exact current checkout, including tracked and non-ignored untracked files. Required gates resolve to `PASS`, `FAIL`, or `BLOCKED`; the packet exits non-zero for the latter two while retaining the distinction in JSON. `PASS` attests this contract only; it does not promote a capability ledger row. Evidence with a different candidate hash is ignored. Prior passing evidence is reusable only when the declared causal cone is unchanged; the packet records the prior candidate and changed paths.
- Drift: `maintenance` checks the feature-map links and executable harness prerequisites.

All commands emit JSON and use non-zero exit codes for genuine failures. Wait for observable conditions; do not add arbitrary sleeps to a verification flow. `cleanup` is dry-run unless `--confirm` is supplied and targets only the resolved harness runtime directory.

## Compact closure packet

Freeze one contract before implementation. The contract is a JSON object with a
stable `id`, `runId`, `traceId`, optional `goal`, explicit `environment` (runtime,
model, mock mode, seed, and relevant configuration), a nonempty `causalCone`
list of repository-relative paths, and required `gates` (`id`, `description`,
optional `required: false`). After
collecting only the evidence needed for those gates, write an evidence array
with `gateId`, `status` (`PASS`, `FAIL`, or `BLOCKED`), `candidateHash`, `contractHash`,
the same `runId` and `traceId`,
`artifactPath`, and `artifactSha256`. Run `proof-pack` against the
current checkout and retain its JSON output as the closure packet.

Use an empty evidence array first to obtain the candidate and contract hashes;
this correctly returns `BLOCKED`. Keep contract/evidence/output paths fixed for
the run. Declare generated log/trace paths in the contract's `artifacts` array
before execution. Those exact files are excluded from the candidate hash and
bound separately by artifact SHA-256; they cannot overlap the causal cone.
Otherwise writing a new test log would invalidate its own pre-run candidate.
Capture the binding before execution and compare it after execution;
do not attach fresh hashes to an old run. The tool validates bindings and
retained bytes, not whether an assertion was honest or an oracle independent.
An independent reviewer must still inspect the artifacts before ledger promotion.

The packet hashes file contents and records `HEAD`, status, and all tracked or
non-ignored untracked files. Next's generated `next-env.d.ts` is recorded as
metadata and excluded from the content hash because concurrent isolated Next
runs can rewrite it; never restore it while a Next writer is active. This
makes a dirty worktree an explicit candidate instead of an unspoken assumption.
A missing, stale, or mismatched evidence
binding is `BLOCKED`, never a pass. `FAIL` means the product gate was exercised
and failed; `BLOCKED` means the gate could not be fairly exercised because of a
harness, environment, credential, or unsupported-path condition. Keep those
outcomes separate in the ledger.

Separate concurrent test runs by database, port, and build directory. For
Vitest child-process restart tests, pass `OPENPRESENCE_VITEST_DB_PATH` explicitly
to retain the intended database. When a dev compiler recycles under its heap
limit, preserve the failure log and fix that resource condition before rerunning
the affected journey; do not relabel a socket failure as a product PASS.

For gates that declare `oracle: "independent"`, the evidence entry must also
declare `oracle: "independent"`. The oracle must inspect semantic state and
causal evidence from the run, not merely count events or repeat a fixture's
claimed outcome. Fixtures may create conditions, but they must not manufacture
the desired strategy change, delivery, or learning result.

Use `--reuse-from` only for a prior packet with the same causal-cone path set.
The command compares file hashes and carries forward passing gates when every
changed path is outside that cone, recording the prior candidate as provenance.
If a cone file changed, rerun that gate. This is the only supported evidence
reuse path; do not copy status prose between packets.

## Feature-map maintenance

Feature files describe behavior, not source folders. Each one must document the user POV entry points, concrete harness selectors/commands, proof, and gotchas. Add a journey file when a behavior crosses surfaces (for example create → reload → persistence or Chat → Activity → verified outcome), but keep selectors in the individual feature files.

When behavior changes, check navigation paths, semantic labels/test IDs, projection names, feature flags, account/entitlement state, sandbox/live separation, and persistence after reload or restart. Run `maintenance` after updating the map. Do not rewrite stable infrastructure without a demonstrated drift or missing primitive.

## Final report contract

When this skill is used, the final engineering response includes:

```text
Verification: PASS | FAIL | BLOCKED

Verified:
- <behavior>

Checks:
- `<command>` — PASS

Product verification:
- <real user flow> — PASS
- <observable outcome>

Evidence:
- <artifact path or structured output>

Not verified:
- <only genuine relevant gaps and why>
```

Never claim `Verified` without running the flow and capturing evidence. `BLOCKED` must name the concrete external or unsupported condition and preserve the failed evidence.
