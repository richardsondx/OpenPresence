# Regression rules

## Rule: Playground threads and Activity scopes must preserve social context

**Defect class:** Social thread presentation / channel-environment leakage

**General principle:** A social reply must render with its parent, and operational Activity must be scoped to the selected Presence's channel and embodiment; projections must not flatten thread context or mix Sandbox and live records.

**Project-specific risk:** A flat Playground object list made Jenny replies look unrelated; Activity filtered by Presence only and mixed Sandbox with live-route records; causal copy exposed implementation-shaped context.

**Project enforcement:** `PlaygroundThreadFeed` groups objects by `parentExternalRef`; `LiveView`, `MirrorPanel`, `ExecutionLedger`, and `deriveActivitySummary` filter the selected Presence/channel/environment/session; `ActivityEventDetail` and `.event-context-preview` use the `Playground` tag and `↳`.

**Executable protection:** `tests/e2e/openpresence.spec.ts` covers reply stacking and Sandbox/live Activity isolation on Chromium + Pixel 5; `tests/runtime.test.ts` covers Activity environment scoping.

**Apply when:** Changing Playground, MirrorObject lineage, Activity, Presence routing, channel selection, event context, or review execution projections.

**Added:** 2026-08-13

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

**Project enforcement:** `openpresence playground` targets `/api/state` only with Playground operations, projects state into Presence/world/decisions/review/timeline records, supports deterministic virtual time and JSON scenarios, and requires `--human` for non-machine output. Documentation uses `pnpm --silent` so package-manager banners cannot corrupt JSON streams.

**Executable protection:** `tests/playground-cli.test.ts` verifies projection redaction, operation translation, and structured server errors. Local smoke verification covers `start`, `inspect`, `inject`, `advance`, `timeline`, and scenario replay against the production-shaped app.

**Apply when:** Changing the Playground CLI, scenario format, agent-facing state projections, sandbox commands, or command output formatting.

**Added:** 2026-08-13

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

**Incident:** During the 2026-08-13 X experiment, the browser session was switched to the operator's `@RichardsonDx` account and a substantive reply was posted there. The post was authored by the test operator path, not Jenny's native X connector. The screenshot made the account identity visible, but the test was not stopped at the account boundary.

**Project enforcement:** Live X delivery is verified only through the Presence-scoped native connector shown in `state.nativeConnections[].account`; for this Presence that account is `@hourandcode`. A second-account reply must be authored by the operator or another explicitly authorized tester. If that input is needed and no separately authorized test account is available, stop and wait. Never switch a browser session to an operator account to manufacture it.

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
