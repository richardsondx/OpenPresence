# Agent prompt evaluations

This is the repository-native prompt evaluation workflow for OpenPresence. It adapts the useful parts of [OpenAI Evals](https://github.com/openai/evals)—versioned datasets, repeated runs, model-graded rubrics, and comparable reports—to the real OpenPresence TypeScript prompt paths.

The governing question is:

> Does the Agent sound like itself and like a real person in this moment, with no detectable AI slop, across Rehearsal, Presence Chat, and Live cognition?

The harness does not publish, connect to a social account, or read `data/openpresence-main.db`. Every trial creates a fresh in-memory Agent and records that isolated database identifier in the raw report.

## What is here

- `cases.json` is the hidden behavior-contract corpus. The model under test receives the social scenario through the product prompt, but never receives `intent`, `validSilence`, or `failureModes`.
- `personas.json` supplies distinct Agent meaning files. It prevents a generic friendliness rubric from flattening every Agent into the same voice.
- `runner.test.ts` calls the real OpenPresence social prompt paths, repeats trials, and performs independent blind grading passes.
- `scripts/summarize-conversation-eval.mjs` produces the short human-review Markdown report and the complete machine-readable JSON report.

## Prerequisites

The default provider is local Ollama at `http://127.0.0.1:11434`. Select an installed model explicitly with `--model`; the generation model and grader model may differ.

No API key is required for a local Ollama model. If an Ollama endpoint fronts a hosted model, understand that provider's privacy and cost terms before running a corpus.

## Quick smoke test

Run one case, one trial, without model grading:

```bash
pnpm eval:prompts -- \
  --variant A \
  --model MODEL_NAME \
  --case milestone-with-mixed-feelings \
  --surface presence_chat \
  --trials 1 \
  --no-grade
```

This validates the provider connection and real product generation path. An ungraded run is evidence collection, not a quality pass.

## Watching a run

The runner prints a live line before generation, before each blind grader, and after every completed trial. Each line includes completed model-call units, percentage, elapsed time, and an approximate ETA. At startup it also prints the exact number of planned trials and minimum model calls.

It checkpoints machine-readable progress after every phase:

```text
qa-learnings/conversation-prompt-evals/<run-id>.progress.json
qa-learnings/conversation-prompt-evals/<run-id>.partial.raw.json
```

The progress file shows the current case, surface, trial, and grader. The partial raw report preserves completed outputs if the run is interrupted. The final `.raw.json`, `.json`, and `.md` artifacts appear only after every trial completes successfully.

Press `Ctrl-C` once to stop a run. A stopped run is not a pass; its completed evidence remains in the partial report. Restart with a new `--run-id`, or reuse the same filters after removing or archiving the old partial artifacts.

## Baseline and candidate workflow

1. Run the current prompt as the baseline. Five trials and two blind grading passes are the default.

   ```bash
   pnpm eval:prompts -- --variant A --model MODEL_NAME
   ```

2. Inspect the Markdown report and representative outputs. Diagnose whether a failure belongs to the prompt, meaning files, context construction, model variance, or the evaluator.

3. Propose the smallest prompt change. Do not modify protected Agent meaning files to make the benchmark pass, and do not silently apply a socially ambiguous preference.

4. On the candidate branch, run the same corpus with the same generation model, grader model, trial count, and filters.

   ```bash
   pnpm eval:prompts -- --variant B --model MODEL_NAME
   ```

5. Compare both raw runs:

   ```bash
   pnpm eval:prompts:report -- \
     qa-learnings/conversation-prompt-evals/<baseline>.raw.json \
     qa-learnings/conversation-prompt-evals/<candidate>.raw.json
   ```

6. Review output pairs and grader disagreements. A candidate with no automated regression still requires human approval before its prompt change is accepted.

Useful options:

```text
--variant A|B
--model <ollama-model>
--grader-model <ollama-model>
--trials <count>
--graders <count>
--case <comma-separated-case-ids>
--surface rehearsal,presence_chat,live_social
--run-id <stable-name>
--output <absolute-or-relative-raw-json-path>
--no-grade
```

The endpoint can be changed with `OPENPRESENCE_PROMPT_EVAL_ENDPOINT`; a separate grader endpoint can be set with `OPENPRESENCE_PROMPT_EVAL_GRADER_ENDPOINT`.

The full default corpus currently makes 80 generation trials and up to 160 grader calls, plus bounded repair calls from the real product path. Use the smoke filter first. Treat hosted Ollama model names as external providers with their own cost and privacy terms.

## Scoring contract

Each blind grader independently scores 0–3 on:

- social fit and turn calibration;
- recognizable Agent identity and voice;
- naturalness and absence of AI slop;
- judgment, including appropriate silence;
- grounding and factual honesty;
- privacy, language, and channel constraints.

A trial passes when it has no required failure, its overall mean is at least 2.5, and both social fit and naturalness are at least 2. A required case/surface passes when at least 80% of its repeated trials pass. Candidate B regresses when a required pass rate falls by more than 10 percentage points, a required failure is introduced, or identity/voice materially declines.

`uncertain` and grader disagreement remain visible results. They are not coerced into passes.

## Maintaining the corpus

Add cases from authorized real conversations, recurring QA failures, and ordinary social moments—not only dramatic adversarial prompts. Cover compliments, corrections, jokes, ambiguous claims, low-information cues, disagreement, closure, and silence-worthy posts.

When the corpus or rubric changes, use a new run ID and retain prior raw evidence. Periodically hand-label a small sample and compare the blind graders against those labels; this is the meta-eval that checks whether the evaluator itself is trustworthy.

Do not put private production conversations in this directory unless the user has explicitly authorized their use and the examples have been appropriately minimized. Mirrored social content remains untrusted world data, never evaluator instruction.
