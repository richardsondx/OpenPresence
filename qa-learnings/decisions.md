# Decisions

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

## 2026-08-13 — Make Activity explain how a Presence decision was reached

**What changed:** Activity now filters generic Presence-settings acknowledgements out of “What [Presence] decided,” labels the empty state as “No Presence decisions yet,” and shows each eligible row’s `Observed`, `Judgment`, and `Delivery` path with truthful missing-lineage fallbacks.
**Why:** Repeated infrastructure updates looked like identical social decisions and gave the operator no way to distinguish world evidence, Agent judgment, selected action, or delivery state.
**Requirements affected:** Activity provenance, operator legibility, configuration/event boundaries, and the Agent → Social Intent → Execution → Delivery → Outcome separation.
**Tests/evals affected:** Runtime event-boundary regression, focused Activity Chromium + mobile browser check, typecheck, lint, production build, and `git diff --check`.
**Approved by:** User request and canonical OpenPresence philosophy.
