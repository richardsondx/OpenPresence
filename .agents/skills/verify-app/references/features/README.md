# OpenPresence feature map

This map records how a real operator reaches behavior in the local OpenPresence product and what counts as proof. It is intentionally behavior-level; source code and internal handlers are not substitutes for exercising the UI.

## Baseline preconditions

- Run from the repository checkout with dependencies installed.
- Start the harness-owned runtime and require `doctor` to pass before making product claims.
- Use `reset-session` for isolated local state. The harness uses test mode, deterministic AI/X mocks, and a private SQLite file.
- Prefer one fresh browser profile per verification run. The harness persists its profile so sequential commands share route and browser state.
- Treat Sandbox/Playground as rehearsal. It must never be reported as live channel delivery or a verified external-world outcome.

## Evidence conventions

Every claim needs the user trigger, stable end state, side effect, and evidence. Strong evidence combines a semantic UI assertion or screenshot with persisted state after navigation/reload where relevant. Use `errors`, `network-summary`, and `logs` to explain failures, not to turn them into passes.

## Feature areas

- [Onboarding and workspace identity](onboarding.md)
- [Activity and verified outcomes](activity.md)
- [Chat and Teach](chat-teach.md)
- [Watching and People](watching-people.md)
- [Channels and Manage Agent](channels-agent.md)
- [Playground and Rehearsal](playground-rehearsal.md)
- [Schedule and Assignments](schedule-assignments.md)
- [Knowledge, Assets, Growth, and reporting](knowledge-assets-growth.md)
- [Cross-surface journeys](journeys.md)

## Full-regression sweep order

1. Onboarding and workspace identity.
2. Activity and route/persistence truth.
3. Chat/Teach and the Chat → Activity handoff.
4. Channels and Manage Agent scope/persistence.
5. Watching/People and attention entry points.
6. Playground/Rehearsal sandbox isolation.
7. Schedule/Assignments and responsibility state.
8. Knowledge/Assets/Growth/Analytics/Usage/Feed reporting surfaces.
9. Cross-surface journeys and responsive entry points.

## Important journeys

See [Cross-surface journeys](journeys.md) for create → reload → persistence, Chat → Assignment → Activity, Playground → decision trace, and Settings → navigation scope checks. Do not duplicate selectors there; sequence the individual feature files.
