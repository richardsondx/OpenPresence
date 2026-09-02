# Review and operator queue

Review is the focused operator decision surface. It answers “what needs my judgment now?” without making the operator scan the live Activity stream first.

## Sub-features

- Review pending social action approvals before delivery.
- Recover runtime incidents that require an operator decision.
- For duplicate-public-outcome recovery, identify every affected target thread and observed duplicate reply from Social Mirror evidence, with direct channel links when available.
- Treat repeated observations of the same external reply as one Mirror identity; only distinct external reply references become duplicate-outcome evidence.
- Open blocked assignment details, connection settings, or Activity context from the relevant queue item.
- Show an honest empty state when no decision is waiting.

## How to get to it (user POV)

Choose `Review` in primary navigation or open `/review?agentId=…&presenceId=…`. The page should lead with `Needs You`, explain why the queue exists, show the current decision count, and keep Activity content out of the route. Use `Back to Activity` to return to the live stream.

## Driving it with verify-app

```bash
verify-app open review
verify-app wait-for --selector '[data-testid="needs-you-queue"]'
verify-app assert --selector '[data-testid="needs-you-queue"]'
verify-app snapshot
verify-app state --projection activity
```

For a non-empty queue, use the visible next action on the card and verify the destination plus persisted execution, incident, or assignment state. A duplicate-public-outcome card exposes its retained evidence at `[data-testid="duplicate-public-outcome-evidence"]`; verify the target identity/content and observed replies before opening the resume confirmation. For an empty queue, prove the visible `No operator decisions are waiting.` copy and that Activity-only content such as `Today at a glance` is absent.

## Proof

The Review route must have an active `Review` navigation item, a `Needs You` heading, and the queue as the primary content. A decision count of zero is valid only when the empty-state copy is visible. Approval and recovery actions must remain bounded and must not be described as delivered until the persisted outcome says so.

## Gotchas

- Review is not a second Activity dashboard and must not duplicate the first-run card, right-now summary, or Activity history.
- Sandbox approvals and incidents remain Sandbox evidence; do not report them as live delivery.
- A stale or incomplete Activity projection must degrade to a readable fallback, not a client exception.
