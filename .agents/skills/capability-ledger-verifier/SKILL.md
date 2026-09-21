---
name: capability-ledger-verifier
description: Create and maintain OpenPresence's evidence-backed behavioral capability ledger. Use throughout development to define protected outcomes, connect them to implementation and eval/live proof, expose unproven or regressed behavior, and choose the next highest-impact verification gap; do not use it as a feature inventory.
---

# Capability Ledger Verifier

Own the durable repository artifact [`CAPABILITY_LEDGER.md`](../../../CAPABILITY_LEDGER.md).
It answers “what behavior have we actually proven?” The existing
[`FEATURES_MAP.md`](../../../FEATURES_MAP.md) remains the owner of “what exists
and how do I reach it?” `qa-learnings/` remains project QA memory. Do not create
parallel maps.

## Status vocabulary

Use only:

```text
UNPROVEN | PARTIAL | PROVEN | REGRESSED | BLOCKED
```

Assume `UNPROVEN` until concrete evidence exists. Code presence, a registered
route/tool, a passing unit test, or an agent assertion is not sufficient for an
end-to-end claim. A real blocker is not a silent pass and a failed delivery is
not intelligent `NO_OP`.

## Required entry fields

Each capability needs an ID, behavior and user/outcome value, protected
invariant, implementation surface, verification method/scenario, evidence
path or command, status, known failure modes, last verified date, and next
action. Keep entries concise and behavioral.

Track at least: goal/onboarding, autonomous planning and work creation,
Calendar/runtime consistency, chat-driven plan mutation, event re-planning,
execution and follow-up, measurement/adaptation, niche/pattern/media
intelligence, durable learning and unlearning, user feedback, permissions,
Sandbox time/events/isolation/reset/replay/hidden truth/trajectory, accelerated
trajectory evals, live UI proof, independent verification, and simplification
safety.

## Update loop

Start with affected rows and their linked evidence, not the ledger's full
historical narrative. For each remaining gate record its observable assertion,
cheapest valid trigger, independent oracle, candidate/run binding, and exact
missing result. Reuse unchanged evidence only when its artifacts still exist
and its code, fixture, configuration, and oracle dependencies remain valid.

Do not mistake a larger test count for closure. Negative checks need a positive
control showing that the forbidden effect would otherwise be possible; learning
needs real measured lineage and a later decision difference. A fixture-written
success label, mocked model choice, or synthetic metric row cannot establish
the corresponding real-model or world-outcome claim.

Promote a row when its own behavioral contract is satisfied. Historical batch
ordering is not a dependency. If a gate demands incompatible environments (for
example Native execution inside an isolated Sandbox), document the correction
and verify each real boundary, plus any actual interaction, on the same candidate.
Do not call separate runs one causal trajectory. Keep unresolved claims explicit.

After each meaningful implementation or verification cycle:

1. update affected statuses and evidence;
2. mark regressions explicitly rather than hiding them in notes;
3. add newly discovered capabilities/failure modes;
4. identify the highest-impact remaining `UNPROVEN`, `PARTIAL`, `REGRESSED`,
   or `BLOCKED` capability;
5. record what important behavior is still assumed rather than proven.

Use deterministic evidence where the property is deterministic, Sandbox
trajectory/replay for time-dependent behavior, and `verify-app` for the real
user-facing flow. Do not mark a critical capability `PROVEN` when an important
boundary is only inferred from code.

## Handoff

Return the capability IDs affected, status changes, evidence, failures found,
and next action. The ledger is shared memory for lead, builder, and independent
verifier agents; it is not a completion badge.
