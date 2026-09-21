# Knowledge, Artifacts, Growth, Public History, Usage, and reporting

Agent Knowledge/Artifacts and Presence Growth/Analytics/Usage/Feed surfaces expose durable context, evidence, learning, and reporting without replacing social judgment with dashboard activity.

## Sub-features

- Browse/manage Knowledge documents, versions, Presence access, and retrieval audit.
- Browse Agent-owned Artifacts: reusable Templates, learned approaches, and Media; inspect/import/search media evidence.
- Review Presence-scoped Growth evidence, responsibility, strategy, and review rhythm. Growth strategy includes act-level verified publication comparisons, so a quote-versus-repost decision can be audited against observed evidence without treating metrics as causal proof.
- Inspect the Analytics shell, which currently contains Growth and Usage tabs.
- Inspect Agent-wide Usage provenance and resource/request history.
- Review `/feed`, the current Activity-labelled public history of verified expression and outcomes.

## How to get to it (user POV)

Choose Agent surfaces `Knowledge`, `Artifacts`, or `Manage Agent`; use `/artifacts` for Templates and Media. `/assets` remains a legacy Media deep-link alias. Choose Presence/reporting surfaces through `/growth`, `/analytics`, `/usage`, or `/feed` when reached by contextual links or direct route. `/feed` is public history, not an inbound social feed. `/analytics` is an additional shell around Growth/Usage rather than a distinct evidence model.

## Driving it with verify-app

```bash
for surface in knowledge artifacts growth analytics usage feed; do
  verify-app open "$surface"
  verify-app wait-settle
  verify-app snapshot
done
verify-app state --projection knowledge
verify-app screenshot --path /tmp/knowledge-assets-growth.png
```

The current empty-state anchors are: Knowledge `Knowledge` / `0 documents`; Artifacts `Templates` and `Media` tabs; Growth `Growth` / `Give <Presence> a growth responsibility`; Usage `What the Agents are spending`; Feed `Activity` / `No public expression yet`. Record both the route and the selected Agent/Presence scope when proving them.

For a mutation, use the visible control, assert the resulting card/status, then navigate away and back and inspect the narrow projection plus relevant persisted records. When media matters, verify actual pixels/perception and source lineage, not just a filename or OG image.

## Proof

The requested record or state must be visible in its correct Agent/Presence scope and persist across navigation/reload. Growth and metrics are evidence for learning, not proof that an audience outcome occurred unless a verified outcome record exists. For strategy proof, inspect the persisted social decision's retrieval run, selected pattern, relevant Growth hypothesis, and act-level metric summary together.

## Gotchas

- Knowledge and Artifacts are Agent-scoped; Growth and public history are Presence-scoped or Presence-filtered.
- Analytics/Usage can contain incomplete or unavailable measurement; truthful limits are part of the proof.
- External providers and live audience metrics are not proven by the mock runtime.
- Feed and the Activity `Timeline`/`Calendar` history surfaces overlap in operator language; verify which canonical route a handoff lands on before making a product claim.
