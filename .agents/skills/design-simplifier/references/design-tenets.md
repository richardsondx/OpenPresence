# Design tenets

These are opinionated tradeoff rules for OpenPresence design reviews. The canonical philosophy remains the source of truth for product, authority, privacy, and truthfulness decisions.

1. **Extend before adding.** Prefer an existing surface, component, flow, or mental model. Ask whether a feature needs to exist as a separate thing.
2. **Remove before redesigning.** Try the simplification ladder before inventing UI.
3. **Simple first, complexity on demand.** The common path exposes only what is needed for the next useful outcome; advanced power is progressive disclosure.
4. **One product, one mind.** Shared intentions should use shared language, locations, primitives, and interaction patterns unless context genuinely differs.
5. **One obvious next action.** A screen should communicate its purpose and next useful action without documentation.
6. **Design journeys, not screens.** Judge the end-to-end job, including entry, transitions, state, outcome, and recovery.
7. **Benchmark the problem, not the brand.** Study how strong products solve the same interaction problem; adapt the principle to OpenPresence.
8. **Clarity before delight.** Motion, personality, and polish come after useful structure and trustworthy feedback.
9. **Make mistakes cheap.** Prefer undo, previews, reversibility, sane defaults, and recovery over repeated confirmation.
10. **Stop when it is good.** A good review may conclude that no material simplification is warranted.

OpenPresence-specific application:

- Show user intention and scope before connector, queue, lease, retry, schema, or protocol detail.
- Keep Agent meaning durable and Presence incarnation/context distinct.
- Treat Activity as operational social flow, Review as focused operator judgment, and Schedule as responsibility/timing; do not merge them only because they are adjacent.
- Treat Sandbox/Playground as rehearsal, never as live delivery or verified world outcome.
- Preserve silence/NO_OP, privacy filtering, operator authority, and truthful state as design capabilities rather than friction to remove.
