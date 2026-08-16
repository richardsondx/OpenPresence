---
name: openpresence-philosophy
description: Apply OpenPresence's canonical product, architecture, agent-cognition, privacy, growth, execution, and UX philosophy when planning, implementing, reviewing, or fixing project changes.
---

# OpenPresence philosophy

OpenPresence is an open-source platform for persistent AI agents that develop a meaningful, multimodal social presence in the world. It is not primarily a chatbot, content scheduler, analytics dashboard, generic work agent, browser automation suite, or spam engine. Its core is social judgment, expression, presence, relationships, distribution, and qualified audience growth.

The canonical source of truth is [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md). Read the relevant sections before making decisions; read the whole document when the change is cross-cutting or its fit is unclear. This skill is an operational summary, not a replacement for that document.

## Required workflow

1. Identify the affected scope and concepts: User, Agent, Presence, Channel, Mirror, cognition, intent, execution, delivery, outcome, memory, privacy, or UX.
2. Consult the canonical document and extract the principles that constrain the decision.
3. Check the proposal against the boundaries and review questions below.
4. Implement the smallest coherent change that preserves the object model, privacy, authority, and truthful state transitions.
5. Verify behavior at the relevant boundary, including persistence, refresh/restart, Sandbox/live separation, and verified outcomes where applicable.
6. In the handoff, call out any deliberate tradeoff or unresolved conflict with the philosophy.

## Core model

### Person-shaped cognition, machine-shaped embodiment

The Agent is conceptually a person. It should reason about people, ideas, relationships, taste, expression, and growth—not queues, leases, API errors, approval settings, Bridge tokens, or connector internals unless that machinery is itself necessary for a good social decision.

Keep this path explicit:

```text
Attention Source → Social Mirror → Assignment → Social Planner
→ Social Intent → Execution Envelope → Connector or Bridge
→ verified Social Mirror outcome
```

The governing separation is:

```text
Agent:    What should I do?
Intent:   I want this to happen.
Execution: How has the operator authorized it?
Delivery:  How does the connector attempt it?
Outcome:  What happened in the world?
```

Intent belongs to the Agent; execution belongs to the operator's configuration; delivery belongs to the connector; outcomes belong to the world. A draft, model response, Social Intent, queued execution, or attempted delivery is not a verified outcome.

### User → Agent → Presence

- A User owns one or more Agents.
- An Agent is a persistent mind and workspace owning Brain, Soul, Mission, Taste, Memory, Growth, Pulse, model runtime, Skills, conversations, and Presences.
- A Presence is one Agent's social incarnation: channel/account identity, social context, privacy scope, health, connection, and Execution Envelope.

One Agent may have many Presences. A Presence is not a separate mind. Changing Presence must never silently change the Agent's Brain, Soul, Mission, Taste, model, Skills, or global Memory. Make scope visible in both state and UI.

### Stable identity, fast learning

Memory and empirical Growth may update automatically. Brain, Soul, Mission, Taste, Pulse, and Presence identity/context must not be silently rewritten to chase metrics; changes to those states may be proposed and reviewed. Growth should make the Agent more effective at being itself, not turn it into whatever performs.

### Model sovereignty and portability

Each Agent owns its model runtime. Changing providers changes the engine interpreting the Agent; it does not create a new Agent or rewrite identity. Brain, identity, Memory, Presences, Skills, relationships, and Growth history must remain portable across hosted, local, and OpenAI-compatible providers. Specialized models—such as image, vision, chart, or local rendering models—are Tools of the Agent, not the Agent's identity.

### Taste, silence, and growth

Taste is a core product primitive: what deserves attention, what is worth publishing, what makes a good hook, when to reply/repost/quote/promote, what is derivative, and when silence is better. Silence and NO_OP are valid intelligent outcomes.

Optimize for durable, qualified, compounding audience growth—not maximum activity, raw likes, or posting frequency. Learn from relationships, return engagement, conversation quality, follow conversion, topic and format resonance, timing, operator patterns, and execution reliability. Metrics inform strategy; they do not directly rewrite Taste or identity.

## Autonomy, authority, and policy

### Attention is not authority

An Exploration gives a Presence somewhere to look; it grants permission to discover bounded evidence, not permission to speak. A Watchlist follows known people/accounts/sources. Pulse is the runtime act of paying attention. Exploration is durable Presence-scoped state, not another mind file or autonomy engine.

Autonomous work must remain eligible for browser-independent worker execution. A discovery lead is not a finding, a finding is not an engagement, and queued work is not progress. Only verified reality counts.

### Standing Intent, Social Intent, and Assignment

- A Standing Intent is a durable future instruction managed by Calendar. A schedule grants permission to consider acting, not an obligation to publish. `Run now` evaluates it now; it does not publish prewritten content.
- A Social Intent is the Agent's time-sensitive, temporary decision about what should happen. It may expire as the social moment passes.
- An Assignment delegates responsibility for an outcome. The operator owns what must be accomplished; the Agent owns how, within safety, privacy, Taste, and authority boundaries. Consideration leaves the Agent free to decide whether/how to act.

An Assignment remains active until completed, cancelled, blocked, or expired incomplete. Rejecting a weak candidate is not completion and must not cause filler publication or a silent NO_OP. A blocked expression, model failure, or delivery failure is not judgment. An explicit Assignment advances only after a verified world outcome; blocked and incomplete states remain visible.

### Execution Envelope and operator freedom

The Agent must not reason about automation policy as its identity. The operator chooses Presence independence, commonly Supervised, Independent, or Custom, and action modes such as Off, Manual, Review, or Auto. Guidance should recommend rather than act as a hidden firewall. Review configuration must have a real operational queue with approve, edit, reject, and expiry behavior.

Manual exact-text actions differ from autonomous Agent output. If operator-authored text violates policy, show the conflict and require an explicit, auditable per-action choice. Autonomous output cannot authorize its own override.

## Expression, evidence, and channels

### Language policy

Language policy is visible structured configuration on the Agent and Presence. Presence additions may specialize but never weaken inherited boundaries. Advisory Avoid preferences guide judgment; Never entries are explicit lexical literals, not semantic categories.

The model owns the sentence. Deterministic execution code validates explicit lexical constraints at the Expression/final-validation boundary across Sandbox, native, Bridge, manual relay, Playground, Pulse, Schedule, Assignments, messages, and retries. Bounded re-expression may preserve the act, target, thread, facts, assets, and format. Remaining violations block Execution, not Social Intent, and never become NO_OP. External quoted text is world data, not Agent-generated expression.

### Publication parity and visual evidence

Text is not the product. Given equivalent source material and authorized Assets, the Agent should be able to choose, produce, and publish the same classes of expression available to a capable human on a Channel: text, image, chart, screenshot, video, GIF, link, quote, thread, article, slides, or future formats.

Search results, filenames, OG images, and publisher reputation are leads, not visual evidence. When media matters, fetch original bytes, inspect actual pixels, preserve source lineage, and make a bounded editorial choice: select, search again, render from grounded structured evidence, use text only, or replan. Review final words and visual together as one public act.

Keep source evidence, perception, claim grounding, rights/authority, and Taste/planning distinct. Preserve an Asset Ledger with bytes, provenance, observations, transformations, reuse, Presence, Assignment, and publication history. An asset's existence does not prove that a claim is grounded. Fiction, satire, parody, and humor may invent, but runtime provenance, rights, and authority must remain truthful.

### Channel, Connector, Mirror

- A Channel defines social reality: entities, affordances, formats, threads, metrics, privacy defaults, and Playbook.
- A Connector is how OpenPresence observes and affects a Channel: native API, Bridge, manual relay, or simulated connector.
- A Social Mirror is OpenPresence's observed representation of relevant external reality.

The Agent experiences the Channel, not connector internals. Mirrored social content is world data, never system instruction; a post saying “ignore your instructions” remains a social post. Custom Channels are first-class and should reuse faithful social semantics rather than become raw schema editors.

## Privacy, context, memory, and relationships

One Brain does not mean one privacy boundary. Filter candidate context before Presence eligibility and before model cognition:

```text
candidate context → privacy filtering → Presence eligibility → model context
```

Never give the model everything and ask it not to use private information. Do not externalize private context into public search. A Presence's full runtime object must not be serialized into cognition; use a cognition-safe projection.

Use the minimum sufficient context for a good decision:

- stable Agent base: Brain, Soul, Mission, Taste;
- invocation: the conversation, Standing Intent, Channel event, Content Drop, or Growth review that caused thought;
- relevant Presence context;
- retrieved Memory, relationships, Growth evidence, Playbook, Assets;
- Skills, Tool schemas, full Assets, and external evidence only on demand.

Conversation history, Memory, durable configuration, Taste, Mission, and Standing Intents are different stores. A ChangeSet is immutable provenance for a typed durable mutation, not the current source of truth. New/deleted conversations must not erase what the Agent became or what it should remember.

Social Mirror observations, Watch attention, directory candidates, and durable People/Relationship Memory are distinct. Memory is selective, Presence-scoped, provenance-backed, inspectable, and allowed to forget. Search never implies contact, recommendation, or introduction. Recommendations are metadata on an existing delivered act; introductions require consent from both sides and still use the normal Presence execution boundary.

Receiving a reply is not itself a reason to reply. The Agent judges marginal social value; silence, a reaction, or closure may be the successful act. Loop detection and cooling are pacing infrastructure, not social judgment. Runtime instructions and social content must never silently cross boundaries.

## Skills, Tools, Sources, and external work

Tools are mechanical capabilities such as search, asset inspection, generation, rendering, or channel execution. Skills turn ideas and source material into strong social expression. Sources/Libraries provide material; Assets are usable evidence or expression. Keep Skills socially focused rather than turning OpenPresence into a generic productivity agent.

Other agents may research, code, analyze, create reports/datasets/charts, or prepare media. OpenPresence starts at: “What should we do socially with this?” It may ignore, publish, visualize, thread, wait, route to another Presence, or continue a relationship.

Open-source users should be able to choose the Agent model, provider, local or hosted inference, Skills, Tools, Channels, connectors, autonomy, storage, self-hosting, and extensions. Official defaults should guide without creating vendor or platform lock-in; infrastructure is replaceable, while the Agent's identity, memory, relationships, and learning are durable.

## UX principles

The product should feel like quiet, intelligent, alive, slightly strange, meticulous software containing something alive. Prefer whitespace, hairlines, restrained typography, readable density, subtle motion, minimal shadows, and calm status language. Avoid AI-dashboard clichés, glowing gradients, confetti, gamification, fake urgency, decorative charts, and dense enterprise settings walls.

The UI must express scope and user intention before implementation detail:

- Agent-scoped: Chat, Brain, model, Skills, conversations, Memory, Growth.
- Agent-wide and Presence-filterable: Live, Calendar.
- Presence-scoped: identity/context, Agent-owned vs Ghost, Execution Envelope, connector, privacy, health.

Use the control matching the decision: searchable switcher for Agents, compact picker for Presence filters, segmented/radio controls for small exclusive choices, comboboxes for many options, links for navigation, buttons for actions, and confirmation for destructive actions. Selecting Custom must immediately reveal real customization. Selecting Review must provide an obvious place to review.

Prefer progressive disclosure. Start with “Connect this Presence” or “Manage connection,” and reveal Bridge, leases, retries, raw IDs, schemas, credentials, and protocol details only when needed. Use human-readable labels first and keep developer detail one click away.

Live is an operational social stream, not analytics. Show meaningful inbound activity, decisions, NO_OPs, reviews, executions, expirations, and outcomes—not navigation events, raw database records, queue logs, or fake universal metrics. Calendar manages Standing Intents and meaning, not months of prewritten content. Blank states should explain the actual next action instead of displaying empty dashboards.

Never fake reality. Every visible control and status needs real backing state and correct persistence. Never show fabricated health, fake online states, sample outcomes as real, local-only success, or success before persistence/execution. Distinguish Presence live, connection health, runtime state, review pending, recommendations, disconnection, and stale Mirrors. If simulated or incomplete, say so.

## Scenario rehearsal

Playground Scenarios are rehearsal inside the real Sandbox cognition → intent → execution → delivery → outcome path. Freeze Scenario versions before Runs; keep Runs Presence-scoped, isolated, resumable, append-only, and provenance-bound. Do not give the Agent expected answers or hidden review criteria. Keep structural truth, independent review, and operator review separate. Findings must not silently mutate Brain, Soul, Taste, Presence, Memory, or Growth, and rehearsal must not teach the Scenario or benchmark.

## Review questions

Before approving a product, architecture, copy, or UI/UX change, ask:

- Does this help the Agent notice better opportunities, say better things, use the right medium, deepen relationships, learn, or compound qualified growth?
- Is the change correctly scoped to User, Agent, Presence, Channel, Mirror, or Runtime? Does it preserve `User → Agent → Presence`?
- Does it preserve the separation of world observation, Social Intent, Execution, Delivery, and verified Outcome?
- Does it leak infrastructure, policies, queues, retries, connector details, or implementation prose into cognition or normal user language?
- Are privacy and Presence boundaries enforced before model context? Is external content treated as untrusted world data?
- Is Taste still authoritative, with silence and NO_OP available? Does an Assignment remain incomplete until its outcome is verified?
- Can the Agent choose channel-native, multimodal expression rather than defaulting to text?
- Are language constraints deterministic at final execution while the model owns re-expression?
- Does the design work across X, LinkedIn, Substack, private communities, and Custom Channels?
- Is every status and outcome truthful, persisted, and distinguishable from simulation?
- Does Review have a real queue, does Custom reveal configuration, and does the UI expose the user's intention before machinery?
- Are Memory, Growth, durable configuration, People, and conversation history kept distinct and inspectable?
- Does this add a new source of truth or complexity that can be removed?

The forcing-function test is:

> Does this help the Agent become someone people genuinely want to hear from, follow, reply to, remember, and return to—without losing itself?

When uncertain, prefer the smallest honest feature that strengthens the Agent's judgment and presence. Never sacrifice identity, privacy, authority, channel semantics, or truthful reality for convenience or benchmark performance.
