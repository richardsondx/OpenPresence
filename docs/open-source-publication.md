# Open-source publication audit

Reviewed 2026-10-07. This is a source-publication review, not a certification of
all autonomous product capabilities or internet-facing deployment security.

## Publication decision

**Publish a clean source snapshot with a new Git history. Do not make the existing
repository public or push its original branches and tags to a public repository.**

The original history contains private SQLite databases/backups and a local
`.secret-key` under an old temporary rehearsal directory. That commit is present
in the existing remote history. Ignoring or untracking those paths does not erase
their Git objects. The existing GitHub repository was private at audit time.
No remote visibility, history, or account credentials were changed by this work.

The preparation preserves original files locally while removing 571 private or
generated files from Git tracking. This includes raw QA reports, conversations,
browser traces, screenshots outside the curated docs gallery, captured social
corpora, a local Remotion QA project, cached Python bytecode, and an ad-hoc script
with personal paths. Synthetic scenarios, tests, eval criteria, project skills,
curated demo screenshots, and generalized regression rules remain source.

## What was inspected

- Current tracked source plus non-ignored pending files; environment and runtime-data ignore coverage.
- All 646 reachable commits/refs and sensitive historical object filenames.
- All project development skills, scripts, references, source provenance, and bundled licenses.
- Documentation, synthetic evaluations, scenarios, captured corpora, browser traces, and demo screenshots.
- Dependency registries, the lockfile, runtime setup, production build, typechecking, lint, and unit tests.

TruffleHog 3.86.1 scanned history with credential verification disabled: eight
unverified Privacy detections in historical database backups. Gitleaks 8.24.2
also scanned history and returned 25 heuristic detections in historical captured
state/build artifacts. These are not claims that credentials are active; the
private databases and key make the history unsuitable regardless of detector
classification. Binary encryption keys need not match a scanner's credential regex.
No detector was allowed to validate credentials against external services.

The clean source export is checked with both scanners. Gitleaks returns zero
findings. TruffleHog's two URI findings are intentionally unsafe synthetic URLs in
`tests/chat-rich-text.test.ts` and `tests/browser-research.test.ts`, using
`example.org`; they test rejection of URLs containing user information.

## Changes and safeguards

The README now has a clear introduction, curated demo gallery, correct first-run
instructions, architecture guide, and explicit development status. MIT licensing,
contribution guidance, security reporting/deployment boundaries, and third-party
notices are included. TypeSafe AI's bundled MIT notice remains intact.

Personal filesystem paths and identifying operational account examples were
generalized. The debugging skill now requires private context to be inspected
locally and redacted before shared logs/proof. Raw operator feedback and captures
stay local. Hidden evaluation grading criteria are synthetic test material;
“private” in their filename does not mean private operator data.

Git ignores cover environment files, all runtime data, browser state, databases,
keys, backups, traces, Python caches, and local QA captures. The source-security
workflow scans full Git history with redacted Gitleaks output and rejects private
runtime/evidence paths in both current files and historical objects. Optional
Gitleaks pre-commit configuration is included.

The exporter applies ignore rules even to tracked files, copies current pending
source, rejects symlinks and existing destinations, and never copies `.git`.
It does not certify arbitrary new source; scan each newly generated export.

## Dependency and verification limits

Production dependencies now pass `pnpm audit --prod` with zero reported
vulnerabilities. Next.js/its ESLint config, Sharp, source-map-js, Vitest/Vite,
js-yaml, and brace-expansion were updated to patched versions.

The complete dependency audit retains one **high, development-only** advisory:
`braces@3.0.3`, through `eslint-config-next → fast-glob → micromatch`.
There is no published patched version. See
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The audit is intentionally not suppressed. Keep lint configuration/pattern inputs
trusted and revisit the upstream dependency when a patch becomes available.

Fresh-workspace HTTP checks returned 200 for `/` and `/api/state` without inherited
credentials or personal data. The production build passes in isolated source,
with one schema-initialization worker to avoid SQLite migration races. A separate fresh `pnpm install --frozen-lockfile` succeeds. Full unit verification
passes: 170 suites passed, 2 skipped; 1,622 tests passed, 3 skipped. Typechecking,
scoped lint, full lint (170 warnings, zero errors), and staged/unstaged whitespace
checks pass. The Vitest upgrade explicitly lowers preserved JSX and gives bounded
subprocess tests 15 seconds. The final source export passes Gitleaks
(including two decode levels), the reviewed TruffleHog scan, an independent
credential-signature scan, and filename/personal-path checks. No runtime data,
Git metadata, or local evidence captures are included. Full browser/live-account and real-model
behavior certification are outside this source-publication audit. The existing
capability ledger's limitations remain unchanged; historical local evidence links
may be unavailable in the public checkout.

## Publish the prepared source

The reviewed snapshot is generated under `out/openpresence-public/`, outside the
tracked source set, and packaged as `out/OpenPresence-public.tar.gz`.
To generate a later snapshot, choose a new empty destination:

```bash
pnpm export:public -- out/openpresence-public-next
gitleaks dir out/openpresence-public-next --redact
```

After reviewing and scanning the exact source you intend to publish, initialize
a new Git repository **inside the clean export**, with a new remote. Do not copy
`.git`, fetch the old private repository, push old refs, or change the existing
repository's visibility. Those actions would reintroduce the historical material.

```bash
cd out/openpresence-public
git init -b main
git add .
gitleaks git --staged --redact .
```

Review the staged source, then commit and publish through your chosen GitHub
workflow. Enable secret-scanning push protection and private vulnerability
reporting on the new repository. If any affected credentials were exposed outside
trusted private storage, revoke/rotate those external credentials; do not blindly
replace your current database encryption key without a migration.
