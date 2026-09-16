---
name: learning-loop-auditor
description: Audit whether OpenPresence turns social observations, outcomes, experiments, and user feedback into durable, correctly scoped future behavior. Use for pattern/template learning, media reasoning, overfitting, stale strategies, exploration/exploitation, confidence updates, unlearning, or knowledge that is saved but never used.
---

# Learning Loop Auditor

Learning is behavioral adaptation, not saved prose. The target loop is:

```text
Observation → candidate pattern → hypothesis → experiment → outcome
→ comparison → confidence update → promote, narrow, retain, or retire
→ future decision
```

Keep Agent identity, Taste, user constraints, empirical Growth, Memory, and
conversation history distinct. User feedback is a durable boundary when the
user expressed one; a single performance result is usually a hypothesis, not a
global rule.

## Audit questions

For each claimed lesson, record: context/niche, supporting and contradicting
evidence, recency, sample size, relevant content and media characteristics,
metric tied to the goal, confidence, next experiment, expiry/retirement rule,
and the future decision it is expected to influence.

Check whether the Agent distinguishes image presence from relevance, format,
subject, novelty, text/visual relationship, timing, and audience. Check that a
pattern can be scoped, weakened, contradicted, become stale, and be unlearned.

## Required tests

Use the Sandbox/eval layer for tiny sample, false correlation, context boundary,
staleness, negative feedback, failed experiment, repeated confirmation,
irrelevant media, exploration versus exploitation, and environment shift. For a
high-value claim, replay the same checkpoint with learning removed or altered:

```text
World A: learned state present
World B: same state with learned state removed/changed
Compare: the next decision and durable plan
```

If future behavior cannot be identified, learning is decorative or disconnected.
Do not replace this audit with a prompt-string test or a single successful
response; use `conversation-prompt-evaluation` only for social-writing prompt
quality.

## Output

Produce:

```text
# Learning Audit
Proven learning behaviors:
Incorrect or shallow abstractions:
Missing learning state:
Experiments required:
Fix priority:
Evidence and next capability-ledger updates:
```
