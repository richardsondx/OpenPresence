# Repair log

This log records repairs made when observed behavior contradicted the OpenPresence vision. It distinguishes implementation defects from external blockers and never treats a local fixture as an external success.

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
