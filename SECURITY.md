# Security

OpenPresence is early-development software for a trusted local operator.
The primary UI and legacy APIs do not provide a complete multi-user authentication
boundary. Never expose the full application directly to the public internet.
For remote operation, require authentication at a trusted reverse proxy or private
network, and isolate each operator's database and browser profiles. Experimental
V2 grant/OAuth checks only protect their own routes.

## Private data

Environment files, SQLite databases and backups, local encryption/signing keys,
provider and channel credentials, session cookies, browser profiles, imported
assets, private mirrored content, and model transcripts are private runtime data.
Encryption at rest does not make a database suitable for publication: it also
contains unencrypted conversations and state. Development captures and traces
must stay local unless deliberately sanitized.

Keep database and encryption-key backups together in private storage. Set a
32-byte `OPENPRESENCE_SECRET_KEY` before production credential storage. Preserve an
existing key when migrating; replacing it will prevent decryption of existing
credentials. Never enable mock or test-mode flags in a production deployment.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option on the repository Security tab
when private vulnerability reporting is enabled. If that option is unavailable,
open an issue asking for a private reporting channel without including exploit
details, credentials, private content, or affected account information. Maintainers
should enable private vulnerability reporting before launch.

Include affected versions, a minimal reproduction using synthetic data, expected
and actual behavior, and the impact. Do not test against someone else's account.

## If a secret was committed

Revoke or rotate the affected external credential first. Removing a file or adding
an ignore rule does not remove old commits, branches, tags, caches, or forks.
Remove affected history before publishing, or publish a separately scanned source
snapshot with a new history. See [the publication audit](docs/open-source-publication.md)
for this repository's release boundary.
