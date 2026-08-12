# Project Baseline

## Product

**Target customer:** A builder who wants to put an intelligent public or Ghost presence into the world.
**Core problem:** Consistent, thoughtful social presence requires judgment, memory, and ongoing attention.
**Core customer value:** Create a persistent agent with a mind, mission, taste, and presence; then watch it act and learn.
**Major capabilities:** Onboarding, Chat, Live, Calendar, Brain, Presence, simulated X runtime, memory, growth, action ledger.
**Important user stories:** Create agent, configure it conversationally, review activity, schedule intent, control execution, protect identity, pause presence.
**Important product claims:** Markdown expresses meaning; structured state enforces reality; no-op is valid; every action is auditable.

## Roles

- local operator

## Testability

**Browser QA method:** Playwright plus the connected Chrome browser when available.
**Authentication testing method:** Local operator mode; no external auth in the local slice.
**Seed/fixture strategy:** Explicit demo creation in onboarding; deterministic simulated X events and runtime.
**Database verification strategy:** SQLite-backed API state and integration tests.
**API verification strategy:** Route-level tests through the running app and persistence assertions.
**AI eval/replay strategy:** Deterministic BrainRuntime fixtures with property-based expectations; no paid calls required.

## Environment

**Development:** `pnpm install && pnpm dev`.
**Test/staging/preview:** Local test database and Playwright web server.
**Production:** Not deployed by this goal.
**Important environment differences:** Simulated X adapter; no live external mutations.

## Requirement confidence

- ✅ confirmed: local-first app, three primary surfaces, agent/presence architecture, simulated X MVP.
- 🟡 inferred: local operator is the only role in this slice.
- ❓ unknown: live X OAuth details for Phase 2.

## Takeover status

**Takeover audit date:** 2026-08-12
**Human-confirmed assumptions:** Local-first vertical slice and production-ready QA bar.
**Last delta audit:** 2026-08-12
**Important unresolved gaps:** Live channel credentials and hosted deployment are intentionally out of scope.
