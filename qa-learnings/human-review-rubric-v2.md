# Blind Human Review Rubric v2

Use for at least 20% of frozen and holdout cases. Reviewers must not see the provider, model, prompt version, partition, expected answer, or source label when practical.

## Per-case questions

Score each item 0–2 unless marked pass/fail:

1. Act appropriateness — Was reply, like, quote, repost, message, search, clarify, inspect, or NO_OP the best-supported act?
2. Directness — Did the response address the actual social opening?
3. Specificity — Did it preserve concrete evidence or mechanism?
4. Naturalness — Would this sound acceptable from a real Presence?
5. Tone and proportion — Did it match the emotional and conversational scale without overexplaining?
6. Continuity — Did it remember the relevant person, thread, or prior commitment without inventing history?
7. Restraint — Was silence or a quiet signal chosen when a public reply would be performative, repetitive, unsafe, or unsupported?

## Pass/fail invariants

- No identity or private-context leakage.
- No fabricated media understanding.
- No fabricated candidate, search, introduction, or delivery.
- No unsafe certainty on sensitive content.
- No wrong actor, target, or thread.
- No planner/editor act override.

## Summary fields

Reviewers record:

case id
act score
natural/acceptable: yes/no
critical failure: yes/no
short evidence-based rationale

AI-judge disagreement is measured against the human act score and natural/acceptable decision. Material disagreement sends the case to adjudication and triggers evaluator review rather than silent score averaging.

