# Regression rules

## Rule: Dialogs must center within the usable workspace

**Defect class:** Modal layout / visual alignment

**General principle:** A dialog in an application shell should center within the active page workspace, not behind navigation chrome, and should remain vertically centered when the viewport has room.

**Project-specific risk:** Add Presence was centered against the full viewport and pinned to the top by a later shared modal rule, making it appear offset from the page content beside the sidebar.

**Project enforcement:** Add Presence uses the scoped `.add-presence-modal-backdrop` class, which centers within the desktop workspace offset and returns to the full viewport on mobile.

**Executable protection:** `tests/e2e/openpresence.spec.ts` measures the rendered dialog against `.workspace` and the backdrop at desktop and mobile sizes, asserting horizontal and vertical offsets below 2px.

**Why QA missed it:** Existing Add Presence coverage verified that the dialog opened and submitted but did not inspect rendered geometry or the hidden-state visual layout.

**Apply when:** Adding or changing dialogs, modal backdrops, shell navigation widths, or responsive layout rules.

**Added:** 2026-08-12

## Rule: Paused state must change the primary status language

**Defect class:** State / UX contradiction

**General principle:** A page's primary heading and controls must describe the current lifecycle state, especially when an action is paused, cancelled, or unavailable.

**Project-specific risk:** Live previously said “Jenny is live” while the Presence was paused, and the pulse control silently did nothing.

**Learned from:** Production Chrome exploratory review on 2026-08-12.

**Why QA missed it:** The first walkthrough verified pause controls and the paused badge but did not re-check the Live page heading after navigating back.

**Project enforcement:** `LiveView` status copy and pulse button state; exercise pause → Live → resume in browser QA.

**Executable protection:** `tests/runtime.test.ts` covers paused pulse behavior; Playwright acceptance should cover paused Live copy.

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
