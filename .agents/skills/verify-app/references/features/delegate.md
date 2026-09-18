# Delegate

## User POV entry point

Open the `Delegate` destination from the desktop sidebar or mobile dock, then select
one of the conversational suggestions.

## Proof boundary

The suggestion opens Chat with the selected prompt in the real `Message <Agent>`
composer. The prompt is editable and remains unsent until the operator submits it.

## Expected evidence

- `/delegate` shows `What should I take on?`, six outcome categories, and icon-bearing
  suggestion rows.
- The selected Chat composer contains the suggestion text and the route is `/chat`.
- The chat projection has no new operator message, nudge, Assignment, execution, or
  outcome before the operator submits.

## Gotchas

The handoff draft is a one-time URL transport removed after Chat hydrates. It is not
durable conversation state until the operator submits it.
