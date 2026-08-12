# OpenPresence end-to-end functional reality audit

Date: 2026-08-12  
Scope: local-first OpenPresence application, clean production build, Chromium and mobile browser matrix, Vitest/API checks.  
Verdicts: `PASS` means the audited local path is real and verified; `PARTIAL` means a real local slice exists but an important requirement is missing; `NOT IMPLEMENTED` means no honest implementation was found.

## Evidence

- `pnpm test`: 20/20 unit/runtime tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed after a clean generated-artifact rebuild.
- `pnpm test:e2e`: 32/32 passed across Chromium and Pixel 5.
- Production smoke: `GET /` returned 200 and `GET /api/state` returned JSON 200 from `next start`; invalid state operations and unauthenticated Bridge requests returned JSON errors.
- Browser paths covered: blank-state Agent/Presence creation, Agent switching, Presence switching, persistent Chat, Context & Changes, Brain model/skill/provider setup, Calendar intent creation/evaluation, Live review/manual execution, Presence settings, Bridge onboarding/mirror events/queued execution, responsive shell, and small desktop layout.

## Story verdicts

| # | Story | Verdict | Reality / remaining boundary |
|---:|---|---|---|
| 1 | User / Agent hierarchy | PARTIAL | Multiple durable local Agents and isolated workspaces work; there is no user authentication or tenant isolation in this local slice. |
| 2 | Presences | PASS | Multiple durable Presences, selection, Ghost/Agent-owned identity, pause, and isolation are covered by runtime and browser tests. |
| 3 | Custom channels | PARTIAL | Custom channel definitions and Bridge onboarding work; full reusable channel management and external channel configuration are not complete. |
| 4 | Chat | PARTIAL | One persistent Agent conversation is real; reply generation is canned/local and attachments are filename-only. |
| 5 | Conversation as configuration | PARTIAL | Supported commands create/apply real local proposals and intents; arbitrary natural-language domain interpretation is not implemented. |
| 6 | ChangeSets | PARTIAL | Durable proposed/applied provenance exists; immutable diff history and inverse rollback are incomplete. |
| 7 | Chat right sidebar — Context & Changes | PARTIAL | Scope, durable changes, outputs, and truthful counts render and persist; temporary files and item inspection are not full model context. |
| 8 | Model runtime | PARTIAL | Model selection and provider readiness persist in Brain; Chat does not call a real provider runtime. |
| 9 | Multimodal Chat input | PARTIAL | The control accepts a local filename into the conversation; no binary persistence, extraction, or perception pipeline is wired. |
| 10 | Assets and sources | NOT IMPLEMENTED | No complete Source → Asset discovery/inspection/publication journey. |
| 11 | Perception | NOT IMPLEMENTED | No verified image/perception tool path. |
| 12 | Skills | PARTIAL | Skill definitions, installation, and Agent scoping are real; executable contextual skill workflows are not complete. |
| 13 | Tools | NOT IMPLEMENTED | Provider-neutral tool invocation is not wired end-to-end. |
| 14 | Publications | PARTIAL | Text publication records and local execution paths exist; rich media/thread/quote workflows are absent. |
| 15 | Standing Intents / Calendar | PASS | Calendar creation, persistence, week view, evaluation, and refresh behavior are covered. |
| 16 | Social Intents | PASS | Local Social Intent records are formed from evaluated intents and linked to execution records. |
| 17 | Execution Envelope | PASS | Off/manual/review/auto modes are represented and persisted locally; custom pacing remains a separate gap. |
| 18 | Review mode | PASS | Browser-verified approve → execute lifecycle with durable outcome state. |
| 19 | Manual mode | PASS | Browser-verified external reference → mark posted lifecycle with no auto-execution. |
| 20 | Auto mode | PARTIAL | Local simulator can complete auto work; no real external connector delivery is proven. |
| 21 | Off mode | PASS | Off prevents executable realization in the tested local path. |
| 22 | Pacing / custom rhythm | PARTIAL | Recommended pacing is represented; Custom can be selected but has no real editable pacing controls/runtime enforcement. |
| 23 | Live | PARTIAL | Live reflects persisted local Presence events and filters; deterministic simulator metrics and external runtime events are not real. |
| 24 | Live review queue | PARTIAL | Pending review and lifecycle controls work; a complete multi-item queue with edit/reject/expiry UX is not complete. |
| 25 | Social Mirror | PASS | Bridge events persist MirrorEvent/MirrorObject state and appear in Live with refresh coverage. |
| 26 | Mirror security / privacy | PARTIAL | Local visibility filtering and Bridge credentials exist; comprehensive public/private policy enforcement is not complete. |
| 27 | Bridge connector | PASS | Onboarding, key issuance/revocation, health, and reconnect behavior are covered locally. |
| 28 | Bridge inbound events | PASS | Authenticated event ingestion, normalization, persistence, and archived deletion behavior are tested. |
| 29 | Reconciliation | PARTIAL | Cursor/sync state and conservative reconciliation exist; authoritative remote delete/conflict semantics are incomplete. |
| 30 | Delivery outbox | PARTIAL | Execution queue acts as a local outbox; a separate durable Delivery domain/entity is not present. |
| 31 | Leases | PASS | Claim/lease/expiry behavior is covered in runtime tests. |
| 32 | Delivery idempotency | PASS | Conflicting external acknowledgement identities are rejected and tested. |
| 33 | Uncertain delivery | NOT IMPLEMENTED | No explicit operator-facing uncertain-delivery recovery state. |
| 34 | Expiration + delivery | PARTIAL | Expiry is represented before execution; late delivery/reconciliation edge cases are incomplete. |
| 35 | Manual relay connector | PASS | Manual relay is reachable and its completion is recorded with an external reference. |
| 36 | Simulated X | PARTIAL | Simulation is clearly local in UI/runtime, but its shortcut path is not equivalent to a real connector delivery pipeline. |
| 37 | Presence connection state | PARTIAL | Local Bridge/Presence state is surfaced; simulator “live” and health indicators cannot prove external connectivity. |
| 38 | Presence settings | PASS | Settings are generated from channel capabilities and tested for identity, envelope, pacing, connection, and pause behavior. |
| 39 | Ghost mode | PASS | Ghost identity persists without overwriting Agent-level state; cross-Presence behavior is tested. |
| 40 | Brain | PASS | Brain/model/skills are Agent-scoped and remain stable while Presence selection changes. |
| 41 | Protected Brain file editing | PARTIAL | Proposal/apply flow exists; complete revision history and rollback are missing. |
| 42 | Memory / Growth | PARTIAL | Files persist and protected edits use proposals; evidence-linked automatic Growth updates are not complete. |
| 43 | Outcomes | PARTIAL | Local Outcome records exist, but world response is not independently observed from real delivery. |
| 44 | Metrics | PARTIAL | Some counts are state-backed; simulator metrics remain deterministic sample-like values and are not external analytics. |
| 45 | Persistence | PASS | SQLite state survives refresh and clean application restart in the local slice. |
| 46 | Source-of-truth audit | PARTIAL | SQLite has an app_state compatibility record plus normalized projections, and mutations use whole-state writes; this is a known concurrency/authority risk for production scale. |
| 47 | No-fake-UI audit | PARTIAL | Tested controls are actionable or explicitly local; several visible domain surfaces remain intentionally partial (providers, assets, tools, rich publications). |
| 48 | Error states | PARTIAL | Invalid input, auth failure, malformed JSON responses, and conflicting ACKs are handled; provider failure, asset failure, and uncertain delivery UX are incomplete. |
| 49 | Cross-scope isolation | PASS | Agent/Presence/Mirror isolation paths are covered locally; there is no multi-user authorization boundary. |
| 50 | Restart / recovery | PARTIAL | Durable pending state, Bridge state, and cursors survive restart; crash recovery for every delivery uncertainty mode is not proven. |

## Release assessment

The local-first MVP is operationally verifiable for its implemented slice, with 18 stories fully passing, 28 partial, and 4 not implemented under the supplied strict definition of functional. The app should not be represented as fully production-ready for real provider calls, external social delivery, assets/sources, perception, provider-neutral tools, rich publications, or multi-user deployment. Those are explicit follow-up work, not hidden success states.

The current release blockers for a genuinely production-capable product are:

1. Replace canned/simulated model and social execution paths with provider/connector implementations and truthful delivery reconciliation.
2. Implement the Source/Asset/perception/tool/publication workflows.
3. Add authentication, authorization, and user/tenant isolation.
4. Split high-concurrency protocol state from whole-state `app_state` read/modify/write mutations and prove crash recovery for uncertain delivery.
5. Add explicit runtime-backed error and uncertain-delivery UI for the remaining partial journeys.

## Regression follow-up

The audit’s newly learned rules are recorded in `qa-learnings/regression-rules.md`: state-backed runtime summaries, reachable review/manual execution lifecycles, explicit Bridge deletion/ack identity, and response-shape validation before JSON parsing. The corresponding runtime, API, and browser checks are part of the current test suite.
