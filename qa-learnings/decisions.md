# Decisions

## 2026-08-13 — Keep Teach person-shaped and quiet on symbol-only cues

**What changed:** Teach now recognizes punctuation/symbol-only operator turns as low-information context, persists the operator message, and leaves the Agent response absent. Its provider prompt also names Teach as a conversation with the Agent's private mind and forbids generic AI-assistant onboarding.

**Why:** The reported transcript showed Teach responding to \`.\` and \`?\` with “share a question” and “what's on your mind?” boilerplate. The exact copy was persisted model output, not current source text, but the current operator prompt lacked the social-scale constraint and the runtime still had a canned reply path.

**Decision:** Preserve historical messages, avoid mutating protected Brain state implicitly, and enforce the immediate boundary in the Teach runtime plus prompt. Substantive teaching requests still invoke the configured provider and remain eligible for reviewable changes.

**Evidence:** The live SQLite-backed app state showed the assistant-like lines persisted in the existing conversation. A fresh isolated Chromium run produced one operator message and no Agent response for \`?\`; Presence Chat and durable Teach proposal flows remained green.

## 2026-08-13 — Treat low-information social cues as context, not reply obligations
## 2026-08-13 — Treat low-information social cues as context, not reply obligations

**What changed:** Added a general Brain and social-cognition rule for fragments, punctuation, emoji, brief acknowledgments, and casual greetings. The Agent must judge whether the cue opens a real exchange in the supplied thread and relationship, then choose the smallest natural response or `no_op`; it must not expand a one-character cue into an assistant-style onboarding prompt or invent a topic.

**Why:** Human social presence is not equivalent to answering every short string. The same `?`, emoji, or greeting can be a meaningful continuation in one relationship and noise in another. The canonical philosophy makes taste and silence first-class, while preserving the Agent's ability to be brief and socially warm.

**Evidence:** The focused Chrome Playground experiment produced high-confidence silence for punctuation-only, emoji, `ok`, and `Thanks` cases in fresh context. A fresh post-change isolated run chose `no_op` for `.` with rationale that a public response would be performative, and chose a short reply for `What's good?`, with no assistant-style onboarding copy. The browser-rendered Activity surface showed the casual reply as a Sandbox reply to the observed post.

**Decision:** Keep this as model-facing guidance, not a phrase classifier or deterministic response table. Existing active replay/planner work remains separate; no replay fixture, evaluator, or execution path was changed.

## 2026-08-13 — Keep Original Post Rehearsal silence truthful and failures observable

**What changed:** Local social mock mode now returns a structured original-post decision so the Sandbox publication lifecycle is testable. Invalid structured cognition responses are recorded as evaluation-unavailable rather than as intentional silence, and deliberate no-op copy now says the Presence chose silence and formed no post.
**Why:** The operator saw a rehearsal complete without a post, but the workflow did not distinguish an intentional identity judgment from an AI response-format failure. The feature must preserve silence as a valid outcome while making failures diagnosable.
**Requirements affected:** Original Post Rehearsal, Sandbox-only publication, structured social cognition, operator feedback, preference evidence, and the separation between Agent judgment and execution.
**Tests/evals affected:** Structured mock AI unit coverage, Sandbox no-op runtime coverage, Original Post Rehearsal Chromium + Pixel 5 E2E, typecheck, changed-file lint, and production build.
**Approved by:** User defect report and canonical OpenPresence philosophy.

## 2026-08-13 — Preserve raw Presence Brief drafts until save

**What changed:** Presence Brief territory textareas now keep their raw comma-separated draft text while editing and normalize entries only when Save brief is pressed.
**Why:** A comma is valid in-progress input syntax for these list-like fields. Rebuilding the controlled value from a filtered array on every keystroke erased a just-entered comma and made the fields feel broken.
**Requirements affected:** Presence-scoped identity, brief editing, territory/boundary clarity, and durable settings persistence.
**Tests/evals affected:** Chromium + mobile Settings E2E for trailing and internal commas, unit tests, typecheck, lint, production build, and `git diff --check`.
**Approved by:** User defect report and canonical OpenPresence philosophy.

## 2026-08-13 — Schedule timing describes relevance, not delivery

**What changed:** The Schedule form now hides the persisted execution-window string behind collapsed Timing options. Operators choose Flexible, Exact time, or Custom relevance; the list and calendar use consideration language.
**Why:** A standing intent gives the Agent permission to reconsider a future situation, not a promise to publish at a precise delivery time. The UI should teach that distinction without exposing implementation-shaped scheduling mechanics by default.
**Requirements affected:** Standing Intent UX, progressive disclosure, Agent judgment, execution-window compatibility, and Schedule responsive layout.
**Tests/evals affected:** Schedule default/collapsed and custom-timing Chromium + mobile E2E, unit tests, typecheck, lint, production build, and `git diff --check`.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Keep clarification broad and expression neutral

**What changed:** Added general model-facing guidance to preserve multiple plausible interpretations in a clarification and to avoid dismissive labels when evidence is uncertain. No social act, actor, phrase, scenario, or expected wording is hard-coded.
**Why:** Development failures showed a recurring planning/expression risk: a sincere underspecified question can be narrowed too early, and a technically correct response can still be socially sharper than the evidence warrants.
**Evidence:** Three GPT 5.6 Luna Low development sessions scored 97.917% act / 90.476% wording on the eight-case unseen clarification/tone fixture. One-session 48-case Boardy development and 18-case restraint regressions remained structurally valid at 97.917% / 95.833% and 97.222% / 100%, respectively. All six affordances remained Auto; `asset.inspect`, provider/model, and reasoning metadata were recorded.
**Decision:** Retain as a general cognition improvement, continue to treat the scores as diagnostic, and do not tune against the remaining cases. Frozen 130-case, holdout, human-review, and macro gates remain open.

## 2026-08-13 — Presence Brief is a situated social role

**What changed:** Added a Presence-scoped Brief with purpose, audience, primary territory, adjacent territory, and public boundaries. It is inherited from the Agent by default, persisted as Presence state and `PRESENCE.md`, and editable through settings or natural conversation.
**Why:** A Presence is the role an Agent inhabits in a particular social world, not merely a connector or channel configuration. Boundaries guide public expression and amplification while leaving observed world data available for judgment.
**Requirements affected:** Agent/Presence separation, cognition-safe context compilation, Social Mirror visibility, Ghost specialization, protected Agent identity, durable conversational configuration, and Presence settings order.
**Tests/evals affected:** 48 runtime tests, 122 full unit tests, typecheck, browser settings edit/reload verification, and `git diff --check`.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Confirm Review-to-Auto transitions with pending work

**What changed:** Settings now shows the exact number of pending review replies before changing a capability to Auto. Cancel keeps the capability in Review; confirmation enables Auto, approves the complete matching queue, and processes it through the existing simulated/native/Bridge execution path.

**Why:** Removing the operator checkpoint is a consequential execution decision. The confirmation makes the boundary explicit while keeping Agent judgment separate from operator approval and connector delivery.

**Requirements affected:** Execution envelope, approval safety, pending reply handling, Sandbox/live connector boundaries, and operator clarity.

**Tests/evals affected:** 117 unit tests, typecheck, lint, production build, `git diff --check`, and the focused Settings flow on Chromium and Pixel 5.

**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Make operator approval the Activity primary CTA

**What changed:** The pending `Approve execution` action now uses a high-contrast accent treatment, larger hit area, centered icon/label, hover elevation, and a visible keyboard focus ring.
**Why:** Approval is the operator's immediate decision in the execution lifecycle and must stand out from secondary Activity controls without implying that approval changes the Agent's judgment.
**Requirements affected:** Activity review discoverability, operator execution control, accessibility, and the Agent → Social Intent → Execution boundary.
**Tests/evals affected:** Chromium + Pixel 5 review lifecycle, CTA contrast/size/focus assertions, typecheck, lint, unit tests, production build, and `git diff --check`.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Stack Playground threads and scope Activity by Presence route

**What changed:** Playground now renders parent posts with their replies nested beneath them. Activity is filtered to the selected Presence's channel and Sandbox/live environment, simulated context is tagged `Playground`, and source context uses `↳`.
**Why:** Operators need to relate a reply to the observed conversation and understand which channel and embodiment produced an Activity record. Sandbox rehearsal must remain distinct from live delivery.
**Requirements affected:** Playground social context, channel-specific Activity, Sandbox isolation, event language, and the Agent → Social Intent → Execution → Outcome boundary.
**Tests/evals affected:** Runtime environment projection coverage, Playground thread geometry, Activity Playground tagging, Sandbox/live switching, review/manual execution lifecycle, typecheck, lint, production build, and Chromium + Pixel 5 browser verification.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-12 — Local-first modular monolith

**What changed:** OpenPresence starts as one persistent Next.js/Node application with SQLite-backed state and an embedded simulation worker.
**Why:** Minimize setup friction for self-hosted adoption while retaining explicit domain boundaries for a future hosted runtime.
**Requirements affected:** Local startup, durable state, agent/presence separation, simulated X execution.
**Tests/evals affected:** Boot, migration, state persistence, browser workflow, and execution-ledger tests.
**Approved by:** Product plan.

## 2026-08-12 — Native X connector and shared encrypted secret vault

**What changed:** Added a Presence-scoped Official X API connection with OAuth 1.0a user-context testing and native post delivery; retained Bridge and Manual Relay as alternatives. Added AES-256-GCM encrypted storage for X and provider secrets, with `OPENPRESENCE_SECRET_KEY` supported for production deployments and a local-only generated key for development/test data.
**Why:** A Bridge is an external fallback connector, not a replacement for an official channel integration. Channel credentials must remain separate from Agent model-provider access while sharing secure storage infrastructure.
**Requirements affected:** X Presence connection, read-only/read-write capability truth, native execution, credential persistence, provider access security, and the User → Agent → Presence hierarchy.
**Tests/evals affected:** 26 unit tests, 34 browser tests across Chromium and Pixel 5, production build, OAuth signing, encrypted storage, disconnect cleanup, and native X execution.
**Approved by:** User request and attached architecture correction.

## 2026-08-12 — Bridge Connector and Social Mirror vertical slice

**What changed:** Custom channel definitions, presence-scoped Bridges, a durable Mirror, REST inbound/outbound protocol, rotatable API keys, and leased execution claims were added while preserving simulated X behavior.
**Why:** OpenPresence must treat the Channel as the social environment and the Connector as infrastructure, allowing external executors to provide eyes and hands without leaking transport state into cognition.
**Requirements affected:** Custom Channels, Mirror/Inbox, Execution Outbox, reconciliation, privacy scope, loop-safe attribution, manual/Bridge embodiment.
**Tests/evals affected:** 14 runtime tests, 18 Playwright tests across desktop/mobile, production build, schema inspection, clean-start API smoke, authentication and duplicate-ingest assertions.
**Approved by:** Implementation of the confirmed Bridge plan.

## 2026-08-12 — Intent / execution / outcome ontology

**What changed:** Added canonical runtime entities for PresenceContext, ExecutionEnvelope, ChangeSet, StandingIntent, SocialIntent, Execution, Outcome, model profiles, tool bindings, publications, sources, assets, skills, and content drops. The first UI remains simulated, while intent attribution and expiry are now explicit.
**Why:** Preserve the cognition/embodiment boundary and make future growth attribution possible without turning Social Intent into a queue record.
**Requirements affected:** Architecture v1 sections 3, 11, 12, 29, 30, 32, 34, 37, 51, and 58.
**Tests/evals affected:** 13 runtime tests, normalized SQLite tables, API validation, 16 Playwright tests across desktop/mobile.
**Approved by:** Product plan.

## 2026-08-13 — Agent-first Playground CLI

**What changed:** Added a sandbox-only `openpresence playground` CLI with compact JSON projections, deterministic virtual-time and event controls, media inspection, and replayable JSON scenarios.
**Why:** AI agents such as Codex need a fast, machine-readable control surface for functional testing and cognition/evaluation loops without parsing the browser UI or unrelated application state.
**Requirements affected:** Playground rehearsal, agent evaluation, Sandbox isolation, auditable intent/execution/outcome visibility, and live-delivery safety.
**Tests/evals affected:** CLI contract tests, live local-app CLI smoke, scenario replay, typecheck, lint, production build, and existing unit/browser regression suites.
**Approved by:** User request.

## 2026-08-13 — Calendar is public history; Schedule owns future intent

**What changed:** Split the Presence navigation into Activity, Calendar, and Schedule. Calendar is a verified public-expression projection with Week/Month/Day views, filters, and an outcome inspector; Schedule retains Standing Intent editing and evaluation.
**Why:** The product needs an honest relationship with time: Activity is present operations, Calendar is historical truth, and Schedule is future permission. This preserves the Agent → Social Intent → Execution → Delivery → Outcome boundary and keeps silence/pending review out of public history.
**Requirements affected:** Presence navigation, public history, Standing Intent semantics, Social Mirror attribution, and outcome evidence.
**Tests/evals affected:** Public-history projection unit coverage, Schedule browser regression updates, typecheck, lint, and focused browser verification.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Provider access owns connection identity

**What changed:** Added OpenRouter to Brain provider access and runtime selection, using the existing OpenAI-compatible request path and standard OpenRouter endpoint. Provider connection names are now canonical and cannot be edited through the UI or runtime operation.
**Why:** Provider identity should remain legible and trustworthy; a credential form should configure access, not rename the external provider it represents.
**Requirements affected:** Provider access discoverability, OpenRouter configuration, runtime routing, and connection-state integrity.
**Tests/evals affected:** Runtime provider-label regression, OpenRouter endpoint routing test, Brain desktop/mobile E2E coverage, typecheck, lint, build, and `git diff --check`.
**Approved by:** User request.

## 2026-08-13 — Social Planner owns the act; evidence and expression remain separate

**What changed:** Added a provenance-backed `openpresence.social-evidence.v1` context compiler for Social Mirror objects, author history, prior Presence intents/executions/outcomes, media perception, network results, available actions, and execution truth. The model-based Social Planner now owns public act selection, including `clarify`; an expression editor may only revise wording for that act. A concrete contradiction must produce `needs_replan` before a new planner decision is allowed. The semantic evaluator scores act appropriateness and wording quality independently.

**Why:** The benchmark is a diagnostic instrument, not a source of deterministic social behavior. Structured evidence gives stronger models room to improve while preserving the Agent's judgment, restraint, identity boundary, and right to choose `NO_OP`.

**Requirements affected:** Social Mirror → Perception → Context → Planner → Expression → Social Intent → Execution separation, provenance, relationship continuity, media truth, network consent, and model portability.

**Tests/evals affected:** 70 targeted unit tests, typecheck, semantic evaluator syntax checks, Auto-mode repeated-run harness, and structural audit support. Full GPT benchmark, holdout, and fresh-session evidence remains pending valid provider configuration.

**Approved by:** User course correction and canonical OpenPresence philosophy.

## 2026-08-13 — General planner correction must clear unseen validation

**What changed:** Added model-facing guidance for two general failure classes: ask the smallest clarification for sincere underspecified questions, and do not provide unverified current-event or people guidance without authorized search evidence. Added a model-driven replan when a supported text act exceeds the channel limit; deterministic code owns only the mechanical constraint and does not replace the act with a canned response.

**Evidence:** The latest 48-case GPT Luna Low replay remained 98.958% act / 100% wording in a single regression run. The post-guidance 60-case holdout scored 98.333% act / 100% wording aggregate-only, and three fresh 20-case worlds each scored 100% act / 100% wording. All structural checks passed. A compact three-session generalization suite scored 95.833% act / 90% wording; its remaining act misses were truthful limitations caused by the lack of an authorized current-event search source.

**Decision:** Retain the change as a general cognition improvement. Do not add phrase-specific branches or fabricate current search results to improve the score. Treat current-source discovery as a connector/tool capability gap and keep the release verdict open until frozen, macro, and human-review gates are complete.

## 2026-08-13 — Show conversational turns in order while the Agent responds

**What changed:** Teach and Presence Chat now render the operator's submitted turn optimistically, show a shared accessible `Thinking` animation during the model request, and reconcile to the server response without duplicate submissions.
**Why:** Waiting for the response made the transcript appear empty and then revealed both turns at once, obscuring the conversational sequence and weakening trust in the Agent's visible cognition.
**Requirements affected:** Chat/Teach interaction state, Agent cognition legibility, session-only Presence Chat boundaries, durable Teach conversation boundaries, and privacy-safe loading language.
**Tests/evals affected:** Delayed-response Chromium + mobile E2E coverage for both surfaces, transcript cardinality assertions, responsive chat layout assertions, typecheck, lint, production build, and 123 unit tests.
**Approved by:** User request and canonical OpenPresence philosophy.

## 2026-08-13 — Make Activity explain how a Presence decision was reached

**What changed:** Activity now filters generic Presence-settings acknowledgements out of “What [Presence] decided,” labels the empty state as “No Presence decisions yet,” and shows each eligible row’s `Observed`, `Judgment`, and `Delivery` path with truthful missing-lineage fallbacks.
**Why:** Repeated infrastructure updates looked like identical social decisions and gave the operator no way to distinguish world evidence, Agent judgment, selected action, or delivery state.
**Requirements affected:** Activity provenance, operator legibility, configuration/event boundaries, and the Agent → Social Intent → Execution → Delivery → Outcome separation.
**Tests/evals affected:** Runtime event-boundary regression, focused Activity Chromium + mobile browser check, typecheck, lint, production build, and `git diff --check`.
**Approved by:** User request and canonical OpenPresence philosophy.
