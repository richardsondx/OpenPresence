# Durable design decisions

Record accepted design decisions here so repeated reviews do not reopen settled choices without evidence. Each entry should include decision, date/context, problem, alternatives rejected, reasoning, and conditions for reopening.

## 2026-08-31 — Preserve the User → Agent → Presence hierarchy

- **Decision:** Keep User as owner/operator, Agent as durable mind/workspace, and Presence as one social incarnation. Agent-scoped meaning must not be duplicated per Presence.
- **Context/problem:** Users may operate multiple Agents and multiple Presences; scope confusion can silently change identity, memory, or authority.
- **Alternatives rejected:** A flat workspace model; treating each Presence as a separate Agent; hiding scope behind implementation labels.
- **Reasoning:** This is the canonical OpenPresence object model and protects identity, privacy, and predictable switching.
- **Reopen when:** Product evidence shows the user’s mental model or object model has materially changed, without weakening the boundary between durable mind and social incarnation.

## 2026-08-31 — Keep Activity, Review, and Schedule distinct

- **Decision:** Activity is the operational social stream; Review is focused operator judgment; Schedule manages durable responsibility and timing.
- **Context/problem:** These surfaces are related, but merging them would make the operator scan a stream to find decisions or confuse timing with outcomes.
- **Alternatives rejected:** One universal dashboard; embedding the full Review queue in Activity; treating scheduled work as prewritten publication.
- **Reasoning:** Each surface answers a different user question while preserving truthful state and clear next action.
- **Reopen when:** Journey evidence shows a user cannot understand or move between the roles, or the product’s responsibility model changes.

## 2026-08-31 — Keep rehearsal separate from live reality

- **Decision:** Playground/Rehearsal uses the real Sandbox cognition-to-outcome path but never represents live delivery or verified external-world outcome.
- **Context/problem:** Realistic rehearsal is valuable, but simulated events and feedback must not mutate identity or create false progress.
- **Alternatives rejected:** A fake preview-only flow; reusing live activity language without a Sandbox boundary; allowing rehearsal findings to silently rewrite durable meaning.
- **Reasoning:** The distinction preserves trust, authority, and useful learning.
- **Reopen when:** Sandbox/live boundaries or the product’s authority model are deliberately redesigned and remain explicit to users.

## 2026-09-01 — Review handoffs land on the actionable queue

- **Decision:** A Review approval handoff opens Activity directly on the Agenda/queue context that contains the decision controls.
- **Context/problem:** The Review card said “Open Agenda & Review” but previously landed on general Activity, forcing the operator to hunt for the approval.
- **Alternatives rejected:** Leave the operator on the general Activity stream; duplicate approval controls in the Review summary card.
- **Reasoning:** Review remains a focused queue while the handoff preserves one source of truth for approval actions and removes a trust-critical navigation detour.
- **Reopen when:** The approval controls move to a different canonical surface or runtime evidence shows the focused queue is still insufficient.

## 2026-09-01 — Growth objectives are operator-owned contracts

- **Decision:** Growth must collect and display an explicit follower target before creating its long-lived Assignment; the Agent owns the method, not the operator’s unstated goal.
- **Context/problem:** The first-run CTA silently persisted a universal 100,000-follower objective.
- **Alternatives rejected:** Keep a hard-coded benchmark; create the Assignment first and ask for the target later; replace the durable Assignment with a dashboard-only goal.
- **Reasoning:** The operator sees the inferred success measure and confirms it before persistence, while the Agent retains autonomy over day-to-day strategy.
- **Reopen when:** Growth supports a documented objective model beyond follower targets and the preflight contract can represent it without hiding operator intent.

## 2026-09-17 — Agent-owned growth responsibility supersedes task-entry setup

- **Decision:** The operator supplies growth outcomes, context, and boundaries conversationally in Chat. The Agent asks only for missing identity/context, then creates and manages the executable continuous responsibility. Growth projects the resulting goal and evidence; it is not a task-entry form.
- **Context/problem:** The product direction is supervisory: the user hires an autonomous social-media Agent and should not construct or activate its work system. The prior follower-target form preserved the task-management mental model.
- **Alternatives rejected:** Keep a dedicated Growth goal form; create a planning-only Assignment awaiting explicit activation; remove executable Assignment primitives entirely.
- **Reasoning:** Chat preserves user intent while the Agent owns decomposition, scheduling, execution, measurement, and replanning. Legacy persisted Assignments remain readable for migration, and Tasks retains scoped conversational intervention and explicit cancellation.
- **Evidence:** `tests/operator-chat-harness.test.ts`, `tests/e2e/responsive-workspace.spec.ts`, `tests/e2e/artifacts-playbook.spec.ts`, and `qa-learnings/simplification-tasks-supervisory-2026-09-17.md`.
- **Reopen when:** A new user-owned configuration capability is demonstrated to require structured editing without restoring routine task construction.

## Review discipline

Do not reopen a decision because a new component, trend, or visual style is available. Reopen only for changed goals, changed user evidence, changed surrounding architecture, or demonstrated friction against the decision.

## 2026-09-18 — Growth leads with a consumer scan

- **Decision:** Growth opens with one plain-language goal/status card, three primary visual measures, and one audience trend. Audience context, strategy, autonomy proof, review rhythm, and raw evidence stay available behind explicit disclosures.
- **Context/problem:** The previous default exposed too many paragraphs, metrics, strategy concepts, operational states, and evidence records at once for a general consumer.
- **Alternatives rejected:** Removing Growth evidence; flattening all sections into a shorter dashboard; replacing truthful status with decorative charts.
- **Reasoning:** The common job is to understand whether the Agent is making progress and what needs attention. Visual hierarchy and progressive disclosure reduce reading load while preserving the underlying evidence, operator action, and truthful scope.
- **Evidence:** Live Growth route review on the requested Presence showed the simplified default with compact scope, goal progress, three primary measures, a trend chart, and collapsed deeper sections; the learning disclosure still opened successfully.
- **Reopen when:** Users cannot find the next action, or evidence shows the default scan hides a decision that must be acted on immediately.

## 2026-09-18 — Growth recovery stays inline with the goal status

- **Decision:** Keep an attention decision in the goal card's status row with one compact `Review` action; do not add a second full-width alert panel that repeats the status and action.
- **Context/problem:** The recovery banner consumed substantial vertical space while repeating `Needs attention`, `A decision is needed`, and `Review details` already present in the goal card.
- **Alternatives rejected:** Keep the full-width banner; remove the recovery action entirely; move the decision only to Activity.
- **Reasoning:** The status row remains truthful and actionable while preserving the focused Review destination. The goal card returns to a glance surface instead of becoming a second operator queue.
- **Evidence:** User screenshot and direct feedback that the panel “doesn't need to take all that space.”
- **Reopen when:** The compact action hides an urgent decision, or operators cannot find the Review destination in live journey testing.

## 2026-09-13 — Five daily destinations, responsive conversation

- **Decision:** Chat, Tasks, People, Growth, Media; the same labeled icons on a mobile dock and desktop navigation. Tasks absorbs Work/Schedule. Knowledge, Teach, Test agent, Watchlist, and settings stay in the Agent menu.
- **Evidence:** The operator found Work/Schedule indistinguishable, Lab over-prominent after setup, and Assets unnecessarily buried. Muse references illustrated compact identity, inline results, and sheets.
- **Alternatives rejected:** Lab in daily navigation; separate Work and Schedule; copying Muse's unrelated personal-assistant destinations.
- **Reasoning:** One Agent workspace, fewer competing concepts, direct media access, and coherent mobile/desktop paths.
- **Tradeoff:** Setup and diagnostic tools require opening the Agent menu; their scope and capabilities remain intact.
- **Reopen when:** Real daily journeys demonstrate a missing destination or the Agent/Presence model changes.

### 2026-09-13 — Daily pages and Agent details

People uses compact rows with one useful context line. Watching keeps watch plans and exploration details closed until selected. Growth leads with the goal and three audience measures; operational evidence is disclosed. Media opens the gallery without a selected inspector, and folder creation is secondary. Activity / About replaces four duplicate context tabs. Mobile sheets keep focus and offer a visible close control; desktop preserves room for the same content. These changes retain the underlying assignments, scope, review, and verified-outcome rules.

## 2026-09-17 — Shared workspace header is action-only

- **Decision:** Keep Agent identity in the sidebar when it is needed for portfolio switching, but hide the single-Agent avatar/name row on desktop where it is redundant. Mobile keeps the compact row because it is the mobile workspace switcher. The shared workspace header retains only workspace actions, including the context inspector control.
- **Context/problem:** The top bar repeated the same Agent identity already visible in the sidebar and mixed durable identity with live environment state. The requested screen evidence showed the resulting redundancy directly.
- **Alternatives rejected:** Keep the repeated identity and reduce its size; keep a second `Live · disconnected` indicator in the header; move Activity truth into a generic global status chip.
- **Reasoning:** One visible identity source is enough. Environment truth remains available on Activity and connection-specific surfaces, where it has the needed context and recovery action.
- **Capability ablation:** Multi-Agent switching remains in the desktop sidebar portfolio; a single Agent needs no switcher. Mobile retains its compact switcher. Agent/Presence scope, inspector access, and environment truth remain available through the sidebar, context control, Activity, and settings.
- **Reopen when:** The sidebar no longer establishes the active Agent/Presence scope, or a cross-surface action needs a persistent status with an actionable recovery affordance.

## 2026-09-16 — Artifacts separates reusable materials from Growth analytics

- **DESIGN CHANGE:** Daily navigation replaces Media with Artifacts, containing Templates and Media tabs. Existing `/assets` links still open Media.
- **Evidence:** Operator explicitly rejected templates inside Growth: they visit Growth to understand account performance, and want to inspect materials created with their Agent.
- **Decision:** Reuse the existing template/hypothesis records and visual library. Show evidence, unproven status, delivery counts, and measured results with each template; draft and scheduling actions preserve existing authority.
- **Rejected:** A second competing library in Growth; a sixth daily navigation destination; treating saved templates or scheduled tasks as verified posts.
- **Chat:** Anchor meaningful approach/work records to their originating receipt, hide empty approach cards, preserve run data across projections, and fit cards within the conversation width.
- **Reopen:** Evidence that Templates and Media cannot be found or that learned hypotheses and reusable formats need distinct artifact filters.

## 2026-09-18 — Schedule opens on today’s responsibilities

- **Decision:** The plain Tasks/Schedule route defaults to the current local day and does not auto-open a blocked Assignment inspector. Users can still select any visible item, use the existing day/type filters to widen the scan, switch to Calendar, or open a deep-linked Assignment directly.
- **Context/problem:** The previous default showed the full responsibility inventory and automatically expanded the first blocked item, forcing a general consumer to parse scheduling, recovery, readiness, and intervention concepts before understanding what mattered now.
- **Alternatives rejected:** Removing the week view; deleting blocked/recovery detail; hiding future work permanently; replacing the Agent-owned projection with a user-managed task list.
- **Reasoning:** Today is the safest attention default for the common journey. Progressive disclosure preserves truthful status, operator intervention, future timing, and the Agent-owned projection without making the first scan a dashboard.
- **Evidence:** Live Chromium route verification on the requested Presence showed the default scan reduced from 12 open items plus an auto-open inspector to 2 current responsibilities with no inspector; the direct `assignmentId` route still opened the full detail and recovery path. TypeScript passed.
- **Reopen when:** Users need a different default horizon, or runtime evidence shows current-day filtering hides urgent unscheduled or recovery work.

## 2026-09-18 — Tasks shows responsibilities, not goals

- **Decision:** Keep Tasks focused on what the Agent is handling today and what comes next. Growth remains the canonical home for goals, progress, and evidence; the duplicate Goals section is removed from Tasks.
- **Context/problem:** The schedule page combined responsibilities, publishing opportunities, and strategic goals into one dashboard, asking a general consumer to understand several planning systems at once.
- **Alternatives rejected:** Keep goals in both Tasks and Growth; add another Tasks filter; move Growth into the schedule page.
- **Reasoning:** One surface should answer one everyday question. Removing the duplicate projection reduces scan cost without deleting goals, Assignments, or their runtime state.
- **Evidence:** Live Chromium route verification shows Today’s work first, two current responsibilities, and the lighter Open opportunities projection below; Growth remains in the daily navigation for goal-level context.
- **Reopen when:** Goal evidence becomes necessary to choose the next responsibility, or users cannot find strategic progress from Growth.

## 2026-09-18 — Readiness contracts are progressive disclosure

- **Decision:** Keep the persisted readiness contract and checks, but collapse the detailed contract by default in the Assignment inspector. The common ready state shows the result; blocked and failed states keep the actionable outcome visible, with deeper checks available on demand.
- **Context/problem:** A ready Assignment opened with outcome, assumptions, agent decisions, timing, capability, and completion-contract cards all expanded. That made a consumer read the Agent's operating model before deciding whether to guide it.
- **Alternatives rejected:** Delete the contract; show every check in the default inspector; move the contract into a separate settings surface.
- **Reasoning:** Readiness protects truthful authority and verified completion, but the normal path needs one clear answer: can Genny proceed? Progressive disclosure preserves the contract without turning every task detail into an operations panel.
- **Evidence:** The supplied live inspector screenshot showed the expanded contract occupying most of the detail surface; the revised ready state keeps the readiness result and guidance action visible while closing the detail disclosure.
- **Reopen when:** Users make a meaningful decision that requires the contract before proceeding, or blocked-state recovery lacks enough visible explanation.

## 2026-09-18 — Growth learning is conclusions first

- **Decision:** Keep Growth's learning and strategy projection concise and human-readable by default. Show three short findings with one evidence line each, three short strategy actions, and a compact next check-in; retain raw review wording and evidence records behind the existing history disclosures.
- **Context/problem:** The populated Growth panel exposed long model-generated strategy prose and raw `growth-evidence:` identifiers in the main scan, making a weak-performance finding look buggy and forcing the operator to parse implementation detail before deciding whether to intervene.
- **Alternatives rejected:** Keep full review strings in cards; remove learning evidence entirely; add another explanatory panel or dashboard.
- **Reasoning:** Reframing the projection preserves the Growth learning loop and truthful evidence while reducing concepts, words, and visual weight in the critical “understand → decide” journey. The Agent still owns the strategy and the underlying review remains inspectable.
- **Evidence:** User screenshot and explicit feedback; live Chrome on the populated Genny Growth route showed concise findings, readable Publish/Discover/Build relationships actions, and no internal evidence IDs in the expanded primary projection.
- **Reopen when:** Operators need the detailed wording to make a routine decision, or the concise projection loses a material limitation or recovery action.

## 2026-09-18 — Artifact template rows own their disclosure typography

- **Decision:** Explicitly style the template disclosure marker, title, and status badge at the component boundary. Keep the title readable and wrapping, while the status remains compact and single-line.
- **Context/problem:** Artifact template summaries were inheriting browser/default typography, making titles render oversized and visually concatenate with statuses in the list view.
- **Alternatives rejected:** Rely on global summary styles; reduce the entire Artifacts page scale; remove status labels from the scan.
- **Reasoning:** This is a local disclosure component with a distinct scan job. Owning its typography makes the hierarchy stable across routes and preserves the useful status without adding vertical bulk.
- **Evidence:** User screenshot and live Chrome reproduction; before the fix, computed summary typography was 16px/normal with 16px/700 title text and no explicit marker treatment.
- **Reopen when:** The compact row hides a meaningful distinction, or real template titles require a different responsive status treatment.

## 2026-09-21 — Tasks leads with the work, not its schedule

- **DESIGN CHANGE / User job:** See what the Agent is handling and give direction when needed.
- **Evidence / current friction:** The operator explicitly found the page overwhelming and supplied Muse's title-and-update list as a reference. The old default exposed two headings, counters, eleven day/type controls, schedule columns, origin/recurrence badges, progress metadata, and a publishing-plan section. The weekday default also hid unscheduled open work.
- **Root problem / decision:** Scheduling mechanics dominated the supervisory job. Replace them with all-open title/update rows grouped by attention and progress. Collapse completed work and upcoming opportunities. Details lead with the actual update and conversational guidance; timing/readiness/evidence sit under one disclosure.
- **Before → after:** Choose day/type and decode cards → read the work immediately and open only what matters. No task-entry or manual completion workflow is introduced.
- **Tenet:** Remove before redesigning; simple first, complexity on demand.
- **Tradeoff:** Day/type filtering is removed. Calendar still provides timing; unfinished attempts are more visible, and complete lists may be longer. Continuous goals remain in Growth.
- **Protected behavior:** AUT-004, AUT-005, UX-001, UX-005, SIM-001 retain runtime state, plan projection, deep links, conversational intervention, cancellation, and verified completion boundaries.
- **Confidence:** High for simplification, based on explicit user feedback and focused desktop/mobile browser proof in `qa-learnings/tasks-simplification-2026-09-21/`.
- **Reopen when:** Large real task inventories make priority hard to scan, or the disclosure hides a necessary decision.

### Calendar clarification (same change)

The user explicitly requested that Calendar contain only a simplified calendar. Replace the old compact/full-hours modes and unscheduled list with one dated week, previous/next/Today, and a mobile day selection. Timed tasks and deadline-only work retain dates; plan windows are labelled Opportunity. Undated work remains visible in List. This supersedes the earlier recommendation to retain a “No fixed start time” panel inside Calendar.
