# OpenPresence project guidance

Before planning, implementing, reviewing, or fixing product, architecture, copy, or UI/UX work, consult [`docs/OpenPresence_Vision_and_Platform_Philosophy.md`](docs/OpenPresence_Vision_and_Platform_Philosophy.md).

Treat that document as the canonical product and UX north star. When a proposed change conflicts with it, surface the conflict and prefer the philosophy over convenience in the current implementation. Use the `openpresence-philosophy` project skill for the review workflow and principles distilled from the document.

For autonomous development work, use [`docs/AGENT_EXECUTION_FLOW.md`](docs/AGENT_EXECUTION_FLOW.md) as the coordination prompt and [`CAPABILITY_LEDGER.md`](CAPABILITY_LEDGER.md) as the evidence-backed behavioral contract. Keep [`FEATURES_MAP.md`](FEATURES_MAP.md) as the sole product Feature Map; do not create parallel maps or verification CLIs when the existing `openpresence` Sandbox CLI and `verify-app` control plane cover the need.
