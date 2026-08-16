# Active QA Work

## COMPLETE — Prevent native X replies to non-mention Mirror evidence

- **Started:** 2026-08-16
- **Scope:** Keep native X Pulse reply cognition restricted to provider-confirmed inbound mentions, prevent Exploration/search evidence from becoming reply targets, and make failed delivery activity retain its selected-intent lineage and warning state.
- **Product boundary:** Social Mirror observation, Agent judgment, Execution, Delivery, and verified Outcome remain distinct. An observed public post is not an inbound mention or permission to reply; no public action is counted unless X accepts it.
- **Verification:** Temporary runtime telemetry localized the mixed-Mirror candidate leak: unrelated Search evidence had `recentInboundCount: 0` and `eligibleCount: 0`, while a provider-confirmed mention formed a focal `x.reply`. Full Vitest passes 290/290; focused native-X coverage passes 26/26; the Activity legacy-event Chromium regression passes 1/1; focused Activity smoke passes 1/1; focused lint/typecheck passed before unrelated concurrent `knowledge*` changes made the workspace-wide gates red. Temporary telemetry was removed. Full lint/build remain blocked by pre-existing concurrent worktree issues: the Activity countdown `setState` lint error and missing knowledge fields in `initialState`.
- **Status:** Complete for native X reply eligibility and Activity trace truthfulness.

## IN_PROGRESS — Align Exploration finding actions

- **Started:** 2026-08-16
- **Scope:** Make Recent worthwhile finding actions use the available row space consistently and remain readable at desktop and mobile widths.
- **Product boundary:** Preserve the existing finding → operator-directed response boundary; this is a presentation-only change.
- **Verification:** Chrome desktop shows all five finding actions in a consistent 200px right-hand column; Chrome at 390px shows full-width 312px actions below each finding with no horizontal overflow or new browser errors. Lint, typecheck, focused Exploration tests, and production build pass with existing warnings only.
- **Status:** Complete.

## IN_PROGRESS — Reproduce a successful X Exploration run

- **Started:** 2026-08-16
- **Scope:** Run a real local Exploration through the Chrome UI and verify that a successful X discovery run records an actual query, source, imported candidates, triage, and truthful outcome.
- **Product boundary:** QA remains local/read-only with simulated or configured local connector state; no production deployment or unapproved live X write.
- **Verification:** Using the preserved Genny Agent workspace and its existing connected X Presence, Chrome completed a native X Exploration with query provenance visible: 25 public results entered the Social Mirror, 25 were triaged, and 5 worthwhile findings were surfaced. Browser console errors: none. Focused Vitest passes 29/29; typecheck passes. No public write was triggered.
- **Status:** Complete for successful local/native-read verification. The prior degraded run remains in history as an honest provider rejection; Retry/Look now produces a healthy, query-backed run.

## IN_PROGRESS — Review Feed channel scope without narrowing the Presence picker

- **Started:** 2026-08-16
- **Scope:** Verify that Feed may remain scoped to the selected Presence's channel/environment while the Presence picker continues to expose every Presence owned by the Agent, including Presences on other channels.
- **Finding:** The Feed filter is Presence/channel/environment-scoped; the picker still maps the full `state.presences` collection. The current local database contains one X Presence, so a second channel cannot appear until it exists.
- **Executable protection:** `tests/runtime.test.ts` verifies `stateForContext` preserves X and LinkedIn Presences when LinkedIn is selected; `tests/e2e/sidebar-hierarchy.spec.ts` verifies the visible picker keeps both handles.
- **Verification:** Direct source review and read-only SQLite inspection complete. Chrome reached the shared local runtime but the page was blocked by an unrelated `node:crypto` client-bundle Build Error from the concurrent publication-security work; browser acceptance remains pending.
- **Status:** IN_PROGRESS

## IN_PROGRESS — Conversation completion and marginal social value

- **Started:** 2026-08-15
- **Scope:** Add Presence-centric Conversation Episodes, disposition-aware social planning, truthful close lifecycle, reciprocal loop-risk/cooling behavior, public-expression boundary protection, and concise Activity status without conflating conversation interpretation with Social Mirror evidence, Social Intent, Execution, Delivery, Outcome, or Assignment progress.
- **Product boundary:** Silence and reactions remain valid social outcomes. A closing episode is not `closed` until a required public act is verified; failed delivery remains distinct. Runtime and untrusted social content stay outside public expression authority.
- **Executable protection:** `tests/conversation-episodes.test.ts` and `tests/conversation-boundary.test.ts` cover branch grouping, closure verification, generic acknowledgment suppression, substantive reopening eligibility, loop-risk detection, disposition parsing, and runtime-leak markers. `tests/publication-security.test.ts` covers sealed-expression hashing, permit scope, expiry, replay, and test-runtime write blocking. Focused feature/security coverage passes 117/117; full Vitest passes 279/279; typecheck passes; ESLint has zero errors and 15 existing warnings; production build passes with existing CSS/React/image warnings; `git diff --check` passes. Chrome QA verified Playground event → Social Mirror → Activity episode status on a fresh local runtime with no client errors and no external write.
- **Status:** Complete for conversation completion, pacing, privacy boundary, operator visibility, and publication-security enforcement. Live provider delivery remains intentionally unexercised in local QA.

## IN_PROGRESS — Prove Publishing Plan execution end-to-end

- **Started:** 2026-08-15
- **Scope:** Close the verification gap from durable Publishing Plan materialization to Sandbox window wake, Agent consideration, Social Intent, simulated delivery, Social Mirror verification, Feed classification, and original-progress accounting. Add lineage and operator-safe breadcrumbs so replies, Assignments, and Publishing Initiative output remain distinguishable.
- **Product boundary:** A plan window grants permission to consider original expression; it never forces publication. NO_OP, candidate rejection, review, execution failure, and delivery failure remain distinct. QA remains isolated to Sandbox/mock state with no live connector writes.
- **Verification:** Full Vitest passes 263/263; focused Publishing Plan/Sandbox tests pass 35/35; typecheck passes; lint passes with 15 pre-existing warnings and no errors; production build passes with existing CSS/React/image warnings; isolated Chromium acceptance passes 1/1 on a separate port and database. The end-to-end fixture proves due virtual-time wake → plan work breadcrumbs → Agent original decision → Social Intent origin → simulated Execution → Social Mirror → Feed Original → verified plan progress. NO_OP, review, inbound reply exclusion, and next-consideration persistence are covered. No live connector write or production mutation occurred.
- **Status:** Complete for Sandbox Publishing Plan execution, provenance, truthful progress, diagnostics, and operator-visible work history. Native/live autonomous cadence and provider-specific plan quality remain outside this feature scope.

## IN_PROGRESS — Canonical Publishing Assignment execution

- **Started:** 2026-08-15
- **Scope:** Connect the Presence-facing Publishing Initiative to the canonical Assignment responsibility model and consume that responsibility from the browser-independent Native X pulse path. This QA slice preserves existing reply behavior, makes autonomous original-post decisions inspectable, and keeps verified delivery as the only progress signal.
- **Human-found defect:** A live Presence can reply to mentions, but its configured original-post pace is not consumed by `wakePresence`/`runPulse`; the visible Publishing Plan is planning-only and the browser Calendar timer is not a durable autonomous scheduler.
- **Product boundary:** Existing live configuration is not mutated during QA. Tests use the isolated connector/model mocks; no external X write or deployment is authorized.
- **Executable protection:** Add regression coverage for canonical Assignment linkage, quantity semantics, pulse eligibility/no-op, queued execution lineage, and verified progress after delivery.
- **Verification:** Full Vitest passes 23/23 files and 264/264 tests; the native X regression covers browser-independent Attention Worker → reconcile → canonical Publishing Assignment → Social Intent → Execution Envelope → connector → later Mirror verification. Typecheck passes; production build passes; ESLint has zero errors and 15 existing warnings; `git diff --check` passes. Chrome local smoke on a fresh dev port loaded the app without a current client exception; the first stale-port ChunkLoadError was caused by running the production build concurrently with the dev server and disappeared after restart. No live connector write or deployment occurred.
- **Remaining production gate:** `runAttentionWorker` is now an explicit browser-independent worker entry point, but this repository still lacks a durable external scheduler/lease service that invokes it when the browser is closed. Native delivery also still needs durable cross-process claiming and provider-level idempotency before unattended live posting is production-safe.
- **Status:** QA implementation complete for canonical linkage, native pulse consumption, verified progress, and Sandbox Exploration lineage. Live autonomous cadence remains an explicitly documented follow-up, not a claimed completion.

## COMPLETE — Presence-scoped Explorations

- **Started:** 2026-08-15
- **Scope:** Add natural-language Explorations inside Watching so a Presence can direct durable attention toward social topics and problems without turning discovery into a reply bot, a second permission system, or a second Social Mirror.
- **Product boundary:** Explorations produce bounded social evidence and findings. The Social Planner owns judgment; the existing Presence Execution Envelope owns outbound action. Watchlist remains for known identities, and Exploration state remains Presence-scoped.
- **Verification:** Full Vitest passes 255/255; typecheck passes; changed-source ESLint passes with zero errors and eight existing warnings; production build passes; `git diff --check` passes. Chrome QA covered create, interpretation, look-now, refine, pause, reload persistence, resume, archive, and the responsive Watching state. Mobile layout reported no horizontal overflow; no browser runtime errors were observed. The connected X look was read-only and no reply action was triggered.
- **Status:** Complete for the Presence-scoped Exploration MVP: durable briefs, refinement, lifecycle controls, bounded Mirror/native discovery, triaged findings, truthful coverage/outcome states, and no automatic Social Intent or execution creation. Background worker cadence, Teach ChangeSets, broader Bridge/import adapters, Activity finding cards, and Growth attribution remain follow-up scope.

## IN_PROGRESS — Add visible Agent Publishing Plan

- **Started:** 2026-08-15
- **Scope:** Materialize non-scheduled Publishing Initiative responsibility as a durable, Presence/environment-scoped Agent Publishing Plan with bounded windows, visible Schedule/Activity projections, and explicit replanning.
- **Product boundary:** The operator owns the expectation; the Agent owns the plan; windows grant future work context and never represent prewritten posts or bypass the Presence Execution Envelope. Live QA remains read-only/local unless explicitly approved.
- **Executable protection:** `tests/publishing-plan.test.ts` covers Presence/environment scoping, revision supersession, projection isolation, and the no-publication/no-execution boundary. The browser acceptance path covers Settings → Schedule → Activity, explicit replanning, visible bounded windows, and adaptive progress.
- **Verification:** Full Vitest passes 252/252; focused publishing/runtime/AI tests pass 105/105; typecheck passes; ESLint passes with existing warnings only; production build passes; `git diff --check` passes. Isolated browser QA with a mock planner confirms two revisions with the first superseded, three flexible windows, four plan events, and zero publications/executions. No live connector write or production mutation occurred.
- **Status:** Complete for the durable Publishing Plan domain, bounded planner/replan operation, and Schedule/Activity projections. Live cadence execution and provider-specific plan quality remain outside this feature scope.

## COMPLETE — Explain Calendar no-op decisions

- **Started:** 2026-08-15
- **Scope:** Preserve Calendar silence as valid Agent judgment while recording a concise, user-understandable reason for each live no-op and surfacing it through Activity/action provenance.
- **Generalizable principle:** Silence remains valid Agent judgment, but a repeated no-op without a bounded rationale is not an inspectable decision and cannot improve operator trust or future calibration.
- **Project enforcement:** Live Calendar evaluation now uses the structured social-decision contract, persists the model's short rationale on the skipped Action, and includes it in the `Standing intention held` Activity event. Bare `NO_OP` remains truthful and is explicitly labeled as an unavailable explanation.
- **Executable protection:** Native X tests cover rationale persistence for Calendar no-op and the post-delivery path; the Schedule → Evaluate → Activity Chromium regression checks the visible `Reason:` copy when silence is selected.
- **Verification:** Focused Calendar/native-X tests pass 3/3, full Vitest passes, typecheck passes, changed-source ESLint passes with no errors, production build passes with existing warnings, `git diff --check` passes, and the focused Chromium regression passes 1/1. No live X write was triggered.
- **Status:** Complete.

## COMPLETE — Scheduled X post was evaluated and intentionally held

- **Started:** 2026-08-15
- **Scope:** Trace why Genny's scheduled/standing-intent task for today produced no visible X post, from Schedule state through runtime wake, cognition, execution, and native X delivery.
- **Human-found expectation mismatch:** The Saturday 07:00 standing intent was configured as `Consider`, so it granted permission to evaluate rather than requiring a publication. The operator expected autonomy plus a scheduled time to produce a post.
- **Runtime evidence:** The persisted Calendar slot was evaluated at `2026-08-15T11:00:00.290Z` (07:00 Toronto), then recorded `Standing intention held` at `2026-08-15T11:00:02.405Z` with `no_op / skipped`. No execution or delivery failure exists for that slot. Native X delivery was independently healthy because Genny published contextual replies at 08:40 and 09:08.
- **Generalizable principle:** A scheduled standing intent must be diagnosed as a three-state outcome—evaluated and held, evaluated and delivered, or never evaluated—before it is called a scheduler or connector failure. “Consider” is Agent autonomy with permission to remain silent, not a guaranteed post.
- **Executable protection:** `tests/x-connection.test.ts` covers the schedule evaluation → native X delivery path; the live audit verified the complementary `NO_OP` path and persisted Calendar/Activity evidence.
- **Verification:** Read-only browser inspection of Schedule and Activity, direct persisted-state inspection, and the focused Calendar/native-X test passed 1/1. No live X write or production mutation was triggered.
- **Status:** Complete; no code fix was warranted because the runtime behaved according to the configured `Consider` semantics.

## COMPLETE — Live X mention wake-up and focal reply targeting

- **Started:** 2026-08-15
- **Scope:** Ensure automatic Native X reconciliation wakes live cognition for unjudged inbound mentions, preserves the full hydrated thread context, and targets replies at the focal mention rather than its parent.
- **Human-found defect:** X post `2088596615653130686` was present in the Mirror with a complete five-object conversation chain, but the 12:05 observation ended at “Social Mirror updated”; no Pulse/evaluation followed, and the earlier reply path targeted parent context instead of the focal mention.
- **Executable protection:** `tests/x-connection.test.ts` covers automatic sync → nudge → cognition → focal-target delivery with root, parent, and focal evidence.
- **Verification:** Full Vitest passes 247/247; the new automatic-sync integration test passes; focused Chromium Activity coverage passes for the visible-navigation and Sandbox-scope flows, with one unrelated legacy Schedule test still timing out because its standing-intent fixture does not render an evaluable slot. Typecheck, production build, ESLint (0 errors, existing warnings), and `git diff --check` pass. The exact X post and live Mirror state were inspected read-only; no live sync or public X write was triggered.
- **Status:** Complete for the Native X observation → attention → cognition → focal reply-target path.

## COMPLETE — Live X thread context parity

- **Started:** 2026-08-15
- **Scope:** Hydrate missing public X ancestry and referenced evidence at the connector/Social Mirror boundary, persist it as normalized Mirror objects, and use one bounded thread compiler for Sandbox and Live cognition.
- **Customer value:** A Presence mentioned in an existing conversation receives the actual public context needed for continuity, disagreement, humor, restraint, and relationship-aware judgment. Missing context remains explicit rather than inferred.
- **Executable protection:** `tests/thread-context.test.ts` covers bounded ancestry, isolation, quote separation, cache/hydration, and partial/unavailable truth; `tests/x-connection.test.ts` covers X expansions, normalized Mirror persistence, and the Live cognition request containing ancestor text.
- **Verification:** Full Vitest passes 245/245 with loopback-enabled QA; focused post-compatibility tests pass 26/26; typecheck, production build, changed-source lint (0 errors, existing warnings only), `git diff --check`, and Chrome smoke all pass. Chrome loaded the running app and showed the Activity/Social Mirror surface with no browser errors. No external X write or production mutation occurred.
- **Status:** Complete for connector observation, Social Mirror persistence, shared thread compilation, and native Pulse context. Broader conversation/sibling-branch inspection remains intentionally out of scope.

## COMPLETE — Visual necessity and truthful bounded research outcomes

- **Started:** 2026-08-15
- **Scope:** Separate optional/helpful/important/required visual needs from the visual brief, preserve the bounded evidence-first path, and make zero-result and rejection outcomes truthful in the Assignment UI.
- **Coordination:** Preserved RuntimeScope, workspace revision/409 handling, Playground worldRevision, Assignment lineage/status checks, and durable bridge/asset ownership from the parallel concurrency work.
- **Behavior:** Helpful visuals can fall back to a grounded text-only publication; important visuals may replan or publish text-only; required visuals remain blocked without verified media. Empty discovery receives exactly one model-guided query reformulation before the bounded effort ends. Research records `discovery_empty`, `fetch_failed`, `inspection_rejected`, or `editorial_rejected` and retains the trail across attempts.
- **Executable protection:** Assignment tests cover helpful text-only fallback, required-visual blocking, one query reformulation, zero-candidate messaging, inspected rejection, and verified publication counting. The UI shows `No usable visual leads` for zero inspection and labels the research outcome in the collapsible trail.
- **Verification:** Full Vitest passes 238/238; targeted AI/Assignment/perception tests pass 39/39; typecheck, production build, changed-source ESLint (0 errors, 8 existing warnings), and `git diff --check` pass. Browser QA on the main runtime confirmed the corrected zero-candidate card and `DISCOVERY EMPTY` trail. No live connector activity occurred.
- **Status:** Complete for the bounded Sandbox Assignment path; provider-specific rendering and live connector delivery remain outside this scope.

## COMPLETE — Evidence-led Assignment runs and truthful worker progress

- **Started:** 2026-08-15
- **Scope:** Execute the evidence-first Assignment feedback: reframe broad visual work around strong discovered evidence, create fresh bounded retry runs, keep state reads responsive during long work, and make terminal/progress UI truthful and compact.
- **Coordination:** Preserve RuntimeScope, workspace revision/409 handling, Playground worldRevision, Assignment lineage/status checks, and durable bridge/asset ownership from the parallel concurrency work.
- **Acceptance criteria:** A broad visual Assignment can publish around a strong alternative evidence candidate; Retry Assignment creates a fresh bounded run without repeating known negative evidence; `/api/state` remains responsive while work runs; queued/researching/selecting/writing/delivering are visible, while terminal blocked/published states never retain a working indicator.
- **Verification:** Full Vitest passes 233/233; targeted Assignment/concurrency tests pass 82/82; typecheck, production build, changed-source ESLint, and `git diff --check` pass. The main runtime retry returned a queued run in 658ms, `/api/state` remained responsive during `visual_research`, and the worker reached a truthful terminal blocked state after 5 inspected candidates across 2 bounded searches. Browser QA confirmed compact terminal progress, the collapsible evidence trail, preserved candidate domains, and an actionable `Try again` control with no stale working indicator. No live connector activity occurred.
- **Status:** Complete for the bounded Sandbox Assignment path; process-restart recovery and live connector delivery remain outside this scope.

## COMPLETE — Restore Presence handle editing

- **Started:** 2026-08-15
- **Scope:** Restore a Presence-scoped handle field in Presence Settings, allow it through the scoped state update contract, and keep handle changes independent from Agent identity.
- **Human feedback:** The existing Presence showed `@skool_community`, but Settings exposed no way to edit it.
- **Generalizable rule:** Every public Presence identity field that is already durable in the model must remain discoverable and editable at the Presence scope; changing it must not rewrite Agent identity or meaning files.
- **Executable protection:** `tests/runtime.test.ts` verifies handle/context persistence and Agent rename isolation; `tests/e2e/openpresence.spec.ts` verifies desktop/mobile edit, reload persistence, and sidebar rendering.
- **Verification:** TypeScript passed; targeted runtime test passed 1/1; Presence/Agent identity E2E passed 2/2 across Chromium desktop and Pixel 5; changed-source ESLint passed with existing warnings only; connected Chrome verification confirmed `@genny` in Settings and sidebar after reload, with no browser errors.
- **Status:** Complete.

## 2026-08-15 — Long-running Assignment visibility and revision ownership

When Assignment work performs provider and model calls synchronously, the UI
must persist a pre-work checkpoint and render a compact live status rather than
leaving the operator to infer progress from a disabled button. Background
Playground clock synchronization must not advance the same workspace revision
while an Assignment is in `researching`; doing so can make the final worker
write stale and strand the Assignment indefinitely. Verified the mobile panel
with a visual progress ring and phase summary, then resumed the stranded
Sandbox Assignment and observed a terminal blocked outcome instead of a false
active state.

## COMPLETE — Layer Agent capabilities above internal tool bindings

- **Started:** 2026-08-15
- **Scope:** Replace the user-facing flat “Tools bound” surface with coherent Agent capability families, separate enablement from provider readiness, and keep Channel action authority on each Presence.
- **Product boundary:** `User → Agent → Presence` remains explicit. Disabling a capability withholds new Agent-initiated tool use without erasing Memory, Watching observations, existing assets, or source history; Presence Execution Envelopes remain the only social-world write authority.
- **Executable protection:** `tests/runtime.test.ts` covers family toggling and the non-toggleable channel-action boundary; `tests/e2e/openpresence.spec.ts` covers persistence, disabled-state copy, and the absence of an Agent-level Channel action switch.
- **Verification:** Full Vitest passes 222/222; typecheck and production build pass; changed-source ESLint reports zero errors; desktop and mobile Chromium coverage pass for the capability flow. Disabled Research persists across reload, dependent Skills become unavailable, Asset intelligence stops new media inspection, and Channel action remains Presence-managed.
- **Status:** Complete.

## COMPLETE — Assignment Fulfillment Loop

- **Started:** 2026-08-15
- **Scope:** Keep explicit Assignments working through candidate rejection, provide bounded temporary context and source/story research, and make blocked versus completed outcomes truthful in runtime and Playground.
- **Generalizable rule:** A candidate-level social rejection is not an Assignment-level completion. Operator-owned objectives require bounded persistent pursuit; Taste remains free to veto each candidate.
- **Project enforcement:** `app/api/state/route.ts` runs the bounded `runSandboxAssignment` controller, `Assignment.work` and `attemptHistory` persist phase/budget/reasons, `researchAssignmentStories` supplies current source leads when available, and Playground renders phase, budget, rejection count, and blocked state.
- **Executable protection:** `tests/assignment-runtime.test.ts` covers rejected candidates followed by later success and transparent bounded exhaustion, alongside provider failure and source-backed visual publication coverage.
- **Verification:** Focused Assignment tests pass 4/4; TypeScript passes. Full regression and browser verification are in progress.
- **Status:** Complete for the bounded Sandbox Assignment path; live connector delivery remains outside this QA run.

## COMPLETE — Visual Evidence Loop

- **Started:** 2026-08-15
- **Scope:** Replace search-metadata asset selection with an inspectable, source-linked, bounded visual editorial loop for Sandbox publication.
- **Generalizable rule:** Search results are possibilities, not evidence. A source page, publisher name, filename, or OG image does not establish what the downloaded pixels show.
- **Project enforcement:** `lib/asset-discovery.ts` emits source-page/figure candidates and marks thumbnails/hero leads; `lib/perception-runtime.ts` inspects actual downloaded media; `lib/ai.ts` owns bounded `select` / `search_again` / `render` / `text_only` / `replan` decisions and the final joint text+media review; `AssetResearchSession` preserves attempts, perceptions, lineage, and selection decisions.
- **Executable protection:** Visual-fit tests reject uninspected evidence leads and decorative images; assignment tests stub only the perception boundary to prove inspected chart media can be selected and published. Follow-up coverage must include hidden cross-domain candidates, stale/wrong-metric charts, PDFs, and secondary visualizations with preserved lineage.
- **Verification:** Full Vitest passes 214/214; TypeScript passes; production build passes in an isolated Next output directory; changed-source ESLint reports zero errors; focused Chromium provider-settings flow passes 1/1; `git diff --check` passes. No live connector activity occurred.
- **Status:** Complete for the bounded Sandbox research/publication path. Live X delivery and provider-specific chart rendering remain explicitly outside this QA run.

## COMPLETE — Provider-neutral evidence-led visual planning

- **Started:** 2026-08-15
- **Scope:** Execute the attached feedback without turning the Kobeissi diagnostic into a generic chart-posting rule.
- **Generalizable changes:** Added `StoryCandidate`, `EvidenceNeed`, and `VisualBrief` metadata to social decisions; added contextual visual-fit checks; inferred semantic asset kinds without treating any kind as universally good or bad; added the provider-neutral `Evidence-led visual storytelling` Skill; and included enabled social Skills in model context.
- **Explicit non-generalizations:** No Kobeissi name, preferred publisher, market topic, `BREAKING` opener, or chart-only rule was added to runtime. Source search is driven by the evidence need and visual brief. A logo can fit an identity brief, a photo can fit a scene brief, and text-only remains valid.
- **Anti-overfit protection:** Cross-domain tests cover market-style evidence, product-style screenshots, event photography, branding/logo identity, and text-only counterfactuals. The same candidate is evaluated differently under different visual roles.
- **Verification:** Full Vitest passes 204/204; TypeScript passes; focused visual-fit, AI-planning, asset, and assignment tests pass. No live connector activity occurred.
- **Status:** Complete.

## COMPLETE — Kobeissi asset-discovery rerun

- **Started:** 2026-08-15
- **Scope:** Re-run the KobeissiKlone Sandbox assignment through the interface after Tavily setup and compare the new source-backed asset path with the previous 10-publication pass.
- **Initial blocker:** The OpenAI key was not lost from encrypted storage. The main runtime had a newly-created OpenAI connection without a matching credential row after connection/state drift; older encrypted rows remained under prior connection IDs. No sub-agent worktree or alternate runtime was found to have modified the main database. Re-saving the key created `connection_pt79tcwg`, which now reports `available` and `secretConfigured: true` in the UI and state metadata.
- **Runtime fixes:** Exact-quantity assignments now get one bounded recovery pass when the model returns `no_op`; long-form X assignments retain `x.long-post` instead of being forced through the 280-character path; Tavily source search now enriches result pages with public preview images and falls back across official source families/topics while avoiding duplicate hashes. Evaluation failures still transition to `blocked` with an explicit model/runtime message.
- **Evidence:** The corrected main-runtime assignment `assignment_pjmwqdft` completed 10 / 10 sequential Sandbox publications. Feed now shows 20 total publications: 10 prior baseline posts plus 10 new posts. All 10 new posts are 1,059–1,473 characters, 4–5 paragraphs, and have one attached asset. All 10 assets have distinct SHA-256 identities, local stored bytes, source evidence, distinct source pages, and asset-usage records tied to the assignment. The asset endpoint served all 10 with HTTP 200 and non-empty image bytes. Source pages include IMF, U.S. Treasury, World Bank, FRED, and BLS domains. No live X activity occurred.
- **Comparison:** The prior baseline was 10 posts with 10 attached assets but did not have assignment-linked usage evidence in the current state. This rerun adds 10 new long-form publications, 10 distinct source-backed downloaded assets, 10 source-evidence records, and 10 assignment-linked usage records. Publisher/source identity and rights remain recorded as `unknown` for independent verification; the system does not claim legal clearance.
- **Executable protection:** `tests/assignment-runtime.test.ts` asserts missing-model assignments block instead of looping and source-backed assignments materialize/use a Tavily asset; `tests/e2e/asset-provider.spec.ts` covers interface-managed Tavily credentials. No live connector activity occurred.
- **Status:** Complete.

## COMPLETE — Interface-managed asset discovery credentials

- **Started:** 2026-08-14
- **Scope:** Make Tavily configuration an operator-owned OpenPresence setting instead of an undocumented server-environment prerequisite.
- **Product boundary:** External service credentials belong in the existing Manage Agent → Provider access flow. They are encrypted in provider credential storage, represented in state only by non-secret connection metadata, and never sent back to the browser or exposed to the Agent.
- **Fix:** Added a dedicated `AssetProviderConnection` boundary for discovery services, a Manage Agent Tavily key form with connected/update status, encrypted save/delete handling, and discovery-route lookup through the configured connection. Tavily no longer defaults to `TAVILY_API_KEY` for product requests; an unconfigured request points the operator to the interface.
- **Executable protection:** `tests/e2e/asset-provider.spec.ts` configures a test key through the UI, asserts the connected state, and verifies the raw key is absent from `/api/state`. Existing asset-intelligence tests continue to cover the provider adapter independently.
- **Verification:** Full Vitest passes 195/195; the isolated Chromium provider-settings flow passes 1/1; TypeScript passes; production build passes; changed-source ESLint reports 0 errors (5 existing warnings in `app/page.tsx`).
- **Status:** Complete.

## COMPLETE — First coherent Asset Intelligence Runtime slice

- **Started:** 2026-08-14
- **Scope:** Execute the attached provider-neutral asset workflow: durable local asset identity and memory, source/provenance separation, expression intent, and truthful Sandbox publication state. Live external posting remains out of scope for autonomous QA.
- **General principle:** A source URL is provenance, not proof; intentional fiction/satire is not a failed factual verification; and a publication is not complete until the stored asset, usage record, and observed delivery agree.
- **Project enforcement:** `lib/types.ts` owns the structured ledger and publication intent; `lib/runtime.ts` must create stable asset metadata and usage records; Feed must render stored asset evidence rather than silently hotlinking remote URLs. Provider discovery is candidate generation only.
- **Executable protection:** `tests/asset-intelligence.test.ts` covers immutable bytes, exact/visual identity metadata, provider normalization/Tavily adapter behavior, redirect security, fetched media persistence, usage history, and satire-vs-unsupported grounding. `tests/sandbox.test.ts` covers exact-duplicate blocking and explicit repurposing. Feed/inspector Chromium coverage remains green. Native connector media remains contract-tested without live mutation.
- **Verification:** Full Vitest passes 194/194; focused Chromium Feed/inspector coverage passes 4/4; typecheck and production build pass; the development runtime returns HTTP 200. Tavily discovery is intentionally configuration-gated and now points operators to Manage Agent → Provider access when it has not been connected.
- **Remaining phase:** Wire discovery/materialization into the model planner and add X media upload/reconciliation contract tests before any live connector approval. No external posting was performed.
- **Status:** Complete for this coherent slice.

## COMPLETE — Validate KobeissiKlone multimodal posting workflow

- **Started:** 2026-08-14
- **Scope:** Inspect the public KobeissiLetter format read-only in Chrome, create a clearly labeled KobeissiKlone emulation in the local OpenPresence Sandbox, run a sequential 10-post Playground Assignment with chart/image-capable output, and verify the Feed and Social Mirror evidence before assessing reply readiness.
- **Product boundary:** Preserve `User → Agent → Presence`, keep cognition separate from execution and delivery, do not publish to X, and do not present the emulation as the official KobeissiLetter account or reuse its identity assets deceptively.
- **Status:** Complete for Sandbox posting and one reviewed reply; reply-batch Assignments remain a follow-up capability.
- **Evidence:** Connected Chrome inspection of the public target was read-only. After correcting an initial database-scope mistake, the exact main-runtime `KobeissiKlone` assignment in `data/openpresence.db` delivered 10 / 10 distinct original Sandbox X publications sequentially, with 10 / 10 attached chart/image assets visible in the exact main-runtime Feed and Social Mirror URL. The first post opened with Sandbox provenance and no live X URL. A simulated inbound market question then formed a reply, waited for review, persisted approval, and delivered one verified `x.reply` outcome in the isolated QA mirror.
- **Architecture finding:** The normal Presence reply loop is operational. Playground Assignment progress currently compiles and executes original-publication deliverables; it does not yet expose a first-class N-reply Assignment contract. The main runtime also truthfully blocks when the selected provider is unconnected rather than fabricating output.
- **QA:** `pnpm typecheck` passed; `pnpm test` passed (185 tests); focused Sandbox/AI tests passed (48 tests); focused lint reported 0 errors and 3 pre-existing warnings; `git diff --check` passed. The existing Playground Playwright file has stale selectors for the former `Try a post` control and hard-coded `Jenny`, so that suite is not used as evidence for this workflow.

## COMPLETE — Make Scenario Runs channel-native and operator-first

- **Started:** 2026-08-14
- **Scope:** Reframe completed Scenario Runs around the social behavior being rehearsed: channel-native Replay first, concise Review second, and technical evidence in Details. Reuse the existing Playground thread renderer, preserve Sandbox provenance and append-only evidence, and keep operator review explicit and non-mutating.
- **QA learning:** Evidence-backed social features must be browser-verified at the level of the user’s trust question. A passing structural evaluation is not enough; the regression flow must assert that the actual Sandbox world objects and Presence outcome are visible before technical details.
- **Executable protection:** `tests/e2e/scenario-rehearsal.spec.ts` asserts Replay, Details, Review, isolated Run provenance, unchanged Memory/Growth, and fresh rerun isolation.
- **Verification:** TypeScript passed; Scenario unit tests passed 4/4; Scenario Chromium E2E passed 1/1; targeted ESLint reported 0 errors; `git diff --check` passed; connected Chrome visual QA inspected Replay, Review, and Details at desktop size. Repository-wide ESLint remains blocked by generated `tmp/**/.next` artifacts unrelated to this change. No live connector activity occurred.
- **Status:** Complete.

## IN_PROGRESS — Source-backed long-form market output

- **Started:** 2026-08-14
- **Scope:** Prevent synthetic media and short-only X assumptions from masking whether a market emulation can produce long-form, source-verifiable Sandbox publications.
- **Human feedback:** The prior verification counted synthetic Sandbox fixtures as real charts, and the first long-form attempt was rejected because the runtime hard-coded X to 280 characters. The draft sanitizer also collapsed intentional paragraph breaks.
- **Regression rule:** Never count an asset as source-backed unless its rendered media URL, source page URL, and publisher are persisted and reachable. Never judge long-form formatting from character count alone; verify format, paragraph breaks, and rendered Feed/inspector state.
- **Executable protection:** `tests/ai.test.ts` asserts long-form market decisions use `x.long-post`, official FRED provenance, and 500+ characters; `tests/runtime.test.ts` asserts Sandbox draft cleaning preserves paragraph breaks.
- **Current verification:** Main runtime `data/openpresence.db` was reset only for the invalid local Sandbox session, then rerun with 10 sequential publications. State now shows 10/10 completed, each 738–903 characters, 5 paragraphs, `x.long-post`, and 10/10 attached official FRED/Federal Reserve charts. Remote media endpoints returned HTTP 200 `image/png`.
- **Status:** In progress until browser rendering is independently inspected and the 50–100-post corpus gate is recorded with a reproducible source manifest.

## IN_PROGRESS — Implement Scenario Rehearsal Runs for Playground

- **Started:** 2026-08-14
- **Scope:** Execute the corrected Scenario Rehearsal Runs plan: natural-language Scenario authoring frozen into versioned fixed replays, Presence-scoped isolated Runs backed by existing Playground sessions, structured import/export, narrow structural checks, independent model-review boundary, provenance, resume/rerun semantics, and philosophy integration.
- **Product boundary:** Keep `User → Agent → Presence`, Sandbox/Live isolation, Social Mirror provenance, worldSpec/evaluationSpec separation, and explicit learning promotion. No live connector activity is authorized.
- **Verification:** `pnpm typecheck` passed; full Vitest passed 174/174; feature-scoped ESLint passed with no errors; Scenario Chromium E2E passed 1/1; connected Chrome verified natural-language authoring, world/evaluation preview separation, isolated Sandbox Run, append-only evidence, conservative `Needs review` handling, and fresh rerun behavior with no console errors; CLI Scenario list returned versioned Runs and provenance. The broader legacy Chromium suite was started for regression context and exposed unrelated baseline failures in Calendar Week selector strictness and an Activity navigation timeout; no Scenario test failed. No live connector activity occurred.
- **Status:** Complete.

## COMPLETE — Language & Phrasing V1

- **Started:** 2026-08-14
- **Scope:** Implement the attached structured LanguagePolicy plan, add `docs/LANGUAGE.md`, update the canonical OpenPresence philosophy, and verify Agent/Presence language configuration plus deterministic outbound validation. This is feature-scoped and local/Sandbox-only; no live connector activity is authorized.
- **Coordination:** The referenced multi-Agent browser task was asked to pause because its active worktree changes overlap this feature's UI/runtime surfaces. Existing uncommitted changes remain preserved.
- **Verification:** docs/LANGUAGE.md is an exact copy of the attached reference. Pure matcher/merge/runtime coverage passes 6/6; full Vitest passes 169/169; TypeScript passes; production build passes; changed-source ESLint reports zero errors; focused Chromium configuration flow passes 1/1 on an isolated local test port. The referenced browser-audit task is idle and confirmed it will not edit this workspace until explicitly resumed. No live connector activity occurred.
- **Status:** Complete.

## COMPLETE — Production mock isolation

- **Started:** 2026-08-14
- **Scope:** Prevent deterministic AI/X fixture output from reaching production while preserving isolated test-harness coverage.
- **Root cause:** `OPENPRESENCE_AI_MOCK=1` and `OPENPRESENCE_X_API_MOCK=1` were checked directly. The Playwright harness enabled them explicitly, but there was no separate runtime gate preventing an accidental production configuration from activating them.
- **Fix:** Mock behavior now requires `OPENPRESENCE_TEST_MODE=1` outside production. Production mode ignores the mock flags, uses provider and connector paths, and fails with an actionable error when configuration is missing instead of emitting generic output. The browser harness runs in non-production test mode.
- **Verification:** AI, X, and Sandbox suites passed 65/65; production-mode AI mock regression passed; production build passed; focused Chromium test passed 1/1 with the isolated test harness.

## COMPLETE — Correct Playground virtual time initialization and reset

- **Started:** 2026-08-14
- **Scope:** Trace why Playground cards and the Virtual time panel show a stale fixed time, then ensure a new/reloaded Playground session and Reset use the current local time while preserving intentional virtual-time advancement within a session.
- **Product boundary:** Virtual time is Sandbox world state, not public channel truth. It must be persisted per Presence/session and must not affect Agent identity, Presence meaning, or live delivery.
- **Root cause:** New and reset sessions already used `now()`, but reopening an existing active session returned its persisted `virtualNow` unchanged. The formatter was correct; the persisted Sandbox clock was stale.
- **Fix:** Added persisted `virtualTimeMode` (`realtime` or `manual`), synchronized stale realtime sessions when Playground opens, preserved manually advanced virtual time, and explicitly reanchored Reset to the current clock. Legacy sessions default to realtime during normalization.
- **Verification:** `tests/sandbox.test.ts` 27/27 passed; focused Chromium browser checks for current-on-open and current-on-Reset passed 2/2; TypeScript passed. The broader neighboring Playground rehearsal test still has an unrelated pre-existing media-inspection failure before it reaches the clock assertions.

## COMPLETE — Trace cross-Agent Presence style contamination

- **Started:** 2026-08-14
- **Scope:** Use runtime provenance and focused browser QA to determine why Genny, Dan Klone, and Alex Klonemozi can show similar OpenPresence/agent-loop posts, and why historical `QA-*` markers appear in Sandbox feeds. Verify Agent Brain, Presence Brief, Assignment instructions, AI decision context, Sandbox Mirror lineage, and Feed projection.
- **Product boundary:** Preserve `User → Agent → Presence`; public output must be grounded in the selected Presence and Assignment while internal QA instructions remain private. Local/Sandbox only; no live connector activity.
- **Verification:** Runtime provenance traced the reported posts from the selected Agent workspace through Presence, Assignment, AI decision, Sandbox execution, Mirror delivery, and Feed projection. The screenshot batches had distinct Agent/Presence/session/Assignment lineage, but the historical 10-post payloads were byte-for-byte identical because an older deterministic mock returned one shared candidate list. The `QA-NOW`/`QA-TEN` publications were intentionally created by earlier diagnostic Assignments and persisted as historical Sandbox Mirror data; current `cleanSandboxDraft` prevents new marker leakage, but does not rewrite history. A current-code API trace then exposed a second related defect: the mock classifier scanned the full private runtime prompt, allowing execution-envelope prose to steer a Genny-shaped workspace into the operator fixture family. The classifier now extracts only the explicit Assignment instruction before matching Presence style, with word-bounded precedence. Current local Sandbox trace completed Genny, Dan Klone, and Alex Klonemozi at 2/2 each, with distinct topic-grounded outputs, unique text, correct Agent/Presence/session/Assignment lineage, and zero QA markers. Focused AI tests pass 2/2; no live connector activity occurred.
- **Status:** Complete.

## COMPLETE — Three-agent concurrent Playground posting experiment

- **Started:** 2026-08-14
- **Scope:** Use three isolated Chrome tabs and three configured Agent/Presence pairs to assign and publish 10 Sandbox Playground posts each for Boardly-style, Dan Koe-style, and Alex Hormozi-style output. Verify immediate sequential delivery, feed counts, style grounding, context isolation, and recoverability.
- **Product boundary:** This is a local Sandbox/mock experiment only. It must not publish to live X or impersonate the referenced people; the test evaluates configured style emulation and product workflow, not identity deception.
- **Verification:** Three independent Chrome workers ran the UI against Social Mirror Sandbox worlds. Genny, Dan Klone, and Alex Klonemozi each completed a fresh 10-post Assignment with 10/10 verified publications, distinct outputs, correct topic/style grounding after the fixture-precedence fix, reload persistence, and no live-X activity. The run exposed and fixed context-insensitive mock candidates, operator/builder classifier precedence, and normalized SQLite projection loss when concurrent Agent workspaces wrote. The concurrent-tab Chromium regression passes 1/1; focused AI/runtime/Sandbox/X/concurrent-context coverage passes 129/129; typecheck, production build, changed-file ESLint, and `git diff --check` pass. Remaining UX debt: Start rehearsal completes the internal sequential loop without streaming individual post progress, the expanded `10 / 10 delivered` label is not restored after reload, and seeded history can make a fresh Sandbox look non-empty. Style emulation is differentiated and grounded, not indistinguishable impersonation; the profile explicitly avoids copying a real person's distinctive wording. Full Vitest remains unable to exit in the pre-existing Playground CLI child-process suite.
- **Status:** Complete.

## COMPLETE — Default new Agents to OpenAI GPT 5.6 Luna medium

- **Started:** 2026-08-14
- **Scope:** Ensure new Agents and untouched legacy Anthropic seeds use OpenAI `gpt-5.6-luna` at medium reasoning, while preserving explicitly configured provider/model choices.
- **Product boundary:** The model runtime is Agent-owned configuration; Presence switching must not change it, and provider implementation details remain outside social cognition.
- **Verification:** New-agent and narrow legacy-migration runtime coverage passes; full Vitest passes 160/160; focused Chromium and Pixel 5 Brain persistence E2E passes 2/2; typecheck, production E2E build, focused ESLint, and `git diff --check` pass. Existing Anthropic selections with configured access remain unchanged.
- **Status:** Complete.

## IN_PROGRESS — Refine Bridge Channel editor layout

- **Started:** 2026-08-14
- **Scope:** Remove confusing media summary copy and make Channel actions/media controls compact, aligned, and easier to scan.
- **Verification:** Chrome visual QA confirmed compact three-column actions, aligned checkbox/text, compact media controls, and removal of the confusing media summary. Focused Channel editor E2E passed. TypeScript, 158 Vitest tests, changed-file ESLint, production build, and `git diff --check` passed. The existing Bridge lifecycle E2E remains blocked later by its unrelated Schedule evaluation timeout.
- **Status:** Complete.

## IN_PROGRESS — Edit Bridge Channel configuration

- **Started:** 2026-08-14
- **Scope:** Let users edit an existing Bridge Presence's Channel name, destination, declared actions, and channel media support from Settings while keeping Bridge delivery limitations explicit.
- **Verification:** TypeScript, 158 Vitest tests, changed-file ESLint, production build, and Chrome QA passed. Chrome QA exercised the editor fields and media warning without mutating shared local data.
- **Status:** Complete.

## IN_PROGRESS — Make Bridge setup usable by external browser agents

- **Started:** 2026-08-14
- **Scope:** Make Bridge onboarding truthful and guided, add adapter heartbeat/check-in, expose a generated browser-agent contract without secrets, replace raw custom-channel capability entry, and document/test the generic Bridge lifecycle. Keep delivery local/mock-only; do not connect or mutate Skool.
- **Verification:** TypeScript, 157 Vitest tests, focused ESLint, production build, and Chrome QA passed. Chrome QA confirmed waiting-for-adapter state, instruction-copy feedback, prompt placeholder redaction, claim rule, and explicit unsupported-media messaging. No live Skool actions performed.
- **Status:** Complete.

## COMPLETE — Support independent Agent work across browser tabs

- **Started:** 2026-08-14
- **Scope:** Let a user work on two different Agents simultaneously in separate browser tabs or windows without one tab changing the other tab's selected Agent, Presence, conversation, or workspace context. No split workspace layout is in scope.
- **Product boundary:** Preserve `User → Agent → Presence`; Agent-wide meaning remains shared within an Agent, while each browser surface keeps an independent selected Agent context. QA and development remain local/Sandbox-only; no live connector activity is required.
- **Verification:** Separate Chrome tabs held Atlas and Jenny simultaneously with independent `agentId`/`presenceId` URLs; each tab sent Agent-scoped Teach work, reloaded, restored its own Agent and transcript, and switching Atlas↔Jenny in one tab left the other on Jenny. Chrome diagnostics showed no warnings/errors. The focused Playwright Chromium regression passes 1/1; the stale-snapshot unit regression passes; focused runtime/AI/Sandbox/X coverage passes 126/126; typecheck, production build, changed-file ESLint, and `git diff --check` pass. Full Vitest remains unable to exit in the pre-existing Playground CLI child-process suite; the other 12 focused test files pass when run independently. No live connector activity occurred.
- **Status:** Complete.

## IN_PROGRESS — Browser-verify custom Skool Bridge setup

- **Started:** 2026-08-14
- **Scope:** Use the real interface in an isolated development runtime to create a new Agent and Skool Presence, configure Bridge capabilities for posts, likes, comments/replies, and GIF/image-capable publication, and inspect whether the workflow is understandable and bottleneck-free.
- **Product boundary:** Keep the Agent mind separate from the Presence, the custom Skool Channel separate from the Bridge connector, and all live delivery out of scope for this QA run.
- **Verification:** Main-database Chrome flow created `Skool Community Agent` with a custom `Skool Community` Channel and `@skool_community` Presence; the route persisted as Bridge; a Bridge named `Skool` was created; supervised Post, Comment, and Like capabilities persisted after reopening Settings; the one-time Bridge key appeared only at creation; no Skool credentials or external actions were used; Chrome diagnostics were clean. The current Bridge protocol does not carry inbound `assetRefs`, and claimed executions expose publication asset IDs without uploadable asset data, so image/GIF delivery remains an implementation gap. Official Skool policy also prohibits bots, scraping, and automated posting/commenting, so no live Skool adapter was connected.
- **Status:** Complete with media/integration gap recorded.

## COMPLETE — Revalidate 10-post Assignment lineage and marker hygiene

- **Started:** 2026-08-14
- **Scope:** Trace a fresh Assignment through AI decision, Sandbox execution, Social Mirror delivery, and Feed projection; verify distinct output, truthful progress, real observed timestamps, and no internal QA-marker leakage.
- **Product boundary:** Assignment instructions are operator context, not public copy. A Sandbox post counts only after a succeeded execution creates a Mirror object; Feed is the visible acceptance surface and must not imply live X publication.
- **Verification:** Connected Chrome on an isolated local Sandbox completed `10 / 10 delivered`; runtime state contained 10 succeeded Assignment executions, 10 Mirror posts, 10 unique normalized texts, and zero `QA-TEN-RUN-2026-08-14` markers. Feed rendered exactly 10 items with `observedAt` timestamps and explicit simulated-world-time titles. A provider-backed attempt truthfully stopped at `0 / 10` with actionable “Sandbox evaluation unavailable” events when Anthropic was not connected. Vitest passes 155/155; Assignment/marker E2E passes 8/8 Chromium and 2/2 Pixel 5; typecheck, production build, and `git diff --check` pass. No live X write occurred.
- **Status:** Complete.

## IN_PROGRESS — Enforce Presence-scoped Playground worlds

- **Started:** 2026-08-14
- **Scope:** Ensure switching Presence changes Playground's channel, Sandbox world, Social Mirror, simulated actors, relationships, rehearsal history, calibration evidence, and related world-derived state without changing the underlying Agent mind.
- **Product boundary:** Preserve `User → Agent → Presence`; Brain, Soul, Mission, Taste, Memory, Skills, Tools, and model remain Agent-level, while Playground embodiment is Presence-scoped.
- **Verification:** Runtime isolation coverage confirms distinct Presence/session/environment/channel roots, no Mirror or actor records cross into a new Presence, and Agent-level meaning files remain unchanged. The responsive E2E regression passes on Chromium and Pixel 5; full Vitest passes 154/154; typecheck, production build, and `git diff --check` pass. Isolated browser inspection confirms Playground is labeled “Presence rehearsal” and Playground is in Presence navigation. The shared `localhost:3001` dev server was left untouched after concurrent Next processes corrupted its `.next` chunks.
- **Status:** Complete.

## COMPLETE — Fix duplicate Assignment binding in the state route

- **Started:** 2026-08-14
- **Scope:** Resolve the production compile failure in `runSandboxAssignment`, where the loop binding and post-loop cleanup both declared `assignment`.
- **Verification:** TypeScript compilation and the production Next build pass; focused runtime/Sandbox tests pass 86/86; `git diff --check` passes. The cleanup binding is now explicitly named `finalAssignment`.
- **Status:** Complete.

## COMPLETE — Remove individual Playground feed items

- **Started:** 2026-08-14
- **Scope:** Give each Sandbox Playground post, reply, and social event a small accessible removal control without clearing the rest of the rehearsal.
- **Product boundary:** This is local Sandbox curation only; it cannot remove live X content. The mutation is scoped to the current Playground session and removes the selected Mirror object plus its derived perception/event mirror record.
- **Verification:** Full Vitest passes 152/152; the new removal flow passes in Chromium and Pixel 5; typecheck, production Next build, focused ESLint, and `git diff --check` pass. Existing Next `<img>` optimization warning remains.
- **Status:** Complete.

## COMPLETE — Keep Attention Rhythm in Presence Settings

- **Started:** 2026-08-14
- **Scope:** Remove the duplicated Rhythm summary from Activity while preserving the full attention rhythm controls in Presence Settings.
- **Product boundary:** Activity shows observed context, Presence decisions, and delivery state. Rhythm is Presence configuration and belongs in Settings.
- **Verification:** Fresh Chrome on isolated `localhost:3231` confirmed Activity no longer renders “When Jenny pays attention” while Settings still renders the rhythm controls and quiet-hours state; Chrome reported no console errors. Focused Chromium + Pixel 5 E2E passed 4/4; full Vitest passed 151/151; typecheck, focused ESLint, and `git diff --check` passed.
- **Status:** Complete.

## COMPLETE — Make Schedule Assignments first-class calendar objects

- **Started:** 2026-08-14
- **Scope:** Put scheduled Assignments in the Week calendar as a distinct visual object, open a review surface on click, and make cancellation available from that surface.
- **Product boundary:** Standing intents grant permission to notice and decide; Assignments delegate an outcome without turning the schedule into a promise to publish. Cancelled Assignments must leave the active viewpoint.
- **Acceptance:** The Week calendar is the primary Assignment surface; clicking a scheduled Assignment opens details with progress, timing, run/retry, and cancel actions; List view uses the same detail surface; updated copy explains the difference between Standing intents and Assignments.
- **Verification:** Calendar Week and Assignment cancellation/exact-time E2E pass 3/3 in Chromium and 3/3 on the mobile viewport; typecheck passes; focused ESLint reports 0 errors with only the existing `<img>` warning; production build passes with the same warning; `git diff --check` passes. The Week view no longer duplicates the Assignment list, and cancelled Assignments leave the active viewpoint.
- **Status:** Complete.

## COMPLETE — Verify 10-post Feed delivery and 10-reply context rehearsal

- **Started:** 2026-08-14
- **Scope:** QA the Playground “Give an Assignment” and Schedule Assignment flows, verify cancelled Assignments leave the active viewpoint, and rehearse a Boardy-style 10-post / 10-reply Sandbox session.
- **Product boundary:** A requested quantity is a verified outcome, not a count of attempted drafts. Feed shows every successful public Sandbox publication; reply cognition uses the newest inbound object rather than stale thread text. No live X activity is part of this QA.
- **Verification:** Fixed quantity-aware Assignment attempts and expanded deterministic candidates; fixed cancelled Assignment filtering; fixed local reply fixtures to match only the newest inbound object. Chrome verified exactly 10 Feed originals, exactly 10 Feed replies, and 10 unique reply texts including the provided introductions example. Full unit suite passes 149/149; focused Chromium + mobile Assignment/Schedule suite passes 14/14; typecheck and production build pass with the existing Next `<img>` warning; clean Chrome load has no current console errors.
- **Status:** Complete.

## COMPLETE — Diagnose Chat responding about the Agent instead of as a Presence

- **Started:** 2026-08-14
- **Scope:** Reproduce the reported Presence Chat context failure in connected Chrome and trace the selected post → runtime → rendered reply path.
- **Product boundary:** Presence Chat is a private rehearsal of the selected Presence responding to a simulated social-world post. It must not collapse into Teach, generic Agent self-description, or expose internal runtime context.
- **Acceptance:** A user can add a post, select Reply, and receive a context-sensitive Presence response to that post; standalone posts remain non-reply context; errors are visible and no internal telemetry remains after debugging.
- **Verification:** Connected Chrome reproduced the defect, then verified a standalone founder/quietness post received a public-self response with no `Agent runtime` wording; explicit Reply mode preserved the selected post and produced an edge-case-specific reply; Chrome console showed no errors. Runtime telemetry was content-free, temporary, and removed after localization. Added AI and E2E regression coverage. Full Vitest passes 150/150; typecheck passes; changed-file ESLint passes; focused Chromium Chat E2E passes 2/2. The existing Pixel 5 Chat viewport assertion remains red before message submission (`composerBottom` 777.6px vs 727px viewport) and is outside this response-layer change.
- **Status:** Complete.

## IN_PROGRESS — Bring CLI parity to Playground, Schedule, and Watching

- **Started:** 2026-08-14
- **Scope:** Extend the agent CLI with the latest Playground rehearsal/Assignment controls plus Presence-scoped Schedule and Watching workflows so experiments can run without parsing the browser UI.
- **Product boundary:** Keep the CLI machine-readable and Sandbox-scoped. Schedule remains permission to consider; Watching records attention instructions without inventing observations; Assignments advance only from verified Sandbox outcomes.
- **Acceptance:** `playground` supports original rehearsal feedback and Assignment lifecycle operations; `schedule` supports list/add/edit/run/cancel with Consider versus Assign semantics; `watching` supports list/add/remove with truthful source status; contract tests and real local CLI smoke pass.
- **Verification:** `tests/playground-cli.test.ts` passes 11/11; full Vitest passes 147/147; typecheck, focused CLI/test ESLint, syntax, and `git diff --check` pass; production build passes with only the existing Next `<img>` warning. Real local smoke on isolated `localhost:3217` covered Playground start → inject → advance → timeline → reset, Schedule Consider add/list/edit/run, scheduled Sandbox Assignment creation and 2/2 verified completion, original rehearsal → preference feedback, automatic/manual Watch add/list/remove, and the `LIVE_SCOPE_BLOCKED` guard for non-Sandbox Schedule evaluation. No live connector delivery occurred.
- **Status:** Complete.

## COMPLETE — Make Genny's Boardy-style rehearsal truthful and useful

- **Started:** 2026-08-14
- **Scope:** Diagnose repeated Sandbox posts, stuck Assignments, missing Assignment visibility in Schedule, and the gap between the requested multimodal/conversational experiment and the current Playground/Feed experience.
- **Product boundary:** Prove a Presence can build a recognizable, selective, multimodal social presence without copying Boardy, inventing network access, or treating a schedule as an obligation to publish. Keep Agent cognition, Social Intent, Execution, Delivery, and Outcome distinct.
- **Acceptance:** Repeated fixtures are eliminated or clearly marked as deterministic replay; every Assignment has an actionable lifecycle with truthful failure/retry/cancel state; scheduled Assignments are visible in the same week calendar as future execution candidates; Playground and Feed show original posts, replies, and supported assets with provenance; Chat tests a context-sensitive social decision rather than generic assistant output.
- **Verification:** Reproduced the duplicate-post and stalled-Assignment flows in isolated Chrome and state responses; runtime evidence localized the defects to deterministic candidate exhaustion, non-idempotent Sandbox delivery, and Schedule projection. Added duplicate candidate rejection, exactly-once delivery, scheduled Assignment calendar cards with 00:00–23:00 coverage, actionable Run/Retry controls, deterministic multimodal Sandbox fixtures, Feed asset rendering, and a specific consent-aware Presence Chat fixture. `npm test` passes 144/144; typecheck passes; focused Chromium feature E2E passes 5/5; focused Chromium + mobile regression E2E passes 8/8; production build passes with one existing Next `<img>` optimization warning. Chrome on isolated `localhost:3120` verified 5/5 distinct posts, image/chart/GIF/link/video in Feed, a 23:35 Assignment on the Week calendar, execution from the calendar into Playground, and a context-sensitive introduction reply. No live X write was performed. The full Chromium suite reports 48/57; the nine remaining failures are outside this narrow feature scope (legacy Activity/Bridge/X-connection selectors and existing Schedule List-vs-Week assumptions).

## COMPLETE — Genny Boardy-style Sandbox rehearsal

- **Started:** 2026-08-14
- **Scope:** Configure Genny inside Jenny through the app, exercise Teach/Chat/Playground, schedule weekly attention, and produce a 15+ item simulated post/reply rehearsal without real-X publication.
- **Safety boundary:** Use the local Sandbox Presence and simulated connector only; do not publish, message, or change the real X account.
- **Delivery:** Commit all intended worktree changes and push after the focused QA audit.
- **Verification:** Boardy’s public profile was inspected read-only in Chrome; Genny was selected as Jenny’s X Sandbox Presence; Teach recorded agent-wide anti-impersonation/usefulness guidance; Genny’s Presence Brief and Public Self were configured through Settings; Chat produced a private feed reply; Playground completed three 5/5 Assignments; the Sandbox Mirror contains 16 Genny original posts and a contextual reply chain with two inbound replies; Schedule shows seven weekdays plus three exact-time Assignments at 23:35, 23:38, and 23:41 local time. No live X post, reply, message, or configuration was sent.

## COMPLETE — Prevent quoted Ghost mentions from mutating Presence state

- **Started:** 2026-08-13
- **Scope:** Keep Teach focused on the operator's actual request when social handles or quoted world text contain `ghost`; make the reported post-formatting preference produce a truthful reviewable proposal with explicit interim behavior.
- **Product boundary:** Teach may shape durable meaning only through reviewable proposals. A social-world mention is context, not a command, and must not silently change `User → Agent → Presence` identity.
- **Acceptance:** The exact `@jenny_ghost write a post about SpaceX` example leaves the Presence Agent-owned; explicit “Put this Presence into Ghost mode” still works; the one-sentence-per-paragraph post preference records a `TASTE` proposal and states that replies remain normally formatted.
- **Verification:** 140 unit tests, focused Teach Chromium/mobile E2E (4/4), exact screenshot wording in connected Chrome on isolated `localhost:3108`, production build, typecheck, changed-file lint, `git diff --check`, and zero Chrome console warnings/errors. No external connector or production state was mutated.

## COMPLETE — Diagnose failed Assignment posting

- **Started:** 2026-08-13
- **Scope:** Trace why an explicit Sandbox Assignment remains at `0 / 4 delivered` after starting rehearsal, localize the failing runtime layer, and restore verified publication progress.
- **Product boundary:** Assignment work remains Sandbox-only during QA; only a publication observed in the Social Mirror advances progress. Model failure, delivery failure, and candidate rejection must remain distinct and truthful.
- **Acceptance:** Starting the shown Assignment produces a truthful success or failure state, and a successful run advances the Assignment from `0 / 4 delivered` with the corresponding verified Sandbox publication visible.
- **Verification:** Runtime telemetry localized the failure to Ghost candidate validation before execution. The fix now distinguishes public subject matter from self-referential provider/model disclosure; the same local Sandbox Assignment reached `4 / 4 verified`, `completed`, four succeeded simulated executions, and zero system failures. Runtime and identity-boundary tests passed; temporary detailed telemetry was removed. Chrome was attempted, but the existing localhost tab was already claimed by another browser session, so the final execution proof came from the local state route and Sandbox Mirror.

## COMPLETE — Clarify Watch lifecycle language

- **Started:** 2026-08-14
- **Scope:** Remove the contradiction between an active Watch and the implementation-shaped `Performance baseline · Not started` label.
- **Acceptance:** The Watch card tells the operator whether the Watch is active, what it is waiting for, and whether any action is required; it does not expose an unexplained performance metric.
- **Flow under test:** Chrome Watching surface → persisted Watch observation state → lifecycle copy.
- **Verification:** Fresh Chrome on isolated `localhost:3106` verified both automatic and manual states with no console errors; focused Watching E2E passed 4/4 across Chromium and Pixel 5 after rebuilding `.next-e2e`; runtime tests, typecheck, focused lint, and `git diff --check` passed.

## COMPLETE — Debug Watching in Chrome

- **Started:** 2026-08-13
- **Scope:** Reproduce the user-reported Watching failure in the real Chrome session and distinguish feature failure from a stale local browser build.
- **Acceptance:** Chrome loads the current Watching navigation, creates and persists a creator/topic/opportunity Watch, reloads it, removes it, and preserves an explicit no-observations state.
- **Verification:** Fresh Chrome run on `localhost:3103` completed load → create → remove with 200 responses and no console errors; focused Watching E2E passed 4/4 across Chromium and Pixel 5; 59 runtime tests, typecheck, changed-file ESLint, isolated production build, and `git diff --check` passed. The original `localhost:3001` tab was stale and did not contain Watching; regression rule added for active-origin/client-bundle verification.

## COMPLETE — Clarify Assignment ownership in the review card

- **Started:** 2026-08-13
- **Scope:** Make the Assignment review card distinguish the operator-owned outcome from the Agent-owned approach; remove the ambiguous `Jenny decides` label while preserving the list of decisions Jenny makes.
- **Product boundary:** Assignments own the expected outcome; the Agent owns how to accomplish it. This is a user-facing authority explanation and does not change runtime behavior.
- **Acceptance:** After reviewing an Assignment, the card says `Agent decides how`, keeps the topics/thesis/evidence/format/wording/timing list, and does not imply that the Assignment is optional or that Jenny owns the requested deliverable.
- **Verification:** 136 unit tests, focused Assignment lifecycle E2E 6/6 across Chromium and Pixel 5, typecheck, changed-file lint, production build, isolated E2E build, and `git diff --check`.

## COMPLETE — Add Presence-level Watching

- **Started:** 2026-08-13
- **Scope:** Add a first-class Watching surface for Presence-scoped attention, with natural-language creator/topic/opportunity Watches, review-before-start confirmation, truthful automatic/manual source status, persistence, and removal.
- **Product boundary:** Watching is the Presence's eyes, not a publishing queue or creator-remixing instruction. Watches preserve `User → Agent → Presence`, do not rewrite identity, do not invent observations, and keep observed-world evidence separate from Agent action.
- **Acceptance:** An operator can open Watching, add a creator or free-form social-world description, inspect the inferred meaning and boundary, start the Watch, reload it, remove it, and see an explicit no-observations state until a source supplies evidence.
- **Verification:** 58 runtime tests, 4/4 focused Watching E2E cases across Chromium and Pixel 5, isolated production build via `.next-e2e`, typecheck, `git diff --check`, and exploratory browser review at 1440px and 390px with no console errors or horizontal overflow. Repository-wide lint remains noisy/red from pre-existing generated artifacts under `tmp/`; source typecheck and feature-focused gates passed.

## COMPLETE — Implement Assignment control layer

- **Started:** 2026-08-13
- **Scope:** Add the first-class Assign authority alongside existing Consider behavior, with prompt-driven compilation, verified Sandbox progress, distinct failure states, and focused Playground/Schedule/Operating Status/Activity/Feed UX.
- **Product boundary:** Preserve `User → Agent → Presence`, Taste, silence for ambient consideration, the separation of cognition from execution/delivery/outcome, and the Sandbox-only boundary during QA. Assignment progress counts only verified Social Mirror publications.
- **Acceptance:** An operator can create or rehearse an Assignment, review what OpenPresence understood, start it, see truthful progress, and distinguish candidate rejection, model failure, delivery failure, incomplete work, and completion. Existing Consider flows remain behaviorally unchanged.
- **Verification:** 56 runtime tests, 23 Sandbox tests, and 12 AI tests passed; desktop and 390px mobile Sandbox browser QA passed with no console warnings or horizontal overflow; Assignment rehearsal reached 2/2 verified publications in the Sandbox Mirror; Schedule, Activity, Feed, and provenance surfaces were inspected; typecheck, changed-file lint, production build, and `git diff --check` passed.

## COMPLETE — Make Feed the canonical Presence public-history surface

- **Started:** 2026-08-13
- **Scope:** Replace the Presence-level Calendar navigation item with Feed; keep Calendar as a view over the same verified public-history projection.
- **Product boundary:** Feed shows what the Presence actually put into the world; Activity remains operational history; Schedule remains future consideration permission. No drafts, no-ops, failed executions, private messages, or internal events enter Feed.
- **Acceptance:** Feed opens newest-first with lightweight date headings, All/Originals/Replies/Quotes/Reposts filters, inspectable publications, and Sandbox/live provenance. Calendar remains reachable inside Feed and continues to visualize the same records.
- **Verification:** 4/4 focused Feed/Calendar Chromium tests, 4/4 focused mobile tests, compact desktop layout regression, 132 unit tests, typecheck, changed-file lint, production build, and `git diff --check` passed. Full Chromium E2E was started and exposed an unrelated pre-existing Brain provider-selection failure before later legacy cases; no Feed-focused test failed.

## COMPLETE — Keep Teach person-shaped for low-information operator cues

- **Started:** 2026-08-13
- **Scope:** Stop Teach from treating punctuation or symbol-only operator turns as invitations to perform generic assistant onboarding, and make the operator-facing prompt explicitly person-shaped.
- **Product boundary:** Teach is the operator-facing conversation that shapes the private Agent; Chat is the selected Presence's public-self rehearsal. Neither surface should collapse the Agent into a generic support assistant.
- **Acceptance:** A punctuation-only Teach turn persists as operator context without an Agent reply or model call; substantive Teach turns retain durable-change handling; historical transcripts remain intact.
- **Verification:** 129 unit tests, focused Chromium Teach/Presence Chat E2E (4/4), typecheck, changed-file ESLint, isolated production build, and \`git diff --check\` passed.

## COMPLETE — Remove the ambiguous channel label from the Playground Presence chip

- **Started:** 2026-08-13
- **Scope:** Remove the trailing `X` channel label from the top-right Presence identity chip in Playground because it visually resembles a close control.
- **Product boundary:** Keep the Presence identity clear and preserve channel context in the surrounding `Simulated X` and Sandbox labels; this is a presentation-only change.
- **Acceptance:** The chip shows the channel icon and Presence name without a trailing close-like label; the actual channel remains legible elsewhere in Playground; desktop and mobile remain usable.
- **Verification:** Isolated Chromium and mobile E2E checks pass: the chip renders only the Presence name while `Simulated X` remains visible. Production build, typecheck, changed-file ESLint, 89 feature-relevant unit tests, and `git diff --check` pass. The broader existing Playground scenario still stops later at its unrelated `Media needs inspection` assertion after media attachment; the chip assertions pass before that point.

## COMPLETE — Make low-information social cues context-sensitive

- **Started:** 2026-08-13
- **Scope:** Teach the Agent to interpret fragments, punctuation, emoji, brief acknowledgments, and casual greetings from thread and relationship context rather than treating them as automatic questions or reply obligations.
- **Product boundary:** Preserve silence as a successful social act; permit the smallest natural signal or acknowledgment when a cue genuinely opens an exchange; never expand a one-character cue into assistant-style onboarding or invent a topic.
- **Acceptance:** Fresh Playground cases distinguish noise (`.` / `?` / `👀` / `ok` / `Thanks`) from a casual opening (`What's good?`) without phrase-specific runtime branches.
- **Verification:** 127 unit tests, Brain/system-prompt regression, isolated Chrome Playground experiment, typecheck, changed-file lint, isolated production build, and `git diff --check` passed. The real-model experiment chose `no_op` for `.` and a short Sandbox reply for `What's good?`; exact wording remains intentionally unconstrained.

## COMPLETE — Keep Playground Control Room inside the viewport

- **Started:** 2026-08-13
- **Scope:** Prevent long Control Room decision details, especially the `Now` container, from expanding the Playground beyond the visible viewport.
- **Product boundary:** Preserve the Control Room as an operator-readable explanation of Agent judgment; contain overflow through layout and wrapping rather than hiding the decision or exposing implementation mechanics.
- **Acceptance:** Desktop Playground has no horizontal overflow; long `Now` details wrap within the rail; the rail and rehearsal history remain visible; the responsive layout remains usable at mobile widths.
- **Verification:** Before the fix, the 264px rail's sections rendered at about 413px and pushed document width to 1373px at a 1280px viewport. After the fix, desktop and 390px mobile browser checks report document width equal to the viewport, Control Room sections contained within the rail, and no horizontal overflow. Focused Original Post Rehearsal E2E passed on Chromium and Pixel 5 with viewport-fit assertions, 87 feature-relevant unit tests, typecheck, changed-file ESLint, production build, and `git diff --check` passing.

## COMPLETE — Make Original Post Rehearsal input inspectable

- **Started:** 2026-08-13
- **Scope:** Make the exact operator-submitted inspiration easy to find and open from every Original Post Rehearsal attempt, including silence/no-op outcomes.
- **Product boundary:** Preserve the submitted text as operator context, keep it out of the simulated social world, and do not imply that the input commanded publication or served as a reward.
- **Acceptance:** After a rehearsal completes, the history card visibly offers a `View what you submitted` action; opening it shows the exact submitted text (or clearly states that no inspiration was supplied) and explains how the context was used. The control works on desktop and mobile and remains available when Genny chooses silence.
- **Verification:** Focused Chromium + Pixel 5 E2E confirms the exact submitted text opens in the expanded detail panel, the context-only boundary remains visible, and the rehearsal history stays viewport-contained; 87 feature-relevant unit tests, typecheck, changed-file ESLint, production build, and `git diff --check` pass. Direct browser checks also confirmed the disclosure at desktop and mobile widths with no console or request failures.

## COMPLETE — Make Original Post Rehearsal produce a usable original-post outcome

- **Started:** 2026-08-13
- **Scope:** Diagnose and fix the narrow Original Post Rehearsal flow when an explicit consideration ends in “no sufficiently worthwhile original expression,” including AI decision parsing, Sandbox intent formation, and the operator-visible outcome.
- **Product boundary:** Preserve Agent judgment and the right to remain silent; an explicit rehearsal must still yield a truthful, inspectable result and must not publish to a live connector or turn preference evidence into a reward.
- **Verification:** 126 unit tests, typecheck, changed-file ESLint, production build, `git diff --check`, and focused Original Post Rehearsal E2E passed on Chromium and Pixel 5. The browser flow verifies a Sandbox publication, private inspiration non-leakage, persisted `fits` preference evidence, Sandbox-only execution lineage, responsive interaction, and no console errors or failed requests. Deliberate no-op state remains covered by runtime tests; real-model quality evaluation was not run because no model call was required for this regression.

## COMPLETE — Preserve commas while editing Presence Brief territories

- **Started:** 2026-08-13
- **Scope:** Keep comma-separated Presence Brief textarea input stable while typing, then normalize territory values only at save time.
- **Acceptance:** Commas remain visible in Primary territory, Adjacent territory, and Keep out drafts; saved values are trimmed arrays; cancel restores the saved Brief; desktop and mobile editing remain usable.
- **Verification:** 123 unit tests, typecheck, isolated production build, changed-file ESLint, `git diff --check`, and focused Settings E2E on Chromium + Pixel 5 passed. The browser flow verifies trailing commas remain visible before save and comma-separated values persist after reopening. Repository-wide lint remains blocked by unrelated generated bundled files under `tmp/openpresence-social-v2.78dZil/next`; changed files lint cleanly.

## COMPLETE — Make Schedule timing progressive and intention-centered

- **Started:** 2026-08-13
- **Scope:** Keep the internal consideration/execution window while removing the implementation-shaped field from the default Schedule form.
- **Acceptance:** The default form shows Standing instruction, When, Objective, and Save; Timing options is collapsed by default and explains Flexible, Exact, and Custom relevance; existing runtime data remains compatible; desktop and mobile layouts remain usable.
- **Verification:** 123 unit tests, typecheck, production build, lint, `git diff --check`, and focused Schedule E2E on Chromium + Pixel 5 passed. The browser flow verifies the raw field is absent by default, Timing options starts collapsed, Flexible is explained as the recommendation, and Custom values persist as consideration copy.

## COMPLETE — Render submitted turns before Chat and Teach responses

- **Started:** 2026-08-13
- **Scope:** Make Presence Chat and Teach render the submitted operator message immediately, show an explicit in-flight thinking state while the model runs, then reconcile to the authoritative Agent response without duplicate turns.
- **Product boundary:** The loading state communicates that cognition is in progress without exposing hidden chain-of-thought, provider details, or execution mechanics. Teach remains Agent-wide durable-shaping conversation; Presence Chat remains session-only public-self rehearsal.
- **Acceptance:** Both surfaces show `You → Thinking → Agent`; delayed responses do not leave a blank transcript; one submission persists as one user turn and one response; duplicate submits are ignored; desktop and mobile remain usable.
- **Verification:** 123 unit tests, production build, typecheck, lint, delayed-response Chromium + mobile E2E coverage for Chat and Teach, transcript cardinality assertions, and responsive chat viewport assertions passed.

## COMPLETE — Explain Activity decision provenance

- **Started:** 2026-08-13
- **Scope:** Clarify the selected Presence's Activity decision rows so an operator can see what was observed, what social judgment was made, which action was selected, and whether delivery is pending, reviewed, or complete.
- **Product boundary:** Preserve the separation between world observation, Agent judgment, Social Intent, Execution, Delivery, and Outcome. This is an evidence presentation fix, not a new cognition or execution behavior.
- **Acceptance:** Repeated settings/system events no longer read as if they were meaningful social decisions; a decision row names its trigger/evidence, chosen action or silence, and current delivery state; the explanation remains truthful when evidence is missing.
- **Verification:** 123 unit tests, focused Activity Chromium + mobile E2E regression passed, fresh Sandbox browser review confirmed distinct provenance lines on desktop and 390px mobile with no horizontal overflow, browser logs were clean, typecheck, lint, production build, and `git diff --check` passed.

## COMPLETE — Separate Teach, Presence Chat, and Playground

- **Started:** 2026-08-13
- **Scope:** Make Teach the operator-facing Agent-shaping surface, make Chat a direct conversation with the selected Presence's public self, and keep Playground as isolated simulated-world rehearsal. Presence Chat must use the social cognition path with local delivery and session-only memory by default.
- **Product boundary:** Preserve `User → Agent → Presence`; Chat does not mutate durable Agent Memory, Growth, Presence identity, or live connector state unless the operator explicitly creates a later teaching proposal. Playground remains simulated and isolated.
- **Acceptance:** Sidebar labels and destinations communicate the three distinct interaction modes; Chat loads the selected Presence context and maintains test-conversation continuity; attachments can be sent with truthful perception state; Teach is clearly framed around proposals/change sets; Playground remains a simulated rehearsal surface.
- **Verification:** 122 unit tests, AI prompt coverage for selected Presence/session history, normalized SQLite projection, focused Presence Chat/Teach E2E on Chromium and Pixel 5, responsive exploratory browser review with attachment and `What Presence sees` disclosure, console/network inspection, typecheck, lint, production build, and `git diff --check`. The focused acceptance suite passed 8/8, including the corrected mobile safe-area interaction. The broader legacy E2E suite remained partially red in pre-existing Playground/Calendar/Bridge lifecycle cases outside this change; no focused Teach or Presence Chat case failed after the final fixes.

## COMPLETE — Confirm Auto transitions before approving pending replies

- **Started:** 2026-08-13
- **Scope:** When a Presence capability changes from Review to Auto, show the exact number of pending review executions and require confirmation before approving and processing them.
- **Safety boundary:** Local settings/runtime and test Sandbox only; no live connector or production mutation during QA.
- **Acceptance:** Switching one capability to Auto with no pending review actions applies immediately; with pending actions it shows a count confirmation, cancel leaves settings/actions unchanged, confirm applies Auto and processes all matching pending review executions.
- **Verification:** Runtime/unit coverage, focused Activity/Settings Chromium + Pixel 5 browser flow, typecheck, lint, production build, and `git diff --check`.

## COMPLETE — Make the Activity review CTA visually prominent

- **Started:** 2026-08-13
- **Scope:** Increase the visual prominence and contrast of the `Approve execution` CTA in the Activity decision card without changing approval semantics or execution boundaries.
- **Safety boundary:** Local UI styling and browser QA only. No live connector, external account, or production state mutation.
- **Acceptance:** A pending review action is immediately recognizable as the primary CTA on desktop and mobile, remains keyboard-focusable, and retains readable contrast in enabled, hover, focus, and disabled states.
- **Verification:** 115 unit tests, typecheck, lint, production build, `git diff --check`, and the Activity review lifecycle with CTA contrast, sizing, and keyboard-focus assertions passed on Chromium and Pixel 5.

## COMPLETE — Stack Playground replies and scope Activity to the selected channel

- **Started:** 2026-08-13
- **Scope:** Show simulated inbound messages/posts with Jenny's replies in one readable thread; constrain Activity to the selected Presence's channel and current Sandbox/live environment; clarify Playground event language and replace causal preview copy with `↳`.
- **Safety boundary:** Presentation and local Sandbox projection only. No live connector, external account, or production state mutation.
- **Acceptance:** A user can relate each Jenny reply to the message/post it answers; Sandbox Activity contains only Sandbox events for the selected channel; live channel Activity contains only that channel's activity; Activity uses a `Playground` tag for simulated posts and `↳` for observed context.
- **Verification:** 106 unit tests, typecheck, lint, production build, `git diff --check`, and focused Activity/Playground lifecycle, threading, and Sandbox/live scoping flows passed on Chromium and Pixel 5.

## COMPLETE — Make Presence rhythm settings discoverable and complete

- **Started:** 2026-08-13
- **Scope:** Explain Rhythm in user terms, make the settings entry point obvious, give Recommended/Gentle/Custom meaningful behavior, and expose Quiet hours as a real Presence-scoped control without changing Agent identity or forcing publication.
- **Safety boundary:** Local Presence configuration and development QA only; no live connector mutation or production state change.
- **Acceptance:** A customer can find rhythm settings from Activity, understand attention cadence versus publishing/reply permissions, configure a custom interval and quiet-hours window, see the saved state reflected in Activity, and use the controls on desktop and mobile.
- **Verification:** Runtime setting and overnight scheduling tests passed (93 repository tests total), isolated production build, typecheck, lint, and `git diff --check` passed. Focused Chromium + Pixel 5 browser flow passed with persistence, console/network checks, and no responsive overflow; exploratory desktop/mobile screenshots confirmed the rhythm card, attached Quiet hours toggle, and mobile layout.

## COMPLETE — Repair Activity duplicate source previews

- **Started:** 2026-08-13
- **Scope:** Stop Activity decision rows from reusing the same observed post when event lineage is missing or points to a reaction object; preserve truthful target context for replies, likes, executions, and Sandbox observations.
- **Safety boundary:** Presentation and local Sandbox lineage only; no live connector, external account, or production state mutation.
- **Acceptance:** Each Activity context preview belongs to the event's explicit source/target, unlinked legacy events do not guess context, repeated decisions remain individually attributable, and desktop/mobile Activity remains readable and console-clean.
- **Verification:** Runtime lineage regression, focused Chromium + Pixel 5 Activity flow with repeated Sandbox events, isolated production build, typecheck, lint, and `git diff --check` passed. The focused Activity suite passed 10 desktop/mobile cases with console, failed-request, and responsive-overflow checks.

## COMPLETE — Add OpenRouter provider access and lock connection identity

- **Started:** 2026-08-13
- **Scope:** Add OpenRouter to Brain provider access and model runtime selection, preserve its existing OpenAI-compatible backend path, and prevent provider connection names from being edited or renamed.
- **Safety boundary:** UI/runtime configuration only; no live provider request or production credential mutation during QA. Avoids the Playground cognition/CLI files owned by task `019ff960-b9c9-7432-b958-af13d464a229`.
- **Acceptance:** OpenRouter is visible and can be configured with an API key; its hosted endpoint and a selectable model are usable; connection identity is provider-owned and not editable; existing OpenAI/Ollama setup remains intact.
- **Verification:** OpenRouter endpoint/runtime routing test, canonical-label runtime regression, focused Brain Playwright flow passed on Chromium and Pixel 5, isolated production build, 89 unit tests, typecheck, lint, and `git diff --check`.

## COMPLETE — Center Add a Presence modal and clarify platform handles

- **Started:** 2026-08-13
- **Scope:** Make the Add a Presence overlay full-viewport and center its dialog; clarify that a Presence handle is the platform/social identity used by the Agent and Social Mirror.
- **Safety boundary:** No Activity redesign, Playground/API/runtime/perception/CLI changes, live connector mutations, or production operations.
- **Acceptance:** The modal backdrop covers the viewport, the dialog is centered at desktop and mobile widths, the handle field has platform-specific language, and the handle remains available to runtime cognition/context without becoming Agent-wide identity.
- **Verification:** Scoped Add Presence browser coverage passed on Chromium and Pixel 5; 84 unit tests, typecheck, lint, production build in an isolated clean copy, and `git diff --check` passed. The existing runtime context and Social Mirror identity test confirms the handle remains Presence-scoped and is available to authored social objects.

## COMPLETE — Browse stacked Calendar publications from the inspector

- **Started:** 2026-08-13
- **Scope:** Add inspector navigation for dense Week-view cards and replace the ambiguous `PUBLIC EXPRESSION` label with a concrete post-specific label.
- **Safety gate:** Presentation-only; no publication, connector, Playground, runtime, or Activity behavior changes.
- **Acceptance:** Previous/Next changes the displayed selected post and position indicator; the label is concrete; navigation works in populated and single-item states on desktop and mobile.
- **Verification:** Browser QA confirmed the concrete `Post details` label and disabled boundaries for a single item; the focused Calendar history suite passed all 4 tests on Chromium and Pixel 5, including a two-publication Previous/Next flow. Unit tests (83), typecheck, lint, build, and `git diff --check` passed.

## COMPLETE — Keep late-day Calendar publications fully visible

- **Started:** 2026-08-13
- **Scope:** Prevent Week-view publication cards near 23:00 from being clipped by the timeline container, including the card footer/proof line shown in the reported screenshot.
- **Safety gate:** Presentation-only change; no runtime, publication, connector, or Sandbox state is mutated.
- **Acceptance:** A late-day card remains fully visible, the Calendar page can still scroll naturally, and narrow layouts retain horizontal timeline scrolling without page overflow.
- **Verification:** The persisted 23:08 screenshot state was browser-checked with the proof footer inside the Week surface; focused Calendar E2E passed sequentially on Chromium and mobile (3 tests each), 82 unit tests passed, typecheck/lint/build passed, and `git diff --check` passed.

## COMPLETE — Reframe Activity around operator attention and channel-native posts

- **Started:** 2026-08-13
- **Scope:** Replace the current Activity composition with a readable Presence-first control surface: actionable review attention at the top, a real social-feed presentation for observed Mirror objects, a compact operating-status context panel, and decision/execution evidence placed beside the activity it explains.
- **Product boundary:** Keep observed world data, Agent judgment, Social Intent, Execution, Delivery, and Outcome separately attributable. No new scheduler behavior or fabricated activity is introduced.
- **Acceptance:** Activity has one clear scan path, no duplicate Now/Next/Review rail, observed posts read like posts, execution status remains actionable, and desktop/mobile layouts have no clipping or horizontal overflow.
- **Verification:** Typecheck, lint, production build, `git diff --check`, and all 82 unit tests pass. Activity lifecycle and Presence-scope E2E coverage pass, including review approval/manual relay and the updated “right now” heading contract. Rendered desktop (1440px) and Pixel 5 (390px) review found no horizontal overflow or browser console errors. The broad local Chromium run reached 24/30 passing; the six failures were existing shared-state/Calendar timing or stale non-Activity heading assumptions, with no Activity implementation failure.


## COMPLETE — Separate public-history Calendar from future Schedule

- **Started:** 2026-08-13
- **Scope:** Replace the ambiguous Calendar intent surface with a verified public-expression history, add Week/Month/Day browsing and publication inspection, and expose the prior Standing Intent editor as Schedule.
- **Safety boundary:** Calendar reads only public, externally evidenced expression. Drafts, pending review, no-ops, private observations, and unobserved intent records remain excluded. Playground CLI/runtime/perception work owned by task `019ff960-b9c9-7432-b958-af13d464a229` is out of scope.
- **Acceptance:** Navigation distinguishes Activity, Calendar, and Schedule; Calendar history is Presence-scoped, filterable, responsive, and truthful about outcome evidence; Schedule CRUD/evaluation behavior remains intact; focused unit and browser checks pass.
- **Verification:** `derivePublicHistory` is covered by `tests/runtime.test.ts`; the production build, typecheck, lint, all 81 unit tests, all 54 existing Chromium/mobile E2E tests, and the new `tests/e2e/calendar-history.spec.ts` Chromium/mobile test passed. Browser QA also verified the publication inspector → Activity cross-link and 390px no-overflow behavior.

## IN_PROGRESS — Relentless Social-Agent Audit

- **Started:** 2026-08-13
- **Scope:** Prove the full Sandbox/Playground social-agent benchmark from the attached audit instructions across identity, original posting, replies, relationships, selective silence, affordance choice, media perception, Ghost representation, Calendar/Standing Intent timing, review semantics, intent expiry, resets, and long-session continuity. Repair systemic causes and rerun varied fresh sessions until the evidence supports the requested three-run gate.
- **Safety boundary:** All stimulation and Agent execution remain in Sandbox/Playground. No live social connector or external publication is used. Chrome is reserved for blinded review of rendered simulated activity.
- **Acceptance:** Three consecutive fresh, varied Playground runs pass the complete benchmark with zero critical failures, the resulting activity reads as a coherent human-quality presence to a blinded reviewer, and unit/integration/typecheck/lint/build quality gates pass.
- **Current hypotheses under audit:** Sandbox cognition may be limited to post/reply selection; repeated pulses may reselect already-judged inbound objects; empty-world proactive behavior and scheduled rhythm may be incomplete; the CLI inspect projection may omit required context; media understanding may be provider-dependent and insufficiently exercised.
- **Verification:** In progress. Full evidence ledger: `docs/PLAYGROUND_RELENTLESS_AUDIT.md`.

## COMPLETE — Repair Playground media upload control presentation

- **Started:** 2026-08-13
- **Scope:** Remove leaked native file-input chrome from the channel-native Playground event form while preserving accessible media selection, link entry, asset chips, and responsive layout.
- **Acceptance:** The custom Add media control is the only visible upload affordance; the native file input remains keyboard and label accessible; Media URL and Add link remain readable; desktop and mobile Playground states render without overflow or console errors.
- **Verification:** Replaced the leaked native file-input row with a visually hidden, label-accessible input; aligned the custom Add media control and added focus styling. Typecheck, lint, production build, `git diff --check`, all 69 unit tests, and focused Chromium + Pixel 5 Playground tests passed. Rendered desktop and mobile inspection confirms the native row is gone, the custom control is aligned, the link field remains usable, and there is no horizontal overflow.

## COMPLETE — Add multimodal Social Perception without weakening judgment boundaries

- **Started:** 2026-08-13
- **Scope:** Make assets and versioned perception first-class in the Social Mirror and Sandbox, preserve uncertainty and provenance, prevent text-only models from fabricating media understanding, and keep Sandbox corrections isolated.
- **Acceptance:** Image-bearing simulated social objects persist raw assets separately from derived perception; perception is provider-agnostic and uncertainty-aware; media-dependent actions cannot auto-proceed without usable perception; the operator can inspect “What Jenny sees”; Ghost uses the same cognition with configurable uncertainty posture.
- **Verification:** Added provider-agnostic SocialAsset and versioned AssetPerception records with raw Sandbox asset isolation, truthful insufficient-perception states, inspect-level action gating, Presence-scoped uncertainty policy, and a compact Playground media input plus “What Jenny sees” inspection panel. Typecheck, lint, production build, `git diff --check`, all 66 unit tests, and focused Chromium + Pixel 5 Playground tests passed. Browser coverage confirms an image-bearing simulated object persists, shows insufficient perception, records “Media needs inspection,” and resets without retaining session media.

## COMPLETE — Improve Execution Ledger readability

- **Started:** 2026-08-13
- **Scope:** Separate execution action and status, add readable metadata rhythm, improve explanation spacing, and prevent review content from colliding on narrow screens.
- **Verification:** Typecheck, lint, `git diff --check`, and focused Chromium + Pixel 5 review and manual execution lifecycle tests passed.

## COMPLETE — Keep Sandbox intro copy free of dash punctuation

- **Started:** 2026-08-13
- **Scope:** Prevent the simulated first post and replies from using em dashes or en dashes in the Playground intro copy.
- **Verification:** Sandbox generation now includes explicit plain-punctuation guidance and normalizes generated copy before simulated delivery. 60 unit tests, typecheck, lint, production build, `git diff --check`, and focused Chromium Playground coverage passed with a rendered no-dash assertion.

## COMPLETE — Open Playground directly into a fresh simulated account

- **Started:** 2026-08-13
- **Scope:** Remove the separate Playground start card, open a fresh Sandbox account when the Playground is selected, move the simulated-world explanation into the active surface, and make Reset refresh the current account in place.
- **Safety gate:** Reset only clears session-scoped Sandbox world data and preserves Agent identity, Presence configuration, live route selection, and meaning files. No live connector is touched.
- **Verification:** 60 unit tests, typecheck, lint, production build, `git diff --check`, and focused Chromium + Pixel 5 Playground coverage passed. Coverage confirms direct entry, the new “This world is simulated. Jenny is real.” copy, live-routed rehearsal, and in-place Reset to an empty active account.

## COMPLETE — Keep Playground rehearsal available for live-routed Presences

- **Started:** 2026-08-13
- **Scope:** Allow Wake and Add event to use the isolated Sandbox session even when the selected Presence route remains native X or Bridge, and show the current Presence handle where control-room interaction is explained.
- **Safety gate:** Playground delivery remains `environment: "sandbox"` through the simulated connector; the selected live route and its connection state are not changed by rehearsal.
- **Verification:** 60 unit tests, typecheck, lint, production build, `git diff --check`, and focused Chromium Playground coverage passed for both Sandbox and live-routed Presence flows. The regression confirms Wake and Add event persist without the save-error toast.

## COMPLETE — Compact Presence identity controls

- **Started:** 2026-08-13
- **Scope:** Remove excessive horizontal distribution and the missing section rhythm between the Sandbox destination card and Presence identity controls.
- **Verification:** 1024px small-desktop no-overflow test, focused desktop Presence Settings route test, typecheck, lint, unit tests, production build, and `git diff --check` passed.

## COMPLETE — Clarify Presence channel and environment selection

- **Started:** 2026-08-13
- **Scope:** Group channel/environment settings into one mutually exclusive selection flow, make Sandbox discoverable as a first-class destination, remove misleading connection language, hide the redundant Agent-wide top-bar label, and eliminate duplicate Chat output keys.
- **Focused verification:** Presence Settings selection and persistence, X/Bridge exclusivity, Sandbox entry, Chat/Playground copy, console cleanliness, and desktop/mobile layout. 59 unit tests, typecheck, lint, production build, and `git diff --check` passed. Focused Chromium coverage passed 20 desktop tests and 6 mobile tests; in-app browser inspection confirmed the route panels, truthful status copy, and a clean console with no duplicate-key warning.

## COMPLETE — Build isolated Sandbox and Playground rehearsal loop

- **Started:** 2026-08-13
- **Scope:** Add a persistent simulated world and compact Playground for a real Presence. The affected path is limited to Sandbox state, Social Mirror normalization, simulated execution, Agent-driven rehearsal, and the Playground UI.
- **Safety gate:** Sandbox objects use simulated references and a simulated connector only. No Playground operation may call a native connector, mutate live Mirror objects, or reuse another session's world.
- **Focused verification:** Five Sandbox runtime tests plus the existing 53 regression tests (58 total), typecheck, lint, production build, Chromium and Pixel 5 Playground flow including Quick Rehearsal entry, responsive visual inspection at 390px, no horizontal overflow, and no browser console errors. `git diff --check` passed.

## COMPLETE — Make Presence identity legible and editable

- **Started:** 2026-08-13
- **Scope:** Replace long Social Mirror/channel text badges with channel marks, support custom channel favicons from an optional domain or a predefined icon, and add explicit Presence-name and Agent-name editing at their correct scopes.
- **Acceptance:** X renders its X mark; a custom channel using `https://www.skool.com/` renders a favicon-backed mark; custom channels can choose a predefined icon when no domain is supplied; Presence Settings persists a Presence name; Manage Agent persists an Agent name; Agent-wide meaning files and Presence connector handles remain unchanged unless explicitly edited.
- **Verification:** 53 unit tests, typecheck, lint, production build, and `git diff --check` passed. Chromium and Pixel 5 each passed all 22 browser tests. Isolated browser QA verified X's brand mark, Skool favicon loading (`naturalWidth > 0`), predefined fallback icons, Presence-name and Agent-name persistence, identity-scope separation, clean console output, and no horizontal overflow at 390px.

## COMPLETE — 20-minute Calendar and native Presence observation test

- **Started:** 2026-08-13
- **Scope:** Exercise a live OpenPresence Presence for 20 minutes while testing Calendar evaluation, native X observation, and account-boundary safety. Calendar must ask Jenny to judge the instruction in the moment before any Social Intent or delivery is formed.
- **Safety gate:** All external delivery remains limited to the configured native connection for `@hourandcode`; Chrome must not switch to or mutate `@RichardsonDx` or another operator account. No second-account stimulus will be manufactured by the test.
- **Finding and repair:** Calendar `Run now` previously created a prewritten publication without Agent cognition, and the local app had no open-browser scheduler for due standing intents. Added Agent evaluation with explicit `NO_OP`, standing-intent provenance, native execution delivery, once-per-day idempotence, and an open-app scheduler. Activity now reports the latest Calendar decision instead of masking it with an older successful execution. The Calendar time input also captures input events explicitly after live QA found a displayed edit could remain persisted as `08:00`.
- **Live verification so far:** Chrome created a standing intent under `@jenny_ghost`, the scheduler and explicit `Run now` each evaluated it, both chose `NO_OP`, and Activity showed `Calendar attention started` followed by `Standing intention held`. Native observation then completed with `@hourandcode`, read-write access, and the next observation advanced without creating an operator-account action.
- **Verification:** The timed window completed with two truthful Calendar evaluations and no new external X post: Jenny chose silence rather than publishing a forced or prewritten message. Native X observation remained current for `@hourandcode`, and no operator-account mutation occurred. Final verification passed: 52 unit tests, typecheck, lint, production build, and all 42 Chromium + Pixel 5 browser tests.

## IN_PROGRESS — Repair live X test account-boundary handling

- **Started:** 2026-08-13
- **Scope:** Investigate the wrong-account X post observed during the live Agent experiment and prevent test automation from mutating the operator account.
- **Finding:** OpenPresence's persisted native X connection is read/write for `@hourandcode`, and its execution ledger contains only native `x.post` activity for that Presence. The `@RichardsonDx` post was created through the browser test path after the session was switched to the operator account; it was not a Jenny delivery. No OpenPresence connector defect caused that account mutation.
- **Repair:** Added the project rule `Live X tests must never mutate the operator account`. Future live tests must verify the active X account before any external action and stop for operator-authored inbound stimuli.
- **Verification:** Read-only `/api/state` inspection confirms `nativeConnections[0].account.username === "hourandcode"`, `access === "read-write"`, and no execution targets `@RichardsonDx`. Native connector unit/integration coverage remains the enforcement for Agent delivery; external browser-account enforcement is documented as a manual gate.

## IN_PROGRESS — Launch pulse and live native X Presence behavioral test

- **Started:** 2026-08-12
- **Scope:** Implement and run the attached 10-minute end-to-end test against the real configured X Presence for `@hourandcode`: launch pulse on wake, one Agent-authored public post, real inbound reply, contextual response, continuity check, and truthful OpenPresence activity state.
- **Acceptance:** No simulator or fabricated records are used; a live test passes only when X externally proves each delivery and the Agent observes/responds to real inbound activity. Stop and wait for the operator when a different X account must send the required reply.
- **Verification:** Chrome pre-flight passed: `@hourandcode` was signed in, the native connector authenticated the account and reported read + write credentials, Posts were Auto, Replies were Review, and the local model answered. After the OAuth1 signing and delivery-health repairs, the real Activity `Check now` flow formed a Social Intent through the selected Agent runtime, delivered a native X post, and returned external post ID `2087708893077979544` (`https://x.com/hourandcode/status/2087708893077979544`). X visibly shows the post and the X usage console recorded spend, proving the external artifact is real. A subsequent real Activity check observed `@RichardsonDx`'s reply, persisted one inbound mention in the Social Mirror, and truthfully recorded Jenny's `NO_OP` judgment for the ambiguous message `Hi Genny is it Jenny or genny`; no reply was fabricated. The initial autonomous-post gate and observation gate pass. The contextual-reply and continuity gates remain paused until the operator sends a clearly substantive reply from the second X account; the configured Reply mode is Review, so any judged response must then be approved before native delivery.

## IN_PROGRESS — Social Mirror observation repair

- **Started:** 2026-08-13
- **Scope:** Replace connector-readiness language with a durable Social Mirror observation lifecycle, initial native X reconciliation, independent local observation, and truthful zero/degraded/error states.
- **Acceptance:** A connected native X Presence records an actual reconciliation before cognition; Activity and the Mirror panel distinguish syncing, up-to-date, stale/degraded, and error states; an empty account is shown as up to date with zero observed activity; Pulse consumes the Mirror rather than owning the channel read.
- **Verification:** Implementation and unit coverage are complete. The real native X reconciliation now reports `1 public post and 1 inbound mention`, the Mirror panel shows the actual `@RichardsonDx` reply, and Activity separates observation completion from Jenny's `NO_OP` judgment. The remaining live experiment is the contextual-reply path, which is intentionally waiting for a substantive external message.

## COMPLETE — Unify Presence wake and pulse actions

- **Started:** 2026-08-12
- **Scope:** Apply the approved interaction model: paused Presences expose one primary “Wake up Jenny” action that resumes operation and immediately runs the first attention cycle; live Presences expose “Check now” for an on-demand pulse while pause remains the lifecycle control.
- **Acceptance:** Paused Activity and Presence Settings no longer present peer Resume/Run pulse actions; waking is stateful, immediately evaluates one cycle, preserves NO_OP and Execution Envelope rules, and reports truthful transition/progress state. Live Activity exposes Check now and pause remains available.
- **Verification:** Added the atomic `wakePresence` runtime operation, state-aware Activity/Presence controls, truthful asleep/wake/check copy, and loading feedback. 38 unit tests, typecheck, lint, production build, `git diff --check`, and four focused Chromium + Pixel 5 browser tests passed. The focused browser flow confirmed the delayed “Waking Jenny…” state, immediate wake transition, `Jenny woke up` event, and `Pulse completed` event; broader product QA was intentionally not rerun per the narrow-QA request.

## COMPLETE — Publish a complete README and interface gallery

- **Started:** 2026-08-12
- **Scope:** Add a production-quality project README with a six-image interface gallery, setup instructions, architecture boundaries, provider/channel configuration notes, and release verification; commit and push the complete current worktree as requested.
- **Acceptance:** A new contributor can understand the product model, start the app, configure AI/X access, find the main surfaces, and see six representative interface screenshots; all checks pass and the complete scoped worktree is committed and pushed.
- **Verification:** Added the root README with product model, setup, AI/X configuration, security, architecture, and verification guidance; captured six clean 1440×900 interface screenshots from an isolated local runtime; 37 unit tests, typecheck, lint, production build, `git diff --check`, and all 42 Chromium + Pixel 5 browser tests passed.

## COMPLETE — Make Chat local-runtime failures actionable

- **Started:** 2026-08-12
- **Scope:** Diagnose the Chat “Failed to fetch” report, restore a valid local runtime, and prevent raw browser network errors from being shown as the only explanation.
- **Acceptance:** A single OpenPresence server serves the app and `/api/state` without generated-chunk conflicts; Chat completes a real Ollama round-trip; network failures produce an actionable local-runtime message.
- **Verification:** Removed the duplicate OpenPresence dev server sharing `.next`, rebuilt the application, restarted one clean server on port 3004, and verified browser messages returned `CHAT_OK_FINAL` and `CHAT_OK_LIVE` with no fetch error, 404, or alert. 37 unit tests, typecheck, lint, production build, `git diff --check`, and all 42 Chromium + Pixel 5 browser tests passed.

## COMPLETE — Make Agent tools discoverable and scope-correct

- **Started:** 2026-08-12
- **Scope:** Make the four existing Agent tool bindings visible and understandable, while separating Agent-wide mechanical tools from Presence-specific channel execution permissions.
- **Acceptance:** Manage Agent exposes the bound tools with human-readable descriptions and truthful status; Chat no longer presents an unexplained count; Presence settings remain the place for channel affordance permissions.
- **Verification:** Manage Agent now lists Web search, Asset inspection, Chart rendering, and Channel execution with descriptions and scope labels; Chat says “Tools bound”; Presence settings retain the channel execution mode boundary. 25 unit tests, typecheck, lint, production build, `git diff --check`, and all 42 Chromium + Pixel 5 browser tests passed.

## COMPLETE — Make Activity answer what Jenny is doing and what happens next

- **Started:** 2026-08-12
- **Scope:** Replace the historical-only Live view with truthful operational visibility: current activity, last pulse, next attention/standing intent, review queue, and configured attention/expression rhythm.
- **Acceptance:** Activity clearly answers what Jenny is doing now, what will happen next, and how her rhythm is configured; paused and idle states are explicit; the UI does not imply an automatic scheduler or background cognition that the local runtime does not provide.
- **Verification:** Activity now exposes Now, Next, and Today’s rhythm summaries; paused, idle, review, completed, and waiting states are explicit; native X connectivity is distinguished from observation; Calendar explains that standing intents are optional. 36 unit tests, typecheck, lint, production build, `git diff --check`, and all 40 Chromium + Pixel 5 browser tests passed.

## IN_PROGRESS — Live X Presence behavior test

- **Started:** 2026-08-12
- **Scope:** Verify the configured native X Presence can publish a real post, observe a real external reply, form a contextual response, and preserve continuity without fabricated state.
- **Acceptance:** A real X post and any resulting replies are externally verifiable, OpenPresence exposes truthful intent/execution/delivery state, and the test stops for operator action if a second X account is required.
- **Verification:** Pre-flight completed in Chrome: native X credentials are read + write for `@hourandcode`, Posts are Auto, Replies are Review, and a second X account is available. Test stopped before publication because Activity `Run pulse` still executes the simulator no-op path and the Social Mirror reports no native observations. A real Chat composition check also produced generic copy instead of the reviewed Ghost context. No external X state was changed.

## COMPLETE — Make Ghost identity explicit and reviewable

- **Started:** 2026-08-12
- **Scope:** Give a Ghost Presence a Presence-scoped profile for the operator or organization it extends, make the Agent’s interpretation visible and editable, and include only that approved context in cognition.
- **Acceptance:** Selecting Me / my organization exposes what the Ghost is extending, the operator can edit preferences and boundaries, the preview shows the current interpretation, Chat reflects the approved Ghost context, and Agent-wide identity files remain unchanged.
- **Verification:** 34 unit tests, typecheck, lint, production build, and browser regression coverage passed. Chrome verification confirms Ghost profile editing, review status, reload persistence, Chat acknowledgment, and a live AI response using the reviewed subject, priorities, preferences, voice, and boundaries without changing Agent-wide meaning files.

## IN_PROGRESS — Audit and remove revoked Bridge credentials

- **Started:** 2026-08-12
- **Scope:** Show a safe credential prefix and revocation time for disconnected Bridges, allow operators to remove revoked Bridge records, and retain the Bridge removal event and mirror history without retaining the revoked secret.
- **Acceptance:** A revoked Community Bridge identifies the credential by non-secret prefix, states that the secret cannot be recovered, offers Remove Bridge, disappears after removal, and rejects its old key.
- **Verification:** 21 runtime tests, typecheck, lint, production build, and all 38 Chromium + Pixel 5 browser tests passed. Browser verification confirms the redacted prefix/revocation copy and Remove Bridge control render in Presence settings; the acceptance flow removes the row and rejects the revoked key.

## COMPLETE — Clarify Activity versus Presence state controls

- **Started:** 2026-08-12
- **Scope:** Rename the sidebar’s Live destination to Activity while preserving the Settings pause/resume control and the Activity page’s paused/live status reporting.
- **Acceptance:** Sidebar and topbar consistently say Activity; the Activity page still reports the Presence state; Settings still provides the state-changing Resume/Pause action.
- **Verification:** Running-browser label smoke check, typecheck, lint, production build, and all 38 Chromium + Pixel 5 browser tests passed. Settings retains Pause/Resume controls while Activity reports the current live/paused state.

## COMPLETE — Restore scrolling for long non-Chat pages

- **Started:** 2026-08-12
- **Scope:** Keep Chat’s fixed composer viewport behavior while allowing Presence settings, Calendar, Live, and Manage Agent to use normal document scrolling.
- **Acceptance:** Long settings content can scroll vertically on desktop and mobile; Chat retains transcript-only scrolling and no page-level overflow.
- **Verification:** Running-browser measurements confirm Settings document scrolling and Chat transcript-only scrolling. Typecheck, lint, production build, and Chromium + Pixel 5 small-desktop regression tests passed.

## COMPLETE — Remove the unused sidebar footer icon

- **Started:** 2026-08-12
- **Scope:** Remove the decorative Help/lifebuoy control from the bottom of the desktop sidebar without affecting the Agent switcher, runtime status, or mobile navigation.
- **Acceptance:** The icon is absent from the active sidebar and no orphaned footer control remains.
- **Verification:** Typecheck, lint, production build, direct browser DOM smoke check, and Chromium + Pixel 5 sidebar regression tests passed. The footer retains Local runtime and the Agent switcher with zero Help controls.

## COMPLETE — Use the available workspace width

- **Started:** 2026-08-12
- **Scope:** Remove the flex shrink-to-fit behavior that left excessive whitespace around the desktop page content while keeping mobile and small-desktop layouts bounded and readable.
- **Acceptance:** Main content reaches the usable workspace edges on desktop and small desktop, page-specific columns remain readable, and mobile does not gain horizontal overflow.
- **Verification:** Measured desktop frame alignment, targeted small-desktop browser checks, full 38-test Chromium + Pixel 5 browser suite, typecheck, lint, production build, and visual screenshots of Live and Chat all passed.

## COMPLETE — Keep Agent cognition synchronized with live Presence state

- **Started:** 2026-08-12
- **Scope:** Ensure mode and execution changes made outside Chat are visible immediately in the conversation and authoritative during the next AI request, even when older transcript messages contradict the current state.
- **Acceptance:** A Ghost → Agent-owned change produces a visible acknowledgment, and the provider prompt identifies the current live mode as authoritative over stale history.
- **Verification:** 32 unit tests, typecheck, lint, production build, and all 38 Chromium + Pixel 5 browser tests passed. Browser coverage confirms the Ghost → Agent-owned acknowledgment on desktop and mobile; provider-request coverage confirms the authoritative live mode snapshot.

## COMPLETE — Keep Chat pinned to the latest message

- **Started:** 2026-08-12
- **Scope:** Make the Chat transcript behave like a standard chat surface: preserve a fixed composer and automatically reveal the newest user/Agent exchange on load and after each message.
- **Acceptance:** The transcript scroll position ends at the latest message, the composer remains visible, and the document does not acquire page-level overflow on desktop or mobile.
- **Verification:** 31 unit tests, typecheck, lint, production build, and all 36 Chromium + Pixel 5 browser tests passed. The browser assertion verifies the transcript scroll gap is at most two pixels.

## COMPLETE — Discover and use the complete Ollama model catalog

- **Started:** 2026-08-12
- **Scope:** Replace the static Ollama model choices with the connected endpoint’s actual completion-capable catalog, preserve exact model identifiers for Chat, and verify a live local response through the browser.
- **Acceptance:** Brain shows installed completion models, excludes image-only models, selecting a discovered model persists its exact tag, and Chat returns a real Ollama response.
- **Verification:** Chrome showed the live Ollama catalog, selected `qwen2.5-coder:7b`, and received a real `OK` response. 31 unit tests, typecheck, lint, production build, and all 36 Chromium + Pixel 5 browser tests passed.

## COMPLETE — Make local AI runtime reliable and keep Chat composer fixed

- **Started:** 2026-08-12
- **Scope:** Resolve compatible Ollama model tags, make missing-model guidance list the actual local catalog, and constrain Chat so only the transcript scrolls while the composer remains at the viewport bottom.
- **Acceptance:** An installed tag such as `qwen2.5:7b-instruct` can satisfy the existing `qwen2.5` selector; an unavailable model produces an actionable list; desktop and mobile Chat have no page overflow and a persistent composer.
- **Verification:** 30 unit tests, typecheck, lint, production build, and all 36 Chromium + Pixel 5 browser tests passed. Local Ollama catalog inspection confirmed the original mismatch and the compatible installed tag.

## COMPLETE — Connect Agent chat to the selected AI provider

- **Started:** 2026-08-12
- **Scope:** Replace the deterministic chat placeholder with server-side inference through the configured model runtime, preserve protected Agent meaning and durable change handling, and show actionable provider setup failures.
- **Verification:** 29 unit tests passed; provider request, encrypted secret boundary, missing-provider guidance, and browser-visible generated reply are covered. Full typecheck, lint, production build, and Chromium + Pixel 5 browser verification are required before release handoff.

## COMPLETE — First-class native X credential and execution flow

- **Started:** 2026-08-12
- **Scope:** Replace the conceptual Bridge-only path for X with a Presence-scoped Official X API connection, encrypted credential storage, connection testing, and native post/reply execution while preserving Bridge and Manual Relay as alternatives.
- **Verification:** Passed 26 unit tests, typecheck, lint, production build, and 36 Chromium + Pixel 5 browser tests covering X test/save/reload, read-write native delivery, Bridge separation, mobile layout, and console/request health.

## COMPLETE — Add Presence dialog workspace centering

- **Started:** 2026-08-12
- **Scope:** Center the Add Presence dialog within the usable workspace on desktop and within the viewport on mobile, without changing the Create Agent dialog.
- **Verification:** Passed Add Presence at the existing desktop and mobile Playwright sizes with rendered horizontal and vertical alignment assertions; build, lint, typecheck, and unit checks all pass.

## COMPLETE — End-to-end functional reality audit and release QA

- **Started:** 2026-08-12
- **Scope:** Audit the supplied 50-story functional brief across the local app, runtime, persistence, Bridge API, and responsive browser surfaces; fix verified ordinary defects and record remaining simulated/partial stories honestly.
- **Verification:** 20/20 unit tests, typecheck, lint, production build, production smoke/API checks, restart persistence, and 32/32 Chromium + Pixel 5 browser tests passed. The complete 50-story verdict is recorded in `qa-learnings/end-to-end-functional-audit-2026-08-12.md`.

## COMPLETE — Put Presence identity before channel routing

- **Started:** 2026-08-13
- **Scope:** Reorder Presence Settings so the user defines who speaks here before choosing where that Presence appears. Channel & environment follows Identity, with the execution envelope remaining after both.
- **Acceptance:** Identity is visibly above Channel & environment on desktop and mobile; existing name, mode, Sandbox, X, Bridge, and connection controls remain usable.
- **Verification:** Typecheck, lint, production build, diff check, and focused Chromium + Pixel 5 Settings tests passed. Browser assertions compare rendered section positions directly.

## COMPLETE — Keep Activity and Calendar scoped to the Presence

- **Started:** 2026-08-13
- **Scope:** Replace Agent-name and handle-based copy in Activity and Calendar with the selected Presence name, remove Activity’s Agent-management link, and preserve handles only where channel connection identity requires them.
- **Acceptance:** A Presence named Genny reads “Genny is live”, “What Genny can see”, “Planning for Genny”, and “When Genny is meant to pay attention”; Activity and Calendar do not surface `@jenny_ai` or “Manage Jenny”.
- **Verification:** 61 unit tests, typecheck, lint, production build, diff check, focused Chromium + Pixel 5 Activity/Calendar tests, and both desktop/mobile X connection suites passed.

## COMPLETE — Make Playground events channel-native

- **Started:** 2026-08-13
- **Scope:** Replace the generic Sandbox event form with a channel-driven simulation grammar. X now exposes posts, replies, quotes, reposts, likes, and messages with reusable simulated people and relationship targets; raw Mention and the always-visible Conversation field are removed from the Playground form. Settings and Playground identify the route as `Sandbox · Simulated X` / `Simulated X` while keeping one generic Sandbox runtime underneath.
- **Acceptance:** The simulated world is visibly tied to its Social Mirror; Reply/Quote/Repost/Like show only their relevant target field; Post does not show Conversation; actors can be reused; live-routed Presences can still rehearse in Sandbox; lifecycle controls distinguish `Wake Jenny` from `Check now`.
- **Verification:** 61 unit tests, typecheck, lint, production build, Chromium and Pixel 5 Playground tests, and Chromium and Pixel 5 Presence Settings route tests passed. Focused browser coverage also verifies X relationship targets, actor reuse, absence of the Conversation field, and no newly introduced long dash in the simulated feed.

## COMPLETE — Give each Presence an explicit Public Self boundary

- **Started:** 2026-08-13
- **Scope:** Separate Agent identity, Presence identity, and implementation details. Add Presence-scoped disclosure posture and approved technical facts, include the boundary in `PRESENCE.md` and social cognition, and hold Ghost drafts for review when they expose the private Agent or unapproved machinery.
- **Acceptance:** Agent-owned Presences default to contextual disclosure; Ghost Presences default to representational disclosure; the operator can save posture/facts in Presence Settings; approved facts persist; Ghost publication drafts cannot silently disclose private identity or implementation details.
- **Verification:** 64 unit tests, typecheck, lint, production build, diff check, and focused Chromium + Pixel 5 Presence Settings persistence tests passed.
## COMPLETE — Expose live X destinations from Calendar history

- **Started:** 2026-08-13
- **Scope:** Make verified X history actionable by exposing the canonical post URL in the public-expression inspector, while clearly distinguishing Sandbox rehearsals that cannot have a live X destination.
- **Safety gate:** Derive links only from verified external references and the selected Presence's native X account; never create a live URL for a Sandbox record or alter the live connector during QA.
- **Acceptance:** A live verified X expression shows an `Open on X` link; a Sandbox expression shows an explicit no-live-URL explanation; the existing Activity cross-link remains available.
- **Verification:** `tests/runtime.test.ts` covers the canonical native X URL and the no-URL Sandbox boundary; `tests/e2e/calendar-history.spec.ts` passes on Chromium and mobile; 82 unit tests, typecheck, lint, production build, and `git diff --check` pass. Browser inspection verified the screenshot's Sandbox inspector copy and preserved the Activity action.

## COMPLETE — Give Activity decisions their source context

- **Started:** 2026-08-13
- **Scope:** Make Activity answer the operator's first question—“what post was this about?”—for silence, replies, and pending actions. Observed posts now retain source-object lineage, event rows preview the relevant post, and the current action card offers a readable action summary plus a post inspector.
- **Product boundary:** The observed post remains world data; it is shown as context for the Agent's judgment, never as an instruction. Approval remains the operator's decision about delivery, not a rewrite of the Agent's judgment.
- **Acceptance:** A context-bearing Activity event says why it is clickable, the current action identifies its source post when available, “View post” opens the full observed post, and internal terms such as `x.post`, `execution envelope`, and raw status names are not required to understand the screen.
- **Verification:** 83 unit tests, typecheck, lint, production build after rotating a stale generated `.next` directory, `git diff --check`, and focused Chromium coverage for Add Presence viewport centering plus Activity review/manual lifecycles passed.

## IN PROGRESS — Establish robust social capability evidence

- **Started:** 2026-08-13
- **Scope:** Continue the frozen-methodology evaluation loop without benchmark-specific social rules. Strengthen the model-driven planner only from general development failures; record provider/model/reasoning/media/tool metadata; keep all six sandbox affordances Auto; separate act and wording evaluation; validate hidden, fresh, and longitudinal generalization.
- **Latest evidence:** GPT 5.6 Luna Low scored 96.875% act / 96.667% wording across three repeated 48-case development replays; 99.074% / 92.857% on repeated restraint; 98.333% / 100% on a sealed aggregate-only 60-case holdout after the latest change; and 100% / 100% on each of three post-guidance fresh worlds. GLM 5.2 scored 97.917% act / 70% wording on the same 48-case fixture. Structural checks passed for all recorded runs.
- **Current blockers to parity claim:** no frozen 130-case provenance-backed source set with complete thread-level partitions; human packet is generated but pending review; macro capability report is defined but incomplete; no independent second semantic judge; repeated frozen comparison is not yet complete.
- **Latest development iteration:** A general clarification-breadth/neutral-expression guidance change was tested on three GPT 5.6 Luna Low sessions: 97.917% act / 90.476% wording across 24 packets. One-session 48-case Boardy and 18-case restraint regressions remained structurally valid at 97.917% / 95.833% and 97.222% / 100%. The change is retained provisionally as general model-facing guidance; it did not justify any benchmark-specific patch.
- **Partition progress:** A transparent candidate manifest now records 33 development cases, 60 validation cases, 0 frozen cases, and 62 excluded Boardy source cases requiring complete thread/relationship provenance. The fail-closed validator reports `candidate-not-frozen` and will not promote incomplete captures.
- **Provenance progress:** A public-status enrichment pass successfully added timestamps, authors, reply-parent chains, quoted-post context, and public media/link metadata to all 68 captured Boardy cases; 25 reply captures expose a retrieved parent chain, representing 14 unique retrieved thread roots across the 48 visible-feed cases. Private outcomes and complete relationship history remain explicitly unknown, so the enriched artifact is still development-only.
- **Review packet:** A 68-case provenance review packet is ready with explicit open evidence gaps and blank thread-unit/frozen-eligibility decisions. It is pending source review and is not treated as benchmark evidence yet.
- **Thread-unit analysis:** The 48 visible reply captures collapse to 37 retrieved roots; adding the 9 non-overlapping curated thread units gives a potential 46-unit reply pool before manual deduplication, leaving at least 4 additional distinct reply/reaction units needed for the 50-unit target. The 20 original/quote captures provide 20 distinct public roots, but still require provenance review.
- **Verification:** 14 targeted AI/perception tests, seal verifier, semantic/structural audit scripts, repeated-run stability summaries, and `git diff --check` pass. The release verdict remains `PROMISING_BUT_NOT_YET_ESTABLISHED`.
# 2026-08-13 — Provenance-backed parent-chain replay fixture

The source enrichment work produced a development-only replay at
`scenarios/boardy-thread-replay-development.json`. It uses one fresh
Playground session per captured source object, loads public parent-chain
history with `observeOnly`, and evaluates only the final captured object.
The inventory records 68 targets, 59 historical observations, 37 distinct
reply roots, and 20 original/quote roots. It is explicitly not frozen: source
review, relationship/private evidence, and four missing parent objects remain
open.

The observation-only ingestion seam is a mechanical replay capability, not a
social rule. It prevents setup history from becoming accidental new prompts;
the Social Planner still owns the target act and the editor cannot override it.

# 2026-08-13 — Source-pool review packet for the 130-case freeze

The deduplicated source pool now contains 50 Boardy reply/reaction thread
units and 20 Boardy original/quote units. A separate review packet at
`qa-learnings/social-capability-source-pool-review-packet-v1.json` records one
explicit decision slot per candidate for available-thread completeness,
category, stable thread unit, evidence status, confidence, and frozen-set
eligibility. It contains no expected action or expected wording fields.

The packet is intentionally `pending-source-review`: all 70 provenance and
thread-unit decisions remain open, and 61 category decisions still need manual
normalization. The dataset audit now reports the packet separately from the
candidate pool, so reaching the numeric source count cannot be mistaken for a
frozen parity set.

`scripts/validate-social-source-pool-review.mjs` now fails closed on blank
decisions, duplicate thread units, incomplete evidence, invalid categories, or
any expected-answer field. Its current result is `not-ready` with 70 pending
cases and zero promoted cases, which is the expected state before source
review.

## 2026-08-13 — Independent-strata unit coverage audit

The fresh and restraint fixtures initially contained 55 candidate cases but
only 36 independent thread units. A separate development fixture,
`scenarios/independent-strata-development-24.json`, now adds 24 single-turn
cases with new actors and thread units. The coverage audit at
`qa-learnings/social-capability-strata-coverage-latest.json` now records 79
candidate cases and 60 independent units, meeting the technical/media,
network, sensitive, and restraint unit targets at the candidate level. The
fixture still requires model runs, semantic review, and final partition
assignment; it is not frozen evidence.

The selected 60-unit supplemental review packet is
`qa-learnings/social-capability-independent-review-packet-v1.json`. Its
validator is currently `not-ready` with 60 pending decisions and zero promoted
cases. The audit therefore distinguishes coverage availability from frozen
evidence.

The fail-closed promotion path is now represented by
`scripts/build-social-frozen-manifest.mjs`. Because both review packets remain
pending, `qa-learnings/social-capability-frozen-manifest.json` has zero frozen
cases and `scripts/validate-social-freeze.mjs` correctly reports `not-ready`.

The social experiment runner now refuses `OPENPRESENCE_AI_MOCK=1` and rejects
any Qwen message model before accepting a run. This is an experiment-integrity
guard, not social behavior or a benchmark rule.

## Next executable experiment

With a permitted local listener and the app's GPT connection available, the
first new development run is:

```text
node scripts/run-social-experiment.mjs scenarios/independent-strata-development-24.json --runs 3 --require-provider openai --require-model gpt-5.6-luna --require-reasoning low --output qa-learnings/independent-strata-gpt-luna-low-r3-2026-08-13.json
node scripts/evaluate-social-run.mjs qa-learnings/independent-strata-gpt-luna-low-r3-2026-08-13.json > qa-learnings/independent-strata-gpt-luna-low-r3-2026-08-13-semantic.json
```

The evaluator must use GPT 5.6 Luna Medium independently, remain blind to
scenario metadata and provider identity, and record act selection separately
from wording. The current environment cannot run this command because
`next start` is denied listener access with `EPERM`.

## 2026-08-13 — In-process runner and provider preflight

To remove the listener dependency without touching the UI, a narrow
`scripts/run-social-experiment-in-process.mjs` runner now invokes the compiled
state route directly. It records the actual message provider/model/reasoning,
the `asset.inspect` provider/model, all six Auto modes, Sandbox-only lineage,
and the full projected Playground packets. It rejects mock mode and Qwen, and
both experiment runners now fail closed when the runtime emits
`Sandbox evaluation unavailable`, so provider outages cannot be scored as
silence.

The first attempt against `data/skill-edit-qa.db` found an inconsistent QA
snapshot: its state claimed an OpenAI credential was configured, but its
encrypted `provider_credentials` table had no matching row. A verified prior
GPT QA database contained a decryptable credential; re-saving it through the
route proved that credential lookup works. The subsequent real 24-case GPT
5.6 Luna Low attempt was then blocked before model judgment because this
shell cannot reach `api.openai.com` (`fetch failed` with no HTTP status). The
packets were not scored and the invalid diagnostic outputs were moved out of
`qa-learnings/`.

No UI, typecheck, infrastructure, or Qwen rerun was performed. The next
valid run remains the 24-case independent-strata development replay once the
app/server execution environment has outbound provider connectivity; it must
complete with model decisions and usable media provenance before semantic
evaluation.

## 2026-08-13 — Human-review workbooks

Added `scripts/render-social-review-packet.mjs`, a read-only renderer for the
fail-closed provenance packets. It generated:

- `qa-learnings/social-capability-source-review-workbook-v1.md` — 70 Boardy
  source candidates;
- `qa-learnings/social-capability-independent-review-workbook-v1.md` — 60
  independent thread units.

The workbooks expose source links, available context, provenance-only Boardy
observations, known/unknown evidence, and blank decisions for thread
completeness, category, confidence, and frozen eligibility. They contain no
expected action or expected wording fields. Both existing validators still
report `not-ready` with zero promoted cases, so the workbooks improve review
accessibility without changing the evidence status.

Added `scripts/import-social-review-workbook.mjs` to import a completed
workbook into a new packet. It rejects missing or ambiguous decisions, requires
exclusion reasons, and only permits `--approve-for-freeze` after every case is
reviewed and the required category counts are met. An untouched workbook was
tested and rejected fail-closed; no review decisions were promoted.
## IN_PROGRESS — Validate Assignment-to-Feed quantity parity

- **Started:** 2026-08-14
- **Scope:** Verify Playground Assignments for exactly 1 and exactly 10 Sandbox publications, plus a scheduled-for-now Assignment, against Feed delivery counts.
- **Product boundary:** Use the local simulated X/Sandbox only; Feed counts verified public history, and Assignment progress advances only from verified Sandbox delivery.
- **Current finding:** Quantity parsing treated a date in a QA marker as the requested count; fixed and covered by a runtime regression test. A stale persisted Feed view also required a refresh before the latest completed Sandbox publications were projected.
- **Verification:** Connected Chrome verified Feed marker counts of 1, 10, and 1 for the Playground single Assignment, Playground ten-post Assignment, and exact-time scheduled Assignment. Persisted state shows all three Assignments completed with 1/1, 10/10, and 1/1 verified publications; the scheduled case retained Thursday 19:03 exact timing. Full Vitest passes 153/153; focused Playground/Schedule E2E passes 12/12 across Chromium and mobile; typecheck, production build, and `git diff --check` pass. Final Chrome console has no warnings or errors.
- **Status:** Complete.
