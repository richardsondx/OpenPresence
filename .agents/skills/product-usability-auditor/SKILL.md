---
name: product-usability-auditor
description: >-
  Audit a product or feature for real user value, usefulness, correctness,
  clarity, cognitive load, visual economy, truthful state, and recovery from
  failure; use a project's feature map and history to return evidence-backed,
  prioritized findings and simpler fixes. Use for product, UX, UI, workflow,
  or feature audits; audit first and implement only when the user asks.
---

# Product Usability Auditor

Audit the product as a person trying to accomplish something, not as a tour of
implemented screens. The output should make it easy to decide whether a
feature should exist, whether it works, whether it is useful, and what the
smallest coherent improvement is.

## Non-negotiable context

For OpenPresence, read these before judging a feature:

1. `docs/OpenPresence_Vision_and_Platform_Philosophy.md`, especially the
   product test, UI sections, progressive disclosure, truthful state, status
   language, and operational-autonomy sections.
2. `FEATURES_MAP.md`. Use its feature inventory to locate the feature's scope,
   primary UI, implementation, and QA anchors. Do not invent a parallel map.
3. `qa-learnings/ux-preferences.md` when present, then relevant
   `qa-learnings/` reports and regression rules.

If the product is another project, find its equivalent source of truth and
feature map. If no map exists, say so as a product/documentation finding
instead of pretending the map is complete.

## Audit boundaries

- Audit by default. Do not change application code unless the user explicitly
  asks for implementation or says to fix the findings.
- Keep product value, user preference, philosophy, implementation facts, and
  hypotheses separate. A beautiful preference is not evidence that a feature
  creates value; a passing test is not evidence that the workflow is useful.
- Preserve existing worktree changes. Inspect before editing and make the
  smallest coherent change within the requested scope.
- Never call a queued, attempted, simulated, or locally persisted action a
  real-world success. Distinguish intent, execution, delivery, and verified
  outcome.
- Do not recommend adding complexity to compensate for unclear value. First
  consider removing, merging, hiding behind progressive disclosure, or
  deferring the feature.

## Evidence collection

Use the cheapest evidence that can answer the question, then escalate when
the risk warrants it:

- **Product and map:** identify the affected `FEATURES_MAP.md` row, scope,
  user promise, code locations, and existing QA anchors.
- **Code and tests:** inspect the real state model, loading/empty/error paths,
  persistence, refresh/restart behavior, and tests. Tests prove contracts;
  they do not prove that the feature is worth using.
- **Running product:** for rendered, interactive, responsive, or stateful
  concerns, use the real browser and the actual user-facing route. Honor an
  explicit `@Chrome` or `@Browser` request as a hard constraint. Inspect the
  initial state, success, empty, loading, failure, recovery, reload, and
  relevant mobile/desktop variants. Record unverified when the app or browser
  is unavailable.
- **History:** when thread tools are available, inspect current and archived
  project tasks and read the relevant turns. Also use project-local ledgers,
  audit reports, repair logs, and regression rules. Count only explicit
  complaints or direct negative feedback as complaint evidence; related fix
  tasks are corroboration, not additional complaints. Report the counting
  definition, date window, number of records reviewed, clusters, and
  representative task titles or quotes. Never imply that a sampled history is
  exhaustive.

## Product judgment model

Evaluate the feature through these lenses. A finding may belong to more than
one lens, but identify the primary failure so the fix is actionable.

### 1. Value: should this exist?

Ask whether it helps the product accomplish its actual mission and whether a
real user outcome improves. For OpenPresence, apply the canonical test:

> Does this help the Agent notice better opportunities, say or make better
> things, stay consistent, use the right medium, maintain relationships, or
> learn how to earn the next qualified follower without losing itself?

Flag features that create activity, settings, counts, or technical ceremony
without improving an outcome. Recommend `remove/defer` when the value case is
absent; do not rescue it with more explanation.

### 2. Usefulness: does it help this user now?

Name the user, situation, goal, expected result, and next decision. Check that
the feature reduces effort or increases quality rather than making the user
operate the system. Treat volume, model calls, queue size, and analytics as
supporting evidence only. Silence, no-op, text-only, or a graceful stop may
be the useful result when the product's domain allows it.

### 3. Function and truth: does it work as promised?

Trace the complete journey: entry → action → persistence → visible result →
next action → reload/restart. Check scope boundaries, identity, permissions,
privacy, stale data, duplicate submissions, external verification, and whether
the UI can make a claim that the underlying state cannot support. A feature is
not working merely because its endpoint returns 200 or its component renders.

### 4. Clarity and cognitive load: can a person understand it?

Inspect the first scan before reading help text. The screen should make the
primary purpose, current state, ownership, and next action obvious. Flag long
explanations, repeated caveats, jargon, internal implementation language,
competing calls to action, ambiguous labels, unexplained numbers, and states
that require reconstructing architecture. Use progressive disclosure for
diagnostics, provenance, and advanced configuration while keeping safety,
consent, and truth-critical context visible.

### 5. Space and visual economy: does every element earn its place?

Treat screen real estate and attention as scarce. Look for redundant headers,
duplicate status chrome, oversized cards, empty padding, unnecessary sidebars,
repeated labels, dense tables before the user has a mental model, and copy that
could be replaced by hierarchy or a control. Preserve space when it prevents a
wrong action or explains a live state. Prefer a calm, compact surface over a
dashboard that displays everything the system knows.

### 6. Information architecture: is ownership obvious?

Each concept and action should have one intuitive home. Check User → Agent →
Presence → Channel scope, and in OpenPresence check the separation between
observation, judgment, Social Intent, execution, delivery, and verified
outcome. Flag duplicate ways to perform one responsibility, controls placed
far from the state they change, dead-end links, Review settings without a
Review queue, and `Custom` choices that reveal no configuration.

### 7. Stuckness, errors, and recovery: can the user get unstuck?

Exercise slow, missing, stale, denied, disconnected, malformed, duplicate,
and uncertain-outcome paths. Every wait must end in data, a bounded retry,
an explicit empty state, or an actionable error. Make clear whether the user
should wait, retry, change configuration, review something, or do nothing.
Prefer automatic routine recovery and one aggregated incident over repeated
operator chores. Keep these truths distinct: intentional silence, candidate
rejection, missing evidence, capability unavailability, model failure,
delivery failure, and uncertain external outcome. Never let failure look like
an intelligent no-op or leave a responsibility visibly running without a stop
or recovery path.

### 8. Product coherence and completeness: does it belong?

Check reuse of established geometry and patterns, responsive behavior,
accessibility basics, cross-feature consistency, channel flexibility, and
multimodal parity where relevant. Every visible control needs real backing
state. Every important feature needs an end-to-end success path, honest blank
state, failure path, and verification evidence. If the feature conflicts with
the philosophy or adds a second source of truth, surface that conflict.

## History-informed frustration analysis

Do not merely say “users may be frustrated.” Connect the likely emotion to a
broken expectation:

- **Confusion:** the user cannot tell what the screen or status refers to.
- **Stuckness:** time passes without meaningful progress, exit, or recovery.
- **Distrust:** the product claims success, health, connection, or completion
  without verified backing.
- **Overload:** the user must read too much, compare too many controls, or
  understand machinery before acting.
- **Futility:** the feature produces activity but no meaningful user outcome.
- **Operator burden:** routine failures repeatedly ask the user to diagnose,
  reconnect, retry, or clean up internals.

Use repeated history to raise confidence and severity, not to count the same
underlying incident many times. A cluster table should include the complaint
count, evidence sources, affected features, recurring expectation, and the
product rule that would prevent recurrence.

## Required output

Use the schema in [references/audit-table.md](references/audit-table.md).
Always return:

1. A one-paragraph verdict: `keep`, `repair`, `simplify`, `remove/defer`, or
   `unverified`, with the reason.
2. A compact history/frustration table when history is available, including
   the counting method and limitations.
3. A prioritized feature audit table tied to exact `FEATURES_MAP.md` entries,
   code/UI locations, and QA anchors. Include only evidence-backed findings;
   mark hypotheses as hypotheses.
4. The smallest coherent fix for each high-priority finding, including what
   should be removed or hidden when appropriate. Do not prescribe a rewrite
   when a focused change closes the user-visible gap.
5. A verification plan covering the user journey, state transitions,
   persistence/reload, relevant viewport, and failure/recovery behavior.

Keep the main report concise. Put implementation diagnostics, raw logs, and
deep evidence behind a compact “details” section or links. The audit itself
must model the product behavior it asks for: clear hierarchy, low cognitive
load, concrete next actions, and no decorative prose.

## If implementation is requested

Reconfirm the prioritized findings, then implement only the smallest coherent
fixes that address them. Re-read the mapped implementation and QA anchors,
update or add regression protection, and verify in the running product when
the issue is user-facing. Report what changed, what remains unverified, and
any conflict with the philosophy. Do not silently convert a recommendation
into a broad redesign.
