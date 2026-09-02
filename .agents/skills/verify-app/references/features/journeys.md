# Cross-surface journeys

These journeys sequence the individual feature maps to test boundaries that a single page cannot prove.

## Create → reload → persistence

Follow [Onboarding](onboarding.md), create an Agent/Presence through `/`, open Activity, reload, and assert the same named identity and persisted IDs. This catches stale client state and wrong-workspace reads.

## Activity → Review decision handoff

From [Activity](activity.md), open `Review` when the operator queue has work or when the health indicator requires attention. Prove that Review opens the focused [operator queue](review.md), that Activity-only dashboard content is absent, and that `Back to Activity` returns to the live stream.

## Chat → responsibility → Activity

Follow [Chat and Teach](chat-teach.md) for an explicit publication direction, then open [Schedule](schedule-assignments.md) or Activity. Prove the visible receipt, Assignment/attention state, and persisted separation between Social Intent, Execution, and Outcome.

## Chat sidebar → Schedule → Chat

Open the context sidebar from Chat, choose Calendar, follow `Open full calendar`, and verify Schedule exposes `Back to Chat`. Activate it and prove the selected Agent and Chat conversation context return without creating a duplicate thread or losing persisted messages.

## Agent Main → work thread → reload

Open `/` or `/chat` in an onboarded workspace and prove the Agent-first sidebar exposes the permanent `Main thread` context, create a new conversation from that sidebar card, and open it with a durable `threadId` query. Send a non-public operator message, reload, and verify the same thread title and message remain. The Main header exposes no rename, archive, or transcript-copy controls; prove the permanent Main context remains available and any linked Assignment remains in the state projection.

## Playground → decision trace → rehearsal feedback

Follow [Playground](playground-rehearsal.md) to seed a simulated event, inspect it in the browser, open its trace/context, and record feedback only when requested. Prove Sandbox isolation and that feedback does not silently rewrite Agent identity.

## Settings → navigation → scope

Follow [Channels and Manage Agent](channels-agent.md), change a Presence setting, open Chat/Watching/Activity, return to Settings, and inspect persistence. Separately open Manage Agent and confirm Agent meaning/model scope remains stable.

## Portfolio Agent → connected channel context

Create or use at least two Agents, each with its own connected channel context. Switch Agent from the portfolio rail or topbar dropdown, verify the Agent name and Agent-scoped Knowledge/Assets/meaning remain stable, then verify the active channel, Activity, Review, Chat, and unified settings all follow the selected Agent. Do not introduce a separate channel switcher into the primary workspace.

## Responsive and partial-state resilience

Repeat materially affected journeys at a mobile viewport when layout or navigation changed. If a projection is intentionally partial, navigate through Activity, Settings, People, and Growth and assert no client exception or fabricated status. Use the existing Playwright mobile project for broad regression. Include the Agent/Presence portfolio switchers because the current desktop footer and mobile topbar expose them in different locations.
