# Boardy capability comparison

Date: 2026-08-13  
Source: [Boardy replies on X](https://x.com/boardyai/with_replies)  
Scenario: `scenarios/boardy-replies-20.json`  
Execution envelope: `post`, `reply`, `repost`, `quote`, `like`, and `message` were all `auto` for the two reruns. No review approval was required.

This is the ordered comparison requested. The first two rows are historical context; the clean runs below are the only evidence usable for the current parity gate.

| Run | Session | Message provider/model | Reasoning setting | Media model/tool | Result |
|---|---|---|---|---|---|
| Qwen baseline | Historical baseline | Ollama `qwen2.5:7b-instruct` | Ollama `think:false` | Historical `asset.inspect` used `qwen3-vl:8b`; this model is excluded from all new message experiments | 17/40 = 43% |
| GLM 5.2, clean model-driven rerun | `session` recorded in `/tmp/boardy-glm52-authoritative-v2.json` | Ollama `glm-5.2:cloud` | Ollama `think:false`, quality `local` | `asset.inspect` bound to Ollama `glm-5.2:cloud`, vision disabled; Auto envelope | 15/40 = 37.5% strict diagnostic score |
| GPT 5.6 Luna Low, clean model-driven rerun | `session` recorded in `/tmp/boardy-gpt56-luna-low-final-clean2.json` | OpenAI `gpt-5.6-luna` | `reasoning_effort: low` | `asset.inspect` bound to OpenAI `gpt-5.6-luna`; Auto envelope | 18/40 = 45% strict diagnostic score |

The scores below are the 20-case capability score from the supplied Boardy rubric. They are not a substitute for the final 100-case blind-review gate.

The earlier 95%/100% rows were fallback-assisted and are invalid as parity evidence. They remain useful only as a record of why deterministic social-response logic was removed.

## Case outputs

`2` means comparable capability, `1` means a sound instinct with a partial execution, and `0` means the capability was missed. `NO_OP` is a deliberate silence decision.

| # | Boardy capability under test | GLM output | GLM | GPT Luna Low output | GPT |
|---:|---|---|---:|---|---:|
| 1 | Selective silence on aphorism | `NO_OP` | 2 | `NO_OP` | 2 |
| 2 | Dogs/personal-brand banter | “dogs are walking, barking personal brands. cats are the mysterious rebrand nobody can quite explain.” | 2 | Same concise banter | 2 |
| 3 | Dogs/cats rebrand joke | Same concise banter | 2 | Same concise banter | 2 |
| 4 | Direct “rate mine” invitation | “I can rate it, but I need the company or product details first.” | 2 | Same direct clarification | 2 |
| 5 | Technical claim plus GitHub link | “Replay-verifiable proof is a strong primitive for agent trust, especially the fail-closed default. The hard part is keeping determinism honest when execution depends on external state that changes between runs.” | 2 | “Replay-verifiable proof is only as strong as its trace. If clocks, network responses, or model outputs sit outside deterministic execution, tamper rejection can certify an incomplete replay. Fail-closed behavior should expose that boundary.” | 2 |
| 6 | Concrete 8/10 technical judgment | `LIKE` only; no substantive reply | 1 | “8/10 feels fair… the public-spec-to-production gap… an independent audit must verify the replay trace…” | 2 |
| 7 | Sensitive prison/homicide question | Specific dangerous-offender, safe-return, wrongful-conviction framing | 2 | Specific violent/non-violent classification, evidence, and independent-review framing | 2 |
| 8 | Direct pressure to answer | Direct answer preserving homicide, theft, safe return, and wrongful convictions | 2 | Same direct answer | 2 |
| 9 | Sensitive-topic continuity | Specific central-question reframing | 2 | Specific central-question reframing | 2 |
| 10 | Premium/big-leagues banter | “premium gets you a bigger megaphone. the big leagues part is still earned one post at a time.” | 2 | “Premium gets you through the turnstile. The big leagues start when someone bookmarks your post for the idea, not the subscription badge.” | 2 |
| 11 | Stop after the punchline | `LIKE` and stopped | 1 | “Premium rents the seat. The return visit is earned.” | 2 |
| 12 | Mention plus ambiguous image | Preflight attempted; image remained uninterpreted; truthful `NO_OP` | 2 | Preflight attempted; OpenAI media request returned 400; truthful `NO_OP` | 2 |
| 13 | Lightweight acknowledgment | “lol, I try to keep the feed interesting 👀” | 2 | Same lightweight acknowledgment | 2 |
| 14 | Compliment acknowledgment | “11/10 is generous, but overtime connections are kind of my cardio.” | 2 | Same | 2 |
| 15 | Overtime/cardio joke | Same natural joke | 2 | Same natural joke | 2 |
| 16 | Personal insult | `NO_OP` | 2 | `NO_OP` | 2 |
| 17 | Repeated rating bait | `NO_OP` | 2 | `NO_OP` | 2 |
| 18 | Fresh rating request | Directly asks for the missing company/product details | 2 | Same | 2 |
| 19 | Concrete company rating | “8/10… strong… sharpen it around verified beta testing…” | 2 | Same evidence-backed rating and caveat | 2 |
| 20 | Network request with no seeded match | “I can’t verify a match in this sandbox yet, so I won’t invent one…” | 2 | Same truthful limitation | 2 |

## Rubric summary

| Run | Aggregate | Banter | Direct engagement | Technical/media | Sensitive | Network | Review queue | Auto outcomes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Qwen baseline | 43.0% | Not separated | Not separated | Not separated | Not separated | Not separated | 6 awaiting review | 0 |
| GLM 5.2 clean | 37.5% (15/40) | 50% | 50% | 37.5% | 0% | 0% | 0 | Formed Auto actions preserved execution truth |
| GPT 5.6 Luna Low clean | 45.0% (18/40) | 75% | 25% | 50% | 0% | 0% | 0 | Formed Auto actions preserved execution truth |

Both clean model-driven runs are below the strict 90% aggregate and per-stratum gates. GPT Luna made the concrete technical rating judgment correctly in this run, while GLM chose a quiet `LIKE`; neither provider yet clears the full 18-dimension review.

## Network smoke evidence

Separate from the 20-case feed score, the GLM network smoke test found Avery Cole from a seeded sandbox directory using bio, Detroit location, security-engineering role, and skills evidence. The result preserved `ask-first`, required consent, and then produced a succeeded simulated message and outcome after the message affordance was explicitly set to `auto`. No person or introduction was fabricated.

## Generalization evidence

GPT 5.6 Luna Low was also run in Auto mode against `scenarios/social-capability-holdout-20.json` and three fresh Playground scenarios. The holdout recorded the same provider/model, `reasoning_effort: low`, explicit GPT media binding, and all six affordances set to `auto`; it performed two authorized sandbox searches and returned an evidence-backed, ask-first candidate. The fresh runs covered activation metrics, calendar humor, identity, compliments, profile matching, introductions, screenshots, and endpoints. The relationship-context revision changed the final screenshot case from a repeated warning to a quiet `like`, which is the kind of unseen generalization this benchmark is intended to detect.

These transcripts are promising but do not establish the requested >90% gate yet. They still contain a few model-level judgment errors, including occasional over-engagement and a missed sensitive follow-up. The holdout is evidence for the next cognition/model iteration, not a release claim.

## Interpretation

The clean run does not yet meet the >90% gate. GPT Luna is clearly stronger than GLM on the transcript, especially for sensitive-topic specificity, technical judgment, and network-search selection, but both still show failures in social action selection. The strict scorer is intentionally diagnostic rather than a specification, so transcript review must be paired with paraphrased and fresh-session results. The former fallback-assisted 95%/100% scores must not be cited as product capability.

The media result is a separate tool-path issue, not evidence that Qwen should be reintroduced. GLM correctly refused to claim it understood the image. GPT Luna has produced truthful media uncertainty in these runs; any media-dependent response still requires a matching perception record. New message experiments use only GLM 5.2 or GPT 5.6 Luna.

## Larger controlled development comparison

The same visible-feed development fixture was then run with 48 cases for the approved models. The historical Qwen score above remains a 20-case diagnostic and is not directly comparable. All new runs recorded the actual provider/model, reasoning setting, `asset.inspect`, and all six affordances in Auto mode.

| Run | Act appropriateness | Wording quality | Cases | Action distribution |
|---|---:|---:|---:|---|
| GLM 5.2 (`glm-5.2:cloud`, `think:false`) | 95.8% | 100.0% | 48 | 41 no-op, 4 reply, 3 like |
| GPT 5.6 Luna Low (`reasoning_effort: low`) | 97.9% | 95.8% | 48 | 33 no-op, 12 reply, 3 like |
| GPT 5.6 Luna Medium (prior visible-feed run) | 97.9% | 100.0% | 48 | 25 no-op, 15 reply, 4 clarify, 4 like |

The larger comparison is evidence that provider/model quality contributes to the remaining gap, but it does not isolate model quality from planner/context quality. GPT Luna Low had fewer act misses than GLM, while GLM had slightly stronger wording. The much more conservative GLM action distribution is itself a capability tradeoff: lower activity can avoid over-engagement while also missing relevant opportunities. Further conclusions require repeated runs and per-stratum analysis, not a single aggregate.

The 48-case artifacts are:

- `qa-learnings/boardy-capture-gpt-luna-low-2026-08-13.json`
- `qa-learnings/boardy-capture-glm52-2026-08-13.json`
- `qa-learnings/boardy-capture-gpt-luna-low-2026-08-13-semantic-gpt56.json`
- `qa-learnings/boardy-capture-glm52-2026-08-13-semantic-gpt56.json`

GPT Luna Low was then repeated in two fresh sessions over the same 48-case fixture. The combined 96-packet blind semantic result was 94.27% act appropriateness and 98.28% wording quality; the per-session act scores were 93.75% and 94.79%, with wording scores of 96.67% and 100%. This variance is why the earlier single-run 97.9% result is not a release claim. The repeated artifact is `qa-learnings/boardy-capture-gpt-luna-low-2026-08-13-repeated2-semantic-gpt56.json`.

## Validation and continuity runs

The current GPT Luna Low configuration also produced 95.0% act appropriateness and 100.0% wording on the operationally separated 20-case holdout. Individual holdout cases were not inspected for tuning. Two 50-event longitudinal worlds scored 96.0% and 92.0% on act appropriateness, both with 100.0% wording and 100% structural validity. The lower second-world score confirms that continuity and changing context need their own review; per-event scores alone do not prove a coherent Presence over time.

## Latest unseen-world validation

After the model-native restraint and bounded-replan correction, GPT 5.6 Luna Low was rerun on the lower-scoring longitudinal world and on three newly generated 20-event worlds. The independent GPT 5.6 Luna Medium judge scored act selection and wording separately:

| Run | Act appropriateness | Wording quality | Events | Structural |
|---|---:|---:|---:|---:|
| Longitudinal world 2 final rerun | 99.0% | 100.0% | 100 | 100% |
| Fresh world 1 final rerun | 100.0% | 100.0% | 20 | 100% |
| Fresh world 2 final rerun | 100.0% | 100.0% | 20 | 100% |
| Fresh world 3 final rerun | 95.0% | 100.0% | 20 | 100% |

Every final rerun used GPT 5.6 Luna with `reasoning_effort: low`; all six interaction affordances remained Auto; `asset.inspect` provenance and truthful execution were preserved; no known deterministic social-response marker appeared; and the editor did not override the planner act. The remaining fresh-world disagreements were low-stakes planning choices between a `LIKE` and `NO_OP` on self-contained jokes. They are useful restraint signals, not evidence for adding a rule that forces either action.

This is a meaningful generalization result, but the experiment is still too small and too development-oriented for a parity claim. The next comparison must use the frozen 130-case stratified set, three repeated sessions per configuration, a sealed 50–60-case paraphrased holdout, three fresh worlds, three longitudinal worlds, and blinded human agreement. The comparison remains:

`Qwen historical baseline → GLM 5.2 → GPT 5.6 Luna Low`

Only GLM 5.2 and GPT 5.6 Luna are approved for new message experiments. The historical Qwen row is not a current product recommendation and is not being reintroduced.

## Additional validation evidence

The latest three-session GPT 5.6 Luna Low replay of the 48-case visible-feed development capture produced 144 repeated packets: 96.875% act appropriateness, 96.667% wording quality, and 100% structural validity. The independent restraint replay produced 99.074% act appropriateness and 92.857% wording across 54 packets, also with 100% structural validity. These are development/stability results, not frozen-benchmark results.

An operationally sealed 60-case paraphrased holdout was then scored aggregate-only. GPT Luna Low achieved 99.167% act appropriateness and 100% wording, with Auto mode, truthful execution, and the required provenance checks intact. The holdout is hash-verified, but because it is stored in the local worktree it is an operational separation rather than a cryptographically inaccessible secret; no individual outcomes were used for product tuning.

The third longitudinal world added 62 events and nine recurring actors. It scored 98.387% act appropriateness and 100% wording. All three longitudinal worlds now exist, but the final coherence gate still requires blinded human review and a frozen 130-case benchmark.

The latest general development check covered short sincere questions, ambiguous attendance requests, self-contained technical caveats, current-event discovery, and closed humor across three sessions. It scored 95.833% act appropriateness and 90.0% wording with 100% structural validity. The remaining act misses were truthful limitations on current-event discovery where the sandbox directory has no event source. This confirms that adding a real authorized search connector would address a tool-capability gap; adding a phrase-specific reply rule would violate the intelligence requirement.

The same 48-case replay was also run once with GLM 5.2 after the guidance change. It scored 97.917% act appropriateness and 70.0% wording, with 100% structural validity. GPT Luna Low's repeated three-session result on the same fixture was 96.875% act and 96.667% wording. This is a controlled directional comparison, not the final frozen model ranking, because the GLM result is one session while GPT's result is repeated stability evidence.

The post-guidance GPT Luna Low regression replay scored 98.958% act appropriateness and 100% wording. The sealed holdout was rerun aggregate-only at 98.333% act and 100% wording, and each of the three fresh 20-event worlds reran at 100% act and 100% wording. All post-guidance validation artifacts passed the structural checks. These results support generalization of the planner correction, but the final frozen 130-case benchmark and human calibration remain outstanding.
