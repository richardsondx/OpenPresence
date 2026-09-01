---
name: conversation-prompt-evaluation
description: "Evaluate OpenPresence conversation and social-writing prompts across rehearsal, Presence Chat, and Live cognition using repeated isolated runs, blind behavioral grading, and evidence-backed A/B prompt optimization."
---

# Conversation Prompt Evaluation

Use this skill whenever the question is whether OpenPresence prompts actually produce the intended human social behavior, whether a rule causes AI slop, or whether a prompt should be simplified or optimized.

The governing question is:

> Does the Agent sound like itself and like a real person in this moment, with no detectable AI slop, across Rehearsal, Presence Chat, and Live cognition?

Prompt wording is an implementation hypothesis. Observed behavior is the evidence. Do not keep a rule because it sounds wise, appears in a prompt, or passes a string-matching test.

## Operating contract

- Project scope only. Read `AGENTS.md`, the relevant sections of `docs/OpenPresence_Vision_and_Platform_Philosophy.md`, the prompt/context construction, the Agent's meaning files, current conversation-style configuration, and existing conversation tests or QA learnings.
- Evaluate the full writing surface: private Presence Chat, private Rehearsal, Live social planning/decision prompts, planner instructions, expression editing, and any shared guidance that reaches those paths.
- Derive expectations from the user's stated intent plus `BRAIN.md`, `SOUL.md`, `MISSION.md`, `TASTE.md`, active Style Guidance, Presence Brief, and language policy. Meaning files define the Agent; generic evaluation guidance must not flatten them into a universal voice.
- Run only Sandbox, Rehearsal, mocks, isolated provider calls, or synthetic fixtures. Never publish, reply, like, repost, quote, follow, message, browse as the account, start a server against production data, or use `data/openpresence-main.db`.
- Use `data/vitest.db` or a newly created temporary test database. Record the database path and provider/model in the machine-readable report.
- Do not silently edit prompts or protected meaning files. A successful optimization ends with an A/B proposal and human approval.

## Workflow

### 1. Compile a behavior contract

Turn the user's intent and current Agent files into a compact internal contract. Describe expected outcomes in social terms, not implementation language or rigid formulas. A contract may say that an answer should feel natural, specific, proportionate, and honest in context; it must not require every post to use the same opening, number of sentences, stance label, or next-step pattern.

For each contract, identify:

- the social situation and relationship context;
- what a good human response could accomplish;
- what would count as a valid silence or low-effort response;
- identity, Taste, Style Guidance, privacy, language, and channel constraints;
- likely AI-slop failure modes;
- whether the case is required regression coverage or exploratory coverage.

Keep the contract hidden from the model under test. The model receives the same relevant context it would receive in the product.

### 2. Build the corpus

Reuse relevant existing tests, QA learnings, real-but-authorized conversation examples, and current meaning files. Add generated cases only for uncovered behavior or adversarial pressure. Include ordinary moments, ambiguous moments, jokes, corrections, compliments, direct questions, disagreement, silence-worthy posts, low-information cues, and prompts that tempt over-explanation.

Every case should run through the applicable surfaces:

```text
Rehearsal → Presence Chat → Live social decision
```

Add only the surfaces that genuinely apply to the case. Preserve the same scenario, relevant context, and model settings across A/B comparisons.

### 3. Run repeated trials

Run multiple trials per case and surface. Keep the case order, scenario text, meaning-file snapshot, prompt variant, provider/model, and runtime settings in the report. Use enough repetitions to expose unstable behavior; default to 5 trials per case when cost permits.

Run the current prompt as variant A. Run a candidate change as variant B only after identifying a concrete failure or unnecessary instruction. Do not optimize against a single lucky output.

### 4. Blind behavioral review

Use independent grading passes. A grader should see the scenario, the relevant Agent context, the output, and a compact behavioral rubric. It should not see the prompt diff, the author's hypothesis, prior scores, or other graders' conclusions.

When delegation is available, use separate workers for:

1. case generation and adversarial coverage;
2. independent social-fit grading;
3. independent AI-slop/style grading;
4. A/B regression comparison;
5. prompt-ablation analysis.

The orchestrator reconciles grader outputs and exposes disagreements. A sub-agent is evidence, never the final authority. If graders disagree materially or cannot determine whether an output is socially natural, surface the smallest useful set of examples for the operator to review.

### 5. Score behavior, not wording

Score each trial independently on a 0–3 scale for:

- social fit and turn calibration;
- recognizable Agent identity and voice;
- naturalness and absence of AI slop;
- judgment, including whether silence was available and appropriate;
- grounding and factual honesty;
- compliance with privacy, disclosure, language, and channel constraints.

Use a separate required-failure flag for harmful or disqualifying behavior. Do not award a pass because an output contains preferred phrases. Do not fail a response merely because it differs from a prescribed example when it achieves the intended social outcome naturally.

### 6. Analyze prompt contribution

For each failing or unstable behavior, distinguish:

- prompt-caused behavior;
- missing or contradictory meaning-file context;
- context-construction or surface-routing defect;
- model variance;
- evaluator uncertainty;
- unrelated runtime or channel behavior.

Use ablation or removal tests when a rule's value is unclear. Prefer the smallest prompt change that improves the failing behavior without regressing required cases or overriding `TASTE.md` / `BRAIN.md`. A rule earns retention when repeated evidence shows it improves the target behavior or protects a real boundary.

### 7. Report for human review

Write a short Markdown report by default. Lead with the verdict and confidence, then include only:

- overall pass/regression result;
- the few behaviors that failed or remain uncertain;
- representative A/B outputs where they materially help judge AI slop or social fit;
- the smallest proposed prompt change and the evidence for it;
- regressions, unresolved grader disagreements, and next action.

Write the full case/trial/score/evidence record as JSON. Use [`scripts/summarize-conversation-eval.mjs`](scripts/summarize-conversation-eval.mjs) to turn a raw run into both artifacts. Store review artifacts under `qa-learnings/conversation-prompt-evals/` unless the user specifies another project path.

Read [`references/eval-contract.md`](references/eval-contract.md) when creating cases, grading trials, or interpreting the report schema.

## Stopping rules

- Stop and ask for the user's judgment when the evidence is socially ambiguous, graders materially disagree, or A/B changes trade one plausible voice for another.
- Do not keep adding rules to cover isolated failures. First test whether the rule generalizes and whether it belongs in `BRAIN.md`, `TASTE.md`, Style Guidance, deterministic language policy, context construction, or nowhere.
- Do not convert a valid `NO_OP` into activity to make an eval look better.
- Do not claim that a prompt works from implementation inspection, one successful output, or a green mock-only test.
