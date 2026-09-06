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

Open `/` or `/chat` in an onboarded workspace and prove the Agent-first sidebar opens the single main Chat. Verify there is no duplicate Conversation/New conversation context card, private-thread creator, rename, archive, or transcript-copy control. Send a non-public operator message, reload, and verify the same main Chat and message remain; any linked Assignment remains in the state projection.

## Project → linked Chat thread

Assignments no longer create a separate project surface or Chat route. From Chat, give the Agent a concrete responsibility and prove the operator message, acknowledgement, working/tool evidence, and any review or verified outcome receipt stay in the single Main conversation. Use Schedule or Work for durable responsibility details; use Chat for the narrative handoff.

## Playground → decision trace → rehearsal feedback

Follow [Playground](playground-rehearsal.md) to seed a simulated event, inspect it in the browser, open its trace/context, and record feedback only when requested. Prove Sandbox isolation and that feedback does not silently rewrite Agent identity.

## Settings → navigation → scope

Follow [Channels and Manage Agent](channels-agent.md), change a Presence setting, open Chat/Watching/Activity, return to Settings, and inspect persistence. Separately open Manage Agent and confirm Agent meaning/model scope remains stable.

## Portfolio Agent → connected channel context

Create or use at least two Agents, each with its own connected channel context. Switch Agent from the portfolio rail, verify the Agent name and Agent-scoped Knowledge/Assets/meaning remain stable, then verify the active channel, Activity, Review, Chat, and unified settings all follow the selected Agent. Do not introduce a separate channel switcher into the primary workspace.

## Responsive and partial-state resilience

Repeat materially affected journeys at a mobile viewport when layout or navigation changed. If a projection is intentionally partial, navigate through Activity, Settings, People, and Growth and assert no client exception or fabricated status. Use the existing Playwright mobile project for broad regression. Include the Agent/Presence portfolio switchers because the current desktop footer and mobile topbar expose them in different locations.
