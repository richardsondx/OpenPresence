# Cross-surface journeys

These journeys sequence the individual feature maps to test boundaries that a single page cannot prove.

## Create → reload → persistence

Follow [Onboarding](onboarding.md), create an Agent/Presence through `/`, open Activity, reload, and assert the same named identity and persisted IDs. This catches stale client state and wrong-workspace reads.

## Chat → responsibility → Activity

Follow [Chat and Teach](chat-teach.md) for an explicit publication direction, then open [Schedule](schedule-assignments.md) or Activity. Prove the visible receipt, Assignment/attention state, and persisted separation between Social Intent, Execution, and Outcome.

## Playground → decision trace → rehearsal feedback

Follow [Playground](playground-rehearsal.md) to seed a simulated event, inspect it in the browser, open its trace/context, and record feedback only when requested. Prove Sandbox isolation and that feedback does not silently rewrite Agent identity.

## Settings → navigation → scope

Follow [Channels and Manage Agent](channels-agent.md), change a Presence setting, open Chat/Watching/Activity, return to Settings, and inspect persistence. Separately open Manage Agent and confirm Agent meaning/model scope remains stable.

## Responsive and partial-state resilience

Repeat materially affected journeys at a mobile viewport when layout or navigation changed. If a projection is intentionally partial, navigate through Activity, Settings, People, and Growth and assert no client exception or fabricated status. Use the existing Playwright mobile project for broad regression.
