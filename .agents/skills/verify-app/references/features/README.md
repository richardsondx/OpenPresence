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
| `/schedule` | Schedule / Assignments | Selected Presence | List/Week, publishing rhythm, durable Assignments, completion contracts |
| `/work` | Agent Work index | Selected Agent | Compact cross-Presence responsibility index; links to Schedule for temporal detail |
| `/calendar` | Schedule alias | Selected Presence | Legacy route; resolves to the canonical Schedule view |
| `/agent` | Agent settings | Selected Agent + connected Presence | One settings home with Identity & Brain and Presence & Autonomy sections |
| `/knowledge` | Knowledge | Selected Agent | Documents, versions, retrieval/access audit |
| `/assets` | Asset library | Selected Agent | Visual evidence, folders, perception, provenance, and reuse |
| Activity → Developer Diagnostics | Technical audit | Selected Presence | Advanced forensic ledger; not a primary route |

## Current navigation shell

The primary desktop shell is Agent-first: a memorable Agent portfolio rail, Chat, Agent Lab, Knowledge, Assets, and one Agent settings home. The Agents header owns `New agent`; the Chat context card in the sidebar owns `New conversation`, while the main chat header stays focused on the permanent Main thread and Presence context. A single topbar context-sidebar toggle opens or collapses the inspector; once open, Attention, Calendar, Analytics, and Agent settings are selected from controls inside that inspector. The topbar has no global `Needs You` notice; actionable runtime boundaries appear in Chat as in-context notices and remain available in the focused Review queue. The active channel is shown as context on the selected Agent, not as a second top-level switcher. Presence-scoped routes remain available for operational detail, but `Activity`, `Review`, `Watching`, and legacy `Playground` are not presented as equal primary products. `Schedule` remains the temporal detail route; `Teach`, `People`, `Growth`, `Feed`, and `Usage` remain reachable by direct route or contextual links.

The persistent left rail owns Agent selection and shows each Agent's active channel inline. The main topbar owns only workspace context controls; it does not duplicate Agent selection or repeat active-channel context. The repeated shell is part of every journey and should be considered when evaluating cognitive load.

Projects are the sidebar's compact representation of durable Assignments. Each Project has one selected Agent avatar and one durable Chat thread. Creating a Project captures a name, intended outcome, and Sandbox/live environment, persists the Assignment, creates its linked thread, and opens that thread. Selecting an existing Project opens the same linked thread; a legacy Project receives its link once on first open. Multi-Agent project invitations and stacked avatars are intentionally deferred until the single-Agent flow is stable.

## Agent-first verification contract

- Selecting an Agent from the left rail changes the active Agent and opens Chat; the selection persists after refresh.
- Chat sends must create a durable operator message before generation, show a working/thinking state while the worker runs, and render the Agent response in the selected thread.
- Agent Lab must clearly identify Sandbox, keep Rehearse and Scenarios together, and never describe simulated output as a live social outcome.
- Opening Attention, Calendar, Analytics, or Agent settings must preserve the current surface and close cleanly without changing the underlying Agent or Presence.

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
