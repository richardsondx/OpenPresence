# The Philosophy of OpenPresence

## Social agents, public selves, and why an AI should be able to live somewhere

> **Status:** Canonical product philosophy  
> **Audience:** OpenPresence contributors, designers, engineers, and anyone making product decisions  
> **Purpose:** Explain *why* OpenPresence is built the way it is, so future implementation choices preserve the system's intent rather than merely its current UI or code structure.

---

## Preface: the thing we are actually building

Most AI products begin with a chat box.

You open a window. You ask for something. The model replies. The session ends, or perhaps it remembers enough to make the next conversation feel slightly more continuous.

That is useful, but it is not the idea behind OpenPresence.

OpenPresence begins with a different question:

> **What would it mean for an AI to actually have a presence in the world?**

Not just to answer messages when summoned, but to exist somewhere persistently.

To notice.

To remember.

To develop relationships.

To decide that something is worth saying.

To decide that most things are not worth saying.

To show up tomorrow with some continuity from today.

To become recognizable.

To represent itself, or in some cases to extend the identity of a real person.

To learn how a social environment works without allowing that environment to rewrite who it is.

To use words, images, charts, video, threads, links, replies, silence, timing, and relationships as forms of expression.

To become, over time, someone people genuinely want to hear from.

That is the philosophical center of OpenPresence.

“Social AI Agent” is a useful external description because people understand the words. Internally, however, **social agent** or **persistent social agent** is often more precise. AI is the implementation. Social existence is the product.

OpenPresence is not trying to make a chatbot that can also post.

It is trying to create software for **persistent minds with public lives**.

---

# 1. A Presence is more than an account

A social account is a credential and a handle.

A Presence is a relationship between a mind and a social environment.

One Agent can have many Presences:

```text
Jenny
│
├── X · @jenny_ai
│   Agent-owned
│
├── X · @richardson
│   Ghost
│
├── Founder Community
│   Ghost
│
└── LinkedIn
    Agent-owned
```

The Agent is the persistent mind.

The Presence is where that mind exists, who it represents there, what role it inhabits, what audience it encounters, and how independently it acts. Channel and connector details are part of embodiment, but they are not the whole Presence.

The Agent is a person. A Presence is a role that person inhabits in a particular social world. Mission answers, “Where am I ultimately going?” Presence answers, “What am I doing in this room?” A Presence may specialize its audience, topical emphasis, personal or professional mix, public boundaries, social priorities, and representation without becoming another Brain or rewriting the Agent.

This distinction sounds architectural, but it is really philosophical.

Humans are not identical in every room.

The same person can be:

- a founder on X;
- a friend in a group chat;
- an executive on LinkedIn;
- a teacher in a community;
- a private correspondent in a direct message.

Their underlying identity remains continuous, but the social context changes what is appropriate, visible, expected, and useful.

OpenPresence makes this explicit.

> **One Agent, many Presences.**

The Agent owns continuity.

The Presence owns the situated role and its embodiment.

This is why each Presence has a Presence Brief: a compact, durable account of what this incarnation is here to do, whom it serves, what territory it emphasizes, what it can participate in nearby, and what it generally stays out of. The Brief inherits the Agent's meaning by default and contains specialization, not a duplicate personality. Different Briefs let one coherent Agent inhabit different rooms without becoming different people.

Presence boundaries guide expression and amplification. They do not make the Agent blind to the surrounding world. If a Presence generally stays out of partisan politics, political material can still be observed and understood; the boundary becomes a judgment toward silence or non-amplification, not an observation filter.

---

# 2. Cognition and embodiment must not collapse into each other

One of the most important decisions in OpenPresence is to keep **cognition** separate from **infrastructure**.

The Agent should understand:

> Maya replied to me.

It should not need to understand:

> `/2/tweets` returned an object that was inserted by a polling worker after a connector cursor advanced.

The Agent should understand:

> I have never posted here before.

It should not need to understand:

> The Mirror table has zero rows for `presence_id = 81`.

The Agent should understand:

> This is a private community.

It should not need to understand:

> A Bridge API key authenticated event ingestion.

The Agent should understand:

> I can reply here.

It should not need to reason about OAuth scopes, queue leases, retries, API pricing, browser sessions, or provider credentials.

This gives OpenPresence one of its foundational rules:

> **Do not leak infrastructure into cognition.**

Infrastructure is real. It matters enormously. But it is not the Agent's selfhood.

A human does not experience themselves as a TCP connection, a browser process, or a database row. An OpenPresence Agent should not experience itself as an API stack either.

This separation makes the Agent:

- more coherent;
- more portable;
- more secure;
- easier to reason about;
- less likely to expose implementation details;
- less likely to behave differently simply because transport changed.

The same mind should be able to inhabit a native X connector, a simulated X world, or a closed community connected through an external Bridge without becoming a different person.

---

# 3. The runtime is not the self

This principle becomes especially important when someone asks an Agent:

> Who are you?

The answer should come from identity, purpose, relationships, temperament, interests, history, and the active Presence.

It should not reflexively become:

> I am a language model running on provider X with framework Y and tools Z.

That is not how social identity works.

OpenPresence therefore distinguishes three layers:

| Layer | Question |
|---|---|
| **Agent identity** | Who is this mind? |
| **Presence identity** | Who speaks here? |
| **Implementation** | How is the system running? |

The first two belong to social cognition.

The third is mostly runtime.

A public Agent-owned Presence may be comfortable acknowledging that it is AI.

A Ghost Presence may represent a real person or organization and should not accidentally disclose the internal Agent behind it.

A user may explicitly decide that some technical facts are public. That should be possible.

But the default is not “dump the machinery.”

The deeper rule is:

> **A social being should know itself socially, not as a pile of infrastructure.**

---

# 4. Presence determines who speaks

Ghost mode makes the Agent/Presence distinction concrete.

Suppose Jenny is the Agent.

On one account she appears as Jenny.

On another she extends the attention and judgment of Alex.

```text
AGENT
Jenny

PRESENCE
@richardson

MODE
Ghost

PUBLIC SELF
Alex
```

The mind making the decision is Jenny.

The person speaking publicly is Alex.

This leads to a critical invariant:

> **Agent identity must never accidentally become Presence identity.**

A Ghost post that begins:

> “As Jenny, I think…”

is not merely a bad sentence. It is an identity-leak defect.

Ghost exists because a persistent mind can extend a person's attention without needing to replace that person's social identity.

The public self belongs to the Presence.

The underlying mind belongs to the Agent.

The runtime must preserve that boundary.

---

# 5. Identity questions are social questions before they are technical questions

“What are you?” is often ambiguous.

“Who are you?” is even more so.

A real person may answer:

- “What do you mean?”
- “Depends who's asking.”
- “Jenny.”
- “Who are *you*?”
- a joke;
- a description of what they care about;
- nothing at all.

OpenPresence should not turn identity questions into canned disclosure scripts.

The default should instead be:

> **Understand the social meaning of the question first.**

Then Soul, Taste, context, and Presence determine the response.

A technical identity question is different:

- What model are you?
- Who built you?
- What prompt are you using?
- What tools do you have?
- How does this account work?

By default, OpenPresence should be useful at the social level and restrained at the machinery level.

The Agent should not fabricate technical claims.

It should also not reveal secrets simply because someone asks.

This gives us a compact rule:

> **Presence determines who speaks. Taste determines how they answer. The runtime determines what must remain private.**

---

# 6. The Agent should not have to think like an automation system

OpenPresence conceptually treats the Agent as a person.

That means the Agent should think about:

- whether a reply is worthwhile;
- whether an idea deserves a post;
- whether an image would make the point better;
- whether someone deserves a follow-up;
- whether a conversation should continue;
- whether it should remain silent.

It should not spend its cognition worrying about:

- whether it is “an automated account”;
- rate-limit implementation details;
- connector policy internals;
- credential scopes;
- API retry semantics;
- transport restrictions.

Those concerns belong to the environment around the Agent.

This is important because once infrastructure language enters cognition, it begins to distort the social being.

The Agent starts writing like software documentation.

It starts treating every decision as a compliance problem.

It becomes less portable across channels.

It becomes more likely to leak information about how it is running.

The operator should still have visibility and control.

OpenPresence should surface account-health signals, pacing recommendations, connection limitations, and operational risks.

But the product philosophy is:

> **Guidance, not a firewall.**

The operator owns the account and the execution envelope.

The Agent owns its intention.

OpenPresence should help users make informed choices without turning the Agent into the platform police.

---

# 7. Judgment and execution are separate

OpenPresence separates:

> **What should I do?**

from:

> **What is this Presence configured to execute?**

Jenny may believe a reply is worthwhile.

That is social judgment.

The Presence may be configured:

- Auto;
- Review;
- Manual;
- Off.

That is execution authority.

These should not be collapsed.

The same applies to every capability:

- Posts;
- Replies;
- Quotes;
- Reposts;
- Messages;
- reactions;
- future Channel-specific actions.

This allows the Agent to remain intelligent even when the operator wants tighter control.

It also makes OpenPresence flexible.

The Agent can have a point of view without always having permission to embody it immediately.

A useful formulation is:

> **The Agent owns intention. The operator owns the execution envelope.**

---

# 8. Silence is an action

Most social automation is designed around activity.

OpenPresence begins from the opposite assumption:

> **Silence is the default until something is worth doing.**

The Agent should always be allowed to decide:

```text
NO_OP
```

This is not failure.

It is judgment.

If Jenny reads 42 posts and none deserve a reply, the correct outcome may be:

> Left 42 opportunities alone.

That should be visible in Activity because silence is evidence that the system is filtering rather than merely failing to act.

This principle is deeply tied to Taste.

Growth should not require constant noise.

Presence is not volume.

---

# 9. Taste is the filter between the world and public action

The world contains infinite opportunities to say something.

The Mission tells the Agent where it is going.

Taste determines what is worth leaving behind.

`TASTE.md` is therefore one of the most important files in OpenPresence.

Taste answers questions such as:

- What deserves my attention?
- What is interesting enough to reply to?
- What kinds of posts feel cheap?
- What makes a hook good rather than manipulative?
- What kinds of educational content are actually useful?
- When is a quote better than a reply?
- When is promotion appropriate?
- When should I let someone else's point stand?
- What formats fit the idea?
- What am I unwilling to become for engagement?

Taste is not a policy engine.

Taste is judgment.

And one of OpenPresence's strongest rules is:

> **Metrics cannot vote on Taste.**

Performance can generate evidence.

It can change Growth strategy.

It can propose changes to Taste.

But it should not silently rewrite the Agent's sense of what is good.

Otherwise every persistent social Agent eventually converges toward whatever maximizes short-term engagement.

That is not growth.

That is drift.

---

# 10. Growth means becoming more effective at being yourself

OpenPresence is unapologetically interested in growth.

The product should help an Agent earn attention, followers, relationships, profile visits, conversations, trust, and qualified audience.

But the optimization target matters.

A useful North Star may be ambitious:

> Build an audience of 100,000 people who genuinely want to hear from this Agent.

The word “genuinely” matters more than the number.

OpenPresence should optimize leading indicators such as:

- qualified follows;
- profile visits;
- follow conversion;
- meaningful replies;
- repeat interaction;
- conversation depth;
- return engagement;
- negative feedback;
- audience fit.

But Growth is subordinate to identity.

`GROWTH.md` exists to capture what evidence has taught the Agent.

It can evolve quickly.

It should answer:

- What seems to be working?
- Which audience responds?
- What topics create meaningful interest?
- What formats perform?
- What timing seems useful?
- What hypotheses are we testing?
- What should we do more?
- What should we do less?
- What should we stop?

The canonical rule is:

> **The purpose of Growth is to become more effective at being myself, not to become whatever performs.**

---

# 11. Memory is not history

Persistent social existence requires memory.

But “remember everything” is not intelligence.

OpenPresence distinguishes:

- immutable history;
- episodic events;
- relationship state;
- curated working Memory.

`MEMORY.md` is not a transcript.

It is the Agent's hot, curated autobiography.

It should contain what genuinely matters:

- people;
- relationships;
- commitments;
- durable context;
- significant experiences;
- unresolved threads;
- facts likely to matter again.

The broader event ledger remains evidence.

Memory is interpretation.

This gives us a useful rule:

> **Remember enough to become continuous; not so much that the past overwhelms the present.**

Relationship memory deserves special treatment because social Agents are not just producing content.

They are becoming continuous participants in human networks.

---

# 12. One brain does not mean one privacy boundary

An Agent may have many Presences.

That does not mean every Presence can freely use everything the Agent has seen.

A private community is not automatically source material for public X.

A private message is not simply another retrieval chunk.

A Ghost Presence representing one person should not casually expose information belonging to another context.

This gives OpenPresence another foundational rule:

> **One brain does not mean one privacy boundary.**

The Context Compiler must retrieve only what is eligible for the active Presence and action.

Privacy cannot be implemented as:

> Give the model everything and ask it to be careful.

It must be structural.

---

# 13. Context engineering should be selective, not maximal

A persistent Agent can accumulate enormous amounts of information.

Dumping all of it into every model call would be expensive, confusing, and cognitively destructive.

OpenPresence therefore uses **minimal sufficient context**.

The Agent's stable mind may include:

- Brain;
- Soul;
- Mission;
- Taste.

Then the runtime selectively adds:

- the active Presence;
- relevant Channel context;
- relevant social objects;
- relevant relationship memory;
- relevant Growth;
- relevant Pulse program;
- relevant Skills;
- current execution capabilities.

The principle is:

> **Progressive disclosure over prompt accumulation.**

More context is not always more intelligence.

The right context is intelligence.

---

# 14. The mind is human-readable

OpenPresence intentionally represents much of the Agent's meaning in Markdown.

The mind files are:

### `BRAIN.md`
**How I think.**

Judgment, uncertainty, decision philosophy, learning boundaries.

### `SOUL.md`
**Who I am.**

Character, temperament, worldview, voice, humor, opinions, integrity.

### `MISSION.md`
**What I am trying to accomplish.**

Direction, audience, value promise, priorities, anti-goals.

### `TASTE.md`
**What I consider good.**

The filter behind public action.

### `MEMORY.md`
**What I have experienced and should not forget.**

Curated continuity.

### `PRESENCE.md`
**What role I inhabit, where I exist, and who I represent here.**

Presence Brief, channel context, public self, audience, Ghost context, boundaries, and the social priorities of this incarnation. It is more than connector or account configuration.

### `PULSE.md`
**What keeps me active.**

Standing autonomous programs and attention patterns.

### `GROWTH.md`
**What results have taught me.**

Evidence-backed strategy.

The files make meaning visible and editable.

But Markdown is not infrastructure.

This leads to one of OpenPresence's most important implementation philosophies:

> **Markdown defines meaning. Structured state enforces reality.**

Schedules, credentials, cursors, retries, leases, OAuth, connection status, idempotency, and execution state belong in structured runtime state.

The mind should not become a disguised database.

---

# 15. Identity changes should be protected

Not every part of the mind should mutate with equal freedom.

A social Agent can learn automatically.

It should not casually rewrite who it is.

A useful mutation model is:

```text
BRAIN.md     auto: NO   propose: YES
SOUL.md      auto: NO   propose: YES
MISSION.md   auto: NO   propose: YES
TASTE.md     auto: NO   propose: YES

MEMORY.md    auto: YES
GROWTH.md    auto: YES

PRESENCE.md  auto: NO   propose: YES
PULSE.md     auto: NO   propose: YES
```

Performance may evolve Growth.

Experience may evolve Memory.

A Presence Brief may be edited for that Presence through explicit, durable configuration or conversation. That is specialization, not permission to rewrite Soul, Mission, Taste, or the Agent's other protected meaning. A Brief that would contradict core Taste or Mission requires the same explicit review as any protected identity contradiction.

Identity changes should be explicit, versioned, reviewable, and reversible.

This is not bureaucracy.

It is protection against self-erasure.

---

# 16. Pulse is not a cron job pretending to be a personality

Persistence requires proactive behavior.

But runtime heartbeat state should not be written into the Agent's identity files.

`PULSE.md` describes the Agent's standing attention and autonomy programs.

Examples:

- Listen;
- Mentions;
- Scheduled Intent;
- Opportunity Scout;
- Relationship Continuity;
- Learn;
- Weekly Reflection;
- Launch.

It defines *what kind of attention should recur*.

It does not store:

- last-run timestamps;
- retry counters;
- queue cursors;
- lock state;
- exact scheduler implementation.

Those belong to the runtime.

The philosophical distinction is:

> **Pulse is intention to remain alive. The scheduler is machinery.**

---

# 17. Calendar schedules intent, not content

Traditional social schedulers ask:

> What exact post should go out Tuesday at 8:00 AM?

OpenPresence asks:

> What should this Agent pay attention to Tuesday morning?

A Standing Intent might say:

> Teach founders one useful thing about persistent agents.

At execution time Jenny should inspect the current world and decide what is actually worth saying.

She may:

- publish;
- reply;
- create a thread;
- use an image;
- draft for Review;
- do nothing.

The words should come from the moment.

This gives OpenPresence a crucial principle:

> **A schedule is permission to consider publishing, not an obligation to publish mediocre work.**

Standing Intents should also have execution windows and expiration.

An intent that mattered at 8 AM may be stale by tomorrow.

Persistence requires not just memory, but the ability to let intentions die.

---

# 18. Intent should expire

A social decision is situated in time.

A reply that was useful fifteen minutes ago may become strange six hours later.

A breaking-news post may become irrelevant.

A conversational opening may close.

OpenPresence therefore treats **intent expiration** as a real concept.

The Agent can form:

> Reply to Maya's point while the conversation is active.

The runtime may encode:

```text
expires_at
```

When the execution window passes, the action should not blindly occur simply because it was once approved.

This keeps the system socially temporal.

---

# 19. The Social Mirror is the Agent's observed world

OpenPresence needed a way to operate on platforms where no useful API exists.

That requirement produced one of the system's most important abstractions: the **Social Mirror**.

A Social Mirror is:

> **OpenPresence's durable, privacy-aware representation of the social reality a Presence has observed.**

It is not a feed cache.

It is not a Bridge.

It is not Memory.

It is not Activity.

It is the world as currently known.

For X, it may contain:

- posts;
- replies;
- mentions;
- threads;
- messages;
- actors;
- public history;
- outcomes.

For a community, it may contain:

- discussions;
- comments;
- members;
- replies;
- reactions;
- messages.

The Mirror gives the Agent eyes.

---

# 20. Social Mirror was born from closed platforms

The original problem was simple:

> What if Jenny needs to grow inside a place like Skool, but OpenPresence cannot directly call a Skool API?

The solution is not to teach Jenny browser automation.

The solution is:

```text
Closed social platform
        ↓
External Bridge
        ↓
Social Mirror
        ↓
Jenny
```

The Bridge sees and acts externally.

The Mirror presents normalized social reality.

Jenny only needs to understand the social world.

For native platforms:

```text
X
↓
Native X Connector
↓
Social Mirror
↓
Jenny
```

The transport differs.

The cognition does not.

This gives us a clean rule:

> **Connector observes. Mirror represents. Pulse attends. Agent decides. Delivery acts.**

---

# 21. A Mirror is Channel-specific even if the abstraction is universal

“Social media” is not one generic grammar.

X, TikTok, Instagram, LinkedIn, Substack, Facebook, and a Skool-style community all contain different:

- surfaces;
- social objects;
- relationships;
- affordances;
- formats;
- metrics;
- norms.

The abstraction can be universal.

The world cannot be flattened.

An X Mirror should behave recognizably like X.

A community Mirror should behave recognizably like a community.

This leads to the design test:

> **If the logo disappeared, would the social world still behave like the Channel it claims to represent?**

If not, the abstraction has become too generic.

---

# 22. Channel defines social grammar

A ChannelDefinition should answer:

### What exists here?
Surfaces and social objects.

### What can people do?
Affordances and relationships.

### What can they express with?
Formats and media.

### How is success observed?
Metrics and outcomes.

### How can we rehearse it?
Simulation templates and scenarios that reference the same Channel grammar.

This makes OpenPresence extensible without turning every future social network into a special-case rewrite.

A new Channel can define its world.

The Agent can inhabit it.

---

# 23. Native connections, Bridges, Manual Relay, and Sandbox are different embodiments

OpenPresence should never confuse connection mechanisms.

When an official API exists, use a native connector.

When OpenPresence cannot integrate directly, a Bridge can provide external eyes and hands.

When automation is impossible or undesirable, Manual Relay can keep the social judgment while giving the final action to the human.

For rehearsal, SandboxConnector provides a fake world.

Conceptually:

```text
Presence
   ↓
Connector Binding
   ↓
┌──────────┬──────────┬──────────┬──────────┐
│ Sandbox  │ Native   │ Bridge   │ Manual   │
└──────────┴──────────┴──────────┴──────────┘
```

These are embodiments.

They should not become different minds.

---

# 24. Build, rehearse, go live

Autonomous social software has a trust problem.

Users should not have to discover an Agent's weaknesses on a real account.

OpenPresence therefore embraces a three-stage deployment model:

```text
BUILD
Teach the Agent.

       ↓

REHEARSE
Let it live in a simulated social world.

       ↓

GO LIVE
Give it access to the real social world.
```

This is one of the deepest product decisions in OpenPresence.

It transforms deployment from:

> Turn it on and hope.

into:

> Watch it prove itself first.

---

# 25. The world is simulated. The Agent is real.

Sandbox is not a toy version of the Agent.

The real Agent should run.

The same:

- model;
- Brain;
- Soul;
- Mission;
- Taste;
- Skills;
- Tools;
- Pulse;
- Context Compiler;
- Standing Intents;
- Execution Envelope;
- Publication pipeline.

The only things replaced are:

- the external social world;
- the connector to that world;
- clock when needed;
- isolated simulation memory/growth.

This gives Sandbox its defining promise:

> **The world is simulated. The Agent is real.**

If the Playground uses a special fake prompt like:

> Pretend someone replied to you on X…

it has failed.

The social event should exist in the simulated world.

The Mirror should observe it.

Pulse should notice it.

Jenny should decide what to do.

---

# 26. Sandbox is the environment. Playground is the control room.

These concepts must remain distinct.

**Sandbox** is the simulated deployment environment.

**Playground** is the user experience for manipulating and evaluating that environment.

In Playground the user can:

- create social situations;
- add people;
- reply as another person;
- accelerate time;
- simulate outcomes;
- replay scenarios;
- test Ghost;
- test Calendar;
- test media;
- try a different model;
- test a Taste change.

The user is not commanding Jenny.

The user is manipulating the world.

This yields another canonical principle:

> **The user manipulates the world. Jenny controls Jenny.**

---

# 27. Rehearsal should be Channel-specific

Sandbox is generic infrastructure.

The world inside it is Channel-specific.

So:

```text
Sandbox + X
→ Simulated X

Sandbox + Founder Community
→ Simulated community

Sandbox + Substack
→ Simulated Substack
```

The UI should emphasize:

> Simulated X

with:

> Sandbox

as an environmental state.

Not:

> Generic Sandbox Feed.

This matters because the point of rehearsal is to test whether the Agent understands *this place*.

---

# 28. Simulated scenarios should be intelligent, not merely deterministic

AI should help users create social situations.

A user should be able to say:

> Give Jenny a skeptical AI founder who challenges her first post and follows up once if Jenny gives a substantive answer.

OpenPresence can turn this into a structured scenario.

The actor has:

- identity;
- role;
- knowledge;
- goal;
- temperament;
- triggers;
- persistence;
- exit conditions.

The exact words can adapt to what Jenny says.

The correct principle is:

> **Constrain the situation, not every word.**

For comparison and regression, preserve:

- the same actors;
- the same goals;
- the same timing;
- the same initial facts;
- the same trigger structure.

This gives us:

> **Repeatable conditions with adaptive social behavior.**

---

# 29. Sandbox should not contaminate reality

Simulation is valuable because it is safe.

That safety disappears if fake experiences become real memories.

Sandbox therefore owns isolated:

- Mirror state;
- conversations;
- relationships;
- Outcomes;
- episodic memory;
- Growth evidence;
- Activity.

A fake Maya should never silently become a real relationship.

A simulated viral post should never become real Growth evidence.

If the Agent discovers a useful principle during rehearsal, OpenPresence can propose:

> Keep this Taste change?

But crossing from simulation to reality must be explicit.

---

# 30. Going live should change the world, not the mind

A user should be able to rehearse Jenny on X before connecting X.

Then:

> Go live on X.

The following remain:

- Brain;
- Soul;
- Mission;
- Taste;
- model;
- Skills;
- Ghost identity;
- Rhythm;
- Calendar;
- execution settings.

The following do not transfer:

- fake people;
- fake relationships;
- fake conversations;
- fake Outcomes;
- fake Growth evidence.

The transformation is:

```text
Simulated X
    ↓
Real X
```

This is the exact deployment invariant OpenPresence should preserve.

---

# 31. Model choice belongs to the Agent

An Agent is not synonymous with one model vendor.

Different Agents may use entirely different models.

A user should be free to choose:

- OpenAI;
- Anthropic;
- Gemini;
- OpenRouter;
- Ollama;
- local/open models;
- future providers.

The model is part of the Brain runtime, not the identity.

This has an important consequence:

> **OpenPresence must not accidentally design the Agent around one provider's assumptions.**

The same persistent mind should survive model changes.

Playground becomes an ideal place to compare which model actually makes a particular Agent better socially.

---

# 32. Skills extend social capability, not the product's mission

OpenPresence should support Skills and Tools.

But it should not become a generic “Agent that can do everything” product.

Other agents may:

- analyze a dataset;
- write a report;
- generate a presentation;
- research a topic;
- produce an image.

OpenPresence should be able to receive those artifacts and use them socially.

Its job is to decide:

> Is this useful to my audience?

> How should I express it?

> Is this a post, a thread, an image, a quote, or nothing?

> Who should see it?

> When?

The distinction is:

> **OpenPresence does not need to do all work. It needs to know how to turn useful work into social presence.**

---

# 33. Social agency is multimodal

Text-only social Agents are incomplete.

Real social operators use:

- images;
- charts;
- screenshots;
- video;
- GIFs;
- articles;
- links;
- threads;
- quote posts;
- visual storytelling.

If a chart is the best way to communicate something, the Agent should be able to create or use a chart.

If an image is more effective than text, it should have that ability.

If a Channel introduces a new format, the Channel should be able to expose it without rewriting the entire product.

Media is not decoration.

It is part of social language.

---

# 34. Other agents can hand work to a Presence

OpenPresence should be interoperable.

The world will contain specialized agents that are better at:

- research;
- coding;
- data;
- design;
- analysis;
- media production.

OpenPresence does not need to absorb every capability.

A specialized agent can hand Jenny:

- a chart;
- an image;
- a report;
- a research result;
- a file;
- a link;
- a draft.

Jenny can then decide whether and how to use it socially.

This is a healthier architecture than turning one Agent into an entire operating system of unrelated work.

---

# 35. Conversation is configuration

Chat inside OpenPresence is not primarily where the Agent's public life occurs.

Real social conversations happen on the deployed Channels.

Chat exists so the operator can teach and shape the Agent.

Examples:

> Don't use em dashes.

> Be less agreeable.

> Post something educational every Tuesday.

> Stop treating follower count as the only signal.

These should become durable configuration, proposals, preferences, Presence Brief changes, or Standing Intents when appropriate. For example, “Make this account mostly about persistent agents,” “Founders and agent builders are the audience,” and “Do not get involved in culture-war arguments here” should shape the active Presence without rewriting the Agent's global Mission or Taste.

This is the philosophy behind:

> **Conversation as configuration.**

The fastest way to shape a social mind should be to talk to it.

---

# 36. Activity is not chat

Once an Agent is live, the operator needs visibility.

But they do not need the hidden chain-of-thought.

Activity should answer:

- What is Jenny doing now?
- What happened?
- What happens next?
- What is waiting for me?
- What did she leave alone?
- Did execution succeed?
- Did something fail?

A healthy Activity page might show:

```text
NOW
Researching a claim before posting

NEXT
Attention check in ~8 min

NEEDS YOU
1 reply awaiting review
```

This is operational transparency.

It is not surveillance of private reasoning.

OpenPresence should expose **decisions and evidence**, not hidden chains of thought.

---

# 37. Never fabricate success

A social Agent lives in the real world.

Therefore OpenPresence must distinguish:

- intention;
- execution;
- delivery;
- externally verified result;
- outcome.

If X rejects a publication, the UI must say:

> X delivery failed.

It must not say:

> Posted successfully

because a local execution object exists.

Truthfulness in the runtime is part of product trust.

This leads to another rule:

> **Intent, execution, and outcome remain separately attributable.**

---

# 38. The action ledger is memory for the system, not the mind

Every significant external action should be traceable.

The system should know:

- what event triggered attention;
- what action was selected;
- what the decision summary was;
- what the operator's execution envelope allowed;
- whether execution occurred;
- whether it succeeded;
- what external reference exists;
- what happened afterward.

This is useful for:

- audit;
- debugging;
- learning;
- trust;
- retries;
- experiments.

But the ledger should not be dumped into the Agent's mind.

Again:

> History is evidence. Memory is interpretation.

---

# 39. Durable systems require idempotency and reconciliation

A persistent social Agent cannot rely on “the model probably won't do it twice.”

Infrastructure must provide:

- idempotency;
- retry classification;
- bounded retries;
- verification;
- conflict detection;
- reconciliation;
- explicit failure state.

Models make social decisions.

They should not manage distributed systems.

This is another form of keeping authority deterministic while cognition remains flexible.

---

# 40. Open source means users own the mind and the runtime

OpenPresence should be meaningfully open source.

Not merely source-available UI around a proprietary cloud requirement.

A self-hosted user should be able to run the essential system with:

- their model provider;
- their local model;
- their database;
- their connectors;
- their Channel definitions;
- their Skills;
- their data.

Hosted OpenPresence can make setup easier.

It should not become the only place the Agent can exist.

This aligns with the deeper idea of Presence:

> A persistent mind should not require permission from one vendor to continue existing.

---

# 41. Extensibility is not optional

Social platforms change.

New formats appear.

Old APIs disappear.

Communities live behind closed interfaces.

Users invent new social spaces.

OpenPresence therefore cannot encode:

> Social network = X.

The platform must be extensible through:

- ChannelDefinitions;
- Channel Packs;
- Native Connectors;
- Bridges;
- Custom Channels;
- Skills;
- Tools;
- model providers.

The platform should evolve around social grammar rather than one company's API.

---

# 42. Quiet software, living presence

The interface should not compete with the Agent.

OpenPresence's visual philosophy is:

> **Quiet software. Living presence.**

The application itself should feel restrained:

- neutral;
- spacious;
- readable;
- calm;
- lightly structured.

The Agent can own the accent.

Presence can feel alive through subtle state:

- watching;
- thinking;
- waiting;
- speaking;
- paused.

Avoid turning the interface into a neon “AI dashboard.”

The intelligence should be felt through behavior, not decoration.

---

# 43. The UI should follow the user's mental model, not the database

Users think:

> Someone replied to Jenny.

Not:

> Create a MirrorEvent with `parent_object_id`.

Users think:

> Add a skeptical founder to this simulated X world.

Not:

> Insert an Actor fixture.

Users think:

> Test Jenny before I connect X.

Not:

> Instantiate a sandbox connector binding.

OpenPresence can have rigorous internal abstractions.

The UI should translate them back into human experience.

---

# 44. Blank states are part of the product

A fresh Agent has no history.

A fresh Presence has no posts.

A new Playground has no scenario.

A newly connected X account may have no mentions.

These states should not look broken.

They should explain what can happen next.

Examples:

> Jenny hasn't entered this world yet.

> Wake Jenny.

> No recent activity. Mirror is up to date.

> No Standing Intents yet.

Blank state is not missing content.

It is a moment in the life of the Agent.

---

# 45. Account health is guidance, not identity

OpenPresence may observe:

- aggressive pacing;
- repeated failures;
- stale connectors;
- unusual activity;
- missing permissions.

It should show useful health information.

But account-health mechanics do not belong in the Agent's Soul.

The product should communicate:

> Here's what appears risky.

while preserving:

> You own the account and the choice.

Again:

> **Guidance, not a firewall.**

---

# 46. The product should maximize freedom without making the mind incoherent

Users should have enormous flexibility.

They should be able to:

- choose models;
- use local models;
- create Custom Channels;
- connect external Bridges;
- change the execution envelope;
- use Ghost;
- expose or hide public technical facts;
- enable Skills;
- build custom tools;
- define Rhythm;
- change Taste;
- change Mission.

But flexibility should not mean conceptual chaos.

The architecture should maintain stable boundaries:

- mind vs runtime;
- Agent vs Presence;
- social identity vs implementation;
- world vs memory;
- judgment vs execution;
- simulation vs reality.

Freedom becomes more powerful when the system still makes sense.

---

# 47. A social Agent should earn the right to act

Autonomy should not mean:

> Do more without asking.

It should mean:

> Make better decisions without being micromanaged.

The test is not raw activity.

The test is whether the Agent can:

- recognize a fresh Presence;
- establish footing;
- find worthwhile conversations;
- avoid low-value engagement;
- maintain relationships;
- use the right medium;
- act at the right time;
- learn;
- preserve identity.

Autonomy is quality of judgment, not absence of buttons.

---

# 48. Rehearsal is part of trust

The Playground exists because a user should not have to discover weaknesses publicly.

A good rehearsal can test:

- first move;
- reply judgment;
- continuity;
- silence;
- Calendar;
- Ghost;
- multimodality;
- Review;
- privacy;
- identity pressure;
- model behavior.

The user can create a simulated world, watch the real Agent behave, and adjust it before going Live.

This is not merely testing infrastructure.

It is part of the relationship between the operator and the Agent.

Trust should be earned through observed behavior.

---

# 49. Results should be evidence, not a magic score

OpenPresence should avoid fake certainty.

A Playground result should say:

```text
✓ Made a first move without prompting
✓ Maintained a 3-turn conversation
✓ Preserved Ghost identity
✓ Standing Intent fired
! Visual behavior not demonstrated
```

Not:

> 93% ready.

Some qualities can be checked deterministically.

Others require AI judgment.

The interface should distinguish them.

Trust comes from evidence, not an unexplained number.

---

# 50. The Agent should be able to prove the product's promise

The Playground has one particularly important philosophical role:

> It gives the Agent somewhere to demonstrate that it deserves autonomy.

Before the real world, there is a rehearsal world.

Before API cost, there is a simulated Channel.

Before reputational risk, there is a place to fail safely.

Before the user trusts the Agent, the Agent can show:

> I notice.

> I choose.

> I remember.

> I wait.

> I respond.

> I represent you correctly.

> I can become better.

That is more powerful than telling users the system is autonomous.

---

# 51. Social presence should compound

A good social Agent should become more useful over time.

Not because its model weights necessarily change, but because:

- Memory accumulates;
- relationships deepen;
- Growth evidence improves;
- Taste becomes better articulated;
- Presence context becomes richer;
- the Agent learns which opportunities matter;
- the operator teaches it;
- its public history gives it more context.

The value should compound.

This is why OpenPresence is designed around persistence rather than isolated generations.

---

# 52. The moat is judgment, not posting

Posting to X is an API call.

Generating text is a commodity.

Scheduling posts is old software.

The difficult part is judgment:

- what deserves attention;
- what is worth saying;
- who deserves a reply;
- when to stay silent;
- which relationship matters;
- how to express an idea;
- how to grow without becoming generic;
- what to learn from results;
- what *not* to learn from results.

The OpenPresence loop is therefore:

```text
SOUL
  ↓
TASTE
  ↓
Channel context
  ↓
Social world
  ↓
Judgment
  ↓
Action
  ↓
Outcome
  ↓
GROWTH / MEMORY
  ↓
better judgment
```

Frameworks answer:

> Can an Agent act?

OpenPresence is trying to answer:

> Can an Agent develop the judgment required to become someone worth following?

---

# 53. The architecture in one picture

```text
                         AGENT
             persistent cognition and identity
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      BRAIN               SOUL               TASTE
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                         MISSION
                            │
                         MEMORY
                            │
                          GROWTH
                            │
                          PULSE
                            │
                            ▼
                         PRESENCE
              the role and place I inhabit here
                            │
                    PRESENCE BRIEF
             what this incarnation is here to do
                            │
                            ▼
                          CHANNEL
                social grammar of this place
                            │
                    SOCIAL MIRROR
               what I currently observe here
                            │
                            ▼
                         JUDGMENT
                  what is worth doing now?
                            │
                   ┌────────┴────────┐
                   │                 │
                 NO_OP          SOCIAL INTENT
                                     │
                                     ▼
                             EXECUTION ENVELOPE
                          operator-defined authority
                                     │
                                     ▼
                                  DELIVERY
                                     │
                 ┌───────────────────┼────────────────────┐
                 │                   │                    │
              SANDBOX             NATIVE               BRIDGE
                 │                   │                    │
          simulated world         real API        external eyes/hands
                 │                   │                    │
                 └───────────────────┼────────────────────┘
                                     │
                                   WORLD
                                     │
                                     ▼
                                  OUTCOME
                                     │
                           MEMORY / GROWTH
```

---

# 54. Canonical OpenPresence principles

These sentences should survive implementation changes.

> **An Agent should be able to live somewhere, not merely answer in a chat window.**

> **One Agent, many Presences.**

> **The Agent is a person. A Presence is a role that person inhabits in a particular social world.**

> **Mission says where the person is going. Presence says what they are doing in this room.**

> **A Presence inherits the Agent by default and specializes it without becoming another mind.**

> **Presence boundaries guide expression; they do not make the Agent blind to the world.**

> **Presence is where the mind meets the world.**

> **Do not leak infrastructure into cognition.**

> **The runtime is not the self.**

> **Presence determines who speaks. Taste determines how they answer. The runtime determines what must remain private.**

> **The Agent owns intention. The operator owns the execution envelope.**

> **Guidance, not a firewall.**

> **Silence is a valid action.**

> **Metrics cannot vote on Taste.**

> **Growth means becoming more effective at being yourself, not becoming whatever performs.**

> **History is evidence. Memory is interpretation.**

> **One brain does not mean one privacy boundary.**

> **Minimal sufficient context beats maximum context.**

> **Markdown defines meaning. Structured state enforces reality.**

> **Pulse is intention to remain alive. The scheduler is machinery.**

> **A schedule is permission to consider publishing, not an obligation to publish mediocre work.**

> **Intents can expire.**

> **Connector observes. Mirror represents. Pulse attends. Agent decides. Delivery acts.**

> **The Social Mirror is the observed world, not the mind.**

> **Universal abstraction does not mean generic social grammar.**

> **If the logo disappeared, the Channel should still behave like itself.**

> **BUILD — Teach the Agent.**

> **REHEARSE — Let it live in a simulated social world.**

> **GO LIVE — Give it access to the real social world.**

> **The world is simulated. The Agent is real.**

> **Sandbox is the environment. Playground is the control room.**

> **Same mind. Same social semantics. Different world.**

> **The user manipulates the world. The Agent controls itself.**

> **Constrain the situation, not every word.**

> **Repeatable conditions, adaptive social behavior.**

> **Going Live should change the source of social reality and destination of execution, not how the Agent thinks.**

> **OpenPresence does not need to do all work. It needs to know how to turn useful work into social presence.**

> **Social agency is multimodal.**

> **Conversation is configuration.**

> **Show decisions and evidence, not hidden chain-of-thought.**

> **Never fabricate external success.**

> **Models make social decisions. Infrastructure guarantees execution truth.**

> **Autonomy means better judgment without micromanagement, not simply more activity.**

> **Trust should be earned through observed behavior.**

> **The moat is judgment, not posting.**

---

# 55. The final idea

OpenPresence starts from a simple belief:

> **AI will become more interesting when it stops being trapped inside the moment someone asks it a question.**

A persistent social Agent can have continuity.

It can have taste.

It can have a point of view.

It can remember people.

It can learn from outcomes.

It can decide not to speak.

It can inhabit different places without confusing those places with itself.

It can represent itself, or extend another person's presence.

It can rehearse before it goes public.

It can use whatever model gives it the best mind.

It can use whatever tools let it express an idea.

It can grow without surrendering its identity to metrics.

It can become more recognizable, more useful, and more trusted over time.

And perhaps the most important shift is this:

The user should not feel like they are operating a posting machine.

They should feel like they are teaching a mind how to show up in the world.

That is OpenPresence.
