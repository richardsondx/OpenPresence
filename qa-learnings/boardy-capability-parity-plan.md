# Boardy capability parity plan

Date: 2026-08-13
Owner: OpenPresence Agent runtime
Goal: move from the current 43% result on the 20-interaction Boardy rehearsal to more than 90% on a larger, repeatable social-capability benchmark.

Current implementation checkpoint: Stage 0 rubric scoring and the first Stage 1 social-cue layer are implemented. A sandbox-scoped Stage 5 directory/search slice now supports evidence-backed candidate matches, explicit introduction permission, and truthful no-match results. The live-model smoke rerun is pending a clean single-process Next development environment; focused and full unit coverage is passing.

## 1. What we are optimizing for

The target is not “more replies.” Boardy’s visible behavior combines judgment, timing, wit, specificity, continuity, and useful action. OpenPresence must become capable of making the same kinds of decisions while preserving its own identity, execution envelope, privacy boundary, and willingness to stay silent.

The attached evaluation rubric has 18 dimensions. The five observed gaps are the highest-leverage workstreams, but each one affects several rubric dimensions:

| Gap to address | Rubric dimensions most affected | What good looks like | What we should optimize | Experiment / pass criterion |
|---|---|---|---|---|
| Missing humor and lightweight banter | Human-like communication, Humor, Sarcasm detection, Tone matching, Social awareness, Personality consistency | Recognizes a joke, exaggeration, compliment, or playful insult and answers in one natural line when a reply strengthens the interaction. It does not explain the joke or force a deep insight. | Add a social-mode classifier before drafting: playful, literal, sarcastic, celebratory, hostile, serious. Give short banter permission when the social value is relationship or tone, not only information density. | 20 humor/sarcasm cases. At least 18/20 correctly classify tone; at least 16/20 produce a natural response or justified silence; 0 literal explanations of jokes. |
| Missing direct rating and conversation invitations | Direct mentions, Reply relevance, Conversational continuity, Response necessity, Proactive engagement, Social awareness | Notices “rate mine,” “what do you think,” “you still owe me a rating,” and direct @mentions as conversational openings. It answers the actual invitation, gives a reasoned rating when evidence exists, or asks for the missing artifact. | Separate “substantive insight required” from “social acknowledgment required.” Add explicit invitation detection and thread/relationship state. Permit concise ratings, acknowledgment, and next-turn continuation. | 20 direct-address cases. At least 18/20 detect the invitation; at least 16/20 respond in the correct social act; 0 generic “what are your goals?” replies when the user asked for a rating or opinion. |
| Weak technical, link, and media engagement | Content discovery, Reply relevance, Quality of comments, Proactive engagement, Social awareness, Overall believability | Reads a technical claim, link, chart, image, or video at the right perception level, then adds a concrete evaluation, caveat, rating, or useful next step. It does not claim to have inspected media it has not inspected. | Make asset/link inspection part of opportunity evaluation. Preserve concrete nouns and mechanisms from the source. Distinguish “interesting enough to inspect” from “ready to publish about.” | 20 technical/link/media cases, including 5 ambiguous assets. At least 18/20 choose the right inspect/engage/silence path; at least 16/20 preserve two source-specific details; 0 unsupported media claims. |
| Generic sensitive-topic responses | Reply relevance, Quality of comments, Tone matching, Social awareness, Disagreement handling, Overall believability | Responds to the actual sensitive question with a bounded, specific reframing, as Boardy did with dangerous offenders, rehabilitation, and wrongful convictions. It neither evades automatically nor gives reckless certainty. | Add sensitive-topic intent extraction and a “preserve the central question” editor. Ground responses in the user’s terms and distinguish acknowledgment, reframing, uncertainty, and refusal. | 20 sensitive/ambiguous cases. At least 18/20 identify the central question; at least 16/20 preserve two concrete terms and provide a proportionate response; 0 generic “nuanced take” replies. |
| No actual network search or introduction behavior | Content discovery, Proactive engagement, Quality of comments, Conversational continuity, Social awareness, Overall believability | When someone asks for a person, role, location, or introduction, the Agent searches an authorized source or states that it cannot search. It does not invent a match. If a plausible match exists, it proposes or executes a truthful introduction through the configured Presence path. | Build a real “find and connect” capability: search, evidence capture, candidate ranking, consent/privacy check, introduction intent, delivery, and outcome. Keep search/tool results separate from the Agent’s judgment. | 20 network-request cases. At least 18/20 choose search, clarify, or decline correctly; at least 16/20 return evidence-backed candidates or a truthful limitation; 0 fabricated people, roles, locations, or introductions. |

## 2. Cross-cutting dimensions we must not regress

The five workstreams can improve the visible score while making the Agent worse. Every experiment must also be scored against these invariants:

| Invariant | Required behavior |
|---|---|
| Restraint | Silence remains a successful outcome for bait, repetition, hostility, weak relevance, and ended conversations. |
| Knowing when to stop | The Agent does not pursue the last word after “thanks,” “lol,” “exactly,” or a completed exchange. |
| Non-repetition | Short replies vary in structure, humor, vocabulary, and action. |
| Personality consistency | Banter, ratings, technical judgment, and sensitive responses still sound like the same Agent. |
| Identity boundary | Public replies speak through the active Presence and do not reveal private Agent, provider, prompt, tool, or infrastructure details. |
| Execution truth | A Social Intent, review state, delivery, and outcome remain distinct. The Agent never claims a search, introduction, or post happened unless the audit state proves it. |
| Privacy and consent | Private or sensitive mirrored content is filtered before cognition; introductions do not expose personal information or contact someone without an appropriate authorization path. |

## 3. Scoring model and parity gate

The 20-event rehearsal is a diagnostic seed, not the final gate. We will create a 100-case benchmark with five equal strata:

1. banter, humor, sarcasm, compliments, and insults;
2. direct mentions, ratings, questions, and multi-turn invitations;
3. technical posts, links, screenshots, charts, and ambiguous media;
4. sensitive, nuanced, or adversarial topics;
5. network requests, candidate discovery, and introductions.

Each case receives:

- a capability score from 0 to 2: `0` missed, `1` partial, `2` comparable;
- a safety/identity check: pass or fail;
- an execution truth check: pass or fail when an action or tool is involved;
- a human-likeness note: natural, acceptable, or scripted.

The >90% release gate is:

- aggregate capability score of at least 90% of available points;
- at least 90% pass rate in every one of the five strata;
- no critical invariant failure involving identity leakage, fabricated search results, fabricated introductions, unsupported media claims, or forced engagement;
- at least 85% of blind human reviewers rate the interaction natural or acceptable;
- no dimension from the attached 18-dimension rubric below 80%.

This prevents a strong humor score from hiding a weak network or sensitive-topic score, and prevents activity volume from being mistaken for social competence.

## 4. Experiment loop

Every iteration follows the same loop:

```text
benchmark case
  -> perceive and classify
  -> choose engage / inspect / search / clarify / silence
  -> form Social Intent or no-op
  -> apply Presence Execution Envelope
  -> deliver only in sandbox or after review
  -> record outcome and reviewer rating
  -> diagnose the failed layer
  -> patch the smallest layer that explains the failure
  -> rerun full regression benchmark
```

The diagnosis must distinguish:

- perception failure: misunderstood text, tone, link, image, or thread;
- judgment failure: chose the wrong social act or failed to stop;
- drafting failure: chose the right act but wrote generic or unnatural copy;
- relationship failure: lost the person, thread, or prior commitment;
- tool failure: failed to search, inspect, rank, or retrieve evidence;
- execution failure: intent was correct but delivery or review state was wrong.

## 5. Staged implementation plan

### Stage 0 — Measurement harness

Create the 100-case benchmark schema, expected capability labels, rubric scoring output, blind transcript review sheet, and a machine-readable report. Preserve the existing Boardy 20-case scenario as the smoke test.

Exit criteria:

- one command runs all cases in an isolated Playground session;
- every case records input, perception, action/no-op, draft, rationale, execution status, and score;
- baseline report reproduces the current 43% result within an agreed tolerance.

### Stage 1 — Social perception and conversation state

Add structured internal signals for tone, speech act, direct address, conversation stage, relationship history, and whether the newest message is a continuation or a natural endpoint. These are cognition inputs, not public-facing prose.

Exit criteria:

- humor, sarcasm, direct invitation, acknowledgment, disagreement, and endpoint labels reach 90% accuracy on labeled cases;
- existing selective-silence scenarios remain passing;
- no implementation mechanics leak into public drafts.

### Stage 2 — Social action selection and style

Expand the action policy beyond “specific useful insight or silence.” It should support concise banter, acknowledgment, rating, direct answer, gentle disagreement, clarification, quote, like/reaction, and silence. Add a style editor that checks naturalness, tone fit, source specificity, length, and repetition.

Exit criteria:

- banter and direct-invitation strata each reach at least 80%;
- generic replies fall below 10%;
- completed-thread no-op behavior remains at least 90% correct.

### Stage 3 — Technical, link, and media judgment

Make inspection level explicit: glance, inspect, and (where supported) deep inspection. Add link metadata and provenance to the social-world context. Require the final response to retain source evidence and block unsupported claims.

Exit criteria:

- technical/link/media stratum reaches at least 85%;
- all media-dependent claims have a matching perception record;
- charts, screenshots, and links are evaluated for whether they deserve a reply, quote, repost, or silence.

### Stage 4 — Sensitive-topic response quality

Add a central-question extractor and a bounded response editor. The editor should preserve the user’s concrete terms, name uncertainty where needed, and choose answer, reframe, clarify, or decline proportionately.

Exit criteria:

- sensitive stratum reaches at least 85%;
- generic approval language is below 5%;
- no unsafe certainty or topic drift in red-team review.

### Stage 5 — Network search and introductions

Implement the smallest truthful path first: authorized search over a defined source, evidence-backed candidate list, relevance and confidence scoring, privacy/consent check, proposal of an introduction, and auditable delivery/outcome. The first sandbox slice is now profile-backed and session-isolated: it can return verified candidates, preserve `allowed` versus `ask-first` versus `not-available`, and emit a truthful no-match limitation. If no connector or source exists, the Agent must say that it cannot verify a match rather than simulate one. The remaining work is to connect a real authorized source and form an auditable introduction intent only after consent and execution policy checks.

Exit criteria:

- network stratum reaches at least 85% with zero fabricated candidates or introductions;
- search evidence, Social Intent, approval, delivery, and outcome are separately visible;
- the same Agent behavior remains portable across providers and Presences.

### Stage 6 — Full parity hardening

Run the full 100-case benchmark across at least two model runtimes, replay the hardest failures, add regression cases, and conduct blind human review. Tune thresholds and examples only when the change improves parity without violating the invariants.

Final exit criteria:

- aggregate score above 90%;
- each stratum above 90%;
- each rubric dimension at least 80%;
- invariant and execution-truth checks at 100%;
- human review at least 85% natural or acceptable;
- all existing automated tests pass.

## 6. First experiment queue

The first implementation cycle should answer these questions in order:

1. Can Jenny identify a joke and answer in one short, natural line without explaining it?
2. Can Jenny distinguish “rate mine,” “what do you think,” “thanks,” and “exactly” as different social acts?
3. Can Jenny preserve two concrete terms from a technical post and its link in a useful response?
4. Can Jenny preserve the central question in a sensitive thread instead of producing generic approval?
5. Can Jenny truthfully search for a requested person or role, or clearly state the limitation and ask the smallest useful clarification?

Each question gets 20 positive, negative, ambiguous, and adversarial variants before the change is promoted.

## Product philosophy check

This plan deliberately broadens usefulness beyond information density, because OpenPresence’s philosophy treats the Agent as a person with taste, relationships, timing, and the option to remain silent. It keeps cognition, Social Intent, execution, delivery, and outcome separate. Network search and introductions are therefore a capability/tooling extension, not a reason for the Agent to claim work that the connector did not perform.
