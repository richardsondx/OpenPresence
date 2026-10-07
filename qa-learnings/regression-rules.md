# Regression rules

## Rule: Chat tool failures preserve the outcome and terminal replies require receipts

**Defect class:** Optional API failure stopping usable browser work; terminal promises replacing execution; long turns discarded.

**Enforcement:** Capability projections include launchable browser routes. Public research uses bounded read-only contexts and rejects private network targets and configured credentials. Failed tools return typed recovery evidence in the same turn. Twelve steps form a durable slice, not completion; total work is bounded at 48, unchanged failures at two, and explicit retry retains receipts with a new budget. Required human actions preserve the same run without occupying private Chat. Answer transport is distinct from tool transport; proposed work and search leads cannot establish scheduling, page reading, or verified live delivery.

**Protection:** `tests/browser-research.test.ts`, opt-in real Chrome research tests, `tests/operator-chat-tools.test.ts`, `tests/operator-chat-harness.test.ts`, `tests/chat-tool-recovery.test.ts`, and `tests/e2e/chat-recovery.spec.ts`. Join actual transcript claims to persisted receipts; mock providers prove runtime boundaries only.

**Added:** 2026-10-01; reproduced real Chat replies announcing research without starting it.

## Rule: Sandbox forks preserve causal provenance without sharing payload primary keys

**Defect class:** A fork overwriting source decisions, executions, or metric targets after SQLite persistence/restart.

**Enforcement:** Namespace inherited world IDs and their internal references per fork; preserve external world references and `checkpointOriginId`. Keep learning references in the same branch. Historical clock provenance remains equal across retained/removed branches. Evidence counts alone cannot establish that raw causal links survived.

**Protection:** `tests/learning-counterfactual.test.ts`, `tests/sandbox-temporal-integration.test.ts`, and `tests/sandbox-learning-choice-chain.test.ts` check source/fork joins and persisted IDs. Reconstruct metric → mirror → execution → intent → decision → verified outcome after restart.

**Added:** 2026-10-01; reproduced source/fork payload collisions in the real-provider learning run.

## Rule: Growth scopes both its evidence and its resulting mutations

**Defect class:** Rehearsal evidence influencing live reviews, learning, messages, files, or review freshness.

**Enforcement:** Exact Agent/Presence/live-or-session scope applies to retrieval, hypotheses, follower metrics, mutation targets, generated hypotheses, and watermarks. Rehearsal strategy reviews do not write live Chat milestones or global Growth files. A sole legacy pre-session rehearsal responsibility may be bound explicitly; multiple sessions require unambiguous ownership. Measured media and pattern comparisons retain actual decision/outcome joins and equal publication age; delivery alone is not learning.

**Protection:** `tests/growth-review-scope.test.ts`, `tests/growth-runtime.test.ts`, `tests/autonomous-growth-cognition.test.ts`, and `tests/learning-counterfactual.test.ts`, including positive controls and sibling/live exclusion.

**Added:** 2026-10-01.

## Rule: Asset readiness has one authoritative meaning across UI, cognition, and publication

**Defect class:** Contradictory media status / advertised-ready asset rejected by publishing.

**General principle:** Displayed readiness, Agent asset search, and final publication authorization must derive from the same persisted visual evidence. A completed perception call is not automatically a resolved review: high or insufficient visual uncertainty remains review-required. An otherwise eligible image that needs review may be proposed as a durable, non-delivered publication for operator review; never misstate that the Channel rejected it.

**Project enforcement:** The Media library and Chat attachment picker use `deriveAssetReadiness`; ingestion paths mark `metadataReview` resolved only when perception uncertainty is low or medium; explicit review edits remain authoritative. `formChatPostIntent` holds uncertain media as `awaiting-review` with no delivery until the operator approves.

**Executable protection:** `tests/asset-library.test.ts` covers stale `resolved` flags with high uncertainty and open-review precedence. `tests/operator-chat-tools.test.ts` proves an eligible high-uncertainty library image creates a review-gated execution with no outcome. Run those tests plus changed-file lint and browser verification of the Media readiness summary.

**Learned from:** Human-found mismatch between the Media screen (`13 ready`) and Chat's “needs review” explanation; canonical Agent workspace had machine-marked `resolved` images with high uncertainty.

**Added:** 2026-09-25

## Rule: Reusable social formats carry audience, source, media, and delivery lineage

**Defect class:** Strategy abstraction / missing audience model / template work losing provenance

**General principle:** A reusable social format is useful only when its observed source set, intended audience, media guidance, exact artifact ID, and later Assignment/publication lineage remain connected. A long instruction prompt is not a substitute for an interpretable Growth model.

**Project-specific enforcement:** Observed templates accept 3–30 public source IDs and record the source count. Social strategy retrieval includes the exact requested template and derived Growth profile. Scheduled template Assignments keep a concise title/description, the exact template ID, and bounded media decision guidance; social decisions preserve the same template lineage.

**Executable protection:** `tests/playbook-workflows.test.ts` covers 30-source abstraction, source evidence materialization, Growth audience projection, planner retrieval, and concise scheduled Assignment copy. Browser QA must verify the Growth audience model and Templates → Schedule handoff without exposing the full instruction as the primary label.

**Apply when:** Changing social template storage, public format study, Growth planning, media selection, Assignment creation, social decision recording, or Templates/Growth browser projections.

**Added:** 2026-09-16

## Rule: Browser readiness is scoped to the Presence's current account

**Defect class:** A live Chrome heartbeat or stale `verified` flag is treated as an authorized route after the controlled tab changes accounts or the Presence handle changes.

**General principle:** The API and browser are peer X tools, but a browser is ready only when its currently observed identity matches the selected Presence. A mismatch must be surfaced immediately; do not spend a browser-read timeout or attempt a public action through the wrong account.

**Project enforcement:** `bridgeReadyForExpectedAccount` checks liveness, verified identity, and normalized handle equality. Read selection, read leasing, capability planning, quote eligibility, and execution routing all use the same account-bound readiness rule.

**Executable protection:** `tests/browser-channel-read.test.ts` rejects a stale verified handle before creating or leasing a read; `tests/runtime.test.ts` proves a mismatched Chrome account is not offered for a public quote route.

**Apply when:** Changing Browser/Bridge identity, account switching, Presence handles, route selection, read queues, or delivery authorization.

## Rule: Factual usage questions use the recorded ledger

**Defect class:** Groundedness / usage attribution / misleading provider limitation

**General principle:** When a product has authoritative local usage and API-call history, answer factual consumption questions from that ledger before using model prose; distinguish recorded runtime usage from provider billing and remaining-credit balances.

**Project-specific risk:** Operator Chat previously said it could not provide a token ledger even though `resource_usage_events` and the Usage page already contained model-token and connector-request history.

**Learned from:** Human-found Chat response shown in the attached screenshot.

**Why QA missed it:** Usage was verified as a page/API projection, but not as a cognition capability in the private Chat path.

**Project enforcement:** `operatorUsageReply` reads Agent-scoped `resourceUsageEvent` records; `runOperatorChat` and legacy `sendMessage` use it before model generation; `usage_summary` is available in `operatorChatStepSchema` and `executeChatRuntimeTool` for follow-up detail.

**Executable protection:** `tests/usage.test.ts` covers summary math, grounded Chat wording, and fresh-probe separation; `tests/operator-chat-tools.test.ts` covers the read-only Chat usage tool.

**Apply when:** Changing usage projections, resource accounting, provider diagnostics, operator Chat, or claims about credits/tokens/API calls.

**Added:** 2026-09-15

## Rule: Cross-Agent Presence toggles use the target workspace revision

**Defect class:** Cross-Agent toggle no-op / workspace conflict / missing visual feedback

**General principle:** A mutation addressed to an inactive Agent must validate and advance that Agent's durable workspace revision. The revision from the currently displayed Agent is unrelated and must not cause a valid pause/wake click to be rejected.

**Project-specific enforcement:** `POST /api/state` derives the target Agent from `pausePresence`/`wakePresence.agentId`, preserves the target `current.workspaceRevision` for cross-Agent mutations, and returns an updated `agentPresenceDirectory` so the portfolio rail immediately reflects Asleep or Awake without changing the displayed workspace.

**Executable protection:** `tests/e2e/agent-switching.spec.ts` creates multiple Agents, toggles an inactive Agent asleep → awake → asleep, asserts the accessible label changes after every click, and verifies the persisted directory status. The check must run in Chromium and mobile when the portfolio rail is changed.

**Apply when:** Changing Agent switching, portfolio wake controls, Presence pause/wake behavior, workspace conflict handling, or scoped mutation responses.

**Added:** 2026-09-12

## Rule: Schedule completion is verified and occurrence-based

**Defect class:** Missing completion state / recurring work mislabeled one-time / misleading Schedule history

**General principle:** Only a verified execution/outcome can make an occurrence done. A daily or weekly Assignment remains an open durable responsibility for its next occurrence, while the current occurrence is visibly `Done today`.

**Project-specific enforcement:** Normalize dated Assignments to weekly by default unless the instruction explicitly says once/one-time. Keep verified recurring work in Schedule projections, make time prominent in List rows, and classify unscheduled manual chat Assignments as one-time without classifying continuous responsibilities as recurring.

**Executable protection:** Runtime tests must cover legacy dated `once` repair and recurring satisfaction staying open after a verified outcome. Schedule E2E must assert a verified recurring card remains visible with `Done today`; flexible windows must show a bounded preview with an explicit reveal for the remainder.

**Apply when:** Changing Assignment normalization, completion/progress reconciliation, Schedule List/Week projections, recurrence filters, or flexible responsibility presentation.

**Added:** 2026-09-01

## Rule: One Presence may not execute multiple Assignments concurrently

**Defect class:** Assignment concurrency / misleading Working Now state / uncontrolled parallel public work

**General principle:** A durable responsibility list may contain many open items, but “working now” must represent the execution lease, not every item eligible for attention. Unless parallelism is an explicit product capability with independent budgets and visible ownership, one Presence has one active Assignment execution; other responsibilities remain queued, eligible, or future.

**Project-specific enforcement:** Assignment dispatch and reconciliation must claim an exclusive Presence-scoped execution lease before starting work. The Schedule and Activity projections must derive `WORKING NOW` only from the authoritative active Assignment run, exclude stale/terminal runs, and show additional responsibilities as queued or not started. Duplicate dispatch requests must converge on the existing active run rather than create another Assignment run.

**Executable protection:** Add focused Assignment-runtime coverage asserting that two due/open Assignments for one Presence produce one active run and one queued item, plus a Schedule E2E assertion that only one card is labeled `WORKING NOW`. Runtime telemetry should capture dispatch candidate count, lease owner, active run id, and rejected duplicate dispatch reason without secrets.

**Apply when:** Changing Assignment dispatch, autonomy-worker scheduling, run leasing/recovery, Schedule/Activity projections, or concurrency/idempotency behavior.

**Added:** 2026-08-31

## Rule: Presence performance and public history are bounded by the Presence lifetime

**Defect class:** Historical account data leaking into Presence performance

**General principle:** Presence performance and public history must measure the selected Presence from its own creation boundary. Account-level history that predates the Presence cannot be used to claim follower movement, reach, engagement, relationships, autonomy, strategy evidence, or Activity/Feed history for it.

**Project-specific enforcement:** Persist `Presence.createdAt` for new records and infer a conservative legacy boundary from Presence-owned lifecycle artifacts when needed. Shared Growth derivations, recovered `GROWTH.md` context, review history, KPI cards, trends, autonomy proof, Activity events, and public history must exclude evidence before that boundary. An unknown boundary fails closed for historical performance evidence, and the Growth and Activity pages must disclose the measurement start.

**Executable protection:** `tests/growth-history.test.ts`, `tests/growth-runtime.test.ts`, and `tests/runtime.test.ts` assert that pre-Presence audience evidence, Growth revisions, and public Mirror history do not contribute to selected-Presence projections, while post-boundary evidence remains visible. Browser QA must verify the Growth and Activity scope notes, that older account history is absent from the Activity route, and that an older account revision is not presented as current Presence context.

**Apply when:** Changing Presence creation, X connection, audience snapshots, publication metrics, Mirror aggregation, Activity, Feed, Growth reviews, autonomous proof, or recovered Growth history.

**Added:** 2026-08-28

## Rule: Private-message hooks are generic, bounded, and private

**Defect class:** Product-specific automation / scope leakage / public exposure of private context

**General principle:** A Presence may have one operator-authored private-message hook with a fixed private-message trigger, an optional plain-language condition, and a bounded instruction. The instruction is trusted Presence configuration, not executable code or unrestricted authority. Message content and People Notes remain fallible social context.

**Human-found overfit:** Product-specific behavior belongs in operator configuration, never in the generic DM core. A candidate/product/link recipe hard-coded into Presence types, prompts, handlers, or UI is an overfit and must be removed or expressed only as operator-authored guidance.

**Project enforcement:** Persist the hook on the Presence, project it into cognition only when the inbound Mirror object is both `objectType=message` and `visibility=direct-message`, and route its response through the existing Social Intent → Execution → Outcome envelope. A `message` action targets the inbound sender/conversation and delivers as `direct-message`; public posts and public requests never activate the hook.

**Executable protection:** `tests/people-notes.test.ts` covers persistence, Brain isolation, Presence A/B isolation, public-vs-private projection, and private reply visibility/targeting. Run `test -z "$(rg -n -i 'gitglance|github_candidate_check|handoffGitHubCandidateCheck|PresenceRequestHandoff' app lib tests || true)` and require no matches across the DM core. Browser QA must navigate to DMs / Private Messages, save the condition/instruction, reload Settings, and verify both fields remain populated; the focused Chromium save/reload check is 1/1 passed.

**Apply when:** Changing Presence-scoped DM guidance, People Notes context, simulated Messages, private-thread routing, or social cognition projections.

**Added:** 2026-08-27

## Rule: Public browser delivery must prove the approved target before typing

**Defect class:** A claimed public expression is entered into a composer belonging to a different conversation.

**General principle:** Transport liveness and a mounted composer do not establish target identity. For replies and quotes, the embodiment boundary must fail closed unless the visible conversation contains the exact target from the sealed Social Intent; unrelated tabs in the same browser window cannot inherit the execution.

**Project-specific enforcement:** The X extension rebinds a claimed execution only to the exact target status page or a child composer opened by the controlled tab. The content script resolves the approved target before entering text and returns `COMPOSER_TARGET_MISMATCH` with the composer untouched when it cannot.

**Executable protection:** `tests/e2e/extension-composer.spec.ts` presents an open composer for the wrong post and asserts that no text is entered and no submission occurs.

**Apply when:** Changing Bridge session rebinding, controlled-tab selection, X composer detection, reply/quote execution, or retry/recovery behavior.

**Added:** 2026-08-27

## Rule: Quote-card authorship is first-class cognition evidence

**Defect class:** A standalone post visibly quotes another author, but cognition receives only an unresolved post ID and guesses at attribution.

**General principle:** Explicit quoted objects are part of the observed social situation even when they are not reply ancestors. Their author and content must be hydrated, bounded, and presented as world evidence; absent evidence must remain visibly missing rather than being guessed.

**Project-specific enforcement:** Native X hydration follows `referencedExternalRefs` for standalone posts, preserves referenced objects separately from ancestry, and includes their eligible author/content in structured social evidence. Agent-authored leading mentions must resolve to a participant or explicit handle in that bounded target/thread/quote context. Substantial near-copies of observed source speech are blocked so another person's first-person claim cannot become the Presence's own.

**Executable protection:** `tests/thread-context.test.ts`, `tests/social-context.test.ts`, `tests/sandbox.test.ts`, and `tests/runtime.test.ts` cover standalone quote hydration, quoted-author evidence, unsupported-leading-mention blocking, and source-speech impersonation in Sandbox and live intent formation.

**Apply when:** Changing X ingestion, Mirror references, thread compilation, Social Planner evidence, public-expression validation, or operator explanations of social context.

**Added:** 2026-08-27

## Rule: Negative interpersonal experience is factual context, never an engagement queue

**Defect class:** An ambiguous channel failure becomes autobiography, a verified block keeps generating targeted work, or a social consequence is automatically mined for content.

**General principle:** Verified evidence may create a Presence-scoped autobiographical event. Interpretation remains separately revisable, and public expression remains an ordinary social judgment with silence available.

**Project-specific enforcement:** Only explicit provider/browser block evidence sets `blocked_by_person`. That transition pauses targeted Watches, dismisses pending signals, sets relationship engagement to observe-only, cancels pending interaction, and creates a factual `relationship_boundary` event. Retrieval requires contextual relevance and a minimum safety cooldown; its projection removes identity, timing, exchange, screenshot, link, and quote clues. Reuse suppression begins only after verified delivery.

**Executable protection:** `tests/relationship-blocking.test.ts` covers verification, deterministic operational effects, and verified status recovery. `tests/autobiographical-memory.test.ts` covers contextual retrieval, cooldown, public-safe projection, lineage, verified-delivery suppression, and the final privacy boundary.

**Apply when:** Changing channel-error classification, People/contactability, Watching, relationship research, autobiographical memory, social prompts, publication lineage, or public-expression privacy checks.

**Added:** 2026-08-27

## Rule: Today filters must preserve current responsibilities

**Defect class:** State-dependent filtering / hidden active work

**General principle:** A time filter may narrow planned items, but the current-day view must not hide work that is actively running or presently requires the operator. Current responsibility truth takes precedence over schedule metadata, including the absence of a schedule.

**Project-specific risk:** `ScheduleList` in `app/page.tsx` historically filtered only on `assignment.schedule.day`, so an unscheduled Assignment could appear in the Working Now banner and under ALL while disappearing from today’s weekday view. Blocked work scheduled on another day could also disappear at the moment it needed a decision.

**Learned from:** Human-reported Thursday Schedule contradiction between the ALL view, TH view, Working Now banner, and Needs You state.

**Why QA missed it:** Schedule coverage tested creating and viewing scheduled Assignments, but did not cross a weekday filter with unscheduled in-flight work or an operator-blocked responsibility from another day.

**Project enforcement:** In `ScheduleList`, a non-today weekday remains a pure schedule filter. Today includes scheduled matches plus any Assignment for which `getAssignmentProcessingState` is processing or status is `needs_operator`/`blocked`.

**Executable protection:** `tests/e2e/schedule-recovery.spec.ts` selects the real current weekday and asserts that both unscheduled working work and an out-of-day blocked Assignment remain visible.

**Apply when:** Changing Schedule filters, current-work derivation, Assignment statuses/runs, Working Now, or operator-decision projection.

**Added:** 2026-08-27

## Rule: Pre-write identity failures are resumable holds, not terminal outcomes

**Defect class:** Connector recovery / false terminal failure / operator dead end

**General principle:** A verified identity mismatch before an external write is a safe execution hold. The unsent action must remain resumable and automatically continue when the expected identity returns; it must not be counted as delivered or converted into a terminal responsibility failure. Genuine sign-in remains a human identity boundary.

**Project-specific risk:** `failExecution` in `lib/bridge.ts` accepted Chrome’s non-retryable `ACCOUNT_MISMATCH`, failed the execution, and let `reconcileLiveAssignmentRuns` move the parent Assignment to `needs_operator`. This stranded a safe unsent action even though `reportBridgeIdentity` already knew how to release identity holds after the expected account returned.

**Learned from:** Human-reported account-mismatch decision that OpenPresence did not reconcile or recover, paired with an Activity CTA that offered no action at its destination.

**Why QA missed it:** Bridge retry coverage tested retryable delivery failures, but not the extension’s explicitly non-retryable account-mismatch payload or repair of historical failed records. Browser QA checked the Schedule inspector actions separately from the Activity decision entry point.

**Project enforcement:** `failExecution` converts live `ACCOUNT_MISMATCH`/`ACCOUNT_NOT_READY` before a public reference exists into `deliveryHold.reason="bridge_identity"`, removes the stale permit, and returns the public expression to candidate state. `reconcileLiveAssignmentRuns` repairs matching unreviewed historical failures. Activity must expose Retry/Close directly and Open details must focus the blocked Assignment.

**Executable protection:** `tests/bridge-retry.test.ts` covers hold and automatic release after expected-identity verification; `tests/assignment-domain.test.ts` covers historical repair; `tests/e2e/schedule-recovery.spec.ts` covers direct Activity actions and exact Schedule focus.

**Apply when:** Changing Bridge identity reporting, execution failure/retry semantics, Assignment reconciliation, operational health, or Activity/Schedule recovery actions.

**Added:** 2026-08-27

## Rule: Every operator-facing link must render its destination surface

**Defect class:** Navigation / blank route / approval discoverability

**General principle:** A successful HTTP response is not a usable navigation outcome. Every user-facing link must resolve to a rendered, actionable destination, and adjacent workflow boundaries must explain where the next decision occurs.

**Project-specific risk:** OpenPresence preserves legacy routes such as `/calendar` while the canonical responsibility surface is `/schedule`. `viewForLocation` in `app/page.tsx` must alias legacy calendar URLs to `ScheduleView`; Schedule must explain that drafted social-action approval is handled in Activity → Agenda & Review, while account/connector intervention is handled in Settings and the Assignment inspector.

**Learned from:** Human-reported Activity “Open Schedule” navigation landing on a blank shell at `/calendar` and uncertainty about where to approve the pending action.

**Why QA missed it:** Browser coverage navigated through the sidebar’s canonical Schedule button, but did not exercise the legacy `/calendar` URL emitted by the Activity attention card. The destination rendered navigation chrome without a page component, so the HTTP and console smoke checks looked healthy.

**Project enforcement:** Keep `/calendar` covered as a compatibility alias in `viewForLocation`; keep the Activity → Schedule link canonical; keep Schedule’s approval handoff and operator-action explanation visible in the destination inspector/header.

**Executable protection:** `tests/e2e/openpresence.spec.ts` test `legacy calendar links open the canonical Schedule surface` loads `/calendar` directly and asserts the Schedule heading, plan overview, and absence of the loading shell.

**Apply when:** Adding or renaming routes, changing `viewPaths`/`pathViews`, changing Activity attention CTAs, or moving approval/retry/connector actions between Activity, Schedule, and Settings.

**Added:** 2026-08-27

## Rule: Retries must not create duplicate operator turns or public actions

**Defect class:** Retry safety / duplicate UI projection / duplicate external side effect

**General principle:** A browser retry, double-submit, or repeated worker pass must converge on the same logical operation. Idempotency cannot be based only on a newly generated database record ID; public actions need a semantic key, and the connector must re-check that key immediately before sending.

**Project-specific enforcement:** Operator Chat sends a client request ID through `sendPresenceNudge`; the server and conversation model persist and recognize it, while the UI removes an optimistic copy once the saved turn arrives. Social execution keys use Presence, environment, affordance, target, and normalized public expression. Delivery cancels a matching queued attempt instead of issuing a second provider request. Different affordances and materially different expressions remain distinct actions.

**Executable protection:** `tests/activity-now.test.ts`, `tests/duplicate-action-idempotency.test.ts`, and `tests/native-execution-delivery.test.ts` cover repeated operator sends, exact reply/post/reaction retries, legitimate distinct replies, and a legacy duplicate already present in the delivery queue.

**Learned from:** Human-reported duplicate Chat messages and duplicate public-reply cards while the composer was still sending.

**Apply when:** Changing Operator Chat, social intent formation, autonomous retries, execution queueing, connector delivery, or optimistic browser state.

**Added:** 2026-08-27

## Rule: Replayed Mirror observations are not multiple public outcomes

**Defect class:** Connector replay / false duplicate-outcome incident / misleading Needs You queue

**General principle:** An observed external object is identified by its stable channel identity, not by how many polling passes returned it. Repeated observations of one public reply must converge on one Social Mirror object and must never be promoted into a duplicate-world-outcome incident.

**Project-specific enforcement:** Native X reconciliation upserts by Presence, environment, channel, and external reference; the runtime normalization boundary collapses legacy duplicate rows while retaining the append-only Mirror event history. Duplicate-outcome recovery groups distinct external reply identities only, and Review must show a target-specific incident rather than a count inflated by replay rows.

**Executable protection:** `tests/duplicate-action-idempotency.test.ts` asserts that repeated observations of one external reply normalize to one Mirror object with no duplicate evidence; the same file also covers two distinct authored reply IDs as a real duplicate outcome. Browser QA must refresh/reconcile the affected Review state and verify the Needs You count and evidence reflect distinct public replies only.

**Apply when:** Changing Native X reconciliation, Mirror normalization, polling/replay handling, duplicate-outcome detection, recovery incidents, Review projections, or public history.

**Added:** 2026-09-01

## Rule: Operator Chat must understand the turn before choosing a work path

**Defect class:** Conversational routing / intent collapse / unwanted future-post planning

**General principle:** A private Agent conversation is not a publishing form. Questions, check-ins, opinions, and casual remarks should receive a private Agent response; shared social evidence may enter inspect → judge → act; explicit private requests such as watching a person may call the corresponding tool. The Agent's judgment, Taste, capabilities, and execution envelope remain authoritative for public action.

**Project-specific enforcement:** `sendPresenceNudge` routes live turns without X-post evidence to the operator conversation, preserves paused delivery semantics, and routes shared X posts through the existing Attention worker. `lib/autonomy-worker.ts` includes the operator's natural note in social judgment and can create a durable Watch when the note asks to keep an author in view.

**Executable protection:** `tests/activity-now.test.ts`, `tests/ai.test.ts`, and `tests/e2e/activity-chat-truth.spec.ts` assert private question/reply turns create no nudge, the operator prompt includes current runtime context, shared links retain deferred social judgment, direct watch requests create a Watch, paused messages remain held, and Chat remains free of the context sidebar.

**Learned from:** Human-reported Chat behavior that treated every message as a future-post consideration instead of understanding whether the operator was asking a question, sharing context, suggesting outreach, or requesting a Watch.

**Apply when:** Changing Operator Chat, `sendPresenceNudge`, private Agent prompts, shared-link handling, Watch creation from conversation, or the Chat layout.

**Added:** 2026-08-26

## Rule: Successful observation must not skip Watch Signal judgment

**Defect class:** Runtime orchestration / false-success completion / stranded Watch Signals

**General principle:** A successful observation is not a complete attention pass when the same pass owns downstream durable signals. Narrowing a scheduled run to inbound observation may exclude discovery, but it must not silently omit the Watch Signal → social judgment handoff.

**Project-specific risk:** The temporal scheduler queues `attention` runs with `attention.scope === "observe_inbound"`. If `executeAutonomyRun` calls only `runAutonomousObservation`, `recordWatchSignals` creates pending signals but no Watch-origin `socialDecisions`, `socialIntents`, or executions, while the operational run still becomes `succeeded`.

**Learned from:** Human-reported Watch behavior not occurring as instructed; runtime telemetry showed healthy Native X observation, 25 pending Watch Signals, and zero Watch-origin decisions/executions.

**Why QA missed it:** Existing tests covered Watch creation, prompt interpretation, signal handling, and broad attention independently, but did not assert that the scheduler's narrow `observe_inbound` operational branch invokes Watch judgment before reporting success.

**Project enforcement:** Keep `executeAutonomyRun` in `lib/autonomy-worker.ts` wired as `runAutonomousObservation → runAutonomousWatchSignals` for `observe_inbound`; keep `runAutonomousAttention` responsible for the broader path including discovery. Verify the runtime ledger distinguishes observation, Watch judgment, Social Intent, delivery, and verified outcome.

**Executable protection:** `tests/runtime.test.ts` and `tests/multi-act-execution.test.ts` cover Watch-purpose interpretation, disposition filtering, and the narrow `observe → judge Watch Signals` orchestration order without invoking discovery. A future full `executeAutonomyRun` integration fixture should still cover durable run completion and delivery handoff; that remains a recommended coverage gap.

**Apply when:** Changing temporal scheduling, operational run scopes, Native X observation, Watchlist signals, social planning, autonomous delivery, or Activity completion status.

**Added:** 2026-08-26

## Rule: Awake attention is not an independent social-action switch

**Defect class:** Watching exposes an autonomous-attention control pane that mixes infrastructure budgets with social quotas, or lets an operator disable attention independently of Presence status.

**General principle:** An Awake Presence may look around on its own. Operator controls shape breadth, cadence, and resource envelope; the Agent and Taste decide whether anything earns a social act. Pausing or putting the Presence to sleep is the higher-level stop.

**Project-specific enforcement:** Watching renders only explicit Watchlist and Explorations, with a link into Presence Settings → Attention & Rhythm. Attention presets project concrete read/model envelopes; social quotas and an Enabled toggle are absent from the operator surface. Runtime scheduling follows `Presence.status === "live"`, while legacy `enabled` data remains only a compatibility projection.

**Executable protection:** `tests/runtime.test.ts`, `tests/growth-runtime.test.ts`, and `tests/e2e/watching.spec.ts` protect the default availability, Quiet/Balanced/Curious budgets, status-gated scheduling, Watching boundary, Settings persistence, and removal of social quota controls.

**Apply when:** Changing Watching, Presence Settings → Attention & Rhythm, autonomous discovery scheduling, attention budgets, social-action targets, or Presence pause/sleep behavior.

**Added:** 2026-08-24

## Rule: Workspace revision races are reconciled silently

**Defect class:** A background observer or another tab wins a workspace revision race and the user is shown an internal “changed in another tab or worker” error repeatedly.

**General principle:** Optimistic concurrency must protect against lost updates without turning expected coordination into a product outage. After a 409, adopt the returned latest snapshot and retry only with that revision; background observers must never reuse the stale revision that just lost.

**Project-specific enforcement:** `Home.mutate`, Native X observation, Bridge management, and X management refresh their state from conflict responses and retry boundedly. Native X observation keeps a mutable latest snapshot for subsequent scheduled attempts; it does not report a workspace race as connector failure.

**Executable protection:** `tests/concurrent-agent-context.test.ts` continues to prove stale writes are rejected without overwriting newer data. Browser QA must exercise a stale-revision observer response and verify the latest workspace is adopted, the observer retries with the returned revision, and the internal conflict sentence is never shown.

**Apply when:** Changing `workspaceRevision`, `/api/state`, background observation, autonomy workers, Bridge/X management, or any browser mutation that writes the Agent workspace.

**Added:** 2026-08-21

## Rule: Activity must show its primary stream on first paint

**Defect class:** Loaded Activity counts with an apparently empty or stalled Stream

**General principle:** A count is not progress feedback. The primary Activity record must render as soon as the page has a usable projection, while deeper diagnostics remain optional detail.

**Project-specific enforcement:** Activity requests the lightweight `projection=activity` during initial hydration and keeps Stream details open by default. Empty state copy distinguishes “no activity recorded” from a paused or unavailable runtime.

**Executable protection:** `tests/growth-history.test.ts` protects the durable-history fallback; browser QA must load `/activity`, assert the Stream panel is present without a tab click, and verify a populated event or explicit empty-state message after the first Activity response.

**Apply when:** Changing Activity hydration, state projections, tab defaults, event filtering, polling, or high-level runtime status.

**Added:** 2026-08-23

## Rule: Credential editing must never imply saved secrets were deleted

**Defect class:** Secure credential form appears empty and causes unnecessary re-entry or accidental replacement

**General principle:** Secret values must remain hidden, but the UI must clearly distinguish hidden saved values from missing values. Blank edit fields preserve the encrypted server value unless the user explicitly replaces or disconnects it.

**Project-specific enforcement:** Native X editing labels blank fields as “saved securely · leave blank to keep”; the server merges non-empty replacements with the stored credential set and reports the actual cause of Needs Attention, including X credit exhaustion.

**Executable protection:** Route tests must cover blank-field edits preserving stored credentials; browser QA must verify no secret value is rendered and that the edit explanation, cause-specific status, and saved-connection test are present.

**Apply when:** Changing Native X settings, credential storage, connection health, provider quota handling, or secret form copy.

**Added:** 2026-08-23

## Rule: Status UI must reflect a durable run, not a pulse request

**Defect class:** Activity appears stuck or reports progress that cannot be resumed

**General principle:** A manual check is an observation job, not the queue for active delivery. The operator surface should show one high-level state from durable runtime truth: red when blocked, orange while recovering, green while work is moving, and blue only after a verified completion. Detailed pipeline and connector mechanics stay behind progressive disclosure.

**Project-specific enforcement:** `runPulse`/`wakePresence` for Native X enqueue an `observation` OperationalRun and return immediately; duplicate checks reuse the existing run. Live Activity derives its primary card from active runs, assignments, executions, incidents, and recent verified completions. Self-directed discovery advances `nextEligibleAt` when a source, plan, candidate, or model provider is unavailable so the temporal sweep cannot create a retry storm.

**Executable protection:** `tests/autonomy-resilience.test.ts` covers operational-run lifecycle and recovery; browser smoke must assert the default Activity DOM contains one `right-now-status` card, hides the pipeline/in-flight detail until `View details`, and disables `Check now` while an observation run is active.

**Apply when:** Changing Activity status, Pulse/Check now, autonomous scheduling, OperationalRun state, recovery, assignment progress, or any default operator-facing progress indicator.

**Added:** 2026-08-22

## Rule: Startup must fail loudly instead of changing workspaces

**Defect class:** Data loss caused by silent database fallback or reset

**General principle:** A configured workspace is an identity boundary. If its database is missing or unreadable, preserve the evidence and stop; never silently select another database or replace normalized records with an empty snapshot.

**Project-specific enforcement:** The launcher and database module honor `data/openpresence-db.json` as the selected workspace, reject a missing configured path, and refuse to reset when normalized records exist without a readable `app_state` snapshot.

**Executable protection:** ⚠️ Missing — recommended: add clean-process startup tests for a missing manifest target, an unreadable snapshot, and a normalized-records/no-snapshot database.

**Apply when:** Changing database selection, startup scripts, migrations, snapshot hydration, reset behavior, workspace switching, or persistence recovery.

**Added:** 2026-08-22

## Rule: One relationship card per external identity

**Defect class:** Data integrity / duplicate relationship cards

**General principle:** Render one relationship entity per authoritative external account, even when imports, replays, or migrations create multiple internal records.

**Project-specific risk:** Sandbox actor records can share a real X external actor ID with the canonical live Person record. People must be scoped by Presence and environment, then deduplicated by channel identity.

**Learned from:** Human-found duplicate Boardy cards in the live OpenPresence People view.

**Why QA missed it:** The existing filter removed unhydrated placeholders but treated every internal Person ID as a distinct relationship.

**Project enforcement:** `peopleForPresence` in `lib/network-memory.ts` and `PeopleView` in `app/page.tsx`.

**Executable protection:** `tests/presence-identity.test.ts` — duplicate internal records with the same X ID collapse to one visible person.

**Apply when:** Hydrating, migrating, importing, or rendering people from X or another external channel.

**Added:** 2026-08-22

## Rule: Growth proof must never synthesize activity

**Defect class:** Growth displays plausible weekly quotes, reposts, follows, or actions when no verified public record supports them.

**General principle:** A queued execution, decision, mirror lead, or historical estimate is not a public outcome. Activity counters must derive from verified Social Mirror history or succeeded, attributable outcomes and may show zero or an unknown baseline when evidence is sparse.

**Project enforcement:** Growth's weekly breakdown uses `derivePublicHistory` and succeeded follow outcomes; the previous activity-count fallbacks are removed. Bounded quote/repost and follow targets guide discovery but never create progress by themselves.

**Executable protection:** Full Vitest coverage passes, including the Growth capability and creditless-provider fallback tests. Browser QA must compare the displayed counters against the current verified history after refresh.

**Apply when:** Changing Growth KPIs, weekly activity summaries, autonomy proof, Social Mirror projection, outcome attribution, or experiment targets.

**Added:** 2026-08-21

## Rule: Usage refreshes must not blank a known snapshot

**Defect class:** A slow local runtime makes every Usage navigation look empty even though a previous ledger snapshot was successfully read.

**General principle:** Usage is an operator visibility surface. Keep the last successful snapshot available while a newer snapshot is being fetched, and label it as stale when the refresh cannot complete.

**Project-specific enforcement:** `/api/usage` coalesces concurrent reads and serves a short-lived stale-while-revalidate response; `UsageView` keeps an in-memory and browser-local snapshot, reports when it is stale, and only shows the retryable empty state when no snapshot exists.

**Executable protection:** Browser QA must navigate away from Usage and back while the runtime is slow, confirm the previous ledger remains visible, and confirm the page never renders both the timeout panel and the generic duplicate empty state.

**Apply when:** Changing `/api/usage`, UsageView caching, loading/error/empty states, or the local runtime persistence path.

## Rule: Client timeouts must not claim automatic retries

**Defect class:** Long-running attention action reports a misleading wait-window error

**General principle:** A client-side timeout is not proof that a server-side operation failed. The UI must give long-running operations an appropriate bounded window, avoid duplicate submission, and describe state verification honestly when the client stops waiting.

**Project-specific enforcement:** `fetchRuntime` uses `runtimeTimeoutForOperation`; attention operations receive the longer window, and an abort during an attention mutation refreshes state before presenting guidance to inspect Activity. The shared timeout copy no longer promises an automatic retry that the client did not actually perform.

**Executable protection:** `tests/runtime-timeout.test.ts` asserts the long-running operation window and rejects the old misleading copy; browser QA must exercise Check now/Wake up and confirm the UI returns to a verifiable state without duplicate actions.

**Apply when:** Changing `fetchRuntime`, `/api/state` mutations, attention workers, Check now/Wake up controls, retry behavior, or client-side timeout copy.

**Added:** 2026-08-21

## Rule: Usage loading states must have a bounded exit

**Defect class:** Usage page stuck indefinitely on “Reading the usage ledger…”

**General principle:** A provider-backed or local ledger read must always resolve into data, an actionable error, or an explicit empty state. A loading label without a timeout hides runtime failure and leaves the operator unable to decide whether to wait, retry, or change the system.

**Project-specific enforcement:** `UsageView` aborts ledger requests after a bounded window, clears the loading state on both success and failure, explains whether the request timed out, and exposes a retry action. Usage attribution continues to label X activity as recorded connector observations rather than an authoritative provider credit balance.

**Executable protection:** The X credit and connection test suite must continue to pass; browser QA must verify the Usage page reaches either its ledger content or the retryable error state and never remains on the loading label indefinitely.

**Apply when:** Changing `/api/usage`, UsageView fetch/filter behavior, ledger persistence, provider attribution, or any loading state that depends on the local runtime.

## Rule: Verify the served development port

**Defect class:** A fix is validated on a parallel development port while the user-facing port still serves an older or uncompiled route bundle.

**General principle:** Browser verification must target the exact local URL and process the user reported, or explicitly prove that the target port has been restarted from current source.

**Project enforcement:** Inspect the target listener, restart stale local Next processes when needed, and verify the feature endpoint and user-visible copy on that same port. A clean result on another port is supporting evidence only.

**Executable protection:** QA must check the requested port for the old timeout copy, bounded Usage loading, and a successful Usage response before treating the feature as fixed.

**Added:** 2026-08-21

## Rule: A readable provider must not strand browser-capable writes

**Defect class:** Growth reports Follow or Original posts unavailable, or scheduled work dies on a connected Native X record with no write credits even though Chrome is connected.

**General principle:** Connector health is capability-specific. Preserve readable Native X access for discovery and metrics, but route writes through any connected, identity-verified adapter that can execute and verify the requested affordance. A queued action is not success; only the adapter's verified outcome advances Growth.

**Project enforcement:** `derivePresenceCapabilityManifest` projects Chrome `post`/`follow`/`quote`/`repost` capabilities; `nativeConnectionCanWrite` excludes creditless Native X writes so scheduled Original-post work can select the Chrome Bridge; `extension/channel-x.js` handles sealed Original post and Follow executions with account and UI-state verification.

**Executable protection:** `tests/bridge-contract.test.ts` asserts the shipped Chrome contract includes `post` and `follow`; `tests/extension-composer.test.ts` checks the browser executor and target routes; focused Growth, Bridge, and attention tests pass. Browser acceptance still requires reloading the unpacked extension and verifying one Sandbox trial plus an explicitly approved live action.

**Apply when:** Changing Growth capability projections, Native X billing/permission handling, scheduled publishing, Chrome Bridge routing, browser execution, or any provider fallback.

**Added:** 2026-08-21

## Rule: Attention-budget controls must merge, not overwrite

**Defect class:** Editing adjacent Growth budget controls causes one persisted limit to revert because each control submits a stale full Presence patch.

**General principle:** Resource-envelope edits are independent fields on one Presence policy. Serialize local saves and merge each patch against the latest returned state before persisting.

**Project enforcement:** `updateSelfDirectedAttention` queues Presence updates and merges each budget or target patch against the latest mutation result.

**Browser verification:** Chrome Settings now persists 60 X reads/day, 36 hydrations/day, 2 qualified quote/reposts/day, and 3 qualified follows/day after reload.

**Added:** 2026-08-21

## Rule: Active delivery must have an immediate operator stop path

**Defect class:** Assignment or delivery remains visibly in progress with no way to stop a possible duplicate

**General principle:** Any public action that is queued, claimed, executing, or awaiting provider verification needs an operator-visible stop path. Stopping before send may cancel the execution; stopping after the external boundary must close the unresolved state and prevent retries without claiming the public outcome is absent.

**Project enforcement:** Activity's current Assignment card exposes `Stop now`; the Assignment queue exposes `Cancel Assignment`; Activity focus and the Execution Ledger expose `Cancel send` / `Stop & close delivery`. `cancelAssignment` stops linked pending executions, removes the cancelled responsibility from open operational views, while `cancelExecution` maps in-flight or verification-pending work to `verification-closed` with explicit operator review metadata and no Outcome.

**Executable protection:** `tests/runtime.test.ts` verifies force-stopping an unresolved X execution preserves the unknown outcome and that cancelling an Assignment stops its linked pending delivery. Browser QA must verify the stop control is visible from the current Assignment card and that the card leaves the active view after confirmation.

**Apply when:** Changing Activity current-work cards, Assignment cancellation, Execution Ledger controls, X verification, Bridge retries, or any delivery state that can be interpreted as an ongoing public action.

**Added:** 2026-08-19

## Rule: One social responsibility must not appear as two executable requests

**Defect class:** A migrated operator reply is shown as both an Assignment and an Explicit request, allowing duplicate execution paths for the same target.

**General principle:** Intent, Assignment, execution, delivery, and verified outcome are distinct records, but one requested social act must converge on one canonical responsibility. Legacy projections may remain for audit history, never as a second runnable request.

**Project enforcement:** Operator reply directives migrated into Assignments are hidden from the duplicate Explicit request projection; live reply execution reuses an already-open linked delivery; Assignment cancellation closes both Assignment-linked and legacy-directive-linked executions. Identical open Assignment creation requests are idempotent within Presence, environment, session, objective, schedule, and instruction scope.

**Executable protection:** `tests/runtime.test.ts` verifies duplicate scoped Assignment creation, migrated-directive cancellation, and linked delivery shutdown. Agenda migration coverage verifies legacy directive migration remains idempotent.

**Apply when:** Changing operator reply requests, Assignment migration, Activity/Assignment queue projections, live reply execution, or any retry/idempotency behavior around public social actions.

**Added:** 2026-08-19

## Rule: Social Mirror text must preserve channel paragraph structure

**Defect class:** Public post formatting flattened in Feed and Mirror cards

**General principle:** A mirrored social object is a representation of the channel's public expression. Normalize adapter noise such as rendered headers and counters, but never collapse meaningful line breaks or blank lines that shape the author's expression.

**Project enforcement:** `cleanMirrorText` normalizes horizontal adapter whitespace while preserving line endings and paragraph breaks. Feed, Social Mirror, and Activity context surfaces already render normalized content with `white-space: pre-wrap`.

**Executable protection:** `tests/mirror-content.test.ts` verifies X rendered metadata is removed while multiple paragraphs remain separated by blank lines. Browser smoke verification checks Feed and Social Mirror text containers retain `pre-wrap`.

**Apply when:** Changing X/browser observation, Bridge/native Mirror ingestion, `cleanMirrorText`, Feed cards, Social Mirror cards, Activity context, or any channel-specific content normalization.

**Added:** 2026-08-19

## Rule: Operational Agenda must project work, not responsibilities

**Defect class:** Operator cannot tell what the Agent is doing, what is next, or what is merely being watched

**General principle:** Durable responsibilities are outcomes the Agent remains accountable for; they are not automatically executable jobs. Compile a fresh Agenda Work Item snapshot from all eligible attention sources, rank that snapshot dynamically, and keep background sources visible even when they do not currently win foreground attention.

**Project enforcement:** `compileAgenda` delegates to `compileAgendaWork`, which derives work from Assignments, publishing windows, mentions, open conversations, Explorations, Watchlist, Growth reviews, and self-directed attention. Activity renders the current Working/Waiting state, ranked Next Up, Watching, and Needs You; Agenda adds Upcoming and Ongoing Responsibilities. Numbers are snapshot ranks, not fixed category priorities.

**Executable protection:** `tests/agenda-and-assignment.test.ts` verifies work-item derivation, concrete next actions, priority reasons, completion conditions, and separation from the durable Growth responsibility. `tests/e2e/openpresence.spec.ts` verifies Activity/Agenda projection, legacy Queue/Behind-the-mind removal, observed-vs-selected terminology, and mobile no-overflow. Chrome QA must confirm the live rail and full Agenda against the current workspace.

**Apply when:** Changing Agenda compilation, Activity/Agenda hierarchy, Assignment status projection, Mirror judgment terminology, Watchlist/Exploration visibility, self-directed attention, or any operator surface that describes current Agent work.

**Added:** 2026-08-19

## Rule: Public sentence formatting must be enforced at the expression boundary

**Defect class:** Model style instruction ignored at publication / paragraph-shaped post

**General principle:** Taste is the durable language contract, but model output is not a delivery guarantee. When a Presence is instructed to put one sentence per line with one blank line between sentences, the final public expression must normalize sentence boundaries immediately before it is stored or handed to a channel composer.

**Project enforcement:** `TASTE.md` records the one-sentence-per-line preference with blank separation, `formatOneSentencePerLine` normalizes model and operator-authored public payloads to exactly one blank line between sentences, and Presence Chat applies the same projection so rehearsal output matches delivery output. The formatter preserves sentence boundaries and does not split decimal or URL punctuation.

**Executable protection:** `tests/one-sentence-per-line.test.ts` covers paragraphs, closing quotes, decimals, and URLs. Chat QA must send a multi-sentence prompt and verify each returned sentence is separated by one blank line; native live X QA must verify the exact new post after publication.

**Apply when:** Changing Taste loading, model expression cleanup, public publication payloads, Chat rehearsal responses, X composers, or any channel delivery boundary.

**Added:** 2026-08-18

## Rule: Forensic ledgers must be bounded and paginated

**Defect class:** Large audit projection slows the operator surface and silently caps history

**General principle:** Operational forensic views must not rebuild every relationship with nested collection scans or load an unbounded first page. Index correlation keys once, return explicit pagination metadata, and keep the visible page bounded while preserving total-count truth.

**Project-specific enforcement:** `GET /api/runtime/log` indexes run, invocation, social-intent, usage, and outcome relationships and accepts `page`/`pageSize` (10–100). `TechnicalAuditView` requests 50 records at a time and exposes Newer/Older controls with a truthful total count.

**Executable protection:** `tests/autonomy-resilience.test.ts` asserts the ledger returns page metadata and never returns more than the requested page size; the Chrome smoke surface verifies the rendered pagination controls.

**Apply when:** Changing the Technical Audit, runtime log projection, operational history, Activity forensic views, or any high-volume trace surface.

**Added:** 2026-08-21

## Rule: Browser bridge health must be verified at the config boundary

**Defect class:** Healthy-looking extension state hides an unreachable app handoff

**General principle:** A Bridge cannot be considered connected from an old heartbeat alone. The extension's config endpoint, current account identity, capabilities, and fresh heartbeat must all agree before Growth reports browser execution as available.

**Project enforcement:** The Chrome reconnect flow is verified through the Settings UI and the persisted Bridge record; a stale or 5xx config response remains unavailable even if an old Bridge row exists.

**Executable protection:** Browser smoke should assert the config route returns 200, the displayed account matches the Presence, and the persisted heartbeat/capabilities are fresh before any live acceptance action is considered.

**Apply when:** Changing Chrome Bridge config, reconnect, capability negotiation, Growth availability, or live-action acceptance gates.

**Added:** 2026-08-21

## Rule: Observation tabs must not be redirected for metric collection

**Defect class:** Growth discovery starved by a metrics-only navigation loop

**General principle:** A controlled timeline is an attention source. Collecting profile metrics must not navigate it away from current public context; profile measurement and timeline observation are separate browser responsibilities.

**Project enforcement:** Profile tabs report audience/publication metrics, while non-profile tabs remain in place and continue emitting visible, language-confirmed observations for self-directed discovery.

**Executable protection:** Extension E2E coverage asserts both profile metric reporting and timeline URL preservation plus an emitted observation when a metrics request occurs on a non-profile tab.

**Apply when:** Changing Bridge metrics, X tab navigation, observation scanning, self-directed discovery, or Growth evidence collection.

**Added:** 2026-08-21

## Rule: Capability-trial budgets are isolated and outcomes preserve target lineage

**Defect class:** A bounded capability trial is starved by unrelated attention usage, or a verified quote/repost appears without its referenced post in Feed.

**General principle:** An explicit trial owns its bounded discovery envelope; ambient reads must not consume it. A public outcome is not complete until its channel-native target/reference relationship is persisted and rendered from the Social Mirror.

**Project enforcement:** Trial discovery uses the trial's own read budget, native quote projections preserve `referencedExternalRefs`, and Feed/history resolve quote context from that reference. Connector reads fail into a bounded recovery path instead of monopolizing the runtime.

**Executable protection:** Runtime tests cover native verified quote projection, quote target resolution, Chrome fallback routing, and verified Bridge quote/repost history. Live QA must record trial elapsed time, native/Bridge health, candidate audits, execution status, and the exact Feed item before claiming `PASS_VERIFIED`.

**Apply when:** Changing capability trials, self-directed discovery, native/Bridge fallback, quote/repost execution, Social Mirror projections, Feed context, or runtime health/recovery.

**Added:** 2026-08-20

## Rule: Unchanged audience polls must not masquerade as new evidence

**Defect class:** Repeated metric snapshot / evidence freshness ambiguity

**General principle:** A connector may poll frequently, but an unchanged audience reading is one signal, not a new growth event every few seconds. Preserve meaningful cadence and real count changes while collapsing unchanged readings from the same short polling burst.

**Project enforcement:** Runtime persistence deduplicates unchanged audience readings within a two-minute burst window. Growth review counts and operator-facing evidence lists also collapse legacy duplicates, so the UI does not report inflated evidence or imply that a flat count changed repeatedly.

**Executable protection:** `tests/growth-runtime.test.ts` verifies burst collapse, later cadence, and count changes. `tests/bridge-metrics.test.ts` verifies the Browser Bridge path does not persist a second unchanged reading.

**Apply when:** Changing audience metric ingestion, Native X polling, Browser Bridge metrics, Growth evidence counts, or audience snapshot rendering.

**Added:** 2026-08-17

## Rule: Chrome fallback delivery is not authoritative until X confirms it

**Defect class:** Public Chrome success displayed as a local delivery failure

**General principle:** The Chrome extension is only the writer for replies that cannot use the normal Native X route. A DOM submission or extension acknowledgement is not proof that X accepted the public reply. The X API must verify the exact Presence account, parent post, and normalized reply text before Activity marks the execution sent.

**Project enforcement:** New Chrome replies enter `verification-pending` after submission and the extension retries the verification endpoint with bounded backoff. The Activity queue exposes separate Native X, Chrome fallback, and X-verification counts. A bounded X reconciliation operation repairs older stale Chrome failures only on an exact API match; it requeues only unmatched retryable replies while preserving account, permission, policy, target, and attempt limits.

**Executable protection:** Runtime regression covers idempotent repair of a stale Chrome failure into one succeeded execution, one verified outcome, and one executed action. Browser verification must confirm the public X reply and then confirm Activity changes from pending/failed to sent without creating a duplicate.

**Apply when:** Changing Chrome extension submission, X API verification, execution status transitions, fallback retries, queue counts, or public delivery history.

**Added:** 2026-08-17

## Rule: Provider-rejected composers must not trigger a retry navigation

**Defect class:** Native X "Leave site?" dialog during Chrome fallback retries

**General principle:** A provider rejection is a delivery failure, not permission to replay the same public act or abandon a dirty composer. Detect explicit rejection text, stop retrying that execution, and never navigate away from unsaved composer state.

**Project enforcement:** The X content script classifies duplicate/explicit submission alerts as non-retryable failures and waits for a clean composer before target/profile navigation. `COMPOSER_BUSY` is returned instead of triggering X's native unload warning.

**Executable protection:** `tests/e2e/extension-composer.spec.ts` verifies dirty-composer navigation is blocked and duplicate X rejection is non-retryable.

**Apply when:** Changing Chrome fallback submission, X error handling, queue retries, metrics navigation, or any Bridge route that can navigate an X tab.

**Added:** 2026-08-19

## Rule: Failed public actions need an explicit close-or-retry lifecycle

**Defect class:** Unresolved delivery failures mistaken for a stuck send queue

**General principle:** A failed, blocked, or expired public action must remain visibly unresolved until the exact public outcome is checked. Once checked, the operator must be able to close the failure with a reason or retry the same action safely; closing a failure must never imply that it was delivered.

**Project enforcement:** Activity separates pending sends from open failure review, shows the route and failure reason for every open attempt, and exposes a visible per-attempt close action. `reviewFailedExecution` records the disposition and keeps the execution failed; only exact X reconciliation or a verified connector outcome may create an external reference or sent outcome. Retried X replies are reconciled against account, target, and text before another request is sent.

**Executable protection:** `tests/runtime.test.ts` verifies that closing an account-mismatch failure records review metadata without an external result; `tests/e2e/activity-delivery-trace.spec.ts` verifies that Activity labels open failures as failures to resolve.

**Apply when:** Changing Activity queue summaries, failure review, X reconciliation, retry behavior, connector routing, or any status that can be interpreted as sent/delivered.

**Added:** 2026-08-17

## Rule: Unverified delivery closure must remain distinct from sent or failed

**Defect class:** Provider verification outage leaving the Activity queue permanently pending

**General principle:** When a provider cannot confirm whether a public action happened, the operator needs an explicit, auditable way to stop retry pressure without rewriting uncertainty into success or an ordinary delivery failure. Closing that state must preserve the absence of an external reference and sent outcome.

**Project enforcement:** `closeUnverifiedExecutions` moves live Native X/Chrome replies from `verification-pending` to `verification-closed`, expires the original Social Intent, marks the Action skipped, and records operator review metadata. Activity removes the records from active queue counts while stating that no reply was counted as sent. X reconciliation remains the preferred path when provider access is available.

**Executable protection:** `tests/runtime.test.ts` verifies the closed state has no external reference or Outcome and expires the Social Intent.

**Apply when:** Changing X verification, provider-credit handling, Activity queue counts, retry/close controls, or any status representing an unknown public outcome.

**Added:** 2026-08-18

## Rule: Observed context must expose judgment status as a first-class filter

**Defect class:** Operator cannot quickly distinguish observed content from evaluated content

**General principle:** An observation feed should make the boundary between “available for judgment” and “judgment recorded” directly filterable. Status labels on individual cards are useful evidence, but they are not a fast review workflow by themselves.

**Project enforcement:** `MirrorPanel` keeps the existing source filter and adds an independent Attention selection tab group with counts for Observed, Awaiting judgment, and Selected for attention. The filter uses the same Social Decision/Social Intent linkage that drives each card’s selection chip, resets pagination scope safely, and reports the filtered total without implying that every observed object is owed work.

**Executable protection:** `tests/e2e/openpresence.spec.ts` seeds both selected and unselected observed posts, verifies each status tab isolates the correct card, and confirms the existing Mentions filter still works after returning to Observed.

**Apply when:** Changing Activity’s Observed context, Social Mirror cards, judgment lineage, decision visibility, pagination, or operator review filters.

**Added:** 2026-08-18

## Rule: Operator-directed social acts must not get stuck in a false preparing state

**Defect class:** Stale operator directive / missing execution after explicit request

**General principle:** An operator request is not delivery. If an explicit social request has no live execution, the operator must be able to retry it from the same evidence object; a paused Presence may perform that one requested act without resuming autonomous attention. Only a provider-confirmed outcome counts as sent.

**Project enforcement:** `formXReplyIntent` accepts an explicit operator directive while a Presence is paused, `applyOperation` reopens an expressed directive when its prior execution is absent or terminal, and Activity only shows “Reply requested” while an execution is actually pending. Failed or missing executions return the same target to an actionable “Ask … to reply” state.

**Executable protection:** `tests/runtime.test.ts` verifies paused operator replies create an operator-scoped execution and stale directives reopen for retry. Chrome QA must inspect the exact target modal after both an empty/stale request and a provider failure; no “preparing” label may be treated as delivery.

**Apply when:** Changing Activity decision context, operator-directed replies, Presence pause/wake behavior, social intent construction, Bridge/native delivery, or delivery-status projection.

**Added:** 2026-08-17

## Rule: Growth must expose evidence freshness and check cadence

**Defect class:** Stale-evidence ambiguity / missing autonomous cadence visibility

**General principle:** A Growth surface that says evidence is missing must also show whether channel evidence ever arrived, when the last Agent review happened, and when the next review or observation is expected. Paused work and connector-controlled cadence must be explicit; the UI must not manufacture a countdown or imply that a connected heartbeat is a metrics report.

**Project enforcement:** `GrowthView` derives the latest audience/publication observation and latest Growth review from persisted state, renders the scheduled weekly/strategic Agent review countdown, and labels paused Presence checks and Browser Bridge adapter cadence separately. Browser Bridge freshness is based on its persisted heartbeat and never treated as follower/performance evidence.

**Executable protection:** `tests/e2e/openpresence.spec.ts` verifies the Growth cadence region exposes missing evidence, last-review state, next-review scheduling, and channel-check status on Chromium and mobile; `tests/growth-runtime.test.ts` preserves the evidence/review persistence contract. Chrome QA must inspect a paused no-evidence workspace and a live scheduled-review workspace.

**Apply when:** Changing Growth evidence cards, audience/publication snapshot ingestion, review scheduling, Presence pause/wake behavior, Browser Bridge health, or any countdown shown to operators.

**Added:** 2026-08-17

## Rule: Controlled social composers must synchronize before submission

**Defect class:** Browser-controlled input false success / retry provenance race

**General principle:** Visible text in a social composer is not proof that the provider accepted the value. A browser adapter must wait for the controlled submit state, verify the correct account, and return to observation on failure. Retryable browser failures must clear the sealed delivery state before another Bridge claim.

**Project enforcement:** `extension/execution.js` reads approved text from the Bridge publication envelope, `extension/composer.js` dispatches the input event and requires X's Reply button to be enabled before success, and the X channel resets its overlay on recoverable failure. `extension/background.js` serializes claims per Presence and only reclaims after a retryable failure has been persisted. `failExecution` returns the Public Expression to candidate state and clears its permit before retry.

**Executable protection:** `tests/e2e/extension-composer.spec.ts` runs the production composer helper against a controlled contenteditable that enables its submit button only after input state is received. `tests/runtime.test.ts` verifies a retryable Bridge failure can be claimed again with a fresh sealed expression instead of becoming `INVALID_PROVENANCE`.

**Apply when:** Changing the Chrome extension composer, social contenteditable selectors, Bridge claim/fail/ack lifecycle, retry scheduling, or live publication sealing.

**Added:** 2026-08-16

## Rule: Social Mirror cards must exclude platform chrome from post text

**Defect class:** Scraped UI metadata leaking into world evidence

**General principle:** A Social Mirror card should show the social object's content and OpenPresence's own observation time. Platform-rendered timestamps, view counters, and engagement chrome are not post text and should not become app-owned data or imply metrics OpenPresence maintains.

**Project enforcement:** X normalization removes rendered author headers, trailing engagement counts, and the rendered `time · date · view count` footer before Mirror content is displayed or persisted. Activity's context inspector uses the same normalization path.

**Executable protection:** `tests/mirror-content.test.ts` covers the full `2:44 PM · Aug 16, 2026 · 1 View` footer, while Activity renders the normalized content through `cleanMirrorText`.

**Apply when:** Changing browser observation, Bridge ingestion, X content normalization, Social Mirror cards, Activity context, or channel-specific metadata parsing.

**Added:** 2026-08-16

## Rule: Activity evidence must not create horizontal scroll

**Defect class:** Responsive min-content overflow / sidebar and evidence-row layout drift

**General principle:** A dense evidence view should preserve readable content and controls without allowing a secondary panel, long social text, or source links to widen the page beyond the viewport. Responsive grids must be shrinkable, and repeated evidence actions must wrap intentionally.

**Project enforcement:** Activity's `.activity-main-grid` and `.activity-side-column` use zero-minimum grid tracks below the desktop breakpoint; Activity panels and columns declare `min-width: 0`; observed post content and source/action footers can wrap long text and links instead of preserving min-content width.

**Executable protection:** `tests/e2e/activity-overflow.spec.ts` opens Activity and asserts document width stays within the viewport at desktop, tablet, and mobile widths; `tests/e2e/small-desktop.spec.ts` preserves the compact-workspace overflow check.

**Apply when:** Changing Activity's observed context, operating status sidebar, source links, evidence actions, responsive breakpoints, or shared workspace width rules.

**Added:** 2026-08-16

## Rule: Attention scheduling must be single-flight across tabs

**Defect class:** Cross-tab scheduler loop / duplicate attention execution

**General principle:** A scheduled attention trigger must settle or be suppressed before another observer can retrigger it; browser tabs must not independently execute the same due work without server-side coordination.

**Project-specific risk:** Activity's calendar effect can repeatedly call attention for a due live Assignment. Bridge-backed attention must settle the Assignment through the Attention Worker, and multiple open tabs can share one workspace revision. Without both protections, repeated Pulse events can make the UI flicker between checking and connection-required states.

**Learned from:** Human-found browser defect in Activity with two OpenPresence tabs open.

**Why QA missed it:** Existing tests covered single request behavior and Bridge health, but not repeated due scheduling, stale Bridge suppression, or concurrent browser tabs.

**Project enforcement:** The Activity calendar effect, `runAttentionWorker` in `app/api/state/route.ts`, `bridgeAdapterStatus`, conflict handling, and the `attentionWorkerRuns` single-flight map must be reviewed together. Bridge scheduled work requires a fresh connected adapter; stale adapters do not auto-trigger.

**Executable protection:** `tests/x-connection.test.ts` covers stale Bridge worker suppression; scoped Chrome QA covers two local tabs with a due Assignment and verifies the state remains stable over time.

**Apply when:** Changing Activity scheduling, Bridge health, Attention Worker, scheduled Assignments, or workspace conflict retry behavior.

**Added:** 2026-08-16

## Rule: Exploration events must preserve finding evidence

**Defect class:** Count-only exploration activity / untraceable finding

**General principle:** An Exploration event must identify the evidence that caused the finding and the bounded reason it mattered. A count alone, or `No linked world object was recorded for this event`, is not operator-usable.

**Project enforcement:** `finishExplorationSession` links a worthwhile Exploration event to its first verified Mirror object and includes its safe summary in the event detail. Activity reconstructs the finding-to-session link for older events, shows the safe summary and why it mattered, and keeps the observed post as the evidence link. The UI does not expose chain-of-thought.

**Executable protection:** `tests/explorations.test.ts` verifies the completion event carries the finding's Mirror object ID and summary. Chrome QA verifies a completed Exploration event exposes the author/post, finding summary, why it mattered, and `No public action created` instead of an unhelpful missing-link message.

**Apply when:** Changing Exploration completion events, finding persistence, Activity decision traces, observed-post context, or Watching-to-Activity evidence lineage.

**Added:** 2026-08-17

## Rule: Repeated finding actions must share a stable action column

**Defect class:** Inconsistent row alignment / cramped responsive action control

**General principle:** Repeated social findings should spend available horizontal space on readable evidence while keeping the operator action visually predictable. Action controls align to a stable column on desktop and become full-width below the evidence on narrow screens.

**Project enforcement:** `.exploration-finding` uses a content/action grid with a 200px desktop action column and a single-column mobile layout; the response button fills its assigned column.

**Executable protection:** Chrome QA measures all rendered finding buttons for the same desktop width/right edge, verifies full-width mobile buttons, and asserts no horizontal overflow.

**Apply when:** Changing Exploration finding cards, operator-directed response actions, repeated evidence lists, or responsive Watching layouts.

**Added:** 2026-08-16

## Rule: X Exploration success must prove query-backed discovery

**Defect class:** False discovery coverage / missing search provenance

**General principle:** A search strategy or connected badge is not evidence that a provider search ran. A successful Exploration must retain the compiled query, actual discovery source, considered-result count, triage count, and outcome; a degraded or Mirror-only run must say that no new external results were imported.

**Project enforcement:** Native Exploration sessions persist `searchQuery`, `discoverySource`, `artifactIds`, counts, status, and failure reason. The Watching run monitor exposes the query and pipeline only after the provider-backed run returns, while degraded runs retain their failure and distinguish existing Social Mirror evidence from new X results.

**Executable protection:** `tests/explorations.test.ts` covers the Exploration lifecycle and native assignment boundary; focused Chrome QA verifies the Watching success state, visible query, `X public search` source, `25 considered · 25 triaged · 5 worthwhile` pipeline, and zero browser errors.

**Apply when:** Changing Exploration planning, X public search, Mirror fallback, session persistence, run monitor copy, or provider error handling.

**Added:** 2026-08-16

## Rule: Due live Explorations must reach grounded quote decisions

**Defect class:** Unreachable Exploration worker / silently unavailable quote capability / generic public expression

**General principle:** An active due Exploration is durable work, not a decorative configuration. It must enter the scheduled broad-attention path, preserve search and decision lineage, and only propose a quote when a short source-grounded response improves the specific public post.

**Project enforcement:** The temporal sweep dispatches due live Explorations independently of the self-directed cooldown. The shared Exploration worker records `originKind: exploration`, runs search and triage, carries run/invocation/attention-episode IDs through findings and Social Intents, and may use a verified connected Chrome quote route when native X target rules reject an arbitrary public post. Quote/reply drafts are checked for source-specificity and length before delivery.

**Executable protection:** `tests/explorations.test.ts` covers durable due scheduling, live Exploration delivery, verified Chrome fallback quote routing, and the sandbox/live boundary. Browser QA must verify that a due Exploration reports queued/running work and that a completed look exposes its search source, findings, decision, and delivery outcome without generic internal-planner copy.

**Apply when:** Changing Exploration scheduling, X discovery, quote/reply eligibility, Chrome fallback, public expression prompts, Social Intent lineage, or the Watching Exploration monitor.

**Added:** 2026-08-29

## Rule: Published library media needs a hard cooldown

**Defect class:** A Presence publishes the same Asset Library visual repeatedly because the selector treats a previously used asset record as reusable.

**General principle:** A verified live publication makes the exact library Asset unavailable to that Presence for a configurable cooldown, six months by default. Candidate search, asset authorization, and final delivery must enforce the same window; visual similarity checks must also cover duplicate Asset records and in-flight races.

**Required QA:** Verify the setting migrates to six months, a recent live usage disappears from Agent search and fails authorization, an expired usage becomes selectable, Sandbox usage does not start the window, and a Presence switch does not leak the hold to another Presence. Confirm the Asset Library shows the hold and end date.

**Added:** 2026-08-30

## Rule: Presence Rehearsal shares Chat's viewport contract

**Defect class:** Conversational UX / scroll ownership / initialization race

**General principle:** A Chat-like thread must keep the transcript as the only scroll owner and keep a usable composer anchored at the bottom of the viewport. Empty-state controls must not imply an action is available before input exists, and initial-session creation must be idempotent while the first response is in flight.

**Project-specific risk:** Presence Rehearsal used the shared Chat markup but its mobile override let the document grow, its empty send button was enabled, and the initialization effect could issue multiple `newPresenceChatSession` mutations because the inline mutation function changed identity while the first request was pending.

**Project enforcement:** `PresenceChatView` guards session creation with `sessionCreationInFlightRef`, renders the transcript as `[data-testid="rehearsal-transcript"]`, keeps the composer at `[data-testid="rehearsal-composer"]`, and disables send until a message and session exist. Rehearsal-specific mobile CSS gives the transcript `overflow-y: auto` and keeps the footer outside it.

**Executable protection:** `tests/e2e/rehearsal-chat.spec.ts` asserts one initial session, disabled empty send, populated transcript persistence after reload, no document overflow, and composer-at-viewport-bottom geometry on desktop and mobile.

**Apply when:** Changing Presence Chat/Rehearsal rendering, session initialization, composer controls, responsive shell sizing, or transcript scrolling.

**Added:** 2026-09-01

## Rule: Observed authored replies must quarantine the target

**Defect class:** Blocking reliability / external-impact safety / duplicate public outcome

**General principle:** Once the observed world proves that a Presence has authored a reply under a target, no stale intent, retry, worker, or connector may submit another reply to that target. Delivery idempotency must use both an atomic semantic target key and independent Social Mirror evidence so lost acknowledgements and legacy state cannot reopen a public write.

**Project-specific risk:** `formXReplyIntent` previously relied on local execution history, while Native delivery and Bridge claim could receive a stale snapshot after an own reply had already appeared in the Mirror. The browser composer also had no last-moment target-history check.

**Learned from:** Direct duplicate-public-outcome report with Review screenshots showing multiple replies from the Presence on the same public threads.

**Why QA missed it:** Existing tests proved concurrent fresh executions converged through `public_action_delivery_slots`, but did not seed a previously observed own reply while exercising a stale queued execution or browser handoff.

**Project enforcement:** `hasObservedOwnReplyForTarget` in `lib/duplicate-public-outcome.ts` is checked by `formXReplyIntent`, `deliverNativeExecutions`, `claimExecutions`, and `scripts/x-browser-bridge.mjs`. A detected duplicate is cancelled/quarantined with `DUPLICATE_PUBLIC_OUTCOME`; the durable delivery slot remains uncertain and is never released for an observed public result. Review retains the target and reply evidence under `[data-testid="duplicate-public-outcome-evidence"]`.

**Executable protection:** `tests/duplicate-action-idempotency.test.ts` asserts no new intent forms after an observed own reply; `tests/native-execution-delivery.test.ts` asserts a stale queued execution is cancelled without calling the X writer; `tests/e2e/schedule-recovery.spec.ts` asserts Review shows the target and all observed replies before resume. `node --check scripts/x-browser-bridge.mjs` validates the browser guard.

**Apply when:** Changing X reply cognition, Social Mirror attribution, Native/Bridge delivery, retries, acknowledgement reconciliation, Review duplicate recovery, or target-scoped idempotency.

**Added:** 2026-09-01

## Rule: Social strategy remains bounded capability, not hidden policy

**Defect class:** A strategy layer silently turns performance signals or legacy prose into mandatory behavior, rewrites identity, or claims effectiveness without a verified outcome.

**General principle:** Retrieve zero to five diverse possibilities per social situation, keep considered and selected provenance separate, and let Taste, Mission, privacy, authority, and silence remain decisive. Typed Growth evidence must distinguish world outcomes, operator review, and strategy observation.

**Project enforcement:** Channel fluency is referenced explicitly by `socialStrategyPlaybookRef`; legacy `playbook` prose is retained as low-precedence advisory guidance. Derived hypotheses preserve originals and lineage. `supported` requires a verified `WORLD_OUTCOME`; `weakened` remains `TEST`, `disfavored` maps to `STOP`, and `retired` is archived/hidden. Recent strategy shape applies only a soft fatigue penalty with no cooldown.

**Executable protection:** `tests/social-strategy.test.ts` covers bounded/zero retrieval, legacy guidance, invalid IDs, soft fatigue, and the world-outcome support gate. Growth browser QA must show scope, disposition, confidence, typed evidence, and lineage without presenting hypotheses as identity or mandatory posting instructions.

**Apply when:** Changing social planning, Channel definitions, Skills, Growth reviews, strategy retrieval, Activity decision details, or any path that records social decisions.

**Added:** 2026-08-31

## Rule: Duplicate or unsafe own X content needs a verified correction path

**Defect class:** Repeated public media or text remains live because the Presence cannot remove its own post or reply safely.

**General principle:** Deletion is a consequential public action. It must be scoped to the active Presence's own live X post or reply, use the same Off / Manual / Review / Auto execution envelope as other X actions, default to Review, and retain the original in OpenPresence history after X confirms it is gone.

**Learned from:** Human-found duplicate-picture publications from Genny that should never have been repeated.

**Why QA missed it:** The runtime could detect duplicate-risk publication failures but had no first-class, ownership-checked delete action or operator review workflow for correcting already-live content.

**Project enforcement:** `formXDeleteIntent` fails closed for non-owned or non-live mirror objects; Native X and the Chrome Bridge both require the Presence account and verify disappearance through the X API; Activity presents a deletion-specific confirmation and preserves the archived history record. New and migrated X Presences receive Review for deletion.

**Executable protection:** `tests/runtime.test.ts` covers ownership, all four modes, idempotency, and post-verification archival; `tests/ai.test.ts` covers deletion aliases; `tests/extension-composer.test.ts` covers the Chrome delete affordance and unresolved-verification guard. Browser QA must verify the Settings capability row, Activity deletion review, and truthful retained history.

**Apply when:** Changing duplicate publication handling, X self-correction, deletion controls, execution envelopes, Activity review cards, Mirror archival, or provider verification.

**Added:** 2026-08-30

## Rule: Database corruption is an operator boundary, not a retryable outage

**Defect class:** Runtime recovery misclassification leaves live delivery stuck while the UI says no action is needed.

**General principle:** A malformed canonical database cannot be made safe by retrying the affected social actions. Stop autonomous delivery, preserve the pending records, and surface an explicit operator recovery boundary.

**Learned from:** Human-found Distribution push showing `awaiting confirmation`, a stale attention pass, and `Recovering` while the live Health panel reported `database disk image is malformed`.

**Why QA missed it:** Generic SQLite failures were classified as transient runtime errors, so recovery retried them and the UI presented a false self-healing state.

**Project enforcement:** `classifyFailureRootCause` maps SQLite corruption to non-retryable `database.corruption`; incident normalization upgrades legacy runtime incidents; `readOperationalHealth` projects `Needs You`; delivery copy names the authorized route or X verification instead of implying human confirmation.

**Executable protection:** `tests/operational-autonomy.test.ts` asserts the corruption classification, database incident boundary, and `Needs You` health projection. Activity UI QA must verify that a resource-budget pause names the bounded envelope and remaining outcome slots.

**Apply when:** Changing SQLite access, incident classification, recovery budgets, operational health, execution verification, or Distribution push status copy.

**Added:** 2026-08-29

## Rule: Feed scope must not narrow the Presence picker

**Defect class:** Cross-channel navigation scope regression

**General principle:** A Feed filter may narrow the records shown for the selected Presence, but it must not change the operator's ability to discover or select other Presences. Navigation scope and content scope are separate concerns.

**Project enforcement:** `PublicHistoryView` applies `publicHistoryMatchesPresence` to Feed records, while the Presence switcher renders the complete `state.presences` collection. `stateForContext` changes the active Presence without removing sibling Presences from the materialized Agent workspace.

**Executable protection:** `tests/runtime.test.ts` verifies cross-channel Presence retention through `stateForContext`; `tests/e2e/sidebar-hierarchy.spec.ts` verifies the picker shows both X and LinkedIn Presences after selecting the LinkedIn Presence.

**Apply when:** Changing Feed/history filters, Presence selection, Agent workspace materialization, sidebar/mobile navigation, or channel-scoped UI surfaces.

**Added:** 2026-08-16

## Rule: Conversation completion must be evidence-backed and marginal-value aware

**Defect class:** Reciprocal loop / false closure / runtime-context leakage

**General principle:** A received social object is not a reply obligation. Conversation interpretation must remain separate from Mirror evidence, Social Intent, Execution, Delivery, Outcome, and Assignment progress. Silence or reaction may complete an episode, but a requested closing reply is not closed until the public act is verified. Runtime envelopes, planner metadata, operator instructions, and untrusted social text must never become public expression.

**Project enforcement:** `ConversationEpisode` groups Presence-scoped branches from observed Mirror relationships and tracks `active`, `cooling`, `closing`, and `closed` separately from planner disposition. Deterministic pacing only gates rapid reciprocal volume; the Agent decides marginal social value. Cooling suppresses generic acknowledgments and permits substantive reopening. `CLOSE_WITH_REPLY` and `REACT_ONLY` remain closing until verified delivery, while failed delivery enters cooling. Social cognition receives public Mirror evidence through a privacy filter, and final candidate checks flag runtime-context markers for review. Activity exposes the episode state and an operator override that bypasses closure/cooldown without bypassing privacy, policy, or execution boundaries.

**Executable protection:** `tests/conversation-episodes.test.ts` covers branch grouping, closure verification, generic-ack suppression, substantive reopening, loop-risk gating, and disposition mapping. `tests/conversation-boundary.test.ts` covers disposition parsing and runtime-marker detection. Native X tests preserve bounded thread evidence and sandbox tests preserve execution lineage. Feature QA must verify Activity status and the Playground → Mirror → episode path without requiring a live connector.

**Apply when:** Changing social cognition, Mirror filtering, thread/episode grouping, pacing or reopen behavior, closure semantics, operator-directed replies, public-copy sanitization, or Assignment engagement accounting.

**Added:** 2026-08-15

## Rule: Live publication must cross a sealed Public Expression boundary

**Defect class:** Unauthorized live write / provenance bypass / mock-runtime side effect

**General principle:** Cognition may form a candidate, but only a sealed Public Expression with a short-lived, scoped execution permit may reach a native or Bridge writer. Test and mock runtimes must not retrieve live write credentials or contact an external writer.

**Project enforcement:** Native delivery seals and verifies the expression before invoking X; Bridge claim/acknowledgement requires the same permit; direct native completion is blocked without it; test/mock runtimes fail closed before credential retrieval or external write.

**Executable protection:** `tests/publication-security.test.ts` covers candidate sealing, payload mutation, expiry, replay, and runtime blocking. Native X tests assert cognition still records a blocked execution without calling the writer, while runtime Bridge tests preserve Sandbox outbox behavior and block live writes.

**Apply when:** Changing Public Expression formation, Execution completion, native X delivery, Bridge claim/acknowledgement, test/mock runtimes, credentials, or publication provenance.

**Added:** 2026-08-16

## Rule: Planner-shaped model output must never become public expression

**Defect class:** Internal planner metadata leakage / public-copy boundary failure

**General principle:** Structured disposition, action, reply, and rationale fields are internal planning evidence when they appear in a social-world object or model response. They must remain untrusted input or private decision data and must never be echoed as public prose.

**Project enforcement:** `publicExpressionLeakageReason` detects planner-shaped JSON; parser aliases are action-gated; Sandbox, native X, Bridge, sealing, and final delivery paths reject planner-shaped public text. Playground includes a frozen Security rehearsal with exact untrusted planner-like fixtures and a structural public-expression finding.

**Executable protection:** `tests/ai.test.ts`, `tests/publication-security.test.ts`, `tests/runtime.test.ts`, `tests/x-connection.test.ts`, and `tests/scenarios.test.ts` cover parser, intent, permit, delivery, and rehearsal boundaries.

**Apply when:** Changing social decision parsing, planner prompts, public-copy formation, Sandbox or live delivery, scenario fixtures, or any path that maps structured model output into public text.

**Added:** 2026-08-16

## Rule: A scheduled no-op must preserve its bounded rationale

**Defect class:** Silent judgment / opaque autonomy

**General principle:** Taste and silence are valid, but `NO_OP` without an inspectable reason turns Agent autonomy into an unreviewable black box. A rationale must explain the observable decision boundary without exposing hidden chain-of-thought or inventing certainty.

**Incident:** Live Calendar evaluation returned a bare `NO_OP`, and the runtime replaced it with the same generic “no worthwhile action” sentence for every scheduled intention. The operator could not tell whether the issue was timing, repetition, missing evidence, a sensitive boundary, or a runtime failure.

**Project enforcement:** `evaluateCalendarSlot` requests a structured `post|no_op` decision with a short rationale. `recordStandingIntentNoOp` persists that rationale on the skipped Action and includes it in the Activity event. A bare no-op is labeled as an unavailable explanation; it is never silently converted into a fabricated reason.

**Executable protection:** `tests/x-connection.test.ts` asserts that a Calendar no-op stores its model rationale and creates no execution; `tests/e2e/openpresence.spec.ts` verifies the Schedule → Evaluate → Activity surface exposes `Reason:` when silence is selected.

**Apply when:** Changing Calendar evaluation, standing intentions, no-op semantics, Activity decision traces, model decision schemas, or operator calibration surfaces.

**Added:** 2026-08-15

## Rule: Native X replies must remain replies in the Social Mirror and Feed

**Defect class:** Public provenance misclassification

**General principle:** X uses `x.post` as the external reference for both originals and replies. Reply status must therefore be preserved from the parent reference and successful `x.reply` execution lineage; it cannot be inferred from the external reference type alone.

**Project enforcement:** Native ingestion stores agent-authored replies as `objectType: "reply"`, leaves inbound standalone posts as `objectType: "post"`, and normalizes legacy live X mirrors when their parent and Presence/execution lineage prove they are replies.

**Executable protection:** `tests/x-connection.test.ts` verifies inbound posts remain posts, native replies derive as `reply` history, and legacy post classifications are repaired.

The Publishing Plan also rejects any public-history item with a parent reference from original-progress totals, providing a second guard if an old or external record is still typed incorrectly.

**Apply when:** Changing native X reconciliation, Social Mirror object typing, execution lineage, public-history derivation, or Feed filters/counts.

**Added:** 2026-08-15

## Rule: Internal post IDs must be durable but never become public copy

**Defect class:** Diagnostic marker leakage / opaque provenance UI

**General principle:** Every verified post must retain a stable internal ID for lineage and support work, but QA run markers and raw implementation identifiers must not be placed in Assignment titles, post text, or routine Feed copy. Operators should get provenance through a quiet, intentional affordance.

**Project enforcement:** `MirrorObject.id` is the internal post ID projected as `PublicHistoryItem.id`; user-facing Assignment summaries remove internal `QA-*` identifiers without changing the stored instruction, while the post details inspector offers `Copy ID` for the internal reference and does not print the raw ID in the normal proof label.

**Executable protection:** Runtime tests cover marker-safe Assignment display projection; Playground E2E verifies that a diagnostic marker is absent from the progress surface and Feed, and that post details expose the discreet `Copy internal post ID` action.

**Apply when:** Adding or changing post provenance, Assignment summaries, Feed/Activity copy, Sandbox QA fixtures, diagnostic identifiers, or operator support workflows.

**Added:** 2026-08-15

## Rule: Scheduled Consider intentions must distinguish silence from a missed run

**Defect class:** Schedule expectation mismatch / false scheduler diagnosis

**General principle:** A scheduled standing intent grants the Agent permission to consider an action; it does not require a public post. Runtime diagnosis must distinguish an evaluated `NO_OP` from an unevaluated slot, a blocked execution, and a connector delivery failure.

**Incident:** The Saturday 07:00 Genny intention appeared to produce no post. The Calendar slot had in fact been evaluated and persisted `no_op / skipped`; the operator reasonably interpreted scheduled autonomy as a posting obligation.

**Project enforcement:** `evaluateCalendarSlot` records `Calendar attention started`, marks the slot evaluated, and records `Standing intention held` for silence. Activity and Schedule copy retain the Consider-versus-Assign boundary, while native delivery records execution/outcome separately.

**Executable protection:** `tests/x-connection.test.ts` asserts that an evaluated Calendar intention can form and deliver a native X publication; live QA must also inspect the persisted `lastEvaluatedAt` plus the corresponding Calendar/Standing-intent event before classifying a missing post as a runtime defect.

**Apply when:** Changing Calendar/Standing Intent scheduling, autonomy language, native Pulse wake-up, execution delivery, or Activity diagnosis.

**Added:** 2026-08-15

## Rule: Mirror reconciliation must wake attention for unjudged inbound mentions

**Defect class:** Live observer/pulse boundary loss / reply target drift

**General principle:** In an autonomous social system, observing a new inbound mention is an attention trigger, not merely a storage update. Once cognition chooses to reply, delivery must target the focal object that mentioned the Presence; the parent is context, not the reply target.

**Incident:** Automatic `syncNativeX` persisted the exact X mention and its complete parent chain but stopped after “Social Mirror updated.” No Pulse or cognition followed. Separately, the live reply path used the focal post's parent ID as the delivery target, which could place a response on the wrong post in the thread.

**Project enforcement:** `syncNativeX` detects unjudged inbound native-X Mirror objects, records `New mention received`, and runs the shared native Pulse for live Presences. `runNativePulse` compiles the bounded thread context before cognition and passes the focal object's own external ID to `formXReplyIntent` and native delivery.

**Executable protection:** `tests/x-connection.test.ts` exercises automatic sync with a multi-turn parent chain, asserts the cognition request contains root/parent/focal text and `Thread context (complete)`, verifies the focal mention is judged, and asserts both the Social Intent target and X write target equal the focal post ID.

**Apply when:** Changing X observation scheduling, Social Mirror reconciliation, Pulse wake-up behavior, mention deduplication/judgment, reply targeting, or connector delivery envelopes.

**Added:** 2026-08-15

## Rule: Search evidence must not become a native reply target

**Defect class:** Live observer/reply eligibility confusion

**General principle:** A public object discovered through search or another observation path is not an inbound mention and does not grant permission to reply. Provider-confirmed inbound scope must be preserved through cognition and delivery.

**Incident:** Native Pulse selected an unrelated public post from the Social Mirror, formed a reply, and sent it to X. X rejected the action because the Presence was neither mentioned nor the author.

**Why QA missed it:** The existing native reply test covered a valid mention and the candidate selector treated every external Mirror post as inbound, so it did not exercise mixed Search/Mirror evidence alongside provider-confirmed mentions.

**Project enforcement:** `unjudgedNativeInbound` in `app/api/state/route.ts` may select only external X posts whose IDs are in the Presence's `context.publicFooting.recentInboundIds`; `runNativePulse` keeps the selected Social Intent and Execution linked to the `Pulse completed` event. Search/Exploration imports remain observation evidence and cannot enter native reply cognition.

**Executable protection:** `tests/x-connection.test.ts` covers an unrelated Social Mirror search object with zero eligible inbound candidates and zero executions, while the adjacent mention regression covers valid focal reply targeting.

**Apply when:** Changing X reconciliation, Exploration/search imports, Social Mirror candidate selection, native Pulse cognition, reply eligibility, or Activity lineage.

**Added:** 2026-08-16

## Rule: Social cognition must never receive an opaque parent ID instead of public context

**Defect class:** Connector/Social Mirror context loss / Live-Sandbox cognition divergence

**General principle:** If a social object depends on earlier public context for its meaning, observation must hydrate or truthfully mark that context before cognition. A parent identifier is provenance, not conversation evidence, and must never be treated as a substitute for the referenced object's content.

**Incident:** Sandbox walked the observed reply chain, while the Live X pulse passed the Agent only the new mention and an opaque parent post ID. Live and Sandbox therefore tested different social Agents, and the model could not reliably judge continuity, disagreement, humor, or relationship context.

**Project enforcement:** `lib/thread-context.ts` owns bounded ancestry/reference compilation and hydration traversal; `lib/native-x.ts` uses direct X post lookup eagerly during reconciliation and lazily before pulse cognition; `recordNativeMirror` persists conversation identity, parent/reference relationships, authors, and media as live Mirror evidence; Sandbox and Live use `compileSocialThreadContext` with Presence/session scope isolation. Missing context is exposed as `complete`, `partial`, or `unavailable` evidence.

**Executable protection:** `tests/thread-context.test.ts` covers 8-object bounded ancestry, multi-author ordering, quoted-object separation, cache-safe hydration, partial/unavailable context, and Sandbox session isolation. `tests/x-connection.test.ts` covers X field/expansion parsing, normalized Mirror persistence, and a Live pulse whose model request contains the actual ancestor text.

**Apply when:** Changing connector observation, Social Mirror schemas, thread/reply context, native X reads, Bridge reconciliation, media/reference hydration, or prompts that assemble social-world evidence.

**Added:** 2026-08-15

## Rule: Visual necessity must not be confused with visual fit

**Defect class:** Optional-media semantic failure / misleading Assignment terminal state

**General principle:** A VisualBrief describes what a useful attachment would do; it does not decide whether the story requires one. `helpful`, `important`, and `required` visual needs must produce different fulfillment behavior, and zero discovery must never be described as candidate inspection.

**Project enforcement:** Bounded research derives visual importance, permits one model-guided query reformulation, records distinct discovery/fetch/inspection/editorial outcomes, and lets helpful or important stories survive as text-only when the Agent judges that honest. Required visuals remain blocked without verified evidence. Playground exposes the outcome and zero-candidate explanation in the research trail.

**Executable protection:** `tests/assignment-runtime.test.ts` covers optional fallback, required blocking, one reformulation, empty discovery, inspected rejection, and verified counting.

**Apply when:** Changing Assignment visual requirements, asset discovery, perception/editorial review, research continuation, or Playground outcome copy.

**Added:** 2026-08-15

## Rule: Long-running Assignments need durable run truth and fast reads

**Defect class:** Background Assignment lifecycle / stale progress UI / blocked retry reuse

**General principle:** Provider and model work must not occupy the state mutation request. Operators need a durable run with stage, lease, heartbeat, attempt, and terminal status, while ordinary state reads remain responsive. A retry must create a new bounded run and preserve prior negative evidence instead of repeating the same failed candidates.

**Incident:** Clicking an Assignment could leave the interface waiting on a slow asset/model call, show “Working…” after the bounded effort had already ended, or reuse an exhausted retry budget. The operator could not distinguish queued work, active research, and a terminal refusal.

**Project enforcement:** `workAssignment` queues an `AssignmentRun` and returns immediately. The worker persists `queued`, `researching`, `writing`, and terminal states with lease/heartbeat metadata; visual research retains candidate decisions and known URLs across continuations; retry queues a fresh run; Playground polls active runs and renders a compact live card, a collapsible evidence trail, and terminal `Try again`/blocked or published states.

**Executable protection:** `tests/assignment-runtime.test.ts` covers immediate queueing, provider failure, evidence-backed publication, candidate fallback, bounded exhaustion, fresh retry run IDs, and non-stranding clock sync. Browser QA verifies the main runtime remains readable while the worker runs and that terminal UI does not retain a working indicator.

**Apply when:** Changing Assignment workers, asset/provider calls, Playground progress, retry semantics, workspace revision handling, or background polling.

**Added:** 2026-08-15

## Rule: New Agents must start on the requested OpenAI runtime

**Defect class:** Default model/provider selection / legacy seed migration

**General principle:** A new Agent should begin with the product’s declared default runtime, and an old untouched seed should not silently keep selecting a different provider after the default changes. Explicitly configured model choices remain user-owned.

**Incident:** New Agents opened Brain with Anthropic selected, and Chat reported that Anthropic was selected but not connected even though OpenAI GPT 5.6 Luna was the intended default.

**Project enforcement:** `createAgent` seeds OpenAI `gpt-5.6-luna` with medium reasoning and an OpenAI connection. `normalizeState` migrates only the exact unconfigured legacy Anthropic seed (`claude`/high) and preserves configured Anthropic selections.

**Executable protection:** `tests/runtime.test.ts` asserts the new default and both sides of the narrow legacy migration; `tests/e2e/openpresence.spec.ts` verifies the default Brain selection after Agent creation.

**Apply when:** Changing model/provider defaults, onboarding, Brain runtime selection, provider access, or persisted Agent workspace normalization.

**Added:** 2026-08-14

## Rule: Sandbox Assignment drafts must not publish internal QA markers

**Defect class:** Internal test-context leakage / public-copy hygiene

**General principle:** Assignment instructions belong to the operator and runtime. A Presence may use them to decide what to do, but must not expose internal QA identifiers in a public Sandbox expression.

**Incident:** A diagnostic Assignment explicitly containing `QA-TEN-RUN-2026-08-14` produced historical Sandbox posts carrying that marker, making test output look like repetitive public content and obscuring whether the model or harness was speaking.

**Project enforcement:** Every text candidate passes through `cleanSandboxDraft` before editing, length checks, duplicate checks, and delivery. Internal `QA-*` markers are removed; a marker-only candidate becomes `no_op` instead of an empty publication.

**Executable protection:** `tests/runtime.test.ts` covers marker removal and preserves ordinary QA subject matter; `tests/e2e/playground-rehearsal.spec.ts` verifies the Assignment-to-Feed path never renders the diagnostic marker.

**Apply when:** Changing Assignment prompts, AI candidate editing, Sandbox delivery, Feed projection, or QA instructions that contain internal identifiers.

**Added:** 2026-08-14

## Rule: Sandbox style fixtures classify only public Assignment intent

**Defect class:** Presence-style contamination from private runtime context

**General principle:** A Sandbox fixture must be selected from the Agent/Presence profile and the operator's explicit Assignment, not from private execution-envelope or prompt-scaffolding text. Internal runtime language is not public style evidence.

**Incident:** A Genny-shaped workspace received Alex-style offer/sales candidates because the mock classifier scanned the complete private Assignment prompt. Runtime words such as `execution` could win over the selected Presence's builder territory.

**Project enforcement:** `assignmentMockCandidates` extracts the explicit Assignment instruction before profile matching and uses word-bounded, Presence-aware precedence. The full prompt remains available to cognition, but cannot steer the local style fixture.

**Executable protection:** `tests/ai.test.ts` covers the three configured fixture families and a Genny-shaped profile with private execution prose; the latter must remain builder-specific and must not select an offer candidate.

**Apply when:** Changing Assignment prompt construction, mock AI fixtures, Presence style selection, or private execution context passed to social cognition.

**Added:** 2026-08-14

## Rule: Playground removal must be item-scoped and Sandbox-only

**Defect class:** Playground feed curation / destructive action scope

**General principle:** A rehearsal feed needs a low-friction way to remove one noisy social object without resetting the whole experiment or implying that live channel content was deleted.

**Project enforcement:** Each Sandbox post, reply, and social event exposes an accessible `Remove … from Playground` control. The server accepts only a matching Sandbox session/object pair, removes the selected Mirror object and derived perception records, and leaves the rest of the rehearsal intact.

**Executable protection:** `tests/sandbox.test.ts` verifies one-object removal preserves the remaining object; `tests/e2e/openpresence.spec.ts` verifies removing a reply and then a post in Chromium and Pixel 5, including persistence after reload.

**Apply when:** Changing Playground cards, Social Mirror state, rehearsal reset/curation, or any UI that can remove simulated social-world context.

**Added:** 2026-08-14

## Rule: Presence Chat must answer as the selected public self

**Defect class:** Chat identity boundary / social-context fallback

**General principle:** A simulated feed post is social-world evidence. Chat responses must stay in the selected Presence's public voice and may not fall through to private Agent/Teach language or expose runtime mechanics.

**Incident:** In local/mock Chat, a normal post was stored correctly but the response fell through to the generic Agent reply fixture: `I understood ... This response came through the Agent runtime.` Prior rehearsal history could also make a later post receive an unrelated memory response.

**Project enforcement:** `generatePresenceChatReply` uses context-sensitive public-self fixtures for local rehearsal inputs and matches the current post before history-derived cues. Provider-backed Chat continues to receive the explicit social prompt, selected Presence, session history, and optional reply target.

**Executable protection:** `tests/ai.test.ts` rejects runtime wording and proves a current edge-case post is not overridden by prior memory context; `tests/e2e/openpresence.spec.ts` verifies a normal post and an explicit Reply in Chromium, including selected-thread context.

**Apply when:** Changing Presence Chat, social rehearsal prompts, mock/runtime fallbacks, or any route that translates simulated world posts into Presence replies.

**Added:** 2026-08-14

## Rule: Teach must require an explicit Presence-mode command

**Defect class:** Conversational command parsing / quoted social context

**General principle:** A word inside a social handle, quotation, example, or world-data description is not an operator command. State-changing conversational actions require an explicit imperative that names the target and requested transition.

**Incident:** Teach matched the substring `ghost` anywhere in the operator's message. Asking how to handle `@jenny_ghost write a post about SpaceX` therefore changed the Presence to Ghost and surfaced `Presence changed to Ghost`, even though the user asked for nuanced mention handling.

**Project enforcement:** `isExplicitGhostModeRequest` accepts explicit Presence-to-Ghost imperatives and rejects quoted handles or incidental mentions. The `sendMessage` operation uses that recognizer instead of a substring check.

**Executable protection:** `tests/runtime.test.ts` asserts the exact reported mention leaves the Presence Agent-owned and that the explicit mode phrase still changes it; `tests/e2e/openpresence.spec.ts` exercises the same Teach flow and checks the state route.

**Apply when:** Changing Teach command parsing, natural-language state mutations, Presence mode/identity controls, or handling of quoted social-world text.

**Added:** 2026-08-13

## Rule: Durable writing preferences must have real proposal provenance

**Defect class:** Teach preference acknowledgement / phantom proposal

**General principle:** If the Agent says a protected preference is a reviewable proposal, the proposal and its ChangeSet must exist in durable state. The acknowledgement must repeat the exact scope and distinguish immediate conversational behavior from authoritative meaning.

**Incident:** The one-sentence-per-line post-formatting preference was described as a proposal, but no proposal was actually created, leaving the operator unable to find or review what the Agent claimed to have added.

**Project enforcement:** Teach recognizes the post-only formatting request, appends the exact guidance to a pending `TASTE` proposal, creates its ChangeSet, and says that posts use blank-line-separated sentence paragraphs while replies remain normally formatted until approval.

**Executable protection:** `tests/runtime.test.ts` asserts the proposal body, exact interim behavior, and ChangeSet; `tests/e2e/openpresence.spec.ts` verifies the Teach response and persisted proposal.

**Apply when:** Changing Teach durable preferences, protected meaning proposals, writing-style instructions, or acknowledgement copy.

**Added:** 2026-08-13

## Rule: Assignment review must expose the delegated authority boundary

**Defect class:** Assignment review copy / operator-versus-Agent ownership

**General principle:** When an operator assigns an outcome, the review surface must distinguish the required deliverable from the Agent's freedom over the approach. A generic `Agent decides` label can make required work look optional or make the Agent appear to own the outcome.

**Incident:** The Assignment review card labeled the approach column `Jenny decides`, even though the operator had already assigned the expected deliverable. The supporting list was accurate but the authority boundary was ambiguous at the moment the operator approved the work.

**Project enforcement:** The review card labels the approach column `Agent decides how` and keeps the explicit list of topics, thesis, evidence, format, wording, and timing strategy. Deliverable and verified completion remain separate columns.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` reviews an Assignment and asserts the `Agent decides how` label, the approach list, and the absence of `Jenny decides` on Chromium and Pixel 5.

**Apply when:** Changing Assignment creation/review copy, delegated responsibility, Consider versus Assign controls, or any surface that explains Agent autonomy inside an operator instruction.

**Added:** 2026-08-13

## Rule: Teach must not turn symbol-only operator context into assistant onboarding

**Defect class:** Teach conversation identity / low-information operator input

**General principle:** Teach is a person-shaped conversation with the Agent's private mind. A punctuation or symbol-only operator turn may be meaningful context, but it is not a request for a help menu, topic invention, or generic onboarding response.

**Incident:** The operator sent \`.\` and \`?\`; Teach answered with “Share a question, idea, or half-formed thought” and “What’s on your mind?” The transcript looked like a generic assistant instead of an Agent being shaped by its operator.

**Project enforcement:** \`isLowInformationCue\` records the operator turn without adding a canned Agent reply, the state route skips the model call for that cue, and the operator prompt explicitly prohibits generic AI-assistant onboarding.

**Executable protection:** \`tests/runtime.test.ts\` asserts symbol-only Teach turns contain only the operator message; \`tests/e2e/openpresence.spec.ts\` verifies a fresh \`?\` turn has no onboarding response; \`tests/ai.test.ts\` asserts the Teach prompt is person-shaped.

**Apply when:** Changing Teach, operator conversation routing, Brain prompt construction, low-information handling, or Chat/Teach surface boundaries.

**Added:** 2026-08-13

## Rule: Delegated Assignments need visible cancellation

**Defect class:** Assignment lifecycle / action completeness

**General principle:** Any delegated workflow that can remain drafted or active must expose a clear cancellation action, preserve its history, and prevent cancelled work from restarting.

**Project-specific risk:** Assignments had a `cancelled` status in the data model but the calendar did not provide a clear review-and-cancel interaction, leaving operators unable to stop or dismiss a scheduled draft without hunting through a separate list.

**Project enforcement:** Scheduled Assignments are distinct cards in the Week calendar. Opening a card reveals timing, verified progress, Sandbox run/retry, and `Cancel Assignment` for non-terminal work; `cancelAssignment` marks the record cancelled and records a decision event; completed and cancelled Assignments cannot be restarted or cancelled again.

**Executable protection:** `tests/runtime.test.ts` covers draft and active cancellation plus restart prevention. `tests/e2e/playground-rehearsal.spec.ts` covers opening the Assignment detail surface, confirming cancellation, exact-time calendar placement, and cancelled-history state on Chromium and Pixel 5.

**Apply when:** Adding or changing delegated workflows, Assignment statuses, Schedule rows, background work, or terminal lifecycle actions.

**Added:** 2026-08-13

## Rule: UI forms must enforce runtime contracts before submission

**Defect class:** Form validation / API contract mismatch

**General principle:** Client forms should constrain values to the same limits as the write API and provide an actionable validation path before submission.

**Project-specific risk:** The Manage Agent skill form allowed prompts longer than the API's 500-character limit, producing only a generic save failure.

**Learned from:** OpenPresence Playground experiment on 2026-08-13.

**Why QA missed it:** The form had required fields but no visible length constraint, and existing coverage did not exercise a near-boundary skill prompt.

**Project enforcement:** `app/page.tsx` applies `maxLength={100}` to skill names and `maxLength={500}` to skill prompts; `tests/e2e/openpresence.spec.ts` asserts both attributes and completes a successful skill creation.

**Executable protection:** `tests/e2e/openpresence.spec.ts` — `Skill creation keeps the instruction within the API contract`.

**Apply when:** Adding or editing any form backed by a stricter Zod/API length, enum, format, or cardinality constraint.

**Added:** 2026-08-13

## Rule: Provider switching must choose an available runtime model

**Defect class:** Runtime selection / environment capability mismatch

**General principle:** A provider selector must choose from currently available capabilities, not a hard-coded default that may not exist in the target environment.

**Project-specific risk:** Switching an Agent to Ollama selected `llama3.2` even though the local runtime only exposed `qwen3-vl:8b`, `qwen2.5:7b-instruct`, and other installed models; Playground then failed before cognition.

**Learned from:** Alex Klonemozi Playground experiment on 2026-08-13.

**Why QA missed it:** Provider UI coverage checked the selected provider label but not that the selected model was installed and executable.

**Project enforcement:** `app/page.tsx` selects the first discovered Ollama model when changing providers; Brain's model grid remains the source of truth for explicit model selection.

**Executable protection:** `tests/e2e/openpresence.spec.ts` — recommended follow-up: mock `/api/ollama/models` with an installed-model fixture and assert provider switching selects that model; currently missing in the existing suite.

**Apply when:** Changing provider access, model discovery, Agent runtime selection, or AI-backed Playground/Chat flows.

**Added:** 2026-08-13

## Rule: Low-information social cues must be judged in context

**Defect class:** Social cognition / minimal or ambiguous inbound content

**General principle:** A short fragment, punctuation mark, emoji, brief acknowledgment, or casual greeting is neither an automatic question nor an automatic reply obligation. Use thread and relationship evidence to decide whether it opens a real exchange. If it does, choose the smallest natural response; otherwise preserve `no_op`. Never turn low-information content into assistant onboarding, invented context, or a canned public line.

**Incident:** A human may answer a minimal cue with `??`, `Yes?`, `👀`, a tiny acknowledgment, or silence depending on the room. Treating every cue as a request produces performative activity; treating every cue as meaningless can miss a genuine conversational opening.

**Project enforcement:** `promptFor` includes the model-facing rule for current and future Agents, and `fileContent("BRAIN")` includes the durable default Brain rule. No phrase-specific branch selects a public action.

**Executable protection:** `tests/ai.test.ts` asserts that social cognition receives the low-information-cue guidance and that newly created Agents carry the Brain rule. The isolated Chrome Playground experiment is the current behavioral evidence; recommended follow-up is a small real-model eval fixture covering fresh and established relationships without asserting exact wording.

**Apply when:** Changing Brain defaults, social cognition prompts, low-content social handling, clarification guidance, or Playground decision evaluation.

**Added:** 2026-08-13

## Rule: Social evaluation failures must not masquerade as intentional silence

**Defect class:** Original Post Rehearsal / structured AI decision handling

**General principle:** A no-op is a valid Agent judgment only when cognition returned a valid social decision. A malformed or unavailable model response must be surfaced as an evaluation failure, while deterministic test mode must provide structured social fixtures so the publication lifecycle is actually exercised.

**Incident:** Original Post Rehearsal received the generic chat mock sentence instead of structured social-decision JSON. The parser correctly refused to publish, but the workflow recorded the result as `NO_OP` and told the operator the Presence chose silence, making an evaluation failure look like a deliberate identity judgment.

**Project enforcement:** `generateAgentSocialDecision` returns a structured Sandbox-only fixture under `OPENPRESENCE_AI_MOCK=1`; `runSandboxAgentCycle` records `Sandbox evaluation unavailable` for the invalid structured-response rationale; the rehearsal completion copy names deliberate silence as “Silence” and explains that no post was formed.

**Executable protection:** `tests/ai.test.ts` verifies structured mock decisions, `tests/sandbox.test.ts` preserves valid no-op calibration and its plain-language outcome, and `tests/e2e/openpresence.spec.ts` verifies Original Post Rehearsal publishes a Sandbox post, preserves private inspiration, records `fits` evidence, and passes on Chromium and Pixel 5.

**Apply when:** Changing Original Post Rehearsal, social decision parsing, AI mock/replay behavior, Sandbox publication lifecycle, or no-op/error copy.

**Added:** 2026-08-13

## Rule: List-like Presence Brief fields must not rewrite text while typing

**Defect class:** Controlled textarea input loss / comma-separated Brief editing

**General principle:** Preserve the operator’s raw draft text during editing. Parse and normalize list-like values at an explicit commit boundary so punctuation, separators, and partial entries remain editable.

**Incident:** Primary territory, Adjacent territory, and Keep out split the textarea value and filtered empty items on every keystroke. Typing a comma created an empty trailing item, which was immediately removed and made the comma disappear.

**Project enforcement:** `PresenceView` stores raw territory strings separately from the persisted `PresenceBrief` arrays; `territoryValues` is applied only by Save brief. Cancel and reopening the editor rehydrate from persisted Presence state.

**Executable protection:** `tests/e2e/openpresence.spec.ts` fills trailing commas in Adjacent territory and Keep out, asserts the comma remains before completion, saves internal comma-separated values, reopens the editor, and verifies persistence on Chromium and mobile.

**Apply when:** Changing Presence Brief, territory, boundaries, comma-separated settings inputs, or controlled list-like textareas.

**Added:** 2026-08-13

## Rule: Schedule timing should explain relevance, not execution mechanics

**Defect class:** Standing Intent timing abstraction / progressive disclosure

**General principle:** A scheduled intention grants the Agent a future moment to reconsider the world; it is not a guaranteed delivery slot. The default form should make that boundary legible without requiring operators to understand the persisted execution-window representation.

**Incident:** Schedule exposed every intent with the same raw `Execution window` field, making a meaningful attention choice look like an arbitrary delivery setting and making all updates appear equivalent.

**Project enforcement:** `ScheduleView` keeps the internal window for runtime compatibility, but defaults to a collapsed `Timing options` control with Flexible, Exact time, and Custom relevance choices. List and Week surfaces describe consideration rather than an execution window.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the raw field is absent by default, the timing panel is collapsed, the recommended explanation appears when expanded, and custom start/end values persist as consideration copy on Chromium and mobile.

**Apply when:** Changing Schedule, standing intents, future attention, timing controls, calendar geometry, or execution-envelope copy.

**Added:** 2026-08-13

## Rule: Conversational surfaces must render the submitted turn before model completion

**Defect class:** Chat/Teach loading-state omission / duplicate transcript

**General principle:** A conversational submission is a visible user turn immediately. While the Agent is judging or composing, the surface must show a truthful in-flight state, then reconcile that temporary state with exactly one authoritative response.

**Incident:** Chat and Teach waited for the model request to finish before rendering anything, then displayed the user message and Agent response together. A delayed submission could also be invoked twice before React committed the loading flag.

**Project enforcement:** Teach and Presence Chat keep an optimistic local user turn, render a shared accessible `Thinking` status, reconcile against the returned persisted state, and guard the submission with a ref-level in-flight lock. The status communicates cognition without exposing hidden reasoning or infrastructure.

**Executable protection:** `tests/e2e/openpresence.spec.ts` delays both API operations and asserts the immediate user turn, visible thinking state, eventual single response, and exact persisted role sequence on Chromium and mobile.

**Apply when:** Changing Chat, Teach, Presence Chat, message submission, model loading states, transcript hydration, or response reconciliation.

**Added:** 2026-08-13

## Rule: Activity decisions must expose provenance and exclude configuration churn

**Defect class:** Activity decision ambiguity / system-event leakage

**General principle:** An operational feed called “What [Presence] decided” must distinguish observed evidence, Agent judgment, selected Social Intent, and delivery state. Configuration acknowledgements and other infrastructure updates are not decisions and must not masquerade as them.

**Incident:** Repeated `Presence settings updated` rows all used the same generic copy, so the Activity feed looked like a sequence of identical decisions and did not explain how any decision was reached.

**Project enforcement:** `isActivityDecisionEvent` excludes generic settings churn from the decision feed. Eligible rows render a compact `Observed`, `Judgment`, and `Delivery` path, with truthful fallbacks when no linked intent, execution, or outcome exists. The empty state names the absence of decisions and directs configuration changes to Settings.

**Executable protection:** `tests/runtime.test.ts` covers the event boundary; `tests/e2e/openpresence.spec.ts` asserts configuration changes do not appear as Presence decisions and the empty state explains the feed.

**Apply when:** Changing Activity event projections, system-event titles, Social Intent/execution lineage, decision summaries, or Presence Settings mutations.

**Added:** 2026-08-13

## Rule: Public Self must explain the zero-disclosure state

**Defect class:** Presence settings / disclosure-state ambiguity

**General principle:** A permissions checklist must explain its default behavior when no option is selected; otherwise operators cannot predict what the Agent will say.

**Incident:** Approved disclosure details were shown as four unchecked controls without explaining the typical response when none were approved.

**Project enforcement:** `PresenceView` renders `.public-facts-default` while `approvedTechnicalFacts` is empty, explaining that the Presence answers naturally, does not volunteer technical details, and still follows the selected Identity posture for direct questions.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the default-state explanation in the Presence Public Self settings flow.

**Apply when:** Changing Public Self, disclosure facts, Identity posture, Ghost boundaries, or Presence settings copy.

**Added:** 2026-08-13

## Rule: Enabling Auto must explicitly approve the pending review queue

**Defect class:** Execution-policy transition / implicit approval

**General principle:** Changing a capability from Review to Auto is an operator decision with an execution consequence. If pending work is waiting at that checkpoint, the UI must show the exact count and require confirmation before changing the policy or processing the work.

**Project-specific risk:** A settings click could silently remove the operator checkpoint while leaving already-formed reply executions in an ambiguous state, or could process only part of the pending queue.

**Project enforcement:** `confirmAutoMode` validates the Presence, capability affordances, and complete pending execution ID set before atomically enabling Auto, approving the matching executions, and handing them to the correct connector delivery path. The Settings dialog keeps Review unchanged when dismissed.

**Executable protection:** `tests/sandbox.test.ts` covers stale-queue rejection and one-request Sandbox delivery; `tests/e2e/openpresence.spec.ts` asserts exact pending-count copy, cancel preservation, confirmed Auto state, and completed reply delivery on Chromium + Pixel 5.

**Apply when:** Changing execution modes, approval queues, Settings capability controls, or connector delivery transitions.

**Added:** 2026-08-13

## Rule: Operator approval must be an unmistakable primary action

**Defect class:** Activity CTA hierarchy / review discoverability

**General principle:** When delivery is waiting for operator approval, the approval action must be visually dominant, keyboard-visible, and readable at a glance without changing the underlying execution boundary.

**Project-specific risk:** The `Approve execution` control inherited the quiet secondary-button treatment and looked like a low-priority utility action despite being the operator's next required decision.

**Project enforcement:** `.review-cta` uses high-contrast accent color, a larger hit area, centered icon/label, hover elevation, and a dedicated focus ring; approval still calls the existing `approveExecution` mutation.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the review CTA class, enabled contrast colors, 48px minimum height, keyboard focus, and successful review/manual execution lifecycle on Chromium + Pixel 5.

**Apply when:** Changing Activity review cards, approval actions, execution lifecycle controls, or CTA hierarchy.

**Added:** 2026-08-13

## Rule: Playground threads and Activity scopes must preserve social context

**Defect class:** Social thread presentation / channel-environment leakage

**General principle:** A social reply must render with its parent, and operational Activity must be scoped to the selected Presence's channel and embodiment; projections must not flatten thread context or mix Sandbox and live records.

**Project-specific risk:** A flat Playground object list made Jenny replies look unrelated; Activity filtered by Presence only and mixed Sandbox with live-route records; causal copy exposed implementation-shaped context.

**Project enforcement:** `PlaygroundThreadFeed` groups objects by `parentExternalRef`; `LiveView`, `MirrorPanel`, `ExecutionLedger`, and `deriveActivitySummary` filter the selected Presence/channel/environment/session; `ActivityEventDetail` and `.event-context-preview` use the `Playground` tag and `↳`.

**Executable protection:** `tests/e2e/openpresence.spec.ts` covers reply stacking and Sandbox/live Activity isolation on Chromium + Pixel 5; `tests/runtime.test.ts` covers Activity environment scoping.

**Apply when:** Changing Playground, MirrorObject lineage, Activity, Presence routing, channel selection, event context, or review execution projections.

**Added:** 2026-08-13

## Rule: Playground worlds must be Presence-scoped

**Defect class:** Cross-Presence rehearsal leakage

**General principle:** Selecting a Presence changes the entire simulated social room. Agent-level meaning remains shared, but channel, Sandbox environment, actors, Social Mirror objects, rehearsal history, assignments, and calibration evidence must remain isolated to the selected Presence/session.

**Project enforcement:** Playground selects only an active session whose `presenceId` matches the selected Presence, automatically opens that Presence's session when switching in-place, and never falls back to another Presence's first session. The navigation and “Presence rehearsal” scope marker make the current embodiment explicit.

**Executable protection:** `tests/sandbox.test.ts` verifies distinct Presence/session/environment/channel roots and shared Agent mind; `tests/e2e/playground-rehearsal.spec.ts` verifies an X-only marker is absent from a LinkedIn world and returns when switching back on Chromium and Pixel 5.

**Apply when:** Changing Playground state projection, Presence switching, Sandbox sessions/environments, Social Mirror history, actor simulation, rehearsal calibration, or Agent-vs-Presence boundaries.

**Added:** 2026-08-14

## Rule: Chat must contain intentional conversation turns only

**Defect class:** Chat transcript provenance / cross-surface state leakage

**General principle:** A conversational transcript must contain only turns caused by an intentional participant message or an explicitly requested conversational action. Configuration, presence, and background runtime changes belong in their operational surface and must not appear as unsolicited agent replies.

**Incident:** Changing Presence identity, Ghost profile, rhythm, or other settings appended repeated “I noticed the Presence settings changed” messages to Chat even though the operator had not sent a chat message.

**Project enforcement:** The `/api/state` `setPresence` mutation persists the Presence change and its existing system event, but never appends an agent message to the active conversation. Chat remains in its blank state until `sendMessage` is used; live Presence state is still included in the Agent's next intentional chat context.

**Executable protection:** `tests/x-connection.test.ts` asserts repeated `setPresence` calls leave `messages` empty while a subsequent chat request receives the authoritative live Presence state. `tests/e2e/openpresence.spec.ts` asserts Settings changes do not create unsolicited Chat messages and the blank conversation state remains visible.

**Apply when:** Changing Presence Settings, runtime/background events, Chat transcript persistence, conversation hydration, or cross-surface state synchronization.

**Added:** 2026-08-13

## Rule: Rhythm settings must explain attention, expose real controls, and be reachable from Activity

**Defect class:** Presence configuration discoverability / cadence UX

**General principle:** A summary value is not a configuration surface. When a product shows cadence, it must explain what is being paced, distinguish it from capability permissions, expose every displayed setting, and provide a direct path to change it.

**Incident:** Activity showed “Attention · On demand” and Presence settings showed “Rhythm · Pacing is infrastructure” with opaque Recommended/Gentle/Custom options, while Quiet hours was displayed as “Not configured” without any setup path.

**Project enforcement:** Activity explains that Rhythm controls when a Presence checks its connected channel, links to Presence settings, and the settings surface defines Recommended (5 minutes), Gentle (15 minutes), and Custom (5–120 minutes). Quiet hours is Presence-scoped, persists as an overnight-safe window, and pauses automatic observation without blocking explicit Check now or Calendar runs.

**Executable protection:** `tests/runtime.test.ts` covers persisted custom rhythm and overnight quiet-hour scheduling; `tests/e2e/openpresence.spec.ts` covers Activity → Settings navigation, option explanations, quiet-hours persistence, Chromium + Pixel 5 responsive geometry, console errors, and failed requests.

**Apply when:** Changing Activity rhythm summaries, Presence settings, native observation cadence, quiet hours, scheduling, or execution-envelope language.

**Added:** 2026-08-13

## Rule: Full-viewport modal backdrops must center their dialog in the viewport

**Defect class:** Modal geometry / responsive overlay

**General principle:** A modal backdrop must cover the complete viewport and its dialog must be centered against that same viewport; centering against an underlying shell creates a visibly off-center popup and leaves parts of the page outside the scrim.

**Project-specific risk:** The Add a Presence backdrop inherited the workspace sidebar offset, so the overlay excluded the sidebar and the dialog was centered only in the remaining workspace.

**Project enforcement:** `.add-presence-modal-backdrop` uses full fixed insets and centers the Presence dialog independently of the sidebar layout.

**Executable protection:** `tests/e2e/presence-modal.spec.ts` checks backdrop bounds and dialog center at the active desktop/mobile viewport sizes.

**Apply when:** Changing Add Presence, Create Agent, dialog shell, sidebar offsets, or responsive modal layout.

**Added:** 2026-08-13

## Rule: Custom media controls must not leak native input chrome

**Defect class:** Playground media input / responsive UI

**General principle:** A custom upload control must own its visual presentation while preserving an accessible native file-selection path.

**Incident:** The Playground's form-wide input styling overrode the file input's `hidden` attribute, exposing the browser's “Choose File / No file chosen” control inside the custom Add media card and splitting one affordance into two competing controls.

**Project enforcement:** The file input uses a dedicated visually-hidden class inside the labeled Add media control; the control has explicit flex alignment and focus-visible treatment, while the link field remains a separate channel-native action.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the custom Add media control is visible, the file input is attached with the visually-hidden geometry, and the existing file-selection flow still persists a media-bearing simulated post on Chromium and Pixel 5.

**Apply when:** Changing Playground media entry, Sandbox event forms, upload controls, or shared form-input styling.

**Added:** 2026-08-13

## Rule: Activity must read as a Presence, a channel, and an operator queue

**Defect class:** Activity information architecture / social-feed readability

**General principle:** An operational Presence page should answer one question at a time: what needs the operator, what did the Agent observe, what did it decide, and what happened. World objects should use the visual grammar of their channel; execution proof must stay adjacent without becoming a duplicate status rail.

**Project-specific risk:** The former Activity surface presented Social Mirror posts as loose text, used the misleading “The day in motion” heading, repeated Now/Next/Review in separate areas, and placed the execution ledger away from the activity it explained. Operators had to reconstruct the social story from implementation-shaped fragments.

**Project enforcement:** `LiveView` uses a Presence-specific “right now” header, an actionable review banner, channel-native `.mirror-post` cards, a single `.activity-status-panel`, a single `.execution-ledger`, and a chronological `.activity-log`. Context-bearing events and actions expose `.event-context-preview`, `.status-context-button`, or `.action-context-card` so the source post is one click away. The UI keeps observed context, Agent decisions, executions, and outcomes separately labeled.

**Executable protection:** `tests/e2e/openpresence.spec.ts` covers Activity lifecycle, review/manual execution, and Presence-name scoping. Rendered desktop and Pixel 5 QA checks assert no horizontal overflow and no browser console errors; a dedicated visual regression assertion is recommended if screenshot testing is added to the project.

**Apply when:** Changing Activity/Live composition, Social Mirror presentation, review queues, execution proof, or Presence operational copy.

**Added:** 2026-08-13

## Rule: Calendar Week must reserve space for late-day card content

**Defect class:** Responsive layout / clipped evidence

**General principle:** A time-grid item that begins near the final visible row must retain enough surface area for its complete content and footer; the operator should never have to infer that more content exists below a clipped boundary.

**Project-specific risk:** Week view positioned a 23:08 publication inside a fixed 24-hour body with hidden overflow, cutting off the card's proof footer at the bottom of the calendar.

**Project enforcement:** The Week timeline reserves a bottom buffer after the 24 hourly rows, while narrow screens keep the existing horizontal timeline scroll.

**Executable protection:** `tests/e2e/calendar-history.spec.ts` asserts that the publication card and its proof footer remain within the Week surface on Chromium and mobile.

**Apply when:** Changing Calendar Week positioning, timeline height, card density, or responsive overflow behavior.

**Added:** 2026-08-13

## Rule: Dense Calendar selections need an alternate browse path

**Defect class:** Interaction discoverability / stacked-card selection

**General principle:** When time-grid items overlap, the operator needs a reliable sequential navigation path; clicking exposed pixels cannot be the only way to reach an item.

**Project-specific risk:** Calendar Week positioned multiple publications at the same time, stacking buttons so only the top card was reliably selectable.

**Project enforcement:** PublicCalendarView passes the current filtered history to PublicHistoryInspector; the inspector exposes Previous/Next controls and a position indicator while preserving the selected item’s details.

**Executable protection:** `tests/e2e/calendar-history.spec.ts` asserts that the navigation controls update the displayed post and position.

**Apply when:** Changing Calendar history cards, inspector selection, filters, or Week overlap handling.

**Added:** 2026-08-13

## Rule: Verified external publications must expose an actionable destination

**Defect class:** Evidence usability / channel provenance

**General principle:** A verified public record should let the operator reach the canonical external object when the channel provides a stable URL; evidence that cannot be opened must say why.

**Project-specific risk:** Calendar proved that an expression existed but exposed only an opaque X object ID, forcing the operator to leave OpenPresence and search manually. Sandbox rehearsals must never masquerade as live X publications.

**Project enforcement:** `derivePublicHistory` derives an `externalUrl` only for verified, non-Sandbox X references using the selected Presence's native X account handle. `PublicHistoryInspector` renders `Open on X` for that URL and a truthful no-live-URL note for Sandbox history.

**Executable protection:** `tests/runtime.test.ts` asserts the canonical X URL for a verified publication and asserts that Sandbox history has no external URL. The Calendar E2E and browser review protect the inspector's visible action and responsive layout.

**Apply when:** Changing public-history projections, execution evidence, native X identity, Sandbox presentation, or the Calendar inspector.

**Added:** 2026-08-13

## Rule: Presence destination selection must be singular and state-truthful

**Defect class:** Information architecture / environment boundary / misleading status

**General principle:** A Presence has one active destination at a time. Sandbox, native X, and Bridge are explicit route choices; the UI must show only the selected route's controls, and connection language must describe the actual connection state.

**Incident:** Presence Settings rendered X and Bridge as parallel settings, made Sandbox difficult to discover, showed live-channel copy before a connection existed, and left “Agent-wide” in Chat chrome where it was not actionable context.

**Project enforcement:** `connectionMode` persists the selected route, connector routing honors it, Sandbox is a first-class destination, inactive connector panels are hidden, unconnected live routes say they are not active, and Chat's top-right status area is absent outside Presence Settings.

**Executable protection:** `tests/sandbox.test.ts` verifies route exclusivity and environment persistence. `tests/e2e/openpresence.spec.ts` verifies Sandbox/X/Bridge switching, persistence, truthful connection copy, Chat chrome, Playground copy, and desktop/mobile behavior. `tests/e2e/x-connection.spec.ts` verifies native X configuration within the selected X route.

**Apply when:** Changing Presence Settings, channel selection, Sandbox/Playground, native connectors, Bridges, connection status copy, or Chat top-bar context.

**Added:** 2026-08-13

## Rule: Perception must remain evidence, not truth

**Defect class:** Multimodal cognition / Sandbox isolation / truthful uncertainty

**General principle:** Raw social assets, derived perception, and Taste-led action are separate layers. A text-only runtime must not invent media understanding, and Sandbox corrections must not update Agent-wide Memory, Growth, or Taste.

**Project-specific risk:** An image-bearing Social Mirror object could be reduced to text, causing the Agent to reply as though it had seen the image, or a simulated correction could leak into durable Agent meaning.

**Project enforcement:** `Asset` stores raw evidence separately from versioned `AssetPerception`; unsupported or uninspected media is explicitly `insufficient`; media-dependent Sandbox intents require usable inspect-level perception and Presence policy; Reset removes session-scoped assets and perceptions only.

**Executable protection:** `tests/sandbox.test.ts` verifies raw asset references, provenance, insufficient perception, blocked media-dependent intent formation, Presence uncertainty policy, and session reset. `tests/e2e/openpresence.spec.ts` verifies image input, “What Jenny sees,” “Media needs inspection,” and reset behavior on Chromium and Pixel 5.

**Apply when:** Adding media inputs, perception providers, Social Mirror object types, action gating, Sandbox corrections, or durable Agent learning from social evidence.

**Added:** 2026-08-13

## Rule: Sandbox UI must be channel-native, not a generic social-event editor

**Defect class:** Social Mirror semantics / Playground UX

**General principle:** Sandbox is infrastructure; the user should experience the selected Social Mirror. Event actions, labels, relationships, and starting-world copy must come from the channel definition.

**Project-specific risk:** A generic `Mention` action and always-present `Conversation` selector implied one universal social grammar and made X-specific rehearsal misleading for other channels.

**Project enforcement:** `simulationForChannel` supplies the world label and action grammar; `SandboxEventForm` renders conditional relationship targets and reusable actors; Settings names the selected route with its simulated channel.

**Executable protection:** `tests/sandbox.test.ts` verifies X reply targets and actor reuse; `tests/e2e/openpresence.spec.ts` verifies conditional fields, `Simulated X` labeling, live-route rehearsal, and desktop/mobile rendering.

**Apply when:** Adding a Social Mirror, changing Playground controls, introducing a channel capability, or changing Sandbox copy.

**Added:** 2026-08-13

## Rule: Repeated context outputs require collision-proof React keys

**Defect class:** Rendering integrity / repeated collection identity

**General principle:** Context and Activity collections can contain repeated labels and details. Render keys must remain unique when two records describe the same kind of output.

**Incident:** Two `x.post` outputs with `Publication draft` details produced the React duplicate-key warning `x.post-Publication draft` and made rendering behavior unsupported.

**Project enforcement:** Context output rows use a stable per-render fallback index in addition to their semantic label and detail, so repeated outputs remain independently renderable.

**Executable protection:** The Chat E2E flow captures browser console errors, and the affected output projection is covered by the focused Chat/browser pass.

**Apply when:** Adding or changing repeated Context, Activity, execution, publication, or output lists.

**Added:** 2026-08-13

## Rule: Activity context must be explicit and rapid duplicates must collapse

**Defect class:** Activity provenance / repeated event presentation

**General principle:** An activity record may show source context only when its lineage identifies that source or target. A concise operator timeline should collapse rapid identical records instead of presenting the same decision as several independent explanations.

**Incident:** Activity used the latest observed post as a fallback for events without lineage, so several separate rows displayed the same “Because of” post. Rapid repeated silence events also appeared as duplicate rows in the visible timeline.

**Why QA missed it:** Earlier Activity QA verified that a context preview appeared for one event, but did not exercise missing lineage or repeated event records in the same populated stream.

**Project enforcement:** `LiveView` resolves context only from `sourceObjectId`, Social Intent/Execution/Outcome targets, or explicit target-object lineage. `addSandboxEvent` and `formSandboxIntent` persist Sandbox source IDs. Activity retains the newest event when identical records occur within ten seconds.

**Executable protection:** `tests/sandbox.test.ts` asserts Sandbox source lineage; `tests/e2e/openpresence.spec.ts` removes lineage and injects a duplicate event through a browser response fixture, then verifies no guessed preview and one visible row on Chromium and Pixel 5.

**Apply when:** Changing Activity, Social Mirror context previews, event lineage, Sandbox decisions, or repeated event projections.

**Added:** 2026-08-13

## Rule: Sandbox rehearsal must never escape into live delivery

**Defect class:** Environment isolation / simulated delivery boundary

**General principle:** Playground is a real Agent rehearsal in a simulated world. Social Mirror objects, sessions, clocks, intents, executions, outcomes, and publications must remain scoped to the selected Sandbox session, and no Sandbox operation may call a native connector.

**Project enforcement:** Sandbox references use `sandbox://`-compatible simulated identifiers and `sandbox:` connector IDs. Delivery checks the environment, connector kind, bridge prefix, and session before creating a simulated Mirror object. Reset removes only the selected session's world and execution records while preserving Agent meaning files.

**Executable protection:** `tests/sandbox.test.ts` verifies environment creation, Social Mirror normalization, simulated delivery, review gating, virtual time, and session reset. `tests/e2e/openpresence.spec.ts` verifies start, wake, audience event, virtual time, reset, and mobile/desktop flow.

**Apply when:** Changing Playground, Sandbox state, Social Mirror normalization, simulated connectors, Agent rehearsal, or live connector routing.

**Added:** 2026-08-13

## Rule: Agent CLI output must remain machine-readable and sandbox-scoped

**Defect class:** Agent tooling / output contract / environment isolation

**General principle:** AI agents should be able to drive Playground without parsing UI copy or receiving unrelated application state. Every CLI command must return structured JSON by default, identify the selected sandbox session, preserve the observation → decision → execution → outcome chain, and never enable live delivery.

**Project enforcement:** `openpresence playground`, `openpresence schedule`, and `openpresence watching` target `/api/state` only with sandbox-safe operations, project Presence/session-scoped records, and require `--human` for non-machine output. Playground supports deterministic virtual time, Assignments, original-post calibration, and JSON scenarios; Schedule preserves Consider versus Assign semantics and blocks non-Sandbox evaluation; Watching preserves automatic/manual source status without inventing observations. Documentation uses `pnpm --silent` so package-manager banners cannot corrupt JSON streams.

**Executable protection:** `tests/playground-cli.test.ts` verifies projection redaction, operation translation for Playground/Schedule/Watching, and structured server errors. Local smoke verification covers `start`, `inspect`, `inject`, `advance`, `timeline`, Assignments, rehearsal feedback, Schedule mutation/evaluation, Watch lifecycle, and live-scope blocking against the production-shaped app.

**Apply when:** Changing the Playground CLI, scenario format, agent-facing state projections, sandbox commands, or command output formatting.

**Added:** 2026-08-13; expanded 2026-08-14

## Rule: Presence marks must stay legible and channel-scoped

**Defect class:** Visual identity / compact navigation overflow

**General principle:** A Presence's channel identity must remain recognizable in compact controls even when its human-readable name is long. Use a channel-native mark, a verified domain favicon, or an explicit predefined fallback icon; keep the full name available through accessible naming and detail views rather than forcing it into the badge.

**Incident:** The Founder Community screenshot rendered the long Social Mirror name as the badge, causing the compact Presence control to lose its visual hierarchy and fit. The requested correction is especially important for community names such as “Founder Community” and for the actual X mark.

**Project enforcement:** `PresenceLogo` resolves X's brand mark, a custom channel's optional domain favicon, or a predefined icon. `PresenceSwitcher` uses the mark in compact controls while retaining the full Presence name in the accessible label and menu. Add Presence supports optional domain input and fallback-icon selection; Presence Settings uses the same mark in the overview.

**Executable protection:** `tests/e2e/openpresence.spec.ts` verifies X and custom favicon/icon behavior, name persistence, and mobile overflow; `tests/e2e/sidebar-hierarchy.spec.ts` verifies the compact logo geometry; `tests/runtime.test.ts` verifies custom channel metadata persistence.

**Apply when:** Changing Presence/channel identity UI, Social Mirror configuration, compact navigation, Presence Settings, or responsive layout.

**Added:** 2026-08-13

## Rule: Calendar grants permission to consider, not a prewritten publication

**Defect class:** Schedule-to-cognition boundary / false external action

**General principle:** A Calendar standing intent is permission for Jenny to pay attention at a time, not a stored post or an obligation to publish. Every evaluation must pass through Agent cognition, allow `NO_OP`, and only then form Social Intent, Execution, and Delivery.

**Project enforcement:** Calendar `Run now` and the open-app scheduler call the Agent runtime with the standing instruction and current Presence context. A `NO_OP` records a truthful decision and no execution. A candidate is linked to its `standingIntentId`, passes through the Presence execution envelope, and native X delivery is counted only with an external reference. Due scheduled evaluations are idempotent per Calendar day.

**Executable protection:** `tests/x-connection.test.ts` covers Calendar cognition → standing Social Intent → native X delivery with external evidence; `tests/runtime.test.ts` covers truthful Calendar no-op Activity state; `tests/e2e/openpresence.spec.ts` covers Calendar creation, edit, time persistence, and evaluation.

**Apply when:** Changing Calendar, Standing Intent, scheduler behavior, Agent evaluation, Social Intent formation, or external delivery.

**Added:** 2026-08-13

## Rule: Provider connection identity is not user-editable

**Defect class:** Configuration integrity / provider identity

**General principle:** A connection name that identifies an external provider should be derived from the provider type, not treated as user-owned metadata that can be renamed in a credential form.

**Project-specific risk:** Brain → Provider access previously exposed a writable “Connection name” field, and `configureProvider` accepted that label, allowing an OpenAI/Ollama connection to be presented under an arbitrary name and making provider selection less trustworthy.

**Learned from:** Human-found UI defect in the provider setup flow.

**Why QA missed it:** Earlier provider setup QA verified that a connection could be saved, but did not test identity immutability or compare the browser form with the runtime’s provider enum.

**Project enforcement:** `BrainView` renders provider-owned names for OpenAI, OpenRouter, and Ollama and omits the connection-name input; `applyOperation`’s `configureProvider` branch canonicalizes stored labels through `providerName`.

**Executable protection:** `tests/runtime.test.ts` rejects attempted OpenRouter renames, `tests/provider-connections.test.ts` verifies the OpenRouter endpoint, and `tests/e2e/openpresence.spec.ts` asserts the connection-name field is absent while completing OpenRouter and existing Ollama/OpenAI setup.

**Apply when:** Adding providers, changing Brain provider access, editing credential forms, or changing `configureProvider` persistence.

**Added:** 2026-08-13

## Rule: Live X tests must never mutate the operator account

**Defect class:** Test contamination / account-boundary violation

**General principle:** A live Agent-to-Presence experiment must keep external stimulus, Agent delivery, and operator activity attributable. Browser automation must not post, reply, like, follow, or otherwise mutate a human/operator account while testing the Agent's public behavior.

**Incident:** During the 2026-08-13 X experiment, the browser session was switched to the operator's `@operator-account` account and a substantive reply was posted there. The post was authored by the test operator path, not Jenny's native X connector. The screenshot made the account identity visible, but the test was not stopped at the account boundary.

**Project enforcement:** Live X delivery is verified only through the Presence-scoped native connector shown in `state.nativeConnections[].account`; for this Presence that account is `@other-account`. A second-account reply must be authored by the operator or another explicitly authorized tester. If that input is needed and no separately authorized test account is available, stop and wait. Never switch a browser session to an operator account to manufacture it.

**Executable protection:** ⚠️ Missing — the product test suite can verify native delivery account provenance, but it cannot police external browser actions performed by a test operator. The live-test checklist must include an explicit account check before every external action and a hard stop when the active account is not the configured Presence account.

**Apply when:** Running live X experiments, using Chrome with multiple signed-in X accounts, creating inbound test stimuli, or verifying external artifacts.

**Added:** 2026-08-13

## Rule: Explicit Chat publication requests must enter the real execution ledger

**Defect class:** Agent action boundary / false completion

**General principle:** A Chat request that explicitly asks a Presence to publish is a Social Intent, not merely a conversational drafting exercise. Cognition, execution, and delivery must remain separately visible, and the Agent must never imply delivery without a native outcome.

**Project-specific risk:** Chat returned a generic draft for an explicit X introduction request while Activity still showed no intent, execution, or observation. The operator could not tell whether Jenny had acted, and the real feed remained unchanged.

**Project enforcement:** The exact explicit X publication request is converted into a Social Intent and native execution. Auto Posts are delivered through the native connector and recorded with the external reference; connector failures persist as failed executions and truthful Activity events. Review and manual modes remain gated by the Presence envelope.

**Executable protection:** `tests/runtime.test.ts` verifies an explicit Chat publication request forms a native queued execution without prematurely creating an outcome. Narrow live QA must verify the real X post before any inbound reply test begins.

**Apply when:** Connecting Chat cognition to Social Intent formation, adding channel tools, changing auto/review/manual execution, or reporting external delivery.

**Added:** 2026-08-12

## Rule: First wake must use real Presence footing and native observation

**Defect class:** Agent autonomy / cognition-to-world boundary

**General principle:** Waking a Presence starts a real attention cycle. It must observe the connected channel, make a first-move judgment from Mission, Taste, Soul, and live public footing, then pass any Social Intent through the normal execution and delivery path. A canned introduction, fabricated mirror event, or successful local execution is not an acceptable substitute.

**Project-specific enforcement:** A connected native X wake reads the Presence's recent posts and mentions, persists the observed public footing in Presence context, invokes the selected Agent runtime for launch judgment, and creates a native `x.post` or `x.reply` execution only when the Agent chooses to act. Inbound mentions become native Mirror records before cognition. Missing mention-read scope is reported as partial observation without blocking a first launch when own-history observation succeeds.

**Failure enforcement:** A connector rejection persists a failed Execution and failed Outcome without an external reference, preserves the provider's actionable error, marks the native connection as needing attention, and surfaces the failure in Activity. “Connected” authentication is not treated as proof that X accepted a write.

**Executable protection:** `tests/x-connection.test.ts` covers first wake → public footing → Agent launch → native delivery, and a real-write rejection with no invented external artifact. `tests/runtime.test.ts` covers Presence-scoped footing and reply targets. Live QA must still provide a real X post ID/URL before it can pass.

**Apply when:** Changing wake/pulse behavior, native channel reads, launch cognition, social observation, reply continuity, connector health, or external delivery reporting.

**Added:** 2026-08-13

## Rule: Stable IDs are required for repeated state acknowledgements

**Defect class:** Persistence integrity / rapid mutation collision

**General principle:** User-visible state changes may happen back-to-back and must remain independently persistable. Timestamp-only IDs are not safe identifiers for rapid operations.

**Project-specific enforcement:** State acknowledgment messages use UUID-backed IDs, so rapid Ghost/Agent or Presence setting changes cannot collide in SQLite's `messages` primary key.

**Executable protection:** The provider connection test repeatedly applies immediate Presence changes before reading the authoritative live state.

**Added:** 2026-08-13

## Rule: Agent tools must be discoverable at Agent scope

**Defect class:** Information architecture / capability provenance

**General principle:** A capability count is not useful unless the operator can see what is bound, why it exists, and which layer controls its authorization.

**Project-specific risk:** Chat exposed “Tools available: 4” without naming the four capabilities or identifying where they were configured. This made Agent-owned mechanics look like hidden Presence settings and blurred the difference between a bound tool and an authorized channel action.

**Project enforcement:** Manage Agent lists the named tool bindings with descriptions and scope. Chat uses “Tools bound” for the summary count. Presence settings remain the place for channel execution modes such as off, manual, review, and auto.

**Executable protection:** `tests/runtime.test.ts` verifies the four seeded bindings are Agent-owned. `tests/e2e/openpresence.spec.ts` verifies all four are visible in Manage Agent and that Chat no longer says “Tools available”.

**Apply when:** Adding or changing tools, skills, runtime capabilities, Chat provenance summaries, or Presence execution permissions.

**Added:** 2026-08-12

## Rule: Activity must expose current work, next attention, and rhythm

**Defect class:** Operational visibility / false scheduler implication

**General principle:** Live is an operational social stream, not analytics. The operator must be able to tell what the Presence is doing now, what will happen next, and what needs review; idle and paused states must be explicit.

**Project-specific risk:** The former Live page showed historical events and aggregate counters but did not explain whether Jenny was currently doing anything, when she would look again, or whether a review item was waiting. That made a connected Presence appear inert and encouraged the UI to imply background cognition that the local runtime did not provide.

**Project enforcement:** Activity derives a current state from Presence status, pulses, intents, and executions; shows the next standing intent or explicitly says attention is on demand; separates attention cadence from publishing/reply modes; and labels the native X mirror as connected but not yet observed when no observation loop has run.

**Executable protection:** `tests/runtime.test.ts` covers idle, pulse, paused, and standing-intent summaries. `tests/e2e/openpresence.spec.ts` verifies the visible Now/Next/rhythm summary and a completed pulse. The implementation must not invent automatic scan times without a real scheduler source.

**Apply when:** Changing Activity/Live, pulse behavior, schedules, execution review, channel observation, or Presence rhythm settings.

**Added:** 2026-08-12

## Rule: Ghost identity must be Presence-scoped, explicit, and reviewable

**Defect class:** Agent identity boundary / AI grounding / operator control

**General principle:** A Ghost should extend an operator or organization through context the operator explicitly provides and can inspect. The Agent must not fill missing operator preferences from its own identity, stale transcript, or private implementation context.

**Project-specific risk:** Selecting “Me / my organization” previously changed only a mode flag. The UI gave the operator no place to define what the Ghost represented and no way to review the interpretation that would shape its replies.

**Project enforcement:** Ghost profiles live on the individual Presence, are shown and edited in Presence settings, and are compiled into cognition only while that Presence is in Ghost mode. Empty fields remain explicitly unknown; Agent-wide meaning files are not rewritten.

**Executable protection:** `tests/runtime.test.ts` verifies Presence-scoped storage, empty-field behavior, mode isolation, and protected Soul preservation. `tests/e2e/openpresence.spec.ts` verifies editing, review status, reload persistence, and Chat acknowledgment. A live browser cognition check verifies the selected Ghost profile is reflected in the next response.

**Why QA missed it:** The previous Ghost implementation treated identity as a binary mode without an operator-owned representation profile or an inspectable cognition boundary.

**Apply when:** Adding or changing Ghost mode, operator/organization identity, profile/preferences context, Agent prompt assembly, or identity review UI.

**Added:** 2026-08-12

## Rule: Navigation labels must distinguish destinations from state controls

**Defect class:** Information architecture / state semantics

**General principle:** A navigation label should describe the destination’s purpose, while buttons should describe the state transition they perform. Avoid using the same word for a page and an action/status concept when it creates ambiguity.

**Project-specific risk:** “Live” was both the sidebar destination and a state label, while Settings exposed “Resume Presence”; users could not tell whether these were duplicate controls or different views.

**Learned from:** Human-reported Presence settings and Live screenshots on 2026-08-12.

**Project enforcement:** The `live` view is presented as “Activity” in navigation and the topbar; the Activity page retains “live/paused” as Presence state, and Settings retains Pause/Resume as the state-changing control.

**Executable protection:** `tests/e2e/openpresence.spec.ts`, `tests/e2e/x-connection.spec.ts`, and `tests/e2e/small-desktop.spec.ts` navigate through the Activity label and verify the state lifecycle.

**Apply when:** Renaming navigation, changing page purpose, adding state controls, or revising status language.

## Rule: Workspace content must fill the usable app column

**Defect class:** Responsive layout / flex sizing

**General principle:** A flex child with auto margins must declare its intended width; otherwise the browser may shrink it to its content size and create unexplained whitespace around the primary task.

**Project-specific risk:** The main OpenPresence pages rendered as a narrow centered column even on wide desktop screens, leaving the left and right sides of the workspace unused.

**Learned from:** Human-reported desktop screenshots showing excessive whitespace around Live, Calendar, Settings, Chat, and Manage Agent on 2026-08-12.

**Project enforcement:** `.workspace-content` uses an explicit responsive width, bounded maximum, and border-box sizing so page layouts receive the full usable workspace column; mobile retains its existing 20px gutters.

**Executable protection:** `tests/e2e/small-desktop.spec.ts` verifies every primary page aligns the content frame with the workspace edges without horizontal overflow.

**Apply when:** Changing shell sizing, page gutters, responsive breakpoints, or any flex/grid layout that owns the primary workspace.

## Rule: Only Chat owns a locked viewport

**Defect class:** Responsive layout / scroll ownership

**General principle:** A fixed composer or internal transcript scroll must not impose `overflow: hidden` on unrelated pages. Scroll ownership should be scoped to the surface that needs it; long settings and planning pages must retain normal document scrolling.

**Project-specific risk:** The shell’s Chat viewport rule was applied to every page, clipping the lower Presence settings capability rows and preventing page scrolling.

**Learned from:** Human-reported Presence settings screenshots where vertical scrolling was unavailable on 2026-08-12.

**Project enforcement:** `workspace-chat` receives the locked viewport and internal Chat history scroll; non-Chat `.workspace` and `.workspace-content` retain visible overflow and natural document height.

**Executable protection:** `tests/e2e/small-desktop.spec.ts` verifies Settings creates document scroll and visible workspace overflow; existing Chat tests verify transcript-only scrolling and no document overflow.

**Apply when:** Changing the shell, Chat composer, page scrolling, responsive viewport sizing, or adding long settings/planning content.

## Rule: Native channel credentials must be Presence-scoped and usable

**Defect class:** Integration architecture / secret handling / dead-end configuration

**General principle:** A channel connection is different from an Agent model provider. Official channel credentials belong to the specific Presence, must be encrypted at rest, must be tested before activation, and must produce a real connector path for the capabilities the credential grants.

**Project-specific enforcement:** X uses the Official X API section in Presence settings, stores raw credentials only in the encrypted `channel_credentials` table, exposes read-only versus read-write access from the tested account context, and routes native post delivery through `/api/state` and the execution ledger. Bridges remain a separate fallback connector.

**Executable protection:** `tests/x-connection.test.ts` verifies encrypted storage, no raw secret in API state, read-only/read-write detection, OAuth 1.0a signing, disconnect cleanup, provider-vault storage, and native delivery. `tests/e2e/x-connection.spec.ts` verifies desktop/mobile test → save → reload persistence and a native X publication without creating a Bridge.

**Why QA missed it:** The previous implementation presented provider configuration as if it stored usable credentials and treated a generic Bridge as the only live channel path; no test exercised a real channel credential lifecycle.

**Apply when:** Adding or changing channel connectors, OAuth/API credential forms, secret storage, provider access, or external execution paths.

**Added:** 2026-08-12

## Rule: Revoked Bridge credentials must be identifiable and removable

**Defect class:** Credential lifecycle / stale connector record

**General principle:** Revocation must invalidate the secret while leaving enough redacted metadata for an operator to identify the affected credential; a disconnected connector should not become an undeletable tombstone.

**Project-specific enforcement:** Bridge settings show only the credential prefix and revocation time when that audit record exists, explicitly state that the secret value is not recoverable, and offer Remove Bridge only after disconnection. Removal deletes the credential-vault row and Bridge/sync projection, preserves mirror history, records a removal event, and does not restore authentication. Legacy rows without a surviving credential record are labeled honestly as metadata-unavailable.

**Executable protection:** `tests/runtime.test.ts` covers metadata hydration, secret non-recovery, vault deletion, and audit state; `tests/e2e/openpresence.spec.ts` covers the visible prefix, removal action, and post-removal UI.

**Apply when:** Changing Bridge revocation, credential rotation, connector cleanup, audit events, or external adapter onboarding.

**Added:** 2026-08-12

## Rule: External credential failures must explain the next action

**Defect class:** Third-party integration error handling / misleading toast

**General principle:** External API failures should preserve the provider’s meaning while translating it into a safe, actionable product message; expected provider rejection should not look like an unhandled application crash.

**Project-specific enforcement:** `lib/x.ts` maps exhausted credits, invalid credentials, permissions, and rate limits to user-facing guidance; `/api/x/manage` logs expected rejections without a stack trace. The X form links directly to the Developer Console and explains where Access Token and Secret come from.

**Executable protection:** `tests/x-connection.test.ts` stubs a 402 `credits depleted` response and asserts the returned message names the X credit balance and next action. `tests/e2e/x-connection.spec.ts` asserts the normalized credential fields have equal rendered widths on desktop and mobile.

**Why QA missed it:** The previous QA path only used the local X mock, so it covered success but not a real provider rejection or the resulting visual form state.

**Apply when:** Handling OAuth/API failures, billing/rate limits, permission errors, or adding credential forms for external providers.

**Added:** 2026-08-12

## Rule: Dialogs must center within their intended interaction surface

**Defect class:** Modal layout / visual alignment

**General principle:** A dialog should center within the interaction surface it belongs to. Full-viewport flows must center against the viewport and cover it completely; dialogs intentionally constrained to a page workspace may center within that workspace.

**Project-specific risk:** Add Presence was previously offset by the workspace sidebar, leaving the navigation outside the scrim and making the popup appear off-center in the full application window.

**Project enforcement:** Add Presence uses the scoped `.add-presence-modal-backdrop` class with full fixed insets and viewport centering at every responsive breakpoint.

**Executable protection:** `tests/e2e/presence-modal.spec.ts` measures the backdrop against the viewport and the dialog against the viewport center at desktop and mobile sizes.

**Why QA missed it:** Existing Add Presence coverage compared the dialog to the workspace surface, so it did not protect the intended full-viewport scrim contract.

**Apply when:** Adding or changing dialogs, modal backdrops, shell navigation widths, or responsive layout rules.

**Added:** 2026-08-12
**Updated:** 2026-08-13

## Rule: Wake and pulse actions must follow Presence lifecycle state

**Defect class:** State / UX contradiction

**General principle:** Lifecycle controls should match the operator's mental model: waking a Presence starts its operation and first attention cycle; checking now is only an on-demand cycle for an already-live Presence.

**Project-specific risk:** Live previously said “Jenny is live” while the Presence was paused, and `Resume Presence` sat beside a disabled `Run one pulse`, requiring the operator to understand two runtime primitives before Jenny would do anything.

**Learned from:** Production Chrome exploratory review on 2026-08-12.

**Why QA missed it:** The first walkthrough verified pause controls and the paused badge but did not exercise the complete paused → wake → first attention cycle or inspect the duplicate action language across Activity and Presence settings.

**Project enforcement:** Paused Activity and Presence settings expose `Wake up Jenny`, which applies the `wakePresence` operation and immediately evaluates one cycle; live Activity exposes `Check now` and `Pause`. Paused copy says “asleep” and no longer exposes `Resume Presence` or `Run one pulse`.

**Executable protection:** `tests/runtime.test.ts` verifies paused pulses remain inert and `wakePresence` restores live state plus a no-op attention cycle. `tests/e2e/openpresence.spec.ts` verifies asleep copy, action de-duplication, wake transition, wake event, pulse completion, and live settings controls.

**Apply when:** Adding or changing lifecycle states or control-plane actions.

**Added:** 2026-08-12

## Rule: Enabled skills must remain editable instruction prompts

**Defect class:** Configuration discoverability / AI behavior authoring

**General principle:** A reusable AI behavior is only useful when its operator can revisit both its name and the instruction prompt that defines it; status text alone is not an actionable control.

**Project enforcement:** Brain exposes an Edit action for every installed skill, labels the description as an instruction prompt, and persists edits without replacing the AgentSkill binding or enabled state.

**Executable protection:** `tests/e2e/openpresence.spec.ts` creates a skill, opens Edit, verifies the prompt value, saves a revised prompt, and verifies the updated copy; `tests/runtime.test.ts` verifies the skill binding remains enabled after `editSkill`.

**Why QA missed it:** The first Brain acceptance test verified skill creation and the Enabled summary but never attempted to revisit or change the behavior prompt.

**Added:** 2026-08-12

## Rule: Calendar needs both an editing surface and a visual rhythm surface

**Defect class:** Planning visibility / missing representation

**General principle:** Scheduled work should be understandable as both editable records and spatial time-based rhythm; the visual view must represent schedule timing without inventing downstream content.

**Project enforcement:** Calendar keeps List as the intent editor and exposes Week as a Monday–Sunday hourly grid. Week cards derive only from `CalendarSlot.day`, `time`, `executionWindow`, `objective`, and Presence scope; clicking a card reuses the existing edit flow.

**Executable protection:** `tests/e2e/calendar-week.spec.ts` creates a standing intent, switches to Week, verifies the timed intent card and non-publishing copy, then returns to List.

**Why QA missed it:** Calendar was tested as a CRUD list and execution trigger, but not as a planning visualization; the user had to mentally reconstruct the weekly rhythm from rows.

**Added:** 2026-08-12

## Rule: Sidebar hierarchy must make Agent and Presence scopes explicit

**Defect class:** Information architecture / scope selection

**General principle:** Profile-like workspaces belong in an account-style switcher, while the current workspace’s channels belong in a dedicated selector; repeating every record inline creates ambiguous hierarchy and weakens scanability.

**Project enforcement:** `AgentSwitcher` renders only in `.sidebar-footer`; `PresenceSwitcher` is the only desktop Presence control in the sidebar and selects through `selectPresence`; the mobile topbar keeps compact access because the desktop footer is hidden at the mobile breakpoint.

**Executable protection:** `tests/e2e/sidebar-hierarchy.spec.ts` verifies the Presence dropdown selection flow, absence of the old inline Presence tree, and Agent dropdown placement in the sidebar footer.

**Selector readability:** The active Presence card shows the channel label once, keeps the Presence identity and ownership mode on single lines, and truncates long custom channel names instead of expanding the sidebar.

**Why QA missed it:** Earlier browser checks verified that Agent and Presence records existed, but not that the two selectors communicated the User → Agent → Presence hierarchy or that Agent switching felt account-like.

**Added:** 2026-08-12

## Rule: Small desktop must prioritize the current task above page chrome

**Defect class:** Responsive visual hierarchy / information density

**General principle:** A desktop application in a constrained window is not mobile; preserve desktop navigation while reducing header chrome, gutters, and secondary panel width so the primary task remains visible above the fold.

**Project-specific risk:** Generous page headers and fixed side panels caused Chat, Calendar, Brain, and Presence settings to spend the first viewport on context instead of the action the returning operator came to perform.

**Project enforcement:** The small-desktop media contract applies only from 681px upward; `tests/e2e/small-desktop.spec.ts` runs the primary pages at 1024×720, asserts no horizontal overflow, asserts compact header geometry, and verifies Calendar/Chat primary actions remain visible.

**Why QA missed it:** The previous responsive matrix covered mobile and a wide desktop viewport, but not a narrow desktop window where the desktop grid becomes content-starved.

**Added:** 2026-08-12

## Rule: Navigation and local runtime status are persistent shell concerns

**Defect class:** Layout / workflow reachability

**General principle:** The shell must keep primary navigation and runtime identity available while page content scrolls.

**Project-specific risk:** A scrolling sidebar hid the Local runtime indicator and made long pages feel disconnected from the control plane.

**Project enforcement:** The desktop sidebar uses sticky positioning and the topbar repeats `Local runtime · SQLite`; the desktop E2E test asserts both.

**Added:** 2026-08-12

## Rule: Standing Intents must contain executable instructions

**Defect class:** Data integrity / ambiguous control

**General principle:** A schedule label is not an instruction. Every Run action must be explainable from persisted intent data.

**Project enforcement:** Calendar persists `instruction`, `objective`, and `executionWindow`; runtime tests assert the instruction and expiration metadata, and Playwright runs the intent through Live.

**Added:** 2026-08-12

## Rule: Presence settings are generated from channel-native capabilities

**Defect class:** Architecture / misleading configuration

**General principle:** One agent can have multiple Presences, and each channel owns its capability vocabulary.

**Project enforcement:** `CHANNEL_CAPABILITIES` drives the settings UI and runtime execution map; the unit suite verifies LinkedIn does not inherit X-only capabilities.

**Added:** 2026-08-12

## Rule: Chat is one persistent Agent conversation

**Defect class:** Information architecture / misplaced state

**General principle:** Chat is the single persistent conversation for shaping an Agent; conversation history, New conversation, and model selection do not compete with that surface.

**Project enforcement:** The active Chat surface renders no conversation list, New conversation control, or model selector, while the transcript persists across reloads.

**Added:** 2026-08-12

## Rule: Chat context and changes use a real right sidebar

**Defect class:** Information architecture / misplaced state

**General principle:** Conversation configuration should remain inspectable without competing with the transcript; blank-state prompts belong in the canvas, Agent runtime choice in Brain, and context/changes on the right.

**Project enforcement:** `ContextChatView` renders a persistent `Context & Changes sidebar` with Scope, Context, Changes, Outputs, and Advanced sections. Its toggle exposes `Hide context sidebar` / `Show context sidebar`, while the legacy floating `Try saying` panel is not rendered by the active Chat surface.

**Executable protection:** Playwright asserts the right sidebar, its sections, collapse toggle, absence of the conversation list/model/New conversation controls, and absence of the old `Try saying` panel.

**Learned from:** Human-reported Chat screenshot issue, 2026-08-12.

## Rule: Agent switching is a real workspace boundary

**Defect class:** Information architecture / state isolation

**General principle:** A profile-like identity switcher must enumerate the available records, and switching must atomically change every record owned by that workspace rather than only changing the visible name.

**Project-specific risk:** Agent, Brain, conversations, Presences, planning, activity, and runtime settings must move together when the operator changes Agent.

**Project enforcement:** `OpenPresenceState.agents`, `activeAgentId`, and `agentWorkspaces` back `AgentSwitcher`; `createAdditionalAgent` and `selectAgent` snapshot and restore complete Agent-owned workspaces.

**Executable protection:** `tests/runtime.test.ts` verifies isolated messages and Presences; `tests/e2e/openpresence.spec.ts` creates Atlas, switches Jenny → Atlas → Jenny, and checks Brain/model state.

**Why QA missed it:** The previous audit verified a current-Agent control but did not create a second Agent and revisit the first workspace.

**Added:** 2026-08-12

## Rule: Agent configuration belongs in Brain, not Chat

**Defect class:** Information architecture / misplaced control

**General principle:** Agent-owned model/runtime choices belong with the Agent’s Brain; Chat should remain one persistent conversation surface.

**Project enforcement:** Brain owns provider-grouped model runtime choices and Chat exposes neither model selection nor conversation creation/history controls.

**Executable protection:** Playwright asserts model persistence in Brain and absence of the old Chat controls; the runtime suite verifies provider and quality selection.

**Added:** 2026-08-12

## Rule: Calendar scope comes from the sidebar and intents remain editable

**Defect class:** Information architecture / missing affordance

**General principle:** A Presence is selected once in the sidebar; Calendar must use that scope and expose direct edit actions for every standing intent.

**Project enforcement:** Calendar filters by `activePresenceId`, does not render a second Presence selector, writes new intents to the selected Presence, and offers Edit → Save changes for existing intents.

**Executable protection:** Playwright asserts both Calendar Presence controls are absent, creates an intent, edits it, and verifies the edited instruction persists; runtime tests verify the schedule and Presence remain aligned.

**Why QA missed it:** The earlier Calendar test only covered add and run, so a user could create an intent but had no way to correct it or understand which sidebar Presence owned it.

**Added:** 2026-08-12

## Rule: Summary counts must lead to an executable configuration path

**Defect class:** Product dead end / missing CTA

**General principle:** Brain summaries such as installed skills and provider setup state are only trustworthy when the operator can complete the next action from the same surface.

**Project enforcement:** Brain exposes Create skill, Set up OpenAI, and Set up Ollama actions; creation binds the skill to the current Agent, and provider setup records readiness without persisting a secret.

**Executable protection:** Playwright creates a skill and configures OpenAI; runtime tests verify enabled skill binding and local Ollama connection state.

**Why QA missed it:** The previous check asserted only summary copy (`installed`, `Needs setup`) and never followed the operator path to completion.

**Added:** 2026-08-12

## Rule: Scope must follow the Agent → Presence object model

**Defect class:** Information architecture / cross-Presence leakage

**General principle:** Agent-level cognition and conversations must remain stable while daily execution and activity stay scoped to the selected Presence. Agent management is an infrequent Agent-level task; Live and Calendar are daily Presence work.

**Project-specific risk:** The shell made Brain, Chat, Live, and Calendar appear to share one ambiguous scope; Chat history was a temporary right drawer; Calendar silently inherited the active Presence; and Live defaulted to an Agent-wide stream with a second Presence filter.

**Project enforcement:** Manage Agent owns Brain, runtime, skills, and provider settings; Chat remains one Agent-wide conversation; Calendar and Live follow the sidebar-selected Presence; Live does not expose an All Presences filter; Presence settings is reached from the Presence dropdown.

**Executable protection:** `tests/e2e/openpresence.spec.ts` and `tests/e2e/small-desktop.spec.ts` verify the revised navigation, explicit Calendar Presence selection, Brain file list, and constrained desktop shell.

**Why QA missed it:** Previous checks verified that Presence switching worked, but not that agent-level surfaces remained conceptually and visually stable after switching.

**Added:** 2026-08-12

## Rule: Product language must not expose implementation scaffolding

**Defect class:** Trust / product polish

**General principle:** Simulation, raw IDs, fake precision, and architecture terms belong in developer diagnostics, not the everyday operator workflow.

**Project-specific risk:** The UI showed “simulated locally,” external object IDs, “Outcome observed,” universal account-health percentages, and permanent architecture notes.

**Project enforcement:** Add Presence uses channel names without simulation labels; Live uses Healthy/Elevated state language; Mirror cards render social objects without raw IDs; execution copy uses user-facing outcomes; runtime status is not persistent page chrome.

**Executable protection:** Browser QA scans visible route text for simulation labels and percentage health output while exercising Add Presence, Live, and Presence settings.

**Added:** 2026-08-12

## Rule: Social Mirror onboarding must explain scope and connection use

**Defect class:** Integration onboarding / unclear state

**General principle:** A read-only integration surface must say what data it provides, which object owns it, and how an operator connects or disconnects it; a credential without its endpoint and lifecycle is not usable onboarding.

**Project-specific enforcement:** Live labels Social Mirror as inbound, read-only context for a connected Presence. Built-in simulated channels explain that no Bridge is required for local activity; custom channels explain that a Bridge is required. Bridge setup shows the Events and Execution endpoints, the Bearer-key usage, and that the key belongs to an external adapter rather than an Agent model. Disconnect revokes the credential, renders the Bridge as Disconnected, removes the Disconnect action, and rejects further authenticated requests.

**Executable protection:** `tests/e2e/openpresence.spec.ts` verifies the Bridge setup explanation and endpoints, ingests a Mirror event, disconnects the Bridge, verifies the disconnected UI, and asserts the revoked key receives HTTP 401.

**Why QA missed it:** The previous Bridge test verified that a key could authenticate API requests, but not that an operator understood what the key was for, where to send requests, or what a post-disconnect state looked like.

**Added:** 2026-08-12

## Rule: Cognition must not receive embodiment state

**Defect class:** Architecture / trust boundary

**General principle:** Operator-owned queues, approvals, retries, rate limits, and provider transport details must remain below the agent cognition boundary.

**Project enforcement:** `compilePresenceContext()` is the only Presence projection passed to cognition; `tests/runtime.test.ts` serializes it and rejects infrastructure-shaped fields.

**Executable protection:** `tests/runtime.test.ts` — “keeps operator embodiment out of the cognition-safe PresenceContext”.

**Apply when:** Adding model/runtime context, tools, provider bindings, or Presence settings.

**Added:** 2026-08-12

## Rule: Social Intent, Execution, and Outcome have separate lifecycles

**Defect class:** Data integrity / attribution

**General principle:** A social decision can exist without an execution, and an execution can be pending or expired without rewriting the decision.

**Project enforcement:** `lib/runtime.ts` creates separate records and `tests/runtime.test.ts` covers review approval plus expired-intent refusal.

**Executable protection:** `tests/runtime.test.ts` — review execution remains separate until approval; expired Social Intent cannot execute.

**Apply when:** Changing Calendar, Live, queue, review, simulated channel, or Growth attribution behavior.

**Added:** 2026-08-12

## Rule: Runtime status and decision summaries must be backed by state

**Defect class:** Fake UI / misleading runtime truth

**General principle:** A visible status, score, or decision summary must derive from the authoritative runtime record or be clearly labeled as an unavailable/illustrative state; polished sample copy is not product behavior.

**Project-specific risk:** Live previously rendered a fixed decision score and sample reply even when the selected Presence had no activity, and the Chat sidebar called installed/available bindings “used.”

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Why QA missed it:** Existing checks asserted that Live rendered and that the sidebar sections existed, but did not compare the rendered values against a blank persisted state.

**Project enforcement:** `LiveView` derives the Decision stream from selected-Presence `LiveEvent` records; `ContextSidebar` labels counts as available until invocation provenance exists.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts a fresh/run Calendar flow contains the real event and no fixed `0.94` or sample reply; runtime/browser audit checks blank Live state.

**Apply when:** Adding metrics, summaries, status badges, empty states, or sidebar provenance.

**Added:** 2026-08-12

## Rule: Operator execution modes require a reachable lifecycle

**Defect class:** Workflow completeness / execution control

**General principle:** A configuration mode is not functional until the operator can observe its resulting state and complete the supported lifecycle from the operational surface.

**Project-specific risk:** Review and Manual existed in the runtime union, but the Presence matrix omitted Manual and Live exposed no execute-approved or mark-posted path.

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Why QA missed it:** Settings coverage verified mode changes only by inspecting the matrix and did not run a mode through Live to its completion state.

**Project enforcement:** Presence Settings renders Off/Manual/Review/Auto; `ExecutionLedger` handles approval, approved execution, and manual external-reference completion; runtime keeps Social Intent, Execution, and Outcome separate.

**Executable protection:** `tests/e2e/openpresence.spec.ts` runs review and manual lifecycles on Chromium and mobile; `tests/runtime.test.ts` covers review separation and Bridge completion.

**Apply when:** Changing execution envelopes, review queues, manual relay, Bridge delivery, or Live activity.

**Added:** 2026-08-12

## Rule: Chat must reveal the newest exchange after state changes

**Defect class:** Chat UX / scroll state

**General principle:** A conversational surface should open at the latest exchange and keep the latest user/Agent response visible after new content arrives. The composer remains outside the transcript’s scroll container.

**Project-specific risk:** The transcript began at its historical top, leaving new Ollama responses below the fold despite the composer being visible.

**Learned from:** Human-reported ChatGPT-style scrolling request on 2026-08-12.

**Project enforcement:** `ContextChatView` scrolls a bottom sentinel into view whenever the active conversation or message count changes; `.chat-history` remains the sole scroll owner.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the transcript scroll gap, composer placement, and no page-level overflow for desktop and mobile.

**Apply when:** Changing conversation rendering, streaming/response updates, composer placement, or viewport sizing.

## Rule: Provider model choices must come from the provider’s capabilities

**Defect class:** AI runtime configuration / false availability

**General principle:** A model picker must represent what the configured provider can actually run. Friendly labels may be used for discovery, but the persisted runtime value must be the provider’s exact identifier; unsupported capability classes must not be presented as valid choices.

**Project-specific risk:** Brain exposed only three hard-coded Ollama names and omitted installed models. It also offered an image-only model to a text Chat surface.

**Learned from:** Human-reported Ollama model catalog screenshot on 2026-08-12.

**Project enforcement:** `/api/ollama/models` reads the connected Ollama catalog; Brain displays completion-capable models and persists their exact tags; Chat resolves friendly base names against that catalog before inference.

**Executable protection:** `tests/x-connection.test.ts` verifies catalog filtering and tag resolution; `tests/e2e/openpresence.spec.ts` verifies model discovery through the visible Brain workflow.

**Apply when:** Adding provider/model selectors, supporting new Ollama capabilities, or changing runtime dispatch.

## Rule: Local model selectors must resolve against the installed model catalog

**Defect class:** Local AI runtime / responsive interaction

**General principle:** A friendly model selector may use a stable base name, but the runtime must resolve it against the provider’s actual installed identifiers before inference. Provider-specific errors must identify the missing model and available next actions.

**Project-specific risk:** The selector sent `qwen2.5` while Ollama had `qwen2.5:7b-instruct`, producing repeated 404 responses. Chat also allowed the page itself to grow instead of reserving the viewport for the composer.

**Learned from:** Human-reported Ollama error and Chat layout screenshots on 2026-08-12.

**Project enforcement:** `lib/ai.ts` reads `/api/tags`, resolves exact or base-tag matches, and reports the installed catalog when no match exists. The Chat viewport uses a bounded workspace and gives scroll ownership to `.chat-history`.

**Executable protection:** `tests/x-connection.test.ts` verifies tag resolution; `tests/e2e/openpresence.spec.ts` verifies transcript-only scrolling, composer placement, and no document overflow at desktop and mobile sizes.

**Apply when:** Changing Ollama integration, model selectors, chat viewport sizing, or composer placement.

## Rule: Agent chat must use the configured runtime or explain why it cannot

**Defect class:** AI integration / false-success UX

**General principle:** A conversational surface must not return a canned success response when no model request occurred. The selected provider and model must be invoked server-side, while missing credentials or unreachable local runtimes must produce actionable guidance.

**Project-specific risk:** Chat displayed the selected Brain model but `sendMessage` returned a deterministic placeholder, making the app appear AI-enabled without using AI.

**Learned from:** Human-reported chat screenshot on 2026-08-12.

**Project enforcement:** `app/api/state/route.ts` sends `sendMessage` through `lib/ai.ts`; provider secrets are read only from the encrypted vault, and failures are written as explicit setup/runtime guidance.

**Executable protection:** `tests/x-connection.test.ts` asserts the provider request, authorization boundary, model mapping, generated reply, and missing-provider behavior; `tests/e2e/openpresence.spec.ts` asserts a browser-visible runtime reply.

**Apply when:** Changing Chat, Brain model selection, provider connections, or AI request adapters.

## Rule: Live Presence state must override stale conversation history

**Defect class:** Agent cognition / state synchronization

**General principle:** Changes made in Presence settings are durable runtime state, not merely UI state. The next Agent response must use the live snapshot at request time even if an older message says something different.

**Project-specific risk:** An Agent-owned Presence still answered that it was in Ghost mode because the transcript contained stale Ghost replies and the AI prompt did not define a precedence rule.

**Learned from:** Human-reported Ghost → Agent-owned change not being recognized in Chat on 2026-08-12.

**Project enforcement:** `app/api/state/route.ts` writes a visible acknowledgment for Presence setting changes, and `lib/ai.ts` includes an authoritative live Presence snapshot that explicitly overrides contradictory transcript history.

**Executable protection:** `tests/x-connection.test.ts` verifies both the visible mode-change acknowledgment and the authoritative mode sent to the provider.

**Apply when:** Changing Presence settings, Chat context construction, runtime prompt assembly, or persisted conversation state.

## Rule: Bridge mirror deletion and acknowledgement identity must be explicit

**Defect class:** Integration data integrity

**General principle:** External deletion events must archive the durable mirror object, and idempotent acknowledgements must compare the complete external identity, not just a convenient identifier.

**Project-specific risk:** Deleted Mirror objects were rewritten as active, and a conflicting ACK with the same external ID but a different type could be accepted.

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Project enforcement:** `ingestEvents` passes deletion state into `upsertObject`; `acknowledgeExecution` compares `externalRef.type` and `externalRef.id`.

**Executable protection:** `tests/runtime.test.ts` verifies archive behavior and rejects a conflicting type on a repeated acknowledgement.

**Apply when:** Changing Mirror ingestion, reconciliation, external references, or Bridge delivery acknowledgements.

**Added:** 2026-08-12

## Rule: API clients must validate response shape before parsing JSON

**Defect class:** Error handling / malformed response

**General principle:** A client must turn an unexpected content type or error payload into an actionable application error rather than leaking parser internals such as `Unexpected token '<'`.

**Project-specific risk:** The state and Bridge mutation helpers call `readJsonResponse` before reading payload fields; non-JSON responses now produce a bounded local-service error.

**Learned from:** Human-reported Settings/dropdown bug on 2026-08-12.

**Why QA missed it:** The happy path only exercised JSON API responses and did not force an HTML/error response.

**Project enforcement:** `app/page.tsx` uses `readJsonResponse` for state and Bridge mutations; route errors remain JSON responses with actionable error messages.

**Executable protection:** `tests/e2e/openpresence.spec.ts` exercises state and Bridge failure paths through the visible error surface; malformed API-response injection remains a recommended browser network test.

**Apply when:** Adding fetch calls, API routes, navigation fallbacks, or error/loading handling.

**Added:** 2026-08-12

## Rule: Social Mirror status must describe observed social reality, not connector readiness

**Defect class:** Social Mirror architecture / truthful state

**General principle:** A connected channel and an observed Mirror are different facts. After a successful reconciliation, the UI must show `Up to date` even when the observed world is empty; it must never leave the user at “waiting for observations” as if the Mirror were an on-demand input buffer.

**Project-specific risk:** Native X credentials could be connected while no Mirror objects, freshness, counts, or next observation were persisted. Activity and the Mirror panel therefore implied that nothing had been observed until an operator ran a Pulse.

**Learned from:** Human-reported Social Mirror review on 2026-08-13 and the attached OpenPresence architecture guidance.

**Project enforcement:** Native X reconciliation runs when credentials are saved and through the local connector observer. It persists Mirror objects, public footing, observation health, freshness, counts, and the next observation time without invoking cognition. Pulse consumes that Mirror; it does not own channel reads.

**Executable protection:** `tests/x-connection.test.ts` covers the native connection path and mock reconciliation; `tests/e2e/x-connection.spec.ts` asserts the connected empty Mirror is presented as up to date and that the old waiting copy is absent.

**Apply when:** Changing native X reads, Bridge reconciliation, Mirror panels, Activity status, connector health, or Pulse behavior.

**Added:** 2026-08-13

## Rule: Presence Settings must introduce identity before destination

**Defect class:** Settings information hierarchy / responsive layout

**General principle:** Users should establish who the Presence is before deciding where it appears. Product hierarchy should reflect `User → Agent → Presence`, then channel and execution configuration.

**Project-specific risk:** Showing Channel & environment before Identity made the user choose a route before understanding the Presence identity and pushed the editable name and Agent-owned/Ghost choice below the fold.

**Project enforcement:** `.presence-settings-page` orders Identity and Ghost profile before `.channel-settings-card`, with the execution envelope after both.

**Executable protection:** `tests/e2e/openpresence.spec.ts` compares the rendered bounding boxes of `.identity-card` and `.channel-settings-card` on Chromium and Pixel 5, then exercises the route controls.

**Apply when:** Reordering Presence Settings, adding Presence identity fields, or changing the channel/environment configuration surface.

**Added:** 2026-08-13

## Rule: Presence surfaces must not borrow Agent identity or handles

**Defect class:** Product hierarchy / Presence naming

**General principle:** A Presence feature should speak about the selected social incarnation, while Agent identity belongs in Agent workspace surfaces. Handles are channel/account identity, not the default label for Presence operations.

**Project-specific risk:** Activity and Calendar mixed `Jenny`, `Genny`, and `@jenny_ai`, making it unclear which identity the user was configuring and exposing a handle without a clear edit path.

**Project enforcement:** Live Activity and Calendar derive copy from the selected Presence name; Activity omits the Agent management link; channel connection screens retain handles only where X authentication requires account identity.

**Executable protection:** `tests/e2e/openpresence.spec.ts` renames the Presence to Genny and verifies Activity/Calendar copy, absence of `@jenny_ai`, and absence of “Manage Jenny” on Chromium and Pixel 5. X connection suites protect the separate connector identity flow.

**Apply when:** Changing Activity, Calendar, Social Mirror summaries, Presence navigation, or channel connection identity copy.

**Added:** 2026-08-13

## Rule: Public Self must remain separate from Agent identity and implementation

**Defect class:** Identity boundary / privacy / social cognition

**General principle:** The Agent is the private mind, the Presence Public Self is who speaks here, and implementation is not social identity.

**Project-specific risk:** A Ghost could answer as the private Agent or volunteer provider, model, prompt, credential, or infrastructure details simply because the runtime knew them.

**Project enforcement:** `Presence.publicSelf` stores Presence-scoped posture and approved facts; `PRESENCE.md` and the AI context describe that boundary; Ghost publication drafts are held for review when they cross it.

**Executable protection:** `tests/identity-boundary.test.ts` covers default postures, persistence, approved facts, and Ghost review gating. `tests/e2e/openpresence.spec.ts` covers settings persistence on Chromium and Pixel 5.

**Apply when:** Changing Presence identity, Ghost behavior, public disclosure, provider/model context, social prompts, or publication review.

**Added:** 2026-08-13

## Rule: Calendar is verified public history; Schedule is future permission

**Defect class:** Product-model ambiguity / false historical record

**General principle:** A historical calendar must describe what entered the public world, not what an Agent intended, considered, drafted, or was asked to consider later. Future Standing Intents belong on a separately named Schedule surface.

**Project-specific risk:** The old Calendar mixed future permission with public history, making drafts and planned activity look like publications and forcing the operator to infer behavioral rhythm from an intent list.

**Project enforcement:** `derivePublicHistory` admits only public Mirror objects authored by the selected Presence or successful Executions with an external reference. `app/page.tsx` renders that projection in Calendar with Week/Month/Day views and filters; the former `CalendarView` is now `ScheduleView`, and all Standing Intent CRUD/evaluation remains there.

**Executable protection:** `tests/runtime.test.ts` verifies pending/private records are excluded while a successful externally evidenced publication is included. `tests/e2e/calendar-history.spec.ts` verifies the fresh Calendar empty state, Week/Month/Day browsing, and the separate Schedule surface; `tests/e2e/calendar-week.spec.ts` and `tests/e2e/openpresence.spec.ts` exercise Schedule intent creation, editing, and evaluation.

**Apply when:** Changing Calendar, Schedule, Standing Intent, publication history, Social Mirror projections, outcome metrics, or Presence navigation.

**Added:** 2026-08-13
## Rule: Browser QA must verify the active local build and origin

**Defect class:** Stale browser bundle / multiple local development servers

**General principle:** A user-facing browser feature is not verified by API success or a headless run alone. The test must exercise the same browser surface the user is using, confirm the active origin and current client bundle, and prove the user journey from navigation to persisted result.

**Incident:** Chrome was pointed at an older local app tab on `localhost:3001`, which still rendered the pre-Watching navigation while the current implementation was available on another local server. The current API accepted the Watch mutation, but the stale browser could not expose the feature.

**Project enforcement:** Watching QA starts one known local server, opens a fresh Chrome tab, confirms the `Watching` navigation item, and completes create → reload → remove. When multiple local servers exist, record the exact origin under test and do not treat a different port as equivalent evidence.

**Executable protection:** `tests/e2e/watching.spec.ts` covers the complete creator persistence/removal journey and topic/opportunity boundary on Chromium and Pixel 5; Chrome acceptance was independently rerun on `localhost:3103` with no console errors and 200 responses through load, create, and delete.

**Apply when:** Adding or changing user-facing navigation, local dev-server routing, browser bundles, cache-sensitive UI, or any feature reported as missing or broken in a real browser.

**Added:** 2026-08-13

## Rule: Watch activation and observation readiness must use separate language

**Defect class:** Watch lifecycle copy / implementation-state leakage

**General principle:** A configured capability and the data it has produced are different states. User-facing status must say whether the capability is active, what evidence is currently available, what it is waiting for, and whether the operator needs to act; never expose an internal “not started” metric as if it were a pending user action.

**Incident:** A green `Watching` pill appeared beside `Performance baseline · Not started`, making an already-started Watch look both active and inactive. “Performance baseline” also implied a metric workflow that the operator could not start or understand.

**Project enforcement:** `WatchingView` renders `Active watch` plus `Waiting for first observation` for automatic creator Watches, and `Manual source` plus `Waiting for source material` for topic/opportunity Watches. The page explains that starting saves the attention instruction and observations appear only when a source supplies evidence; the internal baseline field is not exposed.

**Executable protection:** `tests/e2e/watching.spec.ts` asserts both lifecycle messages and asserts that `Performance baseline`/`Not started` are absent on Chromium and Pixel 5.

**Apply when:** Changing Watching, observation status, source readiness, baselines, metrics, connected-source language, or any UI that combines activation state with collected evidence.

**Added:** 2026-08-14

## Rule: Ghost identity protection must allow public subject matter

**Defect class:** Ghost identity boundary / false-positive content rejection

**General principle:** Identity disclosure protection must block private runtime details without treating ordinary public subject matter as implementation leakage.

**Incident:** An Assignment about building the best AI model repeatedly generated valid posts, but the Ghost filter treated the generic word `model` as forbidden, rewrote every candidate to `no_op`, and left the Assignment at 0/4 with no execution.

**Project enforcement:** `identityLeakageReason` blocks specific provider, exact-model, and runtime-detail phrases, while allowing ordinary discussion of an AI model as the public topic. Assignment candidates must still reach `formSandboxIntent` and verified Sandbox delivery.

**Executable protection:** `tests/runtime.test.ts` covers both permitted public subject matter and blocked private runtime disclosure; the Assignment rehearsal E2E coverage verifies the delegated flow remains usable.

**Apply when:** Changing Ghost boundaries, Assignment candidate QA, public subject-matter posts, or model/provider disclosure rules.

**Added:** 2026-08-13

## Assignment schedule metadata must survive the review handoff

**Incident:** The Schedule Assignment form accepted a day, time, and exact/flexible timing choice, but the `createAssignment` operation discarded those fields. The resulting row falsely collapsed a near-term Assignment to `Once`, leaving the operator unable to verify when it was intended to run.

**Product boundary:** Assignment timing is an operator-provided execution window, not a command to publish regardless of context. The Agent still owns how it fulfills the outcome, and Sandbox verification remains the only source of progress.

**Executable protection:** `Assignment.schedule` is carried through the typed operation, runtime compiler, state route, and Schedule row; the runtime test asserts that exact timing remains attached to the created Assignment.

## Rule: Assignment candidates must be distinct and delivery must be idempotent

**Defect class:** Repeated publication / duplicate execution

**General principle:** An outcome Assignment is not complete when the system has emitted the same draft repeatedly. Candidate quality must reject already-verified text, and retrying a succeeded execution must not create another public object or count progress twice.

**Project enforcement:** Sandbox Assignment cycles compare normalized drafts against that Assignment's verified Mirror publications; `deliverSandboxExecution` returns the existing state for a succeeded execution and refuses statuses that are not ready for delivery.

**Executable protection:** `tests/ai.test.ts` covers structured decision parsing; `tests/sandbox.test.ts` covers exactly-once delivery and asset lineage; `tests/e2e/playground-rehearsal.spec.ts` asserts five distinct delivered posts.

**Apply when:** Changing Assignment generation, retries, execution claiming, delivery, progress counters, or deterministic AI fixtures.

## Rule: Scheduled Assignments belong on the Week calendar with Standing Intents

**Defect class:** Schedule visibility / operator discoverability

**General principle:** A scheduled Assignment is a delegated outcome with a time window. It should be visible in the same weekly planning surface as Standing Intents, while remaining visually distinct because a schedule grants attention and does not guarantee publication.

**Project enforcement:** The Week calendar projects scheduled Assignments, includes the full 00:00–23:00 local-time range, labels them as Assignments, and provides a direct Run/Retry in Playground action. The list remains the detail and cancellation surface.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` asserts a 23:35 Assignment appears as a calendar card and retains its status/timing.

**Apply when:** Changing Schedule, Assignment timing, calendar projection, late-night schedules, or operator actions for draft/blocked work.

## Rule: Sandbox media must survive decision → publication → Mirror → Feed

**Defect class:** Multimodal rehearsal false positive

**General principle:** An asset claim is only useful when the simulated publication stores its asset provenance and the Feed renders the resulting image, chart, GIF, video, or link instead of dropping it at an intermediate layer.

**Project enforcement:** Social decisions carry supported asset metadata; local mock rehearsals use deterministic Sandbox fixtures; publication asset IDs become Mirror asset references; Feed renders local and source URLs without changing the live connector boundary.

**Executable protection:** `tests/sandbox.test.ts` verifies asset lineage; `tests/e2e/playground-rehearsal.spec.ts` verifies the requested five-media set in Feed.

**Apply when:** Changing social decision schemas, asset uploads, Sandbox fixtures, publication storage, Social Mirror projection, or Feed rendering.

## Rule: Assignment quantity must equal Feed quantity, and replies must use current inbound context

**Defect class:** Partial Assignment completion / stale social context

**General principle:** An Assignment that asks for N original publications must either deliver N distinct verified publications or remain visibly incomplete; a reply decision must be grounded in the newest inbound object, not whichever matching phrase appeared earlier in the thread.

**Project enforcement:** Sandbox Assignment work derives a bounded attempt budget from remaining quantity and rejects only verified duplicate drafts. Deterministic reply rehearsal extracts the newest inbound object before selecting a context fixture. Feed is the acceptance surface for successful original publications and includes each verified Sandbox publication exactly once.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` asserts 10/10 delivered and exactly 10 Feed items; `tests/ai.test.ts` asserts distinct context-specific reply decisions; Chrome QA verifies 10 unique replies in the rendered rehearsal.

**Apply when:** Changing Assignment quantity parsing, candidate retry budgets, deterministic AI fixtures, Social Mirror context assembly, or Feed projections.

## Rule: Assignment quantities must ignore incidental numbers

**Defect class:** Quantity parsing / destructive overproduction

**General principle:** Natural-language quantity extraction must prioritize explicit quantity phrases or numbers attached to the requested deliverable, and must not interpret dates, years, URLs, or QA markers as the requested count.

**Project enforcement:** `assignmentQuantity` prioritizes modifiers such as `exactly 1`, then recognizes numbers followed by a bounded deliverable phrase such as `10 original X posts`; review must show the same quantity before rehearsal starts.

**Executable protection:** `tests/runtime.test.ts` asserts that `QA-ONE-2026-08-14 ... exactly 1 ...` and `QA-TEN-2026-08-14 ... exactly 10 ...` compile to 1 and 10 respectively.

**Apply when:** Changing Assignment instruction parsing, review-card quantities, schedule Assignment compilation, or QA-marker/test instructions.

## Rule: Publishing responsibility must remain a visible Agent plan

**Defect class:** Hidden intention / quota-to-post confusion

**General principle:** A non-scheduled Publishing Initiative is an operator-owned expectation that the Agent must turn into a reviewable, Presence-scoped working plan. It is not a list of prewritten posts, a forced quota, or an execution bypass.

**Project enforcement:** Publishing plans persist by Presence and environment, use bounded flexible research/origination/reassessment windows, derive verified progress only from Social Mirror history, and supersede prior revisions on explicit replanning. Schedule and Activity render the same projection; turning the initiative off supersedes the plan.

**Executable protection:** `tests/publishing-plan.test.ts` covers persistence, scoping, revision supersession, and the absence of publications/executions. Browser acceptance verifies Settings activation, Schedule windows, Activity projection, and explicit replanning in an isolated Sandbox database.

**Apply when:** Changing Publishing Initiative settings, plan generation/replanning, Schedule or Activity projections, publication pacing, or any path that could imply a plan guarantees public expression.

## Rule: Schedule must not duplicate the Publishing Plan surface

**Incident:** Schedule rendered a full “Genny’s publishing plan” card above the visual calendar after Publishing Plan windows had already been incorporated into the calendar layer, creating two competing plan surfaces.

**General principle:** When a schedule has a canonical spatial/calendar projection, do not reintroduce a parallel summary surface that duplicates the same future work. Keep the calendar as the operator’s plan view and preserve controls/details only where they add distinct value.

**Project enforcement:** `ScheduleView` renders Publishing Plan windows through `WeekCalendar` and its `Publishing plan` layer; it must not render an `Agent publishing plan` card or duplicate plan-window diagnostics in Schedule.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` activates and replans a Publishing Initiative, verifies the Calendar layers and visual schedule remain present, and asserts the `Agent publishing plan` region is absent on Chromium and mobile.

**Apply when:** Changing Schedule layout, Publishing Plan projections, calendar layers, or any summary card that could duplicate future attention.

## Rule: Publishing Plan progress requires original Social Mirror lineage

**Defect class:** False end-to-end verification / reply counted as original

**General principle:** A visible Publishing Plan window is durable permission to consider original expression, not a post. Progress is valid only after an original Social Intent with Publishing Initiative origin crosses the Execution Envelope, succeeds in the authorized environment, and is verified as an original object by the Social Mirror. Replies, NO_OP, review-waiting, failed delivery, and candidate rejection must remain separately inspectable.

**Project enforcement:** Sandbox virtual-time advancement wakes due plan windows, records bounded work stages, carries `{ planId, planRevision, planWindowId }` through Social Intent, Publication, and Public History provenance, and increments `verifiedOriginals` only from Social Mirror-backed `post` history. Plan diagnostics expose the latest structured outcome and next consideration without exposing hidden model reasoning.

**Executable protection:** `tests/publishing-plan.test.ts` proves the full 9-stage publish path, truthful NO_OP with a later consideration, inbound reply exclusion, and review without progress. `tests/e2e/playground-rehearsal.spec.ts` verifies the operator-facing “Why no original yet?” and next-consideration diagnostics. The isolated E2E database can be selected with `OPENPRESENCE_E2E_DB_PATH` to avoid parallel-session contamination.

**Apply when:** Changing Publishing Plan wake logic, virtual-time workers, Social Intent/Publication provenance, Mirror-to-Feed projection, progress counters, review states, or deterministic Sandbox fixtures.

## Rule: Browser verification must prove the resolved database and pre-reset WAL state

**Defect class:** Parallel-runtime database drift / incomplete recovery

**General principle:** A populated database file is not evidence that the browser is reading it. Every user-facing data verification must prove the server-resolved `OPENPRESENCE_DB_PATH`, the agent/presence scope, and the relevant records through the running API and UI. SQLite recovery must replay the WAL through the last committed pre-reset frame; inspecting only the main file can omit the newest People, Watchlist, Mirror, and publication records.

**Incident:** The Genny UI on port 3006 was reading `data/three-agents-experiment-v4.db` while the recovered People and X history belonged to `data/openpresence.db`. The default database had then been reset to an empty state. The main-file snapshot recovered most history, but the exact final X exchange—including “A backup flounder credential…”—was only present in the pre-reset WAL commit.

**Project enforcement:** Recovery and QA now compare the running API against the intended database path, preserve the original database and WAL, reconstruct the last pre-reset commit into a separate copy, and verify People, Watching, Activity, Feed, and relationship evidence in the browser. Restored inspection runs in test/mock mode so background observation cannot mutate the recovery copy while it is being reviewed.

**Executable protection:** ⚠️ Missing — recommended: add a startup/health assertion that exposes the resolved database identity only in development, plus an isolated Chromium regression that seeds a known Person, Watch, Mirror thread, and publication and asserts those records through the running UI.

**Apply when:** Changing database selection, Next.js startup scripts, parallel dev servers, SQLite WAL handling, recovery tooling, state hydration, or browser acceptance fixtures.

**Added:** 2026-08-15

## Rule: Feed items must display a concise channel tag

**Defect class:** Mixed-channel or mixed-environment provenance ambiguity

**General principle:** A Feed must never merge channel or environment histories. The active Presence selects the only channel/environment that may appear; each visible item also identifies its source surface concisely so a user can verify the boundary.

**Project enforcement:** Feed and calendar projections match both the active Presence channel and environment. Timeline and calendar history cards render `X.com` for live X history and `Sandbox` for sandbox history from the item’s persisted provenance. The UI does not use the ambiguous `Live` label.

**Executable protection:** `tests/runtime.test.ts` asserts that live and Sandbox Presence projections exclude the other environment. Browser verification asserts that restored Genny’s X Feed contains only `X.com` tags, with no Sandbox records. Recommended follow-up: add an isolated E2E fixture that switches the active Presence to Sandbox and asserts only Sandbox history appears.

**Apply when:** Changing Feed/history projections, Presence/channel selection, Social Mirror environment metadata, or any UI that presents public history across environments.

**Added:** 2026-08-15

## Rule: Native X delivery failures must not masquerade as connector failures

**Defect class:** One rejected action disables unrelated capabilities

**General principle:** A failed post, reply, follow, or other public act is evidence about that delivery attempt unless the provider explicitly proves an account, credential, or connector failure. It must not make unrelated API observation or write capabilities appear unavailable.

**Project enforcement:** Generic action-level X rejections such as `X rejected this action: You are not permitted to perform this action.` are retained as `deliveryError` while the native connection remains eligible for capability projection. Explicit credential, identity, or write-permission failures still quarantine the connector. Activity remains the source of truth for the failed execution.

**Executable protection:** `tests/runtime.test.ts` verifies the generic rejection keeps the native connection connected and leaves post, reply, and follow available; `tests/growth-runtime.test.ts` verifies the capability manifest keeps Native X primary for evidence and actions after one rejected delivery.

**Apply when:** Changing native X delivery, capability derivation, connector health, execution failure handling, or Settings availability copy.

**Added:** 2026-08-17

## Rule: Ambiguous X delivery must remain pending, and exhausted credits must stop verification retries

**Defect class:** False failure totals / duplicate-risk retry storm

**General principle:** A browser or connector that cannot prove the public result has not proved non-delivery. Preserve the execution as verification-pending until an exact account + parent + text lookup succeeds or an operator explicitly reviews it. Provider quota failures are infrastructure state, not evidence that a reply is missing; stop automatic verification and retry loops until access is restored.

**Project enforcement:** Legacy `RESULT_NOT_VERIFIED` X replies are migrated in `normalizeState` to `verification-pending` without deleting their execution or inventing success. X API credit errors use a non-retryable `X_API_CREDITS_EXHAUSTED` state, reconciliation stops at the first quota error, and retry eligibility excludes reviewed history plus account, provenance, permission, policy, duplicate, and quota failures.

**Executable protection:** `tests/runtime.test.ts` asserts the legacy ambiguous-status migration and preserves explicitly reviewed failures. Bridge verification and reconciliation code paths assert the quota circuit breaker and exact-match-only success boundary.

**Apply when:** Changing X delivery, Chrome fallback verification, failure counts, retry controls, provider quota handling, or any UI that could imply a reply was sent without authoritative public evidence.

**Added:** 2026-08-18
## Rule: Entitlement failures must be time-scoped

**Defect class:** Historical provider-quota error presented as a current outage

**General principle:** A provider entitlement or quota failure describes the request that received it, not necessarily the provider's current account state. Once the underlying entitlement changes, the product must distinguish historical failures from a live outage and must not replay stale public actions without a fresh, duplicate-safe decision.

**Project-specific enforcement:** Activity's `deliveryFailureExplanation` labels reviewed X credit failures as historical, explains that the current balance does not rewrite the old result, and directs the operator to create a fresh action. Reviewed failures remain outside the send queue; only verified X outcomes or an explicitly safe retry may change delivery state.

**Executable protection:** ⚠️ Missing — recommended: add a focused Activity rendering test that seeds a reviewed `no API credits` execution, verifies the historical wording, and asserts no retry control is offered for the expired decision.

**Apply when:** Changing X entitlement handling, Activity failure explanations, reviewed-failure controls, reconciliation, or retry behavior.

## Rule: Usage scope controls must use the product field treatment

**Defect class:** Native browser control breaks visual hierarchy

**General principle:** A scope control is part of the product’s operator surface, not browser chrome. It must preserve native select semantics while matching the surrounding control family, including readable focus, a visible affordance, and a bounded mobile width.

**Project enforcement:** `UsageView` keeps a semantic `select` for Agent scope, wraps it with the Usage control treatment, and uses a product chevron instead of the browser default. The control remains constrained to the Usage header on narrow layouts.

**Executable protection:** Browser verification asserts the `Usage Agent scope` combobox remains present with `All Agents` selected and that the styled wrapper is rendered; the desktop screenshot is checked for alignment with the period control and the narrow-layout rule is reviewed with the same selector.

**Apply when:** Adding or changing Usage filters, period selectors, Agent/Presence scope controls, or any native form control placed beside product-styled actions.

**Added:** 2026-08-18
## Rule: Agent-authored attention must project every verified reaction

**Defect class:** Verified native/Bridge reaction missing from Feed and Calendar

**General principle:** A successful like, repost, or quote is public history only when the provider/Bridge has verified it and the runtime records a Social Mirror object tied to the originating execution. Execution status alone is not visible proof; generic observation scans must not overwrite authored reaction metadata.

**Project enforcement:** Chrome Bridge capabilities advertise `x.quote`, `x.repost`, and `x.like`; the X adapter verifies the visible control state before acknowledgement; native success repair and the Bridge observation path create or preserve authored reaction mirrors with `originExecutionId` and `actorPresenceId`. Feed and Calendar derive their Likes/Quotes/Reposts filters from those verified mirrors.

**Executable protection:** Runtime tests cover reaction projection, legacy native-like migration, narrow Bridge capability migration, and the full Feed/Calendar filter contract. Extension syntax checks and browser smoke must confirm the visible `Likes` metric/filter and a reaction source link.

**Apply when:** Changing Agent-authored attention, X reaction execution, Bridge capability negotiation, Social Mirror ingestion, Feed history, Calendar history, or authored-outcome reconciliation.

**Added:** 2026-08-18

## Rule: Workspace contention is not connector failure

**Defect class:** Multi-tab optimistic-concurrency conflict pauses unrelated Growth work

**General principle:** A stale workspace revision is a coordination result, not evidence that X, the Bridge, or the Presence body is unhealthy. It must remain a refreshable conflict and must not create a connector recovery incident.

**Project-specific enforcement:** `syncNativeX` excludes `WorkspaceConflictError` from native-X failure telemetry, resolves the legacy false-positive incident on the next health read, and leaves genuine provider failures on the normal recovery ladder.

**Executable protection:** `tests/x-connection.test.ts` asserts the conflict classifier keeps workspace contention out of native-X incident handling.

**Apply when:** Changing state persistence, multi-tab coordination, runtime health, Native X sync, Bridge heartbeats, or Growth scheduling.

**Added:** 2026-08-21

## Rule: The X API and browser are peer execution tools

**Defect class:** Channel identity and per-action tool selection

**General principle:** A Presence's channel is its social world; the X API and signed-in browser are peer execution tools for that world. Enabling browser access does not change the channel. The Agent may select either tool per action based on task fit, speed, browser-session capabilities, and known health; when it has no preference, the runtime selects an available route. Durable per-action route evidence prevents repeated probes after a known billing, credential, or capability failure. Provider 429s remain a hard wait boundary: the browser must never evade an X rate limit. Uncertain writes must not be replayed through the other tool until reconciliation proves the first write did not happen.

**Project enforcement:** X Presence identity remains X regardless of the selected tool. `setPresenceBrowserAccess` preserves that channel identity and stores action-scoped route evidence under the legacy `learnedFallbacks` field. `formChatPostIntent`, `formXReplyIntent`, `formXActionIntent`, and the execution router carry an Agent's route preference into the durable intent and selected writer; known API health and availability are shared by planning and delivery. When an execution is waiting for a connector, verified Browser availability must re-evaluate and bind that same execution only if the shared route selector chooses that Browser; preserve its original expiry and recheck the current Presence handle at claim and acknowledgement. Browser access is restricted to the verified Presence account, and `BridgeManager` remains for genuinely external/custom-channel bridges. Model-provider API health is a separate cognition dependency and must not be “recovered” by selecting an X tool.

**Executable protection:** Route coverage should prove both route preferences, the default API route when healthy, browser selection when the API is known unavailable, use of the API when a preferred browser is unavailable, the no-browser-around-429 invariant, and no duplicate write during uncertain delivery. `tests/bridge-retry.test.ts` also covers re-binding waiting work after account verification and rejection after the expected handle changes. Browser acceptance should verify both tools are presented as X tools while X remains the Presence's channel, and that a custom channel such as Skool remains connected through its external Bridge.

Browser-read regression coverage must also claim a read, simulate an extension service-worker restart by expiring its short lease, reclaim the same durable read with a new lease token, reject completion from the stale worker, renew the active lease, and accept only the current worker's account-verified result. The extension must reuse a matching loaded X page rather than reloading it on recovery. Reads stay bounded and read-only; this recovery path must not create or replay a public write.

**Apply when:** Changing Presence access, channel definitions, native connectors, browser/extension tooling, Bridge management, execution routing, route learning, or any UI that labels a connector as a channel.

**Added:** 2026-08-21

## Rule: Runtime scheduling owns observation, and successful reconciliation must survive Pulse

**Defect class:** Client write storm / false-success observation / stale Social Mirror

**General principle:** The browser is an operator surface, not a second scheduler. Durable runtime wakes must own Native observation; a successful read must be carried into the following Pulse and persisted before the run is marked successful. Deterministic provider configuration and quota failures must stop retrying and remain actionable.

**Project-specific enforcement:** The client no longer posts `syncNativeX` on every due render; the temporal engine records both scheduler and runtime heartbeats, requeues ordinary stale work after bounded recovery cooldowns, and retires legacy recursive stale-recovery runs. `runAutonomousObservation` passes the reconciled state into Pulse, refuses to mark an observation successful when the connector returned an error, and classifies missing model credentials as operator-required rather than transient.

**Executable protection:** `tests/operational-autonomy.test.ts` asserts missing model credentials are non-retryable and actionable. Browser smoke must verify Feed exposes `Operating health: Needs You` plus the real X entitlement/configuration reason, `Social Mirror status` reflects the latest observation, and a read-only browser session generates no repeated `syncNativeX` POST storm.

**Apply when:** Changing temporal scheduling, Native observation, Pulse state flow, browser polling, provider/entitlement recovery, runtime heartbeats, or any Feed/health status projection.

**Added:** 2026-08-24

## Rule: Watchlist removal must survive workspace contention

**Defect class:** Operator deletion lost during a concurrent workspace write

**General principle:** A destructive operator action must be based on the latest durable workspace revision and must not silently reappear after a conflict or refresh. Concurrent runtime activity is expected; it must not make a successful removal look ineffective.

**Project-specific enforcement:** `WatchingView` refreshes the current workspace before `deleteWatch`, disables competing Watchlist removals while one is pending, and refreshes/retries once if the response still contains the deleted Watch. The existing `watching.spec.ts` removal journey remains the basic regression check.

**Executable protection:** Browser QA must remove a Watchlist item while the live runtime is active, confirm the item disappears from the rendered list, reload the page, and confirm it remains absent. Bulk cleanup must use sequential deletion rather than concurrent requests.

**Apply when:** Changing Watchlist CRUD, workspace revision handling, runtime heartbeat/worker writes, or Presence attention persistence.

**Added:** 2026-08-24

## Rule: A connection warning must offer recovery in place

**Defect class:** Actionable Activity warning with no immediate recovery CTA

**General principle:** When an operator-facing status identifies a recoverable connection or identity problem, the warning must offer the smallest safe recovery action in that same surface. Navigation to settings may remain as a fallback, but it must not be the only path.

**Project-specific enforcement:** Activity’s signed-in-account notice exposes `Check again`, which requests the controlled Chrome session and refreshes the Activity projection, while `Switch X account` remains available for changing the signed-in identity. The check button has a busy state and must not duplicate the request.

**Executable protection:** Browser Activity QA must click `Check again`, assert the loading transition, confirm the Activity surface remains in place, and verify that the account warning is re-evaluated after the bridge status refresh. Mobile QA must keep both recovery actions reachable without horizontal overflow.

**Apply when:** Changing connection warnings, Bridge identity status, Activity recovery actions, browser capability health, or Presence connection settings.

**Added:** 2026-08-24

## Rule: Unknown target language gets a bounded confirmation path

**Defect class:** A delivery card reports that English was not confirmed but leaves the operator to infer what to do or change the wrong setting.

**General principle:** When a safety check is uncertain rather than disproven, the product should perform the narrowest fresh verification available and name that action plainly. Never weaken the configured language policy or silently treat an unverified target as safe.

**Project-specific enforcement:** A `TARGET_LANGUAGE_MISMATCH` Activity failure exposes `Confirm English & retry`. The existing retry handler refreshes the exact X target before re-queuing the same action; it must not create a new Social Intent, change the Presence language, or bypass final target-language validation.

**Executable protection:** `tests/language-policy.test.ts` covers live English targets whose provider omits language metadata. Activity browser QA must exercise a target-language failure and assert the explicit confirmation action, its busy state, and that the existing target/action identity is preserved.

**Apply when:** Changing target-language validation, X target hydration, retry behavior, Activity failure cards, or language-policy recovery.

**Added:** 2026-08-29

## Rule: Recovered dependencies must resume the exact durable responsibility

**Defect class:** Credential-ready UI with a permanently blocked Assignment

**General principle:** A dependency becoming healthy is not completion; the runtime must re-evaluate the durable responsibility that failed because of that dependency. Worker terminal state must reflect the actual outcome, and verified progress must come only from external reconciliation.

**Project-specific enforcement:** `/api/state` re-reads provider credentials and current live execution readiness, resumes only credential/connector-auth blocks, dispatches a bounded live Assignment worker, and marks live runs `published` only after an assignment-completed outcome. Candidate rejection, delivery failure, policy failure, and operator blocks remain visible and non-successful.

**Executable protection:** `tests/x-connection.test.ts` covers encrypted provider storage and live runtime provider use; `tests/assignment-runtime.test.ts` covers durable requeue after a blocked Assignment. Live verification must assert the sequence `queued → real external reference → Social Mirror object → progress verified` and must assert that a stale blocked Assignment is not treated as healthy.

**Apply when:** Changing provider credential setup, connector readiness, Assignment workers, state reads, live scheduling, recovery, Activity status, or Social Mirror reconciliation.

**Added:** 2026-08-24

## Rule: The primary Activity card must describe the outward action

**Defect class:** Internal runtime state presented as operator progress

**General principle:** The primary Activity card must tell the operator what the Presence is doing, what content or target is involved, what stage it is in, and what happens next. Queue labels, generic objectives, stale drafts, and verification ratios belong in progressive details; they must not imply that a historical artifact is current.

**Project-specific enforcement:** The compact `data-testid="right-now-status"` card derives its action, topic, preview, status, and next step from an in-flight or recently completed assignment artifact. Historical executions and publications cannot move the visible state back to Draft & Deliver. Detailed assignment stages remain available behind the details control.

**Executable protection:** Browser Activity QA must exercise draft-ready, sending, confirmation-pending, confirmed, and blocked states. For each state, assert that the primary card has a truthful outward-action label and next step, and that stale draft text or internal-only assignment labels do not appear as current.

**Apply when:** Changing Activity, Assignment progress, execution/publication reconciliation, current-work selection, or operator-facing status copy.

**Added:** 2026-08-24

## Rule: Activity must separate the current attempt from the ongoing assignment

**Defect class:** Durable Assignment state presented as the current social act

**General principle:** Activity should explain the social act happening now and its progression. Schedule should own the durable responsibility and cumulative progress. Technical Audit should own internal observation, judgment, execution, and verification detail. These layers must not be merged into one primary Activity card.

**Project-specific enforcement:** The compact `data-testid="right-now-status"` card uses human-readable stages (`Choosing → Writing → Publishing → Confirmed`), keeps the ongoing goal and published count compact, and links to Schedule. Ordinary Assignment audit boxes, queued-responsibility language, cumulative source counts, and Social Mirror wording are not rendered as the primary Activity state.

**Executable protection:** `tests/e2e/activity-delivery-trace.spec.ts` asserts the choosing copy, next step, four-stage progression, ongoing-goal summary, Schedule link, and absence of the ordinary Assignment banner and `OBSERVE & SOURCE` detail boxes.

**Apply when:** Changing Activity current-work selection, Assignment progress presentation, Schedule links, technical detail disclosure, or account/delivery warnings.

**Added:** 2026-08-24

## Rule: Autonomous social acts must cross the connector boundary

**Defect class:** Social decision persisted without external delivery

**General principle:** A model-selected action is not customer-visible progress. Every autonomous like, repost, quote, follow, or reply must be handed to an authorized connector before the attention episode is closed, and the outcome must remain distinguishable as queued, failed, or externally verified.

**Project-specific enforcement:** The autonomy worker now sends newly formed native executions through the shared `deliverNativeExecutions` helper before summarizing the episode. Bridge-routed work remains dependent on a fresh verified Bridge identity and active claim polling; an online but unverified Chrome session is surfaced as a recovery blocker rather than counted as delivery.

**Executable protection:** `tests/native-execution-delivery.test.ts` starts with a queued auto-like and asserts a verified execution/outcome after the native handoff. Runtime QA must also inspect the live execution mix for zero-attempt `INTENT_EXPIRED_BEFORE_CLAIM` records and confirm the Activity identity warning when Bridge claims are unavailable.

**Apply when:** Changing autonomy workers, Social Intent formation, native or Bridge routing, attention episode closure, execution expiry, or Activity delivery status.

**Added:** 2026-08-25

## Rule: Daily cadence must survive prompt decomposition and calendar projection

**Defect class:** A prompt containing “daily” is reduced to one weekday or multiple one-day items, changing the operator’s intended cadence.

**General principle:** Interpret explicit cadence as a durable scheduling constraint. Reasoning may choose the work shape and time, but it must not weaken “daily” into a single weekday; the review surface must make every-day scope legible.

**Project-specific enforcement:** `analyzeSchedulePrompt` emits one `Daily` Assignment for quantity-plus-daily prompts; model proposals are normalized to the same cadence; Schedule list/day filters and Week view expand `Daily` assignments across Monday–Sunday.

**Executable protection:** `tests/schedule-prompt.test.ts` asserts one daily Assignment, preserved quantity, `schedule.day === "Daily"`, and daily recurrence. Browser QA must verify all seven calendar columns show the daily responsibility.

**Added:** 2026-08-27

## Rule: Activity focus must be live or explicitly historical

**Defect class:** A completed attention run remains presented as an old Assignment stage such as “Choosing an angle,” or a past-due wake is presented as an indefinitely stuck “Next check due now.”

**General principle:** Progress language is a claim about current work. It must be backed by a live lease, a current execution, a due responsibility, or a clearly labeled last completed result. A browser view must observe durable state; it must not require an operator click to discover that work finished.

**Project-specific enforcement:** `LiveView` refreshes the Activity projection every 15 seconds while the Presence is live, removes the unconditional active-Assignment fallback, and labels a due-but-not-active wake as `Attention queued`. Completed attention falls back to a last-look/waiting state instead of reusing a stale candidate-review phase.

**Executable protection:** Browser QA must reload Activity, wait through one refresh interval, assert that a terminal attention run is not rendered as an in-progress Assignment, and assert that a past-due pending wake is not rendered as an unqualified “Next check due now.”

**Apply when:** Changing Activity polling, current-focus selection, Check now copy, Assignment progress, scheduled wakes, attention episodes, or right-now status.

**Added:** 2026-08-25

## Rule: Activity must separate attention capacity from verified outcomes

**Defect class:** Usage budget or inferred intent presented as social activity

**General principle:** Activity must let an operator answer five questions quickly: is the Presence alive, what is it doing now, how much attention has it used, what did it actually do, and what literal work is scheduled next. Attention reads and model calls are capacity signals; likes, reposts, quotes, follows, replies, and posts count only after a succeeded external outcome.

**Project-specific enforcement:** The visible Today dashboard derives reads and model calls from `resourceUsageEvents`, social counts from public history joined to succeeded outcomes, and Upcoming only from assignments with a future `scheduledFor`. Continuous responsibilities and predicted actions stay out of the scheduled-work card; deeper decisions and telemetry remain behind Activity details.

**Executable protection:** Browser Activity QA must assert the dashboard is visible, usage values show `used / limit` and `left`, the verified-outcomes note is present, and a continuous unscheduled responsibility does not appear as upcoming work. Responsive QA must verify the three cards remain within the viewport.

**Apply when:** Changing Activity, attention budgets, resource usage accounting, public-history projection, outcome reconciliation, agenda compilation, or social-activity copy.

**Added:** 2026-08-24

## Rule: Activity detail toggles must reveal rendered content

**Defect class:** Expand/collapse control changes state while the detail surface is empty

**General principle:** A detail toggle is only functional when its expanded state reveals the relevant current context. Changing the label or `aria-expanded` attribute alone is not a user-visible result.

**Project-specific enforcement:** Activity’s `View details` control renders either the capability-trial detail, the current assignment focus, or the general-attention detail. It must never return an empty `activity-right-now-container` when an active responsibility exists.

**Executable protection:** Browser Activity QA must click `View details`, assert `Hide details`, assert non-empty detail content, then collapse and assert the detail container is removed.

**Apply when:** Changing Activity’s right-now card, current assignment selection, capability-trial detail, progressive disclosure, or status-card layout.

**Added:** 2026-08-24

## Rule: The Activity glance surface must stay today-scoped and non-duplicative

**Defect class:** Dashboard real estate consumed by a duplicate Schedule surface or all-time social totals

**General principle:** Activity should summarize what happened today and what is happening now. Schedule owns future work; Activity must not recreate an empty Scheduled work card.

**Project-specific enforcement:** The glance dashboard uses two equal-width cards: Today’s attention and Today’s verified social activity. Social counts are derived from succeeded outcomes whose action time is today, and the card explicitly says “Today only.”

**Executable protection:** Browser Activity QA must assert the Upcoming card is absent, the verified card is today-labeled, and the responsive page remains within the viewport.

**Apply when:** Changing the Activity glance dashboard, verified social counters, date scoping, Schedule navigation, or dashboard layout.

**Added:** 2026-08-24

## Rule: Autonomous attention must be governed at the canonical worker boundary

**Defect class:** Headless autonomy bypasses configured budget; background reads masquerade as discovery usage

**General principle:** Resource accounting and policy enforcement must use the same work classification across every autonomous entry point. Protected inbound or assigned work must not consume self-directed capacity, and observation must preserve capacity for evaluation and qualified action.

**Project-specific enforcement:** `lib/attention-governor.ts` counts only `attentionSource="self_directed_discovery"` against the Presence-scoped envelope, separates background monitoring, applies soft observation/evaluation/action allocations, and is called by both `lib/autonomy-worker.ts` and the legacy `/api/state` discovery path. Activity renders discovery reads and model judgments separately from inbound monitoring. `resumeAttention` clears deferral; `resetAttentionBudget` starts a new usage epoch without deleting history.

**Executable protection:** `tests/attention-governor.test.ts` asserts source separation, protected action capacity, observation deferral, and epoch reset. Browser Activity QA must assert discovery-only counters, the separate background-monitoring line, and visible Resume/Reset controls in Presence attention settings.

**Apply when:** Changing schedulers, autonomy workers, attention budgets, Activity usage cards, Presence attention settings, resource-usage telemetry, or manual wake/reset behavior.

**Added:** 2026-08-25

## Rule: Selected social acts remain one durable responsibility until verified or truthfully terminal

**Defect class:** Selected replies, quotes, reposts, or likes disappear into a cursor or an expired connector queue while Activity reports silence or health.

**General principle:** One Presence may have one active Attention run and at most one pending follow-up. `judgedInboundIds` closes only deliberate silence; a selected act is closed from its sealed intent, execution, and verified outcome. Pending, failed, blocked, and expired delivery are never success or Agent judgment.

**Project-specific enforcement:** Every recurring/operator signal enters `requestAttention`; the temporal runtime owns the only recurring clock; an `OperationalRun(kind="attention")` and one Attention Episode retain lineage through delivery and verification. Effective capabilities require route health plus verified identity, and dispatched wake triggers cannot leak into the next wake generation.

**Executable protection:** `tests/attention-coordinator.test.ts` proves four-signal coalescing, early-run merge, one late follow-up, wake-generation reset, pending-delivery wait, truthful expiry, verified closure, and silence-only-with-no-selection. Browser QA must compare the global health indicator, Activity header, in-flight records, and last-look copy for the same state.

**Apply when:** Changing attention scheduling, Check now, browser timers, run/episode closure, Social Mirror judgment cursors, connector claim/ack/expiry, capability projection, health, or Activity copy.

**Added:** 2026-08-25

## Rule: Chat must show whether a turn is answering or becoming durable work

**Defect class:** Submitted operator turn appears ignored because the UI hides an accepted action receipt or loses the turn after a request interruption

**General principle:** Private Chat has two truthful paths: a conversational turn that returns a Presence reply, and an operator direction that becomes queued work. Both need an immediate visible state. A blank gap must never make accepted work look like a missing response.

**Project-specific enforcement:** Conversational turns receive the recent operator/Presence transcript and show the Presence thinking state while the model runs. URL/action directions render an explicit received, queued, working, or terminal status; if the browser request is interrupted after the server records the turn, Chat refreshes the durable conversation before clearing its optimistic copy.

**Executable protection:** `tests/e2e/chat-thinking.spec.ts` must assert the transient thinking indicator for a conversational turn and the durable Assignment receipt for an explicit publication direction. The focused browser journey must also verify that the submitted turn remains visible after a request interruption or refresh.

**Apply when:** Changing Operator Chat submission, transcript construction, model invocation, nudge/Assignment handoff, loading indicators, or Chat error recovery.

**Added:** 2026-08-27
# Attention and Chat ownership (2026-08-25)

- An overdue Assignment may create or resume an `AssignmentRun`; it must never be translated into a generic Attention observation wake.
- A worker lease owner identifies one invocation, not merely a process/run pair. A second dispatch of the same run must fail its claim while the first lease is live.
- An X URL supplied in an operator nudge must receive a Social Decision whose focal mirror object is that exact post before the nudge can resolve. An unrelated action in the same attention episode cannot settle the nudge.
- A delivery-pending Assignment is not `Working`: cognition has ended and no worker is active. Activity must name the delivery/verification wait explicitly.
- Paused Presences persist nudges as `held_paused`; temporal repair must never create a wake until an explicit operator Wake changes the Presence to live.

## Rule: Test resets require an explicit isolated database

**Defect class:** Test-mode reset falls back to the configured live workspace when a temporary-path command fails.

**Enforcement:** `/api/state { type: "reset" }` is authorized only when test mode is active and database selection came from an explicit `OPENPRESENCE_DB_PATH`. Manifest and fallback databases are never reset by test mode.

## Rule: Terminal Attention runs cannot absorb future wakes

**Defect class:** Blocked historical work recycles a due wake forever, producing Working/Stuck oscillation.

**Enforcement:** Only queued, running, waiting, recovering, delivery-uncertain, and reconciling Attention runs participate in signal coalescing. Blocked and needs-operator runs remain immutable history; a later independent pulse gets a new run.

## Rule: Own-post evidence repairs lost delivery acknowledgments conservatively

**Defect class:** A public action exists on X while its local execution remains blocked, failed, or cancelled.

**Enforcement:** Reconciliation may repair an X reply only from the authenticated own-post feed when Presence, parent post, exact normalized authored text, and a bounded 24-hour time window all match exactly one execution. Text alone can never prove delivery.

## Rule: Activity and Schedule defaults stay outcome-first

**Defect class:** A truthful but operator-heavy default surface makes the user decode runtime machinery before understanding the current state or next action.

**General principle:** Primary product surfaces should answer the user's immediate question first. Technical history, evidence ledgers, optional constraints, and implementation detail remain available through progressive disclosure without changing the underlying state or authority model.

**Project-specific enforcement:** Activity keeps the `right-now-status` and verified-today dashboard ahead of `activity-history-details`, exposes connector recovery with the expected account and one clear repair path, and uses human-readable state language. Schedule keeps the responsibility form focused on outcome and basic timing; asset preferences stay closed by default, and prompt proposals omit capability-planning jargon from the first view.

**Executable protection:** `tests/e2e/activity-delivery-trace.spec.ts` asserts the Activity heading and details disclosure; `tests/e2e/schedule-state.spec.ts` asserts asset preferences are hidden until opened and the responsibility review flow remains usable; targeted unit coverage remains in `tests/activity-now.test.ts`, `tests/agenda-and-assignment.test.ts`, and `tests/schedule-prompt.test.ts`.

**Apply when:** Changing Activity, Schedule, review/recovery notices, planning layers, assignment creation, prompt proposals, evidence/history disclosure, or default user-facing status copy.

## Rule: Public X activity requires verified outcomes and reaction-aware copy

**Defect class:** External side effect misrepresented as a post; stale delivery state mistaken for success; duplicate retry risk

**General principle:** A draft, queued execution, attempted delivery, or connector acknowledgment is not a public outcome. Reactions such as likes are public acts but are not posts, and an uncertain write must remain visibly uncertain until the provider independently verifies the exact act.

**Project-specific risk:** Activity can show verified likes alongside Bridge replies in `verification-pending`, while `derivePublicHistory` correctly excludes unverified deliveries. A stale mirror-event window can also make the Activity projection look inconsistent or cause repeated local ingestion.

**Learned from:** Human-found mismatch between the Activity surface and the authenticated X account.

**Why QA missed it:** Review focused on local execution cards and did not reconcile action type, external reference, provider evidence, and the Activity projection together. The X verifier also assumed the target was the thread root, and the mirror hydrator read the oldest event window on each poll.

**Project enforcement:** `lib/runtime.ts` must derive public history from Social Mirror evidence, not delivery records. `app/api/state/route.ts` must leave Bridge writes without exact provider evidence as pending/failed and must never retry blindly. `lib/x.ts` must match the exact authenticated account, parent post, and authored text (allowing only a leading mention normalization) and search the author timeline rather than treating `conversation_id` as the direct parent. `lib/db.ts` must hydrate the newest bounded `mirror_events` window in chronological order. Durable delivery slots must continue to reject a second write request for the same target/action.

**Executable protection:** `tests/x-connection.test.ts` covers leading-mention matching and nested-thread verification. Runtime smoke QA must assert stable `mirror_events` counts across repeated `/api/state` reads, and Activity QA must distinguish verified likes from posts and show pending/uncertain delivery explicitly.

**Apply when:** Changing X reconciliation, Bridge delivery, Social Mirror hydration, Activity history, reaction labels, retry behavior, or duplicate-action protection.

**Added:** 2026-08-28

## Rule: Quote cards and their assets retain object-level ownership through cognition and delivery

**Defect class:** Nested quoted content is flattened into the outer post, media is attributed to the wrong author, or a live composer changes target between text entry and submit.

**General principle:** A quote card is a distinct public object, not extra text or media owned by the quoting author. Every asset must retain the exact object, author, and source-post provenance that supplied it. Delivery authority must remain bound to the approved target through the final submit boundary.

**Project enforcement:** Native and Chrome observation must materialize the quoted post separately and connect it through `referencedExternalRefs`. Cognition must label referenced-media ownership. If a known parent/quote reference is absent from the Social Mirror, the centralized live-intent boundary must form no outward action. The Chrome Bridge must verify the approved target before writing and again after writing immediately before clicking submit; target loss or replacement fails closed with authored text left unsubmitted.

**Executable protection:** Bridge persistence tests assert quoted-asset author/source provenance; perception tests assert explicit quoted-owner labels; runtime tests assert that unresolved quote context forms neither replies nor reactions; extension browser tests assert nested quote authorship/media, pre-entry mismatch refusal, and post-entry/pre-submit target-change refusal.

**Apply when:** Changing X DOM observation, quote/thread hydration, asset ingestion, multimodal cognition context, composer routing, or Bridge submission.

**Added:** 2026-08-28

## Rule: In-flight expression cards must show the authored preview

**Defect class:** Delivery queue exposes source context but hides the actual outbound expression

**General principle:** When an action has a sealed authored expression, the operator must be able to inspect that expression before or while delivery is being verified. Source context and outbound text are different facts.

**Project-specific risk:** Activity’s in-flight records already had the target Mirror object’s text as `snippet`, so a reply card displayed the source post and omitted `execution.publication.payload.text`—making a real reply look absent.

**Learned from:** Human-found missing reply preview in the Activity in-flight card.

**Why QA missed it:** Browser QA asserted the action title, status, and source control but not the authored payload for pending replies.

**Project enforcement:** `activityActionRecords` in `app/page.tsx` must expose `execution.publication.payload.text` separately as `expressionPreview`; both in-flight render variants must label it “Reply preview” for replies. The source snippet remains separate context.

**Executable protection:** Browser Activity QA must assert that a pending reply renders its authored publication text and that the source post text is not the only preview. ⚠️ Missing — recommended: add a seeded Activity E2E fixture for a `verification-pending` reply with distinct source and authored text.

**Apply when:** Changing Activity in-flight cards, execution previews, Bridge/native delivery states, reply/quote composition, or source-context disclosure.

**Added:** 2026-08-28

## Rule: Browser identity must be positively verified at the final public boundary

**Defect class:** Authorization / account drift / false identity attribution

**General principle:** Never infer the authenticated account from content being viewed, a stale identity cache, or a prior successful check. When a browser account may have changed, missing or mismatched identity must block the final external write.

**Project-specific risk:** The Chrome X adapter can view a Genny post while signed in as another account, and an X SPA can switch accounts while a composer remains open. Treating the viewed author or a recent verification as the signed-in Presence would publish under the wrong account.

**Learned from:** Human-found X post/account mismatch and read-only Chrome inspection showing `@other-account` while the selected Presence expected `@example_agent`.

**Why QA missed it:** Existing extension fixtures represented the expected account with an arbitrary `/example_agent` link, and browser QA checked identity at execution start but not after a mid-composer account change.

**Project enforcement:** `verifyAccount` in `extension/channel-x.js` may use only X signed-in account surfaces (`AppTabBar_Profile_Link`, the account switcher, or their documented equivalent), never arbitrary page-author links or a recent session cache. `execute` must re-check identity after navigation and immediately before submitting posts, replies, and quotes; mismatch/unknown results must return `ACCOUNT_MISMATCH`/`ACCOUNT_NOT_READY` without clicking. The Bridge identity status and Activity warning must remain Presence-scoped.

**Executable protection:** `tests/e2e/extension-composer.spec.ts` covers a viewed Genny post with no signed-in account surface (no observation/identity claim) and an account change to `@poko` after text entry (no submit click, `ACCOUNT_MISMATCH`). `node --check` validates the extension scripts; scoped ESLint covers the changed extension and browser test.

**Apply when:** Changing Chrome/X observation, account switchers, Bridge identity handoff, composer routing, public submission, reconnect/retry behavior, or Presence-scoped browser sessions.

**Added:** 2026-08-28

## Rule: Safe pre-write connector misses are agent-closed, not operator-blocked

**Defect class:** A bounded delivery attempt that never crossed the external-write boundary remains in Needs You and freezes the Assignment queue.

**General principle:** If durable execution facts prove that the connector never claimed the action and no external reference exists, the Agent may close that bounded attempt autonomously. It must preserve zero verified/public actions, record the reason, and release the queue. Only outcomes that may have crossed the external boundary remain operator-visible and unresolved.

**Project-specific risk:** `BRIDGE_NOT_CHECKED_IN` executions were marked stale with a review timestamp. Assignment reconciliation interpreted that timestamp as an operator decision even though the execution had no `externalRef`, leaving one-time Assignments in `needs_operator` after their window had closed.

**Learned from:** Human-found stuck Assignment: “The authorized browser connector did not check in before the bounded delivery window closed; no external write was attempted.”

**Why QA missed it:** Tests covered stale Bridge execution closure and reviewed-failure escalation separately, but did not run reconciliation after the stale pre-write record was persisted or assert that the parent Assignment left the operator queue.

**Project enforcement:** `isAutonomousPreWriteDeliveryFailure` must require an allowlisted pre-claim failure code and no external reference. Reconciliation must mark the execution `closed_non_retryable`, keep `externalRef` absent, close one-time Assignments as `expired_incomplete`, and release recurring Assignments to their next bounded wake. The temporal sweep must invoke this reconciliation for persisted stale records, not only newly expired queue entries.

**Executable protection:** `tests/assignment-domain.test.ts` asserts the screenshot failure closes a one-time Assignment, preserves zero verified progress, and records no external reference. Runtime sweep QA must assert that the same persisted failure no longer projects as `Needs You` after a health pass.

**Apply when:** Changing Bridge claim timeouts, execution reconciliation, Assignment queue projection, stale failure review, or autonomous recovery behavior.

**Added:** 2026-08-29

## Rule: An active distribution burst outranks the parent Assignment's completion projection

**Defect class:** A live increased-effort window is displayed as active but stops dispatching after the ordinary recurring Assignment reaches its daily deliverable.

**General principle:** A burst is a temporary execution window over an existing distribution responsibility. Its scheduler eligibility, retry budget, and next wake must remain independent from the parent's ordinary completion state. It may continue through bounded silence passes while preserving the quality bar and excluding operator-blocked, cancelled, or failed work.

**Learned from:** Human-found live burst showing `1 / up to 40` while its `nextRunAt` was over fifty minutes stale and no new worker had been created.

**Why QA missed it:** The burst tests covered creation, pause, and resume, but not the combination of an active pursuit, a completed parent Assignment, and an exhausted ordinary attempt budget.

**Project enforcement:** Temporal dispatch treats an active, due pursuit as eligible for completed recurring distribution parents and bypasses only the parent's bounded no-op budget. The live worker accepts that completed projection, and the Activity card reports scan passes separately from verified public actions.

**Executable protection:** Temporal tests must assert that a due active pursuit returns a completed meaningful-engagement Assignment from `dueLiveAssignmentsWithoutWorkers`; Activity QA must verify that repeated quiet passes advance `lastRunAt`/`nextRunAt` and do not claim public actions.

**Apply when:** Changing burst/pursuit scheduling, Assignment completion, recurring delivery, quiet retries, Activity progress, or worker dispatch.

**Added:** 2026-08-29

## Rule: Distribution capacity is outcome-readable and adjustable in place

**Defect class:** An active push shows infrastructure consumption without explaining progress, and scaling requires leaving the responsibility's context.

**General principle:** The primary push surface must lead with verified outcomes, pending confirmation, the next pass, and the latest action or reason for silence. Capacity controls belong beside the push and must persist to the same durable window that the worker uses.

**Project enforcement:** Activity and Schedule use the same Focused/Balanced/Expanded levels as Autonomy Today. Raw channel/model/hydration counters are not default progress metrics. Scaling an active window writes its capacity and resource envelope, preserves already-consumed progress, and queues the next durable worker pass.

**Executable protection:** Browser QA must change the inline scale control, reload, and verify the selected capacity and human-readable latest-result state remain present; runtime QA must assert the scale operation updates the durable pursuit and leaves a due active window dispatchable.

**Apply when:** Changing Distribution push cards, Autonomy Today budgets, Assignment pursuit capacity, worker queueing, Activity progress, or Schedule responsibility inspectors.

**Added:** 2026-08-29

## Rule: A burst must not spend its envelope re-judging the same weak candidates

**Defect class:** A high-effort distribution push consumes model-call capacity while producing little or no useful public output because discovery is generic and unchanged candidates are repeatedly judged.

**General principle:** Resource ceilings are guardrails, not a quota to burn. Discovery should be grounded in the source object, each push should remember which social objects it already considered, and a decision call should evaluate a fresh batch with permission to choose multiple useful low-risk actions without forcing an action when none earns attention.

**Learned from:** Human-found burst that reached `40 / 40` model calls with only one pursuit-verified action, followed by a misleading paused/active UI state.

**Why QA missed it:** Existing tests covered bounded capacity and quiet outcomes, but not source-grounded discovery plus candidate coverage across repeated burst passes.

**Project enforcement:** `distributionSourceText` derives discovery terms from the source post; `AssignmentPursuitWindow.consideredCandidateKeys` persists coverage; live candidate selection excludes previously considered objects; the batch judgment prompt treats silence as valid but does not require a single-candidate pass. Capacity exhaustion is durably paused, and scaling the exhausted envelope reactivates and queues the push.

**Executable protection:** `tests/assignment-runtime.test.ts` asserts the same burst does not spend another model call re-judging the same candidates and that scaling a capacity-paused burst reactivates it. `tests/activity-now.test.ts` asserts exhausted bursts pause durably and stale confirmation cannot outrank an active burst. Browser QA asserts the paused card has one state, one verified-count source, and an actionable recovery path.

**Apply when:** Changing distribution discovery, live Assignment pursuit batching, model-call/resource budgets, burst scaling/resume, or Activity status projections.

**Added:** 2026-08-29

## Rule: Dated schedule intent must preserve its recurrence and route

**Defect class:** Scheduled social action silently becomes a one-time or unreachable responsibility

**General principle:** A scheduled responsibility must keep the cadence the operator sees, and each declared social action must be matched to a connector that can actually perform it. A terminal delivery failure must not be mistaken for a recurring schedule.

**Project-specific risk:** `compileAssignmentInstruction` previously gave a normal dated Assignment `recurrence.kind === "once"` even though Schedule described it as recurring. Explicit QUOTE work could also have public targets removed by the native X mention-only rule even when a verified Chrome quote route was available.

**Learned from:** Human investigation of Genny’s missing QUOTE and Asset-library publication.

**Why QA missed it:** Existing tests covered daily prompt decomposition and low-level quote routing, but not the manual dated-schedule default or the combination of an unmentioned target with a verified browser route.

**Project enforcement:** New dated Assignments default to weekly recurrence (Daily remains daily); explicit `once`/`one-time` wording remains one-time. `xQuoteTargetHasAvailableRoute` must be used when building quote candidate vocabularies, while `formXActionIntent` retains native-vs-browser routing and final authorization.

**Executable protection:** `tests/assignment-domain.test.ts` asserts dated schedule recurrence and explicit one-time behavior. `tests/runtime.test.ts` asserts an unmentioned public post remains eligible when verified Chrome is connected.

**Apply when:** Changing Schedule creation/editing, recurrence inference, quote candidate filtering, X connector routing, or terminal Assignment recovery.

**Added:** 2026-08-29

## Rule: A promotion Assignment must support its linked source before secondary distribution

**Defect class:** Growth / wrong-target public action / false progress

**General principle:** A verified action on a related conversation is not proof that a promotion responsibility supported its source. When the source is available, the execution boundary must require a direct source action before allowing optional secondary distribution; otherwise the responsibility stays active for another informed pass.

**Project-specific risk:** The live one-hour burst formed verified actions on unrelated X posts before it formed a Like on the exact linked post. A prompt instruction alone could not prevent a model from selecting candidate index 1 and making Activity look productive without advancing the actual promotion goal.

**Learned from:** Human-found failure and live Activity/state inspection for the operator-account promotion post.

**Why QA missed it:** The previous tests checked source-first candidate ordering and prompt wording, but did not assert that an unrelated selected target is rejected at the public-action boundary when the linked source is already mirrored.

**Project enforcement:** The meaningful-engagement path in `app/api/state/route.ts` must keep the linked `sourceObject` as the first candidate, preserve target/source separation in the prompt, and hold any non-source-only action bundle with `Promotion source held`. `assignmentPursuitVerifiedCounts` must continue to count only verified outcomes, while Activity must show the actual action target and object type.

**Executable protection:** `tests/assignment-runtime.test.ts` — “does not count an unrelated conversation as promotion when the linked source is available”; `tests/runtime.test.ts` — verified reply lineage and direct-target projection; `tests/e2e/activity-delivery-trace.spec.ts` — target attribution and delivery trace. The conversation eval report under `qa-learnings/conversation-prompt-evals/` must include repeated source-target cases.

**Apply when:** Changing meaningful-engagement planning, promotion/burst scheduling, candidate ranking, social decision parsing, X action formation, Activity progress, or any cross-context reply/quote path.

**Added:** 2026-08-30

## Rule: Operator status answers must use the durable workspace ledger

**Defect class:** Generic Chat reply hides the Agent's actual watch, work, schedule, or blocked state.

**General principle:** The operator should be able to ask Chat what the Agent is watching, working on, doing next, or waiting on and receive a concise answer from persisted state. Do not ask the model to infer facts already represented by Watches, Assignments, or Assignment Runs.

**Project enforcement:** Operator workspace-status replies are deterministic for factual Watchlist and Work/Schedule questions; ordinary conversational turns continue through the Agent response path. Answers distinguish private watching from public action and distinguish one-time responsibilities from recurring ones.

**Executable protection:** Browser QA must create or seed a watch and a sandbox responsibility, ask the corresponding Chat questions, and assert the named watch/status and current/next/stuck state. Projection QA must assert that Usage and library surfaces retain compact Project routing records.

**Apply when:** Changing operator Chat, Watchlist, Work, Schedule, Assignment Runs, or browser read projections.

**Added:** 2026-09-02

## Rule: Visual discovery must not become a durable library by default

**Defect class:** Rejected/temporary web images consume durable storage, flood Recent discoveries, or reach social planning with generic metadata.

**General principle:** Search results and downloaded previews are leads, not reusable media. Inspect the original pixels, retain source lineage, and persist bytes only after a bounded editorial decision selects the visual for a publication or library reuse.

**Project enforcement:** Assignment visual research uses in-memory previews for candidate comparison; rejected candidates remain in the research session's bounded perception/source trail only. A selected visual is materialized once, receives the actual perception observation as useful metadata, and is the only candidate linked to the durable Asset library. Social strategy receives only preserved, authorized visuals and must compare image versus text-only explicitly.

**Executable protection:** `tests/asset-intelligence.test.ts` asserts preview candidates have no durable storage; `tests/assignment-runtime.test.ts` covers selected/rejected visual research; `tests/playbook-workflows.test.ts` asserts starter visual guidance and the image decision rule. Browser QA must inspect Artifacts → Media → Recent discoveries after a rejected candidate and verify no generic placeholder is presented as retained visual metadata.

**Apply when:** Changing asset discovery, visual perception, assignment research, media retention, social decision prompts, template guidance, or Recent discoveries projections.

**Added:** 2026-09-16

## Rule: Operator Chat must expose the durable FIFO boundary

**Defect class:** Chat interaction state — hidden work, disabled follow-up input, and missing interruption control

**General principle:** A conversational agent must acknowledge input immediately, make active and queued work distinguishable, process turns in submission order, and provide a truthful way to stop the current turn without allowing a late response to be committed after cancellation.

**Project-specific risk:** `/chat` uses `sendPresenceNudge` to persist an operator message and queue an `operator_chat` OperationalRun. The server worker enforces created-order dispatch per Presence, while `OperatorChatView` owns optimistic input, the composer state, and status polling. A regression in either layer can make Chat appear idle, drop the visual acknowledgment, run messages out of order, or show a response after the operator stopped it.

**Learned from:** Human-reported Chat behavior on 2026-09-11; Chrome reproduction showed the first turn eventually acknowledged but the textarea was disabled and the submit control exposed only an unlabeled spinner.

**Why QA missed it:** Existing coverage checked a delayed first-response thinking indicator and persisted messages, but did not submit a second turn during the first request, assert the composer stayed usable, or exercise cancellation and late-worker fencing.

**Project enforcement:** `OperatorChatView` in `app/client-page.tsx` must keep the textarea enabled during `operator_chat` work, render immediate optimistic input, use the Queue message/Stop current task button states, and poll the `chat` projection while runs are active. `app/api/state/route.ts` must persist `sendPresenceNudge`, expose `cancelOperatorChat`, and keep the cancellation scoped to the selected Presence. `lib/autonomy-worker.ts` must refuse to persist a late receipt or reply after the run is durably cancelled.

**Executable protection:** `tests/e2e/chat-thinking.spec.ts` — queued composer and stop flow; `tests/operator-chat-harness.test.ts` — FIFO and cancellation fencing; `tests/e2e/chat-first-harness.spec.ts` — immediate durable message acknowledgement.

**Apply when:** Changing private Chat, operator nudge persistence, OperationalRun dispatch, composer loading state, model cancellation, or Chat projections.

**Added:** 2026-09-11

## Rule: Agent Lab projections must preserve the visible Scenario contract

**Defect class:** Empty Scenario library / mutation response missing newly-created records / broken Sandbox review flow

**General principle:** A route projection must include every durable collection required by the route's visible tabs and by the response to its mutations. An omitted collection is a false empty state, not an optimization.

**Project enforcement:** The `/rehearsal` projection preserves the selected Presence's Scenarios, immutable versions, isolated Runs, provenance, evaluations, Sandbox sessions, and their trace objects/events. Built-in Scenarios remain visible; Presence-owned Scenarios and Runs remain scoped to the active Presence.

**Executable protection:** `tests/agent-library-browser-projection.test.ts` asserts Scenario and Run joins survive the rehearsal projection. Browser QA must cover Agent Lab → Scenarios → create from prompt → Start isolated Run → Review → reload, with no live publication.

**Apply when:** Changing Agent Lab, `/rehearsal`, Scenario creation/import/editing, isolated Runs, review tabs, or browser response projections.

**Added:** 2026-09-02

## Rule: Collapsed Agent rail content must stay inside its boundary

**Defect class:** Minimized sidebar overflows its fixed rail and clips controls or Agent identity marks

**General principle:** A collapsed navigation rail must be treated as a bounded layout, not merely a hidden-label variant. Every visible control and identity mark must fit within the rail at the same time, without creating page overflow or relying on clipping.

**Project-specific risk:** The Agent-first shell uses an 80px collapsed grid track, but its brand actions and padded 48px Agent avatars previously retained their expanded minimum widths. The collapse and theme controls extended into the workspace and the rail could become wider than its grid boundary.

**Learned from:** Human-found broken minimized sidebar screenshot.

**Why QA missed it:** Existing browser checks covered expanded shell navigation and compact page widths, but did not click the real collapse control and compare visible descendant geometry with the fixed sidebar boundary.

**Project enforcement:** The final collapsed-shell CSS in `app/globals.css` must zero the collapsed descendants' minimum widths, stack the brand actions, and use box-sized Agent rows that fit the 80px rail. The expanded shell and mobile overrides remain separate.

**Executable protection:** `tests/e2e/chat-first-harness.spec.ts` — “Collapsed Agent rail keeps its controls and avatars inside the rail” clicks the real control, asserts the collapsed semantic state, and verifies no visible sidebar descendant or document width exceeds its boundary.

**Apply when:** Changing the Agent sidebar, collapse/expand controls, Agent avatar sizing, theme controls, resource access, shell grid columns, or desktop responsive overrides.

**Added:** 2026-09-03

## Rule: Agent switching must be bounded and visibly acknowledged

**Defect class:** Agent rail clicks appear ignored, stale workspace content wins, or rapid switching overloads the local runtime

**General principle:** Selecting an Agent is a read-only workspace navigation event. The rail must launch one target-scoped Chat read per active switch, keep stale responses from replacing the latest selection, and show an explicit loading state while the target workspace is materialized.

**Project-specific risk:** Speculative `pointerenter`, `pointerdown`, and `focus` reads could overlap with the click-owned read. Rapid clicks then made several large Agent projections compete for the same browser and server state, leaving the URL, selected row, and visible Chat context out of sync.

**Project enforcement:** Agent rows do not prefetch on hover or focus. Switching is single-flight; a later click is queued as the next target, and only the latest request may apply state. The URL remains the explicit Agent context, while the workspace shows `Opening <Agent>…` until the target Chat projection is ready.

**Executable protection:** `tests/e2e/agent-switching.spec.ts` focuses an inactive Agent without causing a Chat read, asserts the click performs one target-scoped Chat read, verifies the selected Agent and `/chat?agentId=...` route, and reloads to confirm persistence.

**Apply when:** Changing Agent portfolio navigation, Agent-scoped projections, route context synchronization, workspace loading states, or client-side request concurrency.

**Added:** 2026-09-03

## 2026-09-13 — Human-readable tool results

- General principle: Internal tool payloads must not become the default conversation answer. State what was done and what the evidence proves, then disclose raw evidence on demand.
- Project enforcement: System-owned known receipts render through `chatToolReceipt` even without `replyToMessageId`. Operator JSON stays untouched. Inspection summaries must not expose internal IDs or imply a fresh external check.
- Executable protection: `tests/chat-activity-presentation.test.ts`; private-worker integration in `tests/assignment-runtime.test.ts`.

## 2026-09-16 — Agent-planned growth work must preserve creator and template provenance

**Defect class:** Agent-created Tasks appear operator-created, or template experiments cannot be connected to later verified posts and metric snapshots.

**General principle:** A growth loop is only measurable when the durable work item records who planned it and which reusable hypothesis it is testing. The operator can request work in Chat, but the resulting responsibility is Agent-planned work; a saved template remains a testing hypothesis until a verified live outcome and subsequent measurement support it.

**Project enforcement:** Chat-created Assignments persist `createdBy: "agent"` and carry the exact `strategyTemplateId` when the Agent selected a saved template. Legacy Chat Assignments are repaired from their durable nudge link and explicit saved-template receipt. Tasks render Agent-planned and operator-created work with different labels. Template cards keep editable layout separate from guidance and report only verified live uses and observed metric snapshots.

**Executable protection:** `tests/operator-chat-harness.test.ts` covers Chat persistence, creator attribution, and template linkage; `tests/playbook-workflows.test.ts` covers template usage accounting and legacy provenance repair. Browser QA must verify the Artifacts editable layout/Guide split, an Agent-owned Task in Tasks, operator-owned work, and Goals absent from Calendar.

**Apply when:** Changing operator Chat delegation, Assignment creation/projection, Artifacts templates, scheduled publishing, X interaction planning, verified outcome attribution, or publication-performance reporting.

## Rule: Chat tool receipts must have a readable activity projection

**Defect class:** A valid system tool receipt falls through to a raw JSON message, or a response recovery action renders as a browser-default control.

**General principle:** Internal execution payloads are evidence, not the default user interface. Every system-owned tool name that can be persisted in Chat needs a human summary, status, and optional technical disclosure; recovery actions must use the Chat action treatment and state the condition being recovered.

**Project enforcement:** `lib/chat-activity-presentation.ts` owns the allowlist and summaries for Chat receipts, including `save_social_template`; `OperatorChatMessageBody` renders the summary and nests exact JSON under Technical details. Failed operator-chat turns render the styled `.operator-chat-retry-button` with a response-state label.

**Executable protection:** `tests/chat-activity-presentation.test.ts` recognizes and summarizes saved-template receipts without exposing JSON in the summary. Browser QA must verify a failed Chat response shows the styled retry control and a successful template tool receipt is compact, readable, and expandable for technical details.

**Apply when:** Adding or changing operator-chat tools, persisted system receipts, tool summary labels, Chat error recovery, or Chat action styling.

**Added:** 2026-09-16
