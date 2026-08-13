# Active QA Work

## IN_PROGRESS — Launch pulse and live native X Presence behavioral test

- **Started:** 2026-08-12
- **Scope:** Implement and run the attached 10-minute end-to-end test against the real configured X Presence for `@hourandcode`: launch pulse on wake, one Agent-authored public post, real inbound reply, contextual response, continuity check, and truthful OpenPresence activity state.
- **Acceptance:** No simulator or fabricated records are used; a live test passes only when X externally proves each delivery and the Agent observes/responds to real inbound activity. Stop and wait for the operator when a different X account must send the required reply.
- **Verification:** Chrome pre-flight passed: `@hourandcode` was signed in, the native connector authenticated the account and reported read + write credentials, Posts were Auto, Replies were Review, and the local model answered. The first stale-app attempt was discarded because port 3004 was not running. After restarting the branch server, the exact Chat instruction formed a Social Intent and native execution, but X rejected `POST /2/tweets` with HTTP 403 while the real X profile still showed `0 posts`. The implementation now performs a real native read on wake, carries public footing into cognition, chooses a first move through the selected Agent runtime, and records failed delivery/connection health truthfully. Live verification remains blocked at the external X write boundary until the next real attempt returns an external post ID/URL; no reply test should begin before that artifact exists.

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
