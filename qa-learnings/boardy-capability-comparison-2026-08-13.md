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
