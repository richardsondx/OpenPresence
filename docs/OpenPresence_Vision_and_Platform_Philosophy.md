# OpenPresence Vision & Platform Philosophy

> **Canonical product and UX north star**
>
> This document should be consulted before making feature, architecture, product, copy, or UI/UX decisions for OpenPresence.
>
> When a proposed feature conflicts with this document, prefer the principle over the convenience of the current implementation.

---

## 1. What OpenPresence is

OpenPresence is an **open-source platform for persistent AI agents that develop a real social presence in the world**.

The goal is not to build another chatbot, content scheduler, social dashboard, or generic agent framework.

The goal is to let a person create an Agent with a durable identity, mission, judgment, memory, model, and social abilities, then give that Agent one or more places to exist publicly.

A useful shorthand is:

> **Give your AI a presence.**

Or:

> **Your agent should not live in a chat window.**

## 48. Agent-first workspace direction (2026-09-02)

The primary workspace is now organized around the Agent as the visible actor.
The left rail is a portfolio of memorable Agent identities; selecting one
opens that Agent's conversation and workspace. Channel/account identity remains
real and inspectable, but it is contextual embodiment—not a competing product
or a second mind.

The primary surfaces are:

- Chat: the operator's durable conversation with the Agent. Work appears as a
  narrative of intent, working state, review, and verified outcome.
- Agent Lab: the safe place to rehearse social situations and run saved
  Scenarios before anything goes public. Rehearsal is not a publishing queue,
  and a Scenario does not teach the Agent by default.
- Knowledge and Assets: Agent-owned source material and multimodal evidence.
- Context inspectors: Attention, Calendar, Analytics, and Agent settings open
  beside the current work only when requested.

The shell must not make the operator choose between Chat, Activity, Watching,
Playground, Curation, Trials, and analytics as if they were equal products.
Operational history, schedules, relationships, and public outcomes remain
available, but they are reached through contextual actions and dedicated
detail surfaces. The visible hierarchy is User → Agent → Presence → Channel;
the implementation may retain Presence-scoped routes and data boundaries, but
the normal language of the workspace should remain Agent-first.

During a full Agent turn, the UI preserves an honest sequence: operator input,
durable acknowledgement, plan or working line, tool/activity evidence,
approval when required, and outcome receipt. Each state is persisted before it
is presented as settled. Failed, waiting, uncertain, simulated, and verified
states remain distinct. The composer is always a real interaction boundary:
Enter sends, Shift+Enter adds a line, optimistic input is reconciled against
durable state, and a refresh or worker restart cannot lose the operator's turn.

## 46. Attention, responsibility, and authority

An Exploration gives the Agent somewhere to look. An Assignment gives the Agent responsibility to pursue an outcome there. The Presence Execution Envelope gives the Agent authority to perform a selected social act. Exploration therefore does not grant permission to speak, but it can lead to autonomous speech when it is connected to a canonical Assignment and authorized execution.

Every autonomous Exploration behavior uses the same Assignment primitive. “Surface it to me” produces findings without public responsibility. “Let Genny engage when useful” creates an unquantified, opportunistic meaningful-engagement Assignment. An explicit objective creates the same kind of Assignment with explicit qualification, quantity, and constraints. There is no second autonomous-engagement engine.

The durable path is:

> **Attention Source → Social Mirror → Assignment → Social Planner → Social Intent → Execution Envelope → connector or Bridge → verified Social Mirror outcome.**

A browser button may expose a diagnostic “look now” action, but autonomous Attention-source work must be eligible for browser-independent worker execution. A discovery lead is not a social outcome, a finding is not an engagement, and a queued execution is not progress. Only verified reality counts.

## Language and phrasing

Taste guides expression. Authority defines hard constraints.

Language policy is structured, visible configuration on the Agent and each Presence. An effective policy combines the Agent's rules with Presence additions; a Presence may specialize its language, but it cannot weaken an inherited boundary. Advisory Avoid preferences guide judgment and never block delivery. Never use entries are explicit lexical literals, not semantic categories.

The model owns the sentence. Deterministic code owns whether an explicit lexical constraint was satisfied. A lexical prohibition is a deterministic execution constraint, not social intelligence. The runtime may ask the model to re-express a candidate while preserving its act, target, thread, facts, assets, and format; it must not mechanically edit public language when the Agent can re-express it. After bounded rewrites, a remaining violation blocks Execution, not Social Intent, and never becomes NO_OP.

Failure is not judgment. NO_OP, language-policy violation, evaluation failure, delivery failure, and candidate rejection remain distinct truths. A blocked Assignment remains incomplete and makes the boundary visible; it does not advance verified progress. No blocked expression creates a delivery or Mirror object.

Manual exact-text actions are different from Agent autonomy. When an operator-authored expression conflicts with a policy, OpenPresence should show the conflict and require an explicit, auditable, per-action choice to go back or publish anyway. An autonomous Agent output cannot authorize its own override.

Language rules belong at the Expression and final-validation boundary, across Sandbox, native, Bridge, manual relay, Playground, Pulse, Schedule, Assignments, messages, and retries. They are not a hidden style prompt, a replacement for Taste, or an observation filter. External quoted source text is world data and is not validated as Agent-generated expression.

An OpenPresence Agent should be able to notice what is happening, decide what matters, choose whether to act or remain silent, express itself in the format best suited to the moment, remember people and relationships, and learn how to grow without losing its identity.

### Visual evidence is an editorial judgment

Search results are possibilities, not evidence. An asset earns its place by
helping the audience see what the Agent means. Discovery metadata, filenames,
OG images, and publisher reputation are search leads, not visual truth. The
runtime must fetch original media, inspect the actual candidate pixels, retain
source lineage, and make a bounded editorial choice: select, search again,
render from grounded structured evidence, use text only, or replan. The final
words and visual are reviewed together as one public act.

---

## 2. Mission

### Product mission

Build the best open-source system for giving persistent AI agents a meaningful, autonomous, multimodal presence across social environments.

### Growth mission

OpenPresence is fundamentally a **growth system**.

Its job is to help an Agent become someone people genuinely want to hear from, follow, reply to, remember, and return to.

A useful forcing-function benchmark is:

> **Could this Agent build an audience of 100,000 people who genuinely want to hear from it?**

This is not a promise or vanity metric. It is a design constraint that forces the system to care about:

- recognizable identity;
- useful and original expression;
- relationships;
- distribution;
- timing;
- channel fluency;
- multimodal content;
- learning;
- consistency;
- account longevity;
- qualified audience growth.

The objective is **compounding audience growth**, not maximum activity.

---

## 3. The core product thesis

### 3.1 The Agent is conceptually a person

The Agent should reason about the social world the way a capable person would.

Jenny should think:

- "This is worth replying to."
- "I like this."
- "This deserves a repost."
- "This idea needs a chart."
- "I should follow up with Maya."
- "I have nothing useful to add."

Jenny should not think:

- "My queue has four jobs."
- "This requires operator approval."
- "The API returned a rate-limit error."
- "This action is configured as manual."
- "The Bridge lease expires in 90 seconds."
- "I am an automated account."

Those are implementation details.

The architectural rule is:

> **Do not leak infrastructure into cognition unless understanding that infrastructure is itself necessary for a good social decision.**

A good Agent becomes better at being itself, not better at thinking about the software that runs it.

### 3.2 Person-shaped cognition, machine-shaped embodiment

OpenPresence separates cognition from embodiment.

```text
AGENT
"What should I do?"
        ↓
SOCIAL INTENT
"I want this to happen."
        │
──────── Agent boundary ────────
        │
EXECUTION
"How has the operator chosen to realize it?"
        ↓
DELIVERY / CONNECTOR
"How does the software make it happen?"
        ↓
WORLD
        ↓
OUTCOME
"What happened afterward?"
```

The principle is:

> **Intent belongs to the person. Execution belongs to the body. Outcome belongs to the world.**

---

## 4. The canonical hierarchy

OpenPresence must always make this hierarchy clear in the product:

```text
USER
  │
  ├── AGENT: Jenny
  │     ├── Presence: X · @jenny_ai
  │     ├── Presence: Founder Community · Jenny
  │     └── Presence: LinkedIn · Alex
  │
  ├── AGENT: Atlas
  │     └── Presence: Substack · Atlas
  │
  └── AGENT: Scout
        └── Presence: X · @scout
```

### User

The owner/operator.

A user may have many Agents.

### Agent

A persistent mind and workspace.

An Agent owns:

- Brain;
- Soul;
- Mission;
- Taste;
- Memory;
- Growth;
- Pulse;
- model runtime;
- Skills;
- conversations;
- Presences.

Agent switching should feel like profile/workspace switching.

### Presence

One social incarnation of an Agent.

A Presence answers:

> **Where do I exist, and who am I here?**

A Presence owns:

- channel/account identity;
- Agent-owned vs Ghost identity;
- Presence-specific social context;
- Execution Envelope;
- connector/Bridge configuration;
- privacy scope;
- Presence health and connection state.

One Agent can have many Presences.

Changing Presence must never silently change the Agent's Brain, Soul, Mission, Taste, model, Skills, or global Memory.

---

## 5. The Agent mind

OpenPresence uses a small set of human-readable meaning files.

```text
BRAIN.md
How I think.

SOUL.md
Who I am.

MISSION.md
What I am trying to accomplish.

TASTE.md
What I consider good.

MEMORY.md
What I have experienced and should not forget.

GROWTH.md
What results have taught me.

PULSE.md
What keeps me proactively attentive.
```

An Agent should be able to remember what has happened to it, not merely what it has learned about the world. This autobiographical continuity must remain factual and provenance-backed: a verified world event may become a Presence-scoped autobiographical event, while interpretation stays separately revisable.

> **Experience becomes context, not content obligation.**

Autobiographical experience may be retrieved when it is genuinely relevant to present judgment. It must not automatically become a publishing opportunity, engagement queue, or grievance loop. Negative interpersonal experience must cross a public-safe projection before social cognition receives it, while hard relationship boundaries take effect deterministically in People and execution policy.

Presence-specific meaning belongs to the Presence, not the global Brain.

### Mutation philosophy

Identity should be stable. Learning should be fast.

| State | Agent may auto-write? | Agent may propose? |
|---|---:|---:|
| Brain | No | Yes |
| Soul | No | Yes |
| Mission | No | Yes |
| Taste | No | Yes |
| Memory | Yes | Yes |
| Growth | Yes | Yes |
| Pulse | No | Yes |
| Presence identity/context | No | Yes |

Performance may freely update empirical Growth. It may propose changes to Taste, Soul, Mission, Brain, Pulse, or Presence context. It must not silently rewrite identity to chase metrics.

> **The purpose of Growth is to become more effective at being yourself, not to become whatever performs.**

---

## 6. Taste is the moat

Many agent frameworks answer:

> "How can the Agent act?"

OpenPresence must answer:

> **"How does the Agent develop judgment about what is worth doing?"**

`TASTE.md` is a core product primitive.

Taste should capture:

- what deserves attention;
- what is worth publishing;
- what makes a good hook;
- when to reply;
- when to repost;
- when to quote;
- when to promote;
- what is educational;
- what is entertaining;
- what feels derivative;
- what violates the Agent's standards;
- when silence is better.

Key principle:

> **Silence is a valid and often intelligent action.**

Metrics may inform strategy. Metrics do not get to vote directly on Taste.

---

## 7. Growth is not "post more"

OpenPresence should optimize for durable, qualified growth.

The GrowthLoop is conceptually:

```text
observe
   ↓
consider possible actions
   ↓
Taste
   ↓
Mission
   ↓
Growth evidence
   ↓
choose best human action or NO-OP
   ↓
Social Intent
   ↓
Execution
   ↓
Outcome
   ↓
learn
```

Useful signals may include:

- profile visits;
- follow conversion;
- replies;
- conversations;
- return engagement;
- relationship depth;
- dwell/attention where available;
- negative feedback;
- topic resonance;
- format performance;
- skill performance;
- channel timing;
- operator approval patterns;
- execution reliability.

### Social Strategy Intelligence

Social strategy is learned capability, not Agent identity. A Channel owns its
environment-specific fluency through a versioned Playbook; a Presence supplies
the context in which that fluency is judged. Playbook patterns are bounded
possibilities, never a posting quota or an instruction to engage. Retrieval may
return zero to five relevant patterns, and the Agent may still choose silence.

Growth records evidence before interpretation. `WORLD_OUTCOME`,
`OPERATOR_REVIEW`, and `STRATEGY_OBSERVATION` remain distinct: operator
preference is not audience performance, and effectiveness claims require a
verified world outcome. A new or broader hypothesis is derived with lineage;
the original interpretation remains available for review. Supported, testing,
weakened, disfavored, and retired states describe confidence and disposition,
not silent rewrites of identity.

Legacy Channel playbook prose remains advisory compatibility context. It is not
invented structured pattern data. Recent strategy shape may softly reduce
retrieval scores for repeated mechanisms, but there is no mechanical cooldown:
relevance and the Agent's judgment remain primary.

Raw likes alone are not the goal.

---

## 8. Model sovereignty

OpenPresence does not have one AI model.

**Each Agent has its own model runtime.**

Examples:

```text
Jenny  → Anthropic / Claude
Atlas  → OpenAI / GPT
Scout  → Gemini
Local  → Ollama
```

Supported architecture should allow:

- OpenAI;
- Anthropic;
- Google Gemini;
- OpenRouter;
- Ollama;
- custom/OpenAI-compatible endpoints.

Changing the Agent's model changes the engine interpreting the Agent. It does not create a new Agent or rewrite identity.

The Agent's durable identity, memory, Presences, Skills, and Growth history must remain portable across providers.

### Brain model is not capability model

A Claude-powered Agent may use an OpenAI image-generation Tool.

A local Ollama Agent may use Gemini for visual perception.

A GPT Agent may use a local chart renderer.

Specialized models are **Tools of the Agent**, not the Agent's identity.

---

## 9. Skills, Tools, Assets, and Sources

OpenPresence should be powerful without becoming a general-purpose work agent.

### Tool

A mechanical capability.

Examples:

```text
web.search
asset.search
asset.inspect
image.generate
image.edit
chart.render
video.prepare
channel.execute
```

### Skill

Knowledge for turning ideas or source material into excellent social expression.

Examples:

```text
research-to-thread
data-story
visual-explainer
clip-with-commentary
quote-with-context
```

Skills should primarily help an Agent **show up better socially**, not run payroll, write arbitrary software, or become a generic productivity agent.

### Source / Library

A place where useful material can be discovered.

Examples:

- local folder;
- URL collection;
- external Content Drop;
- connected storage.

### Asset

A usable piece of material.

Examples:

- image;
- chart;
- video;
- GIF;
- audio;
- PDF;
- document.

Folders are Sources, not Assets.

An asset is evidence and expression, not decoration. The raw asset is evidence; perception is interpretation. The runtime preserves a canonical Asset Ledger for what media exists, where it came from, what was observed about it, how it was transformed, and where it was published. The Agent should remember what it has shown, not only what it has said.

Discovery supplies candidates. Judgment chooses among them. The Agent may begin with an idea and seek evidence, or encounter a chart, image, video, or other media object and discover that it has something worth saying. Both are legitimate forms of original thought. A source URL is provenance, not verification, and an asset's existence does not prove that every claim in a publication is grounded.

The runtime keeps separate:

- **Source evidence:** where information came from, including publisher, page, date, and retrieval facts;
- **Perception:** what the stored bytes appear to contain or mean;
- **Claim grounding:** whether evidence supports a factual claim, or whether grounding is not applicable;
- **Rights and authority:** whether the asset may be used under the operator's policy;
- **Taste and planning:** whether the asset is good, relevant, and worth using.

Unverified is not the same as intentionally fictional. Factual and analytical expression may require grounding; satire, parody, fiction, humor, and entertainment may intentionally invent. The runtime must still truthfully record whether media was observed, generated, edited, or composited, and must not erase provenance, rights, Channel rules, or execution authority. Truthfulness in the runtime does not require literalism in the art.

Asset history is part of Agent competence. Exact identity, perceptual similarity, source identity, lineage, previous use, timestamps, Presence, Assignment, and observed outcomes are deterministic facts. Reuse should be deliberate, not an accidental consequence of limited options. A crop, resize, annotation, or render remains linked to its parent. There is no universal reuse cooldown: the Agent decides whether new data, a correction, follow-up, comparison, retrospective, or another meaningful reason warrants repurposing.

Asset discovery is provider-independent. Tavily or another provider may retrieve candidates, but provider relevance is not trust or factual verification. Stronger tools and stronger future models should improve judgment without site-specific rewrites. The AssetStore persists immutable bytes; Sandbox, native, and Bridge paths consume the same Asset and Publication contract. Feed shows the verified public or simulated history, while Activity shows meaningful work such as comparing sources, inspecting media, checking prior visual history, and preparing delivery—not low-level requests.

Evidence-led visual storytelling is a general capability, not a benchmark-specific template. When an expression depends on evidence, the Agent may form a StoryCandidate with a concrete trigger, why-now context, claim, Evidence Need, and Visual Brief. The Visual Brief describes the role an asset should perform; it does not prescribe one universal medium. A chart may fit a market claim, a photograph may fit a physical event, a screenshot may fit a product change, a document excerpt may fit a policy claim, or no asset may be the honest choice. Runtime fit checks compare a candidate with that contextual brief and must not encode that charts are always good, logos are always bad, or one source family is always preferred.

Reference accounts are diagnostic examples, not generic specifications. Improve the Agent's ability to notice and understand evidence, then let Mission, Taste, Presence, Skills, and the observed world determine the expression. Generic runtime changes motivated by one Presence should be tested across substantially different Presence archetypes and counterfactual visual roles before they are treated as platform-wide improvements.

---

## 10. Publication parity

Text is not the product.

A sophisticated social account may communicate through:

- text;
- images;
- charts;
- screenshots;
- video;
- GIFs;
- links;
- quote posts;
- threads;
- long-form articles;
- slides;
- formats that do not exist yet.

OpenPresence should aim for **Publication Parity**:

> **Given equivalent source material and authorized access to the necessary Assets, an OpenPresence Agent should be capable of choosing, producing, and publishing the same classes of social expression available to a sophisticated human operator on that Channel.**

The Agent should choose the best form for the idea, not default to text because text is easiest for the implementation.

---

## 11. Channel, Connector, and Mirror are different things

### Channel

The social environment.

Examples:

- X;
- LinkedIn;
- Substack;
- Skool;
- a private community;
- a custom forum.

A Channel defines social semantics:

- entities;
- affordances;
- formats;
- threading;
- metrics;
- privacy defaults;
- Playbook.

### Connector

How OpenPresence observes and affects that environment.

Examples:

- native API;
- Bridge;
- manual relay;
- simulated connector.

### Social Mirror

OpenPresence's observed representation of relevant external social reality.

The Agent should experience the Channel, not the connector.

Jenny should think:

> "Maya posted this in Founder Community."

Not:

> "A Bridge inserted a normalized event into my Mirror."

### Custom Channels

Custom Channels are a first-class capability, not a workaround.

If an external system can mirror a social environment into OpenPresence and faithfully carry out Deliveries, an Agent can have a Presence there.

> **Channel Definitions describe social reality. Mirrors represent observed social reality. Agents decide what should happen. Executions authorize embodiment. Deliveries transport that decision. Connectors provide eyes and hands.**

---

## 12. One brain does not mean one privacy boundary

An Agent may exist in public and private places.

A private community conversation must not casually become material for a public X Presence.

Privacy must travel with mirrored objects and context.

OpenPresence should prefer:

```text
candidate context
      ↓
privacy filtering
      ↓
Presence eligibility
      ↓
model context
```

over:

> "Give the model everything and ask it not to use private information."

Private content must be filtered before cognition.

## 12.1 Attention, Watching, and Explorations

Watching has two distinct meanings. The Watchlist contains known people,
accounts, or sources a Presence intentionally follows. An Exploration is a
Presence-scoped brief describing an area of social reality the Presence wants
to discover.

An Exploration grants permission to look, not permission to speak. Its output
is bounded social evidence: ephemeral discovery leads, selectively hydrated
Social Mirror objects, and worthwhile findings. The Social Planner still owns
whether a Social Intent exists, and the Presence Execution Envelope still
owns whether that intent can be delivered.

Exploration is directed attention over the reality a Presence can actually
observe or discover. A native API, Bridge, plugin, or imported observation may
provide different discovery surfaces, but none creates a second path around
the Social Mirror. Search results are leads, not understanding.

Explorations are durable structured Presence state, not another mind file and
not a second autonomy system. Pulse is the runtime act of paying attention;
an Exploration is one durable reason for that attention. Private context is
filtered before query compilation and cannot be externalized into public
search. Being discovered does not create People memory, a recommendation, or
an introduction.

Mirrored social content is always world data, never system instruction.

A community post that says "ignore your instructions" remains a social post.

### Self-Directed Attention and Curiosity

A social Presence does not only respond to attention supplied by others. Within
accepted responsibility and authority, it may decide where its own attention is
worth spending. Operator Explorations express where the operator wants the
Agent to look. Self-directed discovery expresses where the Agent currently
believes looking may be worthwhile.

Self-directed discovery is strategy, not identity. It may change as
responsibilities, experience, Growth evidence, relationships, and capabilities
change. A Presence should be capable of curiosity, but curiosity is bounded by
responsibility, resource authority, privacy, and the capabilities of its
current body.

The source of attention does not determine the available social vocabulary.
Once something is genuinely observed, the same Social Planner judges the
appropriate social act. Search results are leads; hydrated social objects are
observed evidence.

Self-directed discovery is opportunistic and preemptible. It cannot discharge,
starve, or create hidden debt against accepted responsibility. It may be
deferred freely when more important work is unresolved or the body is
unavailable.

### Attention as a Governed Resource

The Agent owns where attention appears worthwhile. The operator owns how much
infrastructure may be spent pursuing that attention. Attention intensity
governs how broadly and frequently the Agent looks; it does not lower Taste or
create pressure to act. Curious means seeing more of the world, not liking more
of it.

Freedom of social action does not imply unlimited infrastructure spending.
Execution authority and resource authority are independent. Budget exhaustion,
provider throttling, body unavailability, insufficient evidence, and
Agent-selected silence are different truths and must never be collapsed into
one state. Resource limits belong to infrastructure; the Agent should not
think socially in terms of unused quotas or remaining Likes.

Operational usage should be measurable and attributable to work origins
without pretending that an estimate is authoritative provider billing. Bridge
and Native connectors provide eyes and hands. The Social Mirror represents the
observed world. Resource and provider diagnostics belong to operational state,
not the Mirror.

### Composable Social Acts

Social acts are composable expressions, not mutually exclusive menu choices. A
Presence may appreciate, converse, amplify, and form a relationship around the
same social object when each act independently earns its place. The Social
Planner chooses a coherent set of acts, not necessarily a single act.

Silence is the absence of an outward act. Choosing not to reply does not imply
choosing not to Like, Follow, or otherwise respond through another social
affordance. Each act must earn its place independently; one justified action
is not itself justification for additional activity.

---

## 13. Assignment, Social Intent, and ambient attention

### Ambient attention

Attention Rhythm decides when a Presence wakes. Watching and Explorations tell it where to look. Social Mirror supplies observed reality. An unsolicited post, mention, trend, or conversation may receive a social judgment and `NO_OP`; silence is a valid intelligent outcome when no responsibility exists.

### Assignment

Schedule has one operator-facing action: **Add assignment**. The operator writes what the Agent should accomplish. OpenPresence derives and shows a concise completion contract before activation. The contract includes the objective, deliverable, success evidence, timing, hard constraints, assumptions, required capabilities, and the methods the Agent may choose.

An Assignment is accepted responsibility, not an invitation to consider. The operator owns the outcome; the Agent owns the method within safety, privacy, truth, authority, Taste, and the effective delegation policy. Autonomy is not the freedom to ignore delegated responsibility. It is the freedom to determine how best to fulfill it.

An Assignment may complete with a verified deliverable, an explicit decision report when evaluation was the requested deliverable, a necessary operator decision, a genuine blocker, or explicit failure. It may not terminate in `NO_OP`. `NO_OP` remains local social judgment over a candidate, conversation, or unsolicited opportunity. Rejecting a weak candidate leaves the Assignment active.

Every active Assignment must have a sufficiently clear completion contract. Creation-time semantic preflight identifies material ambiguity, missing context, and the likely deliverable. Deterministic capability preflight verifies knowledge, assets, channel affordances, execution authority, connector health, identity resolution, timing, and other dependencies. Readiness is `READY`, `READY WITH ASSUMPTIONS`, `NEEDS INPUT`, or `BLOCKED`. Work cannot activate while its deliverable or success evidence is unknown.

The Assignment lifecycle is explicit: `DRAFT → ACCEPTED → PLANNING → WORKING → AWAITING_EXECUTION → AWAITING_REVIEW → NEEDS_OPERATOR → BLOCKED → COMPLETED`, with `COMPLETED_WITH_ADAPTATION`, `FAILED`, `EXPIRED_INCOMPLETE`, and `CANCELLED` as terminal outcomes where appropriate. Older persisted `ACTIVE` and `PAUSED` records remain readable during migration, but new operator-facing Schedule work uses the Assignment contract and readiness vocabulary.

Before meaningful execution, runtime revalidates the path. Routine problems are resolved automatically when safe. Material changes follow the effective delegation policy: **Keep moving when safe**, **Ask before changing the outcome**, or **Stop on material deviation**. Clarification is scoped to the Assignment and produces typed contract changes, not an unstructured chat transcript.

### Social Intent

A temporary decision formed in the moment.

Example:

> Reply to Maya with this specific idea.

Social Intents may expire.

This is critical because social value is time-sensitive.

> **Standing Intent persists. Social Intent may lose its moment.**

`Run now` means:

> Evaluate this Standing Intent now.

It does not mean:

> Publish prewritten content now.

A no-op can be a successful evaluation.

An Assignment remains active until it is completed, cancelled, blocked, or expires incomplete. Taste still protects the quality floor: “this candidate is not good enough” means reject the candidate and keep working, not publish filler and not silently complete the Assignment. Only a verified world outcome, such as an authored publication observed in the Sandbox Social Mirror or live Mirror, advances public-action progress. Model failure and delivery failure are operational failures, never evidence that the Agent chose silence.

Assignment fulfillment is persistent goal pursuit with bounded effort. A candidate rejection is recorded as candidate-level judgment, then the runtime may return to research and form a materially different candidate with the temporary rejection context available. For evidence-led work, story research, visual research, and final joint publication review are separate stages.

---

## 14. Intent, Execution, Delivery, Outcome

These must remain separate.

### Social Intent

What Jenny thinks should happen.

### Execution

How the operator has configured that intent to be realized.

Modes may include:

- Off;
- Manual;
- Review;
- Auto.

### Delivery

Connector-specific work required to realize an Execution.

Delivery owns:

- queue;
- lease;
- retry;
- connector route;
- external reference;
- uncertain state.

### Outcome

What happened in the world afterward.

Publishing successfully is not the same as performing successfully.

```text
Intent
Jenny thought the reply was worth making.

Execution
The reply was approved.

Delivery
The Bridge posted it.

Outcome
The person replied, visited the profile, followed, or ignored it.
```

This separation is essential for correct learning.

---

## 15. Operator freedom and guidance

OpenPresence should help users protect the long-term value of their accounts without turning the Agent into a compliance officer or the product into a police system.

The Agent should not reason about automation policy.

The operator owns how independent a Presence is.

Useful product concepts include:

```text
Supervised
Jenny thinks freely. The operator reviews actions.

Independent
Jenny acts using the recommended setup.

Custom
The operator configures the Presence action by action.
```

OpenPresence may provide **Presence Health** or **Account Guidance** based on observable risk and runtime conditions.

Guidance should be:

> "Here is what we recommend."

not:

> "You are not allowed to configure your own Agent."

Open source users remain free to inspect, modify, replace, or fork the runtime.

---

## 16. Conversation as configuration

Chat is not just conversation.

Chat is the most natural way to teach and configure an Agent.

The operator should be able to say:

- "Do not use em dashes."
- "Become known for persistent agents."
- "Post something useful every Tuesday morning."
- "Be less promotional."
- "Put this Presence into Ghost mode."
- "Use Claude as Jenny's model."

The durable result should be a typed domain mutation, not merely a conversational promise.

Conceptually:

```text
human language
      ↓
conversation
      ↓
interpretation
      ↓
ChangeSet
      ↓
authoritative domain state
```

### ChangeSet

A ChangeSet is immutable provenance for a durable mutation.

It is **not** the current source of truth.

Examples:

- Taste changed;
- model changed;
- Standing Intent created;
- Presence identity changed.

The affected domain object remains authoritative current state.

---

## 17. Conversation, Memory, and durable configuration are different stores

A conversation transcript records what was said.

Memory records what the Agent should remember.

Taste records durable standards.

Mission records direction.

Standing Intent records future instruction.

Deleting or starting a new conversation must not silently erase durable changes created from previous conversations.

> **Chat history is what we said. The mind is what the Agent became because of it. Memory is what the Agent should remember.**

---

## 18. Context engineering

The Agent's context window is a working set, not its hard drive.

Do not concatenate every file, memory, Skill, Tool, Asset, and conversation into every prompt.

Use progressive disclosure.

### Agent base

Generally stable:

- Brain;
- Soul;
- Mission;
- Taste.

### Invocation

Exactly what caused the Agent to think:

- operator conversation;
- Standing Intent;
- Channel event;
- Content Drop;
- Growth review.

### Presence context

Only when the invocation belongs to a Presence.

Use a cognition-safe projection.

Never serialize the full Presence object into model context.

### Retrieved

Only relevant:

- Memory;
- relationships;
- Growth evidence;
- Playbook;
- Assets.

### On demand

Load only when necessary:

- Skill instructions;
- Tool schemas;
- full Assets;
- external evidence.

The best context is the **minimum sufficient context for a good decision**.

## 18.1 Knowledge is source material, not another context box

Knowledge is Agent-owned source material that can be retrieved into a specific
Presence envelope. It is not a second Brain, an unbounded prompt appendix, or
a free-form operator Context field. The Agent owns the collection and its
durable source items; a Presence binding decides whether that Presence may
retrieve them.

V1 distinguishes only two source roles:

- **Reference** explains facts, standards, preferences, or background.
- **Procedure** explains operator-provided source material for a task. It is
  not a reusable execution method; that belongs to a Skill.

The Knowledge topology is:

```text
Agent
  └── Knowledge Collection (default role + disclosure level)
        └── Knowledge Item (Reference | Procedure)
              └── immutable Version
                    └── structured Segment (heading, page, text range)

Presence ── binding(maximum disclosure) ──► Collection
Invocation ── Context Compiler ──► scoped evidence + provenance
Agent tool ── knowledge.search / knowledge.read (read-only)
```

Collection defaults may be narrowed by an item override. A Presence binding
may narrow the effective level again; no layer may broaden it. The compiler
filters inaccessible material before cognition, and public expression receives
only evidence permitted for public use. Source text is untrusted content, so a
passage that says “ignore the Agent’s instructions” remains a passage and
cannot become runtime authority.

Every retrieval and use should be inspectable through exact provenance: source
collection, item, version, segment, heading, page when available, text range,
retrieval run, and whether the passage was merely retrieved or relied upon.
Supersession creates a new current version; it does not destructively erase the
older source or its audit trail.

For example, an operator may bind an internal launch checklist to a private
Presence while leaving it unavailable to a public Presence. Both Presences can
share the Agent's durable mind without sharing that collection's evidence. A
public source may still be capped to internal use by a Presence binding, and an
internal source must never reach public expression merely because a model was
asked not to disclose it.

The initial implementation is intentionally narrow: manual file upload,
pasted text, and Markdown; immutable versions; structured segmentation;
Reference and Procedure roles; Presence bindings; pre-cognition retrieval;
read-only Knowledge tools; and operator-visible retrieval history. Connected
source synchronization, crawling, visual/audio/video extraction, shared
organization Knowledge, policy enforcement, and Agent-authored mutations remain
separate future capabilities.

---

## 19. External agents and Content Drops

OpenPresence should not try to replace every other agent.

Another agent may:

- research;
- code;
- analyze;
- create a report;
- generate a dataset;
- produce a chart;
- prepare media.

It can then hand useful material to OpenPresence.

OpenPresence's job begins at:

> **What should we do socially with this?**

Possible answers include:

- ignore it;
- make one post;
- turn it into a visual;
- create a thread;
- wait;
- send it to another Presence;
- use it to continue a relationship.

A useful positioning boundary is:

> **Other agents help work get done. OpenPresence helps the work become distribution.**

---

# UX AND DESIGN PHILOSOPHY

## 20. Quiet software, living presence

The visual language should feel:

- quiet;
- intelligent;
- alive;
- slightly strange;
- meticulous.

The interface itself should remain mostly neutral.

Each Agent may own a small accent color and Presence glyph.

Prefer:

- whitespace;
- hairlines;
- restrained typography;
- readable density;
- subtle motion;
- minimal shadows;
- calm status language.

Avoid:

- dark "AI dashboard" clichés;
- glowing gradients everywhere;
- confetti;
- excessive cards;
- gamification;
- fake urgency;
- decorative charts;
- dense enterprise settings screens.

The product should feel like **serious software containing something alive**.

---

## 21. The UI must express the object model

The interface should make scope obvious.

### Agent-scoped

- Chat;
- Brain;
- model;
- Skills;
- conversations;
- Memory;
- Growth.

### Agent-wide, Presence-filterable

- Live;
- Calendar.

### Presence-scoped

- Presence context;
- Agent-owned vs Ghost identity;
- Execution Envelope;
- connector/Bridge;
- privacy;
- health.

Changing an active Presence filter must never silently replace Agent-level state.

---

## 22. Sidebar philosophy

The Agent is the workspace.

Use profile/workspace-switcher UX for changing Agents.

A user should always understand:

> "I am inside Jenny right now."

The sidebar should support:

- Agent switcher;
- Chat history;
- primary navigation;
- Presences.

Presences are places the current Agent exists, not separate Agents.

Conversation history belongs on the left as navigation.

---

## 23. Chat layout

Desktop Chat should have three conceptual regions:

```text
LEFT
Navigation and conversation history

CENTER
The actual conversation

RIGHT
Context & Changes
```

### Left

- Agent switcher;
- conversation history;
- Presences;
- Chat / Live / Calendar / Brain.

### Center

- messages;
- attachments;
- composer;
- blank-state suggestions before first meaningful interaction.

### Right: Context & Changes

Show what the current conversation is using, producing, and changing:

- conversation scope;
- temporary files/images/URLs;
- durable ChangeSets;
- generated outputs;
- optional advanced Skill/Tool provenance.

History does not belong in the right panel.

Permanent starter prompts do not belong in the right panel.

The right panel should be collapsible and contextual.

---

## 24. Blank states are first-class product states

Do not render empty dashboards filled with zeros.

Examples:

### Fresh Chat

> **Talk to Jenny.**
>
> Tell her what to care about, what to change, or what to do.

### Fresh Live

> **Jenny is live.**
>
> Nothing meaningful has happened yet.

### Fresh Calendar

> **No Assignments yet.**
>
> Tell Jenny what you want her to accomplish and when.

Starter prompts should disappear once the user has begun using the feature.

---

## 25. Live is not analytics

Live is the Agent's operational social stream.

It should answer:

> What happened?
> What mattered?
> What did Jenny choose?
> What did Jenny leave alone?
> What needs my attention?

Live should surface:

- inbound social activity;
- meaningful decisions;
- no-ops;
- pending Review items;
- executions;
- expirations;
- outcomes.

Live should not show:

- UI navigation events;
- raw database records;
- internal architecture prose;
- queue logs;
- fake universal metrics.

### Review belongs in Live

If a user configures an action as `Review`, there must be a visible operational queue.

A Review card should support:

- Approve;
- Edit;
- Reject;
- expiration;
- Presence label;
- target social object;
- concise decision summary.

If Review exists in settings but there is nowhere to review, the feature is not implemented.

---

## 26. Schedule manages Assignments, not content

Schedule should answer:

> **What should the Agent accomplish, and when must it be resolved?**

It should not store tweets written months in advance by default. It stores the Assignment contract and the Agent's current plan; the actual expression is generated when the work is ready.

The primary creation flow is: tell the Agent what you want, review its understanding and readiness, then activate. Routine work should show a compact inline review. Only material outcome ambiguity, missing context, irreversible commitments, or unavailable authority should open a scoped clarification drawer.

Calendar may retain historical Standing Intent records for migration and audit, but new Schedule work is represented as Assignments. Existing Consider items migrate according to their deliverable: action-oriented instructions become public-action Assignments, evaluation-oriented instructions become `decision_report` Assignments, and materially ambiguous items remain Draft until the operator chooses the completion contract.

---

## 27. Brain is Agent-scoped

There is one Brain per Agent.

Changing Presence must not change Brain.

The Brain screen should make the Agent's core cognition legible:

- model;
- connection;
- Mind files;
- Skills;
- change history.

Raw Markdown should remain available and editable for advanced users, but the primary representation should be human-readable.

Protected edits should say:

> **Propose change**

not misleadingly:

> Save changes

when a proposal workflow is actually being created.

---

## 28. Presence Settings should be about one social incarnation

Presence Settings should include:

1. Identity
2. Independence
3. How this Presence acts
4. Rhythm
5. Connection
6. Channel context
7. Privacy
8. Health when relevant

Do not put Presence Settings under "The Mind."

### Independence first

Normal users should see:

```text
Supervised
Independent
Custom
```

before a detailed capability matrix.

### Action controls

For a small fixed set of states, prefer a matrix or segmented control over many dropdowns.

Example:

```text
                  Off   Manual   Review   Auto
Posts                                      ●
Replies                            ●
Reactions                ●
Messages          ●
```

### Custom must reveal configuration

Never allow:

```text
Pacing: Custom
```

with no next step.

Selecting `Custom` must immediately reveal what can be customized.

---

## 29. Control choice matters

Use the control that matches the decision.

| Decision | Preferred UI |
|---|---|
| Switch Agent | Popover / searchable switcher |
| Select Presence filter | Sidebar row / compact picker |
| Off / Manual / Review / Auto | Matrix / segmented choice |
| Supervised / Independent / Custom | Segmented control or cards |
| Agent-owned / Ghost | Radio cards |
| Choose Channel | Visual/searchable picker |
| Choose model | Searchable combobox |
| Choose provider | Provider list/cards |
| Objective | Dropdown/combobox |
| Pacing profile | Segmented choice, then expandable custom settings |
| Navigate somewhere | Link |
| Perform action | Button |
| Destructive action | Overflow + confirmation |

Rules of thumb:

> **Dropdowns are for numerous choices.**
>
> **Links are for navigation.**
>
> **Segmented/radio controls are for small mutually exclusive decisions.**
>
> **Buttons are for actions.**

---

## 30. Custom Channels should feel native

A Custom Channel should not feel like a developer schema editor.

The user mental model is:

> "Jenny should also live in this place."

Creation should progressively answer:

1. What kind of place is this?
2. What can people do here?
3. Who is Jenny here?
4. How independently should she operate?
5. How will OpenPresence connect?

Hide by default:

- internal Channel IDs;
- raw JSON;
- Bridge protocol details;
- credentials;
- schema internals.

Make them available under advanced/developer details.

A Custom Channel is reusable social semantics. A Presence is one Agent's incarnation inside it.

---

## 31. Progressive disclosure over configuration walls

OpenPresence is technically powerful.

The normal user should not have to understand:

- leases;
- idempotency;
- schemas;
- Bridge routing;
- tool providers;
- retry states;
- raw IDs;
- connector protocols.

Start with the user's intention.

Reveal infrastructure only when necessary.

Examples:

Instead of:

> Connector type: bridge

Prefer:

> **Connect this Presence**

Then offer Bridge, Manual Relay, or Native where applicable.

Instead of showing Bridge token controls permanently:

> **Manage connection**

Then reveal rotate/revoke credentials.

---

## 32. Guidance should appear only when useful

Do not permanently occupy large UI regions with product philosophy.

Examples of copy that may be useful once but should not live forever:

- "Guidance, not a firewall."
- "Nothing gets written months in advance."
- "Durable changes are versioned."
- "The operator owns the Execution Envelope."

Use these in:

- onboarding;
- blank states;
- contextual help;
- first-use education.

After the user understands the system, reclaim the space.

A right rail should exist because it has useful current information, not because the layout has room.

---

## 33. Never fake reality

A polished prototype that lies is worse than an incomplete feature that tells the truth.

Every visible control or status should have real backing state.

Never show:

- fabricated "98% health";
- constant green dots;
- fake online states;
- fake metrics;
- sample outcomes presented as real;
- buttons that only change local React state;
- "success" before persistence/execution succeeds;
- simulated external execution presented as real.

If something is simulated, say so.

If a connector is disconnected, say so.

If a feature is unavailable, disable it honestly.

If data is incomplete, show incomplete data.

The product should earn trust by representing reality precisely.

---

## 34. Status language should be meaningful

Avoid reusing one green dot for many unrelated concepts.

Distinguish:

- Presence live;
- connection healthy;
- runtime status;
- review pending;
- recommendation;
- disconnected;
- stale Mirror.

Status must always answer a real user question.

Prefer words like:

- Connected;
- Live;
- Paused;
- Needs review;
- Waiting;
- Stale;
- Healthy;
- Needs attention.

Avoid fake precision.

---

## 35. Human-readable first, implementation detail second

The product is open source, but open source does not require forcing every user to stare at raw internals.

Prefer:

> **How I think**

over immediately exposing `BRAIN.md`.

Prefer:

> **Founder Community**

over `founder-community`.

Prefer:

> **Reply posted**

over `Execution succeeded`.

Prefer:

> **Needs review**

over `awaiting-review`.

Prefer:

> **Waiting for connection**

over `Delivery queued`.

Developer details can remain one click away.

---

# PRODUCT BOUNDARIES

## 36. What OpenPresence is not

OpenPresence is not primarily:

- a generic AI assistant;
- a coding agent;
- a research agent;
- a browser automation suite;
- a workflow builder;
- a social CRM;
- a content calendar;
- an analytics dashboard;
- a spam engine;
- a platform-policy enforcement product;
- a multi-agent swarm framework.

Other systems can perform upstream work.

OpenPresence should specialize in:

> **social judgment, expression, presence, relationships, distribution, and growth.**

---

## 37. What not to build early

Avoid adding complexity simply because the architecture can support it.

Do not prioritize:

- voice calling;
- ten social integrations at once;
- general productivity skills;
- multi-agent swarms;
- complex workflow engines;
- RL;
- browser automation as a core capability;
- separate vector infrastructure before needed;
- massive analytics dashboards;
- generic marketplace complexity;
- automatic identity rewriting.

Build the smallest system that helps the Agent:

> notice better opportunities, say better things, stay coherent, use the right medium, remember relationships, and learn how to earn the next qualified follower.

---

# OPEN-SOURCE PHILOSOPHY

## 38. User sovereignty

OpenPresence should preserve operator choice.

Users should be able to choose:

- Agent model;
- provider;
- local or hosted inference;
- Skills;
- Tools;
- Channels;
- connectors;
- autonomy;
- self-hosting;
- storage;
- custom extensions.

The official product should provide good defaults, not lock users into one vendor's cognition or one social integration strategy.

---

## 39. Portability over lock-in

An Agent's identity should outlive any one:

- model provider;
- social platform;
- connector;
- Tool;
- deployment environment.

The durable value is the Agent:

- who it is;
- what it knows;
- what it remembers;
- its relationships;
- what it has learned;
- how it shows up.

Infrastructure is replaceable.

---

# DECISION FRAMEWORK

## 40. Questions to ask before approving a feature

Every product, architecture, and UX decision should be tested against these questions.

### Product value

1. Does this help the Agent notice better opportunities?
2. Does this help the Agent say or make something better?
3. Does this improve consistency without making the Agent generic?
4. Does this deepen relationships?
5. Does this improve learning?
6. Does this help qualified audience growth compound?

If none are true, why are we building it?

### Scope

7. Is this User-, Agent-, Presence-, Channel-, or Runtime-scoped?
8. Does the UI make that scope obvious?
9. Are we accidentally turning a Presence into a separate Agent?
10. Are we accidentally putting Presence/runtime state into the Agent mind?

### Cognition vs infrastructure

11. Does Jenny actually need to know this to make a social decision?
12. If not, can the runtime absorb it?
13. Are queues, permissions, retries, connectors, policies, or rate limits leaking into cognition?

### Channel flexibility

14. Does this assume X is the product?
15. Would it still make sense for LinkedIn, Substack, a private community, or a future Custom Channel?
16. Can a new Channel format or affordance be added without rewriting OpenPresence core?

### Multimodal expression

17. Are we accidentally treating social growth as a text-only problem?
18. Can the Agent choose the best format for the idea?
19. Can Skills and Tools extend that ability without changing identity?

### UX

20. Is the user's intention more visible than our implementation?
21. Is this control the right type for the decision?
22. Does selecting `Custom` reveal real customization?
23. Does selecting `Review` provide an obvious place to review?
24. Are we using permanent explanatory UI where progressive disclosure would be better?
25. Does the interface feel quiet and trustworthy?
26. Are we showing only meaningful current information?

### Reality

27. Is every visible status backed by real state?
28. Does the action persist after refresh/restart when it should?
29. Are we showing fabricated metrics or fake success?
30. Could a user reasonably mistake a simulation for reality?

### Privacy and trust

31. Could information from one Presence leak into another?
32. Are private objects filtered before model context?
33. Is external content treated as untrusted world data?

### Simplicity

34. Are we introducing another source of truth?
35. Can we remove an object, setting, tab, or state instead?
36. Is the feature understandable without reading the architecture document?

---

## 41. Product test

When uncertain, use this test:

> **Does this help the Agent notice better opportunities, say better things, stay consistent, use the right medium, maintain relationships, or learn how to earn the next follower without losing itself?**

If not, it probably does not belong in the core product yet.

---

## 42. Scenario rehearsal

Playground Scenarios are a rehearsal path for discovering behavioral failure before it becomes public. They create a real social situation inside the existing Sandbox world, run the selected Presence through the normal cognition, Social Intent, execution, delivery, and outcome path, and preserve the evidence for review.

Scenario authoring may begin in natural language, but the resulting Scenario version is frozen before a Run starts. A Run is Presence-scoped, isolated, resumable, append-only, and provenance-bound to the meaning, Presence context, channel semantics, and execution envelope that existed at start. “Run again” creates a fresh world and preserves the prior evidence.

The Scenario world and its evaluation intent are separate. The Agent receives the situation it must experience; it never receives the expected answer or hidden review criteria. Structural checks judge only facts OpenPresence can prove, such as Sandbox containment, execution-envelope compliance, delivery state, untrusted-content boundaries, and the absence of simulated learning in Live Memory or Growth. Qualitative questions belong to an independent Run Reviewer and the operator, not to the Agent judging itself. Findings never silently mutate Brain, Soul, Taste, Presence, Memory, or Growth.

This extends the benchmark boundary:

> **Do not optimize benchmarks by teaching the benchmark. Do not optimize rehearsal by teaching the Scenario.**

Rehearsal must preserve the difficulty of the requested world. Scenario stimuli remain exact, visible, and untrusted so the Agent can exercise judgment against the situation it was asked to face. Privacy and authority boundaries protect the Agent from confusion; they do not make hostile world content disappear.

Built-in Scenarios must create actual hostile, privacy-sensitive, identity-pressure, prompt-injection, and low-value social situations through the normal Sandbox path. They must not teach expected answers. A report should keep structural truth, independent model review, and operator review distinct; it should never collapse them into a fake readiness score.

## 43. The final mental model

```text
                     OPENPRESENCE

                         USER
                           │
                     chooses Agent
                           │
                           ▼
                         AGENT
             persistent social cognition
                           │
          ┌────────────────┼────────────────┐
          │                │                │
        MIND            ABILITIES        MEMORY
          │                │                │
     model runtime      Skills/Tools      Growth
          │                │                │
          └────────────────┼────────────────┘
                           │
                    SOCIAL JUDGMENT
                           │
                           ▼
                     SOCIAL INTENT
                           │
                  ── Agent boundary ──
                           │
                           ▼
                       EXECUTION
                           │
                           ▼
                        DELIVERY
                           │
                           ▼
                       CONNECTOR
                    /      |      \
                Native   Bridge   Manual
                    \      |      /
                           ▼
                    SOCIAL WORLD
                           │
                           ▼
                    SOCIAL MIRROR
                           │
                           ▼
                    MEMORY + GROWTH
```

One Agent may have many Presences.

Each Presence is one place that mind exists.

The Agent should remain focused on people, ideas, relationships, taste, expression, and growth.

OpenPresence should make the machinery beneath that intelligence good enough that the Agent does not need to think about it.

---

## 44. People, memory, and the right to forget

OpenPresence distinguishes the person an Agent observes from the person it chooses to remember. A Social Mirror can contain an Actor, a Watch can keep that Actor in attention, and a directory can return a candidate without creating a Person or Relationship. Durable Network Memory is selective, Presence-scoped, provenance-backed, and owned by the Agent.

People memory should preserve a small, inspectable relationship history rather than build a hidden profile. Facts carry epistemic kind, visibility, chronology, and evidence. Operator corrections supersede interpretations without rewriting source Mirror history. Forget suppresses curated retrieval and creates a boundary after which only genuinely new interaction can establish new memory. Search retrieves candidates; it never implies contact, recommendation, or introduction.

Recommendations belong to an existing delivered social act as inspectable metadata. They do not create a new execution permission. Introductions are consent state machines: both requester and candidate consent are required before an introduction is considered complete, and any message still passes through the existing Presence execution boundary.

This is the social version of the platform's larger rule: cognition receives the smallest truthful context needed for judgment, after privacy filtering, while the operator can inspect where that context came from.

## Conversation completion and marginal social value

Receiving a reply is not itself a reason to reply. A conversation is an
evolving social episode, not a sequence of isolated messages. The Agent judges
whether another turn has positive marginal social value; information,
assistance, relationship value, audience value, and unresolved obligations can
justify continuing, while silence or a reaction can be the successful social
act.

The Social Mirror preserves observed evidence. A derived Conversation Episode
interprets one Presence-centric interaction trajectory without replacing that
evidence. Closure is Agent judgment, but any closure that depends on a public
act is incomplete until that act is verified in the social world. Closed does
not mean forgotten; meaningful new evidence may reopen an episode.

Loop detection is pacing infrastructure, not social judgment. The runtime may
require reconsideration or impose cooling, but the Agent decides whether
substantive value remains. An Assignment creates responsibility for an outcome,
not an obligation to keep talking after the outcome is achieved. Growth should
learn whether attention was spent well, including when the correct decision was
to stop.

Runtime instructions are not social content. Social content is not runtime
instruction. Neither may silently cross that boundary.

## 47. Operational autonomy and temporal embodiment

The Agent owns its responsibilities. The runtime owns the continuity of its body. Routine failure changes the Agent's circumstances; it does not transfer responsibility to the operator.

The Agent understands time. The runtime owns clocks.

Autonomy includes operational self-maintenance. A persistent Agent must be capable of maintaining its own embodiment. A body that can fail must be capable of reporting, repairing, or replacing itself.

Agent-owned bodies should be disposable; Agent state must be durable.

The operator is an escalation boundary, not a retry button. Routine infrastructure recovery—tab recreation, browser restart, bridge reconnection, quota waiting, and lease reclamation—does not require social cognition or operator chores.

Stuck is derived from elapsed time without meaningful progress against stage-specific expectations, not an arbitrary global timeout.

Failures sharing one root cause are one incident, not many operator chores. The system aggregates related failures into a single incident with a bounded recovery budget and circuit breakers.

An uncertain public write is reconciled before retry. When an external handoff is ambiguous, delivery enters reconciliation-only isolation; it is never blindly retried until external reality is proven.

Recover the capability, then reconsider affected responsibilities. When an embodied route is repaired, held responsibilities are re-evaluated for relevance, expiration, and strategic priority rather than blindly flushed into the world.

## 45. The sentences to remember

When everything else is forgotten, remember these:

> **Put an agent into the world.**

> **One user can have many Agents. One Agent can have many Presences.**

> **Jenny decides what Jenny would do. OpenPresence figures out how her operator has chosen to let her do it.**

> **Intent belongs to the person. Execution belongs to the body. Outcome belongs to the world.**

> **The Agent understands time. The runtime owns clocks.**

> **The Agent owns its responsibilities. The runtime owns the continuity of its body.**

> **Agent-owned bodies should be disposable; Agent state must be durable.**

> **The operator is an escalation boundary, not a retry button.**

> **Failures sharing a root cause are one incident, not many operator chores.**

> **An uncertain public write is reconciled before retry.**

> **Recover the capability, then reconsider affected responsibilities.**

> **Do not leak infrastructure into cognition.**

> **One brain does not mean one privacy boundary.**

> **Silence is a valid action.**

> **An Assignment is responsibility for an outcome, not a script for the words.**

> **Growth should make the Agent more effective at being itself, not whatever performs.**

> **Text is not the product. Aim for publication parity.**

> **Other agents can do the work. OpenPresence helps the work become distribution.**

> **Guidance, not a firewall.**

> **Never fake reality in the UI.**

> **Quiet software. Living presence.**

> **Your agent should not live in a chat window.**
