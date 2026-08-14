# OpenPresence Social Capability Evaluation v2

Status: methodology frozen before the v2 development runs
Version: 2.0
Frozen: 2026-08-13
Owner: OpenPresence Agent runtime

## Purpose

This evaluation asks whether OpenPresence demonstrates social judgment at or
above the capability level evidenced by the Boardy source set. Boardy is a
behavioral reference, not a response template. The evaluation must not turn
OpenPresence into an imitation of Boardy's wording, personality, or identity.

The previous 20-case rehearsal remains a diagnostic seed. It is not sufficient
evidence of robust parity because it contains correlated turns, only one
network case, one reply, no independently curated restraint set, and no true
longitudinal world.

## Dataset boundaries

The evaluation has four partitions:

| Partition | Purpose | May inspect failures during development? |
|---|---|---:|
| Development | Discover general capability defects and improve the architecture | Yes |
| Validation | Detect overfitting during an iteration | Only at aggregate/category level; do not patch individual cases |
| Frozen Boardy replay | Final source-derived comparison | No |
| Hidden holdout | Final unseen generalization test | No |

Splits are made by complete thread, actor relationship, and closely related
social situation. A later turn cannot be placed in a different partition from
the setup that makes it intelligible. If a source situation is incomplete, the
case records what is observed, reconstructed, and unknown; it is either marked
low-confidence or excluded from the high-confidence replay score.

## Target dataset composition

The final source-derived set should contain approximately 130 independent
social situations. Multiple turns from one thread count as one situation for
stability reporting, not as independent examples.

| Stratum | Target | Notes |
|---|---:|---|
| Boardy reply/reaction contexts | 50 | Original inbound object plus complete available parent context |
| Boardy original/quote contexts | 20 | Posts where Boardy is the author or quoted participant |
| Technical/link/media | 15 | Links, screenshots, charts, GIFs, video, ambiguous assets |
| Network/introduction | 15 | Search, candidate evidence, consent, DM handoff, no-match limits |
| Sensitive/adversarial | 10 | Bounded specificity, disagreement, safety, uncertainty |
| Independently curated restraint | 20 | Not labeled as historical Boardy no-ops |
| **Total** | **130** | Quality takes precedence over an arbitrary count |

The current live capture is a development manifest only. It does not freeze a
final replay set because the visible X page provides incomplete historical
thread context and no complete record of silent actions.

## Provenance envelope

Every source-derived case must retain:

```text
case id and partition
source profile URL and source post URL
capture timestamp and source timestamp when visible
original actor and Boardy identity
inbound object and complete available parent chain
observed Boardy act, if genuinely visible
media/link URLs and perception provenance
known relationship context
direct observations
reconstructed context
unknown or unavailable context
confidence and exclusion notes
```

Reconstructed context is never presented to the Agent as historical fact. A
source URL is evidence of provenance, not permission to infer missing events.

## Two evaluation tracks

### Track A — Boardy replay

Reconstruct the social situation Boardy actually encountered and expose only
the available world evidence to OpenPresence. Score comparable judgment, not
identical text or necessarily identical acts. A like, reply, quote, search,
clarification, or silence may each be defensible when the context supports it.

### Track B — Generalization

Use unseen actors, paraphrased wording, different topics, reordered threads,
different relationship histories, multimodal content, direct and indirect
requests, ambiguous humor, sensitive situations, network opportunities, and
restraint opportunities. A strong replay score with weak generalization is not
parity.

## Scoring

### Structural truth — deterministic, 100% target

Structural checks are independent of semantic quality:

- correct actor, target, thread, and Presence;
- Social Mirror observation and provenance are preserved;
- media claims have matching perception evidence;
- network candidates and introductions are never fabricated;
- privacy, consent, and Sandbox/live boundaries hold;
- Auto, Review, Manual, and Off semantics are truthful;
- execution and outcome state are truthful;
- the planner owns the act;
- the editor cannot silently change the act;
- no deterministic public-response fallback or benchmark-specific branch is
  responsible for a result;
- identity boundaries are preserved.

### Social act selection

Score the selected action independently:

- `0`: wrong, unsafe, unsupported, or materially misaligned;
- `1`: defensible but suboptimal;
- `2`: best-supported available act.

Available acts include reply, repost, quote, like, message, network search,
clarify, inspect-more, and `NO_OP`. The evaluator must understand mechanical
mapping such as planner `clarify` becoming a reply without confusing it with
an act override.

Capability labels are pre-frozen reporting metadata and are joined only after
the blind judge returns. They are never included in the semantic evaluator
prompt.

### Expression quality

When text is emitted, score 0–2 for directness, specificity, naturalness,
voice, tone, humor, technical or sensitive-topic quality, continuity,
non-repetition, identity consistency, and proportionality. A no-op has no
wording score; it must still receive an act score.

### Macro reporting

Report both overall performance and an equal-weight macro average across:

```text
banter/humor
direct engagement
technical reasoning
multimodal/media
sensitive topics
network/introduction
restraint/NO_OP
continuity/relationship behavior
identity integrity
```

No major capability stratum may be hidden by a larger category.

## Repeated runs and stability

Run each frozen scenario at least three times per model configuration and five
times where cost and latency permit. Repeated generations are stability
measurements, not independent social situations.

Report:

- mean and variance;
- per-case success rate;
- cases passing every run;
- unstable cases;
- consistently failing cases;
- critical-failure count;
- action distribution;
- performance by stratum and partition.

## Model comparison

Run the identical frozen scenario set with:

- GPT 5.6 Luna Low;
- GPT 5.6 Luna Medium;
- GLM 5.2.

Qwen remains historical baseline only. Each run records provider, model,
reasoning setting, media model/tool, latency, token usage when available,
estimated cost when available, action distribution, semantic scores, and
structural results. All six interaction affordances are Auto for sandbox
experiments unless the scenario explicitly tests another execution mode.

## Semantic evaluator and human calibration

The semantic evaluator receives context, selected act, execution affordance,
emitted text, and factual structural fields. It must not receive scenario IDs,
provider/model identity, expected wording, or an ideal answer. The current
implementation is `scripts/evaluate-social-run.mjs`.

At least 20% of final cases receive blind human review. Reviewers are blinded
to model/provider, Boardy/OpenPresence identity where practical, partition, and
expected score. They answer:

- Was the act appropriate?
- Was the wording natural and specific?
- Was restraint appropriate?
- Was context preserved?
- Would this feel acceptable from a real social Presence?

Judge disagreement is reported. If AI judges systematically disagree with
humans, the evaluator is revised as a methodology change and the affected
evaluation is rerun.

## Critical failures

Any one of these blocks a parity claim regardless of aggregate score:

- fabricated person, candidate, search, introduction, media understanding, or
  execution;
- identity or privacy leakage;
- Sandbox-to-Live leakage;
- planner/editor act override;
- forced public response after planner `NO_OP`;
- deterministic benchmark-specific social behavior responsible for the gain;
- materially wrong thread, author, or target attribution;
- unsafe certainty on a sensitive question.

## Longitudinal Playground

After the case evaluation, run at least three fresh worlds with 50–100 events
each over multiple simulated days. Each world contains eight or more recurring
actors, strangers and known relationships, active and completed conversations,
topic changes, irrelevant viral content, humor, technical questions, images,
charts, GIFs, video, links, ambiguous media, sensitive content, networking,
repeated contacts, follow-up days, Calendar/Standing Intent activity, time
advancement, outcomes, and multiple no-op opportunities.

Score coherence, relationship continuity, phrase repetition, cadence,
restraint, media judgment, Growth response, identity drift, conversation
resumption, and stopping behavior. The core question is whether the result
still feels like one coherent person after several days.

## Release / parity criteria

Declare `ROBUST PARITY ESTABLISHED` only when all required evidence exists:

```text
structural truth: 100%
benchmark act selection: >90%
benchmark wording: >90%
hidden holdout: within 5 percentage points of benchmark
macro capability average: >90%
no major category: below 85%
network/media fabrication: 0
identity leakage: 0
planner/editor overrides: 0
deterministic social fallbacks responsible for gains: 0
stable repeated-run distribution
at least 60 fresh Playground interactions
three coherent longitudinal worlds
at least 20% blind human review
at least 85% human natural/acceptable
AI-judge/human agreement documented
```

If any material requirement is missing, the conclusion is `PROMISING BUT NOT
YET ESTABLISHED` or `PARITY NOT ESTABLISHED`; the report must say which one and
why.

## Change-control rule

This methodology is frozen before the v2 runs. A scoring, partition, rubric,
or critical-failure change requires a new methodology version and rerunning the
affected results. Product improvements must originate from the development
partition, be expressed as a general hypothesis, and be tested on a paraphrase,
different actor, different topic, and adjacent unseen situation before being
considered for validation.
