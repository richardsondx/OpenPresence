# Open-source publication audit

Reviewed 2026-10-07. This is a source-publication review, not a certification of
all autonomous product capabilities or internet-facing deployment security.

## Publication decision

**Keep the repository private until GitHub has purged the old pull-request refs
and cached views, and the historical encryption-key exposure is addressed.**

The authorized security sweep rewrote local branch/tag histories after a full
private ZIP backup. The rewritten histories remove databases, encryption keys,
captured QA evidence, account-specific recovery scripts, operational reports,
old screenshots, personal filesystem paths, private runtime IDs, and identifying
operator examples. Commit identities use a public noreply address. Current
source remains intact apart from the deliberate privacy and cleanup changes.

GitHub retains three old pull-request head refs that ordinary branch pushes
cannot rewrite. Request their removal and cached-object cleanup through GitHub
Support before making the repository public. Other clones must migrate to the
rewritten history; merging or pushing old history can restore the removed data.
Never publish the original ZIP, old repository refs, or private local captures.

The removed historical key matches the primary local encryption key. The live
key and databases were preserved. Encrypting credential columns does not encrypt
conversations or the whole database, and removing a key from Git does not revoke
it. Rotate affected external credentials if necessary and re-encrypt live stored
credentials with a coordinated key migration before releasing historical access;
never simply replace the key file and strand encrypted credentials.

## Backup and history verification

The private backup is stored outside the project in the sibling
`OpenPresence-private-backups/` directory as
`OpenPresence-before-security-sweep-2026-10-07.zip`. It contains all remaining
project files, Git history, databases, keys, and local evidence after the
explicitly authorized generated-file cleanup. Its ZIP CRC checks and SHA-256
checksum passed. Folder/file permissions restrict access to the owner. The
archive deliberately contains sensitive material and must remain private.

The rewrite was verified in a separate mirror before adopting it locally.
Gitleaks scanned all rewritten commit refs with two decode levels and found no
secrets. A real TruffleHog Git scan processed retained history with external
credential verification disabled: only the two reviewed synthetic URI rejection
fixtures remained. Independent checks found zero forbidden historical paths and
confirmed that the historical key blob is absent from retained history. Internal
checkpoint refs carrying unfiltered trees were removed from the cleaned source;
originals remain in the private backup. Linked working files were preserved.

The current source tree before and after filtering was identical. Runtime-profile
and projection tests now use synthetic isolated identities. Publication-review
browser tests use a small synthetic workspace instead of a captured personal
workspace, and the synthetic seven-day golden lives in `tests/fixtures/`.

## Artifact organization and database privacy

Curated public interface captures live in `docs/screenshots/`. Old root-level
captures are preserved locally under the ignored `out/local-artifacts/root-captures/`
folder. Generated release archives and manifests stay under `out/`; private runtime
state stays under `data/`. Project guidance and root build/configuration files
remain in their established locations so existing entry points continue to work.

Local databases contain conversation history, people and account identities,
observed social content, Agent memory/configuration, and encrypted provider/channel
credentials. Treat the entire database and its backups as private; encryption of
credential columns does not encrypt the rest of the database. No database or key
files are tracked in the current source. Ignore rules cover `.db`, `.sqlite`, and
`.sqlite3` files and their sidecars, the entire runtime directory, and root capture
formats. These rules do not remove database or key objects from earlier commits.

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
passes: 171 suites passed, 2 skipped; 1,625 tests passed, 3 skipped. Typechecking,
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

Generate a fresh history-free snapshot and scan that exact snapshot:

```bash
pnpm export:public -- out/openpresence-public-next
gitleaks dir out/openpresence-public-next --redact
```

This export excludes Git metadata and ignored runtime/evidence files. A new
repository initialized inside it is the safest alternative if GitHub cannot
purge the existing repository's retained refs. Otherwise, publish only after
confirming the rewritten remote refs, GitHub's retained-object cleanup, and
credential/key remediation. Keep secret-scanning push protection enabled.

See [GitHub's sensitive-data removal guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
for cached refs and clone remediation. Do not fetch, merge, or push original refs
into the cleaned repository.
