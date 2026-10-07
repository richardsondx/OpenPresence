# OpenPresence V2: social intelligence for personal agents

Updated: 2026-10-01. Status: implementation plan; integration and performance claims remain unverified.
This document supersedes the earlier conversational V2 proposal. It is a delivery plan, not a second Feature Map. `FEATURES_MAP.md` remains the sole Feature Map and `CAPABILITY_LEDGER.md` remains the behavioral evidence contract.

## 1. Product decision

**OpenPresence gives your AI agent the social expertise to build an audience in your niche.**

It helps your agent understand who to reach, develop your voice, find worthwhile opportunities, maintain a consistent presence, and learn what brings the right people back across social networks, through the conversation you already use.

First customers: creators and small businesses. Primary interfaces: MCP and CLI with a bundled social operating skill. Local first, with an authenticated hosted option for cloud agents. Keep the OpenPresence brand.

The personal agent owns the model, conversation, goal pursuit, native tasks/scheduling, account connections, approvals, and public execution. OpenPresence supplies social context, recommendations, evidence, voice, relationships, experiment records, and durable learning. OpenPresence does not start another autonomous agent or schedule competing wake-ups in this mode.

This is an explicit user-directed evolution of the canonical philosophy's standalone Agent workspace. Preserve its identity, Taste, channel semantics, privacy, provenance, silence, and verified-outcome principles. The host becomes the visible Agent; OpenPresence provides its social capability. Do not silently rewrite the existing standalone product or its execution ownership. Reconcile the canonical philosophy when this direction is implemented.

### Durable advantage

Build a portable understanding of how this user grows this audience, backed by experiments that demonstrably improve later decisions. Carry approved voice, relationship continuity, supported patterns, failed approaches, and measurement history between agents and channels. Export this state with provenance; portability must be useful without locking users in.

Native platform agents can have better platform data and excellent social features. Content planning and voice generation are already advertised by Muse. Neutrality and portability are strategic hypotheses; useful learning transfer and measured performance must establish the advantage.

Share universal mechanisms where justified; preserve channel-specific hypotheses and uncertainty. X success must not automatically become a LinkedIn rule. Do not force posts, visuals, virality formulas, or fixed content templates. The host may reject a recommendation or choose silence.

## 2. Settings transfer audit

Inspected the rendered `AgentSettingsView` and each mounted component on 2026-10-01. References below are source anchors in `app/client-page.tsx`; line numbers can move. Defaults are persisted values unless explicitly identified as a creation fallback. This is a disposition audit, **not a claim that every legacy control is already migrated**. Import must be explicit, previewed, account-scoped, revisioned, and repeatable without changing the original workspace.

Acceptance cases: **M1** approved projection survives reconnect; **M2** host identity/model/credentials never imported; **M3** account/channel scopes do not bleed; **M4** unknown fields remain unknown; **M5** private knowledge excluded before public tool context; **M6** proposed cadence never creates/claims a host task; **M7** confirmed corrections persist/undo; **M8** host execution authority remains authoritative; **M9** unavailable capabilities are exposed honestly; **M10** repeat import deduplicates and preserves provenance; **M11** disconnect/deletion has truthful consequences. Each control listed within a row must be asserted individually in migration tests, including conditional branches.

| Actual controls and condition | Source anchor | Effective default / current behavior | V2 disposition and migration acceptance |
| --- | --- | --- | --- |
| Settings tabs Identity & Brain / Presence & Autonomy / Knowledge | `AgentSettingsView`, 14202 | Identity & Brain initially; Presence disabled if absent | Host chat is normal entry; optional inspectors preserve scope. M3/M4 |
| Agent name, save; avatar shape/color/save | `BrainView`, 14386; `AgentAvatarEditorDialog`, 1876 | Existing Agent identity/accent/avatar | Host owns private assistant identity. Public name may be separately proposed. M1/M2 |
| Duplicate Agent; conditional name/description/audience/handle/accent/mode creation dialog | `BrainView`, 14770; `CreateAgentDialog` | Copy values prefilled; new records | Optional new social workspace, no second host mind. No automatic copy of credentials or grants. M2/M3/M10 |
| Runtime provider; model/quality buttons; Ollama discovery | `BrainView`, 14426 | Persisted profile; provider switch chooses compatible quality; Ollama uses discovered models | Host-owned, excluded from import. Report host capability independently. M2/M9 |
| Create/edit skill name/instruction; close/cancel/save; dependency warning | `BrainView`, 14504 | Installed bindings; prompt max 500 chars; this list has no enable toggle | Versioned bundled skill/resource; optional socially relevant skill reviewed independently. No claim retrieval equals activation. M2/M9 |
| OpenAI/OpenRouter key; Ollama endpoint; cancel/save connection | `BrainView`, 14545 | Persisted connections; local endpoint fallback localhost:11434 | Host credentials/config stay in host. Never return secrets. M2 |
| Tavily key/connect/update/cancel/save | `BrainView`, 14553 | Availability depends on configured secret | Service provider readiness with server-managed configuration; do not inherit host secrets. M2/M9 |
| Research/asset-intelligence/visual-creation switches; Manage; Channels link | `BrainView`, 14558; `AGENT_CAPABILITY_DEFINITIONS` in `lib/types.ts` | Research readiness says Sandbox retrieval; chart rendering local; asset readiness conditional | Tools advertise observed readiness and limitations. Channel execution remains host-owned. M8/M9 |
| Agent Prefer to avoid / Never use textareas and save | `BrainView`, 14620 | Persisted literal arrays; absent arrays empty | Advisory voice preferences plus explicit public lexical constraints; inherit without weakening. Host still owns final public execution. M3/M7/M8 |
| BRAIN/SOUL/MISSION/TASTE/MEMORY/GROWTH/PULSE/PRESENCE picker/content/save | `BrainView`, 14638; mind metadata `lib/runtime.ts:194` | Protected files produce proposals; MEMORY/GROWTH curated directly | Project only relevant approved identity, objective, taste, scoped facts, evidence, and attention guidance. No whole generic brain dump. M1/M2/M4/M10 |
| Per-file document attachment toggles; conditional Enable internal Knowledge; Open Knowledge | `BrainView`, 14680 | Persisted binding; cannot override Presence access | Preserve document IDs/version/provenance and effective eligibility. Internal-only passage never becomes public source text. M5/M10 |
| Pending proposal preview / reject / apply | `ProposalRow`, 14794 | Pending changes unapplied | Proposed public profile changes are distinct from confirmed revisions. Rejection leaves state intact. M1/M7 |
| Delete Agent reveal/cancel/exact-name confirmation | `BrainView`, 14735 | Last Agent cannot be deleted | Workspace lifecycle via explicit operator action; no host-agent deletion. M2/M11 |
| Presence name/handle/save, Agent-owned versus Me/organization | `PresenceView`, 15246 | Existing identity; creation mode input | Confirmed who-speaks/public account mapping; changing account requires new host verification. M1/M3/M4/M8 |
| Voice option picker, same-scenario tabs, next example, Use style, Rehearsal link | `ConversationStyleSettings`, 14822 | Persisted style or Kairos; previews labelled X | In-chat same real subject variants; confirm scope and retain examples/version/undo. Do not replace host private personality. M2/M3/M7 |
| Custom Voice generator copy/import JSON (conditional) | `ConversationStyleSettings`, 14858 | Expression-only StylePrint; import activates Presence style | Validate imported expression fields, retain source lineage and channel scope; preview before confirmed import. M3/M7/M10 |
| Ghost representation Individual/Organization; first/middle/last name OR organization/site | `PresenceView`, 15331 | Empty representation fields remain unknown; validity required | Confirm exact represented entity and approved facts; never infer from private host identity. M1/M3/M4 |
| Identity posture; approved technical-fact checkboxes; Save Public Self | `PresenceView`, 15366 | Posture mode-dependent; approved facts empty | Preserve disclosure choices and provenance; exclude credentials/hidden instructions regardless of fact selection. M2/M3/M8 |
| Ghost priorities/preferences/voice/boundaries, save (ghost-only) | `PresenceView`, 15403 | Empty fields unknown; representation required | Project distinct objectives, user views, public expression and constraints; never fill from host persona. M1/M3/M4/M7 |
| Sandbox/native X/Bridge destination buttons | `PresenceView`, 15440 | Creation chooses route; hydration native X else bridge; sandbox explicit | Host account connections; Sandbox remains isolated rehearsal. Legacy route is metadata, not a V2 live grant. M3/M8/M9 |
| Custom Channel name/domain, Configure/Cancel/Save (non-built-in) | `PresenceView`, 15478 | Existing definition; max name 120 | Channel semantics and destination metadata retained; do not promise unsupported affordances. M3/M9 |
| Native X test/save/disconnect, API key/secret/bearer/access token/access-token-secret (X native-only) | `XConnection`, 16072 | No supplied credentials until operator setup | Host-owned; credentials and connection internals excluded. Legacy live connection never copied as host authorization. M2/M8 |
| Enable Chrome; dedicated/control browser; refresh; help (X native-only) | `ChromeConnectionPanel`, 16212 | browserAccess false at creation; identity/heartbeat determines readiness | Host browser capability report; no launch or fallback execution through V2. M2/M8/M9 |
| Bridge name/type/create, setup prompt/key/API examples copy, refresh/disconnect/remove (Bridge-only) | `BridgeManager`, 16308 | External Channel Bridge; type bridge, optional manual | Host route/receipts only; do not import tokens. Manual relay success is reported until independently observed. M2/M8/M9/M11 |
| Brief purpose/audience/primary territory/adjacent territory/keep-out, edit/cancel/save | `PresenceView`, 15547 | Existing brief; purpose/audience required to save | Durable objective/niche/audience/boundaries, account scoped. M1/M3/M4 |
| Public requests Nobody/allowlist/Anyone, request-type checks, acceptance/save | `PresenceRequestPolicySettings`, 5379 | Nobody; direct address; low impact; acceptance separate | Scoped social affordance guidance; host permissions remain authoritative; watches never grant authority. M3/M8/M9 |
| DM If condition / Do instructions/save | `PresenceDMSettings`, 5405 | Empty; fixed inbound-message trigger; live X inbound unavailable | Private scoped guidance only when host observes DMs; private context excluded from public work. M3/M5/M8/M9 |
| Custom source add/cancel/name/URL/category/description; per-source toggle/remove | `PresenceView`, 15589 | No default curation sources; category web_discovery | Approved source definitions and readiness, scoped retrieval; external content untrusted. M1/M3/M5/M9 |
| Rhythm recommended/gentle/custom; custom interval | `PresenceView`, 15725 | Recommended 5 min; gentle 15; custom 5–120 | Recommended observation cadence; host creates actual task. Existing attention interval never becomes schedule confirmation. M6/M8 |
| Quiet hours toggle/start/end (conditional) | `PresenceView`, 15756 | Disabled, 22:00–07:00 fallback | Preserve availability preference with explicitly collected timezone; unknown timezone unresolved. M4/M6 |
| Attention quiet/balanced/curious/custom; advanced X reads/model/vision/hydration ceilings | `PresenceView`, 15775; `lib/runtime.ts:316` | Balanced normalized preset; custom ceilings persisted | Capacity/cost recommendations; infrastructure budgets stay with their executor. Do not claim host limits enforced here. M6/M9 |
| Resume autonomy / Reset today's budget | `PresenceView`, 15809 | Clears standalone deferral or usage epoch | Host-native pause/resume; no hidden OpenPresence worker or budget reset in V2. M6/M8 |
| Publishing off/adaptive/pace; pace count/day/week/save (conditional) | `PresenceView`, 15820; `lib/runtime.ts:1068` | Normalized adaptive default; UI pace draft 5/day is not confirmed target | Capacity-aware growth proposal; rejects weak material; cadence is recommendation until host receipt. M4/M6/M8 |
| Presence language; local Avoid/Never/save; inherited Never display | `PresenceView`, 15871 | English only; inherited Agent boundaries cannot weaken | Preserve explicit supported language and inherited constraints; unsupported languages reported honestly. M3/M7/M9 |
| Media use-judgment/review-uncertain/always-review | `PresenceView`, 15910 | Agent use-judgment; ghost review-uncertain | Editorial uncertainty guidance and host approval needs; metadata alone never pixel inspection. M8/M9 |
| Posted asset cooldown months/save | `PresenceView`, 15931 | Explicit six-month legacy default; 0–120 | Carry explicit user preference and reuse history; flag inherited default for review, no universal V2 cooldown invented. M1/M3/M8 |
| Supervised/Independent/Custom; every capability Off/Manual/Review/Auto; conditional pending-action Auto confirmation | `PresenceView`, 15952/16049 | Persisted envelope; missing mode off; delete starts Review | Host authority snapshot only; no auto approval of old work/imported grant. Scope each capability. M8/M9 |
| Effective capability manifest | `PresenceView`, 15999 | Read-only derived availability | Return grounded host/provider readiness; setting Auto never proves delivery support. M9 |
| Knowledge maximum none/internal/public | `PresenceView`, 16013 | Persisted enabled maximum; document privacy narrows | Pre-retrieval eligibility intersection; public profile source references never expose internal-only passages. M3/M5 |
| Delete Presence reveal/cancel/exact-name confirmation | `PresenceView`, 16035 | Last Presence cannot be deleted | Disconnect/remove scoped workspace records through explicit operator lifecycle. Host account remains separate. M3/M11 |
| Add document name/content/cancel/save | `KnowledgeView`, 6688; `lib/knowledge.ts:367` | Markdown/JSON/text; reference role, internal privacy | Reuse canonical source documents/version/segments; no generic memory replacement. M1/M5/M10 |
| Edit name/content/save/archive; version history | `KnowledgeView`, 6780 | Active documents; version/hash history durable | Preserve lifecycle/version/hash; archive excludes future retrieval without erasing history. M5/M10/M11 |
| Access & audit disclosure/query/search/retrieval history | `KnowledgeView`, 6806 | Active Presence query; operator_chat purpose | Test public and internal retrieval separately; operator result must not imply public eligibility. M3/M5/M9 |

Source defaults were cross-checked against `hydratePresence` (`lib/runtime.ts:5318`), creation (`lib/runtime.ts:2682`), Knowledge creation (`lib/knowledge.ts:367`), and the components' fallback expressions. The Custom Channel editor renders only name/domain controls; its affordance/asset draft variables do not imply visible editable controls. Skills' displayed enabled status does not imply an enable toggle exists in this view.

Reuse existing normalized social records through a scoped service boundary: `compilePresenceContext` for eligible public self, `compileSocialStrategyContext`/`socialPlaybookForPresence` for channel guidance, `learningStateForPresence` for evidence-backed hypotheses, `deriveGrowthProfile` for objective evidence, and canonical knowledge retrieval for document eligibility. Adapter-owned grant/revision/host-receipt metadata is permissible; a second audience-learning engine or full runtime serialization is not. Legacy migration requires explicit provenance and a dry-run preview; until implemented, onboarding is new confirmed configuration and the unsupported transfer must remain visible.

## 3. MCP/CLI contract and skill

Initial tool names below are proposed, not existing callable APIs. CLI and MCP must invoke the same domain services and return equivalent records.

| Tool | Input and concrete output |
| --- | --- |
| `get_social_workspace` | Scoped objective/account; confirmed profile, voice, channel capabilities, relevant learning, missing inputs, freshness |
| `update_social_profile` | Typed proposed/confirmed changes and expected revision; new revision, changed scope, provenance, undo reference |
| `prepare_growth_plan` | Goal, baseline, capacity, current evidence; candidate priorities, cadence, experiments, measurement windows, next recommended wake |
| `prepare_social_action` | Situation, channel, goal; worthwhile options, relevant source material, rationale, uncertainty, wait/no-action option |
| `get_relationship_brief` | Person/thread; sourced history, last interaction, relevant context, useful next contribution |
| `find_visual_evidence` | Intended claim/audience/channel; inspectable candidates, source trail, visual context, fit, limitations, reuse history |
| `check_social_draft` | Draft plus assets/voice/channel; actionable factual, expression, visual, and format findings |
| `record_social_activity` | Host action receipt and source references; reported versus independently observed state, deduplicated activity |
| `record_social_feedback` | User correction with scope; durable preference/version and its origin |
| `register_social_experiment` | Hypothesis, comparison, outcome measure, scope; experiment record and measurement requirements |
| `review_social_results` | Attributable observations with age/context; supported or contradicted hypotheses, uncertainty, next experiment/replan suggestions |
| `record_host_plan` | Host task reference, goal, schedule/timezone, receipt, revision; confirmed/stale/cancelled status and reconciliation |

All results distinguish facts, user preferences, recommendations, hypotheses, and verified outcomes. Include stable IDs, source references, timestamps, scope, readiness, and concise summaries. Load detailed material on demand. Writes use revision checks and idempotency. A host success string is reported evidence until corroborated; a queued post is not published and follower growth is not attributed to one post without support.

Package a versioned social operating skill with the server. Discover the host's actual support for server instructions, skill extensions, resources, and prompts. Provide an explicit retrievable skill resource and human-copyable installation instructions where native skill discovery is absent. Returning instructions does not prove that the host loaded or retained them; test future use.

The skill covers: goal onboarding; permitted context collection; missing consequential questions; voice calibration; opportunity and relationship work; grounded multimodal creation; host schedule creation/reconciliation; measurement; experiments; contradiction/unlearning; failure handling. It does not claim authority over unrelated host tasks.

## 4. Conversation and V2 design

Normal interface: the host chat. No separate daily OpenPresence dashboard is required.

Onboarding: inspect permitted public work/account history and available analytics; prepare a grounded social brief; ask what cannot be inferred; confirm niche, intended audience, representation, and capacity; produce the first useful draft/opportunity; calibrate voice through real examples; establish follow-ups through host-native tasks.

Voice: start from user-owned examples when available. Show two or three versions of the same real subject with plain-language descriptions. A correction can apply to one draft, one channel, or the public voice; make consequential scope clear. Persist approved changes with examples and version history. Support "show my voice", "more technical", and "restore the previous version" in chat. Do not change the assistant's private personality or silently optimize Taste toward engagement.

Scheduling: OpenPresence proposes social work and measurement windows. The host creates the actual tasks and reports task IDs, owner, timezone, next wake, and approval behavior. Reconcile edits, cancellations, pauses, retries, and unavailable capabilities. A recommendation becomes confirmed only with host evidence. Without background support, offer an honest on-demand experience. Consistency includes contributions, replies, relationships, measurement, and follow-up, adapted to real capacity.

`/v2` is an interactive, explicitly simulated product demonstration plus connection guide. It demonstrates onboarding → voice → first useful action → host-confirmed follow-up → outcomes → revised approach. Include alternate paths for insufficient information, rejected voice, irrelevant visuals, missing analytics, disconnected host, and failed scheduling. Optional contextual inspectors expose evidence, voice history, experiments, and connection details. Avoid a second chat identity or standalone operating workspace.

Design: warm neutral surfaces, charcoal text, restrained rust accent, readable compact typography, hairlines, minimal motion. Lead with the outcome. Use "Connect OpenPresence" and "Build an audience in your niche". Show real source/receipt detail where it explains a decision. Label simulated charts/results and recommended versus confirmed work. Demo choices must update coherent state; reload must preserve/reset explicitly. Scope CSS beneath `/v2` and protect existing catchall routes.

## 5. Evidence8 integration

Use Evidence8 when its corpus fits the intended claim. Its published guide currently describes selected financial evidence, lexical search, local stdio MCP and local HTTP, with no generally available hosted endpoint. The existing `lib/asset-discovery.ts` EvidenceVisual adapter matches the documented local search shape; compatibility and content delivery remain to be verified.

Workflow: inspect available corpora → derive focused query variants → retrieve candidates → inspect original pixels → verify publisher/period/units/context → assess claim support and reuse information → compose words and visual together. Search rank and complete metadata do not establish semantic support. Preserve source lineage and distinguish publisher-original from derived visuals. Record reuse and publication history. Other niches need additional providers or rendering from grounded data; a weak visual can be rejected.

For cloud-host use, OpenPresence must be able to retrieve the locally available service through a supported authenticated deployment path or an independently available hosted integration. Do not point Muse at `evidence8.com` or `localhost:8787` as though either were a remote API endpoint.

## 6. Real Muse connection milestone

### Evidence available today

- Official Muse platform page describes connector submission, review, and directory distribution. It does not establish our custom connector's compatibility.
- Read-only inspection of the user's Muse desktop app on 2026-10-01 confirmed Settings → Connectors and existing entries marked Custom. No OpenPresence connector was added or tested.
- Postiz's own Muse guide describes chat-based custom MCP setup with HTTP and OAuth. Its assertion that Muse has no connector settings screen conflicts with the installed app observation. Treat its setup flow as a hypothesis to test, not guaranteed Meta documentation. Do not conflate Muse Code with the consumer Muse app.

### Delivery path

1. Build the smallest real server over existing scoped services: workspace read, profile/voice update, draft preparation/check, feedback, and result recording. Use an isolated synthetic test tenant with no live publishing capability.
2. Offer local stdio for compatible desktop clients and authenticated Streamable HTTP over HTTPS for Muse. A cloud agent cannot reach the developer's loopback server. Prefer a hosted test instance; a temporary authenticated tunnel is acceptable for development if deliberately configured. Never expose the full existing application or developer database as the test endpoint.
3. Implement the MCP authorization/discovery flow supported by the actual Muse client. Prefer OAuth with scoped, revocable grants. Verify registration, token refresh, expiry, reconnect, and isolation. Host security handles user approvals/account credentials; OpenPresence still authenticates access and enforces its own tenant/data boundaries.
4. Supply a public, non-secret endpoint URL, concise tool descriptions, integration guide, skill version/resource, and a copyable setup prompt. A connector listing is a later distribution milestone, not a dependency for a custom trial if supported.
5. In a dedicated Muse test conversation, execute the setup and confirm actual server calls. If Muse cannot use that transport/auth combination, capture the failure and adjust to a supported connector path. A local-client pass does not certify Muse.

### Setup prompt template (only after the endpoint exists)

> Connect a custom connector named OpenPresence to <DEPLOYED_HTTPS_MCP_URL> using its documented authorization flow. Send me the sign-in link if needed. Retrieve the OpenPresence social operating skill and save it for social audience-growth work. Keep scheduling, account actions, and approvals in Muse. Start by calling get_social_workspace for the isolated test workspace and show its returned verification marker. Do not publish or contact anyone.

Replace the placeholder with the deployed endpoint; this is not a working connection URL today. Ensure the skill respects normal host controls. A saved chat instruction alone is not tool discovery.

## 7. Muse acceptance runbook

Record app/client version, server commit, skill version, tenant, time, source snapshots, request IDs, transcript, and screenshots. Redact credentials. Use synthetic social content and disposable test records. Server trace plus persisted state is required alongside visible Muse output.

1. **Discovery:** call workspace read and return a fresh server-generated verification marker. Match transcript to authenticated tool trace; no canned or model-invented marker.
2. **Onboarding:** "Help me grow an audience in industrial decarbonization." Confirm permitted context gathering, grounded brief, consequential missing questions, and a useful first recommendation. No request to re-enter already available information.
3. **Voice:** show three versions of one subject; select one and say "less enthusiastic, keep it technical for LinkedIn." Inspect stored revision. Start a fresh conversation and confirm the correction is retrieved and applied only to the intended scope. Restore the previous version and verify state.
4. **Draft/evidence:** prepare X and LinkedIn treatments of the same source. Confirm channel-native differences and source support. Retrieve an Evidence8 chart where coverage exists; inspect actual image and source. Reject a tempting mismatched chart. Test no-result/provider-unavailable behavior.
5. **Goal/schedule:** propose a sustainable plan, then create a disposable draft-only Muse-native follow-up for a short real interval. Verify its task reference and next run in Muse Upcoming or the actual native task surface. Do not count a Google Calendar event as a background agent task.
6. **Background proof:** close the conversation; verify the native task wakes and calls OpenPresence without another prompt. Inspect host run evidence and fresh authenticated server traces. If only app-open execution was observed, leave app-closed operation unverified. Record host plan confirmation.
7. **Cancellation/retry:** pause or cancel the test follow-up through its supported surface; reconcile status. Inject a retry/time-out around a write and show no duplicate record. Do not claim disabled work will continue.
8. **Learning:** record attributable synthetic results, then ask for the next week's approach. Check changed recommendations and uncertainty; repeat with contradictory results and misleading popularity. These synthetic outcomes prove behavior only, not real growth.
9. **Continuity/isolation:** reconnect and use a fresh chat; verify durable voice/objective/history. A second identity must not access the first tenant. Later confirm the same permitted social state works from a second supported host.
10. **Failure honesty:** revoke the test grant, disconnect a provider, omit metrics, and supply stale evidence. Muse must expose the specific blocker or uncertainty without fabricated success, results, or schedules.

Run the conversational core three times from reset test tenants. All deterministic checks must pass. Background, cancellation, and reconnect need actual host lifecycle evidence; simulated time cannot substitute for Muse execution. Real public publication is a separate explicitly authorized pilot with external delivery verification.

## 8. Engineering verification and comparative eval

Use `agent-eval-lab`, `learning-loop-auditor`, `conversation-prompt-evaluation`, and `verify-app`. Extend existing controls where required; do not build a parallel verification CLI. The current eval runner does not yet prove the proposed MCP/host integration.

### Infrastructure and contract tests

Test MCP initialization/discovery/calls, schema errors, structured results, skill retrieval/versioning, OAuth lifecycle, minimum scopes, tenant separation, revision conflicts, restart durability, deduplication, provenance, freshness, untrusted social input, and explicit no-data states. Exercise actual transport and domain services, not mocked success wrappers.

Certify Sandbox isolation, virtual-time causality, outcomes, replay/fork, and hidden evaluation separation before trusting trajectories. Keep Sandbox publishing isolated from live accounts. Preserve all unrelated existing work in this checkout.

Existing commands to use during implementation:

```sh
node .agents/skills/verify-app/scripts/verify-app.mjs doctor
pnpm typecheck
pnpm lint
pnpm exec vitest run <changed-contract-and-regression-test-files>
pnpm --silent openpresence playground scenario list
pnpm --silent openpresence playground scenario run <frozen-scenario-id> --presence <isolated-presence-id> --seed <seed>
pnpm --silent openpresence playground inspect --session <session-id>
pnpm --silent openpresence playground timeline --session <session-id>
pnpm eval:prompts -- --model <available-pinned-model> --trials 5
```

Angle-bracket arguments require real IDs/files/models; they are runbook templates. Inspect runner help/source before use. Extend the existing scenario/eval harness to exercise the real V2 MCP surface and host adapter; record the exact runnable commands once implemented. Use `verify-app` for `/v2` desktop/mobile, reload persistence, keyboard access, source/voice inspectors, failure paths, and navigation isolation. Use Muse UI/server receipts for the real-host runbook.

### Comparative design

Pre-register frozen held-out cases and grading criteria before tuning. Initial target: 48 cases, six in each of eight groups: onboarding, voice, opportunity/relationship judgment, channel adaptation, visual grounding, planning/follow-through, learning/unlearning, and failure honesty. Five repeated trials across two available pinned model families. Treat this as an initial design; pilot variance determines whether more cases are required.

- A: host with its ordinary connectors/retrieval and the same accessible source material.
- B: A plus a static social operating skill, without OpenPresence's durable evidence services.
- C: real OpenPresence MCP tools plus its skill and permitted durable state.

Match source access, input history, task budget, and model settings; report actual usage, retrieval, cost, and latency. Separate information-availability gains from reasoning gains. No hand-authored C answers. Blind subjective reviewers to condition; calibrate independent judges against a human-rated subset. Prefer deterministic state/trajectory assertions over judges.

Initial ship gates (proposed thresholds, fixed before held-out runs): zero critical false-success, cross-tenant disclosure, or unauthorized public-action violations; at least 80% required behavioral completion; C tie-adjusted preference at least 60% against both A and B with case-clustered 95% confidence lower bound above 50% for each model family; no group worse by more than 10 percentage points. Report denominators, uncertainty, failures, and all repetitions. If intervals are inconclusive, enlarge the study or narrow the claim. Do not tune against the frozen holdout.

### Learning proof and real growth

Use multi-day trajectories including growth stall, unexpected winner, false correlation, relevant/random/text-only media, durable correction, host task cancellation, stale strategy, tool failure, and contradiction. Fork matched checkpoints with retained, removed, and deliberately misleading learning. Require later fresh decisions to improve for the learned reason, supported by independent evidence. Distinguish user preference from audience effectiveness. Compare equal publication ages and account/context differences; tiny samples remain hypotheses.

Run a second model capability comparison with the same OpenPresence state to determine whether a stronger host uses it better. Compatibility, social quality, useful learning transfer, and real audience growth are separate claims.

After integration/eval gates, run an opt-in longitudinal creator/small-business pilot with predeclared primary outcomes, attribution limits, matched baselines or randomized rollout where feasible, and sufficient observation duration/power. Measure qualified follower/subscriber growth, returning audience, relevant replies/conversations, user edit burden, and goal-specific business outcomes. Track reach separately. Do not infer growth lift from a demo, synthetic follower counters, or offline judges.

Current ledger: LEARN-002/003/004 remain PARTIAL. Existing standalone AUT-007 proof does not certify Muse follow-through. Add/update V2 capability evidence in the existing ledger during implementation; do not promote from this plan.

## 9. Delivery order and completion evidence

| Milestone | Exit evidence |
| --- | --- |
| 1. Settings audit and contracts | Every current settings control accounted for; scoped service reuse; explicit migration and capability contract |
| 2. Minimal real MCP + Muse trial | Authenticated discovery, real calls, durable feedback/voice, native draft-only wake and cancellation proved |
| 3. Conversational `/v2` demo | Complete coherent simulated journey; usable desktop/mobile; honest statuses and connection instructions |
| 4. Evidence and learning services | Pixel/source grounding, provider failures, measurement lineage, useful fresh transfer and contradiction proof |
| 5. Comparative certification | Frozen A/B/C evidence, independent review, per-group/model results, cost/latency, acceptance gates |
| 6. Live pilot and distribution | Authorized external delivery and growth evidence; official connector submission when ready |

Keep raw evidence under `qa-learnings/` with commit/configuration references and replay instructions. Update `CAPABILITY_LEDGER.md` with proved/partial/unproved status and `FEATURES_MAP.md` with implemented user/control paths. The present task updates the plan only: no endpoint, UI implementation, social task, evaluation result, or Muse connection is claimed delivered.

## Research references

- [Canonical philosophy](OpenPresence_Vision_and_Platform_Philosophy.md)
- [Execution workflow](AGENT_EXECUTION_FLOW.md)
- [Existing strategy design](social-strategy-intelligence-v1-plan.md)
- [Muse connector platform](https://muse.ai/platform): official distribution path.
- [Muse business offering](https://muse.ai/business): current overlapping capabilities.
- [Postiz Muse integration guide](https://postiz.com/muse): vendor-reported custom setup to validate in the real app.
- [Instinct introduction](https://instinct.com/): familiar-channel experience.
- [Evidence8 integration guide](https://evidence8.com/agents.md) and [metadata](https://evidence8.com/docs/metadata.md): current local deployment and visual-context limits.
- [Grok routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) and [ChatGPT Work](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): host-specific scheduling capabilities; do not assume identical support in Muse.

## Implementation candidate — 2026-10-01

The first V2 candidate is implemented under `/v2`, `/api/v2` and `lib/v2`,
with a dedicated HTTP process, stdio and CLI using the same persisted service.
The candidate covers twelve typed tools, a versioned operating skill, OAuth
PKCE, isolated tenants, revision/idempotence protection, scoped public voice and
undo, canonical social guidance, reported relationships/experiments/measurements,
visual pixel retrieval and honest host schedule receipts. The browser experience
is explicitly simulated. This is an implementation candidate, not completion of
all pilot/certification milestones above.

### Operator account contract

The operator explicitly selected **@example_agent**, a separate X account.
Persist its handle as `profile.intendedAccounts`; do not invent its host account
ID or treat it as connected. A subsequent user-confirmed exact host identity
belongs in `profile.managedAccounts`. Never use the main/default/logged-in account
implicitly. Every public post, reply, reaction, follow or other action requires
the user's specific confirmation; a goal, cadence or schedule grants no standing
approval. OpenPresence has no public execution tools. Initial Muse acceptance
uses the isolated test workspace with read-only authorization and no social
account access or public actions.

### Remaining certification gates

- Actual Muse tool/resource retrieval, fresh conversation, durable correction,
  restart and native wake/cancellation.
- Full comparative A/B/C evaluations with clean holdout replacements and private
  grading; model smoke success is insufficient.
- Trusted longitudinal outcomes proving beneficial learning transfer and
  qualified audience growth.
- Live Evidence8 provider setup, semantic figure support and reuse rights.
- Additional channel-specific playbooks and settings currently marked as deferred.

Reproducible checks and current limitations are recorded in
`qa-learnings/openpresence-v2-implementation-2026-10-01.md`, `docs/v2-connection.md`
and `docs/v2-evaluation.md`.
