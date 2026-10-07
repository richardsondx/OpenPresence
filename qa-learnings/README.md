# OpenPresence QA Ledger

This ledger records project-specific risks, decisions, and executable regression protection for the OpenPresence goal.

It is QA memory, not the behavioral capability contract. Record capability
status and proof in [`../CAPABILITY_LEDGER.md`](../CAPABILITY_LEDGER.md), and
record user-facing navigation and verification reachability in
[`../FEATURES_MAP.md`](../FEATURES_MAP.md).

## Public source boundary

Only this guide and generalized regression rules belong in the public source.
Browser traces, screenshots, raw model conversations, operator feedback, captured
social corpora, and proof packets stay local and ignored. They can contain private
content even when they contain no API key. Historical capability-ledger references
may point to local artifacts that are intentionally absent from a public checkout;
those references are historical claims, not fresh release certification.

Use synthetic fixtures for reproducible public tests. Inspect exact context locally,
then redact secrets and private content before deliberately sharing evidence.
