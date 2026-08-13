# Active QA Work

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
