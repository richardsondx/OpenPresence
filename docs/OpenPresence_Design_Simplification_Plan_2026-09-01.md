# OpenPresence design simplification plan

**Status:** DESIGN CHANGE  
**Date:** 2026-09-01  
**Audience:** OpenPresence product, design, engineering, and any future reasoning model reviewing the direction

## Executive conclusion

OpenPresence has a strong social-agent engine but currently presents it as an operator console. The app exposes too many nouns, destinations, settings, operational states, and overlapping paths before the user experiences the magic:

> **Choose an Agent, give it a place to exist, tell it what matters, and let it make good social decisions.**

The most important correction is to design for the actual portfolio model:

```text
User
  ├── Agent: Genny
  │     └── Presence: X · @genny
  ├── Agent: Poko
  │     └── Presence: X · @poko
  └── Agent: Ideagrape
        └── Presence: X · @ideagrape
```

The selected Agent should be the primary workspace context. The selected Presence should be the social incarnation inside that workspace. `Channel` should name the social environment (X, LinkedIn, a community), not the thing the operator uses to switch between Agents or social accounts.

The target experience is closer to a calm, agent-oriented conversation workspace than a social-media admin dashboard. Chat should be the easiest way to ask, teach, delegate, inspect, and recover. A small set of focused surfaces should handle the recurring jobs. Advanced infrastructure should remain inspectable, but appear only when it helps the user make a meaningful decision.

This is a structural simplification, not a visual refresh. The goal is to remove or combine concepts while preserving authority, privacy, truthful state, verified outcomes, and the Agent → Presence boundary.

## Evidence and review method

### Evidence inspected

- Canonical philosophy: [OpenPresence Vision & Platform Philosophy](OpenPresence_Vision_and_Platform_Philosophy.md).
- Design-simplifier tenets, ladder, rubric, critical journeys, and durable decisions in the project skill.
- Current route and view declarations in [`app/client-page.tsx`](../app/client-page.tsx:201), [`lib/types.ts`](../lib/types.ts:1).
- Current switchers and shell in [`app/client-page.tsx`](../app/client-page.tsx:1558), [`app/client-page.tsx`](../app/client-page.tsx:1789), and [`app/client-page.tsx`](../app/client-page.tsx:2297).
- Current view implementations: Activity, Review, Playground, Watching, Usage, Assets, Knowledge, Teach, Chat, Rehearsal, Public History, Schedule, Manage Agent, and Presence Settings in [`app/client-page.tsx`](../app/client-page.tsx:2054).
- Dedicated People and Growth implementations in [`app/people-view.tsx`](../app/people-view.tsx:42) and [`app/growth-view.tsx`](../app/growth-view.tsx:736).
- Existing product audit: [`docs/OpenPresence_Product_Audit_Report.md`](OpenPresence_Product_Audit_Report.md).
- Fresh harness-owned runtime after reset and onboarding on 2026-09-01. All current routes were opened and their visible headings, controls, and empty states were inspected.

### Evidence IDs used below

| ID | Observed evidence |
|---|---|
| E1 | The application defines 19 view values including direct-route-only views such as Teach, Rehearsal, People, Feed, Growth, Usage, Schedule, Brain, and Presence; only a subset is in the primary sidebar. |
| E2 | The shell labels the Presence switcher `Channels`, its button `Switch Channel`, and its menu `Your Channels`, while a separate `Your Agents` switcher exists. This conflicts with the actual multi-Agent model. |
| E3 | A fresh Activity page contains Now/Timeline/Calendar plus a Presence summary, Sandbox setup, autonomy budgets, verified activity metrics, pulse state, recent activity, operating status, attention rail, and Assignments preview. It also links to several overlapping Activity sub-surfaces. |
| E4 | Presence Settings contains 12 section destinations and exposes identity, style, public self, Ghost, destination, request access, DMs, brief, sources, rhythm, attention intensity/budgets, publishing initiative, language, media, asset reuse, execution matrix, effective capabilities, knowledge access, connectors, and deletion. The `Custom` execution matrix is visible by default. |
| E5 | `/analytics` renders a Growth/Usage tab shell, while `/growth` independently renders the Growth page. `/feed` renders an Activity-labelled public-history page. `/calendar` resolves to Schedule. These are overlapping names and destinations. |
| E6 | A fresh runtime shows empty states for every major surface, including “No operator decisions are waiting,” “No active Watches,” “No one remembered,” “0 documents,” “0 visuals,” “No public expression yet,” and “No scheduled responsibilities.” Empty-state copy is a valuable basis for a calmer product. |
| E7 | The existing philosophy and audit explicitly require preserving User → Agent → Presence, Sandbox/live separation, silence/NO_OP, privacy filtering, operator authority, and distinct observation/intent/execution/delivery/outcome truths. These are not simplification targets. |

### What the attached images contribute

The attachments are treated as reference examples only. They illustrate two useful interaction patterns: a small number of powerful choices with progressive disclosure, and a conversation-led agent workspace where the agent is the primary object. They do not override repository instructions, product philosophy, or runtime evidence.

## First-principles product model

### The user’s real job

The operator is not trying to configure a collection of independent automations. They are trying to manage a portfolio of social Agents:

- Know which Agent is active and what it is responsible for.
- See which Agent or Presence needs attention.
- Talk to an Agent in natural language.
- Give it a responsibility without scripting the method.
- Approve only the actions that genuinely need a human decision.
- Understand what it noticed, chose, published, learned, or deliberately left alone.
- Improve the Agent’s judgment over time without rewriting its identity accidentally.

### The product loop

The everyday product loop should be visible as meaning, not machinery:

```text
Notice → Decide → Act or stay quiet → Verify what happened → Learn
```

The implementation may retain the more precise chain:

```text
Attention Source → Social Mirror → Assignment / Social Planner
→ Social Intent → Execution Envelope → Delivery → verified Outcome
```

The first line belongs in the primary UI. The second belongs in “Why this happened,” technical diagnostics, and developer documentation.

### What must not be simplified away

These boundaries are durable product foundations:

- User → Agent → Presence hierarchy.
- Presence-scoped privacy and context filtering.
- Supervised, review, manual, and automatic authority choices.
- Sandbox/rehearsal isolation from live reality.
- Observation, Social Intent, Execution, Delivery, and verified Outcome as separate truths.
- Silence and `NO_OP` as valid social judgment.
- Assignment completion as verified responsibility, not merely queued work.
- Identity files and durable meaning remaining protected and proposal-based.
- Provenance, media perception, rights, and source grounding where they affect trust.
- Recovery that is scoped, reversible, and truthful.

The simplification principle is: **hide complexity until it matters; do not delete safety or truth.**

## Target information architecture

### Global portfolio layer

The product should open into an Agent portfolio context when multiple Agents exist. The user should see Genny, Poko, Ideagrape, and any other Agents as first-class items with a compact health/attention summary.

Suggested global entry:

- **Agents** — portfolio list, creation, search, and cross-Agent review count.
- **Needs you** — one global review inbox across Agents and Presences, filterable without losing scope.

Selecting an Agent opens that Agent’s workspace. The global layer should not become an analytics dashboard; it exists to answer “which mind needs me?”

### Selected-Agent workspace

Use a small everyday navigation set:

| Surface | User question | Current sources combined |
|---|---|---|
| Home | What is this Agent doing, and what matters now? | Activity now, status, recent history, learning summary |
| Chat | What do I want to ask, teach, or delegate? | Chat, Teach, direct instructions, contextual handoffs |
| Review | What needs my judgment? | Review plus Activity Needs You and relevant recovery |
| In the world | What has this Agent actually put into public reality? | Feed plus verified public history |
| Attention | What is this Agent noticing and following? | Watching plus selected relationship entry points |
| Relationships | Who does this Agent remember and why? | People plus relationship context |
| Practice | How can I safely try a social moment? | Playground plus Rehearsal |
| Settings | How do I care for the Agent and its Presences? | Manage Agent plus Presence care, progressively disclosed |

Advanced surfaces should be reachable from Settings or contextual details:

- Knowledge and Assets remain Agent workspaces but can be surfaced in Chat/Practice when relevant.
- Rhythm is the plain-language entry to Schedule/Assignments.
- Learning is the plain-language entry to Growth.
- Usage and Technical Diagnostics are advanced operator/developer views.

### Presence context

The selected-Agent header should show the selected Presence as a child context, for example:

```text
Agent: Genny     Presence: X · @genny     Sandbox
```

For an Agent with multiple Presences, a Presence picker should list “X · @genny,” “LinkedIn · Genny,” and “Founder Community · Genny,” not merely channel names. For the current example, Genny, Poko, and Ideagrape are three Agent rows, each with an X Presence row beneath it.

Recommended language:

- `Agent` — persistent mind/workspace.
- `Presence` — where that Agent exists and who it is there.
- `Channel` — X, LinkedIn, Substack, community, or custom social environment.
- `Connection` — how the Presence reaches that Channel.
- `Needs you` — the operator queue.
- `In the world` — verified public history.

Retire `Channels` as the name of the Presence switcher. Keep “Channel” inside Presence details and connection setup.

## Default operating model

### Safe starting defaults

Every new Agent/Presence should begin with a coherent, inspectable default:

- Sandbox first.
- One short identity/purpose sentence.
- Balanced attention.
- Surface the best opportunity to the operator.
- Supervised authority.
- Original posts and replies in Review.
- Likes, follows, reposts, quotes, and private messages off or review-gated according to the least-surprising safe default.
- Quiet hours derived from local time, with an easy override.
- One recommended model choice, not a provider/quality matrix.

The user should experience this as “Genny is ready to practice,” not as a blank configuration wall.

### One primary autonomy choice

The default user-facing choice should be:

1. **Ask before acting** — recommended; show drafts and decisions for approval.
2. **Act independently where safe** — explain that hard boundaries, privacy, connection health, and review-required cases still stop or escalate.

The existing four modes (`Off`, `Manual`, `Review`, `Auto`) remain available under Advanced per capability. The high-level choice must not erase their semantics; it should compile into a visible preset and preserve an escape hatch.

### Conversation as the control plane

The common path should allow messages such as:

- “What needs your attention today?”
- “Keep up with AI founders, but don’t chase engagement.”
- “Work toward one useful post this week, but stay quiet if nothing is strong enough.”
- “Show me the reply you would send to this.”
- “Remember that I dislike hype.”
- “Let Poko operate independently on X, but ask before DMs.”

The system should turn durable requests into typed proposals, Assignments, Attention sources, or Presence changes. The interface should show the result and scope explicitly instead of making the operator find the corresponding settings page.

## Page-by-page review

The following inventory covers every current user-facing route and the advanced technical surface. Each row records the material simplification decision; low-value cosmetic observations are intentionally omitted.

| Current route | Current job | Material friction | Recommendation | Priority |
|---|---|---|---|---|
| `/` | Create an Agent and first Presence | Asks for name, description, handle, color, identity mode, and channel framing before the first moment; the form feels like a form rather than a welcome | Keep name, purpose, and optional handle; derive safe defaults; move advanced identity/channel choices to the activation step | P0 |
| `/activity` | Know what is happening now | Home, operational console, history, queue preview, attention rail, assignment preview, budgets, and recovery are combined; many next actions compete | Reframe as Home; lead with one current story, Needs you, recent reality, and next check; move pipeline, budgets, raw activity, and sub-tabs behind details | P0 |
| `/review` | Decide what needs human judgment | Correct focused empty state, but currently selected-Presence and separate from the global portfolio; approvals may be discovered through Activity | Preserve focused queue and make it the canonical global/Agent inbox with explicit Agent/Presence scope | P0 |
| `/chat` | Talk with the Agent | Chat, teaching, delegation, and social drafting are adjacent but not clearly expressed as modes; context/sidebar concepts are advanced | Make Chat the primary control plane with inline actions and explicit scope; expose Teach/Draft/Delegate as lightweight modes or message intents | P0 |
| `/teach` | Change durable judgment | Separate route and context sidebar teach a second vocabulary; durable change semantics are not always apparent | Combine into Chat; after each relevant message offer “For now,” “Remember this,” or “Make it a rule,” with typed receipt | P0 |
| `/rehearsal` | Practice a social moment safely | Separate from Playground but shares a rehearsal job; user must understand two practice concepts | Combine with Practice as a clean Presence-scoped mode; preserve Sandbox boundary and feedback | P1 |
| `/watching` | Tell the Agent what to notice | Watchlist, Explorations, source strategy, resource cost, findings, and authority boundaries are all introduced together | Rename to Attention; ask who/what/why first; default to “Bring me the best opportunities”; hide resource mechanics | P0 |
| `/people` | Understand relationships | Direct route, not primary nav; remembered facts and actions feel database-like; scope is easy to miss | Rename to Relationships; lead with relationship summaries and open loops; expose raw facts/provenance on demand | P1 |
| `/settings` | Care for one social incarnation | Largest configuration wall; 12 sections and multiple connector/authority layers; `Custom` matrix visible by default | Rename to Presence; show Identity, Purpose, Attention, Freedom, Connection; move advanced controls to a disclosure | P0 |
| `/playground` | Rehearse behavior in a simulated world | Four modes plus control-room event injection, time controls, traces, curation, trials, and scenarios are visible at once | Rename to Practice; start with three guided moments (reply/post/stay quiet); retain advanced lab modes for power users | P1 |
| `/feed` | See verified public expression | Called Activity and overlaps with Activity Timeline/Calendar; metric cards compete with actual expressions | Rename to In the world/Public history; lead with posts and verification, make metrics secondary | P1 |
| `/growth` | Understand what is working | Scoreboard, follower target, action counts, autonomous proof, deep evidence, and review rhythm create metric/operator load | Rename to Learning; lead with qualitative evidence and next insight; retain raw Growth evidence under Advanced | P1 |
| `/analytics` | Inspect reporting | A Growth/Usage tab shell duplicates existing destinations and adds a reporting noun | Remove as a primary surface; route to Learning or Usage directly; preserve alias only if needed | P0 |
| `/usage` | Understand resource spend | Agent-wide ledger and provider/request vocabulary are advanced and not a daily job | Move under Advanced; show a small attention-budget summary in Presence/Settings | P1 |
| `/schedule` | Give durable responsibility and timing | Publishing rhythm, Assignments, plans, layers, recurrence, time windows, and prompt creation resemble project management | Rename to Rhythm; one plain-language creation flow; show ongoing responsibilities and quiet windows, not internal layers | P1 |
| `/calendar` | Legacy schedule entry | Duplicate name and route for same view | Keep redirect/alias; never show as a separate navigation concept | P0 |
| `/agent` | Configure the selected Agent | Model matrix, Skills, capabilities, provider access, language, seven mind files, proposals, and deletion share one page | Rename to Agent settings; four human cards first; exact models/files/providers advanced | P0 |
| `/knowledge` | Add source material safely | Documents, retrieval checks, versions, and audit are presented as a repository | Keep as Agent Knowledge; use purpose/privacy/access templates and contextual entry from Chat | P1 |
| `/assets` | Maintain visual evidence | Upload, search, folders, analysis, provenance, reuse, and selection are all top-level; the useful moment is usually inside a post | Keep library for management, but surface asset search/inspection inline when the Agent is composing | P2 |
| Activity → Developer Diagnostics | Diagnose runtime truth | Forensic ledger, facets, routes, telemetry, and recovery details are unsuitable for general operators | Keep as Developer Diagnostics under Advanced; never mix it into Home or Review | P2 |

## High-leverage design changes

### DESIGN CHANGE 1 — Make the portfolio model the shell

**USER JOB** — Manage several distinct AI Agents and quickly know which one needs attention; e.g. Genny, Poko, and Ideagrape each operating their own X Presence.

**CURRENT FRICTION** — E1 and E2. The shell contains separate Agent and Presence switchers, but the Presence switcher is called `Channels`, has `Switch Channel` accessibility labels, and says `Your Channels`. The operator must infer whether “Jenny” is an Agent, a Presence, or a Channel. The current nav is primarily Presence-oriented even though the user’s top-level job is Agent portfolio management.

**ROOT DESIGN PROBLEM** — The UI’s nouns do not match the durable object hierarchy. The current shell makes a Presence/Channel distinction more prominent than the Agent portfolio, and it treats each view as if one Presence were the product.

**RECOMMENDATION** — Make Agent the primary global context. Rename the current Agent switcher to `Agents`/`Switch Agent`; rename the current Presence switcher to `Presences`/`Switch Presence`; show Channel as a child fact. Add a portfolio landing state when multiple Agents exist, and a cross-Agent Needs You count.

**SIMPLIFICATION** — Reframe and combine. One global context model replaces competing “Channels”/“Agents” interpretations. The operator no longer translates a social environment into a mind or account.

**BEFORE → AFTER** — `Channels → Jenny → Activity` becomes `Agents → Genny → Presence: X @genny → Home`. Switching Genny to Poko changes the durable mind context; switching Genny’s Presence changes only the social incarnation. The header always states both.

**PRECEDENT** — ChatGPT workspaces/projects and creative tools commonly use a clear workspace switcher; Grok Bot’s task list makes each persistent bot a first-class object. The context fit is the object-level clarity, not copying their exact shell.

**TENET** — Preserve User → Agent → Presence; one product, one mind; scope before infrastructure.

**TRADEOFF** — A user with one Agent sees one extra layer in the header. This costs a small amount of visible hierarchy in exchange for eliminating catastrophic scope confusion in multi-Agent use.

**CONFIDENCE** — High. Directly evidenced by source labels and the user’s stated operating model.

### DESIGN CHANGE 2 — Replace Activity’s control-room homepage with a calm Home

**USER JOB** — Open the app and understand what matters now without operating the runtime manually.

**CURRENT FRICTION** — E3 and E6. The default page combines “Jenny at a glance,” Sandbox setup, “Autonomy today” budgets, verified action counts, pulse state, recent activity, operating status, a live attention order, Assignments preview, and multiple handoffs. Empty state is calm, but the information hierarchy is not.

**ROOT DESIGN PROBLEM** — Activity is asked to answer four questions at once: what is happening, what happened, what needs the user, and how the machine works. Its architecture is honest but not prioritized.

**RECOMMENDATION** — Make Home a short, story-shaped view:

1. `Now` — “Genny is looking,” “Genny is waiting for you,” “Genny chose to stay quiet,” or “Genny is ready.”
2. `Needs you` — only decisions, approvals, and material blockers.
3. `Recently in the world` — verified public acts and meaningful inbound events.
4. `What it is paying attention to` — a concise explanation of watches/Explorations.
5. `Learning` — one recent evidence-backed change or insight.

Keep Activity details, Agenda, Assignments, Requests, Operating Health, and Developer Diagnostics in progressive disclosure or focused destinations.

**SIMPLIFICATION** — Remove duplicate previews from the first level; combine related status into one Home story; hide raw budgets and pipeline stages; inline the next useful action.

**BEFORE → AFTER** — A new operator reads a dashboard of budgets, pulse, activity, queue, and assignments. The new operator sees “Nothing needs you,” one sentence about what Genny is watching, and one clear next action such as `Practice a moment`, `Review draft`, or `Ask Genny`.

**PRECEDENT** — Agent workspaces and task-oriented chat products lead with current work and pending decisions, then disclose execution detail. The fit is reducing scan cost while retaining an inspectable trail.

**TENET** — One obvious next action; live is not analytics; quiet software, living presence.

**TRADEOFF** — Users lose immediate visibility into raw resource usage and every internal event. Those remain one click away; the gain is that the Agent feels alive rather than busy.

**CONFIDENCE** — High. Runtime evidence and the prior audit both demonstrate the overlap.

### DESIGN CHANGE 3 — Make Review the one operator inbox

**USER JOB** — Approve, reject, edit, or recover only what requires human judgment across the Agent portfolio.

**CURRENT FRICTION** — `/review` is focused and correct, but it is selected-Presence scoped while Activity contains Needs You, execution ledger, requests, failures, and recovery handoffs. A user can encounter the same responsibility through multiple surfaces.

**ROOT DESIGN PROBLEM** — Operator judgment is treated as a page and also as a collection of embedded tabs. The product has not chosen one canonical queue boundary.

**RECOMMENDATION** — Make `Needs you` a global inbox with clear grouped scope:

```text
Needs you · 3
  Genny · X @genny — approve reply to Maya
  Poko · X @poko — connection needs attention
  Ideagrape · X @ideagrape — review uncertain media
```

Selecting an item opens the focused decision context. Review remains distinct from Home, Schedule, and Practice, but all handoffs land on the same queue item.

**SIMPLIFICATION** — Combine competing approval destinations; infer Agent/Presence from the item; inline the reason and exact next action; keep recovery grouped by root incident.

**BEFORE → AFTER** — “Find the Review page or Activity tab, then hunt for the action” becomes “Open Needs you, choose the item, decide, and return to the portfolio.”

**PRECEDENT** — Email inboxes, task inboxes, and code review queues work because pending decisions have one canonical home. The fit is decision ownership, not generic inbox styling.

**TENET** — Review is focused operator judgment; the operator is an escalation boundary, not a retry button.

**TRADEOFF** — Presence-local Review pages become a filtered view of the global queue. This slightly reduces local autonomy of navigation but materially improves multi-Agent management.

**CONFIDENCE** — High for consolidation; Medium for exact global filtering behavior until multi-Agent usage is observed.

### DESIGN CHANGE 4 — Turn Presence Settings into a four-decision setup

**USER JOB** — Make one social incarnation ready to exist, with a clear purpose and safe authority.

**CURRENT FRICTION** — E4. The page presents 12 section links and a long sequence of independent controls. It exposes technical connection routes, infrastructure budgets, media policy, language validation, reuse cooldown, capability matrix, knowledge ceilings, and deletion beside identity and purpose. The visible `Custom` matrix makes advanced autonomy feel like the default.

**ROOT DESIGN PROBLEM** — Durable Presence care and rare operator/developer controls share the same information level. Explanatory prose cannot fully compensate for too many decisions.

**RECOMMENDATION** — Make the default Presence surface four cards:

1. **Identity** — name, handle, who people meet, AI disclosure.
2. **Purpose** — what it is here to contribute, audience, topics, keep-out boundary, voice.
3. **Attention** — who/what to notice and when; default Balanced.
4. **Freedom** — Ask before acting / Act independently where safe.
5. **Connection** — Connect X / Manage connection, with route selection inferred.

The fifth card is operationally necessary but should be a simple connection state, not a connector menu. Advanced disclosure contains per-capability modes, API/Chrome/Bridge/manual relay, budgets, language/media/reuse policy, knowledge access, effective capability manifest, and deletion.

**SIMPLIFICATION** — Remove settings navigation from the common path; combine related sections; default/infer connection routes; hide implementation choices; reframe execution envelope as Freedom.

**BEFORE → AFTER** — “Read 12 settings labels and choose among many mechanisms” becomes “Tell us who this is, why it exists, how much it should notice, and whether it should ask.”

**PRECEDENT** — The attached ChatGPT approval pattern demonstrates a small set of authority choices with a learn-more path. The fit is a bounded autonomy preset, not the exact wording or permission model.

**TENET** — Simple first, complexity on demand; guidance, not a firewall; Presence Settings should describe one social incarnation.

**TRADEOFF** — Expert users must open Advanced to reach exact capability and connector controls. This is intentional progressive disclosure; no authority is removed.

**CONFIDENCE** — High. The control inventory is directly observable in source and runtime.

### DESIGN CHANGE 5 — Make Chat the conversational control plane

**USER JOB** — Ask an Agent something, teach it, request work, draft social expression, or understand a decision in natural language.

**CURRENT FRICTION** — Chat, Teach, Rehearsal, and parts of Activity/Playground divide related intentions across routes. The user must know whether a message is a question, a lesson, a draft request, or a rehearsal. Scope and durable-change semantics are advanced or indirect.

**ROOT DESIGN PROBLEM** — The product models different runtime operations as separate destinations even though the operator’s mental model is “talk to this Agent about social work.”

**RECOMMENDATION** — Keep one primary Chat surface with lightweight modes or inferred intents:

- Talk — answer and discuss.
- Teach — create a proposal or memory with an explicit receipt.
- Delegate — create/revise an Assignment with a completion contract.
- Draft — prepare a social act for review without delivering it.
- Practice — enter Sandbox when the user wants simulation.

Do not make the user select a mode when the sentence makes the intent clear; show the inferred scope and let the user correct it.

After a message, present explicit outcomes: `For this conversation`, `Remember this`, `Make this a rule`, `Give this a responsibility`, or `Practice this`.

**SIMPLIFICATION** — Combine routes; infer intent from conversation; inline typed durable outcomes; hide context attachments and model details until requested.

**BEFORE → AFTER** — “Navigate to Teach, Rehearsal, Schedule, or Activity” becomes “Ask Genny, then choose the one meaningful outcome.”

**PRECEDENT** — ChatGPT and Grok Bot show the power of a single conversation entry point for varied work. OpenPresence must add explicit social scope, approval, and verified-outcome receipts because social actions affect public reality.

**TENET** — Conversation as configuration; the Agent should not think in infrastructure nouns; one obvious next action.

**TRADEOFF** — Mode boundaries become less visible. Strong inline receipts and scope labels are required so Chat does not become an ambiguous universal surface.

**CONFIDENCE** — Medium-High. Strongly supported by product philosophy and precedent; exact inference behavior requires conversation testing.

### DESIGN CHANGE 6 — Combine Watching and People around attention and relationships

**USER JOB** — Help an Agent notice the right people and topics, then maintain meaningful relationship context.

**CURRENT FRICTION** — Watching has All/People/Explorations/Watchlist tabs and teaches search strategy, findings, and resource concepts. People is a separate direct route with Remembered/Following/Watched/Boundaries filters and fact-level inspection. The conceptual connection is present but the user must assemble it.

**ROOT DESIGN PROBLEM** — Attention sources and relationship memory are modeled correctly but presented as adjacent databases rather than a human social loop.

**RECOMMENDATION** — Use two plain-language sections under one Attention/Relationships family:

- **Attention** — “Keep up with these people,” “Notice these topics,” “Explore this question.” Default outcome: bring the best opportunity to the operator.
- **Relationships** — “People this Presence knows,” “What matters about them,” “Open loops,” “Boundaries.”

When a Watch identifies a person, offer `Remember this person` only when meaningful evidence exists; do not auto-create relationship memory. Show facts as a concise relationship summary, with provenance behind `Inspect memory`.

**SIMPLIFICATION** — Reframe Watchlist/Exploration into user questions; combine duplicated filters; hide raw evidence and resource costs; inline People from relevant attention context.

**BEFORE → AFTER** — “Create an Exploration, inspect findings, then navigate to People” becomes “Tell Genny who or what matters; review the useful opportunity; remember a relationship only when warranted.”

**PRECEDENT** — Relationship-aware CRMs and social inboxes summarize open loops before exposing contact records. The fit is the summary-first relationship model, while preserving OpenPresence’s privacy and provenance boundaries.

**TENET** — Attention is not authority; people are relationships, not prospect rows; privacy travels with mirrored objects.

**TRADEOFF** — Advanced operators see fewer raw findings at first. Search, hydration, evidence, and relationship facts remain inspectable on demand.

**CONFIDENCE** — Medium-High. The need is evidenced by route duplication and philosophy; relationship summary content needs real user validation.

### DESIGN CHANGE 7 — Replace Schedule/Analytics/Growth sprawl with Rhythm and Learning

**USER JOB** — Give each Agent meaningful responsibility and understand whether its social work is becoming more effective.

**CURRENT FRICTION** — Schedule combines flexible publishing rhythm, Assignments, plans, layers, recurrence, exact times, and prompt creation. Growth has follower goals, autonomous proof, evidence, strategy, and review rhythm. Analytics wraps Growth and Usage. Feed duplicates public history. E5 confirms overlapping reporting nouns.

**ROOT DESIGN PROBLEM** — The UI exposes internal planning and reporting abstractions instead of the two human questions: “What should it keep working toward?” and “What is it learning?”

**RECOMMENDATION** —

- **Rhythm** — one-time request, ongoing responsibility, and quiet/consideration windows. Use `Ask it to keep working toward something`; show a concise completion contract before activation.
- **Learning** — qualitative evidence-led insights: meaningful conversations, returning people, useful outcomes, operator feedback, and what the Agent is testing. Put follower counts and charts under Evidence.
- **In the world** — actual verified public history, separate from Learning.
- Remove Analytics as a wrapper; link to Learning or Advanced Usage directly.

**SIMPLIFICATION** — Rename/reframe; combine duplicate reporting surfaces; default normal rhythm; hide internal layers; separate responsibility from public history and learning.

**BEFORE → AFTER** — “Create a plan, inspect Assignment layers, compare Growth metrics, then infer outcome” becomes “Ask Genny to keep working toward an outcome, then see what the world taught it.”

**PRECEDENT** — Strong task products separate commitments from reporting; growth tools are most useful when they turn metrics into decisions rather than dashboards. The fit is evidence-led interpretation, not removing measurement.

**TENET** — Assignment is responsibility for an outcome, not a script; Growth should make the Agent more effective at being itself; Live is not analytics.

**TRADEOFF** — Users who want operational planning lose a first-level calendar/layer view. Advanced Schedule remains available for exact timing and debugging.

**CONFIDENCE** — High for removing Analytics duplication; Medium for the exact Learning IA because the product’s growth model is still evolving.

## Cross-cutting interaction rules

### Scope must be persistent and readable

Every page and meaningful card should show one compact line:

```text
Agent: Genny · Presence: X @genny · Sandbox
```

Agent-wide surfaces should say `Agent: Genny · All Presences`; global queues should say `All Agents` and show item-level scope. Never require an operator to infer scope from a selected avatar.

### Status language should translate machinery

| Internal truth | Primary UI | Details disclosure |
|---|---|---|
| Social Mirror stale | We have not checked X recently | Mirror freshness, last sync, connector |
| Awaiting review | Ready for your decision | Intent, target, authority, evidence |
| Delivery failed | X did not confirm this action | Connector route, retry/reconciliation |
| NO_OP | Stayed quiet; nothing useful to add | Candidate and judgment explanation |
| Deferred by resource ceiling | Paused within your attention budget | Exact usage and ceiling |
| Awaiting execution | Approved; waiting to act | Delivery route and lease |
| Verified outcome | X confirms it happened | External reference and outcome evidence |

Truth should become calmer, not less precise.

### Prefer inline receipts over destination changes

When Chat creates a proposal, Assignment, Watch, Review item, or draft, show the receipt in Chat with a link to the canonical surface. Do not make the user guess whether a conversational promise persisted.

### Make high-risk actions reversible

- Draft before live publish where authority requires it.
- Approve, edit, reject, or expire from one queue item.
- Offer undo or pause where safe.
- Reconcile uncertain public writes before retry.
- Preserve original evidence after deletion or recovery.

Do not add confirmation dialogs simply because a flow is complex; make the default state safe and the consequence explicit.

### Do not use counts as the primary story

Counts are evidence, not the product. The primary UI should prefer:

- “Two conversations became ongoing relationships.”
- “Genny is finding better evidence before replying.”
- “Poko stayed quiet on three weak opportunities.”

Then allow the operator to inspect the exact counts, windows, and limitations.

## Proposed default journeys

### First Agent

1. Welcome: “Give your AI a place to exist.”
2. Name the Agent and describe what it should be useful for.
3. Create the first Presence: channel, name, handle.
4. Choose `Ask before acting` as the default.
5. Practice one reply/post/stay-quiet moment in Sandbox.
6. Teach one preference with a visible scope and receipt.
7. Connect the live channel when ready.

### Daily portfolio management

1. Open portfolio Home.
2. See Genny, Poko, Ideagrape with calm status and Needs You counts.
3. Select the Agent that needs attention, or ask the global Agent inbox.
4. Read one current story, one pending decision, and one recent learning signal.
5. Take the single obvious action; return to portfolio.

### Create social responsibility

1. Tell the Agent in Chat what outcome to pursue.
2. Agent derives a concise completion contract.
3. User accepts or corrects the contract.
4. Agent works using its own method.
5. Review appears only at the authority boundary.
6. Completion advances only from verified outcome or a truthful terminal state.

### Improve judgment

1. Practice or inspect a real decision.
2. Give one-tap feedback: `Good fit`, `Not my voice`, `Too much`, `Should have stayed quiet`, `More like this`.
3. Show whether feedback is conversation-only, evidence, or a proposal.
4. Never silently rewrite protected identity.

## Delivery plan

### Phase 0 — Baseline and naming safety

No behavior redesign yet. Establish the vocabulary and regression boundary.

- Replace shell labels `Channels` / `Switch Channel` / `Your Channels` with `Presences` / `Switch Presence` / `Your Presences`.
- Add persistent Agent + Presence + Channel/environment scope line.
- Preserve route aliases and add route-level telemetry for where users enter and exit.
- Add multi-Agent fixture with Genny, Poko, and Ideagrape, each with X Presence.
- Add verification for Agent → Presence → Channel switching and cross-Agent Review scope.
- Keep current Feature Map updated with every route, selector, and proof boundary.

**Exit evidence:** An operator can switch among three Agents, understand the selected Presence, and reload without scope drift.

### Phase 1 — Make the everyday loop coherent

- Build portfolio landing state and per-Agent Home.
- Make Needs You the canonical queue; route Activity/Review/Recovery handoffs there.
- Consolidate Chat/Teach/Delegate receipts without deleting underlying typed mutations.
- Move Activity diagnostics and raw budget/event details behind details.
- Rename Feed to In the world/Public history and remove its Activity ambiguity.
- Remove Analytics as a first-level wrapper while keeping direct Growth/Usage access.

**Exit evidence:** A new operator can answer “which Agent needs me, why, and what do I do?” without opening more than one focused destination.

### Phase 2 — Simplify Presence and Agent care

- Refactor Presence Settings into Identity, Purpose, Attention, Freedom, Connection, and Advanced.
- Default to a safe autonomy preset; make exact capability modes progressive disclosure.
- Refactor Manage Agent into human cards for identity, voice, memory, purpose, and model.
- Keep protected files, provider credentials, Skills, raw capabilities, and deletion under Advanced.
- Add connection setup that infers API/Chrome/Bridge route when possible and explains failure recovery.

**Exit evidence:** First-time setup requires only meaningful social choices; expert controls remain reachable and truthful.

### Phase 3 — Reframe social intelligence

- Combine Watching and relevant People entry points into Attention and Relationships.
- Rename Schedule to Rhythm and simplify the creation flow around outcomes.
- Reframe Growth as Learning; keep raw evidence available but secondary.
- Add contextual Asset/Knowledge retrieval to Chat/Practice.
- Add guided Practice moments for reply, post, silence, and media uncertainty.

**Exit evidence:** The Agent’s differentiated value—attention, judgment, relationships, multimodal expression, and learning—is easier to experience than the machinery that supports it.

### Phase 4 — Advanced operator depth

- Group Usage, Technical Diagnostics, raw runtime trace, connector state, resource envelopes, scenario authoring, and evidence lineage under Advanced.
- Keep developer mode opt-in and durable across sessions.
- Ensure advanced views remain linked to human-level entities and scope.

**Exit evidence:** Power users can diagnose every material truth without forcing ordinary users to become operators.

## Measurement and research plan

Measure cognitive load, not just clicks:

- Time from first launch to first meaningful Agent conversation.
- Time from portfolio open to identifying the Agent needing attention.
- Number of route changes to approve one action.
- Number of concepts/nouns a new operator can correctly explain after setup.
- Rate of scope errors: wrong Agent, Presence, Channel, or Sandbox/live assumption.
- Percentage of users who reach Practice and understand that nothing is live.
- Percentage of durable Chat requests with an explicit persisted receipt.
- Review completion rate and time to decision.
- Recovery success without duplicate public action.
- Qualitative comprehension of “what the Agent chose,” “what actually happened,” and “why it stayed quiet.”

Research with at least these scenarios:

1. One Agent, one X Presence.
2. Three Agents, each with one X Presence (Genny, Poko, Ideagrape).
3. One Agent with multiple Presences.
4. A supervised Agent with pending approvals.
5. A live connection with an uncertain delivery outcome.
6. A Presence that should stay quiet because no opportunity is good enough.

Do not use only the one-Agent happy path. The portfolio case is the primary reason to correct the shell now.

## Risks and non-goals

### Risks

- Chat may become an ambiguous “do everything” surface if scope and receipts are weak.
- Hiding advanced controls can frustrate expert users if discovery and direct links are poor.
- A global Review queue may mix Presences in ways that create privacy or identity errors.
- Qualitative Learning copy can overclaim if measurement boundaries are not visible.
- Auto-inferred connector setup may conceal a meaningful authority or privacy choice.

### Non-goals

- Removing the Agent/Presence hierarchy.
- Removing review, supervision, privacy filtering, Sandbox isolation, or verified outcomes.
- Converting the Agent into a generic productivity assistant.
- Replacing social judgment with activity quotas or follower optimization.
- Collapsing every surface into one dashboard.
- Adding visual polish before the information architecture and states are correct.

## Handoff prompt for another reasoning model

Use the following as the review brief for a stronger model:

> You are reviewing OpenPresence, an open-source platform for persistent AI social Agents. The operator manages multiple Agents—for example Genny, Poko, and Ideagrape—each with its own X Presence. The current app has a principled runtime and many surfaces, but likely exposes too much implementation complexity too early. Analyze the attached Feature Map and this report from first principles.
>
> Preserve: User → Agent → Presence; person-shaped cognition; privacy filtering; operator authority; Sandbox/live separation; silence/NO_OP; separate observation, Social Intent, Execution, Delivery, and verified Outcome; protected identity; truthful status; verified public reality.
>
> Challenge: whether the current navigation, names, settings, Activity dashboard, Review placement, Chat/Teach/Rehearsal split, Watching/People split, Schedule/Growth/Analytics/Feed duplication, and Agent/Presence switchers deliver the user’s actual job with unnecessary cognitive load.
>
> Use this review order: utility, usability, coherence, trust/recovery, desirability, delight. For each proposed change, apply remove → combine → default → infer → hide → reframe → inline → mode → automate → add. Do not recommend a change based only on aesthetics or implementation convenience. Distinguish durable product foundations from experimental UI. Evaluate both one-Agent and multi-Agent portfolios, including one Agent with multiple Presences.
>
> Produce an independent recommendation. Explicitly state where this report is wrong, what evidence would reopen a recommendation, and what the smallest coherent first implementation would be. Favor an Agent workspace that feels as simple as a conversation-led assistant while being materially better at social attention, judgment, multimodal expression, relationships, approval, verified outcomes, and learning.

## Final judgment

OpenPresence should become dramatically simpler at the surface while becoming more explicit about its most important distinctions. The winning product does not expose fewer capabilities by becoming weaker; it exposes fewer decisions because the Agent, context, safe defaults, and progressive disclosure do more of the work.

The first decisive move is not to redesign every card. It is to make the portfolio hierarchy truthful: **Agents first, Presences inside Agents, Channels inside Presences**. From there, make Home calm, Needs You canonical, Chat conversational, Presence care short, and advanced machinery available only when it matters.

`DESIGN CHANGE`
