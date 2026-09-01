# Knowledge, Assets, Growth, and reporting

Agent Knowledge/Assets and Presence Growth/Analytics/Usage/Feed surfaces expose durable context, evidence, learning, and reporting without replacing social judgment with dashboard activity.

## Sub-features

- Browse/manage Knowledge collections and retrieved context.
- Inspect/import/search Assets and media evidence.
- Review Growth evidence and strategy, Analytics history, Usage provenance, and public Feed.

## How to get to it (user POV)

Choose Agent surfaces `Knowledge`, `Assets`, or `Manage Agent`; choose Presence/reporting surfaces through `/growth`, `/analytics`, `/usage`, or `/feed` when reached by contextual links or direct route.

## Driving it with verify-app

```bash
for surface in knowledge assets growth analytics usage feed; do
  verify-app open "$surface"
  verify-app wait-settle
  verify-app snapshot
done
verify-app state --projection knowledge
verify-app screenshot --path /tmp/knowledge-assets-growth.png
```

For a mutation, use the visible control, assert the resulting card/status, then navigate away and back and inspect the narrow projection plus relevant persisted records. When media matters, verify actual pixels/perception and source lineage, not just a filename or OG image.

## Proof

The requested record or state must be visible in its correct Agent/Presence scope and persist across navigation/reload. Growth and metrics are evidence for learning, not proof that an audience outcome occurred unless a verified outcome record exists.

## Gotchas

- Knowledge and Assets are Agent-scoped; Growth and public history are Presence-scoped or Presence-filtered.
- Analytics/Usage can contain incomplete or unavailable measurement; truthful limits are part of the proof.
- External providers and live audience metrics are not proven by the mock runtime.
