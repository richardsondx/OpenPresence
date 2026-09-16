# Chat layout and recovery

A short answer stays a bubble. A plan becomes a readable document within that same conversation: brief opening, short section headings, numbered steps, and inset quotations for draft text. Keep timing next to each proposed action. Finish with the decision or next step the operator actually needs. Markdown is presentation only; a numbered posting plan never creates a schedule or grants publication authority.

For the supplied promotion-plan example:

- Opening: what was inspected and the proposed angle.
- **Draft promotion plan** with numbered sections: clarification reply within 24 hours, quote post the following day, and response criteria.
- Each proposed post is an inset quote separate from its timing and rationale.
- Closing: stop after the two additions, then assess response; flag the historical analogy's limits briefly.

Render persisted text faithfully. Do not invent headings, task state, or interactive actions by guessing from legacy prose. New answers use this structure when the content warrants it. Existing plain text gains paragraph spacing. User messages remain literal. The renderer does not execute HTML.

Runtime status is separate from answer formatting. Display every active chat state, including a provider wait during generation. Preserve the operator's scroll position when reading older messages. Ignore late snapshots for a page the operator has left.

Task details identify the assignment and its current attempt separately from a recurring schedule. An expired attempt is incomplete, never completed. Retrying an expired assignment requires a new explicit timeframe; prior results remain evidence. Ended one-time work does not offer cancellation.

A paused-work reminder can be dismissed without changing the responsibility. A recovery check can join the chat outbox while another reply runs. Only a successful enqueue collapses that reminder. Read access does not establish write access or prove that a billing incident has resolved.

## Proactive work and selectable alternatives

A proposed final answer passes one bounded completion checkpoint before ending a model turn. If it only promises work, the model can invoke the next tool in the same worker. Tool-budget exhaustion is a failed, retryable response rather than success. This is a cognitive check, not a keyword-based action dispatcher; publication authority still comes from the existing envelope.

Alternative drafts/approaches use typed `choices` with a short label and complete selection text. Buttons send a durable outbox turn referencing the prior option and retaining the existing constraints. One choice per answer can be submitted; its selected state survives reload. The composer draft remains untouched. Legacy numbered lists remain inert because steps and alternatives cannot be distinguished reliably from typography alone.

Approach displays the stored assignment plan, not a fabricated checklist. Work events show recorded research, attempts, and outcomes. Completed work remains visible in the thread. An open task without a running attempt is explicitly idle.

Chat now receives the same strategy playbook and relevant Growth hypotheses used by social decision-making. It can save a lesson from observed, scoped public posts through `learn_social_pattern`. Such a lesson is a low-confidence testing hypothesis, not evidence of effectiveness. Growth reviews also receive typed observations and existing hypotheses. Community showcases are a supported possibility, alongside proof-led posts and conversation; the agent chooses based on audience fit and useful follow-through.

Temporary billing errors do not create permanent browser-only capability requirements. Recovery can retry the same active assignment when its recorded last delivery failed for credits, preserving history and execution guards. Provider rejections retain their actual reason and HTTP status; read access still does not establish successful write access.
