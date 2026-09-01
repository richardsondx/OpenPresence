# Channels and Manage Agent

Channels configure one Presence’s social incarnation and execution envelope; Manage Agent configures the Agent’s durable mind and model/tools.

## Sub-features

- Select Sandbox, X, or Bridge connection mode.
- Configure identity mode, public self, Presence brief, language, DM, and affordance modes.
- Edit Agent meaning files and model/provider/tool settings.
- Preserve Agent scope when switching Presence or Agent.

## How to get to it (user POV)

Choose `Channels` or open `/settings` for the active Presence. Choose `Manage Agent` or open `/agent` for Agent-scoped configuration. Contextual links from Watching, Chat, Usage, and Activity can open the relevant surface.

## Driving it with verify-app

```bash
verify-app open settings
verify-app snapshot
verify-app click --role button --name 'Sandbox'
verify-app assert --text 'This world is simulated.'
verify-app click --role button --name 'X'
verify-app assert --text 'Connect this Presence to X'
verify-app click --role button --name 'Bridge'
verify-app assert --text 'Connect this Presence through Bridge'
verify-app open agent
verify-app snapshot
```

After editing a labelled setting, inspect `state --projection presence` or `state --projection brain`, navigate away, and return. Verify that Presence changes do not rewrite Agent meaning files or model identity.

## Proof

The selected route and visible connection/identity state must match persisted Presence state after reload. Review/Auto or Custom controls must reveal their real queue/customization and cannot be considered configured from appearance alone.

## Gotchas

- Local harness runs in Sandbox with mock providers; it cannot prove external X credentials or a live Bridge.
- Provider secrets are intentionally not returned by `/api/state`.
- Presence is not a second mind; scope leakage is a regression.
- Manual exact-text actions differ from autonomous Agent output.
