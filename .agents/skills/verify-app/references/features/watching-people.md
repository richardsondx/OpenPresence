# Watching and People

Watching manages Presence-scoped attention sources; People exposes remembered identities and relationship context.

## Sub-features

- Add, edit, pause, resume, and remove a Watch.
- Distinguish known people from search leads and observations.
- Open a remembered person and inspect relationship facts/open loops.

## How to get to it (user POV)

Open the sidebar `Resources` menu and choose `Watchlist` (`/watching?tab=watchlist`). Watchlist is where the operator tells a Presence what known people, accounts, sources, or topics to monitor. Use the Watchlist `People` action or a watch card's contextual `View person` action to inspect the Agent's durable relationship memory, facts, open loops, and boundaries. `/people` remains a direct route for deep links, but is not duplicated in the primary Resources menu.

## Driving it with verify-app

```bash
verify-app open watching
verify-app snapshot
verify-app state --projection watching
verify-app open people
verify-app snapshot
```

Use the visible Add/Edit/Pause/Resume/Remove control names found in the snapshot, then assert the Watch card or empty state and re-read the watching projection. For People, inspect the selected person and persisted relationship state after navigation away and back.

## Proof

The Watch’s visible state, Presence scope, and persisted watch record must agree. A search result or directory candidate alone is not proof of contact, relationship, or observation.

## Gotchas

- Watches are durable attention sources, not authority to speak.
- No-observation is a meaningful state; do not treat an empty result as a failure.
- People is loaded with a dedicated projection and is sensitive to partial-state drift.
- Watchlist attention and People relationship memory are separate surfaces; do not treat a Watch as automatic memory or authority to speak.
