# Onboarding and workspace identity

The first-run surface creates a lightweight Agent, then opens its durable Chat with a conversational first question. Channel-specific scope remains internal to the workspace and is not introduced as a separate onboarding concept.

## Sub-features

- Create an Agent from a name only.
- Establish the active Agent identity and workspace route.
- Show the first responsibility question in Chat with optional answer chips and free text.
- Keep the initial Agent private while the operator gets acquainted.
- Switch Agents without silently changing another Agent’s mind.

## How to get to it (user POV)

Open `/` in a fresh or reset workspace. Enter a name in `Agent name` and choose `Meet my Agent`. The workspace opens in Chat with “What would you like me to take off your plate?” and selectable starting points. The active workspace can later be changed by selecting an Agent in the persistent left rail.

## Driving it with verify-app

```bash
verify-app reset-session
verify-app open /
verify-app type --label "Agent name" --text "Jenny"
verify-app click --role button --name "Meet my Agent"
verify-app wait-for --text "Jenny at a glance"
verify-app wait-for --text "What would you like me to take off your plate?"
verify-app snapshot
verify-app state --projection activity
```

Inspect the heading, active Agent labels, route, first Chat question, and persisted `activeAgentId`/`activePresenceId`. Use the switcher by role/name rather than CSS classes.

## Proof

Convincing proof is the created workspace heading plus a persisted state projection showing the named Agent and its initial Chat question, followed by a reload or route change that retains the same identity and question.

## Gotchas

- `reset-session` is test-only and must target the harness-owned database.
- A pre-seeded canonical workspace is not a fresh onboarding proof.
- Mobile uses a compact switcher; desktop uses the sidebar/footer switcher.
- The first-run Activity card routes to Sandbox so the operator can rehearse before connecting a live channel.
