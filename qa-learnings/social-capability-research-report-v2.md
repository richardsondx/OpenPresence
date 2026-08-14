# OpenPresence Social Capability Research Report v2

Date: 2026-08-13
Status: PROMISING BUT NOT YET ESTABLISHED
Methodology: social-capability-evaluation-v2.md

## Executive finding

The original 20-case Boardy rehearsal was enough to expose the architecture's largest defects and verify that the model-driven Social Planner refactor was a real improvement. It was not enough to establish Boardy-level social capability.

The subsequent evidence is materially stronger, but still not release-grade:

| Evaluation | Act selection | Wording | Cases |
|---|---:|---:|---:|
| Boardy visible-feed development replay, 3 sessions | 96.875% | 96.667% | 48 × 3 |
| Independent restraint replay, 3 sessions | 99.074% | 92.857% | 18 × 3 |
| Sealed paraphrased holdout, post-guidance | 98.333% | 100% | 60 |
| Fresh Playground worlds, post-guidance | 100% | 100% | 60 |
| Third longitudinal world | 98.387% | 100% | 62 |

Structural checks passed for Auto mode, truthful execution, media provenance, and planner/editor act integrity. The main remaining evidence problem is not raw sample count alone: the Boardy-derived cases are development captures with incomplete parent history and unknown private outcomes, the frozen 130-case provenance-backed set does not yet exist, human/second-judge calibration is incomplete, and the macro/per-stratum release report is not yet computable.

The correct conclusion is:

> PROMISING BUT NOT YET ESTABLISHED

## Provenance replay update

The current source inventory now has a development-only parent-chain replay
fixture at `scenarios/boardy-thread-replay-development.json`, generated from
`qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json`. It loads
59 reconstructed public-history objects as observation-only context and then
evaluates 68 captured target objects in isolated Playground sessions. The
fixture preserves 37 distinct reply roots and 20 original/quote roots, and
records 15 media-bearing and 11 link-bearing cases.

This is a better context-exposure experiment than the original flat 48-post
scenario, but it is not a frozen parity set. Four source cases still have a
missing parent object, quoted bodies are not independently replayed as social
objects, and relationship/private outcome evidence remains unknown. The
observed Boardy reply is retained only as provenance. It is not a target act,
wording, or evaluator answer.

Chrome follow-up research also verified four additional distinct-root
candidates, covering space-regulatory matching, lightweight banter,
personal-agent product follow-up, and Spain networking. They are recorded in
`qa-learnings/boardy-additional-thread-leads-2026-08-13.json` as review leads
only: they are not yet public-API-enriched, counted as frozen, or used as
expected behavior. Several other apparent feed interactions were correctly
rejected as turns from the same long thread or as already-seen roots.
They have a corresponding four-case development replay at
`scenarios/boardy-additional-leads-development.json`; it preserves visible
turn order but intentionally does not invent parent links.

The deduplicated source-pool candidate now reaches the intended source counts
before review: 50 reply thread units and 20 original/quote thread units. The
artifact is [social-capability-source-pool-candidate-v1.json](/Users/richardson/Code/OpenPresence/qa-learnings/social-capability-source-pool-candidate-v1.json),
and all 70 cases remain explicitly `candidate-not-frozen`; 50 reply and 20
original provenance decisions are still pending. This proves coverage
availability, not parity or source completeness.

A separate 70-case review packet,
`qa-learnings/social-capability-source-pool-review-packet-v1.json`, now gives
each candidate explicit blank decisions for thread completeness, category,
thread unit, evidence status, confidence, and frozen-set eligibility. The
packet is fail-closed and contains no expected action or wording fields. It is
still `pending-source-review`: all 70 provenance/thread-unit decisions and 61
category decisions remain open.

The replay loader uses an explicit `observeOnly` ingestion seam so historical
objects do not trigger the Social Planner while the thread is being rebuilt.
The final target is the only injected object that triggers model judgment.
The default Playground injection path remains unchanged.

## Independent-strata coverage audit

Case counts alone currently overstate the independent supplemental coverage.
The original fresh and restraint fixtures contained 55 candidate cases but only
36 distinct thread units. A separate development fixture,
`scenarios/independent-strata-development-24.json`, adds 24 single-turn cases
with new actors and thread units. The combined candidate pool now contains 79
cases and 60 distinct independent thread units. Counting each actor/thread
once, the current coverage is:

| Supplemental stratum | Target units | Current units | Additional units needed |
|---|---:|---:|---:|
| Technical/link/media | 15 | 15 | 0 |
| Network/introduction | 15 | 15 | 0 |
| Sensitive/adversarial | 10 | 10 | 0 |
| Restraint | 20 | 24 | 0 |

This audit is recorded in
`qa-learnings/social-capability-strata-coverage-latest.json`. It does not
inspect the hidden holdout. The additional cases must be new thread units, not
extra turns from the existing actors. The coverage target is now met at the
candidate level, but these cases still need model runs, semantic review, and
partition assignment before any final benchmark is frozen.

The 60-unit supplemental selection is recorded in
`qa-learnings/social-capability-independent-review-packet-v1.json`. Its
fail-closed validator currently reports 60 pending decisions and zero promoted
cases. This keeps category coverage from being mistaken for reviewed evidence.

`scripts/build-social-frozen-manifest.mjs` now combines the two review packets
only when both validators are ready. Its current manifest is explicitly
`candidate-not-frozen` with an empty frozen partition; the freeze validator
rejects it at 0/130 as intended.

The experiment harness also fails closed when deterministic AI mock mode is
enabled or when the selected message model is Qwen. This protects the planned
GLM 5.2 and GPT 5.6 Luna comparison without affecting social judgment logic.

## Why 20 cases were insufficient

| Property | Count |
|---|---:|
| Total interactions | 20 |
| Posts | 18 |
| Quotes | 1 |
| Replies | 1 |
| Boardy-authored entries | 9 |
| Banter | 8 |
| Direct engagement | 4 |
| Technical/media | 4 |
| Sensitive | 3 |
| Network | 1 |

Several entries are turns from the same conversation. The effective number of independent situations is lower than 20. The network stratum is one case, so it cannot establish network capability. The benchmark also over-samples situations where somebody acted and has almost no independently curated social negative space where restraint is correct.

The original set also often uses a Boardy reply as the next inbound event. That tests whether OpenPresence can respond to Boardy-like language, but it is not the same as reconstructing the original situation before Boardy acted.

## What the live Boardy feed adds

A read-only Chrome capture of the public @boardyai/with_replies timeline showed capability patterns not represented adequately in the 20 cases:

- a live-video founder request received a role-specific design-partner match and a DM handoff;
- a website-monitoring explanation received one concrete differentiating question;
- a DM check received a direct confirmation and private next step;
- a request for outreach questions received an invitation to continue in DM;
- a request for a Renfe connection received a private search/qualification handoff rather than a public contact claim;
- “Not bad” became concise rating banter;
- a logo-designer request received candidate evidence and an introduction path;
- a storytelling post received a short point-of-view reply and a like;
- a tagline with an image received a mechanism-focused reply without unsupported image interpretation;
- a learning-transfer post received a specific technical control-loop reply;
- a media-led project received a role-relevant filmmaker introduction offer;
- a distribution post received a partner-fit hypothesis and a private introduction offer;
- terse ratings such as “8 ig” became self-aware, lightweight banter.

These observations are recorded as development evidence in boardy-development-manifest-2026-08-13.json. The manifest is not a frozen benchmark: the page exposed incomplete context, unknown relationship history, and unknown private outcomes. Those unknowns are explicitly recorded instead of being promoted to fact.

## Required next evaluation

The next credible evaluation should contain approximately 130 independent situations:

| Stratum | Target |
|---|---:|
| Actual Boardy reply/reaction contexts | 50 |
| Boardy original/quote contexts | 20 |
| Technical/link/multimodal | 15 |
| Network/introduction | 15 |
| Sensitive/adversarial | 10 |
| Independent restraint cases | 20 |
| Total | 130 |

The set must be split by complete thread/relationship unit. A later turn from the same conversation cannot appear in a different partition from its setup.

The final experiment should run:

1. a frozen Boardy replay set;
2. a hidden or operationally separated paraphrased holdout;
3. at least 60 fresh Playground interactions;
4. three longitudinal worlds with 50–100 events over multiple simulated days.

The development fixtures now include 15 observed Boardy situations, 18 independent restraint cases, and two 50-event longitudinal worlds:

- scenarios/boardy-development-observed-2026-08-13.json
- scenarios/restraint-development-20.json
- scenarios/social-capability-longitudinal-1.json
- scenarios/social-capability-longitudinal-2.json

The long worlds are deliberately development scenarios. They should be run after the parallel social-agent audit releases the local server state, then repeated with the frozen model configuration.

## Evaluation requirements

The final report must separately show:

- structural truth, target 100%;
- social act selection;
- expression quality;
- equal-weight macro capability score;
- per-stratum results;
- repeated-run mean and variance;
- stable, unstable, and consistently failing cases;
- action distribution;
- critical failures;
- human-review agreement with AI judges;
- longitudinal coherence.

The semantic evaluator must not receive provider/model identity, scenario IDs, expected wording, or an ideal answer. The existing keyword scorer remains a historical diagnostic only.

## Product-improvement implications

The live Boardy capture suggests general capabilities worth testing, but does not justify hard-coded behavior:

1. Private handoff judgment: recognize when a public reply should establish a DM/search next step without claiming that a private action already happened.
2. Evidence-backed matching: distinguish a role-specific candidate with evidence from an invented or generic recommendation.
3. Concrete follow-up: ask one useful differentiating question when a technical claim is underspecified.
4. Proportionate rating banter: accept a terse rating or playful acknowledgment without forcing an explanation.
5. Media-aware restraint: use source text and available perception without claiming to understand an uninspected asset.
6. Relationship continuation: preserve a real thread opening while stopping when the exchange is complete.

These are development hypotheses. They must be implemented, if needed, through richer evidence/context and model judgment—not actor names, keywords, expected phrases, or deterministic public-response fallbacks.

## Current release decision

The release criteria are not yet established because the following evidence is missing:

- a frozen 130-case provenance-backed set split by complete thread/relationship unit;
- repeated GLM 5.2 and GPT 5.6 Luna Low runs on that identical frozen set;
- per-stratum and equal-weight macro scores, with no stratum below the release floor;
- at least 20% blinded human review plus agreement against the semantic judge;
- an independently configured second semantic judge or rationale-backed adjudication;
- a genuinely operationally separated final holdout and three fresh varied Playground runs reviewed for coherence, not only per-event scores;
- verified source context for Boardy cases, including parent history and explicit unknowns for private outcomes.

The next safe action is to complete and validate the provenance-backed frozen partition, then run the controlled model comparison and human-calibration packet against that same set. Any product change must be justified by an earliest-layer diagnosis and must improve paraphrased, reordered, unseen, and fresh cases without benchmark-specific social logic.

## Iteration 1: closed-correction planning hypothesis

The first GPT 5.6 Luna Medium development pass exposed one general planning defect: a self-contained correction was expanded into a mini-lesson even though it contained no unresolved request, question, or decision. The earliest failing layer was planning judgment, supported by a perception record that already described the correction as complete.

The narrow change was model-facing guidance in the shared social cognition prompt and the Sandbox planner guidance. It tells the model to distinguish a closed correction from a correction that resolves an open question or changes a live decision. It does not select an action deterministically, inspect scenario text, or constrain expression to an expected answer.

The targeted development variants produced the following model decisions:

| Variant | Chosen act | Interpretation |
|---|---|---|
| Mockup, not live evidence | `no_op` | Closed correction; no open request |
| Draft quote, not shipped policy | `no_op` | Closed correction; no open request |
| Denominator was wrong; comparison invalid | `no_op` | Closed correction; no open request |
| Denominator was wrong; should we rerun? | `reply` | Explicit unresolved decision |
| Staging link; live URL available if wanted | `no_op` | Conditional offer, no direct request |

Three fresh repetitions of this five-case family kept the same act pattern in every run: the three closed corrections were `no_op`, the explicit rerun question was `reply`, and the conditional live-URL offer was `reply`. All runs recorded GPT 5.6 Luna Medium, `asset.inspect`, and all six public affordances in Auto mode.

The broader 15-case Boardy-derived replay and 18-case restraint replay both preserved Auto mode and truthful simulated execution. The restraint replay changed the original correction case from `reply` to `no_op`, while one unrelated unsupported-screenshot case varied from `no_op` to `clarify`; that variation is not enough to claim a causal improvement or a regression. It is a reason to repeat the development strata and report distributions rather than rely on one run.

Two additional restraint repetitions remained structurally valid. Across those runs, the correction case stayed `no_op`; a few low-stakes cases varied between `like`, `reply`, and `clarify`, reinforcing that the current model configuration has meaningful social-act variance outside the targeted family.

The semantic evaluator issue was an endpoint-shape defect: the harness posted to `/v1` instead of `/v1/chat/completions`. The harness now accepts either form and records evaluator provider/model/reasoning separately from the message experiment metadata. With GPT 5.6 Luna Medium as the independent judge, the rerun results were:

| Development artifact | Act appropriateness | Wording quality | Packets | Structural |
|---|---:|---:|---:|---:|
| Closed-correction family, 3 sessions | 90.0% | 75.0% | 15 | 100% |
| Boardy-derived development replay | 96.7% | 90.0% | 15 | 100% |
| Independent restraint replay | 97.2% | 100% | 18 | 100% |

The closed-correction wording result is not a release score, but it is an actionable signal: correct silence and correct engagement do not guarantee strong expression when a reply is selected. This reinforces the need to retain separate act and wording evaluation.

This iteration therefore supports the hypothesis and justifies repeated validation, but does not establish release readiness. The next experiment should repeat the closed-correction set and restraint set across at least three fresh sessions, then run the 15-case Boardy-derived set and both longitudinal worlds. A retained change must improve the closed-correction family without increasing over-silencing, identity drift, unsupported claims, or execution discrepancies.

## Controlled 48-case provider comparison

The visible-feed development fixture was replayed against the same 48 inbound situations with the same Presence, scenario order, Auto envelope, `asset.inspect` binding, and isolated Sandbox state. New message experiments used only the approved providers/models. The historical Qwen row is retained for directional context only; it is not a like-for-like comparison because its old run used the original 20-case fixture and is not rerun.

| Message experiment | Act appropriateness | Wording quality | Cases | Structural | Action distribution |
|---|---:|---:|---:|---:|---|
| Qwen historical baseline | 43.0% diagnostic score | Not separated | 20 | Historical | Not comparable |
| GLM 5.2 (`glm-5.2:cloud`, `think:false`) | 95.8% | 100.0% | 48 | 100% | 41 no-op, 4 reply, 3 like |
| GPT 5.6 Luna Low (`reasoning_effort: low`) | 97.9% | 95.8% | 48 | 100% | 33 no-op, 12 reply, 3 like |
| GPT 5.6 Luna Medium (prior development run) | 97.9% | 100.0% | 48 | 100% | 25 no-op, 15 reply, 4 clarify, 4 like |

The clean 48-case comparison narrows the diagnosis: model capability matters, but the remaining gap is not explained by model choice alone. GPT Luna Low selected the better act in this fixture than GLM 5.2, while GLM's emitted wording scored slightly better. The action distributions also differ materially: GLM is much more conservative, whereas GPT Luna engages more often. This is precisely why a single aggregate score is insufficient.

The blind semantic review identified these general failure patterns:

- GPT Luna Low: one unnecessary reply to a self-contained technical observation; one `clarify` where a direct definition was sufficient; and one socially appropriate follow-back reply whose wording became more promotional than the evidence supported.
- GLM 5.2: two planning misses where relevant AI/security or personalized-agent requests were abandoned after a proposed draft exceeded the limit, instead of shortening the reply or choosing a smaller useful act.

These are planning/expression diagnoses, not targets for canned fixes. The right next step is to improve the planner's available evidence and bounded-act reasoning, then retest unseen variants. The reports are:

- `boardy-capture-gpt-luna-low-2026-08-13.json`
- `boardy-capture-glm52-2026-08-13.json`
- `boardy-capture-gpt-luna-low-2026-08-13-semantic-gpt56.json`
- `boardy-capture-glm52-2026-08-13-semantic-gpt56.json`

The source inventory now also includes 20 Boardy-authored original/quote contexts in `boardy-original-capture-2026-08-13.json`. They are development evidence only: the public profile does not provide enough parent history or private outcome truth to treat them as final expected-action cases.

### Repeated GPT Luna Low stability check

Two additional fresh GPT Luna Low sessions were run over the same 48-case development fixture. Both remained structurally valid and used the same model, `reasoning_effort: low`, `asset.inspect`, and Auto envelope. The blind semantic judge scored the combined 96 packets as:

| Metric | Session 1 | Session 2 | Combined mean |
|---|---:|---:|---:|
| Act appropriateness | 93.75% | 94.79% | 94.27% |
| Wording quality | 96.67% | 100.00% | 98.28% |

The repeated result is below the single-run 97.9% act score, which confirms that the visible-feed result has meaningful run-to-run variance. The recurring pattern is not inability to produce useful text; it is over-engagement on self-contained technical or promotional posts, plus occasional failure to choose network search when current local discovery is the better-supported act. This is evidence for improving general planner/context judgment, not for adding scenario-specific silence rules.

## Validation: current GPT Luna Low holdout and longitudinal worlds

A current GPT 5.6 Luna Low run was executed against the operationally separated 20-case holdout. Individual hidden cases were not inspected or used for tuning. The aggregate result was:

| Evaluation | Act appropriateness | Wording quality | Cases | Structural |
|---|---:|---:|---:|---:|
| Current holdout, aggregate-only review | 95.0% | 100.0% | 20 | 100% |

Two 50-event longitudinal development worlds were also run with GPT Luna Low. Both retained Auto mode, truthful execution, media provenance, and planner/editor integrity:

| World | Act appropriateness | Wording quality | Events | Structural |
|---|---:|---:|---:|---:|
| Longitudinal world 1 | 96.0% | 100.0% | 50 | 100% |
| Longitudinal world 2 | 92.0% | 100.0% | 50 | 100% |

The 92% world is a useful warning: isolated-case performance does not guarantee consistent behavior across a changing social world. The longitudinal evaluator still needs a dedicated coherence review for repetition, relationship continuity, topic fixation, and identity drift; its per-event semantic score is not sufficient by itself.

## Iteration 2: larger visible-feed capture

A read-only capture of the live `@boardyai/with_replies` feed produced 48 inbound posts immediately followed by a visible Boardy reply in the same DOM snapshot. The capture spans network matching, technical and media claims, direct questions, terse banter, compliments, product promotion, sensitive material, and ordinary relationship continuity. It is stored in `boardy-source-capture-2026-08-13.json` and generated into `boardy-capture-development-48.json`.

The GPT 5.6 Luna Medium development run used Auto for post, reply, repost, quote, like, and message, with `asset.inspect` recorded as the media tool. Results:

| Evaluation | Act appropriateness | Wording quality | Cases | Structural |
|---|---:|---:|---:|---:|
| Visible-feed capture | 97.9% | 100% | 48 | 100% |

Two cases received an act score of 1 rather than 2. In both, the Agent produced a specific, technically useful reply to an unrequested technical claim; the blind judge considered the reply defensible but optional. This is the right kind of failure to investigate next because it tests whether the Agent can add value without turning every evidence-bearing post into an obligation to speak.

This is a development result, not the final parity result. The visible feed still lacks complete parent history and private outcomes, some posts are truncated behind `Show more`, and the 48 cases do not by themselves satisfy the required 20 original/quote, 15 media, 15 network, 10 sensitive, and 20 independent-restraint partition targets.

## Research conclusion: what the extra experiment must test

Twenty cases were enough to diagnose the original capability gap. They were not enough to establish parity. The effective sample was smaller than 20 because several entries belonged to the same conversation, while entire capability strata—especially network behavior, restraint, original posts, and quote posts—were represented by one or a few examples.

The next parity experiment should therefore use a larger, stratified set of complete thread/relationship units:

| Partition | Minimum target | Why it is needed |
|---|---:|---|
| Boardy reply/reaction contexts | 50 | Tests direct engagement, banter, follow-up, and thread continuation with real preceding context |
| Boardy original and quote posts | 20 | Tests whether the Presence can decide when to join, like, quote, or stay silent without copying an observed reply |
| Technical, link, and multimodal | 15 | Tests evidence use, media provenance, uncertainty, and useful specificity |
| Network/introduction | 15 | Tests search, candidate evidence, permission, handoff, and truthful completion |
| Sensitive/adversarial | 10 | Tests specificity, care, safety, and resistance to generic disclaimers |
| Independent restraint | 20 | Tests that capability improvements do not create compulsory engagement |
| **Total** | **130** | **Large enough for macro-strata, still reviewable** |

That frozen set should be evaluated with three repeated fresh sessions per configuration, a separately sealed 50–60-case paraphrased holdout, at least 60 fresh Playground interactions, and three 50–100-event longitudinal worlds. The semantic judge must score act selection separately from wording, while structural checks verify Auto mode, provenance, permissions, truthful execution, planner/editor integrity, and zero deterministic social-response fallbacks. At least 20% of cases should receive blinded human review to estimate judge agreement.

The immediate controlled follow-up is not another prompt tweak. It is a general planner experiment: compare the current pipeline with richer evidence/context and an authoritative model-driven Social Planner, changing one architectural variable at a time. Track mean, variance, action distribution, per-stratum performance, critical failures, and whether each fix generalizes to unseen actors, paraphrases, reordered scenarios, and fresh sessions. Do not promote the visible 48-case result or the original 20-case score to a production parity claim.

## Current iteration: model-native restraint and bounded replan

The next failures were traced to planning rather than observation. In the lower-scoring longitudinal world, perception correctly identified that a sustainable-habit statement and a conditional-introduction boundary did not contain an unresolved request, but the planner still replied as if relationship history created an obligation to speak. A separate family of direct requests exposed a mechanical expression problem: the first draft exceeded the channel limit and was incorrectly at risk of becoming `NO_OP`.

The general correction was two-part:

- Social guidance now treats preference, consent conditions, and conversational boundaries as evidence—not as an instruction to acknowledge or advise. Prior relationship history informs judgment but does not create a response obligation.
- When a model-selected text act is supported but the draft violates the channel limit, the runtime requests a model-driven replan of act and expression. It may keep the act with a shorter response or choose another supported act; it may not convert to silence merely because the first draft was too long. If the replan still contradicts the mechanical constraint, the runtime fails closed without emitting a public response.

This preserves the architecture boundary: deterministic code owns channel reality and execution truth; the model owns social interpretation, action selection, and expression. No actor, phrase, scenario ID, expected answer, or deterministic social-response fallback was added.

The updated GPT 5.6 Luna Low validation produced:

| Evaluation | Act appropriateness | Wording quality | Cases/events | Structural |
|---|---:|---:|---:|---:|
| Longitudinal world 2, final rerun | 99.0% | 100.0% | 100 | 100% |
| Fresh world 1, final rerun | 100.0% | 100.0% | 20 | 100% |
| Fresh world 2, final rerun | 100.0% | 100.0% | 20 | 100% |
| Fresh world 3, final rerun | 95.0% | 100.0% | 20 | 100% |

All four artifacts recorded GPT 5.6 Luna, `reasoning_effort: low`, independent GPT 5.6 Luna Medium semantic evaluation, Auto execution, truthful execution status, media provenance where media was observed, no known deterministic fallback marker, and no planner/editor act mismatch. The remaining fresh-world misses were conservative planning disagreements about whether a self-contained joke deserved a `LIKE` or `NO_OP`; they were not wording or execution failures. The final longitudinal rerun reduced the earlier continuity errors to one similarly low-stakes over-engagement case.

These results materially improve the evidence, but they are still not a parity declaration. The current evidence is distributed across development fixtures, two longitudinal worlds, and a 20-case aggregate-only holdout; it is not yet a frozen 130-case, repeated, stratified, human-audited evaluation. The improvement is therefore evidence that the general planner/context correction helped unseen interactions, not proof that the remaining gap is closed.

## Required extra experiment before claiming parity

Twenty cases were sufficient for diagnosis, but not for a reliable parity claim. The required next experiment is a frozen, stratified replay built from complete Boardy thread/relationship units, supplemented by independent cases where Boardy capture cannot establish the correct action. It should include at least 130 interactions: 50 Boardy replies/reactions, 20 original or quote contexts, 15 technical/link/media cases, 15 network/introduction cases, 10 sensitive/adversarial cases, and 20 independent restraint cases. The units—not just individual posts—must be split by thread so the holdout cannot leak author history or conversation state.

Run the frozen set three times with GPT 5.6 Luna Low, then repeat the same set with GLM 5.2 under the identical Auto/media/tool envelope. Keep the historical Qwen result only as a diagnostic baseline; do not rerun Qwen for message generation. Add a sealed 50–60-case paraphrased holdout, at least 60 fresh interactions across three newly generated worlds, and a third 50–100-event longitudinal world. Review at least 20% of cases blindly with a human rubric and compare human judgment with the independent semantic judge.

The release gate should require all of the following:

1. 100% structural truth: Auto settings, permissions, provenance, truthful execution, planner/editor integrity, and zero deterministic public-response fallbacks.
2. More than 90% semantic act performance and more than 90% wording performance on the frozen benchmark, reported separately and by capability stratum.
3. Comparable performance on the sealed paraphrased holdout, three fresh varied Playground runs, and all three longitudinal worlds.
4. Repeated-run mean and variance that do not depend on a lucky session, with no critical safety, privacy, fabricated-network, or identity failures.
5. Evidence that any improvement survives unseen actors, reordered scenarios, fresh wording, and fresh sessions without benchmark-specific logic.

If the larger run fails, classify each failure by earliest layer—observation, context, relationship memory, perception, planning, expression, or execution—and change only the general layer implicated by multiple cases. Do not optimize the legacy keyword score or patch an expected answer. The proper success condition is not “the benchmark rose”; it is “the same architecture makes good social judgments on new worlds.”

## Current evaluation evidence after the next development cycle

The latest development replay was run three times with GPT 5.6 Luna Low, `reasoning_effort: low`, `asset.inspect`, and all six interaction affordances in Auto mode. Across 144 repeated packets, the independent GPT 5.6 Luna Medium judge scored 96.875% act appropriateness and 96.667% wording quality. Structural truth was 100%. The nine non-perfect act cases were planning tradeoffs: optional engagement on self-contained posts, clarification of underspecified fragments, and missing verified current-source search evidence. No deterministic public-response mechanism was implicated.

The independent restraint set was also run three times. Across 54 packets it scored 99.074% act appropriateness and 92.857% wording quality, with 100% structural validity. This indicates that the broader planner correction did not produce a broad activity surge; the remaining restraint weakness is primarily expression quality on the small subset where the model chose to speak.

The operationally sealed 60-case paraphrased holdout was created before scoring, hash-verified, and reviewed only at aggregate level. GPT 5.6 Luna Low scored 99.167% act appropriateness and 100% wording, with 100% structural validity. This is meaningful generalization evidence, but it is not a true external secret because the local scenario file remains accessible to the development environment; the limitation is recorded in `qa-learnings/social-capability-holdout-60-seal.json` and `scripts/verify-holdout-seal.mjs`.

A third 62-event longitudinal development world was added with nine recurring actors, repeated relationships, media, network boundaries, sensitive questions, scheduled intent, time advances, and explicit no-op opportunities. It scored 98.387% act appropriateness and 100% wording, with 100% structural validity. Together with the two prior 50-event worlds, this satisfies the current development-world count, but not the final parity gate because the worlds have not received blinded human coherence review.

The machine-readable dataset and evidence audit is `qa-learnings/social-capability-dataset-audit-2026-08-13.json`. Its current verdict remains `PROMISING_BUT_NOT_YET_ESTABLISHED`: the 130-case frozen provenance-backed set, repeated frozen model comparison, macro capability report, and blinded human calibration are still missing.

## Next development hypothesis: clarification versus unsupported current guidance

The 144-case replay showed two recurring planning patterns: short sincere questions were sometimes treated as silence, and current local discovery requests sometimes received plausible generic guidance without verified search evidence. The general change added two model-facing principles: ask the smallest clarification when a clear question lacks one necessary fact, and use authorized search or state the limitation rather than naming unverified current sources.

The original failure, paraphrased actors/topics, and adjacent cases were run three times in `planner-generalization-development.json`. The 24-packet result was 95.833% act appropriateness and 90.0% wording, with 100% structural validity. The clarification act was accepted by the blind judge in the short-question cases. The only repeated act misses were current-event discovery requests where the sandbox directory has no event source; the model remained candid instead of fabricating a result. This confirms a tool-capability boundary, not permission to add a social keyword branch.

The change is retained as a general improvement, with the caveat that current-source discovery still requires an authorized search connector if the product is expected to answer those requests substantively.

A blinded 20% human-review packet has been generated at `qa-learnings/human-review-sample-v2-2026-08-13.json` from the repeated development replay. It contains 29 de-identified review items and the frozen human rubric fields, but it remains `pending-human-review`; no human agreement or naturalness rate is claimed yet.

## Latest controlled model comparison

Using the same 48-case visible-feed development fixture after the general planner guidance change, the approved message configurations produced:

| Message model | Act appropriateness | Wording quality | Cases | Structural |
|---|---:|---:|---:|---:|
| GLM 5.2 (`glm-5.2:cloud`, `think: false`) | 97.917% | 70.0% | 48 | 100% |
| GPT 5.6 Luna Low (`reasoning_effort: low`) | 96.875% across three sessions | 96.667% across three sessions | 144 repeated packets | 100% |

The GLM row is a single-session comparison and the GPT row is a three-session stability result, so it is directional rather than a final provider ranking. It does show the requested comparison order remains informative: GLM selected defensible acts at a similar rate but produced materially weaker wording under this evaluator. The historical Qwen result remains a 20-case diagnostic baseline only and was not rerun.

A single GPT Luna Low post-guidance regression replay scored 98.958% act appropriateness and 100% wording on the same 48 cases, with 100% structural validity. It is recorded as a regression check only; the three-session distribution remains the stronger stability evidence.

Because the clarification/search guidance was a product change, the sealed holdout and fresh worlds were rerun after the change. The aggregate-only 60-case holdout scored 98.333% act appropriateness and 100% wording, with 100% structural validity. The three fresh 20-case worlds each scored 100% act and 100% wording, with all Auto, provenance, execution-truth, no-fallback-marker, and planner/editor checks passing. These reruns support generalization of the change, but do not replace the missing frozen 130-case benchmark or human calibration.

## Iteration 3: clarification breadth and neutral expression

### Failure diagnosis

The development suite exposed a general, non-Boardy-specific pattern: when a short question had multiple plausible interpretations, the Agent could ask an overly narrow clarification; when a technical premise was uncertain, an otherwise useful response could sound dismissive. The earliest layers were planning for the former and expression for the latter. No actor, phrase, scenario identifier, expected answer, or deterministic response branch was added.

### General change

The shared social cognition guidance now asks the model to keep a clarification open enough to distinguish multiple interpretations and to use neutral language for uncertain premises. The planner still owns the act, the editor still cannot override it without a concrete contradiction, and deterministic code still owns only factual/execution constraints.

### Development evidence

The new eight-case clarification/tone development scenario was run three times with GPT 5.6 Luna Low (`reasoning_effort: low`), `asset.inspect`, and all six interaction affordances in Auto mode. An independent GPT 5.6 Luna Medium judge scored:

| Evaluation | Act selection | Wording | Packets | Structural |
|---|---:|---:|---:|---:|
| Clarification/tone development, 3 sessions | 97.917% | 90.476% | 24 | 100% |

The remaining act disagreement was a factual attendance question where the judge preferred silence over clarification without verified attendance evidence. The remaining wording disagreements were mostly formal or narrow phrasing, not identity, fabrication, or execution failures.

The broader one-session regressions remained structurally valid and preserved the same GPT model, reasoning setting, media tool, and Auto envelope:

| Regression | Act selection | Wording | Cases | Structural |
|---|---:|---:|---:|---:|
| 48-case Boardy visible-feed development replay | 97.917% | 95.833% | 48 | 100% |
| Independent restraint replay | 97.222% | 100% | 18 | 100% |

The Boardy replay's two act disagreements were general planning judgments: replying to a self-contained technical post without a direct request, and liking a message explicitly addressed to another person. The restraint disagreement was a low-stakes choice between `like` and `no_op` on a self-contained personal observation. These are development diagnostics, not benchmark-specific targets.

### Decision

Retain the guidance as a general model-facing improvement, but do not claim a causal score increase from this small targeted set. The results justify continuing with frozen-set construction and human/evaluator calibration. Current-source discovery remains a tool-capability experiment: when no authorized search source exists, truthful limitation is preferable to invented current guidance.

## Partition status

A transparent candidate partition manifest now records 33 development cases and 60 validation cases. The frozen and holdout arrays remain empty by design. Sixty-two Boardy source cases are explicitly excluded from promotion: 42 visible-feed reply captures and 20 original/quote captures still require complete thread/relationship provenance. The fail-closed validator reports `candidate-not-frozen` until the 130-case frozen manifest contains verified evidence, complete thread units, target category coverage, and no expected-answer fields.

The public-status enrichment pass retrieved timestamps, authors, reply-parent chains, quoted-post context, and public media/link metadata for all 68 captured Boardy cases without enrichment errors; 25 reply cases exposed a retrievable parent chain, representing 14 unique retrieved thread roots across the 48 visible-feed cases. This confirms that the 48 visible interactions are not 48 independent situations. The enrichment improves the evidence envelope but does not establish private relationship state, private outcomes, or a complete conversation history. The artifact remains explicitly development-only at `qa-learnings/boardy-provenance-enriched-candidate-2026-08-13.json`.

A 68-case source-provenance review packet is also prepared at `qa-learnings/boardy-provenance-review-packet-v1.json`. It asks for complete-thread confirmation, stable thread-unit assignment, confidence, and frozen-set eligibility while keeping all decisions blank. It is a collection/review aid, not a frozen benchmark or a source of expected actions.

The thread-unit analysis is recorded in `qa-learnings/boardy-thread-unit-analysis-v1.json`: 48 visible reply captures collapse to 37 retrieved roots; nine curated cases do not overlap those source URLs, producing a potential 46-unit reply pool before manual deduplication. At least four additional distinct Boardy reply/reaction situations are therefore needed to meet the 50-unit target. The 20 original/quote captures provide 20 distinct public roots, subject to the same provenance review.
