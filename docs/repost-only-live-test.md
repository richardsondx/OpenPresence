# Repost capability trial on live X

This is a single-action acceptance test for Genny's public attention loop:

```text
Agent-authored DiscoveryPlan → Native X public search → hydrated Social Mirror
→ normal Social Planner → trial-scoped Repost intent → connector delivery
→ verified Social Mirror outcome
```

The attached profile screenshot is context for the account identity only. It
does not add requirements or grant permission to publish.

## Contract

- The selected Presence must be the intended live X account.
- A readable Native X connection must be available for Agent-directed discovery;
  Native X or a verified Chrome Bridge may deliver the Repost.
- The trial does not mutate the Presence execution envelope. It overlays
  `repost: auto` for this trial only and suppresses other trial-originated acts
  after the Agent records its normal multi-act judgment.
- The Agent authors bounded search directions, triages public hits, and
  hydrates candidates before judging them.
- A candidate that does not naturally earn Repost is rejected and the
  Assignment remains active; candidate-level `no_op` is not a final trial
  result.
- A repost passes only when X completes the control action and OpenPresence
  records a verified Social Mirror object tied to the execution.
- A `no_op` result is a valid judgment outcome; no public action is sent.

## Run

First perform a dry run:

```sh
pnpm test:repost-live -- --url http://localhost:3015
```

Review the account and connection prerequisites. When the scope is correct, run
the one bounded live trial:

```sh
pnpm test:repost-live -- --url http://localhost:3015 --confirm-live --wait-seconds 120 --output /tmp/repost-attention-test.json
```

`--confirm-live` is the explicit action-time approval. It can create at most
one public repost selected through normal Agent judgment. The report uses the
CapabilityTrial result vocabulary, and no result is inferred from a queued
execution.

## Evidence to review

1. The report shows trial-scoped `executionIsolation` with
   `presenceWide = false` and any suppressed acts.
2. The trial records a DiscoveryPlan, candidate audits, and the exact hydrated
   Mirror chosen by the Agent, if any.
3. For a repost, `execution.status = succeeded` and
   `verifiedSocialMirror.originExecutionId` matches the execution.
4. Activity/Feed shows the repost as verified history and links to the target
   post.
5. `PASS_VERIFIED` requires the verified Repost outcome; no opportunity,
   review, blocked capability, execution failure, and verification failure are
   reported distinctly.

This test does not authorize deployment, account changes, likes, replies,
quotes, or original posts.
