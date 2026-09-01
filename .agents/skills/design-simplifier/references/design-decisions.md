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

## Review discipline

Do not reopen a decision because a new component, trend, or visual style is available. Reopen only for changed goals, changed user evidence, changed surrounding architecture, or demonstrated friction against the decision.
