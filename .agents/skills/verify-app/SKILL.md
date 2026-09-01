---
name: verify-app
description: Verify OpenPresence engineering changes against the real running application using realistic user paths, semantic Playwright interaction, persisted state, diagnostics, and objective evidence. Use for feature validation, bug reproduction, targeted regression, UI behavior, performance checks, and proving work is complete; do not use as a generic test-writing checklist.
---

# Verify App

Use this skill after changing OpenPresence behavior, UI, runtime orchestration, persistence, connectors, or performance. It is a verification layer that composes with normal engineering work.

## Product boundary

OpenPresence is a persistent Agent with one or more Presences. Preserve the separation between observed world, Social Intent, Execution, Delivery, and verified Outcome. Consult the canonical [OpenPresence philosophy](../../../docs/OpenPresence_Vision_and_Platform_Philosophy.md) when the affected behavior is cross-cutting or its scope is unclear. A UI success state, queued execution, draft, or API response is not automatically a world outcome.

Read [features/README.md](references/features/README.md) first, then read only the feature files matching the diff and realistic regression surface. Update the map in the same change when routes, entry points, selectors, flags, or proof requirements drift.

## Required verification loop

1. Determine the direct behavior, adjacent regression surface, persistence implications, and relevant feature-map files from the request and diff.
2. Run `node .agents/skills/verify-app/scripts/verify-app.mjs doctor`. Use the harness-owned isolated runtime by default. `doctor` must pass before product claims are made; it reports the checkout identity, URL, port, SQLite path, Next dist directory, browser profile, PID, and workspace revision.
3. Run proportionate static checks: targeted Vitest/Playwright tests, typecheck, lint, build, or the relevant subset. Do not replace product verification with a test result.
4. Start or restart the fresh runtime with `start`/`restart`, then exercise the actual user path through the browser. Prefer semantic `--role`/`--name`, `--label`, `--placeholder`, and `--testid` locators. Use `open`, `click`, `type`, `press`, `select`, `submit`, `upload`, `wait-for`, and `assert`.
5. Reach a stable observable end state and inspect side effects with `snapshot`, `state --projection <name>`, `route`, `errors`, `network-summary`, or a second UI read. Test only materially related success, cancel, error, empty/loading, disabled, reload, alternate-entry, or responsive paths.
6. Capture evidence with `screenshot`, `snapshot`, state output, logs, or performance metrics. Evidence is written under the isolated runtime's `evidence/` directory unless an explicit path is supplied.
7. If verification fails, classify it as implementation, harness, stale environment, test data, external dependency, or unsupported path. Fix the appropriate layer and repeat. Do not weaken an assertion or silently skip a failure. Stop only at `PASS` or a concrete `BLOCKED` condition.

Typical isolated setup:

```bash
node .agents/skills/verify-app/scripts/verify-app.mjs start
node .agents/skills/verify-app/scripts/verify-app.mjs doctor
node .agents/skills/verify-app/scripts/verify-app.mjs reset-session
node .agents/skills/verify-app/scripts/verify-app.mjs open activity
node .agents/skills/verify-app/scripts/verify-app.mjs snapshot
```

The harness uses test mode, deterministic AI/X mocks, a derived port, a fresh SQLite file, a unique Next development directory, and a persistent Playwright profile derived from this checkout. It never points reset operations at the canonical workspace. An explicitly supplied external URL is rejected by `doctor` unless `OPENPRESENCE_VERIFY_ALLOW_EXTERNAL=1` is deliberately set; never use that override for a claim that requires ownership or freshness.

## Evidence bar

Reject these as insufficient on their own: app launch, page render, a passing test, source inspection, component existence, HTTP 200, an unrelated screenshot, or directly calling an internal handler instead of exercising the user trigger.

For every claim, record:

- the requested user-observable behavior;
- the real trigger and entry point used;
- the stable end state observed;
- important persistence, network, file, database, or world side effects;
- the evidence artifact path;
- relevant paths that were not verified and why.

Instrumentation may inspect state after the user flow executes. It must not bypass the production boundary being verified. A skeptical engineer should be able to answer “yes, this demonstrates the requested behavior actually works.”

## Harness command guide

The executable surface is `scripts/verify-app.mjs`; run it from any directory in this checkout.

- Lifecycle/safety: `doctor`, `info`, `start`, `restart`, `stop`, `cleanup --dry-run`, `cleanup --confirm`.
- Browser: `open <surface>`, `route`, `snapshot`, `screenshot`, `click`/`aria-click`, `type`, `press`, `select`, `submit`, `upload`, `wait-for`, `wait-settle`, `assert`.
- Observability: `state --projection activity|chat|schedule|playground|...`, `console`, `errors`, `network-log`, `network-summary`, `logs`, `perf-metrics --runs 3`.
- Fixtures: `reset-session` for isolated state; `seed-state --scenario scenarios/<file>.json` to use the existing sandbox CLI through the running server. Sandbox state is rehearsal, not live delivery.
- Drift: `maintenance` checks the feature-map links and executable harness prerequisites.

All commands emit JSON and use non-zero exit codes for genuine failures. Wait for observable conditions; do not add arbitrary sleeps to a verification flow. `cleanup` is dry-run unless `--confirm` is supplied and targets only the resolved harness runtime directory.

## Feature-map maintenance

Feature files describe behavior, not source folders. Each one must document the user POV entry points, concrete harness selectors/commands, proof, and gotchas. Add a journey file when a behavior crosses surfaces (for example create → reload → persistence or Chat → Activity → verified outcome), but keep selectors in the individual feature files.

When behavior changes, check navigation paths, semantic labels/test IDs, projection names, feature flags, account/entitlement state, sandbox/live separation, and persistence after reload or restart. Run `maintenance` after updating the map. Do not rewrite stable infrastructure without a demonstrated drift or missing primitive.

## Final report contract

When this skill is used, the final engineering response includes:

```text
Verification: PASS | FAIL | BLOCKED

Verified:
- <behavior>

Checks:
- `<command>` — PASS

Product verification:
- <real user flow> — PASS
- <observable outcome>

Evidence:
- <artifact path or structured output>

Not verified:
- <only genuine relevant gaps and why>
```

Never claim `Verified` without running the flow and capturing evidence. `BLOCKED` must name the concrete external or unsupported condition and preserve the failed evidence.
