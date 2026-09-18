# OpenPresence feature map

> Reviewed 2026-09-02 against the current source and a fresh harness-owned runtime. This map records the current product surface and the Agent-first workspace direction.

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

The operator manages a portfolio of persistent Agents. Each Agent owns its durable mind and its connected social incarnation; the current product creates/configures that Agent + channel together. The underlying model can retain more than one Presence, but the UI does not make “Add a Channel” a competing object-creation flow.

```text
User
  ├── Agent: Genny
  │     └── Presence: X · @genny
  ├── Agent: Poko
  │     └── Presence: X · @poko
  └── Agent: Ideagrape
        └── Presence: X · @ideagrape
```

The current shell exposes the Agent portfolio and the active connected channel together. There is no separate user-facing channel switcher in the primary workspace: Channel is the environment, Presence is the social incarnation, and Agent is the durable mind.

## Current route inventory

| Route | View | Scope | Current entry / proof boundary |
|---|---|---|---|
| `/` | Onboarding | User → new Agent + first Presence | Create form; persisted Agent/Presence after workspace opens |
| `/activity` | Activity / Today | Selected Presence | `Now`, `Timeline`, `Calendar` tabs; current attention, decisions, outcomes |
| `/review` | Review / Needs You | Selected Presence | Focused operator queue; must not be described as delivery until outcome is verified |
| `/chat` | Chat | Agent conversation, Presence context where applicable | Private operator conversation and receipts |
| `/delegate` | Delegate | Selected Agent / Presence context | Delegation suggestions; selecting one opens Chat with an editable unsent draft |
| `/teach` | Teach | Agent-wide durable judgment | Conversation, proposals/change sets, scope and persistence |
| `/rehearsal` | Agent Lab | Selected Agent with Presence context, Sandbox | Rehearse social situations or run saved Scenarios; never live delivery or durable identity mutation by default |
| `/watching` | Watching / Attention | Selected Presence | Watches and Explorations; attention is not authority to speak |
| `/people` | People / Relationships | Selected Presence | Remembered identities, relationship facts, boundaries, and open loops |
| `/settings` | Agent settings (legacy alias) | Selected Agent + connected Presence | Identity, brain, model/runtime, purpose, attention, autonomy, knowledge access, connection, and deletion |
| `/playground` | Legacy Sandbox practice | Selected Presence, Sandbox | Legacy deep route for simulated cognition-to-outcome inspection; Agent Lab is the primary entry |
| `/feed` | Public history (currently `Activity`) | Selected Presence | Verified public expression and observed outcome evidence; not an inbound feed |
| `/growth` | Growth | Selected Presence | Growth responsibility, evidence, strategy, and review rhythm |
| `/analytics` | Analytics shell | Selected Presence / Agent-wide Usage tab | Growth and Usage tabs; currently duplicates Growth entry content |
| `/usage` | Usage | Agent-wide, Presence-filterable | Provider/request ledger; not provider billing or a social outcome |
| `/schedule` | Schedule / Assignments | Selected Presence | List/Week, one-time or weekly Assignments, exact start times, completion contracts |
| `/work` | Tasks alias | Selected Presence | Same List/Calendar and direct assignment editor as `/schedule` |
| `/calendar` | Schedule alias | Selected Presence | Legacy route; resolves to the canonical Schedule view |
| `/agent` | Agent settings | Selected Agent + connected Presence | One settings home with Identity & Brain and Presence & Autonomy sections |
| `/knowledge` | Knowledge | Selected Agent | Documents, versions, retrieval/access audit |
| `/assets` | Asset library | Selected Agent | Separate Recent discoveries (ephemeral X working memory) and Media library (user-added + intentionally saved visuals), with visual evidence, folders, perception, provenance, and reuse |
| Activity → Developer Diagnostics | Technical audit | Selected Presence | Advanced forensic ledger; not a primary route |

## Current navigation shell

Reviewed 2026-09-17: one Agent switcher and six daily destinations — Chat, Delegate,
Tasks, People, Growth, Media. Desktop uses a labeled vertical navigation; mobile uses the
same labeled icons in a bottom dock. Mobile's header menu opens Agent selection and
settings; the dock hides while the software keyboard is open so the composer retains
space. Teach agent, Watchlist, Test agent, and Agent settings are in Agent menu.
Knowledge remains an Agent-owned surface, but is intentionally not a daily Agent-menu
destination. Test agent opens `/rehearsal` and retains the Sandbox boundary.

Tasks uses `/schedule` and the existing assignment editor with List/Calendar modes.
`/work` and `/calendar` resolve to this same surface. Task details open directly as a
side inspector or mobile sheet. Media uses `/assets` and remains Agent-owned.

Chat's compact Agent identity header replaces the oversized Chat heading. The plus
button (`Attach media or files`) opens a native dialog offering upload or existing
eligible Agent media. Closing it preserves the draft. User messages, tool receipts,
and responses preserve durable ordering and retry behavior. Context inspectors retain
the selected Agent; Escape closes sheets and restores focus.

Delegate is a discovery surface for handing responsibility to the Agent. Its rows
are conversational and grouped by outcome. Selecting a row changes to Chat and
prefills the real composer; no operator message, Assignment, or public action exists
until the operator submits the draft.

Regression proof: `tests/e2e/responsive-workspace.spec.ts` covers both viewport
projects, five destinations, legacy Tasks links, composer placement, media dialog
recovery, durable chat/reload, and setup access.

## Agent-first verification contract

- Selecting an Agent from the left rail changes the active Agent and opens Chat; the selection persists after refresh, including when the URL does not yet carry an Agent ID.
- Chat sends must create a durable operator message before generation, show a working/thinking state while the worker runs, and render the Agent response in the selected thread. Public activity being paused does not disable private Chat; shared-context Chat notes are excluded from ambient Attention until explicitly delegated.
- Agent Lab must clearly identify Sandbox, keep Rehearse and Scenarios together, and never describe simulated output as a live social outcome.
- Agent Lab → Scenarios must render built-in and Presence-owned Scenarios from the rehearsal projection; creating a Scenario from a prompt, starting an isolated Run, opening Review, and refreshing must preserve the selected Scenario and Run evidence.
- Opening Attention, Calendar, Analytics, or Agent settings must preserve the current surface and close cleanly without changing the underlying Agent or Presence.

## Feature areas

- [Onboarding and workspace identity](onboarding.md)
- [Activity and verified outcomes](activity.md)
- [Review and operator queue](review.md)
- [Chat and Teach](chat-teach.md)
- [Delegate](delegate.md)
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
