# Repair log

This log records repairs made when observed behavior contradicted the OpenPresence vision. It distinguishes implementation defects from external blockers and never treats a local fixture as an external success.

## 2026-08-13 — Rhythm summary had no understandable setup path

- **Observed:** Activity showed Rhythm values without explaining what Rhythm meant or where to configure them. Presence settings exposed opaque Recommended/Gentle/Custom options and displayed Quiet hours as “Not configured” without controls.
- **Expected:** The operator should understand attention cadence versus publishing/reply permissions, find the settings from Activity, and configure quiet hours without needing documentation.
- **Root cause:** `pacing` was a single unlabeled select, Quiet hours was a hard-coded Activity projection, and automatic observation scheduling did not consume a custom interval or quiet-hours window.
- **Repair:** Added a Presence-scoped attention-rhythm card with explanatory presets, custom interval, quiet-hours controls, Activity navigation, persisted runtime fields, and overnight-safe native observation scheduling. Fixed the toggle positioning and mobile public-facts overflow caught during browser QA.
- **Verification:** Runtime settings and overnight scheduling tests, isolated production build, and focused Chromium + Pixel 5 browser flow passed. Exploratory screenshots confirmed attached controls, no horizontal overflow, no console errors, and no failed requests apart from the existing remote Google Fonts request when network access was unavailable.

## 2026-08-13 — Activity reused one post as context for unrelated rows

- **Observed:** The Activity stream showed repeated decision rows with the same observed-post preview, and rapid identical silence records appeared as duplicates.
- **Expected:** Activity context must belong to the event's explicit source or target. Repeated identical records within a short burst should not multiply the visible operator timeline.
- **Root cause:** `LiveView.contextForEvent` guessed the latest Mirror object when event lineage was missing; the display also rendered rapid identical event records independently.
- **Repair:** Activity now resolves only explicit source/intent/execution/outcome lineage, Sandbox observations and intents persist source IDs, and the visible projection collapses identical records within ten seconds while retaining the newest ledger event.
- **Verification:** Sandbox lineage tests, isolated production build, and focused Chromium + Pixel 5 Activity E2E passed, including a legacy missing-lineage fixture, duplicate-event fixture, console/network checks, and responsive overflow inspection.

## 2026-08-13 — First wake did not pursue a real Presence launch

- **Observed:** The live test could reach a native X delivery attempt only after an operator explicitly asked Chat to publish. Waking a connected Presence still used the deterministic local no-op path, had no X public-footing context, and had no native inbound observation/reply path.
- **Expected:** Wake starts a real attention cycle. The Agent observes X, understands whether the Presence has public footing, chooses a first move from Mission/Taste/Soul/current channel context, and routes any action through Social Intent → Execution → native Delivery. Silence remains valid when judgment says it is right.
- **Root cause:** `applyOperation` owned the local lifecycle transition, while the state API did not continue a native wake into channel observation and Agent cognition. Native X reads existed only for credential verification; they were not part of the Presence runtime.
- **Repair:** Native wake/pulse now reads own posts and mentions, persists `PublicFooting`, records native Mirror data for observed inbound posts, asks the selected Agent runtime for launch/reply judgment, forms `x.post`/`x.reply` Social Intents, and delivers only through the native connector. Mentions-read failure is reported as partial observation while own-history observation can still support launch.
- **Verification:** 29 runtime tests and 14 native-X tests pass, including a mocked connector fixture for first wake and reply target lineage. Live external acceptance is still pending a real X post ID/URL.

## 2026-08-13 — X authentication was presented as proven write access

- **Observed:** Presence Settings showed `Connected · read + write` after `/2/users/me` succeeded, but the first real `POST /2/tweets` returned HTTP 403 and created no X post. The Activity surface did not preserve the provider's specific rejection or change connection health.
- **Expected:** Account authentication, read capability, and accepted external writes are separate facts. A failed write must remain failed, must not receive an external reference, and must tell the operator what X rejected.
- **Root cause:** Credential verification used an authenticated-user read and labeled the result `read-write` because user token fields were present. The error mapper discarded a useful 403 detail, and the native delivery failure did not update connection health or create a failed Outcome.
- **Repair:** The UI now says configured read/write credentials and reserves write verification for a real external post ID. X 403 details are preserved, failed Executions create failed Outcomes without evidence, the native connection becomes `needs-attention` with the safe error message, and Activity reports `X delivery failed` with “No external artifact was counted.”
- **Verification:** Native-X regression coverage asserts the 403 detail, failed execution/outcome, attention state, and absence of `externalRef`. The real X account remains unchanged at zero posts until the connector accepts a write.

## 2026-08-13 — Rapid Presence acknowledgements collided in SQLite

- **Observed:** Two immediate Presence mode changes could generate the same millisecond-based message ID and fail persistence with `UNIQUE constraint failed: messages.id`.
- **Expected:** Every user-visible state change must persist independently, even when operations are back-to-back.
- **Repair:** State acknowledgment IDs now use UUIDs instead of timestamp-only IDs.
- **Verification:** The full Vitest suite passes, including the rapid Ghost → Agent state synchronization test.

## 2026-08-13 — Social Mirror presented connector readiness as missing observations

- **Observed:** A connected native X account displayed “Connected, waiting for observations.” The Mirror had no durable sync state or zero-activity evidence, and the only way to populate it was to run a cognition-bearing Pulse.
- **Expected:** Connecting X starts an observation/reconciliation path. The Mirror owns observed social reality and freshness; a successful empty read is visibly “Up to date” with zero posts/mentions/conversations. Pulse consumes that context and remains separate from connector observation.
- **Root cause:** Native X reads lived inside `runNativePulse`; credential save only stored the connection. The UI treated absence of Mirror objects as proof that observation had not happened.
- **Repair:** Added native observation lifecycle metadata, initial reconciliation on credential save, an independent `syncNativeX` observer operation with a foreground interval, bearer-token read support, durable native Mirror upserts for own posts and mentions, truthful empty/degraded/error states, and Activity’s next-observation status.
- **Verification:** 43 unit tests pass; typecheck passes. Focused browser verification remains to be completed against the running app. No external X write was attempted by this repair.
