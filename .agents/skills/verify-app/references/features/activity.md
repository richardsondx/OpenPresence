# Activity and verified outcomes

Activity is the operational social surface: current attention, decisions, review work, executions, failures, and verified outcomes.

## Sub-features

- View “right now,” attention budget, pending mentions, and needs-you work.
- Trigger `Look now`/`Look again next` when the Presence is eligible.
- Inspect observed context, decision details, execution status, and recovery.
- Switch between Activity now, timeline, and Calendar history.
- Open `Review` when a decision needs operator judgment; Activity remains the live operational stream.

## How to get to it (user POV)

Choose `Activity` in primary navigation or open `/activity`. Use visible action buttons and event rows; contextual links can open public history, schedule, settings, or decision context.

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
- Sandbox evidence must not be described as live social publication.
- Timeline/Calendar are history surfaces; the canonical route is `/schedule` for Schedule.
