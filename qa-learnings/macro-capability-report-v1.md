# Macro capability report status

Status: reporting instrument ready; final category annotation and human review pending.

The frozen methodology requires equal-weight reporting across banter/humor, direct engagement, technical reasoning, multimodal/media, sensitive topics, network/introduction, restraint, continuity/relationship behavior, and identity integrity. The current semantic evaluator intentionally scores act selection and wording but does not infer capability strata from scenario text. That separation prevents hidden evaluator assumptions from becoming a benchmark rule.

`scripts/evaluate-social-run.mjs` now accepts pre-frozen, non-answer-bearing
`caseMetadata` from a scenario and joins it only after the blind semantic
judge returns. It emits per-category act/wording scores, pass rates, and an
equal-weight macro across labeled categories. Category arrays are allowed for
cases that legitimately span more than one capability; this is reporting
metadata, not an instruction to the Agent or evaluator.

`scripts/summarize-social-stability.mjs` now excludes observation-only replay
setup and reports stability by category. Existing historical artifacts must be
rerun through the updated evaluator before those fields can be treated as
final evidence.

The current development artifacts therefore support these claims:

| Evidence | Aggregate act | Aggregate wording | Structural | Macro status |
|---|---:|---:|---:|---|
| GPT Luna Low, 48-case replay, 3 runs | 96.875% | 96.667% | 100% | Not computable: source capture lacks complete category/thread annotation |
| GPT Luna Low, restraint, 3 runs | 99.074% | 92.857% | 100% | Restraint stratum only |
| GPT Luna Low, sealed holdout, 60 cases | 98.333% | 100% | 100% | Not used for category tuning; aggregate-only |
| GPT Luna Low, fresh worlds, 60 cases | 100% / 100% / 100% | 100% / 100% / 100% | 100% | Generalization worlds, not final strata |

Before a release claim, each case in the frozen 130-case set must receive one or more pre-frozen capability labels, with thread-level partition membership, and the report must show per-stratum act score, wording score, sample size, variance, critical failures, and category floor. A large aggregate score must not be substituted for this report.

The current conclusion is `PROMISING_BUT_NOT_YET_ESTABLISHED`. The missing macro report is an evidence gap, not a reason to add category-specific prompt behavior.
