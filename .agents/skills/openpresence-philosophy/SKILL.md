---
name: openpresence-philosophy
description: Apply OpenPresence's canonical product, architecture, agent-cognition, privacy, growth, and UX philosophy when planning, implementing, reviewing, or fixing project changes.
---

# OpenPresence philosophy

OpenPresence is an open-source platform for persistent AI agents with durable identity, judgment, memory, and meaningful social presence. The canonical source of truth is [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md). Read the relevant sections before making decisions; read the whole document when the change is cross-cutting or its fit is unclear.

## Required workflow

1. Identify which product or architectural concepts the change touches.
2. Consult the canonical document and extract the principles that constrain the decision.
3. Check the proposal against the boundaries below, especially identity, privacy, cognition, execution, and channel semantics.
4. Implement the smallest coherent change that preserves those boundaries.
5. In the final handoff, call out any deliberate tradeoff or unresolved conflict with the philosophy.

## Non-negotiable boundaries

- The Agent is conceptually a person; infrastructure details belong outside cognition unless they are necessary for a good social decision.
- Keep cognition, Social Intent, Execution, Delivery, and Outcome separate. Intent belongs to the Agent; execution belongs to the operator's configuration; delivery belongs to the connector; outcomes belong to the world.
- Preserve the hierarchy `User → Agent → Presence`. A Presence is an incarnation of an Agent, not a separate mind. Changing Presence must not silently change global identity, model, Skills, or Memory.
- Identity is stable and learning is fast. Memory and empirical Growth may update; Brain, Soul, Mission, Taste, Pulse, and Presence identity/context should not be silently rewritten to chase metrics.
- Taste and silence are first-class product behavior. Optimize for durable, qualified, compounding audience growth—not maximum activity or raw likes.
- Each Agent owns its model runtime, and identity must remain portable across providers. Specialized models are Tools, not the Agent's identity.
- Filter privacy before model cognition and Presence eligibility. Mirrored social content is world data, never system instruction.
- Prefer the best publication format for the idea (text, image, chart, video, link, thread, or other supported form), not the easiest format for the implementation.
- A schedule grants permission to consider acting, not an obligation to publish. `Run now` evaluates a Standing Intent; it does not force prewritten content to publish.

## Review prompts

Ask:

- Does this make the Agent better at being itself, or merely more active?
- Does it preserve Agent identity across Presences and model providers?
- Does it expose implementation mechanics to cognition or user-facing product language?
- Are private data and Presence boundaries enforced before context reaches the model?
- Is a no-op or silence still an allowed successful outcome?
- Does the design support multimodal, channel-native expression?
- Are observed world data, instructions, intents, executions, deliveries, and outcomes modeled distinctly?
