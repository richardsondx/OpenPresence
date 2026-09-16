# Schedule and Assignments

Schedule manages durable operator responsibility and timing; the Agent chooses the method and only verified outcomes advance completion. Tasks is the common List/Calendar surface; `/work` and `/calendar` are compatibility routes.

## Sub-features

- Create and review an Assignment with a completion contract.
- View Week/List timing without pretending scheduled content is already published.
- Open Tasks and select a responsibility directly into its details.
- Work now or cancel a responsibility from its details; Playground remains a separate rehearsal surface.
- Inspect due, working, blocked, deferred, failed, and completed states.
- Scan prominent start times and distinguish one-time dates from weekly cadence.
- Return to the originating Agent conversation with the persistent `Back to Chat` action.

## How to get to it (user POV)

Choose `Schedule` or open `/schedule`; `/calendar` remains a legacy alias that resolves to the same Schedule view. When Schedule is opened from the Chat context sidebar, use the visible `Back to Chat` action in the Schedule header to return to the Agent conversation. The current route offers `List`/`Calendar`, `Add task`, assignment-type/day filters, and Assignment details. Use `Add task`, fill `What should <Presence> accomplish?`, choose `One time only` with a specific `Date` or `Weekly` with a `Day`, choose one exact `Time`, then choose `Create assignment`. The Agent interprets the instruction and owns the method; there is no operator Objective or activation step. In Task list/detail views, the interpreted title and short description are shown first; the full instruction and constraints stay behind progressive disclosure.

## Driving it with verify-app

```bash
verify-app open schedule
verify-app click --role button --name 'Add task'
verify-app snapshot
verify-app type --label 'What should Jenny accomplish?' --text 'Teach one useful idea about persistent agents.'
verify-app click --role radio --name 'One time only'
verify-app type --label 'Assignment date' --text '2026-09-03'
verify-app type --role textbox --name Time --text 08:00
verify-app click --role button --name 'Create assignment'
verify-app wait-for --text 'Assignment details'
verify-app click --role button --name Week
verify-app wait-for --role region --name 'Weekly schedule'
verify-app state --projection schedule
```

Inspect the assignment card, schedule, readiness, and persisted status after switching between Week/List or reloading.

## Proof

Proof is a visible Assignment with the correct timing and completion contract plus persisted schedule/assignment state. A verified recurring execution/outcome stays visible as `Done today` for the current occurrence. It is not a prewritten post, queue entry, or HTTP success.

## Gotchas

- A one-time Assignment carries an ISO local date; a weekly Assignment carries a weekday. Both carry one exact local start time.
- A rejected candidate, blocked expression, or delivery failure leaves responsibility incomplete.
- Live assignments need a real connector; harness verification should remain Sandbox-safe.
- Chat-created responsibilities are immediate one-time work and are not silently converted into weekly schedule entries.

## Ended attempts and retry (2026-09-15)

The inspector's visible heading is `Task details` (accessible region remains `Assignment details`). Schedule and current-attempt state are separate. Failed/expired work offers `Retry with a new time`: set `Task window start` and `Task window end`, then `Save changes`. Saving prepares the same assignment as a draft; `Start task` is the explicit activation. Prior verified progress remains recorded. An unresolved delivery prevents another attempt. Ended one-time tasks do not offer cancellation. Partial progress cannot produce a `Done today` badge.

`one-time-task-visibility.spec.ts` verifies both task views, editing, expiration, retry-window persistence, identity preservation, and no execution created by saving a new window. `assignment-timeframe.test.ts` additionally covers failed-task recovery and unresolved-delivery protection.

### Active billing recovery (2026-09-16)

`tests/operator-chat-tools.test.ts` verifies recovery of the same active assignment when its last delivery failed for X credits. `tests/growth-runtime.test.ts` distinguishes a temporary billing fallback from a true action-permission browser requirement. Read checks and queued retries do not prove public write recovery.
