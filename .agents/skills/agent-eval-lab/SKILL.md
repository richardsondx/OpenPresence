---
name: agent-eval-lab
description: Design and run trajectory-level evals for OpenPresence autonomous behavior over an isolated Sandbox. Use for zero-babysitting operation, planning, follow-through, re-planning, permissions, strategy adaptation, regression scenarios, deterministic assertions, counterfactuals, or calibrated model judges; use conversation-prompt-evaluation for prompt/style quality instead.
---

# Agent Eval Lab

Evaluate the Agent as a system over time, not a single response. The Sandbox
provides the world and must be sufficiently certified by
`developer-sandbox-certifier`; this skill defines scenarios, assertions,
metrics, judges, and diagnosis.

## Evaluation order

Prefer evidence in this order:

1. deterministic invariant or persisted state assertion;
2. trajectory comparison or replay/fork;
3. quantitative metric;
4. calibrated model judge only for genuinely subjective social quality.

Never use an LLM judge for a deterministic property, and never let one judge
define a critical capability. Do not inject the expected answer into cognition,
let the simulator leak hidden truth, or treat task creation/HTTP success as
proof of execution or outcome.

## Core scenarios

Maintain focused scenarios for clean autonomous start without an Assignment,
seven-day zero-babysitting operation, growth stall, breaking opportunity,
one-action follow-through, false correlation, relevant versus random media,
durable user correction, permission boundary, tool failure, stale strategy, and
unexpected winner. Add a regression scenario for every material behavioral bug
when practical.

Measure only what supports the declared goal, such as intervention rate,
self-generated work, plan mutation, re-planning latency, follow-up coverage,
measurement coverage, idle-with-work-remaining, duplicate actions, permission
violations, false success, strategy adaptation, and Calendar/runtime
consistency.

## Counterfactual and adversarial proof

For important learning or autonomy claims, compare the same checkpoint with and
without the learned state or triggering observation. Vary seed, event order,
timing, performance, permissions, tool failures, and account state. Give an
independent verifier the invariant and public controls, not the builder's
preferred explanation, and ask it to prove the claim wrong.

## Workflow

1. State the capability and user/outcome value.
2. Reproduce the missing behavior or establish a baseline.
3. Encode the smallest scenario with explicit deterministic invariants.
4. Run it through the existing CLI/scenario runner and capture structured JSON,
   trajectory, seed, virtual duration, and environment.
5. Diagnose failures at the first incorrect transition; do not weaken the
   assertion to make it green.
6. After a fix, run the narrow regression, neighboring scenarios, and one
   independent adversarial verification pass.
7. Update `CAPABILITY_LEDGER.md` and retain the scenario under `scenarios/` or
   the relevant test/eval directory.

## Output

Report scenarios, virtual duration, seeds, assertions, judge use, failures,
evidence paths, baseline comparison, and unverified paths. A passing eval suite
does not replace `verify-app` for a user-facing flow or Product Review for
product coherence.
