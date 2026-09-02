# Activity and verified outcomes

Activity is the operational social surface: current attention, decisions, review work, executions, failures, and verified outcomes. In the current implementation it is also the default home and contains several overlapping operational subsections.

## Sub-features

- View “right now,” attention budget, pending mentions, and needs-you work.
- Trigger `Look now`/`Look again next` when the Presence is eligible.
- Inspect observed context, decision details, execution status, and recovery.
- Switch between Activity now, timeline, and Calendar history.
- Open `Review` when a decision needs operator judgment; Activity remains the live operational stream.
- Inspect the Activity sub-tabs `Activity`, `Needs you`, `Agenda`, `Assignments`, `Requests`, `Operating Health`, and `Developer Diagnostics` when those states are available.

## How to get to it (user POV)

Choose `Activity` in primary navigation or open `/activity`. The default `Now` surface includes a Presence summary, Sandbox setup guidance, autonomy/attention budget cards, verified social activity counts, current pulse state, recent public activity, an operational status panel, an attention rail, and an Assignments preview. Use visible action buttons and event rows; contextual links can open public history, schedule, settings, or decision context.

## Driving it with verify-app

```bash
verify-app open activity
verify-app wait-for --selector '[data-testid="right-now-status"]'
verify-app assert --selector '[data-testid="right-now-status"]'
verify-app snapshot --selector '[data-testid="activity-today-dashboard"]'
verify-app screenshot --path /tmp/activity-evidence.png
verify-app state --projection activity
```

For a sandbox decision, seed or use Playground first, then return to Activity and inspect the visible event plus `socialIntents`, `executions`, `outcomes`, and `mirrorObjects` in the projection. Use `errors` and `network-summary` when the surface appears stale.

## Proof

The requested state must be visible in Activity and backed by the corresponding persisted projection. A queued or attempted action is not a verified outcome; proof must distinguish decision, execution, delivery, and outcome status.

## Gotchas

- Activity uses a compact projection and polls; wait on a visible state, not a fixed sleep.
- `NO_OP`, blocked, failed, pending review, and succeeded are distinct truths.
- A queued recovery is waiting durable work, not an active cognition worker. Target-scoped delivery quarantine must not freeze unrelated Attention.
- The default Activity page has multiple ways to reach related work (`View all`, `Open Activity`, `Schedule`, `Open Agenda`, `Open Assignments tab`, and `Needs You`); duplicate handoffs are part of the current journey evidence.
- `Developer Diagnostics` opens the technical forensic ledger and is not consumer-facing activity.
- Sandbox evidence must not be described as live social publication.
- Timeline/Calendar are history surfaces; the canonical route is `/schedule` for Schedule.
