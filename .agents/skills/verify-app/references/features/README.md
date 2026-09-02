# OpenPresence feature map

> Reviewed 2026-09-01 against the current source and a fresh harness-owned runtime. This map records the current product surface, not the proposed simplified design.

This map records how a real operator reaches behavior in the local OpenPresence product and what counts as proof. It is intentionally behavior-level; source code and internal handlers are not substitutes for exercising the UI.

## Baseline preconditions

- Run from the repository checkout with dependencies installed.
- Start the harness-owned runtime and require `doctor` to pass before making product claims.
- Use `reset-session` for isolated local state. The harness uses test mode, deterministic AI/X mocks, and a private SQLite file.
- Prefer one fresh browser profile per verification run. The harness persists its profile so sequential commands share route and browser state.
- Treat Sandbox/Playground as rehearsal. It must never be reported as live channel delivery or a verified external-world outcome.

## Evidence conventions

Every claim needs the user trigger, stable end state, side effect, and evidence. Strong evidence combines a semantic UI assertion or screenshot with persisted state after navigation/reload where relevant. Use `errors`, `network-summary`, and `logs` to explain failures, not to turn them into passes.

## Product object model and scope

The operator manages a portfolio of persistent Agents. Each Agent may own one or more Presences, and each Presence may exist in one Channel/environment.

```text
User
  ├── Agent: Genny
  │     └── Presence: X · @genny
  ├── Agent: Poko
  │     └── Presence: X · @poko
  └── Agent: Ideagrape
        └── Presence: X · @ideagrape
```

The current shell does expose both switchers, but the Presence switcher is labelled `Channels` and its accessibility labels say `Switch Channel` / `Your Channels`. This is a map-level usability risk for multi-Agent operation: Channel is the environment, Presence is the selected social incarnation, and Agent is the durable mind.

## Current route inventory

| Route | View | Scope | Current entry / proof boundary |
|---|---|---|---|
| `/` | Onboarding | User → new Agent + first Presence | Create form; persisted Agent/Presence after workspace opens |
| `/activity` | Activity / Today | Selected Presence | `Now`, `Timeline`, `Calendar` tabs; current attention, decisions, outcomes |
| `/review` | Review / Needs You | Selected Presence | Focused operator queue; must not be described as delivery until outcome is verified |
| `/chat` | Chat | Agent conversation, Presence context where applicable | Private operator conversation and receipts |
| `/teach` | Teach | Agent-wide durable judgment | Conversation, proposals/change sets, scope and persistence |
| `/rehearsal` | Presence Rehearsal | Selected Presence, Sandbox | Private social practice; never live delivery or durable identity mutation by default |
| `/watching` | Watching / Attention | Selected Presence | Watches and Explorations; attention is not authority to speak |
| `/people` | People / Relationships | Selected Presence | Remembered identities, relationship facts, boundaries, and open loops |
| `/settings` | Presence care (currently `Channels`) | Selected Presence | Identity, purpose, attention, autonomy, knowledge access, connection, and deletion |
| `/playground` | Playground / Practice | Selected Presence, Sandbox | `Free play`, `Curation`, `Trials`, `Scenarios`; simulated cognition-to-outcome chain |
| `/feed` | Public history (currently `Activity`) | Selected Presence | Verified public expression and observed outcome evidence; not an inbound feed |
| `/growth` | Growth | Selected Presence | Growth responsibility, evidence, strategy, and review rhythm |
| `/analytics` | Analytics shell | Selected Presence / Agent-wide Usage tab | Growth and Usage tabs; currently duplicates Growth entry content |
| `/usage` | Usage | Agent-wide, Presence-filterable | Provider/request ledger; not provider billing or a social outcome |
| `/schedule` | Schedule / Assignments | Selected Presence | List/Week, publishing rhythm, durable Assignments, completion contracts |
| `/work` | Agent Work index | Selected Agent | Compact cross-Presence responsibility index; links to Schedule for temporal detail |
| `/calendar` | Schedule alias | Selected Presence | Legacy route; resolves to the canonical Schedule view |
| `/agent` | Manage Agent | Selected Agent | Meaning files, model runtime, provider access, Skills, capabilities, deletion |
| `/knowledge` | Knowledge | Selected Agent | Documents, versions, retrieval/access audit |
| `/assets` | Asset library | Selected Agent | Visual evidence, folders, perception, provenance, and reuse |
| Activity → Developer Diagnostics | Technical audit | Selected Presence | Advanced forensic ledger; not a primary route |

## Current navigation shell

Desktop and mobile expose selected-Presence items: `Activity`, `Review`, `Chat`, `Watching`, `Presence`, `Playground`, and `Analytics`. Agent items are `Work`, `Knowledge`, `Assets`, and `Manage Agent`. `Schedule` remains the temporal detail route; `Teach`, `People`, `Growth`, `Feed`, `Usage`, and `Rehearsal` remain reachable by direct route or contextual links.

Every loaded view repeats an Agent switcher, Presence switcher, operational health indicator, and the same navigation. The repeated shell is part of every journey and should be considered when evaluating cognitive load.

## Feature areas

- [Onboarding and workspace identity](onboarding.md)
- [Activity and verified outcomes](activity.md)
- [Review and operator queue](review.md)
- [Chat and Teach](chat-teach.md)
- [Watching and People](watching-people.md)
- [Channels and Manage Agent](channels-agent.md)
- [Playground and Rehearsal](playground-rehearsal.md)
- [Schedule and Assignments](schedule-assignments.md)
- [Knowledge, Assets, Growth, and reporting](knowledge-assets-growth.md)
- [Cross-surface journeys](journeys.md)

The route inventory above is authoritative for coverage. The feature files below contain the concrete entry points, selectors, proof requirements, and gotchas for each behavior family.

## Full-regression sweep order

1. Onboarding and workspace identity.
2. Activity and route/persistence truth.
3. Review and operator decisions.
4. Chat/Teach and the Chat → Activity handoff.
5. Channels and Manage Agent scope/persistence.
6. Watching/People and attention entry points.
7. Playground/Rehearsal sandbox isolation.
8. Schedule/Assignments and responsibility state.
9. Knowledge, Assets, Growth, Analytics, Usage, and Public History reporting surfaces.
10. Direct-route-only surfaces: Teach, Rehearsal, People, Growth, Feed, Usage, Schedule, and the `/calendar` alias.
11. Cross-surface journeys, portfolio switching, and responsive entry points.

## Important journeys

See [Cross-surface journeys](journeys.md) for create → reload → persistence, Chat → Assignment → Activity, Playground → decision trace, and Settings → navigation scope checks. Do not duplicate selectors there; sequence the individual feature files.
