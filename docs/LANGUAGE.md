# LANGUAGE
## OpenPresence Language & Expression Decision Reference

**Purpose:** Stable contributor reference for language, phrasing, lexical constraints, style guidance, and expression validation.

**Important:** This file is **not an Agent mind file** and must not be injected into Agent cognition.

---

# 1. Why this document exists

Language behavior is easy to scatter across:

- `BRAIN.md`;
- `SOUL.md`;
- `TASTE.md`;
- `PRESENCE.md`;
- Public Self;
- hidden prompts;
- validation code;
- preference evidence;
- execution rules.

This document exists to keep those responsibilities distinct.

When a new request involving language appears, contributors should use this file to decide which layer owns it.

---

# 2. Canonical distinction

OpenPresence separates:

```text
JUDGMENT
What language feels right?

from

AUTHORITY
What literal language is explicitly forbidden?
```

Canonical principle:

> **Taste guides expression. Authority defines hard constraints.**

---

# 3. The language stack

```text
SOUL
Character and temperament.

TASTE
Aesthetic/social judgment.
What sounds good, cheap, generic, funny, sharp, awkward, overdone, etc.

PRESENCE
Role-specific social context.
What language fits this person here?

PUBLIC SELF
How this Presence describes/discloses itself publicly.

PRESENCE · PRIMARY LANGUAGE
The one language this Presence uses for Agent-authored expression.

LANGUAGE · AVOID
Exact language the Agent should normally steer away from.

LANGUAGE · NEVER USE
Exact language the operator explicitly prohibits in Agent-generated outbound text.

SEMANTIC BOUNDARIES
Meaning-level restrictions that cannot honestly be enforced as literal matching.

PUBLICATION VALIDATOR
Deterministic enforcement of hard output constraints before delivery.
```

Do not collapse these layers.

The Presence primary language is a scoped expression setting, separate from
lexical Avoid/Never use rules. Inbound social content remains world evidence
in its original form; selecting English means the Agent-authored post, reply,
message, and Presence Chat response stay in English rather than matching the
language of the inbound post. For targeted social interactions, the runtime
also requires confirmed observed language metadata on the target and blocks
delivery unless it matches the Presence language. Missing or unknown target
language is conservatively left alone. V1 exposes English only while the
runtime is being prepared for additional languages.

---

# 4. Avoid

`Avoid` means:

> The Agent should generally steer away from this normalized literal.

Examples:

```text
game-changer
unlock
Great question
—
```

Avoid is guidance.

It is supplied to expression cognition.

It does not independently fail delivery.

Structured storage exists so exact recurring preferences are:

- inspectable;
- editable;
- inheritable;
- portable;
- easy to configure through Teach;
- usable by future preference-evidence proposals.

Avoid does not mean guaranteed absence.

---

# 5. Never use

`Never use` means:

> OpenPresence must not deliver Agent-generated outbound text containing this normalized literal unless an authorized operator explicitly overrides a direct action.

Examples:

```text
guaranteed
Great question
—
```

The model sees the rule before drafting.

Deterministic code validates it after drafting and again before final delivery.

Canonical principle:

> **The model owns the sentence. Deterministic code owns whether an explicit lexical constraint was satisfied.**

---

# 6. Literal, not semantic

V1 uses normalized literal matching.

No:

- regex;
- semantic variants;
- synonyms;
- inferred inflections;
- embeddings;
- fuzzy matching;
- category dictionaries.

Example:

> Never make guaranteed financial-return claims.

is semantic.

It must NOT automatically become:

```text
Never use “guaranteed”
```

because:

```text
“Nobody can guarantee investment returns.”
```

may be valid.

Canonical rule:

> **LanguagePolicy must never claim a semantic guarantee it cannot deterministically enforce.**

---

# 7. V1 matching semantics

Language entries are normalized literals.

At minimum:

- Unicode NFKC;
- Unicode-aware case folding;
- normalized line endings;
- collapsed whitespace for phrase comparison;
- lexical boundary protection for alphanumeric literals;
- exact normalized character matching for punctuation-only literals.

Example:

```text
Never use:
ass
```

must not match:

```text
class
```

Example:

```text
Never use:
Great question
```

should match normalized variants such as:

```text
great question
GREAT QUESTION
Great   question
```

Punctuation families are not automatically equivalent.

If the rule is:

```text
—
```

do not assume it also means:

```text
-
–
```

unless product semantics explicitly change.

Any matching-semantic change requires updating this file and its tests.

---

# 8. Agent vs Presence

Language policy exists at:

```text
Agent
Presence
```

Effective policy:

```text
Agent + Presence additions
```

V1 decision:

> **Presence can add only.**

A Presence cannot disable or weaken Agent language rules.

This keeps the mental model:

> The person has rules. The role may become stricter.

If exceptions are later required, design them explicitly rather than introducing hidden override semantics.

---

# 9. Why Presence language exists

The same Agent can inhabit different social roles.

Example:

```text
Jenny · X
```

may use language that does not belong on:

```text
Richardson · LinkedIn · Ghost
```

This follows:

> **The Agent is a person. A Presence is a role that person inhabits in a particular social world.**

One brain does not imply one expression boundary.

---

# 10. Ghost

Ghost increases representation consequences.

Operator feedback such as:

> I would never say this.

is high-salience Presence evidence.

It may lead to:

- Presence guidance;
- an Avoid proposal;
- a Never use rule when the operator explicitly wants lexical enforcement.

It still does not silently rewrite protected identity.

---

# 11. Planner vs Expression vs Validator

Canonical pipeline:

```text
SOCIAL PLANNER
chooses the social act
        ↓
EXPRESSION
chooses the wording
        ↓
PUBLICATION VALIDATOR
checks deterministic constraints
        ↓
EXECUTION / DELIVERY
```

The Social Planner is NOT Schedule.

It is model-driven social judgment.

Language constraints primarily concern Expression + validation.

A first-draft lexical violation should not change:

```text
REPLY
```

into:

```text
NO_OP
```

The act remains valid; the wording is repaired.

---

# 12. Intent vs execution

This distinction is mandatory.

If the Agent chose:

```text
Action = POST
```

and expression violates LanguagePolicy:

```text
Social Intent remains POST
Execution is blocked
```

Do not create a `blocked` Social Intent merely to represent output-policy failure.

Canonical philosophy:

> **Intent belongs to the person. Execution belongs to the body. Outcome belongs to the world.**

---

# 13. Never mechanically repair meaning

Do not use `string.replace()` as the primary repair.

Bad:

```text
“guaranteed return”
→ delete “guaranteed”
```

Correct:

```text
detect violation
→ ask expression model to re-express
→ validate again
```

Canonical principle:

> **Do not mechanically edit public language when the Agent can re-express the idea.**

A stronger model should become better at satisfying the same rule.

---

# 14. Rewrite boundary

V1:

> **Two model rewrite attempts, then block that execution.**

This is bounded to avoid:

- unbounded latency;
- runaway cost;
- repetitive model loops.

After two failed rewrites:

```text
execution blocked
reason = language_policy_violation
```

Nothing is delivered.

---

# 15. Violation is not NO_OP

Keep these distinct:

```text
NO_OP
The Agent intentionally chose silence.

LANGUAGE_POLICY_VIOLATION
The Agent chose an act, but expression violated operator authority.

EVALUATION_FAILED
The model/provider failed.

DELIVERY_FAILED
The connector/world failed.

CANDIDATE_REJECTED
The Agent/Taste rejected a candidate while continuing assigned work.
```

Canonical principle:

> **A violation is not NO_OP. A failure is not a judgment.**

---

# 16. Assignments

If:

```text
Assignment = Publish 3 posts
```

and one candidate violates LanguagePolicy:

```text
Assignment progress does not increase.
Assignment does not complete.
```

The Agent may repair/replan.

LanguagePolicy is a quality/authority boundary, not an excuse to abandon delegated responsibility.

---

# 17. Direct operator text

If exact operator-authored text conflicts with LanguagePolicy:

```text
LANGUAGE CONSTRAINT

This exact text conflicts with:
Never use “guaranteed”.

[ Go back ]
[ Publish anyway ]
```

Do not silently rewrite exact operator text.

An explicit override:

- applies to that direct action;
- is auditable;
- does not delete the underlying rule.

Autonomous Agent output never silently overrides.

---

# 18. Covered output

V1 applies to Agent-generated outbound text delivered through OpenPresence, including:

- original posts;
- threads;
- replies;
- quote commentary;
- captions;
- Agent-generated messages/DMs;
- other Channel-native authored text fields.

Do NOT apply the Agent's lexical constraint to third-party quoted source text.

Example:

A quoted external post contains `guaranteed`.

Agent commentary does not.

That should not be blocked solely because the external evidence contains the literal.

---

# 19. Manual/outside publication limitation

OpenPresence can guarantee hard policy only for:

> Agent-generated text it controls before delivery.

It cannot guarantee that an operator will not manually publish prohibited language outside OpenPresence.

If OpenPresence later observes such a post:

- preserve truthful provenance;
- do not claim OpenPresence authored it;
- do not rewrite history.

---

# 20. Media limitation

Text rendered inside an image/video may not be deterministically available as text.

Until OpenPresence has a deterministic media-text contract, do not claim that `Never use` guarantees absence from visual media.

Perception may flag suspected visual text, but interpretation is not deterministic lexical enforcement.

---

# 21. Teach

Teach may create LanguagePolicy because Teach is where durable operator intent becomes configuration.

Examples:

```text
“Never use em dashes.”
→ Never use “—”

“Avoid saying ‘Great question.’”
→ Avoid “Great question”
```

Teach should always make the stored interpretation inspectable:

- scope;
- Avoid/Never use;
- exact literal.

Semantic requests must route to semantic layers instead of being falsely compiled into word bans.

---

# 22. Chat

Presence Chat does not silently mutate LanguagePolicy.

If a user expresses a durable preference there, offer:

```text
Add to Language & phrasing
Teach the Agent from this
```

This preserves:

> **Teach changes configuration. Chat meets the Presence.**

---

# 23. Preference evidence

A reaction is not a Language rule.

Repeated evidence may create a proposal.

Default proposal:

```text
Avoid
```

not:

```text
Never use
```

Hard prohibitions require explicit operator authority.

Canonical principle:

> **A reaction is not a rule.**

---

# 24. Why not put everything in TASTE.md?

Taste is semantic/model guidance.

It cannot guarantee literal absence.

If OpenPresence tells an operator:

> “Never use em dashes” is enforced,

that guarantee requires structured state + deterministic validation.

Therefore:

```text
TASTE
judgment

LANGUAGE POLICY
structured exact preference/authority

PUBLICATION VALIDATOR
hard compliance
```

This is an example of:

> **Markdown defines meaning. Structured state enforces reality.**

---

# 25. Why not make every preference a hard filter?

Because that would:

- make Agents brittle;
- turn aesthetics into authority;
- create false positives;
- discourage experimentation;
- make preference evidence dangerous;
- overcomplicate configuration.

Hard rules should be explicit and comparatively rare.

---

# 26. Why not call it “Banned words”?

Because the concept includes:

- words;
- phrases;
- punctuation;
- advisory preferences;
- hard prohibitions.

User-facing name:

> **Language & phrasing**

User-facing hard section:

> **Never use**

---

# 27. Hidden product style

Hidden product-team stylistic preferences are architecture risk.

Audit every hard-coded phrase/style instruction.

Classify:

```text
A. universal structural requirement
B. product-team preference
C. default Agent template Taste
D. obsolete
```

Runtime deterministic code should own:

- reality;
- authority;
- structure/format;
- explicit constraints.

It should not secretly own the product team's favorite writing style.

Retained hidden language guidance must be documented here.

---

# 28. Model sovereignty

Never add deterministic substitutions such as:

```text
if “game-changer”
replace with “important”
```

A stronger model should be free to find a better expression than today's model.

Canonical principle:

> **A stronger model must be allowed to become a stronger Agent.**

---

# 29. Decision rubric for future language requests

Ask:

### Is this about character?
Use Soul.

### Is this about aesthetic/social judgment?
Use Taste.

### Is this specific to one social role?
Use Presence.

### Is this about public disclosure/identity?
Use Public Self.

### Is this an exact literal preference?
Use Language `Avoid`.

### Is this an exact literal prohibition?
Use Language `Never use`.

### Is this a meaning-level prohibition?
Use semantic guidance/policy, not lexical matching.

### Is this a deterministic output-format requirement?
Use Publication Validator.

### Did the operator merely dislike one output?
Store Preference Evidence first.

---

# 30. Canonical examples

### “Don't say game-changer. It sounds cheap.”
Likely:
`Agent → Avoid → "game-changer"`

### “Never use em dashes.”
`Agent → Never use → "—"`

### “Don't discuss my family on LinkedIn.”
Presence semantic boundary, NOT LanguagePolicy.

Inbound Scenario and Social Mirror content is world data, not Presence expression. LanguagePolicy must never sanitize, remove, or block what the Agent can perceive in a rehearsal; it governs only the Presence's outbound wording and delivery.

### “Never claim investment returns are guaranteed.”
Semantic boundary, NOT a literal `guaranteed` ban.

### “Richardson never says bro on LinkedIn.”
Could be Presence `Never use "bro"` if literal prohibition is intended; otherwise Presence Avoid.

### “I didn't like that post.”
Preference Evidence, not a rule.

---

# 31. Canonical principles

> **Taste guides expression. Authority defines hard constraints.**

> **A reaction is not a rule.**

> **A lexical prohibition is a deterministic execution constraint, not social intelligence.**

> **The model owns the sentence. Deterministic code owns whether an explicit lexical constraint was satisfied.**

> **A violation is not NO_OP. A failure is not a judgment.**

> **Do not mechanically edit public language when the Agent can re-express the idea.**

> **Markdown defines meaning. Structured state enforces reality.**

> **A stronger model must be allowed to become a stronger Agent.**

> **Agent-wide language rules are inherited by Presences; Presence-scoped language may add local constraints without silently rewriting or weakening the person.**

---

# 32. Change policy

If implementation changes any of these, update this document in the same change:

- Avoid/Never use semantics;
- literal matching normalization;
- Agent/Presence inheritance;
- rewrite limits;
- output surfaces covered;
- direct operator override;
- validator authority;
- media guarantees;
- relationship to Taste/Presence;
- manual/outside-publication guarantees.

This file exists specifically to prevent language architecture from drifting back into scattered prompt rules.
