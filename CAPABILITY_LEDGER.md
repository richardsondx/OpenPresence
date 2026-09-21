# OpenPresence Capability Ledger

Initial evidence baseline: 2026-09-16. This is a behavioral contract, not a
feature inventory or completion badge. The working tree contains unrelated
user changes; statuses below describe the repository evidence available at the
baseline and must be re-verified against the current checkout before release.

`FEATURES_MAP.md` owns product navigation and feature reachability.
`qa-learnings/` owns project-specific QA memory and regression rules.
`qa-learnings/certification-closure-manifest-2026-09-16.md` records the
mechanical proof gates, dependencies, and exact closure gaps for the current
candidate. It does not replace this ledger's capability definitions or status.

## 2026-09-21 verification-loop audit

Current closure evidence lives in `qa-learnings/verification-loop-2026-09-21/`.
The audit found that the historical natural-supervision canary's unsolicited
`strategy_change` was fabricated from two successful Sandbox deliveries, with
no audience measurement or changed allocation. Its positive update claim is
invalidated; historical passing test counts do not restore that claim.
The runtime no longer emits this unsupported learning statement. A second fix
rejects late supervisory events for missing Presences rather than falling back
to the active identity.

The strengthened seven-day test uses the real Chat composer, durable replay
and reload checks, and explicit outcome → execution → intent joins. It passed
with seven operator turns, one Agent-owned responsibility, five verified
Sandbox outcomes, a durable correction, and zero unsupported strategy updates.
This proves the deterministic quiet-operation/recovery slice, not real-model
conversation quality or a genuine autonomous milestone/recap. AUT-010,
EVAL-005, and UX-004 retain their positive/adversarial gates.

Promotion is row-local: historical "Slice B/C after Slice A" ordering is not
an additional behavioral requirement. Every actual dependency and declared
composed gate must still be satisfied; separate unit and browser runs do not
become one composed trajectory by appearing in the same report. Missing `/tmp`
artifacts are unavailable evidence and must not be used for current promotion.

### Current evidence limits and next discriminating runs

SIM-001 is now PROVEN after independent final-runtime migration, new Agent-owned
execution, restart/no-duplicate, and responsive review. The original twelve
PARTIAL rows are not one indivisible gate.

The 2026-09-21 seven-day measured trajectory still lacks a genuine learning
transition; unlike the historical run, it fails rather than fabricating one.
Its one-pixel media fixtures prove ingestion only. The real-model fork attempt
created no new decision IDs and is `unexercised_not_demonstrated`, not evidence
of equal forward choices. LEARN-002/003/004 and dependent autonomous positive
update/ablation claims must not reuse either as completed learning proof.

The next learning experiment must first establish an eligible post-checkpoint
opportunity, then compare only new decisions under equal clock/world inputs
with retained versus removed learning. A retirement claim needs comparable
measured contradictions, and a media claim needs actual contrasting media with
later attributed choice. Read the compact current report before historical
checkpoint narratives: `qa-learnings/verification-loop-2026-09-21/review.md`.

## 2026-09-18 autonomy recovery checkpoint

`qa-learnings/autonomy-recovery-canary-2026-09-18.md` records a focused
user-facing recovery finding and repair. The existing Chrome Bridge could be
online and verified while an older billing-blocked Assignment remained
`needs_operator`; verified Bridge identity now re-evaluates and reopens that
same Assignment, requests an assignment-scoped wake, and preserves review and
verified-outcome boundaries. The general Chat artifact capability also now
resolves a scoped existing Asset and attaches it to the next private reply;
the focused Chromium canary caught and verified the corresponding rendering
path. This is supporting evidence only: the full browser-driven
wrong-account → human intervention → publish → external verification canary
remains unproven, so no existing PARTIAL capability is promoted. The same
checkpoint now also contains a real user-level Chat → Chrome Bridge → X browser
delivery: the exact harmless canary post is visible on `@example_agent`, while
the runtime truthfully stopped at `verification-closed` because X API credits
were exhausted. This proves delivery and fail-closed boundary reporting, but
not API-backed verification or the adversarial wrong-account intervention path.

## Status vocabulary

Use only `UNPROVEN`, `PARTIAL`, `PROVEN`, `REGRESSED`, and `BLOCKED`.
`PROVEN` requires concrete evidence appropriate to the capability; code
presence, a prompt, or a passing unit test alone is not enough.

Exact-candidate closure checkpoint: immutable `38e97ca` passed the canonical
three-slice seven-day certification, detached independent verifier (11 files /
136 tests plus public causal reconstruction), and final release health (lint,
typecheck, build, and 131 files / 1,235 tests). Evidence is recorded in
`qa-learnings/release-candidate-38e97ca-2026-09-17.md`. No PARTIAL row is
promoted from this aggregate run; each retains its declared behavioral gate.

Independent verifier delta: the fresh adversarial review of `38e97ca` found no
reproducible product failure, but returned `INCONCLUSIVE` for every remaining
PARTIAL row because the required public composed/adversarial contracts were not
actually exercised. Its fresh launch also hit a detached-environment `bindings`
resolution error (HTTP 500); this setup failure is preserved in
`qa-learnings/independent-verifier-38e97ca-2026-09-17.md` and is not product
evidence. The verifier later repaired its isolated dependencies and passed a
public composed slice (10,080 virtual minutes, 43 typed causal records,
browser reload truth, and zero live executions), but still returned
`INCONCLUSIVE` for the remaining rows because the exact native-race,
full-causal-cone, learning-transfer, interruption, and legacy-ablation gates
were not all exercised. No replay-specific hardening is reopened.

Slice A focused rerun (2026-09-17) passed the native executor, public retry/
cancellation route, and independent public causal-trace checks; see
`qa-learnings/slice-a-focused-rerun-2026-09-17.md` for the explicit oracle and
commands. `SBX-004` and `SBX-008` remain PARTIAL because the required native
race plus permission/retry causal cone has not yet been independently owned as
one composed run. Slice B and Slice C were run after that closure in the
historical audit, but that ordering is not a cross-capability prerequisite.
Evaluate and promote B/C row-locally when each row's own candidate-bound gates
are complete; an open A row does not withhold unrelated evidence.

An independent verifier also passed the exercised SIM-001 legacy migration
ablation on `38e97ca`: legacy operator work remained draft, historical Calendar
data survived restart, Agent-owned Sandbox work executed without activation,
and no live side effects occurred. Evidence is preserved in
`qa-learnings/sim001-independent-verifier-38e97ca-2026-09-17.md`; it remains
supporting evidence because SIM-001's own migration and no-duplicate-
responsibility gates are open, not because another slice must close first.

The corrected action-family learning implementation was verified on exact
commit `67a7544` and is documented in
`qa-learnings/release-candidate-67a7544-2026-09-17.md`. The canonical public
trajectory, independent verifier (9 files / 111 tests), and release-health
gates all passed. This supersedes the prior candidate for runtime evidence;
the remaining PARTIAL rows keep their declared proof gates.

Closure checkpoint `4d4903d` is now the immutable release candidate, tagged
`openpresence-release-candidate-2026-09-17-4d4903d`. Its candidate-bound
evidence is recorded in
`qa-learnings/release-candidate-4d4903d-2026-09-17.md`: canonical seven-day
public certification, independent verifier (including multi-rate and
cross-process checks), lint/typecheck/build, and broad Vitest all passed.
The bounded Sandbox contradiction path now retires a hypothesis after four
distinct measured contradictions while preserving history. No PARTIAL row is
promoted solely from this aggregate result: rows whose contract still calls
for independent adversarial review, complete causal-cone coverage,
relevant-media learning, or another explicit gate remain PARTIAL.

Delta note: commits `27ebac1` and `31f62b0` propagate Sandbox session scope
and reject stale caller-supplied retrieval runs for Assignment and normal
public inject-cycle decisions. Independent verification passed post-restart
inject and reply cycles; like/repost/quote/follow and other Assignment action
families remain open proof gaps.

Release-candidate delta: immutable candidate `8645cda` passed the canonical
composed seven-day trajectory, exact-candidate independent verifier (including
cross-process replay and cross-rate checks), and broad release health. These
gates were rerun against that same candidate after the checkpoint; the
resulting bundle is recorded in
`qa-learnings/release-candidate-8645cda-2026-09-17.md`. No additional capability
is promoted: every remaining `PARTIAL` row still has an explicit behavioral
gate missing from its contract.
Statuses below remain PARTIAL wherever a declared behavioral contract still has
an explicit missing gate; no row is promoted from a green test alone.

Final candidate delta: immutable candidate `b1cd557` passed the canonical
composed seven-day trajectory, detached exact-candidate independent verifier
(including cross-process replay and cross-rate checks), detached public
Chromium trajectories, and final broad release health (128 files / 1,204
tests; lint 0 errors / 155 warnings; typecheck; build; runtime doctor). The
candidate-bound bundle is recorded in
`qa-learnings/release-candidate-b1cd557-2026-09-17.md`. The broad suite also
caught and closed a test-harness child-process discovery defect. No capability
is promoted merely because this composed run is green; each remaining PARTIAL
row retains its exact missing behavioral gate.

Final immutable candidate delta: `c99cc37` passed the canonical composed
seven-day run, detached exact-SHA independent verifier including cross-process
and cross-rate checks, detached natural-supervision run, and broad release
health (lint 0 errors / 155 warnings; build; serial typecheck; 130 files /
1,209 tests). The candidate-bound evidence is recorded in
`qa-learnings/release-candidate-c99cc37-2026-09-17.md`. AUT-002 is promoted by
the new natural-answer persistence and Agent-owned planning proof; all other
PARTIAL rows retain their explicit missing gates.

Current closure delta: `tests/plan-intervention-process-boundary.test.ts`
passed a real Process A → terminate → fresh Process B replay. The restored
Agent-owned responsibility retained its supervisory constraint and executed
exactly once through public Sandbox time advancement, with no activation or
live side effect. The failed no-due-window setup is preserved in
`qa-learnings/plan-intervention-process-boundary-2026-09-17.md`. This closes
`AUT-005`; dependent-work reconsideration remains separately open.

Release-health/candidate delta: immutable candidate `fd7f9bd` passed the
canonical composed seven-day Sandbox trajectory, the independent exact-SHA
replay/cross-rate/isolation verifier, the natural-supervision trajectory, and
final broad release health (lint 0 errors / existing warnings; production
build; typecheck; 130 files / 1,210 tests). The candidate also removes the
remaining user-facing Growth goal, template scheduling, and full Assignment
editor flows while retaining Agent-owned executable primitives and scoped
intervention. Evidence is recorded in
`qa-learnings/release-candidate-fd7f9bd-2026-09-17.md`. No capability is
promoted solely from the composed run; each remaining PARTIAL row retains its
explicit missing gate.

Current release-candidate delta: immutable candidate `82214e7` passed the
canonical composed seven-day Sandbox trajectory, the exact-candidate
independent verifier (including cross-process replay and cross-rate checks),
and final broad release health (lint 0 errors / existing warnings; production
build; typecheck; 130 files / 1,210 tests). The canonical test now starts from
the public Sandbox control and proves that startup itself materializes the
first Agent-owned plan; it no longer calls the harness-only `replanPublishing`
operation. Evidence is recorded in
`qa-learnings/release-candidate-82214e7-2026-09-17.md`. No capability is
promoted from this run: every remaining PARTIAL row retains an explicit
behavioral gate, including independent research/delivery, dependent-work
reconsideration, complete causal reconstruction, media interpretation, and
full independent natural-supervision/adversarial review.

Final candidate delta: immutable candidate `4c1fac8` passed the canonical
composed seven-day trajectory, the exact-candidate independent verifier
(including cross-process replay and cross-rate checks), and final broad release
health (lint 0 errors / 156 existing warnings; build; typecheck; 130 files /
1,215 tests). The canonical run now also proves successor Calendar work is
copied into the linked Agent-owned plan after breaking-event invalidation. The
candidate-bound evidence is recorded in
`qa-learnings/release-candidate-4c1fac8-2026-09-17.md` and
`qa-learnings/canonical-dependent-work-2026-09-17.md`. `AUT-006` is promoted;
all other PARTIAL rows retain their exact missing behavioral gates.

Current autonomy/learning delta: commits `e9c2a8a`, `86cdd8a`, `d470aa0`, and
`d48193e` close concrete implementation gaps without changing the declared
status of the remaining capabilities. Supervisory intervention now creates a
durable Agent plan revision and keeps active Publishing Plan windows aligned;
Agent-created Publishing Plans initialize the linked Assignment plan;
Growth evidence carries optional Assignment/plan-revision lineage; stale
evidence-backed hypotheses are withheld from current retrieval; and persisted
counterfactuals preserve the actual available action surface. Focused evidence
and the post-fix canonical trajectory are recorded in
`qa-learnings/autonomy-learning-closure-2026-09-17.md`. LEARN-001/002/003/004,
EVAL-004, AUT-003/004/006, and UX-005 remain PARTIAL pending their full
trajectory-level gates; replay-specific proof remains closed.

Learning provenance delta: the Sandbox runtime now rebuilds Social Decision
strategy attribution from the fork-local retrieval run instead of accepting a
precomputed Sandbox retrieval object, and each verified Sandbox outcome is
persisted as goal-anchored `WORLD_OUTCOME` evidence with social-decision,
Mirror, Assignment-plan, and session lineage. Focused regressions pass in
`tests/learning-counterfactual.test.ts` and `tests/sandbox.test.ts`. This
strengthens LEARN-001/002 and SBX-008, but does not promote them: a complete
autonomous learning audit, future allocation difference, and independent
causal-cone review remain required.

Immutable release-candidate delta: candidate `2154c5c` passed the release-health
checkpoint, canonical composed seven-day public certification, exact-candidate
independent verifier (including cross-process replay and cross-rate checks),
public natural-supervision/media-truth checks, and broad release health (130
files / 1,224 tests). The candidate-bound bundle is recorded in
`qa-learnings/release-candidate-2154c5c-2026-09-17.md`. The candidate also
records a three-variant relevant/irrelevant/text-only Sandbox media trajectory;
that strengthens LEARN-004 evidence but does not satisfy its independent later
transfer gate.

## Current ledger

Proof-gate shorthand used in the closure manifest: `I` implemented, `P`
publicly exercisable, `O` observable/persisted, `A` adversarially challenged,
`C` composition-certified, `V` independently verified, and `H` release-health
passed. `PARTIAL` means at least one required gate is missing; it is not a
confidence estimate.

| ID | Capability / user outcome | Protected invariant | Evidence / verification | Status | Known gap / next action |
|---|---|---|---|---|---|
| AUT-001 | Agent can begin from goal, access, context, and permissions without a user Assignment | Routine autonomous operation does not depend on task entry | `tests/autonomy-proof.test.ts`, `tests/operational-autonomy.test.ts`, `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` (clean Chromium run 2026-09-16: 7 virtual days, 0 user Assignments, 3 autonomous executions, 3 verified outcomes); `lib/autonomy-worker.ts` now owns the no-public-footing first-move decision in the asynchronous control loop | PARTIAL | Prove independent research/delivery and retain independent verifier evidence |
| AUT-002 | Agent gathers missing user-specific context without asking for social expertise | User supplies identity/context, not the Agent's strategy | `tests/operator-chat-tools.test.ts`, `tests/autonomous-growth-cognition.test.ts`, `tests/operator-chat-harness.test.ts` (real queued worker asks for audience/positioning, then persists a natural answer into the Presence Brief and starts the canonical Agent-owned continuous responsibility without user activation), `qa-learnings/onboarding-context-gate-2026-09-17.md` | PROVEN | No remaining gate in the declared context-gathering contract |
| AUT-003 | Agent creates its own plan and executable work | Goal → plan → work remains durable and inspectable | `lib/autonomy-worker.ts`, `lib/operational-context.ts`, `tests/operational-continuity.test.ts`; candidate-bound `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` (10,080 virtual minutes, seven autonomous wakes, zero user Assignments, four autonomous executions/outcomes, breaking-event invalidation, successor plan, and later replans) | PROVEN | No remaining gate in the declared autonomous plan-and-work contract |
| AUT-004 | Calendar is a truthful projection of the current plan | Runtime and visible schedule do not diverge; user does not maintain task fields | `FEATURES_MAP.md`, `tests/publishing-plan.test.ts`, `tests/e2e/schedule-recovery.spec.ts`, `tests/runtime.test.ts` (linked Assignment intervention synchronizes Calendar and standing intent), `app/client-page.tsx` projection UI, `qa-learnings/canonical-certification-d338604-2026-09-17.md`, `qa-learnings/calendar-plan-projection-audit-2026-09-17.md`, `tests/e2e/chat-first-harness.spec.ts` (Agent-owned publishing item cancellation leaves one successor plan and visible projected windows after reload) | PROVEN | No remaining gate in the declared truthful projection contract |
| AUT-005 | Chat can create and mutate Agent-owned executable work directly | User intention does not require manual task creation or activation | `tests/operator-chat-tools.test.ts`, `tests/e2e/chat-first-harness.spec.ts`; `tests/operator-chat-harness.test.ts` proves a natural supervisory request uses typed `plan_intervention` to mutate the existing Agent-owned responsibility without duplication; isolated Chromium: ownership request → `Assignment queued` → Tasks → active Agent-owned goal after reload; `qa-learnings/plan-intervention-browser-2026-09-17.md` proves scoped guidance mutates and persists through the Tasks inspector; `tests/plan-intervention-process-boundary.test.ts` and `qa-learnings/plan-intervention-process-boundary-2026-09-17.md` prove Process A termination → fresh Process B restore → public virtual-time execution exactly once without activation or live side effects | PROVEN | No remaining gate in the declared direct Agent-owned execution contract; dependent-work reconsideration remains under AUT-006/UX-005 |
| AUT-006 | New events and failures can cause justified re-planning | Obsolete work does not continue silently | `lib/assignment-recovery.ts`, `app/api/state/route.ts`, `tests/assignment-failure-recovery.test.ts`, `tests/publishing-plan.test.ts`, `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` (canonical seven-day trajectory: breaking event → explicit invalidation review → successor active plan; linked Agent-owned responsibility remains active; successor Calendar windows are copied into its plan; superseded windows are non-executable and no stale execution follows), `qa-learnings/certification-closure-11eaa8e-2026-09-17.md`, `qa-learnings/superseded-plan-fence-2026-09-17.md` | PROVEN | No remaining gate in the declared event-driven dependent-work reconsideration contract |
| AUT-010 | Agent can initiate a useful supervisory update without routine noise | Meaningful problems, opportunities, strategy changes, and breakthroughs reach the Presence-scoped conversation; routine receipts remain in Activity; retries dedupe | `lib/operator-initiated-communication.ts`, `lib/runtime.ts`, `tests/agent-initiated-communication.test.ts` (20 tests, including legacy/new degraded-X notice removal and zero Chat interruptions for retried partial observation), `tests/e2e/natural-supervision-seven-day.spec.ts`, `qa-learnings/release-candidate-249dfe-2026-09-17.md` (exact candidate: one meaningful strategy-change update across the composed seven-day trajectory), candidate `9663c2e` (degraded native observation remains operational state only; exact-candidate release health and broad suite passed) | PARTIAL | Prove the same threshold on a fully autonomous multi-day milestone/recap and against an independent adversarial verifier |
| AUT-007 | Agent follows through, measures, and adapts after action | An intermediate delivery is not outcome completion | `lib/live-assignment-run.ts`, `lib/runtime.ts`, `app/api/state/route.ts`, `tests/assignment-runtime.test.ts`, `qa-learnings/canonical-certification-5ef27b4-2026-09-17.md` | PROVEN | Independent public verifier passed delivery → awaiting_measurement → outcome_recorded → exactly-once scoped learning → replan → completion on immutable `5ef27b4`; duplicate advance produced no duplicate chain |
| AUT-008 | Agent stays within Presence permissions and escalates only at the boundary | Autonomy never bypasses the Execution Envelope | `lib/execution-readiness.ts`, `tests/assignment-runtime.test.ts`, `tests/source-invariance.test.ts`, `lib/native-execution-delivery.ts`, `tests/native-execution-delivery.test.ts` (delivery rechecks paused/revoked authority before connector use) | PARTIAL | Rerun the independent adversarial suite against integrated main, including approved and queued live actions |
| AUT-009 | Failed or uncertain delivery is not shown as success | Intent, execution, delivery, and outcome remain distinct | `tests/assignment-failure-recovery.test.ts`, `tests/assignment-domain.test.ts` (acknowledgement without matching Outcome remains `delivery_pending`); `docs/operational-autonomy-checklist.md` | PROVEN | Add live UI evidence for one failure state |
| LEARN-001 | Outcomes become evidence tied to the declared goal | Metrics inform judgment rather than rewrite identity | `lib/social-strategy.ts`, `lib/growth-scope.ts`, `tests/social-strategy.test.ts`, `tests/sandbox.test.ts` (public metric path plus durable state reload), `qa-learnings/learning-audit-4d4903d-2026-09-17.md` (persisted-trajectory audit; candidate canonical run and public metric-path evidence) | PROVEN | No remaining gate in the declared goal-tied outcome-evidence contract |
| LEARN-002 | Stored learning changes a later decision | Saved insight is not decorative memory | `lib/social-strategy.ts`, `lib/learning-runtime.ts`, `tests/autonomous-growth-cognition.test.ts`, `lib/learning-counterfactual.ts`; `tests/learning-counterfactual.test.ts` (SQLite round-trip, explicit decision-lineage gating, JSON-round-tripped Sandbox snapshots, public fork overlay namespacing, fresh-source overlay exclusion, source-restore preservation, serialized World A/World B retained-vs-removed learning, changed later runtime strategy, and selected-action attribution for quote/repost/like/follow) plus `lib/sandbox-replay.ts`/`lib/runtime.ts`; `qa-learnings/learning-audit-4d4903d-2026-09-17.md`; public-worker repair and bounded real-provider attempt: `qa-learnings/learn002-public-closure-2026-09-21/review.md` / `packet.json` (2026-09-21) | PARTIAL | First missing real transition: two comparable decisions attributed to the same pattern (one of five in the retained real run). Then measure, fork, and prove later behavioral transfer; deterministic strategy attribution and full observation-parent reconstruction are insufficient |
| LEARN-003 | Patterns are scoped, confidence changes, and stale patterns retire | Tiny samples and context shifts do not create global rules | `lib/social-strategy.ts`, `lib/learning-runtime.ts`, `tests/learning-counterfactual.test.ts` (independent causal-decision counting, one-year recency gate, Presence/Channel/Agent scope regression, measured contradiction and bounded retirement) and `qa-learnings/learning-audit-4d4903d-2026-09-17.md` | PARTIAL | Prove the full autonomous contradiction/retirement trajectory through an independent learning adversary |
| LEARN-004 | Relevant media is distinguished from arbitrary media | “Use images” is not a sufficient learned abstraction | `lib/asset-discovery.ts`, `lib/perception-runtime.ts`, `lib/runtime.ts`, `app/api/state/route.ts`, `lib/social-strategy.ts` (`MediaEvidenceProfile`), `lib/types.ts`, `tests/asset-intelligence.test.ts`, `tests/perception.test.ts`, `tests/learning-counterfactual.test.ts`, `tests/sandbox.test.ts` (three executable relevant/irrelevant/text-only variants with verified metric evidence and persisted profiles), `qa-learnings/media-learning-structure-2026-09-17.md`, `qa-learnings/release-candidate-2154c5c-2026-09-17.md`, `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (canonical media truth-release slice passed) | PARTIAL | Independently verify that a later media choice changes for the learned reason |
| LEARN-005 | User feedback persists as a durable constraint | Corrections survive the current turn and respect scope | `tests/ai.test.ts`, `tests/operator-chat-harness.test.ts` (typed `record_preference` saves scoped evidence, survives the worker merge boundary, and deduplicates), `tests/chat-feedback-process-boundary.test.ts` (Process A → termination → fresh Process B restores scoped evidence, then identical future input produces a different counterfactual social decision with zero executions and no foreign-Presence evidence), `tests/e2e/natural-supervision-feedback-loop.spec.ts` (public natural correction → concise acknowledgement → scoped evidence → later Sandbox decision changes), `tests/e2e/natural-supervision-seven-day.spec.ts` (updated seven-day golden trajectory persists the Day 3 correction while preserving an unrelated Day 4 repost), `lib/social-strategy.ts`, `tests/learning-counterfactual.test.ts`, `qa-learnings/chat-feedback-durability-2026-09-17.md`, `qa-learnings/natural-supervision-feedback-loop-2026-09-17.md` | PROVEN | Clean detached public seven-day trajectory proves the full correction-to-later-decision contract; no remaining gate in this row |
| SBX-001 | Virtual time can advance Sandbox work | Scheduled work uses virtual time, not accidental wall time | `lib/temporal.ts`, `lib/runtime.ts`, `app/api/state/route.ts`; `tests/sandbox.test.ts`, `tests/sandbox-temporal-integration.test.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical public seven-day trajectory and accelerated 1x/24x/96x runs; independent exact-candidate cross-rate verifier; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared virtual-time contract |
| SBX-002 | Events have defined causal ordering | Simultaneous, recurring, stale, and injected events are deterministic or explicit | `lib/runtime.ts` Scenario temporal adapter, `tests/scenarios.test.ts` (17 tests, including stable offset events and ordered replay), `tests/e2e/scenario-rehearsal.spec.ts` (4/4 clean Chromium run 2026-09-16); `tests/sandbox-temporal.test.ts` (13 tests, including multi-event event-local handler clocks and stale retry ordering); `tests/sandbox.test.ts` (persisted calendar dispatch plus typed causal parent assertions); `lib/sandbox-temporal.ts` and `lib/runtime.ts` at `0c68190` (central trace adapter preserves stable `parentIds` and durable `parentTypes`); `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` on the current checkpoint (explicit monotonic causal oracle); `tests/e2e/independent-causal-trace.spec.ts` (public CLI/API trajectory, verifier-owned typed-parent graph reconstruction, and monotonic virtual-time oracle; passed on a clean detached worktree containing product candidate `6359691`); `qa-learnings/release-candidate-6359691-2026-09-17.md` (canonical seven-day slices and release health) | PROVEN | No remaining gap in the declared causal ordering and typed-parent contract |
| SBX-003 | Delayed outcomes arrive only after causes | Agent cannot learn from future or hidden consequences | `lib/runtime.ts`, `tests/e2e/scenario-rehearsal.spec.ts`, `tests/workstream-a-replay.test.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical composed trajectory records delayed release; exact-candidate independent hidden-truth oracle observed no truth through minute 29 and one allowed release at minute 30; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared delayed-release contract |
| SBX-004 | Retry, cancellation, and backoff do not duplicate side effects | Recoverable failure remains visible and idempotent | `tests/assignment-failure-recovery.test.ts`, `tests/assignment-runtime.test.ts`, `tests/sandbox-temporal.test.ts` (success/exhaustion cancellation, retry-lineage fences, stale-event suppression), public `playground retry`/`cancel-retry` → virtual advance coverage in `tests/sandbox-temporal-integration.test.ts`, `lib/native-execution-delivery.ts` (durable post-handoff authority reconciliation), `tests/native-execution-delivery.test.ts` (pre-handoff cancellation, in-flight revocation receipt, and verifier-owned zero-connector-call retry-backoff oracle), `tests/runtime.test.ts` (durable native retry backoff and cancellation fence), `tests/x-connection.test.ts` (public `/api/x/manage` + `/api/state` retry/cancel route and external connector oracle), `qa-learnings/sbx-004-inflight-authority-barrier-2026-09-17.md`, and independent public audit on `5a822c8` covering cancel-before/after-attempt, duplicate scheduling, repeated cancellation, and no duplicate records; candidate `6359691` canonical composed slices and independent verifier passed | PARTIAL | Sandbox temporal and Native connector boundaries pass separately. Independently exercise public Native retry/cancel → persisted state → due delivery against a loopback HTTP oracle with an uncancelled control. Native execution must not be placed inside an isolated Sandbox; see `qa-learnings/aut008-sbx004-native-boundary-review-2026-09-21.md` |
| SBX-005 | Runs reset and remain Presence/session isolated | Sandbox state cannot leak across runs or into live delivery | `tests/sandbox.test.ts`, `tests/agent-library-browser-projection.test.ts`; canonical public no-babysitting run recorded no live execution; exact-candidate independent reset/session oracle preserved the untouched session hash and production-escape oracle recorded zero production executions/outcomes, requests, native connections, or bridges; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared reset/session/live-isolation contract |
| SBX-006 | Seeded replay/fork is diagnostically useful | Inputs, world state, order, and provenance can be reconstructed | Existing Scenario evidence plus `lib/sandbox-replay.ts`, `scenarios/workstream-a-replay.json`, `tests/workstream-a-replay.test.ts`; exact-candidate independent public Process A → checkpoint/fork → terminate → fresh Process B → restore/replay passed with equivalent normalized state/trajectory, no duplicate mirrors or learning, no session leakage, and no live side effects; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | Replay closure is complete; do not add replay-specific hardening absent a new integrated defect |
| SBX-007 | Hidden simulator truth stays hidden from cognition | Only allowed observations become Agent context | Existing Scenario evidence plus Workstream A delayed-truth/replay tests; canonical delayed-outcome trajectory; exact-candidate independent hidden-truth release oracle; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared hidden-truth boundary contract |
| SBX-008 | Trajectory evidence explains what occurred | Time, observations, intents, executions, outcomes, and events are inspectable | Existing CLI/kernel/Scenario evidence plus Workstream C causal trajectory and isolation tests; `bin/openpresence.mjs` now projects the session temporal trace, runtime records explicit causal parent ids, and immutable `0f237e3` canonical evidence contains observation → decision → intent → permission → execution → result → outcome → learning → replan plus plan mutation; independent verifier passed the exact candidate's replay/isolation suite and a detached public Chromium canonical run; `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (independent retry trace oracle and canonical composed slice) | PARTIAL | Independent reconstruction of the complete composed trace, including every permission/retry edge, remains to be certified |
| SBX-009 | Multi-day behavior can be compressed without semantic drift | Acceleration changes wall time, not causal behavior | `docs/operational-autonomy-checklist.md`; persisted session bridge in `lib/runtime.ts`, `app/api/state/route.ts`, `tests/sandbox-temporal-integration.test.ts`, `tests/sandbox.test.ts`, and `tests/sandbox-multi-rate-trajectory.test.ts`; builder 1x/24x/96x and public coarse/fine trajectories; exact-candidate independent cross-rate oracle with identical semantic projection hash; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared acceleration-semantics contract |
| EVAL-001 | Trajectory-level scenario harness exists | Evals run on top of the Sandbox rather than replacing it | `bin/openpresence.mjs`, `scenarios/`, `tests/scenarios.test.ts`, `tests/e2e/scenario-rehearsal.spec.ts`, `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical composed seven-day trajectory passed through public controls, exact-candidate independent runtime verifier, and detached public Chromium verifier; durable attestation in `qa-learnings/release-candidate-0f237e3-2026-09-17.md` | PROVEN | No remaining gap in the declared composed-harness contract |
| EVAL-002 | Deterministic properties use deterministic assertions | Judges are not used where state can be asserted | `tests/*.test.ts`, `tests/playground-cli.test.ts` | PROVEN | Audit new evals for green-by-definition tests |
| EVAL-003 | Material failures become reproducible regressions | A fixed failure remains protected | `qa-learnings/`, `tests/e2e/`, `docs/operational-autonomy-checklist.md`, `qa-learnings/eval-003-failure-linkage-2026-09-17.md`, `lib/types.ts`/`lib/runtime.ts` (failed or unavailable Scenario evaluations now require capability linkage at the durable write boundary), `tests/scenarios.test.ts`, `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (exact-candidate fail-closed verifier attack and canonical composed run with no unclassified material failure) | PROVEN | No remaining gate in the declared fail-closed capability-linkage contract |
| EVAL-005 | Natural supervisory interaction is evaluated as a trajectory | Realistic user utterances are judged by behavior, state, and follow-up rather than exact wording or internal tool scripts | `qa-learnings/conversation-prompt-evals/2026-09-16-natural-supervision-golden.json`, `docs/plans/natural-supervision-eval.md`, `tests/e2e/natural-supervision-seven-day.spec.ts`, `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (exact candidate: 7 natural turns, 10,080 virtual minutes, 5 verified outcomes, one strategy-change update, durable correction) | PARTIAL | Run the clean trajectory through an independent adversarial verifier and review interruption behavior |
| EVAL-004 | Counterfactual/ablation verification is repeatable | Future behavior differs only when the relevant evidence/state differs | Existing prompt ablations in `qa-learnings/conversation-prompt-evals/`; deterministic learning projections, persisted retrieval, lineage gating, SQLite-persisted World A/World B forward ablation, JSON-round-tripped Sandbox snapshot retained-vs-removed learning proof, fresh-source overlay exclusion, and Sandbox retrieval fencing in `lib/sandbox-replay.ts`/`lib/runtime.ts`; public fork isolation/idempotence and post-restart inject/reply behavior independently audited on `abe4993`/`7f13cf3`/`27ebac1`/`31f62b0`; exact candidate `f6059d1` `tests/autonomy-proof.test.ts` closed-loop quote/repost/follow delivery and relationship-memory evidence | PARTIAL | Complete causal-cone ablation and an independent composed verifier still remain; the action-family harness now covers quote/repost/follow execution, but does not by itself prove counterfactual causality |
| TOOL-001 | Agents can inspect/control Sandbox through a reusable CLI | No repeated throwaway script is required for common Sandbox work | `bin/openpresence.mjs`, `tests/playground-cli.test.ts`, `README.md` | PROVEN | Add commands only for demonstrated recurring gaps |
| TOOL-002 | Agents can control and verify the running app | Browser/runtime proof has isolated state and structured evidence | `.agents/skills/verify-app/scripts/verify-app.mjs`, `.agents/skills/verify-app/SKILL.md` | PROVEN | Keep feature-map maintenance current |
| TOOL-003 | Independent verifier agents can challenge builder claims | Builder success is not the sole proof for critical capabilities | `docs/AGENT_EXECUTION_FLOW.md`; exact-candidate independent verifier challenged the integrated public workflow and passed cross-process replay, cross-rate semantics, hidden-truth, reset/session isolation, retry/cancellation race, production-escape, and runtime-health oracles without source edits; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared independent-verifier contract |
| UX-001 | User experience feels like supervising an Agent, not managing tasks | Routine operational work is Agent-owned and visible without machinery leakage; no normal user task-entry or activation flow | `FEATURES_MAP.md`, `.agents/skills/product-usability-auditor/SKILL.md`, `docs/operational-autonomy-checklist.md`, `app/client-page.tsx` (Tasks/Growth/Artifacts creation and full editor flows removed; Chat intervention and cancel remain), `tests/e2e/responsive-workspace.spec.ts`, `tests/e2e/artifacts-playbook.spec.ts` (no Add, Growth goal, template scheduling, or full editor controls), `tests/operator-chat-harness.test.ts` (new Chat responsibility is Agent-owned and executable without activation), `qa-learnings/simplification-tasks-supervisory-2026-09-17.md`, `qa-learnings/product-review-tasks-supervisory-2026-09-17.md` | PROVEN | No remaining gate in the declared no-task-management UX contract |
| UX-004 | Chat is a lightweight, grounded supervisory interface | Responses are concise/action-first, use actual Growth/Calendar/plan state, infer operations from natural language, and support occasional Agent-initiated updates | `lib/supervisory-chat.ts`, `lib/operator-chat-harness.ts`, `lib/operator-initiated-communication.ts`, `tests/supervisory-chat.test.ts`, `tests/agent-initiated-communication.test.ts`, `tests/operator-chat-harness.test.ts`, `tests/e2e/natural-supervision-seven-day.spec.ts`, `tests/e2e/natural-supervision-feedback-loop.spec.ts`, `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (exact candidate: grounded 7-day natural supervision and one non-routine update) | PARTIAL | Verify the complete trajectory and interruption threshold with an independent adversarial review |
| UX-005 | Plan Intervention lets the user supervise any Agent-owned planned item | Calendar item → scoped conversational feedback → durable Agent-owned plan mutation; cancel/postpone/constrain/replan remain coherent without a task editor | `lib/types.ts` (`planIntervention`), `lib/operator-chat-harness.ts`, `lib/autonomy-worker.ts`, `lib/runtime.ts`, `app/client-page.tsx`, `tests/runtime.test.ts` (postpone/constrain/cancel synchronize linked Calendar projection and standing intent), `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` (natural correction → scoped constraint), `tests/e2e/chat-first-harness.spec.ts` (browser guidance and direct Agent-owned publishing-item cancellation both survive reload with a coherent successor projection), `tests/plan-intervention-process-boundary.test.ts`, `qa-learnings/plan-intervention-browser-2026-09-17.md`, `qa-learnings/calendar-plan-projection-audit-2026-09-17.md` | PROVEN | No remaining gate in the declared scoped intervention contract |
| UX-003 | Environment and permission truth stays visible | Sandbox, review-gated, live, and disconnected states are not represented as equivalent | `app/client-page.tsx` / `app/globals.css` shared `environmentStateFor` projection; `qa-learnings/ux-003-environment-state-projection-2026-09-17.md`; `qa-learnings/final-candidate-01fdd69-2026-09-17.md`; exact candidate responsive Chromium desktop/mobile journey 8/8 passed; Sandbox, paused, approval-required, syncing, stale, disconnected, and connected labels are explicit in workspace/Activity surfaces; `qa-learnings/release-candidate-249dfe2-2026-09-17.md` (current-selector public desktop/mobile Activity checks passed; existing responsive review/navigation evidence reused) | PROVEN | No remaining gate in the declared environment/permission projection contract |
| SIM-001 | Simplification preserves protected behavior | Deletion is preceded by capability-level ablation | `.agents/skills/design-simplifier/SKILL.md`, `CAPABILITY_LEDGER.md`, `qa-learnings/simplification-tasks-supervisory-2026-09-17.md`, `qa-learnings/product-review-tasks-supervisory-2026-09-17.md`; removed Tasks/Growth/Artifacts user-entry and full editor controls while retaining internal Assignments, Chat intervention, Calendar projection, and execution proof; `tests/e2e/responsive-workspace.spec.ts` (final isolated Chromium and mobile runs, 4/4 each, retained reports/logs under `qa-learnings/verification-loop-2026-09-21/`); `qa-learnings/sim001-planning-only-public-proof-20260921.md` final-runtime rerun (public planning-only migration, restart, fresh Sandbox Agent-owned responsibility, auto Sandbox execution/outcome, and no duplicate IDs across second restart; final source hashes and raw snapshot hashes retained) | PROVEN | No remaining gap in the declared migration/restart/new-Agent/no-duplicate contract |

Header ablation evidence (2026-09-17): removed the repeated shared-workspace Agent avatar/name/handle/environment block and hid the single-Agent desktop sidebar row while retaining the multi-Agent portfolio switcher, mobile switcher, context-inspector access, Activity environment truth, and connection/settings recovery surfaces. The responsive navigation regression was updated to assert the surviving context action. No protected capability or authority boundary changed.

Schedule scan ablation evidence (2026-09-18): defaulted Tasks to the current local day and removed automatic opening of the first blocked Assignment inspector. AUT-004 truthful Calendar projection, UX-005 scoped intervention, and UX-003 environment/recovery truth remain available through the visible item, filters, Calendar mode, and explicit `assignmentId` deep link. Live Chromium verification on the requested Presence showed 2 current responsibilities instead of 12 open items plus an unsolicited inspector; the deep-linked blocked Assignment still exposed readiness, failure, and guidance controls. No runtime state or authority capability was deleted.

Latest integrated Sandbox evidence (2026-09-17): the real CLI-launched
mandatory trajectory began with zero user Assignments, materialized one
Agent-owned Sandbox responsibility, ran for 10,080 virtual minutes, recorded
seven autonomous wakes, four measured executions, natural user correction, a
scoped `planIntervention`, and no live-environment execution. This strengthens
SBX-001, SBX-003, SBX-005, SBX-007, SBX-008, SBX-009, EVAL-001, UX-001, and
UX-005. The canonical runtime matrix passed at 1x/24x/96x, and the independent
verifier passed hidden-truth release, reset/session isolation, retry/cancellation
races, cross-process replay invariants, and production-escape checks on exact
immutable candidate `0f237e3`. These close the corresponding proof gates;
remaining promotion blockers are recorded in the closure manifest rather than
being inferred from component tests alone.

## Final release-candidate reassessment — 2026-09-17

Immutable candidate `14d33a4e460942b21fa13f8056804770efea2b56` passed the
canonical public seven-day trajectory, the independent replay/cross-rate/
hidden-truth/isolation verifier (8 files / 89 tests), the full suite (130 files
/ 1,214 tests), lint, build, and typecheck. A single broad-suite regression in
operator-shared link observation was preserved and repaired before this final
candidate; no other release-health defect remained.

No `PARTIAL` capability is promoted by this checkpoint. Existing evidence is
reused for all already-`PROVEN` rows. Remaining rows retain exact gates for
dependent-work reconsideration and projection coherence, autonomous
milestone/interruption review, complete causal-cone reconstruction,
goal-attributed learning review, action-faithful runtime ablation,
autonomous stale-pattern retirement, relevant-media learning, adversarial
natural-supervision review, and legacy-migration capability ablation. Replay
closure is complete; do not add replay-specific hardening without a new
material defect.

## Supervisory intervention delta — 2026-09-17

Commit `9918bcd` closes a product-architecture mismatch in `AUT-004`,
`AUT-006`, and `UX-005`: supervisory cancel now removes one future
Agent-owned publishing window and creates a coherent successor plan while
keeping the continuous publishing responsibility active. The explicit
whole-responsibility `cancelAssignment` primitive remains available for a true
shutdown. Focused runtime evidence: `tests/publishing-plan.test.ts` plus
`tests/runtime.test.ts`, 185 tests passed. The rows remain `PARTIAL` because
the full composed trajectory still needs dependent-work reconsideration and
projection coherence after mutation/reload; this is not promoted from the
focused proof alone.

## Final release-candidate reassessment — 2026-09-17

Immutable candidate `567cae2c52218dda2771762ffbd3a803fdc2973c` passed the
canonical public seven-day Sandbox trajectory, the exact-candidate independent
verifier (8 files / 90 tests, including cross-process replay and cross-rate
verification), and final broad release health (lint 0 errors / existing
warnings, production build, typecheck, and 130 files / 1,215 tests). The
candidate-bound evidence is recorded in
`qa-learnings/release-candidate-567cae2-2026-09-17.md`.

No `PARTIAL` capability is promoted by this checkpoint. Existing passing
evidence is reused, and the explicit gaps remain: dependent-work
reconsideration and Calendar reload coherence; complete causal-cone
reconstruction; autonomous milestone/interruption threshold verification;
goal-attributed learning audit; action-faithful ablation; stale-pattern
retirement; relevant-media learning; adversarial natural-supervision review;
and independent legacy-migration ablation. Replay closure remains complete;
no replay-specific hardening is justified without a new material defect.

## Natural-supervision reassessment — 2026-09-17

The current candidate also passed
`tests/e2e/natural-supervision-seven-day.spec.ts`: seven realistic supervisory
turns, 10,080 virtual minutes, one Agent-owned responsibility, five verified
Sandbox outcomes, deliberate silence for weak or untrusted evidence, one
deduplicated `strategy_change` Agent-initiated update, durable preference
evidence, and no live actions. The clean run removes the prior stale-lineage
warning from the builder evidence, but does not itself satisfy the remaining
independent adversarial threshold review or complete causal-provenance gate;
`AUT-010`, `EVAL-005`, and `UX-004` remain `PARTIAL`.

## Update protocol

## Immutable candidate reassessment — `bc735ab` — 2026-09-17

The frozen candidate `bc735ab0648e34b9118900e3b2eea81c5cceac8d` passed the
canonical composed seven-day public Sandbox trajectory, the exact-candidate
independent verifier (8 files / 90 tests, including cross-process replay and
cross-rate verification), and final release health (lint with zero errors,
typecheck, production build, and 130 files / 1,216 tests). Evidence is
recorded in `qa-learnings/release-candidate-bc735ab-2026-09-17.md`.

This delta reuses all prior passing evidence and validates the new fork-local
strategy attribution and goal-anchored Sandbox outcome provenance in the
composed system. No additional capability is promoted by this checkpoint:
the remaining PARTIAL rows retain their exact gates for independent
research/delivery, complete causal-cone reconstruction, autonomous
milestone/interruption-threshold review, goal-attributed learning and future
allocation difference, action-faithful ablation, stale-pattern retirement,
relevant-media learning, adversarial natural-supervision review, and
independent legacy-migration ablation. Replay closure remains complete.

## Sandbox learning materialization delta — 2026-09-17

The shared strategy/runtime path now materializes a low-confidence,
session-scoped hypothesis after two distinct verified Sandbox decisions use
the same known strategy pattern. The hypothesis is linked to the verified
`WORLD_OUTCOME` evidence and is consumed by later retrieval through the
bounded learning adjustment path. Focused proof: 2 files / 59 tests passed in
`tests/learning-counterfactual.test.ts` and `tests/sandbox.test.ts`, with
typecheck, changed-file lint, and diff checks passing. Durable evidence is in
`qa-learnings/sandbox-learning-materialization-2026-09-17.md`.

This strengthens LEARN-001 and LEARN-002 but does not promote them. The
remaining proof gaps are still material: a persisted full-trajectory learning
audit; action-faithful like/repost/quote/follow and other Assignment-family
verification; confidence decrease, contradictory evidence, stale-pattern
retirement, and independent learning-adversary review; and relevant-media
learning.

The implementation commit `e4cc6de` then passed the real canonical public
seven-day trajectory, the independent verifier (8 files / 90 tests), and the
broad suite (130 files / 1,217 tests). This integration result is recorded in
`qa-learnings/sandbox-learning-materialization-integration-2026-09-17.md`.

The performance boundary was then tightened: delivery-only outcomes no longer
create decision-relevant learning. Sandbox publication metrics now create
session-scoped causal `WORLD_OUTCOME` evidence through the public metric
operation, and two independent measured outcomes can feed later retrieval.
Focused proof: 2 files / 60 tests passed, with typecheck, changed-file lint,
and diff checks passing. Evidence: `qa-learnings/sandbox-performance-learning-2026-09-17.md`.
This strengthens LEARN-001/002 but leaves their deeper proof gates open.

On the same implementation commit `0aee4ec`, the canonical public trajectory
passed and the independent verifier passed 8 files / 91 tests. The public
metric regression and focused learning/Sandbox suite passed 2 files / 60
tests. Evidence is in
`qa-learnings/sandbox-performance-learning-integration-2026-09-17.md`.
Broad release health remains a separate future candidate gate.

The Sandbox learning path now also reconciles measured alternatives. A pattern
that trails a comparable alternative by at least 25% across two independent
metric-backed decisions retains its history but becomes `weakened` with low
confidence and contributes no decision-relevant adjustment; three distinct
contradictions produce `disfavored`, and four produce `retired`. Focused proof: 2 files / 62 tests passed,
with typecheck, changed-file lint, and diff checks passing. Evidence:
`qa-learnings/sandbox-contradictory-learning-2026-09-17.md`. This strengthens
LEARN-003 but does not promote it: independent adversarial learning review
remains required.

The natural-supervision trajectory was also rerun on `e4cc6de` and passed:
seven realistic turns, 10,080 virtual minutes, five verified Sandbox
outcomes, one deduplicated `strategy_change` update, durable correction
evidence, and no live actions. Evidence is in
`qa-learnings/natural-supervision-recheck-e4cc6de-2026-09-17.md`. This does
not promote `EVAL-005`, `AUT-010`, or `UX-004`; independent adversarial
threshold review remains required.

Latest integrated Sandbox evidence (2026-09-16): the real CLI-launched
mandatory trajectory began with zero user Assignments, materialized one
session-scoped Agent-owned Sandbox responsibility, ran for 10,080 virtual
minutes, recorded seven autonomous wakes, four measured executions, a natural
user correction, a scoped `planIntervention`, and no live-environment
execution. This strengthens SBX-001, SBX-005, SBX-008, SBX-009, EVAL-001,
UX-001, and UX-005 but does not upgrade them because independent replay,
hidden-truth, isolation, and complete causal reconstruction evidence remain
incomplete.

Final release-candidate delta: immutable candidate `e5ccc10` passed the
canonical composed seven-day public trajectory, detached independent replay /
cross-rate / hidden-truth / isolation verification (8 files / 88 tests),
detached natural-supervision Chromium, and final lint, build, typecheck, and
full-suite health. The bundle is recorded in
`qa-learnings/release-candidate-e5ccc10-2026-09-17.md`. `AUT-005` is the only
new promotion from this delta; every other PARTIAL row retains its exact
missing proof gate.

After every meaningful implementation or verification cycle, update affected
rows with the command/scenario and durable evidence path. Mark `REGRESSED`
explicitly when previously supported behavior fails. The next development slice
should target the highest-impact `UNPROVEN`, `PARTIAL`, `REGRESSED`, or
`BLOCKED` capability.

Final audit question:

> What important behavior do we currently assume works without having actually
> proven it?

## Current candidate reassessment — `c02d7c2` — 2026-09-17

The focused Slice A closure passed independently on the current candidate:
the verifier-owned native external-side-effect oracle observed one request and
one receipt after in-flight authority revocation, and the public causal
verifier resolved typed permission and retry-backoff cancellation edges. The
source change and hard pass/fail oracle are recorded in
`qa-learnings/release-candidate-c02d7c2-2026-09-17.md`.

The existing Slice B ablations passed 4 files / 38 tests, the clean Slice C
responsive run passed 8/8 across desktop/mobile, all three composed public
trajectories passed, and exact-candidate release health passed (typecheck,
lint with 0 errors / 157 existing warnings, production build, and 132 files /
1,236 tests). The contaminated responsive fixture and missing-release-fixture
setup failures remain preserved.

No `PARTIAL` row is promoted from this checkpoint. LEARN-002/003/004 still
lack independent public ablation evidence; SIM-001 lacks an exact-candidate
independent migration ablation; SBX-008 still lacks one independently
reconstructed complete composed causal cone; and the remaining AUT/EVAL/UX
rows retain their named independent adversarial gates. SBX-004's focused native
oracle is closed, but its declared canonical composed native retry-backoff
race gate remains explicit. Replay-specific hardening remains closed absent a
new material defect.

## Current candidate reassessment — `33cec2f` — 2026-09-17

Candidate-bound Slice A safety/causal checks passed, including the external
native in-flight authority oracle and independent causal trace. The independent
verifier passed 9 files / 92 tests, including cross-process replay, cross-rate,
hidden-truth/session isolation, retry/idempotency, production-boundary, and
process-boundary checks. Existing replay evidence is reused; no replay
hardening was reopened.

Slice B passed 4 files / 39 tests and Slice C responsive/UI passed 8/8 on the
exact candidate. The canonical composed seven-day/no-babysitting, natural
supervision, and media-truth run passed 3/3. The public learning verifier now
creates a durable supported hypothesis, but its continued trajectory still has
no later allocation difference; LEARN-002/003/004 remain PARTIAL pending the
independent public ablations.

Typecheck, lint (0 errors / 157 warnings), production build, diff checks, and
broad Vitest (132 files / 1,237 tests) passed on the exact candidate after
restoring its canonical runtime manifest/database fixture. The initial
fixture-provisioning failure is preserved at
`/tmp/openpresence-candidate-33cec2f-release-vitest.log`; the valid clean
result is at `/tmp/openpresence-candidate-33cec2f-release-vitest-clean.log`.
No PARTIAL row is promoted. Remaining exact gates are recorded in
`qa-learnings/release-candidate-33cec2f-2026-09-17.md`, including clean broad
release health, public learning transfer/retirement/media ablations, exact
candidate legacy migration, and independent composed/adversarial review for
the affected rows.

## Current candidate reassessment — `9df4085` — 2026-09-17

The runtime now carries the actual allowed action surface into Sandbox learning
counterfactuals, closing the prior selected-act-only implementation defect.
The exact candidate passed its focused regression (65 tests), composed public
three-slice certification (3/3), independent replay/cross-rate/safety verifier
(9 files / 92 tests), independent causal trace (1/1), and release health:
typecheck, lint with 0 errors / 157 warnings, production build, broad Vitest
(132 files / 1,238 tests), and diff checks.

No PARTIAL row is promoted. Public learning now has a real action surface.
An independent public transfer run on this exact candidate also passed: session
`session_g1lsh4xl` produced two independent measured decisions, and a later
benchmark-like decision reported `learningClaim.status=demonstrated`,
`presentVsRemoved.decisionsDiffer=true`, and `scoreDelta=0.28125`. The artifact
is `/tmp/openpresence-candidate-9df4085/data/public-learning-transfer.db`.
This satisfies the independent public later-allocation/transfer sub-gate for
LEARN-002, but does not promote it; the full LEARN-002/003/004 ablation gates
remain open. Exact
candidate legacy migration and the named autonomy/interruption/complete-causal
cone independent reviews also remain open. Evidence is recorded in
`qa-learnings/release-candidate-9df4085-2026-09-17.md`.

The candidate-bound public learning attempt used only the Playground/API
surface and preserved its run at
`/tmp/openpresence-candidate-9df4085/data/public-learning-final.db`. It
observed one accepted measured action but not the second independent action
needed for a durable transfer hypothesis; LEARN-002/003/004 remain PARTIAL.

## Current candidate reassessment — `9baca92` — 2026-09-17

Candidate `9baca92` adds only the closure-enabling native external-oracle
backoff-cancellation proof. Its oracle passed 2/2: one in-flight revocation
produced one verified external request, while cancellation during retry
backoff produced zero requests before and after cancellation. The candidate
also passed the composed public slices 3/3, independent verifier 9 files / 93
tests, independent public causal verifier 1/1, typecheck, lint with 0 errors /
157 pre-existing warnings, production build, and broad Vitest (132 files /
1,239 tests). Full evidence is in
`qa-learnings/release-candidate-9baca92-2026-09-17.md`.

No PARTIAL row is promoted. SBX-004's focused oracle gate is satisfied, but the
stronger integrated native retry-backoff trajectory and complete independent
causal-cone gate remain open. LEARN-002's independent transfer sub-gate is
satisfied (`decisionsDiffer=true`, `scoreDelta=0.28125`), while its full
action-family/causal contract remains open. LEARN-003/004, SIM-001, and the
remaining autonomy/interruption/causal-cone reviews retain their explicit
gates. The migration evidence remains source-equivalent support, not a fresh
candidate-bound run.

The independent causal-cone audit for `9baca92` consumed the public trace and
passed after correcting the verifier's `eventId` normalization: 1 session / 24
entries, with permission→intent, execution→permission, result/outcome→execution,
and retry→temporal-event links all resolved. The initial false failure and its
correction are preserved in
`qa-learnings/independent-causal-cone-9baca92-2026-09-17.md`. This is stronger
support for SBX-008/EVAL-004, but not the complete composed trajectory proof,
so neither row is promoted.

## Corrected steering follow-up — Slice B/C — `9baca92` — 2026-09-17

The existing Slice B matrix passed on the isolated immutable candidate: 4 files
/ 40 tests (`learning-counterfactual`, multi-rate trajectory, asset
intelligence, and media authorization). The existing Slice C legacy/runtime
matrix passed 4 files / 251 tests, and the candidate-bound public responsive
workspace check passed 4/4. Evidence and the invalid concurrent shared-DB
harness attempt are recorded in
`qa-learnings/slice-b-c-9baca92-2026-09-17.md`.

These are reused/strengthened focused gates only. No PARTIAL row is promoted:
LEARN-002/003/004 still require independent composed transfer/retirement/media
choice proof, and SIM-001 still requires an independent candidate-bound legacy
migration ablation. SBX-004 still requires the stronger integrated native
in-flight/backoff race evidence; SBX-008/EVAL-004 still require complete
independent reconstruction/causal-cone proof. No source changed, so release
health was not rerun.

The candidate was then serially revalidated for Slice A: the native external
oracle passed 1 file / 2 tests, and a fresh public independent causal verifier
passed 1/1 with permission, execution, result/outcome, and retry temporal-parent
checks. This closes the focused Slice A revalidation without promoting SBX-004,
SBX-008, or EVAL-004: the broader composed/native and complete causal-cone
contracts remain unmet.

An independent public learning attempt then created a fresh Agent-owned Sandbox
responsibility and materialized a session-scoped supported hypothesis from four
measured outcomes, but could not produce the required retained-vs-removed
checkpoint/fork ablation: public `reviewGrowth` rejected the clean session and
the automatic counterfactuals all remained `not_demonstrated`. The verifier
found no public operation for the altered-learning branch with identical future
inputs. The result is preserved as an inconclusive proof-boundary artifact in
`qa-learnings/independent-public-learning-ablation-9baca92-2026-09-17.md`; the
LEARN-002/003/004 rows remain PARTIAL.

## Autonomous learning lineage audit — `e6b9f22` — 2026-09-17

The live original-publication audit found a concrete decision → intent gap:
the runtime compiled `socialStrategy` for autonomous launch and Publishing
Assignment decisions but dropped it when forming the durable Social Decision.
`e6b9f22` propagates that lineage through the live launch and Publishing
Assignment paths and records the structured launch decision immediately before
intent formation. The focused real route regression passed 1/1, and the
related X/Publishing Plan regression passed 67/67. Full details are in
`qa-learnings/autonomous-learning-lineage-e6b9f22-2026-09-17.md`.

This is a boundary repair, not learning proof. No capability is promoted. A
real-model, isolated public-runtime canary still must prove pattern/template
selection, grounded traceable variation, publication/result/learning lineage,
later decision transfer, and a retained-vs-removed independent counterfactual.
## 2026-09-17 autonomous learning canary delta (candidate e6b9f22)

- Preserved failed public real-model canary runs in `qa-learnings/autonomous-learning-canary-e6b9f22-2026-09-17.md`.
- Runtime artifact localized the first failure to `consideration → strategy/template decision`: the original-post decision had a strategy retrieval run but no selected pattern/template and no explicit exploration reason. The prior decision → intent propagation repair remains valid.
- Added validation for autonomous original-post cognition so learned use versus novel exploration is explicit; no template is forced.
- Real-model public Sandbox partial run completed with OpenAI `gpt-5.6-luna` low, auto execution, simulated delivery, and a strategy learning update, but it did not include the full composed learning canary (own weak post, delayed measurement, transfer/retirement/media ablations, or independent counterfactual). No status changed to PROVEN.
- Next single highest-impact gate: rerun the real public-runtime canary on the repaired candidate and complete the causal learning lineage through measurement, disposition, later decision, and learned-artifact-removed counterfactual.

Run 4 on candidate `360e75f` completed the same real-model public Sandbox scenario with durable original-post exploration lineage. The persisted chain was verified as `SocialDecision → SocialIntent → Publication → Execution → succeeded Outcome`, including generated text, rationale, and `noStrategyReason`; no live side effect was possible. This closes attribution for the exercised exploration path, but does not prove learned-template transfer, measured keep/modify/retire disposition, media-choice learning, or an independent retained-vs-removed counterfactual. No capability status changed.

## 2026-09-17 autonomous learning canary delta — source-backed extraction

The runtime audit found that autonomous Sandbox cognition had no path from a
measured external post to a reusable learning artifact. The smallest repair
reused the existing Growth hypothesis/template model, kept extracted artifacts
session-scoped and `testing`, and preserved source mirror IDs in retrieval and
decision lineage. The public experiment harness now supports a metric step and
an explicit real-model original-publication follow-up.

Run 5 (`qa-learnings/autonomous-learning-canary-e6b9f22-2026-09-17.md`) failed
at the second scheduling boundary: extraction occurred, but the same cycle
stopped before a subsequent original decision. Run 6 (`rerun13`) completed the
real OpenAI public Sandbox path and produced a concrete, non-copied original
variation with the source observation retained in retrieval lineage. The model
truthfully classified that act as exploration rather than selecting the supplied
template/hypothesis. Existing measurement reconciliation weakened the
unproven artifact; no independent retained-vs-removed transfer was run.

No capability is promoted. LEARN-002/003/004, AUT-001, EVAL-004/005, and UX-004
remain PARTIAL. The next single highest-impact gate is an independent composed
canary that requires selected learned-artifact lineage when applicable, records
the measured keep/modify/retire disposition, and proves a later decision differs
when that artifact is removed, with the causal cone independently reconstructed.

Run 7 on the current candidate `ff03a5c` is the first real-model public Sandbox
run to select a learned hypothesis for a later original post. It preserved the
source mirror ID, selected `social.x.v1.proof-led-original` with its mechanism,
persisted an experiment ID, learning objective, variation specification, and
generated-content hash, and delivered a distinct denominator/cohort variation
inside Sandbox. This is valid partial evidence for the strategy-to-intent and
generation lineage, not a promotion: measured disposition, later transfer, and
independent learned-artifact-removed counterfactual gates remain open.

Run 8 exercised the post-extraction state handoff and explicit selected-template
validator on the rebuilt real OpenAI public Sandbox path. The validator rejected
the run because the model did not preserve the selected source-backed template
and learning-hypothesis IDs. The failed-run database is preserved at
`/tmp/openpresence-learning-canary-real-ff03a5c-rerun21.db`, with the exact
failure recorded in the canary evidence document. This is a protected failure,
not a promotion. The runtime handoff, per-act learning ID projection, and
validator are covered by the focused 125/125 suite and successful production
build; the real-model selected-template behavior, measured disposition, later
transfer, and independent removed-artifact counterfactual remain PARTIAL.

Next single highest-impact gate: produce one truthful real-model source-backed
original that satisfies the selected-template contract, then measure its outcome
and independently prove retained-versus-removed later decision transfer. Do not
promote LEARN-002/003/004, AUT-001, EVAL-004/005, or UX-004 from this evidence.

## 2026-09-17 autonomous learning canary delta — measured lineage boundary

The first unresolved runtime defect was the missing durable link from a
measured publication outcome to the exact selected Growth hypothesis/template.
The decision already retained the hypothesis ID, but the generated
`WORLD_OUTCOME` evidence only retained decision and mirror references. That
made later review attribution depend on re-deriving selection from mutable
decision shape and left source-backed templates invisible to the measured
learning boundary.

The smallest repair adds `learningHypothesisIds` to `GrowthEvidenceRecord`,
populates it from the causal decision at Sandbox delivery and publication
metric recording, and lets evidence-backed attribution recognize that exact
ID. `materializeSandboxOutcomeLearning` records the outcome against the
session-scoped hypothesis but deliberately leaves it `testing`; only a
validated Growth Review action can produce keep/modify/retire state.

Focused proof after the repair:

- `pnpm exec vitest run tests/ai.test.ts tests/sandbox.test.ts tests/learning-counterfactual.test.ts tests/social-strategy.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=dot` → 134/134 passed.
- `pnpm build` → passed; only pre-existing lint warnings remained.
- Public real-model command, OpenAI `gpt-5.6-luna` low, all action affordances
  auto, isolated Sandbox: `/tmp/openpresence-learning-canary-real-1789684665-repaired.json`
  with DB `/tmp/openpresence-learning-canary-real-1789684665-repaired.db`.

The repaired canary selected the session template, generated a distinct
grounded denominator/cohort variation, delivered it through the public
runtime, recorded the external metric, and preserved the same hypothesis ID
on both the Sandbox outcome and publication metric evidence. The exact
artifact remains `testing` with supporting evidence attached and no model
keep/modify/retire disposition, so this is valid partial evidence only.

Existing failed evidence remains preserved, including the selected-template
validator failure in `/tmp/openpresence-learning-canary-real-ff03a5c-rerun21.db`
and the prior long trajectory Run 23. No capability is promoted. LEARN-002,
LEARN-003, LEARN-004, AUT-001, EVAL-004, EVAL-005, and UX-004 remain PARTIAL.

The next single highest-impact gate is the existing measured disposition and
retained-vs-removed independent counterfactual: obtain a real Growth Review
action for this exact hypothesis, then prove a later autonomous decision
changes for that artifact and differs in an independently run artifact-removed
counterfactual. Do not infer that gate from the new evidence linkage alone.

## 2026-09-17 autonomous learning canary delta — disposition attribution

The next real-model public rerun used the existing `reviewGrowth` operation
through the scenario harness after two measured source-backed variations. It
completed on the rebuilt route and recorded a model Growth Review that marked
the exact session template `disfavored`. The hypothesis retained two
publication metrics and the verified Sandbox outcome as supporting evidence;
its final status was not inferred from delivery or UI text.

Evidence:

- JSON: `/tmp/openpresence-learning-canary-real-1789685322-direct-attribution.json`
- DB: `/tmp/openpresence-learning-canary-real-1789685322-direct-attribution.db`
- Model: OpenAI `gpt-5.6-luna`, low reasoning; all executable affordances auto;
  Sandbox-only delivery.
- Focused suite after the attribution repair: 135/135 passed.
- Production build passed with only existing lint warnings.

The direct-attribution guard and template `original_post` decision target are
now implemented. This closes the measured evidence → review-disposition
boundary for a negative result, but it does not prove positive transfer: the
observed artifact was disfavored, so it must not influence later allocation.
LEARN-002, LEARN-003, LEARN-004, AUT-001, EVAL-004, EVAL-005, and UX-004 remain
PARTIAL. The next gate is a positive, independently reconstructed
retained-versus-removed counterfactual on a supported artifact; do not promote
from the disfavored run.

## 2026-09-17 autonomous learning canary delta — positive-signal attempt

The public scenario was rerun with an explicit Sandbox audience observation of
12 followers (+7 over the preserved baseline), in addition to two measured
source-backed variations. The model Growth Review still left the extracted
template `testing`: it recognized the follower increase and high surface reach,
but no verified qualified conversation or author response was present.

Evidence: `/tmp/openpresence-learning-canary-real-1789685862-positive-signal.json`
and `/tmp/openpresence-learning-canary-real-1789685862-positive-signal.db`.
Projected counterfactuals were present but unchanged (`decisionsDiffer=false`,
`scoresDiffer=false`), so no transfer claim was made. This is protected
negative evidence; LEARN-002/003/004 and dependent capabilities remain
PARTIAL pending a supported artifact and independent retained-vs-removed
transfer.

## 2026-09-18 autonomous learning canary delta — qualified-response attempt

The public canary added a realistic external reply to the generated original
and allowed the Agent to judge it through the normal autonomous path; metric
recording explicitly targeted the latest own post. The real-model run
completed with a durable `weakened` disposition for the session template, but
did not reach `supported`, and all projected present-vs-removed
counterfactuals remained unchanged.

Evidence:

- JSON: `/tmp/openpresence-learning-canary-real-1789690340-qualified-reply.json`
- DB: `/tmp/openpresence-learning-canary-real-1789690340-qualified-reply.db`
- Model: OpenAI `gpt-5.6-luna`, low reasoning; Sandbox-only execution.

This is protected negative evidence. The runtime proves measured lineage and
disposition for testing artifacts, including weakening; it does not prove
that a supported learned artifact changes a later autonomous decision.
LEARN-002/003/004 and dependent rows remain PARTIAL. The next gate is still a
positive supported-artifact run followed by an independently reconstructed
retained-vs-removed counterfactual.

## 2026-09-18 autonomous learning canary delta — session-scoped Sandbox review

The public canary exposed one additional runtime boundary. The real Agent
created a substantive reply to an external question, and the scenario then
provided a second external response to that Agent reply. The causal mirror
chain was present, but `deriveGrowthEvidenceSnapshot` excluded Sandbox mirror
objects from Growth Review, so the review could not observe the qualified
conversation it had just produced.

The smallest repair adds an optional session-scoped Sandbox evidence path to
the existing Growth snapshot/review primitives. Sandbox audience snapshots
now retain their session ID; the public `reviewGrowth` operation can request
that session's mirrors, executions, publication metrics, and audience evidence.
The live path remains fail-closed against Sandbox data, and the existing live
snapshot behavior remains unchanged.

Evidence:

- The initial post-repair invocation against an empty database failed before
  scenario start with `No active Presence is available for the experiment`;
  it was preserved as a failed invocation and not treated as canary evidence.
- Focused runtime proof after the regression fix: 112/112 tests passed across
  `growth-runtime`, `social-strategy`, `learning-counterfactual`, and
  `sandbox` suites.
- `pnpm build` passed with only the existing lint warnings.
- Real public OpenAI run, GPT-5.6 Luna Low, all executable affordances auto,
  Sandbox-only: `/tmp/openpresence-learning-canary-real-1789691200-qualified-chain-repaired.json`
  using `/tmp/openpresence-learning-canary-real-1789690617-question-reply.db`.

The run preserved source-backed hypothesis lineage on the generated original,
generated a distinct denominator variation, produced an Agent reply and a
second external response to that reply, and recorded two publication metrics.
The exact session artifact remained `testing`; the model review did not produce
a positive supported disposition, and all projected retained-vs-removed
comparisons remained `decisionsDiffer=false`, `scoresDiffer=false`, with
`not_demonstrated` claims. Existing older-session review records in the reused
database remain historical evidence and were not used to promote the current
session.

This closes the Sandbox review-observability boundary but does not close the
learning canary. LEARN-002/003/004, AUT-001, EVAL-004, EVAL-005, and UX-004
remain PARTIAL. No capability is promoted. The next single highest-impact gate
is still a truthful positive disposition followed by an independently
reconstructed later decision that differs when the learned artifact is
removed.

## 2026-09-18 autonomous review wiring delta

The session-scoped evidence repair is now threaded through the actual
autonomous Sandbox review path, not only the explicit public review operation.
`advanceSandboxTime` passes the session ID into review eligibility and the
model-backed Growth Review worker; the worker derives the same session-scoped
snapshot, limits hypotheses to that Sandbox session, and persists the session
scope on the review operation. The public harness also attaches the session ID
to audience observations.

Validation:

- Focused suite: 112/112 passed.
- `pnpm build`: passed; only pre-existing lint warnings.
- A follow-up real-model invocation was attempted against the preserved
  configured canary database, but the scenario stopped before measurement with
  `OpenPresence rejected invalid state mutation mirrorObjectId: Required`.
  The cause is the scenario's first own-post resolver: this historically active
  account correctly chose no original during its initial pulse, leaving no own
  post to measure. The failed invocation is preserved in the terminal output;
  it is not certification evidence and no claim is made from it.

The prior completed real-model artifact remains the authoritative canary
evidence for this checkpoint. It proves source-backed selection, durable
lineage, distinct generated variation, and the two-turn response chain, but not
positive supported learning or retained-vs-removed transfer. All affected
capabilities remain PARTIAL.

## 2026-09-18 autonomous learning canary fixture guard (candidate c3df669)

The public real-model fixture now measures the first own publication immediately
after the real autonomous Sandbox pulse, then requires a second and third own
publication before measuring the learned and follow-up variations. A missing
publication is now an explicit failed-run precondition rather than an ambiguous
`mirrorObjectId: Required` mutation or accidental remeasurement of an older
post. The guard is implemented in
`scripts/run-social-experiment-in-process.mjs` and exercised by
`scenarios/learning-canary-public-real-model.json`.

Evidence preserved in `qa-learnings/autonomous-learning-canary-fixture-2026-09-17.md`:

- the earlier fixture failures that exposed the ambiguous resolver;
- a clean fresh-Presence attempt through the real autonomous path;
- the resulting OpenAI model-quota block (`Openai has no model API quota available`).

No learning criteria were weakened, no `supported` disposition was obtained,
and no capability was promoted. LEARN-002/003/004, AUT-001, EVAL-004,
EVAL-005, and UX-004 remain PARTIAL. The next gate is an actual real-model run
passing all own-publication guards, producing a genuine `supported`
disposition, and demonstrating a later decision difference when the learned
artifact is removed, followed by independent verification.

## 2026-09-18 autonomous learning canary — measured source extraction, no transfer

The public canary is now provider-selectable while retaining OpenAI/GPT-5.6
Luna as its default. A configured non-mock Ollama cloud model was used only to
exercise the same public Sandbox/runtime path; deterministic and AI-mock modes
remain prohibited. The fixture activates the Presence-owned publishing
responsibility, records a measurable own first post, records measured evidence
on the actual external source post, and runs later decisions through autonomous
pulses after a quiet period.

The real run produced a session-scoped observed-post hypothesis with a concrete
template and source mirror ID. The Agent then chose silence for the later
original because the current world and recent publications did not justify
another post. The first failing transition is later autonomous original
selection: no measured variation was formed, so no `supported` disposition or
retained-vs-removed counterfactual exists.

Evidence: `/tmp/openpresence-learning-canary-ollama8.stderr` and the preserved
earlier Ollama artifacts referenced in
`qa-learnings/autonomous-learning-canary-fixture-2026-09-17.md`.

No capability is promoted. LEARN-002/003/004, AUT-001, EVAL-004, EVAL-005,
and UX-004 remain PARTIAL. Independent verification remains deferred until the
strict composed canary obtains a genuine supported disposition and a later
decision difference when the learned artifact is removed.

## 2026-09-18 consideration-to-decision and review-owner repair

The autonomous Sandbox path now passes a session-scoped observed-post template
into the same planner used for original cognition; previously, the durable
hypothesis was persisted but only explicit rehearsal attached it as
`strategyContext`. The public Growth Review route also accepts the active
Agent-owned publishing responsibility, so a fresh autonomous Presence does not
require a user-created follower Assignment to review publication evidence.

Focused evidence after the planner repair: 112/112 tests passed and production
build passed. A fresh real-model rerun reached the provider boundary but Ollama
reported temporary capacity exhaustion (`/tmp/openpresence-learning-canary-ollama10.stderr`),
so the repaired canary has not yet established supported transfer. No status
changed and no capability is promoted.

The next retry reproduced the same pre-cognition capacity failure
(`/tmp/openpresence-learning-canary-ollama11.stderr`). It is preserved as
infrastructure evidence and does not alter the capability verdict.

## 2026-09-18 alternate non-mock model canary failure

The remaining configured non-mock Ollama cloud model, `kimi-k2.6:cloud`, was
run through the same public autonomous canary. The strict first-own-post
precondition failed with zero measurable own posts
(`/tmp/openpresence-learning-canary-ollama-k26b.stderr`). No source metric,
`supported` disposition, retained-vs-removed counterfactual, or independent
verification was claimed. The learning criteria remain unchanged and
LEARN-002/003/004, AUT-001, EVAL-004, EVAL-005, and UX-004 remain PARTIAL.

The canary harness was repaired to persist partial steps, provider events, and
the failure object before rethrowing. A fresh `kimi-k3:cloud` run exercised
that path and produced a complete failed artifact with session start followed
by `Ollama is temporarily at capacity` and zero own posts:
`/tmp/openpresence-learning-canary-ollama-k3-current.json`. This improves
failed-run observability only; it does not satisfy the public learning canary,
and no capability is promoted.

## 2026-09-18 real autonomous learning canary — supported artifact and positive counterfactual

The older named OpenAI artifact `/tmp/openpresence-learning-canary-openai-current.json`
was audited first. Its earliest missing transition was consideration -> explicit
strategy/learning selection for the second original post: the decision had no
selected hypothesis/template or source observation and truthfully declared
novel exploration. Its `testing` hypothesis was not treated as supported, and
the failed two-post artifact remains preserved.

The minimal repair kept the existing Agent-owned runtime lifecycle: normal
publishing-window recovery now carries selected source-backed strategy context
when an initial autonomous planner pass returns `no_op`; the fixture adds
ordinary autonomous opportunities for measurement and replanning; and the
counterfactual oracle canonicalizes runtime `post` as `original_post`.
Focused tests passed 112/112 and the production build passed. No manual
Assignment or forced publication/disposition was added.

The composed real OpenAI public-runtime run passed at
`/tmp/openpresence-learning-canary-final7.json` using GPT-5.6 Luna low,
auto execution, a fresh Agent-owned Sandbox Presence, and simulated X delivery.
It produced eight source-attributed template-guided variations, a genuine
`supported` outcome with two measured evidence IDs, and four demonstrated
retained-vs-removed counterfactuals whose selected strategy changed. A
separate artifact verifier reproduced those pass/fail checks. This is strong
positive learning evidence, but not yet full capability proof: exact-candidate
independent adversarial verification, complete causal-cone review, and release
health remain open. LEARN-002/003/004, AUT-001, EVAL-004, EVAL-005, and UX-004
remain PARTIAL; no capability moved to PROVEN.

## 2026-09-18 candidate `4183c69` release-health checkpoint

The release-health correction was limited to the intentionally skipped legacy
X-connection E2E test: its `test.skip` call now uses the typed overload and its
obsolete `navigation` reference now uses the existing `page` fixture. Related
Activity assertions were updated only to ignore the seeded initial Presence
message while preserving operator, assignment, and decision-message
invariants.

Exact-candidate health evidence on `4183c692fa670d1daec3e3180a14f83efdfbf58e`:

- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 errors and 161 pre-existing warnings.
- `pnpm build` passed.
- `pnpm test -- --reporter=dot --no-file-parallelism --maxWorkers=1 --minWorkers=1` passed: 132 files / 1,247 tests.
- `tests/activity-now.test.ts` passed independently: 40/40.

The sealed learning artifact still has builder-independent structural checks
for eight learned variations, two measured support records, and four positive
retained-vs-removed counterfactuals. A full independent public/adversarial
learning verifier has not returned a verdict for this exact candidate, so
LEARN-002/003/004, AUT-001, EVAL-004, EVAL-005, and UX-004 remain PARTIAL.
No capability is promoted from the artifact or release health alone.

The bounded independent public learning verifier is recorded in
`qa-learnings/independent-public-learning-verifier-2026-09-18.md`. It binds
the sealed artifact by SHA-256 and verifies that the autonomous runtime and
fixture files did not change between the canary-producing commit and the
release-health candidate. It returns PASS for the canary claim, but the
broader capability contracts still require their remaining adversarial and
composed gates; no row is promoted.

## 2026-09-18 Tasks simplification evidence

The Schedule/Tasks UI now defaults to the current local day, keeps the Agent-owned
publishing projection below current responsibilities, and removes the duplicate
Goals section from Tasks. Growth remains the canonical goal/evidence surface.
This is a presentation ablation only: Assignment records, schedule/calendar
views, deep links, readiness and recovery details, operator intervention, and
runtime authority are preserved. AUT-004, UX-003, and UX-005 remain in force;
the live route was checked after the change with two current responsibilities
visible and no unsolicited inspector.

Readiness-contract ablation evidence (2026-09-18): the persisted preflight
contract, checks, authority, timing, and verified-completion semantics remain;
only the default disclosure changed. Ready Assignments now show the readiness
result first and reveal contract detail on demand. Blocked or failed outcomes
remain visible in the inspector for recovery.

The exact candidate also passed the existing independent public safety checks:
`tests/native-inflight-external-oracle.test.ts` (2/2, including cancellation
during retry backoff with zero external requests) and
`tests/e2e/independent-causal-trace.spec.ts` (1/1, typed-parent reconstruction).
These strengthen SBX-004/SBX-008 evidence but do not substitute for the
remaining full composed learning verifier or promote the learning rows.

## 2026-09-21 bounded LEARN-002 public replay closure

The public checkpoint-fork prerequisite now passes through the running isolated
app: each deterministic retained/removed branch creates a new durable decision
and verified Sandbox execution. Repairs make mock candidates honor publication
history, scope strategy history/retrieval to the branch, preserve the retrieval
objective at persistence, and retain actual model invocation/run usage links.
No learning thresholds, scoring weights, or language prompts changed.

The real OpenAI Luna Medium source worker produced five verified publications
in six attempts. Independent reconstruction links all five to actual provider
requests. Only one chose a reusable pattern; four explicitly chose novel
exploration. The test stopped before metrics and real forks because no comparable
pattern-attributed pair existed. This is not evidence that learning has no effect.

`qa-learnings/learn002-public-closure-2026-09-21/packet.json` is **BLOCKED** for
full transfer; its public-worker subgate is PASS. Deterministic and real trajectories
are separately labelled, not composed into a real-learning claim. The mock branches
publish identical text despite different strategy attribution. Full hidden checkpoint
equivalence and observation-parent lineage remain unproven. LEARN-002/003/004 remain
PARTIAL. Next: establish the missing naturally qualifying pair through public
operation, then measure it and exercise the repaired fork path without forcing
attribution. See the adjacent `review.md` and `independent.json` for raw-record joins.

The packet binds execution candidate `1575b534c2781c1c978c908252272d37c61dae175effb3e2286ce8636c7c2cff`.
This ledger-only documentation update follows that frozen packet and does not
relabel either run with a newer candidate hash.
