# Onboarding and workspace identity

The first-run surface creates an Agent and its initial Presence, then opens the operator workspace.

## Sub-features

- Create an Agent and first Presence.
- Establish the active Agent/Presence identity and workspace route.
- Switch Agents without silently changing another Agent’s mind.

## How to get to it (user POV)

Open `/` in a fresh or reset workspace. Enter a name in `Agent name` and choose `Create Agent + Presence`. The active workspace can later be changed through the Agent switcher (`Switch agent, currently …`) and Presence switcher.

## Driving it with verify-app

```bash
verify-app reset-session
verify-app open /
verify-app type --label "Agent name" --text "Jenny"
verify-app click --role button --name "Create Agent + Presence"
verify-app wait-for --text "Jenny, right now."
verify-app snapshot
verify-app state --projection activity
```

Inspect the heading, active Agent/Presence labels, route, and persisted `activeAgentId`/`activePresenceId`. Use the switcher by role/name rather than CSS classes.

## Proof

Convincing proof is the created workspace heading plus a persisted state projection showing the named Agent and Presence, followed by a reload or route change that retains the same identity.

## Gotchas

- `reset-session` is test-only and must target the harness-owned database.
- A pre-seeded canonical workspace is not a fresh onboarding proof.
- Mobile uses a compact switcher; desktop uses the sidebar/footer switcher.
