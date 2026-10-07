# Contributing to OpenPresence

Start with the [README](README.md) setup and the
[product philosophy](docs/OpenPresence_Vision_and_Platform_Philosophy.md).
[FEATURES_MAP.md](FEATURES_MAP.md) owns feature navigation;
[CAPABILITY_LEDGER.md](CAPABILITY_LEDGER.md) records behavioral evidence and limits.
Project development skills live in `.agents/skills/` and carry reusable workflows,
not deployment credentials.

## Making a change

1. Explain the user outcome or reproducible defect in an issue or pull request.
2. Keep changes focused. Preserve Agent/Presence scope, privacy, authority, and the distinction between intent, attempted delivery, and verified outcome.
3. Use synthetic data and isolated databases. Test the affected behavior, including persistence and relevant failure paths.
4. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `git diff --check`. Run the build and browser checks when relevant; report any existing failures honestly.
5. Include the problem, resulting behavior, validation, and known limits in the pull request.

Before adding a file, inspect `git diff --cached` and run
`gitleaks git --redact .` (see [Gitleaks](https://github.com/gitleaks/gitleaks)).
Never add credentials, environment files, databases, browser sessions, private
conversations, raw social captures, or generated proof artifacts. `.gitignore`
does not remove already tracked files or historical commits. Historical captured
corpora are intentionally unavailable in the public checkout; optional research
scripts that need them require separately obtained local input.

Report security vulnerabilities privately using [SECURITY.md](SECURITY.md).
By contributing, you agree that your contribution is available under the
project's MIT license. Preserve third-party license notices.
