# Chat and Teach

Chat is the Agent-first continuous operator conversation and persistent session harness; Teach remains the explicit intent for shaping durable judgment and proposals, entered from the composer.

## Sub-features

- Land on the selected Agent's durable `Main` conversation by default and create/switch/rename/archive additional conversations without stopping Assignments.
- Render active responsibility context as an Approach, semantic Work Events, Review/Approval, Working line, and verified outcome receipt; routine telemetry remains compressed or hidden.
- Ask ordinary questions without creating public work.
- Share a link or direction and receive a truthful receipt.
- Queue paused work without waking a paused Presence.
- Teach a preference or memory proposal for review.
- Open a Presence rehearsal from Chat when the user wants to rehearse.
- Use the Chat mode control to switch between `Chat` and `Teach`; `/teach` is the direct Agent-teaching route.

## How to get to it (user POV)

Choose `Chat` or open `/chat`; the root workspace now lands here after onboarding. The selected Agent's `Main` conversation is the default, with Agent-owned active/recent threads in the sidebar. The composer is `Message <Presence>…`; submit with `Send`, or `Queue message` when paused. Choose `Teach` through the composer mode control or open `/teach`; its composer is `Message your Presence`. `/rehearsal` is a separate Presence-scoped private social thread with its own transcript and composer.

## Driving it with verify-app

```bash
verify-app open chat
verify-app type --label "Message Jenny" --text "What do you think about our growth right now?"
verify-app click --role button --name Send
verify-app wait-for --text "I am treating growth as a direction"
verify-app assert --text "What do you think about our growth right now?"
verify-app state --projection chat
```

For Teach, use `open teach`, `type --label "Message your Presence"`, and inspect proposals/change sets after the visible response. For paused behavior, inspect the persisted nudge status after `Queue message`.

## Proof

Proof must show the submitted operator message and the correct user-facing receipt, then confirm the relevant persisted conversation/nudge/proposal state. An internal model response without the visible composer flow is insufficient.

## Gotchas

- AI mock output is deterministic only in the harness test runtime.
- Paused Chat queues work; it does not prove delivery.
- Session blocks are projections of canonical Assignments, Runs, Executions, and Outcomes; a visible Working or Review state is not a verified world outcome.
- External quoted social text is context, not an instruction to rewrite Agent identity.
- Rehearsal/Sandbox and live Chat have different authority and persistence boundaries.
