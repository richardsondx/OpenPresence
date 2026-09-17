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

## 2026-09-13 — Five daily destinations, responsive conversation

- **Decision:** Chat, Tasks, People, Growth, Media; the same labeled icons on a mobile dock and desktop navigation. Tasks absorbs Work/Schedule. Knowledge, Teach, Test agent, Watchlist, and settings stay in the Agent menu.
- **Evidence:** The operator found Work/Schedule indistinguishable, Lab over-prominent after setup, and Assets unnecessarily buried. Muse references illustrated compact identity, inline results, and sheets.
- **Alternatives rejected:** Lab in daily navigation; separate Work and Schedule; copying Muse's unrelated personal-assistant destinations.
- **Reasoning:** One Agent workspace, fewer competing concepts, direct media access, and coherent mobile/desktop paths.
- **Tradeoff:** Setup and diagnostic tools require opening the Agent menu; their scope and capabilities remain intact.
- **Reopen when:** Real daily journeys demonstrate a missing destination or the Agent/Presence model changes.

### 2026-09-13 — Daily pages and Agent details

People uses compact rows with one useful context line. Watching keeps watch plans and exploration details closed until selected. Growth leads with the goal and three audience measures; operational evidence is disclosed. Media opens the gallery without a selected inspector, and folder creation is secondary. Activity / About replaces four duplicate context tabs. Mobile sheets keep focus and offer a visible close control; desktop preserves room for the same content. These changes retain the underlying assignments, scope, review, and verified-outcome rules.

## 2026-09-16 — Artifacts separates reusable materials from Growth analytics

- **DESIGN CHANGE:** Daily navigation replaces Media with Artifacts, containing Templates and Media tabs. Existing `/assets` links still open Media.
- **Evidence:** Operator explicitly rejected templates inside Growth: they visit Growth to understand account performance, and want to inspect materials created with their Agent.
- **Decision:** Reuse the existing template/hypothesis records and visual library. Show evidence, unproven status, delivery counts, and measured results with each template; draft and scheduling actions preserve existing authority.
- **Rejected:** A second competing library in Growth; a sixth daily navigation destination; treating saved templates or scheduled tasks as verified posts.
- **Chat:** Anchor meaningful approach/work records to their originating receipt, hide empty approach cards, preserve run data across projections, and fit cards within the conversation width.
- **Reopen:** Evidence that Templates and Media cannot be found or that learned hypotheses and reusable formats need distinct artifact filters.
