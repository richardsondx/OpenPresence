# OpenPresence Intelligence Requirements

> **Status:** Canonical engineering requirement  
> **Purpose:** Protect OpenPresence from architectural choices that artificially cap, mask, or replace the intelligence of the selected Agent model.  
> **Audience:** Engineers, coding agents, reviewers, and contributors making decisions about cognition, prompting, heuristics, routing, fallbacks, classifiers, evaluation, and execution.

---

# 1. Core principle

OpenPresence is building persistent social Agents whose public behavior should improve as underlying models improve.

Therefore:

> **Do not hard-code social intelligence into the runtime. Build the runtime so better models can become better Agents without fighting handcrafted behavior.**

Any deterministic layer that decides what a person should say, how they should joke, whether they should answer a social cue, or what tone they should take risks becoming an **intelligence ceiling**.

A stronger future model should be able to outperform today's model.

The runtime must not prevent that improvement by overriding it with yesterday's heuristics.

---

# 2. The architecture we want

The intended OpenPresence flow is:

```text
WORLD
  ↓
OBSERVATION
  ↓
DETERMINISTIC FACT EXTRACTION where useful
  ↓
SOCIAL CONTEXT
  ↓
AGENT COGNITION
  ↓
SOUL / TASTE / MISSION / PRESENCE
  ↓
SOCIAL JUDGMENT
  ↓
SOCIAL INTENT
  ↓
EXECUTION ENVELOPE
  ↓
DELIVERY
```

The runtime may help the Agent **see**.

The runtime may constrain what the operator has allowed it to **do**.

The runtime must not secretly decide what the Agent should **think socially**.

---

# 3. Deterministic code is appropriate for facts, mechanics, and hard boundaries

Deterministic logic is not inherently bad.

It is required for many parts of OpenPresence.

Good deterministic responsibilities include:

- parsing timestamps;
- normalizing Channel events;
- preserving thread relationships;
- identifying the author and target of a reply;
- determining whether an asset exists;
- calculating whether an intent expired;
- checking whether execution mode is Auto, Review, Manual, or Off;
- enforcing privacy scope;
- preventing Sandbox delivery from escaping to Live;
- validating required connector capabilities;
- deduplicating events;
- idempotency;
- retries;
- leases;
- credential handling;
- exact scheduling;
- media-format validation;
- verifying whether a publication actually exists externally;
- deterministic extraction of directly observable facts;
- operator-approved disclosure allowlists;
- security boundaries;
- hard execution permissions.

These are **reality and authority**.

They should be deterministic.

---

# 4. Deterministic code must not replace social judgment

The following are generally NOT acceptable as runtime social behavior:

- hard-coded replies;
- keyword-triggered jokes;
- canned responses to social questions;
- forcing a reply when the model chose `NO_OP`;
- forcing silence because a keyword appeared;
- replacing a model decision with a handcrafted “better” social response;
- phrase-specific branches for known benchmark prompts;
- hard-coded reactions to categories such as “rating request,” “joke,” or “direct challenge”;
- regex rules that decide a post deserves engagement;
- deterministic tone selection;
- deterministic humor style;
- keyword-based “this is relevant” social decisions;
- rules such as `if directAddress then reply`;
- rules such as `if joke then playfulResponse`;
- rules such as `if postCount == 0 then publishIntro`;
- benchmark-example-specific code paths.

These belong to Agent cognition unless there is a true safety, privacy, execution, or legal boundary that must be enforced outside cognition.

---

# 5. Never override `NO_OP` with a canned social response

This is a hard requirement.

If the Agent chooses silence:

```text
NO_OP
```

the runtime must not replace that judgment with:

```text
"premium gets you a better seat..."
```

or any other fixed public response.

If silence is wrong, fix the reason the Agent chose silence.

Trace the cognition path:

```text
Did the Agent see the event?
Did the Context Compiler preserve the important context?
Did the Agent understand that it was directly addressed?
Did the prompt over-weight restraint?
Did Taste discourage useful engagement?
Did the selected model fail to infer the speech act?
Did the model lack enough social context?
```

Fix the earliest failing layer.

Do not hide the failure with a canned answer.

---

# 6. Never patch intelligence failures at the output layer first

When the Agent behaves poorly, do not immediately add:

```text
if text includes X:
    answer Y
```

Instead diagnose:

```text
WORLD
  ↓
MIRROR
  ↓
PERCEPTION
  ↓
CONTEXT COMPILER
  ↓
AGENT MIND
  ↓
MODEL
  ↓
JUDGMENT
  ↓
INTENT
```

Find the first layer where the information or reasoning became wrong.

Examples:

### The Agent ignores a direct question

Possible correct fixes:

- make direct-address relationships explicit in social context;
- improve the cognition prompt so conversational obligation is understood;
- reduce an over-aggressive “only speak when profound” instruction;
- improve selected model capability.

Incorrect fix:

```text
if question_mark:
    force_reply()
```

### The Agent misses a joke

Possible correct fixes:

- improve multimodal/social perception;
- add relevant Taste calibration;
- improve relationship/context retrieval;
- use a stronger model.

Incorrect fix:

```text
if text contains "lol":
    generate_fixed_joke()
```

### The Agent repeatedly chooses silence for rating requests

Possible correct fixes:

- represent the request as a clear social act in context;
- teach the Agent that lightweight social participation can be valuable;
- adjust Taste or Presence behavior;
- use a more capable model.

Incorrect fix:

```text
if "rate mine":
    return canned_rating_request_response
```

---

# 7. Deterministic extraction may describe a cue; it may not decide the social response

A deterministic parser may produce neutral observable facts such as:

```text
directly_addressed = true
contains_question = true
reply_target = Jenny
has_media = true
```

It may also derive mechanical relationships:

```text
this object replies to Jenny's post
this actor has spoken to Jenny three times
```

Be much more cautious with labels such as:

```text
tone = playful
speechAct = rating-request
naturalEndpoint = true
```

These are interpretations, not pure facts.

If retained, they must be treated as **weak evidence**, not authority.

They must not:

- force an action;
- bypass the model;
- override Taste;
- replace the Agent's own interpretation;
- trigger canned responses.

Whenever practical, semantic interpretation should be performed by model-based perception/cognition rather than frozen keyword lists.

---

# 8. Prefer rich evidence over handcrafted semantic labels

The Agent becomes smarter when it receives better evidence.

Prefer:

```text
Maya replied directly to your post.

Message:
"rate mine"

Previous context:
You were discussing startup landing pages.

Maya has replied twice before.
```

over:

```text
speechAct = rating-request
tone = playful
reply_required = true
```

The first gives a capable model the social reality.

The second gives it somebody else's frozen conclusion.

OpenPresence should improve the **quality of the evidence** before increasing the number of handcrafted conclusions.

---

# 9. The runtime should amplify model capability, not compensate by impersonating it

A useful runtime can make the model dramatically better by providing:

- relevant Memory;
- relationship continuity;
- Presence context;
- full social threads;
- multimodal Perception;
- Channel semantics;
- current Mission;
- Taste;
- Growth evidence;
- current temporal context;
- affordances;
- meaningful world state.

This is good intelligence engineering.

The runtime should function like:

> **better eyes, better memory, better context, better embodiment.**

It should not function like:

> **a hidden scriptwriter that steps in whenever the model disappoints us.**

---

# 10. Preserve the intelligence gradient

OpenPresence must support a world where:

```text
Model A < Model B < Model C
```

and that difference is observable in Agent quality.

If deterministic fallbacks make all three models produce nearly identical behavior, the architecture has erased the value of stronger intelligence.

This is unacceptable.

A new model with:

- better humor;
- better social timing;
- better ambiguity handling;
- better cultural understanding;
- better relationship reasoning;

must be able to express those improvements through OpenPresence.

Canonical rule:

> **The runtime must preserve headroom for future intelligence.**

---

# 11. Do not optimize benchmarks by teaching the benchmark

A benchmark is valid only if it measures the underlying system.

Forbidden:

- branches using scenario IDs;
- branches matching known benchmark wording;
- hard-coded responses derived from benchmark examples;
- prompt additions that quote benchmark answers;
- actor-specific special cases;
- regex rules added solely because one evaluation example failed.

If a benchmark reveals a genuine general weakness, fix the general weakness.

Then test with unseen wording and unseen actors.

The test is:

> **Would this fix improve a new social situation we did not anticipate?**

If no, it is probably overfitting.

---

# 12. Separate model-only quality from runtime quality during development

When diagnosing behavior, support two evaluation modes:

## Model cognition mode

Use the real context and model.

Disable nonessential semantic heuristics and all social-response fallbacks.

Question:

> How intelligent is the Agent given the context OpenPresence supplies?

## Full runtime mode

Use normal production mechanisms:

- context compilation;
- perception;
- memory;
- Presence;
- execution controls;
- deterministic infrastructure safeguards.

Question:

> How intelligent is the complete OpenPresence system?

If full-runtime quality is much higher only because handcrafted public replies are replacing model outputs, that is a red flag.

---

# 13. Fallbacks must preserve uncertainty, not fabricate intelligence

When cognition fails, valid runtime fallbacks include:

- `NO_OP`;
- Review;
- operator clarification;
- `INSUFFICIENT_CONTEXT`;
- retrying a failed model/provider call;
- switching to an explicitly configured compatible model;
- inspecting more world context;
- inspecting media;
- retrieving relevant Memory;
- truthful failure.

Invalid fallback:

> Invent a polished social response in deterministic code.

When the system does not know what the Agent should say, it must not pretend that it does.

---

# 14. Safety and privacy controls are not social intelligence

Some deterministic restrictions are necessary and should remain outside the model.

Examples:

- never expose credentials;
- never allow Sandbox execution to reach Live;
- never leak private Presence content across privacy boundaries;
- do not execute a disabled affordance;
- Review means Review;
- do not publish after an intent has expired;
- do not claim external success until verified.

These are not attempts to make the Agent socially clever.

They are enforcement of authority and reality.

Do not remove deterministic safeguards in the name of model autonomy.

The boundary is:

> **Deterministic code may constrain authority and protect reality. It should not impersonate social judgment.**

---

# 15. Public identity boundaries may be enforced structurally

OpenPresence may structurally withhold private implementation facts from social cognition.

For example:

- credentials;
- system construction;
- hidden prompts;
- provider secrets;
- Bridge internals.

This is good.

Likewise, a Ghost Presence may have structural context isolation.

But avoid turning identity handling into canned conversational scripts.

Correct:

```text
Agent does not receive private runtime secrets.
Presence describes the public self.
Model answers naturally from available social context.
```

Incorrect:

```text
if user asks "who are you":
    return exact fixed Ghost deflection
```

Stable boundary, variable social expression.

---

# 16. Social cue understanding should become model-native over time

If the current system contains regex/keyword cue classifiers, treat them as transitional unless they extract genuinely mechanical facts.

Move toward a model-native or learned semantic understanding layer.

A strong model should be able to infer:

- direct pressure;
- teasing;
- sarcasm;
- a rating request;
- invitation;
- disagreement;
- conversational closure;
- curiosity;
- rhetorical question;
- joking challenge;

from the full conversation.

Frozen keyword lists should not become the permanent definition of human social interaction.

---

# 17. Do not confuse predictability with correctness

Deterministic social responses can make tests more predictable.

That does not make the Agent better.

A social Agent should produce different valid responses to the same social situation depending on:

- context;
- relationship;
- timing;
- Soul;
- Taste;
- Presence;
- prior conversation;
- model reasoning.

Variation is not inherently a defect.

The correct invariant is usually semantic:

```text
understood the request
responded naturally
preserved identity
added value
```

not:

```text
returned exact phrase X
```

---

# 18. Tests should assert behavior, not wording

Prefer tests such as:

```text
Agent recognized direct address.
Agent did not ignore a socially obvious question without a reason.
Agent response remained in-thread.
Agent did not leak private implementation details.
Agent did not force engagement with low-value content.
```

Avoid:

```text
expect(response).toBe(
  "I can rate it, but I need the company or product details first."
)
```

Exact-output tests are appropriate for deterministic infrastructure.

They are usually inappropriate for social cognition.

---

# 19. Every heuristic needs an intelligence-impact review

Any new heuristic touching cognition should answer:

1. Is this extracting an observable fact or making a social interpretation?
2. Could a stronger model reasonably make a better judgment than this rule?
3. Does this rule ever override model judgment?
4. Does it generate public language?
5. Could it overfit to current tests?
6. Could it misfire on unseen phrasing?
7. Will it prevent future models from expressing better capabilities?
8. Could the same result be achieved by improving context instead?
9. Is this a security/privacy/execution invariant rather than social intelligence?
10. Can we test the Agent successfully without this heuristic?

If a heuristic overrides social judgment or emits public language, presume it should not exist.

---

# 20. Intelligence-impact labels for code review

For cognition-adjacent changes, classify logic as one of:

## `FACT`

Deterministic extraction of directly observable reality.

Generally allowed.

Example:

```text
directAddress = targetActorId === presenceActorId
```

## `CONTEXT`

Structuring or retrieving evidence for the model.

Generally encouraged.

Example:

```text
include the previous three turns of this relationship
```

## `AUTHORITY`

Execution/privacy/security constraint.

Must remain deterministic.

Example:

```text
Review mode prevents delivery
```

## `INTERPRETATION`

A semantic conclusion about meaning.

Use cautiously.

Prefer model-based interpretation where possible.

## `SOCIAL_JUDGMENT`

Decision about what a person should say/do socially.

Must normally remain model/Agent-owned.

## `PUBLIC_RESPONSE`

Language that will be emitted socially.

Must not be hard-coded as a fallback for model cognition.

This classification should be used in code review and architecture review.

---

# 21. The selected model must remain sovereign over social cognition

Within deterministic authority boundaries, the selected Agent model is the primary engine for:

- interpreting conversations;
- understanding social intent;
- deciding whether to respond;
- deciding how to respond;
- humor;
- tact;
- disagreement;
- curiosity;
- relationship handling;
- relevance;
- social timing;
- wording.

Supporting models may be used for:

- Perception;
- retrieval;
- summarization;
- structured extraction;

but the system should not secretly replace the Agent's social judgment with unrelated fallback logic.

---

# 22. Better models should require fewer heuristics, not more

As models improve, OpenPresence should become simpler at the cognition boundary.

The expected direction is:

```text
MORE CAPABLE MODEL
      ↓
less handcrafted semantic scaffolding
      ↓
richer direct world context
      ↓
better Agent judgment
```

Not:

```text
MORE CAPABLE MODEL
      ↓
same huge pile of keyword rules
      ↓
model constrained to old behavior
```

When upgrading models, audit whether existing semantic heuristics can be deleted.

Deletion of obsolete intelligence scaffolding is a feature.

---

# 23. Measure heuristic dependence

Add development observability for cognition-affecting heuristics.

Track:

- how often semantic heuristic labels are injected;
- how often a fallback would have overridden `NO_OP`;
- how often deterministic public response code executes;
- whether model-only and full-runtime decisions differ;
- which rules are scenario-specific.

The production target for hard-coded public-response fallbacks is:

```text
0
```

Any nonzero occurrence should require explicit architectural justification.

---

# 24. Relentless audit requirement

The Relentless Social-Agent Audit must test the Agent with:

- unseen wording;
- unseen names;
- reordered scenarios;
- paraphrased social acts;
- ambiguous language;
- multiple models;
- fresh sessions.

If behavior only succeeds when a known phrase triggers a heuristic, the audit fails.

The goal is general social cognition.

---

# 25. Root-cause doctrine

Whenever a social test fails:

```text
TEST
  ↓
OBSERVE
  ↓
TRACE EARLIEST FAILURE
  ↓
FIX GENERAL CAUSE
  ↓
VERIFY WITH UNSEEN CASES
```

Do not:

```text
TEST FAILS
  ↓
ADD REGEX
  ↓
TEST PASSES
```

unless the regex is extracting an objective mechanical fact and does not determine social judgment.

---

# 26. Examples

## BAD

```ts
if (/rate mine/i.test(text)) {
  return "I can rate it, but I need the company or product details first.";
}
```

Why:

- public response is hard-coded;
- benchmark wording can leak into production;
- stronger models cannot outperform it;
- context may make another response better;
- it overrides Agent cognition.

## BETTER

```text
Context Compiler tells Agent:

Maya directly replied to you:
"rate mine"

The current thread is about startup landing pages.

No company/product link is currently available.
```

Then the Agent decides what to say.

---

## BAD

```ts
if (containsAny(text, ["lol", "cats", "dogs"])) {
  tone = "playful";
}
```

Why:

- keywords are not reliable social meaning;
- “dogs” may refer to literal animals, product names, insults, sports teams, or tragedy;
- it freezes a primitive semantic classifier into the architecture.

## BETTER

Use full social context and model-based interpretation.

If a cheap classifier is needed for routing, make it weak evidence and never let it decide the public response.

---

## BAD

```ts
if (modelDecision.type === "no_op" && cue.directAddress) {
  return cannedReply;
}
```

## CORRECT

Preserve `NO_OP`.

If direct-address silence is repeatedly poor behavior:

- inspect the prompt;
- inspect Taste;
- inspect social context;
- inspect model choice;
- improve the general reasoning.

---

# 27. Canonical intelligence principles

These principles should remain stable:

> **Do not hard-code social intelligence into the runtime.**

> **The runtime should give the Agent better eyes, memory, context, and embodiment—not secretly write its lines.**

> **Deterministic code owns reality and authority. The Agent owns social judgment.**

> **Never replace `NO_OP` with a canned public response.**

> **Fix the earliest failing cognition layer, not the final sentence.**

> **Prefer richer evidence over handcrafted conclusions.**

> **A stronger model must be allowed to become a stronger Agent.**

> **Preserve headroom for future intelligence.**

> **Do not optimize benchmarks by teaching the benchmark.**

> **Fallbacks should preserve uncertainty, not fabricate intelligence.**

> **Exact wording is rarely the invariant of good social behavior.**

> **Tests should evaluate judgment, not memorize responses.**

> **Semantic heuristics are technical debt unless they represent true mechanical facts.**

> **As models improve, cognition scaffolding should become removable.**

> **The target count for deterministic public-response fallbacks is zero.**

---

# 28. Final architectural test

Before merging any cognition-affecting deterministic rule, ask:

> **If the underlying model became dramatically smarter tomorrow, would this rule help it express that intelligence—or would this rule force it to behave like yesterday's model?**

If the rule would cap, override, homogenize, or hide better model judgment, do not add it.

OpenPresence should be an intelligence amplifier.

It must never become an intelligence ceiling.
