# Source notes

This reference distills the design guidance supplied with the skill request and the OpenPresence project’s canonical philosophy. It is a reasoning aid, not a substitute for product evidence or the canonical document.

## OpenPresence canonical source

Read [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](../../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md) for the authoritative product, UX, scope, privacy, authority, cognition, and truthful-state principles.

Key implications for simplification:

- simplify infrastructure exposed to normal users, not the boundaries that protect identity, privacy, authority, or verified reality;
- preserve `User → Agent → Presence` and person-shaped cognition;
- distinguish observation, Social Intent, Execution, Delivery, and Outcome;
- keep Sandbox/rehearsal honest and separate from live world outcomes;
- treat silence/NO_OP and incomplete responsibility as valid truths;
- prefer progressive disclosure and human-readable intention before connector/runtime detail.

## User-provided design synthesis

The supplied specification draws on the following ideas:

- Ian Silber / OpenAI design discussion: “do less,” reuse existing systems, and use different levels of craft for durable versus experimental work.
- Bob Baxley: teams need opinionated tenets that settle tradeoffs; simple-first experiences should let users opt into complexity.
- Katie Dill: repeatedly walk important journeys like a customer and maintain a friction log.
- Mobbin/Claude workflow: study excellent solutions to the same interaction problem without copying a brand or ignoring context.
- Finishing patterns: meaningful empty states, undo, contextual help, error recovery, and restrained microinteractions after information architecture is clear.

Treat these as heuristics. A precedent is useful only when its user, context, stakes, and product goal match OpenPresence closely enough to reduce uncertainty.

## Attribution discipline

When a review uses an external precedent, link or name the primary source available in the current task, state what was actually observed, and separate source fact from design inference. Never present a search result, screenshot, or brand reputation as proof that a proposed change is right for OpenPresence.
