# Chat and Teach

Chat is the Agent-first continuous operator conversation and persistent session harness; Teach remains the explicit intent for shaping durable judgment and proposals, entered from the composer.

## Sub-features

- Land on the selected Agent's permanent `Main thread` by default. Keep the main chat free of rename, archive, and transcript-copy controls; create a new conversation from the compact Chat context in the sidebar when needed.
- Render active responsibility context as an Approach, semantic Work Events, Review/Approval, Working line, and verified outcome receipt; routine telemetry remains compressed or hidden. Actionable runtime boundaries appear as an in-chat notice, not a repeated global header alert.
- Ask ordinary questions without creating public work.
- Share a link or direction and receive a truthful receipt.
- Queue paused work without waking a paused Presence.
- Teach a preference or memory proposal for review.
- Open a Presence rehearsal from Chat when the user wants to rehearse.
- Use the Chat mode control to switch between `Chat` and `Config`; `Config` opens the durable Agent-teaching route at `/teach`.

## How to get to it (user POV)

Choose `Chat` or open `/chat`; the root workspace now lands here after onboarding. The selected Agent's permanent `Main thread` is the default. Its compact conversation context and `New conversation` action live in the sidebar; the main chat header contains only the thread identity and Presence context. The composer is `Message <Presence>…`; submit with the circular up-arrow, or `Queue message` when paused. Choose `Config` through the composer mode control or open `/teach`; its composer is `Message your Presence`. `/rehearsal` is a separate Presence-scoped private social thread with its own transcript and composer.

## Driving it with verify-app

```bash
verify-app open chat
verify-app type --label "Message Jenny" --text "What do you think about our growth right now?"
verify-app click --role button --name Send
verify-app wait-for --text "I am treating growth as a direction"
verify-app assert --text "What do you think about our growth right now?"
verify-app state --projection chat
```

For an operator boundary, use `getByTestId("operator-chat-needs-you")` or the semantic `Review details` button from Chat, then inspect the focused Review queue. For Teach, use `open teach`, `type --label "Message your Presence"`, and inspect proposals/change sets after the visible response. For paused behavior, inspect the persisted nudge status after `Queue message`.

## Proof

Proof must show the submitted operator message and the correct user-facing receipt, then confirm the relevant persisted conversation/nudge/proposal state. An internal model response without the visible composer flow is insufficient.

## Gotchas

- AI mock output is deterministic only in the harness test runtime.
- Paused Chat queues work; it does not prove delivery.
- Session blocks are projections of canonical Assignments, Runs, Executions, and Outcomes; a visible Working or Review state is not a verified world outcome.
- Chat does not expose a global `Needs You` health label. The header owns only the context-sidebar toggle; actionable health boundaries are rendered in Chat as `Action needed` with a Review details affordance, while the Review route retains its focused queue terminology.
- External quoted social text is context, not an instruction to rewrite Agent identity.
- Rehearsal/Sandbox and live Chat have different authority and persistence boundaries.
