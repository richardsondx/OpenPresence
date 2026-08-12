# Decisions

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
