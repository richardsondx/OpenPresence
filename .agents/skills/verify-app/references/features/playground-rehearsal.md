# Playground and Rehearsal

Playground is isolated social rehearsal inside the real Sandbox cognition → intent → execution → delivery → outcome path; Rehearsal is the conversational practice surface.

## Sub-features

- Start/reset an isolated Playground session.
- Add simulated posts/replies/events and let the Agent judge them.
- Inspect media perception separately from Taste/planning.
- Rehearse an original publication and record preference evidence.
- Inspect a decision trace without teaching hidden expected answers.

## How to get to it (user POV)

Choose `Playground` or open `/playground`. Use `Check now`, the event controls, object selection, and `Inspect media`. Choose the Playground `Rehearsal` tab or open `/rehearsal` for Presence conversation practice.

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

Evidence must show the simulated event reached the visible Playground and that the persisted session contains the corresponding observation/decision/execution/outcome chain. Rehearsal feedback must remain preference evidence and must not silently mutate identity.

## Gotchas

- Playground is not live and never authorizes external delivery.
- Scenario versions freeze before Runs; runs are Presence-scoped and isolated.
- A media filename or link preview is not visual evidence; use Inspect media where media matters.
- Reset clears only the selected Sandbox session, not Agent meaning.
