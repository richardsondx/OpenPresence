# Tasks, Calendar, and Assignments

Tasks is a quiet projection of the Agent's work. The operator supplies outcomes in Chat; the Agent owns the method. `/schedule`, `/work`, and `/calendar` reach the same surface.

## User journey

- Open **Tasks**. All non-cancelled, non-continuous tasks are visible without choosing a day or type. Continuous growth goals remain in Growth.
- **Needs attention** includes blocked, awaiting review, failed, expired incomplete, and operator-input states. **In progress** contains other open work, with paused/not-started states explicitly described.
- Each row has a title and current update. Click **Open task: <title>** to open **Assignment details** (visible heading: **Task details**). The icon is a status indicator, never a manual completion checkbox.
- Details lead with the current update and **Tell <Agent> something about this**. **Send guidance** uses the existing scoped conversational intervention. **Timing & details** discloses timing, progress, readiness, original instructions, and detailed failure evidence.
- **Completed** stays collapsed. Failed/expired tasks remain under Needs attention, never in the completion archive.
- **Calendar** is only a seven-day dated calendar with Previous week, Next week, and Today. Desktop shows all seven days; mobile selects a day from the date strip. Truly undated tasks stay in List. Deadline-only tasks appear as Due; publishing plan windows appear as Opportunity events, never promised posts. No density toggle or task-list panels.
- In List, **Upcoming opportunities** discloses the current publishing plan.
- **Back to Chat**, or **Talk to <Agent>** in the empty state, returns to the real conversation. No separate task creation/activation form exists.

## Driving it with verify-app

```bash
verify-app open schedule
verify-app snapshot
verify-app click --role button --name 'Open task: <actual title>' --exact
verify-app type --label 'Tell Jenny something about this' --text 'Focus this on developers.'
verify-app submit --role button --name 'Send guidance'
verify-app click --text 'Timing & details' --exact
verify-app state --projection schedule
```

Use a single `run` flow when the next assertion must wait for an asynchronous mutation. `assignmentId` deep links still open the matching inspector after reload. Escape dismisses the inspector.

## Proof anchors

- `tests/e2e/schedule-state.spec.ts`: supervisory controls; populated attention/in-progress/completed states; detailed evidence disclosure; responsive overflow; screenshots. Status fixtures test presentation, not delivery.
- `tests/e2e/one-time-task-visibility.spec.ts`: unscheduled visibility in List and exclusion from Calendar, deep-link reload, bounded timing, expired-task identity and no accidental execution.
- `tests/e2e/task-calendar.spec.ts`: week/date navigation, explicit daily recurrence, deadline/timezone projection, historical completion, mobile day selection, detail access, no undated/list panels, screenshots.
- `tests/e2e/responsive-workspace.spec.ts`: workspace scope, aliases, Calendar, empty-state Chat handoff.
- `tests/runtime.test.ts`, `tests/plan-intervention-process-boundary.test.ts`: durable intervention and underlying execution semantics.

## Truth boundaries

Partial progress, a draft, a queued execution, failed delivery, and candidate rejection are not completion. Recurring work remains open after a successful occurrence. Cancellation retains confirmation. Sandbox fixtures are not live delivery evidence. This presentation change does not alter runtime scheduling, authority, or Assignment state.
