# Risk surfaces

## Presence identity controls

**Why it's risky:** A missing or non-persisted Presence handle makes a Presence difficult to address and can blur the `User → Agent → Presence` boundary, especially when the Agent name and Presence name are edited independently.

**Default QA depth:** Verify the Presence handle is editable in Settings, persists through reload, appears in the Presence header/sidebar, is accepted by the Presence-scoped update route, and remains unchanged when the Agent is renamed.

**Project enforcement:** Presence Settings handle editor in `app/page.tsx`, `setPresence` validation in `app/api/state/route.ts`, Presence operation typing in `lib/types.ts`, `tests/runtime.test.ts`, and the Presence/Agent identity E2E flow in `tests/e2e/openpresence.spec.ts`.

**Last reviewed:** 2026-08-15

## Visual evidence and asset provenance

**Why it's risky:** A reputable source page or search result can still yield a decorative hero image, stock photo, stale chart, wrong metric, or thumbnail. Publishing it as evidence makes the Agent's public claim misleading.

**Default QA depth:** Test source-page extraction, original-media fetching, actual-pixel perception, bounded search-again behavior, text-only fallback, structured chart rendering boundaries, final joint text/media review, duplicate/recent-visual history, and source lineage where the asset publisher differs from the underlying data source.

**Project enforcement:** `lib/asset-discovery.ts`, `lib/perception-runtime.ts`, `lib/ai.ts`, `lib/visual-fit.ts`, `AssetResearchSession`, `tests/visual-fit.test.ts`, and `tests/assignment-runtime.test.ts`.

**Last reviewed:** 2026-08-15

## Intent and execution boundary

**Why it's risky:** The agent's human intention must remain separate from operator-owned execution settings.
**Default QA depth:** Test `NO_OP`, review/auto/off modes, queued actions, pause behavior, and ledger records.
**Last reviewed:** 2026-08-12

## Agent capability enablement and provider readiness

**Why it's risky:** A flat tool-binding UI can conflate registered capability, Agent eligibility, provider readiness, and Presence authority, causing hidden external calls or mysterious social-action failures.
**Default QA depth:** Verify family toggles persist, disabled families withhold their callable paths without erasing observations/assets, dependent Skills expose unavailable state, provider readiness remains separate, and Channel action has no Agent-level authorization switch.
**Project enforcement:** `lib/types.ts` capability definitions/helpers, `app/page.tsx` Agent capabilities UI, `app/api/state/route.ts` Research/Asset/Visual gates, `lib/perception-runtime.ts`, `tests/runtime.test.ts`, `tests/perception.test.ts`, and the Manage Agent E2E flow.
**Last reviewed:** 2026-08-15

## Assignment fulfillment and bounded pursuit

**Why it's risky:** A model can correctly reject a weak candidate, but a runtime that treats that rejection as terminal will silently fail an operator-owned objective or misreport progress.
**Default QA depth:** Exercise multiple candidate rejections followed by later success; verify temporary rejection context reaches the next attempt; exhaust the effort budget; confirm `candidate_rejected`, `assignment_blocked`, `assignment_completed`, `assignment_cancelled`, and ordinary consideration `action_no_op` remain distinct; verify only observed delivery advances progress.
**Project enforcement:** `app/api/state/route.ts` `runSandboxAssignment`, `Assignment.work`, `Assignment.attemptHistory`, `researchAssignmentStories`, `tests/assignment-runtime.test.ts`, and Playground assignment progress UI.
**Last reviewed:** 2026-08-15

## Assignment evidence trail and latest-result projection

**Why it's risky:** A long-running Assignment can leave several bounded research sessions and terminal outcomes in one Playground. Showing the first non-terminal record can make an older blocked attempt appear current even after a newer verified publication exists; rendering every candidate as a full-width row also hides the evidence needed to guide a retry.
**Default QA depth:** Verify the most recently updated Assignment is the one projected in Playground, confirm completed progress agrees with Feed/Mirror delivery, and inspect the candidate trail as a compact responsive gallery with source, status, rejection reason, and retained preview when available. Verify HTML-encoded media URLs are decoded before fetching and that inspected-but-rejected materialized assets remain review-only evidence, never publications.
**Project enforcement:** `app/page.tsx` latest Assignment selection and `AssignmentResearchReview`, `app/globals.css` responsive candidate gallery, `lib/asset-discovery.ts` source-media extraction, `app/api/state/route.ts` rejected-candidate retention, `tests/asset-intelligence.test.ts`, `tests/assignment-runtime.test.ts`, and the Playground browser verification.
**Last reviewed:** 2026-08-15

## Protected meaning files

**Why it's risky:** Identity drift would undermine the product thesis.
**Default QA depth:** Test proposal creation, rejection, approval, revision history, and rollback semantics.
**Last reviewed:** 2026-08-12

## Browser state quality

**Why it's risky:** The product's value is an understandable, polished control room rather than a raw dashboard.
**Default QA depth:** Inspect every page, empty/loading/error/paused state, responsive layout, focus state, and browser console.
**Last reviewed:** 2026-08-12

## Bridge protocol and social mirror

**Why it's risky:** External executors handle private social content and can retry actions after crashes; duplicate ingestion, stale leases, credential leakage, or cross-Presence visibility would break trust.

**Default QA depth:** Test authenticated and unauthenticated REST calls, duplicate event delivery, explicit visibility/shareability, lease reclaim, idempotent acknowledgement, intent expiry, raw-key exclusion from state, and responsive Bridge setup.

**Project enforcement:** `lib/bridge.ts`, `/api/bridge/v1/*`, `BridgeManager`, `tests/runtime.test.ts`, and the custom-channel Playwright workflow.

**Last reviewed:** 2026-08-12

## Shared database and scoped runtime concurrency

**Why it's risky:** Multiple tabs, local processes, and asynchronous workers may share one database while holding different Agent, Presence, Playground, or Assignment context. Ambient active-state lookup can route one Agent's work into another workspace, or let a late Playground result resurrect data after reset.

**Default QA depth:** Exercise two Agent URLs and two same-Agent tabs concurrently; switch one tab while the other is running; reset a Playground world while work is outstanding; verify stale writes return a conflict, durable Agent/Presence/session/Assignment lineage is enforced, and connector callbacks resolve their owner from durable Bridge scope rather than the active projection.

**Project enforcement:** `lib/db.ts` workspace revisions, `lib/runtime.ts` `RuntimeScope` and Playground `worldRevision`, `app/api/state/route.ts` request lineage validation, `lib/bridge.ts` durable Bridge resolution, `tests/concurrent-agent-context.test.ts`, and `tests/e2e/concurrent-agents.spec.ts`.

**Last reviewed:** 2026-08-14
