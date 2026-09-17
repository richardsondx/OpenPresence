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

## Status vocabulary

Use only `UNPROVEN`, `PARTIAL`, `PROVEN`, `REGRESSED`, and `BLOCKED`.
`PROVEN` requires concrete evidence appropriate to the capability; code
presence, a prompt, or a passing unit test alone is not enough.

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
| AUT-010 | Agent can initiate a useful supervisory update without routine noise | Meaningful problems, opportunities, strategy changes, and breakthroughs reach the Presence-scoped conversation; routine receipts remain in Activity; retries dedupe | `lib/operator-initiated-communication.ts`, `lib/runtime.ts`, `tests/agent-initiated-communication.test.ts` (18 tests, including runtime-boundary integration), `tests/e2e/natural-supervision-seven-day.spec.ts`, `qa-learnings/natural-supervision-current-2026-09-17.md` (current clean seven-day candidate recheck: one deduplicated `strategy_change` update; routine receipts excluded) | PARTIAL | Prove the same threshold on a fully autonomous multi-day milestone/recap and against an independent adversarial verifier |
| AUT-007 | Agent follows through, measures, and adapts after action | An intermediate delivery is not outcome completion | `lib/live-assignment-run.ts`, `lib/runtime.ts`, `app/api/state/route.ts`, `tests/assignment-runtime.test.ts`, `qa-learnings/canonical-certification-5ef27b4-2026-09-17.md` | PROVEN | Independent public verifier passed delivery → awaiting_measurement → outcome_recorded → exactly-once scoped learning → replan → completion on immutable `5ef27b4`; duplicate advance produced no duplicate chain |
| AUT-008 | Agent stays within Presence permissions and escalates only at the boundary | Autonomy never bypasses the Execution Envelope | `lib/execution-readiness.ts`, `tests/assignment-runtime.test.ts`, `tests/source-invariance.test.ts`, `lib/native-execution-delivery.ts`, `tests/native-execution-delivery.test.ts` (delivery rechecks paused/revoked authority before connector use) | PARTIAL | Rerun the independent adversarial suite against integrated main, including approved and queued live actions |
| AUT-009 | Failed or uncertain delivery is not shown as success | Intent, execution, delivery, and outcome remain distinct | `tests/assignment-failure-recovery.test.ts`, `tests/assignment-domain.test.ts` (acknowledgement without matching Outcome remains `delivery_pending`); `docs/operational-autonomy-checklist.md` | PROVEN | Add live UI evidence for one failure state |
| LEARN-001 | Outcomes become evidence tied to the declared goal | Metrics inform judgment rather than rewrite identity | `lib/social-strategy.ts`, `lib/growth-scope.ts`, `tests/social-strategy.test.ts`, `tests/sandbox.test.ts` (public metric path plus durable state reload), `qa-learnings/learning-audit-4d4903d-2026-09-17.md` (persisted-trajectory audit; candidate canonical run and public metric-path evidence) | PROVEN | No remaining gate in the declared goal-tied outcome-evidence contract |
| LEARN-002 | Stored learning changes a later decision | Saved insight is not decorative memory | `lib/social-strategy.ts`, `lib/learning-runtime.ts`, `tests/autonomous-growth-cognition.test.ts`, `lib/learning-counterfactual.ts`; `tests/learning-counterfactual.test.ts` (SQLite round-trip, explicit decision-lineage gating, JSON-round-tripped Sandbox snapshots, public fork overlay namespacing, fresh-source overlay exclusion, source-restore preservation, serialized World A/World B retained-vs-removed learning, changed later runtime strategy, and selected-action attribution for quote/repost/like/follow) plus `lib/sandbox-replay.ts`/`lib/runtime.ts`; `qa-learnings/learning-audit-4d4903d-2026-09-17.md` | PARTIAL | Complete autonomous measured action-family trajectory, later allocation difference, and independent causal-cone review remain required |
| LEARN-003 | Patterns are scoped, confidence changes, and stale patterns retire | Tiny samples and context shifts do not create global rules | `lib/social-strategy.ts`, `lib/learning-runtime.ts`, `tests/learning-counterfactual.test.ts` (independent causal-decision counting, one-year recency gate, Presence/Channel/Agent scope regression, measured contradiction and bounded retirement) and `qa-learnings/learning-audit-4d4903d-2026-09-17.md` | PARTIAL | Prove the full autonomous contradiction/retirement trajectory through an independent learning adversary |
| LEARN-004 | Relevant media is distinguished from arbitrary media | “Use images” is not a sufficient learned abstraction | `lib/asset-discovery.ts`, `lib/perception-runtime.ts`, `lib/runtime.ts`, `app/api/state/route.ts`, `lib/social-strategy.ts` (`MediaEvidenceProfile`), `lib/types.ts`, `tests/asset-intelligence.test.ts`, `tests/perception.test.ts`, `tests/learning-counterfactual.test.ts`, `tests/sandbox.test.ts` (three executable relevant/irrelevant/text-only variants with verified metric evidence and persisted profiles), `qa-learnings/media-learning-structure-2026-09-17.md`, `qa-learnings/release-candidate-2154c5c-2026-09-17.md` | PARTIAL | Independently verify that a later media choice changes for the learned reason |
| LEARN-005 | User feedback persists as a durable constraint | Corrections survive the current turn and respect scope | `tests/ai.test.ts`, `tests/operator-chat-harness.test.ts` (typed `record_preference` saves scoped evidence, survives the worker merge boundary, and deduplicates), `tests/chat-feedback-process-boundary.test.ts` (Process A → termination → fresh Process B restores scoped evidence, then identical future input produces a different counterfactual social decision with zero executions and no foreign-Presence evidence), `tests/e2e/natural-supervision-feedback-loop.spec.ts` (public natural correction → concise acknowledgement → scoped evidence → later Sandbox decision changes), `tests/e2e/natural-supervision-seven-day.spec.ts` (updated seven-day golden trajectory persists the Day 3 correction while preserving an unrelated Day 4 repost), `lib/social-strategy.ts`, `tests/learning-counterfactual.test.ts`, `qa-learnings/chat-feedback-durability-2026-09-17.md`, `qa-learnings/natural-supervision-feedback-loop-2026-09-17.md` | PROVEN | Clean detached public seven-day trajectory proves the full correction-to-later-decision contract; no remaining gate in this row |
| SBX-001 | Virtual time can advance Sandbox work | Scheduled work uses virtual time, not accidental wall time | `lib/temporal.ts`, `lib/runtime.ts`, `app/api/state/route.ts`; `tests/sandbox.test.ts`, `tests/sandbox-temporal-integration.test.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical public seven-day trajectory and accelerated 1x/24x/96x runs; independent exact-candidate cross-rate verifier; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared virtual-time contract |
| SBX-002 | Events have defined causal ordering | Simultaneous, recurring, stale, and injected events are deterministic or explicit | `lib/runtime.ts` Scenario temporal adapter, `tests/scenarios.test.ts` (17 tests, including stable offset events and ordered replay), `tests/e2e/scenario-rehearsal.spec.ts` (4/4 clean Chromium run 2026-09-16); `tests/sandbox-temporal.test.ts` (13 tests, including multi-event event-local handler clocks and stale retry ordering); `tests/sandbox.test.ts` (persisted calendar dispatch plus typed causal parent assertions); `lib/sandbox-temporal.ts` and `lib/runtime.ts` at `0c68190` (central trace adapter preserves stable `parentIds` and durable `parentTypes`); `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` on the current checkpoint (explicit monotonic causal oracle) | PARTIAL | Implementation gate is satisfied; the remaining gap is independent reconstruction of every resulting world event and complete composed causal trace certification |
| SBX-003 | Delayed outcomes arrive only after causes | Agent cannot learn from future or hidden consequences | `lib/runtime.ts`, `tests/e2e/scenario-rehearsal.spec.ts`, `tests/workstream-a-replay.test.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical composed trajectory records delayed release; exact-candidate independent hidden-truth oracle observed no truth through minute 29 and one allowed release at minute 30; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared delayed-release contract |
| SBX-004 | Retry, cancellation, and backoff do not duplicate side effects | Recoverable failure remains visible and idempotent | `tests/assignment-failure-recovery.test.ts`, `tests/assignment-runtime.test.ts`, `tests/sandbox-temporal.test.ts` (success/exhaustion cancellation, retry-lineage fences, stale-event suppression), public `playground retry`/`cancel-retry` → virtual advance coverage in `tests/sandbox-temporal-integration.test.ts`, `lib/native-execution-delivery.ts` (durable post-handoff authority reconciliation), `tests/native-execution-delivery.test.ts` (pre-handoff cancellation plus in-flight revocation receipt), `qa-learnings/sbx-004-inflight-authority-barrier-2026-09-17.md`, and independent public audit on `5a822c8` covering cancel-before/after-attempt, duplicate scheduling, repeated cancellation, and no duplicate records | PARTIAL | Exercise the real-executor barrier and cancellation during retry backoff in the canonical composed run with an independent side-effect oracle |
| SBX-005 | Runs reset and remain Presence/session isolated | Sandbox state cannot leak across runs or into live delivery | `tests/sandbox.test.ts`, `tests/agent-library-browser-projection.test.ts`; canonical public no-babysitting run recorded no live execution; exact-candidate independent reset/session oracle preserved the untouched session hash and production-escape oracle recorded zero production executions/outcomes, requests, native connections, or bridges; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared reset/session/live-isolation contract |
| SBX-006 | Seeded replay/fork is diagnostically useful | Inputs, world state, order, and provenance can be reconstructed | Existing Scenario evidence plus `lib/sandbox-replay.ts`, `scenarios/workstream-a-replay.json`, `tests/workstream-a-replay.test.ts`; exact-candidate independent public Process A → checkpoint/fork → terminate → fresh Process B → restore/replay passed with equivalent normalized state/trajectory, no duplicate mirrors or learning, no session leakage, and no live side effects; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | Replay closure is complete; do not add replay-specific hardening absent a new integrated defect |
| SBX-007 | Hidden simulator truth stays hidden from cognition | Only allowed observations become Agent context | Existing Scenario evidence plus Workstream A delayed-truth/replay tests; canonical delayed-outcome trajectory; exact-candidate independent hidden-truth release oracle; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared hidden-truth boundary contract |
| SBX-008 | Trajectory evidence explains what occurred | Time, observations, intents, executions, outcomes, and events are inspectable | Existing CLI/kernel/Scenario evidence plus Workstream C causal trajectory and isolation tests; `bin/openpresence.mjs` now projects the session temporal trace, runtime records explicit causal parent ids, and immutable `0f237e3` canonical evidence contains observation → decision → intent → permission → execution → result → outcome → learning → replan plus plan mutation; independent verifier passed the exact candidate's replay/isolation suite and a detached public Chromium canonical run | PARTIAL | Independent reconstruction of the complete composed trace, including every permission/retry edge, remains to be certified |
| SBX-009 | Multi-day behavior can be compressed without semantic drift | Acceleration changes wall time, not causal behavior | `docs/operational-autonomy-checklist.md`; persisted session bridge in `lib/runtime.ts`, `app/api/state/route.ts`, `tests/sandbox-temporal-integration.test.ts`, `tests/sandbox.test.ts`, and `tests/sandbox-multi-rate-trajectory.test.ts`; builder 1x/24x/96x and public coarse/fine trajectories; exact-candidate independent cross-rate oracle with identical semantic projection hash; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared acceleration-semantics contract |
| EVAL-001 | Trajectory-level scenario harness exists | Evals run on top of the Sandbox rather than replacing it | `bin/openpresence.mjs`, `scenarios/`, `tests/scenarios.test.ts`, `tests/e2e/scenario-rehearsal.spec.ts`, `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts`, `tests/sandbox-multi-rate-trajectory.test.ts`; canonical composed seven-day trajectory passed through public controls, exact-candidate independent runtime verifier, and detached public Chromium verifier; durable attestation in `qa-learnings/release-candidate-0f237e3-2026-09-17.md` | PROVEN | No remaining gap in the declared composed-harness contract |
| EVAL-002 | Deterministic properties use deterministic assertions | Judges are not used where state can be asserted | `tests/*.test.ts`, `tests/playground-cli.test.ts` | PROVEN | Audit new evals for green-by-definition tests |
| EVAL-003 | Material failures become reproducible regressions | A fixed failure remains protected | `qa-learnings/`, `tests/e2e/`, `docs/operational-autonomy-checklist.md`, `qa-learnings/eval-003-failure-linkage-2026-09-17.md`, `lib/types.ts`/`lib/runtime.ts` (failed or unavailable Scenario evaluations now require capability linkage at the durable write boundary), `tests/scenarios.test.ts` | PARTIAL | Exercise the fail-closed linkage in the canonical composed certification and independent verifier; promote only when every material failure is classified |
| EVAL-005 | Natural supervisory interaction is evaluated as a trajectory | Realistic user utterances are judged by behavior, state, and follow-up rather than exact wording or internal tool scripts | `qa-learnings/conversation-prompt-evals/2026-09-16-natural-supervision-golden.json`, `docs/plans/natural-supervision-eval.md`, `tests/e2e/natural-supervision-seven-day.spec.ts`, `qa-learnings/natural-supervision-current-2026-09-17.md` (current clean seven-day run: 7 natural turns, 10,080 virtual minutes, 5 verified outcomes, one strategy-change update, durable correction, no stale-lineage warning) | PARTIAL | Run the clean trajectory through an independent adversarial verifier and review interruption behavior |
| EVAL-004 | Counterfactual/ablation verification is repeatable | Future behavior differs only when the relevant evidence/state differs | Existing prompt ablations in `qa-learnings/conversation-prompt-evals/`; deterministic learning projections, persisted retrieval, lineage gating, SQLite-persisted World A/World B forward ablation, JSON-round-tripped Sandbox snapshot retained-vs-removed learning proof, fresh-source overlay exclusion, and Sandbox retrieval fencing in `lib/sandbox-replay.ts`/`lib/runtime.ts`; public fork isolation/idempotence and post-restart inject/reply behavior independently audited on `abe4993`/`7f13cf3`/`27ebac1`/`31f62b0` | PARTIAL | Like/repost/quote/follow, other Assignment action families, and complete causal-cone ablation remain unproven |
| TOOL-001 | Agents can inspect/control Sandbox through a reusable CLI | No repeated throwaway script is required for common Sandbox work | `bin/openpresence.mjs`, `tests/playground-cli.test.ts`, `README.md` | PROVEN | Add commands only for demonstrated recurring gaps |
| TOOL-002 | Agents can control and verify the running app | Browser/runtime proof has isolated state and structured evidence | `.agents/skills/verify-app/scripts/verify-app.mjs`, `.agents/skills/verify-app/SKILL.md` | PROVEN | Keep feature-map maintenance current |
| TOOL-003 | Independent verifier agents can challenge builder claims | Builder success is not the sole proof for critical capabilities | `docs/AGENT_EXECUTION_FLOW.md`; exact-candidate independent verifier challenged the integrated public workflow and passed cross-process replay, cross-rate semantics, hidden-truth, reset/session isolation, retry/cancellation race, production-escape, and runtime-health oracles without source edits; durable attestation in `qa-learnings/certification-closure-11eaa8e-2026-09-17.md` | PROVEN | No remaining gap in the declared independent-verifier contract |
| UX-001 | User experience feels like supervising an Agent, not managing tasks | Routine operational work is Agent-owned and visible without machinery leakage; no normal user task-entry or activation flow | `FEATURES_MAP.md`, `.agents/skills/product-usability-auditor/SKILL.md`, `docs/operational-autonomy-checklist.md`, `app/client-page.tsx` (Tasks/Growth/Artifacts creation and full editor flows removed; Chat intervention and cancel remain), `tests/e2e/responsive-workspace.spec.ts`, `tests/e2e/artifacts-playbook.spec.ts` (no Add, Growth goal, template scheduling, or full editor controls), `tests/operator-chat-harness.test.ts` (new Chat responsibility is Agent-owned and executable without activation), `qa-learnings/simplification-tasks-supervisory-2026-09-17.md`, `qa-learnings/product-review-tasks-supervisory-2026-09-17.md` | PROVEN | No remaining gate in the declared no-task-management UX contract |
| UX-004 | Chat is a lightweight, grounded supervisory interface | Responses are concise/action-first, use actual Growth/Calendar/plan state, infer operations from natural language, and support occasional Agent-initiated updates | `lib/supervisory-chat.ts`, `lib/operator-chat-harness.ts`, `lib/operator-initiated-communication.ts`, `tests/supervisory-chat.test.ts`, `tests/agent-initiated-communication.test.ts`, `tests/operator-chat-harness.test.ts`, `tests/e2e/natural-supervision-seven-day.spec.ts`, `tests/e2e/natural-supervision-feedback-loop.spec.ts`, `qa-learnings/natural-supervision-current-2026-09-17.md` (current clean trajectory confirms concise correction, durable mutation, grounded state, and non-routine update) | PARTIAL | Verify the complete trajectory and interruption threshold with an independent adversarial review |
| UX-005 | Plan Intervention lets the user supervise any Agent-owned planned item | Calendar item → scoped conversational feedback → durable Agent-owned plan mutation; cancel/postpone/constrain/replan remain coherent without a task editor | `lib/types.ts` (`planIntervention`), `lib/operator-chat-harness.ts`, `lib/autonomy-worker.ts`, `lib/runtime.ts`, `app/client-page.tsx`, `tests/runtime.test.ts` (postpone/constrain/cancel synchronize linked Calendar projection and standing intent), `tests/e2e/mandatory-seven-day-no-babysitting.spec.ts` (natural correction → scoped constraint), `tests/e2e/chat-first-harness.spec.ts` (browser guidance and direct Agent-owned publishing-item cancellation both survive reload with a coherent successor projection), `tests/plan-intervention-process-boundary.test.ts`, `qa-learnings/plan-intervention-browser-2026-09-17.md`, `qa-learnings/calendar-plan-projection-audit-2026-09-17.md` | PROVEN | No remaining gate in the declared scoped intervention contract |
| UX-003 | Environment and permission truth stays visible | Sandbox, review-gated, live, and disconnected states are not represented as equivalent | `app/client-page.tsx` / `app/globals.css` shared `environmentStateFor` projection; `qa-learnings/ux-003-environment-state-projection-2026-09-17.md`; `qa-learnings/final-candidate-01fdd69-2026-09-17.md`; Sandbox, paused, approval-required, syncing, stale, disconnected, and connected labels are now explicit in the workspace/Activity surfaces | PARTIAL | Clean public responsive journey must exercise live/review/disconnected transitions; mixed legacy browser batch had 6 passes and 11 unrelated expectation failures |
| SIM-001 | Simplification preserves protected behavior | Deletion is preceded by capability-level ablation | `.agents/skills/design-simplifier/SKILL.md`, `CAPABILITY_LEDGER.md`, `qa-learnings/simplification-tasks-supervisory-2026-09-17.md`, `qa-learnings/product-review-tasks-supervisory-2026-09-17.md`; removed Tasks/Growth/Artifacts user-entry and full editor controls while retaining internal Assignments, Chat intervention, Calendar projection, and execution proof; responsive/artifact browser ablation passes | PARTIAL | Independent capability-ablation review of legacy migration compatibility remains; preserve historical data and executable primitives |

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
