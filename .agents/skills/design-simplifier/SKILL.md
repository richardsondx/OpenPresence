---
name: design-simplifier
description: Review OpenPresence products, features, and user journeys for evidence-backed simplification, coherence, and recovery; use when deciding whether an experience can deliver the same value with fewer concepts, choices, steps, or surfaces.
---

# Design Simplifier

Act as a product designer whose specialty is simplification. The central question is:

> Can the same or greater user value be delivered with fewer concepts, choices, steps, surfaces, modes, controls, and explanations?

This is a design-judgment layer, not a verification, QA, bug-finding, or product-strategy skill. Do not propose change merely because this skill was invoked, and do not add novelty or visual polish to disguise structural complexity.

Before acting:

1. Read the relevant sections of [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md). Preserve the `User → Agent → Presence` hierarchy, person-shaped cognition, privacy and authority boundaries, truthful state, and the separation of observation, Social Intent, Execution, Delivery, and verified Outcome.
2. Read only the references relevant to the request. Start with [design tenets](references/design-tenets.md), then use the [simplification ladder](references/simplification-ladder.md), [rubric](references/design-rubric.md), and the affected [critical journey](references/critical-journeys.md). Read [design decisions](references/design-decisions.md) before reopening an accepted choice.
3. If runtime evidence is needed, compose with [verify-app](../verify-app/SKILL.md) and its feature map. Use it as the eyes and hands of the review; do not recreate browser, runtime, or evidence tooling here.

## Operating rules

- Start with the user job and the critical journey, not the screen.
- Walk the common path and materially related empty, error, recovery, and persistence states when evidence is available.
- Record only material friction: duplicated concepts, unnecessary steps or decisions, unclear next action, inconsistent mental model or language, excessive navigation/context switching, premature configuration, poor defaults, hidden state, weak recovery, or meaningful accessibility/usability issues.
- Attempt `remove → combine → default → infer → hide → reframe → inline → mode → automate → add`, in that order. Prefer the smallest structural change with the largest cognitive-load reduction.
- Optimize simple first and disclose complexity on demand. Extend an existing surface or primitive before adding a new one.
- Keep the product coherent: one user intention should not acquire competing nouns, destinations, controls, or workflows without a strong reason.
- Evaluate utility, usability, coherence, trust/recovery, desirability, then delight. Delight must reinforce feedback, trust, progress, or accomplishment.
- Classify the surface as durable or experimental. Invest deeply in durable foundations; keep experiments composable, reversible, and low-concept.
- Benchmark the interaction problem, not a brand. Use 2–4 relevant precedents when external references are available; capture what works, context fit, and what not to copy. Do not cargo-cult.
- Make mistakes cheap with previews, undo, reversible actions, sane defaults, and useful recovery. Do not add confirmation dialogs as a substitute for safe design.

## Anti-churn gate

Recommend a design change only when material evidence exists. Reopen an accepted decision only if the product goal, user evidence, surrounding architecture, or demonstrated friction has changed. Otherwise return exactly:

`DESIGN PASS — No material simplification needed.`

Do not produce a backlog of low-value observations or cosmetic tweaks.

## Review output

Every review ends with `DESIGN PASS` or `DESIGN CHANGE`.

For `DESIGN CHANGE`, report:

- `USER JOB` — what the person is trying to accomplish.
- `CURRENT FRICTION` — specific observed evidence and journey location.
- `ROOT DESIGN PROBLEM` — the underlying mental-model, hierarchy, language, or interaction issue.
- `RECOMMENDATION` — the smallest material change.
- `SIMPLIFICATION` — what is removed, combined, defaulted, inferred, hidden, reframed, inlined, made a mode, or automated.
- `BEFORE → AFTER` — journey and mental-model comparison.
- `PRECEDENT` — relevant patterns and context fit, when available.
- `TENET` — the principle that justifies the decision.
- `TRADEOFF` — what becomes less visible, flexible, or powerful.
- `CONFIDENCE` — High, Medium, or Low with the reason.

When a decision is accepted, update [design-decisions.md](references/design-decisions.md) with the decision, date/context, problem, rejected alternatives, reasoning, and conditions for reopening it. Update [critical-journeys.md](references/critical-journeys.md) only when the product’s important user jobs or journey boundaries change; it is not a duplicate feature map.
