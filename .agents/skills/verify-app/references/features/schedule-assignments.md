# Schedule and Assignments

Schedule manages durable operator responsibility and timing; the Agent chooses the method and only verified outcomes advance completion. `/work` is the Agent-wide compact index; Schedule remains the temporal detail view.

## Sub-features

- Create and review an Assignment with a completion contract.
- View Week/List timing without pretending scheduled content is already published.
- Scan the cross-Presence Work index and follow a responsibility into Schedule.
- Run or cancel a responsibility in the supported Sandbox path.
- Inspect due, working, blocked, deferred, failed, and completed states.
- Scan prominent responsibility times, see verified recurring work as `Done today`, and expand long flexible-responsibility lists only when needed.

## How to get to it (user POV)

Choose `Schedule` or open `/schedule`; `/calendar` remains a legacy alias that resolves to the same Schedule view. The current route offers `List`/`Week`, `Create with a prompt`, `Add assignment`, publishing rhythm/plan controls, layer visibility, recurrence/day filters, and Assignment details. Use `Add assignment`, fill `What should <Presence> accomplish?`, choose `Day`, `Time`, and `Objective`, then choose `Review responsibility`. A dated Assignment repeats weekly by default; include `once` or `one-time` only for a single event.

## Driving it with verify-app

```bash
verify-app open schedule
verify-app click --role button --name 'Add assignment'
verify-app snapshot
verify-app type --label 'What should Jenny accomplish?' --text 'Teach one useful idea about persistent agents.'
verify-app select --label Day --value Tuesday
verify-app type --role textbox --name Time --text 08:00
verify-app click --role button --name 'Review responsibility'
verify-app wait-for --text 'Assignment details'
verify-app click --role button --name Week
verify-app wait-for --role region --name 'Weekly schedule'
verify-app state --projection schedule
```

Inspect the assignment card, schedule, readiness, and persisted status after switching between Week/List or reloading.

## Proof

Proof is a visible Assignment with the correct timing and completion contract plus persisted schedule/assignment state. A verified recurring execution/outcome stays visible as `Done today` for the current occurrence. It is not a prewritten post, queue entry, or HTTP success.

## Gotchas

- Calendar timing grants permission to consider acting, not an obligation to publish.
- A rejected candidate, blocked expression, or delivery failure leaves responsibility incomplete.
- Live assignments need a real connector; harness verification should remain Sandbox-safe.
- Flexible responsibilities are progressively disclosed: the first relevant items are visible and the remainder is behind `Show more`.
