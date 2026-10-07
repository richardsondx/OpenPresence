# V2 held-out evaluations

These 48 synthetic cases are frozen independently of service implementation. They cover six cases in each of eight groups. They are **not executed results** and do not prove growth, Muse compatibility, or useful learning transfer.

- `inputs.json`: host-visible task and source context only. No expected answers, score thresholds, or private labels.
- `grading.private.json`: evaluator-only behavioral criteria. Never register this as an MCP resource, include it in a system prompt, or serve it to the generation host.
- `manifest.json`: frozen input/grading hashes and trial requirements. A hash change requires a new corpus version and disclosure; do not tune against these cases.
- `contracts.json`: independent deterministic invariants for real transport/domain tests. These do not require an LLM judge.
- `fixtures.test.ts`: validates corpus shape and hidden-input separation; this is infrastructure proof only.

Generation code should load only `inputs.json`. Grading begins after outputs and tool traces are sealed. A/B/C conditions use the same permitted source history, budgets, and model settings. Use a human-calibrated independent judge for social quality, persisted state assertions for invariants, and case-clustered confidence intervals for repeated trials. Five repeats across two pinned model families is the initial design; inconclusive confidence intervals require more evidence or a narrower claim.

See `docs/v2-evaluation.md` for the execution runbook and claim boundaries. Existing prompt eval surfaces do not automatically exercise MCP or a personal-agent scheduler.

Three cases listed in `manifest.json.developmentSmokeCaseIds` were subsequently used for model integration smoke. They are development regressions now; replace them independently before a clean 48-case held-out certification. Their failures remain evidence and no performance pass is claimed.
