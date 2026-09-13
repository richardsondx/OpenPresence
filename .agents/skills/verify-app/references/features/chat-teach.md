# Chat and Teach

Chat is the Agent-first continuous operator conversation and persistent session harness; Teach remains the explicit intent for shaping durable judgment and proposals, entered from the composer.

## Sub-features

- Land on the selected Agent's single main Chat by default. Keep the main Chat free of rename, archive, transcript-copy, and new-conversation controls; do not present a second conversation context card or private-thread creator.
- Render active responsibility context as an Approach, semantic Work Events, Review/Approval, Working line, and verified outcome receipt; routine telemetry remains compressed or hidden. Actionable runtime boundaries appear in Chat as a compact notice directly above the composer, not a repeated global header alert or a transcript item.
- Ask ordinary questions without creating public work.
- Share a link or direction and receive a truthful receipt.
- Continue private Chat while public activity is paused; public Assignments remain held until the Presence is awake.
- Teach a preference or memory proposal for review.
- Open a Presence rehearsal from Chat when the user wants to rehearse.
- See a durable Assignment's progress and receipts inline in Chat.
- Use the Chat mode control to switch between `Chat` and `Config`; `Config` opens the durable Agent-teaching route at `/teach`.

## How to get to it (user POV)

Choose `Chat` or open `/chat`; the root workspace now lands here after onboarding. The selected Agent's single main Chat is the default and opens without a duplicate conversation header or a separate Projects surface. The composer is `Message <Presence>…`; submit with the circular up-arrow, even when public activity is paused. Choose `Config` through the composer mode control or open `/teach`; its composer is `Message your Presence`. `/rehearsal` is a separate Presence-scoped private social thread with its own transcript and composer.

Assignments use the same Chat surface for their narrative input/output: the operator can give direction in Main and see durable acknowledgement, working/tool activity, review state, and verified outcome receipts scoped to that Assignment.

## Driving it with verify-app

```bash
verify-app open chat
verify-app type --label "Message Jenny" --text "What do you think about our growth right now?"
verify-app click --role button --name Send
verify-app wait-for --text "I am treating growth as a direction"
verify-app assert --text "What do you think about our growth right now?"
verify-app state --projection chat
```

For an operator boundary, use `getByTestId("operator-chat-needs-you")` or the semantic `Review details` button from Chat, confirm it sits immediately before `form.operator-chat-composer`, then inspect the focused Review queue. For Teach, use `open teach`, `type --label "Message your Presence"`, and inspect proposals/change sets after the visible response. For paused behavior, send an ordinary question with `Send`, verify the reply, then confirm the Presence remains paused and no execution was created.

## Proof

Proof must show the submitted operator message and the correct user-facing receipt, then confirm the relevant persisted conversation/nudge/proposal state. An internal model response without the visible composer flow is insufficient.

## Gotchas

- AI mock output is deterministic only in the harness test runtime.
- Pausing the Presence stops public activity, not private Chat. A saved responsibility is still not delivery.
- Session blocks are projections of canonical Assignments, Runs, Executions, and Outcomes; a visible Working or Review state is not a verified world outcome.
- Chat does not expose a global `Needs You` health label. The header owns only the context-sidebar toggle; actionable health boundaries are rendered in Chat as `Action needed` with a Review details affordance, while the Review route retains its focused queue terminology.
- External quoted social text is context, not an instruction to rewrite Agent identity.
- Rehearsal/Sandbox and live Chat have different authority and persistence boundaries.


## Private Chat recovery and intent (2026-09-06)

- Chat always enters a durable `operator_chat` turn, including links and paused Presences. Model-selected tools read supplied X posts, save private watches, and create one-time social responsibilities through the existing envelope. Questions and private drafts are not publication commands.
- Tool receipts use `operator-chat-tool` disclosures. Model/runtime failures appear as OpenPresence messages with `Retry response`; retries reuse the saved operator turn and completed receipts.
- Unconfirmed sends remain visible in the transcript with `Not confirmed · kept on this browser` and `Retry send`. A browser-persisted outbox retains text, attachments, scope, and request keys across reload. A retry reconciles or saves exactly one turn; later local sends wait behind it. Recovery never replaces the next draft. Only confirmed runtime work shows thinking, and the composer stays usable while sending or working. Refresh must keep the latest conversation, even when more than four historical conversations exist.
- Replies and tool results stay with their originating turn, including when a follow-up was saved before the earlier answer arrived. Queued follow-ups receive the completed preceding turn in model context and never receive later operator instructions. Provider waiting/recovery holds later turns until the earlier turn completes or is stopped.
- Every navigation entry updates the URL as well as the visible surface. Selecting the current Agent from Schedule must reach `/chat` and use the Chat projection on refresh.
- Regression proof: `tests/e2e/chat-recovery.spec.ts` covers interrupted sends, draft preservation, reload/retry, lost acknowledgements, FIFO recovery, and Schedule → Chat navigation.
- Channel health notices explicitly refer to public work. A real model billing error remains separate from an X rate limit; it must not be represented as the Agent choosing silence.
- Proof: ordinary live question → private follow-up draft → reload, with no new executions; isolated paused Presence → Send → response → reload while still paused. Worker tests additionally cover failed X reads, tool receipts, replay, and cold database reads over stale Agent snapshots.

## Social tools in Chat (2026-09-12)

- Chat can invoke concrete social actions plus scoped connector diagnostics, observation, search, knowledge, media discovery/inspection and execution verification. Existing execution envelopes and enabled provider/tool bindings apply.
- Tool calls and results must appear after the operator request in the provider conversation. A final live check should produce one fresh check and one grounded answer, not repeated probes until the step limit.
- Persist action intent and receipt before delivery. Replaying a completed action in the same turn must reuse its execution. UI delivery cards use current persisted outcome evidence.
- Worker restarts retain the exact turn and receipts. Stalled Chat work receives bounded recovery without inheriting unrelated public-work incidents. Failed/stranded/stopped turns offer Retry response.
- Proof: `tests/operator-chat-tools.test.ts`, `tests/operator-chat-harness.test.ts`, and `qa-learnings/chat-tools-2026-09-12.md`.

## Readable tool receipts and inspection reports (2026-09-13)

- Known system tool receipts, including historical messages without reply IDs, render as compact `operator-chat-tool` disclosures rather than OpenPresence JSON bubbles.
- Opening a tool row shows a plain-language result. `Technical details` is a second, initially collapsed disclosure. Read-only connection checks explicitly leave publishing and credit balance unverified.
- Old account-inspection messages render a readable summary with `Saved evidence` collapsed. New reports are persisted as plain-language findings.
- Proof: inspect both default and expanded states, then reload; operator-authored JSON must remain unchanged. Regression tests: `tests/chat-activity-presentation.test.ts`.
