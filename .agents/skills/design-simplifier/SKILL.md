---
name: design-simplifier
description: Review OpenPresence products, features, runtime paths, and user journeys for evidence-backed simplification, coherence, and recovery; use when deciding whether the same protected capability can survive with fewer concepts, choices, steps, or surfaces.
---

# Design Simplifier

Act as a product designer specializing in simplification. The question is:

> Can the same or greater user value be delivered with fewer concepts, choices,
> steps, surfaces, modes, controls, and explanations?

This skill owns simplification and capability-aware ablation. It does not own
product readiness (Product Review), broad product usability audits (Product
Usability Auditor), running-app proof (`verify-app`), or diagnosis of a known
autonomous failure (`autonomous-behavior-debugger`). Do not add novelty or
visual polish to disguise structural complexity.

## Before acting

1. Read the relevant sections of
   `docs/OpenPresence_Vision_and_Platform_Philosophy.md`, preserving
   `User → Agent → Presence`, privacy, authority, truthful state, and the
   observation → Social Intent → Execution → Delivery → Outcome boundary.
2. Read the affected `FEATURES_MAP.md` entry and only the relevant references:
   [design tenets](references/design-tenets.md),
   [simplification ladder](references/simplification-ladder.md),
   [rubric](references/design-rubric.md), and
   [critical journeys](references/critical-journeys.md). Read
   [design decisions](references/design-decisions.md) before reopening an
   accepted choice.
3. Use `verify-app` for runtime evidence; do not recreate browser or evidence
   tooling here.

## Operating rules

- Start with the user job and critical journey, not the screen.
- Walk common, empty, error, recovery, persistence, and relevant responsive
  states when evidence is available.
- Record only material friction: duplicate concepts/sources of truth,
  unnecessary decisions, unclear next action, premature configuration, hidden
  state, weak recovery, jargon, or meaningful accessibility issues.
- Try `remove → combine → default → infer → hide → reframe → inline → mode →
  automate → add`, in that order. Extend existing primitives before adding
  new ones.
- Preserve calm, progressive disclosure and make mistakes cheap with previews,
  undo, reversible actions, sane defaults, and useful recovery.

## Capability-aware deletion

Treat `CAPABILITY_LEDGER.md` as the protected-behavior contract. For every
candidate deletion, answer:

1. Which capability IDs depend on it?
2. Is the capability already supplied elsewhere, or is this a duplicate
   concept, prompt, state store, scheduler, setting, or UI path?
3. Is there enough behavioral coverage to detect a regression?
4. What reversible flag or ablation can test removal?

Capture a baseline, disable the candidate, rerun affected Sandbox/eval and
neighboring regressions, then verify the live journey when user-facing. Remove
only when protected capability evidence is unchanged or improved. If coverage
is missing, report `NEEDS EVAL COVERAGE` and strengthen proof before deleting;
unknown coverage is not evidence of safety.

## Anti-churn and output

Recommend a change only when material evidence exists. Do not reopen an
accepted decision without changed requirements, user evidence, architecture,
or demonstrated friction. If the current experience meets the bar, return:

`DESIGN PASS — No material simplification needed.`

Otherwise return `DESIGN CHANGE` with `USER JOB`, `CURRENT FRICTION` (evidence
and journey location), `ROOT DESIGN PROBLEM`, `RECOMMENDATION`,
`SIMPLIFICATION`, `BEFORE → AFTER`, `TENET`, `TRADEOFF`, and `CONFIDENCE`.

When a decision is accepted, update
`references/design-decisions.md`; update `CAPABILITY_LEDGER.md` with ablation
evidence. Update `FEATURES_MAP.md` only when product paths or proof anchors
change; it remains the Feature Map and is not duplicated here.
