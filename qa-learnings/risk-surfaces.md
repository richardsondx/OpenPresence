# Risk surfaces

## Intent and execution boundary

**Why it's risky:** The agent's human intention must remain separate from operator-owned execution settings.
**Default QA depth:** Test `NO_OP`, review/auto/off modes, queued actions, pause behavior, and ledger records.
**Last reviewed:** 2026-08-12

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
