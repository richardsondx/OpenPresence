# Playground and Rehearsal

Playground is isolated social rehearsal inside the real Sandbox cognition → intent → execution → delivery → outcome path; Rehearsal is the conversational practice surface.

## Sub-features

- Start/reset an isolated Playground session.
- Add simulated posts/replies/events and let the Agent judge them.
- Inspect media perception separately from Taste/planning.
- Rehearse an original publication and record preference evidence.
- Inspect a decision trace without teaching hidden expected answers.
- Switch between Playground-level `Free play`, `Curation`, `Trials`, and `Scenarios` modes; the top-level Presence tabs also expose `Playground` and `Rehearsal`.

## How to get to it (user POV)

Choose `Playground` or open `/playground`. Use `Check now`, the event controls, object selection, and `Inspect media`. Choose the Playground `Rehearsal` tab or open `/rehearsal` for Presence conversation practice. The first Playground state currently presents Free play, Curation, Trials, and Scenarios together, with a control-room form for adding simulated events.

For the direct Presence Rehearsal thread, choose `Rehearsal` from the selected Presence navigation or open `/rehearsal` with the Agent/Presence query context. The transcript is `[data-testid="rehearsal-transcript"]`; the always-available composer is `[data-testid="rehearsal-composer"]`.

The Rehearsal viewport follows Chat geometry: the transcript is the scroll owner, the composer remains at the bottom of the usable workspace on desktop and mobile, and an empty thread offers a clear first action without creating document-level overflow. Sandbox cognition also exposes only eligible Asset-library candidates by exact ID and records verified follow memory in the scoped People model.

## Driving it with verify-app

```bash
verify-app reset-session
verify-app open playground
verify-app wait-for --text 'Sandbox available'
verify-app snapshot
verify-app seed-state --scenario scenarios/reply-to-founder.json
verify-app open playground
verify-app snapshot
verify-app state --projection playground
verify-app screenshot --path /tmp/playground-evidence.png
```

Use the CLI only to seed a Sandbox scenario; the browser inspection after seeding is still required for a product claim. Inspect observed world, perception, decisions, review queue, and recent events separately.

## Proof

Evidence must show the simulated event reached the visible Playground and that the persisted session contains the corresponding observation/decision/execution/outcome chain. Rehearsal feedback must remain preference evidence and must not silently mutate identity. When testing autonomous publication, verify exact Asset-library identity and usage records; when testing relationships, verify PersonIdentity and Relationship after the follow outcome.

## Gotchas

- Playground is not live and never authorizes external delivery.
- Scenario versions freeze before Runs; runs are Presence-scoped and isolated.
- A media filename or link preview is not visual evidence; use Inspect media where media matters.
- Reset clears only the selected Sandbox session, not Agent meaning.
- A direct bare `/rehearsal` may need the selected `agentId` and `presenceId` query context; verify in-app navigation or a context-bearing refresh.
