# Social Strategy Intelligence V1

## Summary

Build an end-to-end Social Strategy Intelligence layer that gives an Agent
better possibilities to consider without deciding what it must say or do:

```text
social situation
→ bounded situation compiler
→ core mechanisms + Channel playbook + expert Skills
→ 0–5 strategy candidates (zero is valid)
→ relevant Growth + recent strategy shape + relationship context
→ Taste + Mission + live social judgment
→ select, combine, reject, or remain silent
→ Social Intent → Execution → verified outcome
→ typed Growth evidence and new hypotheses
```

The Channel owns environment-specific fluency; OpenPresence core owns universal
mechanisms. No `ENGAGEMENT.md`, new navigation, template-filling engine, or
metric-driven mutation of Taste, Brain, Mission, Soul, or Presence identity.

The governing invariant is:

> Social Strategy gives the Agent better possibilities to consider. Growth gives
> it evidence from experience. Neither decides what the Agent must say or do.

## Architecture and data model

- Add a bundled, versioned `SocialStrategyPlaybook` registry with universal
  mechanisms, audience roles, and a curated initial X playbook. New built-in
  Channels reference it through explicit `socialStrategyPlaybookRef`.
- Treat legacy `ChannelDefinition.playbook` strings as
  `LegacyChannelStrategyGuidance` (`legacy_advisory`, channel, text, migrated
  source). Preserve them at low precedence for custom Channels; never fabricate
  Pattern fields from arbitrary prose.
- Existing Agents use the latest bundled Playbook. Each retrieval run stores
  the exact version and immutable compact pattern snapshots used for historical
  inspection.
- Extend enabled Skills with optional namespaced strategy contributions. User
  prompt Skills remain editable and can extend competence, but never replace
  baseline Channel fluency.
- Add structured records:
  - `SocialStrategyPattern`: mechanism, audience role, supported acts/formats,
    useful and weak conditions, risks, Channel fit, retrieval tags, and
    reference-only examples.
  - `SocialStrategyRetrievalRun`: Agent, Presence, invocation, Channel,
    objective, Playbook/version, considered patterns, relevant Growth,
    compatible Skills, recent strategy shape, and timestamps.
  - `SocialStrategyUse` on `SocialDecision`: retrieval-run reference plus
    model-declared selected pattern/mechanism IDs per act.
  - `GrowthHypothesis`: statement, originating Presence, scope, status,
    confidence, strategy references, typed supporting/contradicting evidence,
    lineage, and review history.
- Growth scopes are `presence`, `channel`, and `agent`; relationship-specific
  learning remains in People/Relationship Memory.
- Generalization creates a new derived hypothesis. It never promotes or mutates
  an existing narrower hypothesis. Runtime may require evidence diversity before
  proposing broader scope, but fixed `2 Presences → Channel` or
  `2 Channels → Agent` is not truth. Originals remain intact and
  `derivedFrom` preserves lineage.
- Persist new collections through normalized SQLite tables and workspace
  projections. Normalize older workspaces idempotently without rewriting old
  decisions.

## Cognition, provenance, and learning

- Introduce one shared Social Strategy context compiler for live Pulse, inbound
  decisions, Explorations, Assignments, Sandbox, Presence Rehearsal, and
  Scenario runs.
- Compile only the bounded invocation: social objective, Channel, available
  acts/formats, audience/relationship context, Assignment responsibility,
  current evidence, relevant Growth, and recent strategy usage.
- Deterministically retrieve up to five diverse patterns. Zero is valid, and the
  compiler must explicitly explain when no special pattern applies. Include
  conditions and risks, never literal fill-in templates.
- Retrieve at most five applicable Growth hypotheses and three relevant enabled
  Skills. Recent strategy shape is a soft anti-fatigue signal, not a cooldown;
  retrieval may prefer a less-used strategy when alternatives fit.
- Require planner output to declare selected IDs from the supplied set. Invalid
  or invented IDs are dropped. Considered and selected provenance stay separate;
  multi-act decisions may select different strategies per act.
- Keep strategy selection upstream of wording. Conversational Style controls
  expression only after act and strategy selection; Channel grammar constrains
  executable formats and affordances.
- Build evidence through
  `SocialDecision → SocialIntent → Execution → verified Outcome/Social Mirror`
  plus metric snapshots or later conversation evidence.
- Type Growth evidence as `WORLD_OUTCOME`, `OPERATOR_REVIEW`, or
  `STRATEGY_OBSERVATION`. Effectiveness claims require verified world outcomes;
  operator preference never becomes audience performance. Operator review may
  support claims about fit with the operator's desired strategy, and strategy
  observations may support planning/reliability claims.
- Growth Review proposes hypothesis creation, support, weakening, disfavoring,
  retirement, or derived generalization using supplied IDs only. Validation
  rejects unverified, cross-scope, or unsupported causal claims.
- Hypothesis states are `testing`, `supported`, `weakened`, `disfavored`, and
  `retired`. Growth UI maps supported → KEEP, testing/weakened → TEST (with
  weakened confidence lowered), disfavored → STOP, and retired → hidden/archive.
- Structured hypotheses are the cognition source of truth. Regenerate
  `GROWTH.md` as an Agent-wide readable projection grouped by Agent, Channel,
  and Presence; preserve prior files as historical provenance.
- Rehearsal and Sandbox use the same compiler and isolated provenance, but never
  update live Growth hypotheses.

## Product surface and compatibility

- Keep the existing Growth page and Presence filter. Add “What Genny is
  learning” cards with KEEP/TEST/STOP, scope, confidence, evidence count, last
  review, and expandable lineage. Retired hypotheses are archived, not STOP.
- Show inherited Channel/Agent hypotheses with explicit scope labels.
- Add compact Playbook/version and selected-strategy provenance to advanced
  Activity/decision details; do not add a Playbook page or normal-user
  configuration.
- Preserve Skills editing, Execution Envelope, Review, language policy,
  privacy, and verified-outcome boundaries.
- Update the canonical philosophy with the distinction between capability and
  identity, portable psychology vs Channel-specific containers, possibility vs
  obligation, evidence vs policy, and better Playbooks making the same Agent
  more capable.

## Test and acceptance plan

- Catalog: unique namespaced IDs, immutable versions, valid mechanisms/roles,
  compatible acts/formats, bounded examples, no copied-template requirement.
- Retrieval: Channel scoping, 0–5 bound, zero-result explanation, diversity,
  conditions/risks, Growth/Skill limits, recent-use fatigue signal, and
  deterministic ordering.
- Planner parsing: considered vs selected provenance, per-act selection,
  invalid IDs, invented IDs, no selection, and NO_OP.
- Path parity: live Pulse, Exploration, Watch/inbound, Assignment, Sandbox,
  Presence Rehearsal, and Scenario cognition use the shared compiler.
- Boundaries: Taste can reject a high-performing pattern; strategy cannot weaken
  privacy, language, execution, evidence, or identity rules; private Presence
  context is filtered before retrieval; legacy prose stays advisory.
- Growth: only verified world evidence supports effectiveness; operator review
  and strategy observations retain their narrower claim types; new derived
  hypotheses preserve originals and lineage; disfavored vs retired semantics are
  distinct; relationship learning remains in People; rehearsal never mutates
  live Growth.
- Migration/versioning: legacy Channel strings, existing `GROWTH.md`, old
  Social Decisions, restart persistence, and latest Playbook retrieval with old
  immutable snapshots.
- Behavioral evaluation: qualified conversation, proof-led originals,
  quote/reply selection, cheap bait, manufactured disagreement, multimodal
  opportunities, repetition/fatigue, and legitimate silence.

## Assumptions

- V1 ships the retrieval-to-learning loop, not a prompt-only prototype.
- The bundled corpus is editorial input, not ground truth; mechanisms encode
  conditions and risks rather than literal metric claims or sentences.
- Built-in Playbook updates apply automatically because Channel knowledge is
  replaceable capability, not Agent identity.
- Existing unrelated working-tree changes remain untouched.
